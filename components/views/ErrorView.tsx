
import React, { useRef } from 'react';
import { AlertCircle } from '../Icons';
import { BookSession } from '../../types';
import { parserFactory } from '../../services/parserFactory';

interface ErrorViewProps {
  session: BookSession;
  onReset: () => void;
  onRetry?: (file: File) => void;
}

const ErrorView: React.FC<ErrorViewProps> = ({ session, onReset, onRetry }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supportedFormats = parserFactory.getSupportedFormats();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onRetry) {
      onRetry(file);
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
      <div className="p-4 bg-red-50 text-red-500 rounded-full mb-6 border border-red-100">
        <AlertCircle size={48} />
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Analysis Failed</h2>
      {session.metadata?.title && (
        <p className="text-sm text-slate-400 mb-1">
          {session.metadata.title}{session.metadata.author ? ` · ${session.metadata.author}` : ''}
        </p>
      )}
      <p className="text-slate-600 max-w-md mb-8">{session.message}</p>

      <div className="flex items-center gap-3">
        {onRetry && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={supportedFormats.accept}
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              Retry with File
            </button>
          </>
        )}
        <button
          onClick={onReset}
          className="px-6 py-2 bg-white text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          Try Another Book
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Retry will reuse the same language ({session.language}) and model ({session.model}).
      </p>
    </div>
  );
};

export default ErrorView;
