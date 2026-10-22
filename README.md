# Real Estate AI Agent

Voice and text AI assistant for Islamabad real estate — buyers, renters, sellers, and agents. Chat in the browser, or talk with the agent over LiveKit for real-time voice.

## Features

- Streaming text chat with conversation history
- Real-time voice sessions (speech-to-text, LLM reply, spoken response)
- Session memory across turns within a room
- Optional noise cancellation for voice input
- Property context loaded from Supabase when available

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React, Vite, LiveKit Components |
| API | FastAPI, Uvicorn |
| Voice worker | LiveKit Agents |
| STT | Deepgram |
| LLM | DeepSeek |
| Data | Supabase |

## Project structure

```
Backend/          FastAPI server + LiveKit agent worker
  agent.py        Voice agent (LiveKit job worker)
  server.py       REST API (tokens, chat, history)
  conversation_store.py
  tests/
Frontend/         React app
  src/components/
  src/hooks/
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- Accounts / keys for:
  - [LiveKit Cloud](https://livekit.io) (or self-hosted LiveKit)
  - [Deepgram](https://deepgram.com)
  - [DeepSeek](https://platform.deepseek.com)
  - [Supabase](https://supabase.com)

## Setup

### 1. Backend

```bash
cd Backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Create `Backend/.env`:

```env
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

DEEPGRAM_API_KEY=
DEEPSEEK_API_KEY=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Optional voice noise handling: off | dtln
NOISE_MODE=off
DTLN_STRENGTH=
```

### 2. Frontend

```bash
cd Frontend
npm install
```

Create `Frontend/.env.local` for local development (optional — Vite proxies `/api` to `http://127.0.0.1:8000` in dev):

```env
VITE_API_URL=
```

For production builds, set `VITE_API_URL` in `Frontend/.env.production` to your deployed API URL.

### 3. Supabase

The app expects tables such as:

- `chat_sessions` — conversation transcripts / titles (`channel_room`, `title`, `created_at`, …)
- `property_insights` — market / area insights (optional)
- `property_prices` — price reference data (optional)

Create these in your Supabase project to match how your data is stored. Chat still works with local file fallback if Supabase is unavailable.

## Running locally

From the **repo root** (after `npm install` once in the root and in `Frontend/`):

```bash
npm install
npm run dev
```

That starts everything: FastAPI backend, Vite frontend, and the LiveKit voice agent. Open `http://localhost:5173`.

To run a piece alone: `npm run dev:backend`, `npm run dev:frontend`, or `npm run dev:agent`.

## API overview

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `POST` | `/api/livekit-token` | Issue a LiveKit room token |
| `POST` | `/api/chat` | Streaming text chat reply |
| `GET` | `/api/history/{room_name}` | Transcript for a room |
| `GET` | `/api/conversations` | List saved sessions |

## Notes

- Do not commit `.env`, `.env.local`, or service role keys.
- The agent is tuned for **Islamabad** real estate and avoids inventing live listings or legal/financial guarantees.
- Voice needs the agent worker running and connected to the same LiveKit project as your API keys.
