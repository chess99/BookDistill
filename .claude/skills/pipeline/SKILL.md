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

**整体思路**：脚本负责机械提取文本，Agent 负责理解语义（识别作者、判断重复）。纯正则匹配无法处理"《社会共通资本》是宇泽弘文本人的另一部著作"这类语义关系。

**Agent 执行步骤：**

**Step 1：脚本提取候选书单**
```bash
# 提取所有延伸阅读中的书名（带括号作者格式）
find ~/Notes/ai-reading/books -name "*.md" | while read f; do
  awk '/延伸阅读/{found=1} found{print}' "$f"
done | grep -oh '《[^》]\{2,40\}》' | sed 's/[《》]//g' | sort -u
```

**Step 2：Agent 补全作者**

对每本候选书，Agent 读取该书所在的延伸阅读原文片段，判断作者：
```bash
find ~/Notes/ai-reading/books -name "*.md" | xargs grep -l "延伸阅读" | \
  xargs grep -A3 "《书名》"
```
- 括号格式 `《书名》（作者）` → 直接提取
- 描述格式 `《书名》作者XXX所著` → Agent 理解提取
- 无作者信息 → Agent 凭知识补全（大多数经典书作者已知）

**Step 3：Agent 语义去重**

读取全库所有书名，与候选列表逐一比对：
```bash
find ~/Notes/ai-reading/books -name "*.md" | xargs grep -h "^title:" | sed 's/title: //' | sort
```
判断标准（**必须用语义理解，不能用 find 字符串匹配**）：
- 完全相同 → 移除
- 同书异名（中英文、副标题差异、译名不同）→ 移除并说明（如"Zero to One"="从零到一"）
- 同作者另一本书 → 保留，加注释提醒

**Step 4：写入 pipeline.md**
```
- [ ] 书名 <!-- author: 作者名 -->
```

**Step 5：打印新增书目供用户确认**

**辅助脚本（参考，不推荐直接用）：**
```bash
# 只能做简单正则提取，无法补全作者或语义去重
npx tsx /Users/zcs/code2/BookDistill/src/scripts/pipeline-scan.ts
```

---

### `/pipeline run` — 批量处理（核心流程）

Agent 逐本处理，每本书走完整链路：**搜索 → Agent 选书 → 下载 → 提炼 → Agent 验分类 → 入库**。

#### 每本书的处理流程

**Step 1：搜索候选**

读取 pipeline.md 的"待下载"区，取第一条。构造搜索词：

```
搜索词 = 书名 + 作者名（如有）
```

如果书名简短（≤4字），**加上副标题**（如"反脆弱 如何从不确定性中获益"），避免匹配到蹭书名的套装书。

```bash
npx tsx /Users/zcs/code2/BookDistill/src/scripts/download.ts --query "书名 副标题或作者名" 2>&1
```

**Step 2：Agent 验证选书**

看 stderr 输出的 `Found book:` 行，判断是否正确：
- ✅ 书名就是目标书（不是"《目标书》作者的其他书"）
- ✅ 作者一致
- ❌ 如果是套装/合集（书名含"套装N册"、"系列"）→ 用 `--url` 指定正确候选重新下载
- ❌ 如果搜索结果全是无关书 → 标记失败

如果脚本自动选对了，直接用输出路径；选错了用 `--url` 重下：
```bash
npx tsx /Users/zcs/code2/BookDistill/src/scripts/download.ts --url "https://z-lib.fm/book/xxx"
```

**Step 3：提炼**
```bash
npx tsx /Users/zcs/code2/BookDistill/src/scripts/distill.ts \
  --file /path/to/book.epub \
  --output /tmp/distill-书名.md
```

**Step 4：Agent 审核 frontmatter**

读取 `/tmp/distill-书名.md` 前 20 行，逐项检查并修正：

| 检查项 | 问题特征 | 修正方式 |
|--------|---------|---------|
| title | 含括号营销文字（>15字的宣传语） | 去掉括号内容，只保留书名 |
| title | 含超长副标题（冒号后>20字） | 保留主标题，去掉副标题 |
| author | 含 `[美]`、`（英）`、`著`、`译` 等 | 只保留人名，去掉前后缀 |
| author | 含英文名（括号内英文） | 去掉英文名括号部分 |
| tags | 为空 `[]` | 根据书名/内容推断 2-4 个标签 |
| slug | 超过 40 字符 | 截断到核心书名拼音（≤20字符） |

同时检查：
- 内容长度是否合理（>500字）
- 是否与已入库书籍重复（用 `find ~/Notes/ai-reading/books -name "*书名*"` 检查）

