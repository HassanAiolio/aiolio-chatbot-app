import { useMemo, useState } from 'react';
import { Moon, Plus, Search, Sun, X } from 'lucide-react';
import { dateBucket, type DateBucket } from '../lib/format';
import type { Session, Theme } from '../types';
import { Logo } from './Logo';

interface Props {
  open: boolean;
  sessions: Session[];
  currentId: string | null;
  streamingSessionId: string | null;
  theme: Theme;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleTheme: () => void;
}

const ORDER: DateBucket[] = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];

export function Sidebar({ open, sessions, currentId, streamingSessionId, theme, onNewChat, onSelect, onDelete, onToggleTheme }: Props) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Search titles and message contents.
    const visible = sessions.filter(
      (s) =>
        (s.messages.length > 0 || s.id === currentId) &&
        (!q || s.name.toLowerCase().includes(q) || s.messages.some((m) => m.content.toLowerCase().includes(q))),
    );
    const byBucket = new Map<DateBucket, Session[]>();
    for (const session of visible) {
      const bucket = dateBucket(session.updatedAt);
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), session]);
    }
    return ORDER.filter((b) => byBucket.has(b)).map((b) => [b, byBucket.get(b)!] as const);
  }, [sessions, query, currentId]);

  return (
    <aside className={`sidebar ${open ? 'open' : 'closed'}`} aria-label="Chats">
      <div className="sidebar-header">
        <div className="logo-container">
          <Logo size={30} className="logo-icon" />
          <span className="logo-text">Aiolio</span>
        </div>
        <p className="tagline">Your second brain.</p>
      </div>

      <div className="sidebar-content">
        <button type="button" className="new-chat-btn" onClick={onNewChat}>
          <Plus size={18} /> New chat
        </button>

        <label className="search-input-container">
          <Search size={16} />
          <input type="search" placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search chats" />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>

        <nav className="sessions-list">
          {groups.length === 0 && <p className="sessions-empty">{query ? 'No chats match.' : 'No chats yet.'}</p>}
          {groups.map(([bucket, items]) => (
            <div key={bucket} className="session-group">
              <div className="session-group-label">{bucket}</div>
              {items.map((session) => (
                <div key={session.id} className={`session-item ${session.id === currentId ? 'active' : ''}`}>
                  <button
                    type="button"
                    className="session-select"
                    onClick={() => onSelect(session.id)}
                    aria-current={session.id === currentId ? 'page' : undefined}
                    title={session.name}
                  >
                    {session.id === streamingSessionId && <span className="live-dot" aria-label="Replying" />}
                    <span className="session-name">{session.name}</span>
                  </button>
                  <button
                    type="button"
                    className="delete-session-btn"
                    onClick={() => onDelete(session.id)}
                    aria-label={`Delete chat “${session.name}”`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <button type="button" className="theme-toggle" onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
        </button>
        <p className="privacy-note">Chats, memory and documents are stored only in this browser.</p>
      </div>
    </aside>
  );
}
