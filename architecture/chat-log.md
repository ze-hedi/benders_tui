# ChatLog Widget

> **Source file**: `widgets/chat_log.py`
> **Purpose**: A `VerticalScroll` container managing the full list of `MessageBubble` widgets. Owns bubble lifecycle, the thinking spinner animation timer, and smart auto-scroll.

---

## 1. Role in the Architecture

`ChatLog` is the **dumb-but-capable** container. It provides a clean public API for adding/removing/updating bubbles. It does NOT know about the network, the API, or user input. It only knows about `Message` and `MessageBubble`.

```
ChatScreen (orchestrator)
  │
  │  "add this, remove that, update stream"
  │
  ▼
ChatLog (container)
  │
  │  manages list of:
  │
  ▼
MessageBubble × N (individual bubbles)
```

---

## 2. Internal State

```python
class ChatLog(VerticalScroll):
    def __init__(self):
        ...
        self._thinking_bubble: MessageBubble | None = None
        self._thinking_timer: Timer | None = None
        self._thinking_frame: int = 0
        self._current_agent_bubble: MessageBubble | None = None
```

| Field | Type | Purpose |
|---|---|---|
| `_thinking_bubble` | `MessageBubble \| None` | Reference to the current thinking bubble (for removal/update) |
| `_thinking_timer` | `Timer \| None` | Textual interval timer driving the spinner animation |
| `_thinking_frame` | `int` | Current index into `SPINNER_FRAMES` |
| `_current_agent_bubble` | `MessageBubble \| None` | Reference to the streaming agent bubble (for token appends) |

---

## 3. Spinner Animation

```python
SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
SPINNER_INTERVAL = 0.08  # 80ms per frame (~12.5 fps)
```

**Why ChatLog owns the timer**: The thinking bubble is owned by ChatLog and can be removed at any time. If the bubble owned its own timer, removal would require careful cleanup. Centralizing the timer in ChatLog is simpler — `remove_thinking()` stops the timer and removes the bubble atomically.

**Animation tick**:
```python
def _animate_thinking(self) -> None:
    if self._thinking_bubble is None:
        return
    self._thinking_frame = (self._thinking_frame + 1) % len(SPINNER_FRAMES)
    frame_char = SPINNER_FRAMES[self._thinking_frame]
    msg = Message(role=Role.THINKING, content=frame_char)
    self._thinking_bubble.update_message(msg)
```

---

## 4. Public API

```python
class ChatLog(VerticalScroll):
    # ── Message Management ──────────────────────────────────

    def add_user_message(self, text: str) -> None:
        """Append a user bubble (blue, right-aligned)."""

    def add_agent_bubble(self, first_token: str) -> None:
        """Create new agent bubble with first token, streaming=True."""

    def append_token(self, token: str) -> None:
        """Append token to _current_agent_bubble (in-place mutation)."""

    def finish_agent_stream(self) -> None:
        """Set is_streaming=False on current agent bubble (removes ▍)."""

    def append_to_last_agent(self, suffix: str) -> None:
        """Append a suffix (e.g. ' ⚠️ Cancelled') to current agent bubble."""

    def add_error(self, text: str) -> None:
        """Append error bubble. Also cleans up thinking bubble if present."""

    # ── Thinking Bubble ─────────────────────────────────────

    def show_thinking(self) -> None:
        """Create thinking bubble + start spinner timer."""

    def remove_thinking(self) -> None:
        """Stop timer + remove thinking bubble. Safe to call if absent."""
```

### API Call Sequences

**Normal flow:**
```
add_user_message("Hello")
show_thinking()
  ... time passes, spinner animates ...
remove_thinking()
add_agent_bubble("Hi")
append_token(" there")
append_token("!")
finish_agent_stream()
```

**Abort flow (stream was in progress):**
```
remove_thinking()
append_to_last_agent(" ⚠️ Cancelled")
```

**Error flow:**
```
add_error("Connection failed")
  └─► internally calls remove_thinking() first
```

---

## 5. Smart Auto-Scroll

```python
def _maybe_scroll(self) -> None:
    """Only auto-scroll if user is at the bottom."""
    if self.is_vertical_scroll_end:   # Textual built-in property
        self.scroll_end(animate=False)
```

Called after **every mutation** (add, append, remove, etc.).

| User scroll position | New bubble arrives | Behavior |
|---|---|---|
| At bottom | Yes | Auto-scroll down to show it |
| Scrolled up (reading history) | Yes | No scroll — bubble appears "above the fold" |

---

## 6. Full Implementation

