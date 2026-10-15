import { describe, expect, it } from 'vitest';
import { parseCards, fullDeck, type Card } from './cards';
import { evaluate, categoryOf, Category, describeScore, bestFive, boardPlays } from './evaluator';
import { createRng } from './rng';

const ev = (s: string): number => evaluate(parseCards(s));
const cat = (s: string): number => categoryOf(ev(s));

describe('evaluator: categories', () => {
  it('recognises every category', () => {
    expect(cat('As Kd 9h 5c 3d')).toBe(Category.HighCard);
    expect(cat('As Ad 9h 5c 3d')).toBe(Category.Pair);
    expect(cat('As Ad 9h 9c 3d')).toBe(Category.TwoPair);
    expect(cat('As Ad Ah 9c 3d')).toBe(Category.Trips);
    expect(cat('5s 6d 7h 8c 9d')).toBe(Category.Straight);
    expect(cat('As Ks 9s 5s 3s')).toBe(Category.Flush);
    expect(cat('As Ad Ah 9c 9d')).toBe(Category.FullHouse);
    expect(cat('As Ad Ah Ac 9d')).toBe(Category.Quads);
    expect(cat('5s 6s 7s 8s 9s')).toBe(Category.StraightFlush);
  });

  it('orders categories correctly', () => {
    const hands = [
      'As Kd 9h 5c 3d', 'As Ad 9h 5c 3d', 'As Ad 9h 9c 3d', 'As Ad Ah 9c 3d', '5s 6d 7h 8c 9d',
      'As Ks 9s 5s 3s', 'As Ad Ah 9c 9d', 'As Ad Ah Ac 9d', '5s 6s 7s 8s 9s',
    ].map(ev);
    for (let i = 1; i < hands.length; i++) expect(hands[i]).toBeGreaterThan(hands[i - 1]!);
  });

  it('handles the wheel (A-5 straight) as the lowest straight', () => {
    expect(cat('As 2d 3h 4c 5d')).toBe(Category.Straight);
    expect(ev('As 2d 3h 4c 5d')).toBeLessThan(ev('2s 3d 4h 5c 6d'));
    expect(describeScore(ev('As 2d 3h 4c 5d'))).toMatch(/wheel/);
    // 7-card: wheel + a higher pair must still be a straight, not a pair
    expect(cat('As 2d 3h 4c 5d Kd Kc')).toBe(Category.Straight);
  });

  it('broadway beats wheel; ace is not a wrap-around card (Q-K-A-2-3 is not a straight)', () => {
    expect(ev('Ts Jd Qh Kc Ad')).toBeGreaterThan(ev('As 2d 3h 4c 5d'));
    expect(cat('Qs Kd Ah 2c 3d')).toBe(Category.HighCard);
  });

  it('straight flush wheel and royal flush', () => {
    expect(cat('As 2s 3s 4s 5s')).toBe(Category.StraightFlush);
    expect(describeScore(ev('As Ks Qs Js Ts'))).toBe('Royal flush');
    expect(ev('As Ks Qs Js Ts')).toBeGreaterThan(ev('Ks Qs Js Ts 9s'));
  });

  it('does not confuse a flush and a straight that are made of different cards (7 cards)', () => {
    // Flush in spades, straight uses an off-suit card: should rate as flush
    expect(cat('As 9s 5s 3s 2s 4d 6h')).toBe(Category.Flush);
    // 6 spades with straight-flush only on 5 of them
    expect(cat('5s 6s 7s 8s 9s Ks 2d')).toBe(Category.StraightFlush);
  });
});

describe('evaluator: tie-breaks and kickers', () => {
  it('kickers decide pairs', () => {
    expect(ev('As Ad Kh 5c 3d')).toBeGreaterThan(ev('Ac Ah Qh Jc Td'));
    expect(ev('As Ad Kh 5c 3d')).toBeGreaterThan(ev('Ac Ah Kd 4c 3h'));
    expect(ev('As Ad Kh 5c 3d')).toBe(ev('Ac Ah Kd 5d 3h')); // exact tie
  });

  it('two pair: higher pair, lower pair, then kicker', () => {
    expect(ev('As Ad 2h 2c Kd')).toBeGreaterThan(ev('Ks Kd Qh Qc Ad'));
    expect(ev('Ks Kd Qh Qc Ad')).toBeGreaterThan(ev('Ks Kd Jh Jc Ad'));
    expect(ev('Ks Kd Qh Qc Ad')).toBeGreaterThan(ev('Ks Kd Qh Qc 2d'));
  });

  it('three pairs in seven cards uses the best two pairs and best remaining kicker', () => {
    // AA KK QQ + 2: best hand is AAKK with Q kicker
    const s = ev('As Ad Ks Kd Qs Qd 2c');
    expect(s).toBe(ev('As Ad Ks Kd Qc'));
  });

  it('full house: trips rank first, then pair; two sets of trips make a boat', () => {
    expect(ev('3s 3d 3h 2c 2d')).toBeGreaterThan(ev('2s 2d 2h Ac Ad'));
    expect(cat('As Ad Ah Ks Kd Kh 2c')).toBe(Category.FullHouse);
    expect(ev('As Ad Ah Ks Kd Kh 2c')).toBe(ev('As Ad Ah Ks Kd'));
  });

  it('quads kicker in 7 cards picks the highest remaining card', () => {
    expect(ev('9s 9d 9h 9c 2d Ah Kc')).toBe(ev('9s 9d 9h 9c Ah'));
  });

  it('flush compares card by card, uses best five of six', () => {
    expect(ev('As Ks 9s 5s 3s')).toBeGreaterThan(ev('As Ks 9s 5s 2s'));
    expect(ev('As Ks 9s 5s 3s 2s 7d')).toBe(ev('As Ks 9s 5s 3s'));
  });

  it('describeScore is plain English', () => {
    expect(describeScore(ev('As Ad Kh 5c 3d'))).toBe('Pair of Aces');
    expect(describeScore(ev('As Ad Ah Ks Kd'))).toBe('Full house, Aces full of Kings');
    expect(describeScore(ev('As Kd 9h 5c 3d'))).toBe('Ace high');
  });
});

