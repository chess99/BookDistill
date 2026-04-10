#!/usr/bin/env npx tsx
/**
 * pipeline-distill.ts — 提炼+入库 worker
 *
 * 消费 pipeline.md 的"待提炼"队列，逐一：
 *   1. 调用 distill.ts 提炼
 *   2. 用 AI 推断分类
 *   3. 调用 ingest.ts 入库
 *
 * 用法：
 *   npx tsx src/scripts/pipeline-distill.ts              # 持续运行
 *   npx tsx src/scripts/pipeline-distill.ts --once       # 只处理一条
 *   npx tsx src/scripts/pipeline-distill.ts --concurrency 2
 *   npx tsx src/scripts/pipeline-distill.ts --pipeline /path/to/pipeline.md
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { readConfig, resolveProvider } from '../../cli/config.js';
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
const concurrency = parseInt(getArg('--concurrency') || '2', 10);
const POLL_INTERVAL_MS = 5000; // 队列空时轮询间隔

// ── spawn 工具 ────────────────────────────────────────────────────────────────

function spawnScript(
  scriptPath: string,
  scriptArgs: string[],
  timeoutMs = 600_000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx', ['tsx', scriptPath, ...scriptArgs],
      {
        timeout: timeoutMs,
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
      process.stderr.write(chunk);
    });

    child.on('close', (code: number) => {
      if (code !== 0) {
        const err: any = new Error(stderr || `exit code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
    child.on('error', reject);
  });
}

// ── AI 推断分类 ────────────────────────────────────────────────────────────────

async function inferCategory(
  distillPath: string,
  booksDir: string
): Promise<string> {
  // 读取提炼结果的 title、tags、正文前 500 字
  const content = fs.readFileSync(distillPath, 'utf-8');

  // 提取 frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const title = fmMatch?.[1].match(/title:\s*(.+)/)?.[1]?.trim() || '';
  const author = fmMatch?.[1].match(/author:\s*(.+)/)?.[1]?.trim() || '';
  const tagsMatch = fmMatch?.[1].match(/tags:\s*\[([^\]]*)\]/);
  const tags = tagsMatch?.[1] || '';

  // 正文前 500 字
  const bodyStart = content.indexOf('\n---\n') + 5;
  const excerpt = content.slice(bodyStart, bodyStart + 500).replace(/#+\s*/g, '').trim();

  // 获取现有分类目录
  const existingCategories: string[] = [];
  if (fs.existsSync(booksDir)) {
    for (const entry of fs.readdirSync(booksDir, { withFileTypes: true })) {
      if (entry.isDirectory()) existingCategories.push(entry.name);
    }
  }

  // 构造 AI 请求
  const config = readConfig();
  const provider = resolveProvider(config, {});

  const prompt = `你是书籍分类专家。请根据以下信息，为这本书选择最合适的分类目录。

书名：${title}
作者：${author}
标签：${tags}
内容摘要：${excerpt}

现有分类目录：
${existingCategories.map(c => `- ${c}`).join('\n')}

要求：
1. 从现有分类中选择最合适的一个
2. 如果现有分类都不合适，建议一个新的中文分类名（2-5个字）
3. 只返回分类名称，不要任何解释

分类：`;

  // 调用 AI（非流式，用简单 fetch）
  const raw = await callAISimple(provider, prompt);
  // 过滤 <think>...</think> 推理标签（部分模型如 MiniMax 会输出）
  const category = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    .replace(/^分类[：:]?\s*/i, '').trim();
  return category || '商业管理';
}

async function callAISimple(
  provider: { type: string; apiKey: string; baseUrl?: string; model: string },
  prompt: string
): Promise<string> {
  if (provider.type === 'openai' || provider.type === 'openai_compatible') {
    const rawBase = (provider.baseUrl?.trim() || 'https://api.openai.com').replace(/\/$/, '');
    const baseUrl = rawBase.endsWith('/v1') ? rawBase : `${rawBase}/v1`;

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`AI API error ${resp.status}`);
    const json = await resp.json() as any;
    return json.choices?.[0]?.message?.content || '商业管理';
  }

  if (provider.type === 'gemini') {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: provider.apiKey });
    const result = await ai.models.generateContent({
      model: provider.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0, maxOutputTokens: 200 },
    });
    return result.text || '商业管理';
  }

  if (provider.type === 'anthropic' || provider.type === 'claude_code') {
    const baseUrl = (provider.baseUrl?.trim() || 'https://api.anthropic.com').replace(/\/$/, '');
    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error(`Anthropic API error ${resp.status}`);
    const json = await resp.json() as any;
    return json.content?.[0]?.text || '商业管理';
  }

  // fallback
  return '商业管理';
}

// ── 处理单条 ──────────────────────────────────────────────────────────────────

const DISTILL_SCRIPT = path.join(__dirname, '../../src/scripts/distill.ts');
const INGEST_SCRIPT = path.join(__dirname, '../../src/scripts/ingest.ts');
const BOOKS_DIR = path.join(os.homedir(), 'Notes/ai-reading/books');

