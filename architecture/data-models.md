# Data Models

> **Source file**: `models/message.py`, `models/__init__.py`
> **Purpose**: Core data structures shared across all components.

---

## 1. `Role` Enum

```python
from enum import Enum, auto

class Role(Enum):
    USER = auto()       # Sent by the user
    AGENT = auto()      # Response from the agent
    THINKING = auto()   # Latency gap before first token (animated spinner)
    ERROR = auto()      # System-level errors
```

### Role → CSS Class Mapping

| Role | CSS Class | Visual Identity |
|---|---|---|
| `USER` | `.user-bubble` | Blue round border, right-aligned |
| `AGENT` | `.agent-bubble` | Green round border, left-aligned |
| `THINKING` | `.thinking-bubble` | Grey dashed border, left-aligned, narrow |
| `ERROR` | `.error-bubble` | Red round border, centered, italic |

### Role → Render Prefix/Suffix

| Role | Condition | Modifier |
|---|---|---|
| `USER` | — | None |
| `AGENT` | `is_streaming=True` | Append `▍` (blinking cursor) |
| `AGENT` | `is_streaming=False` | None |
| `THINKING` | — | Render as `"Thinking... {spinner_char}"` |
| `ERROR` | — | Prepend `⚠️ ` |

---

## 2. `Message` Dataclass

```python
from dataclasses import dataclass

@dataclass
class Message:
    role: Role
    content: str = ""
    is_streaming: bool = False
```

### Field Semantics

| Field | Type | Default | Meaning |
|---|---|---|---|
| `role` | `Role` | *(required)* | Who/what produced this message |
| `content` | `str` | `""` | The text to display |
| `is_streaming` | `bool` | `False` | If `True`, agent bubble shows `▍` cursor. Only meaningful for `Role.AGENT`, ignored for others. |

### Usage Examples

```python
# User message
user_msg = Message(role=Role.USER, content="Hello!")

# Streaming agent message (first token arrived)
agent_msg = Message(role=Role.AGENT, content="Hi there", is_streaming=True)

# Finished agent message
agent_msg = Message(role=Role.AGENT, content="Hi there!", is_streaming=False)

# Thinking indicator (content is the spinner frame character)
thinking_msg = Message(role=Role.THINKING, content="⠋")

# Error message
error_msg = Message(role=Role.ERROR, content="Connection failed")
```

### Design Note

`Message` is deliberately **not frozen** — it's a plain mutable dataclass. However, callers should treat it as immutable-ish: when the content changes (e.g., during streaming), the `ChatLog` creates a **new** `Message` instance and passes it to `MessageBubble.update_message()`.

```python
# Pattern: create new Message for updates
old = bubble.message  # Message(role=AGENT, content="Hi", is_streaming=True)
new = Message(role=Role.AGENT, content=old.content + " there", is_streaming=True)
bubble.update_message(new)
```

---

## 3. `models/__init__.py`

Re-exports for convenient imports:

```python
from models.message import Message, Role

__all__ = ["Message", "Role"]
```

This allows other modules to write:

```python
from models import Message, Role
```

Instead of:

```python
from models.message import Message, Role
```
