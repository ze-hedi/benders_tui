import type { Message } from '../types/index.ts';
import { ChatMessages } from './ChatMessages.tsx';
import { ChatInput } from './ChatInput.tsx';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface ChatContainerProps {
  messages: Message[];
  connectionState: ConnectionState;
  isStreaming: boolean;
  connectionError: string | null;
  showThinking: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatContainer({
  messages,
  connectionState,
  isStreaming,
  connectionError,
  showThinking,
  onSend,
  onAbort,
  messagesEndRef,
}: ChatContainerProps) {
  const disabled = connectionState !== 'connected';
  const hasContent = messages.length > 0 || connectionError !== null;
  const modeClass = hasContent ? 'chat-mode' : 'welcome-mode';

  return (
    <div
      className={`chat-container ${modeClass}`}
    >
      {/* Connection error banner */}
      {connectionError && (
        <div className="connection-banner">
          <strong>Connection failed:</strong> {connectionError}
        </div>
      )}

      {/* Chat message list (only when there are messages) */}
      {hasContent && (
        <ChatMessages
          messages={messages}
          showThinking={showThinking}
          messagesEndRef={messagesEndRef}
        />
      )}

      {/* Welcome screen (centered, only when no messages and no error) */}
      {!hasContent && (
        <div className="welcome-content">
          <h1>Benders AI</h1>
          <p>Your AI assistant</p>
        </div>
      )}

      {/* Input area — transitions between centered (welcome) and bottom (chat) */}
      <div className="chat-input-wrapper">
        <ChatInput
          onSend={onSend}
          onAbort={onAbort}
          connectionState={connectionState}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
