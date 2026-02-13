import JSZip from 'jszip';
import { BookParser, FileFormat, ParseResult, ParserCapabilities, ParseError } from '../../types';

/**
 * EPUB 格式解析器
 * 复用原 epubService.ts 的逻辑,封装为标准解析器
 */
export class EpubParser implements BookParser {
  public readonly format = FileFormat.EPUB;

  public readonly capabilities: ParserCapabilities = {
    extensions: ['epub'],
    mimeTypes: ['application/epub+zip'],
    supportsLargeFiles: true,
    description: 'Electronic Publication (EPUB) format parser',
  };

  public canParse(file: File): boolean {
    return file.name.toLowerCase().endsWith('.epub');
  }

  public async parse(file: File): Promise<ParseResult> {
    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);

      // 1. Find the OPF file path from META-INF/container.xml
      const containerXml = await loadedZip.file("META-INF/container.xml")?.async("string");
      if (!containerXml) {
        throw new Error("Invalid EPUB: Missing container.xml");
      }

      const containerDoc = new DOMParser().parseFromString(containerXml, "text/xml");
      const rootFile = containerDoc.querySelector("rootfile");
      const opfPath = rootFile?.getAttribute("full-path");
      if (!opfPath) {
        throw new Error("Invalid EPUB: Cannot find OPF path");
      }

      // 2. Read the OPF file
      const opfContent = await loadedZip.file(opfPath)?.async("string");
      if (!opfContent) {
        throw new Error("Invalid EPUB: OPF file missing");
      }

      const opfDoc = new DOMParser().parseFromString(opfContent, "text/xml");

      // Extract Metadata
      const title = opfDoc.querySelector("metadata > title")?.textContent || file.name.replace('.epub', '');
      const author = opfDoc.querySelector("metadata > creator")?.textContent || undefined;

      // 3. Parse Manifest and Spine to get reading order
      const manifestItems = Array.from(opfDoc.querySelectorAll("manifest > item"));
      const manifestMap = new Map<string, string>();
      manifestItems.forEach(item => {
        manifestMap.set(item.getAttribute("id") || "", item.getAttribute("href") || "");
      });

      const spineItems = Array.from(opfDoc.querySelectorAll("spine > itemref"));

      // Resolve base path for relative hrefs in OPF
      const opfFolder = opfPath.substring(0, opfPath.lastIndexOf('/'));
      const resolvePath = (href: string) => {
        if (opfFolder === "") return href;
        return `${opfFolder}/${href}`;
      };

      let fullText = "";

      // 4. Iterate spine and extract text
      for (const item of spineItems) {
        const idref = item.getAttribute("idref");
        if (!idref) continue;

        const href = manifestMap.get(idref);
        if (!href) continue;

        const fullPath = resolvePath(href);
        const fileContent = await loadedZip.file(fullPath)?.async("string");

        if (fileContent) {
          const doc = new DOMParser().parseFromString(fileContent, "text/html");

          // Remove scripts and styles
          const scripts = doc.querySelectorAll('script, style');
          scripts.forEach(s => s.remove());

          const text = doc.body.textContent || "";
          fullText += text.replace(/\s+/g, ' ').trim() + "\n\n";
        }
      }

      return {
        text: fullText,
        title,
        author,
        format: FileFormat.EPUB,
      };

    } catch (error) {
      throw new ParseError(
        `EPUB parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        FileFormat.EPUB,
        error instanceof Error ? error : undefined
      );
    }
  }
}
