/**
 * load-env.ts — Minimal .env loader for the benders_tui server.
 *
 * Reads /home/bouchehdahed/code/otto_code/.env and sets any key=value pairs
 * in process.env, but only for keys that are not already set (existing env
 * vars take precedence, per 12-factor convention).
 *
 * This file MUST be imported BEFORE any SDK imports (e.g., PiAgent) so that
 * API keys are available when the SDK auth layer reads process.env.
 */

import * as fs from "fs";
import * as path from "path";

const ENV_PATH = "/home/bouchehdahed/code/otto_code/.env";

function loadEnv(): void {
  try {
    const content = fs.readFileSync(ENV_PATH, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Skip blank lines and comments
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;

      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();

      // Only set if not already in the environment
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }

    console.log(`[load-env] Loaded environment from ${ENV_PATH}`);
  } catch (err) {
    console.warn(
      `[load-env] Could not load .env from ${ENV_PATH}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

loadEnv();
