"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { RoomEvent } from "livekit-client";
import Header from "@/components/Header";
import VideoPane from "@/components/VideoPane";
import ControlBar from "@/components/ControlBar";
import Transcript from "@/components/Transcript";
import StatusToasts from "@/components/StatusToasts";
import ChatPanel from "@/components/ChatPanel";
import { startRealtime, type RtHandles } from "@/lib/realtime";
import { takeThumbnailAdaptive, takeHighResSnapshotJPEG } from "@/lib/snapshot";
import { chat as chatREST, ocrHighResSnapshot } from "@/lib/api";

type Turn = { role: "user" | "assistant"; text: string; ts?: number };

export default function Page() {
  const videoElRef = useRef<HTMLVideoElement>(null);

  const [rt, setRt] = useState<RtHandles | null>(null);
  const [roomName, setRoomName] = useState("room-1234");
  const [identity, setIdentity] = useState("user-" + Math.random().toString(36).slice(2, 9));

  const [transcriptTurns, setTranscriptTurns] = useState<Turn[]>([]);
  const [chatTurns, setChatTurns] = useState<Turn[]>([]);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);

  const [autoCtx, setAutoCtx] = useState(false);
  const [autoTimer, setAutoTimer] = useState<number | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // "user just asked something" marker
  const [lastUserAskAt, setLastUserAskAt] = useState(0);
  const lastUserAskAtRef = useRef(0);

  const [suggestedActions, setSuggestedActions] = useState<string[]>([]);


  const [toasts, setToasts] = useState<
    Array<{ id: string; message: string; type: "info" | "error" | "success" }>
  >([]);

  const addToast = useCallback(
    (message: string, type: "info" | "error" | "success" = "info") => {
      const id = Math.random().toString(36).slice(2, 9);
      setToasts((prev) => [...prev, { id, message, type }]);
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    },
    []
  );

  async function hashBase64(b64: string): Promise<string> {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // detect noisy OCR lines
  function isNoisyOcrText(text: string) {
    const lower = text.toLowerCase();
    return (
      lower.startsWith("recent ocr snapshots") ||
      lower.startsWith("text not extracted") ||
      lower.includes("errors in text extraction") ||
      lower.includes("better ocr results") ||
      lower.includes("unextractable")
    );
  }

  // merge OCR line into previous assistant turn
  function appendToLastAssistant(text: string) {
    setTranscriptTurns((prev: Turn[]) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      const updated = { ...last, text: `${last.text}\n${text}` };
      return [...prev.slice(0, -1), updated];
    });
  }

  /* ------------------------------- Join/Leave ------------------------------ */

  const handleJoin = useCallback(async () => {
    if (isConnected) return;

    try {
      setIsLoading(true);
      const handles = await startRealtime(roomName, identity);
      setRt(handles);
      setIsConnected(true);
      addToast("Connected to room", "success");

      // datachannel listener
      handles.room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload));
          const now = Date.now();

           if (msg?.type === "request_snapshot_hires") {
      (async () => {
        if (!videoElRef.current) return;
        try {
          const blob = await takeHighResSnapshotJPEG(videoElRef.current, 1280, 0.8);
          const arr = new Uint8Array(await blob.arrayBuffer());
          const b64 = btoa(String.fromCharCode(...arr));
          handles.dcSend({ type: "snapshot_hires", jpeg: b64 });
        } catch (e) {
          console.warn("hi-res snapshot failed", e);
        }
      })();
      return; // stop processing this message
    }

    // 2) worker is suggesting actions (pills)
    if (msg?.type === "suggested_actions" && Array.isArray(msg.actions)) {
      setSuggestedActions(msg.actions as string[]);
      return; //stop processing this message
    }

          // ignore some
          if (msg?.type === "ingest_error") {
            addToast("OCR couldn't read tiny text (that’s normal).", "info");
            return;
          }
          if (msg?.type === "request_snapshot" || msg?.type === "pong") {
            return;
          }

          // 👇 audio transcript from worker
          if (msg?.type === "screen_audio_transcript" && typeof msg.text === "string") {
            setTranscriptTurns((prev: Turn[]) => [
              ...prev,
              { role: "assistant", text: "🎧 " + msg.text, ts: Date.now() },
            ]);
            return;
          }

          // get text to show
          let text: string | null = null;
          if (typeof msg?.text === "string") {
            text = msg.text;
          } else if (msg?.type === "worker_online") {
            text = `(worker online: ${msg.identity ?? "unknown"})`;
          } else if (msg?.type === "worker_ack") {
            text = "(worker ack)";
          } else if (msg?.type === "task_ack") {
            text = `Tracking errors until ${new Date(msg.until).toLocaleTimeString()}`;
          } else if (msg?.type === "task_done") {
            text = `Task #${msg.id} ${msg.status}${msg.note ? ` — ${msg.note}` : ""}`;
          } else if (msg) {
            text = JSON.stringify(msg);
          }

          if (!text) return;

          // bundle noisy OCR
          if (isNoisyOcrText(text)) {
            appendToLastAssistant(text);
            return;
          }

          // always push to transcript
          setTranscriptTurns((prev: Turn[]) => [
            ...prev,
            { role: "assistant", text, ts: now },
          ]);

          // chat only if user asked in last 5s
          const looksLikeAnswer =
            msg?.type === "structured_answer" ||
            msg?.type === "scene_description" ||
            msg?.type === "change_summary" ||
            (typeof msg?.text === "string" &&
              msg?.text.length > 0 &&
              !String(msg.text).startsWith("("));

          const userRecentlyAsked = now - lastUserAskAtRef.current < 5000;

          if (looksLikeAnswer && userRecentlyAsked) {
            setChatTurns((prev: Turn[]) => [
              ...prev,
              { role: "assistant", text, ts: now },
            ]);
          }
        } catch (e) {
          console.error("Failed to parse worker message", e);
        }
      });

      // handshake
      handles.dcSend({ type: "client_online", identity });
      handles.dcSend({ type: "ping" });
    } catch (err) {
      addToast("Failed to connect", "error");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [roomName, identity, isConnected, addToast]);

  const handleLeave = useCallback(async () => {
    try {
      if (rt) await rt.leave();
    } catch (err) {
      addToast("Failed to disconnect", "error");
      console.error(err);
    } finally {
      setRt(null);
      setIsConnected(false);
      setIsScreenSharing(false);
      setIsMicOn(false);
      if (videoElRef.current?.srcObject) {
        (videoElRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        videoElRef.current.srcObject = null;
      }
      if (autoTimer) window.clearInterval(autoTimer);
      setAutoTimer(null);
      setAutoCtx(false);
      addToast("Disconnected", "info");
    }
  }, [rt, addToast, autoTimer]);

  /* --------------------------- User-triggered OCR -------------------------- */

  const handleExtractText = useCallback(async () => {
    try {
      if (!videoElRef.current) return;
      setIsLoading(true);

      const blob = await takeHighResSnapshotJPEG(videoElRef.current, 1280, 0.8);
      const { text } = await ocrHighResSnapshot(blob);
      const now = Date.now();

      const userTurn: Turn = {
        role: "user",
        text: "Extract text from the current screen",
        ts: now,
      };
      const assistantTurn: Turn = {
        role: "assistant",
        text: text || "(No readable text found.)",
        ts: now,
      };

      setTranscriptTurns((prev: Turn[]) => [...prev, userTurn, assistantTurn]);
      setChatTurns((prev: Turn[]) => [...prev, userTurn, assistantTurn]);

      setLastUserAskAt(now);
      lastUserAskAtRef.current = now;

      addToast("High-res text extracted", "success");
    } catch (err: any) {
      console.error(err);
      addToast("High-res OCR failed", "error");
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  /* ----------------------------- Screen share ----------------------------- */

  const handleStartScreenShare = useCallback(async () => {
    try {
      if (!rt) return;
      setIsLoading(true);

      // request audio too so tab/system audio is included
      const display = await (navigator.mediaDevices as any).getDisplayMedia({
  video: true,
  audio: true, // let the user pick “share tab audio” / “share system audio”
});

      if (videoElRef.current) {
        videoElRef.current.srcObject = display;
        await videoElRef.current.play().catch(() => {});
      }

      await rt.attachAndPublishScreen(display);
      setIsScreenSharing(true);
      addToast("Screen sharing started", "success");

      rt.dcSend({ type: "describe_scene" });
    } catch (err) {
      addToast("Failed to start screen share", "error");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [rt, addToast]);

  const handleStopScreenShare = useCallback(async () => {
    try {
      if (!rt) return;
      setIsLoading(true);

      rt.stopScreen();

      if (videoElRef.current?.srcObject) {
        (videoElRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        videoElRef.current.srcObject = null;
      }

      setIsScreenSharing(false);
      addToast("Screen sharing stopped", "info");
    } catch (err) {
      addToast("Failed to stop screen share", "error");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [rt, addToast]);

  /* --------------------------------- Mic ---------------------------------- */

  const handleMicToggle = useCallback(async () => {
    try {
      if (!rt) return;
      setIsLoading(true);
      if (isMicOn) {
        await rt.unpublishMic();
        setIsMicOn(false);
        addToast("Mic off", "info");
      } else {
        await rt.publishMic();
        setIsMicOn(true);
        addToast("Mic on", "success");
      }
    } catch (err) {
      addToast("Failed to toggle mic", "error");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [rt, isMicOn, addToast]);

  /* ------------------------------ Buttons --------------------------------- */

  const markUserAsked = (now: number) => {
    setLastUserAskAt(now);
    lastUserAskAtRef.current = now;
  };

  const handleDescribeScene = useCallback(() => {
    if (!rt) return;
    const now = Date.now();
    rt.dcSend({ type: "describe_scene" });
    const userTurn: Turn = { role: "user", text: "What's on my screen?", ts: now };
    setTranscriptTurns((prev: Turn[]) => [...prev, userTurn]);
    setChatTurns((prev: Turn[]) => [...prev, userTurn]);
    markUserAsked(now);
    addToast("Analyzing screen…", "info");
  }, [rt, addToast]);

  const handleWhatChanged = useCallback(() => {
    if (!rt) return;
    const now = Date.now();
    rt.dcSend({ type: "what_changed", sinceMs: 60_000 });
    const userTurn: Turn = { role: "user", text: "What changed in the last 60 seconds?", ts: now };
    setTranscriptTurns((prev: Turn[]) => [...prev, userTurn]);
    setChatTurns((prev: Turn[]) => [...prev, userTurn]);
    markUserAsked(now);
    addToast("Checking for changes…", "info");
  }, [rt, addToast]);

  const handleExplainError = useCallback(() => {
    if (!rt) return;
    const now = Date.now();
    rt.dcSend({ type: "intent_explain_error" });
    const userTurn: Turn = { role: "user", text: "Explain this error", ts: now };
    setTranscriptTurns((prev: Turn[]) => [...prev, userTurn]);
    setChatTurns((prev: Turn[]) => [...prev, userTurn]);
    markUserAsked(now);
    addToast("Analyzing error…", "info");
  }, [rt, addToast]);

  const handleExportSession = useCallback(async () => {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/v1/session-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: transcriptTurns,
        chat: chatTurns,
        meta: { roomName, identity, exportedAt: Date.now() },
      }),
    });
    const { html } = await r.json();
    // simplest: open in new tab
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } catch (e) {
    console.error(e);
  }
}, [transcriptTurns, chatTurns, roomName, identity]);


  const handleCompareScreens = useCallback(() => {
    if (!rt) return;
    const now = Date.now();
    rt.dcSend({ type: "intent_compare_screens" });
    const userTurn: Turn = { role: "user", text: "Compare screens", ts: now };
    setTranscriptTurns((prev: Turn[]) => [...prev, userTurn]);
    setChatTurns((prev: Turn[]) => [...prev, userTurn]);
    markUserAsked(now);
    addToast("Comparing screens…", "info");
  }, [rt, addToast]);

  const handleSummarizeSession = useCallback(() => {
    if (!rt) return;
    const now = Date.now();
    rt.dcSend({ type: "intent_summarize_session" });
    const userTurn: Turn = { role: "user", text: "Summarize this session", ts: now };
    setTranscriptTurns((prev: Turn[]) => [...prev, userTurn]);
    setChatTurns((prev: Turn[]) => [...prev, userTurn]);
    markUserAsked(now);
    addToast("Summarizing session…", "info");
  }, [rt, addToast]);

  /* --------------------------- Free-form chat ----------------------------- */

  const handleSendChat = useCallback(
    async (text: string) => {
      const now = Date.now();
      const userTurn: Turn = { role: "user", text, ts: now };

      setTranscriptTurns((prev: Turn[]) => [...prev, userTurn]);
      setChatTurns((prev: Turn[]) => [...prev, userTurn]);
      markUserAsked(now);

      if (rt) {
        try {
          rt.dcSend({ type: "user_query", text });
          return;
        } catch (e) {
          console.warn("DC send failed, falling back to REST /chat", e);
        }
      }

      try {
        const { reply } = await chatREST(text);
        const aTurn: Turn = { role: "assistant", text: reply, ts: Date.now() };
        setTranscriptTurns((prev: Turn[]) => [...prev, aTurn]);
        setChatTurns((prev: Turn[]) => [...prev, aTurn]);
      } catch (e: any) {
        const errTurn: Turn = {
          role: "assistant",
          text: `Chat failed: ${e?.message || e}`,
          ts: Date.now(),
        };
        setTranscriptTurns((prev: Turn[]) => [...prev, errTurn]);
        setChatTurns((prev: Turn[]) => [...prev, errTurn]);
      }
    },
    [rt]
  );

  /* ------------------------------ Auto Context ---------------------------- */

  const handleAutoContextToggle = useCallback((pressed: boolean) => setAutoCtx(pressed), []);

  useEffect(() => {
    const PERIOD_MS = 3000;

    if (!rt || !autoCtx || !videoElRef.current?.srcObject) {
      if (autoTimer) window.clearInterval(autoTimer);
      setAutoTimer(null);
      return;
    }

    const id = window.setInterval(async () => {
      try {
        const b64 = await takeThumbnailAdaptive(videoElRef.current!, 420, 0.6, 38000);
        const hash = await hashBase64(b64);
        rt.dcSend({ type: "snapshot_thumbnail", jpeg: b64, hash, ingestOnly: true });
      } catch {
        /* ignore */
      }
    }, PERIOD_MS);

    setAutoTimer(id);
    return () => {
      window.clearInterval(id);
      setAutoTimer(null);
    };
  }, [rt, autoCtx]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -------------------------------- Render -------------------------------- */

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Header
        isConnected={isConnected}
        roomName={roomName}
        setRoomName={setRoomName}
        identity={identity}
        setIdentity={setIdentity}
        onJoin={handleJoin}
        onLeave={handleLeave}
        isLoading={isLoading}
      />

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-4 p-4">
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          <VideoPane videoRef={videoElRef} isConnected={isConnected} />
          <Transcript
            turns={transcriptTurns}
            collapsed={transcriptCollapsed}
            onToggle={() => setTranscriptCollapsed((v) => !v)}
          />
          <ControlBar
            isConnected={isConnected}
            isScreenSharing={isScreenSharing}
            isMicOn={isMicOn}
            isLoading={isLoading}
            autoCtx={autoCtx}
            onStartScreenShare={handleStartScreenShare}
            onStopScreenShare={handleStopScreenShare}
            onMicToggle={handleMicToggle}
            onDescribeScene={handleDescribeScene}
            onWhatChanged={handleWhatChanged}
            onExplainError={handleExplainError}
            onCompareScreens={handleCompareScreens}
            onSummarizeSession={handleSummarizeSession}
            onAutoContextToggle={handleAutoContextToggle}
            onExtractText={handleExtractText}
          />
        </div>

        <div className="w-full lg:w-96 flex flex-col min-h-0">
          <ChatPanel
  turns={chatTurns}
  onSendChat={handleSendChat}
  disabled={!isConnected || isLoading}
  suggestions={suggestedActions}
/>

        </div>
      </div>

      <div className="px-4 py-2 border-t border-white/10 bg-white/5 backdrop-blur-md text-xs text-white/60 flex items-center justify-between gap-2">
  <span>Live analysis • Auto context: {autoCtx ? "on" : "off"}</span>
  <div className="flex items-center gap-3">
    <span>{transcriptTurns.length} transcript messages</span>
    <button
      onClick={handleExportSession}
      className="bg-white/10 hover:bg-white/20 text-white/80 px-3 py-1 rounded-md text-xs"
    >
      Export session
    </button>
  </div>
</div>


      <StatusToasts toasts={toasts} />
    </div>
  );
}
