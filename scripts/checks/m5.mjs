// M5 checks: drills screen, interleaved mixed practice, spaced-repetition review queue, calibration, leaks, coach fading.
async function answerSession(page, { wrongEvery = 0, confidence = 'Fairly sure', max = 60 }) {
  let n = 0;
  for (let guard = 0; guard < 600; guard++) {
    if (await page.locator('.outcome', { hasText: /Session complete/ }).count()) return n;
    if (await page.locator('.elab').count()) {
      if (await page.locator('.elab .choice:not([disabled])').count()) await page.locator('.elab .choice').first().click();
      else await page.locator('.elab button.btn-primary').click();
      continue;
    }
    if (await page.locator('.feedback').count()) { await page.keyboard.press('Enter'); await page.waitForTimeout(15); continue; }
    const conf = page.locator('.conf-row button', { hasText: confidence });
    if (await conf.count()) await conf.click();
    const st = await page.evaluate(() => ({ item: window.__p0k3r.item, quiz: window.__p0k3r.quiz }));
    const wrong = wrongEvery > 0 && n % wrongEvery === 0;
    n++;
    if (st.quiz) {
      const k = st.quiz.options.length;
      await page.locator('.choice').nth(wrong ? (st.quiz.correct + 1) % k : st.quiz.correct).click();
    } else if (st.item) {
      const it = st.item;
      if (it.input.kind === 'choice') {
        const k = it.input.options.length;
        await page.locator('.choice').nth(wrong ? [...Array(k).keys()].find((x) => !it.answer.includes(x)) : it.bestIndex).click();
      } else if (it.input.kind === 'slider') {
        await page.evaluate((v) => { const el = document.querySelector('input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }, wrong ? (it.answer[0] > 50 ? 5 : 95) : it.answer[0]);
        await page.locator('button', { hasText: 'Lock in my guess' }).click();
      } else {
        const picks = await page.evaluate(() => window.__p0k3r.bestPicks(window.__p0k3r.item));
        const use = wrong ? [0, 1, 2, 3, 4] : picks;
        for (const i of use) await page.locator('.pickcard').nth(i).click();
        await page.locator('button', { hasText: /Check my five/ }).click();
      }
    }
    await page.waitForTimeout(15);
    if (n > max) break;
  }
  return n;
}

export default async function ({ page, check, url }) {
  const base = url.split('#')[0];
  let seedN = 0;
  const seed = (p) => { const key = 'seeded' + (++seedN); return page.addInitScript(([json, k]) => { if (!sessionStorage.getItem(k)) { localStorage.setItem('p0k3r.v1', json); sessionStorage.setItem(k, '1'); } }, [JSON.stringify(p), key]); };
  const allLessons = ['m0-l1','m0-l2','m0-l3','m1-l1','m1-l2','m1-l3','m2-l1','m2-l2','m3-l1','m3-l2','m3-l3','m3-l4','m4-l1','m4-l2','m4-l3','m5-l1','m5-l2','m5-l3','m5-l4','m6-l1','m6-l2','m6-l3','m6-l4','m7-l1','m7-l2','m7-l3','m8-l1','m8-l2','m8-l3','m8-l4'];
  const lessons = Object.fromEntries(allLessons.map((k) => [k, { done: true }]));

  // Locked state
  await page.goto(base + '?debug#/drills');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('h1');
  check('drills are locked until the first drill lesson is done', /Drills unlock as you learn/.test(await page.innerText('main')));

  // Full unlock, mixed practice with calibration
  await seed({ firstRunDone: true, lessons });
  await page.goto(base + '?debug#/drills');
  await page.reload();
  await page.waitForSelector('.drill-grid');
  check('all 16 drill types appear as focused drills', (await page.locator('.drill-tile:not([disabled])').count()) === 16);
  await page.locator('button', { hasText: 'Start mixed practice' }).click();
  const types = new Set();
  await page.waitForSelector('.drill');
  // collect the prompt types while answering
  const promptSeen = [];
  for (let i = 0; i < 15; i++) {
    const it = await page.evaluate(() => window.__p0k3r.item || window.__p0k3r.quiz);
    promptSeen.push(it && it.type ? it.type : 'quiz');
    await answerOne(page);
  }
  async function answerOne(pg) {
    // answer a single question (always wrong, "Certain") then advance
    const conf = pg.locator('.conf-row button', { hasText: 'Certain' });
    if (await conf.count()) await conf.click();
    const st = await pg.evaluate(() => ({ item: window.__p0k3r.item, quiz: window.__p0k3r.quiz }));
    const it = st.item;
    if (it && it.input.kind === 'choice') {
      const k = it.input.options.length;
      await pg.locator('.choice').nth([...Array(k).keys()].find((x) => !it.answer.includes(x))).click();
    } else if (it && it.input.kind === 'slider') {
      await pg.evaluate((v) => { const el = document.querySelector('input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }, it.answer[0] > 50 ? 3 : 97);
      await pg.locator('button', { hasText: 'Lock in my guess' }).click();
    } else if (it) {
      for (const i of [0, 1, 2, 3, 4]) await pg.locator('.pickcard').nth(i).click();
      await pg.locator('button', { hasText: /Check my five/ }).click();
    }
    await pg.waitForSelector('.feedback');
    await pg.keyboard.press('Enter');
    await pg.waitForTimeout(40);
    if (await pg.locator('.elab').count()) { await pg.locator('.elab .choice').first().click(); await pg.locator('.elab button.btn-primary').click(); }
    await pg.waitForTimeout(20);
  }
  await page.waitForSelector('.outcome');
  check(`mixed practice interleaves many skills (${new Set(promptSeen).size} different types in 15 questions)`, new Set(promptSeen).size >= 7);
  check('session summary is shown with a per-concept breakdown', (await page.locator('.breakdown li').count()) >= 3);
  await page.locator('.outcome button', { hasText: 'Back to drills' }).click();

  // Missed items are scheduled soon; nav shows due count; calibration + leaks appear
  await page.waitForSelector('.drill-grid');
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('p0k3r.v1')));
  const missedSoon = Object.values(saved.srs).filter((i) => i.id.startsWith('s:') && i.lapses > 0 && i.due - Date.now() < 20 * 60 * 1000).length;
  check(`missed items are scheduled to return within minutes (${missedSoon} spots)`, missedSoon >= 5);
  check('every mixed-practice attempt was recorded with confidence and the mixed flag', saved.attempts.filter((a) => a.confidence === 3 && a.mixed).length >= 15);
  check('nav badge shows reviews due', (await page.locator('.due-dot').count()) === 1);
  check('calibration says overconfident after confident-and-wrong answers', /overconfident/i.test(await page.innerText('.calib')) );
  // A focused drill on one skill answered badly produces a named leak with advice and a lesson link.
  await page.locator('.drill-tile', { hasText: 'Pot odds' }).click();
  await page.waitForSelector('.drill');
  for (let i = 0; i < 10; i++) await answerOne(page);
  await page.waitForSelector('.outcome');
  await page.locator('.outcome button', { hasText: 'Back to drills' }).click();
  await page.waitForSelector('.drill-grid');
  const leakText = await page.innerText('main');
  check('a biggest leak is named in plain language, with a lesson to review', /Biggest leak/.test(leakText) && /Review the lesson/.test(leakText));

  // Review queue runs and the missed spots come back
  const startReview = page.locator('button', { hasText: 'Start review' });
  check('Today\'s review is enabled when items are due', await startReview.isEnabled());
  await startReview.click();
  await page.waitForSelector('.drill');
  const n = await answerSession(page, { max: 40 });
  check(`review session can be completed (${n} questions)`, await page.locator('.outcome', { hasText: /Session complete/ }).count() > 0);

  // Coach fading
  const good = (c) => Array.from({ length: 14 }, (_, i) => ({ t: Date.now() - (14 - i) * 1000, concept: c, spot: c, kind: 'x', correct: true }));
  const attempts = ['open-range', 'facing-raise', 'position', 'pot-odds', 'pot-odds-draws', 'betting', 'check-back', 'facing-3bet', 'short-stack'].flatMap(good);
  await seed({ firstRunDone: true, lessons, attempts, settings: { coach: 'full' } });
  await page.goto(base + '?debug#/play');
  await page.reload();
  await page.locator('button', { hasText: /^Deal$/ }).click();
  await page.waitForSelector('.actionbar', { timeout: 20000 });
  await page.waitForSelector('.coach-fade', { timeout: 20000 });
  check('the coach fades out when the learner has mastered the concept', /You've got this/.test(await page.innerText('.coach-fade')) && (await page.locator('.coach-headline').count()) === 0);
  await page.locator('.coach-fade button', { hasText: 'Show the coach anyway' }).click();
  await page.waitForSelector('text=Pause and think');
  check('"Show the coach anyway" brings the coach back', true);
}
