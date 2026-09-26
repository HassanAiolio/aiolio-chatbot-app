import { describe, expect, it } from 'vitest';
import type { Session } from '../types';
import { exportFilename, sessionToMarkdown } from './exportChat';

const session: Session = {
  id: 's1',
  name: 'Décorateurs Python ?',
  createdAt: 0,
  updatedAt: 0,
  messages: [
    { id: '1', role: 'user', content: 'What is a decorator?', createdAt: 0 },
    {
      id: '2',
      role: 'assistant',
      content: 'A function that wraps another [1].',
      createdAt: 0,
      model: 'openai/gpt-oss-120b',
      sources: [{ index: 1, docId: 'd', docName: 'python.pdf', text: '...' }],
    },
    { id: '3', role: 'assistant', content: '', createdAt: 0, status: 'error', error: { code: 'x', message: 'y' } },
  ],
};

describe('sessionToMarkdown', () => {
  it('writes both sides, model labels and sources, and skips failed empty replies', () => {
    const md = sessionToMarkdown(session, [
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', description: '', context_window: 1, owned_by: '', reasoning: true },
    ]);
    expect(md).toContain('# Décorateurs Python ?');
    expect(md).toContain('## You\n\nWhat is a decorator?');
    expect(md).toContain('## Aiolio · GPT-OSS 120B');
    expect(md).toContain('- [1] python.pdf');
    expect(md.match(/## Aiolio/g)).toHaveLength(1);
  });
});

describe('exportFilename', () => {
  it('slugifies the title', () => {
    expect(exportFilename(session)).toBe('aiolio-decorateurs-python.md');
    expect(exportFilename({ ...session, name: '???' })).toBe('aiolio-chat.md');
  });
});
