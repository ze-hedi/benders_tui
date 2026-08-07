import { Role } from '../types/index.ts';
import type { Message } from '../types/index.ts';

interface MessageBubbleProps {
  message: Message;
}

function roleToClass(role: Role): { rowClass: string; bubbleClass: string } {
  switch (role) {
    case Role.USER:
      return { rowClass: 'message-row user', bubbleClass: 'message-bubble user' };
    case Role.AGENT:
      return { rowClass: 'message-row agent', bubbleClass: 'message-bubble agent' };
    case Role.ERROR:
      return { rowClass: 'message-row error', bubbleClass: 'message-bubble error' };
    case Role.THINKING:
      return { rowClass: 'message-row thinking', bubbleClass: 'message-bubble thinking' };
    default:
      return { rowClass: 'message-row agent', bubbleClass: 'message-bubble agent' };
  }
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { rowClass, bubbleClass } = roleToClass(message.role);
  const showCursor = message.isStreaming && message.role === Role.AGENT;

  return (
    <div className={rowClass}>
      <div className={bubbleClass}>
        {message.content}
        {showCursor && <span className="streaming-cursor">{'\u258D'}</span>}
      </div>
    </div>
  );
}
