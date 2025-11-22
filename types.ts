export interface BookMetadata {
  title: string;
  author?: string;
  rawTextLength: number;
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