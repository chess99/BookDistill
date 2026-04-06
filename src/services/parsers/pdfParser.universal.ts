/**
 * 通用 PDF 解析器 - 支持 Node.js 和边缘运行时
 * 使用 unpdf (基于 PDF.js)
 */
import { FileAdapter } from './adapters';
import { FileFormat, ParseResult, ParseError } from '../../types';

/** PDF 解析超时（毫秒），默认 5 分钟 */
const PDF_PARSE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 纯函数 PDF 解析逻辑 - 环境无关
 */
export async function parsePdfFile(file: FileAdapter): Promise<ParseResult> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');

    const arrayBuffer = await file.readAsArrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 提取文本内容（带超时保护，防止恶意/损坏 PDF 挂起）
    const parsePromise = (async () => {
      const pdf = await getDocumentProxy(uint8Array);
      return extractText(pdf, { mergePages: true });
    })();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`PDF parsing timed out after ${PDF_PARSE_TIMEOUT_MS / 1000}s — the file may be too large or severely corrupted`)), PDF_PARSE_TIMEOUT_MS)
    );

    const { text } = await Promise.race([parsePromise, timeoutPromise]);

    // 尝试从文件名推断标题
    const title = file.name.replace(/\.pdf$/i, '');

    return {
      text,
      title,
      author: undefined,
      format: FileFormat.PDF,
    };
  } catch (error) {
    throw new ParseError(
      `PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      FileFormat.PDF,
      error instanceof Error ? error : undefined
    );
  }
}
