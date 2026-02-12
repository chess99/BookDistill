/**
 * 书籍 Slug 生成工具
 * 用于生成持久化的书籍 URL 标识
 */

/**
 * 规范化作者名称（复用 filenameUtils 的逻辑）
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
 * 规范化书名（复用 filenameUtils 的逻辑）
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
 * 生成规范化的书籍 slug
 * 格式：{作者}-{书名}
 *
 * @param author 作者名称（可能包含多个作者）
 * @param title 书名（可能包含副标题）
 * @returns 规范化的 slug
 *
 * @example
 * generateBookSlug('【美】彼得·林奇', '彼得·林奇的成功投资：发现优质股的黄金法则')
 * // => '彼得·林奇-彼得·林奇的成功投资'
 *
 * @example
 * generateBookSlug('【英】劳伦斯·艾利森；尼尔·肖特兰', '怎样决定大事：击退恐惧、拖延和逃避')
 * // => '劳伦斯·艾利森,尼尔·肖特兰-怎样决定大事'
 */
export function generateBookSlug(author: string, title: string): string {
  const cleanAuthor = normalizeAuthor(author);
  const cleanTitle = normalizeTitle(title);

  // 使用默认值避免空 slug
  const authorPart = cleanAuthor || 'unknown-author';
  const titlePart = cleanTitle || 'untitled';

  return `${authorPart}-${titlePart}`;
}
