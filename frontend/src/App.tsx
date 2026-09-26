import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { fetchModels } from './api';
import { BrainPanel } from './components/BrainPanel';
import { ChatHeader } from './components/ChatHeader';
import { Composer, type ComposerHandle } from './components/Composer';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EmptyState } from './components/EmptyState';
import { MessageList } from './components/MessageList';
import { ModelPicker } from './components/ModelPicker';
import { Sidebar } from './components/Sidebar';
import { StatusBanner } from './components/StatusBanner';
import { Toast, useToast } from './components/Toast';
import { useBrain } from './hooks/useBrain';
import { useChat } from './hooks/useChat';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useServerStatus } from './hooks/useServerStatus';
import { downloadText, exportFilename, sessionToMarkdown } from './lib/exportChat';
import { loadSettings, saveSettings } from './lib/storage';
import type { ModelInfo, Settings } from './types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  useEffect(() => void saveSettings(settings), [settings]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'dark' ? '#0d0d0d' : '#ffffff');
  }, [settings.theme]);

  const isMobile = useMediaQuery('(max-width: 768px)');
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  useEffect(() => setSidebarOpen(!isMobile), [isMobile]);

  const { toast, show: notify, dismiss } = useToast();
  const server = useServerStatus();

  // Models come from Groq via the backend, so retired models disappear on their own.
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  useEffect(() => {
    if (server.status !== 'online' || models.length) return;
    setModelsLoading(true);
    fetchModels()
      .then((data) => {
        setModels(data.models);
        setDefaultModel(data.default);
      })
      .catch((err) => notify(`Couldn't load the model list: ${err.message}`))
      .finally(() => setModelsLoading(false));
  }, [server.status, models.length, notify]);

  const selectedModel =
    models.find((m) => m.id === settings.model) ?? models.find((m) => m.id === defaultModel) ?? models[0] ?? null;

  const modelLabel = useCallback(
    (id?: string) => models.find((m) => m.id === id)?.label ?? id?.split('/').pop() ?? '',
    [models],
  );

  const brain = useBrain();
  const chat = useChat({
    brain,
    model: selectedModel?.id ?? null,
    reasoningEffort: settings.reasoningEffort,
    memoryEnabled: settings.memoryEnabled,
    docsEnabled: settings.docsEnabled,
    notify,
  });

  const [brainOpen, setBrainOpen] = useState(false);
  const [brainTab, setBrainTab] = useState<'memory' | 'documents'>('memory');
  const [confirm, setConfirm] = useState<'clear' | 'forget' | null>(null);
  const composer = useRef<ComposerHandle>(null);

  const current = chat.current;
  const hasMessages = !!current && current.messages.length > 0;
  const streamingSessionId = useMemo(
    () => (chat.streamingId ? chat.sessions.find((s) => s.messages.some((m) => m.id === chat.streamingId))?.id ?? null : null),
    [chat.sessions, chat.streamingId],
  );

  const closeSidebarOnMobile = () => isMobile && setSidebarOpen(false);

  const handleDelete = (id: string) => {
    const removed = chat.deleteSession(id);
    if (removed && removed.messages.length) {
      notify('Chat deleted.', { label: 'Undo', onClick: () => chat.restoreSession(removed) });
    }
  };

  const handleUpload = (file: File) => {
    brain
      .addDocument(file)
      .then((doc) => {
        notify(`Added “${doc.name}” (${plural(doc.chunkCount, 'passage')}). Ask away.`);
        if (!settings.docsEnabled) update({ docsEnabled: true });
      })
      .catch((err: Error) => notify(err.message));
  };

  const openBrain = (tab: 'memory' | 'documents') => {
    setBrainTab(tab);
    setBrainOpen(true);
  };

  const enabledDocs = brain.documents.filter((d) => d.enabled).length;
  const statusHint = [
    settings.memoryEnabled
      ? brain.memories.length
        ? `Remembers ${plural(brain.memories.length, 'fact')}`
        : 'Memory on'
      : 'Memory off',
    settings.docsEnabled && enabledDocs ? `Reads ${plural(enabledDocs, 'doc')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="app-container">
      {isMobile && sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        open={sidebarOpen}
        sessions={chat.sessions}
        currentId={chat.currentId}
        streamingSessionId={streamingSessionId}
        theme={settings.theme}
        onNewChat={() => {
          chat.newChat();
          closeSidebarOnMobile();
          composer.current?.focus();
        }}
        onSelect={(id) => {
          chat.selectSession(id);
          closeSidebarOnMobile();
        }}
        onDelete={handleDelete}
        onToggleTheme={() => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
      />

      <main className="chat-area">
        <StatusBanner status={server.status} onRetry={server.retry} />

        <div className="chat-header-row">
          {isMobile && (
            <button type="button" className="mobile-menu-toggle" onClick={() => setSidebarOpen((o) => !o)} aria-label="Toggle chat list">
              <Menu size={20} />
            </button>
          )}
          <ChatHeader
            key={current?.id ?? 'none'}
            title={current?.name ?? 'New chat'}
            hasMessages={hasMessages}
            brainCount={brain.memories.length + brain.documents.length}
            modelPicker={
              <ModelPicker
                models={models}
                selected={selectedModel}
                effort={settings.reasoningEffort}
                loading={modelsLoading}
                onSelect={(id) => update({ model: id })}
                onEffort={(reasoningEffort) => update({ reasoningEffort })}
              />
            }
            onRename={(name) => current && chat.renameSession(current.id, name)}
            onExport={() => current && downloadText(exportFilename(current), sessionToMarkdown(current, models))}
            onClear={() => setConfirm('clear')}
            onOpenBrain={() => openBrain('memory')}
          />
        </div>

        {hasMessages ? (
          <MessageList
            sessionId={current.id}
            messages={current.messages}
            isStreaming={chat.isStreaming}
            modelLabel={modelLabel}
            onRegenerate={chat.regenerate}
            onEdit={chat.editAndResend}
          />
        ) : (
          <EmptyState
            modelLabel={selectedModel?.label ?? 'open models'}
            onPick={(prompt) => composer.current?.setText(prompt)}
            onOpenDocuments={() => openBrain('documents')}
          />
        )}

        <Composer
          ref={composer}
          isStreaming={chat.isStreaming}
          disabled={server.status === 'offline'}
          statusHint={statusHint}
          onSend={chat.send}
          onStop={chat.stop}
          onAttach={handleUpload}
          onError={notify}
        />
      </main>

      <BrainPanel
        open={brainOpen}
        tab={brainTab}
        brain={brain}
        memoryEnabled={settings.memoryEnabled}
        docsEnabled={settings.docsEnabled}
        onTab={setBrainTab}
        onClose={() => setBrainOpen(false)}
        onToggleMemory={() => update({ memoryEnabled: !settings.memoryEnabled })}
        onToggleDocs={() => update({ docsEnabled: !settings.docsEnabled })}
        onUpload={handleUpload}
        onClearMemories={() => setConfirm('forget')}
      />

      {confirm === 'clear' && current && (
        <ConfirmDialog
          title="Clear this chat?"
          message="All messages in this chat will be deleted from this browser. This can't be undone."
          confirmLabel="Clear chat"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            chat.clearSession(current.id);
            setConfirm(null);
          }}
        />
      )}
      {confirm === 'forget' && (
        <ConfirmDialog
          title="Forget everything?"
          message="Aiolio will forget every fact it has learned about you. Your chats and documents are kept."
          confirmLabel="Forget all"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            brain.clearMemories();
            setConfirm(null);
          }}
        />
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
