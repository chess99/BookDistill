# BookDistill 开发规范

## 书籍提炼质量原则

**严禁凭记忆编造书籍内容。**

当书籍文件无法正常解析（如 PDF 扫描件提取字符数为 0 或极少）时：
- **必须停下，告知用户**：说明解析失败的原因（如"这是扫描版 PDF，无法提取文字"）
- **不得**用模型训练知识代替真实书本内容继续提炼
- 建议用户重新提供可解析的版本（epub / 文字版 PDF）

背景：曾发生过《笑傲股市》和《市场奇才》PDF 扫描版提取 0-1k 字符，但模型仍输出了看似完整的提炼内容，实为凭记忆编造，不可信。

## z-library 下载

- 搜索结果解析：使用 `z-bookcard` 自定义元素的 attributes（`extension`/`filesize`/`year`/`language`/`rating`/`quality`），不是子元素
- 格式优先级：epub > mobi > azw3 > pdf
- PDF 大文件（>15MB）大概率是扫描版，打分时扣分
- 语言加分仅 +5，不强制偏向中文或英文

## 下载目录

原始书籍文件保存到：`/Users/zcs/Notes/ai-reading/raw-books/`（已 gitignore）
