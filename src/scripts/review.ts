#!/usr/bin/env npx tsx
/**
 * review.ts — 对抗性质量审查
 *
 * 对比原书文本和提炼结果，检测：
 * - 内容太浅（只有表面概念）
 * - 关键章节遗漏
 * - 疑似凭记忆编造（引用无法在原文找到）
 *
 * Usage:
 *   npx tsx src/scripts/review.ts --book /path/to/book.epub --distill /path/to/distill.md
 *
 * Output (stdout): 审查报告（Markdown）
 * Exit code: 0=PASS, 1=NEEDS_REVISION, 2=error
 *
 * Config: cli/config.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { readConfig, resolveProvider } from '../../cli/config.js';
import { parseFile } from '../lib/parsers/index.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const bookPath = getArg('--book');
const distillPath = getArg('--distill');
const providerArg = getArg('--provider');
const modelArg = getArg('--model');

if (!bookPath || !distillPath) {
  console.error('Usage: review.ts --book <path> --distill <path>');
  process.exit(2);
}

// ── Review prompt ─────────────────────────────────────────────────────────────

function buildReviewPrompt(bookText: string, distillText: string): { system: string; user: string } {
  // 抽样：取原书前 2000 字、中间 2000 字、末尾 2000 字作为参考
  const len = bookText.length;
  const sample = [
    bookText.slice(0, 2000),
    bookText.slice(Math.floor(len / 2) - 1000, Math.floor(len / 2) + 1000),
    bookText.slice(Math.max(0, len - 2000)),
  ].join('\n\n[...]\n\n');

  const system = `You are an adversarial book distillation reviewer. Your job is to find problems, not to praise.
Review the distillation against the original book samples. Be specific and direct.
Output in the same language as the distillation.`;

  const user = `## Original Book Samples (beginning / middle / end)

${sample}

---

## Distillation to Review

${distillText}

---

## Review Task

Check for these failure modes and report findings:

1. **Shallow content**: Does the distillation only cover surface-level concepts without concrete arguments, data, or examples from the book?

2. **Missing chapters**: Based on the book samples, are there major topics or sections that appear to be completely absent from the distillation?

3. **Fabricated content**: Are there specific quotes, statistics, or claims in the distillation that cannot be found or verified in the book samples? List any suspicious ones.

4. **Inaccurate quotes**: If the distillation contains direct quotes, do they match the original text?

## Output Format

Start with either:
- \`VERDICT: PASS\` — distillation is accurate and reasonably complete
- \`VERDICT: NEEDS_REVISION\` — significant issues found

Then list specific findings under each failure mode (or "No issues found" if clean).
Be concrete: quote the problematic text and explain why it's an issue.`;

  return { system, user };
}

// ── AI call ───────────────────────────────────────────────────────────────────

async function callAI(
  providerType: string,
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  system: string,
  user: string
): Promise<string> {
  if (providerType === 'openai' || providerType === 'openai_compatible') {
    const rawBase = (baseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const base = rawBase.endsWith('/v1') ? rawBase : `${rawBase}/v1`;
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    const json = await res.json() as any;
    return json.choices?.[0]?.message?.content || '';
  }

  if (providerType === 'anthropic' || providerType === 'claude_code') {
    const rawBase = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    const base = rawBase.endsWith('/v1') ? rawBase : `${rawBase}/v1`;
    const res = await fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    const json = await res.json() as any;
    return json.content?.[0]?.text || '';
  }

  throw new Error(`Unsupported provider for review: ${providerType}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const config = readConfig();
  const providerName = providerArg || config.defaults.provider;
  const providerCfg = resolveProvider(config, { provider: providerName, model: modelArg });

  process.stderr.write(`Reviewing with: ${providerName} / ${providerCfg.model}\n`);
  process.stderr.write(`Book: ${bookPath}\n`);
  process.stderr.write(`Distill: ${distillPath}\n`);

  // 解析原书
  process.stderr.write('Parsing original book...\n');
  const parsed = await parseFile(bookPath!);

  if (parsed.text.length === 0) {
    console.error('Error: Cannot extract text from book (scanned PDF?)');
    process.exit(2);
  }

  // 读取提炼结果
  const distillText = fs.readFileSync(distillPath!, 'utf-8');

  // 构建 review prompt
  const { system, user } = buildReviewPrompt(parsed.text, distillText);

  process.stderr.write('Running adversarial review...\n');
  const report = await callAI(
    providerCfg.type, providerCfg.apiKey, providerCfg.baseUrl,
    providerCfg.model, system, user
  );

  // 输出报告
  process.stdout.write(report + '\n');

  // 根据 verdict 设置退出码
  const verdict = report.match(/VERDICT:\s*(PASS|NEEDS_REVISION)/i)?.[1]?.toUpperCase();
  if (verdict === 'PASS') {
    process.stderr.write('Review: PASS\n');
    process.exit(0);
  } else {
    process.stderr.write('Review: NEEDS_REVISION\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Review failed:', err.message || err);
  process.exit(2);
});
