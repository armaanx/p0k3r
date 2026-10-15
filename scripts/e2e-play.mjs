// Plays several hands through the keyboard in the built single file (file://), taking screenshots.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(resolve('dist/index.html')).href + '#/play';
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.addStyleTag({ content: '*{animation-duration:0.001ms!important;transition-duration:0.001ms!important}' });
await page.click('text=Fast');
await page.locator('button', { hasText: /^Deal$/ }).click();
await page.waitForSelector('.table-wrap');
await page.screenshot({ path: 'shots/m2-table-start.png' });

let handsDone = 0;
let shot = 0;
const want = Number(process.argv[2] ?? 6);
for (let step = 0; step < 600 && handsDone < want; step++) {
  const over = await page.locator('.result-card').count();
  if (over) {
    handsDone++;
    if (!globalThis.sdShot && (await page.locator('.seat:not(.seat-hero) .pcard').count()) >= 2) { globalThis.sdShot = 1; await page.waitForTimeout(700); await page.screenshot({ path: 'shots/m2-showdown.png' }); }
    if (handsDone === 2) await page.screenshot({ path: 'shots/m2-result.png' });
    await page.keyboard.press('n');
    await page.waitForTimeout(60);
    continue;
  }
  const bar = await page.locator('.actionbar').count();
  if (bar) {
    if (!globalThis.flopShot && (await page.locator('.board .pcard').count()) >= 4) { globalThis.flopShot = 1; await page.screenshot({ path: 'shots/m2-turn.png' }); }
    if (shot < 3 && step % 7 === 0) { await page.screenshot({ path: `shots/m2-action-${shot++}.png` }); }
    const r = Math.random();
    await page.keyboard.press(r < 0.12 ? 'f' : r < 0.3 ? 'r' : 'c');
    if (r >= 0.12 && r < 0.3) { await page.waitForTimeout(30); await page.keyboard.press('Enter'); }
  }
  await page.waitForTimeout(40);
}
const played = await page.locator('text=Hands played').locator('..').innerText();
console.log('hands finished:', handsDone, '|', played.replace(/\n/g, ' '));
console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'no console errors');
await browser.close();
process.exit(errors.length || handsDone < want ? 1 : 0);
