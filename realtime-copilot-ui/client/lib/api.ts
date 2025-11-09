// client/lib/api.ts
const BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5050';

async function parseOrThrow(r: Response) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new Error(`HTTP ${r.status} — ${text || 'no body'}`); }
}

export async function transcribeBlob(blob: Blob) {
  const fd = new FormData();
  fd.append('audio', blob, 'audio.webm');
  const r = await fetch(`${BASE}/api/v1/transcribe`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`transcribe failed: ${r.status}`);
  return parseOrThrow(r) as Promise<{ text: string }>;
}

export async function chat(transcript: string, snapshotUrl?: string) {
  const r = await fetch(`${BASE}/api/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, snapshotUrl }),
  });
  if (!r.ok) throw new Error(`chat failed: ${r.status}`);
  return parseOrThrow(r) as Promise<{ reply: string; ttsBase64: string }>;
}

export async function uploadSnapshot(blob: Blob) {
  const fd = new FormData();
  fd.append('image', blob, 'snap.jpg');
  const r = await fetch(`${BASE}/api/v1/snapshot`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`snapshot failed: ${r.status}`);
  return parseOrThrow(r) as Promise<{ ocr: string }>;
}

export async function ocrHighResSnapshot(blob: Blob) {
  const fd = new FormData();
  fd.append("image", blob, "hires.jpg");

  const r = await fetch(`${BASE}/api/v1/snapshot-hires`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) throw new Error(`hires snapshot failed: ${r.status}`);

  return parseOrThrow(r) as Promise<{ text: string }>;
}
