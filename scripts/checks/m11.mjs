// M11: scrolling and overlap regressions.
//  - A new page always opens at the top (hash links do not reset scroll by themselves).
//  - Screens open at the top: focus helpers must never scroll the page (a plain autoFocus used to).
//  - The paper texture is a composited fixed layer, not a fixed background (those repaint on every scroll frame).
//  - On the table, bet chips, name plates, cards, action bubbles, the pot and the board never sit on top of each other.
import { pathToFileURL } from 'node:url';

const SCROLL_SIZES = [['desktop 1360x860', 1360, 860], ['tablet 820x1180', 820, 1180], ['phone 390x844', 390, 844]];
const TABLE_SIZES = [
  ['desktop 1360x860', 1360, 860, false],
  ['laptop 1024x768', 1024, 768, false],
  ['short laptop 1280x640', 1280, 640, false],
  ['tablet 820x1180', 820, 1180, false],
  ['phone 390x844', 390, 844, false],
  ['small phone 360x640', 360, 640, false],
  ['phone landscape 844x390', 844, 390, false],
  ['phone 390x844 + large cards', 390, 844, true],
  ['small phone 360x640 + large cards', 360, 640, true],
];

const probe = () => {
  const wrap = document.querySelector('.table-wrap');
  if (!wrap) return [];
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.opacity !== '0'; };
  const items = [];
  wrap.querySelectorAll('.seat').forEach((s, i) => s.querySelectorAll('.plate, .seat-cards, .bubble, .plate-title').forEach((e) => vis(e) && items.push({ k: `${e.className.split(' ')[0]}#${i}`, seat: i, e })));
  wrap.querySelectorAll('.bet').forEach((e, i) => vis(e) && items.push({ k: `bet${i}`, seat: -1, e }));
  const pot = wrap.querySelector('.pot'); if (pot && vis(pot)) items.push({ k: 'pot', seat: -1, e: pot });
  const board = wrap.querySelector('.board'); if (board && vis(board)) items.push({ k: 'board', seat: -1, e: board });
  const out = [];
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const A = items[a], B = items[b];
    if (A.seat === B.seat && A.seat >= 0) continue; // parts of one seat are meant to touch
    const ra = A.e.getBoundingClientRect(), rb = B.e.getBoundingClientRect();
    const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ix > 4 && iy > 4 && (ix * iy) / Math.min(ra.width * ra.height, rb.width * rb.height) > 0.12) out.push(`${A.k} x ${B.k} (${Math.round(ix)}x${Math.round(iy)}px)`);
  }
  const w = document.documentElement.clientWidth;
  items.forEach((it) => { const r = it.e.getBoundingClientRect(); if (r.left < -1 || r.right > w + 1) out.push(`${it.k} off screen (${Math.round(r.left)}..${Math.round(r.right)})`); });
  return out;
};

export default async ({ page, check, url }) => {
  // Paper texture: a fixed layer, not fixed backgrounds.
  const bg = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundAttachment,
    top: getComputedStyle(document.querySelector('.topbar')).backgroundAttachment,
    layerPos: getComputedStyle(document.body, '::before').position,
    layerImg: getComputedStyle(document.body, '::before').backgroundImage,
  }));
  check('texture is not a fixed background (no repaint on scroll)', !/fixed/.test(bg.body) && !/fixed/.test(bg.top), bg);
  check('texture lives on a fixed layer behind the page', bg.layerPos === 'fixed' && /feTurbulence/.test(bg.layerImg), bg);

  for (const [name, w, h] of SCROLL_SIZES) {
    await page.setViewportSize({ width: w, height: h });
    // A page opens at the top, and its call-to-action takes focus without scrolling the page.
    for (const r of ['/', '/play', '/learn', '/drills', '/progress']) {
      await page.goto(url + '#' + r);
      await page.evaluate(() => { localStorage.clear(); window.scrollTo(0, 0); });
      await page.reload();
      await page.waitForTimeout(200);
      check(`${name}: #${r} opens at the top`, (await page.evaluate(() => Math.round(window.scrollY))) === 0);
    }
    // Moving between pages resets to the top, wherever you were.
    for (const [from, to] of [['/about', '/learn'], ['/about', '/progress'], ['/progress', '/play']]) {
      await page.goto(url + '#' + from);
      await page.reload();
      await page.evaluate(() => window.scrollTo(0, 99999));
      await page.waitForTimeout(80);
      const before = await page.evaluate(() => Math.round(window.scrollY));
      await page.evaluate((t) => { window.location.hash = t; }, to);
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => Math.round(window.scrollY));
      check(`${name}: ${from} (scrolled ${before}px) -> ${to} lands at the top`, before > 0 && after === 0, { before, after });
    }
    // A lesson step starts with the lesson heading just below the header.
    await page.goto(url + '#/learn/m0-l1');
    await page.waitForTimeout(300);
    const les = await page.evaluate(() => ({ top: Math.round(document.querySelector('.lesson')?.getBoundingClientRect().top ?? -1), head: Math.round(document.querySelector('.topbar').getBoundingClientRect().bottom) }));
    check(`${name}: lesson heading is not hidden under the header`, les.top >= les.head - 1, les);
  }

  // Overlaps on the table, over a few real hands.
  for (const [name, w, h, large] of TABLE_SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(url + '#/play');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    if (large) {
      await page.getByRole('button', { name: /Display/ }).click();
      await page.getByLabel('Large cards').check();
      await page.getByRole('button', { name: 'Close settings' }).click();
    }
    const seen = new Set();
    for (let hand = 0; hand < 3; hand++) {
      await page.getByRole('button', { name: /^Deal/ }).first().click().catch(() => undefined);
      for (let step = 0; step < 12; step++) {
        await page.waitForTimeout(420);
        (await page.evaluate(probe)).forEach((f) => seen.add(f));
        if (await page.getByRole('button', { name: /Deal next hand/ }).count()) break;
        const call = page.locator('.action-buttons .btn-call');
        if (await call.count()) await call.first().click({ force: true }).catch(() => undefined);
      }
    }
    check(`${name}: nothing on the table overlaps`, seen.size === 0, [...seen].slice(0, 6));
  }
};
