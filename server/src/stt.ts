// server/src/stt.ts
import OpenAI from 'openai';
import { CONFIG } from './config.js';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const client = new OpenAI({ apiKey: CONFIG.openaiKey });

export async function transcribeTempFile(pathname: string, filename = 'audio.webm') {
  const file = fs.createReadStream(pathname) as any;
  const res = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    // @ts-ignore
    filename,
  } as any);
  return (res as any).text as string;
}

export async function transcribeBuffer(buf: Buffer, filename = 'audio.wav') {
  const tmpDir = 'tmp';
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `stt-${randomUUID()}.wav`);
  await fs.promises.writeFile(tmpPath, buf);

  try {
    const text = await transcribeTempFile(tmpPath, filename);
    return text;
  } finally {
    fs.promises.unlink(tmpPath).catch(() => {});
  }
}
