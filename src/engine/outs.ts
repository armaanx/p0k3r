// Outs: cards that improve a hand, "dirty" (risky) outs, and the Rule of 2 and 4.
import { type Card, deckWithout, makeCard, rankOf, suitOf, RANK_CHARS, RANK_NAMES, SUIT_NAMES } from './cards';
import { Category, categoryOf, describeScore, evaluate, straightHigh } from './evaluator';

/**
 * One card that improves hero's hand.
 *
 * Clean vs risky: `dirty === false` is a clean out; `dirty === true` is a risky ("dirty") out that is still a real
 * improvement for hero but could also give an opponent a better hand (it completes a flush or a higher straight for
 * someone, pairs the board under a straight/flush, or gives hero a flush that is not the best one). Callers can count
 * either `clean` or all `outs` (clean + risky). `notes` give context that does NOT make the card dirty.
 */
export interface OutCard {
  card: Card;
  /** What hero would have after this card arrives. */
  improvesTo: string;
  category: Category;
  /** True when this card is a risky ("dirty") out: it could also give an opponent a better hand. */
  dirty: boolean;
  /** Plain-English reasons why this particular card is risky (empty for a clean out). */
  reasons: string[];
  /** Plain-English context that does not make the card risky, e.g. "a flush is already possible on this board". */
  notes: string[];
  /** Fraction of random opponent holdings that would beat hero after this card (0..1). Only computed on the turn (0 on the flop). */
  oppBeatShare: number;
}

export interface OutsResult {
  current: string;
  currentCategory: Category;
  /** Every out, clean and risky. */
  outs: OutCard[];
  /** Clean outs (outs with dirty === false). */
  clean: Card[];
  /** Risky / dirty outs (outs with dirty === true). */
  dirty: Card[];
  /** Unseen cards (not in hero's hand or the board). */
  unseen: number;
  /** Warnings about the board as it is now, independent of the next card (e.g. "A flush is already possible on this board."). */
  boardNotes: string[];
}

function suitCount(cards: readonly Card[], suit: number): number {
  let n = 0;
  for (const c of cards) if (suitOf(c) === suit) n++;
  return n;
}

const maxSuitCount = (cards: readonly Card[]): number => Math.max(...[0, 1, 2, 3].map((s) => suitCount(cards, s)));
const isPaired = (cards: readonly Card[]): boolean => new Set(cards.map(rankOf)).size < cards.length;
const rankMask = (cards: readonly Card[]): number => cards.reduce((m, c) => m | (1 << rankOf(c)), 0);
const suitSingular = (s: number): string => SUIT_NAMES[s]!.slice(0, -1).toLowerCase();
const suitPlural = (s: number): string => SUIT_NAMES[s]!.toLowerCase();
const rn = (r: number): string => RANK_NAMES[r]!.toLowerCase();

/** The five ranks of the straight with high card `high` (3 = the wheel). */
const straightRanks = (high: number): number[] => (high === 3 ? [12, 0, 1, 2, 3] : [high - 4, high - 3, high - 2, high - 1, high]);

/**
 * Does `c` improve hero's hand in a way that uses hero's own cards (not just the board improving for everyone)?
 * - The new category must beat what the board plus `c` makes on its own.
 * - Two pair: the new pair must pair one of hero's cards (a card that pairs the board does not count).
 * - Pair / trips / full house / quads: the main rank (the pair, trips or quads) must include one of hero's cards.
 */
function improvesWithHoleCard(hole: readonly Card[], board: readonly Card[], c: Card, now: number): boolean {
  const cat = categoryOf(now);
  const boardOnly = evaluate([...board, c]);
  const boardCat = categoryOf(boardOnly);
  if (cat < boardCat) return false;
  if (cat === boardCat) {
    // The board itself makes this hand for everyone. A straight or flush that uses a hole card and beats
    // the board's version is still a real (if risky) improvement; anything else just plays the board.
    return (cat === Category.Straight || cat === Category.Flush || cat === Category.StraightFlush) && now > boardOnly;
  }
  if (cat === Category.Straight || cat === Category.Flush || cat === Category.StraightFlush) return true;
  const hr = hole.map(rankOf);
  if (cat === Category.TwoPair) return hr.includes(rankOf(c));
  return hr.includes((now >> 16) & 15);
}

/** Ranks (still available to an opponent) that make a higher straight than `heroHigh` with a single card. */
function oneCardStraights(nb: readonly Card[], seen: Set<Card>, heroHigh: number): number[] {
  const m = rankMask(nb);
  const out: number[] = [];
  for (let r = 0; r < 13; r++) {
    if (m & (1 << r)) continue;
    if (![0, 1, 2, 3].some((s) => !seen.has(makeCard(r, s)))) continue;
    if (straightHigh(m | (1 << r)) > heroHigh) out.push(r);
  }
  return out;
}

