import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from '@google/genai';
import { parseEpub } from './services/epubService';
import { BookMetadata, BookSession } from './types';
import GitHubModal from './components/GitHubModal';
import { 
  Upload, 
  FileText, 
  Loader2, 
  Copy, 
  Download, 
  Github, 
  BookOpen,
  AlertCircle,
  CheckCircle,
  Plus,
  Trash2,
  Clock,
  ChevronRight
} from './components/Icons';

function App() {
  const [sessions, setSessions] = useState<BookSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Gemini Init
  const apiKey = process.env.API_KEY || ''; 

  // Helpers to get current active session
  const activeSession = sessions.find(s => s.id === activeSessionId);

  const createSession = async (file: File) => {
    if (!file.name.endsWith('.epub')) {
      // Could show global toast, but for now let's just return
      alert("Please upload a valid .epub file");
      return;
    }

    const newId = Date.now().toString();
    const newSession: BookSession = {
      id: newId,
      metadata: null,
      summary: '',
      status: 'parsing',
      message: 'Extracting text from EPUB...',
      timestamp: Date.now()
    };

    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);

    try {
      const { text, title, author } = await parseEpub(file);
      
      setSessions(prev => prev.map(s => {
        if (s.id === newId) {
          return {
            ...s,
            metadata: { title, author, rawTextLength: text.length }
          };
        }
        return s;
      }));

      // Context Window Check
      const CHAR_LIMIT = 3500000; // ~875k tokens
      
      if (text.length > CHAR_LIMIT) {
        updateSession(newId, { 
          status: 'error', 
          message: `The book is too long (${(text.length/1000000).toFixed(1)}M chars). It exceeds the model's context window.` 
        });
        return;
      }

      await generateSummary(newId, text, title, author);

    } catch (e: any) {
      updateSession(newId, { status: 'error', message: `Failed to parse EPUB: ${e.message}` });
    }
  };

  const updateSession = (id: string, updates: Partial<BookSession>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  };

  const generateSummary = async (sessionId: string, text: string, title: string, author: string) => {
    if (!apiKey) {
      updateSession(sessionId, { status: 'error', message: 'API Key not found in environment variables.' });
      return;
    }

    updateSession(sessionId, { status: 'analyzing', message: 'Sending to Gemini 2.5 Flash for deep analysis...' });

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `
        You are an expert literary critic and knowledge distillier.
        Please analyze the following book: "${title}" by ${author}.
        
        Your task is to provide a comprehensive knowledge extraction.
        Structure the response in Markdown format with the following sections:
        
        1. **Executive Summary**: A high-level overview of the book's core message.
        2. **Key Concepts & Ideas**: Detailed explanation of the main concepts presented.
        3. **Chapter-wise / Thematic Breakdown**: Deep dive into the structure and arguments.
        4. **Actionable Takeaways / Insights**: What can the reader learn or apply?
        5. **Notable Quotes**: Significant text from the book.

        Here is the full text of the book:
        ${text}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.3 }
      });

      const resultText = response.text;
      if (!resultText) throw new Error("No response text generated");

      updateSession(sessionId, { summary: resultText, status: 'complete' });

    } catch (e: any) {
      console.error(e);
      updateSession(sessionId, { status: 'error', message: `Gemini API Error: ${e.message}` });
    }
  };

  // Drag and Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      createSession(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      createSession(e.target.files[0]);
    }
  };

  // Action Handlers
  const handleCopy = () => {
    if (!activeSession?.summary) return;
    navigator.clipboard.writeText(activeSession.summary);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownload = () => {
    if (!activeSession?.summary) return;
    const element = document.createElement("a");
    const file = new Blob([activeSession.summary], {type: 'text/markdown'});
    const filename = activeSession.metadata 
      ? `${activeSession.metadata.title.replace(/\s+/g, '_')}_distilled.md`
      : 'summary.md';
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Render Helpers
  const renderUploadView = () => (
    <div 
      className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500"
      onDragEnter={handleDrag}
    >
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Distill Knowledge from Books</h2>
        <p className="text-slate-500 max-w-md mx-auto">
          Upload an EPUB to get a comprehensive AI-generated summary and analysis using Gemini 2.5 Flash.
        </p>
      </div>

      <div 
        className={`
          w-full max-w-2xl aspect-[2/1] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-6 transition-all duration-200
          ${dragActive ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="p-5 bg-blue-100 text-blue-600 rounded-full shadow-inner">
          <Upload size={40} />
        </div>
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-slate-800">Drop your EPUB here</p>
          <input 
            type="file" 
            id="epub-upload" 
            className="hidden" 
            accept=".epub"
            onChange={handleChange}
          />
          <label 
            htmlFor="epub-upload"
            className="inline-block px-6 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 cursor-pointer transition-colors shadow-md hover:shadow-lg"
          >
            Browse Files
          </label>
        </div>
      </div>
    </div>
  );

  const renderProcessingView = (session: BookSession) => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8 animate-in fade-in duration-500">
      <div className="relative">
        <div className="absolute inset-0 bg-blue-200 rounded-full animate-ping opacity-20"></div>
        <div className="p-6 bg-white rounded-full shadow-xl relative z-10 border border-slate-100">
          <Loader2 size={48} className="text-blue-600 animate-spin" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-slate-800">
          {session.status === 'parsing' ? 'Reading Book...' : 'Distilling Knowledge...'}
        </h2>
        <p className="text-slate-500">{session.message}</p>
        {session.metadata && (
          <div className="mt-6 p-4 bg-white rounded-xl border border-slate-200 shadow-sm inline-flex items-center gap-4 text-left max-w-md">
             <div className="p-2 bg-slate-50 rounded-lg">
               <BookOpen size={24} className="text-slate-400"/>
             </div>
             <div>
               <p className="font-bold text-slate-800">{session.metadata.title}</p>
               <p className="text-xs text-slate-500">{session.metadata.author}</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderErrorView = (session: BookSession) => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
      <div className="p-4 bg-red-50 text-red-500 rounded-full mb-6 border border-red-100">
        <AlertCircle size={48} />
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Analysis Failed</h2>
      <p className="text-slate-600 max-w-md mb-8">{session.message}</p>
      <button 
        onClick={() => setActiveSessionId(null)}
        className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
      >
        Try Another Book
      </button>
    </div>
  );

  const renderResultView = (session: BookSession) => (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Result Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
             <BookOpen size={20} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 leading-tight">{session.metadata?.title || 'Untitled Book'}</h2>
            <p className="text-xs text-slate-500">{session.metadata?.author}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="Copy Markdown"
          >
            {copySuccess ? <CheckCircle size={18} className="text-green-600"/> : <Copy size={18} />}
            <span className="hidden sm:inline">Copy</span>
          </button>
          
          <button 
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="Download Markdown"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Download</span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1"></div>

          <button 
            onClick={() => setIsGitHubModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 shadow-sm transition-all active:scale-95"
          >
            <Github size={18} />
            <span>Save to GitHub</span>
          </button>
        </div>
      </div>

      {/* Result Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 min-h-full prose prose-slate prose-headings:font-bold prose-headings:text-slate-800 prose-p:text-slate-600 prose-a:text-blue-600 prose-strong:text-slate-800 prose-li:text-slate-600">
           <ReactMarkdown>{session.summary}</ReactMarkdown>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      
      {/* Left Sidebar */}
      <div className="w-72 bg-white border-r border-slate-200 flex-col hidden md:flex z-20">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-blue-200 shadow-lg">
            <BookOpen size={18} />
          </div>
          <span className="font-bold text-lg tracking-tight">BookDistill</span>
        </div>

        <div className="p-4">
          <button 
            onClick={() => setActiveSessionId(null)}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 px-4 rounded-xl hover:bg-slate-800 transition-all shadow-md shadow-slate-200 font-medium"
          >
            <Plus size={18} />
            <span>New Extraction</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
             <Clock size={12} /> History
          </div>
          
          {sessions.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400 italic">
              No books processed yet.
            </div>
          )}

          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`
                group flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all border
                ${activeSessionId === session.id 
                  ? 'bg-blue-50 border-blue-100' 
                  : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-100'}
              `}
            >
              <div className={`
                mt-1 min-w-[24px] h-6 flex items-center justify-center rounded
                ${session.status === 'complete' ? 'text-green-500' : session.status === 'error' ? 'text-red-500' : 'text-blue-500'}
              `}>
                {session.status === 'parsing' || session.status === 'analyzing' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : session.status === 'error' ? (
                  <AlertCircle size={14} />
                ) : (
                  <FileText size={14} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${activeSessionId === session.id ? 'text-blue-700' : 'text-slate-700'}`}>
                  {session.metadata?.title || 'Untitled Book'}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {session.metadata?.author || (session.status === 'parsing' ? 'Processing...' : 'No Author')}
                </p>
              </div>
              <button 
                onClick={(e) => deleteSession(e, session.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">Powered by Gemini 2.5 Flash</p>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-50/50">
        {!activeSessionId && renderUploadView()}
        
        {activeSessionId && activeSession && (
          <>
            {(activeSession.status === 'parsing' || activeSession.status === 'analyzing') && renderProcessingView(activeSession)}
            {activeSession.status === 'error' && renderErrorView(activeSession)}
            {activeSession.status === 'complete' && renderResultView(activeSession)}
          </>
        )}
      </main>

      {/* Global Modals */}
      <GitHubModal 
        isOpen={isGitHubModalOpen} 
        onClose={() => setIsGitHubModalOpen(false)} 
        contentToSave={activeSession?.summary || ''}
        defaultFilename={activeSession?.metadata ? `${activeSession.metadata.title.replace(/\s+/g, '_').toLowerCase()}_summary.md` : 'summary.md'}
      />
    </div>
  );
}

export default App;