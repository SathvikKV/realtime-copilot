// =============================
// worker/src/agents/errorHelper.ts
// =============================
import OpenAI from 'openai';


export function hasErrorSignals(text: string): boolean {
return /(Exception|Error:|Traceback|at\s+\w+\s+\(|BUILD FAILED|Compilation failed|TypeError|ReferenceError|Stack trace)/i.test(text);
}


export async function explain(openai: OpenAI, ocr: string): Promise<{ summary: string; keyItems: string[]; suggestions: string[] }>{
const sys = `You are ErrorHelper: explain build/runtime errors concisely.
Return JSON with summary (string), keyItems (array of concrete findings like filenames, line numbers, error codes), suggestions (array of next steps).`;
const user = `OCR from screen (logs/stack traces allowed):\n\n${ocr}`;
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
summary: parsed.summary || 'Error explained.',
keyItems: Array.isArray(parsed.keyItems) ? parsed.keyItems : [],
suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
};
}