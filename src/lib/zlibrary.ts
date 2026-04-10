/**
 * Z-Library 下载服务
 *
 * 支持从 z-library 镜像站点搜索并下载书籍文件
 *
 * 使用方式：
 * 1. 在配置文件中设置 zlibrary.cookies（从浏览器复制）
 * 2. 使用 z-library 链接作为输入：book-distill -i "https://z-lib.fm/book/xxx"
 * 3. 使用书名搜索：book-distill -i "笑傲股市"（自动搜索并 AI 选最优版本）
 *
 * 支持的镜像域名：
 * - z-lib.fm
 * - z-library.sk
 * - singlelogin.re
 * - 1lib.sk
 */

import { chromium, Browser, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// 链接匹配正则
const ZLIB_URL_PATTERN = /^https?:\/\/([a-z0-9-]+\.)?(z-lib\.fm|z-library\.sk|singlelogin\.re|1lib\.sk|z-lib\.org|booksc\.org|booksc\.eu|booksc\.xyz)/i;

/** 默认搜索域名 */
export const ZLIB_DEFAULT_BASE = 'https://z-lib.fm';

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
 * 搜索结果中的单本书候选
 */
export interface ZlibBookCandidate {
  title: string;
  author: string;
  /** 文件格式，如 epub / pdf / mobi */
  format: string;
  /** 文件大小，如 "2.3 MB" */
  fileSize: string;
  /** 出版年份 */
  year: string;
  /** 语言 */
  language: string;
  /** 书籍详情页 URL */
  bookUrl: string;
  /** z-library 评分（如有） */
  rating?: string;
  /** z-library 质量分（如有，0-10） */
  quality?: string;
}

/**
 * 检查 URL 是否为 z-library 链接
 */
export function isZlibUrl(url: string): boolean {
  return ZLIB_URL_PATTERN.test(url);
}

/**
 * 搜索 z-library，返回候选书目列表
 */
export async function searchZlib(
  query: string,
  options: ZlibDownloadOptions & { baseUrl?: string } = {}
): Promise<ZlibBookCandidate[]> {
  const {
    cookies,
    timeout = 60000,
    headless = true,
    proxy,
    baseUrl = ZLIB_DEFAULT_BASE,
  } = options;

  const domain = new URL(baseUrl).hostname;
  const searchUrl = `${baseUrl}/s/${encodeURIComponent(query)}`;

  const browser = await chromium.launch({
    headless,
    proxy: proxy ? { server: proxy } : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    if (cookies) {
      await context.addCookies(parseCookies(cookies, domain));
    }

    const page = await context.newPage();
    console.error(`Searching z-library: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout });

    // 抓取搜索结果列表（z-library 使用 <z-bookcard> 自定义元素，数据在 attributes 中）
    const candidates = await page.evaluate((baseUrl: string) => {
      const results: Array<{
        title: string; author: string; format: string;
        fileSize: string; year: string; language: string;
        bookUrl: string; rating: string; quality: string;
      }> = [];

      document.querySelectorAll('z-bookcard').forEach(card => {
        const href = card.getAttribute('href') || '';
        if (!href) return;
        const bookUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;

        // 标题：从 href 路径提取并 URL 解码
        const titleFromHref = decodeURIComponent(
          href.split('/').pop()?.replace(/\.html$/, '').replace(/-/g, ' ') || ''
        );

        results.push({
          title: titleFromHref,
          author: '',                                          // 详情页再取，搜索页 attr 无作者
          format: card.getAttribute('extension') || '',
          fileSize: card.getAttribute('filesize') || '',
          year: card.getAttribute('year') || '',
          language: card.getAttribute('language') || '',
          bookUrl,
          rating: card.getAttribute('rating') || '',
          quality: card.getAttribute('quality') || '',
        });
      });

      return results;
    }, baseUrl);

    await browser.close();
    return candidates;
  } catch (e) {
    await browser.close();
    throw e;
  }
}

/**
 * 格式优先级（越高越好，适合文字提取）
 */
const FORMAT_SCORE: Record<string, number> = {
  epub: 100,
  mobi: 80,
  azw3: 75,
  fb2:  60,
  djvu: 40,
  pdf:  20,  // 可能是扫描版，排最低
};

/**
 * 解析文件大小为 MB 数字
 */
function parseSizeMB(sizeStr: string): number {
  const m = sizeStr.match(/([\d.]+)\s*(mb|kb|gb)/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 'kb') return val / 1024;
  if (unit === 'gb') return val * 1024;
  return val;
}

/**
 * 用规则打分，选出最适合提炼的版本。
 *
 * 打分维度：
 * - 标题相关性 (30分)：查询词关键字出现在标题中加分
 * - 格式 (40分)：epub > mobi > azw3 > pdf
 * - PDF 大小：pdf 且 <5MB 视为文字版加分，>15MB 扣分（扫描版），>50MB 重度扣分
 * - 出版年份 (20分)：越新越好
 * - 语言匹配 (5分)：中文版小加成
 * - 质量/评分：quality≥4 加分，<2 扣分
 *
 * 选完后打印每本书的得分供用户参考。
 */
export function selectBestCandidate(
  candidates: ZlibBookCandidate[],
  preferLang = 'zh',
  query = ''
): { best: ZlibBookCandidate; scores: Array<{ candidate: ZlibBookCandidate; score: number; reasons: string[] }> } {
  // 提取查询词中的关键字（去掉作者名常见词，保留核心书名词）
  const queryKeywords = query
    .split(/[\s··,，。？！]+/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length >= 2);

  const scored = candidates.map(c => {
    let score = 0;
    const reasons: string[] = [];

    // 标题相关性分
    // 查询词中取前2个词（通常是书名核心词）作为必须匹配词
    // 如果标题完全不包含任何核心词，大幅扣分（套装/合集书问题）
    if (queryKeywords.length > 0) {
      const titleLower = c.title.toLowerCase();
      // 只取前2个词作为"核心书名词"（跳过单字词）
      const coreKeywords = queryKeywords.filter(w => w.length >= 2).slice(0, 2);
      const coreMatchCount = coreKeywords.filter(kw => titleLower.includes(kw)).length;
      const allMatchCount = queryKeywords.filter(kw => titleLower.includes(kw)).length;

      if (coreMatchCount === 0) {
        // 标题完全不包含核心词 → 强烈惩罚（套装书/无关书）
        // 惩罚足够大，确保即使格式+年份满分也排不过正确的书
        score -= 80;
        reasons.push(`标题不含核心词[${coreKeywords.join(',')}] -80`);
      } else {
        const relScore = Math.min(30, Math.round((allMatchCount / queryKeywords.length) * 30));
        score += relScore;
        reasons.push(`标题匹配 ${allMatchCount}/${queryKeywords.length} 关键词 +${relScore}`);
      }
    }

    // 格式分
    const fmt = c.format.toLowerCase().replace(/[^a-z]/g, '');
    const fmtScore = FORMAT_SCORE[fmt] ?? 10;
    score += Math.round(fmtScore * 0.4);
    reasons.push(`格式 ${c.format || '?'} → ${Math.round(fmtScore * 0.4)}分`);

    // PDF 大小惩罚/奖励
    if (fmt === 'pdf' && c.fileSize) {
      const mb = parseSizeMB(c.fileSize);
      if (mb > 0) {
        if (mb < 5) {
          score += 15;
          reasons.push(`PDF 较小(${c.fileSize})，可能是文字版 +15`);
        } else if (mb > 50) {
          score -= 25;
          reasons.push(`PDF 超大(${c.fileSize})，大概率扫描版 -25`);
        } else if (mb > 15) {
          score -= 15;
          reasons.push(`PDF 较大(${c.fileSize})，可能是扫描版 -15`);
        }
      }
    }

    // 年份分（最近 10 年满分，每早 5 年减 5 分）
    const year = parseInt(c.year) || 0;
    if (year > 0) {
      const currentYear = new Date().getFullYear();
      const yearScore = Math.max(0, 20 - Math.floor((currentYear - year) / 5) * 5);
      score += yearScore;
      reasons.push(`年份 ${c.year} → ${yearScore}分`);
    }

    // 语言匹配（+5 小加成，不强制偏向某种语言）
    const lang = c.language.toLowerCase();
    const wantChinese = preferLang.startsWith('zh') || preferLang === 'Chinese';
    if (wantChinese && (lang.includes('chinese') || lang.includes('中文') || lang.includes('zh'))) {
      score += 5;
      reasons.push(`中文版 +5`);
    } else if (!wantChinese && lang.includes('english')) {
      score += 5;
      reasons.push(`英文版 +5`);
    } else if (lang) {
      reasons.push(`语言 ${c.language}`);
    }

    // 评分 + 质量分（quality 是扫描质量，0=差/扫描版，5=好）
    const rating = parseFloat(c.rating || '0');
    const quality = parseFloat(c.quality || '0');
    if (rating > 0) {
      score += Math.round(rating);  // 最多 5 分
      reasons.push(`评分 ${c.rating} +${Math.round(rating)}`);
    }
    if (quality >= 4) {
      score += 8;
      reasons.push(`质量分 ${c.quality} +8`);
    } else if (quality > 0 && quality < 2) {
      score -= 5;
      reasons.push(`质量分低(${c.quality}) -5`);
    }

    return { candidate: c, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  return { best: scored[0].candidate, scores: scored };
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
  const defaultDownloadDir = path.join(os.homedir(), 'Downloads');
  const {
    cookies,
    downloadDir: rawDownloadDir,
    timeout = 60000,
    headless = true,
    proxy,
  } = options;

  // Expand ~ and resolve to absolute path
  const resolveDir = (d: string) =>
    d.startsWith('~') ? path.join(os.homedir(), d.slice(1)) : path.resolve(d);

  const downloadDir = rawDownloadDir
    ? resolveDir(rawDownloadDir)
    : fs.existsSync(defaultDownloadDir) ? defaultDownloadDir : os.tmpdir();

  let browser: Browser | null = null;
  let filePath = '';
  let fileName = '';
  let bookInfo: ZlibBookInfo = { title: '', format: '' };

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

    // 设置下载处理器（注意：download 事件是 page 级别，不是 context 级别）
    // 检测是否为直接下载 URL（/dl/ 路径会直接触发下载）
    const isDlUrl = urlObj.pathname.startsWith('/dl/');

    let resolveDownload!: (path: string) => void;
    let rejectDownload!: (err: Error) => void;
    let downloadPromise: Promise<string>;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const bindDownloadHandler = (p: Page) => {
      downloadPromise = new Promise<string>((resolve, reject) => {
        resolveDownload = resolve;
        rejectDownload = reject;
      });
      timeoutId = setTimeout(() => rejectDownload(new Error('Download timeout')), timeout);
      p.on('download', async (download) => {
        clearTimeout(timeoutId);
        try {
          const suggestedName = download.suggestedFilename();
          fileName = suggestedName;
          const savePath = path.join(downloadDir, suggestedName);
          console.error(`Download started: ${suggestedName}, saving to: ${savePath}`);
          // Wait for download to complete, then use path() to get temp file
          const tmpPath = await download.path();
          if (!tmpPath) {
            throw new Error('Download failed: no temp path available (download may have been canceled by browser)');
          }
          console.error(`Download completed to temp: ${tmpPath}`);
          fs.copyFileSync(tmpPath, savePath);
          console.error(`Download copied to: ${savePath}`);
          resolveDownload(savePath);
        } catch (e: any) {
          console.error(`Download handler error: ${e.message}`);
          rejectDownload(e);
        }
      });
    };

    if (isDlUrl) {
      // 直接下载 URL：用 waitForEvent('download') + 不等待页面加载的 goto
      console.error(`Direct download URL detected, navigating to ${url}...`);
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout }),
        page.goto(url, { waitUntil: 'commit', timeout }).catch(() => {/* expected: "Download is starting" */}),
      ]);

      console.error(`Download started: ${download.suggestedFilename()}`);
      fileName = download.suggestedFilename();
      const savePath = path.join(downloadDir, fileName);

      const tmpPath = await download.path();
      if (!tmpPath) {
        throw new Error('Download failed: temp path unavailable');
      }
      console.error(`Download completed, copying to: ${savePath}`);
      fs.copyFileSync(tmpPath, savePath);
      filePath = savePath;
      // Infer book info from filename
      const ext = path.extname(fileName).slice(1).toLowerCase();
      bookInfo = { title: path.basename(fileName, path.extname(fileName)), format: ext };
    } else {
      // 书籍详情页：先导航，再找下载按钮
      bindDownloadHandler(page);

      console.error(`Navigating to ${url}...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      // 等待动态内容加载（z-library 部分内容是 JS 渲染的）
      await page.waitForTimeout(3000);

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
      bookInfo = await extractBookInfo(page);
      console.error(`Found book: ${bookInfo.title} by ${bookInfo.author || 'Unknown'}`);

      // 监听 context 上新页面（popup）的 download 事件
      // z-library 的 /dl/ 链接可能带有 target="_blank"，会在新 page 触发 download
      context.on('page', (newPage) => {
        newPage.on('download', async (download) => {
          if (timeoutId) clearTimeout(timeoutId);
          try {
            const suggestedName = download.suggestedFilename();
            fileName = suggestedName;
            const savePath = path.join(downloadDir, suggestedName);
            console.error(`Download started (popup page): ${suggestedName}, saving to: ${savePath}`);
            const tmpPath = await download.path();
            if (!tmpPath) {
              throw new Error('Download failed: no temp path available');
            }
            console.error(`Download completed to temp: ${tmpPath}`);
            fs.copyFileSync(tmpPath, savePath);
            console.error(`Download copied to: ${savePath}`);
            resolveDownload(savePath);
          } catch (e: any) {
            console.error(`Download handler error (popup): ${e.message}`);
            rejectDownload(e);
          }
        });
      });

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
            // 获取 href，如果是 /dl/ 链接，直接在当前 page 用 goto 方式触发下载（避免 popup）
            const href = await element.getAttribute('href');
            if (href && href.startsWith('/dl/')) {
              const dlUrl = new URL(href, `https://${domain}`).toString();
              console.error(`Navigating directly to dl URL: ${dlUrl}`);
              // 重新绑定 download handler，使用 waitForEvent 更可靠
              clearTimeout(timeoutId);
              const [dl] = await Promise.all([
                page.waitForEvent('download', { timeout }),
                page.goto(dlUrl, { waitUntil: 'commit', timeout }).catch(() => {}),
              ]);
              const suggestedName = dl.suggestedFilename();
              fileName = suggestedName;
              const savePath = path.join(downloadDir, suggestedName);
              console.error(`Download started: ${suggestedName}, saving to: ${savePath}`);
              const tmpPath = await dl.path();
              if (!tmpPath) throw new Error('Download failed: temp path unavailable');
              fs.copyFileSync(tmpPath, savePath);
              filePath = savePath;
              console.error(`Download copied to: ${savePath}`);
              resolveDownload(savePath);
              downloadClicked = true;
              break;
            } else {
              console.error(`Clicking download button: ${selector}`);
              await element.click();
              downloadClicked = true;
              break;
            }
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
          if (href && href.startsWith('/dl/')) {
            const dlUrl = new URL(href, `https://${domain}`).toString();
            console.error(`Found dl link, navigating directly: ${dlUrl}`);
            clearTimeout(timeoutId);
            const [dl] = await Promise.all([
              page.waitForEvent('download', { timeout }),
              page.goto(dlUrl, { waitUntil: 'commit', timeout }).catch(() => {}),
            ]);
            const suggestedName = dl.suggestedFilename();
            fileName = suggestedName;
            const savePath = path.join(downloadDir, suggestedName);
            const tmpPath = await dl.path();
            if (!tmpPath) throw new Error('Download failed: temp path unavailable');
            fs.copyFileSync(tmpPath, savePath);
            filePath = savePath;
            resolveDownload(savePath);
            downloadClicked = true;
            break;
          } else if (href && (href.includes('download') || text?.toLowerCase().includes('download'))) {
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

      // 如果不是直接通过 dl URL 下载（filePath 还没有设置），等待 download 事件
      if (!filePath) {
        console.error('Waiting for download...');
        filePath = await downloadPromise;
        console.error(`Downloaded to: ${filePath}`);
      }
    }

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