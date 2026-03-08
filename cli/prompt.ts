/**
 * 交互式输入工具 (readline-based, no extra deps)
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

// ── Low-level readline helpers ────────────────────────────────────────────────

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createRL();
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function askWithDefault(question: string, defaultValue: string): Promise<string> {
  const answer = await ask(`${question} [${defaultValue}]: `);
  return answer || defaultValue;
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await ask(`${question} [${hint}]: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

// ── Select from a list ────────────────────────────────────────────────────────

export async function selectFromList<T extends { label: string; value: string }>(
  prompt: string,
  items: T[],
  defaultIndex = 0
): Promise<string> {
  console.log(`\n${prompt}`);
  items.forEach((item, i) => {
    const marker = i === defaultIndex ? '>' : ' ';
    console.log(`  ${marker} ${i + 1}) ${item.label}`);
  });

  while (true) {
    const raw = await ask(`Select [1-${items.length}] (default ${defaultIndex + 1}): `);
    if (!raw) return items[defaultIndex].value;

    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 1 && n <= items.length) {
      return items[n - 1].value;
    }
    console.log(`  Please enter a number between 1 and ${items.length}.`);
  }
}

// ── File picker (list files in a directory) ───────────────────────────────────

const SUPPORTED_EXTS = ['.epub', '.md', '.markdown'];

export async function pickFile(searchDir: string): Promise<string> {
  const absDir = path.resolve(searchDir);

  let files: string[] = [];
  try {
    files = fs.readdirSync(absDir)
      .filter(f => SUPPORTED_EXTS.includes(path.extname(f).toLowerCase()))
      .sort();
  } catch {
    // directory not readable, fall through to manual input
  }

  if (files.length > 0) {
    console.log(`\nFound ${files.length} book file(s) in ${absDir}:`);
    files.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));
    console.log(`  ${files.length + 1}) Enter path manually`);

    while (true) {
      const raw = await ask(`Select [1-${files.length + 1}]: `);
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n >= 1 && n <= files.length) {
        return path.join(absDir, files[n - 1]);
      }
      if (n === files.length + 1 || !raw) break;
      console.log(`  Invalid choice.`);
    }
  }

  // Manual input fallback
  while (true) {
    const input = await ask('Enter file path: ');
    const resolved = input.startsWith('~')
      ? path.join(process.env.HOME || '', input.slice(1))
      : path.resolve(input);
    if (fs.existsSync(resolved)) return resolved;
    console.log(`  File not found: ${resolved}`);
  }
}

// ── Output destination picker ─────────────────────────────────────────────────

export type OutputDestination =
  | { type: 'file'; path: string }
  | { type: 'github'; path: string }
  | { type: 'stdout' };

export async function pickOutputDestination(
  suggestedFilename: string,
  hasGitHub: boolean
): Promise<OutputDestination> {
  const choices = [
    { label: `Save to file  (e.g. ~/Downloads/${suggestedFilename})`, value: 'file' },
    ...(hasGitHub ? [{ label: 'Push to GitHub', value: 'github' }] : []),
    { label: 'Print to stdout', value: 'stdout' },
  ];

  const choice = await selectFromList('Where should the output go?', choices, 0);

  if (choice === 'stdout') return { type: 'stdout' };

  if (choice === 'github') return { type: 'github', path: '' }; // caller fills path

  // file
  const defaultPath = path.join(
    process.env.HOME || '',
    'Downloads',
    suggestedFilename
  );
  const filePath = await askWithDefault('Output file path', defaultPath);
  const resolved = filePath.startsWith('~')
    ? path.join(process.env.HOME || '', filePath.slice(1))
    : path.resolve(filePath);
  return { type: 'file', path: resolved };
}

// ── GitHub folder picker ──────────────────────────────────────────────────────

export async function pickGitHubFolder(
  folders: string[],
  defaultFolder: string
): Promise<string> {
  if (folders.length === 0) {
    return await askWithDefault('GitHub folder path (repo root = empty)', defaultFolder);
  }

  const items = [
    { label: '/ (repo root)', value: '' },
    ...folders.map(f => ({ label: f, value: f })),
    { label: '[ Enter manually ]', value: '__manual__' },
  ];

  const defaultIdx = Math.max(
    0,
    items.findIndex(i => i.value === defaultFolder)
  );

  const choice = await selectFromList('Select GitHub folder:', items, defaultIdx);

  if (choice === '__manual__') {
    return await askWithDefault('Folder path', defaultFolder);
  }
  return choice;
}
