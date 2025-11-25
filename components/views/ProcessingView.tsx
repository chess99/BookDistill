
import React from 'react';
import { Loader2, BookOpen } from '../Icons';
import { BookSession } from '../../types';
import { MODELS } from '../../constants';

interface ProcessingViewProps {
  session: BookSession;
}

const ProcessingView: React.FC<ProcessingViewProps> = ({ session }) => {
  return (
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
        <div className="flex gap-2 justify-center mt-2">
           <div className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            {MODELS.find(m => m.id === session.model)?.name || session.model}
          </div>
          <div className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
            {session.language}
          </div>
        </div>
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
};

export default ProcessingView;
