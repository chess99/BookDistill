// 文件格式枚举
export enum FileFormat {
  EPUB = 'epub',
  MARKDOWN = 'md',
  PDF = 'pdf',      // 预留
  DOCX = 'docx',    // 预留
  TXT = 'txt',      // 预留
}

// 解析结果接口
export interface ParseResult {
  text: string;          // 提取的纯文本内容
  title: string;         // 书名
  author?: string;       // 作者(可选)
  format: FileFormat;    // 原始格式
}

// 解析器能力描述
export interface ParserCapabilities {
  extensions: string[];      // 支持的文件扩展名,如 ['epub']
  mimeTypes: string[];       // 支持的 MIME 类型
  supportsLargeFiles: boolean;  // 是否支持大文件
  description: string;       // 格式描述
}

// 解析器接口
export interface BookParser {
  readonly format: FileFormat;
  readonly capabilities: ParserCapabilities;

  canParse(file: File): boolean;
  parse(file: File): Promise<ParseResult>;
}

// 自定义错误类
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

export interface BookMetadata {
  title: string;
  author?: string;
  rawTextLength: number;
  format?: FileFormat;  // 新增:记录原始格式
}

export interface ProcessingState {
  status: 'idle' | 'parsing' | 'analyzing' | 'complete' | 'error';
  message?: string;
  progress?: number;
}

export interface BookSession {
  id: string;
  metadata: BookMetadata | null;
  summary: string;
  status: 'parsing' | 'analyzing' | 'complete' | 'error';
  message?: string;
  timestamp: number;
  language: string;
  model: string;
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  path: string; // folder path
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
}