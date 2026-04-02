# BookDistill

AI 驱动的书籍知识提炼工具，支持 **网页端** 和 **命令行** 两种使用方式。

上传 EPUB 或 Markdown 格式的书籍，自动生成结构化的知识摘要，并可直接推送到 GitHub 仓库。

## 功能

- 支持 EPUB、Markdown 格式
- **Z-Library 链接直接下载**：传入 z-library 书籍链接，自动下载并提炼
- 多 AI 提供方：Google Gemini、OpenAI、Anthropic、任意 OpenAI 兼容接口
- 多语言输出（中文、英文、日文等）
- 网页端：拖拽上传，流式输出，一键保存到 GitHub
- 命令行：配置文件驱动，支持全交互或完全非交互模式

## 网页端

### 本地开发

```bash
npm install
npm run dev
# 访问 http://localhost:3000
```

### 配置 AI 提供方

打开页面后点击左下角 **Settings**，填写：

| 字段 | 说明 |
|------|------|
| Provider | 选择提供方（Gemini / OpenAI / Anthropic / OpenAI Compatible） |
| API Key | 对应提供方的 API Key |
| Base URL | 可选，自定义端点（openai_compatible 必填） |
| Model | 模型 ID，可从预设选择或手动输入 |

### GitHub Pages 部署

仓库已包含 `.github/workflows/deploy-pages.yml`，推送到 `main` 分支自动部署。

首次配置：**Settings → Pages → Build and deployment → GitHub Actions**

## 命令行（CLI）

### 初始化配置

```bash
# 生成配置文件 cli/config.json
npx tsx cli/distill.ts config --init

# 编辑配置，填入 API Key
open cli/config.json
```

配置文件位于仓库的 `cli/config.json`（已加入 `.gitignore`），模板见 `cli/config.example.json`。

### 配置示例

```json
{
  "providers": {
    "bailian": {
      "type": "openai_compatible",
      "apiKey": "sk-sp-xxx",
      "baseUrl": "https://coding.dashscope.aliyuncs.com"
    },
    "gemini": {
      "type": "gemini",
      "apiKey": "AIza-xxx"
    }
  },
  "defaults": {
    "provider": "bailian",
    "model": "qwen3.5-plus",
    "language": "Chinese"
  },
  "github": {
    "token": "ghp_xxx",
    "owner": "your-username",
    "repo": "your-repo",
    "path": "notes/books"
  },
  "zlibrary": {
    "cookies": "name1=value1; name2=value2"
  }
}
```

### 使用方式

```bash
# 全交互模式（选文件 → 语言 → 输出目标）
npx tsx cli/distill.ts

# 指定输入，交互选输出
npx tsx cli/distill.ts -i ~/Downloads/book.epub

# 完全指定，非交互
npx tsx cli/distill.ts -i book.epub -o summary.md

# provider/model 简写
npx tsx cli/distill.ts -m bailian/qwen3.5-plus -i book.epub -o summary.md

# 直接推送到 GitHub（交互选目录）
npx tsx cli/distill.ts -i book.epub --github

# 脚本/CI 模式
npx tsx cli/distill.ts -i book.epub -o summary.md --no-interactive
```

### Z-Library 链接下载

支持直接从 z-library 镜像站点下载书籍：

```bash
# 下载并提炼 z-library 书籍
npx tsx cli/distill.ts -i "https://z-lib.fm/book/xxxxx"
```

**配置 Z-Library Cookies：**

z-library 需要登录才能下载，需要在配置文件中添加 cookies：

```json
{
  "zlibrary": {
    "cookies": "name1=value1; name2=value2; ..."
  }
}
```

**获取 Cookies 的步骤：**

1. 在浏览器中登录 z-library（如 https://z-lib.fm）
2. 打开开发者工具 (F12) → Application → Cookies
3. 复制所有 cookies，格式为 `name=value; name2=value2`
4. 添加到配置文件的 `zlibrary.cookies` 字段

**支持的镜像域名：**
- z-lib.fm
- z-library.sk
- singlelogin.re
- 1lib.sk
- booksc.org / booksc.eu / booksc.xyz

### 命令行选项

```
-i, --input <file|url>    输入文件（.epub / .md / .markdown）或 z-library URL
-o, --output <file>       输出文件（"-" 表示 stdout）
-l, --lang <lang>         输出语言（默认来自配置文件）
-m, --model <id>          模型 ID，支持 "provider/model" 简写
-p, --provider <name>     配置文件中的 provider 名称
--base-url <url>          覆盖 provider 的 base URL
--api-key <key>           覆盖 API Key
--github                  推送到 GitHub（使用配置文件中的 github 配置）
--no-interactive          非交互模式，缺少参数时直接报错
-h, --help                显示帮助

config --init             生成示例配置文件
config --show             查看当前配置（API Key 脱敏）
```

## Claude Skill（让 Claude 直接提炼书籍）

`skill/` 目录包含一个 [Claude Code](https://claude.ai/claude-code) skill，让 Claude 自身直接阅读并提炼书籍内容，无需调用任何外部 AI API。

### 安装

```bash
# 1. 安装 EPUB 提取脚本的依赖
npm install --prefix skill/scripts

# 2. 将 skill 目录安装到 Claude
# 把 skill/ 复制到 ~/.claude/skills/book-distill/
cp -r skill/ ~/.claude/skills/book-distill/
```

安装后，在 Claude Code 中直接说"帮我提炼这本书 ~/Downloads/xxx.epub"即可触发。

## 测试

```bash
# 解析器单元测试
npm test

# 查看当前 CLI 配置
npx tsx cli/distill.ts config --show
```

测试固件位于 `src/test/fixtures/`。

## 项目结构

```
BookDistill/
├── src/                      # 网页端源码
│   ├── main.tsx              # 入口
│   ├── App.tsx
│   ├── types.ts
│   ├── constants.ts
│   ├── config/               # 共享配置（语言、provider 预设等）
│   ├── components/           # React 组件
│   │   └── views/            # 各页面视图
│   ├── hooks/                # React Hooks
│   ├── services/             # AI 调用、解析器、GitHub
│   │   ├── zlibraryService.ts # Z-Library 下载服务
│   │   └── parsers/          # EPUB / Markdown 解析器
│   ├── utils/                # 文件名、slug 工具
│   └── test/                 # 测试脚本和固件
├── cli/                      # 命令行工具
│   ├── distill.ts            # CLI 入口
│   ├── config.ts             # 配置读写
│   ├── prompt.ts             # 交互式输入
│   ├── config.json           # 本地配置（gitignored）
│   ├── config.example.json   # 配置模板
│   └── adapters/             # Node.js 环境适配器
├── skill/                    # Claude Code skill
│   ├── SKILL.md              # skill 定义和工作流程
│   └── scripts/
│       ├── extract_epub.ts   # 独立 EPUB 文本提取脚本
│       └── package.json      # 依赖（jszip、jsdom）
├── index.html                # Vite HTML 入口
├── vite.config.ts
└── tsconfig.json
```

## 安全说明

- `cli/config.json` 已加入 `.gitignore`，不会被提交
- 网页端 API Key 仅存储在浏览器 localStorage，不经过任何中间服务器
- 请使用有配额限制的 Key，避免在共享设备上使用

## License

MIT
