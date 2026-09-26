import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu, Zap } from 'lucide-react';
import { formatContext } from '../lib/format';
import type { ModelInfo, ReasoningEffort } from '../types';

interface Props {
  models: ModelInfo[];
  selected: ModelInfo | null;
  effort: ReasoningEffort;
  loading: boolean;
  onSelect: (id: string) => void;
  onEffort: (effort: ReasoningEffort) => void;
}

const EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high'];

export function ModelPicker({ models, selected, effort, loading, onSelect, onEffort }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="model-picker" ref={root}>
      <button
        type="button"
        className="model-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading && !models.length}
      >
        <Cpu size={15} />
        <span className="model-trigger-label">{selected?.label ?? (loading ? 'Loading models…' : 'Choose a model')}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="model-menu">
          <div className="model-menu-title">Model · live from Groq</div>
          <ul role="listbox" aria-label="Models">
            {models.map((model) => (
              <li key={model.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={model.id === selected?.id}
                  className={`model-option ${model.id === selected?.id ? 'selected' : ''}`}
                  onClick={() => {
                    onSelect(model.id);
                    if (!model.reasoning) setOpen(false);
                  }}
                >
                  <span className="model-option-main">
                    <span className="model-option-label">
                      {model.label}
                      {model.reasoning && (
                        <span className="badge" title="Streams its reasoning before answering">
                          <Zap size={10} /> reasoning
                        </span>
                      )}
                    </span>
                    <span className="model-option-desc">
                      {model.description} · {formatContext(model.context_window)} context
                    </span>
                  </span>
                  {model.id === selected?.id && <Check size={16} />}
                </button>
              </li>
            ))}
          </ul>

          {selected?.reasoning && (
            <div className="effort">
              <span className="effort-label">Thinking effort</span>
              <div className="segmented" role="radiogroup" aria-label="Thinking effort">
                {EFFORTS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={effort === e}
                    className={effort === e ? 'active' : ''}
                    onClick={() => onEffort(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
