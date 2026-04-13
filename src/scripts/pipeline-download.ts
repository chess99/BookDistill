#!/usr/bin/env npx tsx
/**
 * pipeline-download.ts — 纯下载执行器
 *
 * 消费 pipeline.md 的"待下载"队列中有 dl_url 的条目，
 * 直接用 --url 下载，不做搜索。
 * 没有 dl_url 的条目需先运行 /pipeline select 填入。
 *
 * 用法：
 *   npx tsx src/scripts/pipeline-download.ts           # 持续运行直到队列空或遇到 QUOTA_EXCEEDED
 *   npx tsx src/scripts/pipeline-download.ts --once    # 只处理一条
 *   npx tsx src/scripts/pipeline-download.ts --pipeline /path/to/pipeline.md
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import {
  DEFAULT_PIPELINE_PATH,
  initPipelineFile,
  getNextPending,
  updateItem,
  moveItem,
  resetInProgress,
  SECTIONS,
} from '../lib/pipeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const pipelinePath = getArg('--pipeline') || DEFAULT_PIPELINE_PATH;
const once = args.includes('--once');

// ── 运行 download.ts --url ────────────────────────────────────────────────────

interface DownloadResult {
  filePath: string;
}

class DownloadError extends Error {
  constructor(message: string, public stdout = '') {
    super(message);
    this.name = 'DownloadError';
  }
}

async function runDownloadByUrl(dlUrl: string): Promise<DownloadResult> {
  const scriptPath = path.join(__dirname, '../../src/scripts/download.ts');

  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx', ['tsx', scriptPath, '--url', dlUrl],
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

/** 从错误信息中提取失败原因 */
function extractFailReason(errorMsg: string): string {
  if (errorMsg.includes('QUOTA_EXCEEDED') || errorMsg.includes('Daily limit')) return 'QUOTA_EXCEEDED';
  if (errorMsg.includes('cookies') || errorMsg.includes('cf_clearance')) return 'cookie 失效，请更新 config.zlibrary.cookies';
  if (errorMsg.includes('canceled')) return '下载被取消（mirror 问题）';
  if (errorMsg.includes('timeout')) return '下载超时（网络问题）';
  // 截取前100字符作为原因
  return errorMsg.replace(/\n/g, ' ').slice(0, 100);
}

// ── 主循环 ────────────────────────────────────────────────────────────────────

async function processOne(): Promise<boolean> {
  const item = getNextPending(pipelinePath, SECTIONS.PENDING_DOWNLOAD);
  if (!item) return false;

  const { title, meta } = item;

  // 没有 dl_url 则停止（需要先运行 /pipeline select）
  if (!meta.dl_url) {
    console.error(`[下载] 队列中有无 dl_url 的条目（${title}），请先运行 /pipeline select 选书`);
    return false;
  }

  console.error(`\n[下载] ${title}${meta.author ? ` （${meta.author}）` : ''}`);
  console.error(`[下载] URL: ${meta.dl_url}`);

  // 标记为处理中
  updateItem(pipelinePath, SECTIONS.PENDING_DOWNLOAD, title, 'in_progress', {
    ...meta,
    pid: String(process.pid),
    started: new Date().toISOString(),
  });

  try {
    const { filePath } = await runDownloadByUrl(meta.dl_url);
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

    // 额度用完：重置为待下载（保留 dl_url），停止 worker
    if (reason === 'QUOTA_EXCEEDED') {
      updateItem(pipelinePath, SECTIONS.PENDING_DOWNLOAD, title, 'pending', meta);
      console.error('[下载] 今日下载额度已用完，停止 worker。明日重新运行即可继续。');
      return false;
    }

    moveItem(
      pipelinePath,
      title,
      SECTIONS.PENDING_DOWNLOAD,
      SECTIONS.FAILED,
      'failed',
      { reason, dl_url: meta.dl_url }
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
      console.error('[下载] 无可处理条目（队列空或缺少 dl_url）');
    }
    return;
  }

  // 持续运行
  console.error('[下载] 启动下载 worker，处理有 dl_url 的待下载条目...');
  while (true) {
    const processed = await processOne();
    if (!processed) {
      console.error('[下载] 停止（队列空、缺少 dl_url、或额度用完）');
      break;
    }
  }
}

main().catch(err => {
  console.error('下载 worker 异常:', err.message || err);
  process.exit(1);
});
