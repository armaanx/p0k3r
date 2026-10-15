// M9: About page content + full keyboard/a11y spot checks.
export default async ({ page, check, url }) => {
  await page.goto(url + '#/about');
  await page.waitForSelector('.about');
  const txt = (await page.innerText('.about')).toLowerCase();
  check('About states the honest goal (not a pro)', /solid, disciplined low-stakes/.test(txt) && /does not turn anyone into a professional/.test(txt));
  check('About says postflop advice is heuristic, not solver-level', /not a solver/.test(txt) && /not solver-level/.test(txt));
  check('About explains the three confidence tiers', /math \(exact\)/.test(txt) && /standard play/.test(txt) && /judgment call \(reasonable players differ\)/.test(txt));
  check('About has what to study next', /what to study after/.test(txt));
  check('About mentions play money + offline + OFL fonts', /play money/.test(txt) && /no network/.test(txt) && /open font license/.test(txt));
  check('About nav link is marked current', (await page.locator('nav a[aria-current="page"]').innerText()).trim() === 'About');

  // a11y: every button / link has an accessible name on each route
  for (const r of ['/', '/learn', '/drills', '/play', '/review', '/progress', '/reference', '/about']) {
    await page.goto(url + '#' + r);
    await page.waitForTimeout(250);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, a[href], input, select, [role="button"]')) {
        const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.labels?.[0]?.innerText || el.getAttribute('placeholder') || '').trim();
        if (!name) out.push(el.outerHTML.slice(0, 80));
      }
      return out;
    });
    check(`accessible names present on ${r}`, bad.length === 0, bad.join(' | '));
    const h1 = await page.locator('h1').count();
    check(`${r} has a heading`, h1 >= 1 || r === '/play' || r === '/');
  }

  // Keyboard-only focus visibility: tab through nav, focused element must have a visible outline/box-shadow
  await page.goto(url + '#/about');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const vis = await page.evaluate(() => {
    const el = document.activeElement; if (!el) return 'none';
    const cs = getComputedStyle(el);
    return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' ? 'ok' : 'invisible';
  });
  check('focused element shows a visible focus indicator', vis === 'ok', vis);
};
