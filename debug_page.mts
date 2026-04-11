import { chromium } from 'playwright';
import { readConfig } from './cli/config.js';
import * as fs from 'fs';

const config = readConfig();
const cookies = config.zlibrary?.cookies || '';
const domain = 'z-lib.fm';

const browser = await chromium.launch({ headless: false }); // 有界面，方便你看
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  acceptDownloads: true,
  viewport: { width: 1280, height: 800 },
});
const parsedCookies = cookies.split(';').map((c: string) => {
  const [name, ...v] = c.trim().split('=');
  return { name: name.trim(), value: v.join('=').trim(), domain, path: '/' };
}).filter((c: any) => c.name && c.value);
await context.addCookies(parsedCookies);

const page = await context.newPage();
await page.goto('https://z-lib.fm/book/kgjG6KPwAV/深度工作如何有效使用每一点脑力-deep-work-rules-for-focused-success-in-a-distracted-world.html', 
  { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

// 截图
await page.screenshot({ path: '/tmp/zlib_book_page.png', fullPage: false });
console.log('截图保存到 /tmp/zlib_book_page.png');

// 悬浮在头像上看额度
const avatar = await page.$('[class*="user"], [class*="avatar"], [class*="profile"]');
if (avatar) {
  await avatar.hover();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/zlib_hover.png', fullPage: false });
  console.log('悬浮截图保存到 /tmp/zlib_hover.png');
}

// 打印页面上所有可见文字（用于分析）
const visibleText = await page.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text && text.length > 3) texts.push(text);
  }
  return texts.filter(t => /download|limit|quota|下载|额度|限制/i.test(t));
});
console.log('相关文字:', visibleText);

// 保持浏览器打开30秒供查看
console.log('\n浏览器将保持打开30秒，请查看页面...');
await page.waitForTimeout(30000);
await browser.close();
