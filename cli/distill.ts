#!/usr/bin/env npx tsx
/**
 * BookDistill CLI
 * 
 * Usage:
 *   GEMINI_API_KEY=xxx npx ts-node cli/distill.ts -i book.epub -o summary.md
 *   GEMINI_API_KEY=xxx npx ts-node cli/distill.ts -i book.epub  # outputs to stdout
 * 
 * Options:
 *   -i, --input    Input file (epub, md, pdf)
 *   -o, --output   Output file (optional, defaults to stdout)
 *   -l, --lang     Output language (default: Chinese)
 *   -m, --model    Gemini model (default: gemini-2.5-flash)
 *   -h, --help     Show help
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';

// ============ Minimal argument parser ============
interface Args {
  input?: string;
  output?: string;
  lang: string;
  model: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    lang: 'Chinese',
    model: 'gemini-2.5-flash',
    help: false,
  };
  
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    
    switch (arg) {
      case '-i':
      case '--input':
        args.input = next;
        i++;
        break;
      case '-o':
      case '--output':
        args.output = next;
        i++;
        break;
      case '-l':
      case '--lang':
        args.lang = next;
        i++;
        break;
      case '-m':
      case '--model':
        args.model = next;
        i++;
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
    }
  }
  
  return args;
}

function showHelp() {
  console.log(`
BookDistill CLI - Extract knowledge from books using Gemini

Usage:
  GEMINI_API_KEY=xxx npx ts-node cli/distill.ts -i <file> [options]

Options:
  -i, --input <file>    Input file (epub, md, markdown)
  -o, --output <file>   Output markdown file (default: stdout)
  -l, --lang <lang>     Output language (default: Chinese)
  -m, --model <model>   Gemini model (default: gemini-2.5-flash)
  -h, --help            Show this help

Environment:
  GEMINI_API_KEY        Required. Your Gemini API key.

Examples:
  # Basic usage
  GEMINI_API_KEY=xxx npx ts-node cli/distill.ts -i book.epub -o summary.md

  # Use different model
  GEMINI_API_KEY=xxx npx ts-node cli/distill.ts -i book.epub -m gemini-3-pro-preview

  # Output in English
  GEMINI_API_KEY=xxx npx ts-node cli/distill.ts -i book.epub -l English
`);
}

// ============ File Parsers (Node.js versions) ============

async function parseMarkdown(filePath: string): Promise<{ text: string; title: string; author?: string }> {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Parse frontmatter
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return {
      text: content,
      title: path.basename(filePath, path.extname(filePath)),
    };
  }
  
  const [, frontmatter, body] = match;
  const titleMatch = frontmatter.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
  const authorMatch = frontmatter.match(/^author:\s*['"]?(.+?)['"]?\s*$/m);
  
  return {
    text: body.trim(),
    title: titleMatch?.[1] || path.basename(filePath, path.extname(filePath)),
    author: authorMatch?.[1],
  };
}

async function parseEpub(filePath: string): Promise<{ text: string; title: string; author?: string }> {
  // Dynamic import for JSZip (ESM compatible)
  const JSZip = (await import('jszip')).default;
  const { JSDOM } = await import('jsdom');
  
  const fileBuffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(fileBuffer);
  
  // 1. Find OPF path from container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('Invalid EPUB: Missing container.xml');
  
  const containerDom = new JSDOM(containerXml, { contentType: 'text/xml' });
  const rootFile = containerDom.window.document.querySelector('rootfile');
  const opfPath = rootFile?.getAttribute('full-path');
  if (!opfPath) throw new Error('Invalid EPUB: Cannot find OPF path');
  
  // 2. Parse OPF
  const opfContent = await zip.file(opfPath)?.async('string');
  if (!opfContent) throw new Error('Invalid EPUB: OPF file missing');
  
  const opfDom = new JSDOM(opfContent, { contentType: 'text/xml' });
  const opfDoc = opfDom.window.document;
  
  // Extract metadata
  const title = opfDoc.querySelector('metadata > title, metadata title')?.textContent 
    || path.basename(filePath, '.epub');
  const author = opfDoc.querySelector('metadata > creator, metadata creator')?.textContent || undefined;
  
  // 3. Build manifest map
  const manifestItems = Array.from(opfDoc.querySelectorAll('manifest > item, manifest item'));
  const manifestMap = new Map<string, string>();
  manifestItems.forEach(item => {
    manifestMap.set(item.getAttribute('id') || '', item.getAttribute('href') || '');
  });
  
  // 4. Get spine order
  const spineItems = Array.from(opfDoc.querySelectorAll('spine > itemref, spine itemref'));
  
  const opfFolder = opfPath.substring(0, opfPath.lastIndexOf('/'));
  const resolvePath = (href: string) => opfFolder ? `${opfFolder}/${href}` : href;
  
  // 5. Extract text from chapters
  let fullText = '';
  
  for (const item of spineItems) {
    const idref = item.getAttribute('idref');
    if (!idref) continue;
    
    const href = manifestMap.get(idref);
    if (!href) continue;
    
    const fullPath = resolvePath(href);
    const fileContent = await zip.file(fullPath)?.async('string');
    
    if (fileContent) {
      const dom = new JSDOM(fileContent);
      const doc = dom.window.document;
      
      // Remove scripts and styles
      doc.querySelectorAll('script, style').forEach(el => el.remove());
      
      const text = doc.body?.textContent || '';
      fullText += text.replace(/\s+/g, ' ').trim() + '\n\n';
    }
  }
  
  return { text: fullText, title, author };
}

async function parseFile(filePath: string): Promise<{ text: string; title: string; author?: string }> {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.epub':
      return parseEpub(filePath);
    case '.md':
    case '.markdown':
      return parseMarkdown(filePath);
    default:
      throw new Error(`Unsupported format: ${ext}. Supported: .epub, .md, .markdown`);
  }
}

// ============ Gemini API ============

async function generateSummary(
  text: string,
  title: string,
  author: string,
  language: string,
  modelId: string,
  apiKey: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `
Expert Book Distiller.
Task: Extract detailed knowledge and insights from the provided book.
Constraint 1: Output MUST be in ${language} language.
Constraint 2: Use clean Markdown formatting.
Constraint 3: Do NOT include any conversational text like "这是一本", "以下是", "如果你愿意" etc.
Constraint 4: Start directly with the content structure (headings, bullet points, etc).
`.trim();

  process.stderr.write(`Sending to ${modelId} (${(text.length / 1000).toFixed(0)}k chars)...\n`);
  
  const response = await ai.models.generateContent({
    model: modelId,
    contents: [
      {
        role: 'user',
        parts: [{ text: `Title: ${title}\nAuthor: ${author}\n\n${text}` }],
      },
    ],
    config: {
      temperature: 0.3,
      systemInstruction,
    },
  });
  
  return response.text || '';
}

// ============ Main ============

async function main() {
  const args = parseArgs(process.argv);
  
  if (args.help || !args.input) {
    showHelp();
    process.exit(args.help ? 0 : 1);
  }
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY environment variable is required');
    process.exit(1);
  }
  
  if (!fs.existsSync(args.input)) {
    console.error(`Error: Input file not found: ${args.input}`);
    process.exit(1);
  }
  
  try {
    // Parse input file
    process.stderr.write(`Parsing ${args.input}...\n`);
    const { text, title, author } = await parseFile(args.input);
    process.stderr.write(`Extracted: "${title}" by ${author || 'Unknown'} (${(text.length / 1000).toFixed(0)}k chars)\n`);
    
    // Check size limit
    const LIMIT = 3_500_000;
    if (text.length > LIMIT) {
      console.error(`Error: Book too long (${(text.length / 1_000_000).toFixed(1)}M chars). Max: ${LIMIT / 1_000_000}M`);
      process.exit(1);
    }
    
    // Generate summary
    const summary = await generateSummary(text, title, author || 'Unknown', args.lang, args.model, apiKey);
    
    // Output
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
