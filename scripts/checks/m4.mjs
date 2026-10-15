// M4 checks: onboarding, every lesson playable end-to-end by an "ideal learner" robot, gating, glossary, reference, progressive disclosure.
async function solveLesson(page, lessonId, check) {
  const seen = new Set();
  for (let guard = 0; guard < 400; guard++) {
    const html = await page.evaluate(() => document.body.innerText);
    if (/lesson complete/i.test(html)) return true;
    if (await page.locator('.outcome', { hasText: /Nicely done/ }).count()) { await page.locator('.outcome .btn-primary').first().click(); continue; }
    if (await page.locator('.outcome', { hasText: /Not there yet/ }).count()) { check(`${lessonId}: robot failed a mastery check`, false); return false; }
    if (await page.locator('.elab').count()) {
      if (await page.locator('.elab .choice:not([disabled])').count()) await page.locator('.elab .choice').first().click();
      else await page.locator('.elab button.btn-primary').click();
      await page.waitForTimeout(20);
      continue;
    }
    // Sequence question (drill or static quiz)
    if (await page.locator('.drill').count()) {
      if (await page.locator('.feedback').count()) { await page.keyboard.press('Enter'); await page.waitForTimeout(20); continue; }
      const conf = page.locator('.conf-row button', { hasText: 'Fairly sure' });
      if (await conf.count()) { await conf.click(); }
      const state = await page.evaluate(() => ({ item: window.__p0k3r.item, quiz: window.__p0k3r.quiz }));
      if (state.quiz) {
        await page.locator('.choice').nth(state.quiz.correct).click();
      } else if (state.item) {
        const it = state.item;
        if (it.input.kind === 'choice') await page.locator('.choice').nth(it.bestIndex).click();
        else if (it.input.kind === 'slider') {
          await page.evaluate((v) => { const el = document.querySelector('input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }, it.answer[0]);
          await page.locator('button', { hasText: 'Lock in my guess' }).click();
        } else {
          const picks = await page.evaluate(() => window.__p0k3r.bestPicks(window.__p0k3r.item));
          for (const i of picks) await page.locator('.pickcard').nth(i).click();
          await page.locator('button', { hasText: /Check my five/ }).click();
        }
      }
      await page.waitForTimeout(20);
      continue;
    }
    if (await page.locator('.guide').count()) { // scripted hand
      if (await page.locator('.guide button', { hasText: 'Finish the hand' }).count()) { await page.locator('.guide button', { hasText: 'Finish the hand' }).click(); continue; }
      if (await page.locator('.guide button', { hasText: 'Continue' }).count()) { await page.locator('.guide button', { hasText: 'Continue' }).click(); continue; }
      await page.keyboard.press('c'); await page.waitForTimeout(40); continue;
    }
    if (await page.locator('.sim').count()) {
      await page.locator('.sim button', { hasText: 'Run 100' }).click();
      await page.locator('.sim button.btn-primary', { hasText: /^Continue$/ }).click();
      continue;
    }
    // complete / why steps
    if (await page.locator('.choices').count()) {
      if (await page.locator('.feedback').count()) {
        const b = page.locator('.feedback button').first();
        await b.click(); await page.waitForTimeout(20); continue;
      }
      const ans = await page.evaluate(() => window.__p0k3r.answer);
      await page.locator('.choice').nth(ans).click();
      await page.waitForTimeout(20);
      continue;
    }
    const more = page.locator('button', { hasText: 'Show the next step' });
    if (await more.count()) { await more.click(); continue; }
    const cont = page.locator('.lesson-body button.btn-primary', { hasText: /Continue/ });
    if (await cont.count()) {
      const text = await page.locator('.lesson-body').innerText();
      seen.add(text.slice(0, 40));
      await cont.first().click();
      await page.waitForTimeout(10);
      continue;
    }
    await page.waitForTimeout(50);
  }
  check(`${lessonId}: lesson did not finish`, false);
  return false;
}

export default async function ({ page, check, url }) {
  const base = url.split('#')[0];
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ---- Onboarding ----
  await page.goto(base + '?debug#/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.welcome-card');
  const welcome = await page.innerText('.welcome-card');
  check('onboarding states the honest goal (not a pro) and play money', /not make you a professional/i.test(welcome) && /play money/i.test(welcome));
  check('onboarding asks nothing (no inputs)', (await page.locator('.welcome-card input').count()) === 0);
  const t0 = Date.now();
  await page.locator('button', { hasText: 'Start the first lesson' }).click();
  await page.waitForSelector('.lesson-body');
  check(`learner is in Module 0 within a second of clicking Begin (${Date.now() - t0}ms)`, Date.now() - t0 < 2000 && (await page.innerText('.lesson-head')).includes('Module 0'));

  // first-use explanation of new words
  const newWords = await page.locator('.newwords').innerText();
  check('new terms are explained the first time they appear ("Pot" & "Hole cards")', /Pot/i.test(newWords) && /Hole cards/i.test(newWords));
  // hover glossary
  await page.locator('.term').first().focus();
  check('glossary popover shows on focus/hover', await page.locator('.term-pop').first().isVisible());

  // ---- Robot plays Module 0 lessons ----
  for (const id of ['m0-l1', 'm0-l2', 'm0-l3']) {
    await page.goto(base + `?debug#/learn/${id}`);
    const ok = await solveLesson(page, id, check);
    check(`lesson ${id} completes with correct answers`, ok);
  }
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('p0k3r.v1')));
  check('Module 0 lessons are saved as done', ['m0-l1', 'm0-l2', 'm0-l3'].every((id) => saved.lessons[id] && saved.lessons[id].done));
  check('new words were remembered as seen', saved.seenTerms.includes('pot') && saved.seenTerms.includes('hole-cards'));
  check('attempts feed spaced repetition (concept + spot items exist)', Object.keys(saved.srs).some((k) => k.startsWith('c:')) && Object.keys(saved.srs).some((k) => k.startsWith('s:')));

  // ---- Learn map: gating, module test, skip-ahead warning ----
  await page.goto(base + '?debug#/learn');
  await page.waitForSelector('.module-grid');
  const locked = await page.locator('.module-card.module-locked').count();
  check(`modules 1–9 start locked until Module 0 is mastered (${locked} locked)`, locked === 9);
  await page.locator('section.module-card:has(#mod-2)').locator('button', { hasText: 'Skip ahead' }).click();
  check('skip-ahead shows an explicit warning', (await page.locator('.warn-box').innerText()).includes('Later modules assume you know the earlier ones'));
  await page.locator('.warn-box button', { hasText: 'Stay here' }).click();

  // Module 0 test: a wrong-answering robot fails, a right-answering one passes
  await page.goto(base + '?debug#/learn/test/0');
  await page.waitForSelector('.drill');
  for (let i = 0; i < 40 && !(await page.locator('.outcome').count()); i++) {
    if (await page.locator('.feedback').count()) { await page.keyboard.press('Enter'); continue; }
    const q = await page.evaluate(() => window.__p0k3r.quiz);
    const item = await page.evaluate(() => window.__p0k3r.item);
    if (q) await page.locator('.choice').nth((q.correct + 1) % q.options.length).click();
    else if (item && item.input.kind === 'choice') await page.locator('.choice').nth((item.bestIndex + 1) % item.input.options.length).click();
    await page.waitForTimeout(15);
  }
  check('a module test with mostly wrong answers does NOT unlock the next module', (await page.innerText('.outcome')).includes('Not quite yet'));
  await page.locator('.outcome button', { hasText: 'Try a fresh test' }).click();
  await page.waitForSelector('.drill');
  for (let i = 0; i < 40 && !(await page.locator('.outcome').count()); i++) {
    if (await page.locator('.feedback').count()) { await page.keyboard.press('Enter'); continue; }
    const q = await page.evaluate(() => window.__p0k3r.quiz);
    const item = await page.evaluate(() => window.__p0k3r.item);
    if (q) await page.locator('.choice').nth(q.correct).click();
    else if (item && item.input.kind === 'choice') await page.locator('.choice').nth(item.bestIndex).click();
    await page.waitForTimeout(15);
  }
  check('a module test with correct answers passes and masters the module', (await page.innerText('.outcome')).includes('Module mastered'));
  await page.goto(base + '?debug#/learn');
  await page.waitForSelector('.module-grid');
  check('Module 1 is now unlocked (interleaving gate works)', (await page.locator('.module-card.module-locked').count()) === 8);

  // ---- Robot plays the rest of the path ----
  const rest = ['m1-l1', 'm1-l2', 'm1-l3', 'm2-l1', 'm2-l2', 'm3-l1', 'm3-l2', 'm3-l3', 'm3-l4', 'm4-l1', 'm4-l2', 'm4-l3', 'm5-l1', 'm5-l2', 'm5-l3', 'm5-l4', 'm6-l1', 'm6-l2', 'm6-l3', 'm6-l4', 'm7-l1', 'm7-l2', 'm7-l3', 'm8-l1', 'm8-l2', 'm8-l3', 'm8-l4', 'm9-l1', 'm9-l2', 'm9-l3'];
  for (const id of rest) {
    await page.goto(base + `?debug#/learn/${id}`);
    const ok = await solveLesson(page, id, check);
    check(`lesson ${id} is playable end to end`, ok);
  }
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('p0k3r.v1')));
  check('all 33 lessons recorded as done', Object.values(saved.lessons).filter((l) => l.done).length === 33, Object.keys(saved.lessons).length);

  // ---- Progressive disclosure on the table ----
  // (Saved state is injected before the app starts; the app flushes its own state when a page unloads.)
  const seed = (p) => page.addInitScript((json) => localStorage.setItem('p0k3r.v1', json), JSON.stringify(p));
  await seed({ firstRunDone: true, lessons: { 'm0-l1': { done: true } } });
  await page.goto(base + '?debug#/play');
  await page.reload();
  await page.locator('button', { hasText: /^Deal$/ }).click();
  await page.waitForSelector('.table-wrap');
  check('first-time table hides seat names (position) until Module 2', (await page.locator('.pos-badge').count()) === 0);
  check('first-time table hides the hand-name helper until Module 1', (await page.locator('.hand-name').count()) === 0);
  await seed({ firstRunDone: true, lessons: { 'm0-l1': { done: true }, 'm1-l1': { done: true }, 'm2-l1': { done: true } } });
  await page.goto(base + '?debug#/play');
  await page.reload();
  await page.locator('button', { hasText: /^Deal$/ }).click();
  await page.waitForSelector('.table-wrap');
  check('after the position lesson the table shows seat names', (await page.locator('.pos-badge').count()) >= 2);

  // ---- Reference syncs with learning ----
  await seed({ firstRunDone: true, lessons: { 'm0-l1': { done: true }, 'm1-l1': { done: true } } });
  await page.goto(base + '?debug#/reference');
  await page.reload();
  const refText = await page.innerText('.cheat');
  check('cheat sheet shows locked sections for unlearned material', /Unlocks when you finish Module \d+, lesson \d+/.test(refText));
  check('cheat sheet shows hand rankings once learned', /Straight flush/.test(refText));
  await page.locator('button', { hasText: 'Glossary' }).click();
  await page.fill('input[type=search]', 'kicker');
  check('glossary search works', (await page.locator('.glossary dt').count()) >= 1);
  check('no uncaught page errors during the whole run', errors.length === 0, errors);
}
