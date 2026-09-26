import { readSSE } from './lib/sse';
import type { MessageStats, ModelInfo, ReasoningEffort, Role } from './types';

export const API_URL = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.REACT_APP_API_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = `Request failed (${res.status}).`;
  try {
    const body = await res.json();
    if (body?.error?.message) {
      code = body.error.code ?? code;
      message = body.error.message;
    } else if (typeof body?.detail === 'string') {
      message = body.detail;
    }
  } catch {
    /* not JSON */
  }
  const retry = Number(res.headers.get('Retry-After'));
  return new ApiError(code, message, res.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('network', "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<T>;
}

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`, { signal, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export const fetchModels = () => request<{ default: string; models: ModelInfo[] }>('/api/models');

export interface ChatPayload {
  model: string | null;
  messages: { role: Role; content: string }[];
  memories: string[];
  context: { source: string; text: string }[];
  reasoningEffort?: ReasoningEffort;
}

export interface StreamHandlers {
  onMeta?: (meta: { model: string; trimmed: number }) => void;
  onReasoning?: (text: string) => void;
  onToken?: (text: string) => void;
  onDone?: (stats: MessageStats) => void;
}

/** POST /api/chat and dispatch its server-sent events. Rejects with ApiError on failure. */
export async function streamChat(payload: ChatPayload, handlers: StreamHandlers, signal: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: payload.model,
        messages: payload.messages,
        memories: payload.memories,
        context: payload.context,
        reasoning_effort: payload.reasoningEffort,
      }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('network', "Can't reach the server. It may be waking up — try again in a few seconds.");
  }
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError('no_stream', 'The server returned an empty response.');

  let finished = false;
  for await (const { event, data } of readSSE(res.body)) {
    const payloadData = JSON.parse(data);
    switch (event) {
      case 'meta':
        handlers.onMeta?.(payloadData);
        break;
      case 'reasoning':
        handlers.onReasoning?.(payloadData.t);
        break;
      case 'token':
        handlers.onToken?.(payloadData.t);
        break;
      case 'done':
        finished = true;
        handlers.onDone?.({
          tokensPerSecond: payloadData.tokens_per_second,
          completionTokens: payloadData.completion_tokens,
          reasoningTokens: payloadData.reasoning_tokens,
          ttftMs: payloadData.ttft_ms,
          elapsedMs: payloadData.elapsed_ms,
          truncated: payloadData.truncated,
        });
        break;
      case 'error':
        throw new ApiError(payloadData.code ?? 'stream_error', payloadData.message ?? 'The reply was interrupted.');
    }
  }
  if (!finished) throw new ApiError('interrupted', 'The connection dropped before the reply finished.');
}

export const extractMemories = (user: string, assistant: string, existing: string[]) =>
  request<{ add: string[]; remove: string[] }>('/api/memory/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, assistant, existing }),
  });

export function uploadDocument(file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<{ name: string; chars: number; chunks: string[] }>('/api/documents', { method: 'POST', body: form });
}

export function transcribe(audio: Blob, filename: string) {
  const form = new FormData();
  form.append('file', audio, filename);
  return request<{ text: string }>('/api/transcribe', { method: 'POST', body: form });
}