```python
"""Chat log widget — scrollable message list."""

from textual.containers import VerticalScroll
from textual.timer import Timer
from models.message import Message, Role
from widgets.message import MessageBubble


SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
SPINNER_INTERVAL = 0.08


class ChatLog(VerticalScroll):
    """Scrollable container for message bubbles."""

    def __init__(self) -> None:
        super().__init__(id="chat-log")
        self._thinking_bubble: MessageBubble | None = None
        self._thinking_timer: Timer | None = None
        self._thinking_frame: int = 0
        self._current_agent_bubble: MessageBubble | None = None

    # ── User Message ────────────────────────────────────────

    def add_user_message(self, text: str) -> None:
        msg = Message(role=Role.USER, content=text)
        bubble = MessageBubble(msg)
        self.mount(bubble)
        self._maybe_scroll()

    # ── Thinking Bubble ─────────────────────────────────────

    def show_thinking(self) -> None:
        msg = Message(role=Role.THINKING, content=SPINNER_FRAMES[0])
        self._thinking_bubble = MessageBubble(msg)
        self.mount(self._thinking_bubble)
        self._thinking_frame = 0
        self._thinking_timer = self.set_interval(
            SPINNER_INTERVAL, self._animate_thinking
        )
        self._maybe_scroll()

    def remove_thinking(self) -> None:
        if self._thinking_timer is not None:
            self._thinking_timer.stop()
            self._thinking_timer = None
        if self._thinking_bubble is not None:
            self._thinking_bubble.remove()
            self._thinking_bubble = None

    # ── Agent Bubble (Streaming) ────────────────────────────

    def add_agent_bubble(self, first_token: str) -> None:
        msg = Message(role=Role.AGENT, content=first_token, is_streaming=True)
        self._current_agent_bubble = MessageBubble(msg)
        self.mount(self._current_agent_bubble)
        self._maybe_scroll()

    def append_token(self, token: str) -> None:
        if self._current_agent_bubble is None:
            return
        accumulated = self._current_agent_bubble.message.content + token
        msg = Message(role=Role.AGENT, content=accumulated, is_streaming=True)
        self._current_agent_bubble.update_message(msg)
        self._maybe_scroll()

    def finish_agent_stream(self) -> None:
        if self._current_agent_bubble is None:
            return
        msg = Message(
            role=Role.AGENT,
            content=self._current_agent_bubble.message.content,
            is_streaming=False,
        )
        self._current_agent_bubble.update_message(msg)
        self._current_agent_bubble = None
        self._maybe_scroll()

    def append_to_last_agent(self, suffix: str) -> None:
        if self._current_agent_bubble is None:
            return
        content = self._current_agent_bubble.message.content + suffix
        msg = Message(role=Role.AGENT, content=content, is_streaming=False)
        self._current_agent_bubble.update_message(msg)
        self._current_agent_bubble = None
        self._maybe_scroll()

    # ── Error ───────────────────────────────────────────────

    def add_error(self, text: str) -> None:
        self.remove_thinking()  # Clean up if present
        msg = Message(role=Role.ERROR, content=text)
        bubble = MessageBubble(msg)
        self.mount(bubble)
        self._maybe_scroll()

    # ── Internal ────────────────────────────────────────────

    def _animate_thinking(self) -> None:
        if self._thinking_bubble is None:
            return
        self._thinking_frame = (self._thinking_frame + 1) % len(SPINNER_FRAMES)
        frame_char = SPINNER_FRAMES[self._thinking_frame]
        msg = Message(role=Role.THINKING, content=frame_char)
        self._thinking_bubble.update_message(msg)

    def _maybe_scroll(self) -> None:
        if self.is_vertical_scroll_end:
            self.scroll_end(animate=False)
```

---

## 7. Thinking Bubble Lifecycle

```
show_thinking()
  ├─► Create MessageBubble(THINKING, "⠋")
  ├─► Mount it
  └─► Start set_interval(80ms, _animate_thinking)

  Every 80ms:
    └─► _animate_thinking()
          └─► Cycle to next frame, update bubble content

remove_thinking()
  ├─► Stop timer (if running)
  └─► Remove bubble widget (if present)
```

**Safety**: Both `remove_thinking()` and `add_error()` (which calls `remove_thinking()` internally) are safe to call even if no thinking bubble exists — all operations are guarded by `is not None` checks.

---

## 8. Edge Cases

| Scenario | Behavior |
|---|---|
| `append_token()` called but no agent bubble | Early return (guarded) |
| `finish_agent_stream()` called twice | Second call is no-op (`_current_agent_bubble is None`) |
| `remove_thinking()` called twice | Second call is no-op (both timer and bubble are `None`) |
| `append_to_last_agent()` after `finish_agent_stream()` | No-op (ref was cleared) |
| Multiple `add_user_message()` without streaming | Works fine — bubbles stack vertically |
