import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import { Brain, Check, ChevronDown, Copy, FileText, LoaderCircle, Pencil, RotateCcw, TriangleAlert, Zap } from 'lucide-react';
import { formatDuration, formatTime } from '../lib/format';
import type { Message, Source } from '../types';
import { Logo } from './Logo';

// The Markdown renderer and highlight.js grammars are most of the bundle; load them off the critical path.
export const loadMarkdown = () => import('./Markdown');
const Markdown = lazy(() => loadMarkdown().then((m) => ({ default: m.Markdown })));

function RichText({ text }: { text: string }) {
  return (
    <Suspense fallback={<div className="message-text">{text}</div>}>
      <Markdown text={text} />
    </Suspense>
  );
}

interface Props {
  message: Message;
  modelLabel: (id?: string) => string;
  canRegenerate: boolean;
  canEdit: boolean;
  onRegenerate: () => void;
  onEdit: (id: string, text: string) => void;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn small"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function Reasoning({ text, thinking, durationMs }: { text: string; thinking: boolean; durationMs?: number }) {
  return (
    <details className="reasoning">
      <summary>
        {thinking ? <LoaderCircle size={14} className="spin" /> : <Zap size={14} />}
        <span>{thinking ? 'Thinking…' : durationMs ? `Thought for ${formatDuration(durationMs)}` : 'Reasoning'}</span>
        <ChevronDown size={14} className="chevron" />
      </summary>
      <div className="reasoning-text">{text}</div>
    </details>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const active = sources.find((s) => s.index === open);
  return (
    <div className="sources">
      <div className="sources-row">
        <span className="sources-label">Sources</span>
        {sources.map((s) => (
          <button
            key={s.index}
            type="button"
            className={`source-chip ${open === s.index ? 'active' : ''}`}
            onClick={() => setOpen(open === s.index ? null : s.index)}
            aria-expanded={open === s.index}
          >
            <FileText size={12} />[{s.index}] {s.docName}
          </button>
        ))}
      </div>
      {active && <blockquote className="source-excerpt">{active.text}</blockquote>}
    </div>
  );
}

function UserEditor({ initial, onSave, onCancel }: { initial: string; onSave: (t: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <div className="edit-box">
      <textarea
        ref={ref}
        value={value}
        rows={Math.min(8, value.split('\n').length + 1)}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSave(value);
          }
          if (e.key === 'Escape') onCancel();
        }}
        aria-label="Edit message"
      />
      <div className="edit-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={() => onSave(value)} disabled={!value.trim()}>
          Save &amp; resend
        </button>
      </div>
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({
  message,
  modelLabel,
  canRegenerate,
  canEdit,
  onRegenerate,
  onEdit,
}: Props) {
  const [editing, setEditing] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="message user">
        <div className="message-content-wrapper">
          {editing ? (
            <UserEditor
              initial={message.content}
              onCancel={() => setEditing(false)}
              onSave={(text) => {
                setEditing(false);
                onEdit(message.id, text);
              }}
            />
          ) : (
            <div className="message-bubble">
              <div className="message-text">{message.content}</div>
            </div>
          )}
          <div className="message-meta">
            {canEdit && !editing && (
              <button type="button" className="icon-btn small" aria-label="Edit message" title="Edit" onClick={() => setEditing(true)}>
                <Pencil size={14} />
              </button>
            )}
            <CopyButton text={message.content} label="Copy message" />
            <span className="message-timestamp">{formatTime(message.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  const streaming = message.status === 'streaming';
  const thinking = streaming && !message.content && !!message.reasoning;
  const stats = message.stats;

  return (
    <div className="message assistant">
      <div className="bot-avatar">
        <Logo size={24} className="logo-icon" />
      </div>
      <div className="message-content-wrapper">
        {message.reasoning && (
          <Reasoning text={message.reasoning} thinking={thinking} durationMs={message.reasoningMs} />
        )}

        {(message.content || (streaming && !message.reasoning)) && (
          <div className={`message-bubble ${streaming ? 'is-streaming' : ''}`}>
            {message.content ? (
              <RichText text={message.content} />
            ) : (
              <div className="typing-dots" aria-label="Aiolio is typing">
                <span />
                <span />
                <span />
              </div>
            )}
            {message.status === 'stopped' && <div className="message-note">Stopped.</div>}
            {stats?.truncated && <div className="message-note">The reply hit the length limit and was cut off.</div>}
          </div>
        )}

        {message.error && (
          <div className="message-error" role="alert">
            <TriangleAlert size={16} />
            <span>{message.error.message}</span>
            {canRegenerate && (
              <button type="button" className="btn small" onClick={onRegenerate}>
                <RotateCcw size={14} /> Retry
              </button>
            )}
          </div>
        )}

        {message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}

        {message.remembered && message.remembered.length > 0 && (
          <div className="memory-pill" title={message.remembered.join('\n')}>
            <Brain size={13} /> Remembered: {message.remembered.join(' · ')}
          </div>
        )}

        {message.trimmed ? (
          <div className="message-note">
            {message.trimmed} older message{message.trimmed > 1 ? 's were' : ' was'} left out to fit the model's context
            window.
          </div>
        ) : null}

        {!streaming && (
          <div className="message-meta">
            <span className="message-timestamp">{formatTime(message.createdAt)}</span>
            {message.model && <span className="meta-chip">{modelLabel(message.model)}</span>}
            {stats?.tokensPerSecond ? (
              <span
                className="meta-chip speed"
                title={`${stats.completionTokens ?? '?'} tokens${stats.reasoningTokens ? ` (${stats.reasoningTokens} reasoning)` : ''}${
                  stats.ttftMs != null ? ` · first token after ${formatDuration(stats.ttftMs)}` : ''
                }`}
              >
                <Zap size={11} /> {stats.tokensPerSecond.toLocaleString()} tok/s
              </span>
            ) : null}
            {message.content && <CopyButton text={message.content} label="Copy reply" />}
            {canRegenerate && !message.error && (
              <button type="button" className="icon-btn small" aria-label="Regenerate reply" title="Regenerate" onClick={onRegenerate}>
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
