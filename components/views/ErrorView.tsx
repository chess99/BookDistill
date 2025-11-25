
import React from 'react';
import { AlertCircle } from '../Icons';
import { BookSession } from '../../types';

interface ErrorViewProps {
  session: BookSession;
  onReset: () => void;
}

const ErrorView: React.FC<ErrorViewProps> = ({ session, onReset }) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
      <div className="p-4 bg-red-50 text-red-500 rounded-full mb-6 border border-red-100">
        <AlertCircle size={48} />
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Analysis Failed</h2>
      <p className="text-slate-600 max-w-md mb-8">{session.message}</p>
      <button 
        onClick={onReset}
        className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
      >
        Try Another Book
      </button>
    </div>
  );
};

export default ErrorView;
