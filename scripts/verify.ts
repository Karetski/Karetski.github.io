import { chromium, type Page } from 'playwright';
import { readdirSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';

// Smoke-test the production build in dist/ (run `npm run build` first; `npm run
// verify` does both). Serves dist/ itself the way GitHub Pages does, then fails
// on console errors, page errors, failed requests, or a shader page whose stage
// did not come up. Screenshots land in OUT for visual review:
//   <page>.png               live page after ~1.5 s
//   theme-<id>.png           home page with ?theme=<id>&t=<FROZEN_T> (deterministic)

const SITE = 'dist';
const OUT = '/tmp/claude/verify';
const FROZEN_T = 12;

// Each theme is src/themes/<id>.ts; the other modules there are the theme
// machinery. Every theme must come up as itself under ?theme=<id>, so one that
// was never registered fails here.
const THEME_MACHINERY = new Set(['types.ts', 'registry.ts', 'schedule.ts']);
const THEME_IDS = readdirSync('src/themes')
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !THEME_MACHINERY.has(f))
  .map((f) => f.slice(0, -'.ts'.length));

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const isFile = async (path: string): Promise<boolean> => (await stat(path).catch(() => null))?.isFile() ?? false;

// GitHub Pages semantics: /dir → 301 /dir/, /dir/ → /dir/index.html, else 404.
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = decodeURIComponent(url.pathname);
  if (path.includes('..')) return void res.writeHead(400).end('bad path');
  const file = join(SITE, path.endsWith('/') ? `${path}index.html` : path);
  if (await isFile(file)) {
    return void res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  }
  if (!path.endsWith('/') && await isFile(join(SITE, path, 'index.html'))) {
    return void res.writeHead(301, { location: `${path}/${url.search}` }).end();
  }
  res.writeHead(404).end('not found');
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const BASE = `http://localhost:${(server.address() as AddressInfo).port}`;

interface PageReport {
  name: string;
  url: string;
  errors: string[];
  warnings: string[];
  pageErrors: string[];
  failedRequests: string[];
  stage?: { gl: boolean; theme?: string; renderScale?: string };
  screenshot: string;
}

const probe = async (page: Page, name: string, url: string, settleMs = 1500): Promise<PageReport> => {
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
  // Let the frame loop run so anything that throws per frame surfaces.
  await page.waitForTimeout(settleMs);

  const screenshot = `${OUT}/${name}.png`;
  await page.screenshot({ path: screenshot, fullPage: false });
  return { name, url, errors, warnings, pageErrors, failedRequests, screenshot };
};

/** Shader-site pages must end up with the stage running (html.gl). */
const probeStage = async (page: Page, name: string, url: string): Promise<PageReport> => {
  const r = await probe(page, name, url);
  r.stage = await page.evaluate(() => ({
    gl: document.documentElement.classList.contains('gl'),
    theme: document.documentElement.dataset.theme,
    renderScale: document.documentElement.dataset.renderScale,
  }));
  if (!r.stage.gl) r.errors.push('stage: html.gl not set — WebGL or a shader failed');
  return r;
};

const main = async () => {
  await mkdir(OUT, { recursive: true });
  // Headless Chromium has no GPU; SwiftShader gives it a software WebGL2.
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // The bubble game keeps its own light/dark theme; pin it to dark for a stable screenshot.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('ak.theme', 'dark'); } catch {}
  });
  try {
    const reports: PageReport[] = [];
    const visit = async (fn: (page: Page) => Promise<PageReport>) => {
      const page = await ctx.newPage();
      reports.push(await fn(page));
      await page.close();
    };

    await visit((p) => probeStage(p, 'home', `${BASE}/`));
    await visit((p) => probeStage(p, 'about', `${BASE}/about`));
    await visit((p) => probeStage(p, 'projects', `${BASE}/projects`));
    for (const id of THEME_IDS) {
      await visit(async (p) => {
        const r = await probeStage(p, `theme-${id}`, `${BASE}/?theme=${id}&t=${FROZEN_T}`);
        if (r.stage?.theme !== id) r.errors.push(`theme: asked for '${id}', got '${r.stage?.theme}' — is it in src/themes/registry.ts?`);
        return r;
      });
    }

    await visit(async (page) => {
      const r = await probe(page, 'play', `${BASE}/projects/bubble`);
      // Aim toward the playfield centre and fire a couple of shots.
      await page.mouse.move(640, 200);
      await page.waitForTimeout(150);
      await page.mouse.click(640, 200);
      await page.waitForTimeout(700);
      await page.mouse.click(700, 220);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/play-after-shots.png` });
      // Toggle the game's theme to exercise its grid rebuild and storage handler.
      const toggled = await page.evaluate(() => {
        const btn = document.querySelector('#theme-toggle button') as HTMLButtonElement | null;
        if (!btn) return 'no-toggle-button';
        btn.click();
        return 'clicked';
      });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/play-toggled.png` });
      if (toggled !== 'clicked') r.errors.push(`toggle: ${toggled}`);
      return r;
    });

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
