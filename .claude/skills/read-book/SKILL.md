# read-book

完整书籍处理流水线：下载 → 提炼 → 审查 → 入库。

## 用法

```
/read-book 书名或作者
/read-book https://z-lib.fm/book/xxx
/read-book /path/to/local/book.epub
```

## 流程

每步完成后询问用户是否继续。

### Step 1：获取书籍

**本地文件：** 直接进入 Step 2。

**URL 或搜索词：** 运行 `/zlib-download`：

```bash
REPO=/Users/zcs/code2/BookDistill
cd "$REPO" && npx tsx src/scripts/download.ts --query "$QUERY"
# 或：
cd "$REPO" && npx tsx src/scripts/download.ts --url "$URL"
```

- stdout = 本地文件路径
- 下载完成后，告知用户路径，询问是否继续提炼

### Step 2：提炼

运行 `/book-distill`（见该 skill 的策略选择逻辑）。

提炼完成后，显示结果摘要（前 500 字），询问是否继续审查。

### Step 3：审查（可选）

询问用户是否运行对抗性审查：

> 是否对提炼结果进行质量审查？审查会对比原书内容，检测遗漏和编造。（需配置 provider）

- **是**：运行 `/book-review`
  - PASS → 继续入库
  - NEEDS_REVISION → 显示报告，询问处理方式
- **否**：跳过，直接进入 Step 4

### Step 4：入库

询问用户分类，运行 `/book-ingest`：

```bash
cd "$REPO" && npx tsx src/scripts/ingest.ts \
  --distill "$DISTILL_PATH" \
  --category "$CATEGORY"
```

入库完成后，提示用户提交 ai-reading 仓库。

## 中断与恢复

每步都会告知中间产物路径（如 `/tmp/<书名>-distill.md`），用户可随时单独运行对应 skill 继续处理。

## 注意

- 下载需要 `cli/config.json` 中的 `zlibrary.cookies`
- 审查需要配置 `defaults.provider`
- **严禁凭记忆编造书籍内容**：解析失败时必须停下
