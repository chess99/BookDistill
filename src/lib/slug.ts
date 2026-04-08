/**
 * 书籍 Slug 生成工具
 * 用于生成持久化的拼音 URL 标识
 */

import { pinyin } from 'pinyin-pro';

/**
 * 将中文转换为拼音 slug（保留英文）
 */
function chineseToPinyinSlug(text: string): string {
  // 检测是否包含中文字符
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);

  if (!hasChinese) {
    // 纯英文，直接处理
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\-]/g, '-')  // 移除非字母数字和连字符
      .replace(/-+/g, '-')            // 合并多个连字符
      .replace(/^-|-$/g, '')          // 移除首尾连字符
      .substring(0, 60);              // 限制长度
  }

  // 包含中文，转换为拼音
  const pinyinText = pinyin(text, {
    toneType: 'none',  // 不带声调
    type: 'array',     // 返回数组
  });

  return pinyinText
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, '-')  // 移除非字母数字和连字符
    .replace(/-+/g, '-')            // 合并多个连字符
    .replace(/^-|-$/g, '')          // 移除首尾连字符
    .substring(0, 60);              // 限制长度
}

/**
 * 生成书籍的拼音 slug（只用书名，不用作者名）
 *
 * @param author 作者名称（未使用，保留参数以兼容现有调用）
 * @param title 书名（可能包含副标题）
 * @returns 拼音 slug
 *
 * @example
 * generateBookSlug('彼得·林奇', '彼得·林奇的成功投资：发现优质股的黄金法则')
 * // => 'bi-de-lin-qi-de-cheng-gong-tou-zi'
 *
 * @example
 * generateBookSlug('劳伦斯·艾利森,尼尔·肖特兰', '怎样决定大事：击退恐惧、拖延和逃避')
 * // => 'zen-yang-jue-ding-da-shi'
 */
export function generateBookSlug(author: string, title: string): string {
  // 移除副标题（冒号后的内容）
  const titlePart = title.split(/[：:]/)[0].trim();

  // 提取语言标识 (En)、(Zh) 等
  const langMatch = titlePart.match(/\((?:En|Zh)\)$/i);
  const langSuffix = langMatch ? langMatch[0].toLowerCase().replace(/[()]/g, '') : '';

  // 移除括号内容（如 (En)、(Zh)）
  const cleanTitle = titlePart.replace(/\s*\([^)]+\)\s*/g, ' ').trim();

  // 转换为拼音
  const baseSlug = chineseToPinyinSlug(cleanTitle);

  // 如果有语言标识，添加到末尾
  return langSuffix ? `${baseSlug}-${langSuffix}` : baseSlug;
}
