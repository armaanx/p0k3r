import { describe, expect, it } from 'vitest';
import { parseCards } from './cards';
import { equityMulti, equityVsHand, equityVsRange } from './equity';
import { parseRange } from './ranges';
import { createRng } from './rng';

const h = (s: string): [number, number] => parseCards(s) as [number, number];

describe('exact equity', () => {
  it('river: deterministic win / loss / tie', () => {
    const board = parseCards('2c 7d 9h Jc 4s');
    expect(equityVsHand(h('AsAd'), h('KsKd'), board).equity).toBe(1);
    expect(equityVsHand(h('KsKd'), h('AsAd'), board).equity).toBe(0);
    const chop = equityVsHand(h('2s3d'), h('4s5d'), parseCards('As Ks Qs Js Ts'));
    expect(chop.equity).toBe(0.5);
    expect(chop.tie).toBe(1);
  });

  it('turn: a flush draw with 9 clean outs is exactly 9/44 against top pair', () => {
    // Hero 9h8h has four hearts on Ah 5h 2c Kd; villain AsQd has top pair and no heart. Only the 9 remaining hearts win.
    const r = equityVsHand(h('9h8h'), h('AsQd'), parseCards('Ah 5h 2c Kd'));
    expect(r.exact).toBe(true);
    expect(r.equity).toBeCloseTo(9 / 44, 10);
  });

  it('shared outs are chopped: a card that makes both players the same straight gives a tie', () => {
    // Same setup but the wheel: a 4 makes A-2-3-4-5 for the villain too (with the ace), so three 4s chop.
    const r = equityVsHand(h('9h8h'), h('AsKd'), parseCards('Ah 5h 2c 3d'));
    expect(r.equity).toBeCloseTo(9 / 44 + (3 / 44) * 0.5, 10);
  });

  it('flop exact enumeration: AKs vs QQ ~ 46% preflop (Monte Carlo), classic coin flip', () => {
    const r = equityVsHand(h('AsKs'), h('QhQd'), [], { iterations: 60000, rng: createRng(5) });
    expect(r.exact).toBe(false);
    expect(r.equity).toBeGreaterThan(0.44);
    expect(r.equity).toBeLessThan(0.48);
  });

  it('AA vs KK preflop is about 82/18', () => {
    const r = equityVsHand(h('AsAd'), h('KsKd'), [], { iterations: 60000, rng: createRng(6) });
    expect(r.equity).toBeGreaterThan(0.80);
    expect(r.equity).toBeLessThan(0.84);
  });

  it('exact preflop enumeration is possible with a raised limit and matches known value (AA vs KK = 81.9%)', () => {
    const r = equityVsHand(h('AsAd'), h('KsKd'), [], { exactLimit: 2_000_000 });
    expect(r.exact).toBe(true);
    expect(r.equity).toBeGreaterThan(0.8);
    expect(r.equity).toBeLessThan(0.83);
    expect(r.samples).toBe(1712304); // C(48,5)
  });

  it('equity + opponent equity = 1 (no ties double counted)', () => {
    const b = parseCards('Ts 9s 2d');
    const a = equityVsHand(h('AhKh'), h('QsJs'), b, { exactLimit: 2_000_000 });
    const c = equityVsHand(h('QsJs'), h('AhKh'), b, { exactLimit: 2_000_000 });
    expect(a.equity + c.equity).toBeCloseTo(1, 10);
  });
});

describe('equity vs range', () => {
  it('weights matter: AA vs {KK:1} vs {KK:1, 72o:1} differ', () => {
    const board = parseCards('2c 7d 9h Jc');
    const a = equityVsRange(h('AsAd'), parseRange('KK'), board);
    const b = equityVsRange(h('AsAd'), parseRange('KK, 72o'), board);
    expect(b.equity).not.toBeCloseTo(a.equity, 3);
    expect(a.exact).toBe(true);
  });

  it('removes combos blocked by hero cards and board', () => {
    const r = equityVsRange(h('AsAd'), parseRange('AA'), parseCards('2c 7d 9h Jc 4s'));
    // Only AhAc remains: a tie
    expect(r.equity).toBe(0.5);
  });

  it('AA is a big favourite vs a wide range, roughly 85%', () => {
    const r = equityVsRange(h('AsAd'), parseRange('22+,A2s+,A2o+,KTs+,KJo+,QJs'), [], { iterations: 30000, rng: createRng(3) });
    expect(r.equity).toBeGreaterThan(0.78);
    expect(r.equity).toBeLessThan(0.9);
  });

  it('flop vs range stays exact when the limit allows and agrees with MC', () => {
    const board = parseCards('Ah 7c 2d');
    const exact = equityVsRange(h('KsKd'), parseRange('AKs,AQs,77,22,JTs'), board, { exactLimit: 5_000_000 });
    const mc = equityVsRange(h('KsKd'), parseRange('AKs,AQs,77,22,JTs'), board, { exactLimit: 1, iterations: 60000, rng: createRng(9) });
    expect(exact.exact).toBe(true);
    expect(mc.exact).toBe(false);
    expect(Math.abs(exact.equity - mc.equity)).toBeLessThan(0.01);
  });

  it('is deterministic given a seed', () => {
    const r1 = equityVsRange(h('AsKd'), parseRange('TT+,AQs+'), [], { rng: createRng(99) });
    const r2 = equityVsRange(h('AsKd'), parseRange('TT+,AQs+'), [], { rng: createRng(99) });
    expect(r1.equity).toBe(r2.equity);
  });
});

describe('multiway equity', () => {
  it('equities of known hands sum to 1', () => {
    const r = equityMulti([[{ hand: h('AsAd'), weight: 1 }], [{ hand: h('KsKd'), weight: 1 }], [{ hand: h('QsQd'), weight: 1 }]], parseCards('2c 7d 9h Jc'));
    expect(r.reduce((a, x) => a + x.equity, 0)).toBeCloseTo(1, 10);
    expect(r[0]!.exact).toBe(true);
  });

  it('range vs range Monte Carlo sums to ~1 and is sane', () => {
    const r = equityMulti([parseRange('AA'), parseRange('KK'), parseRange('QQ')], [], { iterations: 20000, rng: createRng(4) });
    expect(r.reduce((a, x) => a + x.equity, 0)).toBeCloseTo(1, 6);
    expect(r[0]!.equity).toBeGreaterThan(r[1]!.equity);
    expect(r[1]!.equity).toBeGreaterThan(r[2]!.equity);
  });
});
