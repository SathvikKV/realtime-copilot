// client/lib/realtime.ts
"use client";

import {
  Room,
  RoomEvent,
  LocalParticipant,
  LocalTrackPublication,
  RemoteParticipant,
} from "livekit-client";

const BASE = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:5050";
const LK_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

export type RtHandles = {
  room: Room;
  dcSend: (msg: any) => void;
  attachAndPublishScreen: (display: MediaStream) => Promise<void>;
  stopScreen: () => Promise<void>;
  publishMic: () => Promise<void>;
  unpublishMic: () => Promise<void>;
  leave: () => Promise<void>;
};

async function mintToken(roomName: string, identity: string) {
  const r = await fetch(`${BASE}/api/rt/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomName, identity }),
  });
  if (!r.ok) throw new Error(`token mint failed ${r.status}`);
  const { token } = (await r.json()) as any;
  return token as string;
}

export async function startRealtime(
  roomName: string,
  identity: string,
): Promise<RtHandles> {
  const token = await mintToken(roomName, identity);

  const room = new Room({ dynacast: true, adaptiveStream: true });
  await room.connect(LK_URL, token);

  const lp: LocalParticipant = room.localParticipant!;
  if (!lp) throw new Error("localParticipant missing after connect");

  // keep refs for cleanup
  let screenVideoTrack: MediaStreamTrack | null = null;
  let screenVideoPub: LocalTrackPublication | null = null;
  let screenAudioTrack: MediaStreamTrack | null = null;
  let screenAudioPub: LocalTrackPublication | null = null;
  let micTrack: MediaStreamTrack | null = null;
  let micPub: LocalTrackPublication | null = null;

  // DataChannel helper
  const dcSend = (msg: any) => {
    const payload = new TextEncoder().encode(JSON.stringify(msg));
    lp.publishData(payload, { reliable: true, topic: "control" });
  };

  // publish screen share: video + (optionally) screen/tab audio
  async function attachAndPublishScreen(display: MediaStream) {
    // video first
    if (!screenVideoPub) {
      const vtrack = display.getVideoTracks()[0];
      if (!vtrack) throw new Error("no video track in display stream");
      const vpub = await lp.publishTrack(vtrack, { name: "screen" });
      screenVideoTrack = vtrack;
      screenVideoPub = vpub;
    }

    // audio from shared tab/window (if user allowed it)
    const atrack = display.getAudioTracks()[0];
    if (atrack && !screenAudioPub) {
      const apub = await lp.publishTrack(atrack, { name: "screen-audio" });
      screenAudioTrack = atrack;
      screenAudioPub = apub;
    }
  }

  async function stopScreen() {
    // stop video
    if (screenVideoPub) {
      try {
        screenVideoPub.track?.stop();
        lp.unpublishTrack(screenVideoPub.track!);
      } catch {
        /* ignore */
      }
      screenVideoPub = null;
    }
    if (screenVideoTrack) {
      try {
        screenVideoTrack.stop();
      } catch {
        /* ignore */
      }
      screenVideoTrack = null;
    }

    // stop screen audio
    if (screenAudioPub) {
      try {
        screenAudioPub.track?.stop();
        lp.unpublishTrack(screenAudioPub.track!);
      } catch {
        /* ignore */
      }
      screenAudioPub = null;
    }
    if (screenAudioTrack) {
      try {
        screenAudioTrack.stop();
      } catch {
        /* ignore */
      }
      screenAudioTrack = null;
    }
  }

  async function publishMic() {
    if (micPub) return;
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = mic.getAudioTracks()[0];
    const pub = await lp.publishTrack(track, { name: "mic" });
    micTrack = track;
    micPub = pub;
  }

  async function unpublishMic() {
    if (micPub) {
      try {
        micPub.track?.stop();
        lp.unpublishTrack(micPub.track!);
      } catch {
        /* ignore */
      }
      micPub = null;
    }
    if (micTrack) {
      try {
        micTrack.stop();
      } catch {
        /* ignore */
      }
      micTrack = null;
    }
  }

  async function leave() {
    await stopScreen();
    await unpublishMic();
    try {
      room.localParticipant?.trackPublications.forEach((p) => p.track?.stop());
    } catch {
      /* ignore */
    }
    await room.disconnect();
  }

  // optional debug of inbound DC
  room.on(
    RoomEvent.DataReceived,
    (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: any,
      topic?: string,
    ) => {
      try {
        const text = new TextDecoder().decode(payload);
        const msg = JSON.parse(text);
        console.log("[client<-worker DC]", {
          from: participant?.identity,
          topic,
          msg,
        });
      } catch {
        /* ignore */
      }
    },
  );

  return {
    room,
    dcSend,
    attachAndPublishScreen,
    stopScreen,
    publishMic,
    unpublishMic,
    leave,
  };
}