async function processOne(workerId: number): Promise<boolean> {
  const item = getNextPending(pipelinePath, SECTIONS.PENDING_DISTILL);
  if (!item) return false;

  const { title, meta } = item;
  const filePath = meta.file;

  if (!filePath) {
    console.error(`[提炼${workerId}] ✗ ${title}: 缺少文件路径`);
    moveItem(pipelinePath, title, SECTIONS.PENDING_DISTILL, SECTIONS.FAILED, 'failed', {
      reason: '缺少文件路径',
    });
    return true;
  }

  if (!fs.existsSync(filePath)) {
    console.error(`[提炼${workerId}] ✗ ${title}: 文件不存在 ${filePath}`);
    moveItem(pipelinePath, title, SECTIONS.PENDING_DISTILL, SECTIONS.FAILED, 'failed', {
      reason: `文件不存在: ${filePath}`,
    });
    return true;
  }

  console.error(`\n[提炼${workerId}] ${title}`);
  console.error(`[提炼${workerId}]   文件: ${filePath}`);

  // 标记为处理中
  updateItem(pipelinePath, SECTIONS.PENDING_DISTILL, title, 'in_progress', {
    file: filePath,
    pid: String(process.pid),
    started: new Date().toISOString(),
  });

  // 提炼输出路径
  const distillPath = path.join(os.tmpdir(), `pipeline-distill-${Date.now()}-${workerId}.md`);

  try {
    // Step 1: 提炼
    console.error(`[提炼${workerId}]   Step 1: 调用 distill.ts...`);
    const { stdout: distillOut } = await spawnScript(
      DISTILL_SCRIPT,
      ['--file', filePath, '--output', distillPath],
      600_000 // 10分钟
    );

    if (!fs.existsSync(distillPath)) {
      throw new Error('distill.ts 未生成输出文件');
    }

    // 检查提炼内容是否有效（非空）
    const distillContent = fs.readFileSync(distillPath, 'utf-8');
    if (distillContent.trim().length < 500) {
      throw new Error('提炼内容过短，可能是解析失败（扫描版？）');
    }

    // Step 2: 推断分类
    console.error(`[提炼${workerId}]   Step 2: 推断分类...`);
    let category: string;
    try {
      category = await inferCategory(distillPath, BOOKS_DIR);
    } catch (err: any) {
      console.error(`[提炼${workerId}]   分类推断失败，使用默认分类: ${err.message}`);
      category = '商业管理'; // fallback
    }
    console.error(`[提炼${workerId}]   分类: ${category}`);

    // Step 3: 入库
    console.error(`[提炼${workerId}]   Step 3: 调用 ingest.ts...`);
    const { stdout: ingestOut } = await spawnScript(
      INGEST_SCRIPT,
      ['--distill', distillPath, '--category', category],
      60_000
    );

    // ingest.ts stdout 最后一行是输出文件路径
    const outputPath = ingestOut.trim().split('\n').pop()?.trim() || '';

    console.error(`[提炼${workerId}] ✓ ${title} → ${outputPath}`);
    moveItem(pipelinePath, title, SECTIONS.PENDING_DISTILL, SECTIONS.DONE, 'done', {
      output: outputPath || `${category}/${title}`,
    });

    // 清理临时文件
    try { fs.unlinkSync(distillPath); } catch {}

    return true;
  } catch (err: any) {
    const reason = (err.message || '').replace(/\n/g, ' ').slice(0, 150);
    console.error(`[提炼${workerId}] ✗ ${title}: ${reason}`);

    moveItem(pipelinePath, title, SECTIONS.PENDING_DISTILL, SECTIONS.FAILED, 'failed', {
      reason,
      file: filePath,
    });

    // 清理临时文件
    try { if (fs.existsSync(distillPath)) fs.unlinkSync(distillPath); } catch {}

    return true;
  }
}

// ── 并发 worker ───────────────────────────────────────────────────────────────

async function runWorker(workerId: number) {
  while (true) {
    const processed = await processOne(workerId);
    if (!processed) {
      if (once) break;
      // 队列空，等待轮询
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  initPipelineFile(pipelinePath);

  // 重置上次崩溃留下的 in_progress 条目（仅提炼区段）
  // 注意：不重置下载区段（那是 pipeline-download.ts 的职责）

  if (once) {
    const processed = await processOne(1);
    if (!processed) {
      console.error('[提炼] 待提炼队列为空');
    }
    return;
  }

  console.error(`[提炼] 启动提炼 worker（并发 ${concurrency}），持续监控待提炼队列...`);

  // 启动 N 个并发 worker
  const workers = Array.from({ length: concurrency }, (_, i) => runWorker(i + 1));
  await Promise.all(workers);
}

main().catch(err => {
  console.error('提炼 worker 异常:', err.message || err);
  process.exit(1);
});
