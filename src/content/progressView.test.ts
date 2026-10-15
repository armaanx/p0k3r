import { describe, expect, it } from 'vitest';
import { recordSrs } from '../engine/learning/srs';
import { freshProgress, type Attempt, type HandRecord, type Progress } from '../state/types';
import { dayKey } from '../state/actions';
import { LESSONS, MODULES } from './curriculum';
import { dailyPlan, forecast, handsToday, markDaily, masteryMap, whatNext } from './progressView';

const att = (concept: string, correct: boolean, t = Date.now(), spot = concept): Attempt => ({ t, concept, spot, kind: 'x', correct });
const hand = (t: number, ev = 1): HandRecord => ({ id: `h${t}${ev}`, t, replay: {} as never, heroSeat: 0, archetypes: [], net: 0, bb: 100, evLostBB: ev, grades: [{ street: 'flop', seat: 0, verdict: 'fine', evLostBB: ev, tier: 'math', concept: 'x', why: '', actionIndex: 0 }] });
const allDone = (): Progress => { const p = freshProgress(); for (const l of LESSONS) p.lessons[l.id] = { done: true, step: 0, completedAt: 1 }; return p; };

describe('mastery map', () => {
  it('has a row for every concept in every module and classifies by accuracy', () => {
    const p = freshProgress();
    for (let i = 0; i < 10; i++) p.attempts.push(att('pot-odds', true), att('outs', i < 2), att('position', i < 6));
    const rows = masteryMap(p);
    expect(rows.length).toBe(MODULES.reduce((a, m) => a + m.concepts.length, 0));
    const lvl = (c: string): string => rows.find((r) => r.concept === c)!.level;
    expect(lvl('pot-odds')).toBe('mastered');
    expect(lvl('outs')).toBe('shaky');
    expect(lvl('position')).toBe('learning');
    expect(lvl('spr')).toBe('new');
  });
});

describe('review forecast', () => {
  it('counts spots due today (incl. just missed) and on later days', () => {
    const now = new Date(2026, 0, 10, 12, 0, 0).getTime();
    let srs = recordSrs({}, att('a', true, now - 2 * 86_400_000, 'a'));
    srs = recordSrs(srs, att('b', false, now, 'b'));
    srs = recordSrs(srs, att('c', true, now, 'c'));
    const f = forecast(srs, now, 7);
    expect(f[0]!.label).toBe('Today');
    expect(f[0]!.count).toBe(2); // 'a' overdue + 'b' just missed
    expect(f[1]!.count).toBe(1); // 'c' tomorrow
    expect(f.reduce((x, y) => x + y.count, 0)).toBe(3);
  });
});

describe('what to work on next', () => {
  it('starts a brand-new learner at Module 0, and prioritises review and leaks after that', () => {
    expect(whatNext(freshProgress())[0]!.to).toBe('/learn/m0-l1');
    const p = allDone();
    for (let i = 0; i < 12; i++) p.attempts.push(att('pot-odds-draws', i < 3, Date.now(), 'x'));
    p.srs = recordSrs(p.srs, att('pot-odds', false, Date.now(), 'odds:draw'));
    const s = whatNext(p);
    expect(s[0]!.title).toMatch(/review/i);
    expect(s.some((x) => /draws without the right price/.test(x.title))).toBe(true);
    expect(s.length).toBeLessThanOrEqual(3);
  });
});

describe('daily session', () => {
  it('offers only steps that make sense yet and never scolds', () => {
    const fresh = dailyPlan(freshProgress());
    expect(fresh.steps.map((s) => s.id)).toEqual(['learn']);
    const p = allDone();
    p.hands.push(hand(Date.now()));
    const plan = dailyPlan(p);
    expect(plan.steps.map((s) => s.id)).toEqual(['warmup', 'play', 'review', 'learn']);
    expect(plan.steps.every((s) => !/missed|lost|streak/i.test(s.detail))).toBe(true);
  });
  it('when all lessons of the open module are done, the "new idea" step is its test', () => {
    const p = allDone();
    const step = dailyPlan(p).steps.find((s) => s.id === 'learn');
    expect(step?.title).toMatch(/Take the Module \d+ test/);
    expect(step?.to).toMatch(/^\/learn\/test\/\d$/);
  });
  it('tracks progress through the loop', () => {
    const now = Date.now();
    let p = allDone();
    for (let i = 0; i < 5; i++) p.hands.push(hand(now - i, i));
    expect(handsToday(p, now)).toBe(5);
    p = markDaily(p, 'warmup', now);
    p = markDaily(p, 'review', now);
    const plan = dailyPlan(p, now);
    expect(plan.steps.find((s) => s.id === 'play')!.done).toBe(true);
    expect(plan.steps.find((s) => s.id === 'warmup')!.done).toBe(true);
    expect(plan.steps.find((s) => s.id === 'review')!.to).toContain('/review/');
    expect(p.daily[dayKey(now)]!.warmup).toBe(true);
  });
  it('suggests the hand that lost the most value for the in-depth review', () => {
    const now = Date.now();
    const p = allDone();
    p.hands.push(hand(now, 0.5), hand(now - 5, 9), hand(now - 9, 2));
    const review = dailyPlan(p, now).steps.find((s) => s.id === 'review')!;
    expect(review.to).toBe(`/review/${p.hands[1]!.id}`);
  });
});
