import { describe, expect, it } from 'vitest';
import { parseCards, cardToString } from './cards';
import { Category } from './evaluator';
import { exactHitChance, findOuts, outsToCategories, rankChar, ruleOf2And4 } from './outs';
import { classifyBoard } from './texture';

const h = (s: string): [number, number] => parseCards(s) as [number, number];

describe('outs', () => {
  it('nut flush draw + two overcards = 15 outs', () => {
    const r = findOuts(h('AhKh'), parseCards('Qh 7h 2c'));
    expect(r.outs).toHaveLength(15);
    expect(outsToCategories(h('AhKh'), parseCards('Qh 7h 2c'), [Category.Flush])).toHaveLength(9);
  });

  it('open-ended straight draw = 8 straight outs; gutshot = 4', () => {
    expect(outsToCategories(h('9c8d'), parseCards('7h 6s 2d'), [Category.Straight])).toHaveLength(8);
    expect(outsToCategories(h('9c8d'), parseCards('6h 5s Kd'), [Category.Straight])).toHaveLength(4);
  });

  it('flush + open-ended straight draw combo = 15 outs to a straight or flush', () => {
    const o = outsToCategories(h('9h8h'), parseCards('7h 6d 2h'), [Category.Straight, Category.Flush, Category.StraightFlush]);
    expect(o).toHaveLength(15);
  });

  it('a card that puts three suited cards on the board is a dirty straight out', () => {
    const r = findOuts(h('9c8d'), parseCards('7h 6h 2s'));
    const straightOuts = r.outs.filter((o) => o.category === Category.Straight);
    expect(straightOuts).toHaveLength(8);
    const dirty = straightOuts.filter((o) => o.dirty).map((o) => cardToString(o.card)).sort();
    expect(dirty).toEqual(['5h', 'Th']);
    expect(straightOuts.filter((o) => !o.dirty)).toHaveLength(6);
    expect(straightOuts.find((o) => o.dirty)!.reasons[0]).toMatch(/flush/);
  });

  it('cards that only pair the board do not count as outs for a high-card hand', () => {
    const r = findOuts(h('AhKh'), parseCards('Qh 7h 2c'));
    const names = r.outs.map((o) => cardToString(o.card));
    expect(names).not.toContain('Qd'); // pairing the board's queen does not give AK a real pair
    expect(names).toContain('As');
  });

  it('a set needs no help on the board: pocket pair outs on the flop improve to trips', () => {
    const r = findOuts(h('8c8d'), parseCards('Ah 5s 2d'));
    expect(r.outs.filter((o) => o.category === Category.Trips)).toHaveLength(2);
  });

  it('only the out card\'s own suit makes it dirty; an existing flush is a note, not a reason', () => {
    const r = findOuts(h('9c8d'), parseCards('7h 6h 2h'));
    const straight = r.outs.filter((o) => o.category === Category.Straight);
    expect(straight).toHaveLength(8);
    const dirty = straight.filter((o) => o.dirty).map((o) => cardToString(o.card)).sort();
    expect(dirty).toEqual(['5h', 'Th']);
    expect(straight.find((o) => cardToString(o.card) === 'Th')!.reasons[0]).toMatch(/fourth heart/);
    const clean = straight.find((o) => cardToString(o.card) === 'Tc')!;
    expect(clean.reasons).toEqual([]);
    expect(clean.notes[0]).toMatch(/flush is already possible/);
    expect(r.boardNotes).toContain('A flush is already possible on this board.');
  });

  it('board-pairing cards are not "two pair" outs', () => {
    const r = findOuts(h('Ks7d'), parseCards('Kh 9c 2d 4s'));
    const names = r.outs.map((o) => cardToString(o.card)).sort();
    expect(names).toEqual(['7c', '7h', '7s', 'Kc', 'Kd']);
    // pocket pair: pairing the board is not an out, but the set + board pair is a full house
    expect(findOuts(h('8c8d'), parseCards('Ah 5s 2d')).outs.some((o) => o.category === Category.TwoPair)).toBe(false);
    const set = findOuts(h('8c8d'), parseCards('8h 5s 2d Kc'));
    expect(set.outs.filter((o) => o.category === Category.FullHouse)).toHaveLength(9); // 3 fives, 3 twos, 3 kings
    expect(set.outs.filter((o) => o.category === Category.Quads)).toHaveLength(1);
    // 77 on K-K-2: another king gives everyone the full house of kings, so it is not an out
    expect(findOuts(h('7c7d'), parseCards('Kh Ks 2d')).outs.map((o) => cardToString(o.card)).sort()).toEqual(['7h', '7s']);
  });

  it('idiot-end straight outs are risky', () => {
    const r = findOuts(h('5c4d'), parseCards('7h 6s Kd'));
    const eights = r.outs.filter((o) => rankChar(o.card) === '8');
    expect(eights).toHaveLength(4);
    expect(eights.every((o) => o.dirty && /idiot end/.test(o.reasons.join(' ')))).toBe(true);
    expect(r.outs.filter((o) => rankChar(o.card) === '3').every((o) => !o.dirty)).toBe(true);
    // an open-ended draw on top is not the idiot end
    expect(findOuts(h('9c8d'), parseCards('7h 6s 2d')).outs.filter((o) => o.category === Category.Straight).every((o) => !o.dirty)).toBe(true);
  });

  it('a single card that makes a higher straight for an opponent is flagged', () => {
    // 5-6-7 + 4 on the turn: an 8 gives you 4-8 but any 9 makes 5-9
    const r = findOuts(h('4c2d'), parseCards('5h 6s 7d Kc'));
    const eight = r.outs.find((o) => cardToString(o.card) === '8c')!;
    expect(eight.dirty).toBe(true);
    expect(eight.reasons.join(' ')).toMatch(/single nine/);
  });

  it('non-nut flush outs are risky; nut flush outs are clean; a board-pairing flush out is risky but counted', () => {
    const low = findOuts(h('7h6h'), parseCards('Ah Kh 2c'));
    const flush = low.outs.filter((o) => o.category === Category.Flush);
    expect(flush).toHaveLength(9);
    expect(flush.every((o) => o.dirty && /low flush/.test(o.reasons.join(' ')))).toBe(true);
    const nut = findOuts(h('AhKh'), parseCards('Qh 7h 2c'));
    const nf = nut.outs.filter((o) => o.category === Category.Flush);
    expect(nf).toHaveLength(9);
    expect(nf.filter((o) => o.dirty).map((o) => cardToString(o.card))).toEqual(['2h']);
    expect(nut.clean).toHaveLength(14);
    expect(nut.dirty).toHaveLength(1);
    // The king is the nut flush card when the ace is on the board
    const k = findOuts(h('Kh3c'), parseCards('Ah 7h 2h'));
    expect(k.outs.filter((o) => o.category === Category.Flush).every((o) => !/not the best one/.test(o.reasons.join(' ')))).toBe(true);
  });

  it('a decent non-nut flush draw with two hole cards has clean flush outs (an opponent would need two higher suited cards)', () => {
    // Regression: KhJh on Th6h2c flagged 8 of 9 flush outs risky
    const kj = findOuts(h('KhJh'), parseCards('Th 6h 2c'));
    const fl = kj.outs.filter((o) => o.category === Category.Flush);
    expect(fl).toHaveLength(9);
    // Only the cards that pair the board are risky
    expect(fl.filter((o) => o.dirty).map((o) => cardToString(o.card)).sort()).toEqual(['2h']);
    expect(fl.find((o) => cardToString(o.card) === '3h')!.notes.some((n) => /two hearts/.test(n))).toBe(true);
    const qj = findOuts(h('QhJh'), parseCards('Ah 6h 2c'));
    const qf = qj.outs.filter((o) => o.category === Category.Flush);
    expect(qf.filter((o) => o.dirty).map((o) => cardToString(o.card))).toEqual(['2h']);
    // A low flush (nine high with several higher hearts unseen) stays risky
    const low = findOuts(h('9h8h'), parseCards('Kh 7h 2c'));
    expect(low.outs.filter((o) => o.category === Category.Flush && !o.dirty)).toHaveLength(0);
    // With four of the suit on the board, one higher suited card beats us: risky
    const four = findOuts(h('Jh3c'), parseCards('Th 6h 2h 9c'));
    expect(four.outs.filter((o) => o.category === Category.Flush).every((o) => o.dirty && /single higher/.test(o.reasons.join(' ')))).toBe(true);
  });

  it('overcard outs: two-tone flop flags only the card of the two-tone suit', () => {
    const r = findOuts(h('AcKd'), parseCards('9h 6h 2s'));
    const pairs = r.outs.filter((o) => o.category === Category.Pair);
    expect(pairs).toHaveLength(6);
    expect(pairs.filter((o) => o.dirty).map((o) => cardToString(o.card)).sort()).toEqual(['Ah', 'Kh']);
  });

  it('rule of 2 and 4 vs exact', () => {
    expect(ruleOf2And4(9, 2)).toBe(36);
    expect(ruleOf2And4(9, 1)).toBe(18);
    expect(ruleOf2And4(15, 2, true)).toBe(53);
    expect(exactHitChance(9, 47, 2)).toBeCloseTo(0.3496, 3);
    expect(exactHitChance(9, 46, 1)).toBeCloseTo(0.1957, 3);
  });
});

