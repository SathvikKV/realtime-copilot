import OpenAI from 'openai';
import { CONFIG } from './config.js';


const client = new OpenAI({ apiKey: CONFIG.openaiKey });


export async function synthesizeToMP3(text: string): Promise<Buffer> {
const res = await client.audio.speech.create({
model: 'gpt-4o-mini-tts',
voice: 'alloy',
input: text,
format: 'mp3'
} as any);
const arrayBuffer = await res.arrayBuffer();
return Buffer.from(arrayBuffer);
}