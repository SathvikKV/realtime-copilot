// worker/src/core/history.ts
import { CFG } from './config';
import { OcrEntry, VisualEntry } from './types';

const ocrHistory: OcrEntry[] = [];
const visualHistory: VisualEntry[] = [];

// Internal mutable state (not exported as bindings)
let _lastHash: string | null = null;
let _ingestCounter = 0;

export function pushOcr(ocr: string) {
  ocrHistory.push({ ts: Date.now(), ocr });
  while (ocrHistory.length > CFG.HISTORY_MAX) ocrHistory.shift();
}

export function pushVisual(v: VisualEntry) {
  visualHistory.push(v);
  while (visualHistory.length > CFG.HISTORY_MAX) visualHistory.shift();
}

export function latestOcr(n = 1): OcrEntry[] {
  return ocrHistory.slice(-n);
}
export function latestVisual(n = 1): VisualEntry[] {
  return visualHistory.slice(-n);
}

export function getOcrHistory() {
  return ocrHistory;
}
export function getVisualHistory() {
  return visualHistory;
}

// --- new: state accessors ---
export function getLastHash() {
  return _lastHash;
}
export function setLastHash(v: string | null) {
  _lastHash = v;
}

export function getIngestCounter() {
  return _ingestCounter;
}
export function bumpIngestCounter() {
  _ingestCounter += 1;
  return _ingestCounter;
}
export function resetIngestCounter() {
  _ingestCounter = 0;
}