发现问题直接修改 `/tmp/distill-书名.md` 再入库，不要跳过。

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

## 自我迭代机制

这个 skill 本身可以被迭代改进。三层分工随着经验积累可以动态调整：

| 层 | 执行者 | 当前职责 | 迭代方向 |
|----|--------|---------|---------|
| 机械层 | 脚本 | 搜索/下载/提炼/入库的 I/O | 当 Agent 判断积累了规律，固化为脚本规则 |
| 判断层 | Agent | 选书确认、内容验证、分类推断 | 当某类判断有明确模式，提炼成 prompt 模板 |
| 监督层 | Agent | 发现系统性问题、更新 skill | 每批跑完后主动总结，更新本文件 |

**每批处理完后，Agent 应当：**
1. 统计成功/失败率，分析失败原因的规律
2. 如果某类错误反复出现（如特定书名搜索总选错），更新"常见坑"章节
3. 如果某个判断规则已经很稳定，考虑写入脚本的评分逻辑
4. 如果发现新的搜索技巧（如加副标题、换语言），更新本文件

**更新本 skill 的方式：**
直接编辑 `/Users/zcs/code2/BookDistill/.claude/skills/pipeline/SKILL.md`，提交到 git。

---

## 常见坑（踩过的）

1. **搜索词太短会匹配到含关键词的无关书**
   - "刻意练习" → 《易怒的男孩：刻意练习带孩子走出情绪困境》
   - "刻意练习 安德斯·艾利克森" → 《哪有学不会这种事：刻意练习+学习之道+练习的心态（套装共3册）》
   - 解决：加副标题搜索，如 "刻意练习 如何从新手到大师"；Agent 必须看候选列表确认书名精确匹配

2. **大型套装书评分高但不是目标书**
   - 套装 EPUB 体积大（>30MB），评分因年份新/体积大而偏高
   - "反脆弱 纳西姆·塔勒布" → 《肥尾效应》（也是塔勒布的书）
   - 解决：搜索时加书名关键词而非只加作者，如 "反脆弱 如何从不确定性中获益"

3. **某些书在 z-library 搜索结果被无关书占满**
   - "联想风云 凌志军" → 全是《小米创业思考》（因为雷军写了"联想"相关内容）
   - 解决：标记失败，跳过；或尝试英文书名搜索

4. **AI 提炼时 title/author 不规范**（已在 ingest.ts 加防御，但 Agent 仍需审核）
   - title 含营销括号："福格行为模型（不较劲...已被120000人验证...）"
   - author 含国籍前缀："[美]纳西姆·尼古拉斯·塔勒布"、"(美)卡尔·纽波特 著"
   - slug 过长：每个字都拼音导致超过40字符
   - tags 为空：AI 没有推断标签
   - 解决：Step 4 Agent 审核时逐项检查修正

5. **z-library 每日下载额度（免费账号 10 本/天）**
   - 额度用完时：下载按钮仍显示，`/dl/` 链接存在，但 navigate 过去跳转到 "Daily limit reached" 提示页，不触发 download 事件
   - 代码已检测：navigate 到 `/dl/` 后检查页面是否含 "Daily limit" 文字，若是则立即抛出 `QUOTA_EXCEEDED` 错误
   - pipeline-download.ts 识别 `QUOTA_EXCEEDED` 后停止 worker，重置当前条目为待下载，明天继续
   - `cf_clearance` cookie 过期（通常几小时到几天）会导致**搜索**失败（页面无法加载），需重新从浏览器复制 cookie

6. **同书异名重复入库**
   - "我们为什么睡觉" vs "我们为什么要睡觉"（同一本书，书名微差）
   - "Zero to One" vs "从零到一"（中英文版）
   - `find` 无法解决：字面不同的书名 find 匹配不到
   - 解决：scan 完成后，Agent 读取全库所有书名，用语义理解逐一比对待下载列表
     ```bash
     # 提取全库书名
     find ~/Notes/ai-reading/books -name "*.md" | xargs grep -h "^title:" | sed 's/title: //'
     ```
     然后 Agent 判断：完全相同 / 同书异名（跳过） / 相关但不同（保留）

6. **搜索结果 title 字段是 URL 编码**（已修复）
   - `selectBestCandidate` 里的标题匹配之前对 URL 编码字符串做 includes，永远匹配不到
   - 已在 `zlibrary.ts` 中用 `decodeURIComponent` 修复
   - 修复后套装书/无关书会被 -80 惩罚，正确的书排到第一

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
