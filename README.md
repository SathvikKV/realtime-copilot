# Realtime Copilot

Realtime Copilot is a local, privacy-first AI assistant that observes your live screen, understands visual and audio context, and allows you to query what you are doing in real time. It performs vision, OCR, and reasoning tasks locally through a modular architecture involving a Next.js frontend, an Express backend, and a Node-based AI worker using LiveKit.

---

## Overview

Realtime Copilot acts as an intelligent companion for your desktop activity. It can:

- Join a LiveKit room and receive live screen share streams
- Periodically capture thumbnails from the screen
- Perform OCR (text extraction) and visual reasoning
- Answer natural questions like:
  - “What’s on my screen?”
  - “What changed in the last minute?”
  - “Summarize what I was doing”
- Use audio from screen share (for example, YouTube videos) for context
- Maintain a rolling short-term memory of your session
- Respond via chat or voice (TTS)
- Export session summaries and structured reports

---

## Features Implemented

| Component | Functionality |
|------------|----------------|
| **Screen Share** | Joins LiveKit room and streams both screen video and tab/system audio |
| **Adaptive Snapshot** | Captures thumbnails dynamically to reduce bandwidth |
| **OCR & Vision Reasoning** | Extracts text and identifies UI elements from frames |
| **Change Summarization** | Compares frames to explain recent screen changes |
| **Chat Interface** | Natural queries like "what’s on my screen?" or "summarize session" |
| **STT / TTS Integration** | Whisper for speech-to-text, ElevenLabs for speech synthesis |
| **Context Window** | Maintains rolling OCR + Vision + Audio transcript memory |
| **Suggested Actions** | Worker infers contextually relevant next steps and sends them to UI |
| **Session Export** | (In progress) Generates summaries and structured logs |

---

## Architecture

The system consists of three core components:

### 1. Client (Frontend)
- Built with **Next.js 14 + TypeScript**
- Handles LiveKit connection and user interface
- Includes chat, transcript panel, and screen preview
- Communicates with Express server via REST endpoints and DataChannel events

### 2. Server (Backend)
- Built with **Node.js + Express + TypeScript**
- Manages authentication tokens, STT, TTS, and OCR routes
- Acts as a bridge between client, worker, and external APIs

### 3. Worker (Headless AI Agent)
- Runs as a **Node.js process using @livekit/rtc-node**
- Joins the same LiveKit room as the user
- Performs vision and OCR reasoning using OpenAI APIs
- Subscribes to screen audio and transcribes it using Whisper
- Sends context updates, structured answers, and suggested actions back to the client

---

## Repository Directory
```
C:\Users\Sathvik\Documents\Projects\realtime-copilot
├─ .env.example
├─ README.md
├─ realtime-copilot-ui/
│ └─ client/
│ ├─ app/
│ │ ├─ layout.tsx
│ │ ├─ page.tsx
│ │ └─ globals.css
│ ├─ components/
│ │ ├─ ControlBar.tsx
│ │ ├─ Header.tsx
│ │ ├─ Transcript.tsx
│ │ ├─ VideoPane.tsx
│ │ └─ StatusToasts.tsx
│ ├─ lib/
│ │ ├─ api.ts
│ │ ├─ realtime.ts
│ │ └─ snapshot.ts
│ └─ next.config.mjs
│
├─ server/
│ ├─ .env
│ └─ src/
│ ├─ index.ts
│ ├─ routes.ts
│ ├─ rt_token.ts
│ ├─ stt.ts
│ ├─ tts.ts
│ ├─ ocr.ts
│ └─ types.ts
│
└─ worker/
├─ .env
└─ src/
├─ agent.ts
├─ core/
│ ├─ vision.ts
│ ├─ ocr.ts
│ ├─ llm.ts
│ ├─ dc.ts
│ ├─ history.ts
│ ├─ change.ts
│ ├─ formatter.ts
│ └─ tasks.ts
└─ agents/
├─ summarizer.ts
├─ visualAnalyst.ts
└─ errorHelper.ts
```

## Environment Variables

### Client (`client/.env.local`)
``` bash
NEXT_PUBLIC_SERVER_URL=http://localhost:5050
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```


### Server (`server/.env`)
``` bash
PORT=5050
OPENAI_API_KEY=<your-openai-key>
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
DEEPGRAM_API_KEY=<optional>
ELEVENLABS_API_KEY=<optional>
``` bash


### Worker (`worker/.env`)
``` bash
LIVEKIT_URL=ws://localhost:7880
ROOM=room-1234
IDENTITY=copilot-worker
OPENAI_API_KEY=<your-openai-key>
TOKEN_ENDPOINT=http://127.0.0.1:5050/api/rt/token
```

---

## Run Instructions (Windows PowerShell)

### 1. Start LiveKit server
```bash
docker run --rm -it `
  -p 7880:7880 -p 7881:7881 `
  -e "LIVEKIT_KEYS=devkey:secret" `
  livekit/livekit-server `
  --dev --bind 0.0.0.0
```
2. Start the Express API
``` bash
cd server
npm install
npm run dev
```
Server running at http://localhost:5050
3. Start the Worker
```bash
cd worker
npm install
npm run dev
```
# Worker connected to LiveKit
4. Start the Frontend
```bash
cd realtime-copilot-ui/client
npm install
npm run dev
```
Open http://localhost:3000

## Usage Flow

1. **Launch LiveKit, Server, Worker, and Client** in order.

2. **In the browser:**
   - Enter your username and join the room.
   - Start screen share (choose the tab or window).
   - The worker will automatically join the same LiveKit room and begin OCR and reasoning.

3. **Ask questions such as:**
   - “What’s on my screen?”
   - “What changed in the last minute?”
   - “Summarize what I was doing.”

4. **The worker will respond** with visual and audio reasoning updates in the chat interface.





