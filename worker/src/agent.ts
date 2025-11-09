// worker/src/agent.ts
import "dotenv/config";
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  Track,
  TrackKind,
  AudioStream,
  dispose,
} from "@livekit/rtc-node";
import OpenAI from "openai";

import { CFG } from "./core/config";
import { makeOpenAI, withTimeout } from "./core/llm";
import { asMarkdown, mergeSections } from "./core/formatter";
import { ocrImageBase64JPEG, describeStructuredFromOCR } from "./core/ocr";
import { visionUnderstandImage } from "./core/vision";
import {
  pushOcr,
  pushVisual,
  latestOcr,
  latestVisual,
  getOcrHistory,
  getVisualHistory,
  getLastHash,
  setLastHash,
  bumpIngestCounter,
} from "./core/history";
import {
  summarizeChangesLatestPairMixed,
  summarizeChangesSinceMixed,
  summarizeContextWindowMixed,
} from "./core/change";
import { startTrackError, cancelTask, checkTasksAndAlert } from "./core/tasks";
import { makeSender } from "./core/dc";
import { Sections } from "./core/types";
import { explain as errorExplain } from "./agents/errorHelper";

const LK_URL = process.env.LIVEKIT_URL!;
const ROOM = process.env.ROOM || "room-demo";
const IDENTITY = process.env.IDENTITY || `worker-${Math.random().toString(36).slice(2, 6)}`;
const OPENAI_KEY = process.env.OPENAI_API_KEY!;
const TOKEN_ENDPOINT = process.env.TOKEN_ENDPOINT || "http://localhost:5050/api/rt/token";
const STT_ENDPOINT = process.env.STT_ENDPOINT || "http://127.0.0.1:5050/api/v1/transcribe-raw";

const openai: OpenAI = makeOpenAI(OPENAI_KEY);

/** Cache the freshest frame we’ve seen (base64 jpeg, no data: prefix). */
let latestFrameB64: string | null = null;
let latestFrameTs = 0;

/** Keep last few audio transcripts from the tab so we can feed LLM. */
const audioSnippets: Array<{ ts: number; text: string }> = [];

/* ---------------- Vision-first describe with OCR fusion ---------------- */
async function describeSmartFromImage(b64: string): Promise<{ text: string; vis?: Sections }> {
  const vision = await visionUnderstandImage(openai, b64);

  // We try OCR, but we don't want OCR flakiness to dominate.
  const ocrText = await withTimeout(ocrImageBase64JPEG(openai, b64), CFG.OCR_TIMEOUT_MS);

  let fused: Sections = vision;
  if (ocrText && ocrText.trim()) {
    const ocrSections = await describeStructuredFromOCR(openai, ocrText);
    fused = mergeSections(vision, ocrSections);
    pushOcr(ocrText);
  }

  return { text: asMarkdown(fused), vis: vision };
}

/* ----------------------------- Token mint ------------------------------ */
async function mintToken(roomName: string, identity: string) {
  const r = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomName, identity }),
  });
  if (!r.ok) throw new Error(`token mint failed ${r.status}`);
  const { token } = (await r.json()) as any;
  return token as string;
}

/* -------------------- tiny helpers for audio capture ------------------- */

function pushAudioSnippet(text: string) {
  audioSnippets.push({ ts: Date.now(), text });
  if (audioSnippets.length > 25) audioSnippets.shift();
}

function pcm16leToWav(pcm: Buffer, sampleRate = 48_000, numChannels = 1): Buffer {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const wavHeader = Buffer.alloc(44);

  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcm.length, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16); // PCM chunk size
  wavHeader.writeUInt16LE(1, 20); // PCM format
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(16, 34); // bits per sample
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([wavHeader, pcm]);
}

