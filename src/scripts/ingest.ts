#!/usr/bin/env npx tsx
/**
 * ingest.ts — 将提炼结果入库到 ai-reading 仓库
 *
 * Usage:
 *   npx tsx src/scripts/ingest.ts --distill /path/to/distill.md --category 投资
 *   npx tsx src/scripts/ingest.ts --distill /path/to/distill.md --category 投资 --tags "投资,价值投资"
 *
 * Output (stdout): 最终写入的文件路径
 * Logs (stderr):   进度信息
 *
 * Config: cli/config.json (defaults.outputDir)
 *
 * 命名规范：
 *   - 文件名：<作者>-<书名>.md（从 frontmatter 读取）
 *   - 目标路径：<outputDir>/<category>/<作者>-<书名>.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { readConfig } from '../../cli/config.js';
import { generateBookFilename, generateMarkdownWithFrontmatter } from '../lib/filename.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const distillPath = getArg('--distill');
const categoryArg = getArg('--category');
const tagsArg = getArg('--tags');
const titleArg = getArg('--title');
const authorArg = getArg('--author');

if (!distillPath) {
  console.error('Usage: ingest.ts --distill <path> --category <分类> [--tags "tag1,tag2"] [--title <title>] [--author <author>]');
  process.exit(1);
}

// ── Frontmatter parsing ───────────────────────────────────────────────────────

interface FrontmatterFields {
  title?: string;
  author?: string;
  slug?: string;
  tags?: string[];
  date?: string;
}

function parseFrontmatter(content: string): { fields: FrontmatterFields; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fields: {}, body: content };

  const yamlBlock = match[1];
  const body = match[2];
  const fields: FrontmatterFields = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'title') fields.title = value.replace(/^['"]|['"]$/g, '');
    else if (key === 'author') fields.author = value.replace(/^['"]|['"]$/g, '');
    else if (key === 'slug') fields.slug = value.replace(/^['"]|['"]$/g, '');
    else if (key === 'date') fields.date = value.replace(/^['"]|['"]$/g, '');
    else if (key === 'tags') {
      // 解析行内数组格式: [tag1, tag2]
      const tagMatch = value.match(/^\[(.*)\]$/);
      if (tagMatch) {
        fields.tags = tagMatch[1].split(',').map(t => t.trim()).filter(Boolean);
      }
    }
  }

  return { fields, body };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const config = readConfig();

  // 读取提炼结果
  if (!fs.existsSync(distillPath!)) {
    console.error(`Error: File not found: ${distillPath}`);
    process.exit(1);
  }

  const distillContent = fs.readFileSync(distillPath!, 'utf-8');
  const { fields, body } = parseFrontmatter(distillContent);

  // 确定 title 和 author（优先命令行参数，其次 frontmatter）
  const title = titleArg || fields.title;
  const author = authorArg || fields.author;

  if (!title) {
    console.error('Error: Cannot determine title. Use --title or ensure frontmatter has title field.');
    process.exit(1);
  }

  if (!author) {
    console.error('Error: Cannot determine author. Use --author or ensure frontmatter has author field.');
    process.exit(1);
  }

  // 确定分类目录
  const category = categoryArg;
  if (!category) {
    console.error('Error: --category is required. Available categories: 投资, 心理学, 个人成长, 健康运动, 商业管理, 思维方式, 社会科学');
    process.exit(1);
  }

  // 确定输出目录（从 config 或默认路径）
  const outputDir = (config as any).defaults?.outputDir
    ? path.resolve(((config as any).defaults.outputDir as string).replace(/^~/, process.env.HOME || ''))
    : path.join(process.env.HOME || '', 'Notes', 'ai-reading', 'books');

  const categoryDir = path.join(outputDir, category);

  // 确保分类目录存在
  if (!fs.existsSync(categoryDir)) {
    console.error(`Error: Category directory does not exist: ${categoryDir}`);
    console.error('Available categories: ' + fs.readdirSync(outputDir).filter(d =>
      fs.statSync(path.join(outputDir, d)).isDirectory()
    ).join(', '));
    process.exit(1);
  }

  // 解析 tags
  const tags: string[] = tagsArg
    ? tagsArg.split(',').map(t => t.trim()).filter(Boolean)
    : (fields.tags || []);

  // 生成文件名
  const filename = generateBookFilename(author, title);
  const destPath = path.join(categoryDir, filename);

  process.stderr.write(`Title: ${title}\n`);
  process.stderr.write(`Author: ${author}\n`);
  process.stderr.write(`Category: ${category}\n`);
  process.stderr.write(`Tags: [${tags.join(', ')}]\n`);
  process.stderr.write(`Output: ${destPath}\n`);

  // 检查是否已存在
  if (fs.existsSync(destPath)) {
    process.stderr.write(`Warning: File already exists: ${destPath}\n`);
    process.stderr.write('Overwriting...\n');
  }

  // 生成最终内容（重新生成 frontmatter，确保格式规范）
  // 提取正文（去掉原有 frontmatter）
  const bodyContent = fields.title ? body : distillContent;

  const finalContent = generateMarkdownWithFrontmatter(bodyContent, author, title, tags);

  // 写入文件
  fs.writeFileSync(destPath, finalContent, 'utf-8');
  process.stderr.write(`Written: ${destPath}\n`);
  process.stderr.write('\nNext step: cd to ai-reading repo and commit\n');
  process.stderr.write('  cd ~/Notes/ai-reading && git add . && git commit\n');
  process.stderr.write('  (pre-commit hook will check slug uniqueness)\n');

  // stdout: 文件路径（供 skills 捕获）
  process.stdout.write(destPath + '\n');
}

main().catch(err => {
  console.error('Ingest failed:', err.message || err);
  process.exit(1);
});
