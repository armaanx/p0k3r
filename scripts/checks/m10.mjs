// M10: responsive layout on phones and tablets (touch emulation, portrait and landscape).
// For every route and viewport: no sideways scrolling, touch targets are big enough, the menu works,
// the table and its seats stay on screen and the play actions are reachable.
import { pathToFileURL } from 'node:url';

const ROUTES = ['/', '/learn', '/drills', '/play', '/review', '/progress', '/reference', '/about'];
const VIEWPORTS = [
  ['phone 390x844', 390, 844],
  ['small phone 360x640', 360, 640],
  ['phone landscape 844x390', 844, 390],
  ['tablet 820x1180', 820, 1180],
  ['tablet landscape 1180x820', 1180, 820],
];
const MIN_TARGET = 40; // CSS px (the design aims for 44; WCAG 2.2 AA requires 24)

export default async ({ page, check, url }) => {
  const browser = page.context().browser();
  for (const [name, width, height] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(String(e)));
    const narrow = width <= 960;

    for (const r of ROUTES) {
      await p.goto(url + '#' + r);
      await p.reload();
      await p.waitForTimeout(120);
      const res = await p.evaluate((minTarget) => {
        const de = document.documentElement;
        const over = de.scrollWidth - de.clientWidth;
        const small = [];
        const sel = 'button, a[href], select, input:not([type=hidden]):not([type=checkbox]):not([type=file]), [role="button"]';
        for (const el of document.querySelectorAll(sel)) {
          if (el.closest('p, li > span, .term, .skip-link, .rich')) continue;
          if (el.matches('li a') && !el.closest('nav')) continue;
          if (el.classList.contains('skip-link')) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const rc = el.getBoundingClientRect();
          if (rc.width === 0 || rc.height === 0) continue;
          // A nav link only counts once the menu is open (it is display:none when collapsed, handled above).
          if (rc.height < minTarget || rc.width < minTarget) small.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 24)} "${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 18)}" ${Math.round(rc.width)}x${Math.round(rc.height)}`);
        }
        const smallText = [...document.querySelectorAll('p, li, span, button, a, label')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3) && parseFloat(getComputedStyle(e).fontSize) < 10).length;
        return { over, small, smallText };
      }, MIN_TARGET);
      check(`${name}: no sideways scrolling on #${r}`, res.over <= 1, `scrollWidth exceeds viewport by ${res.over}px`);
      check(`${name}: touch targets are at least ${MIN_TARGET}px on #${r}`, res.small.length === 0, res.small.slice(0, 6));
      check(`${name}: no text under 10px on #${r}`, res.smallText === 0, `${res.smallText} elements`);
    }

    // Menu: collapsed behind a button on narrow screens, always open on wide ones.
    await p.goto(url + '#/');
    await p.reload();
    const toggle = p.locator('.nav-toggle');
    if (narrow) {
      check(`${name}: menu button is shown`, await toggle.isVisible());
      check(`${name}: links are hidden until the menu is opened`, !(await p.locator('.nav a').first().isVisible()));
      await toggle.click();
      check(`${name}: opening the menu shows all 8 links`, (await p.locator('.nav a:visible').count()) === 8);
      await p.locator('.nav a', { hasText: 'About' }).click();
      await p.waitForTimeout(120);
      check(`${name}: choosing a link navigates and closes the menu`, (await p.evaluate(() => location.hash)) === '#/about' && !(await p.locator('.nav a').first().isVisible()));
    } else {
      check(`${name}: menu button is hidden and links are inline`, !(await toggle.isVisible()) && (await p.locator('.nav a').first().isVisible()));
    }

    // Header never takes more than a third of a landscape phone.
    const headH = await p.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().height);
    check(`${name}: header is compact (${Math.round(headH)}px)`, headH <= Math.max(72, height * 0.2), `${headH}px`);

    // Play: table and seats fit the width, hero actions can be reached and used.
    await p.goto(url + '#/play');
    await p.reload();
    await p.getByRole('button', { name: 'Deal', exact: true }).click();
    await p.waitForFunction(() => document.querySelector('.actionbar'), null, { timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(200);
    const play = await p.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const seats = [...document.querySelectorAll('.table-wrap .seat')].map((s) => s.getBoundingClientRect());
      const offscreen = seats.filter((r) => r.left < -1 || r.right > w + 1).length;
      const wrap = document.querySelector('.table-wrap').getBoundingClientRect();
      const btns = [...document.querySelectorAll('.action-buttons .btn')].map((b) => b.getBoundingClientRect());
      return { seats: seats.length, offscreen, wrapW: wrap.width, w, btns: btns.length, btnOff: btns.filter((r) => r.left < -1 || r.right > w + 1).length };
    });
    check(`${name}: all ${play.seats} seats are on screen`, play.seats >= 6 && play.offscreen === 0, play);
    check(`${name}: table fits the screen width`, play.wrapW <= play.w + 1, play);
    check(`${name}: Fold / Call / Raise are on screen`, play.btns >= 2 && play.btnOff === 0, play);
    const fold = p.locator('.action-buttons .btn-fold');
    await fold.scrollIntoViewIfNeeded();
    const box = await fold.boundingBox();
    check(`${name}: action buttons are tall enough to tap`, !!box && box.height >= 44, box);
    // A raise can be opened, sized and cancelled with touch alone (no keyboard).
    const raise = p.locator('.action-buttons .btn-raise');
    if (await raise.count()) {
      await raise.tap();
      check(`${name}: raise panel opens`, await p.locator('.raise-panel').isVisible());
      check(`${name}: raise panel has a Cancel button`, await p.getByRole('button', { name: 'Cancel', exact: true }).isVisible());
      await p.getByRole('button', { name: 'Cancel', exact: true }).tap();
      check(`${name}: Cancel closes the raise panel`, !(await p.locator('.raise-panel').count()));
    }
    // Tap a hole card's glossary term in a lesson: the definition should appear (no hover on touch screens).
    await p.goto(url + '#/learn');
    await p.reload();
    await p.locator('.lesson-link:not([disabled])').first().tap();
    await p.waitForTimeout(300);
    const term = p.locator('.term').first();
    if (await term.count()) {
      await term.tap();
      const pop = term.locator('.term-pop');
      check(`${name}: tapping a glossary term shows its definition`, await pop.isVisible());
      const pr = await pop.boundingBox();
      check(`${name}: the definition stays inside the screen`, !!pr && pr.x >= -1 && pr.x + pr.width <= width + 1, pr);
    }
    check(`${name}: no script errors`, errors.length === 0, errors);
    await ctx.close();
  }
};
