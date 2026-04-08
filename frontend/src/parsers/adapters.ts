/**
 * 环境适配器 - 抹平浏览器和 Node.js 的 API 差异
 */

// ============ 类型定义 ============

export interface FileAdapter {
  name: string;
  readAsText(): Promise<string>;
  readAsArrayBuffer(): Promise<ArrayBuffer>;
}

export interface DOMParserAdapter {
  parseFromString(text: string, mimeType: 'text/xml' | 'text/html'): DocumentAdapter | Promise<DocumentAdapter>;
}

export interface DocumentAdapter {
  querySelector(selector: string): ElementAdapter | null;
  querySelectorAll(selector: string): ElementAdapter[];
  body?: ElementAdapter;
}

export interface ElementAdapter {
  getAttribute(name: string): string | null;
  textContent: string | null;
  remove(): void;
}

// ============ 浏览器适配器 (Web) ============

export class BrowserFileAdapter implements FileAdapter {
  constructor(private file: File) {}

  get name(): string {
    return this.file.name;
  }

  async readAsText(): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(this.file, 'utf-8');
    });
  }

  async readAsArrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(this.file);
    });
  }
}

class BrowserElementAdapter implements ElementAdapter {
  constructor(private element: Element) {}

  getAttribute(name: string): string | null {
    return this.element.getAttribute(name);
  }

  get textContent(): string | null {
    return this.element.textContent;
  }

  remove(): void {
    this.element.remove();
  }
}

class BrowserDocumentAdapter implements DocumentAdapter {
  constructor(private document: Document) {}

  querySelector(selector: string): ElementAdapter | null {
    const el = this.document.querySelector(selector);
    return el ? new BrowserElementAdapter(el) : null;
  }

  querySelectorAll(selector: string): ElementAdapter[] {
    const elements = Array.from(this.document.querySelectorAll(selector));
    return elements.map(el => new BrowserElementAdapter(el));
  }

  get body(): ElementAdapter | undefined {
    return this.document.body ? new BrowserElementAdapter(this.document.body) : undefined;
  }
}

export class BrowserDOMParserAdapter implements DOMParserAdapter {
  private parser = new DOMParser();

  parseFromString(text: string, mimeType: 'text/xml' | 'text/html'): DocumentAdapter {
    const doc = this.parser.parseFromString(text, mimeType);
    return new BrowserDocumentAdapter(doc);
  }
}

// ============ Node.js 适配器 (CLI) ============
// 已移至 cli/adapters/nodeAdapters.ts,避免浏览器端打包
