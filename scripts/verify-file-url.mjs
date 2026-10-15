// Opens dist/index.html via file:// in a headless browser and asserts the app works fully offline:
// renders, plays a hand, persists to localStorage, and makes NO network requests
// (other than the file itself and inline data:/blob: URLs).
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const file = resolve(process.argv[2] ?? 'dist/index.html');
if (!existsSync(file)) { console.error('Missing', file, '- run npm run build first'); process.exit(2); }
const url = pathToFileURL(file).href;

const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
const bad = [];
const errors = [];
page.on('request', (r) => { const u = r.url(); if (!/^(data:|blob:|about:)/.test(u) && u !== url && !u.startsWith(url.split('#')[0])) bad.push(u); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const checks = [];
const check = (name, ok, extra) => { checks.push([name, !!ok, extra]); };

await page.goto(url);
check('home renders', await page.locator('.brand').count());
await page.goto(url + '#/play');
await page.locator('button', { hasText: /^Deal$/ }).click();
await page.waitForSelector('.table-wrap');
check('table renders with cards', (await page.locator('.seat-hero .pcard').count()) === 2);
await page.click('text=Fast');
await page.waitForTimeout(600);
const stored = await page.evaluate(() => localStorage.getItem('p0k3r.v1'));
check('localStorage persisted settings', stored && stored.includes('"botSpeed":"fast"'));
if (process.env.EXTRA_CHECKS) {
  const extra = await import(pathToFileURL(resolve(process.env.EXTRA_CHECKS)).href);
  await extra.default({ page, check, url });
}
await browser.close();

check('no network requests', bad.length === 0, bad);
check('no console errors', errors.length === 0, errors);
let ok = true;
for (const [n, pass, extra] of checks) {
  console.log(pass ? 'PASS' : 'FAIL', n, pass || !extra || (Array.isArray(extra) && !extra.length) ? '' : JSON.stringify(extra));
  ok &&= pass;
}
process.exit(ok ? 0 : 1);
