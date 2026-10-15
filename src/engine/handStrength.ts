// Postflop hand-strength buckets ("made hand vs draw vs air") used by the coach and the bots.
import { type Card, rankOf, suitOf, RANK_NAMES, RANK_PLURALS } from './cards';
import { Category, bestFive, categoryOf, describeScore, evaluate, madeRanks, straightHigh } from './evaluator';

export type Bucket = 'monster' | 'strong' | 'medium' | 'weak' | 'draw' | 'air';

/**
 * Shape of a straight draw:
 * - 'open-ended': four ranks in a row with both ends live (8 outs)
 * - 'double-gutshot': two different completing ranks, but not four in a row (8 outs)
 * - 'gutshot': one completing rank (4 outs), including a one-ended run like J-Q-K-A
 */
export type StraightKind = 'none' | 'gutshot' | 'double-gutshot' | 'open-ended';

export interface DrawInfo {
  flushDraw: boolean;
  /** Hero holds the highest unseen card of the draw's suit (Kh is the nut draw when the Ah is on the board). */
  nutFlushDraw: boolean;
  /** How many of hero's hole cards are in the flush draw (0 = no flush draw; 1 on a three-suited flop is a weaker draw). */
  flushDrawHoleCards: number;
  backdoorFlush: boolean;
  /**
   * Number of ranks that would complete a straight that needs one of hero's hole cards
   * (0 = no draw, 1 = gutshot, 2+ = open-ended or double gutshot). Board-only straight draws and
   * hole ranks that duplicate a board rank are not counted.
   */
  straightRanks: number;
  /** The shape of the straight draw (see StraightKind). */
  straightKind: StraightKind;
  overcards: number;
  /** Count of "strong" draws: flush draw or 8+ out straight draw. */
  strong: boolean;
  /** Any draw at all with real equity (gutshot, overcards, backdoor are "weak"). */
  any: boolean;
}

export interface Assessment {
  bucket: Bucket;
  /** Plain-English label, e.g. "Top pair, good kicker". */
  label: string;
  category: Category;
  description: string; // e.g. "Pair of Kings" (the best five cards, which may be mostly the board)
  /**
   * True when at least one hole card is part of the made hand itself: the pair / two pair / trips / full house /
   * quads ranks, or the five cards of a straight or flush. For a high-card hand: a hole card plays in the best five.
   * False when the board plays, or when the board makes the hand and hero's cards are only kickers.
   */
  usesHoleCards: boolean;
  /**
   * True when the board alone makes the hand's category (pair or better) and hero's cards are at most kickers,
   * e.g. As3d on Kh Kc 9d 9s 5c, or AhQc on 6h 6s 6d. This is never hero's own made hand. Also true when the board plays.
   */
  boardMade: boolean;
  draws: DrawInfo;
  /** Pair quality details for pair-type hands. */
  pair: 'none' | 'overpair' | 'top' | 'second' | 'middle' | 'bottom' | 'underpair' | 'board';
}

const rankMask = (cards: readonly Card[]): number => {
  let m = 0;
  for (const c of cards) m |= 1 << rankOf(c);
  return m;
};

/** Ranks that complete a straight which is better than anything the board (plus that rank) makes on its own. */
export function straightCompletingRanks(hole: readonly Card[], board: readonly Card[]): number[] {
  const boardMask = rankMask(board);
  const allMask = boardMask | rankMask(hole);
  const out: number[] = [];
  for (let r = 0; r < 13; r++) {
    const bit = 1 << r;
    if (allMask & bit) continue; // a rank we already have adds nothing to a straight
    const mine = straightHigh(allMask | bit);
    if (mine >= 0 && mine > straightHigh(boardMask | bit)) out.push(r);
  }
  return out;
}

/** Ace-low aware mask: bit 0 = ace as one, bit r+1 = rank r. */
const extMask = (mask: number): number => ((mask << 1) | ((mask >> 12) & 1)) & 0x3fff;
const rankAtPos = (p: number): number => (p === 0 ? 12 : p - 1);

