---
name: pipeline
description: |
  无人值守批量入库延伸阅读书目。Agent 主导整个流程，脚本只做辅助。
  当用户说"跑 pipeline"、"批量入库"、"处理延伸阅读"、"pipeline scan/run/status/retry"，
  或想批量处理多本书时触发。
---

# Pipeline — Agent 驱动的批量入库工作流

脚本负责机械操作（搜索、下载、提炼、入库），Agent 负责判断（选书、验证、纠错）。

## 核心原则

- **Agent 是主体**：每个关键决策点 Agent 亲自判断，不盲目信任脚本输出
- **脚本是工具**：搜索、下载、提炼、入库都有脚本，Agent 调用并验证结果
- **pipeline.md 是状态**：Agent 读写这个文件跟踪进度，人也可以手动编辑

---

## 子命令

### `/pipeline scan` — 扫描未入库书目

**Agent 执行步骤：**

1. 扫描 `~/Notes/ai-reading/books/**/*.md` 中所有"延伸阅读"章节，提取 `《书名》（作者）` 格式的条目
2. 对比已入库书单（扫描 books 目录文件名）
3. 对比 pipeline.md 中已有条目
4. 将新书目写入 pipeline.md 的"待下载"区，格式：
   ```
   - [ ] 书名 <!-- author: 作者名 -->
   ```
5. 打印新增书目供用户确认

**辅助脚本（可选）：**
```bash
npx tsx /Users/zcs/code2/BookDistill/src/scripts/pipeline-scan.ts
```

---

### `/pipeline run` — 批量处理（核心流程）

Agent 逐本处理，每本书走完整链路：**搜索 → Agent 选书 → 下载 → 提炼 → Agent 验分类 → 入库**。

#### 每本书的处理流程

**Step 1：搜索候选**

读取 pipeline.md 的"待下载"区，取第一条。用 `--query` 搜索，**只看候选列表，不让脚本自动下载**：

```bash
# 先只搜索，看候选（download.ts 会打印候选后自动下载第一名，所以用 Bash 捕获 stderr）
npx tsx /Users/zcs/code2/BookDistill/src/scripts/download.ts --query "书名 作者名" 2>&1
```

**Step 2：Agent 选书**

看候选列表（stderr 输出的 Top 5），判断哪本是正确的书：
- 书名是否精确匹配（不是"含有这几个字"，而是"就是这本书"）
- 作者是否一致
- 格式优先 epub > pdf
- 如果没有合适候选 → 标记失败，写入 pipeline.md，处理下一本

如果脚本自动选的第一名就是正确的，直接用其输出路径；
如果选错了，用 `--url` 重新下载正确的那本：
```bash
npx tsx /Users/zcs/code2/BookDistill/src/scripts/download.ts --url "https://z-lib.fm/book/xxx"
```

**Step 3：提炼**
```bash
npx tsx /Users/zcs/code2/BookDistill/src/scripts/distill.ts \
  --file /path/to/book.epub \
  --output /tmp/distill-书名.md
```

**Step 4：Agent 验证提炼结果**

读取 `/tmp/distill-书名.md` 前 200 字：
- 确认书名、作者正确
- 内容长度合理（>500字）
- 如果内容明显不对（解析失败/字符数极少）→ 标记失败，删除临时文件

**Step 5：Agent 推断分类**

```bash
ls ~/Notes/ai-reading/books/  # 看现有分类
```

结合书名、作者、提炼内容前 300 字，判断最合适的分类。可以新建分类目录。

**Step 6：入库**
```bash
npx tsx /Users/zcs/code2/BookDistill/src/scripts/ingest.ts \
  --distill /tmp/distill-书名.md \
  --category 分类名
```

**Step 7：更新 pipeline.md**

直接编辑文件：
- 成功：将条目状态改为 `[x]`，移到"已完成"区，附上输出路径
- 失败：改为 `[!]`，移到"失败/跳过"区，附上原因

#### 节奏控制

- 每本书处理完后停顿 3 秒再下载下一本（z-library 限速）
- 提炼期间可以同时启动下一本的下载
- 遇到连续 3 次失败，暂停并报告给用户

---

### `/pipeline status` — 查看进度

读取并展示 pipeline.md 各区段统计：
- 各区段数量
- 最近 5 条失败原因
- 已完成列表（书名 + 分类）

---

### `/pipeline retry` — 重试失败条目

读取 pipeline.md 的"失败/跳过"区，分析失败原因：
- `z-library 无搜索结果` → 尝试换关键词重搜
- `仅有扫描版` → 跳过（标注为永久跳过）
- `cookie 失效` → 提示用户更新 cookie
- 其他 → 重置为 `[ ]`，移回"待下载"区

---

## pipeline.md 格式

```markdown
# BookDistill Pipeline

## 待下载
- [ ] 刻意练习 <!-- author: 安德斯·艾利克森 -->
- [ ] 深度工作 <!-- author: 卡尔·纽波特 -->

## 待提炼
- [ ] 掌控习惯 <!-- file: /path/to/file.epub, author: 詹姆斯·克利尔 -->

## 已完成
- [x] 掌控习惯 <!-- output: 个人成长/詹姆斯·克利尔-掌控习惯.md -->

## 失败/跳过
- [!] 定价圣经 <!-- reason: 仅有扫描版PDF(52MB)，永久跳过 -->
- [!] Facebook效应 <!-- reason: z-library无搜索结果 -->
```

---

## 常见坑（踩过的）

1. **搜索词太短会匹配到含关键词的无关书**
   - "刻意练习" → 《易怒的男孩：刻意练习带孩子走出情绪困境》
   - 解决：加作者名搜索，Agent 看候选列表确认是否正确

2. **MiniMax 等推理模型返回 `<think>` 标签**
   - distill.ts 提炼输出里会有，ingest.ts 已过滤
   - 分类推断时 Agent 自己判断，不受影响

3. **大 PDF（>15MB）大概率是扫描版**
   - 解析后字符数为 0 或极少 → 标记失败，不要入库

4. **书名里有冒号/副标题**
   - 入库文件名会截断副标题，frontmatter title 保留完整书名

5. **pipeline.md 文件路径**
   - 位置：`/Users/zcs/code2/BookDistill/pipeline.md`
   - 已加入 .gitignore，不会被提交

---

## 辅助脚本路径

```
/Users/zcs/code2/BookDistill/src/scripts/
├── download.ts           # 单本搜索+下载（Agent 主要用这个）
├── distill.ts            # 单本提炼
├── ingest.ts             # 单本入库
├── pipeline-scan.ts      # 扫描延伸阅读（可选）
└── pipeline-run.ts       # 全自动调度器（不推荐，选书不准确）
```

**推荐**：Agent 直接调用 `download.ts`、`distill.ts`、`ingest.ts`，
逐本处理，每步验证。
