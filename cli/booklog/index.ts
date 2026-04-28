import * as fs from 'fs';
import * as path from 'path';
import type { Snapshot, Index, IndexEntry } from './types.js';

const INDEX_FILE = '.booklog/index.json';

export async function rebuildIndex(root: string): Promise<void> {
  const snapshotsDir = path.join(root, '.booklog', 'snapshots');
  const indexPath = path.join(root, INDEX_FILE);

  const snapshotFiles = fs.readdirSync(snapshotsDir)
    .filter(f => f.endsWith('.json'))
    .sort(); // chronological order by filename (ISO timestamp)

  const entries: Record<string, IndexEntry> = {};

  for (const file of snapshotFiles) {
    const snap: Snapshot = JSON.parse(
      fs.readFileSync(path.join(snapshotsDir, file), 'utf-8')
    );
    for (const record of snap.files) {
      if (!entries[record.hash]) {
        entries[record.hash] = { hash: record.hash, locations: [] };
      }
      const locs = entries[record.hash].locations;
      const last = locs[locs.length - 1];
      if (last && last.path === record.path) {
        // same path, just update last_seen
        last.last_seen = snap.timestamp;
      } else {
        // new path (or first appearance)
        locs.push({ path: record.path, first_seen: snap.timestamp, last_seen: snap.timestamp });
      }
    }
  }

  const index: Index = { updated: new Date().toISOString(), entries };
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`Index updated: ${Object.keys(entries).length} unique books`);
}
