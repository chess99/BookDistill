#!/usr/bin/env npx tsx
/**
 * pipeline-scan.ts — 扫描延伸阅读书名，生成 pipeline.md 待下载列表
 *
 * 用法：
 *   npx tsx src/scripts/pipeline-scan.ts
 *   npx tsx src/scripts/pipeline-scan.ts --pipeline /path/to/pipeline.md
 *   npx tsx src/scripts/pipeline-scan.ts --books-dir /path/to/ai-reading/books
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  DEFAULT_PIPELINE_PATH,
  initPipelineFile,
  isInPipeline,
  appendItem,
  SECTIONS,
} from '../lib/pipeline.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const pipelinePath = getArg('--pipeline') || DEFAULT_PIPELINE_PATH;
const booksDir = getArg('--books-dir') ||
  path.join(os.homedir(), 'Notes/ai-reading/books');

// ── 扫描已入库书名 ────────────────────────────────────────────────────────────

function getIngestedTitles(booksDir: string): Set<string> {
  const titles = new Set<string>();
  if (!fs.existsSync(booksDir)) return titles;

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        // 文件名格式：作者-书名.md，提取书名部分
        const basename = path.basename(entry.name, '.md');
        const dashIdx = basename.indexOf('-');
        if (dashIdx !== -1) {
          const title = basename.slice(dashIdx + 1).trim();
          titles.add(title);
        }
        // 也加入完整文件名（去掉.md），防止误判
        titles.add(basename);
      }
    }
  }
  walk(booksDir);
  return titles;
}

// ── 扫描延伸阅读书名 ──────────────────────────────────────────────────────────

function extractRecommendedBooks(mdContent: string): string[] {
  const books: string[] = [];
  // 找到"延伸阅读"章节
  const sectionMatch = mdContent.match(/##\s*延伸阅读([\s\S]*?)(?=\n##\s|$)/);
  if (!sectionMatch) return books;

  const section = sectionMatch[1];
  // 提取所有《书名》
  const bookPattern = /《([^》]{2,40})》/g;
  let m: RegExpExecArray | null;
  while ((m = bookPattern.exec(section)) !== null) {
    const title = m[1].trim();
    // 过滤明显不是书名的（如"圣经"、"纽约时报"等）
    if (isLikelyBookTitle(title)) {
      books.push(title);
    }
  }
  return [...new Set(books)]; // 去重
}

const NON_BOOK_PATTERNS = [
  /^(圣经|希伯来圣经|新约|旧约|塔木德)$/,
  /^(纽约时报|华尔街日报|经济学人|时代周刊)$/,
  /^(CFIDO|BBS|WPS|APP|ISO|NBA|NFL|GDP|CEO|AI)$/,
  /^\d+$/,  // 纯数字
];

function isLikelyBookTitle(title: string): boolean {
  for (const pattern of NON_BOOK_PATTERNS) {
    if (pattern.test(title)) return false;
  }
  return title.length >= 2 && title.length <= 40;
}

function scanAllRecommendedBooks(booksDir: string): string[] {
  const allBooks = new Set<string>();
  if (!fs.existsSync(booksDir)) return [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const books = extractRecommendedBooks(content);
        for (const b of books) allBooks.add(b);
      }
    }
  }
  walk(booksDir);
  return [...allBooks];
}

// ── 模糊匹配：判断书名是否已入库 ──────────────────────────────────────────────

function normalizeTitle(title: string): string {
  return title
    .replace(/[：:·\s]/g, '')
    .replace(/（[^）]*）/g, '')  // 去掉括号内容
    .replace(/\([^)]*\)/g, '')
    .toLowerCase();
}

function isAlreadyIngested(title: string, ingestedTitles: Set<string>): boolean {
  const norm = normalizeTitle(title);
  for (const ingested of ingestedTitles) {
    if (normalizeTitle(ingested).includes(norm) || norm.includes(normalizeTitle(ingested))) {
      return true;
    }
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.error(`扫描书目...`);
  console.error(`  books-dir: ${booksDir}`);
  console.error(`  pipeline:  ${pipelinePath}`);

  // 初始化 pipeline.md
  initPipelineFile(pipelinePath);

  // 获取已入库书名
  const ingested = getIngestedTitles(booksDir);
  console.error(`\n已入库书籍：${ingested.size} 本`);

  // 扫描延伸阅读
  const recommended = scanAllRecommendedBooks(booksDir);
  console.error(`延伸阅读推荐：${recommended.length} 本（去重后）`);

  // 过滤出未入库、未在 pipeline 中的
  const toAdd: string[] = [];
  const skippedIngested: string[] = [];
  const skippedPipeline: string[] = [];

  for (const title of recommended) {
    if (isAlreadyIngested(title, ingested)) {
      skippedIngested.push(title);
      continue;
    }
    if (isInPipeline(pipelinePath, title)) {
      skippedPipeline.push(title);
      continue;
    }
    toAdd.push(title);
  }

  console.error(`\n已入库（跳过）：${skippedIngested.length} 本`);
  console.error(`已在 pipeline（跳过）：${skippedPipeline.length} 本`);
  console.error(`新增到待下载：${toAdd.length} 本`);

  if (toAdd.length === 0) {
    console.error('\n没有新书需要添加。');
    return;
  }

  // 追加到 pipeline.md 待下载区
  for (const title of toAdd) {
    appendItem(pipelinePath, SECTIONS.PENDING_DOWNLOAD, title);
  }

  console.error(`\n✓ 已添加 ${toAdd.length} 本书到 ${pipelinePath}`);
  console.error('\n新增书目：');
  for (const t of toAdd) {
    console.error(`  - ${t}`);
  }
}

main().catch(err => {
  console.error('扫描失败:', err.message || err);
  process.exit(1);
});
