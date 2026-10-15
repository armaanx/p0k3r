import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_LABELS } from './ranges';
import { chartEdgeBB, chartPercent, depthIndex, inChart, isCloseCall, maxDepth, PF_DEPTHS, PF_EXPLOITABILITY } from './pushFold';

// The equity table the charts were solved from (not shipped in the app): w = card-disjoint combo pairs, eq = equity.
const T = JSON.parse(readFileSync('scripts/data/hu-preflop-equity.json', 'utf8')) as { labels: string[]; w: number[][]; eq: number[][] };
const N = 169;
const idx = (l: string): number => ALL_LABELS.indexOf(l);

/** Best-response gains of both players against the two charts at stack S, in big blinds per hand (0 = exact equilibrium). */
function exploitability(S: number): number {
  const s = ALL_LABELS.map((l) => (inChart('shove', l, S) ? 1 : 0));
  const c = ALL_LABELS.map((l) => (inChart('call', l, S) ? 1 : 0));
  let value = 0, brSb = 0, sbFolds = 0, minSbShoves = 0;
  for (let i = 0; i < N; i++) {
    let shove = 0, tot = 0;
    for (let j = 0; j < N; j++) {
      const w = T.w[i]![j]!;
      shove += w * ((1 - c[j]!) + c[j]! * S * (2 * T.eq[i]![j]! - 1));
      tot += w;
    }
    const fold = -0.5 * tot;
    value += s[i]! * shove + (1 - s[i]!) * fold;
    brSb += Math.max(shove, fold);
    sbFolds += (1 - s[i]!) * fold;
  }
  for (let j = 0; j < N; j++) {
    let call = 0, reach = 0;
    for (let i = 0; i < N; i++) {
      const w = T.w[i]![j]! * s[i]!;
      call += w * S * (1 - 2 * T.eq[i]![j]!);
      reach += w;
    }
    minSbShoves += -Math.max(call, -reach);
  }
  void value;
  return (brSb - (sbFolds + minSbShoves)) / (1326 * 1225);
}

describe('push/fold equity table', () => {
  it('uses the same hand order and exact combo-pair counts', () => {
    expect(T.labels).toEqual(ALL_LABELS);
    expect(T.w[idx('AA')]![idx('KK')]).toBe(36);
    expect(T.w[idx('AA')]![idx('AA')]).toBe(6); // 6 ways to pick your two aces, then the other two are theirs
    expect(T.w[idx('AKs')]![idx('AKo')]).toBe(24);
    let total = 0;
    for (const r of T.w) for (const x of r) total += x;
    expect(total).toBe(1326 * 1225);
  });
  it('matches well-known all-in equities', () => {
    const eq = (a: string, b: string): number => T.eq[idx(a)]![idx(b)]!;
    expect(eq('AA', 'KK')).toBeCloseTo(0.82, 2);
    expect(eq('AKs', 'QQ')).toBeGreaterThan(0.45);
    expect(eq('AKs', 'QQ')).toBeLessThan(0.47);
    expect(eq('22', 'AKo')).toBeGreaterThan(0.51);
    expect(eq('22', 'AKo')).toBeLessThan(0.54);
    expect(eq('AA', '72o')).toBeGreaterThan(0.86);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (T.w[i]![j]) expect(T.eq[i]![j]! + T.eq[j]![i]!).toBeCloseTo(1, 4);
  });
});

describe('push/fold charts', () => {
  it('cover 1.5 to 20 big blinds in half-big-blind steps', () => {
    expect(PF_DEPTHS[0]).toBe(1.5);
    expect(PF_DEPTHS[PF_DEPTHS.length - 1]).toBe(20);
    expect(PF_DEPTHS.length).toBe(38);
    expect(depthIndex(9.8)).toBe(PF_DEPTHS.indexOf(10));
    expect(depthIndex(0.5)).toBe(0);
    expect(depthIndex(55)).toBe(PF_DEPTHS.length - 1);
  });

  it('are an equilibrium: a perfect opponent gains less than 1 milli-big-blind per hand at every stack size', () => {
    for (const S of PF_DEPTHS) {
      const e = exploitability(S);
      expect(e, `${S}bb`).toBeLessThan(0.001);
      expect(e, `${S}bb`).toBeGreaterThan(-1e-9);
      expect(PF_EXPLOITABILITY[PF_DEPTHS.indexOf(S)]!).toBeCloseTo(e, 5);
    }
  });

  it('each hand takes the better option against the other chart (EV sign agrees with the chart)', () => {
    for (const S of PF_DEPTHS) {
      for (const l of ALL_LABELS) {
        for (const role of ['shove', 'call'] as const) {
          const edge = chartEdgeBB(role, l, S);
          // Mixed hands at equilibrium are nearly indifferent; everything else must agree.
          if (Math.abs(edge) > 0.05) expect(inChart(role, l, S), `${role} ${l} at ${S}bb (edge ${edge})`).toBe(edge > 0);
        }
      }
    }
  });

  it('match published heads-up Nash values (HoldemResources, no ante: SB T3s pushes up to 7.7bb, BB Q2o calls up to 5.6bb)', () => {
    expect(maxDepth('shove', 'T3s')).toBe(7.5);
    expect(maxDepth('call', 'Q2o')).toBe(5.5);
  });

  it('known facts: about 58% shoves and 37% calls at 10bb; the best hands always go in; ranges narrow as stacks deepen', () => {
    expect(chartPercent('shove', 10)).toBeGreaterThan(56);
    expect(chartPercent('shove', 10)).toBeLessThan(60);
    expect(chartPercent('call', 10)).toBeGreaterThan(35);
    expect(chartPercent('call', 10)).toBeLessThan(39);
    for (const S of PF_DEPTHS) for (const l of ['AA', 'KK', 'QQ', 'AKs', 'AKo', 'A2o', '22']) expect(inChart('shove', l, S), `${l} ${S}`).toBe(true);
    expect(inChart('shove', '72o', 10)).toBe(false);
    expect(inChart('call', '72o', 10)).toBe(false);
    expect(chartPercent('shove', 2)).toBeGreaterThan(chartPercent('shove', 10));
    expect(chartPercent('shove', 10)).toBeGreaterThan(chartPercent('shove', 20));
    expect(chartPercent('call', 3)).toBeGreaterThan(chartPercent('call', 10));
    expect(chartPercent('call', 10)).toBeGreaterThan(chartPercent('call', 20));
    // The caller is always tighter than the pusher once stacks are not tiny: calling has no fold equity.
    for (const S of PF_DEPTHS.filter((d) => d >= 5)) expect(chartPercent('call', S)).toBeLessThan(chartPercent('shove', S));
  });

  it('flags close calls near a chart edge', () => {
    expect(isCloseCall('shove', 'T3s', 7.5)).toBe(true);
    expect(isCloseCall('shove', 'AA', 10)).toBe(false);
    expect(isCloseCall('shove', '72o', 15)).toBe(false);
  });
});
