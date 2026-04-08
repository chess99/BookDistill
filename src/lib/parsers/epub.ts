/**
 * EPUB 解析器（Node.js）
 */
import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { FileFormat, ParseResult, ParseError } from '../../types';

function parseXml(xml: string): Document {
  return new JSDOM(xml, { contentType: 'text/xml' }).window.document;
}

function parseHtml(html: string): Document {
  return new JSDOM(html, { contentType: 'text/html' }).window.document;
}

export async function parseEpub(filePath: string): Promise<ParseResult> {
  try {
    const buffer = fs.readFileSync(filePath);
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(buffer);

    // 1. 找 OPF 路径
    const containerXml = await loadedZip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) throw new Error('Invalid EPUB: Missing container.xml');

    const containerDoc = parseXml(containerXml);
    const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!opfPath) throw new Error('Invalid EPUB: Cannot find OPF path');

    // 2. 读取 OPF
    const opfContent = await loadedZip.file(opfPath)?.async('string');
    if (!opfContent) throw new Error('Invalid EPUB: OPF file missing');

    const opfDoc = parseXml(opfContent);
    const title = opfDoc.querySelector('metadata title, metadata dc\\:title')?.textContent
      || path.basename(filePath, '.epub');
    const author = opfDoc.querySelector('metadata creator, metadata dc\\:creator')?.textContent
      || undefined;

    // 3. 构建 manifest 映射
    const manifestMap = new Map<string, string>();
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (id && href) manifestMap.set(id, href);
    });

    // 4. 按 spine 顺序提取文本
    const opfFolder = opfPath.substring(0, opfPath.lastIndexOf('/'));
    let fullText = '';

    for (const ref of Array.from(opfDoc.querySelectorAll('spine itemref'))) {
      const idref = ref.getAttribute('idref');
      if (!idref) continue;
      const href = manifestMap.get(idref);
      if (!href) continue;

      const fullItemPath = opfFolder ? `${opfFolder}/${href}` : href;
      const html = await loadedZip.file(fullItemPath)?.async('string');
      if (html) {
        const doc = parseHtml(html);
        doc.querySelectorAll('script, style').forEach(el => el.remove());
        const text = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) fullText += text + '\n\n';
      }
    }

    return { text: fullText, title, author, format: FileFormat.EPUB };
  } catch (error) {
    throw new ParseError(
      `EPUB parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      FileFormat.EPUB,
      error instanceof Error ? error : undefined
    );
  }
}
