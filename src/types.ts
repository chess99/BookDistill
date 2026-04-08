// 文件格式枚举
export enum FileFormat {
  EPUB = 'epub',
  MARKDOWN = 'md',
  PDF = 'pdf',
  TXT = 'txt',
}

// 解析结果
export interface ParseResult {
  text: string;
  title: string;
  author?: string;
  format: FileFormat;
}

// 解析错误
export class ParseError extends Error {
  constructor(
    message: string,
    public format: FileFormat,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

// AI 提供方类型
export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'openai_compatible' | 'claude_code';

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

// GitHub 配置
export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  path: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
}
