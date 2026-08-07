# Implementation Plan

> **Purpose**: Build order, error handling matrix, and explicit scope boundaries.
> Use this to decompose into sprint tasks.

---

## 1. Build Order

Each step produces a **testable increment**. Steps are ordered by dependency.

| Step | Files to Create | What You Can Test | Depends On |
|---|---|---|---|
| **1. Data Models** | `models/message.py`, `models/__init__.py` | Import `Message`, `Role`; instantiate and inspect | Nothing |
| **2. API Client** | `client/api.py`, `client/__init__.py` | Run against a real or mock server; test all 3 endpoints | Step 1 |
| **3. Message Bubble** | `widgets/message.py`, `widgets/__init__.py` | Mount in a minimal Textual app; verify all 4 role renderings | Step 1 |
| **4. ChatLog** | `widgets/chat_log.py` | Mount ChatLog in a test app; call public API methods; verify bubbles appear/update/remove | Steps 1, 3 |
| **5. CSS** | `app.tcss` | Apply to the test app from step 4; visual check of all bubble variants | Step 4 |
| **6. ChatScreen** | `screens/chat.py` (create `screens/` dir) | Manual smoke test: connect, send message, receive response | Steps 2, 4 |
| **7. App Entry** | `app.py` | Full `python app.py` run | Step 6 |
| **8. Polish** | All files | Edge case testing: abort, connection error, rapid input | Step 7 |

### Dependency Graph

```
Step 1 (models)
  ├─► Step 2 (api client) ─────────────────────────────┐
  ├─► Step 3 (message bubble) ──► Step 4 (chat log) ───┼─► Step 6 (screen) ──► Step 7 (app)
                                       │                │
                                       └─► Step 5 (css) ┘
```

Steps 4 and 5 can be done in parallel after Step 3.

---

## 2. File Creation Checklist

```
[ ] models/__init__.py         # Re-exports Message, Role
[ ] models/message.py          # Role enum + Message dataclass
[ ] client/__init__.py         # Empty
[ ] client/api.py              # APIClient class
[ ] widgets/__init__.py        # Empty
[ ] widgets/message.py         # MessageBubble widget
[ ] widgets/chat_log.py        # ChatLog widget
[ ] screens/chat.py            # ChatScreen (create screens/ dir)
[ ] app.tcss                   # Full stylesheet
[ ] app.py                     # Entry point
```

---

## 3. Error Handling Matrix

Every error scenario and its expected UI behavior:

| # | Scenario | Detection Point | UI Action | Input After |
|---|---|---|---|---|
| E1 | `/setAgent` fails on mount | `_connect_to_agent()` except block | Red dot `[red]⬤[/]` + error bubble: `"Could not connect to agent: {e}"` | Stays disabled |
| E2 | `/run` HTTP 4xx/5xx | `response.raise_for_status()` in `api.run()` | Remove thinking + error bubble: `"Server error ({code})"` | Re-enabled |
| E3 | `/run` connection refused | `httpx.ConnectError` | Remove thinking + error bubble: `"Connection failed"` | Re-enabled |
| E4 | SSE stream drops mid-response | Exception in `async for token` loop | Partial agent text stays visible + error bubble: `"{exception}"` | Re-enabled |
| E5 | User presses Escape during stream | `on_key()` → `_abort_stream()` | Remove thinking + append `" ⚠️ Cancelled"` to agent bubble | Re-enabled |
| E6 | Empty input submitted | `if not text: return` | Nothing | — |
| E7 | Server returns non-SSE content type | `aiter_lines()` parsing | Likely garbled tokens or exception → error bubble | Re-enabled |

### Error Recovery Strategy

| After Error | Can User Retry? | How? |
|---|---|---|
| E1 (mount failure) | No (current scope) | App must be restarted |
| E2–E4 (stream errors) | Yes | Input re-enabled; user can send another message |
| E5 (abort) | Yes | Input re-enabled immediately |
| E6 (empty input) | N/A | Nothing happened |

---

## 4. Scope Boundaries

These items are **intentionally excluded** from the current implementation scope:

| Item | Status | Rationale |
|---|---|---|
| Configurable server URL | ❌ Out | Hardcoded `localhost:8080` |
| Message persistence / history | ❌ Out | Ephemeral only (in-memory) |
| Markdown rendering in bubbles | ❌ Out | Plain text only |
| Typewriter delay effect | ❌ Out | Tokens appear instantly |
| New conversation / reset button | ❌ Out | Single session per app run |
| Message timestamps | ❌ Out | Not in current scope |
| CLI flags / env vars | ❌ Out | No configuration needed |
| Auto-retry on connection failure | ❌ Out | Fail fast |
| App shutdown hook (`api.close()`) | ❌ Out | httpx cleanup is implicit on process exit |
| Unit / integration tests | ❌ Out | Separate testing spec |
| Multiple agent support | ❌ Out | Single hardcoded endpoint |

---

## 5. Suggested Task Breakdown (for Scrum)

### Sprint 1: Foundation (Steps 1–2)
- **T1.1**: Create `models/message.py` with `Role` enum and `Message` dataclass
- **T1.2**: Create `models/__init__.py` with re-exports
- **T1.3**: Create `client/api.py` with `APIClient` class (3 methods)
- **T1.4**: Create `client/__init__.py`
- **T1.5**: Manual test of APIClient against running server

### Sprint 2: Widgets (Steps 3–5)
- **T2.1**: Create `widgets/message.py` with `MessageBubble`
- **T2.2**: Create `widgets/__init__.py`
- **T2.3**: Create `widgets/chat_log.py` with `ChatLog`
- **T2.4**: Create `app.tcss` with all styles
- **T2.5**: Integration test: ChatLog + CSS in a test app

### Sprint 3: Screen & App (Steps 6–7)
- **T3.1**: Create `screens/chat.py` with `ChatScreen`
- **T3.2**: Create `app.py` with `BendersApp`
- **T3.3**: Full integration smoke test

### Sprint 4: Polish (Step 8)
- **T4.1**: Test abort flow (Escape during streaming)
- **T4.2**: Test connection error on mount
- **T4.3**: Test SSE stream drop mid-response
- **T4.4**: Test smart scroll (scroll up + new message)
- **T4.5**: Test rapid input / edge cases

---

## 6. Quick Reference — All Method Signatures

### `APIClient` (`client/api.py`)
```
async set_agent() → None
async run(message: str) → AsyncGenerator[str, None]
async abort() → None
async close() → None
```

### `ChatLog` (`widgets/chat_log.py`)
```
add_user_message(text: str) → None
show_thinking() → None
remove_thinking() → None
add_agent_bubble(first_token: str) → None
append_token(token: str) → None
finish_agent_stream() → None
append_to_last_agent(suffix: str) → None
add_error(text: str) → None
```

### `MessageBubble` (`widgets/message.py`)
```
__init__(message: Message) → None
update_message(message: Message) → None
```

### `ChatScreen` (`screens/chat.py`)
```
compose() → ComposeResult
async on_mount() → None
async on_input_submitted(event: Input.Submitted) → None
on_key(event: events.Key) → None
async _stream_response(user_message: str) → None
_abort_stream() → None
async _connect_to_agent() → None
```
