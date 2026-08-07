# Chat TUI — Component Vision (v2)

## Visual Design Philosophy

**Terminal-native aesthetic.** No rounded solid blocks — instead, we use Textual's CSS border styles (`border: round`) to render clean character-based borders using `╭╮╰╯` glyphs. Messages are distinguished purely by **color** and **alignment**, no role labels.

---

## Bubble Rendering (ASCII Mockup)

```
                                        ╭──────────────────────╮
                                        │  Hello agent!        │  ← user: blue border, right-aligned
                                        ╰──────────────────────╯

  ╭────────────────────────────────────────────────────────────╮
  │  Hi there! How can I help?                                │  ← agent: green/grey border, left-aligned
  ╰────────────────────────────────────────────────────────────╯

                                        ╭──────────────────────╮
                                        │  What's the weather  │
                                        │  like today?         │  ← user: multi-line, same style
                                        ╰──────────────────────╯

  ╭ Thinking... ───────────────────────────────────────────────╮
  │ ⬤⠋⠙⠹⠸   (animated dots cycle)                          │  ← thinking: dimmed border, animated
  ╰────────────────────────────────────────────────────────────╯

  ╭────────────────────────────────────────────────────────────╮
  │  The weather is sunny, 22°C. It's a beautiful day! ▍     │  ← agent streaming: blinking cursor
  ╰────────────────────────────────────────────────────────────╯
```

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────┐
│                   ChatApp (app.py)                │
│  ┌──────────────────────────────────────────────┐ │
│  │              ChatScreen (screen)              │ │
│  │  ┌──────────────────────────────────────────┐ │ │
│  │  │            ChatLog (widget)              │ │ │
│  │  │  ┌────────────────────────────────────┐  │ │ │
│  │  │  │  Message (widget) × N             │  │ │ │
│  │  │  │  - user  → blue border, right     │  │ │ │
│  │  │  │  - agent → green border, left     │  │ │ │
│  │  │  │  - thinking → dimmed, animated    │  │ │ │
│  │  │  │  - error  → red, centered         │  │ │ │
│  │  │  └────────────────────────────────────┘  │ │ │
│  │  └──────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────┐ │ │
│  │  │     [⬤ Connected] [Input field....]      │ │ │
│  │  └──────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │              APIClient (client/api.py)        │ │
│  │  - set_agent()    → POST /setAgent            │ │
│  │  - run(message)   → POST /run → SSE stream    │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

---

## 1. Project Structure

```
benders_tui/
├── app.py                  # Textual App entry point + CSS
├── screens/
│   └── chat.py             # ChatScreen: orchestrates layout + streaming logic
├── widgets/
│   ├── __init__.py
│   ├── chat_log.py         # ChatLog: VerticalScroll container, manages bubble lifecycle
│   └── message.py          # MessageBubble: single bubble widget (user/agent/thinking/error)
├── client/
│   ├── __init__.py
│   └── api.py              # APIClient: httpx async client + SSE streaming generator
├── models/
│   ├── __init__.py
│   └── message.py          # Message dataclass
└── VISION.md               # This document
```

---

## 2. Data Model — `models/message.py`

```python
from dataclasses import dataclass
from enum import Enum, auto

class Role(Enum):
    USER = auto()
    AGENT = auto()
    THINKING = auto()   # latency gap before first token
    ERROR = auto()      # system-level errors

@dataclass
class Message:
    role: Role
    content: str = ""
    is_streaming: bool = False   # True = cursor ▍ shown, border pulse maybe
```

---

## 3. Message Bubble Widget — `widgets/message.py`

A single bubble. Each variant uses the same `Static` widget base, differentiated by **CSS classes**:

### CSS classes per role:

| CSS Class | Border | Alignment | Content Style |
|---|---|---|---|
| `.user-bubble` | `border: round $accent` (cyan/blue) | Right (via `content-align`, `width: 80%`, dock right) | Normal |
| `.agent-bubble` | `border: round $success` (green) | Left (via `width: 80%`, dock left) | Normal, + blinking `▍` when `is_streaming=True` |
| `.thinking-bubble` | `border: dashed $text-disabled` (dimmed) | Left, narrower (~40%) | Animated dots `⠋⠙⠹⠸` cycle |
| `.error-bubble` | `border: round $error` (red) | Centered | Italic, `⚠️` prefix |

