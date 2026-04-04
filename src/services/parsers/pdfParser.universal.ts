/**
 * 通用 PDF 解析器 - 支持 Node.js 和边缘运行时
 * 使用 unpdf (基于 PDF.js)
 */
import { FileAdapter } from './adapters';
import { FileFormat, ParseResult, ParseError } from '../../types';

/**
 * 纯函数 PDF 解析逻辑 - 环境无关
 */
export async function parsePdfFile(file: FileAdapter): Promise<ParseResult> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');

    const arrayBuffer = await file.readAsArrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 提取文本内容
    const pdf = await getDocumentProxy(uint8Array);
    const { text } = await extractText(pdf, { mergePages: true });

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
