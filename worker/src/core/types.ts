// worker/src/core/types.ts
export type OcrEntry = { ts: number; ocr: string };
export type VisualEntry = { ts: number; summary: string; keyItems: string[] };

export type Sections = {
  summary: string;
  keyItems: string[];
  suggestions: string[];
};

export type SendFn = (msg: any) => void;
