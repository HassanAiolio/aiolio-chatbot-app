import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, Paperclip, Send, Square } from 'lucide-react';
import { useVoiceInput } from '../hooks/useVoiceInput';

export const MAX_MESSAGE_CHARS = 8_000;

interface Props {
  isStreaming: boolean;
  disabled: boolean;
  statusHint: string;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttach: (file: File) => void;
  onError: (message: string) => void;
}

export interface ComposerHandle {
  focus: () => void;
  setText: (text: string) => void;
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { isStreaming, disabled, statusHint, onSend, onStop, onAttach, onError },
  ref,
) {
  const [text, setText] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textarea.current?.focus(),
    setText: (value: string) => {
      setText(value);
      requestAnimationFrame(() => textarea.current?.focus());
    },
  }));

  const voice = useVoiceInput(
    (spoken) => {
      setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${spoken}` : spoken));
      textarea.current?.focus();
    },
    onError,
  );

  // Grow with the content up to a max height.
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const tooLong = text.length > MAX_MESSAGE_CHARS;
  const canSend = !!text.trim() && !tooLong && !isStreaming && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  return (
    <div className="input-bar">
      <div className={`composer ${tooLong ? 'invalid' : ''}`}>
        <textarea
          ref={textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={voice.state === 'recording' ? 'Listening… click the mic again to stop' : 'Message Aiolio…'}
          rows={1}
          aria-label="Message"
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".pdf,.txt,.md,.markdown,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.css,.sql,.yaml,.yml"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onAttach(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Add a document to your brain"
              title="Add a document (PDF, Markdown, text, code)"
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={18} />
            </button>
            {voice.supported && (
              <button
                type="button"
                className={`icon-btn ${voice.state === 'recording' ? 'recording' : ''}`}
                aria-label={voice.state === 'recording' ? 'Stop recording' : 'Dictate a message'}
                title={voice.state === 'recording' ? 'Stop recording' : 'Dictate (Whisper)'}
                onClick={() => (voice.state === 'recording' ? voice.stop() : voice.start())}
                disabled={voice.state === 'transcribing'}
              >
                {voice.state === 'transcribing' ? <LoaderCircle size={18} className="spin" /> : <Mic size={18} />}
              </button>
            )}
            <span className="composer-hint">{statusHint}</span>
          </div>
          <div className="composer-actions">
            {text.length > MAX_MESSAGE_CHARS * 0.75 && (
              <span className={`char-counter ${tooLong ? 'over' : ''}`}>
                {text.length.toLocaleString()} / {MAX_MESSAGE_CHARS.toLocaleString()}
              </span>
            )}
            {isStreaming ? (
              <button type="button" className="send-btn stop" onClick={onStop} aria-label="Stop generating">
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button type="button" className="send-btn" onClick={submit} disabled={!canSend} aria-label="Send message">
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="composer-footnote">Enter to send · Shift + Enter for a new line · AI can make mistakes</p>
    </div>
  );
});