/** A two-rank holding (still available) that makes a higher straight than `heroHigh`, best first, or null. */
function twoCardStraight(nb: readonly Card[], seen: Set<Card>, heroHigh: number): [number, number] | null {
  const m = rankMask(nb);
  const avail = (r: number): boolean => [0, 1, 2, 3].some((s) => !seen.has(makeCard(r, s)));
  let best: [number, number] | null = null;
  let bestHigh = heroHigh;
  for (let a = 12; a >= 0; a--) {
    for (let b = a - 1; b >= 0; b--) {
      if (!avail(a) || !avail(b)) continue;
      const h = straightHigh(m | (1 << a) | (1 << b));
      if (h > bestHigh) {
        bestHigh = h;
        best = [a, b];
      }
    }
  }
  return best;
}

/** Why might this out be risky? (Card-specific: it could give an opponent a better hand.) Plus non-risk notes. */
function classifyOut(hole: readonly Card[], board: readonly Card[], c: Card, heroScore: number): { reasons: string[]; notes: string[] } {
  const reasons: string[] = [];
  const notes: string[] = [];
  const nb = [...board, c];
  const seen = new Set<Card>([...hole, ...nb]);
  const heroCat = categoryOf(heroScore);
  if (categoryOf(evaluate(nb)) === heroCat && heroCat >= Category.Straight) {
    const what = heroCat === Category.Straight ? 'straight' : heroCat === Category.Flush ? 'flush' : 'straight flush';
    reasons.push(`it also puts a ${what} on the board for everyone: yours is higher, but an opponent can tie it or beat it with a better ${what}`);
  }

  // 1. Flushes. Only this card's own suit can make it dirty.
  if (heroCat < Category.Flush) {
    const s = suitOf(c);
    const after = suitCount(nb, s);
    if (after === 3) reasons.push(`it is the third ${suitSingular(s)} on the board, so an opponent holding two ${suitPlural(s)} would make a flush`);
    else if (after >= 4) reasons.push(`it puts ${after === 4 ? 'a fourth' : 'another'} ${suitSingular(s)} on the board, so an opponent holding a single ${suitSingular(s)} would make a flush`);
    else if (maxSuitCount(board) >= 3) notes.push('a flush is already possible on this board, so even this hand may not be best');
  }

  // 2. Board pairing under a straight or flush: full houses and quads become possible.
  if (heroCat === Category.Straight || heroCat === Category.Flush) {
    if (board.some((b) => rankOf(b) === rankOf(c))) reasons.push('it pairs the board, so an opponent could make a full house');
    else if (isPaired(board)) notes.push('the board is already paired, so a full house is possible');
  }

  // 3. Straights.
  if (heroCat === Category.Straight) {
    const heroHigh = (heroScore >> 16) & 15;
    const one = oneCardStraights(nb, seen, heroHigh);
    if (one.length) {
      reasons.push(`an opponent holding a single ${one.map((r) => rn(r)).join(' or ')} would make a higher straight`);
    } else {
      // The "idiot end": hero supplies only the bottom of the straight, so higher connecting cards beat it.
      const window = straightRanks(heroHigh);
      const nbRanks = new Set(nb.map(rankOf));
      const mine = window.filter((r) => !nbRanks.has(r)).map((r) => (r === 12 && heroHigh === 3 ? -1 : r));
      const boardLow = Math.min(...window.filter((r) => nbRanks.has(r)).map((r) => (r === 12 && heroHigh === 3 ? -1 : r)));
      const two = twoCardStraight(nb, seen, heroHigh);
      if (two && mine.length > 0 && mine.every((r) => r < boardLow)) {
        reasons.push(`it gives you the low end of the straight (the "idiot end"): an opponent holding ${rn(two[0])}-${rn(two[1])} would make a higher straight`);
      }
    }
  } else if (heroCat < Category.Straight) {
    const one = oneCardStraights(nb, seen, -1);
    if (one.length && oneCardStraights(board, seen, -1).length === 0) {
      reasons.push(`it puts four cards to a straight on the board, so an opponent holding a single ${one.map((r) => rn(r)).join(' or ')} would make a straight`);
    }
  }

  // 4. A flush that is not the best possible flush.
  if (heroCat === Category.Flush) {
    const all = [...hole, ...nb];
    const fs = [0, 1, 2, 3].find((s) => suitCount(all, s) >= 5)!;
    const boardSuited = nb.filter((x) => suitOf(x) === fs).map(rankOf);
    const need = 5 - boardSuited.length; // cards of the suit an opponent must hold
    if (need <= 2) {
      const vis = new Set(all.filter((x) => suitOf(x) === fs).map(rankOf));
      const unseenSuited: number[] = [];
      for (let r = 12; r >= 0; r--) if (!vis.has(r)) unseenSuited.push(r);
      if (unseenSuited.length >= need) {
        const oppRanks = [...boardSuited, ...unseenSuited.slice(0, 2)].sort((a, b) => b - a).slice(0, 5);
        const heroRanks = [0, 1, 2, 3, 4].map((i) => (heroScore >> (16 - 4 * i)) & 15);
        let higher = false;
        for (let i = 0; i < 5; i++) {
          if (oppRanks[i]! !== heroRanks[i]!) {
            higher = oppRanks[i]! > heroRanks[i]!;
            break;
          }
        }
        if (higher) {
          const top = unseenSuited[0]!;
          // Risky only when a better flush is realistic: an opponent needs just ONE suited card (the board has four
          // or more of the suit), or hero's flush is low (best suited hole card below a ten with 2+ unseen higher
          // suited cards). An opponent holding two suited cards including a higher one is rare, so a decent flush
          // on a three-suited board is a clean out with a note.
          const heroTopSuited = Math.max(...hole.filter((x) => suitOf(x) === fs).map(rankOf));
          const lowFlush = heroTopSuited < 8 && unseenSuited.filter((r) => r > heroTopSuited).length >= 2;
          if (need <= 1) {
            reasons.push(`it gives you a flush, but not the best one: an opponent holding a single higher ${suitSingular(fs)} (such as the ${rn(top)}) would have a better flush`);
          } else if (lowFlush) {
            reasons.push(`it gives you a low flush: an opponent holding two ${suitPlural(fs)} including a higher one (such as the ${rn(top)}) would have a better flush`);
          } else {
            notes.push(`an opponent holding two ${suitPlural(fs)} including a higher one (such as the ${rn(top)}) would have a better flush, but that is rare`);
          }
        }
      }
    }
  }
  return { reasons, notes };
}

