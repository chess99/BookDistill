import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from '@google/genai';
import { parseEpub } from './services/epubService';
import { BookMetadata, ProcessingState } from './types';
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
  CheckCircle
} from './components/Icons';

function App() {
  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [state, setState] = useState<ProcessingState>({ status: 'idle' });
  const [dragActive, setDragActive] = useState(false);
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Gemini Init
  // NOTE: In a real production app, user might supply key. 
  // For this prompt, we assume process.env.API_KEY is available or we ask user.
  // Since I cannot bake a key, I will verify if key exists, else prompt user or use env.
  const apiKey = process.env.API_KEY || ''; 

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.epub')) {
      setState({ status: 'error', message: 'Please upload a valid .epub file' });
      return;
    }

    setState({ status: 'parsing', message: 'Extracting text from EPUB...' });
    
    try {
      const { text, title, author } = await parseEpub(file);
      
      const meta = {
        title,
        author,
        rawTextLength: text.length
      };
      setMetadata(meta);
      setExtractedText(text);

      // Context Window Check (Rough estimation: 1 token ~= 4 chars)
      // gemini-2.5-flash has 1M token context (~4MB text)
      // gemini-3-pro-preview has 2M token context (~8MB text)
      // Let's use a safe limit of 3.5 million characters for flash (approx 875k tokens)
      const CHAR_LIMIT = 3500000; 
      
      if (text.length > CHAR_LIMIT) {
        setState({ 
          status: 'error', 
          message: `The book is too long (${(text.length/1000000).toFixed(1)}M chars). It exceeds the model's context window.` 
        });
        return;
      }

      generateSummary(text, title, author);

    } catch (e: any) {
      setState({ status: 'error', message: `Failed to parse EPUB: ${e.message}` });
    }
  };

  const generateSummary = async (text: string, title: string, author: string) => {
    if (!apiKey) {
      setState({ status: 'error', message: 'API Key not found in environment variables.' });
      return;
    }

    setState({ status: 'analyzing', message: 'Sending to Gemini 2.5 Flash for deep analysis...' });

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
        model: 'gemini-2.5-flash', // High context, fast, efficient
        contents: prompt,
        config: {
          temperature: 0.3, // Low temperature for factual accuracy
        }
      });

      const resultText = response.text;
      if (!resultText) throw new Error("No response text generated");

      setSummary(resultText);
      setState({ status: 'complete' });

    } catch (e: any) {
      console.error(e);
      setState({ status: 'error', message: `Gemini API Error: ${e.message}` });
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
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Action Handlers
  const handleCopy = () => {
    navigator.clipboard.writeText(summary);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([summary], {type: 'text/markdown'});
    element.href = URL.createObjectURL(file);
    element.download = `${metadata?.title || 'summary'}_distilled.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="flex-none h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <BookOpen size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">BookDistill</h1>
        </div>
        <div className="text-sm text-slate-500 font-medium">
          Powered by Gemini 2.5 Flash
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col relative">
        
        {state.status === 'idle' && (
          <div 
            className="flex-1 flex flex-col items-center justify-center p-8"
            onDragEnter={handleDrag}
          >
            <div 
              className={`
                w-full max-w-2xl aspect-video border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-6 transition-all duration-200
                ${dragActive ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-300 bg-white hover:border-slate-400'}
              `}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="p-4 bg-blue-100 text-blue-600 rounded-full">
                <Upload size={48} />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold text-slate-800">Drop your EPUB here</h2>
                <p className="text-slate-500">or click below to browse files</p>
              </div>
              <input 
                type="file" 
                id="epub-upload" 
                className="hidden" 
                accept=".epub"
                onChange={handleChange}
              />
              <label 
                htmlFor="epub-upload"
                className="px-8 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 cursor-pointer transition-colors shadow-lg shadow-slate-200"
              >
                Select File
              </label>
            </div>
            <p className="mt-8 text-sm text-slate-400 max-w-md text-center">
              Supports standard EPUB files. Gemini 2.5 Flash (1M context) will be used to read the entire book at once.
            </p>
          </div>
        )}

        {(state.status === 'parsing' || state.status === 'analyzing') && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8 animate-in fade-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-200 rounded-full animate-ping opacity-20"></div>
              <div className="p-6 bg-white rounded-full shadow-xl relative z-10">
                <Loader2 size={48} className="text-blue-600 animate-spin" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-slate-800">
                {state.status === 'parsing' ? 'Reading Book...' : 'Distilling Knowledge...'}
              </h2>
              <p className="text-slate-500">{state.message}</p>
              {metadata && (
                <div className="mt-4 p-3 bg-white rounded-lg border border-slate-200 shadow-sm inline-block text-left">
                   <p className="text-xs font-bold uppercase text-slate-400 mb-1">Current Book</p>
                   <p className="text-sm font-medium">{metadata.title}</p>
                   <p className="text-xs text-slate-500">{metadata.author}</p>
                   <p className="text-xs text-slate-400 mt-1">Length: {metadata.rawTextLength.toLocaleString()} chars</p>
                </div>
              )}
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="p-4 bg-red-100 text-red-600 rounded-full mb-6">
              <AlertCircle size={48} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Something went wrong</h2>
            <p className="text-slate-600 max-w-md mb-8">{state.message}</p>
            <button 
              onClick={() => setState({ status: 'idle', message: '' })}
              className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              Try Again
            </button>
          </div>
        )}

        {state.status === 'complete' && summary && (
          <div className="flex-1 flex overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
             {/* Sidebar / Metadata */}
             <div className="w-80 bg-white border-r border-slate-200 flex-none p-6 hidden md:flex flex-col gap-6 overflow-y-auto">
                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-400 mb-4 tracking-wider">Book Details</h3>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                    <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm w-10 h-10 flex items-center justify-center text-slate-400 mb-2">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 leading-snug">{metadata?.title}</p>
                      <p className="text-sm text-slate-500">{metadata?.author}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-400">
                        Processed {(metadata?.rawTextLength || 0).toLocaleString()} chars
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-1"></div>

                <div className="space-y-3">
                   <button 
                    onClick={handleCopy}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all group"
                  >
                    {copySuccess ? <CheckCircle size={18} className="text-green-500"/> : <Copy size={18} className="text-slate-400 group-hover:text-slate-600"/>}
                    <span className="font-medium text-sm">Copy Markdown</span>
                  </button>

                  <button 
                    onClick={handleDownload}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all group"
                  >
                    <Download size={18} className="text-slate-400 group-hover:text-slate-600"/>
                    <span className="font-medium text-sm">Download .md</span>
                  </button>

                  <button 
                    onClick={() => setIsGitHubModalOpen(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                  >
                    <Github size={18} />
                    <span className="font-medium text-sm">Save to GitHub</span>
                  </button>
                </div>
                
                <button 
                  onClick={() => { setState({ status: 'idle' }); setSummary(''); setMetadata(null); }}
                  className="text-xs text-center text-slate-400 hover:text-slate-600 mt-2"
                >
                  Process another book
                </button>
             </div>

             {/* Main Content Viewer */}
             <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-12">
               <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 min-h-full prose prose-slate prose-headings:font-bold prose-headings:text-slate-800 prose-p:text-slate-600 prose-a:text-blue-600 prose-strong:text-slate-800 prose-li:text-slate-600">
                 <ReactMarkdown>{summary}</ReactMarkdown>
               </div>
             </div>
          </div>
        )}
      </main>

      <GitHubModal 
        isOpen={isGitHubModalOpen} 
        onClose={() => setIsGitHubModalOpen(false)} 
        contentToSave={summary}
        defaultFilename={metadata ? `${metadata.title.replace(/\s+/g, '_').toLowerCase()}_summary.md` : 'summary.md'}
      />
    </div>
  );
}

export default App;
