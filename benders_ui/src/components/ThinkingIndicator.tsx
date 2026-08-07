import { useState, useEffect } from 'react';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 100;

interface ThinkingIndicatorProps {
  visible: boolean;
}

export function ThinkingIndicator({ visible }: ThinkingIndicatorProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!visible) {
      setFrame(0);
      return;
    }

    const id = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL_MS);

    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="thinking-pill">
      <span
        style={{ fontSize: '1.2rem', lineHeight: 1 }}
        aria-hidden="true"
      >
        {SPINNER_FRAMES[frame]}
      </span>
      <small>Thinking...</small>
    </div>
  );
}
