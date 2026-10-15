// Estimate an opponent's range from what they did: preflop action + position, then narrowed by postflop bets.
// This is a transparent heuristic (NOT a solver): it is what a thoughtful player does in their head.
import type { Card } from '../cards';
import { Category, evaluate } from '../evaluator';
import type { ActionRecord, HandState, Street } from '../game';
import { detectDraws } from '../handStrength';
import { topPercent } from '../handRanking';
import {
  defendRanges_, facing3betRanges, hasDefendChart, huDefendRanges, openRange, positionOf, shoveRanges,
} from '../preflopCharts';
import { type Combo, type Range, expandRange, parseRange, rangePercent } from '../ranges';

export interface OppEstimate {
  seat: number;
  name: string;
  combos: Combo[];
  /** Range before postflop narrowing (for robustness checks). */
  preflopCombos: Combo[];
  /** Human sentence describing how we got here. */
  description: string;
  /** Approximate % of all starting hands in the preflop range. */
  preflopPercent: number;
}

const STREET_BOARD_LEN: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5, complete: 5 };

const PREMIUM_3BET = parseRange('QQ+,AKs,AKo');
const FOUR_BET = parseRange('KK+,AKs,AKo');
/** Limpers rarely hold the very best hands (most players raise those). */
const LIMP_RANGE: Range = (() => {
  const r = new Map(topPercent(45));
  for (const l of PREMIUM_3BET.keys()) r.delete(l);
  return r;
})();

interface PreResult {
  range: Range;
  text: string;
}

/** True when a preflop raise is an all-in or commits most of the raiser's stack. */
export function isShoveLike(a: ActionRecord): boolean {
  return a.type === 'raise' && (a.allIn || a.toAmount >= 0.4 * (a.stackBefore + a.toAmount - a.chips));
}

/** Stack a preflop shove puts at risk, in big blinds, capped at the biggest stack that could call it. */
export function shoveDepthBB(hand: HandState, a: ActionRecord): number {
  const others = hand.players.filter((p) => p.inHand && p.seat !== a.seat).map((p) => hand.startStacks[p.seat]!);
  const theirs = a.stackBefore + a.toAmount - a.chips;
  return Math.min(theirs, Math.max(0, ...others)) / hand.config.bb;
}

function preflopRangeFor(hand: HandState, seat: number): PreResult {
  const n = hand.config.numSeats;
  const headsUp = hand.players.filter((p) => p.inHand).length === 2;
  const pre = hand.actions.filter((a) => a.street === 'preflop');
  const pos = positionOf(seat, hand.button, n);
  const name = hand.players[seat]!.name;
  const firstRaise = pre.find((a) => a.type === 'raise');
  const firstRaiserPos = firstRaise ? positionOf(firstRaise.seat, hand.button, n) : null;

  // Classify the opponent's last meaningful preflop action by how many raises came before it.
  let idx = -1;
  for (let i = 0; i < pre.length; i++) if (pre[i]!.seat === seat && pre[i]!.type !== 'fold') idx = i;
  if (idx < 0) {
    // Hasn't acted voluntarily. The big blind who just sees a flop for free holds nearly anything.
    return { range: topPercent(pos === 'BB' ? 85 : 60), text: `${name} has not shown strength preflop` };
  }
  const act = pre[idx]!;
  const raisesBefore = pre.slice(0, idx).filter((a) => a.type === 'raise').length;

  if (act.type === 'raise') {
    if (isShoveLike(act) && raisesBefore <= 1) {
      const depth = shoveDepthBB(hand, act);
      const s = shoveRanges(pos, depth, raisesBefore === 0, headsUp, raisesBefore === 1 ? firstRaiserPos ?? undefined : undefined);
      return {
        range: s.base,
        text: `${name} ${act.allIn ? 'moved all-in' : 'raised most of their stack'} for about ${Math.round(depth)} big blinds${raisesBefore === 0 ? ` first in from ${pos}` : ' over a raise'}: a range of about ${Math.round(rangePercent(s.base))}% of hands`,
      };
    }
    if (raisesBefore === 0) {
      const r = openRange(pos, headsUp);
      return { range: r, text: `${name} raised first from ${pos}: a typical ${pos} opening range (~${Math.round(rangePercent(r))}% of hands)` };
    }
    if (raisesBefore === 1) {
      const r = headsUp ? huDefendRanges().threeBet : firstRaiserPos && hasDefendChart(pos, firstRaiserPos) ? defendRanges_(pos, firstRaiserPos).threeBet : PREMIUM_3BET;
      return { range: r, text: `${name} re-raised (3-bet), which is usually a strong, narrow range (~${Math.round(rangePercent(r))}% of hands)` };
    }
    return { range: FOUR_BET, text: `${name} made a 4-bet or bigger: almost always the very best hands` };
  }
  if (act.type === 'call') {
    if (raisesBefore === 0) {
      return { range: LIMP_RANGE, text: `${name} just called (limped): a wide mix of hands, usually without the very best ones (most players raise those)` };
    }
    if (raisesBefore === 1) {
      const r = headsUp ? huDefendRanges().call : firstRaiserPos && hasDefendChart(pos, firstRaiserPos) ? defendRanges_(pos, firstRaiserPos).call : topPercent(14);
      return { range: r, text: `${name} called a raise from ${pos}: playable hands, mostly not the very top (they would 3-bet those) (~${Math.round(rangePercent(r))}%)` };
    }
    const openerIsThem = firstRaise?.seat === seat;
    if (openerIsThem && raisesBefore === 2) {
      const threeBet = pre.filter((a) => a.type === 'raise')[1]!;
      const r = facing3betRanges(pos, positionOf(threeBet.seat, hand.button, n)).call;
      return { range: r, text: `${name} opened, then called a 3-bet: a strong range of pairs and big cards (~${Math.round(rangePercent(r))}% of hands)` };
    }
    return { range: topPercent(5), text: `${name} called a 3-bet or more: a narrow, strong range` };
  }
  // check (big blind option)
  return { range: topPercent(85), text: `${name} checked their big blind option: almost any hand` };
}

