#!/usr/bin/env npx tsx
/**
 * distill.ts — 用 AI API 提炼书籍
 *
 * Usage:
 *   npx tsx src/scripts/distill.ts --file /path/to/book.epub
 *   npx tsx src/scripts/distill.ts --file book.epub --lang Chinese --output /tmp/out.md
 *
 * Output (stdout): 提炼后的 Markdown 内容（若未指定 --output）
 * Output (file):   若指定 --output，写入该文件并打印路径到 stdout
 * Logs (stderr):   进度信息
 *
 * Config: cli/config.json (defaults.provider, defaults.model, defaults.language)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { readConfig, resolveProvider } from '../../cli/config.js';
import { parseFile } from '../lib/parsers/index.js';
import { SYSTEM_INSTRUCTION_TEMPLATE, HIERARCHICAL_THRESHOLD } from '../constants.js';
import { distillLargeText } from '../lib/hierarchical.js';
import { generateMarkdownWithFrontmatter } from '../lib/filename.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const filePath = getArg('--file');
const langArg = getArg('--lang');
const outputArg = getArg('--output');
const providerArg = getArg('--provider');
const modelArg = getArg('--model');

if (!filePath) {
  console.error('Usage: distill.ts --file <path> [--lang Chinese] [--output <path>] [--provider <name>] [--model <id>]');
  process.exit(1);
}

// ── AI call (non-streaming, returns full text) ────────────────────────────────

async function callAI(
  providerType: string,
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  systemPrompt: string,
  text: string,
  title: string,
  author: string
): Promise<string> {
  const userMessage = `Title: ${title}\nAuthor: ${author || 'Unknown'}\n\n${text}`;

  if (providerType === 'gemini') {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      config: { temperature: 0.3, systemInstruction: systemPrompt },
    });
    return response.text || '';
  }

  if (providerType === 'openai' || providerType === 'openai_compatible') {
    const rawBase = (baseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const base = rawBase.endsWith('/v1') ? rawBase : `${rawBase}/v1`;
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
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
    const extraHeaders: Record<string, string> = providerType === 'claude_code'
      ? { 'X-Working-Dir': process.cwd(), 'x-app': 'cli' }
      : {};
    const res = await fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        max_tokens: 32000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    const json = await res.json() as any;
    return json.content?.[0]?.text || '';
  }

  throw new Error(`Unknown provider type: ${providerType}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const config = readConfig();
  const lang = langArg || config.defaults.language || 'Chinese';

  // 解析 provider/model
  const providerName = providerArg || config.defaults.provider;
  const providerCfg = resolveProvider(config, { provider: providerName, model: modelArg });

  process.stderr.write(`Provider: ${providerName} / ${providerCfg.model}\n`);
  process.stderr.write(`Parsing: ${filePath}\n`);

  // 解析书籍
  const parsed = await parseFile(filePath!);
  const charCount = parsed.text.length;
  process.stderr.write(`Parsed: "${parsed.title}" by ${parsed.author || 'Unknown'} (${(charCount / 1000).toFixed(0)}k chars)\n`);

  if (charCount === 0) {
    console.error('Error: No text extracted. The file may be a scanned PDF or corrupted.');
    process.exit(1);
  }

  const systemPrompt = SYSTEM_INSTRUCTION_TEMPLATE(lang);

  let rawContent: string;

  if (charCount > HIERARCHICAL_THRESHOLD) {
    process.stderr.write(`Text is large (${(charCount / 1000).toFixed(0)}k chars > ${HIERARCHICAL_THRESHOLD / 1000}k threshold), using hierarchical distillation...\n`);
    rawContent = await distillLargeText(
      parsed.text,
      parsed.title,
      parsed.author || 'Unknown',
      lang,
      (text, title, author, prompt) => callAI(
        providerCfg.type, providerCfg.apiKey, providerCfg.baseUrl,
        providerCfg.model, prompt, text, title, author
      ),
      { onProgress: (i, total) => process.stderr.write(`  Chunk ${i}/${total}...\n`) }
    );
  } else {
    process.stderr.write('Distilling...\n');
    rawContent = await callAI(
      providerCfg.type, providerCfg.apiKey, providerCfg.baseUrl,
      providerCfg.model, systemPrompt,
      parsed.text, parsed.title, parsed.author || 'Unknown'
    );
  }

  // 生成带 frontmatter 的最终内容
  const finalContent = generateMarkdownWithFrontmatter(
    rawContent,
    parsed.author || 'Unknown',
    parsed.title
  );

  if (outputArg) {
    fs.writeFileSync(outputArg, finalContent, 'utf-8');
    process.stderr.write(`Written to: ${outputArg}\n`);
    process.stdout.write(outputArg + '\n');
  } else {
    process.stdout.write(finalContent);
  }
}

main().catch(err => {
  console.error('Distill failed:', err.message || err);
  process.exit(1);
});
