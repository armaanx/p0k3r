// Equity calculation: exact enumeration when feasible, Monte Carlo otherwise.
import { type Card, deckWithout } from './cards';
import { evaluate } from './evaluator';
import { createRng, type Rng } from './rng';
import { type Combo, type Range, expandRange } from './ranges';

export interface EquityResult {
  /** Share of the pot won on average (ties split): 0..1 */
  equity: number;
  /** Probability of winning outright. */
  win: number;
  /** Probability of tying (chopping). */
  tie: number;
  samples: number;
  exact: boolean;
}

export interface EquityOptions {
  /** Monte Carlo iterations (default 20,000). */
  iterations?: number;
  rng?: Rng;
  /** Maximum number of (combo × runout) evaluations to enumerate exactly (default 600,000). */
  exactLimit?: number;
}

export const DEFAULT_EXACT_LIMIT = 600_000;

const nCr = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
};

/** Call cb for every k-subset of pool (cb receives a reused buffer). */
function forEachCombination(pool: readonly Card[], k: number, cb: (picked: Card[]) => void): void {
  const buf: Card[] = new Array<Card>(k);
  const rec = (start: number, depth: number): void => {
    if (depth === k) {
      cb(buf);
      return;
    }
    for (let i = start; i <= pool.length - (k - depth); i++) {
      buf[depth] = pool[i]!;
      rec(i + 1, depth + 1);
    }
  };
  rec(0, 0);
}

const single = (a: Card, b: Card): Combo[] => [{ hand: [a, b], weight: 1 }];
const toCombos = (x: Combo[] | Range, dead: readonly Card[]): Combo[] =>
  x instanceof Map ? expandRange(x, dead) : x.filter((c) => !dead.includes(c.hand[0]) && !dead.includes(c.hand[1]));

function cumulative(combos: Combo[]): { cum: Float64Array; total: number } {
  const cum = new Float64Array(combos.length);
  let t = 0;
  for (let i = 0; i < combos.length; i++) {
    t += combos[i]!.weight;
    cum[i] = t;
  }
  return { cum, total: t };
}

