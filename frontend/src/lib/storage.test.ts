import { describe, expect, it } from 'vitest';
import type { Session } from '../types';
import { dateBucket, sessionTitle } from './format';
import { loadSessions, saveSessions } from './storage';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  quotaExceeded = false;
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.quotaExceeded) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(key, value);
  }
}

const session: Session = {
  id: 'a',
  name: 'Chat',
  createdAt: 1,
  updatedAt: 1,
  messages: [
    { id: 'm1', role: 'user', content: 'hi', createdAt: 1 },
    { id: 'm2', role: 'assistant', content: 'hel', createdAt: 1, status: 'streaming' },
  ],
};

describe('session storage', () => {
  it('round-trips and marks interrupted replies as stopped', () => {
    const store = new MemoryStorage();
    expect(saveSessions([session], store)).toBe(true);
    const [loaded] = loadSessions(store);
    expect(loaded.messages[1].status).toBe('stopped');
    expect(loaded.messages[1].content).toBe('hel');
  });

  it('survives corrupt data and a full quota', () => {
    const store = new MemoryStorage();
    store.setItem('aiolio:v2:sessions', '{not json');
    expect(loadSessions(store)).toEqual([]);
    store.quotaExceeded = true;
    expect(saveSessions([session], store)).toBe(false);
  });
});

describe('format helpers', () => {
  it('builds session titles from the first message', () => {
    expect(sessionTitle('  hello   world ')).toBe('hello world');
    expect(sessionTitle('x'.repeat(60))).toHaveLength(49);
    expect(sessionTitle('   ')).toBe('New chat');
  });

  it('buckets dates', () => {
    const now = new Date('2026-09-26T15:00:00').getTime();
    expect(dateBucket(now - 60_000, now)).toBe('Today');
    expect(dateBucket(now - 86_400_000, now)).toBe('Yesterday');
    expect(dateBucket(now - 4 * 86_400_000, now)).toBe('Previous 7 days');
    expect(dateBucket(now - 30 * 86_400_000, now)).toBe('Older');
  });
});
