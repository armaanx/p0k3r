import { describe, expect, it } from 'vitest';
import type { Attempt, HandRecord } from '../../state/types';
import { LEAKS, calibration, conceptStats, decisionVsResult, evLostPer100, leaks, mistakeTrend } from './analytics';

const at = (concept: string, correct: boolean, extra: Partial<Attempt> = {}): Attempt => ({ t: 1, concept, spot: concept, kind: 'x', correct, ...extra });
const many = (n: number, f: (i: number) => Attempt): Attempt[] => Array.from({ length: n }, (_, i) => f(i));

describe('concept stats', () => {
  it('aggregates accuracy per concept, folding in-hand aliases', () => {
    const s = conceptStats([at('pot-odds', true), at('pot-odds', false), at('facing-3bet', true), at('facing-raise', false)]);
    expect(s.find((x) => x.concept === 'pot-odds')!.acc).toBe(0.5);
    expect(s.find((x) => x.concept === 'facing-raise')!.n).toBe(2);
  });
});

describe('calibration', () => {
  it('needs enough ratings before judging', () => {
    expect(calibration([at('a', true, { confidence: 3 })]).verdict).toBe('unknown');
  });
  it('detects overconfidence: "Certain" but right only half the time', () => {
    const att = many(20, (i) => at('a', i % 2 === 0, { confidence: 3 }));
    const c = calibration(att);
    expect(c.verdict).toBe('overconfident');
    expect(c.confidentWrong).toBe(10);
    expect(c.message).toMatch(/overconfident/);
  });
  it('detects good calibration and underconfidence', () => {
    const good = [...many(10, (i) => at('a', i < 9, { confidence: 3 })), ...many(10, (i) => at('a', i < 7, { confidence: 2 }))];
    expect(calibration(good).verdict).toBe('well-calibrated');
    const under = many(20, (i) => at('a', i < 19, { confidence: 1 }));
    expect(calibration(under).verdict).toBe('underconfident');
  });
});

describe('calibration edge cases', () => {
  it('flags "Certain" answers that are wrong too often even when the average looks fine', () => {
    const att = [...many(20, (i) => at('a', i < 15, { confidence: 1 })), ...many(20, (i) => at('a', i < 14, { confidence: 2 })), ...many(20, (i) => at('a', i < 13, { confidence: 3 }))];
    const c = calibration(att);
    expect(c.verdict).toBe('overconfident');
    expect(c.message).toMatch(/65%/);
  });
  it('notices when confidence carries no information', () => {
    const att = [...many(20, (i) => at('a', i < 16, { confidence: 1 })), ...many(20, (i) => at('a', i < 15, { confidence: 2 })), ...many(20, (i) => at('a', i < 15, { confidence: 3 }))];
    expect(['uninformative', 'overconfident']).toContain(calibration(att).verdict);
  });
});

describe('leaks', () => {
  it('ranks concepts by real EV lost plus errors, and ignores mastered or tiny samples', () => {
    const att = [
      ...many(10, (i) => at('pot-odds-draws', i < 3, { kind: 'hand', evLostBB: i < 3 ? 0 : 3 })),
      ...many(10, (i) => at('open-range', i < 6)),
      ...many(10, () => at("outs", true)),
      ...many(2, () => at('spr', false)),
    ];
    const l = leaks(att);
    expect(l[0]!.concept).toBe('pot-odds-draws');
    expect(l[0]!.title).toMatch(/draws/);
    expect(l.map((x) => x.concept)).not.toContain('outs');
    expect(l.map((x) => x.concept)).not.toContain('spr');
    expect(l[0]!.lessonId).toBe('m5-l2');
  });
});

const hand = (net: number, verdicts: ('fine' | 'mistake')[], ev = 0): HandRecord => ({
  id: String(Math.random()), t: 1, replay: {} as never, heroSeat: 0, archetypes: [], net, bb: 100, evLostBB: ev,
  grades: verdicts.map((v) => ({ street: 'flop', seat: 0, verdict: v, evLostBB: v === 'mistake' ? 2 : 0, tier: 'standard', concept: 'x', why: '', actionIndex: 0 })),
});

describe('real-hand metrics', () => {
  it('EV lost per 100 hands', () => {
    const hs = Array.from({ length: 10 }, () => hand(0, ['fine'], 0.5));
    expect(evLostPer100(hs)).toBeCloseTo(50, 5);
    expect(evLostPer100(hs.slice(0, 2))).toBeNull();
  });
  it('mistake rate trend', () => {
    const hs = [...Array.from({ length: 20 }, () => hand(0, ['mistake'])), ...Array.from({ length: 20 }, () => hand(0, ['fine']))];
    const t = mistakeTrend(hs, 20);
    expect(t[0]!.rate).toBe(1);
    expect(t[t.length - 1]!.rate).toBe(0);
  });
  it('decision vs result quadrants: good decisions that lost, bad decisions that won', () => {
    const hs = [hand(-500, ['fine']), hand(400, ['mistake']), hand(300, ['fine']), hand(-200, ['mistake']), hand(0, ['fine'])];
    const q = decisionVsResult(hs);
    expect(q).toMatchObject({ goodLost: 1, poorWon: 1, goodWon: 1, poorLost: 1 });
  });
});


describe('leak advice wording', () => {
  it('states the split-pot and MDF rules precisely', () => {
    // A board of five cards only splits the pot when nobody's hole cards beat it.
    expect(LEAKS.ties!.advice).toMatch(/nobody can beat the five board cards/);
    // MDF uses the pot before the bet in both places.
    expect(LEAKS.mdf!.advice).toContain('pot before the bet ÷ (pot before the bet + bet)');
  });
});
