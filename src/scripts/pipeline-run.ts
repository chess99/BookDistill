#!/usr/bin/env npx tsx
/**
 * pipeline-run.ts — 统一调度器入口
 *
 * 并行启动下载 worker 和提炼 worker，两者独立消费各自队列。
 *
 * 用法：
 *   npx tsx src/scripts/pipeline-run.ts
 *   npx tsx src/scripts/pipeline-run.ts --pipeline /path/to/pipeline.md
 *   npx tsx src/scripts/pipeline-run.ts --distill-concurrency 2
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import {
  DEFAULT_PIPELINE_PATH,
  initPipelineFile,
  getPipelineStats,
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
const distillConcurrency = getArg('--distill-concurrency') || '2';

// ── 启动子进程 worker ─────────────────────────────────────────────────────────

function spawnWorker(
  scriptPath: string,
  extraArgs: string[],
  label: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['tsx', scriptPath, '--pipeline', pipelinePath, ...extraArgs],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      }
    );

    // 转发输出，加上 worker 标签
    child.stdout.on('data', (d: Buffer) => {
      process.stdout.write(d);
    });
    child.stderr.on('data', (d: Buffer) => {
      process.stderr.write(d);
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.error(`[${label}] 已完成`);
        resolve();
      } else {
        console.error(`[${label}] 异常退出 (code=${code})`);
        resolve(); // 不 reject，让另一个 worker 继续
      }
    });

    child.on('error', (err) => {
      console.error(`[${label}] 启动失败:`, err.message);
      resolve();
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  initPipelineFile(pipelinePath);

  // 重置孤立的处理中条目
  const reset = resetInProgress(pipelinePath);
  if (reset > 0) {
    console.error(`[调度器] 重置 ${reset} 个未完成的处理中条目`);
  }

  // 打印当前队列状态
  const stats = getPipelineStats(pipelinePath);
  console.error('[调度器] 当前队列状态:');
  for (const [section, count] of Object.entries(stats)) {
    console.error(`  ${section}: ${count} 条`);
  }

  const pendingDownload = stats[SECTIONS.PENDING_DOWNLOAD] || 0;
  const pendingDistill = stats[SECTIONS.PENDING_DISTILL] || 0;

  if (pendingDownload === 0 && pendingDistill === 0) {
    console.error('[调度器] 所有队列为空，无需处理。');
    console.error('  运行 /pipeline scan 扫描新书目');
    return;
  }

  console.error(`\n[调度器] 启动 pipeline...`);
  console.error(`  下载 worker: 1 个（串行）`);
  console.error(`  提炼 worker: ${distillConcurrency} 个（并发）`);
  console.error('');

  const downloadScript = path.join(__dirname, 'pipeline-download.ts');
  const distillScript = path.join(__dirname, 'pipeline-distill.ts');

  // 并行启动两个 worker
  const workers: Promise<void>[] = [];

  if (pendingDownload > 0) {
    workers.push(spawnWorker(downloadScript, [], '下载'));
  }

  if (pendingDistill > 0 || pendingDownload > 0) {
    // 提炼 worker 持续轮询，等待下载 worker 产出
    workers.push(spawnWorker(
      distillScript,
      ['--concurrency', distillConcurrency],
      '提炼'
    ));
  }

  await Promise.all(workers);

  // 最终统计
  const finalStats = getPipelineStats(pipelinePath);
  console.error('\n[调度器] 完成！最终状态:');
  for (const [section, count] of Object.entries(finalStats)) {
    console.error(`  ${section}: ${count} 条`);
  }
}

main().catch(err => {
  console.error('调度器异常:', err.message || err);
  process.exit(1);
});
