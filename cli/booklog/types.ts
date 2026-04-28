// cli/booklog/types.ts
export interface FileRecord {
  hash: string;    // first 16 hex chars of SHA-256
  path: string;    // relative to watched root
  size: number;    // bytes
  mtime: number;   // unix ms
}

export interface Snapshot {
  timestamp: string;   // ISO 8601
  root: string;        // absolute path of watched dir
  files: FileRecord[];
}

export interface IndexEntry {
  hash: string;
  locations: Array<{ path: string; first_seen: string; last_seen: string }>;
}

export interface Index {
  updated: string;
  entries: Record<string, IndexEntry>; // keyed by hash
}

export type DiffEntry =
  | { type: 'added';   hash: string; path: string }
  | { type: 'deleted'; hash: string; path: string }
  | { type: 'moved';   hash: string; from: string; to: string };
