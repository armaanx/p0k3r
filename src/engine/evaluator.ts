import { type Card, rankOf, suitOf, RANK_NAMES, RANK_PLURALS } from './cards';

/**
 * Hand evaluator for 5–7 cards.
 * Score = category << 20 | five 4-bit rank nibbles (most significant first).
 * Higher score always beats lower; equal score = exact tie (split).
 */
export const Category = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;
export type Category = (typeof Category)[keyof typeof Category];

export const CATEGORY_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

// STRAIGHT_HIGH[mask] = highest card rank of the best straight in a 13-bit rank mask, or -1.
// Wheel (A-2-3-4-5) has high rank 3 (the Five).
const STRAIGHT_HIGH = new Int8Array(8192).fill(-1);
for (let mask = 0; mask < 8192; mask++) {
  for (let high = 12; high >= 4; high--) {
    const need = 0b11111 << (high - 4);
    if ((mask & need) === need) {
      STRAIGHT_HIGH[mask] = high;
      break;
    }
  }
  if (STRAIGHT_HIGH[mask] === -1 && (mask & 0x100f) === 0x100f) STRAIGHT_HIGH[mask] = 3;
}

/** Highest straight in a 13-bit rank mask (bit r = rank r is present): its high rank (3 for the wheel), or -1 for none. */
export const straightHigh = (mask: number): number => STRAIGHT_HIGH[mask & 0x1fff]!;

/**
 * The ranks that form the "made" part of a pair-type hand (the pair, both pairs, the trips, trips + pair, the quads).
 * Empty for a high-card hand; for straights and flushes the whole five cards are the made part, so this is also empty.
 */
export function madeRanks(score: number): number[] {
  const n = (i: number): number => (score >> (16 - 4 * i)) & 15;
  switch (categoryOf(score)) {
    case Category.Pair:
    case Category.Trips:
    case Category.Quads:
      return [n(0)];
    case Category.TwoPair:
    case Category.FullHouse:
      return [n(0), n(1)];
    default:
      return [];
  }
}

const pack = (cat: number, a: number, b = 0, c = 0, d = 0, e = 0): number =>
  (cat << 20) | (a << 16) | (b << 12) | (c << 8) | (d << 4) | e;

/** Take the top `n` set bits of a rank mask, as descending ranks. */
function topRanks(mask: number, n: number, out: number[] = []): number[] {
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

const counts = new Int8Array(13);
const suitMasks = new Int32Array(4);
const suitCounts = new Int8Array(4);

export function evaluate(cards: readonly Card[]): number {
  counts.fill(0);
  suitMasks.fill(0);
  suitCounts.fill(0);
  let rankMask = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]!;
    const r = c >> 2;
    const s = c & 3;
    counts[r]!++;
    suitMasks[s]! |= 1 << r;
    suitCounts[s]!++;
    rankMask |= 1 << r;
  }

  // Flush / straight flush
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCounts[s]! >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const fm = suitMasks[flushSuit]!;
    const sh = STRAIGHT_HIGH[fm]!;
    if (sh >= 0) return pack(Category.StraightFlush, sh);
  }

  // Group by multiplicity
  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;
  for (let r = 12; r >= 0; r--) {
    const n = counts[r]!;
    if (n === 4) quad = r;
    else if (n === 3) {
      if (trip1 < 0) trip1 = r;
      else trip2 = r;
    } else if (n === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r; // a third pair only matters as a kicker (handled via rankMask)
    }
  }

  if (quad >= 0) {
    const kick = topRanks(rankMask & ~(1 << quad), 1)[0]!;
    return pack(Category.Quads, quad, kick);
  }
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
    const pr = Math.max(trip2, pair1);
    return pack(Category.FullHouse, trip1, pr);
  }
  if (flushSuit >= 0) {
    const t = topRanks(suitMasks[flushSuit]!, 5);
    return pack(Category.Flush, t[0]!, t[1]!, t[2]!, t[3]!, t[4]!);
  }
  const sh = STRAIGHT_HIGH[rankMask]!;
  if (sh >= 0) return pack(Category.Straight, sh);
  if (trip1 >= 0) {
    const k = topRanks(rankMask & ~(1 << trip1), 2);
    return pack(Category.Trips, trip1, k[0]!, k[1]!);
  }
  if (pair2 >= 0) {
    // With three pairs, the third pair's rank may be the best kicker.
    const used = (1 << pair1) | (1 << pair2);
    const k = topRanks(rankMask & ~used, 1)[0]!;
    return pack(Category.TwoPair, pair1, pair2, k);
  }
  if (pair1 >= 0) {
    const k = topRanks(rankMask & ~(1 << pair1), 3);
    return pack(Category.Pair, pair1, k[0]!, k[1]!, k[2]!);
  }
  const t = topRanks(rankMask, 5);
  return pack(Category.HighCard, t[0]!, t[1]!, t[2]!, t[3]!, t[4]!);
}

export const categoryOf = (score: number): Category => (score >> 20) as Category;

/** Plain-English description, e.g. "Pair of Kings", "Flush, Ace high". */
export function describeScore(score: number): string {
  const cat = categoryOf(score);
  const n = (i: number): number => (score >> (16 - 4 * i)) & 15;
  switch (cat) {
    case Category.HighCard:
      return `${RANK_NAMES[n(0)]} high`;
    case Category.Pair:
      return `Pair of ${RANK_PLURALS[n(0)]}`;
    case Category.TwoPair:
      return `Two pair, ${RANK_PLURALS[n(0)]} and ${RANK_PLURALS[n(1)]}`;
    case Category.Trips:
      return `Three ${RANK_PLURALS[n(0)]}`;
    case Category.Straight:
      return n(0) === 3 ? 'Straight, Five high (the wheel)' : `Straight, ${RANK_NAMES[n(0)]} high`;
    case Category.Flush:
      return `Flush, ${RANK_NAMES[n(0)]} high`;
    case Category.FullHouse:
      return `Full house, ${RANK_PLURALS[n(0)]} full of ${RANK_PLURALS[n(1)]}`;
    case Category.Quads:
      return `Four ${RANK_PLURALS[n(0)]}`;
    case Category.StraightFlush:
      return n(0) === 12 ? 'Royal flush' : `Straight flush, ${RANK_NAMES[n(0)]} high`;
  }
}

/** The best 5-card hand from 5–7 cards (brute force over combinations; UI/teaching use). */
export function bestFive(cards: readonly Card[]): { cards: Card[]; score: number } {
  if (cards.length <= 5) return { cards: [...cards], score: evaluate(cards) };
  let best = -1;
  let bestCards: Card[] = [];
  const n = cards.length;
  const idx = [0, 1, 2, 3, 4];
  for (;;) {
    const combo = idx.map((i) => cards[i]!);
    const s = evaluate(combo);
    if (s > best) {
      best = s;
      bestCards = combo;
    }
    let i = 4;
    while (i >= 0 && idx[i] === n - 5 + i) i--;
    if (i < 0) break;
    idx[i]!++;
    for (let j = i + 1; j < 5; j++) idx[j] = idx[j - 1]! + 1;
  }
  return { cards: bestCards, score: best };
}

/** True if the board alone makes a 5-card hand that nobody can improve on with hole cards ("the board plays"). */
export function boardPlays(hole: readonly Card[], board: readonly Card[]): boolean {
  if (board.length < 5) return false;
  return evaluate([...hole, ...board]) === evaluate(board);
}

export { rankOf, suitOf };
