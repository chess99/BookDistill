import * as fs from 'fs';
import * as path from 'path';
import type { Index } from './types.js';

function findRoot(): string {
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, '.booklog')) && root !== '/') {
    root = path.dirname(root);
  }
  if (!fs.existsSync(path.join(root, '.booklog'))) {
    console.error('No .booklog directory found.');
    process.exit(1);
  }
  return root;
}

function loadIndex(root: string): Index {
  const indexPath = path.join(root, '.booklog', 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('No index.json found. Run: booklog snapshot <dir>');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

export async function findBook(query: string): Promise<void> {
  const root = findRoot();
  const index = loadIndex(root);
  const lower = query.toLowerCase();

  const matches = Object.values(index.entries).filter(entry =>
    entry.hash.startsWith(lower) ||
    entry.locations.some(l => path.basename(l.path).toLowerCase().includes(lower))
  );

  if (matches.length === 0) {
    console.log(`No books found matching: ${query}`);
    return;
  }

  for (const entry of matches) {
    const current = entry.locations[entry.locations.length - 1];
    const exists = fs.existsSync(path.join(root, current.path));
    const status = exists ? '✓' : '✗ deleted';
    console.log(`[${entry.hash}] ${current.path} (${status})`);
  }
}

export async function showLog(query?: string): Promise<void> {
  const root = findRoot();
  const index = loadIndex(root);

  if (!query) {
    // show summary of all books
    const entries = Object.values(index.entries);
    const moved = entries.filter(e => e.locations.length > 1);
    console.log(`Total: ${entries.length} books, ${moved.length} have been moved`);
    return;
  }

  const lower = query.toLowerCase();
  const matches = Object.values(index.entries).filter(entry =>
    entry.hash.startsWith(lower) ||
    entry.locations.some(l => path.basename(l.path).toLowerCase().includes(lower))
  );

  if (matches.length === 0) {
    console.log(`No books found matching: ${query}`);
    return;
  }

  for (const entry of matches) {
    console.log(`\n[${entry.hash}]`);
    for (const loc of entry.locations) {
      const first = loc.first_seen.slice(0, 10);
      const last  = loc.last_seen.slice(0, 10);
      const range = first === last ? first : `${first} → ${last}`;
      console.log(`  ${range}  ${loc.path}`);
    }
  }
}
