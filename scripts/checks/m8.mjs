// M8 checks: embedded fonts, Graphite & Grain design rules, sound toggle (off by default), reduced motion, chip animation, large text, tablet layout.
export default async function ({ page, check, url }) {
  const base = url.split('#')[0];
  await page.goto(base + '?debug#/play');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const used = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
    return { used };
  });
  check(`embedded fonts are loaded (${[...new Set(fonts.used)].join(', ')})`, fonts.used.some((f) => /Instrument Serif/.test(f)) && fonts.used.some((f) => /Hanken Grotesk/.test(f)) && fonts.used.some((f) => /JetBrains/.test(f)));
  const headingFont = await page.evaluate(() => getComputedStyle(document.querySelector('.brand')).fontFamily);
  check('headings use Instrument Serif', /Instrument Serif/.test(headingFont));
  const uiFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  check('interface text uses Hanken Grotesk', /Hanken Grotesk/.test(uiFont));
  const numFont = await page.evaluate(() => { const el = document.createElement('span'); el.className = 'num'; document.body.appendChild(el); const f = getComputedStyle(el).fontFamily + '|' + getComputedStyle(el).fontVariantNumeric; el.remove(); return f; });
  check('numbers use the tabular mono face with tabular figures', /JetBrains/.test(numFont) && /tabular/.test(numFont));

  // Sound: off by default, never creates an AudioContext until enabled
  await page.addInitScript(() => { window.__ac = 0; const AC = window.AudioContext; window.AudioContext = function (...a) { window.__ac++; return new AC(...a); }; });
  await page.reload();
  await page.locator('.side-drawer .seg button', { hasText: 'Fast' }).click();
  await page.locator('button', { hasText: /^Deal$/ }).click();
  await page.waitForSelector('.actionbar');
  check('sound is off by default: no audio context is created', (await page.evaluate(() => window.__ac)) === 0);
  await page.locator('button', { hasText: 'Display' }).click();
  await page.getByLabel('Sound effects (off by default)').check();
  await page.keyboard.press('c');
  await page.waitForTimeout(900);
  check('turning sound on creates synthesized audio (no audio files)', (await page.evaluate(() => window.__ac)) >= 1);
  await page.getByLabel('Sound effects (off by default)').uncheck();

  // Graphite & Grain: dark grainy paper, no shadows, no glow, at most one inverted (bone) element per screen.
  const paper = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, img: getComputedStyle(document.body).backgroundImage }));
  check(`background is the warm near-black paper (${paper.bg})`, paper.bg === 'rgb(20, 19, 15)');
  check('background carries the paper grain texture', /feTurbulence/.test(paper.img));
  // Text size + four colour + large cards
  await page.getByRole('button', { name: 'A++' }).click();
  const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  check(`text size scales up (${fs}px root)`, fs >= 20);
  await page.getByRole('button', { name: 'A', exact: true }).click();
  await page.getByLabel('Large cards').check();
  await page.keyboard.press('Escape');
  await page.locator('button[aria-label="Close settings"]').click().catch(() => {});

  // Reduced motion: animations are effectively disabled
  await page.getByRole('button', { name: /Display/ }).click();
  await page.getByRole('button', { name: 'Reduce', exact: true }).click();
  const dur = await page.evaluate(() => { const el = document.querySelector('.btn'); return getComputedStyle(el).transitionDuration; });
  check(`reduced motion removes transitions (${dur})`, /^0\.001ms|0s/.test(dur) || parseFloat(dur) < 0.01);
  await page.getByRole('group', { name: 'Motion' }).getByRole('button', { name: 'Full' }).click();

  // Media-query based reduced motion also honoured (Motion = System)
  await page.getByRole('group', { name: 'Motion' }).getByRole('button', { name: 'System' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const dur2 = await page.evaluate(() => getComputedStyle(document.querySelector('.btn')).transitionDuration);
  check(`prefers-reduced-motion is honoured (${dur2})`, parseFloat(dur2) < 0.01);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Design audit on every screen (desktop width)
  for (const route of ['#/', '#/learn', '#/drills', '#/play', '#/review', '#/progress', '#/reference', '#/about']) {
    await page.goto(base + route);
    await page.waitForTimeout(250);
    const audit = await page.evaluate(() => {
      const els = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; });
      let shadows = 0, inverted = 0, gradients = 0, glow = 0;
      for (const el of els) {
        const cs = getComputedStyle(el);
        if (cs.boxShadow && cs.boxShadow !== 'none') shadows++;
        if (cs.filter && /drop-shadow|blur/.test(cs.filter)) glow++;
        if (cs.backdropFilter && cs.backdropFilter !== 'none') glow++;
        if (/gradient/.test(cs.backgroundImage)) gradients++;
        if (cs.backgroundColor === 'rgb(246, 242, 231)' && !el.classList.contains('skip-link') && el.tagName !== 'svg') inverted++;
      }
      return { shadows, inverted, gradients, glow };
    });
    check(`${route}: no drop shadows, glow or blur (${audit.shadows}/${audit.glow})`, audit.shadows === 0 && audit.glow === 0);
    check(`${route}: no gradients on interface elements (${audit.gradients})`, audit.gradients === 0);
    check(`${route}: at most one inverted bone element (${audit.inverted})`, audit.inverted <= 1);
  }
  await page.setViewportSize({ width: 1360, height: 860 });
  await page.goto(base + '#/play');
  await page.locator('button', { hasText: /^Deal$/ }).click();
  await page.waitForSelector('.actionbar');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/m8-desk.png' });

  // Tablet layout
  await page.setViewportSize({ width: 820, height: 1100 });
  await page.goto(base + '#/play');
  await page.reload();
  await page.locator('button', { hasText: /^Deal$/ }).click();
  await page.waitForSelector('.table-wrap');
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('tablet width (820px): no horizontal overflow on the table screen', !over);
  await page.screenshot({ path: 'shots/m8-tablet-play.png' });
  for (const route of ['#/learn', '#/drills', '#/progress', '#/reference', '#/review']) {
    await page.goto(base + route);
    await page.waitForTimeout(150);
    const o = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    check(`tablet width: no horizontal overflow on ${route}`, !o);
  }
  // Keyboard: skip link
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(base + '#/learn');
  await page.reload();
  await page.keyboard.press('Tab');
  check('skip link is the first focusable element', /Skip to the main content/.test(await page.evaluate(() => document.activeElement.textContent)));
}
