// =============================
// worker/src/agents/visualAnalyst.ts
// =============================
import OpenAI from 'openai';


export type OcrPair = { prevTs: number; prev: string; currTs: number; curr: string };


export async function compareScreens(openai: OpenAI, pair: OcrPair): Promise<{ summary: string; keyItems: string[]; suggestions: string[] }>{
const sys = `You are VisualAnalyst: a pragmatic change detector for screen OCR.
Return JSON with keys summary (string), keyItems (array of short strings), suggestions (array of short strings).
Focus on what visibly changed (added/removed sections, new errors, numbers, filenames, branch names, status text).`;


const user = `Previous (${new Date(pair.prevTs).toLocaleTimeString()}):\n${pair.prev}\n\nCurrent (${new Date(pair.currTs).toLocaleTimeString()}):\n${pair.curr}`;


const resp = await openai.chat.completions.create({
model: 'gpt-4o-mini',
temperature: 0.2,
messages: [
{ role: 'system', content: sys },
{ role: 'user', content: user },
],
response_format: { type: 'json_object' } as any,
} as any);


const raw = resp.choices?.[0]?.message?.content || '{}';
const parsed = JSON.parse(raw);
return {
summary: parsed.summary || 'Changes summarized.',
keyItems: Array.isArray(parsed.keyItems) ? parsed.keyItems : [],
suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
};
}