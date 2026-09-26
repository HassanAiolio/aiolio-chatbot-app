export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(ms, 0).toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatContext(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 1024)}k` : `${tokens}`;
}

export function sessionTitle(firstMessage: string, max = 48): string {
  const clean = firstMessage.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean || 'New chat';
}

export type DateBucket = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

export function dateBucket(ts: number, now = Date.now()): DateBucket {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  if (ts >= startOfToday.getTime()) return 'Today';
  if (ts >= startOfToday.getTime() - day) return 'Yesterday';
  if (ts >= startOfToday.getTime() - 7 * day) return 'Previous 7 days';
  return 'Older';
}
