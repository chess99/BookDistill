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
const baseUrlArg = getArg('--base-url');
const searchOnly = args.includes('--search-only'); // 只搜索，不下载（用于 /pipeline select）

if (!query && !url) {
  console.error('Usage: download.ts --query "书名" | --url "https://z-lib.fm/book/xxx" [--search-only]');
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const config = readConfig();
  const zlibCfg = config.zlibrary;

  // 账号列表：accounts 数组优先，否则用 cookies 单账号
  const accounts: string[] = zlibCfg?.accounts?.length
    ? zlibCfg.accounts
    : zlibCfg?.cookies
      ? [zlibCfg.cookies]
      : [];

  if (accounts.length === 0) {
    console.error('Error: zlibrary.cookies or zlibrary.accounts not set in cli/config.json');
    process.exit(1);
  }

  const baseOptions = {
    timeout: zlibCfg?.timeout,
    proxy: zlibCfg?.proxy,
    downloadDir: zlibCfg?.downloadDir,
  };

  let downloadUrl = url;

  // 搜索阶段用第一个账号（搜索不消耗额度）
  const zlibOptions = { ...baseOptions, cookies: accounts[0] };

  if (query && !downloadUrl) {
    process.stderr.write(`Searching z-library for: "${query}"...\n`);
    const candidates = await searchZlib(query, {
      ...zlibOptions,
      baseUrl: baseUrlArg || ZLIB_DEFAULT_BASE,
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

    if (searchOnly) {
      process.exit(0);
    }

    downloadUrl = best.bookUrl;
  }

  if (!downloadUrl) {
    console.error('No download URL');
    process.exit(1);
  }

  // 下载阶段：遇到 QUOTA_EXCEEDED 自动切换下一个账号
  process.stderr.write(`Downloading from: ${downloadUrl}\n`);
  let lastErr: Error | null = null;
  for (let i = 0; i < accounts.length; i++) {
    if (i > 0) {
      process.stderr.write(`[账号${i}] QUOTA_EXCEEDED，切换到账号${i + 1}...\n`);
    }
    try {
      const result = await downloadFromZlib(downloadUrl, { ...baseOptions, cookies: accounts[i] });
      if (i > 0) {
        process.stderr.write(`[账号${i + 1}] 下载成功\n`);
      }
      process.stderr.write(`Downloaded: ${result.fileName} → ${result.filePath}\n`);
      process.stdout.write(result.filePath + '\n');
      return;
    } catch (err: any) {
      lastErr = err;
      if (!err.message?.includes('QUOTA_EXCEEDED')) throw err; // 非额度错误（含 COPYRIGHT_REMOVED）直接抛出
    }
  }
  // 所有账号都超额
  throw lastErr ?? new Error('All accounts quota exceeded');
}

main().catch(err => {
  console.error('Download failed:', err.message || err);
  process.exit(1);
});
