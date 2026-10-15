import { describe, expect, it } from 'vitest';
import { cardsToString, parseCards } from '../cards';
import { Category, bestFive, categoryOf, CATEGORY_NAMES, evaluate } from '../evaluator';
import { equityVsHand } from '../equity';
import { findOuts } from '../outs';
import { DEFEND_SPECS, TIER_BLURBS, TIER_NAMES, defendRanges_, openRange, openVerdict, positionOf, tierOf, type Position } from '../preflopCharts';
import { createRng } from '../rng';
import { classifyBoard } from '../texture';
import {
  ALL_DRILL_TYPES, CLASSIC_MATCHUPS, DRILL_MODULE, comparisonOrder, containsCategory, drillTypesForModule, explainWinner, facingRaisePrice, generateDrill, gradeDrill, textureFacts,
} from './drills';
import type { DrillItem, DrillType } from './types';

const N = 120;

describe('drill generators: structure', () => {
  for (const type of ALL_DRILL_TYPES) {
    it(`${type}: every item is well-formed at every difficulty`, () => {
      for (const d of [1, 2, 3] as const) {
        const rng = createRng(100 + d);
        for (let i = 0; i < N; i++) {
          const it = generateDrill(type, rng, d);
          expect(it.type).toBe(type);
          expect(it.module).toBe(DRILL_MODULE[type]);
          expect(it.prompt.length).toBeGreaterThan(10);
          expect(it.explanation.length).toBeGreaterThan(10);
          expect(it.explanation.length).toBeLessThan(560); // short, not a wall of text
          expect(it.concept).toBeTruthy();
          expect(it.spot).toBeTruthy();
          if (it.input.kind === 'choice') {
            const opts = it.input.options;
            expect(opts.length).toBeGreaterThanOrEqual(2);
            expect(new Set(opts.map((o) => o.toLowerCase())).size).toBe(opts.length);
            expect(it.answer.length).toBeGreaterThan(0);
            for (const a of it.answer) expect(a >= 0 && a < opts.length).toBe(true);
            expect(it.answer).toContain(it.bestIndex);
            for (const k of Object.keys(it.wrong)) expect(Number(k) < opts.length).toBe(true);
            // Grading agrees with the stored answer
            expect(gradeDrill(it, it.bestIndex).correct).toBe(true);
            opts.forEach((_, j) => { if (!it.answer.includes(j)) expect(gradeDrill(it, j).correct).toBe(false); });
          } else if (it.input.kind === 'slider') {
            expect(it.answer[0]).toBeGreaterThanOrEqual(0);
            expect(it.answer[0]).toBeLessThanOrEqual(100);
            expect(gradeDrill(it, it.answer[0]!).correct).toBe(true);
          } else {
            expect(it.input.pool).toHaveLength(7);
            expect(new Set(it.input.pool).size).toBe(7);
            expect(it.bestScore).toBe(bestFive(it.input.pool).score);
            const best = bestFive(it.input.pool).cards;
            const idx = best.map((c) => (it.input as { pool: number[] }).pool.indexOf(c));
            expect(gradeDrill(it, idx).correct).toBe(true);
          }
        }
      }
    });
  }

  it('is deterministic for a given seed', () => {
    for (const type of ALL_DRILL_TYPES) {
      const a = generateDrill(type, createRng(7), 2);
      const b = generateDrill(type, createRng(7), 2);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('every module 1–8 has at least one drill type', () => {
    for (let m = 1; m <= 8; m++) expect(drillTypesForModule(m).length).toBeGreaterThan(0);
  });
});

describe('drill generators: answers are independently correct', () => {
  it('hand-category', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const it = generateDrill('hand-category', rng, rng.pick([1, 2] as const));
      const cards = [...(it.visual.hole ?? []), ...(it.visual.board ?? [])];
      const cat = categoryOf(bestFive(cards).score);
      expect(it.input.kind === 'choice' && it.input.options[it.answer[0]!]).toBe(CATEGORY_NAMES[cat]);
    }
  });

  it('rank-winner: outcome matches the evaluator, and difficulty 3 includes ties', () => {
    const rng = createRng(2);
    let ties = 0;
    for (let i = 0; i < 200; i++) {
      const it = generateDrill('rank-winner', rng, 3);
      const [a, b] = it.visual.hands!;
      const sa = evaluate([...a!.cards, ...it.visual.board!]);
      const sb = evaluate([...b!.cards, ...it.visual.board!]);
      const expected = sa === sb ? 2 : sa > sb ? 0 : 1;
      expect(it.answer).toEqual([expected]);
      if (expected === 2) ties++;
    }
    expect(ties).toBeGreaterThan(20);
  });

  it('position-name matches positionOf', () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) {
      const it = generateDrill('position-name', rng, 1);
      const seats = it.visual.seats!;
      const hero = seats.findIndex((s) => s.hero);
      const button = seats.findIndex((s) => s.button);
      expect(it.input.kind === 'choice' && it.input.options[it.answer[0]!]).toBe(positionOf(hero, button, 6));
    }
  });

  it('open-fold follows the chart and is balanced raise/fold', () => {
    const rng = createRng(4);
    let raises = 0;
    for (let i = 0; i < 300; i++) {
      const it = generateDrill('open-fold', rng, rng.pick([1, 2, 3] as const));
      const pos = /in (\w+)\./.exec(it.prompt)![1] as 'UTG';
      const label = it.visual.grid!.focus!;
      const v = openVerdict(pos, label);
      expect(it.bestIndex).toBe(v.action === 'raise' ? 0 : 1);
      if (v.action === 'raise') raises++;
      if (v.marginal) expect(it.answer).toEqual([0, 1]);
    }
    expect(raises).toBeGreaterThan(90);
    expect(raises).toBeLessThan(210);
  });

  it('outs: the stated answer equals the number of highlighted out cards', () => {
    const rng = createRng(5);
    for (let i = 0; i < 150; i++) {
      const it = generateDrill('outs', rng, rng.pick([1, 2, 3] as const));
      const text = it.input.kind === 'choice' ? it.input.options[it.answer[0]!] : '';
      expect(Number(text)).toBe(it.visual.highlight!.length);
    }
  });

  it('outs: textbook counts for classic draws (all outs, clean or risky, below difficulty 3)', () => {
    const rng = createRng(6);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const it = generateDrill('outs', rng, 2);
      const n = it.visual.highlight!.length;
      if (it.spot === 'outs:flush') { expect(n).toBe(9); seen.add('flush'); }
      if (it.spot === 'outs:oesd') { expect(n).toBe(8); seen.add('oesd'); }
      if (it.spot === 'outs:dgut') { expect(n).toBe(8); seen.add('dgut'); }
      if (it.spot === 'outs:gutshot') { expect(n).toBe(4); seen.add('gutshot'); }
      if (it.spot === 'outs:overcards') { expect(n).toBe(6); seen.add('overcards'); }
    }
    expect(seen.size).toBe(5);
  });

  it('pot-odds: the keyed answer matches independent arithmetic', () => {
    const rng = createRng(8);
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const it = generateDrill('pot-odds', rng, rng.pick([1, 2, 3] as const));
      const m = /pot is ([\d,]+)\. Your opponent bets ([\d,]+)\. You estimate a (\d+)%/.exec(it.prompt);
      if (m) {
        const pot = Number(m[1]!.replace(/,/g, ''));
        const bet = Number(m[2]!.replace(/,/g, ''));
        const p = Number(m[3]) / 100;
        const call = p > bet / (pot + 2 * bet);
        expect(it.answer).toEqual([call ? 0 : 1]);
        checked++;
      }
      const t = /pot is ([\d,]+) and your opponent bets ([\d,]+)\. You have (\d+) outs/.exec(it.prompt);
      if (t) {
        const pot = Number(t[1]!.replace(/,/g, ''));
        const bet = Number(t[2]!.replace(/,/g, ''));
        const outs = Number(t[3]);
        expect(it.answer).toEqual([outs * 2 / 100 > bet / (pot + 2 * bet) ? 0 : 1]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('equity-guess: the keyed truth is within 2 points of an independent high-precision calculation', () => {
    const rng = createRng(9);
    for (let i = 0; i < 25; i++) {
      const it = generateDrill('equity-guess', rng, rng.pick([2, 3] as const));
      const hero = it.visual.hole as [number, number];
      const vil = it.visual.hands![0]!.cards as [number, number];
      const exact = equityVsHand(hero, vil, it.visual.board!, { exactLimit: 5_000_000 });
      expect(Math.abs(exact.equity * 100 - it.answer[0]!)).toBeLessThanOrEqual(1.01);
    }
  });

  it('classic preflop matchups use exact values (AKs vs QQ 46.2, AA vs KK 81.9, 72o vs AA 12.6)', () => {
    const get = (a: string, b: string): number => CLASSIC_MATCHUPS.find((m) => m.a === a && m.b === b)!.equity;
    expect(get('AsKs', 'QhQd').toFixed(1)).toBe('46.2');
    expect(get('AsKd', 'QhQc').toFixed(1)).toBe('42.8');
    expect(get('AhKc', '2s2d').toFixed(1)).toBe('47.0');
    expect(get('7h2c', 'AsAd').toFixed(1)).toBe('12.6');
    expect(get('AsKd', 'AhQc').toFixed(1)).toBe('74.0');
    expect(get('AsAd', 'KhKd').toFixed(1)).toBe('81.9');
    // One full enumeration (1,712,304 boards) to confirm the stored table.
    const [a, b] = [parseCards('As Ad') as [number, number], parseCards('Kh Kd') as [number, number]];
    const r = equityVsHand(a, b, [], { exactLimit: 2_000_000 });
    expect(r.exact).toBe(true);
    expect(r.equity * 100).toBeCloseTo(get('AsAd', 'KhKd'), 2);
    const rng = createRng(10);
    for (let i = 0; i < 60; i++) {
      const it = generateDrill('equity-guess', rng, 1);
      const m = CLASSIC_MATCHUPS.find((x) => x.a === cardsToString(it.visual.hole!).replace(' ', '') && x.b === cardsToString(it.visual.hands![0]!.cards).replace(' ', ''))!;
      expect(it.answer[0]).toBe(Math.round(m.equity));
    }
  });

  it('bet-size: dry boards accept small bets, wet boards accept large bets', () => {
    const rng = createRng(11);
    for (let i = 0; i < 100; i++) {
      const it = generateDrill('bet-size', rng, 2);
      if (it.spot === 'size:dry') expect(it.answer).toContain(0);
      if (it.spot === 'size:wet') expect(it.answer).toContain(2);
    }
  });

  it('generation is fast enough for a 10-second drill cadence', () => {
    const rng = createRng(12);
    for (const type of ALL_DRILL_TYPES) {
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) generateDrill(type, rng, 3);
      expect((performance.now() - t0) / 20).toBeLessThan(120);
    }
  });
});

describe('gradeDrill feedback', () => {
  it('wrong choices get targeted feedback plus the explanation', () => {
    const rng = createRng(13);
    const it: DrillItem = generateDrill('hand-category', rng, 1);
    const wrongIdx = (it.input as { options: string[] }).options.findIndex((_, j) => !it.answer.includes(j));
    const g = gradeDrill(it, wrongIdx);
    expect(g.correct).toBe(false);
    expect(g.feedback).toContain(it.explanation);
    expect(g.feedback.length).toBeGreaterThan(it.explanation.length);
  });
});

describe('drill text regressions', () => {
  it('player-type stats never show PFR above VPIP (every raise also counts as VPIP)', () => {
    for (const d of [1, 3] as const) {
      const rng = createRng(4242 + d);
      for (let i = 0; i < 1500; i++) {
        const st = generateDrill('player-type', rng, d).visual.stats!;
        expect(st.pfr!).toBeLessThanOrEqual(st.vpip!);
      }
    }
  });

  it('a trips flop is described as three of a kind, not "a pair"', () => {
    const facts = textureFacts(classifyBoard(parseCards('7h 7s 7c')));
    expect(facts.join(' ')).toMatch(/three cards of the same rank/);
    expect(facts.join(' ')).not.toMatch(/a pair|straight draws/);
    expect(textureFacts(classifyBoard(parseCards('7h 7s Kc'))).join(' ')).toMatch(/a pair \(fewer possible draws\)/);
  });

  it('made-hand explanations name the best five cards grammatically', () => {
    const rng = createRng(77);
    let seen = 0;
    for (let i = 0; i < 300; i++) {
      const it = generateDrill('made-draw-air', rng, 2);
      if (it.answer[0] !== 0) continue;
      seen++;
      expect(it.explanation).toMatch(/Your best five cards: [A-Z]/);
      expect(it.explanation).not.toMatch(/cards make/);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('teaching text: known spots', () => {
  const c = (s: string): number[] => parseCards(s);

  it('rank-winner compares pairs before kickers (5 5 A Q 6 beats 4 4 A Q 9)', () => {
    const ex = explainWinner(c('4c 9h'), c('5d 6c'), c('4s Ad Qh 5s 3s'));
    expect(ex.outcome).toBe('B');
    expect(ex.text).toContain('Player B has 5 5 A Q 6 and Player A has 4 4 A Q 9');
    expect(ex.text).toContain('The first difference is 5 versus 4 (the pair)');
  });

  it('rank-winner: in the wheel the ace counts low', () => {
    const ex = explainWinner(c('5c Kd'), c('6d 5h'), c('As 2d 3c 4h 9s'));
    expect(ex.outcome).toBe('B');
    expect(ex.text).toContain('Player B has 6 5 4 3 2 and Player A has 5 4 3 2 A');
    expect(ex.text).toContain('6 versus 5');
  });

  it('rank-winner: tie text mentions the board only when the board plays', () => {
    const bp = explainWinner(c('2c 3d'), c('2h 3s'), c('As Ks Qd Jh Tc'));
    expect(bp.outcome).toBe('T');
    expect(bp.text).toMatch(/board plays/);
    const same = explainWinner(c('Tc 2d'), c('Th 3s'), c('As Ks Qd 7h 4c'));
    expect(same.outcome).toBe('T');
    expect(same.text).not.toMatch(/board/);
  });

  it('comparisonOrder puts groups first and the wheel ace last', () => {
    expect(comparisonOrder(c('Ks 9d 9h Kc 2s'))).toEqual([11, 11, 7, 7, 0]);
    expect(comparisonOrder(c('As 2d 3c 4h 5s'))).toEqual([3, 2, 1, 0, 12]);
    expect(comparisonOrder(c('7s 7d 7h 2c 2s'))).toEqual([5, 5, 5, 0, 0]);
  });

  it('containsCategory sees the lower hands inside a better one', () => {
    expect(containsCategory(c('7s 7d 7h 2c 2s'), Category.Pair)).toBe(true);
    expect(containsCategory(c('7s 7d 7h 2c 2s'), Category.TwoPair)).toBe(true);
    expect(containsCategory(c('7s 7d 7h 7c 2s'), Category.TwoPair)).toBe(false);
    expect(containsCategory(c('As Ks 9s 5s 2s'), Category.Straight)).toBe(false);
  });

  it('facing-raise price counts only the blinds that are not part of the raise', () => {
    expect(facingRaisePrice('BB', 'HJ', 250)).toEqual({ toCall: 150, pot: 400 });
    expect(facingRaisePrice('BB', 'SB', 250)).toEqual({ toCall: 150, pot: 350 });
    expect(facingRaisePrice('SB', 'BTN', 300)).toEqual({ toCall: 250, pot: 450 });
    expect(facingRaisePrice('CO', 'UTG', 250)).toEqual({ toCall: 250, pot: 400 });
  });

  it('tier-place uses the shared tier names and blurbs', () => {
    const rng = createRng(21);
    for (let i = 0; i < 60; i++) {
      const it = generateDrill('tier-place', rng, 1);
      const t = tierOf(it.visual.note!);
      expect((it.input as { options: string[] }).options[it.answer[0]!]).toBe(TIER_NAMES[t]);
      expect(it.explanation).toContain(TIER_BLURBS[t]);
    }
  });
});

// ---------------------------------------------------------------------------
// Independent re-verification: own 5-card evaluator, own outs recount, own chart neighbours.
// ---------------------------------------------------------------------------

const R = (c: number): number => c >> 2;
const S = (c: number): number => c & 3;
const RC = '23456789TJQKA';
const NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const PLURALS = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
const deck = (): number[] => Array.from({ length: 52 }, (_, i) => i);
type Ev = { cat: number; tb: number[]; key: number };

function ev5(cs: readonly number[]): Ev {
  const rs = cs.map(R).sort((a, b) => b - a);
  const flush = cs.every((x) => S(x) === S(cs[0]!));
  const uniq = [...new Set(rs)];
  let sh = -1;
  if (uniq.length === 5) {
    if (uniq[0]! - uniq[4]! === 4) sh = uniq[0]!;
    else if (uniq[0] === 12 && uniq[1] === 3 && uniq[4] === 0) sh = 3;
  }
  const cnt = new Map<number, number>();
  for (const r of rs) cnt.set(r, (cnt.get(r) ?? 0) + 1);
  const g = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const order = g.flatMap(([r, n]) => Array(n).fill(r) as number[]);
  let cat: number;
  let tb: number[];
  if (flush && sh >= 0) { cat = 8; tb = [sh]; }
  else if (g[0]![1] === 4) { cat = 7; tb = [g[0]![0], g[1]![0]]; }
  else if (g[0]![1] === 3 && g[1]![1] === 2) { cat = 6; tb = [g[0]![0], g[1]![0]]; }
  else if (flush) { cat = 5; tb = rs; }
  else if (sh >= 0) { cat = 4; tb = [sh]; }
  else if (g[0]![1] === 3) { cat = 3; tb = order.filter((_, i) => i === 0 || i >= 3); }
  else if (g[0]![1] === 2 && g[1]![1] === 2) { cat = 2; tb = [g[0]![0], g[1]![0], g[2]![0]]; }
  else if (g[0]![1] === 2) { cat = 1; tb = [g[0]![0], ...order.slice(2)]; }
  else { cat = 0; tb = rs; }
  let key = cat;
  for (let i = 0; i < 5; i++) key = key * 15 + (tb[i] ?? 0);
  return { cat, tb, key };
}

function best(cs: readonly number[]): { ev: Ev; five: number[] } {
  if (cs.length === 5) return { ev: ev5(cs), five: [...cs] };
  let b: { ev: Ev; five: number[] } | null = null;
  const n = cs.length;
  for (let a = 0; a < n; a++) for (let p = a + 1; p < n; p++) for (let q = p + 1; q < n; q++) for (let e = q + 1; e < n; e++) for (let f = e + 1; f < n; f++) {
    const five = [cs[a]!, cs[p]!, cs[q]!, cs[e]!, cs[f]!];
    const ev = ev5(five);
    if (!b || ev.key > b.ev.key) b = { ev, five };
  }
  return b!;
}

/** Category of 3–4 cards (pair-type hands only) or best of 5+. */
function bestAny(cs: readonly number[]): Ev {
  if (cs.length >= 5) return best(cs).ev;
  const cnt = new Map<number, number>();
  for (const r of cs.map(R)) cnt.set(r, (cnt.get(r) ?? 0) + 1);
  const m = [...cnt.values()].sort((a, b) => b - a);
  const cat = m[0] === 4 ? 7 : m[0] === 3 ? 3 : m[0] === 2 && m[1] === 2 ? 2 : m[0] === 2 ? 1 : 0;
  return { cat, tb: [], key: cat * 15 ** 5 };
}

function ownOrder(five: readonly number[]): number[] {
  const ev = ev5(five);
  const cnt = new Map<number, number>();
  for (const r of five.map(R)) cnt.set(r, (cnt.get(r) ?? 0) + 1);
  if ((ev.cat === 4 || ev.cat === 8) && ev.tb[0] === 3) return [3, 2, 1, 0, 12];
  return five.map(R).sort((a, b) => cnt.get(b)! - cnt.get(a)! || b - a);
}
const txt = (rs: number[]): string => rs.map((r) => RC[r]).join(' ');

/** Brute force: does some subset of the cards form category c? */
function subsetHas(cards: number[], c: number): boolean {
  const size = c === 1 ? 2 : c === 2 ? 4 : c === 3 ? 3 : c === 7 ? 4 : 5;
  const rec = (start: number, acc: number[]): boolean => {
    if (acc.length === size) {
      const cnt = new Map<number, number>();
      for (const r of acc.map(R)) cnt.set(r, (cnt.get(r) ?? 0) + 1);
      const m = [...cnt.values()].sort((a, b) => b - a);
      if (c === 1) return m[0] === 2;
      if (c === 2) return m[0] === 2 && m[1] === 2;
      if (c === 3) return m[0] === 3;
      if (c === 7) return m[0] === 4;
      const k = ev5(acc).cat;
      return k === c || (k === 8 && (c === 4 || c === 5));
    }
    for (let i = start; i < cards.length; i++) if (rec(i + 1, [...acc, cards[i]!])) return true;
    return false;
  };
  return rec(0, []);
}

const straightRankSet = (mask: number): boolean => {
  const ext = (mask << 1) | ((mask >> 12) & 1);
  for (let lo = 0; lo <= 9; lo++) if (((ext >> lo) & 31) === 31) return true;
  return false;
};
function completingRanks(hole: number[], board: number[]): number[] {
  const mask = [...hole, ...board].reduce((m, x) => m | (1 << R(x)), 0);
  const bm = board.reduce((m, x) => m | (1 << R(x)), 0);
  if (straightRankSet(mask)) return [];
  const out: number[] = [];
  for (let r = 0; r < 13; r++) if (!(mask & (1 << r)) && straightRankSet(mask | (1 << r)) && !straightRankSet(bm | (1 << r))) out.push(r);
  return out;
}
function isOesd(hole: number[], board: number[], comp: number[]): boolean {
  const mask = [...hole, ...board].reduce((m, x) => m | (1 << R(x)), 0);
  const ext = (mask << 1) | ((mask >> 12) & 1);
  const ce = new Set(comp.flatMap((r) => (r === 12 ? [0, 13] : [r + 1])));
  for (let lo = 1; lo + 3 <= 13; lo++) if (((ext >> lo) & 15) === 15 && ce.has(lo - 1) && ce.has(lo + 4)) return true;
  return false;
}

const LBL = (r: number, c: number): string => (r === c ? RC[12 - r]! + RC[12 - r]! : r < c ? `${RC[12 - r]}${RC[12 - c]}s` : `${RC[12 - c]}${RC[12 - r]}o`);
function neighbours(label: string): string[] {
  const out: string[] = [];
  for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
    if (LBL(r, c) !== label) continue;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr > 12 || cc < 0 || cc > 12) continue;
      const l = LBL(rr, cc);
      if (l.length === label.length && l[l.length - 1] === label[label.length - 1]) out.push(l);
    }
    if (label.length === 2) { if (r > 0) out.push(LBL(r - 1, r - 1)); if (r < 12) out.push(LBL(r + 1, r + 1)); }
  }
  return out;
}
const labelOf = (a: number, b: number): string => {
  const [h, l] = R(a) >= R(b) ? [a, b] : [b, a];
  return R(h) === R(l) ? RC[R(h)]! + RC[R(l)]! : RC[R(h)]! + RC[R(l)]! + (S(h) === S(l) ? 's' : 'o');
};

const fail = (it: DrillItem, msg: string): never => {
  throw new Error(`${msg}\n${it.type} ${it.spot} d${it.difficulty} hole=${cardsToString(it.visual.hole ?? [])} board=${cardsToString(it.visual.board ?? [])}\nQ: ${it.prompt}\nO: ${it.input.kind === 'choice' ? it.input.options.join(' | ') : ''} A=${it.answer}\nE: ${it.explanation}\nW: ${JSON.stringify(it.wrong)}`);
};
const opt = (it: DrillItem, i: number): string => (it.input.kind === 'choice' ? it.input.options[i]! : '');

/** Re-derive every answer and every number in the text without using the code under test. */
function verify(it: DrillItem, seen: Map<string, number>, opts: { equity: boolean }): void {
  const bump = (k: string): void => { seen.set(k, (seen.get(k) ?? 0) + 1); };
  if (it.input.kind === 'choice') {
    const o = it.input.options;
    if (new Set(o.map((x) => x.toLowerCase())).size !== o.length) fail(it, 'duplicate options');
    const multi = it.type === 'bet-size' || ((it.type === 'open-fold' || it.type === 'facing-raise') && it.answer.length > 1);
    if (!multi && it.answer.length !== 1) fail(it, 'not exactly one correct option');
    o.forEach((_, j) => { if (gradeDrill(it, j).correct !== it.answer.includes(j)) fail(it, 'grade mismatch'); });
  }
  const hole = it.visual.hole ?? [];
  const board = it.visual.board ?? [];
  switch (it.type) {
    case 'hand-category': {
      const cards = [...hole, ...board];
      const b = best(cards);
      if (opt(it, it.answer[0]!) !== NAMES[b.ev.cat]) fail(it, 'wrong category');
      if (!it.explanation.includes(`(${txt(ownOrder(b.five))})`)) fail(it, 'category ranks text');
      (it.input as { options: string[] }).options.forEach((nm, j) => {
        if (j === it.answer[0]) return;
        const c = NAMES.indexOf(nm);
        const w = it.wrong[j] ?? '';
        if (c > b.ev.cat && !/doesn't have that\.$/.test(w)) fail(it, 'higher category feedback');
        if (c > 0 && c < b.ev.cat && subsetHas(cards, c) !== /Your hand has that, but also something better/.test(w)) fail(it, 'lower category feedback');
        if (/\bA (two pair|three of a kind|four of a kind|high card)/i.test(w)) fail(it, 'grammar');
      });
      break;
    }
    case 'rank-winner': {
      const [a, b] = it.visual.hands!;
      const ba = best([...a!.cards, ...board]);
      const bb = best([...b!.cards, ...board]);
      const exp = ba.ev.key === bb.ev.key ? 2 : ba.ev.key > bb.ev.key ? 0 : 1;
      if (it.answer[0] !== exp) fail(it, 'wrong winner');
      if (exp === 2) {
        const bp = ba.ev.key === best(board).ev.key;
        bump(bp ? 'tie-board' : 'tie-hands');
        const mentions = /board plays/.test(it.explanation) || Object.values(it.wrong).some((w) => /board plays/.test(w));
        if (bp !== mentions) fail(it, 'tie: board mentioned when it does not play (or vice versa)');
        if (!it.explanation.includes(`(${txt(ownOrder(ba.five))})`)) fail(it, 'tie ranks');
      } else if (ba.ev.cat === bb.ev.cat) {
        const m = /(Player [AB]) has ([2-9TJQKA ]+) and (Player [AB]) has ([2-9TJQKA ]+)\. The first difference is (A \(low\)|\S+) versus (A \(low\)|\S+) \(/.exec(it.explanation);
        if (!m) fail(it, 'no comparison text');
        if ((exp === 0 ? 'Player A' : 'Player B') !== m![1]) fail(it, 'winner not named first');
        const w = m![1] === 'Player A' ? ba : bb;
        const l = m![3] === 'Player A' ? ba : bb;
        const wo = ownOrder(w.five);
        const lo = ownOrder(l.five);
        if (m![2] !== txt(wo) || m![4] !== txt(lo)) fail(it, 'comparison order');
        let k = 0;
        while (wo[k] === lo[k]) k++;
        const low = (r: number, five: number[]): boolean => r === 12 && (ev5(five).cat === 4 || ev5(five).cat === 8) && ev5(five).tb[0] === 3;
        const val = (r: number, five: number[]): number => (low(r, five) ? -1 : r);
        if (val(wo[k]!, w.five) <= val(lo[k]!, l.five)) fail(it, 'first difference favours the loser');
        const tok = (r: number, five: number[]): string => (low(r, five) ? 'A (low)' : RC[r]!);
        if (m![5] !== tok(wo[k]!, w.five) || m![6] !== tok(lo[k]!, l.five)) fail(it, 'first difference tokens');
        bump('winner-same-category');
      } else if (!it.explanation.includes(`(${txt(ownOrder(exp === 0 ? ba.five : bb.five))})`)) fail(it, 'winner ranks');
      break;
    }
    case 'best-five': {
      const pool = (it.input as { pool: number[] }).pool;
      const b = best(pool);
      if (!it.explanation.includes(`(${txt(ownOrder(b.five))})`)) fail(it, 'best-five ranks');
      if (!gradeDrill(it, b.five.map((x) => pool.indexOf(x))).correct) fail(it, 'best five rejected');
      for (let t = 0; t < 3; t++) {
        const pick = [0, 1, 2, 3, 4, 5, 6].filter((i) => i !== t && i !== (t + 3) % 7);
        const five = pick.map((i) => pool[i]!);
        const g = gradeDrill(it, pick);
        const isBest = ev5(five).key === b.ev.key;
        if (g.correct !== isBest) fail(it, 'best-five grading');
        if (!isBest && !g.feedback.includes(`(${txt(ownOrder(five))})`)) fail(it, 'best-five feedback without ranks');
      }
      break;
    }
    case 'outs': {
      const seenCards = new Set([...hole, ...board]);
      const unseen = deck().filter((x) => !seenCards.has(x));
      const kind = it.spot.slice(5);
      const total = kind === 'overcards'
        ? unseen.filter((x) => hole.map(R).includes(R(x)))
        : unseen.filter((x) => {
          const now = best([...hole, ...board, x]).ev;
          return (now.cat === 4 || now.cat === 5 || now.cat === 8) && bestAny([...board, x]).cat < now.cat;
        });
      if (kind === 'overcards' && (total.length !== 6 || !hole.every((h) => board.every((b) => R(h) > R(b))))) fail(it, 'overcards');
      const comp = kind === 'overcards' ? [] : completingRanks(hole, board);
      const fs = [0, 1, 2, 3].find((s) => [...hole, ...board].filter((x) => S(x) === s).length === 4 && hole.some((x) => S(x) === s));
      const fl = fs !== undefined;
      const oesd = isOesd(hole, board, comp);
      const shapeOk = kind === 'flush' ? fl && comp.length === 0 : kind === 'combo' ? fl && comp.length > 0
        : kind === 'oesd' ? !fl && comp.length === 2 && oesd : kind === 'dgut' ? !fl && comp.length === 2 && !oesd
          : kind === 'gutshot' ? !fl && comp.length === 1 : true;
      if (!shapeOk) fail(it, 'draw name does not match the cards');
      if (kind === 'combo' && !it.prompt.includes(`flush draw plus ${comp.length === 1 ? 'a gutshot' : oesd ? 'an open-ended straight draw' : 'a double gutshot'}`)) fail(it, 'combo name');
      if (fl && hole.filter((x) => S(x) === fs).length === 1) {
        const top = Math.max(...hole.filter((x) => S(x) === fs).map(R));
        if (unseen.some((x) => S(x) === fs && R(x) > top)) fail(it, 'one-card flush draw that is not the nut draw');
      }
      const n = total.length;
      const ans = Number(opt(it, it.answer[0]!));
      if ((it.visual.highlight ?? []).length !== ans) fail(it, 'highlight count');
      const fo = new Map(findOuts(hole as [number, number], board).outs.map((o) => [o.card, o]));
      for (const x of total) if (!fo.has(x)) fail(it, 'findOuts misses an out');
      if (it.difficulty < 3) {
        if (ans !== n) fail(it, 'answer is not the total number of outs');
        if (!it.explanation.includes(`: ${n} outs (`) || !it.explanation.includes(`= ${n})`)) fail(it, 'explanation total');
        if (/clean|risky/i.test(it.prompt)) fail(it, 'below difficulty 3 the prompt asks for all outs');
      } else {
        const risky = total.filter((x) => fo.get(x)!.dirty);
        const clean = n - risky.length;
        if (ans !== clean) fail(it, 'answer is not the clean count');
        if (!/CLEAN/.test(it.prompt)) fail(it, 'difficulty 3 prompt must ask for clean outs');
        if (risky.length) {
          if (!it.explanation.includes(`${n} total − ${risky.length} risky = ${clean} clean out`)) fail(it, 'explanation subtraction');
          for (const x of risky) {
            if (!it.explanation.includes(RC[R(x)]! + '♣♦♥♠'[S(x)]!)) fail(it, 'risky card not named');
            for (const why of fo.get(x)!.reasons) if (!it.explanation.includes(why)) fail(it, 'risky reason missing');
          }
          if (!(it.input as { options: string[] }).options.includes(String(n))) fail(it, 'raw total not offered as a distractor');
          bump('outs-risky');
        } else if (!it.explanation.includes(`all ${n} are clean`)) fail(it, 'explanation (none risky)');
      }
      const f1 = /13 \w+ − the 4 you can see = (\d+)/.exec(it.explanation);
      const f2 = /(\d+) ranks? \(([^)]*)\) × 4 suits = (\d+)/.exec(it.explanation);
      const f3 = /9 \w+ \+ (\d+) cards that make the straight \([^)]*\) − the (\d+) that (?:is|are) in both groups = (\d+)/.exec(it.explanation);
      if (kind === 'flush' && (!f1 || Number(f1[1]) !== 9 || n !== 9)) fail(it, 'flush formula');
      if (['oesd', 'dgut', 'gutshot'].includes(kind) && (!f2 || Number(f2[1]) !== comp.length || Number(f2[3]) !== 4 * comp.length || n !== 4 * comp.length)) fail(it, 'straight formula');
      if (f2) for (const r of comp) if (!f2[2]!.includes(PLURALS[r]!)) fail(it, 'completing ranks named');
      if (kind === 'combo' && (!f3 || Number(f3[1]) !== 4 * comp.length || 9 + Number(f3[1]) - Number(f3[2]) !== n || Number(f3[3]) !== n)) fail(it, 'combo formula');
      bump(`outs:${kind}:d${it.difficulty}`);
      break;
    }
    case 'pot-odds': {
      const o = (it.input as { options: string[] }).options;
      const win = it.visual.pot!;
      const bet = it.visual.bet!;
      const pot = Number(/pot is ([\d,]+)/.exec(it.prompt)![1]!.replace(/,/g, ''));
      const be = bet / (win + bet);
      if (win !== pot + bet) fail(it, 'visual: win = pot + bet');
      if (!it.explanation.includes(`You risk ${bet.toLocaleString('en-US')} to win ${win.toLocaleString('en-US')}`)) fail(it, 'risk X to win Y');
      if (it.spot === 'odds:needed') {
        if (opt(it, it.answer[0]!) !== `${Math.round(be * 100)}%`) fail(it, 'needed answer');
        o.forEach((x, j) => {
          const v = Number(x.replace('%', ''));
          if (!(v > 0 && v < 100)) fail(it, 'impossible option');
          if (j === it.answer[0]) return;
          const w = it.wrong[j] ?? '';
          if (!w.startsWith(`${v}% `)) fail(it, 'distractor feedback');
          if (/divides by/.test(w) && v !== Math.round((bet / win) * 100)) fail(it, 'feedback: left out the call');
          if (/compares the bet with the pot before/.test(w) && v !== Math.round((bet / pot) * 100)) fail(it, 'feedback: bet / pot');
          if (/other side/.test(w) && v !== Math.round((win / (win + bet)) * 100)) fail(it, 'feedback: other side');
          if (/one time too many/.test(w) && v !== Math.round((bet / (pot + 3 * bet)) * 100)) fail(it, 'feedback: bet counted twice');
          if (/too high/.test(w) && !(v > be * 100)) fail(it, 'feedback: too high');
          if (/too low/.test(w) && !(v < be * 100)) fail(it, 'feedback: too low');
        });
      } else {
        const outs = /You have (\d+) outs/.exec(it.prompt);
        const est = /estimate a (\d+)%/.exec(it.prompt);
        const eq = outs ? (Number(outs[1]) * 2) / 100 : Number(est![1]) / 100;
        if (it.answer[0] !== (eq > be ? 0 : 1)) fail(it, 'decision');
        if (outs && Number(outs[1]) / 46 > be !== eq > be) fail(it, 'Rule of 2 disagrees with the exact chance');
      }
      break;
    }
    case 'equity-guess': {
      const vil = it.visual.hands![0]!.cards;
      if (board.length === 0) {
        const cm = CLASSIC_MATCHUPS.find((m) => m.a === cardsToString(hole).replace(' ', '') && m.b === cardsToString(vil).replace(' ', ''));
        if (!cm || it.answer[0] !== Math.round(cm.equity)) fail(it, 'classic matchup');
      } else if (opts.equity) {
        const dead = new Set([...hole, ...vil, ...board]);
        const rest = deck().filter((x) => !dead.has(x));
        let w = 0;
        let n = 0;
        const runouts: number[][] = board.length === 4 ? rest.map((x) => [x]) : rest.flatMap((x, i) => rest.slice(i + 1).map((y) => [x, y]));
        for (const ro of runouts) {
          const bd = [...board, ...ro];
          const a = best([...hole, ...bd]).ev.key;
          const b = best([...vil, ...bd]).ev.key;
          n++;
          w += a > b ? 1 : a === b ? 0.5 : 0;
        }
        if (it.answer[0] !== Math.round((w / n) * 100) || !it.explanation.includes(`${((w / n) * 100).toFixed(1)}%`)) fail(it, 'equity');
      }
      break;
    }
    case 'open-fold': {
      const pos = /in (\w+)\./.exec(it.prompt)![1] as Position;
      const label = it.visual.grid!.focus!;
      if (labelOf(hole[0]!, hole[1]!) !== label) fail(it, 'label');
      const r = openRange(pos);
      const act = (l: string): number => ((r.get(l) ?? 0) > 0 ? 0 : 1);
      const exp = [...new Set([act(label), ...neighbours(label).map(act)])].sort();
      if (JSON.stringify([...it.answer].sort()) !== JSON.stringify(exp)) fail(it, 'open answer');
      if (pos === 'SB' && act(label) === 1 && !/Only the big blind acts after you/.test(it.wrong[0] ?? '')) fail(it, 'small blind feedback');
      break;
    }
    case 'facing-raise': {
      const [hero, raiser] = it.spot.slice(3).split('>') as [Position, Position];
      if (!DEFEND_SPECS[`${hero}>${raiser}`]) fail(it, 'chart');
      const label = it.visual.grid!.focus!;
      if (labelOf(hole[0]!, hole[1]!) !== label) fail(it, 'label');
      const { threeBet, call } = defendRanges_(hero, raiser);
      const act = (l: string): number => ((threeBet.get(l) ?? 0) > 0 ? 2 : (call.get(l) ?? 0) > 0 ? 1 : 0);
      const exp = [...new Set([act(label), ...neighbours(label).map(act)])].sort();
      if (JSON.stringify([...it.answer].sort()) !== JSON.stringify(exp)) fail(it, 'accepted actions are not exactly the chart action plus neighbour actions');
      if (it.bestIndex !== act(label)) fail(it, 'best action');
      const raiseTo = Number(/raises to (\d+)/.exec(it.prompt)![1]);
      const blind = (p: Position): number => (p === 'SB' ? 50 : p === 'BB' ? 100 : 0);
      if (it.visual.bet !== raiseTo - blind(hero) || it.visual.pot !== raiseTo + 150 - blind(raiser)) fail(it, 'price');
      if (!it.explanation.includes(`risking ${it.visual.bet} to win ${it.visual.pot}`)) fail(it, 'price text');
      if (exp.length > 1) bump('facing-raise-marginal');
      break;
    }
    case 'made-draw-air': {
      const all = [...hole, ...board];
      const ev = bestAny(all);
      let made = false;
      if (ev.cat === 4 || ev.cat === 5 || ev.cat === 8) made = best(all).five.some((x) => hole.includes(x));
      else if (ev.cat >= 1) {
        const cnt = new Map<number, number>();
        for (const x of all) cnt.set(R(x), (cnt.get(R(x)) ?? 0) + 1);
        const groups = [...cnt.entries()].filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
        const used = ev.cat === 1 || ev.cat === 3 || ev.cat === 7 ? groups.slice(0, 1) : groups.slice(0, 2);
        made = used.some(([r]) => hole.map(R).includes(r));
      }
      const comp = completingRanks(hole, board);
      const fs = [0, 1, 2, 3].find((s) => all.filter((x) => S(x) === s).length === 4 && hole.some((x) => S(x) === s));
      const strong = fs !== undefined || comp.length >= 2;
      const anyOver = hole.some((x) => R(x) > Math.max(...board.map(R)));
      const backdoor = board.length === 3 && [0, 1, 2, 3].some((s) => all.filter((x) => S(x) === s).length === 3 && hole.some((x) => S(x) === s));
      const a = it.answer[0];
      if (a === 0 && !made) fail(it, 'marked made, but no made hand uses a hole card');
      if (a === 1 && (made || !strong)) fail(it, 'marked draw');
      if (a === 2 && (made || strong || comp.length > 0 || anyOver || backdoor)) fail(it, 'marked nothing');
      if (a === 2 && !/Air rarely wins at showdown, so it mostly wins when others fold\./.test(it.explanation)) fail(it, 'air wording');
      if (a === 2 && ev.cat >= 1) bump('board-made-nothing');
      if (a === 1 && fs === undefined && /Open-ended/.test(it.explanation) !== isOesd(hole, board, comp)) fail(it, 'straight draw name');
      break;
    }
    case 'board-texture': {
      const ms = Math.max(...[0, 1, 2, 3].map((s) => board.filter((x) => S(x) === s).length));
      if (it.spot === 'tex:suits' && it.answer[0] !== (ms === 3 ? 2 : ms === 2 ? 1 : 0)) fail(it, 'suits');
      if (it.spot === 'tex:paired' && it.answer[0] !== (new Set(board.map(R)).size < 3 ? 0 : 1)) fail(it, 'paired');
      if (['tex:dry', 'tex:medium', 'tex:wet'].includes(it.spot)) {
        for (const w of Object.values(it.wrong)) {
          const fact = ms === 3 ? 'all three cards in one suit' : ms === 2 ? 'two cards of one suit' : 'three different suits';
          if (!w.includes(fact) || !w.includes(`makes it ${it.spot.slice(4)}`)) fail(it, 'texture feedback');
        }
      }
      break;
    }
    case 'tier-place':
      if (opt(it, it.answer[0]!) !== TIER_NAMES[tierOf(it.visual.note!)]) fail(it, 'tier');
      break;
    case 'mdf': {
      const pot = Number(/pot is ([\d,]+)/.exec(it.prompt)![1]!.replace(/,/g, ''));
      const b = Number(/bets ([\d,]+)/.exec(it.prompt)![1]!.replace(/,/g, ''));
      if (opt(it, it.answer[0]!) !== `${Math.round((pot / (pot + b)) * 100)}%`) fail(it, 'mdf');
      if (it.visual.pot !== pot + b || it.visual.bet !== b) fail(it, 'mdf visual (risk X to win Y)');
      break;
    }
    case 'spr': {
      const pot = Number(/pot is ([\d,]+)/.exec(it.prompt)![1]!.replace(/,/g, ''));
      const stacks = [...it.prompt.matchAll(/([\d,]+) behind|opponent has ([\d,]+)/g)].map((m) => Number((m[1] ?? m[2])!.replace(/,/g, '')));
      const spr = Math.min(...stacks) / pot;
      if (opt(it, it.answer[0]!) !== (Number.isInteger(spr) ? String(spr) : spr.toFixed(1))) fail(it, 'spr');
      if (!it.explanation.includes(spr < 3 ? 'low (under 3)' : spr < 8 ? 'medium (3 to under 8)' : 'high (8 or more)')) fail(it, 'spr band');
      break;
    }
    case 'bet-size': {
      if (/value/.test(it.prompt)) {
        const b5 = best([...hole, ...board]);
        const cnt = new Map<number, number>();
        for (const x of b5.five) cnt.set(R(x), (cnt.get(R(x)) ?? 0) + 1);
        const uses = b5.ev.cat === 4 || b5.ev.cat === 5 || b5.ev.cat === 8 ? b5.five.some((x) => hole.includes(x)) : [...cnt].some(([r, k]) => k >= 2 && hole.map(R).includes(r));
        if (!uses) fail(it, 'value bet with a hand made only by the board');
      }
      break;
    }
    default:
      break;
  }
}

describe('drill generators: independent re-verification', () => {
  it('every generator at every difficulty (own evaluator, own outs recount, own chart neighbours)', () => {
    const seen = new Map<string, number>();
    let equityChecks = 0;
    for (let s = 1; s <= 12; s++) {
      for (const d of [1, 2, 3] as const) {
        const rng = createRng(s * 7919 + d);
        for (const t of ALL_DRILL_TYPES) {
          const item = generateDrill(t, rng, d);
          verify(item, seen, { equity: t === 'equity-guess' && equityChecks++ < 12 });
        }
      }
    }
  });

  const focus: [DrillType, 1 | 2 | 3, number][] = [
    ['outs', 1, 60], ['outs', 2, 80], ['outs', 3, 120], ['rank-winner', 2, 80], ['rank-winner', 3, 80], ['made-draw-air', 2, 120],
    ['hand-category', 2, 60], ['best-five', 2, 40], ['pot-odds', 2, 80], ['facing-raise', 3, 80], ['spr', 2, 30], ['board-texture', 1, 40],
  ];
  it('focused samples cover the tricky cases', () => {
    const seen = new Map<string, number>();
    let s = 900;
    for (const [t, d, n] of focus) {
      const rng = createRng(s++);
      for (let i = 0; i < n; i++) verify(generateDrill(t, rng, d), seen, { equity: false });
    }
    for (const k of ['outs:flush:d1', 'outs:oesd:d1', 'outs:gutshot:d1', 'outs:dgut:d2', 'outs:overcards:d2', 'outs:combo:d3', 'outs-risky', 'tie-board', 'tie-hands', 'winner-same-category', 'board-made-nothing', 'facing-raise-marginal']) {
      expect(seen.get(k) ?? 0, k).toBeGreaterThan(0);
    }
  });
});
