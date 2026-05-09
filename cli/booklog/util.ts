import * as fs from 'fs';
import * as path from 'path';

export function findRoot(): string {
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, '.booklog')) && path.dirname(root) !== root) {
    root = path.dirname(root);
  }
  if (!fs.existsSync(path.join(root, '.booklog'))) {
    console.error('No .booklog directory found. Run: booklog snapshot <dir>');
    process.exit(1);
  }
  return root;
}
