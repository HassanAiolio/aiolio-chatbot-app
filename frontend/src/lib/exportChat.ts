import type { ModelInfo, Session } from '../types';
import { formatDateTime } from './format';

export function sessionToMarkdown(session: Session, models: ModelInfo[] = []): string {
  const label = (id?: string) => models.find((m) => m.id === id)?.label ?? id ?? '';
  const lines = [`# ${session.name}`, '', `_Exported from Aiolio on ${formatDateTime(Date.now())}_`, ''];

  for (const message of session.messages) {
    if (message.role === 'user') {
      lines.push(`## You`, '', message.content, '');
      continue;
    }
    if (!message.content && message.status === 'error') continue;
    const model = message.model ? ` · ${label(message.model)}` : '';
    lines.push(`## Aiolio${model}`, '', message.content, '');
    if (message.sources?.length) {
      lines.push('Sources:', ...message.sources.map((s) => `- [${s.index}] ${s.docName}`), '');
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

export function exportFilename(session: Session): string {
  const slug = session.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `aiolio-${slug || 'chat'}.md`;
}

export function downloadText(filename: string, text: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
