
import React from 'react';
import { BookSession } from '../types';
import { MODELS } from '../constants';
import { 
  BookOpen, 
  Plus, 
  Clock, 
  Loader2, 
  AlertCircle, 
  FileText, 
  Trash2 
} from './Icons';

interface SidebarProps {
  sessions: BookSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewSession: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  sessions, 
  activeSessionId, 
  onSelectSession, 
  onDeleteSession, 
  onNewSession 
}) => {
  return (
    <div className="w-72 bg-white border-r border-slate-200 flex-col hidden md:flex z-20">
      <div className="p-4 border-b border-slate-100 flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-blue-200 shadow-lg">
          <BookOpen size={18} />
        </div>
        <span className="font-bold text-lg tracking-tight">BookDistill</span>
      </div>

      <div className="p-4">
        <button 
          onClick={onNewSession}
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
            onClick={() => onSelectSession(session.id)}
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
              {session.status === 'parsing' || (session.status === 'analyzing' && !session.summary) ? (
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
              <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                 <div className="flex items-center gap-1">
                   <span className="truncate max-w-[60px]">
                    {session.metadata?.author || (session.status === 'parsing' ? '...' : 'No Author')}
                   </span>
                 </div>
                 <div className="flex items-center gap-1 opacity-70">
                   <span className="bg-slate-100 px-1 rounded text-[10px] uppercase">{session.language.substring(0, 2)}</span>
                   <span className="text-[10px] text-blue-500">{MODELS.find(m => m.id === session.model)?.shortName?.split(' ')[1] || 'AI'}</span>
                 </div>
              </div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
              title="Remove"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      
      <div className="p-4 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-400">Powered by Gemini 2.5 & 3.0</p>
      </div>
    </div>
  );
};

export default Sidebar;
