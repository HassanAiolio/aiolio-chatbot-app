import { Brain, CodeXml, FileText, Lightbulb } from 'lucide-react';
import { Logo } from './Logo';

const SUGGESTIONS = [
  {
    icon: Lightbulb,
    title: 'Explain a concept',
    prompt: 'Explain how HTTP streaming with server-sent events works, with a small example.',
  },
  {
    icon: CodeXml,
    title: 'Write some code',
    prompt: 'Write a Python function that retries an HTTP request with exponential backoff, and explain it briefly.',
  },
  {
    icon: Brain,
    title: 'Teach it about you',
    prompt: "I'm a developer who mostly works with Python and React. Keep that in mind when you answer me.",
  },
  {
    icon: FileText,
    title: 'Ask your documents',
    prompt: null,
  },
] as const;

interface Props {
  modelLabel: string;
  onPick: (prompt: string) => void;
  onOpenDocuments: () => void;
}

export function EmptyState({ modelLabel, onPick, onOpenDocuments }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <div className="empty-logo">
          <Logo size={64} className="logo-icon" />
        </div>
        <h2 className="empty-title">Your second brain.</h2>
        <p className="empty-tagline">
          Streaming answers from <strong>{modelLabel}</strong> on Groq. It remembers what matters about you and can read
          your documents. Everything stays in this browser.
        </p>
        <div className="suggestions">
          {SUGGESTIONS.map(({ icon: Icon, title, prompt }) => (
            <button
              key={title}
              type="button"
              className="suggestion"
              onClick={() => (prompt ? onPick(prompt) : onOpenDocuments())}
            >
              <Icon size={18} />
              <span className="suggestion-title">{title}</span>
              <span className="suggestion-text">{prompt ?? 'Upload a PDF or notes, then ask questions with citations.'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
