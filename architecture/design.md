# Design Overview

> **Purpose**: High-level architecture, design principles, and component relationships.
> Read this first to understand the big picture before diving into individual component specs.

---

## 1. What is Benders TUI?

A terminal chat client that connects to a local agent server (`localhost:8080`). It streams agent responses via SSE and renders color-coded message bubbles in the terminal using the [Textual](https://textual.textualize.io/) framework.

---

## 2. Design Principles

| # | Principle | What it means |
|---|---|---|
| **P1** | Terminal-native aesthetic | No rounded blocks. Use Textual's `border: round` for `╭╮╰╯` glyphs. |
| **P2** | Role by position + color | No text labels like "User:" or "Agent:". User = blue/right, Agent = green/left. |
| **P3** | Single source of truth | `Message` dataclass drives all bubble rendering. One data structure, one render path. |
| **P4** | Smart scroll | Auto-scroll only when user is at the bottom. Don't yank them if they're reading history. |
| **P5** | Input blocked during streaming | No queuing, no concurrent messages. Block input + allow cancel via Escape. |

---

## 3. Tech Stack

| Component | Library | Version |
|---|---|---|
| TUI Framework | `textual` | `>= 0.50.0` |
| HTTP/SSE Client | `httpx` | `>= 0.27.0` |
| Async Runtime | `asyncio` | stdlib |
| Data Structures | `dataclasses`, `enum` | stdlib |

---

## 4. Configuration

- **Server URL**: hardcoded `http://localhost:8080`
- No CLI flags, no env vars, no config files (current scope)

---

## 5. API Contract

| Method | Endpoint | Request Body | Response | Notes |
|---|---|---|---|---|
| `POST` | `/setAgent` | *(empty)* | `{"ok": true}` | Called on app mount. |
| `POST` | `/run` | `{"message": "..."}` | `text/event-stream` | SSE: `data: <token>\n\n` lines, ends with `data: [DONE]\n\n` |
| `POST` | `/abort` | *(empty)* | *(any)* | Best-effort. Called when user presses Escape during streaming. |

---

## 6. File Tree

```
benders_tui/
├── app.py                          # Textual App entry point
├── app.tcss                        # All CSS: tokens, layout, bubble variants
├── screens/
│   └── chat.py                     # ChatScreen: orchestration + stream lifecycle
├── widgets/
│   ├── __init__.py
│   ├── chat_log.py                 # ChatLog: VerticalScroll, bubble CRUD, spinner
│   └── message.py                  # MessageBubble: Static subclass, role-based rendering
├── client/
│   ├── __init__.py
│   └── api.py                      # APIClient: httpx + SSE parsing
├── models/
│   ├── __init__.py
│   └── message.py                  # Role enum + Message dataclass
├── architecture/                   # This folder — design & implementation specs
│   ├── design.md                   # ← You are here
│   ├── data-models.md
│   ├── api-client.md
│   ├── message-bubble.md
│   ├── chat-log.md
│   ├── chat-screen.md
│   ├── app-entry-and-css.md
│   ├── concurrency-and-abort.md
│   └── implementation-plan.md
├── VISION.md                       # Original brainstorming artifact
└── ARCHITECTURE.md                 # Original monolithic spec (now superseded)
```

---

## 7. Dependency Graph

```
app.py
  └─► screens/chat.py
        ├─► widgets/chat_log.py
        │     └─► widgets/message.py
        │           └─► models/message.py
        └─► client/api.py
```

---

## 8. Component Tree (Widget Hierarchy)

```
BendersApp (App)
  └── ChatScreen (Screen)
        ├── ChatLog (#chat-log)           VerticalScroll
        │     └── MessageBubble × N        Static (one per message)
        └── Horizontal (#status-bar)
              ├── Static (#status-dot)      "⬤" (green/red)
              └── Input (#chat-input)       user types here
```

---

## 9. Concern Ownership Matrix

| Concern | Owner File | Key Class |
|---|---|---|
| App lifecycle, screen mounting | `app.py` | `BendersApp` |
| All visual styling | `app.tcss` | — |
| Bubble visual rendering | `widgets/message.py` | `MessageBubble` |
| Bubble list, scrolling, spinner | `widgets/chat_log.py` | `ChatLog` |
| Input handling, stream orchestration, abort | `screens/chat.py` | `ChatScreen` |
| HTTP communication, SSE parsing | `client/api.py` | `APIClient` |
| Data structures | `models/message.py` | `Role`, `Message` |

---

## 10. High-Level Data Flow

```
User types → Input.Submitted event
  │
  ▼
ChatScreen.on_input_submitted()
  ├─► ChatLog.add_user_message(text)         → user bubble rendered
  ├─► ChatLog.show_thinking()                 → spinner bubble rendered
  ├─► Input.disabled = True
  └─► run_worker(_stream_response)
        │
        ▼
      APIClient.run(message)  →  SSE stream
        │
        ├─ token "Hi"      → ChatLog.remove_thinking()
        │                  → ChatLog.add_agent_bubble("Hi")
        │
        ├─ token " there"  → ChatLog.append_token(" there")
        │
        ├─ token "[DONE]"  → ChatLog.finish_agent_stream()
        │
        └─ Exception       → ChatLog.remove_thinking()
                           → ChatLog.add_error(msg)

      finally: Input.disabled = False
```

---

## 11. Bubble Visual Identity

| Role | CSS Class | Border | Alignment | Width | Extra |
|---|---|---|---|---|---|
| `USER` | `.user-bubble` | `round` blue | right | 80% | — |
| `AGENT` | `.agent-bubble` | `round` green | left | 80% | `▍` cursor when streaming |
| `THINKING` | `.thinking-bubble` | `dashed` grey | left | 40% | Animated braille spinner |
| `ERROR` | `.error-bubble` | `round` red | center | 80% | `⚠️` prefix, italic |

---

## 12. Spec Navigation

| You want to understand... | Read this file |
|---|---|
| Data structures | [`data-models.md`](./data-models.md) |
| HTTP client & SSE parsing | [`api-client.md`](./api-client.md) |
| How a single bubble works | [`message-bubble.md`](./message-bubble.md) |
| How the bubble list is managed | [`chat-log.md`](./chat-log.md) |
| How the screen orchestrates everything | [`chat-screen.md`](./chat-screen.md) |
| App entry point + full CSS | [`app-entry-and-css.md`](./app-entry-and-css.md) |
| Concurrency, abort, sequence diagrams | [`concurrency-and-abort.md`](./concurrency-and-abort.md) |
| Build order & error matrix | [`implementation-plan.md`](./implementation-plan.md) |
