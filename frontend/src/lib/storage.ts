import type { DocMeta, Memory, Session, Settings } from '../types';

/**
 * Everything the user owns lives in this browser. The backend is stateless, so there is
 * nothing to lose when the free-tier server restarts and no way to see anyone else's chats.
 */

const KEYS = {
  sessions: 'aiolio:v2:sessions',
  memories: 'aiolio:v2:memories',
  documents: 'aiolio:v2:documents',
  settings: 'aiolio:v2:settings',
} as const;

function read<T>(key: string, fallback: T, store: Storage | undefined = globalThis.localStorage): T {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Returns false when the browser refuses (private mode, quota exceeded). */
function write(key: string, value: unknown, store: Storage | undefined = globalThis.localStorage): boolean {
  try {
    store?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSessions(store?: Storage): Session[] {
  const sessions = read<Session[]>(KEYS.sessions, [], store ?? globalThis.localStorage);
  if (!Array.isArray(sessions)) return [];
  // A reload in the middle of a reply leaves it "streaming" forever; mark it as stopped.
  return sessions
    .filter((s) => s && typeof s.id === 'string' && Array.isArray(s.messages))
    .map((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.status === 'streaming' ? { ...m, status: 'stopped' as const } : m)),
    }));
}

export const saveSessions = (sessions: Session[], store?: Storage) =>
  write(KEYS.sessions, sessions, store ?? globalThis.localStorage);

export const loadMemories = () => read<Memory[]>(KEYS.memories, []);
export const saveMemories = (memories: Memory[]) => write(KEYS.memories, memories);

export const loadDocuments = () => read<DocMeta[]>(KEYS.documents, []);
export const saveDocuments = (docs: DocMeta[]) => write(KEYS.documents, docs);

export function loadSettings(): Settings {
  const prefersLight =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches;
  const defaults: Settings = {
    theme: prefersLight ? 'light' : 'dark',
    model: null,
    reasoningEffort: 'medium',
    memoryEnabled: true,
    docsEnabled: true,
  };
  return { ...defaults, ...read<Partial<Settings>>(KEYS.settings, {}) };
}

export const saveSettings = (settings: Settings) => write(KEYS.settings, settings);

export function clearAllLocalData() {
  for (const key of Object.values(KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
