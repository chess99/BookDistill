/**
 * Z-Library 下载服务
 *
 * 支持从 z-library 镜像站点下载书籍文件
 *
 * 使用方式：
 * 1. 在配置文件中设置 zlibrary.cookies（从浏览器复制）
 * 2. 使用 z-library 链接作为输入：book-distill -i "https://z-lib.fm/book/xxx"
 *
 * 支持的镜像域名：
 * - z-lib.fm
 * - z-library.sk
 * - singlelogin.re
 * - 1lib.sk
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// z-library 镜像域名列表
const ZLIB_DOMAINS = [
  'z-lib.fm',
  'z-library.sk',
  'singlelogin.re',
  '1lib.sk',
  'z-lib.org',
  'booksc.org',
  'booksc.eu',
  'booksc.xyz',
];

// 链接匹配正则
const ZLIB_URL_PATTERN = /^https?:\/\/([a-z0-9-]+\.)?(z-lib\.fm|z-library\.sk|singlelogin\.re|1lib\.sk|z-lib\.org|booksc\.org|booksc\.eu|booksc\.xyz)/i;

export interface ZlibDownloadOptions {
  /** Cookie 字符串，格式：name=value; name2=value2 */
  cookies?: string;
  /** 下载目录，默认为系统临时目录 */
  downloadDir?: string;
  /** 超时时间（毫秒），默认 60000 */
  timeout?: number;
  /** 是否显示浏览器窗口（调试用） */
  headless?: boolean;
  /** HTTP 代理服务器，格式：http://host:port 或 http://user:pass@host:port */
  proxy?: string;
}

export interface ZlibBookInfo {
  title: string;
  author?: string;
  format: string;
  fileSize?: string;
  downloadUrl?: string;
}

export interface ZlibDownloadResult {
  filePath: string;
  fileName: string;
  bookInfo: ZlibBookInfo;
}

/**
 * 检查 URL 是否为 z-library 链接
 */
export function isZlibUrl(url: string): boolean {
  return ZLIB_URL_PATTERN.test(url);
}

/**
 * 从 cookie 字符串解析为 playwright 格式
 */
function parseCookies(cookieString: string, domain: string): Array<{name: string; value: string; domain: string; path: string}> {
  return cookieString.split(';').map(cookie => {
    const [name, ...valueParts] = cookie.trim().split('=');
    return {
      name: name.trim(),
      value: valueParts.join('=').trim(),
      domain: domain,
      path: '/',
    };
  }).filter(c => c.name && c.value);
}

/**
 * 从页面提取书籍信息
 */
async function extractBookInfo(page: Page): Promise<ZlibBookInfo> {
  return await page.evaluate(() => {
    const info: {title: string; author?: string; format: string; fileSize?: string} = {
      title: '',
      format: 'unknown',
    };

    // 提取标题
    const titleEl = document.querySelector('h1.color1, h1[itemprop="name"], .book-title, h1');
    if (titleEl) {
      info.title = titleEl.textContent?.trim() || '';
    }

    // 提取作者
    const authorEl = document.querySelector('a[href*="author"], .authors a, [itemprop="author"]');
    if (authorEl) {
      info.author = authorEl.textContent?.trim();
    }

    // 提取格式
    const formatEl = document.querySelector('.extension, [class*="format"], .book-format');
    if (formatEl) {
      info.format = formatEl.textContent?.trim().toLowerCase() || 'unknown';
    }

    // 提取文件大小
    const sizeEl = document.querySelector('.filesize, [class*="size"]');
    if (sizeEl) {
      info.fileSize = sizeEl.textContent?.trim();
    }

    return info;
  });
}

/**
 * 从 z-library 链接下载书籍
 */
