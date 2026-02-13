
import React, { useState } from 'react';
import { Upload, Languages, Cpu } from '../Icons';
import { LANGUAGES, MODELS } from '../../constants';
import { parserFactory } from '../../services/parserFactory';

interface UploadViewProps {
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  geminiApiKey: string;
  setGeminiApiKey: (apiKey: string) => void;
  onUpload: (file: File) => void;
}

const UploadView: React.FC<UploadViewProps> = ({
  targetLanguage,
  setTargetLanguage,
  selectedModel,
  setSelectedModel,
  geminiApiKey,
  setGeminiApiKey,
  onUpload
}) => {
  const [dragActive, setDragActive] = useState(false);
  const hasApiKey = geminiApiKey.trim().length > 0;
  const supportedFormats = parserFactory.getSupportedFormats();

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
    if (!hasApiKey) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (!hasApiKey) return;
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 animate-in fade-in duration-500 overflow-y-auto"
      onDragEnter={handleDrag}
    >
      <div className="text-center mb-4 md:mb-6 px-2">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">Distill Knowledge from Books</h2>
        <p className="text-sm md:text-base text-slate-500 max-w-md mx-auto">
          Upload a book file to get a comprehensive AI-generated summary and analysis using the most advanced Gemini models.
        </p>
        <p className="text-xs md:text-sm text-slate-400 mt-2">
          Supported: {supportedFormats.extensions.map(e => e.toUpperCase()).join(', ')}
        </p>
      </div>

      <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-3 md:gap-4 mb-4 md:mb-8 px-2">
        {/* Language Selector */}
        <div className="flex items-center gap-2 md:gap-3 bg-white p-2 px-3 md:px-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-1 md:gap-2 text-slate-500">
            <Languages size={16} className="md:w-[18px] md:h-[18px]" />
            <span className="text-xs md:text-sm font-medium">Language:</span>
          </div>
          <div className="relative flex-1 sm:flex-initial">
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="bg-transparent border-none outline-none text-xs md:text-sm font-bold text-slate-800 focus:ring-0 cursor-pointer py-1 pr-2 rounded-md hover:text-blue-600 transition-colors appearance-none w-full"
              style={{ textAlignLast: 'center' }}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Model Selector */}
        <div className="flex items-center gap-2 md:gap-3 bg-white p-2 px-3 md:px-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-1 md:gap-2 text-slate-500">
            <Cpu size={16} className="md:w-[18px] md:h-[18px]" />
            <span className="text-xs md:text-sm font-medium">Model:</span>
          </div>
          <div className="relative flex-1 sm:flex-initial">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent border-none outline-none text-xs md:text-sm font-bold text-slate-800 focus:ring-0 cursor-pointer py-1 pr-2 rounded-md hover:text-blue-600 transition-colors appearance-none w-full"
              style={{ textAlignLast: 'center' }}
            >
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl mb-4 md:mb-6 px-2">
        <label htmlFor="gemini-api-key" className="block text-xs md:text-sm font-medium text-slate-700 mb-2">
          Gemini API Key
        </label>
        <input
          id="gemini-api-key"
          type="password"
          value={geminiApiKey}
          onChange={(e) => setGeminiApiKey(e.target.value)}
          placeholder="Paste your Gemini API key (stored in this browser)"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          autoComplete="off"
        />
        <p className="mt-2 text-[10px] md:text-xs text-slate-500">
          Stored in localStorage on this device only. Do not use a high-privilege key on shared machines.
        </p>
      </div>

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
        <div className="p-4 md:p-5 bg-blue-100 text-blue-600 rounded-full shadow-inner">
          <Upload size={32} className="md:w-10 md:h-10" />
        </div>
        <div className="text-center space-y-2 px-2">
          <p className="text-base md:text-lg font-semibold text-slate-800">Drop your book file here</p>
          <input
            type="file"
            id="epub-upload"
            className="hidden"
            accept={supportedFormats.accept}
            disabled={!hasApiKey}
            onChange={handleChange}
          />
          <label
            htmlFor="epub-upload"
            className={`inline-block px-5 md:px-6 py-2 md:py-2.5 text-xs md:text-sm font-medium rounded-lg transition-colors shadow-md hover:shadow-lg ${
              hasApiKey
                ? 'bg-slate-900 text-white hover:bg-slate-800 cursor-pointer active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            Browse Files
          </label>
          {!hasApiKey && (
            <p className="text-xs text-amber-600 px-4">Please enter your Gemini API key before uploading.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadView;
