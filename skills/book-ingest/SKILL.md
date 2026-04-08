# book-ingest

将提炼结果入库到 ai-reading 仓库，按分类整理。

## 用法

```
/book-ingest --distill /tmp/distill.md --category 投资
/book-ingest --distill /tmp/distill.md --category 心理学 --tags "心理学,行为经济学"
```

## 可用分类

投资、心理学、个人成长、健康运动、商业管理、思维方式、社会科学

## 流程

```bash
REPO=/Users/zcs/code2/BookDistill
```

### 1. 入库

```bash
cd "$REPO" && npx tsx src/scripts/ingest.ts \
  --distill "$DISTILL_PATH" \
  --category "$CATEGORY" \
  [--tags "tag1,tag2"] \
  [--title "书名"] \
  [--author "作者"]
```

- stdout 输出写入的文件路径
- stderr 显示进度（title、author、category、output 路径）
- `--title` / `--author` 可覆盖 frontmatter 中的值
- 需要 `cli/config.json` 中配置 `defaults.outputDir`（默认 `~/Notes/ai-reading/books`）

### 2. 提交到 ai-reading 仓库

入库完成后，提示用户提交：

```bash
cd ~/Notes/ai-reading && git add . && git commit -m "add: <书名>"
```

注意：ai-reading 仓库有 pre-commit hook 检查 slug 唯一性。

## 命名规范

- 文件名：`<作者>-<书名>.md`
- 路径：`<outputDir>/<分类>/<作者>-<书名>.md`
- slug：书名拼音，不含作者名

## 错误处理

- 分类目录不存在：列出可用分类，请用户确认
- 文件已存在：提示将覆盖，询问确认
- title/author 缺失：要求用 `--title` / `--author` 补充
