/**
 * 解析器入口 — 根据文件扩展名路由
 */
import * as path from 'path';
import { FileFormat, ParseResult, ParseError } from '../../types';
import { parseEpub } from './epub';
import { parseMarkdown } from './markdown';
import { parsePdf } from './pdf';

export async function parseFile(filePath: string): Promise<ParseResult> {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  switch (ext) {
    case 'epub': return parseEpub(filePath);
    case 'md':
    case 'markdown': return parseMarkdown(filePath);
    case 'pdf': return parsePdf(filePath);
    default:
      throw new ParseError(`Unsupported format: .${ext}`, FileFormat.EPUB);
  }
}

export { parseEpub, parseMarkdown, parsePdf };