function straightKindOf(completing: readonly number[], allMask: number): StraightKind {
  if (completing.length === 0) return 'none';
  if (completing.length === 1) return 'gutshot';
  const em = extMask(allMask);
  const live = new Set(completing);
  // Four ranks in a row, with the rank just below and just above both completing the straight.
  for (let lo = 1; lo + 4 <= 13; lo++) {
    const run = 0b1111 << lo;
    if ((em & run) !== run) continue;
    if (live.has(rankAtPos(lo - 1)) && live.has(rankAtPos(lo + 4))) return 'open-ended';
  }
  return 'double-gutshot';
}

/** Highest rank of `suit` that is not among `seen` (-1 if all are visible). */
function topUnseenOfSuit(seen: readonly Card[], suit: number): number {
  const vis = new Set(seen.filter((c) => suitOf(c) === suit).map(rankOf));
  for (let r = 12; r >= 0; r--) if (!vis.has(r)) return r;
  return -1;
}

export function detectDraws(hole: readonly [Card, Card], board: readonly Card[]): DrawInfo {
  const all = [...hole, ...board];
  let flushDraw = false;
  let nutFlushDraw = false;
  let flushDrawHoleCards = 0;
  let backdoorFlush = false;
  for (let s = 0; s < 4; s++) {
    const total = all.filter((c) => suitOf(c) === s).length;
    const mine = hole.filter((c) => suitOf(c) === s);
    if (mine.length === 0) continue;
    if (total === 4) {
      flushDraw = true;
      flushDrawHoleCards = mine.length;
      const myTop = Math.max(...mine.map(rankOf));
      if (myTop > topUnseenOfSuit(all, s)) nutFlushDraw = true;
    } else if (total === 3 && board.length === 3) {
      backdoorFlush = true; // needs both the turn and river to be that suit
    }
  }
  const made = categoryOf(evaluate(all));
  const completing = made >= Category.Straight ? [] : straightCompletingRanks(hole, board);
  const sr = completing.length;
  const straightKind = straightKindOf(completing, rankMask(all));
  const boardTop = Math.max(...board.map(rankOf));
  const overcards = hole.filter((c) => rankOf(c) > boardTop).length;
  const strong = flushDraw || sr >= 2;
  return {
    flushDraw, nutFlushDraw, flushDrawHoleCards, backdoorFlush, straightRanks: sr, straightKind, overcards, strong,
    any: strong || sr === 1 || overcards >= 1 || backdoorFlush,
  };
}

/**
 * When the board makes the hand (board trips, board two pair, board quads), do hero's kickers beat or tie every
 * other kicker-only holding? Compares hero's score with the board plus the two highest unseen kicker ranks.
 */
function hasTopKickers(board: readonly Card[], all: readonly Card[], made: readonly number[], score: number): boolean {
  const seen = new Set(all);
  const boardSuit = [0, 0, 0, 0];
  for (const c of board) boardSuit[suitOf(c)]!++;
  const opp: Card[] = [];
  for (let r = 12; r >= 0 && opp.length < 2; r--) {
    if (made.includes(r)) continue;
    // an unseen card of this rank, in the suit least able to make a flush with the board
    const cands = [0, 1, 2, 3].map((s) => r * 4 + s).filter((c) => !seen.has(c)).sort((a, b) => boardSuit[suitOf(a)]! - boardSuit[suitOf(b)]!);
    if (cands.length) opp.push(cands[0]!);
  }
  return opp.length < 2 || evaluate([...board, ...opp]) <= score;
}

/**
 * How many kicker ranks above `kicker` could an opponent still hold? Counts ranks that are not part of the
 * board-made hand and have at least one unseen card.
 */
function unseenKickersAbove(all: readonly Card[], made: readonly number[], kicker: number): number {
  const seen = new Set(all);
  let n = 0;
  for (let r = kicker + 1; r <= 12; r++) {
    if (made.includes(r)) continue;
    if ([0, 1, 2, 3].some((s) => !seen.has(r * 4 + s))) n++;
  }
  return n;
}

const ORDINALS = ['top', 'second', 'third', 'fourth', 'fifth'];
const lower = (s: string): string => s.toLowerCase();

