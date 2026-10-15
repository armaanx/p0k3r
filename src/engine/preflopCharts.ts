// Preflop charts encoded as DATA (not logic): tiers, 6-max open ranges, facing-a-raise, facing-a-3bet.
// These are simplified, widely-published 100bb cash-game style charts, made "pure" (no mixed
// strategies) for teaching. Hands on a chart boundary are reported as `marginal` so grading can be generous.
import { RANK_CHARS } from './cards';
import { HAND_RANKING } from './handRankingData';
import { type Range, ALL_LABELS, comboCount, gridLabel, parseRange, rangePercent } from './ranges';

export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
export const POSITION_ORDER: readonly Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export const POSITION_FULL_NAMES: Record<Position, string> = {
  UTG: 'Under the Gun (first to act)',
  HJ: 'Hijack',
  CO: 'Cutoff',
  BTN: 'Button (dealer)',
  SB: 'Small Blind',
  BB: 'Big Blind',
};

/** Seat → position name. Works for 2..6 players (6-max is the main teaching format). */
export function positionOf(seat: number, button: number, numSeats: number): Position {
  const offset = (seat - button + numSeats) % numSeats; // 0 = button, 1 = SB, 2 = BB, ...
  if (numSeats === 2) return offset === 0 ? 'BTN' : 'BB'; // heads-up: the button is also the small blind
  if (offset === 0) return 'BTN';
  if (offset === 1) return 'SB';
  if (offset === 2) return 'BB';
  // Remaining seats, counted back from the button: CO, HJ, UTG...
  const fromButton = numSeats - offset; // 1 = CO, 2 = HJ, 3+ = UTG
  return fromButton === 1 ? 'CO' : fromButton === 2 ? 'HJ' : 'UTG';
}

// ---------------------------------------------------------------------------
// Tiers (Module 3)
// ---------------------------------------------------------------------------

export interface Tier {
  id: 1 | 2 | 3 | 4 | 5;
  name: string;
  blurb: string;
  spec: string;
}

export const TIERS: readonly Tier[] = [
  { id: 1, name: 'Premium', blurb: 'The best hands. Raise from anywhere, and be happy to put lots of chips in.', spec: 'AA,KK,QQ,AKs,AKo' },
  { id: 2, name: 'Strong', blurb: 'Big pairs and big aces. Raise from any seat.', spec: 'JJ,TT,99,AQs,AJs,ATs,KQs,AQo' },
  { id: 3, name: 'Playable', blurb: 'Good hands that get easier to play from later seats.', spec: '88,77,66,A9s-A6s,KJs,KTs,QJs,QTs,JTs,T9s,AJo,ATo,KQo' },
  { id: 4, name: 'Speculative', blurb: 'Small pairs, suited aces and suited connectors: they win big pots when they hit. A few of the best open from any seat; most are for later seats.', spec: '55,44,33,22,A5s-A2s,K9s-K6s,Q9s,J9s,T8s,98s,97s,87s,86s,76s,75s,65s,54s,KJo,KTo,QJo,QTo,JTo,A9o' },
];

/** Tier 5 is "everything else". It has no spec: membership is "not in tiers 1-4". */
export const WEAK_TIER = {
  id: 5 as const,
  name: 'Weak',
  blurb: 'Fold these from early and middle seats; a few become opens from the cutoff, and many more from the button or the small blind.',
};

const tierRanges: Range[] = TIERS.map((t) => parseRange(t.spec));

/** Tier 1..5 for a 169-hand label. Tier 5 ("Weak") = everything else. */
export function tierOf(label: string): 1 | 2 | 3 | 4 | 5 {
  for (let i = 0; i < tierRanges.length; i++) if (tierRanges[i]!.has(label)) return (i + 1) as 1 | 2 | 3 | 4;
  return 5;
}

export const TIER_NAMES: Record<1 | 2 | 3 | 4 | 5, string> = { 1: 'Premium', 2: 'Strong', 3: 'Playable', 4: 'Speculative', 5: 'Weak' };

