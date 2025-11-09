// client/lib/audio.ts
let rec: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let stream: MediaStream | null = null;

export async function startRecording(): Promise<void> {
  if (rec) return; // already recording
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start();
}

export async function stopRecording(): Promise<Blob> {
  if (!rec) throw new Error('not recording');
  const localRec = rec;
  const localStream = stream;
  rec = null; stream = null;
  return new Promise((resolve) => {
    localRec.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      localStream?.getTracks().forEach(t => t.stop());
      resolve(blob);
    };
    localRec.stop();
  });
}

export function playBase64MP3(b64: string) {
  const src = `data:audio/mpeg;base64,${b64}`;
  const audio = new Audio(src);
  audio.play();
}
