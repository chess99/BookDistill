
import React, { useState } from 'react';
import { Upload, Languages, Settings } from '../Icons';
import { LANGUAGES } from '../../constants';
import { parserFactory } from '../../services/parserFactory';
import { AIProviderConfig } from '../../types';
import { PROVIDER_LABELS } from '../../constants';

interface UploadViewProps {
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  providerConfig: AIProviderConfig;
  onUpload: (file: File) => void;
  onOpenSettings: () => void;
}

const UploadView: React.FC<UploadViewProps> = ({
  targetLanguage,
  setTargetLanguage,
  providerConfig,
  onUpload,
  onOpenSettings,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const isReady = providerConfig.apiKey.trim().length > 0 && providerConfig.model.trim().length > 0;
  const supportedFormats = parserFactory.getSupportedFormats();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!isReady) return;
    if (e.dataTransfer.files?.[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (!isReady) return;
    if (e.target.files?.[0]) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 animate-in fade-in duration-500 overflow-y-auto"
      onDragEnter={handleDrag}
    >
      <div className="text-center mb-6 px-2">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">Distill Knowledge from Books</h2>
        <p className="text-sm md:text-base text-slate-500 max-w-md mx-auto">
          Upload a book file to get a comprehensive AI-generated summary and analysis.
        </p>
        <p className="text-xs text-slate-400 mt-2">
          Supported: {supportedFormats.extensions.map(e => e.toUpperCase()).join(', ')}
        </p>
      </div>

      {/* Controls Row */}
      <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-3 mb-6 px-2">
        {/* Language Selector */}
        <div className="flex items-center gap-2 bg-white p-2 px-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500">
            <Languages size={16} />
            <span className="text-xs md:text-sm font-medium">Language:</span>
          </div>
          <select
            value={targetLanguage}
            onChange={e => setTargetLanguage(e.target.value)}
            className="bg-transparent border-none outline-none text-xs md:text-sm font-bold text-slate-800 focus:ring-0 cursor-pointer py-1 pr-2 rounded-md hover:text-blue-600 transition-colors appearance-none"
            style={{ textAlignLast: 'center' }}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </div>

        {/* Model indicator / Settings shortcut */}
        <button
          onClick={onOpenSettings}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border shadow-sm transition-all hover:shadow-md text-left ${
            isReady
              ? 'bg-white border-slate-200 hover:border-blue-300'
              : 'bg-amber-50 border-amber-200 hover:border-amber-400'
          }`}
        >
          <Settings size={16} className={isReady ? 'text-slate-400' : 'text-amber-500'} />
          <div className="min-w-0">
            {isReady ? (
              <>
                <span className="text-xs text-slate-400 block leading-none mb-0.5">{PROVIDER_LABELS[providerConfig.provider]}</span>
                <span className="text-xs font-bold text-slate-700 font-mono truncate block max-w-[160px]">{providerConfig.model}</span>
              </>
            ) : (
              <span className="text-xs font-medium text-amber-700">Configure API key & model →</span>
            )}
          </div>
        </button>
      </div>

      {/* Drop Zone */}
      <div
        className={`
          w-full max-w-2xl min-h-[200px] md:aspect-[2/1] border-2 border-dashed rounded-2xl md:rounded-3xl
          flex flex-col items-center justify-center gap-4 md:gap-6 p-6 md:p-8
          transition-all duration-200
          ${dragActive ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className={`p-4 md:p-5 rounded-full shadow-inner ${isReady ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
          <Upload size={32} className="md:w-10 md:h-10" />
        </div>
        <div className="text-center space-y-2 px-2">
          <p className="text-base md:text-lg font-semibold text-slate-800">Drop your book file here</p>
          <input
            type="file"
            id="book-upload"
            className="hidden"
            accept={supportedFormats.accept}
            disabled={!isReady}
            onChange={handleChange}
          />
          <label
            htmlFor="book-upload"
            className={`inline-block px-5 md:px-6 py-2 md:py-2.5 text-xs md:text-sm font-medium rounded-lg transition-colors shadow-md hover:shadow-lg ${
              isReady
                ? 'bg-slate-900 text-white hover:bg-slate-800 cursor-pointer active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            Browse Files
          </label>
          {!isReady && (
            <p className="text-xs text-amber-600 px-4">
              Please{' '}
              <button onClick={onOpenSettings} className="underline hover:text-amber-800">
                configure your AI provider
              </button>{' '}
              before uploading.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadView;
