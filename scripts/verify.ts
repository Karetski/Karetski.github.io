import { chromium, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:8123';
const OUT = '/tmp/claude/verify';

interface PageReport {
  name: string;
  url: string;
  errors: string[];
  warnings: string[];
  pageErrors: string[];
  failedRequests: string[];
  screenshot: string;
}

const probe = async (page: Page, name: string, url: string): Promise<PageReport> => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => {
    pageErrors.push(`${err.name}: ${err.message}\n${err.stack ?? ''}`);
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? '?'}`);
  });

  await page.goto(url, { waitUntil: 'load' });
  // Let the matrix run a few frames so anything that throws on raf surfaces.
  await page.waitForTimeout(1500);

  const screenshot = `${OUT}/${name}.png`;
  await page.screenshot({ path: screenshot, fullPage: false });
  return { name, url, errors, warnings, pageErrors, failedRequests, screenshot };
};

const probeInteraction = async (page: Page, name: string, url: string): Promise<PageReport> => {
  const r = await probe(page, name, url);
  // Toggle theme to exercise setupGrid + refreshPickers + storage handler.
  const toggled = await page.evaluate(() => {
    const btn = document.querySelector('#theme-toggle button') as HTMLButtonElement | null;
    if (!btn) return 'no-toggle-button';
    btn.click();
    return 'clicked';
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}-toggled.png` });
  r.errors.push(...((toggled === 'clicked') ? [] : [`toggle: ${toggled}`]));
  return r;
};

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Pin theme to dark for the visual check — light mode is mostly white
  // because of centerFade + aging-toward-bg, so it doesn't differentiate
  // "rendering correctly" from "rendering nothing" in a 1280×720 PNG.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('ak.theme', 'dark'); } catch {}
  });
  try {
    const reports: PageReport[] = [];

    const indexPage = await ctx.newPage();
    reports.push(await probeInteraction(indexPage, 'index', `${BASE}/index.html`));
    await indexPage.close();

    const playPage = await ctx.newPage();
    reports.push(await probe(playPage, 'play', `${BASE}/play.html`));
    // Aim toward the playfield centre and click to fire a couple of shots.
    await playPage.mouse.move(640, 200);
    await playPage.waitForTimeout(150);
    await playPage.mouse.click(640, 200);
    await playPage.waitForTimeout(700);
    await playPage.mouse.click(700, 220);
    await playPage.waitForTimeout(700);
    await playPage.screenshot({ path: `${OUT}/play-after-shots.png` });
    await playPage.close();

    const ok = reports.every((r) =>
      r.errors.length === 0 &&
      r.pageErrors.length === 0 &&
      r.failedRequests.length === 0,
    );
    console.log(JSON.stringify({ ok, reports }, null, 2));
    process.exit(ok ? 0 : 1);
  } finally {
    await browser.close();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
