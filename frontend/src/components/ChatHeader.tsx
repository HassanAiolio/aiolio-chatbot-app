import { useState, type ReactNode } from 'react';
import { Brain, Download, Trash2 } from 'lucide-react';

interface Props {
  title: string;
  hasMessages: boolean;
  brainCount: number;
  modelPicker: ReactNode;
  onRename: (name: string) => void;
  onExport: () => void;
  onClear: () => void;
  onOpenBrain: () => void;
}

export function ChatHeader({ title, hasMessages, brainCount, modelPicker, onRename, onExport, onClear, onOpenBrain }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== title) onRename(draft);
  };

  return (
    <header className="chat-header">
      <div className="chat-header-title">
        {editing ? (
          <input
            className="title-input"
            value={draft}
            autoFocus
            maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
            aria-label="Chat name"
          />
        ) : (
          <h1
            className="session-title"
            title={hasMessages ? 'Double-click to rename' : undefined}
            onDoubleClick={() => {
              if (!hasMessages) return;
              setDraft(title);
              setEditing(true);
            }}
          >
            {title}
          </h1>
        )}
      </div>

      <div className="chat-header-actions">
        {modelPicker}
        <button type="button" className="icon-btn with-badge" onClick={onOpenBrain} aria-label="Open memory and documents" title="Memory & documents">
          <Brain size={18} />
          {brainCount > 0 && <span className="count-badge">{brainCount}</span>}
        </button>
        <button type="button" className="icon-btn hide-mobile" onClick={onExport} disabled={!hasMessages} aria-label="Export chat as Markdown" title="Export as Markdown">
          <Download size={18} />
        </button>
        <button type="button" className="icon-btn danger" onClick={onClear} disabled={!hasMessages} aria-label="Clear chat" title="Clear chat">
          <Trash2 size={18} />
        </button>
      </div>
    </header>
  );
}