### Key behavior:
- Each bubble wraps its content in Rich markup via `Static`
- **Width cap**: all bubbles have `width: 80%` (relative to ChatLog container)
- **No labels** — role is communicated purely by position + color
- **Streaming cursor**: agent bubble appends a blinking `▍` character at the end while `is_streaming=True`
- During streaming, the parent mutates `self.content` and the widget re-renders via Textual's `watch` mechanism

### Rendering approach:
Instead of creating border characters manually, we use Textual's CSS `border` property:
```
Static with CSS:
  border: round $accent;     → ╭╮╰╯ border in accent color
  width: 80%;
  content-align-horizontal: right;   (for user)
```

---

## 4. Thinking Bubble — Special State

This is the intermediate bubble that appears **after user sends a message but before the first SSE token arrives**.

### Lifecycle:
```
Input submitted
  └─► add_user_message()           ← user bubble appears
  └─► add_thinking_bubble()        ← thinking bubble appears (animated)
  └─► spawn SSE worker...

First token arrives:
  └─► remove_thinking_bubble()     ← thinking bubble removed
  └─► add_agent_bubble(token)      ← agent bubble appears with first token, streaming=True

Subsequent tokens:
  └─► append_token(token)          ← appended to agent bubble

[DONE]:
  └─► finish_agent_stream()        ← cursor removed, streaming=False
```

### Animation:
Use Textual's `set_interval` to cycle through spinner frames:
```python
SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
```
Every ~80ms, rotate the spinner character in the thinking bubble.

---

## 5. ChatLog Widget — `widgets/chat_log.py`

A `VerticalScroll` container managing the bubble list.

### Public API:

```python
class ChatLog(VerticalScroll):
    def add_user_message(self, text: str) -> None:
        """Append a right-aligned user bubble."""

    def show_thinking(self) -> None:
        """Append an animated thinking bubble. Starts spinner animation."""

    def remove_thinking(self) -> None:
        """Remove the thinking bubble (called on first token or error)."""

    def add_agent_bubble(self, first_token: str) -> None:
        """Append a left-aligned agent bubble with first token, streaming=True."""

    def append_token(self, token: str) -> None:
        """Append token to the last agent bubble (in-place mutation)."""

    def finish_agent_stream(self) -> None:
        """Mark last agent bubble as streaming=False, remove cursor."""

    def add_error(self, text: str) -> None:
        """Append a centered error bubble. Also cleans up any thinking bubble."""
```

### Smart Auto-Scroll:
```python
def _maybe_scroll(self) -> None:
    """Only auto-scroll if the user is already at the bottom."""
    if self.is_vertical_scroll_end:   # Textual built-in
        self.scroll_end(animate=False)
```
Called after every mutation. If the user scrolled up to read history, new content won't yank them down.

---

## 6. ChatScreen — `screens/chat.py`

The main screen compositing layout and business logic.

### Layout (CSS):
```
Screen
├── #chat-log       → ChatLog widget, takes all remaining vertical space
├── #status-bar     → Horizontal container at bottom, height: 3
│   ├── #status-dot → Static "⬤" (green=connected, red=disconnected)
│   └── #chat-input → Input (placeholder="Type a message...")
```

### Lifecycle methods:

```python
class ChatScreen(Screen):
    def on_mount(self):
        # 1. Call api.set_agent()
        #    → OK: green dot, input enabled
        #    → FAIL: red dot, error bubble, input stays disabled

    def on_input_submitted(self, event: Input.Submitted):
        text = event.value.strip()
        if not text:
            return
        # 1. input.disabled = True
        # 2. chat_log.add_user_message(text)
        # 3. chat_log.show_thinking()
        # 4. self.run_worker(self._stream_response(text))

    async def _stream_response(self, message: str):
        try:
            first = True
            async for token in self.api.run(message):
                if first:
                    chat_log.remove_thinking()
                    chat_log.add_agent_bubble(token)
                    first = False
                else:
                    if token == "[DONE]":
                        chat_log.finish_agent_stream()
                        return
                    chat_log.append_token(token)
        except Exception as e:
            chat_log.remove_thinking()  # clean up thinking if present
            chat_log.add_error(f"⚠️ {e}")
        finally:
            self.query_one("#chat-input").disabled = False
```

