// server/src/ocr.ts
import OpenAI from 'openai';
import { CONFIG } from './config.js';

const client = new OpenAI({ apiKey: CONFIG.openaiKey });

export async function ocrImage(buf: Buffer): Promise<string> {
  const b64 = buf.toString('base64');
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: 'Extract readable text from the image. Return plain text only.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract text:' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ] as any,
      },
    ],
  } as any);
  return res.choices[0]?.message?.content ?? '';
}
