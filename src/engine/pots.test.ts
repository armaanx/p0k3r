import { describe, expect, it } from 'vitest';
import { awardPot, buildPots } from './pots';

describe('buildPots', () => {
  it('single pot when everyone contributes equally', () => {
    const pots = buildPots([
      { seat: 0, total: 100, folded: false },
      { seat: 1, total: 100, folded: false },
      { seat: 2, total: 100, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 300, eligible: [0, 1, 2] }]);
  });

  it('three-way all-in with different stacks makes main + two side pots', () => {
    const pots = buildPots([
      { seat: 0, total: 100, folded: false },
      { seat: 1, total: 300, folded: false },
      { seat: 2, total: 500, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 300, eligible: [0, 1, 2] },
      { amount: 400, eligible: [1, 2] },
      { amount: 200, eligible: [2] },
    ]);
    expect(pots.reduce((a, p) => a + p.amount, 0)).toBe(900);
  });

  it('folded players leave dead money in the pots but cannot win them', () => {
    const pots = buildPots([
      { seat: 0, total: 50, folded: true },
      { seat: 1, total: 200, folded: false },
      { seat: 2, total: 200, folded: false },
      { seat: 3, total: 120, folded: true },
    ]);
    expect(pots).toEqual([{ amount: 570, eligible: [1, 2] }]);
  });

  it('folded player with chips between two all-in levels feeds both pots', () => {
    const pots = buildPots([
      { seat: 0, total: 100, folded: false },
      { seat: 1, total: 400, folded: false },
      { seat: 2, total: 250, folded: true },
      { seat: 3, total: 400, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 400, eligible: [0, 1, 3] },
      { amount: 750, eligible: [1, 3] },
    ]);
  });

  it('always conserves chips', () => {
    const c = [
      { seat: 0, total: 37, folded: false },
      { seat: 1, total: 91, folded: true },
      { seat: 2, total: 150, folded: false },
      { seat: 3, total: 150, folded: false },
      { seat: 4, total: 12, folded: true },
    ];
    expect(buildPots(c).reduce((a, p) => a + p.amount, 0)).toBe(440);
  });
});

describe('awardPot', () => {
  const scores = (o: Record<number, number>): Map<number, number> => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));

  it('awards the pot to the best hand among eligible seats', () => {
    const r = awardPot({ amount: 300, eligible: [0, 1, 2] }, scores({ 0: 5, 1: 9, 2: 7 }), 0, 6);
    expect(r).toEqual([{ seat: 1, amount: 300 }]);
  });

  it('ignores a better hand that is not eligible for this side pot', () => {
    const r = awardPot({ amount: 400, eligible: [1, 2] }, scores({ 0: 99, 1: 5, 2: 7 }), 0, 6);
    expect(r).toEqual([{ seat: 2, amount: 400 }]);
  });

  it('splits evenly, and gives the odd chip to the winner closest left of the button', () => {
    // button = seat 4 in a 6 seat game. Order clockwise from button+1: 5,0,1,2,3,4
    const r = awardPot({ amount: 101, eligible: [1, 5, 2] }, scores({ 1: 7, 5: 7, 2: 7 }), 4, 6);
    expect(r.find((x) => x.seat === 5)!.amount).toBe(34);
    expect(r.find((x) => x.seat === 1)!.amount).toBe(34);
    expect(r.find((x) => x.seat === 2)!.amount).toBe(33);
    expect(r.reduce((a, x) => a + x.amount, 0)).toBe(101);
  });

  it('two-way split with an odd chip', () => {
    const r = awardPot({ amount: 5, eligible: [0, 1] }, scores({ 0: 1, 1: 1 }), 0, 2);
    // seat 1 is closest left of button 0
    expect(r).toEqual([{ seat: 1, amount: 3 }, { seat: 0, amount: 2 }]);
  });
});
