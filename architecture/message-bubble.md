# Message Bubble Widget

> **Source file**: `widgets/message.py`
> **Purpose**: A `Static` widget subclass that renders a single chat bubble. CSS class is applied based on `Message.role`.

---

## 1. Widget Overview

`MessageBubble` extends Textual's `Static` widget. It receives a `Message` dataclass and renders itself with role-specific CSS and content formatting.

**Design choice**: Uses `self.update()` (Textual's built-in for `Static`) instead of reactive attributes. This is simpler and more explicit — the parent (`ChatLog`) directly controls when re-renders happen.

---

## 2. Role → CSS Class Mapping

```python
ROLE_TO_CLASS = {
    Role.USER:     "user-bubble",
    Role.AGENT:    "agent-bubble",
    Role.THINKING: "thinking-bubble",
    Role.ERROR:    "error-bubble",
}
```

Applied via `self.set_classes(css_class)` on init. The class is **never changed** after creation — a bubble's role is fixed for its lifetime.

---

## 3. Rendering Rules

```python
def _render(self) -> None:
    content = self.message.content

    if self.message.role == Role.AGENT and self.message.is_streaming:
        content = content + "▍"
    elif self.message.role == Role.ERROR:
        content = f"⚠️ {content}"

    self.update(content)
```

| Role | `is_streaming` | Rendered Output |
|---|---|---|
| `USER` | *(ignored)* | `"{content}"` |
| `AGENT` | `False` | `"{content}"` |
| `AGENT` | `True` | `"{content}▍"` |
| `THINKING` | *(ignored)* | `"Thinking... {content}"` (content = spinner char) |
| `ERROR` | *(ignored)* | `"⚠️ {content}"` |

**Note**: The `THINKING` role does NOT have a "Thinking..." prefix hardcoded in the bubble. The `ChatLog` sets `content` to just the spinner character, and the bubble prepends "Thinking... " here. This keeps the spinner frame logic in one place (ChatLog passes just `"⠋"`).

---

## 4. Full Implementation

```python
"""Message bubble widget."""

from textual.widgets import Static
from models.message import Message, Role


class MessageBubble(Static):
    """A single chat bubble rendered as a bordered Static widget."""

    ROLE_TO_CLASS = {
        Role.USER:     "user-bubble",
        Role.AGENT:    "agent-bubble",
        Role.THINKING: "thinking-bubble",
        Role.ERROR:    "error-bubble",
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

    # ── Initialization ──────────────────────────────────────

    def _apply_role_class(self) -> None:
        """Set the CSS class based on role."""
        css_class = self.ROLE_TO_CLASS.get(self.message.role, "")
        if css_class:
            self.set_classes(css_class)

    def _render(self) -> None:
        """Render the message content into the widget."""
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
        """
        self.message = message
        self._render()
```

---

## 5. Widget Lifecycle

```
Creation:
  MessageBubble(Message(role=AGENT, content="Hi", is_streaming=True))
    ├─► self.message = message
    ├─► super().__init__("")         ← Static with empty initial content
    ├─► self.set_classes("agent-bubble")
    └─► self._render()
          └─► self.update("Hi▍")     ← content + cursor

Streaming update:
  bubble.update_message(Message(role=AGENT, content="Hi there", is_streaming=True))
    ├─► self.message = new_message
    └─► self._render()
          └─► self.update("Hi there▍")

Stream finished:
  bubble.update_message(Message(role=AGENT, content="Hi there!", is_streaming=False))
    ├─► self.message = new_message
    └─► self._render()
          └─► self.update("Hi there!")    ← no cursor
```

---

## 6. Edge Cases

| Scenario | Behavior |
|---|---|
| Unknown `Role` value | `set_classes("")` — no CSS class, raw rendering |
| Empty content + streaming | Renders just `"▍"` (empty bubble with cursor) |
| Empty content, not streaming | Renders empty string (invisible, border still shows) |
| Message with `is_streaming=True` but role is `USER` | `is_streaming` is ignored (condition checks for `AGENT` only) |