export async function downloadFromZlib(
  url: string,
  options: ZlibDownloadOptions = {}
): Promise<ZlibDownloadResult> {
  const {
    cookies,
    downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zlib-')),
    timeout = 60000,
    headless = true,
    proxy,
  } = options;

  let browser: Browser | null = null;
  let filePath = '';
  let fileName = '';

  try {
    // 解析域名
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // 启动浏览器
    browser = await chromium.launch({
      headless,
      proxy: proxy ? { server: proxy } : undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    // 创建上下文
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      acceptDownloads: true,
    });

    // 设置 cookie
    if (cookies) {
      const parsedCookies = parseCookies(cookies, domain);
      await context.addCookies(parsedCookies);
    }

    const page = await context.newPage();

    // 设置下载处理器
    const downloadPromise = new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Download timeout')), timeout);

      page.on('download', async (download) => {
        clearTimeout(timeoutId);
        try {
          const suggestedName = download.suggestedFilename();
          fileName = suggestedName;
          const savePath = path.join(downloadDir, suggestedName);
          await download.saveAs(savePath);
          resolve(savePath);
        } catch (e) {
          reject(e);
        }
      });
    });

    // 访问页面
    console.error(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout });

    // 检查是否需要登录
    const needsLogin = await page.evaluate(() => {
      const loginForm = document.querySelector('form[action*="login"], .login-form');
      const loginButton = document.querySelector('a[href*="login"], button[type="submit"][class*="login"]');
      return !!(loginForm || loginButton);
    });

    if (needsLogin && !cookies) {
      throw new Error(
        'Z-Library requires login. Please provide cookies in config.\n' +
        'How to get cookies:\n' +
        '1. Login to z-library in your browser\n' +
        '2. Open Developer Tools (F12) -> Application -> Cookies\n' +
        '3. Copy all cookies as "name=value; name2=value2" format\n' +
        '4. Add to config: zlibrary.cookies = "..."'
      );
    }

    // 提取书籍信息
    const bookInfo = await extractBookInfo(page);
    console.error(`Found book: ${bookInfo.title} by ${bookInfo.author || 'Unknown'}`);

    // 查找下载按钮
    const downloadSelectors = [
      'a[href*="download"]',
      'button:has-text("Download")',
      '.download-link',
      'a.btn-download',
      '[class*="download"]',
      'a[href*="/dl/"]',
    ];

    let downloadClicked = false;
    for (const selector of downloadSelectors) {
      try {
        const element = await page.waitForSelector(selector, { timeout: 5000 });
        if (element) {
          console.error(`Clicking download button: ${selector}`);
          await element.click();
          downloadClicked = true;
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    if (!downloadClicked) {
      // 尝试直接查找所有链接
      const links = await page.$$('a');
      for (const link of links) {
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        if (href && (href.includes('download') || text?.toLowerCase().includes('download'))) {
          console.error(`Found download link: ${href}`);
          await link.click();
          downloadClicked = true;
          break;
        }
      }
    }

    if (!downloadClicked) {
      throw new Error('Could not find download button on the page');
    }

    // 等待页面变化 - z-library 会跳转到语言选择页面
    console.error('Waiting for mirror selection page...');
    await page.waitForTimeout(2000);

    // 检查是否跳转到语言选择页面
    const currentUrl = page.url();
    if (currentUrl.includes('/dl/')) {
      console.error('Redirected to mirror selection page, selecting a mirror...');
      
      // 选择一个镜像（优先英语，然后中文，再随机）
      const mirrorSelectors = [
        'a[href*="en.z-lib.fm/dl/"]',
        'a[href*="z-lib.fm/dl/"]',  // 默认英语
        'a[href*="zh.z-lib.fm/dl/"]', // 中文
        'a[href^="http"][href*="/dl/"]', // 任意镜像
      ];
      
      let mirrorClicked = false;
      for (const selector of mirrorSelectors) {
        try {
          const mirrorBtn = await page.$(selector);
          if (mirrorBtn) {
            const href = await mirrorBtn.getAttribute('href');
            console.error(`Clicking mirror: ${href}`);
            await mirrorBtn.click();
            mirrorClicked = true;
            break;
          }
        } catch {
          // Continue to next selector
        }
      }
      
      if (!mirrorClicked) {
        throw new Error('Could not find a download mirror on the language selection page');
      }
    }

    // 等待下载完成
    console.error('Waiting for download...');
    filePath = await downloadPromise;
    console.error(`Downloaded to: ${filePath}`);

    await browser.close();
    browser = null;

    return {
      filePath,
      fileName,
      bookInfo: {
        ...bookInfo,
        format: path.extname(fileName).slice(1).toLowerCase() || bookInfo.format,
      },
    };

  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

/**
 * 清理临时下载文件
 */
export function cleanupDownload(filePath: string): void {
  try {
    const dir = path.dirname(filePath);
    if (dir.startsWith(os.tmpdir())) {
      fs.rmSync(dir, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}