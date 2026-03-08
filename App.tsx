
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import UploadView from './components/views/UploadView';
import SettingsView from './components/views/SettingsView';
import ProcessingView from './components/views/ProcessingView';
import ResultView from './components/views/ResultView';
import ErrorView from './components/views/ErrorView';
import { useBookSessions } from './hooks/useBookSessions';
import { useBookProcessor } from './hooks/useBookProcessor';
import { LANGUAGES } from './constants';
import { AIProviderConfig } from './types';

const DEFAULT_PROVIDER_CONFIG: AIProviderConfig = {
  provider: 'gemini',
  apiKey: '',
  baseUrl: '',
  model: 'gemini-2.5-pro-preview',
};

function loadProviderConfig(): AIProviderConfig {
  try {
    const saved = localStorage.getItem('book_distill_provider_config');
    if (saved) return { ...DEFAULT_PROVIDER_CONFIG, ...JSON.parse(saved) };
  } catch {}
  // Migrate legacy gemini key
  const legacyKey = localStorage.getItem('book_distill_gemini_api_key');
  if (legacyKey) return { ...DEFAULT_PROVIDER_CONFIG, apiKey: legacyKey };
  return DEFAULT_PROVIDER_CONFIG;
}

type ActiveView = 'upload' | 'settings';

function App() {
  const [targetLanguage, setTargetLanguage] = useState<string>(() =>
    localStorage.getItem('book_distill_pref_lang') || LANGUAGES[0].code
  );

  const [providerConfig, setProviderConfig] = useState<AIProviderConfig>(loadProviderConfig);

  const [activeView, setActiveView] = useState<ActiveView>('upload');

  useEffect(() => {
    localStorage.setItem('book_distill_pref_lang', targetLanguage);
  }, [targetLanguage]);

  useEffect(() => {
    localStorage.setItem('book_distill_provider_config', JSON.stringify(providerConfig));
  }, [providerConfig]);

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    activeSession,
    addSession,
    updateSession,
    deleteSession,
  } = useBookSessions();

  const { processBook } = useBookProcessor({
    addSession,
    updateSession,
    getProviderConfig: () => providerConfig,
  });

  const handleNewSession = () => {
    setActiveSessionId(null);
    setActiveView('upload');
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setActiveView('upload');
  };

  const renderContent = () => {
    // Settings page takes priority
    if (activeView === 'settings') {
      return (
        <SettingsView
          config={providerConfig}
          onChange={setProviderConfig}
        />
      );
    }

    if (!activeSessionId) {
      return (
        <UploadView
          targetLanguage={targetLanguage}
          setTargetLanguage={setTargetLanguage}
          providerConfig={providerConfig}
          onUpload={(file) => processBook(file, targetLanguage)}
          onOpenSettings={() => setActiveView('settings')}
        />
      );
    }

    if (!activeSession) return null;

    if (activeSession.status === 'error') {
      return (
        <ErrorView
          session={activeSession}
          onReset={() => setActiveSessionId(null)}
        />
      );
    }

    if (activeSession.status === 'parsing' || (activeSession.status === 'analyzing' && !activeSession.summary)) {
      return <ProcessingView session={activeSession} />;
    }

    return <ResultView session={activeSession} />;
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        activeView={activeView}
        onSelectSession={handleSelectSession}
        onDeleteSession={deleteSession}
        onNewSession={handleNewSession}
        onOpenSettings={() => setActiveView('settings')}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-50/50 pt-16 md:pt-0">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