/** Blurb for every tier, including tier 5. */
export const TIER_BLURBS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: TIERS[0]!.blurb, 2: TIERS[1]!.blurb, 3: TIERS[2]!.blurb, 4: TIERS[3]!.blurb, 5: WEAK_TIER.blurb,
};

// ---------------------------------------------------------------------------
// Open-raise ranges (first one in, nobody has entered the pot)
// ---------------------------------------------------------------------------

export const OPEN_SPECS: Record<Exclude<Position, 'BB'>, string> = {
  UTG: '55+,A2s+,KTs+,QTs+,JTs,T9s,98s,87s,AJo+,KQo',
  HJ: '44+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,ATo+,KJo+,QJo',
  CO: '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,86s+,76s,65s,54s,A8o+,KTo+,QTo+,JTo',
  BTN: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A2o+,K8o+,Q9o+,J9o+,T9o,98o',
  SB: '22+,A2s+,K2s+,Q4s+,J7s+,T7s+,97s+,86s+,76s,65s,54s,A2o+,K9o+,QTo+,JTo',
};

/** Heads-up small blind/button opens very wide (about 80% of hands at 100bb). */
export const HU_OPEN_SPEC = '22+,A2s+,K2s+,Q2s+,J2s+,T2s+,92s+,82s+,72s+,62s+,52s+,42s+,32s,A2o+,K2o+,Q2o+,J2o+,T2o+,95o+,85o+,75o+,65o,54o';

const openRanges = Object.fromEntries(Object.entries(OPEN_SPECS).map(([k, v]) => [k, parseRange(v)])) as Record<Exclude<Position, 'BB'>, Range>;
const huOpen = parseRange(HU_OPEN_SPEC);

export function openRange(pos: Position, headsUp = false): Range {
  if (headsUp) return huOpen;
  if (pos === 'BB') return new Map();
  return openRanges[pos];
}

// ---------------------------------------------------------------------------
// Facing a raise (hero acts after one open-raiser): 3-bet / call / fold
// ---------------------------------------------------------------------------

interface DefendSpec {
  threeBet: string;
  call: string;
}

