import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { uploadDocument } from '../api';
import { deleteChunks, getChunks, putChunks } from '../lib/docsStore';
import { uid } from '../lib/format';
import { SearchIndex, type SearchHit } from '../lib/retrieval';
import { loadDocuments, loadMemories, saveDocuments, saveMemories } from '../lib/storage';
import type { DocMeta, Memory } from '../types';

const MAX_MEMORIES = 50;
const MAX_DOCUMENTS = 20;

/** Long-term memory and uploaded documents: the "second brain", kept in this browser. */
export function useBrain() {
  const [memories, setMemories] = useState<Memory[]>(loadMemories);
  const [documents, setDocuments] = useState<DocMeta[]>(loadDocuments);
  const [index, setIndex] = useState(() => new SearchIndex());
  const [uploading, setUploading] = useState<string | null>(null);
  const chunkCache = useRef(new Map<string, string[]>());
  const memoriesRef = useRef(memories);
  memoriesRef.current = memories;

  useEffect(() => void saveMemories(memories), [memories]);
  useEffect(() => void saveDocuments(documents), [documents]);

  // Rebuild the search index whenever the set of enabled documents changes.
  const enabledKey = documents.filter((d) => d.enabled).map((d) => d.id).join(',');
  useEffect(() => {
    let cancelled = false;
    const enabled = documents.filter((d) => d.enabled);
    (async () => {
      const next = new SearchIndex();
      for (const doc of enabled) {
        let chunks = chunkCache.current.get(doc.id);
        if (!chunks) {
          try {
            chunks = await getChunks(doc.id);
          } catch {
            chunks = [];
          }
          chunkCache.current.set(doc.id, chunks);
        }
        for (const text of chunks) next.add({ docId: doc.id, docName: doc.name, text });
      }
      if (!cancelled) setIndex(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabledKey]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the enabled ids only

  const addMemory = useCallback((text: string, origin: Memory['origin'] = 'manual') => {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!clean) return;
    setMemories((prev) => {
      if (prev.some((m) => m.text.toLowerCase() === clean.toLowerCase())) return prev;
      return [{ id: uid(), text: clean, createdAt: Date.now(), origin }, ...prev].slice(0, MAX_MEMORIES);
    });
  }, []);

  const removeMemory = useCallback((id: string) => setMemories((prev) => prev.filter((m) => m.id !== id)), []);
  const clearMemories = useCallback(() => setMemories([]), []);

  /** Apply what the extraction model proposed; returns the facts that were actually new. */
  const applyMemoryUpdate = useCallback((update: { add: string[]; remove: string[] }) => {
    const removed = new Set(update.remove);
    let next = memoriesRef.current.filter((m) => !removed.has(m.text));
    const added: string[] = [];
    for (const text of update.add) {
      if (!next.some((m) => m.text.toLowerCase() === text.toLowerCase())) {
        next = [{ id: uid(), text, createdAt: Date.now(), origin: 'auto' as const }, ...next];
        added.push(text);
      }
    }
    if (added.length || next.length !== memoriesRef.current.length) {
      memoriesRef.current = next.slice(0, MAX_MEMORIES);
      setMemories(memoriesRef.current);
    }
    return added;
  }, []);

  const addDocument = useCallback(
    async (file: File): Promise<DocMeta> => {
      if (documents.length >= MAX_DOCUMENTS) throw new Error(`You can keep up to ${MAX_DOCUMENTS} documents.`);
      setUploading(file.name);
      try {
        const parsed = await uploadDocument(file);
        const doc: DocMeta = {
          id: uid(),
          name: parsed.name,
          chars: parsed.chars,
          chunkCount: parsed.chunks.length,
          addedAt: Date.now(),
          enabled: true,
        };
        await putChunks(doc.id, parsed.chunks);
        chunkCache.current.set(doc.id, parsed.chunks);
        setDocuments((prev) => [doc, ...prev]);
        return doc;
      } finally {
        setUploading(null);
      }
    },
    [documents.length],
  );

  const removeDocument = useCallback(async (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    chunkCache.current.delete(id);
    try {
      await deleteChunks(id);
    } catch {
      /* already gone */
    }
  }, []);

  const toggleDocument = useCallback(
    (id: string) => setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d))),
    [],
  );

  const search = useCallback((query: string, limit = 4): SearchHit[] => index.search(query, limit), [index]);

  return useMemo(
    () => ({
      memories,
      documents,
      uploading,
      indexedChunks: index.size,
      addMemory,
      removeMemory,
      clearMemories,
      applyMemoryUpdate,
      addDocument,
      removeDocument,
      toggleDocument,
      search,
    }),
    [memories, documents, uploading, index.size, addMemory, removeMemory, clearMemories, applyMemoryUpdate, addDocument, removeDocument, toggleDocument, search],
  );
}

export type Brain = ReturnType<typeof useBrain>;
