/**
 * 共享配置 - Web 和 CLI 通用
 */

export const LANGUAGES = [
  { code: 'Chinese', label: '中文 (Chinese)' },
  { code: 'English', label: 'English' },
  { code: 'Japanese', label: '日本語 (Japanese)' },
  { code: 'Korean', label: '한국어 (Korean)' },
  { code: 'Spanish', label: 'Español (Spanish)' },
  { code: 'French', label: 'Français (French)' },
  { code: 'German', label: 'Deutsch (German)' },
] as const;

// 各 provider 的预设模型（仅作参考提示，用户可自由填写）
// 更新时间: 2026-03-11
// 数据来源: OpenRouter API + 官方 SDK
export const PRESET_MODELS: Record<string, { id: string; name: string }[]> = {
  gemini: [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  ],
  openai: [
    { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro' },
    { id: 'gpt-5.4', name: 'GPT-5.4' },
    { id: 'gpt-5.3-chat', name: 'GPT-5.3 Chat' },
    { id: 'gpt-5.2', name: 'GPT-5.2' },
    { id: 'gpt-5.1', name: 'GPT-5.1' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
    { id: 'o4-mini', name: 'o4-mini' },
    { id: 'o3', name: 'o3' },
    { id: 'o3-mini', name: 'o3-mini' },
  ],
  anthropic: [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
  ],
  openai_compatible: [],
};

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openai_compatible: 'OpenAI Compatible',
};

export const PROVIDER_DEFAULT_BASE_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com',
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  openai_compatible: '',
};

// 默认配置
export const DEFAULTS = {
  LANGUAGE: LANGUAGES[0].code,  // 'Chinese'
  TEMPERATURE: 0.3,
  CONTEXT_WINDOW_CHAR_LIMIT: 3500000, // ~875k tokens
} as const;

// 系统指令模板
export const SYSTEM_INSTRUCTION_TEMPLATE = (language: string) => `
Expert Book Distiller.
Task: Extract detailed knowledge and insights from the provided book.
Constraint 1: Output MUST be in ${language} language.
Constraint 2: Use clean Markdown formatting.
`.trim();
