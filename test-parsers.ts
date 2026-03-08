#!/usr/bin/env npx tsx
/**
 * 解析器测试脚本 - 验证 Web 和 CLI 解析器功能
 */

import * as fs from 'fs';
import * as path from 'path';
import { NodeFileAdapter, NodeDOMParserAdapter } from './cli/adapters/nodeAdapters';
import { parseEpubFile } from './services/parsers/epubParser.universal';
import { parseMarkdownFile } from './services/parsers/markdownParser.universal';

// 测试结果
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

// 测试 Markdown 解析器
async function testMarkdownParser() {
  console.log('📝 测试 Markdown 解析器...');

  try {
    const testFile = 'test-markdown-sample.md';
    if (!fs.existsSync(testFile)) {
      results.push({
        name: 'Markdown Parser',
        passed: false,
        error: '测试文件不存在: test-markdown-sample.md'
      });
      return;
    }

    const fileAdapter = NodeFileAdapter.fromPath(testFile);
    const result = await parseMarkdownFile(fileAdapter);

    // 验证结果
    const checks = {
      'title 提取': result.title === '测试书籍：深入理解 TypeScript',
      'author 提取': result.author === '张三',
      'format 正确': result.format === 'md',
      'content 非空': result.text.length > 0,
      'frontmatter 移除': !result.text.includes('---')
    };

    const allPassed = Object.values(checks).every(v => v);

    results.push({
      name: 'Markdown Parser',
      passed: allPassed,
      details: {
        checks,
        title: result.title,
        author: result.author,
        textLength: result.text.length
      }
    });

    console.log(`  ✅ Markdown 解析器测试${allPassed ? '通过' : '失败'}`);
    if (!allPassed) {
      console.log('  失败的检查:', Object.entries(checks).filter(([k, v]) => !v).map(([k]) => k));
    }

  } catch (error) {
    results.push({
      name: 'Markdown Parser',
      passed: false,
      error: error instanceof Error ? error.message : String(error)
    });
    console.log(`  ❌ Markdown 解析器测试失败:`, error);
  }
}

// 测试 EPUB 解析器 (如果有测试文件)
async function testEpubParser() {
  console.log('📚 测试 EPUB 解析器...');

  // 使用测试固件中的 EPUB 文件
  const epubFile = 'test-fixtures/sample.epub';

  if (!fs.existsSync(epubFile)) {
    console.log('  ⚠️  未找到 EPUB 测试文件,跳过测试');
    results.push({
      name: 'EPUB Parser',
      passed: true,
      details: { skipped: true, reason: '无测试文件' }
    });
    return;
  }

  try {
    const fileAdapter = NodeFileAdapter.fromPath(epubFile);
    const domParser = new NodeDOMParserAdapter();
    const result = await parseEpubFile(fileAdapter, { domParser });

    // 验证结果
    const checks = {
      'title 非空': result.title.length > 0,
      'format 正确': result.format === 'epub',
      'text 非空': result.text.length > 0,
      'text 合理长度': result.text.length > 100
    };

    const allPassed = Object.values(checks).every(v => v);

    results.push({
      name: 'EPUB Parser',
      passed: allPassed,
      details: {
        checks,
        title: result.title,
        author: result.author,
        textLength: result.text.length
      }
    });

    console.log(`  ✅ EPUB 解析器测试${allPassed ? '通过' : '失败'}`);
    if (!allPassed) {
      console.log('  失败的检查:', Object.entries(checks).filter(([k, v]) => !v).map(([k]) => k));
    }

  } catch (error) {
    results.push({
      name: 'EPUB Parser',
      passed: false,
      error: error instanceof Error ? error.message : String(error)
    });
    console.log(`  ❌ EPUB 解析器测试失败:`, error);
  }
}

// 测试类型导出
async function testTypeExports() {
  console.log('🔍 测试类型导出...');

  try {
    // 使用 ESM 动态导入
    const typesModule = await import('./types');
    const configModule = await import('./config/defaults');

    const { FileFormat, ParseError } = typesModule;
    const { DEFAULTS, LANGUAGES, PRESET_MODELS } = configModule;

    const checks = {
      'FileFormat 枚举': FileFormat.EPUB === 'epub' && FileFormat.MARKDOWN === 'md',
      'ParseError 类': typeof ParseError === 'function',
      'DEFAULTS 配置': typeof DEFAULTS.LANGUAGE === 'string',
      'LANGUAGES 数组': Array.isArray(LANGUAGES) && LANGUAGES.length > 0,
      'PRESET_MODELS 对象': typeof PRESET_MODELS === 'object' && Array.isArray(PRESET_MODELS.gemini)
    };

    const allPassed = Object.values(checks).every(v => v);

    results.push({
      name: 'Type Exports',
      passed: allPassed,
      details: { checks }
    });

    console.log(`  ✅ 类型导出测试${allPassed ? '通过' : '失败'}`);

  } catch (error) {
    results.push({
      name: 'Type Exports',
      passed: false,
      error: error instanceof Error ? error.message : String(error)
    });
    console.log(`  ❌ 类型导出测试失败:`, error);
  }
}

// 主测试函数
async function runTests() {
  console.log('\n🧪 开始测试解析器功能...\n');

  await testMarkdownParser();
  await testEpubParser();
  await testTypeExports();

  // 输出总结
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试总结\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (result.error) {
      console.log(`   错误: ${result.error}`);
    }
    if (result.details && !result.passed) {
      console.log(`   详情:`, JSON.stringify(result.details, null, 2));
    }
  });

  console.log(`\n总计: ${passed}/${total} 通过`);
  console.log('='.repeat(50) + '\n');

  // 返回退出码
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
