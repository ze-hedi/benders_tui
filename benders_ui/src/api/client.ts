export const BASE_URL = 'http://localhost:8080';

export async function setAgent(): Promise<void> {
  const response = await fetch(`${BASE_URL}/setAgent`, { method: 'POST' });

  if (!response.ok) {
    throw new Error(`Failed to set agent: HTTP ${response.status}`);
  }
}

export async function* streamChat(message: string, signal?: AbortSignal): AsyncGenerator<string> {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on newlines; the last element may be a partial line
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          yield line.slice(6); // Strip the 6-character "data: " prefix
        }
      }
    }

    // Flush any remaining decoder state and the final buffered line
    buffer += decoder.decode();

    if (buffer.startsWith('data: ')) {
      yield buffer.slice(6);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function abortChat(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/abort`, { method: 'POST' });
  } catch {
    // Best-effort: silently ignore all errors
  }
}