/* --------------- Build short RAG-ish context from history -------------- */
function buildScreenContext(maxVis = 6, maxOcr = 6): { prompt: string; hasAny: boolean } {
  const vis = getVisualHistory().slice(-maxVis);
  const ocr = getOcrHistory().slice(-maxOcr);
  const audio = audioSnippets.slice(-6);

  const visBlock =
    vis.length > 0
      ? vis
          .map(
            (v) =>
              `- [${new Date(v.ts).toLocaleTimeString()}] ${v.summary}\n  • ${(v.keyItems || []).join("\n  • ")}`
          )
          .join("\n")
      : "";

  const ocrBlock =
    ocr.length > 0
      ? ocr
          .map((o) => {
            const t = (o.ocr || "").trim().slice(0, 800);
            return `- [${new Date(o.ts).toLocaleTimeString()}]\n${t}`;
          })
          .join("\n\n")
      : "";

  const audioBlock =
    audio.length > 0
      ? audio.map((a) => `- [${new Date(a.ts).toLocaleTimeString()}] ${a.text}`).join("\n")
      : "";

  const hasAny = vis.length > 0 || ocr.length > 0 || audio.length > 0;

  const prompt = `You are a copilot that answers questions about what is on the user's screen.

Context — Visual (highest trust):
${visBlock || "(no recent visual summaries)"}

Context — OCR (may be partial or noisy):
${ocrBlock || "(no recent OCR text)"}

Context — Audio from the shared tab/video (low confidence, short clips):
${audioBlock || "(no recent audio transcripts)"}

Instructions:
- Prefer visual descriptions when identifying UI, items, products, buttons.
- Use OCR to quote exact labels only when readable.
- Use AUDIO to understand what the video / speaker is talking about right now.
- If the question cannot be answered from the above, say what is missing and suggest a next step.
- Be concise and actionable.`;

  return { prompt, hasAny };
}

