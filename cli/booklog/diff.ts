import * as fs from 'fs';
import * as path from 'path';
import type { Snapshot, DiffEntry } from './types.js';

function loadSnapshot(filePath: string): Snapshot {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getSnapshotFiles(root: string): string[] {
  const dir = path.join(root, '.booklog', 'snapshots');
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => path.join(dir, f));
}

function computeDiff(a: Snapshot, b: Snapshot): DiffEntry[] {
  const aMap = new Map(a.files.map(f => [f.hash, f.path]));
  const bMap = new Map(b.files.map(f => [f.hash, f.path]));
  const results: DiffEntry[] = [];

  for (const [hash, bPath] of bMap) {
    if (!aMap.has(hash)) {
      results.push({ type: 'added', hash, path: bPath });
    } else if (aMap.get(hash) !== bPath) {
      results.push({ type: 'moved', hash, from: aMap.get(hash)!, to: bPath });
    }
  }
  for (const [hash, aPath] of aMap) {
    if (!bMap.has(hash)) {
      results.push({ type: 'deleted', hash, path: aPath });
    }
  }
  return results;
}

export async function diffSnapshots(s1Arg?: string, s2Arg?: string): Promise<void> {
  // resolve root: walk up from cwd to find .booklog
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, '.booklog')) && root !== '/') {
    root = path.dirname(root);
  }
  if (!fs.existsSync(path.join(root, '.booklog'))) {
    console.error('No .booklog directory found. Run: booklog snapshot <dir>');
    process.exit(1);
  }

  const files = getSnapshotFiles(root);
  if (files.length < 2) {
    console.log('Need at least 2 snapshots to diff.');
    return;
  }

  const pathA = s1Arg ? path.resolve(s1Arg) : files[files.length - 2];
  const pathB = s2Arg ? path.resolve(s2Arg) : files[files.length - 1];

  const snapA = loadSnapshot(pathA);
  const snapB = loadSnapshot(pathB);
  const diffs = computeDiff(snapA, snapB);

  if (diffs.length === 0) {
    console.log('No changes.');
    return;
  }

  const moved  = diffs.filter(d => d.type === 'moved');
  const added  = diffs.filter(d => d.type === 'added');
  const deleted = diffs.filter(d => d.type === 'deleted');

  console.log(`\nDiff: ${path.basename(pathA)} → ${path.basename(pathB)}\n`);

  if (moved.length) {
    console.log(`Moved (${moved.length}):`);
    for (const d of moved) {
      if (d.type === 'moved') console.log(`  ${d.from}\n    → ${d.to}`);
    }
  }
  if (added.length) {
    console.log(`\nAdded (${added.length}):`);
    for (const d of added) {
      if (d.type === 'added') console.log(`  + ${d.path}  [${d.hash}]`);
    }
  }
  if (deleted.length) {
    console.log(`\nDeleted (${deleted.length}):`);
    for (const d of deleted) {
      if (d.type === 'deleted') console.log(`  - ${d.path}  [${d.hash}]`);
    }
  }
}
