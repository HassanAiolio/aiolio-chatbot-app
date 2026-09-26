export type Role = 'user' | 'assistant';
export type ReasoningEffort = 'low' | 'medium' | 'high';
export type Theme = 'dark' | 'light';

export interface ModelInfo {
  id: string;
  label: string;
  description: string;
  context_window: number;
  owned_by: string;
  reasoning: boolean;
}

export interface Source {
  index: number;
  docId: string;
  docName: string;
  text: string;
}

export interface MessageStats {
  tokensPerSecond?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  ttftMs?: number | null;
  elapsedMs?: number | null;
  truncated?: boolean;
}

export type MessageStatus = 'streaming' | 'done' | 'error' | 'stopped';

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  model?: string;
  reasoning?: string;
  reasoningMs?: number;
  status?: MessageStatus;
  stats?: MessageStats;
  sources?: Source[];
  error?: { code: string; message: string };
  trimmed?: number;
  remembered?: string[];
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface Memory {
  id: string;
  text: string;
  createdAt: number;
  origin: 'auto' | 'manual';
}

export interface DocMeta {
  id: string;
  name: string;
  chars: number;
  chunkCount: number;
  addedAt: number;
  enabled: boolean;
}

export interface Settings {
  theme: Theme;
  model: string | null;
  reasoningEffort: ReasoningEffort;
  memoryEnabled: boolean;
  docsEnabled: boolean;
}
