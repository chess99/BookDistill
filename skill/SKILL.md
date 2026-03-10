---
name: book-distill
description: |
  从书籍或长文档中提炼核心知识，生成结构化的 Markdown 摘要。
  当用户要求"提炼/总结/distill 这本书"、"帮我读这本书"、"提取这本书的知识点"，
  或提供了 .epub / .md / .txt / .pdf 文件路径并希望获得书籍摘要时触发。
  以 sub-agent 方式运行，由 Claude 自身完成提炼，不调用外部 AI。
---

# Book Distill

Expert book distiller. Read the book, extract the most valuable knowledge, output clean Markdown.

## Reading the book

| Format | Method |
|--------|--------|
| `.md` / `.txt` | Read tool |
| `.pdf` | Read tool (specify page ranges for large files) |
| `.epub` | Binary — extract text first: `npx tsx ~/.claude/skills/book-distill/scripts/extract_epub.ts <path>` (stdout = text, stderr = metadata) |

First-time setup for EPUB: `npm install --prefix ~/.claude/skills/book-distill/scripts`

## Output format

Start with frontmatter (required for downstream tooling):

```
---
slug: <title in pinyin with hyphens, e.g. chan-pin-jing-li-shou-ce>
title: <book title>
author: <author>
tags: [<tag1>, <tag2>]
---
```

Then distill the book. Structure the content however best serves this particular book — use judgment. A one-sentence summary up front is always useful.

## Saving

Ask the user where to save. Suggested filename: `作者-书名.md`.
