import 'dotenv/config';


export const CONFIG = {
port: Number(process.env.PORT ?? 5050),
openaiKey: process.env.OPENAI_API_KEY ?? '',
// swap later if you want
deepgramKey: process.env.DEEPGRAM_API_KEY ?? '',
elevenLabsKey: process.env.ELEVENLABS_API_KEY ?? ''
};


if (!CONFIG.openaiKey) {
console.warn('[warn] OPENAI_API_KEY is empty — STT/LLM/TTS calls will fail.');
}