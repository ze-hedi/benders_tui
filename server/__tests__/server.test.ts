/**
 * server.test.ts — Verification tests for the benders_tui server.
 *
 * Covers:
 *  1. File existence
 *  2. package.json structure
 *  3. tsconfig.json structure
 *  4. server.ts Express app exports
 *  5. load-env.ts .env path
 *  6. HOW_TO_LAUNCH.md key sections
 *  7. npm install (run externally)
 *  8. TypeScript type checking (run externally)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

// ─── Paths ───────────────────────────────────────────────────────
const SERVER_DIR = path.resolve(import.meta.dirname, "..");
const PKG_PATH = path.join(SERVER_DIR, "package.json");
const TSCONFIG_PATH = path.join(SERVER_DIR, "tsconfig.json");
const SERVER_TS_PATH = path.join(SERVER_DIR, "server.ts");
const LOAD_ENV_PATH = path.join(SERVER_DIR, "load-env.ts");
const HOW_TO_PATH = path.join(SERVER_DIR, "..", "HOW_TO_LAUNCH.md");

// ─── Helpers ─────────────────────────────────────────────────────
function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function readJsonSafe(p: string): unknown {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// ═════════════════════════════════════════════════════════════════
// 1. File existence
// ═════════════════════════════════════════════════════════════════
describe("File existence", () => {
  const requiredFiles: [string, string][] = [
    ["server.ts", SERVER_TS_PATH],
    ["load-env.ts", LOAD_ENV_PATH],
    ["package.json", PKG_PATH],
    ["tsconfig.json", TSCONFIG_PATH],
    ["HOW_TO_LAUNCH.md", HOW_TO_PATH],
  ];

  for (const [name, filePath] of requiredFiles) {
    it(`${name} should exist`, () => {
      assert.ok(fileExists(filePath), `${name} not found at ${filePath}`);
    });
  }
});

// ═════════════════════════════════════════════════════════════════
// 2. package.json
// ═════════════════════════════════════════════════════════════════
describe("package.json", () => {
  it("should be valid JSON", () => {
    const pkg = readJsonSafe(PKG_PATH);
    assert.ok(typeof pkg === "object" && pkg !== null, "package.json is not an object");
  });

  it("should have correct name and type", () => {
    const pkg = readJsonSafe(PKG_PATH) as Record<string, unknown>;
    assert.equal(pkg.name, "benders_tui-server");
    assert.equal(pkg.type, "module");
  });

  it("should have required scripts", () => {
    const pkg = readJsonSafe(PKG_PATH) as Record<string, unknown>;
    const scripts = pkg.scripts as Record<string, string>;
    assert.ok(scripts, "missing scripts");
    assert.ok(typeof scripts.start === "string", "missing 'start' script");
    assert.ok(typeof scripts.typecheck === "string", "missing 'typecheck' script");
    assert.ok(
      scripts.start.includes("server.ts"),
      "start script should reference server.ts"
    );
    assert.ok(
      scripts.typecheck.includes("tsc"),
      "typecheck script should include tsc"
    );
  });

  it("should have required production dependencies", () => {
    const pkg = readJsonSafe(PKG_PATH) as Record<string, unknown>;
    const deps = pkg.dependencies as Record<string, string>;
    assert.ok(deps, "missing dependencies");
    assert.ok("cors" in deps, "missing 'cors' dependency");
    assert.ok("express" in deps, "missing 'express' dependency");
    assert.ok("undici" in deps, "missing 'undici' dependency");
  });

  it("should have required devDependencies", () => {
    const pkg = readJsonSafe(PKG_PATH) as Record<string, unknown>;
    const devDeps = pkg.devDependencies as Record<string, string>;
    assert.ok(devDeps, "missing devDependencies");
    assert.ok("@types/cors" in devDeps, "missing '@types/cors' devDependency");
    assert.ok("@types/express" in devDeps, "missing '@types/express' devDependency");
    assert.ok("tsx" in devDeps, "missing 'tsx' devDependency");
    assert.ok("typescript" in devDeps, "missing 'typescript' devDependency");
  });

  it("should be marked as private", () => {
    const pkg = readJsonSafe(PKG_PATH) as Record<string, unknown>;
    assert.equal(pkg.private, true, "package should be private");
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. tsconfig.json
// ═════════════════════════════════════════════════════════════════
describe("tsconfig.json", () => {
  it("should be valid JSON", () => {
    const tsconfig = readJsonSafe(TSCONFIG_PATH);
    assert.ok(typeof tsconfig === "object" && tsconfig !== null, "tsconfig is not an object");
  });

  it("should have required compiler options", () => {
    const tsconfig = readJsonSafe(TSCONFIG_PATH) as Record<string, unknown>;
    const opts = tsconfig.compilerOptions as Record<string, unknown>;
    assert.ok(opts, "missing compilerOptions");

    assert.equal(opts.target, "ES2022", "target should be ES2022");
    assert.equal(opts.module, "ESNext", "module should be ESNext");
    assert.equal(opts.moduleResolution, "node", "moduleResolution should be node");
    assert.equal(opts.esModuleInterop, true, "esModuleInterop should be true");
    assert.equal(opts.strict, true, "strict should be true");
    assert.equal(opts.resolveJsonModule, true, "resolveJsonModule should be true");
  });

  it("should skip lib check for faster type checking", () => {
    const tsconfig = readJsonSafe(TSCONFIG_PATH) as Record<string, unknown>;
    const opts = tsconfig.compilerOptions as Record<string, unknown>;
    assert.equal(opts.skipLibCheck, true, "skipLibCheck should be true for performance");
  });

  it("should include TypeScript source files", () => {
    const tsconfig = readJsonSafe(TSCONFIG_PATH) as Record<string, unknown>;
    const include = tsconfig.include as string[];
    assert.ok(include, "missing 'include'");
    assert.ok(include.some((p) => p.endsWith(".ts")), "include should cover .ts files");
  });

  it("should exclude node_modules", () => {
    const tsconfig = readJsonSafe(TSCONFIG_PATH) as Record<string, unknown>;
    const exclude = tsconfig.exclude as string[];
    assert.ok(exclude, "missing 'exclude'");
    assert.ok(exclude.includes("node_modules"), "should exclude node_modules");
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. server.ts — Express app structure
// ═════════════════════════════════════════════════════════════════
describe("server.ts", () => {
  it("should contain an Express app creation", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    // Check for express() invocation
    assert.ok(src.includes("express()"), "should call express()");
    // Check for app declaration
    assert.ok(src.match(/const\s+app\s*=\s*express\(\)/), "should declare 'const app = express()'");
  });

  it("should call app.listen to start the server", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    assert.ok(src.includes("app.listen"), "should call app.listen()");
  });

  it("should define POST /setAgent endpoint", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    assert.ok(src.includes("/setAgent"), "should have /setAgent route");
    assert.ok(
      src.match(/app\.post\(.*\/setAgent/),
      "should use app.post for /setAgent"
    );
  });

  it("should define POST /chat endpoint", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    assert.ok(src.includes("/chat"), "should have /chat route");
    assert.ok(
      src.match(/app\.post\(.*\/chat/),
      "should use app.post for /chat"
    );
  });

  it("should define POST /abort endpoint", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    assert.ok(src.includes("/abort"), "should have /abort route");
    assert.ok(
      src.match(/app\.post\(.*\/abort/),
      "should use app.post for /abort"
    );
  });

  it("should enable CORS middleware", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    assert.ok(src.includes("cors()"), "should call cors() middleware");
    assert.ok(
      src.match(/app\.use\(.*cors\(\)/),
      "should use app.use(cors())"
    );
  });

  it("should enable JSON body parsing", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    assert.ok(src.includes("express.json()"), "should use express.json()");
  });

  it("should serve static files from benders_ui/dist", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    assert.ok(
      src.includes("benders_ui/dist") || src.includes("DIST_DIR"),
      "should reference benders_ui/dist"
    );
    assert.ok(src.includes("express.static"), "should use express.static middleware");
  });

  it("should import load-env before PiAgent import statement", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    // The actual import of load-env should appear before the PiAgent import statement.
    // (Comments mentioning "PiAgent" before the import are fine; we check the import line.)
    const loadEnvIdx = src.indexOf('import "./load-env.js"');
    const piAgentImportIdx = src.indexOf('import { PiAgent }');
    assert.ok(loadEnvIdx > 0, "should import load-env");
    assert.ok(piAgentImportIdx > loadEnvIdx, "load-env import must appear before PiAgent import");
  });

  it("should import PiAgent from otto_code", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    assert.ok(
      src.includes("pi-agent"),
      "should import from pi-agent"
    );
    assert.ok(
      src.includes("PiAgent"),
      "should reference PiAgent class"
    );
  });

  it("should configure PiAgent with expected session mode", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    assert.ok(
      src.includes('sessionMode: "memory"'),
      "should use memory session mode"
    );
  });

  it("should stream SSE with correct headers", () => {
    const src = fs.readFileSync(SERVER_TS_PATH, "utf-8");
    assert.ok(
      src.includes("text/event-stream"),
      "should set Content-Type to text/event-stream"
    );
    assert.ok(
      src.includes("data: "),
      "should send SSE data: prefix"
    );
    assert.ok(
      src.includes("data: [DONE]"),
      "should send [DONE] signal to end stream"
    );
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. load-env.ts
// ═════════════════════════════════════════════════════════════════
describe("load-env.ts", () => {
  it("should contain the correct .env path", () => {
    const src = fs.readFileSync(LOAD_ENV_PATH, "utf-8");
    assert.ok(
      src.includes("/home/bouchehdahed/code/otto_code/.env"),
      "should reference the otto_code .env file"
    );
  });

  it("should define a const ENV_PATH", () => {
    const src = fs.readFileSync(LOAD_ENV_PATH, "utf-8");
    assert.ok(
      src.match(/const\s+ENV_PATH\s*=\s*["']/),
      "should declare ENV_PATH constant"
    );
  });

  it("should use readFileSync to read the .env file", () => {
    const src = fs.readFileSync(LOAD_ENV_PATH, "utf-8");
    assert.ok(
      src.includes("readFileSync"),
      "should use readFileSync"
    );
  });

  it("should set process.env keys not already set", () => {
    const src = fs.readFileSync(LOAD_ENV_PATH, "utf-8");
    assert.ok(
      src.includes("process.env[key]"),
      "should set process.env keys"
    );
    // Check for the 12-factor guard: only set if not already present
    assert.ok(
      src.includes("!(key in process.env)") || src.includes("key in process.env"),
      "should check if key is already in process.env"
    );
  });

  it("should skip blank lines and comments", () => {
    const src = fs.readFileSync(LOAD_ENV_PATH, "utf-8");
    // Source uses double quotes: startsWith("#")
    assert.ok(
      src.includes('startsWith("#")'),
      "should skip comment lines"
    );
    // Blank line check: if (!trimmed)
    assert.ok(
      src.includes("!trimmed"),
      "should skip blank lines"
    );
  });

  it("should handle parse errors gracefully", () => {
    const src = fs.readFileSync(LOAD_ENV_PATH, "utf-8");
    assert.ok(
      src.includes("catch") && src.includes("console.warn"),
      "should catch errors and warn instead of crashing"
    );
  });
});

// ═════════════════════════════════════════════════════════════════
// 6. HOW_TO_LAUNCH.md
// ═════════════════════════════════════════════════════════════════
describe("HOW_TO_LAUNCH.md", () => {
  let content: string;

  // Read once before tests
  {
    content = fs.readFileSync(HOW_TO_PATH, "utf-8");
  }

  it("should contain a Prerequisites section", () => {
    assert.ok(
      content.includes("Prerequisites") || content.includes("prerequisites"),
      "should have a Prerequisites heading"
    );
  });

  it("should mention Node.js 18+ requirement", () => {
    assert.ok(
      content.includes("Node.js 18") || content.includes("Node 18"),
      "should mention Node.js version requirement"
    );
  });

  it("should contain installation instructions (npm install)", () => {
    const hasInstall =
      content.includes("npm install") || content.includes("Install Dependencies");
    assert.ok(hasInstall, "should contain npm install instructions");
  });

  it("should contain build instructions or reference to building the React app", () => {
    const hasBuild =
      content.includes("npm run build") ||
      content.includes("Build the React") ||
      content.includes("build");
    assert.ok(hasBuild, "should contain build instructions");
  });

  it("should contain server start instructions (npm start)", () => {
    assert.ok(
      content.includes("npm start") || content.includes("Start the Server"),
      "should contain 'npm start' or 'Start the Server' instructions"
    );
  });

  it("should mention port 8080", () => {
    assert.ok(content.includes("8080"), "should mention port 8080");
  });

  it("should mention the .env file or API key setup", () => {
    assert.ok(
      content.includes(".env") || content.includes("API key") || content.includes("ANTHROPIC_API_KEY"),
      "should reference .env or API key configuration"
    );
  });

  it("should contain an architecture summary or flow diagram", () => {
    assert.ok(
      content.includes("Architecture") || content.includes("Flow") || content.includes("flow per message"),
      "should have architecture or flow documentation"
    );
  });

  it("should mention the /setAgent, /chat, and /abort endpoints", () => {
    assert.ok(content.includes("/setAgent"), "should mention /setAgent");
    assert.ok(content.includes("/chat"), "should mention /chat");
    assert.ok(content.includes("/abort"), "should mention /abort");
  });
});

// ═════════════════════════════════════════════════════════════════
// 7. npm install verification
// ═════════════════════════════════════════════════════════════════
describe("npm install", () => {
  it("should have node_modules directory after install", () => {
    const nodeModules = path.join(SERVER_DIR, "node_modules");
    assert.ok(
      fs.existsSync(nodeModules),
      "node_modules directory should exist"
    );
  });

  it("should have key dependencies installed", () => {
    const expressPkg = path.join(SERVER_DIR, "node_modules", "express", "package.json");
    assert.ok(fs.existsSync(expressPkg), "express should be installed");

    const corsPkg = path.join(SERVER_DIR, "node_modules", "cors", "package.json");
    assert.ok(fs.existsSync(corsPkg), "cors should be installed");

    const tsxBin = path.join(SERVER_DIR, "node_modules", ".bin", "tsx");
    assert.ok(fs.existsSync(tsxBin), "tsx should be installed");

    const tscBin = path.join(SERVER_DIR, "node_modules", ".bin", "tsc");
    assert.ok(fs.existsSync(tscBin), "typescript should be installed");
  });
});

// ═════════════════════════════════════════════════════════════════
// 8. TypeScript type checking
// ═════════════════════════════════════════════════════════════════
describe("TypeScript type checking", () => {
  it("server/*.ts files should have no type errors", () => {
    // tsc --noEmit reports errors for all resolved modules, including
    // otto_code agents which may have pre-existing type issues. We only
    // care about errors in the server directory itself.
    let output: string;
    try {
      output = execSync("npm run typecheck", {
        cwd: SERVER_DIR,
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch (err: any) {
      // tsc exits with code 2 on errors; capture stdout for inspection
      output = err.stdout || err.stderr || "";
    }

    // Filter: only errors in server/*.ts (not otto_code)
    const serverDir = SERVER_DIR.replace(/\/home\/bouchehdahed\/code\//, "");
    const allErrors = output
      .split("\n")
      .filter((line) => line.includes("error TS"));

    const serverErrors = allErrors.filter((line) =>
      line.includes("server/") || line.includes("load-env.ts") || line.includes("server.ts")
    );

    assert.equal(
      serverErrors.length,
      0,
      `TypeScript errors in server code:\n${serverErrors.join("\n")}\n\n` +
        `(Note: ${allErrors.length - serverErrors.length} pre-existing errors in otto_code/ are excluded.)`
    );
  });
});