/* ----- Answer a free-form question about the CURRENT screen (image+ctx) ---- */
async function answerQuestionFromScreen(question: string): Promise<string> {
  const STALE_MS = 6000;

  const imgPart =
    latestFrameB64 && Date.now() - latestFrameTs <= STALE_MS
      ? [{ type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${latestFrameB64}` } }]
      : [];

  const { prompt } = buildScreenContext();

  const sys =
    "You are a screen-aware copilot. Answer the user’s question about the CURRENT screen precisely and concisely. " +
    "Consider layout, UI elements, icons, visual context, text in the frame, and recent audio. " +
    "If the answer is not visible, say what is missing and what the user could do next.";

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: sys },
    {
      role: "user",
      content: [{ type: "text", text: `${prompt}\n\nUser question: ${question}` }, ...imgPart] as any,
    },
  ];

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages,
  } as any);

  return resp.choices?.[0]?.message?.content?.trim() || "No answer.";
}

/* ---------------------------------- Main --------------------------------- */
async function main() {
  if (!LK_URL) throw new Error("LIVEKIT_URL missing");
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY missing");

  const token = await mintToken(ROOM, IDENTITY);
  const room = new Room();
  await room.connect(LK_URL, token, { autoSubscribe: true, dynacast: true });
  console.log(`[worker] connected as ${IDENTITY} to ${ROOM}`);

  const lp = room.localParticipant!;
  const sendDC = makeSender(lp.publishData.bind(lp));

  // announce presence
  sendDC({ type: "worker_online", identity: IDENTITY });

  room.on(RoomEvent.DataReceived, async (payload: Uint8Array) => {
    let msg: any;
    try {
      msg = JSON.parse(new TextDecoder().decode(payload));
    } catch {
      return;
    }
    console.log("[worker] got", msg);

    /* ---------------- Handshake ---------------- */
    if (msg.type === "client_online") {
      sendDC({ type: "worker_ack", hello: true });
      return;
    }
    if (msg.type === "ping") {
      sendDC({ type: "pong", ts: Date.now() });
      return;
    }

    /* ---------------- Intents ------------------ */
    if (msg.type === "intent_explain_error") {
      const last = latestOcr(1)[0];
      if (!last) {
        sendDC({
          type: "structured_answer",
          text: "No OCR yet. Enable Auto context or click Extract Text for a high-res capture.",
        });
        return;
      }
      try {
        const sections = await errorExplain(openai, last.ocr);
        sendDC({ type: "structured_answer", text: asMarkdown(sections) });
      } catch (e: any) {
        sendDC({ type: "structured_answer", text: `(error) ${e?.message || e}` });
      }
      return;
    }

    if (msg.type === "intent_compare_screens") {
      try {
        const text = await summarizeChangesLatestPairMixed(openai, getOcrHistory(), getVisualHistory());
        sendDC({ type: "structured_answer", text });
      } catch (e: any) {
        sendDC({ type: "structured_answer", text: `(error) ${e?.message || e}` });
      }
      return;
    }

    if (msg.type === "intent_summarize_session") {
      try {
        const n = Math.min(Math.max(10, getOcrHistory().length), 20);
        const text = await summarizeContextWindowMixed(openai, getOcrHistory(), getVisualHistory(), n);
        sendDC({ type: "structured_answer", text });
      } catch (e: any) {
        sendDC({ type: "structured_answer", text: `(error) ${e?.message || e}` });
      }
      return;
    }

    // free-form user query
    if (msg.type === "user_query" && typeof msg.text === "string") {
      const STALE_MS = 6000;
      if (!latestFrameB64 || Date.now() - latestFrameTs > STALE_MS) {
        // ask for hi-res specifically so we can read tiny text
        sendDC({ type: "request_snapshot_hires", reason: "user_query_stale_frame" });
      }
      try {
        const answer = await answerQuestionFromScreen(msg.text);
        sendDC({ type: "structured_answer", text: answer });
      } catch (e: any) {
        sendDC({ type: "structured_answer", text: `(error) ${e?.message || e}` });
      }
      return;
    }

    /* ---------------- Tasks -------------------- */
    if (msg.type === "start_task_track_error") {
      const minutes = typeof msg.minutes === "number" ? msg.minutes : 5;
      const { id, until } = startTrackError(minutes, msg.pattern);
      sendDC({ type: "task_ack", id, kind: "track_error", until });
      return;
    }
    if (msg.type === "cancel_task" && typeof msg.id === "number") {
      const ok = cancelTask(msg.id);
      sendDC({ type: "task_done", id: msg.id, status: ok ? "cancelled" : "not_found" });
      return;
    }

    /* ------------- On-demand describe ----------- */
    if (msg.type === "describe_scene") {
      sendDC({ type: "request_snapshot" });
      return;
    }

    /* --------------- What changed --------------- */
    if (msg.type === "what_changed") {
      try {
        const text =
          typeof msg.sinceMs === "number" && msg.sinceMs > 0
            ? await summarizeChangesSinceMixed(openai, getOcrHistory(), getVisualHistory(), Number(msg.sinceMs))
            : await summarizeChangesLatestPairMixed(openai, getOcrHistory(), getVisualHistory());
        sendDC({ type: "change_summary", text });
      } catch (e: any) {
        sendDC({ type: "change_summary", text: `(error) ${e?.message || e}` });
      }
      return;
    }

    /* ---------------- Snapshots ----------------- */
    if (msg.type === "snapshot_thumbnail" && typeof msg.jpeg === "string") {
      const b64: string = msg.jpeg;
      const ingestOnly: boolean = !!msg.ingestOnly;
      const hash: string | undefined = typeof msg.hash === "string" ? msg.hash : undefined;

      latestFrameB64 = b64;
      latestFrameTs = Date.now();

      if (ingestOnly && hash && getLastHash() === hash) return;

      try {
        if (!ingestOnly) {
          const { text, vis } = await describeSmartFromImage(b64);
          if (vis) {
            pushVisual({ ts: Date.now(), summary: vis.summary, keyItems: vis.keyItems || [] });
            // 👇 send suggested actions separately so UI can make pills
            if (Array.isArray(vis.suggestions) && vis.suggestions.length > 0) {
              sendDC({
                type: "suggested_actions",
                actions: vis.suggestions,
              });
            }
          }
          sendDC({ type: "scene_description", text });
        } else {
          const ocr = await ocrImageBase64JPEG(openai, b64);
          if (ocr && ocr.trim()) {
            pushOcr(ocr);
            if (hash) setLastHash(hash);
            checkTasksAndAlert(sendDC, ocr);
          } else {
            // 👇 instead of only noisy ingest_error, also ask for hi-res
            sendDC({
              type: "ingest_error",
              text: "OCR empty (tiny text / low contrast / UI chrome).",
            });
            sendDC({
              type: "request_snapshot_hires",
              reason: "ocr_empty",
            });
          }

          const ic = bumpIngestCounter();
          const lastVisual = latestVisual(1)[0];
          const likelyStream = lastVisual?.keyItems?.some((k) =>
            /stream|video player|live|twitch|chat overlay|overlay|youtube/i.test(k)
          );
          const visionEveryN = likelyStream ? CFG.VISION_EVERY_N_STREAM : CFG.VISION_EVERY_N_DEFAULT;

          if (ic % visionEveryN === 0) {
            try {
              const vis = await visionUnderstandImage(openai, b64);
              pushVisual({ ts: Date.now(), summary: vis.summary, keyItems: vis.keyItems || [] });
              // 👇 send suggested actions again on periodic vision
              if (Array.isArray(vis.suggestions) && vis.suggestions.length > 0) {
                sendDC({
                  type: "suggested_actions",
                  actions: vis.suggestions,
                });
              }
              sendDC({
                type: "context_update",
                text: asMarkdown({
                  summary: vis.summary,
                  keyItems: vis.keyItems || [],
                  suggestions: vis.suggestions || [],
                }),
                count: Math.max(getOcrHistory().length, getVisualHistory().length),
                windowUsed: Math.min(20, Math.max(getVisualHistory().length, getOcrHistory().length)),
                span: {
                  from:
                    getVisualHistory()[Math.max(0, getVisualHistory().length - 20)]?.ts ||
                    getOcrHistory()[0]?.ts,
                  to: Date.now(),
                },
              });
            } catch {
              /* ignore vision sweep errors */
            }
          }

          if (ic % CFG.CONTEXT_EVERY_N === 0) {
            const n = Math.min(Math.max(10, getOcrHistory().length), 20);
            const text = await summarizeContextWindowMixed(openai, getOcrHistory(), getVisualHistory(), n);
            sendDC({
              type: "context_update",
              text,
              count: Math.max(getOcrHistory().length, getVisualHistory().length),
              windowUsed: n,
              span: {
                from:
                  getOcrHistory()[Math.max(0, getOcrHistory().length - n)]?.ts ??
                  getVisualHistory()[Math.max(0, getVisualHistory().length - n)]?.ts,
                to: Date.now(),
              },
            });
          }
        }
      } catch (e: any) {
        sendDC({
          type: ingestOnly ? "ingest_error" : "scene_description",
          text: `(error) ${e?.message || e}`,
        });
      }
      return;
    }

    if (msg.type === "snapshot_hires" && typeof msg.jpeg === "string") {
      const b64: string = msg.jpeg;
      latestFrameB64 = b64;
      latestFrameTs = Date.now();

      try {
        const { text, vis } = await describeSmartFromImage(b64);
        if (vis) {
          pushVisual({ ts: Date.now(), summary: vis.summary, keyItems: vis.keyItems || [] });
          if (Array.isArray(vis.suggestions) && vis.suggestions.length > 0) {
            sendDC({
              type: "suggested_actions",
              actions: vis.suggestions,
            });
          }
        }
        sendDC({
          type: "structured_answer",
          text,
        });
      } catch (e: any) {
        sendDC({
          type: "structured_answer",
          text: `(error processing high-res snapshot) ${e?.message || e}`,
        });
      }

      return;
    }
  });

  // Debug hooks: subscribe to tracks, and if it's audio, start STT loop
 room.on(
  RoomEvent.TrackSubscribed,
  async (track: Track, pub: RemoteTrackPublication, p: RemoteParticipant) => {
    console.log(
      `[worker] trackSubscribed from ${p.identity} kind=${track.kind} sid=${pub.sid} source=${pub.source} name=${pub.name}`
    );

    // --- filter to SCREEN / TAB audio only ---
    const sourceStr = pub.source ? String(pub.source).toLowerCase() : "";
    const nameStr = pub.name ? String(pub.name).toLowerCase() : "";

    const looksLikeScreenAudio =
      sourceStr.includes("screen") ||
      nameStr.includes("screen") ||
      nameStr.includes("screen-audio");

    // only handle screen/tab audio, ignore mic or other
    if (track.kind !== TrackKind.KIND_AUDIO || !looksLikeScreenAudio) {
      return;
    }

    console.log("[worker] screen/tab audio subscribed – starting STT capture");

    const stream = new AudioStream(track, 48_000, 1);
    const reader = stream.getReader();

    (async () => {
      let chunks: Buffer[] = [];
      let bytes = 0;
      let lastFlush = Date.now();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const buf = Buffer.from((value as any).data);
        chunks.push(buf);
        bytes += buf.length;

        const elapsed = Date.now() - lastFlush;
        // flush every ~3s or if buffer is large
        if (elapsed > 3000 || bytes > 16000 * 6) {
          const pcm = Buffer.concat(chunks, bytes);
          chunks = [];
          bytes = 0;
          lastFlush = Date.now();

          try {
            const wav = pcm16leToWav(pcm, 48_000, 1);
            const r = await fetch(
              process.env.STT_ENDPOINT || "http://127.0.0.1:5050/api/v1/transcribe-raw",
              {
                method: "POST",
                headers: { "Content-Type": "audio/wav" },
                body: new Uint8Array(wav),
              }
            );
            if (r.ok) {
              const { text } = (await r.json()) as any;
              if (text && text.trim()) {
                const cleaned = text.trim();
                // store for context
                pushAudioSnippet(cleaned);
                // and tell the client so it can show 🎧 lines
                sendDC({
                  type: "screen_audio_transcript",
                  text: cleaned,
                });
              }
            } else {
              console.warn("[worker] STT http error", r.status);
            }
          } catch (err) {
            console.warn("[worker] STT send failed", err);
          }
        }
      }
    })();
  }
);


  room.on(RoomEvent.Disconnected, () => console.log("[worker] disconnected"));

  // Graceful shutdown
  process.on("SIGINT", async () => {
    try {
      await room.disconnect();
    } catch {}
    await dispose();
    process.exit(0);
  });
}

main().catch((e) => console.error("[worker] error", e));
