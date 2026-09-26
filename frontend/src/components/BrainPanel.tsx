import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Brain, FileText, LoaderCircle, Plus, Trash2, Upload, X } from 'lucide-react';
import type { Brain as BrainState } from '../hooks/useBrain';

interface Props {
  open: boolean;
  tab: 'memory' | 'documents';
  brain: BrainState;
  memoryEnabled: boolean;
  docsEnabled: boolean;
  onTab: (tab: 'memory' | 'documents') => void;
  onClose: () => void;
  onToggleMemory: () => void;
  onToggleDocs: () => void;
  onUpload: (file: File) => void;
  onClearMemories: () => void;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={onChange}>
      <span className="switch-thumb" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function BrainPanel({
  open,
  tab,
  brain,
  memoryEnabled,
  docsEnabled,
  onTab,
  onClose,
  onToggleMemory,
  onToggleDocs,
  onUpload,
  onClearMemories,
}: Props) {
  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach(onUpload);
  };

  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Memory and documents" tabIndex={-1} ref={panel}>
        <div className="drawer-header">
          <div className="drawer-title">
            <Brain size={20} /> Second brain
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'memory'} className={tab === 'memory' ? 'active' : ''} onClick={() => onTab('memory')}>
            Memory <span className="tab-count">{brain.memories.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'documents'} className={tab === 'documents' ? 'active' : ''} onClick={() => onTab('documents')}>
            Documents <span className="tab-count">{brain.documents.length}</span>
          </button>
        </div>

        {tab === 'memory' ? (
          <div className="drawer-body">
            <div className="setting-row">
              <div>
                <div className="setting-title">Remember things about me</div>
                <div className="setting-desc">
                  After each reply a small model picks out lasting facts (your job, stack, preferences) and Aiolio uses them in
                  every chat.
                </div>
              </div>
              <Switch checked={memoryEnabled} onChange={onToggleMemory} label="Toggle memory" />
            </div>

            <form
              className="add-memory"
              onSubmit={(e) => {
                e.preventDefault();
                brain.addMemory(draft);
                setDraft('');
              }}
            >
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a fact, e.g. “Prefers TypeScript”" maxLength={300} aria-label="New memory" />
              <button type="submit" className="icon-btn" disabled={!draft.trim()} aria-label="Add memory">
                <Plus size={18} />
              </button>
            </form>

            {brain.memories.length === 0 ? (
              <p className="drawer-empty">Nothing remembered yet. Tell Aiolio about yourself and it will pick things up.</p>
            ) : (
              <ul className="memory-list">
                {brain.memories.map((m) => (
                  <li key={m.id} className="memory-item">
                    <span>{m.text}</span>
                    <span className="memory-origin">{m.origin === 'auto' ? 'learned' : 'added'}</span>
                    <button type="button" className="icon-btn small danger" onClick={() => brain.removeMemory(m.id)} aria-label={`Forget “${m.text}”`}>
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {brain.memories.length > 0 && (
              <button type="button" className="btn ghost danger-text" onClick={onClearMemories}>
                Forget everything
              </button>
            )}
          </div>
        ) : (
          <div className="drawer-body">
            <div className="setting-row">
              <div>
                <div className="setting-title">Use my documents in answers</div>
                <div className="setting-desc">
                  The most relevant passages are found in your browser and sent with your question, and replies cite them as
                  [1], [2]…
                </div>
              </div>
              <Switch checked={docsEnabled} onChange={onToggleDocs} label="Toggle documents" />
            </div>

            <div
              className={`dropzone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
            >
              {brain.uploading ? (
                <>
                  <LoaderCircle size={22} className="spin" />
                  <span>Reading {brain.uploading}…</span>
                </>
              ) : (
                <>
                  <Upload size={22} />
                  <span>Drop a PDF, Markdown, text or code file, or click to browse</span>
                  <span className="dropzone-hint">Up to 5 MB</span>
                </>
              )}
              <input
                ref={fileInput}
                type="file"
                hidden
                multiple
                accept=".pdf,.txt,.md,.markdown,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.css,.sql,.yaml,.yml"
                onChange={(e) => {
                  Array.from(e.target.files ?? []).forEach(onUpload);
                  e.target.value = '';
                }}
              />
            </div>

            {brain.documents.length === 0 ? (
              <p className="drawer-empty">No documents yet.</p>
            ) : (
              <ul className="doc-list">
                {brain.documents.map((doc) => (
                  <li key={doc.id} className={`doc-item ${doc.enabled ? '' : 'disabled'}`}>
                    <FileText size={18} />
                    <div className="doc-info">
                      <span className="doc-name" title={doc.name}>
                        {doc.name}
                      </span>
                      <span className="doc-meta">
                        {(doc.chars / 1000).toFixed(doc.chars < 10_000 ? 1 : 0)}k chars · {doc.chunkCount} passages
                      </span>
                    </div>
                    <Switch checked={doc.enabled} onChange={() => brain.toggleDocument(doc.id)} label={`Use ${doc.name}`} />
                    <button type="button" className="icon-btn small danger" onClick={() => brain.removeDocument(doc.id)} aria-label={`Remove ${doc.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
