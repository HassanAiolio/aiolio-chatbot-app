import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { Message } from '../types';
import { ChatMessage } from './ChatMessage';

interface Props {
  sessionId: string;
  messages: Message[];
  isStreaming: boolean;
  modelLabel: (id?: string) => string;
  onRegenerate: () => void;
  onEdit: (id: string, text: string) => void;
}

const STICK_THRESHOLD = 120;

export function MessageList({ sessionId, messages, isStreaming, modelLabel, onRegenerate, onEdit }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = container.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Jump to the end when switching chats.
  useLayoutEffect(() => {
    stick.current = true;
    scrollToBottom();
  }, [sessionId, scrollToBottom]);

  // Follow the stream only while the reader is at the bottom; scrolling up pauses it.
  useEffect(() => {
    if (stick.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  const onScroll = () => {
    const el = container.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = distance < STICK_THRESHOLD;
    setShowJump(distance > 300);
  };

  const lastIndex = messages.length - 1;
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');

  return (
    <>
      <div className="messages-container" ref={container} onScroll={onScroll} aria-live="polite" aria-busy={isStreaming}>
        <div className="messages-inner">
          {messages.map((message, i) => (
            <ChatMessage
              key={message.id}
              message={message}
              modelLabel={modelLabel}
              canRegenerate={!isStreaming && i === lastIndex && message.role === 'assistant'}
              canEdit={!isStreaming && i === lastUserIndex}
              onRegenerate={onRegenerate}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>
      {showJump && (
        <button
          type="button"
          className="scroll-to-bottom"
          aria-label="Scroll to latest message"
          onClick={() => {
            stick.current = true;
            scrollToBottom(true);
          }}
        >
          <ArrowDown size={18} />
        </button>
      )}
    </>
  );
}