---

## 7. API Client — `client/api.py`

### Endpoints:

| Method | Endpoint | Body | Returns |
|---|---|---|---|
| `POST` | `/setAgent` | *(empty)* | `{"ok": true}` or error |
| `POST` | `/run` | `{"message": "..."}` | SSE stream (`text/event-stream`) |

### SSE Parsing:

```python
class APIClient:
    BASE = "http://localhost:8080"

    async def set_agent(self) -> None:
        """POST /setAgent — raises on failure."""

    async def run(self, message: str) -> AsyncGenerator[str, None]:
        """
        POST /run, stream SSE response line by line.
        Parses:  data: <token>
                 data: [DONE]
        Yields tokens including "[DONE]" sentinel.
        """
```

Wire format:
```
data: Hello
data:  world
data: [DONE]
```

Use `httpx.AsyncClient.stream()` + `aiter_lines()`.

---

## 8. App Entry Point — `app.py`

```python
class ChatApp(App):
    CSS_PATH = "app.tcss"   # or inline CSS

    def on_mount(self):
        self.push_screen(ChatScreen())
```

---

## 9. End-to-End Flow

```
App starts
  │
  ▼
ChatScreen.on_mount()
  ├─► POST /setAgent
  │     ├─ OK  → status dot = green
  │     └─ ERR → status dot = red, error bubble
  │
  ▼ User types "Hello" [Enter]
  │
  ├─► add_user_message("Hello")              ╭──────╮
  │                                          │ Hello│  (blue, right)
  │                                          ╰──────╯
  ├─► show_thinking()                        ╭ Thinking... ⠋
  │                                          ╰
  ├─► input.disabled = True
  │
  └─► _stream_response("Hello")
        │
        ├─ token "Hi" →
        │     remove_thinking()
        │     add_agent_bubble("Hi")          ╭────────────────────
        │                                     │ Hi ▍
        │                                     ╰────────────────────
        │
        ├─ token " there" →
        │     append_token(" there")          ╭────────────────────
        │                                     │ Hi there ▍
        │                                     ╰────────────────────
        │
        ├─ token "!" →
        │     append_token("!")               ╭────────────────────
        │                                     │ Hi there! ▍
        │                                     ╰────────────────────
        │
        ├─ "[DONE]" →
        │     finish_agent_stream()           ╭────────────────────
        │                                     │ Hi there!
        │                                     ╰────────────────────
        │
        └─ input.disabled = False

  ▼ User scrolls up to read history
  │  → new tokens arrive but ChatLog does NOT scroll down
  │  → only auto-scrolls if user is already at bottom
```

---

## 10. Error Handling

| Scenario | UI Behavior |
|---|---|
| `/setAgent` fails on mount | Red dot, error bubble: "⚠️ Could not connect to agent", input disabled |
| `/run` HTTP 4xx/5xx | Remove thinking bubble, add error bubble: "⚠️ Server error (500)" |
| SSE stream drops mid-response | Partial agent text stays, `▍` replaced with " ⚠️ Connection lost" |
| Server unreachable | Red dot, error bubble, input re-enabled for retry |

---

## 11. CSS Design Tokens (Colors)

```
$accent          → #60A5FA (blue)    — user bubbles
$success         → #34D399 (green)   — agent bubbles
$text-disabled   → #6B7280 (grey)    — thinking bubble
$error           → #F87171 (red)     — error bubbles
$surface         → #1F2937 (dark)    — bubble background / fill
```

---

## 12. Dependencies

```
textual >= 0.50.0
httpx   >= 0.27.0
```

---

## 13. Open for Later

- Typewriter delay effect between tokens
- New conversation / reset button
- Markdown / Rich markup in agent responses
- Configurable server URL (env var / CLI flag)
- Message timestamps
