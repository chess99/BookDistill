/**
 * 文件名规范化工具
 * 符合 ai-reading 项目的文件名约定
 */

// 导出 slug 生成函数
import { generateBookSlug } from './slugGenerator';
export { generateBookSlug };

/**
 * 规范化作者名称
 * - 移除国籍前缀 【英】【美】等
 * - 多作者用逗号分隔
 * - 移除特殊字符
 */
function normalizeAuthor(author: string): string {
  if (!author) return '';

  // 移除国籍前缀
  let cleaned = author.replace(/【[^】]+】/g, '').trim();

  // 统一分隔符：将各种分隔符转为逗号
  cleaned = cleaned
    .replace(/[;；、]/g, ',')
    .replace(/\s*,\s*/g, ',') // 统一逗号前后空格
    .replace(/,+/g, ','); // 合并多个逗号

  // 移除文件系统不允许的字符
  cleaned = cleaned.replace(/[\\/:*?"<>|]/g, '');

  return cleaned;
}

/**
 * 规范化书名
 * - 移除副标题（冒号后的内容）
 * - 移除特殊字符
 */
function normalizeTitle(title: string): string {
  if (!title) return '';

  // 移除副标题
  let cleaned = title.split(/[：:]/)[0].trim();

  // 移除文件系统不允许的字符
  cleaned = cleaned.replace(/[\\/:*?"<>|]/g, '');

  // 移除多余空格
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * 生成规范的文件名
 * 格式：作者1,作者2-书名.md
 *
 * @param author 作者名称（可能包含多个作者）
 * @param title 书名（可能包含副标题）
 * @returns 规范化的文件名
 *
 * @example
 * generateBookFilename('【英】劳伦斯·艾利森；尼尔·肖特兰', '怎样决定大事：击退恐惧、拖延和逃避')
 * // => '劳伦斯·艾利森,尼尔·肖特兰-怎样决定大事.md'
 */
export function generateBookFilename(author: string, title: string): string {
  const normalizedAuthor = normalizeAuthor(author);
  const normalizedTitle = normalizeTitle(title);

  // 使用默认值避免空文件名
  const authorPart = normalizedAuthor || 'unknown-author';
  const titlePart = normalizedTitle || 'untitled';

  return `${authorPart}-${titlePart}.md`;
}

/**
 * 生成带 frontmatter 的 Markdown 内容
 *
 * @param content 原始内容
 * @param author 作者名称
 * @param title 书名
 * @param tags 可选的标签数组
 * @returns 带 frontmatter 的完整内容
 */
export function generateMarkdownWithFrontmatter(
  content: string,
  author: string,
  title: string,
  tags?: string[]
): string {
  const slug = generateBookSlug(author, title);

  const frontmatter = `---
slug: ${slug}
${tags && tags.length > 0 ? `tags: [${tags.join(', ')}]` : ''}
---

`;

  return frontmatter + content;
}