/** Label for a strong draw (flush draw and/or 8-out straight draw). */
function strongDrawLabel(d: DrawInfo): string {
  if (d.flushDraw && d.straightRanks >= 2) return 'Monster draw (flush draw + straight draw)';
  if (d.flushDraw) return d.nutFlushDraw ? 'Nut flush draw' : 'Flush draw';
  return d.straightKind === 'open-ended' ? 'Open-ended straight draw' : 'Double gutshot straight draw';
}

/** Describe and bucket a postflop hand. `board` must have 3–5 cards. */
export function assessHand(hole: readonly [Card, Card], board: readonly Card[]): Assessment {
  const all = [...hole, ...board];
  const score = evaluate(all);
  const category = categoryOf(score);
  const boardScore = evaluate(board);
  const draws = detectDraws(hole, board);
  const description = describeScore(score);

  const hr = hole.map(rankOf);
  const br = board.map(rankOf);
  const boardSorted = [...new Set(br)].sort((a, b) => b - a);
  const top = boardSorted[0]!;
  const pocketPair = hr[0] === hr[1];
  const made = madeRanks(score);

  // Does a hole card form part of the made hand (not just a kicker)?
  const boardPlays = board.length === 5 && score === boardScore;
  const fiveCardHand = category === Category.Straight || category === Category.Flush || category === Category.StraightFlush;
  let usesHoleCards: boolean;
  if (boardPlays) usesHoleCards = false;
  else if (category === Category.HighCard || fiveCardHand) usesHoleCards = true; // a hole card is in the five
  else usesHoleCards = made.some((r) => hr.includes(r));
  const boardMade = boardPlays || (category !== Category.HighCard && !usesHoleCards);

  const mk = (bucket: Bucket, label: string, pair: Assessment['pair'] = 'none'): Assessment => ({
    bucket, label, category, description, usesHoleCards, boardMade, draws, pair,
  });
  const drawOrNull = (): Assessment | null => {
    if (board.length >= 5) return null;
    if (draws.strong) return mk('draw', strongDrawLabel(draws));
    if (draws.straightKind === 'gutshot') return mk('draw', 'Gutshot straight draw');
    return null;
  };

  // Board plays: nothing extra from our hole cards
  if (boardPlays) return mk('air', 'The board plays — your cards do not help', 'board');

  // The board makes the hand; our cards are only kickers.
  if (boardMade) {
    const dr = drawOrNull();
    if (dr) return dr;
    const myKicker = Math.max(...hr.filter((r) => !made.includes(r)));
    const topKicker = hasTopKickers(board, all, made, score);
    // Showdown value comes only from the kicker: the best possible kicker -> 'medium' (wins or ties against every
    // other kicker-only hand), a kicker among the top 3 an opponent could hold -> 'weak', anything lower -> 'air'.
    const goodKicker = unseenKickersAbove(all, made, myKicker) <= 2;
    const kickerBucket: Bucket = topKicker ? 'medium' : goodKicker ? 'weak' : 'air';
    if (category === Category.Pair) return mk('air', 'Only the pair on the board (you have just a high card)', 'board');
    if (category === Category.TwoPair) {
      const what = pocketPair ? `your pocket ${lower(RANK_PLURALS[hr[0]!]!)} only count as a kicker` : `your ${lower(RANK_NAMES[myKicker]!)} is only a kicker`;
      return mk(kickerBucket, `Two pair on the board (${what})`, 'board');
    }
    if (category === Category.Trips) return mk(kickerBucket, 'Three of a kind on the board (you have a kicker only)', 'board');
    if (category === Category.Quads) return mk(topKicker ? 'strong' : kickerBucket, 'Four of a kind on the board (you have a kicker only)', 'board');
    return mk('air', `${description} on the board (your cards do not help)`, 'board');
  }

  if (category >= Category.FullHouse) return mk('monster', description);
  if (category === Category.Flush) {
    const flushSuit = [0, 1, 2, 3].find((s) => all.filter((c) => suitOf(c) === s).length >= 5)!;
    const myTop = Math.max(...hole.filter((c) => suitOf(c) === flushSuit).map(rankOf));
    const nut = myTop > topUnseenOfSuit(all, flushSuit);
    return mk(nut ? 'monster' : 'strong', nut ? 'Nut flush' : 'Flush');
  }
  if (category === Category.Straight) return mk('monster', description);
  if (category === Category.Trips) {
    if (pocketPair) return mk('monster', `Set of ${RANK_PLURALS[hr[0]!]}`);
    return mk('strong', 'Three of a kind (one of your cards plus a pair on the board)');
  }
  if (category === Category.TwoPair) {
    // Both pairs use one of our cards each (e.g. K7 on K-7-2).
    const bothHole = !pocketPair && hr.every((r) => made.includes(r) && br.includes(r));
    if (bothHole) return mk('strong', 'Two pair');
    if (pocketPair) return mk('medium', 'Pocket pair plus a pair on the board', 'board');
    return mk('medium', 'Two pair (one pair is on the board)');
  }
  if (category === Category.Pair) {
    if (pocketPair) {
      const r = hr[0]!;
      if (r > top) return mk(r >= 8 ? 'strong' : 'medium', 'Overpair', 'overpair');
      const above = boardSorted.filter((b) => b > r).length;
      if (above === boardSorted.length) return mk('weak', 'Pocket pair below the board', 'underpair');
      // Between board cards: second pair (below the top card only), third pair, ...
      const ord = ORDINALS[above]!;
      return mk(above === 1 ? 'medium' : 'weak', `${ord[0]!.toUpperCase()}${ord.slice(1)} pair (a pocket pair below the top ${above === 1 ? 'card' : `${above} cards`})`, above === 1 ? 'second' : 'middle');
    }
    // Pair made with exactly one hole card
    const pi = hole.findIndex((c) => br.includes(rankOf(c)));
    const paired = hole[pi]!;
    const rank = rankOf(paired);
    const kickerRank = rankOf(hole[1 - pi]!);
    const idx = boardSorted.indexOf(rank);
    if (idx === 0) {
      const good = kickerRank >= 9;
      return mk(good ? 'strong' : 'medium', good ? 'Top pair, good kicker' : 'Top pair, weak kicker', 'top');
    }
    if (idx === 1) return mk('medium', 'Second pair', 'second');
    const bottom = idx === boardSorted.length - 1;
    return mk(bottom ? 'weak' : 'medium', bottom ? 'Bottom pair' : 'Middle pair', bottom ? 'bottom' : 'middle');
  }
  // High card
  const dr = drawOrNull();
  if (dr) return dr;
  if (board.length < 5 && draws.overcards === 2) return mk('draw', 'Two overcards');
  return mk('air', hr.some((r) => r === 12) ? 'Ace high' : 'No pair, no real draw');
}

