// worker/src/core/tasks.ts
import { SendFn } from './types';
import { hasErrorSignals } from '../agents/errorHelper';

type TrackErrorTask = { id: number; kind: 'track_error'; until: number; pattern?: RegExp };

let seq = 1;
const tasks = new Map<number, TrackErrorTask>();

export function startTrackError(minutes: number, pattern?: string) {
  const id = seq++;
  const until = Date.now() + Math.max(1, Math.min(60, minutes)) * 60_000;
  const re = pattern ? new RegExp(pattern, 'i') : undefined;
  tasks.set(id, { id, kind: 'track_error', until, pattern: re });
  return { id, until };
}

export function cancelTask(id: number) {
  const ok = tasks.delete(id);
  return ok;
}

export function checkTasksAndAlert(send: SendFn, newestOCR: string) {
  const now = Date.now();
  for (const t of Array.from(tasks.values())) {
    if (now > t.until) {
      tasks.delete(t.id);
      send({ type: 'task_done', id: t.id, status: 'expired' });
      continue;
    }
    if (t.kind === 'track_error') {
      const hit = t.pattern ? t.pattern.test(newestOCR) : hasErrorSignals(newestOCR);
      if (hit) {
        tasks.delete(t.id);
        send({ type: 'task_done', id: t.id, status: 'triggered', note: 'Error pattern reappeared.' });
      }
    }
  }
}
