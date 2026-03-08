/**
 * BookDistill CLI 配置管理
 * 配置文件路径: ~/.bookdistill/config.json
 *
 * 结构参考 openclaw/claude-code 风格:
 * - providers: 多 provider 配置
 * - defaults: 默认 provider/model/language
 * - github: GitHub 发布配置
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

export type ProviderType = 'gemini' | 'openai' | 'anthropic' | 'openai_compatible';

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  /** 'openai-completions' (default) | 'gemini' */
  api?: 'openai-completions' | 'gemini';
}

export interface ModelShortcut {
  /** e.g. "bailian/qwen3.5-plus" → provider="bailian", model="qwen3.5-plus" */
  [alias: string]: Record<string, never>;
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  /** Default folder path in the repo, e.g. "notes/books" */
  path?: string;
}

export interface BookDistillConfig {
  /** Named provider configs, key is arbitrary (e.g. "gemini", "bailian", "local") */
  providers: Record<string, ProviderConfig & { type: ProviderType }>;

  defaults: {
    /** Key into providers, e.g. "bailian" */
    provider: string;
    /** Model ID, e.g. "qwen3.5-plus" */
    model: string;
    /** Output language, e.g. "Chinese" */
    language: string;
  };

  github?: GitHubConfig;
}

// ── Paths ────────────────────────────────────────────────────────────────────

export const CONFIG_DIR = path.join(os.homedir(), '.bookdistill');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

// ── Default config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BookDistillConfig = {
  providers: {
    gemini: {
      type: 'gemini',
      apiKey: '',
    },
  },
  defaults: {
    provider: 'gemini',
    model: 'gemini-2.5-pro-preview',
    language: 'Chinese',
  },
};

// ── Read / Write ─────────────────────────────────────────────────────────────

export function readConfig(): BookDistillConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return DEFAULT_CONFIG;
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BookDistillConfig>;
    // Merge with defaults so missing keys don't crash
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      defaults: { ...DEFAULT_CONFIG.defaults, ...parsed.defaults },
      providers: { ...DEFAULT_CONFIG.providers, ...parsed.providers },
    };
  } catch (e: any) {
    throw new Error(`Failed to parse ${CONFIG_PATH}: ${e.message}`);
  }
}

export function writeConfig(config: BookDistillConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// ── Resolve effective provider+model from config+CLI args ────────────────────

export interface ResolvedProvider {
  providerName: string;
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

/**
 * Resolve provider config given CLI overrides.
 * Priority: CLI flags > config file defaults > env vars
 *
 * Supports shorthand "providerName/modelId" in --model flag.
 */
export function resolveProvider(
  config: BookDistillConfig,
  opts: {
    provider?: string;   // CLI --provider
    model?: string;      // CLI --model (may be "providerName/modelId")
    baseUrl?: string;    // CLI --base-url
    apiKey?: string;     // CLI --api-key
  }
): ResolvedProvider {
  let providerName = opts.provider || config.defaults.provider;
  let modelId = opts.model || config.defaults.model;

  // Support "providerName/modelId" shorthand in --model
  if (modelId.includes('/') && !modelId.startsWith('http')) {
    const slash = modelId.indexOf('/');
    providerName = modelId.slice(0, slash);
    modelId = modelId.slice(slash + 1);
  }

  const providerCfg = config.providers[providerName];
  if (!providerCfg) {
    throw new Error(
      `Provider "${providerName}" not found in config. Available: ${Object.keys(config.providers).join(', ')}\n` +
      `Run: book-distill config --help`
    );
  }

  // API key priority: CLI flag > config > env vars
  const apiKey =
    opts.apiKey?.trim() ||
    providerCfg.apiKey?.trim() ||
    process.env.AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    '';

  const baseUrl = opts.baseUrl || providerCfg.baseUrl;

  return {
    providerName,
    type: providerCfg.type,
    apiKey,
    baseUrl,
    model: modelId,
  };
}

// ── Init wizard (writes example config) ─────────────────────────────────────

export function initConfig(): void {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_PATH)) {
    console.log(`Config already exists at ${CONFIG_PATH}`);
    return;
  }

  const example: BookDistillConfig = {
    providers: {
      gemini: {
        type: 'gemini',
        apiKey: 'YOUR_GEMINI_API_KEY',
      },
      bailian: {
        type: 'openai_compatible',
        apiKey: 'sk-sp-YOUR_KEY',
        baseUrl: 'https://coding.dashscope.aliyuncs.com',
      },
      openai: {
        type: 'openai',
        apiKey: 'sk-YOUR_OPENAI_KEY',
      },
      anthropic: {
        type: 'anthropic',
        apiKey: 'sk-ant-YOUR_KEY',
      },
      local: {
        type: 'openai_compatible',
        apiKey: 'ollama',
        baseUrl: 'http://localhost:11434',
      },
    },
    defaults: {
      provider: 'bailian',
      model: 'qwen3.5-plus',
      language: 'Chinese',
    },
    github: {
      token: 'YOUR_GITHUB_TOKEN',
      owner: 'your-username',
      repo: 'your-repo',
      path: 'notes/books',
    },
  };

  writeConfig(example);
  console.log(`Created example config at ${CONFIG_PATH}`);
  console.log('Edit it to add your API keys, then run: book-distill -i your-book.epub');
}

// ── Pretty print config (mask keys) ─────────────────────────────────────────

export function printConfig(config: BookDistillConfig): void {
  const masked = JSON.parse(JSON.stringify(config)) as BookDistillConfig;

  for (const [name, p] of Object.entries(masked.providers)) {
    if (p.apiKey && p.apiKey.length > 8) {
      masked.providers[name].apiKey =
        p.apiKey.slice(0, 6) + '...' + p.apiKey.slice(-4);
    }
  }
  if (masked.github?.token && masked.github.token.length > 8) {
    masked.github.token =
      masked.github.token.slice(0, 6) + '...' + masked.github.token.slice(-4);
  }

  console.log(JSON.stringify(masked, null, 2));
}
