import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookSession } from '../../types';
import { MODELS } from '../../constants';
import GitHubModal from '../GitHubModal';
import { 
  Copy, 
  Download, 
  Github, 
  BookOpen, 
  CheckCircle,
  ArrowDown 
} from '../Icons';

interface ResultViewProps {
  session: BookSession;
}

const ResultView: React.FC<ResultViewProps> = ({ session }) => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  
  // Smart Scroll State
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const isGenerating = session.status !== 'complete' && session.status !== 'error';

  const sanitizeFilenamePart = (value: string, fallback: string) => {
    const sanitized = value
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_');
    return sanitized || fallback;
  };

  // Handle Scroll Logic
  const handleScroll = () => {
    if (!scrollRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // We consider "at bottom" if within 100px of the end
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;

    if (isAtBottom) {
      setIsAutoScroll(true);
      setShowScrollButton(false);
    } else {
      setIsAutoScroll(false);
      setShowScrollButton(true);
    }
  };

  // Auto-scroll Effect
  useEffect(() => {
    if (isAutoScroll && isGenerating && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [session.summary, isAutoScroll, isGenerating]);

  // Manual Scroll to Bottom Action
  const scrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    });
    // Re-enable auto-scroll immediately
    setIsAutoScroll(true);
    setShowScrollButton(false);
  };

  const handleCopy = () => {
    if (!session.summary) return;
    navigator.clipboard.writeText(session.summary);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownload = () => {
    if (!session.summary) return;
    const element = document.createElement("a");
    const file = new Blob([session.summary], {type: 'text/markdown'});
    const filename = session.metadata
      ? `${sanitizeFilenamePart(session.metadata.author || 'unknown-author', 'unknown-author')}-${sanitizeFilenamePart(session.metadata.title || 'untitled', 'untitled')}.md`
      : 'unknown-author-untitled.md';
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 relative">
      {/* Result Header */}
      <div className="flex-none bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
             <BookOpen size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 leading-tight truncate max-w-[200px] sm:max-w-md">{session.metadata?.title || 'Untitled Book'}</h2>
              {isGenerating && (
                 <span className="flex h-2 w-2 relative" title="Generating content...">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                 </span>
              )}
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <span className="truncate max-w-[150px]">{session.metadata?.author}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span className="text-slate-400">{session.language}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span className="text-blue-500 font-medium">
                {MODELS.find(m => m.id === session.model)?.shortName || 'Unknown Model'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleCopy}
            disabled={!session.summary}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              !session.summary 
                ? 'text-slate-300 cursor-not-allowed' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Copy Markdown"
          >
            {copySuccess ? <CheckCircle size={18} className="text-green-600"/> : <Copy size={18} />}
            <span className="hidden sm:inline">Copy</span>
          </button>
          
          <button 
            onClick={handleDownload}
            disabled={!session.summary}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              !session.summary 
                ? 'text-slate-300 cursor-not-allowed' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Download Markdown"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Download</span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1"></div>

          <button 
            onClick={() => setIsGitHubModalOpen(true)}
            disabled={!session.summary}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-all active:scale-95 ${
              !session.summary
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
            title="Save to GitHub"
          >
            <Github size={18} />
            <span>Save to GitHub</span>
          </button>
        </div>
      </div>

      {/* Result Content */}
      <div 
        className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 scroll-smooth" 
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 min-h-full">
           <div className="prose prose-slate max-w-none">
             <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({node, ...props}) => <h1 className="text-3xl font-extrabold text-slate-900 mb-6 pb-2 border-b border-slate-100" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-2xl font-bold text-slate-800 mt-10 mb-4 flex items-center gap-2" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-xl font-bold text-slate-700 mt-8 mb-3" {...props} />,
                p: ({node, ...props}) => <p className="text-slate-600 leading-relaxed mb-4" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc list-outside ml-6 space-y-2 text-slate-600 mb-6" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-6 space-y-2 text-slate-600 mb-6" {...props} />,
                li: ({node, ...props}) => <li className="pl-1" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-r-lg my-6 text-slate-700 italic" {...props} />,
                code: ({node, ...props}) => <code className="bg-slate-100 text-red-500 px-1 py-0.5 rounded text-sm font-mono" {...props} />,
                pre: ({node, ...props}) => <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto my-6" {...props} />,
                strong: ({node, ...props}) => <strong className="font-bold text-slate-900" {...props} />,
                a: ({node, ...props}) => <a className="text-blue-600 hover:underline" {...props} />,
                hr: ({node, ...props}) => <hr className="my-8 border-slate-200" {...props} />,
                // Table support
                table: ({node, ...props}) => (
                  <div className="overflow-x-auto my-8 rounded-lg border border-slate-200 shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200" {...props} />
                  </div>
                ),
                thead: ({node, ...props}) => <thead className="bg-slate-50" {...props} />,
                tbody: ({node, ...props}) => <tbody className="bg-white divide-y divide-slate-200" {...props} />,
                tr: ({node, ...props}) => <tr className="hover:bg-slate-50 transition-colors" {...props} />,
                th: ({node, ...props}) => <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider" {...props} />,
                td: ({node, ...props}) => <td className="px-6 py-4 whitespace-normal text-sm text-slate-600 leading-relaxed" {...props} />,
              }}
             >
               {session.summary}
             </ReactMarkdown>
           </div>
           
           {/* Blinking Cursor for streaming effect */}
           {isGenerating && (
             <div className="mt-4 flex items-center gap-2 text-slate-400 animate-pulse">
               <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
               <span className="text-xs font-medium">Gemini is writing...</span>
             </div>
           )}
        </div>
      </div>

      {/* Floating Scroll Button */}
      {showScrollButton && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center z-20 pointer-events-none">
          <button 
            onClick={scrollToBottom}
            className={`
              pointer-events-auto shadow-lg border border-slate-200
              flex items-center gap-2 px-4 py-2 rounded-full 
              text-sm font-semibold transition-all duration-300 transform translate-y-0
              ${isGenerating ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white text-slate-700 hover:bg-slate-50'}
            `}
          >
            {isGenerating && <span className="animate-pulse">●</span>}
            {isGenerating ? "New content" : "Scroll to bottom"}
            <ArrowDown size={16} />
          </button>
        </div>
      )}

      <GitHubModal 
        isOpen={isGitHubModalOpen} 
        onClose={() => setIsGitHubModalOpen(false)} 
        contentToSave={session.summary || ''}
        defaultFilename={
          session.metadata
            ? `${sanitizeFilenamePart(session.metadata.author || 'unknown-author', 'unknown-author')}-${sanitizeFilenamePart(session.metadata.title || 'untitled', 'untitled')}.md`
            : 'unknown-author-untitled.md'
        }
      />
    </div>
  );
};

export default ResultView;