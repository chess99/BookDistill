import { chromium } from 'playwright';

const cookies = "siteLanguage=en; cf_clearance=lth9uCmeXtiCFJ3CvYJQIPbOJMp_cpd9Ng3VqvERfhQ-1765885671-1.2.1.1-uG0N6k_.oNP2N2kQcAI9Ths1Sk1wYl4kkNTKC8FAPVUJHChCJseUZMYcmqcRaLPBnt7dZwCq3xwVRi.VHdQR3zWaSKctO7.057CzXkI7x.w4Jfa1Wq0l.zyf67LHwJXgjviFFnN5c6vEb86qj5QJElCLWKJlsMFBxOQixBLO3wAq3uKZMfYZ.TuZmu7lYVSb3ydjREG7Y7NyQlpDxNk0g4IXKt4PtBUwtExGRhNlaeJv4QNFgy.AmGoBoQ7X1xwN; remix_userkey=88f684514f652b19c1e0918f06bc820c; remix_userid=38710980; selectedSiteMode=books; bsrv=88a9540af60d0dbc500dbf01536634f5";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    acceptDownloads: true,
  });
  
  const parsedCookies = cookies.split(';').map(c => {
    const [name, ...rest] = c.trim().split('=');
    return { name: name.trim(), value: rest.join('=').trim(), domain: 'z-lib.fm', path: '/' };
  });
  await context.addCookies(parsedCookies);
  
  const page = await context.newPage();
  const url = 'https://z-lib.fm/book/XZqkYJ87gp/%E7%B2%BE%E8%A6%81%E4%B8%BB%E4%B9%89-%E5%A6%82%E4%BD%95%E5%BA%94%E5%AF%B9%E6%8B%A5%E6%8C%A4%E4%B8%8D%E5%A0%AA%E7%9A%84%E5%B7%A5%E4%BD%9C%E4%B8%8E%E7%94%9F%E6%B4%BB.html';
  
  console.log('Navigating...');
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  } catch(e) {
    console.log('goto error (ok if domcontentloaded still happened):', (e as any).message.slice(0, 100));
  }
  await page.waitForTimeout(3000);
  
  console.log('Title:', await page.title());
  console.log('URL:', page.url());
  
  const links = await page.$$eval('a', els => els.map(el => ({ href: el.getAttribute('href'), text: el.textContent?.trim().slice(0, 50) })));
  const dlLinks = links.filter(l => l.href?.includes('/dl/') || l.text?.toLowerCase().includes('download'));
  console.log('Download-related links:', JSON.stringify(dlLinks.slice(0, 10), null, 2));
  
  const downloadEl = await page.$('a[href*="/dl/"]');
  console.log('dl/ link found:', !!downloadEl);
  if (downloadEl) {
    const href = await downloadEl.getAttribute('href');
    console.log('dl href:', href);
  }
  
  await browser.close();
}

main().catch(console.error);