/** Share of opponent 2-card holdings that beat `heroScore` on the given full board. */
function oppBeatShare(hole: readonly Card[], board: readonly Card[], heroScore: number): number {
  const rest = deckWithout([...hole, ...board]);
  let beat = 0;
  let total = 0;
  const h: Card[] = [0, 0, ...board];
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      h[0] = rest[i]!;
      h[1] = rest[j]!;
      total++;
      if (evaluate(h) > heroScore) beat++;
    }
  }
  return total ? beat / total : 0;
}

/** Board-level warnings (true before any new card arrives). */
function boardWarnings(board: readonly Card[]): string[] {
  const out: string[] = [];
  if (maxSuitCount(board) >= 3) out.push('A flush is already possible on this board.');
  if (isPaired(board)) out.push('The board is paired, so a full house is already possible.');
  return out;
}

/**
 * Find every card that improves hero's hand category using a hole card (so a card that only
 * improves the board for everyone doesn't count), and flag the risky ("dirty") ones.
 * Works on the flop (3 board cards) or turn (4).
 */
export function findOuts(hole: readonly [Card, Card], board: readonly Card[]): OutsResult {
  if (board.length < 3 || board.length > 4) throw new Error('findOuts needs a flop or turn board');
  const current = evaluate([...hole, ...board]);
  const currentCategory = categoryOf(current);
  const outs: OutCard[] = [];
  for (const c of deckWithout([...hole, ...board])) {
    const now = evaluate([...hole, ...board, c]);
    const cat = categoryOf(now);
    if (cat <= currentCategory || !improvesWithHoleCard(hole, board, c, now)) continue;
    const { reasons, notes } = classifyOut(hole, board, c, now);
    const share = board.length === 4 ? oppBeatShare(hole, [...board, c], now) : 0;
    outs.push({ card: c, improvesTo: describeScore(now), category: cat, dirty: reasons.length > 0, reasons, notes, oppBeatShare: share });
  }
  return {
    current: describeScore(current),
    currentCategory,
    outs,
    clean: outs.filter((o) => !o.dirty).map((o) => o.card),
    dirty: outs.filter((o) => o.dirty).map((o) => o.card),
    unseen: 52 - hole.length - board.length,
    boardNotes: boardWarnings(board),
  };
}

/**
 * Cards that give hero a hand of one of the given categories, using at least one hole card
 * (the same "real improvement" test as findOuts). Counts every such card, clean or risky.
 */
export function outsToCategories(hole: readonly [Card, Card], board: readonly Card[], cats: readonly Category[]): Card[] {
  const out: Card[] = [];
  for (const c of deckWithout([...hole, ...board])) {
    const now = evaluate([...hole, ...board, c]);
    if (cats.includes(categoryOf(now)) && improvesWithHoleCard(hole, board, c, now)) out.push(c);
  }
  return out;
}

/**
 * The Rule of 2 and 4: ×4 with two cards to come (flop), ×2 with one (turn).
 * `adjusted`: for big draws (more than 8 outs) subtract (outs − 8) from the ×4 figure (9 → 35, 12 → 44, 15 → 53).
 * Label an adjusted figure "Rule of 4, adjusted".
 */
export function ruleOf2And4(outs: number, cardsToCome: 1 | 2, adjusted = false): number {
  if (cardsToCome === 1) return outs * 2;
  const base = outs * 4;
  return adjusted && outs > 8 ? base - (outs - 8) : base;
}

/** Exact chance of hitting at least one of `outs` with `cardsToCome` cards from `unseen`. */
export function exactHitChance(outs: number, unseen: number, cardsToCome: 1 | 2): number {
  if (cardsToCome === 1) return outs / unseen;
  return 1 - ((unseen - outs) / unseen) * ((unseen - outs - 1) / (unseen - 1));
}

export const rankChar = (c: Card): string => RANK_CHARS[rankOf(c)]!;
