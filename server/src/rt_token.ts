// server/src/rt_token.ts
import 'dotenv/config';
import { AccessToken } from 'livekit-server-sdk';
import type { Request, Response } from 'express';

const LK_API_KEY = process.env.LIVEKIT_API_KEY!;
const LK_API_SECRET = process.env.LIVEKIT_API_SECRET!;
const LK_URL = process.env.LIVEKIT_URL!; // sanity check

export async function mintToken(req: Request, res: Response) {
  try {
    console.log('[token] request', req.body);
    console.log('[token] using key', LK_API_KEY); // move inside the function

    const { roomName, identity } = req.body as { roomName: string; identity: string };
    if (!roomName || !identity) {
      return res.status(400).json({ error: 'roomName and identity required' });
    }

    const at = new AccessToken(LK_API_KEY, LK_API_SECRET, {
      identity, // unique per participant
      ttl: 60 * 60, // 1 hour
    });
    at.addGrant({ roomJoin: true, room: roomName });

    const token = await at.toJwt();
    res.json({ token });
  } catch (e: any) {
    console.error('[token] error', e);
    res.status(500).json({ error: e?.message || 'token mint failed' });
  }
}
