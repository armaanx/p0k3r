// M3 checks: worker is really used from file://, the UI stays responsive during heavy work, and the coach flow works end to end.
export default async function (ctx) {
  const { page, check, url } = ctx;
  await page.goto(url.split('#')[0] + '?debug#/play');
  await page.waitForSelector('.brand');
  const usingWorker = await page.evaluate(() => window.__p0k3r.coach.usingWorker);
  check('equity worker started from file://', usingWorker === true);

  // 1) Responsiveness: a long job in the worker must not block the main thread.
  const r = await page.evaluate(async () => {
    let last = performance.now();
    let maxGap = 0;
    const t = setInterval(() => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 10);
    const t0 = performance.now();
    const v = await window.__p0k3r.coach.burn(150_000_000);
    const dt = performance.now() - t0;
    clearInterval(t);
    return { maxGap, dt, ok: typeof v === 'number' };
  });
  check(`main thread stays responsive during worker job (${Math.round(r.dt)}ms job, max gap ${Math.round(r.maxGap)}ms)`, r.ok && r.dt > 300 && r.maxGap < 120, r);

  // 2) Real equity through the worker: AKs vs QQ is a coin flip (~46%).
  const eq = await page.evaluate(async () => {
    // ranges serialise as [label, weight] pairs; QQ as a one-hand range
    const hero = [12 * 4 + 3, 11 * 4 + 3]; // As Ks
    const res = await window.__p0k3r.coach.equity(hero, new Map([['QQ', 1]]), [], { iterations: 40000, seed: 5 });
    return res.equity;
  });
  check(`worker equity AKs vs QQ ≈ 46% (got ${(eq * 100).toFixed(1)}%)`, eq > 0.43 && eq < 0.49);

  // 3) Coach flow in the UI: Full coach, pause-and-think, commit, reveal, then act and get feedback.
  await page.goto(url.split('#')[0] + '#/play');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.coach .seg button', { hasText: 'Full' }).click();
  await page.locator('.side-drawer .seg button', { hasText: 'Fast' }).click();
  await page.locator('button', { hasText: /^Deal$/ }).click();
  await page.waitForSelector('.actionbar', { timeout: 15000 });
  await page.waitForSelector('text=Pause and think', { timeout: 15000 });
  check('coach hides the recommendation until the learner commits', (await page.locator('.coach-headline').count()) === 0);
  await page.locator('.commit-row button').first().click();
  await page.waitForSelector('.coach-headline');
  const head = await page.locator('.coach-headline').innerText();
  const tierTag = await page.locator('.coach .tag').first().innerText();
  check(`coach reveals recommendation after commit ("${head}", tier "${tierTag}")`, head.length > 0 && /math|standard|judgment/i.test(tierTag));
  check('comparison line shown', (await page.locator('.compare').count()) === 1);
  await page.keyboard.press('f');
  await page.waitForSelector('.last-decision', { timeout: 15000 });
  const chip = await page.locator('.verdict-chip').innerText();
  check(`decision feedback appears after acting (verdict: ${chip})`, /great|fine|inaccuracy|mistake|blunder/i.test(chip));
  // finish the hand and confirm the graded record is persisted
  for (let i = 0; i < 200 && (await page.locator('.result-card').count()) === 0; i++) await page.waitForTimeout(100);
  await page.waitForTimeout(800);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('p0k3r.v1') || '{}'));
  const hand = saved.hands && saved.hands[0];
  check('hand record saved with graded decisions and coach comparison', hand && hand.grades && hand.grades.length >= 1 && hand.coachCompare && hand.coachCompare.length === 1, hand && { grades: hand.grades?.length, compare: hand.coachCompare?.length });
  check('attempts recorded for spaced repetition', saved.attempts && saved.attempts.length >= 1);
  await hints(ctx);
}

// Hints level: a nudge, never the answer, until the learner asks.
export async function hints({ page, check, url }) {
  await page.goto(url.split('#')[0] + '#/play');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.coach .seg button', { hasText: 'Hints' }).click();
  await page.locator('.side-drawer .seg button', { hasText: 'Fast' }).click();
  await page.locator('button', { hasText: /^Deal$/ }).click();
  await page.waitForSelector('.nudge', { timeout: 15000 });
  check('hints level shows a nudge without the recommendation', (await page.locator('.coach-headline').count()) === 0);
  await page.locator('button', { hasText: "I'm stuck" }).click();
  await page.waitForSelector('.coach-headline');
  check('"I\'m stuck" reveals the advice', true);
}
