#!/usr/bin/env npx tsx
/**
 * pipeline-download.ts — 下载 worker
 *
 * 消费 pipeline.md 的"待下载"队列，逐一调用 download.ts，
 * 成功则移入"待提炼"，失败则移入"失败/跳过"。
 *
 * 用法：
 *   npx tsx src/scripts/pipeline-download.ts           # 持续运行直到队列空
 *   npx tsx src/scripts/pipeline-download.ts --once    # 只处理一条
 *   npx tsx src/scripts/pipeline-download.ts --pipeline /path/to/pipeline.md
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import {
  DEFAULT_PIPELINE_PATH,
  initPipelineFile,
  getNextPending,
  updateItem,
  moveItem,
  resetInProgress,
  SECTIONS,
} from '../lib/pipeline.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const pipelinePath = getArg('--pipeline') || DEFAULT_PIPELINE_PATH;
const once = args.includes('--once');
const DELAY_MS = 3000; // z-library 限速间隔

// ── 运行 download.ts ──────────────────────────────────────────────────────────

const DOWNLOAD_SCRIPT = path.join(__dirname, 'download.js');

interface DownloadResult {
  filePath: string;
}

async function runDownload(title: string): Promise<DownloadResult> {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--experimental-vm-modules',
     DOWNLOAD_SCRIPT, '--query', title],
    {
      timeout: 180_000, // 3分钟超时
      env: { ...process.env },
    }
  ).catch((err: any) => {
    // execFile 失败时 err.stderr 包含错误信息
    const stderr = err.stderr || '';
    const stdout = err.stdout || '';
    throw new DownloadError(stderr || err.message, stdout);
  });

  // stdout 最后一行是文件路径
  const filePath = stdout.trim().split('\n').pop()?.trim() || '';
  if (!filePath || !filePath.startsWith('/')) {
    throw new DownloadError(`download.ts 未返回有效文件路径: ${stdout}`, stderr);
  }
  return { filePath };
}

class DownloadError extends Error {
  constructor(message: string, public stdout = '') {
    super(message);
    this.name = 'DownloadError';
  }
}

/** 从 stderr 输出中提取失败原因 */
function extractFailReason(errorMsg: string): string {
  if (errorMsg.includes('QUOTA_EXCEEDED')) return 'QUOTA_EXCEEDED: 今日下载额度已用完，明日重试';
  if (errorMsg.includes('No results found')) return 'z-library 无搜索结果';
  if (errorMsg.includes('Download timeout') || errorMsg.includes('timeout')) return '下载超时';
  if (errorMsg.includes('cookies')) return 'cookie 失效，请更新 config.zlibrary.cookies';
  if (errorMsg.includes('canceled')) return '下载被取消（mirror 问题）';
  // 截取前100字符作为原因
  return errorMsg.replace(/\n/g, ' ').slice(0, 100);
}

/** 检查是否是额度用完错误（需要停止整个 worker） */
function isQuotaExceeded(errorMsg: string): boolean {
  return errorMsg.includes('QUOTA_EXCEEDED');
}

// ── 用 npx tsx 运行（更可靠）─────────────────────────────────────────────────

async function runDownloadViaNpx(title: string): Promise<DownloadResult> {
  const scriptPath = path.join(__dirname, '../../src/scripts/download.ts');

  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx', ['tsx', scriptPath, '--query', title],
      {
        timeout: 180_000,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stderr += chunk;
      process.stderr.write(chunk); // 实时转发 stderr
    });

    child.on('close', (code: number) => {
      if (code !== 0) {
        reject(new DownloadError(stderr || `exit code ${code}`, stdout));
        return;
      }
      const filePath = stdout.trim().split('\n').pop()?.trim() || '';
      if (!filePath || !filePath.startsWith('/')) {
        reject(new DownloadError(`未返回有效文件路径: ${stdout}`, stderr));
        return;
      }
      resolve({ filePath });
    });

    child.on('error', (err: Error) => reject(new DownloadError(err.message)));
  });
}

// ── 主循环 ────────────────────────────────────────────────────────────────────

async function processOne(): Promise<boolean> {
  const item = getNextPending(pipelinePath, SECTIONS.PENDING_DOWNLOAD);
  if (!item) return false;

  const { title, meta } = item;
  // 用"书名 作者"搜索，避免同名书混淆
  const searchQuery = meta.author ? `${title} ${meta.author}` : title;
  console.error(`\n[下载] ${title}${meta.author ? ` （${meta.author}）` : ''}`);

  // 标记为处理中
  updateItem(pipelinePath, SECTIONS.PENDING_DOWNLOAD, title, 'in_progress', {
    ...meta,
    pid: String(process.pid),
    started: new Date().toISOString(),
  });

  try {
    const { filePath } = await runDownloadViaNpx(searchQuery);
    console.error(`[下载] ✓ ${title} → ${filePath}`);
    moveItem(
      pipelinePath,
      title,
      SECTIONS.PENDING_DOWNLOAD,
      SECTIONS.PENDING_DISTILL,
      'pending',
      { file: filePath, ...(meta.author ? { author: meta.author } : {}) }
    );
    return true;
  } catch (err: any) {
    const errMsg = err.message || '';
    const reason = extractFailReason(errMsg);
    console.error(`[下载] ✗ ${title}: ${reason}`);

    if (isQuotaExceeded(errMsg)) {
      // 额度用完：重置当前条目为待处理（明天继续），停止 worker
      updateItem(pipelinePath, SECTIONS.PENDING_DOWNLOAD, title, 'pending', meta);
      console.error('[下载] 今日额度已用完，停止下载 worker。明日重新运行即可继续。');
      return false; // 返回 false 让 worker 停止
    }

    moveItem(
      pipelinePath,
      title,
      SECTIONS.PENDING_DOWNLOAD,
      SECTIONS.FAILED,
      'failed',
      { reason }
    );
    return true; // 继续处理下一条
  }
}

async function main() {
  initPipelineFile(pipelinePath);

  // 重置上次崩溃留下的 in_progress 条目
  const reset = resetInProgress(pipelinePath);
  if (reset > 0) {
    console.error(`[下载] 重置 ${reset} 个未完成的处理中条目`);
  }

  if (once) {
    const processed = await processOne();
    if (!processed) {
      console.error('[下载] 待下载队列为空');
    }
    return;
  }

  // 持续运行
  console.error('[下载] 启动下载 worker，持续监控待下载队列...');
  while (true) {
    const processed = await processOne();
    if (!processed) {
      console.error('[下载] 待下载队列为空，退出');
      break;
    }
    // 限速：每条下载后等待
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

main().catch(err => {
  console.error('下载 worker 异常:', err.message || err);
  process.exit(1);
});
