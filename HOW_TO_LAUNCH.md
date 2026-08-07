# Benders TUI — Quick Launch

## Launch (3 steps)

```bash
# 1. Install deps
cd server && npm install && cd ../benders_ui && npm install && cd ..

# 2. Set your Anthropic API key in otto_code/.env (already there if otto works)
#    ANTHROPIC_API_KEY=sk-ant-api03-...

# 3. Build the UI & start
cd benders_ui && npm run build && cd ../server && npm start
```

Open **http://localhost:8080** — the React app connects automatically.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/setAgent` | Initialise PiAgent (called on mount) |
| `POST` | `/chat` | Send message, receive SSE stream (`data: <token>\n`) |
| `POST` | `/abort` | Interrupt current chat |

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19 + TypeScript, Vite, CSS modules |
| **Backend** | Express 5 (Node.js/TypeScript), run via `tsx` |
| **Agent SDK** | `@mariozechner/pi-coding-agent` — wraps Claude with tool-use (read/write/bash/edit) |
| **LLM** | Claude Sonnet 4.5 via Anthropic API |
| **Streaming** | Server-Sent Events (SSE) |
