#!/usr/bin/env npx tsx
/**
 * BookDistill CLI
 *
 * Usage:
 *   npx tsx cli/distill.ts -i book.epub -o summary.md
 *
 * Options:
 *   -i, --input      Input file (epub, md)
 *   -o, --output     Output file (optional, defaults to stdout)
 *   -l, --lang       Output language (default: Chinese)
 *   -m, --model      Model ID (default: gemini-2.5-pro-preview)
 *   -p, --provider   Provider: gemini | openai | anthropic | openai_compatible (default: gemini)
 *   --base-url       Base URL override (required for openai_compatible)
 *   -h, --help       Show help
 *
 * Environment variables (pick the one matching your provider):
 *   GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, AI_API_KEY
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULTS, LANGUAGES, SYSTEM_INSTRUCTION_TEMPLATE } from '../config/defaults';
import { NodeFileAdapter, NodeDOMParserAdapter } from './adapters/nodeAdapters';
import { parseEpubFile } from '../services/parsers/epubParser.universal';
import { parseMarkdownFile } from '../services/parsers/markdownParser.universal';

// ── Argument Parsing ─────────────────────────────────────────────────────────

type Provider = 'gemini' | 'openai' | 'anthropic' | 'openai_compatible';

interface Args {
  input?: string;
  output?: string;
  lang: string;
  model: string;
  provider: Provider;
  baseUrl?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    lang: DEFAULTS.LANGUAGE,
    model: 'gemini-2.5-pro-preview',
    provider: 'gemini',
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '-i': case '--input':    args.input    = next; i++; break;
      case '-o': case '--output':   args.output   = next; i++; break;
      case '-l': case '--lang':     args.lang     = next; i++; break;
      case '-m': case '--model':    args.model    = next; i++; break;
      case '-p': case '--provider': args.provider = next as Provider; i++; break;
      case '--base-url':            args.baseUrl  = next; i++; break;
      case '-h': case '--help':     args.help     = true; break;
    }
  }

  return args;
}

function showHelp() {
  const languageList = LANGUAGES.map(l => l.code).join(', ');
  console.log(`
BookDistill CLI - Extract knowledge from books using AI

Usage:
  npx tsx cli/distill.ts -i <file> [options]

Options:
  -i, --input <file>       Input file (epub, md, markdown)
  -o, --output <file>      Output markdown file (default: stdout)
  -l, --lang <lang>        Output language (default: ${DEFAULTS.LANGUAGE})
                           Available: ${languageList}
  -m, --model <model>      Model ID (default: gemini-2.5-pro-preview)
  -p, --provider <name>    Provider: gemini | openai | anthropic | openai_compatible
                           (default: gemini)
  --base-url <url>         Base URL override (required for openai_compatible)
  -h, --help               Show this help

Environment variables:
  GEMINI_API_KEY           API key for Google Gemini
  OPENAI_API_KEY           API key for OpenAI
  ANTHROPIC_API_KEY        API key for Anthropic
  AI_API_KEY               Generic fallback for any provider

Examples:
  # Gemini
  GEMINI_API_KEY=xxx npx tsx cli/distill.ts -i book.epub -o summary.md

  # OpenAI
  OPENAI_API_KEY=xxx npx tsx cli/distill.ts -p openai -m gpt-4o -i book.epub

  # Anthropic
  ANTHROPIC_API_KEY=xxx npx tsx cli/distill.ts -p anthropic -m claude-opus-4-6 -i book.epub

  # OpenAI-compatible (e.g. local LLM)
  AI_API_KEY=xxx npx tsx cli/distill.ts -p openai_compatible --base-url http://localhost:11434 -m llama3 -i book.epub
`);
}

// ── File Parsing ──────────────────────────────────────────────────────────────

async function parseFile(filePath: string): Promise<{ text: string; title: string; author?: string }> {
  const ext = path.extname(filePath).toLowerCase();
  const fileAdapter = NodeFileAdapter.fromPath(filePath);

  switch (ext) {
    case '.epub': {
      const domParser = new NodeDOMParserAdapter();
      const result = await parseEpubFile(fileAdapter, { domParser });
      return { text: result.text, title: result.title, author: result.author };
    }
    case '.md':
    case '.markdown': {
      const result = await parseMarkdownFile(fileAdapter);
      return { text: result.text, title: result.title, author: result.author };
    }
    default:
      throw new Error(`Unsupported format: ${ext}. Supported: .epub, .md, .markdown`);
  }
}

// ── AI Calls ──────────────────────────────────────────────────────────────────

async function generateSummaryGemini(
  text: string, title: string, author: string,
  language: string, modelId: string, apiKey: string, baseUrl?: string
): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
  const systemInstruction = SYSTEM_INSTRUCTION_TEMPLATE(language);

  process.stderr.write(`Sending to ${modelId} via Gemini...\n`);
  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ role: 'user', parts: [{ text: `Title: ${title}\nAuthor: ${author}\n\n${text}` }] }],
    config: { temperature: DEFAULTS.TEMPERATURE, systemInstruction },
  });
  return response.text || '';
}

async function generateSummaryOpenAI(
  text: string, title: string, author: string,
  language: string, modelId: string, apiKey: string, baseUrl: string
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const systemPrompt = SYSTEM_INSTRUCTION_TEMPLATE(language);

  process.stderr.write(`Sending to ${modelId} via ${baseUrl}...\n`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelId,
      temperature: DEFAULTS.TEMPERATURE,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Title: ${title}\nAuthor: ${author}\n\n${text}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const json = await res.json() as any;
  return json.choices?.[0]?.message?.content || '';
}

async function generateSummaryAnthropic(
  text: string, title: string, author: string,
  language: string, modelId: string, apiKey: string, baseUrl: string
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
  const systemPrompt = SYSTEM_INSTRUCTION_TEMPLATE(language);

  process.stderr.write(`Sending to ${modelId} via Anthropic...\n`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Title: ${title}\nAuthor: ${author}\n\n${text}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const json = await res.json() as any;
  return json.content?.[0]?.text || '';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.input) {
    showHelp();
    process.exit(args.help ? 0 : 1);
  }

  // Resolve API key from env
  const apiKey =
    process.env.AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('Error: API key required. Set GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or AI_API_KEY');
    process.exit(1);
  }

  if (!fs.existsSync(args.input)) {
    console.error(`Error: Input file not found: ${args.input}`);
    process.exit(1);
  }

  try {
    process.stderr.write(`Parsing ${args.input}...\n`);
    const { text, title, author } = await parseFile(args.input);
    process.stderr.write(`Extracted: "${title}" by ${author || 'Unknown'} (${(text.length / 1000).toFixed(0)}k chars)\n`);

    if (text.length > DEFAULTS.CONTEXT_WINDOW_CHAR_LIMIT) {
      console.error(`Error: Book too long (${(text.length / 1_000_000).toFixed(1)}M chars).`);
      process.exit(1);
    }

    let summary = '';

    switch (args.provider) {
      case 'gemini':
        summary = await generateSummaryGemini(text, title, author || 'Unknown', args.lang, args.model, apiKey, args.baseUrl);
        break;
      case 'openai':
        summary = await generateSummaryOpenAI(text, title, author || 'Unknown', args.lang, args.model, apiKey, args.baseUrl || 'https://api.openai.com');
        break;
      case 'anthropic':
        summary = await generateSummaryAnthropic(text, title, author || 'Unknown', args.lang, args.model, apiKey, args.baseUrl || 'https://api.anthropic.com');
        break;
      case 'openai_compatible':
        if (!args.baseUrl) {
          console.error('Error: --base-url is required for openai_compatible provider');
          process.exit(1);
        }
        summary = await generateSummaryOpenAI(text, title, author || 'Unknown', args.lang, args.model, apiKey, args.baseUrl);
        break;
    }

    if (args.output) {
      fs.writeFileSync(args.output, summary, 'utf-8');
      process.stderr.write(`Written to ${args.output}\n`);
    } else {
      process.stdout.write(summary);
    }

  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
