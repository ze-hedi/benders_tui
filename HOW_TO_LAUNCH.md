# How to Launch Benders TUI

## Prerequisites

- **Node.js 18+** (ESM and `fetch` support required)
- **npm** (comes with Node.js)

## 1. Install Dependencies

```bash
# Server dependencies
cd benders_tui/server
npm install

# React UI dependencies
cd ../benders_ui
npm install

# Return to project root
cd ..
```

## 2. Set API Keys

Edit `/home/bouchehdahed/code/otto_code/.env` and ensure `ANTHROPIC_API_KEY` is set:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

The server loads this file on startup (`server/load-env.ts`). Existing environment variables take precedence over `.env` values.

## 3. Build the React App

```bash
cd benders_ui
npm run build
cd ..
```

This produces `benders_ui/dist/` which the Express server serves statically.

## 4. Start the Server

```bash
cd server
npm start
```

The server starts on **port 8080** and logs:

```
[load-env] Loaded environment from /home/bouchehdahed/code/otto_code/.env
[server] Benders TUI server listening on http://localhost:8080
[server] Serving static files from ...benders_ui/dist
[server] PiAgent initialised and session created.   ← on first /setAgent call
```

## 5. Access the App

Open **http://localhost:8080** in your browser.

The React app will automatically:
1. Call `POST /setAgent` on mount (with 3 retries)
2. Show a green dot when connected
3. Enable the chat input

## Architecture Summary

```
Browser (React)
  │
  │  POST /setAgent, POST /chat (SSE), POST /abort
  ▼
Express server (port 8080)      ←  server/server.ts
  │
  │  PiAgent.chat(message, callback)
  ▼
PiAgent                        ←  otto_code/agents/pi-agent.ts
  │
  │  Anthropic API (streaming)
  ▼
Claude (claude-sonnet-4-5)
```

**Flow per message:**
1. User types message in React → `POST /chat { message }`
2. Express calls `piAgent.chat(message, callback)`
3. PiAgent sends the message to Claude with tool access (read, bash, edit, write)
4. Each text token from Claude is sent to the browser via SSE: `data: <token>\n`
5. When the response completes, the server sends `data: [DONE]\n`
6. The React app renders each token as it arrives, with a blinking cursor while streaming

**Abort flow:**
1. User presses Escape → `POST /abort`
2. Express calls `session.abort()` on the current PiAgent session
3. The SSE stream terminates, React app appends "⚠️ Cancelled"

**Session mode:** `memory` — conversation history is kept in memory for the lifetime of the server process. Restarting the server starts a fresh session.
