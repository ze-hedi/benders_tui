import { useState, useEffect, useRef, useCallback } from 'react';
import { Role } from '../types/index.ts';
import type { Message } from '../types/index.ts';
import { setAgent, streamChat, abortChat } from '../api/client.ts';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface UseChatReturn {
  messages: Message[];
  connectionState: ConnectionState;
  isStreaming: boolean;
  connectionError: string | null;
  sendMessage: (text: string) => void;
  abortStream: () => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Connect to the agent server on mount
  useEffect(() => {
    let cancelled = false;

    async function connect() {
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await setAgent();
          if (!cancelled) {
            setConnectionState('connected');
          }
          return;
        } catch (err) {
          lastError = err;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      // All retries exhausted
      if (!cancelled) {
        setConnectionState('disconnected');
        setConnectionError(
          lastError instanceof Error ? lastError.message : 'Failed to connect to agent',
        );
        setMessages([{
          id: crypto.randomUUID(),
          role: Role.ERROR,
          content: 'Unable to connect to the server. Please make sure the backend is running and try refreshing the page.',
          isStreaming: false,
        }]);
      }
    }

    connect();

    return () => {
      cancelled = true;
    };
  }, []);

  // Abort any active stream when the hook unmounts
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortChat();
    };
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (isStreaming || !text.trim()) return;

      setConnectionError(null);

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: Role.USER,
        content: text,
        isStreaming: false,
      };
      setMessages((prev) => [...prev, userMessage]);

      setIsStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      (async () => {
        try {
          let firstToken = true;

          for await (const token of streamChat(text, controller.signal)) {
            if (token === '[DONE]') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.role === Role.AGENT && msg.isStreaming
                    ? { ...msg, isStreaming: false }
                    : msg,
                ),
              );
              return;
            }

            if (firstToken) {
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: Role.AGENT,
                  content: token,
                  isStreaming: true,
                },
              ]);
              firstToken = false;
            } else {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.role === Role.AGENT && msg.isStreaming
                    ? { ...msg, content: msg.content + token }
                    : msg,
                ),
              );
            }
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.role === Role.AGENT && msg.isStreaming
                  ? {
                      ...msg,
                      content: msg.content + ' \u26A0\uFE0F Cancelled',
                      isStreaming: false,
                    }
                  : msg,
              ),
            );
          } else {
            const errorMessage =
              err instanceof Error ? err.message : 'Unknown error';
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: Role.ERROR,
                content: errorMessage,
                isStreaming: false,
              },
            ]);
          }
        } finally {
          setIsStreaming(false);
          abortControllerRef.current = null;
        }
      })();
    },
    [isStreaming],
  );

  const abortStream = useCallback(() => {
    abortControllerRef.current?.abort();
    abortChat();
  }, []);

  return {
    messages,
    connectionState,
    isStreaming,
    connectionError,
    sendMessage,
    abortStream,
  };
}
