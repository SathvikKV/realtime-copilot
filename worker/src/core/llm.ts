// worker/src/core/llm.ts
import OpenAI from 'openai';

export function makeOpenAI(apiKey: string) {
  return new OpenAI({ apiKey });
}

/** Helper: run a promise with timeout, returning null on timeout/error. */
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) resolve(null as any);
    }, ms);
    p.then((v) => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(v);
      }
    }).catch(() => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(null as any);
      }
    });
  });
}
