import { BookParser, FileFormat, ParseResult, ParserCapabilities, ParseError } from '../../types';

/**
 * PDF 格式解析器 (预留接口)
 * TODO: 未来使用 pdfjs-dist 库实现
 */
export class PdfParser implements BookParser {
  public readonly format = FileFormat.PDF;

  public readonly capabilities: ParserCapabilities = {
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    supportsLargeFiles: false,  // PDF 解析通常较慢
    description: 'PDF format parser (not implemented yet)',
  };

  public canParse(file: File): boolean {
    return file.name.toLowerCase().endsWith('.pdf');
  }

  public async parse(file: File): Promise<ParseResult> {
    throw new ParseError(
      'PDF parsing is not yet implemented. Coming soon!',
      FileFormat.PDF
    );
  }
}
