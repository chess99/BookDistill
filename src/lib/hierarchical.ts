/**
 * 层级提炼（Hierarchical Distillation）
 *
 * 用于处理超长文本（超出单次 AI 上下文窗口的书籍）。
 *
 * 流程：
 *   1. 将原文按段落边界切割成若干块（默认 80k chars/块）
 *   2. 对每块独立调用 generateFn，生成中间摘要
 *   3. 将所有中间摘要拼接，再调用一次 generateFn 生成最终提炼
 */

/** 切割选项 */
export interface SplitOptions {
  /** 目标块大小（chars），默认 80000 */
  chunkSize?: number;
  /** 最小块大小（chars），默认 10000 */
  minChunkSize?: number;
}

/**
 * 按段落边界切割文本
 */
export function splitText(text: string, options: SplitOptions = {}): string[] {
  const { chunkSize = 80_000, minChunkSize = 10_000 } = options;

  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    if (text.length - start <= chunkSize) {
      // Last chunk — take the rest
      chunks.push(text.slice(start));
      break;
    }

    // Find a paragraph boundary near chunkSize
    const end = start + chunkSize;
    const searchWindow = text.slice(end - 5000, end + 5000);
    const paraBreak = searchWindow.lastIndexOf('\n\n');

    let splitAt: number;
    if (paraBreak !== -1) {
      splitAt = end - 5000 + paraBreak;
    } else {
      // Fallback: find nearest newline
      const lineBreak = text.lastIndexOf('\n', end);
      splitAt = lineBreak > start + minChunkSize ? lineBreak : end;
    }

    // Ensure minimum chunk size
    if (splitAt - start < minChunkSize) {
      splitAt = start + chunkSize;
    }

    chunks.push(text.slice(start, splitAt));
    start = splitAt;
  }

  return chunks.filter(c => c.trim().length > 0);
}

export interface DistillLargeTextOptions {
  chunkSize?: number;
  /** Called with progress info: (chunkIndex, totalChunks) */
  onProgress?: (chunkIndex: number, total: number) => void;
}

/**
 * 层级提炼主函数
 *
 * @param text       原始书籍文本
 * @param title      书名
 * @param author     作者
 * @param language   输出语言
 * @param generateFn 调用 AI 的函数（text, title, author → summary）
 * @param options    可选配置
 */
export async function distillLargeText(
  text: string,
  title: string,
  author: string,
  language: string,
  generateFn: (text: string, title: string, author: string, systemPrompt: string) => Promise<string>,
  options: DistillLargeTextOptions = {}
): Promise<string> {
  const chunks = splitText(text, { chunkSize: options.chunkSize });

  if (chunks.length === 1) {
    // No need for hierarchical mode
    throw new Error('Text fits in a single chunk, use direct generation instead');
  }

  process.stderr.write(
    `Hierarchical distillation: ${chunks.length} chunks × ~${Math.round(chunks[0].length / 1000)}k chars each\n`
  );

  // ── Pass 1: Per-chunk intermediate summaries ──────────────────────────────
  const intermediates: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    options.onProgress?.(i + 1, chunks.length);
    process.stderr.write(`  Processing chunk ${i + 1}/${chunks.length}...\n`);

    const chunkPrompt = buildChunkSystemPrompt(title, i + 1, chunks.length, language);
    const summary = await generateFn(chunks[i], title, author, chunkPrompt);
    intermediates.push(summary);
  }

  // ── Pass 2: Merge pass ────────────────────────────────────────────────────
  process.stderr.write(`  Merging ${intermediates.length} summaries...\n`);

  const mergedInput = intermediates
    .map((s, i) => `## 第 ${i + 1} 部分摘要\n\n${s}`)
    .join('\n\n---\n\n');

  const mergePrompt = buildMergeSystemPrompt(title, chunks.length, language);
  const finalSummary = await generateFn(mergedInput, title, author, mergePrompt);

  return finalSummary;
}

function buildChunkSystemPrompt(title: string, n: number, total: number, language: string): string {
  return `你正在处理《${title}》第 ${n}/${total} 部分的内容。
请提炼这一部分的核心观点、关键概念和重要论据。
格式：要点列表 + 关键引用（如有）。
不需要完整结构，只需忠实记录这部分的核心内容。
输出语言：${language}。`;
}

function buildMergeSystemPrompt(title: string, total: number, language: string): string {
  return `以下是《${title}》各部分的提炼摘要，共 ${total} 部分。
请综合这些摘要，生成一份完整的书籍提炼，要求：
- 识别贯穿全书的核心主题和论点
- 整合各部分的关键概念
- 去除重复，突出洞察
- 按主题（而非按部分顺序）组织内容
- 使用 Markdown 格式，层次清晰
输出语言：${language}。`;
}
