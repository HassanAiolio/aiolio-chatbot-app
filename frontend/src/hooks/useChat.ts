import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, extractMemories, streamChat } from '../api';
import { sessionTitle, uid } from '../lib/format';
import { loadSessions, saveSessions } from '../lib/storage';
import type { Message, ReasoningEffort, Session, Source } from '../types';
import type { Brain } from './useBrain';

interface Options {
  brain: Brain;
  model: string | null;
  reasoningEffort: ReasoningEffort;
  memoryEnabled: boolean;
  docsEnabled: boolean;
  notify: (message: string) => void;
}

function newSession(): Session {
  const now = Date.now();
  return { id: uid(), name: 'New chat', createdAt: now, updatedAt: now, messages: [] };
}

/** What we send as history: finished turns only, no failed placeholders. */
function toPayload(messages: Message[]) {
  return messages
    .filter((m) => m.content.trim() && !(m.role === 'assistant' && m.status === 'error' && !m.content))
    .map((m) => ({ role: m.role, content: m.content }));
}

export function useChat({ brain, model, reasoningEffort, memoryEnabled, docsEnabled, notify }: Options) {
  const [sessions, setSessions] = useState<Session[]>(loadSessions);
  const [currentId, setCurrentId] = useState<string | null>(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null,
  );
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const warnedStorage = useRef(false);

  // Persist. Streaming updates arrive every animation frame, so writes are batched: at most
  // every second while busy, shortly after the last change, and always when the page is hidden or closed.
  const latest = useRef(sessions);
  latest.current = sessions;
  const lastSaved = useRef(0);
  const persist = useCallback(() => {
    lastSaved.current = Date.now();
    if (!saveSessions(latest.current) && !warnedStorage.current) {
      warnedStorage.current = true;
      notify("This browser won't let Aiolio save chats (private mode or storage full).");
    }
  }, [notify]);

  useEffect(() => {
    const wait = Date.now() - lastSaved.current > 1_000 ? 0 : 300;
    const timer = setTimeout(persist, wait);
    return () => clearTimeout(timer);
  }, [sessions, persist]);

  useEffect(() => {
    const flush = () => persist();
    const onVisibility = () => document.visibilityState === 'hidden' && persist();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [persist]);

  const current = sessions.find((s) => s.id === currentId) ?? null;

  const updateSession = useCallback((id: string, update: (s: Session) => Session) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? update(s) : s)));
  }, []);

  const patchMessage = useCallback(
    (sessionId: string, messageId: string, patch: Partial<Message> | ((m: Message) => Partial<Message>)) => {
      updateSession(sessionId, (s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === messageId ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m,
        ),
      }));
    },
    [updateSession],
  );

  /** Stream an assistant reply for `history` (which ends with the user's message). */
  const complete = useCallback(
    async (sessionId: string, history: Message[]) => {
      const question = history[history.length - 1].content;

      let sources: Source[] | undefined;
      if (docsEnabled && brain.indexedChunks > 0) {
        const previousQuestion = [...history].reverse().filter((m) => m.role === 'user')[1]?.content ?? '';
        const hits = brain.search(`${question}\n${previousQuestion.slice(0, 300)}`);
        if (hits.length) {
          sources = hits.map((hit, i) => ({ index: i + 1, docId: hit.docId, docName: hit.docName, text: hit.text }));
        }
      }

      const assistant: Message = {
        id: uid(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        model: model ?? undefined,
        status: 'streaming',
        sources,
      };
      updateSession(sessionId, (s) => ({ ...s, updatedAt: Date.now(), messages: [...history, assistant] }));
      setStreamingId(assistant.id);

      const controller = new AbortController();
      abortRef.current = controller;

      // Tokens arrive faster than React should render; flush at most once per frame.
      const acc = { content: '', reasoning: '' };
      let frame = 0;
      const flush = () => {
        frame = 0;
        patchMessage(sessionId, assistant.id, { content: acc.content, reasoning: acc.reasoning || undefined });
      };
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(flush);
      };
      const started = performance.now();
      let reasoningMs: number | undefined;

      try {
        await streamChat(
          {
            model,
            messages: toPayload(history),
            memories: memoryEnabled ? brain.memories.map((m) => m.text) : [],
            context: sources?.map((s) => ({ source: s.docName, text: s.text })) ?? [],
            reasoningEffort,
          },
          {
            onMeta: (meta) => patchMessage(sessionId, assistant.id, { model: meta.model, trimmed: meta.trimmed || undefined }),
            onReasoning: (t) => {
              acc.reasoning += t;
              schedule();
            },
            onToken: (t) => {
              if (!acc.content && acc.reasoning) reasoningMs = performance.now() - started;
              acc.content += t;
              schedule();
            },
            onDone: (stats) => {
              cancelAnimationFrame(frame);
              patchMessage(sessionId, assistant.id, {
                content: acc.content,
                reasoning: acc.reasoning || undefined,
                reasoningMs,
                stats,
                status: 'done',
              });
            },
          },
          controller.signal,
        );
      } catch (err) {
        cancelAnimationFrame(frame);
        const aborted = (err as Error).name === 'AbortError';
        const error = err instanceof ApiError ? err : new ApiError('unknown', 'Something went wrong. Try again.');
        patchMessage(sessionId, assistant.id, {
          content: acc.content,
          reasoning: acc.reasoning || undefined,
          reasoningMs,
          status: aborted ? 'stopped' : 'error',
          error: aborted
            ? undefined
            : {
                code: error.code,
                message: error.retryAfter ? `${error.message} (retry in ${error.retryAfter}s)` : error.message,
              },
        });
        return;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setStreamingId(null);
      }

      // Learn from the exchange in the background; failures here never bother the user.
      if (memoryEnabled && acc.content) {
        try {
          const update = await extractMemories(
            question,
            acc.content,
            brain.memories.map((m) => m.text),
          );
          const added = brain.applyMemoryUpdate(update);
          if (added.length) patchMessage(sessionId, assistant.id, { remembered: added });
        } catch (err) {
          console.warn('Memory update skipped:', err);
        }
      }
    },
    [brain, docsEnabled, memoryEnabled, model, patchMessage, reasoningEffort, updateSession],
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || streamingId) return;
      let session = current;
      if (!session) {
        session = newSession();
        const created = session;
        setSessions((prev) => [created, ...prev]);
        setCurrentId(created.id);
      }
      const user: Message = { id: uid(), role: 'user', content, createdAt: Date.now() };
      const history = [...session.messages, user];
      if (session.messages.length === 0) {
        const name = sessionTitle(content);
        updateSession(session.id, (s) => ({ ...s, name }));
      }
      void complete(session.id, history);
    },
    [complete, current, streamingId, updateSession],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Throw away the last reply and ask again. */
  const regenerate = useCallback(() => {
    if (!current || streamingId) return;
    const messages = [...current.messages];
    while (messages.length && messages[messages.length - 1].role === 'assistant') messages.pop();
    if (messages.length) void complete(current.id, messages);
  }, [complete, current, streamingId]);

  /** Replace a user message (and everything after it) and resend. */
  const editAndResend = useCallback(
    (messageId: string, text: string) => {
      if (!current || streamingId || !text.trim()) return;
      const index = current.messages.findIndex((m) => m.id === messageId);
      if (index === -1) return;
      const edited: Message = { ...current.messages[index], content: text.trim(), createdAt: Date.now() };
      if (index === 0) updateSession(current.id, (s) => ({ ...s, name: sessionTitle(edited.content) }));
      void complete(current.id, [...current.messages.slice(0, index), edited]);
    },
    [complete, current, streamingId, updateSession],
  );

  const newChat = useCallback(() => {
    // Reuse an untouched empty chat instead of piling them up.
    const empty = sessions.find((s) => s.messages.length === 0);
    if (empty) {
      setCurrentId(empty.id);
      return;
    }
    const session = newSession();
    setSessions((prev) => [session, ...prev]);
    setCurrentId(session.id);
  }, [sessions]);

  const deleteSession = useCallback(
    (id: string) => {
      const removed = sessions.find((s) => s.id === id);
      if (!removed) return null;
      if (streamingId && removed.messages.some((m) => m.id === streamingId)) stop();
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentId === id) setCurrentId(null);
      return removed;
    },
    [currentId, sessions, stop, streamingId],
  );

  const restoreSession = useCallback((session: Session) => {
    setSessions((prev) => (prev.some((s) => s.id === session.id) ? prev : [session, ...prev]));
    setCurrentId(session.id);
  }, []);

  const renameSession = useCallback(
    (id: string, name: string) => {
      const clean = name.trim().slice(0, 80);
      if (clean) updateSession(id, (s) => ({ ...s, name: clean }));
    },
    [updateSession],
  );

  const clearSession = useCallback(
    (id: string) => {
      if (streamingId) stop();
      updateSession(id, (s) => ({ ...s, name: 'New chat', messages: [], updatedAt: Date.now() }));
    },
    [stop, streamingId, updateSession],
  );

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    sessions: sorted,
    current,
    currentId,
    selectSession: setCurrentId,
    streamingId,
    isStreaming: streamingId !== null,
    send,
    stop,
    regenerate,
    editAndResend,
    newChat,
    deleteSession,
    restoreSession,
    renameSession,
    clearSession,
  };
}