describe('evaluator: board plays', () => {
  it('detects when the board plays', () => {
    const board = parseCards('As Ks Qs Js Ts');
    expect(boardPlays(parseCards('2c 3d'), board)).toBe(true);
    expect(boardPlays(parseCards('9s 8s'), board)).toBe(true);
    const board2 = parseCards('2s 2d 2h 2c 9d');
    expect(boardPlays(parseCards('3c 4d'), board2)).toBe(true);
    expect(boardPlays(parseCards('Ac 4d'), board2)).toBe(false); // ace kicker plays
  });
});

describe('bestFive', () => {
  it('finds the best five of seven', () => {
    const r = bestFive(parseCards('As Ad Ah Ks Kd 2c 3d'));
    expect(describeScore(r.score)).toBe('Full house, Aces full of Kings');
    expect(r.cards).toHaveLength(5);
  });
});

// ---- Independent naive evaluator for cross-checking ----
function naive5(cards: Card[]): number[] {
  const ranks = cards.map((c) => c >> 2).sort((a, b) => b - a);
  const flush = cards.every((c) => (c & 3) === (cards[0]! & 3));
  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    else if (ranks.join() === '12,3,2,1,0') straightHigh = 3;
  }
  const groups = new Map<number, number>();
  for (const r of ranks) groups.set(r, (groups.get(r) ?? 0) + 1);
  const g = [...groups.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = g.map((x) => x[1]).join('');
  const gr = g.map((x) => x[0]);
  if (straightHigh >= 0 && flush) return [8, straightHigh];
  if (shape === '41') return [7, ...gr];
  if (shape === '32') return [6, ...gr];
  if (flush) return [5, ...ranks];
  if (straightHigh >= 0) return [4, straightHigh];
  if (shape === '311') return [3, ...gr];
  if (shape === '221') return [2, ...gr];
  if (shape === '2111') return [1, ...gr];
  return [0, ...ranks];
}
const cmp = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
};
function naiveBest7(cards: Card[]): number[] {
  let best: number[] = [-1];
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++) {
      const five = cards.filter((_, i) => i !== a && i !== b);
      const v = naive5(five);
      if (cmp(v, best) > 0) best = v;
    }
  return best;
}

describe('evaluator: exhaustive and randomized validation', () => {
  it('matches the known 5-card category frequencies over all 2,598,960 hands', () => {
    const deck = fullDeck();
    const counts = new Array(9).fill(0) as number[];
    const h: Card[] = [0, 0, 0, 0, 0];
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              h[0] = deck[a]!; h[1] = deck[b]!; h[2] = deck[c]!; h[3] = deck[d]!; h[4] = deck[e]!;
              counts[evaluate(h) >> 20]!++;
            }
    // High card, pair, two pair, trips, straight, flush, full house, quads, straight flush (incl. royal)
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  });

  it('agrees with an independent naive evaluator on 20,000 random 7-card hands (order of hands)', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 20000; i++) {
      const d = rng.shuffle(fullDeck());
      const x = d.slice(0, 7);
      const y = d.slice(7, 14);
      const fast = Math.sign(evaluate(x) - evaluate(y));
      const slow = Math.sign(cmp(naiveBest7(x), naiveBest7(y)));
      expect(fast).toBe(slow);
      expect(evaluate(x) >> 20).toBe(naiveBest7(x)[0]);
    }
  });

  it('is independent of card order', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const x = rng.shuffle(fullDeck()).slice(0, 7);
      const s = evaluate(x);
      expect(evaluate(rng.shuffle([...x]))).toBe(s);
    }
  });
});
