import OpenAI from 'openai';
import { CONFIG } from './config.js';


const client = new OpenAI({ apiKey: CONFIG.openaiKey });


export async function askLLM(userText: string, snapshotText?: string) {
const sys = `You are a screen-aware copilot. If snapshot text is provided, use it.`;


const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
{ role: 'system', content: sys },
];
if (snapshotText) messages.push({ role: 'user', content: `Screen OCR/context:\n${snapshotText}` });
messages.push({ role: 'user', content: userText });


const res = await client.chat.completions.create({
model: 'gpt-4o-mini',
temperature: 0.3,
messages
});
return res.choices[0]?.message?.content ?? '';
}