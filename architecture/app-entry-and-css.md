# App Entry Point & CSS

> **Source files**: `app.py`, `app.tcss`
> **Purpose**: Application entry point, CSS loading, and all visual styling.

---

## 1. `app.py` — Entry Point

### Purpose
Minimal Textual `App` subclass. Loads CSS and pushes the `ChatScreen`.

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

### Key Points
- `CSS_PATH = "app.tcss"` — Textual resolves this relative to `app.py`'s location
- `on_mount()` — Textual lifecycle hook, called after the DOM is ready
- `push_screen(ChatScreen())` — makes it the active (and only) screen
- No CLI parsing, no config loading (current scope)

---

## 2. `app.tcss` — Full Stylesheet

### 2.1 Design Tokens

```css
$accent:         #60A5FA;   /* blue    — user bubbles        */
$success:        #34D399;   /* green   — agent bubbles       */
$text-disabled:  #6B7280;   /* grey    — thinking bubble     */
$error:          #F87171;   /* red     — error bubbles       */
$surface:        #1F2937;   /* dark    — bubble background   */
$background:     #111827;   /* darker  — screen background   */
$text:           #E5E7EB;   /* light   — default text color  */
$text-muted:     #9CA3AF;   /* muted   — placeholder text    */
```

### 2.2 Screen Layout

```css
ChatScreen {
    background: $background;
    color: $text;
}
```

### 2.3 ChatLog

```css
#chat-log {
    height: 1fr;
    padding: 1 2;
    scrollbar-size: 1 0;
    scrollbar-color: $text-disabled;
}
```

- `height: 1fr` — takes all remaining vertical space (after the status bar)
- `scrollbar-size: 1 0` — 1 cell wide, 0 minimum (always visible when scrollable)

### 2.4 Status Bar

```css
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
```

- `dock: bottom` — pins to the bottom of the screen
- `height: 3` — three lines tall (1 for content + 1 padding top + 1 padding bottom)

### 2.5 Input Field

```css
#chat-input {
    width: 1fr;
    margin: 0 0 0 1;
}

#chat-input > .input--placeholder {
    color: $text-muted;
}
```

- `width: 1fr` — fills remaining horizontal space in the status bar
- Placeholder text: "Type a message..." in muted color

### 2.6 Bubble Variants

```css
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

/* --- Thinking Bubble (dimmed, dashed, narrow) --- */
.thinking-bubble {
    border: dashed $text-disabled;
    width: 40%;
    align-horizontal: left;
    padding: 1 2;
    margin: 1 0;
    color: $text-disabled;
    background: $surface;
}

/* --- Error Bubble (red, centered, italic) --- */
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

---

## 3. CSS Reference

### 3.1 Token → Usage

| Token | Where Used |
|---|---|
| `$accent` | `.user-bubble` border |
| `$success` | `.agent-bubble` border, `#status-dot` when connected |
| `$text-disabled` | `.thinking-bubble` border + text, scrollbar, status bar border |
| `$error` | `.error-bubble` border + text, `#status-dot` when disconnected |
| `$surface` | All bubble backgrounds, status bar background |
| `$background` | `ChatScreen` background |
| `$text` | Default text, bubble content |
| `$text-muted` | Input placeholder text |

### 3.2 CSS Class → Widget

| CSS Selector | Widget Class | File |
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

### 3.3 Border Styles

| Style | Visual | Used By |
|---|---|---|
| `border: round $color` | `╭╮╰╯` box-drawing chars | User, Agent, Error bubbles |
| `border: dashed $color` | `┊` dashed lines | Thinking bubble |
| `border-top: solid $color` | `─` horizontal line | Status bar separator |

### 3.4 Alignment

| Property | Effect | Used By |
|---|---|---|
| `align-horizontal: right` | Push widget to right edge | User bubbles |
| `align-horizontal: left` | Push widget to left edge (default) | Agent, Thinking bubbles |
| `align-horizontal: center` | Center widget horizontally | Error bubbles |

---

## 4. Visual ASCII Mockup

```
┌─ ChatScreen ──────────────────────────────────────────────┐
│                                                           │
│                                     ╭──────────────────╮  │
│                                     │  Hello agent!    │  │  ← user (blue, right)
│                                     ╰──────────────────╯  │
│                                                           │
│  ╭────────────────────────────────────────────────────╮   │
│  │  Hi there! How can I help?                        │   │  ← agent (green, left)
│  ╰────────────────────────────────────────────────────╯   │
│                                                           │
│                                     ╭──────────────────╮  │
│                                     │  What's the      │  │
│                                     │  weather like?   │  │  ← user (multi-line)
│                                     ╰──────────────────╯  │
│                                                           │
│  ╭ Thinking... ⠋ ──────────────────────────────────────╮  │  ← thinking (dashed, narrow)
│  ╰──────────────────────────────────────────────────────╯  │
│                                                           │
│  ╭────────────────────────────────────────────────────╮   │
│  │  The weather is sunny, 22°C. It's a beautiful     │   │  ← agent streaming (▍ cursor)
│  │  day! ▍                                           │   │
│  ╰────────────────────────────────────────────────────╯   │
│                                                           │
│  ─────────────────────────────────────────────────────── │  ← status bar border
│  ⬤  Type a message...                                   │  ← status bar
│  ─────────────────────────────────────────────────────── │
└───────────────────────────────────────────────────────────┘
```
