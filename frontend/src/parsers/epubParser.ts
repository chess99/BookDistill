/**
 * EPUB 格式解析器 (浏览器端)
 * 使用通用解析逻辑 + 浏览器适配器
 */
import { BookParser, FileFormat, ParseResult, ParserCapabilities } from '../../types';
import { BrowserFileAdapter, BrowserDOMParserAdapter } from './adapters';
import { parseEpubFile } from './epubParser.universal';

export class EpubParser implements BookParser {
  public readonly format = FileFormat.EPUB;

  public readonly capabilities: ParserCapabilities = {
    extensions: ['epub'],
    mimeTypes: ['application/epub+zip'],
    supportsLargeFiles: true,
    description: 'Electronic Publication (EPUB) format parser',
  };

  public canParse(file: File): boolean {
    return file.name.toLowerCase().endsWith('.epub');
  }

  public async parse(file: File): Promise<ParseResult> {
    const fileAdapter = new BrowserFileAdapter(file);
    const domParser = new BrowserDOMParserAdapter();

    return parseEpubFile(fileAdapter, { domParser });
  }
}
