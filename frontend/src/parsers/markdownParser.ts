/**
 * Markdown 格式解析器 (浏览器端)
 * 使用通用解析逻辑 + 浏览器适配器
 */
import { BookParser, FileFormat, ParseResult, ParserCapabilities } from '../../types';
import { BrowserFileAdapter } from './adapters';
import { parseMarkdownFile } from './markdownParser.universal';

export class MarkdownParser implements BookParser {
  public readonly format = FileFormat.MARKDOWN;

  public readonly capabilities: ParserCapabilities = {
    extensions: ['md', 'markdown'],
    mimeTypes: ['text/markdown', 'text/x-markdown'],
    supportsLargeFiles: true,
    description: 'Markdown format parser with Frontmatter support',
  };

  public canParse(file: File): boolean {
    const name = file.name.toLowerCase();
    return name.endsWith('.md') || name.endsWith('.markdown');
  }

  public async parse(file: File): Promise<ParseResult> {
    const fileAdapter = new BrowserFileAdapter(file);
    return parseMarkdownFile(fileAdapter);
  }
}
