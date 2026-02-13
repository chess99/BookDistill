import { BookParser, FileFormat, ParseResult, ParseError } from '../types';
import { EpubParser } from './parsers/epubParser';
import { MarkdownParser } from './parsers/markdownParser';

/**
 * 解析器工厂 - 负责格式检测和解析器路由
 * 采用单例模式,全局共享一个实例
 */
export class ParserFactory {
  private parsers: Map<FileFormat, BookParser> = new Map();

  constructor() {
    this.registerDefaultParsers();
  }

  /**
   * 注册默认解析器
   */
  private registerDefaultParsers(): void {
    this.register(new EpubParser());
    this.register(new MarkdownParser());
    // 未来在此添加新解析器: this.register(new PdfParser());
  }

  /**
   * 注册解析器 (支持外部扩展)
   */
  public register(parser: BookParser): void {
    this.parsers.set(parser.format, parser);
  }

  /**
   * 自动检测文件格式
   * @returns 检测到的格式,如果不支持则返回 null
   */
  public detectFormat(file: File): FileFormat | null {
    for (const parser of this.parsers.values()) {
      if (parser.canParse(file)) {
        return parser.format;
      }
    }
    return null;
  }

  /**
   * 获取指定格式的解析器
   */
  public getParser(format: FileFormat): BookParser | null {
    return this.parsers.get(format) || null;
  }

  /**
   * 解析文件 (主入口)
   */
  public async parseFile(file: File): Promise<ParseResult> {
    const format = this.detectFormat(file);

    if (!format) {
      throw new ParseError(
        `Unsupported file format: ${file.name}`,
        FileFormat.EPUB // 默认格式用于错误报告
      );
    }

    const parser = this.getParser(format);
    if (!parser) {
      throw new ParseError(
        `No parser available for format: ${format}`,
        format
      );
    }

    try {
      return await parser.parse(file);
    } catch (error) {
      throw new ParseError(
        `Failed to parse ${format} file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        format,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 获取所有支持的格式信息 (用于 UI)
   */
  public getSupportedFormats(): {
    extensions: string[];
    accept: string;  // HTML input accept 属性格式
  } {
    const allExtensions: string[] = [];

    for (const parser of this.parsers.values()) {
      allExtensions.push(...parser.capabilities.extensions);
    }

    return {
      extensions: allExtensions,
      accept: allExtensions.map(ext => `.${ext}`).join(',')
    };
  }
}

// 导出单例实例
export const parserFactory = new ParserFactory();