// key: `${hero}>${raiser}`
export const DEFEND_SPECS: Record<string, DefendSpec> = {
  'HJ>UTG': { threeBet: 'QQ+,AKs,AKo,A5s', call: '77-JJ,AQs,AJs,KQs,QJs,JTs,T9s' },
  'CO>UTG': { threeBet: 'QQ+,AKs,AKo,A5s', call: '66-JJ,AQs,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s,AQo' },
  'CO>HJ': { threeBet: 'QQ+,AKs,AKo,A5s,A4s', call: '66-JJ,AQs,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s,87s,AQo' },
  'BTN>UTG': { threeBet: 'QQ+,AKs,AKo,A5s', call: '55-JJ,AQs,AJs,ATs,KQs,KJs,QJs,JTs,T9s,98s,87s,76s,AQo' },
  'BTN>HJ': { threeBet: 'JJ+,AKs,AKo,A5s,A4s', call: '55-TT,AQs,AJs,ATs,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,76s,AQo' },
  'BTN>CO': { threeBet: 'TT+,AQs+,AKo,A5s-A3s', call: '55-99,AJs,ATs,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,76s,65s,AQo,AJo,KQo' },
  'SB>UTG': { threeBet: 'QQ+,AKs,AKo,A5s', call: 'TT-JJ,AQs' },
  'SB>HJ': { threeBet: 'QQ+,AKs,AKo,A5s,A4s', call: '99-JJ,AQs,AJs,KQs' },
  'SB>CO': { threeBet: 'JJ+,AQs+,AKo,A5s-A3s', call: '77-TT,AJs,ATs,KQs,QJs,JTs,AQo' },
  'SB>BTN': { threeBet: 'TT+,AJs+,KQs,AQo+,A5s-A2s', call: '66-99,ATs,KJs,KTs,QJs,JTs,T9s,AJo,KQo' },
  'BB>UTG': { threeBet: 'QQ+,AKs,AKo,A5s', call: '22-JJ,AQs-A6s,A4s-A2s,KQs-K8s,QJs-Q8s,JTs-J8s,T9s,T8s,98s,97s,87s,86s,76s,75s,65s,64s,54s,53s,AQo-A9o,KQo-KTo,QJo' },
  'BB>HJ': { threeBet: 'QQ+,AKs,AKo,A5s,A4s', call: '22-JJ,AQs-A6s,A3s-A2s,KQs-K5s,QJs-Q8s,JTs-J8s,T9s,T8s,98s,97s,96s,87s,86s,85s,76s,75s,74s,65s,64s,54s,53s,AQo-A7o,KQo-K9o,QJo,QTo,JTo' },
  'BB>CO': { threeBet: 'JJ+,AQs+,AKo,A5s-A3s', call: '22-TT,AJs-A6s,A2s,KQs-K2s,QJs-Q6s,JTs-J7s,T9s-T7s,98s-96s,87s-85s,76s-74s,65s-63s,54s,53s,43s,AQo-A5o,KQo-K9o,QJo-Q9o,JTo,J9o,T9o,98o' },
  'BB>BTN': { threeBet: 'TT+,AJs+,KQs,AKo,AQo,A5s-A2s', call: '22-99,ATs-A6s,KJs-K2s,QJs-Q5s,JTs-J7s,T9s-T6s,98s-95s,87s-85s,76s-74s,65s-63s,54s,53s,43s,AJo-A2o,KQo-K6o,QJo-Q8o,JTo-J8o,T9o-T8o,98o-97o,87o' },
  'BB>SB': { threeBet: 'TT+,AJs+,KQs,AQo+,A5s-A2s', call: '22-99,ATs-A6s,KJs-K2s,QJs-Q5s,JTs-J7s,T9s-T6s,98s-95s,87s-85s,76s-74s,65s-63s,54s,53s,43s,AJo-A2o,KQo-K6o,QJo-Q8o,JTo-J8o,T9o-T8o,98o-97o,87o' },
};

/** Heads-up big blind facing a button (small blind) open of about 2.5x: defend roughly 70% of hands. */
export const HU_DEFEND_SPEC: DefendSpec = {
  threeBet: '99+,ATs+,KJs+,QJs,AJo+,KQo,A5s-A4s',
  call: '22-88,A9s-A6s,A3s-A2s,KTs-K2s,QTs-Q2s,JTs-J2s,T9s-T2s,98s-92s,87s-82s,76s-72s,65s-63s,54s-53s,43s,ATo-A2o,KJo-K2o,QJo-Q6o,JTo-J6o,T9o-T7o,98o-96o,87o-86o,76o-75o,65o',
};

const defendRanges = new Map<string, { threeBet: Range; call: Range }>();
for (const [k, v] of Object.entries(DEFEND_SPECS)) defendRanges.set(k, { threeBet: parseRange(v.threeBet), call: parseRange(v.call) });
const huDefend = { threeBet: parseRange(HU_DEFEND_SPEC.threeBet), call: parseRange(HU_DEFEND_SPEC.call) };

/** Heads-up big blind defence against a button open. */
export const huDefendRanges = (): { threeBet: Range; call: Range } => huDefend;

export function defendKey(hero: Position, raiser: Position): string {
  return `${hero}>${raiser}`;
}

/** True if hero can be in the "facing an open-raise" spot against this raiser. */
export const hasDefendChart = (hero: Position, raiser: Position): boolean => defendRanges.has(defendKey(hero, raiser));

export function defendRanges_(hero: Position, raiser: Position): { threeBet: Range; call: Range } {
  const r = defendRanges.get(defendKey(hero, raiser));
  if (!r) throw new Error(`no chart for ${hero} facing ${raiser}`);
  return r;
}

export const FACING_3BET = {
  fourBet: parseRange('KK+,AKs,A5s'),
  call: parseRange('77-QQ,AQs,AJs,ATs,KQs,AKo,AQo,JTs,T9s'),
  fourBetSpec: 'KK+,AKs,A5s',
  callSpec: '77-QQ,AQs,AJs,ATs,KQs,AKo,AQo,JTs,T9s',
};

