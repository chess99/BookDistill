#!/bin/bash
# CLI 端到端测试脚本

set -e  # 遇到错误立即退出

echo "🧪 开始测试 CLI 功能..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试结果
PASSED=0
FAILED=0

# 测试函数
test_command() {
  local name="$1"
  local command="$2"
  local expected_exit_code="${3:-0}"

  echo -n "  测试: $name ... "

  if eval "$command" > /dev/null 2>&1; then
    actual_exit=$?
  else
    actual_exit=$?
  fi

  if [ $actual_exit -eq $expected_exit_code ]; then
    echo -e "${GREEN}✅ 通过${NC}"
    ((PASSED++))
    return 0
  else
    echo -e "${RED}❌ 失败${NC} (退出码: $actual_exit, 期望: $expected_exit_code)"
    ((FAILED++))
    return 1
  fi
}

# 1. 测试帮助信息
echo "📖 测试帮助信息"
test_command "显示帮助" "npx tsx cli/distill.ts --help"

# 2. 测试参数解析
echo ""
echo "⚙️  测试参数解析"
test_command "缺少输入文件" "npx tsx cli/distill.ts" 1
test_command "缺少 API key" "npx tsx cli/distill.ts -i test-markdown-sample.md" 1

# 3. 测试文件解析 (不调用 API)
echo ""
echo "📝 测试文件解析"

# 创建临时测试脚本,只测试解析部分
cat > /tmp/test-parse.ts << 'EOF'
import { NodeFileAdapter, NodeDOMParserAdapter } from './cli/adapters/nodeAdapters';
import { parseMarkdownFile } from './services/parsers/markdownParser.universal';
import { parseEpubFile } from './services/parsers/epubParser.universal';

async function testParse() {
  try {
    // 测试 Markdown
    const mdFile = NodeFileAdapter.fromPath('test-markdown-sample.md');
    const mdResult = await parseMarkdownFile(mdFile);

    if (mdResult.title !== '测试书籍：深入理解 TypeScript') {
      throw new Error('Markdown title 解析错误');
    }

    if (mdResult.author !== '张三') {
      throw new Error('Markdown author 解析错误');
    }

    console.log('✅ Markdown 解析正常');

    // 测试 EPUB (如果有文件)
    const fs = await import('fs');
    if (fs.existsSync('test.epub')) {
      const epubFile = NodeFileAdapter.fromPath('test.epub');
      const domParser = new NodeDOMParserAdapter();
      const epubResult = await parseEpubFile(epubFile, { domParser });

      if (!epubResult.title || epubResult.text.length === 0) {
        throw new Error('EPUB 解析错误');
      }
      console.log('✅ EPUB 解析正常');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ 解析测试失败:', error);
    process.exit(1);
  }
}

testParse();
EOF

cd /Users/zcs/code2/BookDistill
test_command "Markdown 解析" "npx tsx /tmp/test-parse.ts"

# 4. 测试配置一致性
echo ""
echo "🔧 测试配置一致性"

cat > /tmp/test-config.ts << 'EOF'
import { DEFAULTS, MODELS, LANGUAGES } from './config/defaults';

// 验证默认配置
if (DEFAULTS.MODEL !== 'gemini-3-pro-preview') {
  console.error('默认模型错误');
  process.exit(1);
}

if (DEFAULTS.LANGUAGE !== 'Chinese') {
  console.error('默认语言错误');
  process.exit(1);
}

if (MODELS.length !== 2) {
  console.error('模型数量错误');
  process.exit(1);
}

if (LANGUAGES.length !== 7) {
  console.error('语言数量错误');
  process.exit(1);
}

console.log('✅ 配置一致性验证通过');
process.exit(0);
EOF

test_command "配置一致性" "npx tsx /tmp/test-config.ts"

# 5. 测试格式检测
echo ""
echo "🔍 测试格式检测"
test_command "不支持的格式" "GEMINI_API_KEY=test npx tsx cli/distill.ts -i README.md" 1

# 总结
echo ""
echo "=================================================="
echo "📊 测试总结"
echo ""
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"
echo "总计: $((PASSED + FAILED))"
echo "=================================================="

# 清理
rm -f /tmp/test-parse.ts /tmp/test-config.ts

# 返回退出码
if [ $FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✅ 所有测试通过!${NC}\n"
  exit 0
else
  echo -e "\n${RED}❌ 有测试失败!${NC}\n"
  exit 1
fi
