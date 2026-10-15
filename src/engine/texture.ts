// Board texture classification (dry / medium / wet, paired, monotone...).
import { type Card, rankOf, suitOf, RANK_CHARS } from './cards';

export type Wetness = 'dry' | 'medium' | 'wet';

export interface BoardTexture {
  wetness: Wetness;
  /** 0 (bone dry) .. ~10 (soaked) */
  score: number;
  /**
   * Suits on the board: 'monotone' = a flop of one suit; 'three-flush' = exactly three of one suit on a turn or river
   * (a flush is possible for anyone holding two of that suit); 'four-flush' / 'flush' = four / five of one suit.
   */
  suits: 'rainbow' | 'two-tone' | 'monotone' | 'three-flush' | 'four-flush' | 'flush';
  maxSuit: number;
  paired: 'none' | 'paired' | 'two-pair' | 'trips' | 'quads';
  /** Highest number of board ranks that fit in a single 5-rank window (straight potential). */
  connected: number;
  highCard: number; // rank index
  tags: string[];
  /** One plain-English sentence for the learner. */
  summary: string;
}

const rankMaskWithLowAce = (ranks: number[]): number => {
  let m = 0;
  for (const r of ranks) m |= 1 << (r + 1);
  if (ranks.includes(12)) m |= 1; // ace plays low too
  return m; // bits 0..13
};

function maxInWindow(ranks: number[]): number {
  const m = rankMaskWithLowAce([...new Set(ranks)]);
  let best = 0;
  for (let lo = 0; lo <= 9; lo++) {
    let c = 0;
    for (let i = 0; i < 5; i++) if (m & (1 << (lo + i))) c++;
    best = Math.max(best, c);
  }
  return best;
}

export function classifyBoard(board: readonly Card[]): BoardTexture {
  if (board.length < 3) throw new Error('need at least a flop');
  const ranks = board.map(rankOf);
  const suitCounts = [0, 0, 0, 0];
  for (const c of board) suitCounts[suitOf(c)]!++;
  const maxSuit = Math.max(...suitCounts);
  const rc = new Map<number, number>();
  for (const r of ranks) rc.set(r, (rc.get(r) ?? 0) + 1);
  const mult = [...rc.values()].sort((a, b) => b - a);
  const paired: BoardTexture['paired'] =
    mult[0] === 4 ? 'quads' : mult[0] === 3 ? 'trips' : mult[0] === 2 && mult[1] === 2 ? 'two-pair' : mult[0] === 2 ? 'paired' : 'none';
  const connected = maxInWindow(ranks);
  const highCard = Math.max(...ranks);

  const n = board.length;
  let suits: BoardTexture['suits'];
  if (maxSuit >= 5) suits = 'flush';
  else if (maxSuit === 4) suits = 'four-flush';
  else if (maxSuit === 3) suits = n === 3 ? 'monotone' : 'three-flush'; // 3 of a suit on a turn/river = flush possible
  else if (maxSuit === 2) suits = 'two-tone';
  else suits = 'rainbow';

  let score = 0;
  if (n === 3) score += maxSuit === 3 ? 4 : maxSuit === 2 ? 1.5 : 0;
  else score += maxSuit >= 4 ? 5 : maxSuit === 3 ? 3.5 : maxSuit === 2 ? 1 : 0;
  // Straight potential: distinct ranks within a 5-window
  const distinct = new Set(ranks).size;
  const need = n === 3 ? 3 : 3; // 3+ cards in a window make straights available to one card
  if (connected >= need + (n > 3 ? 1 : 0)) score += 3;
  else if (connected >= need) score += 2;
  else if (connected === 2 && distinct >= 2) score += 0.75;
  // Tight consecutive runs are the wettest
  const sorted = [...new Set(ranks)].sort((a, b) => a - b);
  let run = 1;
  let bestRun = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i]! - sorted[i - 1]! === 1 ? run + 1 : 1;
    bestRun = Math.max(bestRun, run);
  }
  if (bestRun >= 3) score += 1.5;
  if (paired !== 'none') score -= 1;
  if (highCard >= 8 && connected >= 3) score += 0.5; // broadway-ish boards hit many ranges
  score = Math.max(0, score);

  const wetness: Wetness = score <= 1.25 ? 'dry' : score <= 3.5 ? 'medium' : 'wet';

  const tags: string[] = [];
  if (paired !== 'none') tags.push('paired');
  if (maxSuit >= 3) tags.push(suits === 'flush' ? 'flush-on-board' : suits === 'four-flush' ? 'four-to-a-flush' : suits === 'monotone' ? 'monotone' : 'three-flush');
  else if (suits === 'two-tone') tags.push('two-tone');
  else tags.push('rainbow');
  if (connected >= 3) tags.push('connected');
  if (highCard === 12) tags.push('ace-high');
  else if (highCard >= 10) tags.push('broadway-high');
  else if (highCard <= 6) tags.push('low');

  const hi = RANK_CHARS[highCard]!;
  const parts: string[] = [];
  parts.push(wetness === 'dry' ? 'A dry board' : wetness === 'wet' ? 'A wet, coordinated board' : 'A medium-wet board');
  if (paired !== 'none') parts.push('with a pair on it (fewer straight and flush draws, but full houses are possible)');
  else if (maxSuit >= 3) parts.push('with three cards of one suit (flushes are possible)');
  else if (connected >= 3) parts.push('with cards close together (straight draws are everywhere)');
  else if (wetness === 'dry') parts.push('with few draws: your made hands are usually still best');
  const summary = `${parts.join(' ')}. ${hi}-high.`.replace(/\s+\./g, '.');

  return { wetness, score, suits, maxSuit, paired, connected, highCard, tags, summary };
}
