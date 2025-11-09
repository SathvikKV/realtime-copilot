// server/src/routes.ts
import express, { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { transcribeTempFile, transcribeBuffer } from './stt.js';
import { askLLM } from './llm.js';
import { synthesizeToMP3 } from './tts.js';
import { ocrImage } from './ocr.js';
import type { ChatRequest } from './types.js';


const upload = multer({ dest: 'tmp/' });
export const router = Router();

// ---- helper: map MIME to extension
function mimeToExt(m: string | undefined) {
  if (!m) return '';
  if (m.includes('webm')) return '.webm';
  if (m.includes('ogg') || m.includes('oga')) return '.ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return '.mp3';
  if (m.includes('mp4')) return '.mp4';
  if (m.includes('wav')) return '.wav';
  if (m.includes('flac')) return '.flac';
  return '';
}

// 1) Push-to-talk: audio file -> transcript (what you already had)
router.post('/v1/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no audio' });

  // Ensure file has an extension so OpenAI can infer format
  const origExt = path.extname(req.file.originalname || '');
  const mimeExt = mimeToExt(req.file.mimetype);
  const ext = origExt || mimeExt || '.webm'; // default to .webm since we record webm/opus
  const renamedPath = `${req.file.path}${ext}`;
  const filenameForApi = `audio${ext}`;

  try {
    await fs.rename(req.file.path, renamedPath);

    const text = await transcribeTempFile(renamedPath, filenameForApi);

    await fs.unlink(renamedPath).catch(() => {});
    return res.json({ text });
  } catch (e: any) {
    console.error('[transcribe] error', e?.response?.data || e?.message || e);
    await fs.unlink(renamedPath).catch(() => {});
    return res.status(500).json({ error: e?.response?.data || e?.message || 'stt failed' });
  }
});

// 1b) NEW: worker raw audio (audio/wav, audio/webm, or octet-stream) -> transcript
// the worker will POST a small wav blob here every few seconds
router.post(
  '/v1/transcribe-raw',
  express.raw({ type: ['audio/wav', 'audio/webm', 'application/octet-stream'], limit: '20mb' }),
  async (req, res) => {
    const body = req.body as Buffer;
    if (!body || !Buffer.isBuffer(body)) {
      return res.status(400).json({ error: 'no audio buffer' });
    }
    try {
      // we wrote this in stt.ts
      const text = await transcribeBuffer(body, 'audio.wav');
      return res.json({ text });
    } catch (e: any) {
      console.error('[transcribe-raw] error', e?.message || e);
      return res.status(500).json({ error: e?.message || 'transcribe-raw failed' });
    }
  },
);

// 2) Chat with optional snapshot OCR text -> reply + mp3
router.post('/v1/chat', async (req, res) => {
  const body = req.body as ChatRequest;
  try {
    const reply = await askLLM(body.transcript, body.snapshotUrl);
    const mp3 = await synthesizeToMP3(reply);
    res.json({ reply, ttsBase64: mp3.toString('base64') });
  } catch (e: any) {
    console.error('[chat] error', e?.response?.data || e?.message || e);
    res.status(500).json({ error: e?.response?.data || e?.message || 'chat failed' });
  }
});

// 3) Snapshot -> OCR text
router.post('/v1/snapshot', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no image' });
  try {
    const buf = await fs.readFile(req.file.path);
    const ocr = await ocrImage(buf);
    await fs.unlink(req.file.path).catch(() => {});
    res.json({ ocr });
  } catch (e: any) {
    console.error('[snapshot] error', e?.message || e);
    res.status(500).json({ error: e?.message || 'snapshot failed' });
  }
});

router.post("/v1/session-report", express.json({ limit: "2mb" }), async (req, res) => {
  const { transcript = [], chat = [], meta = {} } = req.body as {
    transcript: Array<{ role: string; text: string; ts?: number }>;
    chat: Array<{ role: string; text: string; ts?: number }>;
    meta?: any;
  };

  const html = `
  <html>
    <head><title>Realtime Copilot Session</title></head>
    <body>
      <h1>Realtime Copilot Session</h1>
      <h2>Metadata</h2>
      <pre>${JSON.stringify(meta, null, 2)}</pre>
      <h2>Transcript (system / worker)</h2>
      <ul>
        ${transcript
          .map(
            (t) =>
              `<li><strong>${t.role}</strong> [${t.ts ? new Date(t.ts).toISOString() : ""}]: ${t.text}</li>`
          )
          .join("\n")}
      </ul>
      <h2>User Chat</h2>
      <ul>
        ${chat
          .map(
            (t) =>
              `<li><strong>${t.role}</strong> [${t.ts ? new Date(t.ts).toISOString() : ""}]: ${t.text}</li>`
          )
          .join("\n")}
      </ul>
    </body>
  </html>
  `;
  res.json({ html });
});


router.post("/v1/transcribe-raw", async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const buf = Buffer.concat(chunks);

    // write temp file
    const tmp = `tmp/${Date.now()}-screen.wav`;
    await fs.writeFile(tmp, buf);

    const text = await transcribeTempFile(tmp, "screen.wav");

    await fs.unlink(tmp).catch(() => {});
    return res.json({ text });
  } catch (e: any) {
    console.error("[transcribe-raw] error", e?.message || e);
    return res.status(500).json({ error: e?.message || "raw stt failed" });
  }
});