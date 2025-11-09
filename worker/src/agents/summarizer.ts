// =============================
// worker/src/agents/summarizer.ts
// =============================
import OpenAI from 'openai';


export type OcrEntry = { ts: number; ocr: string };


export async function rollup(openai: OpenAI, entries: OcrEntry[]): Promise<{ summary: string; keyItems: string[]; suggestions: string[] }>{
const bundle = entries.map(e => `[${new Date(e.ts).toLocaleTimeString()}]\n${e.ocr}`).join('\n---\n');
const sys = `You are Summarizer: produce a user-facing, incremental digest of recent OCR.
Return JSON with summary (string), keyItems (array), suggestions (array). Keep it concise.`;
const user = `Recent OCR snapshots (newest last):\n\n${bundle}`;


const resp = await openai.chat.completions.create({
model: 'gpt-4o-mini',
temperature: 0.3,
messages: [
{ role: 'system', content: sys },
{ role: 'user', content: user },
],
response_format: { type: 'json_object' } as any,
} as any);


const raw = resp.choices?.[0]?.message?.content || '{}';
const parsed = JSON.parse(raw);
return {
summary: parsed.summary || 'Summary ready.',
keyItems: Array.isArray(parsed.keyItems) ? parsed.keyItems : [],
suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
};
}