function pickIndex(cum: Float64Array, total: number, rng: Rng): number {
  const x = rng.next() * total;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! > x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Heads-up equity of a specific hand against a hand or a weighted range.
 * Exact enumeration when the work fits in `exactLimit`, otherwise Monte Carlo.
 */
export function equityVsRange(
  hero: readonly [Card, Card],
  villain: Combo[] | Range,
  board: readonly Card[] = [],
  opts: EquityOptions = {},
): EquityResult {
  const dead = [...hero, ...board];
  const combos = toCombos(villain, dead);
  if (combos.length === 0) return { equity: NaN, win: NaN, tie: NaN, samples: 0, exact: true };
  const k = 5 - board.length;
  const pool = deckWithout(dead);
  const exactLimit = opts.exactLimit ?? DEFAULT_EXACT_LIMIT;
  const work = combos.length * nCr(pool.length - 2, k);
  const full: Card[] = [...board, 0, 0, 0, 0, 0].slice(0, 5);
  const heroCards: Card[] = [hero[0], hero[1], 0, 0, 0, 0, 0];
  const vilCards: Card[] = [0, 0, 0, 0, 0, 0, 0];

  let win = 0;
  let tie = 0;
  let total = 0;
  let samples = 0;

  if (work <= exactLimit) {
    for (const c of combos) {
      const rest = pool.filter((x) => x !== c.hand[0] && x !== c.hand[1]);
      vilCards[0] = c.hand[0];
      vilCards[1] = c.hand[1];
      let w = 0;
      let t = 0;
      let n = 0;
      forEachCombination(rest, k, (picked) => {
        for (let i = 0; i < board.length; i++) heroCards[2 + i] = vilCards[2 + i] = full[i] = board[i]!;
        for (let i = 0; i < k; i++) heroCards[2 + board.length + i] = vilCards[2 + board.length + i] = picked[i]!;
        const a = evaluate(heroCards);
        const b = evaluate(vilCards);
        if (a > b) w++;
        else if (a === b) t++;
        n++;
      });
      win += (c.weight * w) / n;
      tie += (c.weight * t) / n;
      total += c.weight;
      samples += n;
    }
    return { equity: (win + tie / 2) / total, win: win / total, tie: tie / total, samples, exact: true };
  }

  const rng = opts.rng ?? createRng(1);
  const iterations = opts.iterations ?? 20000;
  const { cum, total: wTotal } = cumulative(combos);
  const drawn: Card[] = new Array<Card>(k);
  let w = 0;
  let t = 0;
  for (let it = 0; it < iterations; it++) {
    const c = combos[pickIndex(cum, wTotal, rng)]!;
    vilCards[0] = c.hand[0];
    vilCards[1] = c.hand[1];
    // Draw k distinct cards for the runout, avoiding the villain's cards.
    for (let i = 0; i < k; i++) {
      for (;;) {
        const card = pool[rng.int(pool.length)]!;
        if (card === c.hand[0] || card === c.hand[1]) continue;
        let dup = false;
        for (let j = 0; j < i; j++) if (drawn[j] === card) dup = true;
        if (dup) continue;
        drawn[i] = card;
        break;
      }
    }
    for (let i = 0; i < board.length; i++) heroCards[2 + i] = vilCards[2 + i] = board[i]!;
    for (let i = 0; i < k; i++) heroCards[2 + board.length + i] = vilCards[2 + board.length + i] = drawn[i]!;
    const a = evaluate(heroCards);
    const b = evaluate(vilCards);
    if (a > b) w++;
    else if (a === b) t++;
  }
  return { equity: (w + t / 2) / iterations, win: w / iterations, tie: t / iterations, samples: iterations, exact: false };
}

export function equityVsHand(hero: readonly [Card, Card], villain: readonly [Card, Card], board: readonly Card[] = [], opts: EquityOptions = {}): EquityResult {
  return equityVsRange(hero, single(villain[0], villain[1]), board, opts);
}

/**
 * Multiway equity. Each player is a list of weighted combos (one combo = known hand).
 * Exact when every hand is known and the runout count fits in `exactLimit`.
 */
export function equityMulti(players: (Combo[] | Range)[], board: readonly Card[] = [], opts: EquityOptions = {}): EquityResult[] {
  const n = players.length;
  const k = 5 - board.length;
  const lists = players.map((p) => toCombos(p, board));
  const allKnown = lists.every((l) => l.length === 1);
  const exactLimit = opts.exactLimit ?? DEFAULT_EXACT_LIMIT;
  const wins = new Array<number>(n).fill(0);
  const ties = new Array<number>(n).fill(0);
  const share = new Array<number>(n).fill(0);
  const hands: Card[][] = Array.from({ length: n }, () => [0, 0, 0, 0, 0, 0, 0]);
  let samples = 0;

  const score = (): void => {
    let best = -1;
    let cnt = 0;
    const sc = hands.map((h) => evaluate(h));
    for (const s of sc) if (s > best) best = s;
    for (const s of sc) if (s === best) cnt++;
    for (let i = 0; i < n; i++) {
      if (sc[i] === best) {
        share[i]! += 1 / cnt;
        if (cnt === 1) wins[i]!++;
        else ties[i]!++;
      }
    }
    samples++;
  };

  if (allKnown) {
    const known: Card[] = [...board];
    for (const l of lists) known.push(l[0]!.hand[0], l[0]!.hand[1]);
    if (new Set(known).size !== known.length) throw new Error('duplicate cards in equityMulti input');
    const pool = deckWithout(known);
    if (nCr(pool.length, k) <= exactLimit) {
      for (let i = 0; i < n; i++) {
        hands[i]![0] = lists[i]![0]!.hand[0];
        hands[i]![1] = lists[i]![0]!.hand[1];
        for (let b = 0; b < board.length; b++) hands[i]![2 + b] = board[b]!;
      }
      forEachCombination(pool, k, (picked) => {
        for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) hands[i]![2 + board.length + j] = picked[j]!;
        score();
      });
      return share.map((s, i) => ({ equity: s / samples, win: wins[i]! / samples, tie: ties[i]! / samples, samples, exact: true }));
    }
  }

  const rng = opts.rng ?? createRng(1);
  const iterations = opts.iterations ?? 20000;
  // Combos that clash with a player's known (single-combo) hand can never be dealt: drop them up front.
  const fixed = lists.filter((l) => l.length === 1).flatMap((l) => [l[0]!.hand[0], l[0]!.hand[1]]);
  const mcLists = lists.map((l) => (l.length === 1 ? l : l.filter((c) => !fixed.includes(c.hand[0]) && !fixed.includes(c.hand[1]))));
  if (mcLists.some((l) => l.length === 0)) return share.map(() => ({ equity: NaN, win: NaN, tie: NaN, samples: 0, exact: false }));
  const cums = mcLists.map(cumulative);
  const used = new Set<Card>();
  let attempts = 0;
  while (samples < iterations && attempts < iterations * 50) {
    attempts++;
    used.clear();
    for (const b of board) used.add(b);
    // Draw every player's hand independently and reject the whole deal on any card clash. This samples the true
    // joint distribution (re-drawing only the clashing player would bias the later players' ranges).
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const { cum, total } = cums[i]!;
      const c = mcLists[i]![pickIndex(cum, total, rng)]!;
      if (used.has(c.hand[0]) || used.has(c.hand[1])) { ok = false; break; }
      used.add(c.hand[0]);
      used.add(c.hand[1]);
      hands[i]![0] = c.hand[0];
      hands[i]![1] = c.hand[1];
    }
    if (!ok) continue;
    const pool = deckWithout([...used]);
    for (let j = 0; j < k; j++) {
      const idx = j + rng.int(pool.length - j);
      const tmp = pool[j]!;
      pool[j] = pool[idx]!;
      pool[idx] = tmp;
    }
    for (let i = 0; i < n; i++) {
      for (let b = 0; b < board.length; b++) hands[i]![2 + b] = board[b]!;
      for (let j = 0; j < k; j++) hands[i]![2 + board.length + j] = pool[j]!;
    }
    score();
  }
  return share.map((s, i) => ({ equity: s / samples, win: wins[i]! / samples, tie: ties[i]! / samples, samples, exact: false }));
}
