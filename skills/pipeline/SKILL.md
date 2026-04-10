# pipeline

无人值守的书籍批量入库 pipeline。扫描延伸阅读推荐书目 → 自动下载 → AI 提炼 → 推断分类 → 入库。

## 用法

```
/pipeline scan     扫描未入库书目，更新 pipeline.md 待下载列表
/pipeline run      启动调度器，并行运行下载+提炼 worker
/pipeline status   查看当前队列状态
/pipeline retry    将失败条目重置为待下载
```

## 子命令

### scan

扫描 ai-reading/books 所有文件的"延伸阅读"章节，提取书名，过滤已入库和已在 pipeline 中的，追加到 pipeline.md 待下载区。

```bash
REPO=/Users/zcs/code2/BookDistill
npx tsx $REPO/src/scripts/pipeline-scan.ts
```

执行后打印新增书目，并展示 pipeline.md 的待下载区内容。

### run

启动完整 pipeline，并行运行：
- **下载 worker**（串行，z-library 限速）：消费"待下载"，调用 download.ts
- **提炼 worker**（并发 2）：消费"待提炼"，调用 distill.ts + AI 分类 + ingest.ts

```bash
REPO=/Users/zcs/code2/BookDistill
npx tsx $REPO/src/scripts/pipeline-run.ts
```

运行期间实时打印进度。Ctrl+C 安全中断，下次运行会从断点继续。

### status

读取 pipeline.md，打印各区段计数和最近失败原因。

```bash
PIPELINE=/Users/zcs/code2/BookDistill/pipeline.md
cat $PIPELINE
```

或用 Claude 分析：读取 pipeline.md，统计各区段数量，列出最近 5 条失败原因。

### retry

将"失败/跳过"区的所有条目重置为"待下载"，以便重试。

用 Claude 执行：
1. 读取 pipeline.md
2. 将所有 `- [!]` 行改为 `- [ ]`
3. 将这些行从"失败/跳过"区移到"待下载"区
4. 保存文件

## pipeline.md 格式

```markdown
# BookDistill Pipeline

## 待下载
- [ ] 刻意练习
- [~] 深度工作 <!-- pid: 123, started: 2026-04-09T18:00:00Z -->

## 待提炼
- [ ] 掌控习惯 <!-- file: /path/to/掌控习惯.epub -->

## 已完成
- [x] 掌控习惯 <!-- output: 个人成长/詹姆斯·克利尔-掌控习惯.md -->

## 失败/跳过
- [!] 定价圣经 <!-- reason: 仅有扫描版PDF(52MB) -->
```

状态符号：`[ ]` 待处理 | `[~]` 处理中 | `[x]` 完成 | `[!]` 失败

## 异常处理

| 失败原因 | 处理方式 |
|---------|---------|
| z-library 无搜索结果 | 标记失败，跳过 |
| 仅有扫描版 PDF | 标记失败，跳过 |
| 下载超时 | 标记失败，可 retry |
| cookie 失效 | 标记失败，更新 config.zlibrary.cookies 后 retry |
| 解析失败（字符数=0）| 标记失败，可能是扫描版，跳过 |
| AI API 错误 | 标记失败，可 retry |

## 注意

- pipeline.md 在项目根目录，已加入 .gitignore
- 下载 worker 串行运行（z-library 限速保护）
- 提炼 worker 并发 2（AI API 并发限制）
- 进程崩溃后重启会自动清理 `[~]` 状态，从断点继续
- 分类由 AI 自动推断，可新建目录，不强制使用现有分类
