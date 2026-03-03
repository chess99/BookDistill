# 测试指南

## 自动化测试

### 1. 解析器单元测试

```bash
npx tsx test-parsers.ts
```

**测试内容:**
- ✅ Markdown 解析器 (Frontmatter 提取、内容解析)
- ✅ EPUB 解析器 (如果有测试文件)
- ✅ 类型导出 (配置一致性)

**预期结果:** 3/3 通过

---

## 手动测试

### 2. Web 端功能测试

#### 2.1 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000 (或显示的端口)

#### 2.2 测试 Markdown 上传

1. 准备 API Key
   - 在 UI 中输入你的 Gemini API Key
   - 或使用测试 key (会失败但能验证解析)

2. 上传测试文件
   ```bash
   # 使用项目中的测试文件
   test-markdown-sample.md
   ```

3. 验证点
   - ✅ 文件格式被正确识别为 MD
   - ✅ 标题显示为 "测试书籍：深入理解 TypeScript"
   - ✅ 作者显示为 "张三"
   - ✅ 状态显示 "Extracting text from MD file..."
   - ✅ 如果有 API key,能正常调用 Gemini

#### 2.3 测试 EPUB 上传 (如果有 EPUB 文件)

1. 上传 EPUB 文件
2. 验证点
   - ✅ 文件格式被正确识别为 EPUB
   - ✅ 元数据正确提取
   - ✅ 状态显示 "Extracting text from EPUB file..."

#### 2.4 测试不支持格式

1. 尝试上传 `.txt` 或 `.pdf` 文件
2. 验证点
   - ✅ 显示错误提示: "Unsupported file format. Please upload: EPUB, MD"

#### 2.5 测试移动端

1. 打开浏览器开发者工具
2. 切换到移动设备视图 (iPhone/Android)
3. 验证点
   - ✅ 汉堡菜单按钮可见 (左上角)
   - ✅ 点击菜单显示侧边栏
   - ✅ 上传区域布局正常,无挤压
   - ✅ 所有元素可点击,无遮挡

---

### 3. CLI 功能测试

#### 3.1 测试帮助信息

```bash
npx tsx cli/distill.ts --help
```

**验证点:**
- ✅ 显示帮助信息
- ✅ 默认模型为 `gemini-3-pro-preview`
- ✅ 默认语言为 `Chinese`
- ✅ 列出所有支持的语言和模型

#### 3.2 测试 Markdown 解析

```bash
# 使用测试 API key (只验证解析,不验证 AI 生成)
GEMINI_API_KEY=test npx tsx cli/distill.ts -i test-markdown-sample.md
```

**验证点:**
- ✅ 显示 "Parsing test-markdown-sample.md..."
- ✅ 显示 "Extracted: \"测试书籍：深入理解 TypeScript\" by 张三"
- ✅ 显示字符数统计
- ❌ API 调用失败 (预期,因为 key 无效)

#### 3.3 测试 EPUB 解析 (如果有 EPUB 文件)

```bash
GEMINI_API_KEY=test npx tsx cli/distill.ts -i your-book.epub
```

**验证点:**
- ✅ 正确提取标题和作者
- ✅ 字符数合理

#### 3.4 测试不支持格式

```bash
GEMINI_API_KEY=test npx tsx cli/distill.ts -i README.md
```

**验证点:**
- ❌ 显示错误: "Unsupported format: .md"
- 注意: README.md 没有 Frontmatter,但仍应被识别为 Markdown

#### 3.5 测试完整流程 (需要真实 API key)

```bash
# 设置真实的 API key
export GEMINI_API_KEY="your-real-api-key"

# 处理文件并输出到文件
npx tsx cli/distill.ts -i test-markdown-sample.md -o output.md

# 或输出到 stdout
npx tsx cli/distill.ts -i test-markdown-sample.md
```

**验证点:**
- ✅ 解析成功
- ✅ AI 生成摘要
- ✅ 输出为 Markdown 格式
- ✅ 内容为中文 (默认语言)

#### 3.6 测试不同选项

```bash
# 使用 Flash 模型 (更快)
npx tsx cli/distill.ts -i test-markdown-sample.md -m gemini-2.5-flash

# 输出英文
npx tsx cli/distill.ts -i test-markdown-sample.md -l English

# 组合选项
npx tsx cli/distill.ts -i test-markdown-sample.md -m gemini-2.5-flash -l English -o summary-en.md
```

---

## 构建测试

### 4. Web 端构建

```bash
npm run build
```

**验证点:**
- ✅ 构建成功,无 TypeScript 错误
- ✅ 生成 `dist/` 目录
- ✅ 可以运行 `npm run preview` 预览

### 5. 预览构建结果

```bash
npm run preview
```

访问显示的 URL,重复 Web 端功能测试

---

## 回归测试清单

在每次重大更改后,确保以下功能正常:

### Web 端
- [ ] 上传 EPUB 文件
- [ ] 上传 Markdown 文件
- [ ] 不支持格式的错误提示
- [ ] 移动端布局正常
- [ ] 侧边栏菜单可用
- [ ] AI 生成功能正常
- [ ] GitHub 保存功能正常

### CLI 端
- [ ] 帮助信息显示
- [ ] Markdown 解析
- [ ] EPUB 解析 (如果有测试文件)
- [ ] 不支持格式错误
- [ ] 输出到文件
- [ ] 输出到 stdout
- [ ] 不同语言选项
- [ ] 不同模型选项

### 配置一致性
- [ ] Web 和 CLI 默认模型一致
- [ ] Web 和 CLI 默认语言一致
- [ ] Web 和 CLI 支持相同的格式

---

## 快速验证命令

```bash
# 1. 运行自动化测试
npx tsx test-parsers.ts

# 2. 验证 Web 构建
npm run build

# 3. 验证 CLI 帮助
npx tsx cli/distill.ts --help

# 4. 验证 CLI 解析 (无需 API key)
GEMINI_API_KEY=test npx tsx cli/distill.ts -i test-markdown-sample.md 2>&1 | head -3
```

**预期输出:**
```
Parsing test-markdown-sample.md...
Extracted: "测试书籍：深入理解 TypeScript" by 张三 (1k chars)
Sending to gemini-3-pro-preview (1k chars)...
```

---

## 已知限制

1. **EPUB 测试文件**
   - 项目中没有 EPUB 测试文件
   - EPUB 解析器已验证代码正确性
   - 建议:手动使用真实 EPUB 文件测试

2. **API 调用测试**
   - 自动化测试不包含 API 调用
   - 需要手动使用真实 API key 测试
   - 建议:至少测试一次完整流程

3. **浏览器兼容性**
   - 仅在现代浏览器测试 (Chrome, Firefox, Safari)
   - 移动端测试使用开发者工具模拟

---

## 测试结果记录

| 测试项 | 状态 | 备注 |
|-------|------|------|
| 解析器单元测试 | ✅ | 3/3 通过 |
| Web 端构建 | ✅ | 无错误 |
| CLI 帮助信息 | ✅ | 显示正确 |
| Markdown 解析 | ✅ | 元数据正确 |
| 移动端布局 | ⏭️ | 需手动验证 |
| 完整 AI 流程 | ⏭️ | 需真实 API key |
