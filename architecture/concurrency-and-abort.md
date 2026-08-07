# Concurrency & Abort Model

> **Purpose**: Detailed specification of the concurrency model, the abort flow triggered by Escape, and end-to-end sequence diagrams.

---

## 1. Concurrency Rules

| Rule | Enforcement |
|---|---|
| **Only one stream at a time** | `input.disabled = True` while streaming |
| **No message queuing** | Input is blocked, not queued |
| **Stream can be cancelled** | Escape → `worker.cancel()` + HTTP abort |
| **UI mutations are single-threaded** | Textual runs everything on one async event loop |
| **No locks needed** | No shared mutable state between concurrent tasks |

---

## 2. Abort Sequence (Escape Key)

### Step-by-step

```
1. User presses Escape
2. ChatScreen.on_key() catches the event
3. _abort_stream() is called:
   a. Checks: is there an active worker? If not, return.
   b. Fire-and-forget: asyncio.ensure_future(api.abort())
        → POST /abort (errors swallowed by APIClient)
   c. worker.cancel()
        → asyncio.CancelledError raised inside _stream_response()
4. Inside _stream_response(), except CancelledError:
   a. chat_log.remove_thinking()      # clean up spinner
   b. chat_log.append_to_last_agent(" ⚠️ Cancelled")  # mark partial
5. finally block (always runs):
   a. input.disabled = False
   b. input.focus()
   c. self._stream_worker = None
```

### Why Two Mechanisms?

| Mechanism | Purpose |
|---|---|
| `api.abort()` (HTTP) | Tells the server to stop generating tokens |
| `worker.cancel()` (asyncio) | Stops the local async generator loop |

Both are needed: the HTTP abort stops the server-side work, and the worker cancel stops the client-side consumption. The HTTP abort is fire-and-forget because we don't need to wait for it — the worker cancel immediately stops processing.

---

## 3. Sequence Diagrams

### 3.1 Happy Path: Send → Receive → Done

```
User          ChatScreen              ChatLog           APIClient        Server
 │               │                       │                  │               │
 │  "Hello"⏎    │                       │                  │               │
 │──────────────►│                       │                  │               │
 │               │ add_user_message()    │                  │               │
 │               │──────────────────────►│ (blue bubble)    │               │
 │               │ show_thinking()       │                  │               │
 │               │──────────────────────►│ (spinner starts) │               │
 │               │ input.disabled=True   │                  │               │
 │               │                       │                  │               │
 │               │ run_worker(_stream) ─────────────────────►│               │
 │               │                       │                  │ POST /run     │
 │               │                       │                  │──────────────►│
 │               │                       │                  │               │
 │               │                       │                  │  data: Hi     │
 │               │                       │                  │◄──────────────│
 │               │◄── token="Hi" ────────│                  │               │
 │               │ remove_thinking()     │                  │               │
 │               │──────────────────────►│ (spinner gone)   │               │
 │               │ add_agent_bubble("Hi")│                  │               │
 │               │──────────────────────►│ (green "Hi▍")    │               │
 │               │                       │                  │               │
 │               │                       │                  │  data:  there │
 │               │                       │                  │◄──────────────│
 │               │◄── token=" there" ────│                  │               │
 │               │ append_token(" there")│                  │               │
 │               │──────────────────────►│ ("Hi there▍")    │               │
 │               │                       │                  │               │
 │               │                       │                  │  data: [DONE] │
 │               │                       │                  │◄──────────────│
 │               │◄── token="[DONE]" ────│                  │               │
 │               │ finish_agent_stream() │                  │               │
 │               │──────────────────────►│ ("Hi there")     │               │
 │               │ input.disabled=False  │                  │               │
 │◄── can type   │                       │                  │               │
```

### 3.2 Abort Flow

```
User          ChatScreen              ChatLog           APIClient        Server
 │               │                       │                  │               │
 │  (streaming)  │                       │                  │  data: some   │
 │               │◄── token="some" ──────│                  │◄──────────────│
 │               │                       │                  │               │
 │  Escape       │                       │                  │               │
 │──────────────►│                       │                  │               │
 │               │ _abort_stream()       │                  │               │
 │               │                       │                  │               │
 │               │── ensure_future ──────│                  │               │
 │               │     (api.abort())     │                  │ POST /abort   │
 │               │                       │                  │──────────────►│
 │               │                       │                  │               │
 │               │ worker.cancel()       │                  │               │
 │               │   (CancelledError)    │                  │               │
 │               │                       │                  │               │
 │               │ remove_thinking()     │                  │               │
 │               │──────────────────────►│                  │               │
 │               │ append_to_last_agent  │                  │               │
 │               │  (" ⚠️ Cancelled")    │                  │               │
 │               │──────────────────────►│ ("some ⚠️ ...")  │               │
 │               │ input.disabled=False  │                  │               │
 │◄── can type   │                       │                  │               │
```

### 3.3 Connection Error on Mount

```
User          ChatScreen              ChatLog           APIClient        Server
 │               │                       │                  │               │
 │               │ on_mount()            │                  │               │
 │               │ _connect_to_agent()   │                  │               │
 │               │                       │                  │ POST /setAgent │
 │               │                       │                  │──────────────►│
 │               │                       │                  │               │
 │               │                       │                  │ 503 / timeout │
 │               │                       │                  │◄──────────────│
 │               │                       │                  │               │
 │               │ add_error("Could not │                  │               │
 │               │   connect to agent") │                  │               │
 │               │──────────────────────►│ (red bubble)     │               │
 │               │ dot → [red]⬤[/]      │                  │               │
 │               │ input stays disabled │                  │               │
 │               │                       │                  │               │
 │◄── sees error  │                       │                  │               │
 │    & red dot   │                       │                  │               │
```

### 3.4 SSE Stream Error Mid-Response

```
User          ChatScreen              ChatLog           APIClient        Server
 │               │                       │                  │               │
 │  (streaming)  │                       │                  │  data: some   │
 │               │◄── token="some" ──────│                  │◄──────────────│
 │               │                       │                  │               │
 │               │                       │                  │ ✕ connection  │
 │               │                       │                  │    dropped     │
 │               │                       │                  │               │
 │               │◄── Exception ─────────│                  │               │
 │               │                       │                  │               │
 │               │ remove_thinking()     │                  │               │
 │               │──────────────────────►│                  │               │
 │               │ add_error(str(e))     │                  │               │
 │               │──────────────────────►│ (red bubble)     │               │
 │               │ input.disabled=False  │                  │               │
 │◄── can type   │                       │                  │               │
 │               │                       │                  │               │
 │  Note: partial "some" in agent bubble stays visible       │               │
```

---

## 4. Thread Safety Analysis

Textual runs the entire application on a **single asyncio event loop**. This means:

- All widget mutations happen on the same thread
- No race conditions between UI updates
- `worker.cancel()` and `asyncio.ensure_future()` are both async-safe
- No `threading.Lock`, `asyncio.Lock`, or any synchronization primitives needed

The only "concurrent" activity is the SSE stream consumption, which is an async generator iterated within the worker. Cancellation is cooperative (via `CancelledError` at `await` points).

---

## 5. Graceful Degradation

| What happens | UI State After |
|---|---|
| Stream completes normally | Agent bubble without cursor, input enabled |
| User aborts stream | Agent bubble with " ⚠️ Cancelled" suffix, input enabled |
| Server drops connection mid-stream | Partial agent text stays + error bubble, input enabled |
| Server returns HTTP error | Error bubble, input enabled |
| Server unreachable on mount | Red dot + error bubble, input stays disabled |
