# book-review

对提炼结果进行对抗性质量审查，检测浅层内容、遗漏章节、疑似编造。

## 用法

```
/book-review --book /path/to/book.epub --distill /tmp/distill.md
```

## 流程

```bash
REPO=/Users/zcs/code2/BookDistill
```

### 1. 运行审查

```bash
cd "$REPO" && npx tsx src/scripts/review.ts --book "$BOOK_PATH" --distill "$DISTILL_PATH"
```

- stdout 输出审查报告（Markdown）
- 退出码：0 = PASS，1 = NEEDS_REVISION，2 = 错误
- 需要 `cli/config.json` 中配置 provider

### 2. 输出

- **PASS**：告知用户审查通过，询问是否运行 `/book-ingest` 入库
- **NEEDS_REVISION**：显示完整报告，列出具体问题，询问用户如何处理：
  - 重新提炼（回到 `/book-distill`）
  - 手动修改提炼结果后再次审查
  - 忽略问题直接入库

## 审查维度

1. **浅层内容**：是否只有表面概念，缺乏具体论据、数据、案例
2. **遗漏章节**：原书重要主题是否完全缺失
3. **疑似编造**：引用、数据、论点是否无法在原书中找到
4. **引用准确性**：直接引用是否与原文一致

## 错误处理

- provider 未配置：提示在 `cli/config.json` 中配置 `defaults.provider`
- 书籍解析失败：可能是扫描版 PDF，建议提供 epub 或文字版 PDF
