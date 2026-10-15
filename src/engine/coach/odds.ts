// Exact pot-odds arithmetic. Everything here is plain math (confidence tier: "Math (exact)").
import { type HandState, legalActions } from '../game';

/** Equity needed to break even on a call: risk X (toCall) to win Y (pot, which already includes the opponent's bet). */
export function breakEvenEquity(toCall: number, pot: number): number {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}

/** "3.0 to 1": how many chips you can win for each chip you risk. */
export function potOddsRatio(toCall: number, pot: number): number {
  return toCall <= 0 ? Infinity : pot / toCall;
}

export function formatRatio(toCall: number, pot: number): string {
  const r = potOddsRatio(toCall, pot);
  if (!isFinite(r)) return 'free';
  return `${r >= 10 ? r.toFixed(0) : r.toFixed(1)} to 1`;
}

/** Minimum defence frequency: how often you must continue versus a bet so bluffs can't profit automatically. */
export function minDefenseFrequency(bet: number, potBeforeBet: number): number {
  return potBeforeBet / (potBeforeBet + bet);
}

/** Stack-to-pot ratio. */
export function spr(stack: number, pot: number): number {
  return pot <= 0 ? Infinity : stack / pot;
}

/** SPR bands used everywhere in the app: low < 3, medium 3 to under 8, high 8 or more. */
export function sprBand(x: number): 'low' | 'medium' | 'high' {
  return x < 3 ? 'low' : x < 8 ? 'medium' : 'high';
}

/**
 * "Y" in "risk X to win Y": every chip in the pot that `seat` can actually win if they call now,
 * including opponents' bets, BEFORE their own call. When the caller is all-in for less, any part of an
 * opponent's bet above what the caller can match is not winnable (it is returned to its owner).
 */
export function winnablePot(hand: HandState, seat: number): number {
  const p = hand.players[seat]!;
  // Use the engine's price when this seat is to act: the call is capped at the largest live opponent bet when
  // nobody else can act (the rest of a bigger bet would only be refunded).
  const legal = seat === hand.toAct ? legalActions(hand) : null;
  const call = legal ? legal.callAmount : Math.min(Math.max(0, hand.currentBet - p.bet), p.stack);
  const cap = p.committed + call;
  let y = 0;
  for (const q of hand.players) y += q.seat === seat ? q.committed : Math.min(q.committed, cap);
  return y;
}

/**
 * Effective stack at the start of the current street: the smaller of the player's stack and the
 * largest stack among opponents still in the hand.
 */
export function effectiveStack(hand: HandState, seat: number): number {
  const p = hand.players[seat]!;
  const opp = hand.players.filter((q) => q.seat !== seat && q.inHand && !q.folded).map((q) => q.stack + q.bet);
  return Math.min(p.stack + p.bet, Math.max(0, ...opp));
}

/** SPR as defined in the lessons: effective stack / pot, both measured at the start of the street. */
export function streetSpr(hand: HandState, seat: number): number {
  const potStart = hand.players.reduce((a, q) => a + q.committed - q.bet, 0);
  return spr(effectiveStack(hand, seat), potStart);
}

/** Pot odds as a percentage string, e.g. 0.25 -> "25%". */
export const pct = (x: number, digits = 0): string => `${(x * 100).toFixed(digits)}%`;
