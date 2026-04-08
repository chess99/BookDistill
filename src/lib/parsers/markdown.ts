/**
 * Markdown 解析器（Node.js）
 */
import * as fs from 'fs';
import * as path from 'path';
import { FileFormat, ParseResult, ParseError } from '../../types';

function parseFrontmatter(text: string): {
  content: string;
  metadata: { title?: string; author?: string };
} {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { content: text, metadata: {} };

  const [, frontmatter, content] = match;
  const metadata: { title?: string; author?: string } = {};
  const titleMatch = frontmatter.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
  const authorMatch = frontmatter.match(/^author:\s*['"]?(.+?)['"]?\s*$/m);
  if (titleMatch) metadata.title = titleMatch[1].trim();
  if (authorMatch) metadata.author = authorMatch[1].trim();

  return { content: content.trim(), metadata };
}

export async function parseMarkdown(filePath: string): Promise<ParseResult> {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const { content, metadata } = parseFrontmatter(text);
    const defaultTitle = path.basename(filePath).replace(/\.md(arkdown)?$/i, '');

    return {
      text: content,
      title: metadata.title || defaultTitle,
      author: metadata.author,
      format: FileFormat.MARKDOWN,
    };
  } catch (error) {
    throw new ParseError(
      `Markdown parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      FileFormat.MARKDOWN,
      error instanceof Error ? error : undefined
    );
  }
}
