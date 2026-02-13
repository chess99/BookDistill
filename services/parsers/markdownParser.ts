import { BookParser, FileFormat, ParseResult, ParserCapabilities, ParseError } from '../../types';

/**
 * Markdown 格式解析器
 * 提取 Frontmatter 元数据和纯文本内容
 */
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
    try {
      const text = await this.readFile(file);
      const { content, metadata } = this.parseFrontmatter(text);

      return {
        text: content,
        title: metadata.title || file.name.replace(/\.md(arkdown)?$/, ''),
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

  /**
   * 读取文件为文本
   */
  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file, 'utf-8');
    });
  }

  /**
   * 解析 Frontmatter (YAML 格式)
   * 支持格式:
   * ---
   * title: 书名
   * author: 作者
   * ---
   * 正文内容...
   */
  private parseFrontmatter(text: string): {
    content: string;
    metadata: { title?: string; author?: string };
  } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = text.match(frontmatterRegex);

    if (!match) {
      // 无 Frontmatter,整个文件作为内容
      return { content: text, metadata: {} };
    }

    const [, frontmatter, content] = match;
    const metadata: { title?: string; author?: string } = {};

    // 简单解析 YAML (仅支持 title 和 author)
    const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
    const authorMatch = frontmatter.match(/^author:\s*(.+)$/m);

    if (titleMatch) metadata.title = titleMatch[1].trim();
    if (authorMatch) metadata.author = authorMatch[1].trim();

    return { content: content.trim(), metadata };
  }
}
