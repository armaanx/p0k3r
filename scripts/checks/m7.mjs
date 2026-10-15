// M7 checks: progress dashboard, daily loop, export → reset → import round trip (via real file download/upload on file://).
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default async function ({ page, check, url }) {
  const base = url.split('#')[0];
  const now = Date.now();
  const ids = ['m0-l1','m0-l2','m0-l3','m1-l1','m1-l2','m1-l3','m2-l1','m2-l2','m3-l1','m3-l2','m3-l3','m3-l4','m4-l1','m4-l2'];
  const lessons = Object.fromEntries(ids.map((k) => [k, { done: true, step: 0, completedAt: now - 86400000 * 3 }]));
  const attempts = [];
  for (let i = 0; i < 60; i++) attempts.push({ t: now - (60 - i) * 60000, concept: ['pot-odds', 'open-range', 'hand-rankings', 'outs'][i % 4], spot: ['odds:draw', 'open:UTG', 'rank:flush', 'outs:flush'][i % 4], kind: 'x', correct: i % 4 === 0 ? i % 8 === 0 : i % 9 !== 0, confidence: (i % 3) + 1 });
  const hands = [];
  for (let i = 0; i < 45; i++) hands.push({ id: `seed${i}`, t: now - (45 - i) * 1000, replay: { config: { numSeats: 6, sb: 50, bb: 100 }, stacks: Array(6).fill(10000), button: 0, seed: i + 1, actions: [] }, heroSeat: 0, archetypes: [null, 'tag', 'nit', 'lag', 'station', 'maniac'], net: i % 3 === 0 ? 300 : -200, bb: 100, evLostBB: (i % 5) * 0.8, grades: [{ street: 'flop', seat: 0, verdict: i % 7 === 0 ? 'mistake' : 'fine', evLostBB: (i % 5) * 0.8, tier: 'standard', concept: 'pot-odds', why: 'x. y.', actionIndex: 0 }] });
  const srs = {};
  srs['s:odds:draw'] = { id: 's:odds:draw', ease: 2.3, interval: 0, due: now, reps: 0, lapses: 2, box: 0, last: now };
  srs['c:pot-odds'] = { id: 'c:pot-odds', ease: 2.3, interval: 3, due: now + 2 * 86400000, reps: 2, lapses: 0, box: 2, last: now };
  const seedState = { firstRunDone: true, lessons, attempts, hands, srs, days: [new Date(now).toISOString().slice(0, 10)], moduleTests: { 0: { best: 1, passed: true, t: 1 }, 1: { best: 0.9, passed: true, t: 1 } } };
  await page.addInitScript((j) => { if (!sessionStorage.getItem('m7seed')) { localStorage.setItem('p0k3r.v1', j); sessionStorage.setItem('m7seed', '1'); } }, JSON.stringify(seedState));

  // ---- Home: daily loop ----
  await page.goto(base + '?debug#/');
  await page.reload();
  await page.waitForSelector('.today-card');
  const today = await page.innerText('.today-card');
  check('Home shows a guided daily loop of about 15 minutes', /about \d+ minutes/.test(today) && (await page.locator('.today-steps li').count()) >= 3);
  check('the daily loop includes review, play with coach, review one hand, and one new idea', /Warm up with review/.test(today) && /Play a few hands/.test(today) && /Review one hand/.test(today) && /Learn one new idea|Take the Module \d test/.test(today));
  check('the daily loop is never guilt-based', !/(lost|missed|broke|don.t lose|streak will|hurry|only \d+ (hours|minutes) left)/i.test(today));
  await page.locator('.today-card .btn-primary').click();
  check('the main button goes to the first unfinished step', /#\/drills$/.test(page.url()));

  // ---- Progress dashboard ----
  await page.goto(base + '?debug#/progress');
  await page.waitForSelector('.mastery-map');
  const txt = await page.innerText('main');
  check('"What to work on next" is in plain language with at most three items', (await page.locator('.next-list li').count()) >= 1 && (await page.locator('.next-list li').count()) <= 3);
  check('mastery map lists every concept with a symbol and a word (not colour alone)', (await page.locator('.mastery-map li').count()) >= 30 && (await page.locator('.mm-level').first().innerText()).length > 2);
  check('mistake-rate trend chart is drawn from graded hands', (await page.locator('svg[aria-label^="Mistake rate"]').count()) === 1);
  check('EV lost per 100 hands is shown separately from the chip result', /EV lost per 100 hands/i.test(txt) && /swings with luck/.test(txt));
  check('review schedule forecast covers 7 days', (await page.locator('.fc-col').count()) === 7);
  check('calibration chart and biggest leaks sections exist', (await page.locator('.calib').count()) === 1 && /Biggest leak/.test(txt));
  check('the streak copy is gentle', /Missing a day costs you nothing/.test(txt));

  // ---- Export → Reset → Import round trip ----
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('p0k3r.v1')));
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'Export progress' }).click()]);
  const dir = mkdtempSync(join(tmpdir(), 'p0k3r-'));
  const file = join(dir, download.suggestedFilename());
  await download.saveAs(file);
  const exported = JSON.parse(readFileSync(file, 'utf8'));
  check(`export downloads a JSON file (${download.suggestedFilename()})`, exported.app === 'p0k3r' && exported.data.hands.length === 45 && Object.keys(exported.data.lessons).length === ids.length);

  await page.locator('button', { hasText: 'Reset progress…' }).click();
  check('reset asks for confirmation and explains it cannot be undone', /cannot be undone/.test(await page.innerText('[aria-label="Confirm reset"]')));
  await page.locator('button', { hasText: 'Yes, reset everything' }).click();
  await page.waitForTimeout(500);
  const afterReset = await page.evaluate(() => JSON.parse(localStorage.getItem('p0k3r.v1') || 'null'));
  check('reset wipes lessons, hands and attempts', !afterReset || (Object.keys(afterReset.lessons).length === 0 && afterReset.hands.length === 0 && afterReset.attempts.length === 0));

  await page.locator('input[type=file]').setInputFiles(file);
  await page.waitForSelector('[aria-label="Confirm import"]');
  check('import previews what will be replaced before doing it', /45 saved hands/.test(await page.innerText('[aria-label="Confirm import"]')));
  await page.locator('button', { hasText: 'Replace with the file' }).click();
  await page.waitForTimeout(600);
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('p0k3r.v1')));
  check('import restores everything exactly', JSON.stringify(restored.lessons) === JSON.stringify(before.lessons) && restored.hands.length === 45 && restored.attempts.length === before.attempts.length && JSON.stringify(restored.srs) === JSON.stringify(before.srs));

  // bad file
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{"hello": "world"}');
  await page.locator('input[type=file]').setInputFiles(bad);
  await page.waitForSelector('[role=status].txt-bad');
  check('a wrong file is refused with a readable message', /does not look like a p0k3r progress export/.test(await page.innerText('[role=status].txt-bad')));
}
