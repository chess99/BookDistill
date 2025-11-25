
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import UploadView from './components/views/UploadView';
import ProcessingView from './components/views/ProcessingView';
import ResultView from './components/views/ResultView';
import ErrorView from './components/views/ErrorView';
import { useBookSessions } from './hooks/useBookSessions';
import { useBookProcessor } from './hooks/useBookProcessor';
import { MODELS, LANGUAGES } from './constants';

function App() {
  // --- Global State ---
  // Language & Model preferences (persisted simply in localStorage)
  const [targetLanguage, setTargetLanguage] = useState<string>(() => 
    localStorage.getItem('book_distill_pref_lang') || LANGUAGES[0].code
  );
  const [selectedModel, setSelectedModel] = useState<string>(() => 
    localStorage.getItem('book_distill_pref_model') || MODELS[0].id
  );

  useEffect(() => {
    localStorage.setItem('book_distill_pref_lang', targetLanguage);
  }, [targetLanguage]);

  useEffect(() => {
    localStorage.setItem('book_distill_pref_model', selectedModel);
  }, [selectedModel]);

  // --- Logic Hooks ---
  const { 
    sessions, 
    activeSessionId, 
    setActiveSessionId, 
    activeSession, 
    addSession, 
    updateSession, 
    deleteSession 
  } = useBookSessions();

  const { processBook } = useBookProcessor({ addSession, updateSession });

  // --- View Rendering Logic ---
  const renderContent = () => {
    if (!activeSessionId) {
      return (
        <UploadView 
          targetLanguage={targetLanguage}
          setTargetLanguage={setTargetLanguage}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          onUpload={(file) => processBook(file, targetLanguage, selectedModel)}
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
        onSelectSession={setActiveSessionId}
        onDeleteSession={deleteSession}
        onNewSession={() => setActiveSessionId(null)}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-50/50">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