/**
 * Opened from a late seat (CO/BTN, or the heads-up button) and 3-bet by a blind: you will have position
 * after the flop, so you can call a 3-bet with more hands.
 */
export const FACING_3BET_IP = {
  fourBetSpec: 'KK+,AKs,A5s',
  callSpec: '66-QQ,AQs-ATs,KQs-KTs,QJs,QTs,JTs,T9s,98s,87s,76s,AKo,AQo,AJo,KQo',
  fourBet: parseRange('KK+,AKs,A5s'),
  call: parseRange('66-QQ,AQs-ATs,KQs-KTs,QJs,QTs,JTs,T9s,98s,87s,76s,AKo,AQo,AJo,KQo'),
};

/** True when the opener (hero) will act after the 3-bettor on every later street. */
export function opener3betInPosition(opener: Position, threeBettor: Position): boolean {
  return (opener === 'BTN' || opener === 'CO') && (threeBettor === 'SB' || threeBettor === 'BB');
}

/** Which 4-bet / call ranges apply when `opener` raised first and `threeBettor` re-raised. */
export function facing3betRanges(opener?: Position, threeBettor?: Position): { fourBet: Range; call: Range; ip: boolean } {
  const ip = !!opener && !!threeBettor && opener3betInPosition(opener, threeBettor);
  return ip ? { fourBet: FACING_3BET_IP.fourBet, call: FACING_3BET_IP.call, ip } : { fourBet: FACING_3BET.fourBet, call: FACING_3BET.call, ip };
}

/** Facing a 4-bet (or a raise and a re-raise in front of you): continue with QQ+ and AK only; AA, KK and AK usually get it in. */
export const FACING_4BET = {
  continueSpec: 'QQ+,AKs,AKo',
  jamSpec: 'KK+,AKs,AKo',
  continue: parseRange('QQ+,AKs,AKo'),
  jam: parseRange('KK+,AKs,AKo'),
};

// ---------------------------------------------------------------------------
// Short stacks: all-in ranges (rules of thumb close to push/fold charts, no antes)
// ---------------------------------------------------------------------------

/** Top `pct`% of hands by strength, without rounding `pct` to a whole number. */
export function topRange(pct: number): Range {
  return topRangeUncached(pct);
}

const rangeCache = new Map<string, Range>();
/** Parse (and cache) a range spec. "top:12.5" means the top 12.5% of hands by strength. Treat the result as read-only. */
export function parseRangeCached(spec: string): Range {
  let r = rangeCache.get(spec);
  if (!r) {
    r = spec.startsWith('top:') ? topRangeUncached(Number(spec.slice(4))) : parseRange(spec);
    if (rangeCache.size > 500) rangeCache.clear();
    rangeCache.set(spec, r);
  }
  return r;
}

function topRangeUncached(pct: number): Range {
  const r: Range = new Map();
  const target = (1326 * Math.max(0, Math.min(100, pct))) / 100;
  let c = 0;
  for (const l of HAND_RANKING) {
    if (c >= target) break;
    r.set(l, 1);
    c += comboCount(l);
  }
  return r;
}

/** First-in all-in percentages with 10 big blinds. */
const PUSH_10BB: Record<Position, number> = { UTG: 20, HJ: 25, CO: 32, BTN: 45, SB: 55, BB: 30 };

/** Re-shove (over one raise) percentages with 10 big blinds, by the RAISER's seat: later opens are weaker, so re-shove wider. */
const RESHOVE_10BB: Record<Position, number> = { UTG: 14, HJ: 16, CO: 20, BTN: 30, SB: 34, BB: 30 };

/**
 * Rough share of hands that go all-in with a stack of `depthBB` big blinds.
 * firstIn: nobody has raised yet (an open-shove). Otherwise it is a re-shove over a raise from `raiserPos`
 * (unknown raiser: the tight early-seat figure).
 * Ranges get narrower as the stack gets deeper (about 3% from UTG at 100bb).
 */
