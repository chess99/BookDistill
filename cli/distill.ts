#!/usr/bin/env npx tsx
/**
 * BookDistill CLI
 *
 * Config file: ~/.bookdistill/config.json
 *
 * Usage:
 *   book-distill                          # fully interactive
 *   book-distill -i book.epub             # pick output interactively
 *   book-distill -i book.epub -o out.md   # non-interactive
 *   book-distill -i "https://z-lib.fm/book/xxx"  # z-library link
 *   book-distill config --init            # create example config
 *   book-distill config --show            # print current config (keys masked)
 *
 * Options:
 *   -i, --input <file|url>   Input file (epub, md) or z-library URL
 *   -o, --output <file>      Output file ("-" for stdout)
 *   -l, --lang <lang>        Output language (default from config)
 *   -m, --model <id>         Model ID or "provider/model" shorthand
 *   -p, --provider <name>    Provider name (key in config.providers)
 *   --base-url <url>         Base URL override
 *   --api-key <key>          API key override (overrides config + env)
 *   --github                 Push to GitHub (uses config.github)
 *   --no-interactive         Disable all prompts, fail instead
 *   -h, --help               Show help
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readConfig,
  resolveProvider,
  initConfig,
  printConfig,
  CONFIG_PATH,
  type BookDistillConfig,
} from './config';
import {
  ask,
  askWithDefault,
  selectFromList,
  pickFile,
  pickOutputDestination,
  pickGitHubFolder,
} from './prompt';
import { NodeFileAdapter, NodeDOMParserAdapter } from './adapters/nodeAdapters';
import { parseEpubFile } from '../src/services/parsers/epubParser.universal';
import { parseMarkdownFile } from '../src/services/parsers/markdownParser.universal';
import { parsePdfFile } from '../src/services/parsers/pdfParser.universal';
import { DEFAULTS, LANGUAGES, SYSTEM_INSTRUCTION_TEMPLATE } from '../src/config/defaults';
import { generateBookFilename, generateMarkdownWithFrontmatter } from '../src/utils/filenameUtils';
import {
  validateToken,
  getUserRepos,
  getRepoFolders,
  saveFileToRepo,
} from '../src/services/githubService';
import {
  isZlibUrl,
  downloadFromZlib,
} from '../src/services/zlibraryService';

// ── Arg parsing ───────────────────────────────────────────────────────────────

interface Args {
  subcommand?: string;       // 'config'
  subArgs: string[];         // args after subcommand
  input?: string;
  output?: string;
  lang?: string;
  model?: string;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  github: boolean;
  interactive: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    subArgs: [],
    github: false,
    interactive: true,
    help: false,
  };

  const rest = argv.slice(2);

  // Check for subcommand first
  if (rest[0] === 'config') {
    args.subcommand = 'config';
    args.subArgs = rest.slice(1);
    return args;
  }

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = rest[i + 1];

    switch (arg) {
      case '-i': case '--input':    args.input    = next; i++; break;
      case '-o': case '--output':   args.output   = next; i++; break;
      case '-l': case '--lang':     args.lang     = next; i++; break;
      case '-m': case '--model':    args.model    = next; i++; break;
      case '-p': case '--provider': args.provider = next; i++; break;
      case '--base-url':            args.baseUrl  = next; i++; break;
      case '--api-key':             args.apiKey   = next; i++; break;
      case '--github':              args.github   = true; break;
      case '--no-interactive':      args.interactive = false; break;
      case '-h': case '--help':     args.help     = true; break;
    }
  }

  return args;
}

function showHelp(config: BookDistillConfig) {
  const providerList = Object.keys(config.providers).join(', ');
  const langList = LANGUAGES.map(l => l.code).join(', ');

  console.log(`
BookDistill CLI — Extract knowledge from books using AI

Config file: ${CONFIG_PATH}

Usage:
  book-distill [options]                   Fully interactive if options omitted
  book-distill config --init               Create example config
  book-distill config --show               Print current config (keys masked)

Options:
  -i, --input <file|url>   Input file (.epub, .pdf, .md, .markdown) or z-library URL
  -o, --output <file>      Output file ("-" for stdout)
  -l, --lang <lang>        Output language (default: ${config.defaults.language})
                           Available: ${langList}
  -m, --model <id>         Model ID, or "provider/model" shorthand
                           e.g. -m bailian/qwen3.5-plus
  -p, --provider <name>    Provider name from config (available: ${providerList})
  --base-url <url>         Override provider base URL
  --api-key <key>          Override API key
  --github                 Push result to GitHub (uses config.github)
  --no-interactive         Fail instead of prompting for missing values
  -h, --help               Show this help

Examples:
  # Fully interactive (pick file, model, output)
  book-distill

  # Use provider/model shorthand
  book-distill -m bailian/qwen3.5-plus -i book.epub

  # Download from z-library and distill
  book-distill -i "https://z-lib.fm/book/xxxxx"

  # Push to GitHub
  book-distill -i book.epub --github

  # Non-interactive (CI/scripts)
  book-distill -i book.epub -o summary.md -m bailian/qwen3.5-plus --no-interactive

Z-Library Support:
  z-library links require authentication. Set cookies in config:
    "zlibrary": { "cookies": "name=value; name2=value2" }

  Downloaded books are saved to ~/Downloads by default.
  Override with: "zlibrary": { "downloadDir": "/path/to/dir" }

  How to get cookies:
    1. Login to z-library (e.g. https://z-lib.fm) in your browser
    2. Open Developer Tools (F12) -> Application -> Cookies
    3. Copy all cookies as "name=value; name2=value2" format
`);
}

// ── File parsing ──────────────────────────────────────────────────────────────

async function parseFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const fileAdapter = NodeFileAdapter.fromPath(filePath);

  switch (ext) {
    case '.epub': {
      const domParser = new NodeDOMParserAdapter();
      const result = await parseEpubFile(fileAdapter, { domParser });
      return { text: result.text, title: result.title, author: result.author };
    }
    case '.pdf': {
      const result = await parsePdfFile(fileAdapter);
      return { text: result.text, title: result.title, author: result.author };
    }
    case '.md':
    case '.markdown': {
      const result = await parseMarkdownFile(fileAdapter);
      return { text: result.text, title: result.title, author: result.author };
    }
    default:
      throw new Error(`Unsupported format: ${ext}. Supported: .epub, .pdf, .md, .markdown`);
  }
}

// ── AI generation ─────────────────────────────────────────────────────────────

async function generateSummary(
  text: string,
  title: string,
  author: string,
  language: string,
  providerType: string,
  modelId: string,
  apiKey: string,
  baseUrl?: string
): Promise<string> {
  const systemPrompt = SYSTEM_INSTRUCTION_TEMPLATE(language);
  const userMessage = `Title: ${title}\nAuthor: ${author}\n\n${text}`;

  if (providerType === 'gemini') {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      config: { temperature: DEFAULTS.TEMPERATURE, systemInstruction: systemPrompt },
    });
    return response.text || '';
  }

  // OpenAI / openai_compatible
  if (providerType === 'openai' || providerType === 'openai_compatible') {
    const base = (baseUrl || 'https://api.openai.com').replace(/\/$/, '');
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        temperature: DEFAULTS.TEMPERATURE,
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

  // Anthropic
  if (providerType === 'anthropic') {
    const base = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    const res = await fetch(`${base}/v1/messages`, {
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
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    const json = await res.json() as any;
    return json.content?.[0]?.text || '';
  }

  throw new Error(`Unknown provider type: ${providerType}`);
}

// ── GitHub push ───────────────────────────────────────────────────────────────

async function pushToGitHub(
  config: BookDistillConfig,
  content: string,
  filename: string,
  interactive: boolean
): Promise<string> {
  const gh = config.github;
  if (!gh?.token || !gh?.owner || !gh?.repo) {
    throw new Error(
      'GitHub config incomplete. Set config.github.token/owner/repo in ~/.bookdistill/config.json'
    );
  }

  // Validate token
  process.stderr.write('Validating GitHub token...\n');
  const username = await validateToken(gh.token);
  if (!username) throw new Error('Invalid GitHub token');

  let folder = gh.path || '';

  if (interactive) {
    process.stderr.write('Fetching repo folders...\n');
    let folders: string[] = [];
    try {
      const repos = await getUserRepos(gh.token);
      const repo = repos.find(r => r.name === gh.repo && r.full_name.startsWith(gh.owner));
      if (repo) {
        folders = await getRepoFolders(gh.token, gh.owner, gh.repo, repo.default_branch);
      }
    } catch { /* non-fatal */ }

    folder = await pickGitHubFolder(folders, gh.path || '');
  }

  process.stderr.write(`Pushing to ${gh.owner}/${gh.repo}/${folder ? folder + '/' : ''}${filename}...\n`);
  const url = await saveFileToRepo(gh.token, gh.owner, gh.repo, folder, filename, content);
  return url;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // ── Subcommand: config ──
  if (args.subcommand === 'config') {
    if (args.subArgs.includes('--init')) {
      initConfig();
    } else if (args.subArgs.includes('--show')) {
      try {
        printConfig(readConfig());
      } catch (e: any) {
        console.error(e.message);
        process.exit(1);
      }
    } else {
      console.log(`Usage:
  book-distill config --init   Create example config at ${CONFIG_PATH}
  book-distill config --show   Print current config (keys masked)`);
    }
    return;
  }

  // ── Load config ──
  let config: BookDistillConfig;
  try {
    config = readConfig();
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }

  if (args.help) {
    showHelp(config);
    return;
  }

  const interactive = args.interactive && process.stdin.isTTY;

  // ── Step 1: Input file or URL ──
  let inputFile = args.input;
  if (!inputFile) {
    if (!interactive) {
      console.error('Error: --input required in non-interactive mode');
      process.exit(1);
    }
    const searchDir = os.homedir() + '/Downloads';
    process.stderr.write('\n');
    inputFile = await pickFile(searchDir);
  }

  // Check if input is a z-library URL
  let isZlib = false;
  if (isZlibUrl(inputFile)) {
    isZlib = true;
    process.stderr.write('\nDetected z-library URL, downloading...\n');

    if (!config.zlibrary?.cookies) {
      console.error(`Error: z-library requires cookies for authentication.
Set config.zlibrary.cookies in ${CONFIG_PATH}

How to get cookies:
1. Login to z-library (e.g. https://z-lib.fm) in your browser
2. Open Developer Tools (F12) -> Application -> Cookies
3. Copy all cookies as "name=value; name2=value2" format`);
      process.exit(1);
    }

    try {
      const result = await downloadFromZlib(inputFile, {
        cookies: config.zlibrary.cookies,
        timeout: config.zlibrary.timeout,
        proxy: config.zlibrary.proxy,
        downloadDir: config.zlibrary.downloadDir,
      });
      inputFile = result.filePath;
      process.stderr.write(`Downloaded: ${result.bookInfo.title} (${result.fileName})\n`);
    } catch (e: any) {
      console.error(`Download error: ${e.message}`);
      process.exit(1);
    }
  } else {
    // Resolve ~ and relative paths for local files
    if (inputFile.startsWith('~')) {
      inputFile = path.join(os.homedir(), inputFile.slice(1));
    } else {
      inputFile = path.resolve(inputFile);
    }

    if (!fs.existsSync(inputFile)) {
      console.error(`Error: File not found: ${inputFile}`);
      process.exit(1);
    }
  }

  // ── Step 2: Language ──
  let language = args.lang || config.defaults.language;
  if (!args.lang && interactive && !args.model) {
    // Only ask language if we're being interactive about model too
    const langItems = LANGUAGES.map(l => ({ label: l.label, value: l.code }));
    const defaultIdx = langItems.findIndex(l => l.value === language);
    language = await selectFromList('Output language:', langItems, Math.max(0, defaultIdx));
  }

  // ── Step 3: Provider + Model ──
  let resolved;
  try {
    resolved = resolveProvider(config, {
      provider: args.provider,
      model: args.model,
      baseUrl: args.baseUrl,
      apiKey: args.apiKey,
    });
  } catch (e: any) {
    if (!interactive) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    // Interactive fallback: pick provider then model
    const providerItems = Object.keys(config.providers).map(k => ({
      label: `${k}  (${config.providers[k].type})`,
      value: k,
    }));
    const defaultProviderIdx = Math.max(
      0,
      providerItems.findIndex(p => p.value === config.defaults.provider)
    );
    const chosenProvider = await selectFromList('Select provider:', providerItems, defaultProviderIdx);
    const defaultModel = config.defaults.provider === chosenProvider
      ? config.defaults.model
      : '';
    const chosenModel = await askWithDefault('Model ID', defaultModel || 'qwen3.5-plus');

    resolved = resolveProvider(config, {
      provider: chosenProvider,
      model: chosenModel,
      baseUrl: args.baseUrl,
      apiKey: args.apiKey,
    });
  }

  if (!resolved.apiKey) {
    if (!interactive) {
      console.error(`Error: No API key for provider "${resolved.providerName}". Set it in ${CONFIG_PATH} or via --api-key`);
      process.exit(1);
    }
    resolved.apiKey = await ask(`API key for ${resolved.providerName}: `);
    if (!resolved.apiKey) {
      console.error('API key is required.');
      process.exit(1);
    }
  }

  // ── Step 4: Parse file ──
  process.stderr.write(`\nParsing ${path.basename(inputFile)}...\n`);
  let parsed: { text: string; title: string; author?: string };
  try {
    parsed = await parseFile(inputFile);
  } catch (e: any) {
    console.error(`Parse error: ${e.message}`);
    process.exit(1);
  }
  process.stderr.write(`Extracted: "${parsed.title}" by ${parsed.author || 'Unknown'} (${(parsed.text.length / 1000).toFixed(0)}k chars)\n`);

  if (parsed.text.length > DEFAULTS.CONTEXT_WINDOW_CHAR_LIMIT) {
    console.error(`Error: Book too long (${(parsed.text.length / 1_000_000).toFixed(1)}M chars).`);
    process.exit(1);
  }

  // ── Step 5: Generate ──
  process.stderr.write(`Sending to ${resolved.providerName}/${resolved.model} in ${language}...\n`);
  let summary: string;
  try {
    summary = await generateSummary(
      parsed.text,
      parsed.title,
      parsed.author || 'Unknown',
      language,
      resolved.type,
      resolved.model,
      resolved.apiKey,
      resolved.baseUrl
    );
  } catch (e: any) {
    console.error(`AI error: ${e.message}`);
    process.exit(1);
  }

  // ── Step 6: Output ──
  const filename = generateBookFilename(parsed.author || '', parsed.title);
  const contentWithFrontmatter = generateMarkdownWithFrontmatter(
    summary,
    parsed.author || '',
    parsed.title
  );

  // Explicit --output flag
  if (args.output) {
    if (args.output === '-') {
      process.stdout.write(contentWithFrontmatter);
    } else {
      const outPath = args.output.startsWith('~')
        ? path.join(os.homedir(), args.output.slice(1))
        : path.resolve(args.output);
      fs.writeFileSync(outPath, contentWithFrontmatter, 'utf-8');
      process.stderr.write(`Written to ${outPath}\n`);
    }
    return;
  }

  // Explicit --github flag
  if (args.github) {
    try {
      const url = await pushToGitHub(config, contentWithFrontmatter, filename, interactive);
      process.stderr.write(`Published: ${url}\n`);
    } catch (e: any) {
      console.error(`GitHub error: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  // Interactive output selection
  if (interactive) {
    const dest = await pickOutputDestination(filename, !!config.github?.token);

    if (dest.type === 'stdout') {
      process.stdout.write(contentWithFrontmatter);
    } else if (dest.type === 'file') {
      fs.writeFileSync(dest.path, contentWithFrontmatter, 'utf-8');
      process.stderr.write(`Written to ${dest.path}\n`);
    } else if (dest.type === 'github') {
      try {
        const url = await pushToGitHub(config, contentWithFrontmatter, filename, true);
        process.stderr.write(`Published: ${url}\n`);
      } catch (e: any) {
        console.error(`GitHub error: ${e.message}`);
        process.exit(1);
      }
    }
    return;
  }

  // Non-interactive fallback: stdout
  process.stdout.write(contentWithFrontmatter);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
