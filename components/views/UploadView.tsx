
import React, { useState } from 'react';
import { Upload, Languages, Cpu } from '../Icons';
import { LANGUAGES, MODELS } from '../../constants';

interface UploadViewProps {
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  onUpload: (file: File) => void;
}

const UploadView: React.FC<UploadViewProps> = ({
  targetLanguage,
  setTargetLanguage,
  selectedModel,
  setSelectedModel,
  onUpload
}) => {
  const [dragActive, setDragActive] = useState(false);

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
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div 
      className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500"
      onDragEnter={handleDrag}
    >
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Distill Knowledge from Books</h2>
        <p className="text-slate-500 max-w-md mx-auto">
          Upload an EPUB to get a comprehensive AI-generated summary and analysis using the most advanced Gemini models.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        {/* Language Selector */}
        <div className="flex items-center gap-3 bg-white p-2 px-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500">
            <Languages size={18} />
            <span className="text-sm font-medium">Language:</span>
          </div>
          <div className="relative">
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-bold text-slate-800 focus:ring-0 cursor-pointer py-1 pr-2 rounded-md hover:text-blue-600 transition-colors appearance-none"
              style={{ textAlignLast: 'center' }}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Model Selector */}
        <div className="flex items-center gap-3 bg-white p-2 px-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500">
            <Cpu size={18} />
            <span className="text-sm font-medium">Model:</span>
          </div>
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-bold text-slate-800 focus:ring-0 cursor-pointer py-1 pr-2 rounded-md hover:text-blue-600 transition-colors appearance-none"
              style={{ textAlignLast: 'center' }}
            >
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
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
};

export default UploadView;
