import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────
import { Role } from '../types/index.ts';
import type { Message } from '../types/index.ts';

// ─── Components ──────────────────────────────────────────────────────────────
import { MessageBubble } from '../components/MessageBubble.tsx';
import { ThinkingIndicator } from '../components/ThinkingIndicator.tsx';
import { ChatMessages } from '../components/ChatMessages.tsx';
import { ChatInput } from '../components/ChatInput.tsx';
import { ChatContainer } from '../components/ChatContainer.tsx';

// ─── Hooks ───────────────────────────────────────────────────────────────────
import { useChat } from '../hooks/useChat.ts';

// ─── API ─────────────────────────────────────────────────────────────────────
import * as apiClient from '../api/client.ts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a Message object with defaults for tests */
function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id ?? 'msg-1',
    role: overrides.role ?? Role.USER,
    content: overrides.content ?? 'Hello',
    isStreaming: overrides.isStreaming ?? false,
    ...overrides,
  };
}

/** Spy on crypto.randomUUID and return predictable IDs */
function mockRandomUUID(): ReturnType<typeof vi.spyOn> {
  let counter = 0;
  return vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
    counter++;
    return `uuid-${counter}`;
  });
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  // Ensure crypto.randomUUID is available (jsdom may not have it)
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => 'uuid-fallback' },
      writable: true,
      configurable: true,
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. TYPES VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Types — Role enum', () => {
  it('has correct string values for all roles', () => {
    expect(Role.USER).toBe('user');
    expect(Role.AGENT).toBe('agent');
    expect(Role.THINKING).toBe('thinking');
    expect(Role.ERROR).toBe('error');
  });

  it('has exactly 4 role members', () => {
    expect(Object.keys(Role)).toHaveLength(4);
  });

  it('is frozen / const-like (all values are unique)', () => {
    const values = Object.values(Role);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

describe('Types — Message interface', () => {
  it('validates structural shape at runtime', () => {
    const msg: Message = {
      id: 'abc-123',
      role: Role.USER,
      content: 'Hello there',
      isStreaming: false,
    };
    expect(msg.id).toBe('abc-123');
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello there');
    expect(msg.isStreaming).toBe(false);
  });

  it('allows optional timestamp', () => {
    const msgWithTime: Message = {
      id: '1',
      role: Role.AGENT,
      content: 'Hi',
      isStreaming: true,
      timestamp: 1234567890,
    };
    expect(msgWithTime.timestamp).toBe(1234567890);

    const msgWithoutTime: Message = {
      id: '2',
      role: Role.ERROR,
      content: 'Oops',
      isStreaming: false,
    };
    expect(msgWithoutTime.timestamp).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MESSAGE BUBBLE
// ═══════════════════════════════════════════════════════════════════════════════

describe('MessageBubble', () => {
  it('renders user message with correct alignment and content', () => {
    const msg = createMessage({ role: Role.USER, content: 'Hello from user' });
    render(<MessageBubble message={msg} />);

    const bubble = screen.getByText('Hello from user');
    expect(bubble).toBeInTheDocument();
    // Bubble should have message-bubble user classes
    expect(bubble.className).toContain('message-bubble');
    expect(bubble.className).toContain('user');
    // Parent row should have message-row user classes
    const row = bubble.closest('.message-row');
    expect(row).toBeInTheDocument();
    expect(row?.className).toContain('message-row');
    expect(row?.className).toContain('user');
    // Should not have a blinking cursor
    expect(bubble.querySelector('.streaming-cursor')).toBeNull();
  });

  it('renders agent message with correct alignment', () => {
    const msg = createMessage({ role: Role.AGENT, content: 'Agent response' });
    render(<MessageBubble message={msg} />);

    const bubble = screen.getByText('Agent response');
    expect(bubble).toBeInTheDocument();
    expect(bubble.className).toContain('message-bubble');
    expect(bubble.className).toContain('agent');
    const row = bubble.closest('.message-row');
    expect(row?.className).toContain('message-row');
    expect(row?.className).toContain('agent');
  });

  it('renders streaming agent message with blinking cursor character', () => {
    const msg = createMessage({
      role: Role.AGENT,
      content: 'Partial response',
      isStreaming: true,
    });
    render(<MessageBubble message={msg} />);

    const cursor = screen.getByText('\u258D');
    expect(cursor).toBeInTheDocument();
    expect(cursor.className).toContain('streaming-cursor');
  });

  it('does not show cursor for non-agent streaming messages', () => {
    const msg = createMessage({
      role: Role.USER,
      content: 'User text',
      isStreaming: true,
    });
    render(<MessageBubble message={msg} />);

    expect(screen.queryByText('\u258D')).toBeNull();
  });

  it('renders error message with correct styling', () => {
    const msg = createMessage({ role: Role.ERROR, content: 'Something broke' });
    render(<MessageBubble message={msg} />);

    const bubble = screen.getByText('Something broke');
    expect(bubble).toBeInTheDocument();
    expect(bubble.className).toContain('message-bubble');
    expect(bubble.className).toContain('error');
    const row = bubble.closest('.message-row');
    expect(row?.className).toContain('message-row');
    expect(row?.className).toContain('error');
  });

  it('renders thinking role with muted styling', () => {
    const msg = createMessage({ role: Role.THINKING, content: 'Hmm...' });
    render(<MessageBubble message={msg} />);

    const bubble = screen.getByText('Hmm...');
    expect(bubble.className).toContain('message-bubble');
    expect(bubble.className).toContain('thinking');
    const row = bubble.closest('.message-row');
    expect(row?.className).toContain('message-row');
    expect(row?.className).toContain('thinking');
  });

  it('applies message-bubble class for styling (max-width set via CSS)', () => {
    const msg = createMessage({ content: 'Short' });
    render(<MessageBubble message={msg} />);
    const bubble = screen.getByText('Short');
    expect(bubble.className).toContain('message-bubble');
  });

  it('wraps message in a message-row container', () => {
    const msg = createMessage();
    render(<MessageBubble message={msg} />);
    const bubble = screen.getByText('Hello');
    expect(bubble.className).toContain('message-bubble');
    const row = bubble.closest('.message-row');
    expect(row).toBeInTheDocument();
    expect(row?.className).toContain('message-row');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. THINKING INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

describe('ThinkingIndicator', () => {
  it('returns null when visible is false', () => {
    const { container } = render(<ThinkingIndicator visible={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders thinking pill when visible is true', () => {
    render(<ThinkingIndicator visible={true} />);
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    const pill = screen.getByText('Thinking...').closest('.thinking-pill');
    expect(pill).toBeInTheDocument();
    expect(pill?.className).toContain('thinking-pill');
  });

  it('renders a spinner character', () => {
    render(<ThinkingIndicator visible={true} />);
    // The spinner frames include braille characters like '⠋'
    const spinnerEl = document.querySelector('.thinking-pill span[aria-hidden="true"]');
    expect(spinnerEl).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CHAT INPUT
// ═══════════════════════════════════════════════════════════════════════════════

describe('ChatInput', () => {
  const defaultProps = {
    onSend: vi.fn(),
    onAbort: vi.fn(),
    connectionState: 'connected' as const,
    isStreaming: false,
  };

  beforeEach(() => {
    defaultProps.onSend.mockReset();
    defaultProps.onAbort.mockReset();
  });

  it('renders textarea with chat-textarea class and send button', () => {
    render(<ChatInput {...defaultProps} />);
    const textarea = screen.getByPlaceholderText('Type a message...');
    expect(textarea).toBeInTheDocument();
    expect(textarea.className).toContain('chat-textarea');
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders connecting placeholder when connectionState is connecting', () => {
    render(<ChatInput {...defaultProps} connectionState="connecting" />);
    expect(screen.getByPlaceholderText('Connecting...')).toBeInTheDocument();
  });

  it('renders disconnected placeholder when connectionState is disconnected', () => {
    render(<ChatInput {...defaultProps} connectionState="disconnected" />);
    expect(screen.getByPlaceholderText('Disconnected — refresh the page')).toBeInTheDocument();
  });

  it('calls onSend when Enter is pressed (without Shift)', () => {
    render(<ChatInput {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(defaultProps.onSend).toHaveBeenCalledWith('Hello world');
    expect(defaultProps.onSend).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onSend when Shift+Enter is pressed', () => {
    render(<ChatInput {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  it('calls onAbort when Enter is pressed during streaming', () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(defaultProps.onAbort).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  it('calls onAbort when button is clicked during streaming', () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(defaultProps.onAbort).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  it('disables textarea when connectionState is connecting', () => {
    render(<ChatInput {...defaultProps} connectionState="connecting" />);
    const textarea = screen.getByPlaceholderText('Connecting...');
    expect(textarea).toBeDisabled();
  });

  it('disables textarea when connectionState is disconnected', () => {
    render(<ChatInput {...defaultProps} connectionState="disconnected" />);
    const textarea = screen.getByPlaceholderText('Disconnected — refresh the page');
    expect(textarea).toBeDisabled();
  });

  it('disables textarea when isStreaming is true', () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />);
    const textarea = screen.getByPlaceholderText('Type a message...');
    expect(textarea).toBeDisabled();
  });

  it('button is disabled when connectionState is connecting and not streaming', () => {
    render(<ChatInput {...defaultProps} connectionState="connecting" isStreaming={false} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('button is enabled (as stop) when isStreaming is true', () => {
    render(<ChatInput {...defaultProps} connectionState="connected" isStreaming={true} />);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('renders stop button with stop-btn class during streaming', () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('send-btn');
    expect(button.className).toContain('stop-btn');
    expect(button).toHaveAttribute('aria-label', 'Stop generating');
  });

  it('renders send button with send-btn class when not streaming', () => {
    render(<ChatInput {...defaultProps} isStreaming={false} />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('send-btn');
    expect(button).toHaveAttribute('aria-label', 'Send message');
  });

  it('does not send empty message', () => {
    render(<ChatInput {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  it('clears textarea after sending', () => {
    render(<ChatInput {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(textarea.value).toBe('');
  });

  it('does nothing on Enter when connectionState is connecting and not streaming', () => {
    render(<ChatInput {...defaultProps} connectionState="connecting" isStreaming={false} />);

    const textarea = screen.getByPlaceholderText('Connecting...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(defaultProps.onSend).not.toHaveBeenCalled();
    expect(defaultProps.onAbort).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CHAT MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

describe('ChatMessages', () => {
  // Use a ref that persists across renders (React 19 refs are plain objects)
  function makeRef(): React.RefObject<HTMLDivElement | null> {
    return { current: null };
  }

  it('renders all messages', () => {
    const messages = [
      createMessage({ id: '1', role: Role.USER, content: 'Hello' }),
      createMessage({ id: '2', role: Role.AGENT, content: 'Hi there' }),
      createMessage({ id: '3', role: Role.ERROR, content: 'Oops' }),
    ];
    const ref = makeRef();

    render(<ChatMessages messages={messages} showThinking={false} messagesEndRef={ref} />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    expect(screen.getByText('Oops')).toBeInTheDocument();
  });

  it('shows thinking indicator when showThinking is true', () => {
    const ref = makeRef();
    render(<ChatMessages messages={[]} showThinking={true} messagesEndRef={ref} />);

    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('does NOT show thinking indicator when showThinking is false', () => {
    const ref = makeRef();
    render(<ChatMessages messages={[]} showThinking={false} messagesEndRef={ref} />);

    expect(screen.queryByText('Thinking...')).toBeNull();
  });

  it('has a scroll anchor div at the bottom', () => {
    const ref = makeRef();
    render(<ChatMessages messages={[]} showThinking={false} messagesEndRef={ref} />);

    // The ref is attached to a div at the end of the message list
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('renders empty with no messages and no thinking', () => {
    const ref = makeRef();
    const { container } = render(
      <ChatMessages messages={[]} showThinking={false} messagesEndRef={ref} />,
    );

    // Should have the message-list and message-list-inner wrappers
    const messageList = container.querySelector('.message-list');
    expect(messageList).toBeInTheDocument();
    const messageListInner = container.querySelector('.message-list-inner');
    expect(messageListInner).toBeInTheDocument();
    // No message bubbles
    expect(messageList?.querySelector('.message-bubble')).toBeNull();
    // No thinking pill
    expect(messageList?.querySelector('.thinking-pill')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CHAT CONTAINER
// ═══════════════════════════════════════════════════════════════════════════════

describe('ChatContainer', () => {
  function makeRef(): React.RefObject<HTMLDivElement | null> {
    return { current: null };
  }

  const defaultProps = {
    messages: [] as Message[],
    connectionState: 'connected' as const,
    isStreaming: false,
    connectionError: null as string | null,
    showThinking: false,
    onSend: vi.fn(),
    onAbort: vi.fn(),
    messagesEndRef: makeRef(),
  };

  it('shows welcome screen (centered input) when no messages', () => {
    render(<ChatContainer {...defaultProps} />);

    expect(screen.getByText('Benders AI')).toBeInTheDocument();
    expect(screen.getByText('Your AI assistant')).toBeInTheDocument();
    // Should be in welcome mode
    const container = document.querySelector('.chat-container');
    expect(container?.className).toContain('welcome-mode');
  });

  it('shows chat layout when messages exist', () => {
    const msg = createMessage({ id: '1', role: Role.USER, content: 'Hello' });
    render(<ChatContainer {...defaultProps} messages={[msg]} />);

    // The input is still present but the layout is chat-mode
    const container = document.querySelector('.chat-container');
    expect(container?.className).toContain('chat-mode');
    // Message should be visible
    expect(screen.getByText('Hello')).toBeInTheDocument();
    // Welcome content should not be present
    expect(screen.queryByText('Benders AI')).toBeNull();
  });

  it('shows connection error banner when connectionError is set', () => {
    render(
      <ChatContainer {...defaultProps} connectionError="Failed to connect to agent" />,
    );

    expect(screen.getByText(/Connection failed:/)).toBeInTheDocument();
    expect(screen.getByText(/Failed to connect to agent/)).toBeInTheDocument();
    const banner = document.querySelector('.connection-banner');
    expect(banner).toBeInTheDocument();
    expect(banner?.className).toContain('connection-banner');
  });

  it('shows chat layout even when only an error exists (no messages)', () => {
    render(
      <ChatContainer
        {...defaultProps}
        messages={[]}
        connectionError="Network error"
      />,
    );

    // With an error present, hasContent is true → chat-mode, not welcome-mode
    expect(screen.queryByText('Benders AI')).toBeNull();
    expect(screen.getByText(/Connection failed:/)).toBeInTheDocument();
  });

  it('passes isStreaming to ChatInput', () => {
    render(<ChatContainer {...defaultProps} isStreaming={true} />);

    const button = screen.getByRole('button');
    // In streaming mode, the button should show stop
    expect(button).toHaveAttribute('aria-label', 'Stop generating');
  });

  it('passes disabled based on connectionState', () => {
    // When connecting
    const { unmount } = render(
      <ChatContainer {...defaultProps} connectionState="connecting" />,
    );
    const placeholder = screen.getByPlaceholderText('Connecting...');
    expect(placeholder).toBeInTheDocument();
    unmount();

    // When connected
    render(<ChatContainer {...defaultProps} connectionState="connected" />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. useChat HOOK
// ═══════════════════════════════════════════════════════════════════════════════

describe('useChat hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns proper initial state', () => {
    // Mock setAgent to resolve immediately (no-op)
    vi.spyOn(apiClient, 'setAgent').mockResolvedValue(undefined);

    const { result } = renderHook(() => useChat());

    expect(result.current.messages).toEqual([]);
    expect(result.current.connectionState).toBe('connecting');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.connectionError).toBeNull();
  });

  it('exports the expected interface keys', () => {
    vi.spyOn(apiClient, 'setAgent').mockResolvedValue(undefined);

    const { result } = renderHook(() => useChat());

    expect(result.current).toHaveProperty('messages');
    expect(result.current).toHaveProperty('connectionState');
    expect(result.current).toHaveProperty('isStreaming');
    expect(result.current).toHaveProperty('connectionError');
    expect(result.current).toHaveProperty('sendMessage');
    expect(result.current).toHaveProperty('abortStream');
    expect(typeof result.current.sendMessage).toBe('function');
    expect(typeof result.current.abortStream).toBe('function');
  });

  it('sets connectionState to connected after setAgent succeeds', async () => {
    vi.spyOn(apiClient, 'setAgent').mockResolvedValue(undefined);

    const { result } = renderHook(() => useChat());

    // Initially connecting
    expect(result.current.connectionState).toBe('connecting');

    // Wait for the effect to run
    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });
  });

  it('sets connectionError and connectionState to disconnected when setAgent fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(apiClient, 'setAgent').mockRejectedValue(new Error('Server down'));

    const { result } = renderHook(() => useChat());

    // Advance through all retries (3 attempts, 1s apart = 2000ms of delays)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.connectionError).toBe('Server down');
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('sendMessage creates a user message and sets isStreaming', async () => {
    vi.spyOn(apiClient, 'setAgent').mockResolvedValue(undefined);

    // Mock streamChat to yield nothing (empty generator)
    vi.spyOn(apiClient, 'streamChat').mockImplementation(async function* () {
      // never yields, but the loop expects at least [DONE] to finish cleanly
      // We yield [DONE] to end the stream
      yield '[DONE]';
    });

    const { result } = renderHook(() => useChat());

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    // Mock randomUUID for predictable IDs
    const uuidMock = mockRandomUUID();

    await act(async () => {
      result.current.sendMessage('Hello world');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe(Role.USER);
    expect(result.current.messages[0].content).toBe('Hello world');
    expect(result.current.messages[0].isStreaming).toBe(false);
    expect(result.current.isStreaming).toBe(false); // stream finished via [DONE]

    uuidMock.mockRestore();
  });

  it('abortStream calls abortChat', async () => {
    vi.spyOn(apiClient, 'setAgent').mockResolvedValue(undefined);
    const abortSpy = vi.spyOn(apiClient, 'abortChat').mockResolvedValue(undefined);

    const { result } = renderHook(() => useChat());

    await act(async () => {
      result.current.abortStream();
    });

    expect(abortSpy).toHaveBeenCalledTimes(1);
  });

  it('does not send duplicate messages while streaming', async () => {
    vi.spyOn(apiClient, 'setAgent').mockResolvedValue(undefined);

    // Mock a generator that never finishes (simulating ongoing stream)
    vi.spyOn(apiClient, 'streamChat').mockImplementation(async function* () {
      yield 'Hello';
      // Never yield [DONE], simulating ongoing stream
      await new Promise(() => {}); // never resolves
    });

    const { result } = renderHook(() => useChat());

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    await act(async () => {
      result.current.sendMessage('First message');
    });

    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages).toHaveLength(2); // user + agent

    // Try sending another message while streaming
    await act(async () => {
      result.current.sendMessage('Second message');
    });

    // Should still have only the first message pair (no new messages added)
    expect(result.current.messages).toHaveLength(2);
  });

  it('handles stream error by adding error message', async () => {
    vi.spyOn(apiClient, 'setAgent').mockResolvedValue(undefined);
    vi.spyOn(apiClient, 'streamChat').mockImplementation(async function* () {
      throw new Error('Stream error!');
    });

    const { result } = renderHook(() => useChat());

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected');
    });

    await act(async () => {
      result.current.sendMessage('Trigger error');
    });

    await waitFor(() => {
      const errorMessages = result.current.messages.filter(
        (m) => m.role === Role.ERROR,
      );
      expect(errorMessages).toHaveLength(1);
      expect(errorMessages[0].content).toBe('Stream error!');
    });
  });

  // ─── Retry behavior ──────────────────────────────────────────────────────

  it('retries setAgent 3 times on failure', async () => {
    vi.useFakeTimers();
    const setAgentSpy = vi
      .spyOn(apiClient, 'setAgent')
      .mockRejectedValue(new Error('Server down'));

    const { result } = renderHook(() => useChat());

    // Advance through all retries (3 attempts need 2×1000ms delays)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(setAgentSpy).toHaveBeenCalledTimes(3);
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('adds ERROR message to messages when all retries fail', async () => {
    vi.useFakeTimers();
    vi.spyOn(apiClient, 'setAgent').mockRejectedValue(new Error('Server down'));

    const uuidMock = mockRandomUUID();

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.connectionState).toBe('disconnected');

    const errorMessages = result.current.messages.filter(
      (m) => m.role === Role.ERROR,
    );
    expect(errorMessages).toHaveLength(1);
    expect(errorMessages[0].content).toContain(
      'Unable to connect to the server',
    );

    uuidMock.mockRestore();
  });

  it('transitions connectionState to disconnected after all retries fail', async () => {
    vi.useFakeTimers();
    vi.spyOn(apiClient, 'setAgent').mockRejectedValue(new Error('Server down'));

    const { result } = renderHook(() => useChat());

    // Should start as connecting
    expect(result.current.connectionState).toBe('connecting');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.connectionState).toBe('disconnected');
    // Should have the error message
    expect(result.current.messages).toHaveLength(1);
  });

  it('calls setAgent exactly once on success (first try)', async () => {
    vi.useFakeTimers();
    const setAgentSpy = vi
      .spyOn(apiClient, 'setAgent')
      .mockResolvedValue(undefined);

    const { result } = renderHook(() => useChat());

    // Advance timers to flush microtasks (the resolved promise)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.connectionState).toBe('connected');
    expect(setAgentSpy).toHaveBeenCalledTimes(1);
  });

  it('calls setAgent exactly 3 times when it succeeds on the 3rd try', async () => {
    vi.useFakeTimers();
    const setAgentSpy = vi
      .spyOn(apiClient, 'setAgent')
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.connectionState).toBe('connected');
    expect(setAgentSpy).toHaveBeenCalledTimes(3);
    // No error messages should be added since it eventually succeeded
    expect(
      result.current.messages.filter((m) => m.role === Role.ERROR),
    ).toHaveLength(0);
  });

  it('waits 1 second between retries', async () => {
    vi.useFakeTimers();
    vi.spyOn(apiClient, 'setAgent')
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockRejectedValueOnce(new Error('Fail 3'));

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    renderHook(() => useChat());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // Should have called setTimeout with 1000ms delay at least twice (2 retries)
    const retryDelays = setTimeoutSpy.mock.calls
      .filter((call) => call[1] === 1000)
      .map((call) => call[1]);
    expect(retryDelays.length).toBeGreaterThanOrEqual(2);

    setTimeoutSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. API CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

describe('API client', () => {
  it('exports setAgent, streamChat, and abortChat as functions', () => {
    expect(typeof apiClient.setAgent).toBe('function');
    expect(typeof apiClient.streamChat).toBe('function');
    expect(typeof apiClient.abortChat).toBe('function');
  });

  it('has BASE_URL set to http://localhost:8080', () => {
    expect(apiClient.BASE_URL).toBe('http://localhost:8080');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. CSS FILES
// ═══════════════════════════════════════════════════════════════════════════════

describe('CSS files', () => {
  it('chat.css contains key animation definitions', () => {
    const cssPath = resolve(__dirname, '..', 'styles', 'chat.css');
    const css = readFileSync(cssPath, 'utf-8');

    // Should have blink keyframe animation
    expect(css).toContain('@keyframes blink');
    // Should have fadeInUp keyframe
    expect(css).toContain('@keyframes fadeInUp');
  });

  it('chat.css contains key utility classes', () => {
    const cssPath = resolve(__dirname, '..', 'styles', 'chat.css');
    const css = readFileSync(cssPath, 'utf-8');

    expect(css).toContain('.chat-container');
    expect(css).toContain('.message-bubble');
    expect(css).toContain('.thinking-pill');
    expect(css).toContain('.connection-banner');
    expect(css).toContain('.chat-textarea');
    expect(css).toContain('.streaming-cursor');
    expect(css).toContain('.message-row');
    expect(css).toContain('.message-list-inner');
    expect(css).toContain('.chat-input-group');
    expect(css).toContain('.chat-input-wrapper');
    expect(css).toContain('.send-btn');
    expect(css).toContain('.welcome-content');
  });

  it('index.css contains reset and root styles', () => {
    const cssPath = resolve(__dirname, '..', 'index.css');
    const css = readFileSync(cssPath, 'utf-8');

    expect(css).toContain('box-sizing: border-box');
    expect(css).toContain("font-family: 'Inter'");
    expect(css).toContain('#root');
    expect(css).toContain('height: 100%');
    expect(css).toContain('overflow: hidden');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. HTML VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('index.html', () => {
  it('has correct title', () => {
    const htmlPath = resolve(__dirname, '..', '..', 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');

    expect(html).toContain('<title>Benders AI</title>');
  });

  it('has Inter font link from Google Fonts', () => {
    const htmlPath = resolve(__dirname, '..', '..', 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');

    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('family=Inter');
  });

  it('has root div with correct id', () => {
    const htmlPath = resolve(__dirname, '..', '..', 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');

    expect(html).toContain('<div id="root"></div>');
  });
});