/** Strength key of a holding on a board: made hand score, or a draw-equivalent for incomplete boards. */
function strengthKey(hole: readonly [Card, Card], board: readonly Card[]): number {
  const score = evaluate([...hole, ...board]);
  if (board.length >= 5) return score;
  const cat = score >> 20;
  if (cat >= Category.Straight) return score;
  const d = detectDraws(hole, board);
  let pseudo = 0;
  if (d.flushDraw || d.straightRanks >= 2) pseudo = (Category.Pair << 20) | (10 << 16); // behaves like a good pair
  else if (d.straightRanks === 1 || d.backdoorFlush) pseudo = (Category.Pair << 20) | (5 << 16);
  else if (d.overcards === 2) pseudo = (Category.Pair << 20) | (3 << 16);
  return Math.max(score, pseudo);
}

/** Keep the top `keep` fraction (by weight share) of combos ranked by strength on this board. */
export function narrowByStrength(combos: Combo[], board: readonly Card[], keepTop: number): Combo[] {
  if (combos.length === 0) return combos;
  const scored = combos.map((c) => ({ c, k: strengthKey(c.hand, board) })).sort((a, b) => b.k - a.k);
  const total = scored.length;
  const keepN = Math.max(1, Math.ceil(total * keepTop));
  return scored.slice(0, keepN).map((s) => s.c);
}

/** Rank combos from strongest to weakest on this board. */
export function sortByStrength(combos: Combo[], board: readonly Card[]): Combo[] {
  return combos
    .map((c) => ({ c, k: strengthKey(c.hand, board) }))
    .sort((a, b) => b.k - a.k)
    .map((s) => s.c);
}

function narrowFor(action: ActionRecord): { keep: number; label: string } {
  const frac = action.potBefore > 0 ? action.chips / action.potBefore : 1;
  switch (action.type) {
    case 'check':
      return { keep: 1, label: 'checked' };
    case 'call':
      return { keep: 0.72, label: 'called (so they likely have something: pair, draw, or a hand worth a look)' };
    case 'bet':
      return action.allIn
        ? { keep: 0.35, label: 'bet all-in' }
        : { keep: Math.max(0.3, 0.62 - 0.2 * Math.min(1, Math.max(0, frac - 0.5))), label: 'bet (mostly strong hands and draws)' };
    case 'raise':
      return { keep: action.allIn ? 0.3 : 0.33, label: 'raised (usually a strong hand or a serious draw)' };
    default:
      return { keep: 1, label: '' };
  }
}

export function estimateOpponent(hand: HandState, oppSeat: number, heroCards: readonly Card[]): OppEstimate {
  const pre = preflopRangeFor(hand, oppSeat);
  const dead = [...heroCards, ...hand.board];
  const preflopCombos = expandRange(pre.range, dead);
  let combos = preflopCombos;
  const notes: string[] = [pre.text];

  for (const street of ['flop', 'turn', 'river'] as const) {
    if (STREET_BOARD_LEN[street] > hand.board.length) break;
    const board = hand.board.slice(0, STREET_BOARD_LEN[street]);
    const acts = hand.actions.filter((a) => a.seat === oppSeat && a.street === street && a.type !== 'fold');
    // Narrow once per street using the most aggressive action they took on that street.
    const order = { check: 0, call: 1, bet: 2, raise: 3 } as Record<string, number>;
    const strongest = acts.sort((a, b) => order[b.type]! - order[a.type]!)[0];
    if (!strongest) continue;
    const { keep, label } = narrowFor(strongest);
    if (keep < 1) {
      // A called bet removes the weakest hands; bets/raises keep the strongest.
      combos = narrowByStrength(combos, board, keep);
      notes.push(`On the ${street} they ${label}`);
    } else if (strongest.type === 'check') {
      notes.push(`On the ${street} they checked`);
    }
  }
  return {
    seat: oppSeat,
    name: hand.players[oppSeat]!.name,
    combos,
    preflopCombos,
    description: notes.join('. ') + '.',
    preflopPercent: rangePercent(pre.range),
  };
}
