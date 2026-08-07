# API Client

> **Source file**: `client/api.py`
> **Purpose**: Async HTTP client wrapping the agent server's three endpoints. Handles SSE parsing.

---

## 1. Endpoints Summary

| Method | Endpoint | Request Body | Response | Error Handling |
|---|---|---|---|---|
| `POST` | `/setAgent` | *(empty)* | `{"ok": true}` | Raises on failure; caller shows red dot + error bubble |
| `POST` | `/run` | `{"message": "..."}` | `text/event-stream` | Raises on HTTP error; caller catches in async for loop |
| `POST` | `/abort` | *(empty)* | *(any, ignored)* | **Never raises** — best-effort, errors swallowed |

---

## 2. Timeout Strategy

```python
httpx.Timeout(
    connect=5.0,    # 5s to establish TCP connection
    read=None,      # No read timeout — SSE streams are long-lived
    write=5.0,      # 5s to send request body
    pool=5.0,       # 5s to acquire connection from pool
)
```

| Phase | Timeout | Rationale |
|---|---|---|
| Connect | 5s | Fast failure detection when server is down |
| Read | `None` | SSE streams can run indefinitely; must not timeout |
| Write | 5s | Sending the message body shouldn't hang |
| Pool | 5s | Connection pool wait should be quick |

---

## 3. SSE Wire Format

The `/run` endpoint returns `text/event-stream`:

```
data: Hello
data:  world
data: [DONE]
```

**Parsing rules:**
- Lines starting with `data: ` → strip the 6-character prefix, yield the remainder
- Empty lines (heartbeats) → ignored
- The stream ends when `[DONE]` is yielded
- Connection drops → `httpx` raises an exception caught by the caller

---

## 4. Full Implementation

```python
"""Async API client for the Benders agent server."""

from typing import AsyncGenerator
import httpx


class APIClient:
    """Async HTTP client for agent communication."""

    def __init__(self, base_url: str = "http://localhost:8080") -> None:
        self._base_url = base_url.rstrip("/")
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazy-initialize and return the shared httpx client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=5.0,
                    read=None,       # SSE is long-lived
                    write=5.0,
                    pool=5.0,
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
            str: Each token including the sentinel "[DONE]".

        Raises:
            httpx.HTTPStatusError: For 4xx/5xx responses.
            httpx.ConnectError: If server is unreachable.
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
                    token = line[6:]  # Strip "data: " prefix
                    yield token

    async def abort(self) -> None:
        """Send an abort request. Best-effort: errors silently ignored.

        Called when user presses Escape during streaming.
        """
        client = await self._get_client()
        try:
            await client.post(f"{self._base_url}/abort")
        except Exception:
            pass  # Best-effort

    async def close(self) -> None:
        """Close the underlying httpx client."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
```

---

## 5. Client Lifecycle

```
App starts
  │
  ▼
ChatScreen.__init__()
  └─► APIClient() created (no connection yet)

ChatScreen.on_mount()
  └─► api.set_agent()        ← httpx client lazy-initialized on first call
        │
        ├─ OK  → client stays open, reused for all subsequent calls
        └─ ERR → error bubble shown, client still valid for potential retry

During chat session:
  ├─► api.run(msg)            ← reuses same httpx client
  └─► api.abort()             ← reuses same httpx client

App shutdown:
  └─► api.close()             ← (reserved, not yet wired)
```

**Key point**: The httpx client is created once and reused. The `read=None` timeout means the SSE connection can stay open indefinitely without timing out.

---

## 6. Error Propagation Contract

| Method | On HTTP Error | On Network Error | On Timeout |
|---|---|---|---|
| `set_agent()` | Raises `HTTPStatusError` | Raises `ConnectError` | Raises `ConnectTimeout` |
| `run()` | Raises `HTTPStatusError` | Raises during `async for` | Raises `ConnectTimeout` |
| `abort()` | Swallowed | Swallowed | Swallowed |

**Caller's responsibility**: `ChatScreen._stream_response()` catches all exceptions and routes them to `chat_log.add_error()`.
