/**
 * pipeline.ts — pipeline.md 状态文件读写工具
 *
 * pipeline.md 格式：
 *   ## 待下载
 *   - [ ] 刻意练习
 *   - [~] 深度工作 <!-- file: /path/to/file.epub, pid: 123, started: 2026-04-09T18:00:00Z -->
 *
 *   ## 待提炼
 *   - [ ] 掌控习惯 <!-- file: /path/to/掌控习惯.epub -->
 *
 *   ## 已完成
 *   - [x] 掌控习惯 <!-- output: 个人成长/詹姆斯·克利尔-掌控习惯.md -->
 *
 *   ## 失败/跳过
 *   - [!] 定价圣经 <!-- reason: 仅有扫描版PDF(52MB) -->
 *
 * 状态符号：[ ] 待处理 | [~] 处理中 | [x] 完成 | [!] 失败
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ItemStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface PipelineItem {
  title: string;
  status: ItemStatus;
  /** key-value 元数据，如 file, output, reason, pid, started */
  meta: Record<string, string>;
  /** 原始行（用于精确替换） */
  rawLine: string;
}

// 各区段的标题（对应 pipeline.md 的 ## 标题）
export const SECTIONS = {
  PENDING_DOWNLOAD: '待下载',
  PENDING_DISTILL: '待提炼',
  DONE: '已完成',
  FAILED: '失败/跳过',
} as const;

// ── 解析 ──────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, ItemStatus> = {
  '[ ]': 'pending',
  '[~]': 'in_progress',
  '[x]': 'done',
  '[!]': 'failed',
};

const STATUS_SYMBOL: Record<ItemStatus, string> = {
  pending: '[ ]',
  in_progress: '[~]',
  done: '[x]',
  failed: '[!]',
};

/** 解析 meta 注释：`<!-- key: value, key2: value2 -->` */
function parseMeta(comment: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const match = comment.match(/<!--(.*?)-->/);
  if (!match) return meta;
  const inner = match[1].trim();
  // 按逗号分割，但要注意 value 里可能有逗号（如路径），所以用 key: 来分割
  const parts = inner.split(/,\s*(?=[a-z_]+:)/);
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const key = part.slice(0, colonIdx).trim();
    const value = part.slice(colonIdx + 1).trim();
    if (key) meta[key] = value;
  }
  return meta;
}

/** 序列化 meta 为注释字符串 */
function serializeMeta(meta: Record<string, string>): string {
  const entries = Object.entries(meta).filter(([, v]) => v);
  if (entries.length === 0) return '';
  return ' <!-- ' + entries.map(([k, v]) => `${k}: ${v}`).join(', ') + ' -->';
}

/** 解析单行 item */
function parseLine(line: string): PipelineItem | null {
  const m = line.match(/^- (\[[ ~x!]\]) (.+?)(\s*<!--.*?-->)?\s*$/);
  if (!m) return null;
  const statusStr = m[1] as keyof typeof STATUS_MAP;
  const status = STATUS_MAP[statusStr] ?? 'pending';
  const title = m[2].trim();
  const comment = m[3] || '';
  const meta = parseMeta(comment);
  return { title, status, meta, rawLine: line };
}

/** 构造一行 item */
function buildLine(title: string, status: ItemStatus, meta: Record<string, string>): string {
  return `- ${STATUS_SYMBOL[status]} ${title}${serializeMeta(meta)}`;
}

// ── 读取 ──────────────────────────────────────────────────────────────────────

export interface PipelineSection {
  heading: string;
  items: PipelineItem[];
}

/** 读取并解析 pipeline.md */
export function readPipeline(pipelinePath: string): PipelineSection[] {
  if (!fs.existsSync(pipelinePath)) return [];
  const content = fs.readFileSync(pipelinePath, 'utf-8');
  const lines = content.split('\n');
  const sections: PipelineSection[] = [];
  let current: PipelineSection | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^## (.+)/);
    if (headingMatch) {
      current = { heading: headingMatch[1].trim(), items: [] };
      sections.push(current);
      continue;
    }
    if (current && line.startsWith('- [')) {
      const item = parseLine(line);
      if (item) current.items.push(item);
    }
  }
  return sections;
}

/** 获取某区段中第一个 pending 的条目 */
export function getNextPending(pipelinePath: string, sectionHeading: string): PipelineItem | null {
  const sections = readPipeline(pipelinePath);
  const section = sections.find(s => s.heading === sectionHeading);
  if (!section) return null;
  return section.items.find(i => i.status === 'pending') ?? null;
}

/** 统计各区段数量 */
export function getPipelineStats(pipelinePath: string): Record<string, number> {
  const sections = readPipeline(pipelinePath);
  const stats: Record<string, number> = {};
  for (const s of sections) {
    stats[s.heading] = s.items.length;
  }
  return stats;
}

// ── 写入（原子操作）──────────────────────────────────────────────────────────

/** 原子写：写临时文件再 rename，防止并发写入损坏 */
function atomicWrite(filePath: string, content: string): void {
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, filePath);
}

/**
 * 更新某条目的状态和 meta（在原区段内原地修改）
 */
