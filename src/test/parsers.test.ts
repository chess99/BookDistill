#!/usr/bin/env npx tsx
/**
 * 解析器测试
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { parseMarkdown } from '../lib/parsers/markdown';
import { parseEpub } from '../lib/parsers/epub';
import { FileFormat } from '../types';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

async function testMarkdownParser() {
  console.log('Testing Markdown parser...');
  const testFile = path.join(__dirname, 'fixtures/test-book.md');
  if (!fs.existsSync(testFile)) {
    results.push({ name: 'Markdown Parser', passed: false, error: 'fixture missing' });
    return;
  }
  try {
    const result = await parseMarkdown(testFile);
    const checks = {
      'title extracted': result.title === '软件工程实践指南',
      'author extracted': result.author === '李明',
      'format correct': result.format === FileFormat.MARKDOWN,
      'content non-empty': result.text.length > 0,
      'frontmatter removed': !result.text.startsWith('---'),
    };
    const allPassed = Object.values(checks).every(Boolean);
    results.push({ name: 'Markdown Parser', passed: allPassed, details: checks });
    console.log(`  ${allPassed ? 'PASS' : 'FAIL'} Markdown Parser`);
    if (!allPassed) console.log('  Failed:', Object.entries(checks).filter(([, v]) => !v).map(([k]) => k));
  } catch (error) {
    results.push({ name: 'Markdown Parser', passed: false, error: String(error) });
    console.log('  FAIL Markdown Parser:', error);
  }
}

async function testEpubParser() {
  console.log('Testing EPUB parser...');
  const epubFile = path.join(__dirname, 'fixtures/sample.epub');
  if (!fs.existsSync(epubFile)) {
    console.log('  SKIP: no fixture');
    results.push({ name: 'EPUB Parser', passed: true, details: { skipped: true } });
    return;
  }
  try {
    const result = await parseEpub(epubFile);
    const checks = {
      'title non-empty': result.title.length > 0,
      'format correct': result.format === FileFormat.EPUB,
      'text non-empty': result.text.length > 100,
    };
    const allPassed = Object.values(checks).every(Boolean);
    results.push({ name: 'EPUB Parser', passed: allPassed, details: checks });
    console.log(`  ${allPassed ? 'PASS' : 'FAIL'} EPUB Parser (title: ${result.title}, ${result.text.length} chars)`);
  } catch (error) {
    results.push({ name: 'EPUB Parser', passed: false, error: String(error) });
    console.log('  FAIL EPUB Parser:', error);
  }
}

async function runTests() {
  console.log('\nRunning parser tests...\n');
  await testMarkdownParser();
  await testEpubParser();

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n${passed}/${total} passed`);
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(err => { console.error(err); process.exit(1); });
