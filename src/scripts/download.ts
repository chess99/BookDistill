#!/usr/bin/env npx tsx
/**
 * download.ts — 从 z-library 下载书籍
 *
 * Usage:
 *   npx tsx src/scripts/download.ts --query "书名"
 *   npx tsx src/scripts/download.ts --url "https://z-lib.fm/book/xxx"
 *
 * Output (stdout): 下载后的本地文件路径
 * Logs (stderr):   进度信息
 *
 * Config: cli/config.json (zlibrary.cookies, zlibrary.downloadDir)
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../../cli/config.js';
import {
  isZlibUrl,
  downloadFromZlib,
  searchZlib,
  selectBestCandidate,
  ZLIB_DEFAULT_BASE,
} from '../lib/zlibrary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const query = getArg('--query');
const url = getArg('--url');
const langArg = getArg('--lang');

if (!query && !url) {
  console.error('Usage: download.ts --query "书名" | --url "https://z-lib.fm/book/xxx"');
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const config = readConfig();
  const zlibCfg = config.zlibrary;

  if (!zlibCfg?.cookies) {
    console.error('Error: zlibrary.cookies not set in cli/config.json');
    process.exit(1);
  }

  const zlibOptions = {
    cookies: zlibCfg.cookies,
    timeout: zlibCfg.timeout,
    proxy: zlibCfg.proxy,
    downloadDir: zlibCfg.downloadDir,
  };

  let downloadUrl = url;

  if (query && !downloadUrl) {
    process.stderr.write(`Searching z-library for: "${query}"...\n`);
    const candidates = await searchZlib(query, {
      ...zlibOptions,
      baseUrl: ZLIB_DEFAULT_BASE,
    });

    if (candidates.length === 0) {
      console.error(`No results found for "${query}"`);
      process.exit(1);
    }

    const lang = langArg || config.defaults.language || 'Chinese';
    const { best, scores } = selectBestCandidate(candidates, lang, query);

    process.stderr.write(`\nFound ${candidates.length} candidates. Top results:\n`);
    scores.slice(0, 5).forEach((s, i) => {
      process.stderr.write(
        `  ${i + 1}. [${s.score}pts] ${s.candidate.format.toUpperCase()} ${s.candidate.fileSize} ${s.candidate.year} ${s.candidate.language}\n`
      );
      process.stderr.write(`     ${s.candidate.bookUrl}\n`);
    });
    process.stderr.write(`\nSelected: ${best.format.toUpperCase()} ${best.fileSize} (${best.year})\n`);
    process.stderr.write(`URL: ${best.bookUrl}\n\n`);

    downloadUrl = best.bookUrl;
  }

  if (!downloadUrl) {
    console.error('No download URL');
    process.exit(1);
  }

  process.stderr.write(`Downloading from: ${downloadUrl}\n`);
  const result = await downloadFromZlib(downloadUrl, zlibOptions);

  process.stderr.write(`Downloaded: ${result.fileName} → ${result.filePath}\n`);
  // stdout: 文件路径（供 skills 捕获）
  process.stdout.write(result.filePath + '\n');
}

main().catch(err => {
  console.error('Download failed:', err.message || err);
  process.exit(1);
});
