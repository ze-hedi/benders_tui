import { useState, useRef, useCallback, type KeyboardEvent } from 'react';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface ChatInputProps {
  onSend: (text: string) => void;
  onAbort: () => void;
  connectionState: ConnectionState;
  isStreaming: boolean;
}

export function ChatInput({
  onSend,
  onAbort,
  connectionState,
  isStreaming,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isStreaming) {
          onAbort();
        } else if (connectionState === 'connected') {
          handleSend();
        }
      }
    },
    [isStreaming, connectionState, onAbort, handleSend],
  );

  const handleButtonClick = useCallback(() => {
    if (isStreaming) {
      onAbort();
    } else {
      handleSend();
    }
  }, [isStreaming, onAbort, handleSend]);

  // Auto-resize textarea based on content
  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);

  const isInputDisabled = connectionState !== 'connected' || isStreaming;

  return (
    <div className="chat-input-group">
      <textarea
        ref={textareaRef}
        className="chat-textarea"
        rows={1}
        placeholder={
          connectionState === 'connecting' ? 'Connecting...' :
          connectionState === 'disconnected' ? 'Disconnected — refresh the page' :
          'Type a message...'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        disabled={isInputDisabled}
      />
      <button
        className={`send-btn ${isStreaming ? 'stop-btn' : ''}`}
        onClick={handleButtonClick}
        disabled={connectionState !== 'connected' && !isStreaming}
        title={isStreaming ? 'Stop generating' : 'Send message'}
        aria-label={isStreaming ? 'Stop generating' : 'Send message'}
      >
        {isStreaming ? '\u23F9 Stop' : '\u2191'}
      </button>
    </div>
  );
}
