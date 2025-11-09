// client/lib/snapshot.ts

/**
 * Start a local (non-LiveKit) screen capture and attach it to a <video> element.
 * This is only for the legacy/local preview path in ControlBar.
 */
export async function startScreenShare(videoEl: HTMLVideoElement): Promise<MediaStream> {
  // Some TS setups don't know about getDisplayMedia on the base type
  const mediaDevices = (navigator.mediaDevices as any);
  if (!mediaDevices?.getDisplayMedia) {
    throw new Error('getDisplayMedia is not supported in this browser.');
  }

  const stream: MediaStream = await mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });

  videoEl.srcObject = stream;
  // play can reject if autoplay policies block sound; we use muted anyway
  await videoEl.play().catch(() => { /* ignore */ });

  return stream;
}

/**
 * Take a PNG snapshot of the current frame in the provided <video> element.
 * Returns a Blob (image/png).
 */
export async function takeSnapshot(videoEl: HTMLVideoElement): Promise<Blob> {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (!vw || !vh) {
    throw new Error('Video element has no frame to capture yet.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = vw;
  canvas.height = vh;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.drawImage(videoEl, 0, 0, vw, vh);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  );

  return blob;
}

/**
 * Capture a higher-res JPEG from the screen-share video.
 * This does NOT aggressively downscale. Good for OCR.
 * Returns a Blob (image/jpeg).
 */
export async function takeHighResSnapshotJPEG(
  videoEl: HTMLVideoElement,
  targetWidth = 1280,
  quality = 0.8
): Promise<Blob> {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (!vw || !vh) {
    throw new Error("Video element has no frame to capture yet.");
  }

  // scale to targetWidth but keep aspect ratio
  const scale = targetWidth / vw;
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(videoEl, 0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality
    )
  );

  return blob;
}


/**
 * Create a small JPEG thumbnail (base64, no data: prefix) that stays
 * well below the RTC DataChannel 64KB limit when wrapped in JSON.
 * Use this for DC snapshots: { type: 'snapshot_thumbnail', jpeg: <b64> }.
 */
export async function takeThumbnailAdaptive(
  videoEl: HTMLVideoElement,
  startWidth = 480,       // start smaller to avoid DC limit
  startQuality = 0.6,     // moderate compression
  maxJsonBytes = 40000    // keep payload comfortably below 64KB
): Promise<string> {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (!vw || !vh) throw new Error('Video element has no frame to capture yet.');

  let width = Math.min(startWidth, vw);
  let height = Math.round((vh / vw) * width);
  let quality = startQuality;

  for (let i = 0; i < 6; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');

    ctx.drawImage(videoEl, 0, 0, width, height);

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        quality
      )
    );

    const buf = await blob.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

    // Rough JSON envelope: {"type":"snapshot_thumbnail","jpeg":"<b64>"} ~ +60 bytes
    const estimatedJsonBytes = b64.length + 60;
    if (estimatedJsonBytes <= maxJsonBytes) return b64;

    // shrink and retry
    width = Math.max(64, Math.round(width * 0.8));
    height = Math.max(36, Math.round(height * 0.8));
    quality = Math.max(0.3, quality * 0.85);
  }

  // Last attempt result (may still be a bit larger than desired, but much smaller than full-size)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable (final)');
  ctx.drawImage(videoEl, 0, 0, width, height);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed (final)'))),
      'image/jpeg',
      quality
    )
  );
  const buf = await blob.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
