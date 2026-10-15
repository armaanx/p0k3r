// Design review screenshots of every screen (viewport-only, 1360x860, so images stay under 2000px).
// Usage: EXTRA_CHECKS=scripts/checks/shots.mjs node scripts/verify-file-url.mjs
export default async function ({ page, check, url }) {
  const base = url.split('#')[0];
  await page.setViewportSize({ width: 1360, height: 860 });
  await page.goto(base + '#/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/dark-welcome.png' });

  // Some progress: first lessons done, so the map, home and drills have content.
  const lessons = { 'm0-l1': { done: true, step: 0 }, 'm0-l2': { done: true, step: 0 }, 'm0-l3': { done: true, step: 0 }, 'm1-l1': { done: true, step: 0 } };
  await page.addInitScript((l) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('p0k3r.v1', JSON.stringify({ version: 1, firstRunDone: true, lessons: l, moduleTests: { 0: { best: 18, passed: true } }, settings: { botSpeed: 'fast', coach: 'full', thinkFirst: false }, srs: {}, attempts: [], hands: [], days: [], seenTerms: [], daily: {} }));
  }, lessons);
  await page.reload();

  // Play a few hands by keyboard so Review and Progress have data.
  await page.goto(base + '#/play');
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: /^Deal$/ }).click();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    if (await page.locator('.actionbar .btn').count()) await page.keyboard.press(i % 3 === 0 ? 'r' : 'c');
    if (await page.locator('.raise-panel').count()) await page.keyboard.press('Enter');
    if (await page.locator('button', { hasText: 'Deal next hand' }).count() && i % 7 === 6) await page.keyboard.press('n');
  }
  await page.goto(base + '#/play');
  await page.waitForTimeout(400);
  if (await page.locator('button', { hasText: /^Deal$/ }).count()) await page.locator('button', { hasText: /^Deal$/ }).click();
  await page.waitForSelector('.actionbar .btn', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/dark-play.png' });
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/dark-play-raise.png' });
  await page.keyboard.press('Escape');

  for (const [route, name] of [['#/', 'home'], ['#/learn', 'learn'], ['#/drills', 'drills'], ['#/review', 'review'], ['#/progress', 'progress'], ['#/reference', 'reference'], ['#/about', 'about']]) {
    await page.goto(base + route);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `shots/dark-${name}.png` });
  }
  // A hand in review
  await page.goto(base + '#/review');
  await page.waitForTimeout(300);
  if (await page.locator('.hand-row').count()) {
    await page.locator('.hand-row').first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'shots/dark-review-hand.png' });
  }
  // A lesson with a question answered
  await page.goto(base + '#/learn/m1-l1');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/dark-lesson.png' });
  // Drills: start mixed practice and answer one
  await page.goto(base + '#/drills');
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: 'Start mixed practice' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/dark-drill-q.png' });
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/dark-drill-a.png' });
  // Settings popover
  await page.goto(base + '#/play');
  await page.locator('button', { hasText: 'Display' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'shots/dark-settings.png' });
  check('screenshots taken', true);
}