export function updateItem(
  pipelinePath: string,
  sectionHeading: string,
  title: string,
  newStatus: ItemStatus,
  newMeta: Record<string, string>
): void {
  const content = fs.readFileSync(pipelinePath, 'utf-8');
  const lines = content.split('\n');
  let inSection = false;
  let updated = false;

  const newLines = lines.map(line => {
    const headingMatch = line.match(/^## (.+)/);
    if (headingMatch) {
      inSection = headingMatch[1].trim() === sectionHeading;
      return line;
    }
    if (inSection && !updated) {
      const item = parseLine(line);
      if (item && item.title === title) {
        updated = true;
        return buildLine(title, newStatus, newMeta);
      }
    }
    return line;
  });

  if (!updated) {
    throw new Error(`Item "${title}" not found in section "${sectionHeading}"`);
  }
  atomicWrite(pipelinePath, newLines.join('\n'));
}

/**
 * 将条目从一个区段移动到另一个区段
 * fromSection: 来源区段标题
 * toSection: 目标区段标题（必须已存在于文件中）
 */
export function moveItem(
  pipelinePath: string,
  title: string,
  fromSection: string,
  toSection: string,
  newStatus: ItemStatus,
  newMeta: Record<string, string>
): void {
  const content = fs.readFileSync(pipelinePath, 'utf-8');
  const lines = content.split('\n');

  let inFromSection = false;
  let inToSection = false;
  let removed = false;
  const newLine = buildLine(title, newStatus, newMeta);

  // 第一遍：删除来源行
  const afterRemove = lines.filter(line => {
    const headingMatch = line.match(/^## (.+)/);
    if (headingMatch) {
      inFromSection = headingMatch[1].trim() === fromSection;
      return true;
    }
    if (inFromSection && !removed) {
      const item = parseLine(line);
      if (item && item.title === title) {
        removed = true;
        return false; // 删除此行
      }
    }
    return true;
  });

  if (!removed) {
    throw new Error(`Item "${title}" not found in section "${fromSection}"`);
  }

  // 第二遍：在目标区段末尾插入
  let inserted = false;
  const result: string[] = [];

  for (let i = 0; i < afterRemove.length; i++) {
    const line = afterRemove[i];
    const headingMatch = line.match(/^## (.+)/);
    if (headingMatch) {
      const heading = headingMatch[1].trim();
      // 如果上一个区段是目标区段，在进入新区段前插入
      if (inToSection && !inserted) {
        result.push(newLine);
        inserted = true;
      }
      inToSection = heading === toSection;
    }
    result.push(line);
  }

  // 如果目标区段在文件末尾
  if (inToSection && !inserted) {
    result.push(newLine);
    inserted = true;
  }

  if (!inserted) {
    throw new Error(`Section "${toSection}" not found in pipeline file`);
  }

  atomicWrite(pipelinePath, result.join('\n'));
}

/**
 * 追加新条目到指定区段（用于 scan 时添加新书）
 */
export function appendItem(
  pipelinePath: string,
  sectionHeading: string,
  title: string,
  meta: Record<string, string> = {}
): void {
  const content = fs.existsSync(pipelinePath)
    ? fs.readFileSync(pipelinePath, 'utf-8')
    : '';
  const lines = content.split('\n');
  const newLine = buildLine(title, 'pending', meta);

  let inSection = false;
  let sectionEndIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^## (.+)/);
    if (headingMatch) {
      if (inSection) {
        // 离开目标区段，记录结束位置
        sectionEndIdx = i;
        break;
      }
      inSection = headingMatch[1].trim() === sectionHeading;
    }
  }

  if (!inSection && sectionEndIdx === -1) {
    // 区段不存在，追加到文件末尾
    const newContent = content.trimEnd() + `\n\n## ${sectionHeading}\n${newLine}\n`;
    atomicWrite(pipelinePath, newContent);
    return;
  }

  if (sectionEndIdx === -1) {
    // 目标区段在文件末尾
    sectionEndIdx = lines.length;
  }

  lines.splice(sectionEndIdx, 0, newLine);
  atomicWrite(pipelinePath, lines.join('\n'));
}

/**
 * 检查某书名是否已在 pipeline 中（任意区段）
 */
export function isInPipeline(pipelinePath: string, title: string): boolean {
  if (!fs.existsSync(pipelinePath)) return false;
  const sections = readPipeline(pipelinePath);
  return sections.some(s => s.items.some(i => i.title === title));
}

/**
 * 将所有"处理中"([~])的条目重置为"待处理"([ ])
 * 用于进程崩溃后的恢复
 */
export function resetInProgress(pipelinePath: string): number {
  if (!fs.existsSync(pipelinePath)) return 0;
  const content = fs.readFileSync(pipelinePath, 'utf-8');
  let count = 0;
  const newContent = content.replace(/^- \[~\] (.+)$/gm, (_, rest) => {
    count++;
    return `- [ ] ${rest}`;
  });
  if (count > 0) atomicWrite(pipelinePath, newContent);
  return count;
}

// ── 初始化 pipeline.md ────────────────────────────────────────────────────────

export const PIPELINE_TEMPLATE = `# BookDistill Pipeline

<!-- 自动生成，可手动编辑。运行 /pipeline scan 更新待下载列表 -->

## 待下载

## 待提炼

## 已完成

## 失败/跳过
`;

export function initPipelineFile(pipelinePath: string): void {
  if (fs.existsSync(pipelinePath)) return;
  fs.mkdirSync(path.dirname(pipelinePath), { recursive: true });
  fs.writeFileSync(pipelinePath, PIPELINE_TEMPLATE, 'utf-8');
}

// ── 默认路径 ──────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const DEFAULT_PIPELINE_PATH = path.join(REPO_ROOT, 'pipeline.md');
