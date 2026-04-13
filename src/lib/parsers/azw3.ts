/**
 * AZW3/MOBI 解析器 — 借助 Calibre ebook-convert 转成 epub 后解析
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { FileFormat, ParseResult, ParseError } from '../../types';
import { parseEpub } from './epub';

function findEbookConvert(): string | null {
  // Calibre 在 macOS 上安装后 CLI 工具在这个路径
  const candidates = [
    'ebook-convert',
    '/Applications/calibre.app/Contents/MacOS/ebook-convert',
    '/usr/local/bin/ebook-convert',
    '/opt/homebrew/bin/ebook-convert',
  ];
  for (const cmd of candidates) {
    const result = spawnSync('which', [cmd], { encoding: 'utf-8' });
    if (result.status === 0 && result.stdout.trim()) return cmd;
    // 直接尝试绝对路径
    if (cmd.startsWith('/') && fs.existsSync(cmd)) return cmd;
  }
  return null;
}

export async function parseAzw3(filePath: string): Promise<ParseResult> {
  const ext = path.extname(filePath).toLowerCase().slice(1); // 'azw3' | 'mobi'

  const ebookConvert = findEbookConvert();
  if (!ebookConvert) {
    throw new ParseError(
      `Calibre is required to parse .${ext} files. Install it from https://calibre-ebook.com or via: brew install calibre`,
      FileFormat.EPUB
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookdistill-'));
  const tmpEpub = path.join(tmpDir, 'converted.epub');

  try {
    const result = spawnSync(ebookConvert, [filePath, tmpEpub], {
      encoding: 'utf-8',
      timeout: 60_000,
    });

    if (result.status !== 0) {
      const errMsg = result.stderr?.trim() || result.stdout?.trim() || 'unknown error';
      throw new ParseError(
        `ebook-convert failed (exit ${result.status}): ${errMsg}`,
        FileFormat.EPUB
      );
    }

    if (!fs.existsSync(tmpEpub)) {
      throw new ParseError('ebook-convert did not produce output file', FileFormat.EPUB);
    }

    const parsed = await parseEpub(tmpEpub);
    // 保留原始文件名作为 title 兜底（epub 内 metadata 有时为空）
    if (!parsed.title || parsed.title === 'converted') {
      parsed.title = path.basename(filePath, path.extname(filePath));
    }
    return parsed;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