export function pushPercent(pos: Position, depthBB: number, firstIn: boolean, headsUp = false, raiserPos?: Position): number {
  const reshove = raiserPos ? (headsUp ? 35 : RESHOVE_10BB[raiserPos]) : headsUp ? 25 : 14;
  const base = firstIn ? (headsUp ? 60 : PUSH_10BB[pos]) : reshove;
  const p = base * Math.pow(10 / Math.max(1, depthBB), 0.8);
  return Math.max(2.6, Math.min(100, p));
}

export function pushRange(pos: Position, depthBB: number, firstIn: boolean, headsUp = false, raiserPos?: Position): Range {
  return topRange(pushPercent(pos, depthBB, firstIn, headsUp, raiserPos));
}

/** Above this depth an all-in is a big over-bet: use the narrow "deep shove" ranges below. */
export const DEEP_SHOVE_BB = 30;
const DEEP_OPEN_SHOVE = { base: parseRange('TT+,AQs+,AKo'), tight: parseRange('QQ+,AKs'), wide: parseRange('77+,ATs+,KQs,AJo+') };
const DEEP_RESHOVE = { base: parseRange('QQ+,AKs,AKo'), tight: parseRange('KK+'), wide: parseRange('TT+,AQs+,AQo+') };

/**
 * What a player who moves all-in (or raises most of their stack) for `depthBB` big blinds usually holds.
 * `tight` and `wide` bracket the estimate so the coach can check that its advice holds either way.
 */
export function shoveRanges(pos: Position, depthBB: number, firstIn: boolean, headsUp = false, raiserPos?: Position): { base: Range; tight: Range; wide: Range; percent: number } {
  if (depthBB > DEEP_SHOVE_BB) {
    const r = firstIn ? DEEP_OPEN_SHOVE : DEEP_RESHOVE;
    return { ...r, percent: rangePercent(r.base) };
  }
  const p = pushPercent(pos, depthBB, firstIn, headsUp, raiserPos);
  return { base: topRange(p), tight: topRange(p * 0.6), wide: topRange(Math.min(100, p * 1.7)), percent: p };
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

export type PreflopAction = 'raise' | 'call' | 'fold' | '3bet' | '4bet';

export interface ChartVerdict {
  action: PreflopAction;
  /** Hand sits on the edge of the chart: a neighbouring hand on the grid gets a different action. */
  marginal: boolean;
  /** The different actions that neighbouring hands get (empty when not marginal). */
  alternatives?: PreflopAction[];
  /** Short citation for the explanation, e.g. "Standard UTG opening range (~15% of hands)". */
  source: string;
}

/** Hands adjacent on the 13x13 grid (same shape class). */
export function gridNeighbors(label: string): string[] {
  const idx = ALL_LABELS.indexOf(label);
  const row = Math.floor(idx / 13);
  const col = idx % 13;
  const out: string[] = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r > 12 || c < 0 || c > 12) continue;
    const l = gridLabel(r, c);
    // keep the same shape (pair/suited/offsuit) so suited vs offsuit boundaries aren't mixed up
    if (l.length === label.length && l[l.length - 1] === label[label.length - 1]) out.push(l);
  }
  // pairs: diagonal neighbours
  if (label.length === 2) {
    const r = RANK_CHARS.indexOf(label[0]!);
    for (const d of [-1, 1]) {
      const rr = r + d;
      if (rr >= 0 && rr <= 12) out.push(RANK_CHARS[rr]! + RANK_CHARS[rr]!);
    }
  }
  return out;
}

/**
 * The actions that the grid neighbours of `label` get under the chart `f`, when they differ from the
 * hand's own action. A hand on the edge of a chart may reasonably take one of THESE actions (and only these):
 * a call hand next to a 3-bet hand may 3-bet, but that does not make folding it acceptable.
 */
export function neighbourActions<T extends string>(label: string, f: (l: string) => T): T[] {
  const own = f(label);
  const out: T[] = [];
  for (const n of gridNeighbors(label)) {
    const v = f(n);
    if (v !== own && !out.includes(v)) out.push(v);
  }
  return out;
}

