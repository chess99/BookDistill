// cli/booklog/snapshot.ts
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { FileRecord, Snapshot } from './types.js';

const BOOK_EXTENSIONS = new Set(['.epub', '.pdf', '.mobi', '.azw3', '.djvu', '.txt', '.md']);
const BOOKLOG_DIR = '.booklog';
const SNAPSHOTS_DIR = '.booklog/snapshots';
const HASHCACHE_FILE = '.booklog/hashcache.json';

// hashcache: { [relPath]: { mtime: number, size: number, hash: string } }
type HashCache = Record<string, { mtime: number; size: number; hash: string }>;

function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function walkDir(dir: string, root: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, root));
    } else if (BOOK_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

export async function takeSnapshot(rootArg: string): Promise<void> {
  const root = path.resolve(rootArg);
  const booklogDir = path.join(root, BOOKLOG_DIR);
  const snapshotsDir = path.join(root, SNAPSHOTS_DIR);
  const hashcachePath = path.join(root, HASHCACHE_FILE);

  fs.mkdirSync(snapshotsDir, { recursive: true });

  const cache: HashCache = fs.existsSync(hashcachePath)
    ? JSON.parse(fs.readFileSync(hashcachePath, 'utf-8'))
    : {};

  const allFiles = walkDir(root, root);
  const records: FileRecord[] = [];
  let hashed = 0;
  let cached = 0;

  for (const abs of allFiles) {
    const rel = path.relative(root, abs);
    const stat = fs.statSync(abs);
    const mtime = stat.mtimeMs;
    const size = stat.size;

    let hash: string;
    const cacheEntry = cache[rel];
    if (cacheEntry && cacheEntry.mtime === mtime && cacheEntry.size === size) {
      hash = cacheEntry.hash;
      cached++;
    } else {
      process.stdout.write(`\rhashing ${++hashed}/${allFiles.length - cached} new files...`);
      hash = hashFile(abs);
      cache[rel] = { mtime, size, hash };
    }

    records.push({ hash, path: rel, size, mtime });
  }

  process.stdout.write('\n');
  fs.writeFileSync(hashcachePath, JSON.stringify(cache, null, 2));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const snapshot: Snapshot = { timestamp: new Date().toISOString(), root, files: records };
  const outPath = path.join(snapshotsDir, `${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

  console.log(`Snapshot saved: ${path.relative(root, outPath)}`);
  console.log(`  ${records.length} files (${hashed} hashed, ${cached} from cache)`);

  // rebuild index after every snapshot
  try {
    const { rebuildIndex } = await import('./index.js');
    await rebuildIndex(root);
  } catch (err: any) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' || err?.message?.includes('Cannot find module')) {
      // index.ts not yet implemented — expected during Task 2
    } else {
      throw err;
    }
  }
}
