# Architecture Overview

> **Start here.** This file maps each concern to its spec file. Pick what you need.

---

## File Map

| File | What it covers | Read when you need to... |
|---|---|---|
| [`design.md`](./design.md) | Principles, file tree, dependency graph, component tree, data flow | Understand the big picture |
| [`data-models.md`](./data-models.md) | `Role` enum, `Message` dataclass | Know the data structures everything depends on |
| [`api-client.md`](./api-client.md) | `APIClient` — HTTP, SSE parsing, timeouts, endpoints | Implement or debug server communication |
| [`message-bubble.md`](./message-bubble.md) | `MessageBubble(Static)` — role→CSS, rendering rules | Implement or style individual bubbles |
| [`chat-log.md`](./chat-log.md) | `ChatLog(VerticalScroll)` — bubble list, spinner, auto-scroll | Implement the scrollable message container |
| [`chat-screen.md`](./chat-screen.md) | `ChatScreen` — compose, input, stream orchestration, worker lifecycle | Implement the main screen logic |
| [`app-entry-and-css.md`](./app-entry-and-css.md) | `app.py` + `app.tcss` — entry point, all styling, design tokens | Set up the app or tweak visuals |
| [`concurrency-and-abort.md`](./concurrency-and-abort.md) | Concurrency rules, Escape→abort flow, sequence diagrams, thread safety | Understand streaming cancellation or debug race conditions |
| [`implementation-plan.md`](./implementation-plan.md) | Build order, error matrix, scope boundaries, sprint breakdown | Plan sprints or check what's in/out of scope |

---

## Quick Dependency Chain

```
data-models  ──►  api-client  ──┐
             ──►  message-bubble ──► chat-log ──┼──► chat-screen ──► app-entry-and-css
                                                 │
             concurrency-and-abort (cross-cuts everything)
```

---

## Source Files These Specs Map To

| Spec File | Source File |
|---|---|
| `data-models.md` | `models/message.py`, `models/__init__.py` |
| `api-client.md` | `client/api.py`, `client/__init__.py` |
| `message-bubble.md` | `widgets/message.py`, `widgets/__init__.py` |
| `chat-log.md` | `widgets/chat_log.py` |
| `chat-screen.md` | `screens/chat.py` |
| `app-entry-and-css.md` | `app.py`, `app.tcss` |