describe('board texture', () => {
  const t = (s: string) => classifyBoard(parseCards(s));
  it('classifies dry, medium, wet', () => {
    expect(t('Ks 7d 2c').wetness).toBe('dry');
    expect(t('As 7d 2c').wetness).toBe('dry');
    expect(t('7d 7c 2s').wetness).toBe('dry');
    expect(t('Jh 9h 4c').wetness).toBe('medium');
    expect(t('9h 8h 7c').wetness).toBe('wet');
    expect(t('Qh Jh Ts').wetness).toBe('wet');
    expect(t('Qs 7s 2s').wetness).toBe('wet');
  });
  it('reports suits and pairing', () => {
    expect(t('Qs 7s 2s').suits).toBe('monotone');
    expect(t('Ks 7d 2c').suits).toBe('rainbow');
    expect(t('Ks 7s 2c').suits).toBe('two-tone');
    expect(t('7d 7c 2s').paired).toBe('paired');
    expect(t('7d 7c 7s 2s').paired).toBe('trips');
  });
  it('three of a suit on the turn is a three-flush, not two-tone', () => {
    expect(t('Kh 7h 2c 5h').suits).toBe('three-flush');
    expect(t('Kh 7h 2c 5d').suits).toBe('two-tone');
    expect(t('Kh 7h 2h 5h').suits).toBe('four-flush');
  });
  it('wheel-ish boards count the ace as low', () => {
    expect(t('Ad 3c 4s').connected).toBe(3);
  });
});


describe('outs when the new card also puts a straight on the board', () => {
  it('8d Tc on 3d 7c 5h 6d: a 4 still gives hero a higher straight (a risky out), agreeing with the draw detector', () => {
    const r = findOuts(h('8d Tc'), parseCards('3d 7c 5h 6d'));
    const fours = r.outs.filter((o) => rankChar(o.card) === '4');
    expect(fours).toHaveLength(4);
    expect(fours.every((o) => o.category === Category.Straight && o.dirty)).toBe(true);
    expect(fours[0]!.reasons.join(' ')).toMatch(/straight on the board for everyone/);
    const nines = r.outs.filter((o) => rankChar(o.card) === '9' && o.category === Category.Straight);
    expect(nines).toHaveLength(4);
  });
  it('a card that makes a straight on the board that hero cannot beat is not an out', () => {
    // Board 5-6-7-8 + a 9 makes 5-9 for everyone; hero's 2-3 adds nothing.
    const r = findOuts(h('2c 3d'), parseCards('5h 6s 7d 8c'));
    expect(r.outs.some((o) => rankChar(o.card) === '9')).toBe(false);
  });
});
