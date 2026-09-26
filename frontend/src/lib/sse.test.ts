import { describe, expect, it } from 'vitest';
import { createSSEParser, readSSE } from './sse';

describe('createSSEParser', () => {
  it('parses complete events', () => {
    const parser = createSSEParser();
    const events = parser.feed('event: token\ndata: {"t":"Hi"}\n\nevent: done\ndata: {}\n\n');
    expect(events).toEqual([
      { event: 'token', data: '{"t":"Hi"}' },
      { event: 'done', data: '{}' },
    ]);
  });

  it('handles events split across arbitrary chunks', () => {
    const parser = createSSEParser();
    const stream = 'event: token\ndata: {"t":"Hel"}\n\nevent: token\ndata: {"t":"lo"}\n\n';
    const events = [];
    for (let i = 0; i < stream.length; i += 5) events.push(...parser.feed(stream.slice(i, i + 5)));
    expect(events.map((e) => JSON.parse(e.data).t).join('')).toBe('Hello');
  });

  it('normalises CRLF, skips comments and joins multi-line data', () => {
    const parser = createSSEParser();
    const events = parser.feed(': keep-alive\r\n\r\ndata: line one\r\ndata: line two\r\n\r\n');
    expect(events).toEqual([{ event: 'message', data: 'line one\nline two' }]);
  });

  it('flushes a trailing event without a blank line', () => {
    const parser = createSSEParser();
    expect(parser.feed('event: done\ndata: {}')).toEqual([]);
    expect(parser.flush()).toEqual([{ event: 'done', data: '{}' }]);
  });
});

describe('readSSE', () => {
  it('decodes a byte stream, including multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('event: token\ndata: {"t":"café ☕"}\n\n');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 27));
        controller.enqueue(bytes.slice(27));
        controller.close();
      },
    });
    const events = [];
    for await (const event of readSSE(body)) events.push(event);
    expect(JSON.parse(events[0].data).t).toBe('café ☕');
  });
});
