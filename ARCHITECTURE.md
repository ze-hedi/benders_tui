# Benders TUI — Implementation Architecture Spec

> **Purpose**: Implementation-ready specification for planner/scrum agents.
> Every file, class, and method is detailed enough to be directly translated into code.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [File Tree & Responsibilities](#2-file-tree--responsibilities)
3. [File Spec: `app.py`](#3-file-spec-apppy)
4. [File Spec: `app.tcss`](#4-file-spec-apptcss)
5. [File Spec: `models/message.py`](#5-file-spec-modelsmessagepy)
6. [File Spec: `client/api.py`](#6-file-spec-clientapipy)
7. [File Spec: `widgets/message.py`](#7-file-spec-widgetsmessagepy)
8. [File Spec: `widgets/chat_log.py`](#8-file-spec-widgetschat_logpy)
9. [File Spec: `screens/chat.py`](#9-file-spec-screenschatpy)
10. [Concurrency & Abort Model](#10-concurrency--abort-model)
11. [End-to-End Sequence Diagrams](#11-end-to-end-sequence-diagrams)
12. [Error Handling Matrix](#12-error-handling-matrix)
13. [Implementation Order](#13-implementation-order)

---

## 1. Project Overview

**Benders TUI** is a terminal chat client that connects to a local agent server (`localhost:8080`). It streams responses via SSE and renders color-coded message bubbles in the terminal using the [Textual](https://textual.textualize.io/) framework.

### Design Principles

| # | Principle |
|---|---|
| P1 | **Terminal-native** — No rounded blocks, use Textual's `border: round` for `╭╮╰╯` glyphs |
| P2 | **Role communicated by position + color** — No text labels like "User:" or "Agent:" |
| P3 | **Single source of truth** — `Message` dataclass drives all bubble rendering |
| P4 | **Smart scroll** — Auto-scroll only when user is at the bottom |
| P5 | **Input blocked during streaming** — No queue, just block + allow cancel |

### Tech Stack

| Component | Library |
|---|---|
| TUI Framework | `textual >= 0.50.0` |
| HTTP/SSE Client | `httpx >= 0.27.0` |
| Async | `asyncio` (stdlib) |
| Data | `dataclasses`, `enum` (stdlib) |

### Configuration

- Server URL: **hardcoded** `http://localhost:8080`
- No CLI flags, no env vars, no config files (for now)

### API Contract

| Method | Endpoint | Request Body | Response | Notes |
|---|---|---|---|---|
| `POST` | `/setAgent` | *(empty)* | `{"ok": true}` | Called on app mount. Failure → red dot + error bubble |
| `POST` | `/run` | `{"message": "..."}` | `text/event-stream` | SSE: `data: <token>\n\n`, ends with `data: [DONE]\n\n` |
| `POST` | `/abort` | *(empty)* | *(any)* | Best-effort. Called when user presses Escape during streaming |

---

## 2. File Tree & Responsibilities

```
benders_tui/
├── app.py                  # Textual App entry point, CSS mounting, screen push
├── app.tcss                # All CSS: design tokens, layout, bubble variants, status bar
├── screens/
│   └── chat.py             # ChatScreen: orchestration, input/routing, stream lifecycle
├── widgets/
│   ├── __init__.py          # Empty
│   ├── chat_log.py          # ChatLog: VerticalScroll, bubble CRUD, thinking animation, auto-scroll
│   └── message.py           # MessageBubble: Static subclass, role-based CSS, cursor rendering
├── client/
│   ├── __init__.py          # Empty
│   └── api.py               # APIClient: httpx async client, setAgent, SSE streaming, abort
├── models/
│   ├── __init__.py          # Empty  (Re-exports: from models.message import Message, Role)
│   └── message.py           # Role enum + Message dataclass
├── ARCHITECTURE.md          # This document
└── VISION.md                # Original brainstorming artifact
```

### Dependency Graph

```
app.py
  └─► screens/chat.py
        ├─► widgets/chat_log.py
        │     └─► widgets/message.py
        │           └─► models/message.py
        └─► client/api.py
```

### Key: Who Owns What?

| Concern | Owner |
|---|---|
| App lifecycle, CSS | `app.py` |
| All layout/styling | `app.tcss` |
| Bubble visual rendering | `widgets/message.py` — `MessageBubble` |
| Bubble list management, scrolling, thinking animation | `widgets/chat_log.py` — `ChatLog` |
| User input, stream orchestration, abort, error routing | `screens/chat.py` — `ChatScreen` |
| HTTP communication, SSE parsing | `client/api.py` — `APIClient` |
| Data structures | `models/message.py` |

---

## 3. File Spec: `app.py`

### Purpose
Entry point. Creates the Textual `App`, loads CSS, pushes `ChatScreen`.

### Full Implementation

```python
"""
Benders TUI — Terminal chat client for the Benders agent.
"""

from textual.app import App
from screens.chat import ChatScreen


class BendersApp(App):
    """Main TUI application."""

    CSS_PATH = "app.tcss"

    def on_mount(self) -> None:
        """Push the chat screen on mount."""
        self.push_screen(ChatScreen())


def main() -> None:
    """Entry point."""
    app = BendersApp()
    app.run()


if __name__ == "__main__":
    main()
```

### Key Details
- `CSS_PATH = "app.tcss"` — Textual resolves this relative to `app.py`'s location
- `on_mount()` is the Textual lifecycle hook called after the app is ready
- `push_screen()` makes `ChatScreen` the active screen (only screen in this app)
- No command-line argument parsing needed

---

## 4. File Spec: `app.tcss`

### Purpose
All visual styling: design tokens, screen layout, bubble variants, status bar, input field.

### Full Implementation

```css
/* ═══════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════ */

$accent:         #60A5FA;   /* blue    — user bubbles        */
$success:        #34D399;   /* green   — agent bubbles       */
$text-disabled:  #6B7280;   /* grey    — thinking bubble     */
$error:          #F87171;   /* red     — error bubbles       */
$surface:        #1F2937;   /* dark    — bubble background   */
$background:     #111827;   /* darker  — screen background   */
$text:           #E5E7EB;   /* light   — default text color  */
$text-muted:     #9CA3AF;   /* muted   — placeholder text    */

/* ═══════════════════════════════════════════
   SCREEN LAYOUT
   ═══════════════════════════════════════════ */

ChatScreen {
    background: $background;
    color: $text;
}

/* ═══════════════════════════════════════════
   CHAT LOG (scrollable message area)
   ═══════════════════════════════════════════ */

#chat-log {
    height: 1fr;
    padding: 1 2;
    scrollbar-size: 1 0;
    scrollbar-color: $text-disabled;
}

/* ═══════════════════════════════════════════
   STATUS BAR (bottom)
   ═══════════════════════════════════════════ */

#status-bar {
    height: 3;
    dock: bottom;
    background: $surface;
    padding: 0 2;
    border-top: solid $text-disabled;
}

#status-dot {
    width: 3;
    content-align: center middle;
    text-style: bold;
}

#chat-input {
    width: 1fr;
    margin: 0 0 0 1;
}

#chat-input > .input--placeholder {
    color: $text-muted;
}

/* ═══════════════════════════════════════════
   BUBBLE VARIANTS
   ═══════════════════════════════════════════ */

/* --- User Bubble (blue, right-aligned) --- */
.user-bubble {
    border: round $accent;
    width: 80%;
    align-horizontal: right;
    padding: 1 2;
    margin: 1 0;
    color: $text;
    background: $surface;
}

/* --- Agent Bubble (green, left-aligned) --- */
.agent-bubble {
    border: round $success;
    width: 80%;
    align-horizontal: left;
    padding: 1 2;
    margin: 1 0;
    color: $text;
    background: $surface;
}

/* --- Thinking Bubble (dimmed, animated, narrow) --- */
.thinking-bubble {
    border: dashed $text-disabled;
    width: 40%;
    align-horizontal: left;
    padding: 1 2;
    margin: 1 0;
    color: $text-disabled;
    background: $surface;
}

/* --- Error Bubble (red, centered) --- */
.error-bubble {
    border: round $error;
    width: 80%;
    align-horizontal: center;
    padding: 1 2;
    margin: 1 0;
    color: $error;
    background: $surface;
    text-style: italic;
}
```

### Key Details

| Token | Usage |
|---|---|
| `$accent` | User bubble borders |
| `$success` | Agent bubble borders + connected status dot |
| `$text-disabled` | Thinking bubble borders + text |
| `$error` | Error bubble borders + text + disconnected status dot |
| `$surface` | Bubble background fill |
| `$background` | Screen background |
| `$text` | Default content color |

### Widget IDs (used in `self.query_one("#id")`)
- `#chat-log` → `ChatLog` widget
- `#status-bar` → `Horizontal` container
- `#status-dot` → `Static` (green/red dot)
- `#chat-input` → `Input` widget

### CSS Class-to-Role Mapping

| CSS Class | Border Style | Alignment | Width |
|---|---|---|---|
| `.user-bubble` | `round $accent` | right | 80% |
| `.agent-bubble` | `round $success` | left | 80% |
| `.thinking-bubble` | `dashed $text-disabled` | left | 40% |
| `.error-bubble` | `round $error` | center | 80% |

---

## 5. File Spec: `models/message.py`

### Purpose
Core data structures used throughout the app.

### Full Implementation

```python
"""Data models for chat messages."""

from dataclasses import dataclass
from enum import Enum, auto


class Role(Enum):
    """The role/source of a message bubble."""
    USER = auto()       # Sent by the user
    AGENT = auto()      # Response from the agent
    THINKING = auto()   # Latency gap before first token (animated spinner)
    ERROR = auto()      # System-level errors


@dataclass
class Message:
    """A single message in the chat log.

    Attributes:
        role: Who/what produced this message.
        content: The text content to display.
        is_streaming: If True, the agent bubble shows a blinking cursor (▍).
                      Only relevant for Role.AGENT.
    """
    role: Role
    content: str = ""
    is_streaming: bool = False
```

### Key Details
- `Role.USER` → maps to CSS class `.user-bubble`
- `Role.AGENT` → maps to CSS class `.agent-bubble`
- `Role.THINKING` → maps to CSS class `.thinking-bubble`
- `Role.ERROR` → maps to CSS class `.error-bubble`
- `is_streaming` is only meaningful for `Role.AGENT` (ignored for others)
- `Message` is immutable-ish (dataclass, no frozen) — callers create new instances for updates

### `models/__init__.py`

```python
"""Re-export core models for convenience."""
from models.message import Message, Role

__all__ = ["Message", "Role"]
```

---

## 6. File Spec: `client/api.py`

### Purpose
Async HTTP client wrapping the agent server's three endpoints. Handles SSE parsing.

### Full Implementation

```python
"""Async API client for the Benders agent server."""

from typing import AsyncGenerator
import httpx


class APIClient:
    """Async HTTP client for agent communication.

    Endpoints:
        POST /setAgent  — Initialize agent session
        POST /run       — Send message, receive SSE stream
        POST /abort     — Abort current stream
    """

    def __init__(self, base_url: str = "http://localhost:8080") -> None:
        """Initialize the API client.

        Args:
            base_url: Base URL of the agent server. Hardcoded default.
        """
        self._base_url = base_url.rstrip("/")
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazy-initialize and return the shared httpx client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=5.0,     # 5s to establish connection
                    read=None,       # No read timeout (SSE is long-lived)
                    write=5.0,       # 5s to send request body
                    pool=5.0,        # 5s to get connection from pool
                )
            )
        return self._client

    # ── Public API ──────────────────────────────────────────

    async def set_agent(self) -> None:
        """Initialize the agent session.

        Raises:
            httpx.HTTPStatusError: If server returns 4xx/5xx.
            httpx.ConnectError: If server is unreachable.
        """
        client = await self._get_client()
        response = await client.post(f"{self._base_url}/setAgent")
        response.raise_for_status()

    async def run(self, message: str) -> AsyncGenerator[str, None]:
        """Send a message and stream the SSE response token by token.

        Args:
            message: The user's message text.

        Yields:
            str: Each token from the SSE stream, including the sentinel "[DONE]".

        Raises:
            httpx.HTTPStatusError: If server returns 4xx/5xx on the POST.
            httpx.ConnectError: If server is unreachable.
            Exception: Any other network error during streaming.

        Wire format expected:
            data: Hello
            data:  world
            data: [DONE]
        """
        client = await self._get_client()
        async with client.stream(
            "POST",
            f"{self._base_url}/run",
            json={"message": message},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    token = line[6:]  # Strip "data: " prefix (6 chars)
                    yield token

    async def abort(self) -> None:
        """Send an abort request for the current stream.

        Best-effort: errors are silently ignored.
        This is called when the user presses Escape during streaming.
        """
        client = await self._get_client()
        try:
            await client.post(f"{self._base_url}/abort")
        except Exception:
            # Best-effort — don't propagate errors to the UI
            pass

    async def close(self) -> None:
        """Close the underlying httpx client. Call on app shutdown."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
```

### Key Details

**Timeout Strategy:**
| Phase | Timeout | Rationale |
|---|---|---|
| Connect | 5s | Quick failure detection if server is down |
| Read | None | SSE streams are long-lived, no read deadline |
| Write | 5s | Sending a message shouldn't hang |
| Pool | 5s | Connection pool wait |

**SSE Parsing:**
- Input lines: `data: <token>` or `data: [DONE]`
- Empty lines (heartbeats) are ignored
- Strips the `"data: "` prefix (6 characters)
- Yields raw tokens including `"[DONE]"` sentinel

**Error Propagation:**
- `set_agent()` — raises on failure, caller (ChatScreen) handles
- `run()` — raises on connection/HTTP errors; caller catches in the async for loop
- `abort()` — never raises, swallows all errors (best-effort)
- `close()` — call from app's shutdown hook (not yet implemented, but reserved)

---

## 7. File Spec: `widgets/message.py`

### Purpose
A `Static` widget subclass that renders a single message bubble. CSS classes are applied based on the `Message.role`. The widget does NOT manage its own content changes — the parent (`ChatLog`) calls `update_message()` which calls `self.update()`.

### Full Implementation

```python
"""Message bubble widget."""

from textual.widgets import Static
from models.message import Message, Role


class MessageBubble(Static):
    """A single chat bubble rendered as a bordered Static widget.

    CSS classes are applied on init based on message.role.
    Content is set via self.update() (Textual's built-in for Static).
    """

    # Role → CSS class mapping
    ROLE_TO_CLASS = {
        Role.USER: "user-bubble",
        Role.AGENT: "agent-bubble",
        Role.THINKING: "thinking-bubble",
        Role.ERROR: "error-bubble",
    }

    def __init__(self, message: Message) -> None:
        """Create a bubble for the given message.

        Args:
            message: The message data (role, content, streaming flag).
        """
        self.message = message
        super().__init__("")
        self._apply_role_class()
        self._render()

    # ── Initialization helpers ──────────────────────────────

    def _apply_role_class(self) -> None:
        """Set the CSS class based on the message's role."""
        css_class = self.ROLE_TO_CLASS.get(self.message.role, "")
        if css_class:
            self.set_classes(css_class)

    def _render(self) -> None:
        """Render the current message content into the widget.

        Applies role-specific prefixes/suffixes:
          - AGENT + streaming → appends blinking cursor "▍"
          - ERROR → prepends "⚠️ "
          - THINKING → formats as "Thinking... {content}" where content
            is the current spinner frame character.
        """
        content = self.message.content

        if self.message.role == Role.AGENT and self.message.is_streaming:
            content = content + "▍"
        elif self.message.role == Role.ERROR:
            content = f"⚠️ {content}"

        self.update(content)

    # ── Public API ──────────────────────────────────────────

    def update_message(self, message: Message) -> None:
        """Replace the underlying message and re-render.

        Called by ChatLog when:
          - Appending a token to a streaming agent bubble
          - Finishing the agent stream (is_streaming → False)
          - Updating the thinking spinner frame

        Args:
            message: The new message state (typically same role, updated content/streaming).
        """
        self.message = message
        self._render()
```

### Key Details

**Why `self.update()` instead of reactive attributes:**
- `Static` already provides `self.update(renderable)` which triggers a re-render
- No need for a reactive `content` attribute with a `watch` method — simpler and more direct
- The parent (ChatLog) owns the mutation timing

**Rendering Rules Matrix:**

| Role | Streaming? | Rendered Content |
|---|---|---|
| `USER` | (ignored) | `"{content}"` |
| `AGENT` | `False` | `"{content}"` |
| `AGENT` | `True` | `"{content}▍"` |
| `THINKING` | (ignored) | `"Thinking... {content}"` where `content` is spinner char |
| `ERROR` | (ignored) | `"⚠️ {content}"` |

**Edge Cases:**
- Creating a `MessageBubble` with an unknown `Role` → no CSS class applied, renders raw content
- Empty content string → bubble renders with just the cursor or prefix (mostly invisible)

---

## 8. File Spec: `widgets/chat_log.py`

### Purpose
A `VerticalScroll` container that manages the list of `MessageBubble` widgets. It owns the bubble lifecycle (add, update, remove) and the thinking spinner animation timer.

### Full Implementation

```python
"""Chat log widget — scrollable message list."""

from textual.containers import VerticalScroll
from textual.widgets import Static
from textual.timer import Timer
from models.message import Message, Role
from widgets.message import MessageBubble


# Spinner animation frames (braille dots cycle)
SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
SPINNER_INTERVAL = 0.08  # 80ms per frame (~12.5 fps)


class ChatLog(VerticalScroll):
    """Scrollable container for message bubbles.

    Manages:
      - Adding/removing bubbles
      - Thinking spinner animation (own timer)
      - Smart auto-scroll (only when user is at bottom)
      - Tracking the "current" agent bubble for streaming token appends
    """

    def __init__(self) -> None:
        super().__init__(id="chat-log")
        self._thinking_bubble: MessageBubble | None = None
        self._thinking_timer: Timer | None = None
        self._thinking_frame: int = 0
        self._current_agent_bubble: MessageBubble | None = None

    # ── Public API ──────────────────────────────────────────

    def add_user_message(self, text: str) -> None:
        """Append a right-aligned user bubble to the log.

        Args:
            text: The message text entered by the user.
        """
        msg = Message(role=Role.USER, content=text)
        bubble = MessageBubble(msg)
        self.mount(bubble)
        self._maybe_scroll()

    def show_thinking(self) -> None:
        """Append an animated thinking bubble and start the spinner.

        Called immediately after add_user_message(), before the SSE
        stream starts. The bubble shows a cycling braille spinner.
        """
        msg = Message(role=Role.THINKING, content=SPINNER_FRAMES[0])
        self._thinking_bubble = MessageBubble(msg)
        self.mount(self._thinking_bubble)
        self._thinking_frame = 0
        self._thinking_timer = self.set_interval(
            SPINNER_INTERVAL,
            self._animate_thinking,
        )
        self._maybe_scroll()

    def remove_thinking(self) -> None:
        """Remove the thinking bubble and stop its animation timer.

        Called when:
          - First SSE token arrives (transition to agent bubble)
          - An error occurs during streaming
          - Abort is triggered
        Safe to call even if no thinking bubble is present (no-op).
        """
        # Stop the timer
        if self._thinking_timer is not None:
            self._thinking_timer.stop()
            self._thinking_timer = None

        # Remove the bubble
        if self._thinking_bubble is not None:
            self._thinking_bubble.remove()
            self._thinking_bubble = None

    def add_agent_bubble(self, first_token: str) -> None:
        """Create and append a new agent bubble with the first SSE token.

        The bubble is created in streaming mode (cursor visible).
        A reference is kept as _current_agent_bubble for subsequent
        append_token() calls.

        Args:
            first_token: The first token from the SSE stream.
        """
        msg = Message(role=Role.AGENT, content=first_token, is_streaming=True)
        self._current_agent_bubble = MessageBubble(msg)
        self.mount(self._current_agent_bubble)
        self._maybe_scroll()

    def append_token(self, token: str) -> None:
        """Append a token to the current streaming agent bubble.

        Mutates the existing bubble in-place by creating a new Message
        with the accumulated content and calling update_message().

        Args:
            token: The next token from the SSE stream.
        """
        if self._current_agent_bubble is None:
            return  # Safety: no active agent bubble (shouldn't happen)

        accumulated = self._current_agent_bubble.message.content + token
        msg = Message(role=Role.AGENT, content=accumulated, is_streaming=True)
        self._current_agent_bubble.update_message(msg)
        self._maybe_scroll()

    def finish_agent_stream(self) -> None:
        """Mark the current agent bubble as done (remove cursor).

        Sets is_streaming=False, which causes the "▍" cursor to
        disappear on the next render.
        """
        if self._current_agent_bubble is None:
            return

        msg = Message(
            role=Role.AGENT,
            content=self._current_agent_bubble.message.content,
            is_streaming=False,
        )
        self._current_agent_bubble.update_message(msg)
        self._current_agent_bubble = None  # Release reference
        self._maybe_scroll()

    def append_to_last_agent(self, suffix: str) -> None:
        """Append a suffix string to the current agent bubble's content.

        Used for appending status notes like ' ⚠️ Cancelled' without
        creating a new bubble.

        Args:
            suffix: Text to append (e.g., " ⚠️ Cancelled").
        """
        if self._current_agent_bubble is None:
            return

        content = self._current_agent_bubble.message.content + suffix
        msg = Message(role=Role.AGENT, content=content, is_streaming=False)
        self._current_agent_bubble.update_message(msg)
        self._current_agent_bubble = None
        self._maybe_scroll()

    def add_error(self, text: str) -> None:
        """Append a centered error bubble.

        Also cleans up any orphaned thinking bubble.

        Args:
            text: Error description (will be prefixed with ⚠️ by MessageBubble).
        """
        self.remove_thinking()  # Clean up if present
        msg = Message(role=Role.ERROR, content=text)
        bubble = MessageBubble(msg)
        self.mount(bubble)
        self._maybe_scroll()

    # ── Internal ────────────────────────────────────────────

    def _animate_thinking(self) -> None:
        """Cycle the spinner frame in the thinking bubble.

        Called by the interval timer every 80ms.
        """
        if self._thinking_bubble is None:
            return

        self._thinking_frame = (self._thinking_frame + 1) % len(SPINNER_FRAMES)
        frame_char = SPINNER_FRAMES[self._thinking_frame]
        msg = Message(role=Role.THINKING, content=frame_char)
        self._thinking_bubble.update_message(msg)

    def _maybe_scroll(self) -> None:
        """Auto-scroll to bottom, but only if the user is already there.

        If the user has scrolled up to read history, new content
        won't yank them down. Built-in Textual property.
        """
        if self.is_vertical_scroll_end:
            self.scroll_end(animate=False)
```

### Key Details

**Widget Lifecycle Management:**

```
add_user_message("hello")
  └─► MessageBubble(user, "hello")  — mounted, never mutated

show_thinking()
  └─► MessageBubble(thinking, spinner)  — mounted, updated by timer

remove_thinking()
  └─► Timer stopped, bubble.remove() called

add_agent_bubble("Hi")
  └─► MessageBubble(agent, "Hi", streaming=True)  — mounted, _current ref set

append_token(" there")
  └─► _current_agent_bubble.update_message(agent, "Hi there", streaming=True)

finish_agent_stream()
  └─► _current_agent_bubble.update_message(agent, "Hi there", streaming=False)
  └─► _current_agent_bubble = None
```

**Thinking Bubble Lifecycle:**

| Event | Action |
|---|---|
| `show_thinking()` | Create bubble + start interval timer (80ms) |
| Timer tick | Update bubble content to next spinner frame |
| `remove_thinking()` | Stop timer + remove bubble widget |
| Error occurs | `add_error()` calls `remove_thinking()` internally |
| First token arrives | ChatScreen calls `remove_thinking()` then `add_agent_bubble()` |

**Smart Auto-Scroll Behavior:**
- `is_vertical_scroll_end`: Textual property, `True` when scroll position is at the very bottom
- `scroll_end(animate=False)`: Jump to bottom instantly (no smooth scroll — feels more responsive for chat)
- If user scrolled up → no scroll, new bubbles appear "above the fold"

**Edge Cases Handled:**
- `append_token()` called when `_current_agent_bubble is None` → no-op (safety)
- `remove_thinking()` called when no thinking bubble → no-op (safety via None checks)
- `append_to_last_agent()` called after abort → adds suffix and clears ref

---

## 9. File Spec: `screens/chat.py`

### Purpose
The main screen that composes the layout and orchestrates all user interactions. It owns the API client, manages the input field, and runs the stream-response worker loop.

### Layout (composed via mount + CSS IDs)

```
ChatScreen
├── ChatLog          (#chat-log)        — scrollable message list
└── Horizontal       (#status-bar)      — bottom bar
    ├── Static       (#status-dot)      — connection indicator (⬤)
    └── Input        (#chat-input)      — message input field
```

### Full Implementation

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
    """Main chat screen.

    Layout (CSS IDs):
        #chat-log    → ChatLog (VerticalScroll)
        #status-bar  → Horizontal container
        #status-dot  → Static ("⬤")
        #chat-input  → Input
    """

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
                disabled=True,  # Disabled until /setAgent succeeds
            )

    async def on_mount(self) -> None:
        """Connect to agent on mount."""
        await self._connect_to_agent()
        # Focus the input field (if enabled)
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
            # Input stays disabled — no retry mechanism for now

    # ── Input Handling ──────────────────────────────────────

    async def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle Enter press in the input field.

        Flow:
          1. Validate & clear input
          2. Add user bubble
          3. Show thinking bubble
          4. Spawn async worker for SSE stream
        """
        text = event.value.strip()
        if not text:
            return

        inp = self.query_one("#chat-input", Input)
        chat_log = self.query_one(ChatLog)

        # Clear input immediately (feels responsive)
        inp.value = ""

        # Disable input during streaming
        inp.disabled = True

        # Add user message + thinking indicator
        chat_log.add_user_message(text)
        chat_log.show_thinking()

        # Spawn streaming worker
        self._stream_worker = self.run_worker(
            self._stream_response(text),
            exclusive=False,  # Allow multiple workers (though input is disabled)
            group="stream",   # Named group for potential mass-cancel
        )

    # ── Keyboard Shortcuts ──────────────────────────────────

    def on_key(self, event: events.Key) -> None:
        """Handle global key presses.

        Escape: Abort the current stream if one is active.
        """
        if event.key == "escape":
            self._abort_stream()
            event.prevent_default()  # Don't propagate

    # ── Streaming ───────────────────────────────────────────

    async def _stream_response(self, user_message: str) -> None:
        """Consume the SSE stream and update the chat log.

        This runs as a Textual worker. It can be cancelled via
        worker.cancel() (triggered by Escape → _abort_stream).

        Args:
            user_message: The message to send to the agent.
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
            # Worker was cancelled (user pressed Escape)
            # The API abort was already sent in _abort_stream()
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
        """Abort the current stream and clean up.

        Called when user presses Escape.
        """
        worker = self._stream_worker
        if worker is None or worker.is_finished:
            return  # No active stream

        # Fire-and-forget the abort HTTP call
        asyncio.ensure_future(self.api.abort())

        # Cancel the worker → raises CancelledError in _stream_response
        worker.cancel()
```

### Key Details

**Compose Tree:**
```
ChatScreen
├── ChatLog(#chat-log)
└── Horizontal(#status-bar)
    ├── Static(#status-dot) → "⬤"
    └── Input(#chat-input) → placeholder="Type a message..."
```

**Status Dot States:**

| State | Content | Color |
|---|---|---|
| Connected | `[green]⬤[/]` | Green |
| Disconnected | `[red]⬤[/]` | Red |
| Initial (before mount) | `⬤` (no color) | Default |

**Input Field States:**

| State | `disabled` | Behavior |
|---|---|---|
| Before `/setAgent` | `True` | Cannot type |
| After successful `/setAgent` | `False` | Typing enabled |
| During streaming | `True` | Blocked until stream ends or is cancelled |
| After stream ends | `False` | Ready for next message |

**Stream Worker Management:**

| Action | How |
|---|---|
| Spawn worker | `self.run_worker(self._stream_response(text), group="stream")` |
| Cancel worker | `worker.cancel()` → raises `asyncio.CancelledError` in coroutine |
| Check if running | `worker.is_finished` |
| Clean up reference | Set `self._stream_worker = None` in `finally` block |

---

## 10. Concurrency & Abort Model

### Concurrency Rules

1. **Input is disabled during streaming** — no queue, no concurrent messages
2. **Only one stream at a time** — enforced by disabling input
3. **Escape cancels the active stream** — HTTP abort + worker cancel

### Abort Sequence (Escape Key)

```
User presses Escape
  │
  ▼
ChatScreen.on_key(event)
  ├─ event.key == "escape" ✓
  └─ _abort_stream()
       │
       ├─ worker = self._stream_worker
       ├─ worker is not None and not worker.is_finished ✓
       │
       ├─ asyncio.ensure_future(self.api.abort())
       │     └─► POST /abort (fire-and-forget, errors swallowed)
       │
       └─ worker.cancel()
             │
             ▼ (inside _stream_response coroutine)
       asyncio.CancelledError raised
             │
             ▼ (except CancelledError block)
       chat_log.remove_thinking()
       chat_log.append_to_last_agent(" ⚠️ Cancelled")
             │
             ▼ (finally block)
       input.disabled = False
       input.focus()
       self._stream_worker = None
```

### Thread Safety
- All UI mutations happen on the main async thread (Textual's event loop)
- No locks needed — Textual ensures single-threaded widget access
- The only "concurrent" concern is `worker.cancel()` + `asyncio.ensure_future(api.abort())`, both of which are async-safe

---

## 11. End-to-End Sequence Diagrams

### 11.1 Happy Path: Send Message → Receive Response

```
User                    ChatScreen              ChatLog           APIClient        Server
 │                         │                       │                  │               │
 │  Type "Hello" [Enter]   │                       │                  │               │
 │────────────────────────►│                       │                  │               │
 │                         │ add_user_message()    │                  │               │
 │                         │──────────────────────►│                  │               │
 │                         │ show_thinking()       │                  │               │
 │                         │──────────────────────►│ (spinner starts) │               │
 │                         │ input.disabled=True   │                  │               │
 │                         │                       │                  │               │
 │                         │ run_worker(_stream)   │                  │               │
 │                         │─────────────────────────────────────────►│               │
 │                         │                       │                  │ POST /run     │
 │                         │                       │                  │──────────────►│
 │                         │                       │                  │               │
 │                         │                       │                  │  data: Hi     │
 │                         │                       │                  │◄──────────────│
 │                         │◄── token="Hi" ────────│                  │               │
 │                         │ remove_thinking()     │                  │               │
 │                         │──────────────────────►│ (spinner stops)  │               │
 │                         │ add_agent_bubble("Hi")│                  │               │
 │                         │──────────────────────►│                  │               │
 │                         │                       │                  │               │
 │                         │                       │                  │  data:  there │
 │                         │                       │                  │◄──────────────│
 │                         │◄── token=" there" ────│                  │               │
 │                         │ append_token(" there")│                  │               │
 │                         │──────────────────────►│ (bubble: "Hi there▍")           │
 │                         │                       │                  │               │
 │                         │                       │                  │  data: [DONE] │
 │                         │                       │                  │◄──────────────│
 │                         │◄── token="[DONE]" ────│                  │               │
 │                         │ finish_agent_stream() │                  │               │
 │                         │──────────────────────►│ (cursor removed) │               │
 │                         │ input.disabled=False  │                  │               │
 │  ◄── input re-enabled   │                       │                  │               │
```

### 11.2 Abort Flow

```
User                    ChatScreen              ChatLog           APIClient        Server
 │                         │                       │                  │               │
 │  (streaming in progress)│                       │                  │               │
 │                         │                       │                  │               │
 │  Press Escape           │                       │                  │               │
 │────────────────────────►│                       │                  │               │
 │                         │ _abort_stream()       │                  │               │
 │                         │                       │                  │               │
 │                         │──── asyncio.ensure ───│                  │               │
 │                         │     _future(abort())  │                  │               │
 │                         │                       │                  │ POST /abort   │
 │                         │                       │                  │──────────────►│
 │                         │                       │                  │               │
 │                         │ worker.cancel()       │                  │               │
 │                         │ (CancelledError)      │                  │               │
 │                         │                       │                  │               │
 │                         │ remove_thinking()     │                  │               │
 │                         │──────────────────────►│                  │               │
 │                         │ append_to_last_agent  │                  │               │
 │                         │  (" ⚠️ Cancelled")    │                  │               │
 │                         │──────────────────────►│                  │               │
 │                         │ input.disabled=False  │                  │               │
 │  ◄── input re-enabled   │                       │                  │               │
```

### 11.3 Connection Error on Mount

```
User                    ChatScreen              ChatLog           APIClient        Server
 │                         │                       │                  │               │
 │                         │ on_mount()            │                  │               │
 │                         │ _connect_to_agent()   │                  │               │
 │                         │                       │                  │ POST /setAgent │
 │                         │                       │                  │──────────────►│
 │                         │                       │                  │               │
 │                         │                       │                  │ 503 or timeout│
 │                         │                       │                  │◄──────────────│
 │                         │                      │                  │               │
 │                         │ add_error("Could not │                  │               │
 │                         │   connect to agent") │                  │               │
 │                         │──────────────────────►│                  │               │
 │                         │ status-dot: red ⬤    │                  │               │
 │                         │ input.disabled=True  │                  │               │
 │  ◄── sees error + red   │                       │                  │               │
 │       dot, can't type   │                       │                  │               │
```

---

## 12. Error Handling Matrix

| Scenario | Detection | UI Action | Input State |
|---|---|---|---|
| `/setAgent` fails on mount | Exception in `_connect_to_agent()` | Red dot, error bubble: "Could not connect to agent: {e}" | Stays disabled |
| `/run` HTTP error (4xx/5xx) | `response.raise_for_status()` in `api.run()` | Remove thinking, error bubble: "Server error (status)" | Re-enabled |
| SSE stream drops mid-response | Exception in `async for` loop | Partial agent text stays, error bubble: "{exception message}" | Re-enabled |
| Server unreachable during `/run` | `httpx.ConnectError` | Remove thinking, error bubble: "Connection failed" | Re-enabled |
| User presses Escape during stream | `on_key` → `_abort_stream()` | Thinking removed, agent bubble appended with " ⚠️ Cancelled" | Re-enabled |
| Worker cancelled (programmatic) | `asyncio.CancelledError` | Same as Escape (clean abort) | Re-enabled |
| Empty input submitted | `if not text: return` | Nothing happens | — |

### Error Bubble Format

All error bubbles are created via:
```python
chat_log.add_error(description)
```

Which internally creates:
```python
Message(role=Role.ERROR, content=description)
```

And the `MessageBubble` renders as:
```
⚠️ {description}
```

With red border, centered alignment, italic text.

---

## 13. Implementation Order

Recommended implementation sequence, each step producing a testable increment:

| Step | Files | Deliverable | Testable? |
|---|---|---|---|
| **1. Scaffold** | `models/message.py`, `models/__init__.py` | `Role` enum + `Message` dataclass | ✅ Import & instantiate |
| **2. API Client** | `client/api.py`, `client/__init__.py` | `APIClient` with 3 methods | ✅ Test against running server |
| **3. Message Bubble** | `widgets/message.py`, `widgets/__init__.py` | `MessageBubble(Static)` — renders all 4 roles | ✅ Mount in a test app |
| **4. ChatLog** | `widgets/chat_log.py` | `ChatLog(VerticalScroll)` — bubble CRUD, spinner, scroll | ✅ Mount with mock bubbles |
| **5. CSS** | `app.tcss` | Full stylesheet | ✅ Visual check with step 4 |
| **6. ChatScreen** | `screens/chat.py` | Full orchestration | ✅ Manual smoke test |
| **7. App Entry** | `app.py` | `BendersApp` | ✅ Full app run |
| **8. Polish** | All files | Edge cases, abort flow testing | ✅ Integration test |

### Step Dependencies

```
1 (models)
  ├─► 2 (client) ─────────────────────────┐
  ├─► 3 (message bubble) ──► 4 (chat_log) ─┼─► 6 (screen) ──► 7 (app)
                                │           │
                                └─► 5 (css)─┘
```

Steps 4 and 5 can be done in parallel after step 3.

---

## Appendix A: Quick Reference — Method Signatures

### `APIClient` (client/api.py)
```
async set_agent() → None
async run(message: str) → AsyncGenerator[str, None]
async abort() → None
async close() → None
```

### `ChatLog` (widgets/chat_log.py)
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

### `MessageBubble` (widgets/message.py)
```
__init__(message: Message) → None
update_message(message: Message) → None
```

### `ChatScreen` (screens/chat.py)
```
compose() → ComposeResult
on_mount() → None (async)
on_input_submitted(event: Input.Submitted) → None (async)
on_key(event: events.Key) → None
_stream_response(user_message: str) → None (async)
_abort_stream() → None
_connect_to_agent() → None (async)
```

---

## Appendix B: CSS Class → Widget Mapping

| CSS Selector | Widget | File |
|---|---|---|
| `ChatScreen` | `ChatScreen` | `screens/chat.py` |
| `#chat-log` | `ChatLog` | `widgets/chat_log.py` |
| `#status-bar` | `Horizontal` | Inline in `compose()` |
| `#status-dot` | `Static` | Inline in `compose()` |
| `#chat-input` | `Input` | Inline in `compose()` |
| `.user-bubble` | `MessageBubble` | `widgets/message.py` |
| `.agent-bubble` | `MessageBubble` | `widgets/message.py` |
| `.thinking-bubble` | `MessageBubble` | `widgets/message.py` |
| `.error-bubble` | `MessageBubble` | `widgets/message.py` |

---

## Appendix C: Things Intentionally Left Out (Scope Boundaries)

| Item | Status | Rationale |
|---|---|---|
| Configurable server URL | ❌ Out | Hardcoded `localhost:8080` for now |
| Message persistence | ❌ Out | Ephemeral only |
| Markdown rendering | ❌ Out | Plain text only |
| Typewriter delay effect | ❌ Out | Tokens appear instantly |
| New conversation / reset button | ❌ Out | Single session |
| Message timestamps | ❌ Out | Not in scope |
| CLI flags / env vars | ❌ Out | No configuration |
| Retry on connection failure | ❌ Out | Fail fast, no auto-retry |
| App shutdown hook (api.close) | ❌ Out | Client cleanup not critical for single-session |
| Unit tests | ❌ Out | Separate testing spec |
