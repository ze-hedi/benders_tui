import { useRef } from 'react';
import { useChat } from './hooks/useChat.ts';
import { Role } from './types/index.ts';
import { ChatContainer } from './components/ChatContainer.tsx';

function App() {
  const {
    messages,
    connectionState,
    isStreaming,
    connectionError,
    sendMessage,
    abortStream,
  } = useChat();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const showThinking =
    isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === Role.USER;

  return (
    <ChatContainer
      messages={messages}
      connectionState={connectionState}
      isStreaming={isStreaming}
      connectionError={connectionError}
      showThinking={showThinking}
      onSend={sendMessage}
      onAbort={abortStream}
      messagesEndRef={messagesEndRef}
    />
  );
}

export default App;
