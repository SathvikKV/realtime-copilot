// worker/src/core/dc.ts
import { SendFn } from './types';

export function makeSender(publish: (data: Uint8Array, opts: { reliable: boolean; topic: string }) => void): SendFn {
  return (msg: any) => {
    const data = new TextEncoder().encode(JSON.stringify(msg));
    publish(data, { reliable: true, topic: 'control' });
  };
}
