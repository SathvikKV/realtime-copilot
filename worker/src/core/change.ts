// worker/src/core/change.ts
import OpenAI from 'openai';
import { compareScreens } from '../agents/visualAnalyst';
import { rollup as summarizerRollup } from '../agents/summarizer';
import { asMarkdown } from './formatter';
import { OcrEntry, VisualEntry } from './types';

export async function compareVisualStates(openai: OpenAI, prev: VisualEntry, curr: VisualEntry): Promise<string> {
  const sys =
    'You are a concise, user-facing change summarizer for visual states. Compare two visual summaries and explain what changed. ' +
    'Mention movement between scenes, overlays appearing/disappearing, UI element changes (player controls, chat, banners), and salient actions. Keep it under 6 bullets.';
  const prompt = `Previous (${new Date(prev.ts).toLocaleTimeString()}):
Summary: ${prev.summary}
Key items: ${prev.keyItems.join('; ')}

Current (${new Date(curr.ts).toLocaleTimeString()}):
Summary: ${curr.summary}
Key items: ${curr.keyItems.join('; ')}`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.25,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: prompt },
    ],
  } as any);

  return resp.choices[0]?.message?.content ?? '(no visual change summary)';
}

export async function summarizeChangesLatestPairMixed(
  openai: OpenAI,
  ocrHistory: OcrEntry[],
  visualHistory: VisualEntry[],
): Promise<string> {
  if (ocrHistory.length >= 2) {
    const prev = ocrHistory[ocrHistory.length - 2];
    const curr = ocrHistory[ocrHistory.length - 1];
    const sections = await compareScreens(openai, {
      prevTs: prev.ts, prev: prev.ocr, currTs: curr.ts, curr: curr.ocr,
    });
    return asMarkdown(sections);
  }
  if (visualHistory.length >= 2) {
    const prev = visualHistory[visualHistory.length - 2];
    const curr = visualHistory[visualHistory.length - 1];
    return await compareVisualStates(openai, prev, curr);
  }
  return 'Not enough context yet to compute changes.';
}

export async function summarizeChangesSinceMixed(
  openai: OpenAI,
  ocrHistory: OcrEntry[],
  visualHistory: VisualEntry[],
  sinceMs: number,
): Promise<string> {
  const cutoff = Date.now() - Math.max(1_000, sinceMs);

  const ocrCandidates = ocrHistory.filter(h => h.ts >= cutoff);
  if (ocrCandidates.length >= 2) {
    const prev = ocrCandidates[0];
    const curr = ocrCandidates[ocrCandidates.length - 1];
    const sections = await compareScreens(openai, { prevTs: prev.ts, prev: prev.ocr, currTs: curr.ts, curr: curr.ocr });
    return asMarkdown(sections);
  }

  const visCandidates = visualHistory.filter(v => v.ts >= cutoff);
  if (visCandidates.length >= 2) {
    const prev = visCandidates[0];
    const curr = visCandidates[visCandidates.length - 1];
    return await compareVisualStates(openai, prev, curr);
  }

  return `Not enough context since the last ${Math.round(sinceMs/1000)}s. Try enabling Auto context or wait a bit.`;
}

export async function summarizeContextWindowMixed(
  openai: OpenAI,
  ocrHistory: OcrEntry[],
  visualHistory: VisualEntry[],
  n: number,
): Promise<string> {
  const entries = ocrHistory.slice(-n);
  if (entries.length >= Math.min(5, n)) {
    const sections = await summarizerRollup(openai, entries);
    return asMarkdown(sections);
  }

  const vis = visualHistory.slice(-Math.min(10, n));
  if (!vis.length) return 'No context yet.';
  const sys =
    'Create a concise rolling summary over visual states (screenshots). Highlight scene changes, overlays, UI elements, and likely user tasks. Use 4–10 bullets.';
  const bundle = vis
    .map(v => `[${new Date(v.ts).toLocaleTimeString()}]\n${v.summary}\n- ${v.keyItems.join('\n- ')}`)
    .join('\n---\n');

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Recent visual summaries (newest last):\n\n${bundle}` },
    ],
  } as any);

  return resp.choices[0]?.message?.content ?? '(no summary)';
}
