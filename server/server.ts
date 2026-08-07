/**
 * server.ts — Express bridge between the React frontend and PiAgent.
 *
 * Endpoints:
 *   POST /setAgent  — initialise the PiAgent session
 *   POST /chat      — stream an agent response via SSE
 *   POST /abort     — cancel the current agent session
 *
 * Also serves the production build of benders_ui from ../benders_ui/dist
 * with SPA fallback so client-side routing works.
 */

// ═══════════════════════════════════════════════════════════════
// 1. Load env BEFORE any SDK import
// ═══════════════════════════════════════════════════════════════
import "./load-env.js";

// ═══════════════════════════════════════════════════════════════
// 2. Proxy configuration (undici global dispatcher)
//    PiAgent already sets this in its own module, but we ensure
//    it is set for any direct undici usage in this process.
// ═══════════════════════════════════════════════════════════════
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

if (process.env.HTTP_PROXY || process.env.https_proxy || process.env.HTTPS_PROXY) {
  try {
    setGlobalDispatcher(new EnvHttpProxyAgent());
    console.log("[server] Global undici proxy dispatcher configured.");
  } catch (err) {
    console.warn("[server] Failed to configure proxy dispatcher:", err);
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. Imports
// ═══════════════════════════════════════════════════════════════
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { PiAgent } from "../../otto_code/agents/pi-agent.js";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";

// ═══════════════════════════════════════════════════════════════
// 4. Constants
// ═══════════════════════════════════════════════════════════════
const PORT = 8080;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, "../benders_ui/dist");

// ═══════════════════════════════════════════════════════════════
// 5. Express setup
// ═══════════════════════════════════════════════════════════════
const app = express();
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════
// 6. PiAgent singleton (lazy initialisation)
// ═══════════════════════════════════════════════════════════════
let piAgent: PiAgent | null = null;

// ═══════════════════════════════════════════════════════════════
// 7. Routes
// ═══════════════════════════════════════════════════════════════

/**
 * POST /setAgent
 *
 * Creates a PiAgent instance and pre-creates its session so the first
 * chat call doesn't pay the cold-start cost.
 */
app.post("/setAgent", async (_req, res) => {
  try {
    if (piAgent) {
      // Already initialised — still a valid state
      res.json({ success: true });
      return;
    }

    piAgent = new PiAgent({
      model: "anthropic/claude-sonnet-4-5",
      sessionMode: "memory",
      thinkingLevel: "medium",
      builtInTools: ["read", "bash", "edit", "write"],
    });

    // Pre-create the session so it's warm for the first chat
    await piAgent.getSession();

    console.log("[server] PiAgent initialised and session created.");
    res.json({ success: true });
  } catch (err) {
    console.error("[server] Failed to initialise PiAgent:", err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /chat
 *
 * Accepts { message: string }, streams the agent response as SSE.
 *
 * SSE format (simple, one line per token):
 *   data: <delta_text>\n
 *   data: [DONE]\n
 */
app.post("/chat", async (req, res) => {
  if (!piAgent) {
    res.status(400).json({ error: "Agent not initialised. Call /setAgent first." });
    return;
  }

  const { message } = req.body as { message?: string };
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing or invalid 'message' field." });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx buffering if behind a reverse proxy
  });

  let clientDisconnected = false;

  // Detect client disconnect so we can stop processing
  const onClose = () => {
    clientDisconnected = true;
  };
  req.on("close", onClose);

  try {
    await piAgent.chat(message, (event: AgentSessionEvent) => {
      if (clientDisconnected) return;

      // Extract text deltas from the event stream
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        const delta = (event.assistantMessageEvent as any).textDelta as string;
        if (delta) {
          res.write(`data: ${delta}\n`);
        }
      }
    });

    // Stream completed normally
    if (!clientDisconnected) {
      res.write("data: [DONE]\n");
    }
  } catch (err) {
    console.error("[server] Chat error:", err);
    if (!clientDisconnected) {
      const msg = err instanceof Error ? err.message : String(err);
      // Escape newlines in the error message so it stays on one SSE line
      res.write(`data: Error: ${msg.replace(/\n/g, " ")}\n`);
    }
  } finally {
    req.off("close", onClose);
    if (!clientDisconnected) {
      res.end();
    }
  }
});

/**
 * POST /abort
 *
 * Aborts the current agent session (best-effort).
 */
app.post("/abort", (_req, res) => {
  try {
    const session = piAgent?.getCurrentSession();
    if (session) {
      session.abort();
      console.log("[server] Session aborted.");
    }
  } catch (err) {
    console.warn("[server] Error during abort:", err);
  }

  // Always return success — abort is best-effort
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// 8. Static file serving (SPA fallback)
// ═══════════════════════════════════════════════════════════════
app.use(express.static(DIST_DIR));

// SPA fallback: any non-API route returns index.html
app.get("*", (_req, res, next) => {
  // Skip API routes and paths with file extensions
  if (_req.path.startsWith("/setAgent") || _req.path.startsWith("/chat") || _req.path.startsWith("/abort")) {
    return next();
  }
  if (path.extname(_req.path)) {
    return next();
  }
  res.sendFile(path.join(DIST_DIR, "index.html"), (err) => {
    if (err) next();
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Start
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`[server] Benders TUI server listening on http://localhost:${PORT}`);
  console.log(`[server] Serving static files from ${DIST_DIR}`);
});
