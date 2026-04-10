# zlib-download

从 z-library 搜索并下载书籍。

## 用法

```
/zlib-download 书名或作者
/zlib-download https://z-lib.fm/book/xxx
```

## 流程

```bash
REPO=/Users/zcs/code2/BookDistill
```

### 1. 下载书籍

```bash
cd "$REPO" && npx tsx src/scripts/download.ts --query "$QUERY"
# 或直接 URL：
cd "$REPO" && npx tsx src/scripts/download.ts --url "$URL"
```

- stdout 输出下载后的本地文件路径
- stderr 显示搜索结果列表和选择理由
- 需要 `cli/config.json` 中配置 `zlibrary.cookies`

### 2. 输出

下载完成后，将文件路径告知用户，并询问是否继续提炼：
- 文件路径：`<downloadDir>/<filename>`
- 询问：是否运行 `/book-distill` 提炼这本书？

## 错误处理

- cookies 未配置：提示用户在 `cli/config.json` 的 `zlibrary.cookies` 中填入浏览器 cookie
- 搜索无结果：建议换关键词或直接提供 URL
- 下载失败：检查 cookie 是否过期，z-library 是否可访问