function classify<T extends string>(label: string, f: (l: string) => T): { value: T; marginal: boolean; alternatives: T[] } {
  const value = f(label);
  const alternatives = neighbourActions(label, f);
  return { value, marginal: alternatives.length > 0, alternatives };
}

export function openVerdict(pos: Position, label: string, headsUp = false): ChartVerdict {
  const r = openRange(pos, headsUp);
  const { value, marginal, alternatives } = classify<PreflopAction>(label, (l) => ((r.get(l) ?? 0) > 0 ? 'raise' : 'fold'));
  const pct = Math.round(rangePercent(r));
  const source = headsUp ? `Heads-up button opening chart (~${pct}% of hands)` : `Standard ${pos} opening range in 6-max (~${pct}% of hands)`;
  return { action: value, marginal, alternatives, source };
}

export function facingRaiseVerdict(hero: Position, raiser: Position, label: string): ChartVerdict {
  const { threeBet, call } = defendRanges_(hero, raiser);
  const { value, marginal, alternatives } = classify<PreflopAction>(label, (l) => ((threeBet.get(l) ?? 0) > 0 ? '3bet' : (call.get(l) ?? 0) > 0 ? 'call' : 'fold'));
  return { action: value, marginal, alternatives, source: `Standard ${hero} defence against a ${raiser} open (6-max, 100bb)` };
}

/** Heads-up big blind facing the button's open. */
export function huDefendVerdict(label: string): ChartVerdict {
  const { threeBet, call } = huDefend;
  const { value, marginal, alternatives } = classify<PreflopAction>(label, (l) => ((threeBet.get(l) ?? 0) > 0 ? '3bet' : (call.get(l) ?? 0) > 0 ? 'call' : 'fold'));
  return { action: value, marginal, alternatives, source: `Heads-up big blind defence against a button open (~${Math.round(rangePercent(threeBet) + rangePercent(call))}% of hands continue)` };
}

/** You opened and were 3-bet. Pass the positions to use the wider in-position calling range when it applies. */
export function facing3betVerdict(label: string, opener?: Position, threeBettor?: Position): ChartVerdict {
  const r = facing3betRanges(opener, threeBettor);
  const { value, marginal, alternatives } = classify<PreflopAction>(label, (l) => (r.fourBet.has(l) ? '4bet' : r.call.has(l) ? 'call' : 'fold'));
  return {
    action: value, marginal, alternatives,
    source: r.ip ? 'Standard response when you opened from a late seat and a blind 3-bet you (you have position after the flop)' : 'Standard response when you opened and someone 3-bet you',
  };
}

/**
 * Facing a 4-bet, or (cold = true) a raise plus a re-raise in front of you. The top hands all continue:
 * AA, KK and AK usually put more chips in, QQ calls, and a top hand may also take the other continuing action.
 */
export function facing4betVerdict(label: string, cold = false): ChartVerdict {
  const { value, marginal, alternatives } = classify<PreflopAction>(label, (l) => (FACING_4BET.jam.has(l) ? '4bet' : FACING_4BET.continue.has(l) ? 'call' : 'fold'));
  const source = cold ? 'Facing a raise and a re-raise: only QQ+ and AK continue' : 'Facing a 4-bet: only QQ+ and AK continue';
  if (value === 'fold') return { action: value, marginal, alternatives, source };
  // Calling vs re-raising is a style choice for every continuing hand. AA, KK and AKs never fold; the edge hands
  // (QQ, AKo) keep folding as an alternative, because a neighbouring hand on the grid folds.
  const alts: PreflopAction[] = [value === '4bet' ? 'call' : '4bet'];
  if (!['AA', 'KK', 'AKs'].includes(label) && alternatives.includes('fold')) alts.push('fold');
  return { action: value, marginal: true, alternatives: alts, source };
}

export function openPercent(pos: Position, headsUp = false): number {
  return rangePercent(openRange(pos, headsUp));
}
