// worker/src/core/ocr.ts
import OpenAI from 'openai';
import { Sections } from './types';

/**
 * Pull raw text from the screenshot.
 * We DON'T want apologies or meta commentary here.
 * Just dump whatever readable text appears.
 */
export async function ocrImageBase64JPEG(openai: OpenAI, b64: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          "Extract any clearly readable on-screen text. Return ONLY the text content, line by line. " +
          "Do not add commentary, guesses, or analysis. If some text is blurry, skip it.",
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Plain text OCR, no commentary:' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ] as any,
      },
    ],
  } as any);

  return res.choices[0]?.message?.content ?? '';
}

/**
 * Turn OCR text into structured Sections.
 * This is lower confidence than visionUnderstandImage(),
 * but can capture UI labels, menu text, chat lines, etc.
 */
export async function describeStructuredFromOCR(openai: OpenAI, ocr: string): Promise<Sections> {
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          [
            "You are analyzing raw OCR text from a screen capture.",
            "Summarize what the text suggests is happening.",
            "List notable strings (titles, labels, stats, usernames, chat lines, totals, warnings).",
            "Give short suggestions for next steps or questions to ask.",
            "",
            "Return strict JSON with keys:",
            "summary: string",
            "keyItems: string[]",
            "suggestions: string[]",
            "",
            "Be concise. If the text looks like chat, include a few interesting chat snippets in keyItems.",
          ].join("\n"),
      },
      { role: 'user', content: ocr },
    ],
    response_format: { type: 'json_object' } as any,
  } as any);

  const raw = resp.choices?.[0]?.message?.content || '{}';
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return {
    summary:
      parsed.summary ||
      "OCR text shows on-screen labels, chat, or UI elements.",
    keyItems: Array.isArray(parsed.keyItems) ? parsed.keyItems : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
  };
}
