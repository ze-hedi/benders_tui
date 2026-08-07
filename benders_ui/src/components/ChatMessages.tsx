import { useEffect } from 'react';
import type { Message } from '../types/index.ts';
import { MessageBubble } from './MessageBubble.tsx';
import { ThinkingIndicator } from './ThinkingIndicator.tsx';

interface ChatMessagesProps {
  messages: Message[];
  showThinking: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatMessages({
  messages,
  showThinking,
  messagesEndRef,
}: ChatMessagesProps) {
  // Auto-scroll to bottom when messages change or thinking appears
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showThinking, messagesEndRef]);

  // Also scroll once on mount (container might have initial content)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messagesEndRef]);

  return (
    <div className="message-list">
      <div className="message-list-inner">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {showThinking && <ThinkingIndicator visible={true} />}
      </div>

      {/* Scroll anchor */}
      <div ref={messagesEndRef} />
    </div>
  );
}
