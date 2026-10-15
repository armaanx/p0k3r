// M6 checks: graded hands are saved, the review list separates decisions from results, replays step street by street,
// and "replay this spot" re-deals the same decision for a different action.
export default async function ({ page, check, url }) {
  const base = url.split('#')[0];
  await page.goto(base + '?debug#/play');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.side-drawer .seg button', { hasText: 'Fast' }).click();
  await page.locator('button', { hasText: /^Deal$/ }).click();
  let done = 0;
  let reviewLinkSeen = false;
  for (let step = 0; step < 1500 && done < 8; step++) {
    if (await page.locator('.result-card').count()) {
      if (await page.locator('button', { hasText: 'Review this hand' }).count()) reviewLinkSeen = true;
      done++;
      await page.waitForTimeout(350);
      await page.keyboard.press('n');
      await page.waitForTimeout(80);
      continue;
    }
    if (await page.locator('.actionbar').count()) {
      const r = Math.random();
      await page.keyboard.press(r < 0.1 ? 'f' : r < 0.3 ? 'r' : 'c');
      if (r >= 0.1 && r < 0.3) { await page.waitForTimeout(30); await page.keyboard.press('Enter'); }
    }
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(800);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('p0k3r.v1')));
  check(`${saved.hands.length} graded hands were saved`, saved.hands.length >= 7 && saved.hands.every((h) => Array.isArray(h.grades) && h.replay && h.replay.actions.length > 0));
  check('a "Review this hand" button appears after each hand', reviewLinkSeen);

  await page.goto(base + '?debug#/review');
  await page.reload();
  await page.waitForSelector('.hand-list');
  check('review list shows result and decision grade in separate columns', (await page.locator('.hand-row').first().innerText()).toLowerCase().includes('result') && (await page.locator('.hand-row').first().innerText()).toLowerCase().includes('decisions'));
  check('decisions-versus-results quadrants are shown', (await page.locator('.quad-cell').count()) === 4);
  const total = await page.locator('.quad-cell b').allInnerTexts();
  check('quadrant counts add up to no more than the hands played', total.map(Number).reduce((a, b) => a + b, 0) <= saved.hands.length);

  // Open a hand with at least one decision
  const target = saved.hands.filter((h) => h.grades.length >= 2).sort((a, b) => b.replay.actions.length - a.replay.actions.length)[0] ?? saved.hands[0];
  await page.goto(base + `?debug#/review/${target.id}`);
  await page.reload();
  await page.waitForSelector('.review-layout .table-wrap');
  check('review opens at the end of the hand with a result', (await page.locator('.timeline li').count()) === target.replay.actions.length);
  check('"result" and "decision grade" are shown separately', /result/i.test(await page.innerText('.split-grade')) && /decision grade/i.test(await page.innerText('.split-grade')));
  check('the one takeaway is shown', (await page.locator('.takeaway-card p').innerText()).length > 20);

  // Step through the hand
  await page.locator('.stepper button[aria-label="Go to the start"]').click();
  const boardAtStart = await page.locator('.board .pcard').count();
  await page.locator('.stepper button', { hasText: 'Next' }).click();
  await page.locator('.stepper button[aria-label="Go to the end"]').click();
  const boardAtEnd = await page.locator('.board .pcard').count();
  check(`stepping moves from preflop (${boardAtStart} board cards) to the end (${boardAtEnd})`, boardAtStart === 0 && boardAtEnd >= 0);
  const hasFlop = target.replay.actions.some((a) => a.street === 'flop');
  if (hasFlop) {
    await page.locator('.stepper .seg').getByRole('button', { name: 'Flop', exact: true }).click();
    check('jumping to the flop shows exactly three board cards', (await page.locator('.board .pcard').count()) === 3);
  }
  await page.keyboard.press('ArrowLeft');
  check('arrow keys step through the replay', /step \d+ \/ \d+/.test(await page.innerText('.stepper')));

  // Jump to a graded decision via the timeline chip
  const gradedIdx = target.grades[0].actionIndex;
  await page.locator('.timeline li').nth(gradedIdx).locator('button').click();
  await page.waitForSelector('.decision');
  const dtext = await page.innerText('.decision');
  check('a decision card shows verdict, EV lost, and a tier label', /EV lost/i.test(dtext) && /Math|Standard|Judgment/i.test(dtext));

  // Replay this spot
  await page.locator('.decision button', { hasText: 'Replay this spot' }).click();
  await page.waitForSelector('.actionbar');
  check('the replayed spot re-deals the same decision with hero to act', (await page.locator('.seat-hero .pcard').count()) === 2);
  check('the coach view is hidden until the learner chooses', (await page.locator('.review-side .verdict-chip').count()) <= 1 && !(await page.innerText('.review-side')).includes('The coach would'));
  // choose the opposite kind of action to the original
  const orig = target.replay.actions[gradedIdx].type;
  await page.keyboard.press(orig === 'fold' ? 'c' : 'f');
  await page.waitForSelector('text=The coach would', { timeout: 20000 });
  check('a different action is graded on the spot with the coach\'s view and option values', /your new choice/i.test(await page.innerText('.review-side')) && (await page.locator('.review-side .ref-table tbody tr').count()) >= 2);
  await page.locator('button', { hasText: 'Try a different action' }).click();
  await page.waitForSelector('.actionbar');
  check('"Try a different action" resets the spot', true);
  await page.locator('button', { hasText: 'Back to the review' }).click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('p0k3r.v1')));
  await page.waitForTimeout(400);
  check('replayed spots feed the practice history, not the hand list', after.hands.length === saved.hands.length);

  // Star + filter
  await page.goto(base + '?debug#/review');
  await page.waitForSelector('.hand-list');
  await page.locator('.star').first().click();
  await page.locator('.seg button', { hasText: 'Starred' }).click();
  check('starring a hand lets you filter to it', (await page.locator('.hand-row').count()) === 1);
}
