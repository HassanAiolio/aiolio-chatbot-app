export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Incremental parser for text/event-stream. Feed it arbitrary chunks (network packets
 * split events anywhere) and it returns the events completed so far.
 */
export function createSSEParser() {
  let buffer = '';

  function parseBlock(block: string): SSEEvent | null {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    return data.length ? { event, data: data.join('\n') } : null;
  }

  return {
    feed(chunk: string): SSEEvent[] {
      buffer += chunk.replace(/\r\n?/g, '\n');
      const events: SSEEvent[] = [];
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const parsed = parseBlock(buffer.slice(0, boundary));
        if (parsed) events.push(parsed);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
      return events;
    },
    flush(): SSEEvent[] {
      const rest = buffer.trim() ? parseBlock(buffer) : null;
      buffer = '';
      return rest ? [rest] : [];
    },
  };
}

export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEParser();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* parser.feed(decoder.decode(value, { stream: true }));
    }
    yield* parser.feed(decoder.decode());
    yield* parser.flush();
  } finally {
    reader.releaseLock();
  }
}