/** A single number 0..1 for how strong the made hand is (for bots). Draws add a little. */
export function strengthScore(a: Assessment, boardLen: number): number {
  const base: Record<Bucket, number> = { monster: 0.95, strong: 0.75, medium: 0.5, weak: 0.3, draw: 0.3, air: 0.08 };
  let s = base[a.bucket];
  if (a.bucket === 'draw' && boardLen < 5) s = a.draws.strong ? (a.draws.flushDraw && a.draws.straightRanks >= 2 ? 0.6 : 0.42) : 0.28;
  if (a.bucket !== 'monster' && a.draws.strong && boardLen < 5) s += 0.1;
  return Math.min(1, s);
}


/**
 * The cards that actually make your hand right now (for a gentle highlight while playing):
 * the paired cards for pair / two pair / trips / quads, all five for a straight or better.
 * Returns an empty list for a high-card hand.
 */
export function madeHandCards(hole: readonly Card[], board: readonly Card[]): Card[] {
  if (board.length < 3) return [];
  const all = [...hole, ...board];
  const best = bestFive(all);
  const cat = categoryOf(best.score);
  if (cat === Category.HighCard) return [];
  if (cat >= Category.Straight) return best.cards;
  const counts = new Map<number, number>();
  for (const c of best.cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  return best.cards.filter((c) => (counts.get(rankOf(c)) ?? 0) >= 2);
}
