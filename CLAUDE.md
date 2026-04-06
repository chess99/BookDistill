# BookDistill 开发规范

## 书籍提炼质量原则

**严禁凭记忆编造书籍内容。**

当书籍文件无法正常解析（如 PDF 扫描件提取字符数为 0 或极少）时：
- **必须停下，告知用户**：说明解析失败的原因（如"这是扫描版 PDF，无法提取文字"）
- **不得**用模型训练知识代替真实书本内容继续提炼
- 建议用户重新提供可解析的版本（epub / 文字版 PDF）

## z-library Playwright 下载

**直链 `/dl/` URL 的正确写法（踩过坑）：**

```typescript
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout }),
  page.goto(url, { waitUntil: 'commit', timeout }).catch(() => {}),
]);
const tmpPath = await download.path();
fs.copyFileSync(tmpPath, savePath);
```

- `page.goto()` 会抛 "Download is starting"，必须 `.catch(() => {})` 吞掉
- `waitForEvent` 必须在 `goto` 之前注册（Promise.all 保证顺序）
- 不能用 `download.saveAs()`，会报 canceled；必须用 `download.path()` + `copyFileSync`
- 普通书籍详情页（非 `/dl/`）：用 `page.on('download')` 注册，点击按钮后等待

**搜索页解析：**

z-library 搜索结果使用 `<z-bookcard>` 自定义元素，数据全在 attributes 里，不在子元素中：

| attribute | 含义 |
|-----------|------|
| `extension` | 文件格式（epub/pdf/mobi） |
| `filesize` | 文件大小（如 "722 KB"） |
| `year` | 出版年份 |
| `language` | 语言 |
| `rating` | 用户评分（0-5） |
| `quality` | 扫描质量（0=差/扫描版，5=好）|
| `href` | 书籍详情页路径 |

搜索 URL 格式：`https://z-lib.fm/s/{encodeURIComponent(query)}`

**版本选择优先级：**
- 格式：epub > mobi > azw3 > pdf（40分）
- PDF 大文件（>15MB）大概率是扫描版（-10分）
- quality 字段比文件大小更可靠（quality≥4 加8分，<2 减5分）
- 语言加分仅 +5，不强制偏向中文或英文

## 下载目录

原始书籍文件保存到 `config.zlibrary.downloadDir`（在 `cli/config.json` 中配置，已 gitignore）。
