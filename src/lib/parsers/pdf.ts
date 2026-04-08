/**
 * PDF 解析器（Node.js）
 * 使用 unpdf (基于 PDF.js)
 */
import * as fs from 'fs';
import * as path from 'path';
import { FileFormat, ParseResult, ParseError } from '../../types';

const PDF_PARSE_TIMEOUT_MS = 5 * 60 * 1000;

export async function parsePdf(filePath: string): Promise<ParseResult> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');

    const buffer = fs.readFileSync(filePath);
    const uint8Array = new Uint8Array(buffer);

    const parsePromise = (async () => {
      const pdf = await getDocumentProxy(uint8Array);
      return extractText(pdf, { mergePages: true });
    })();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`PDF parsing timed out after ${PDF_PARSE_TIMEOUT_MS / 1000}s`)),
        PDF_PARSE_TIMEOUT_MS
      )
    );

    const { text } = await Promise.race([parsePromise, timeoutPromise]);
    const title = path.basename(filePath, '.pdf');

    return { text, title, author: undefined, format: FileFormat.PDF };
  } catch (error) {
    throw new ParseError(
      `PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      FileFormat.PDF,
      error instanceof Error ? error : undefined
    );
  }
}
