# ChatScreen

> **Source file**: `screens/chat.py`
> **Purpose**: The main screen that composes the layout and orchestrates everything. Owns the `APIClient`, manages the input field, handles key bindings, and runs the stream-response worker loop.

---

## 1. Screen Layout

```
ChatScreen
├── ChatLog          (#chat-log)        — scrollable message list
└── Horizontal       (#status-bar)      — bottom bar, height: 3
    ├── Static       (#status-dot)      — connection indicator "⬤"
    └── Input        (#chat-input)      — message input field
```

Composed via `compose()`:

```python
def compose(self):
    yield ChatLog(id="chat-log")
    with Horizontal(id="status-bar"):
        yield Static("⬤", id="status-dot")
        yield Input(
            placeholder="Type a message...",
            id="chat-input",
            disabled=True,   # Enabled only after /setAgent succeeds
        )
```

---

## 2. Internal State

```python
class ChatScreen(Screen):
    def __init__(self):
        ...
        self.api = APIClient()
        self._stream_worker: Worker | None = None
        self._is_connected: bool = False
```

| Field | Type | Purpose |
|---|---|---|
| `api` | `APIClient` | HTTP client, created once per screen lifetime |
| `_stream_worker` | `Worker \| None` | Reference to the active streaming worker (for cancellation) |
| `_is_connected` | `bool` | Tracks whether `/setAgent` succeeded |

---

## 3. Status Dot States

```
[green]⬤[/]    ← connected (/setAgent succeeded)
[red]⬤[/]      ← disconnected (/setAgent failed)
⬤              ← initial (before mount, no color applied)
```

Updated via `dot.update(rich_markup_string)` where the markup string includes Rich color tags.

---

## 4. Input Field States

| Phase | `disabled` | User Can Type? |
|---|---|---|
| Before `/setAgent` completes | `True` | No |
| After successful `/setAgent` | `False` | Yes |
| During streaming | `True` | No |
| After stream ends (done/error/abort) | `False` | Yes |
| After `/setAgent` failure | `True` | No (permanently, until app restart) |

---

## 5. Full Implementation

```python
"""Chat screen — main TUI screen for the chat interface."""

import asyncio
from textual.screen import Screen
from textual.widgets import Static, Input
from textual.containers import Horizontal
from textual.worker import Worker
from textual import events

from client.api import APIClient
from widgets.chat_log import ChatLog


class ChatScreen(Screen):
    """Main chat screen. Orchestrates layout, input, streaming, and abort."""

    def __init__(self) -> None:
        super().__init__()
        self.api = APIClient()
        self._stream_worker: Worker | None = None
        self._is_connected: bool = False

    # ── Lifecycle ───────────────────────────────────────────

    def compose(self):
        """Build the widget tree."""
        yield ChatLog(id="chat-log")
        with Horizontal(id="status-bar"):
            yield Static("⬤", id="status-dot")
            yield Input(
                placeholder="Type a message...",
                id="chat-input",
                disabled=True,
            )

    async def on_mount(self) -> None:
        """Connect to agent on mount."""
        await self._connect_to_agent()
        inp = self.query_one("#chat-input", Input)
        if not inp.disabled:
            inp.focus()

    # ── Connection ──────────────────────────────────────────

    async def _connect_to_agent(self) -> None:
        """Call /setAgent and update UI accordingly."""
        dot = self.query_one("#status-dot", Static)
        inp = self.query_one("#chat-input", Input)
        chat_log = self.query_one(ChatLog)

        try:
            await self.api.set_agent()
            self._is_connected = True
            dot.update("[green]⬤[/]")
            inp.disabled = False
            inp.focus()
        except Exception as e:
            self._is_connected = False
            dot.update("[red]⬤[/]")
            chat_log.add_error(f"Could not connect to agent: {e}")

    # ── Input Handling ──────────────────────────────────────

    async def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle Enter press in the input field."""
        text = event.value.strip()
        if not text:
            return

        inp = self.query_one("#chat-input", Input)
        chat_log = self.query_one(ChatLog)

        inp.value = ""            # Clear immediately (feels responsive)
        inp.disabled = True       # Block during streaming

        chat_log.add_user_message(text)
        chat_log.show_thinking()

        self._stream_worker = self.run_worker(
            self._stream_response(text),
            exclusive=False,
            group="stream",
        )

    # ── Keyboard Shortcuts ──────────────────────────────────

    def on_key(self, event: events.Key) -> None:
        """Handle global key presses. Escape → abort stream."""
        if event.key == "escape":
            self._abort_stream()
            event.prevent_default()

    # ── Streaming ───────────────────────────────────────────

    async def _stream_response(self, user_message: str) -> None:
        """Consume the SSE stream and update chat log.

        Runs as a Textual worker. Can be cancelled via worker.cancel().
        """
        chat_log = self.query_one(ChatLog)
        inp = self.query_one("#chat-input", Input)

        try:
            first_token = True
            async for token in self.api.run(user_message):
                if token == "[DONE]":
                    chat_log.finish_agent_stream()
                    return

                if first_token:
                    chat_log.remove_thinking()
                    chat_log.add_agent_bubble(token)
                    first_token = False
                else:
                    chat_log.append_token(token)

        except asyncio.CancelledError:
            # Worker cancelled (user pressed Escape)
            # The HTTP abort was already sent in _abort_stream()
            chat_log.remove_thinking()
            chat_log.append_to_last_agent(" ⚠️ Cancelled")

        except Exception as e:
            chat_log.remove_thinking()
            chat_log.add_error(str(e))

        finally:
            inp.disabled = False
            inp.focus()
            self._stream_worker = None

    def _abort_stream(self) -> None:
        """Abort the current stream (Escape key handler)."""
        worker = self._stream_worker
        if worker is None or worker.is_finished:
            return

        # Fire-and-forget: send HTTP abort, ignore errors
        asyncio.ensure_future(self.api.abort())

        # Cancel the worker → CancelledError in _stream_response
        worker.cancel()
```

---

## 6. Worker Lifecycle

```
on_input_submitted()
  │
  └─► self._stream_worker = self.run_worker(
        self._stream_response(text),
        exclusive=False,    # Allow worker to be spawned (input is blocked anyway)
        group="stream",     # Named group for potential future mass-cancel
      )

  ... worker runs, streaming tokens ...

  Normal end:  token == "[DONE]" → return → finally block
  Abort:       worker.cancel()   → CancelledError → except block → finally block
  Error:       Exception in loop → except block → finally block

  finally:
    inp.disabled = False
    inp.focus()
    self._stream_worker = None
```

---

## 7. Concurrency Guarantees

| Guarantee | How |
|---|---|
| Only one stream at a time | `inp.disabled = True` blocks new submissions |
| Stream can be cancelled | `worker.cancel()` raises `CancelledError` in the coroutine |
| HTTP abort is non-blocking | `asyncio.ensure_future()` — fire-and-forget |
| UI mutations are thread-safe | Textual runs everything on a single async thread |
| Input always re-enabled | `finally` block runs regardless of exit path |

---

## 8. Edge Cases

| Scenario | Behavior |
|---|---|
| Empty input submitted | `if not text: return` — nothing happens |
| Escape pressed with no active stream | `_stream_worker is None` → `_abort_stream()` returns early |
| Escape pressed after stream already finished | `worker.is_finished` → returns early |
| `/setAgent` fails on mount | Red dot, error bubble, input stays disabled |
| Multiple rapid Escape presses | Second press is no-op (worker already cancelled/None) |
| Server returns error during stream | Caught by `except Exception`, error bubble shown |
