# Pi Coding Agent — Context Compaction Deep Dive

**Package**: `@mariozechner/pi-coding-agent` v0.70.6  
**Date of investigation**: 2026-08-07  
**Scope**: How to trigger context compaction on demand, and the full compaction API surface

---

## Table of Contents

1. [Overview](#overview)
2. [The Three Ways to Trigger Compaction](#the-three-ways-to-trigger-compaction)
   - [1. `AgentSession.compact()` — Direct SDK API](#1-agentsessioncompact--direct-sdk-api)
   - [2. `ctx.compact()` — Extension Context API](#2-ctxcompact--extension-context-api)
   - [3. `session_before_compact` Event — Extension Interception](#3-session_before_compact-event--extension-interception)
3. [Auto-Compaction](#auto-compaction)
4. [Settings Configuration](#settings-configuration)
5. [How Compaction Works Internally](#how-compaction-works-internally)
6. [Compaction Types Reference](#compaction-types-reference)
7. [Exported Utility Functions](#exported-utility-functions)
8. [Branch Summarization (Related Feature)](#branch-summarization-related-feature)
9. [Practical Examples](#practical-examples)
10. [Summary: Answering "Is There a Way to Compress Context on Demand?"](#summary-answering-is-there-a-way-to-compress-context-on-demand)

---

## Overview

The pi coding agent handles LLM context window limits through a mechanism called **compaction**. When conversations grow too long, pi summarizes older content while preserving recent work, freeing up context tokens for continued conversation.

Pi exposes multiple APIs to trigger compaction **on demand**, both from SDK code and from extension code. This is *not* just an automatic internal mechanism — it is a fully exposed public API.

---

## The Three Ways to Trigger Compaction

### 1. `AgentSession.compact()` — Direct SDK API

If you have a reference to an `AgentSession` object (obtained via `createAgentSession()`, `AgentSessionRuntime.session`, etc.), you can trigger compaction directly:

```typescript
// From: dist/core/agent-session.d.ts
class AgentSession {
    /**
     * Manually compact the session context.
     * Aborts current agent operation first.
     * @param customInstructions Optional instructions for the compaction summary
     */
    compact(customInstructions?: string): Promise<CompactionResult>;
}
```

**Key characteristics**:
- Returns a **`Promise<CompactionResult>`** — you can `await` it
- Aborts any in-progress agent operation before compacting
- Accepts optional `customInstructions` to focus the summary
- `CompactionResult` contains: `summary`, `firstKeptEntryId`, `tokensBefore`, optional `details`

**How to get an `AgentSession` reference (SDK approach)**:

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* options */ });

// Trigger compaction on demand:
const result = await session.compact("Focus on database schema changes");
console.log("Tokens before:", result.tokensBefore);
console.log("Summary:", result.summary);

// Without custom instructions:
const result2 = await session.compact();
```

**Other session-level compaction methods**:

| Method | Description |
|--------|-------------|
| `session.compact(customInstructions?)` | Trigger manual compaction |
| `session.abortCompaction()` | Cancel in-progress compaction |
| `session.setAutoCompactionEnabled(enabled: boolean)` | Enable/disable auto-compaction |
| `session.autoCompactionEnabled` (getter) | Check if auto-compaction is on |
| `session.isCompacting` (getter) | Check if compaction is currently running |
| `session.getContextUsage()` | Get current context usage (tokens, window, percent) |

### 2. `ctx.compact()` — Extension Context API

Available inside **extension event handlers** and **command handlers** via the `ExtensionContext` object:

```typescript
// From: dist/core/extensions/types.d.ts
interface ExtensionContext {
    /**
     * Trigger compaction without awaiting completion.
     * This is fire-and-forget — the method returns void immediately.
     */
    compact(options?: CompactOptions): void;
}

// Options:
interface CompactOptions {
    /** Optional instructions to focus the summary */
    customInstructions?: string;
    /** Called when compaction completes successfully */
    onComplete?: (result: CompactionResult) => void;
    /** Called when compaction fails */
    onError?: (error: Error) => void;
}
```

**Key characteristics**:
- **Fire-and-forget** — returns `void` immediately, does not block
- Uses callbacks (`onComplete` / `onError`) for result notification
- Same underlying mechanism as `AgentSession.compact()`, but with a non-blocking interface suitable for UI/extension code

**Example usage in an extension**:

```typescript
// Adapted from: examples/extensions/trigger-compact.ts
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
    const triggerCompaction = (ctx: ExtensionContext, customInstructions?: string) => {
        ctx.compact({
            customInstructions,
            onComplete: (result) => {
                console.log("Compaction done:", result.summary.substring(0, 100));
            },
            onError: (error) => {
                console.error("Compaction failed:", error.message);
            },
        });
    };

    // Trigger from a custom slash command:
    pi.registerCommand("compact-now", {
        description: "Trigger compaction immediately",
        handler: async (args, ctx) => {
            triggerCompaction(ctx, args.trim() || undefined);
        },
    });

    // Or trigger based on context usage after each turn:
    pi.on("turn_end", (_event, ctx) => {
        const usage = ctx.getContextUsage();
        if (usage?.tokens && usage.tokens > 100_000) {
            triggerCompaction(ctx);
        }
    });
}
```

### 3. `session_before_compact` Event — Extension Interception

Extensions can **intercept** compaction (both manual and auto) before it happens, to customize the summary, use a different model, or cancel it entirely:

```typescript
// From: dist/core/extensions/types.d.ts
interface ExtensionAPI {
    on(event: "session_before_compact",
       handler: ExtensionHandler<SessionBeforeCompactEvent, SessionBeforeCompactResult>): void;
    on(event: "session_compact",
       handler: ExtensionHandler<SessionCompactEvent>): void;
}

// Event contains:
interface SessionBeforeCompactEvent {
    type: "session_before_compact";
    preparation: CompactionPreparation;
    branchEntries: SessionEntry[];
    customInstructions?: string;
    signal: AbortSignal;
}

// Return type:
interface SessionBeforeCompactResult {
    cancel?: boolean;          // Cancel compaction entirely
    compaction?: CompactionResult;  // Provide custom summary
}
```

**The `CompactionPreparation` object** provides full access to the compaction context:

```typescript
interface CompactionPreparation {
    firstKeptEntryId: string;           // UUID of first entry to keep
    messagesToSummarize: AgentMessage[]; // Messages that will be summarized & discarded
    turnPrefixMessages: AgentMessage[];  // Split-turn prefix messages (if splitting)
    isSplitTurn: boolean;                // Whether cut point is mid-turn
    tokensBefore: number;                // Context tokens before compaction
    previousSummary?: string;            // Summary from previous compaction (iterative)
    fileOps: FileOperations;             // Extracted file operations
    settings: CompactionSettings;        // Current compaction settings
}
```

**Complete custom compaction example** (uses a different model):

```typescript
// From: examples/extensions/custom-compaction.ts
import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
    pi.on("session_before_compact", async (event, ctx) => {
        const { preparation, signal } = event;
        const { messagesToSummarize, turnPrefixMessages, tokensBefore,
                firstKeptEntryId, previousSummary } = preparation;

        // Use a different/cheaper model for summarization
        const model = ctx.modelRegistry.find("google", "gemini-2.5-flash");
        if (!model) return; // fall through to default

        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        if (!auth.ok || !auth.apiKey) return;

        // Serialize messages to text format
        const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
        const conversationText = serializeConversation(convertToLlm(allMessages));

        // Generate summary with custom model
        const response = await complete(
            model,
            { messages: [{ role: "user", content: [{ type: "text",
                text: `Summarize this conversation:\n${conversationText}` }],
                timestamp: Date.now() }] },
            { apiKey: auth.apiKey, maxTokens: 8192, signal }
        );

        const summary = response.content
            .filter(c => c.type === "text")
            .map(c => c.text).join("\n");

        return {
            compaction: { summary, firstKeptEntryId, tokensBefore }
        };
    });
}
```

---

## Auto-Compaction

Auto-compaction triggers automatically when:

```
contextTokens > contextWindow - reserveTokens
```

- `reserveTokens` defaults to **16384** (leaves room for LLM response)
- `keepRecentTokens` defaults to **20000** (recent tokens kept unsummarized)

The full algorithm:
1. Walk backwards from newest message, accumulating token estimates
2. When `keepRecentTokens` is reached, cut
3. Messages before the cut point are summarized by the LLM
4. A `CompactionEntry` is appended with the summary
5. Session reloads, using summary + recent messages

Auto-compaction is **enabled by default** and can be disabled:

```json
// ~/.pi/agent/settings.json or <project>/.pi/settings.json
{
  "compaction": {
    "enabled": false
  }
}
```

---

## Settings Configuration

```json
{
  "compaction": {
    "enabled": true,          // Enable auto-compaction (default: true)
    "reserveTokens": 16384,   // Tokens reserved for LLM response
    "keepRecentTokens": 20000 // Recent tokens to keep unsummarized
  }
}
```

---

## How Compaction Works Internally

### Step-by-step flow:

1. **Find cut point**: `findCutPoint()` walks backwards from newest message, accumulating token estimates until `keepRecentTokens` is reached
2. **Prepare**: `prepareCompaction()` collects `messagesToSummarize` and calculates `tokensBefore`
3. **Summarize**: `compact()` or `generateSummary()` calls the LLM with a structured summarization prompt
4. **Append**: A `CompactionEntry` is saved to the session with `summary`, `firstKeptEntryId`, `tokensBefore`
5. **Reload**: The session reloads, rebuilding context from the summary + messages from `firstKeptEntryId` onward

### Cut Point Rules:
- Can cut at: **user messages**, **assistant messages**, **bash execution messages**, **custom messages**, **branch summaries**
- NEVER cut at tool results (they must stay with their tool call)
- Preserves turn boundaries when possible
- For "split turns" (very long single turn), generates both history + turn-prefix summaries

### CompactionEntry Structure:
```typescript
interface CompactionEntry<T = unknown> {
    type: "compaction";
    id: string;
    parentId: string;
    timestamp: number;
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    fromHook?: boolean;   // true if provided by extension
    details?: T;          // Extension-specific data
}
```

---

## Compaction Types Reference

### Core Types (from `dist/core/compaction/compaction.d.ts`)

```typescript
// Returned from compact() — SessionManager adds uuid/parentUuid on save
interface CompactionResult<T = unknown> {
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    details?: T;  // Extension-specific data
}

// Prepared by prepareCompaction() for consumption by compact() or extensions
interface CompactionPreparation {
    firstKeptEntryId: string;
    messagesToSummarize: AgentMessage[];
    turnPrefixMessages: AgentMessage[];
    isSplitTurn: boolean;
    tokensBefore: number;
    previousSummary?: string;
    fileOps: FileOperations;
    settings: CompactionSettings;
}

interface CompactionSettings {
    enabled: boolean;
    reserveTokens: number;
    keepRecentTokens: number;
}

interface CutPointResult {
    firstKeptEntryIndex: number;
    turnStartIndex: number;
    isSplitTurn: boolean;
}
```

### File Operations Type (from `dist/core/compaction/utils.d.ts`)

```typescript
interface FileOperations {
    read: Set<string>;
    written: Set<string>;
    edited: Set<string>;
}
```

### Context Usage Type (from `dist/core/extensions/types.d.ts`)

```typescript
interface ContextUsage {
    /** Estimated context tokens, or null if unknown */
    tokens: number | null;
    contextWindow: number;
    /** Context usage as percentage, or null if unknown */
    percent: number | null;
}
```

### CompactOptions (from `dist/core/extensions/types.d.ts`)

```typescript
interface CompactOptions {
    customInstructions?: string;
    onComplete?: (result: CompactionResult) => void;
    onError?: (error: Error) => void;
}
```

### Agent Session Events Related to Compaction

```typescript
// Emitted by AgentSession during compaction lifecycle
type AgentSessionEvent = 
    | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
    | { type: "compaction_end"; reason: "manual" | "threshold" | "overflow";
        result: CompactionResult | undefined; aborted: boolean;
        willRetry: boolean; errorMessage?: string; }
```

---

## Exported Utility Functions

All exported from `@mariozechner/pi-coding-agent`:

| Export | Description |
|--------|-------------|
| `compact(preparation, model, apiKey, headers?, customInstructions?, signal?, thinkingLevel?)` | Core compaction function |
| `prepareCompaction(pathEntries, settings)` | Prepare entries for compaction |
| `shouldCompact(contextTokens, contextWindow, settings)` | Check if compaction should trigger |
| `findCutPoint(entries, startIdx, endIdx, keepRecentTokens)` | Find optimal cut point |
| `findTurnStartIndex(entries, entryIdx, startIdx)` | Find turn-starting entry |
| `calculateContextTokens(usage)` | Compute total tokens from usage |
| `estimateTokens(message)` | Estimate tokens using chars/4 heuristic |
| `estimateContextTokens(messages)` | Estimate context tokens from messages |
| `getLastAssistantUsage(entries)` | Find last non-aborted assistant usage |
| `serializeConversation(messages)` | Serialize messages to text for summarization |
| `generateSummary(messages, model, reserveTokens, apiKey, headers?, signal?, customInstructions?, previousSummary?, thinkingLevel?)` | Generate summary directly |
| `convertToLlm(messages)` | Convert AgentMessage[] to Message[] |
| `DEFAULT_COMPACTION_SETTINGS` | Default settings constant |
| `SUMMARIZATION_SYSTEM_PROMPT` | System prompt for summarization |

---

## Branch Summarization (Related Feature)

Pi also supports **branch summarization** when navigating the session tree with `/tree`. This is a sibling of compaction:

| Mechanism | Trigger | Purpose |
|-----------|---------|---------|
| **Compaction** | Context exceeds threshold, or `/compact` | Summarize old messages to free context |
| **Branch summarization** | `/tree` navigation | Preserve context when switching branches |

The same extension event pattern exists:
- `session_before_tree` — can cancel navigation or provide custom summary
- `session_tree` — fired after navigation with `BranchSummaryEntry`

---

## Practical Examples

### Example 1: Trigger compaction from SDK code

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession();

// Check context usage
const usage = session.getContextUsage();
console.log(`Context: ${usage?.tokens ?? "?"} / ${usage?.contextWindow} tokens`);
// → "Context: 185000 / 200000 tokens"

// Trigger compaction
const result = await session.compact("Focus on the authentication refactoring");
console.log(`Compacted from ${result.tokensBefore} tokens`);
// → "Compacted from 150000 tokens"

// Check context usage after
const usageAfter = session.getContextUsage();
console.log(`Context: ${usageAfter?.tokens} / ${usageAfter?.contextWindow} tokens`);
// → "Context: 45000 / 200000 tokens"
```

### Example 2: Extension that compacts on demand with a slash command

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
    pi.registerCommand("summarize", {
        description: "Compact context with optional focus instructions",
        handler: async (args, ctx) => {
            const focus = args.trim() || undefined;

            ctx.ui.notify(
                focus
                    ? `Compacting with focus: "${focus}"...`
                    : "Compacting context...",
                "info"
            );

            ctx.compact({
                customInstructions: focus,
                onComplete: (result) => {
                    ctx.ui.notify(
                        `Compacted ${result.tokensBefore.toLocaleString()} tokens. Summary: ${result.summary.substring(0, 80)}...`,
                        "info"
                    );
                },
                onError: (error) => {
                    ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
                },
            });
        },
    });
}
```

### Example 3: Extension that auto-compacts at a custom threshold

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const CUSTOM_COMPACT_THRESHOLD = 80_000; // compact at 80k tokens

export default function (pi: ExtensionAPI) {
    pi.on("turn_end", (_event, ctx) => {
        const usage = ctx.getContextUsage();
        const tokens = usage?.tokens;

        if (tokens && tokens > CUSTOM_COMPACT_THRESHOLD) {
            ctx.ui.notify(
                `Context at ${tokens.toLocaleString()} tokens — compacting...`,
                "info"
            );
            ctx.compact();
        }
    });
}
```

### Example 4: Listen for compaction events on AgentSession

```typescript
const { session } = await createAgentSession();

session.subscribe((event) => {
    if (event.type === "compaction_start") {
        console.log(`Compaction started (reason: ${event.reason})`);
    }
    if (event.type === "compaction_end") {
        if (event.result) {
            console.log(`Compaction done: ${event.result.tokensBefore} → summary`);
        } else if (event.aborted) {
            console.log("Compaction was aborted");
        }
    }
});
```

---

## Summary: Answering "Is There a Way to Compress Context on Demand?"

**Yes, absolutely.** There are three distinct APIs:

| Method | Where | Blocking | Custom Instructions |
|--------|-------|----------|---------------------|
| `session.compact(instructions?)` | SDK (AgentSession) | ✅ Returns Promise\<CompactionResult\> | ✅ String param |
| `ctx.compact(options?)` | Extension context | ❌ Fire-and-forget (callbacks) | ✅ In CompactOptions |
| `/compact [instructions]` | Interactive mode (CLI) | ✅ Built-in slash command | ✅ CLI args |
| `session_before_compact` event | Extension interception | ✅ Async handler | ✅ In preparation |

Plus auto-compaction works automatically based on settings.

The `getContextUsage()` method (available on both `AgentSession` and `ExtensionContext`) lets you monitor context usage programmatically before deciding to compact.

The `serializeConversation()` and `convertToLlm()` utilities let you generate custom summaries with your own model if you intercept `session_before_compact`.

---

## Quick Reference: Full Compaction Call Chain

```
User/Code triggers compaction
    │
    ▼
session.compact() / ctx.compact() / /compact / auto-threshold
    │
    ▼
prepareCompaction()  — calculates cut point, tokensBefore, etc.
    │
    ▼
session_before_compact event  ← Extensions can cancel or provide custom summary
    │
    ▼
compact()  — calls LLM to summarize, returns CompactionResult
    │
    ▼
SessionManager saves CompactionEntry
    │
    ▼
session_compact event  ← Extensions notified of result
    │
    ▼
Session reloads with summary + recent messages
```
