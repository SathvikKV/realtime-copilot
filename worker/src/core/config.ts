// worker/src/core/config.ts
export const CFG = {
  VISION_EVERY_N_DEFAULT: 10, // run vision every 10th ingest by default
  VISION_EVERY_N_STREAM: 3,   // if a stream/video UI is detected, run vision more often
  CONTEXT_EVERY_N: 5,         // send rolling summary every 5 ingests
  HISTORY_MAX: 40,            // ~2 minutes at 3s ingest cadence
  OCR_TIMEOUT_MS: 4000,       // OCR fusion timeout for on-demand describe
};
