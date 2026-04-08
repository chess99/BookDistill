
import React, { useState } from 'react';
import { AIProviderConfig, AIProvider } from '../../types';
import { PRESET_MODELS, PROVIDER_LABELS, PROVIDER_DEFAULT_BASE_URLS } from '../../constants';
import { Settings, Cpu } from '../Icons';

interface SettingsViewProps {
  config: AIProviderConfig;
  onChange: (config: AIProviderConfig) => void;
}

const PROVIDERS: AIProvider[] = ['gemini', 'openai', 'anthropic', 'openai_compatible'];

const API_KEY_PLACEHOLDERS: Record<AIProvider, string> = {
  gemini: 'AIza...',
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  openai_compatible: 'Your API key',
};

const API_KEY_HELP_URLS: Partial<Record<AIProvider, string>> = {
  gemini: 'https://aistudio.google.com/app/apikey',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
};

const SettingsView: React.FC<SettingsViewProps> = ({ config, onChange }) => {
  const [showKey, setShowKey] = useState(false);
  const [customModel, setCustomModel] = useState('');

  const presets = PRESET_MODELS[config.provider] ?? [];
  const isCustomModel = presets.length === 0 || !presets.find(p => p.id === config.model);

  const update = (patch: Partial<AIProviderConfig>) => {
    onChange({ ...config, ...patch });
  };

  const handleProviderChange = (provider: AIProvider) => {
    const defaultModel = PRESET_MODELS[provider]?.[0]?.id ?? '';
    update({ provider, model: defaultModel, baseUrl: '' });
    setCustomModel('');
  };

  const handleModelSelect = (modelId: string) => {
    if (modelId === '__custom__') {
      update({ model: customModel });
    } else {
      update({ model: modelId });
      setCustomModel('');
    }
  };

  const helpUrl = API_KEY_HELP_URLS[config.provider];
  const showBaseUrl = config.provider === 'openai_compatible' || config.provider === 'openai' || config.provider === 'anthropic';

  return (
    <div className="flex-1 flex flex-col items-center justify-start p-6 md:p-10 overflow-y-auto animate-in fade-in duration-300">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
            <Settings size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Settings</h2>
            <p className="text-sm text-slate-500">Configure your AI provider and model</p>
          </div>
        </div>

        {/* Provider */}
        <section className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-3">AI Provider</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PROVIDERS.map(p => (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  config.provider === p
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
        </section>

        {/* API Key */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-700">API Key</label>
            {helpUrl && (
              <a
                href={helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
              >
                Get API key →
              </a>
            )}
          </div>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={config.apiKey}
              onChange={e => update({ apiKey: e.target.value })}
              placeholder={API_KEY_PLACEHOLDERS[config.provider]}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-20 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Stored in your browser's localStorage only. Never sent anywhere except the AI provider.
          </p>
        </section>

        {/* Base URL (optional override) */}
        {showBaseUrl && (
          <section className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Base URL
              {config.provider !== 'openai_compatible' && (
                <span className="ml-2 text-xs font-normal text-slate-400">(optional override)</span>
              )}
            </label>
            <input
              type="url"
              value={config.baseUrl ?? ''}
              onChange={e => update({ baseUrl: e.target.value })}
              placeholder={
                config.provider === 'openai_compatible'
                  ? 'https://your-endpoint.example.com'
                  : PROVIDER_DEFAULT_BASE_URLS[config.provider]
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              autoComplete="off"
              spellCheck={false}
            />
            {config.provider === 'openai_compatible' && (
              <p className="mt-1.5 text-xs text-slate-400">
                Endpoint must expose an OpenAI-compatible <code className="bg-slate-100 px-1 rounded">/v1/chat/completions</code> API.
              </p>
            )}
          </section>
        )}

        {/* Model */}
        <section className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            <span className="flex items-center gap-1.5">
              <Cpu size={14} />
              Model
            </span>
          </label>

          {presets.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {presets.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleModelSelect(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    config.model === p.id && !isCustomModel
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={isCustomModel ? config.model : customModel}
              onChange={e => {
                setCustomModel(e.target.value);
                update({ model: e.target.value });
              }}
              placeholder={presets.length > 0 ? 'Or type a custom model ID...' : 'Model ID (e.g. gpt-4o, llama-3.3-70b)'}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              spellCheck={false}
            />
          </div>
          {config.model && (
            <p className="mt-1.5 text-xs text-slate-500">
              Active model: <span className="font-mono font-medium text-slate-700">{config.model}</span>
            </p>
          )}
        </section>

        {/* Status indicator */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          config.apiKey && config.model
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-amber-50 border border-amber-200 text-amber-700'
        }`}>
          <span className={`w-2 h-2 rounded-full flex-none ${config.apiKey && config.model ? 'bg-green-500' : 'bg-amber-400'}`} />
          {config.apiKey && config.model
            ? `Ready — ${PROVIDER_LABELS[config.provider]} / ${config.model}`
            : 'Please set an API key and model to continue'}
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
