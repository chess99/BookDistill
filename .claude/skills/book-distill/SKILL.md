# book-distill

用 AI API 提炼书籍，生成结构化的 Markdown 知识摘要。

## 用法

```
/book-distill /path/to/book.epub
/book-distill /path/to/book.epub --lang Chinese --provider bailian
```

## 策略

**策略 1：Claude Code 子 agent 提炼（推荐，≤800k chars）**

直接用 Claude Code 自身（1M context）提炼，质量最好，无需外部 API 调用。

```bash
REPO=/Users/zcs/code2/BookDistill
# 解析书籍文本
cd "$REPO" && npx tsx -e "
import { parseFile } from './src/lib/parsers/index.js';
const r = await parseFile('$BOOK_PATH');
process.stdout.write(JSON.stringify({ text: r.text, title: r.title, author: r.author || 'Unknown', chars: r.text.length }));
" > /tmp/book-meta.json
```

读取 `/tmp/book-meta.json` 获取 `text`、`title`、`author`、`chars`。

如果 chars ≤ 800000，将书籍全文直接放入上下文，按 `SYSTEM_INSTRUCTION_TEMPLATE` 提炼：

```bash
cat "$REPO/src/constants.ts" | grep -A 50 "SYSTEM_INSTRUCTION_TEMPLATE"
```

提炼完成后，用 `generateMarkdownWithFrontmatter` 生成带 frontmatter 的内容写入临时文件。

**策略 2：AI API 提炼（所有大小均可，需配置 provider）**

```bash
cd "$REPO" && npx tsx src/scripts/distill.ts --file "$BOOK_PATH" --output /tmp/distill-out.md
```

- 自动处理大书（>800k chars）：使用层级提炼（hierarchical）
- 需要 `cli/config.json` 中配置 provider

## 流程

1. 解析书籍，获取字符数
2. 字符数 = 0：停止，告知用户（可能是扫描版 PDF）
3. 选择策略（默认策略 1 if ≤800k，否则策略 2）
4. 提炼，生成 `/tmp/<书名>-distill.md`
5. 显示提炼结果摘要（前 500 字），询问是否运行 `/book-review`

## 输出

提炼结果写入 `/tmp/<书名>-distill.md`，告知用户路径。

## 注意

**严禁凭记忆编造书籍内容。** 解析失败时必须停下，不得用训练知识代替真实书本内容。
