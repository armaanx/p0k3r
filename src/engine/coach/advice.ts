// The coach's brain. Produces a recommendation with numbers, a plain-English "why", and an honest confidence tier.
//
//   math      — exact arithmetic that holds whatever reasonable range you give the opponent (pot odds vs equity).
//   standard  — widely-taught charts and guidelines (preflop ranges, value-betting strong hands).
//   judgment  — depends on assumptions about the opponent (fold equity, sizing, bluffing). Reasonable players differ.
//
// This is NOT a solver. Postflop EVs come from a transparent model documented in README.md.
// Preflop, outside all-in spots, the numbers are a rough "chart score" (see `evKind`), not true EVs.
import { type Card, handLabel, rankOf, RANK_NAMES } from '../cards';
import { equityMulti, equityVsRange } from '../equity';
import { type ActionInput, type ActionRecord, type HandState, type LegalActions, legalActions, potTotal } from '../game';
import { Category } from '../evaluator';
import { assessHand, type Assessment } from '../handStrength';
import { HAND_EQUITY_VS_RANDOM } from '../handRanking';
import { findOuts, exactHitChance, ruleOf2And4 } from '../outs';
import {
  FACING_4BET, defendRanges_, facing3betRanges, facing3betVerdict, facing4betVerdict, facingRaiseVerdict, hasDefendChart,
  huDefendRanges, huDefendVerdict, neighbourActions, openRange, openVerdict, parseRangeCached, positionOf, pushRange, shoveRanges, tierOf,
  type ChartVerdict, type Position, type PreflopAction,
} from '../preflopCharts';
import { createRng, hashSeed } from '../rng';
import { type Combo, type Range, comboCount, expandRange, rangePercent } from '../ranges';
import { classifyBoard, type BoardTexture } from '../texture';
import { breakEvenEquity, effectiveStack, formatRatio, pct, streetSpr, winnablePot } from './odds';
import { estimateOpponent, isShoveLike, narrowByStrength, shoveDepthBB, sortByStrength, type OppEstimate } from './oppRange';

export type Tier = 'math' | 'standard' | 'judgment';
export type ActionClass = 'fold' | 'passive' | 'aggressive';

export const TIER_LABELS: Record<Tier, string> = {
  math: 'Math (exact)',
  standard: 'Standard play',
  judgment: 'Judgment call (reasonable players differ)',
};

export interface ClassOption {
  cls: ActionClass;
  /** e.g. "Fold", "Call 300", "Raise to 900" */
  label: string;
  /** Concrete action the UI/replay can take. */
  action: ActionInput;
  /** Expected chips gained from here (relative to folding = 0), in chips. Preflop chart spots: a chart score, see `Advice.evKind`. */
  ev: number;
  evBB: number;
}

export interface WhyPart {
  /** Concept id used to decide whether the learner has been taught this yet. */
  concept: string;
  text: string;
}

export type Situation = 'rfi' | 'bb-option' | 'vs-open' | 'vs-3bet' | 'vs-4bet' | 'short' | 'vs-shove' | 'postflop';

export interface Advice {
  seat: number;
  street: HandState['street'];
  kind: 'preflop' | 'postflop';
  situation: Situation;
  /** Preflop and nobody has raised yet (limps don't count as raises). */
  unopened: boolean;
  /** 'ev' = model EV in chips; 'score' = preflop chart score (rough, scaled to the pot, not a true EV). */
  evKind: 'ev' | 'score';
  handLabel: string;
  position: Position;
  /** All chips in the pot. */
  pot: number;
  /** "Y" in "risk X to win Y": the part of the pot this player can actually win if they call (before their call). */
  winPot: number;
  toCall: number;
  stack: number;
  /** Effective stack / pot at the start of the street. */
  spr: number;
  options: ClassOption[];
  recommended: ClassOption;
  /** Classes that are acceptable (within tolerance of the best); never empty. */
  acceptable: ActionClass[];
  /** More than one action is reasonable. */
  close: boolean;
  tier: Tier;
  concept: string;
  headline: string;
  whyParts: WhyPart[];
  /** Nudges that do not give away the answer (for the Hints level). */
  nudges: WhyPart[];
  equity: number | null;
  equityExact: boolean;
  breakEven: number | null;
  potOdds: string | null;
  opponents: { name: string; description: string; percent: number }[];
  assessment: Assessment | null;
  texture: BoardTexture | null;
  outs: {
    count: number; clean: number; dirty: number;
    /** Rule of 2 and 4 figure for all cards to come (Rule of 4 on the flop, adjusted when `adjusted`). */
    rule: number;
    adjusted: boolean;
    /** Exact chance over all cards to come. */
    exact: number;
    /** Rule of 2 / exact chance for the next card only. */
    ruleOne: number;
    exactOne: number;
  } | null;
  chart: { source: string; marginal: boolean; action: string } | null;
  /** Filled when `chosen` is given. */
  chosen?: ChosenEval;
  tolerance: number;
}

export interface ChosenEval {
  cls: ActionClass;
  /** What the learner actually did, e.g. "Bet 9,750". */
  label: string;
  evBB: number;
  /** EV lost compared to the best option, in big blinds (>= 0). */
  lossBB: number;
  /** Chosen action (class AND size) is within the tolerance of the best. */
  acceptable: boolean;
  sizingNote?: string;
  /** The chosen class was fine but the size was clearly off. */
  sizeIssue?: 'small' | 'large' | 'jam';
  /** Tier to grade this particular choice with (when it differs from the advice's tier). */
  tier?: Tier;
  /** Loss against the exact pot-odds comparison (fold vs call), when that comparison is robust. Graded as 'math'. */
  mathLossBB?: number;
  /** The coach's option of the same class, when its label differs from the learner's. */
  coachLabel?: string;
}

export interface AdviceOptions {
  iterations?: number;
  exactLimit?: number;
  chosen?: ActionInput;
}

const K_PRE = 0.08; // bb of chart score per 1% equity-vs-random above the chart's cutoff (AA ≈ +3bb vs a cutoff hand, unopened)

const classOf = (a: ActionInput, legal: LegalActions): ActionClass => {
  if (a.type === 'fold') return 'fold';
  if (a.type === 'check' || a.type === 'call') return 'passive';
  if (a.type === 'allin' && legal.maxRaiseTo <= legal.currentBet) return 'passive';
  if (a.type === 'allin' && legal.callAmount >= legal.stack) return 'passive'; // calling all-in for less
  return 'aggressive';
};

const actionClassOf = (a: PreflopAction): ActionClass => (a === 'fold' ? 'fold' : a === 'call' ? 'passive' : 'aggressive');

function cumulativeEquityCut(range: Range, quantile: number): number {
  // equity-vs-random of the hand at the given quantile (0 = weakest) of the range by combos
  const items = [...range.entries()].filter(([, w]) => w > 0).map(([l, w]) => ({ eq: HAND_EQUITY_VS_RANDOM[l]!, c: comboCount(l) * w }));
  items.sort((a, b) => a.eq - b.eq);
  const total = items.reduce((a, x) => a + x.c, 0);
  let run = 0;
  for (const it of items) {
    run += it.c;
    if (run >= total * quantile) return it.eq;
  }
  return items.length ? items[items.length - 1]!.eq : 0;
}

const fmtChips = (n: number): string => Math.round(n).toLocaleString('en-US');
const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A hand label as a phrase with the right article: "a flush draw", "an overpair", "the nut flush",
 * "top pair, good kicker", "two pair".
 */
export function withArticle(label: string): string {
  const l = label.trim().toLowerCase();
  if (/^(a|an|the) /.test(l)) return l;
  if (/^nut /.test(l)) return `the ${l}`;
  if (/^(two|three|four|top|second|middle|third|bottom|no|only|trips|quads|just)\b/.test(l) || /^\w+ high\b/.test(l)) return l;
  return `${/^[aeiou]/.test(l) ? 'an' : 'a'} ${l}`;
}

/** "a straight, jack high" or "top pair, good kicker (pair of kings)": label plus description, without repeating itself. */
function labelWithDescription(label: string, description: string): string {
  const L = label.toLowerCase();
  const D = description.toLowerCase();
  if (D.includes(L)) return withArticle(description);
  if (L.includes(D)) return withArticle(label);
  // The label already has a bracketed note: merge the description into it instead of adding a second bracket.
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(label);
  if (m) return `${withArticle(m[1]!)} (${D}; ${m[2]!.toLowerCase()})`;
  return `${withArticle(label)} (${D})`;
}

/** Live opponents of `seat`. */
const liveOpps = (hand: HandState, seat: number) => hand.players.filter((x) => x.inHand && !x.folded && x.seat !== seat);

/** Most chips any opponent could match: raising beyond this is pointless (the excess comes back). */
function raiseCap(hand: HandState, seat: number, legal: LegalActions): number {
  const most = Math.max(0, ...liveOpps(hand, seat).map((q) => q.bet + q.stack));
  return Math.min(legal.maxRaiseTo, Math.max(legal.currentBet, most));
}

function aggressiveLabel(to: number, legal: LegalActions, capTo: number, street: HandState['street']): string {
  if (to >= legal.maxRaiseTo) return `All-in ${fmtChips(legal.maxRaiseTo)}`;
  const word = legal.raiseType === 'bet' ? 'Bet' : 'Raise to';
  return `${word} ${fmtChips(to)}${to >= capTo && street !== 'preflop' ? ' (puts them all-in)' : to >= capTo ? ' (their whole stack)' : ''}`;
}

/** The learner's action as a label ("Bet 9,750", "Call 300", "All-in 2,000"). */
function chosenLabel(a: ActionInput, legal: LegalActions): string {
  switch (a.type) {
    case 'fold': return 'Fold';
    case 'check': return 'Check';
    case 'call': return `Call ${fmtChips(legal.callAmount)}`;
    case 'allin':
      if (classOf(a, legal) === 'passive') return `Call ${fmtChips(legal.callAmount)} (all-in)`;
      return `All-in ${fmtChips(legal.maxRaiseTo)}`;
    default: {
      const to = raiseToOf(a, legal);
      if (to >= legal.maxRaiseTo) return `All-in ${fmtChips(legal.maxRaiseTo)}`;
      return `${legal.raiseType === 'bet' ? 'Bet' : 'Raise to'} ${fmtChips(to)}`;
    }
  }
}

const raiseToOf = (a: ActionInput, legal: LegalActions): number =>
  a.type === 'allin' ? legal.maxRaiseTo : Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, a.amount ?? legal.minRaiseTo));

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function advise(hand: HandState, opts: AdviceOptions = {}): Advice {
  if (hand.toAct < 0 || hand.result) throw new Error('no decision to advise on');
  return hand.street === 'preflop' ? preflopAdvice(hand, opts) : postflopAdvice(hand, opts);
}

interface ChosenCtx {
  legal: LegalActions;
  bb: number;
  /** Postflop: EV (chips) of raising/betting to a given total. */
  evAggAt?: (to: number) => number;
  /** Postflop: exact fold-vs-call comparison is robust (see tier logic). */
  callMath?: boolean;
  evPassive?: number;
  /** Postflop hand bucket (for slow-play and sizing rules). */
  bucket?: Assessment['bucket'];
  effBB?: number;
}

function describeChosen(a: Advice, chosen: ActionInput, ctx: ChosenCtx): ChosenEval {
  const { legal, bb } = ctx;
  const cls = classOf(chosen, legal);
  const opt = a.options.find((o) => o.cls === cls) ?? a.options[0]!;
  const best = a.recommended;
  const label = chosenLabel(chosen, legal);
  let ev = opt.ev;
  let acceptable = a.acceptable.includes(cls);
  let sizingNote: string | undefined;
  let sizeIssue: ChosenEval['sizeIssue'];
  let tier: Tier | undefined;
  let mathLossBB: number | undefined;
  const coachLabel = opt.label !== label ? opt.label : undefined;
  const pot = a.pot;

  if (cls === 'aggressive') {
    const to = raiseToOf(chosen, legal);
    const optTo = opt.action.type === 'allin' ? legal.maxRaiseTo : opt.action.amount ?? to;
    if (a.kind === 'postflop') {
      if (ctx.evAggAt && to !== optTo) ev = ctx.evAggAt(to);
      const added = to - legal.currentBet; // chips beyond the current bet
      const frac = added / Math.max(1, pot);
      const strong = ctx.bucket === 'monster' || ctx.bucket === 'strong';
      if (to === optTo) {
        // The learner picked the coach's own size: no size comment.
      } else if (legal.currentBet === 0 && frac < 0.2 && strong) {
        sizeIssue = 'small';
        sizingNote = 'That bet is very small for a strong hand: worse hands would happily pay more, and draws get a great price to continue.';
      } else if (legal.currentBet === 0 && frac < 0.2) {
        sizingNote = 'That bet is very small: it gives opponents a great price to continue with draws.';
      } else if (frac > 2 && ctx.bucket !== 'monster') {
        sizeIssue = 'large';
        sizingNote = strong
          ? `That is a huge over-bet (about ${frac.toFixed(1)} times the pot): your hand is good but not unbeatable, and at this size worse hands fold while better hands call.`
          : `That is a huge over-bet (about ${frac.toFixed(1)} times the pot) without a strong hand: better hands call, worse hands fold, and you risk a lot to win the ${fmtChips(pot)} in the pot.`;
      } else if (legal.currentBet === 0 && frac > 1.3) {
        sizingNote = 'That is an overbet. It is strong with the very best hands but risks a lot when called.';
      }
      // Within the right action class, a size that loses clearly more than the coach's size is a sizing (judgment) error.
      if (to !== optTo && a.acceptable.includes('aggressive') && ev < best.ev - a.tolerance && sizeIssue === undefined) {
        sizeIssue = to > optTo ? 'large' : 'small';
        sizingNote ??= to > optTo
          ? 'Much bigger than needed: only better hands call a bet this large, so you win less when you are ahead and lose more when you are behind.'
          : `Much smaller than the coach's ${opt.label.toLowerCase()}: in the coach's model this size earns clearly less.`;
      }
    } else if (a.situation !== 'short' && a.situation !== 'vs-shove' && a.situation !== 'vs-4bet') {
      const effBB = ctx.effBB ?? 100;
      const deepJam = to >= legal.maxRaiseTo && effBB > 25 && optTo < 0.5 * legal.maxRaiseTo;
      const ratio = to / Math.max(1, optTo);
      if (deepJam) {
        sizeIssue = 'jam';
        sizingNote = `Moving all-in for ${Math.round(effBB)} big blinds risks your whole stack to win the ${fmtChips(pot)} already in the pot: worse hands fold and only better hands call. The standard ${opt.label.toLowerCase()} wins more with good hands and loses less with the rest.`;
      } else if (ratio > 2.2) {
        sizeIssue = 'large';
        sizingNote = `That raise is much bigger than the standard ${opt.label.toLowerCase()}: weaker hands fold, so good hands win less, and you risk more when you are behind.`;
      } else if (ratio < 0.6) {
        sizeIssue = 'small';
        sizingNote = `That raise is much smaller than the standard ${opt.label.toLowerCase()}: it gives everyone behind a cheap price to call and play a pot out of position against you.`;
      }
    }
    if (sizeIssue) {
      acceptable = false;
      // The decision to bet/raise may be right; the size is a judgment error unless the class itself was wrong.
      if (a.acceptable.includes('aggressive')) tier = 'judgment';
    }
  }

  // Exact fold-vs-call comparison (postflop and preflop all-in spots): robustly +EV calls must not be folded,
  // robustly -EV calls must not be made, whatever else the coach preferred.
  if (ctx.callMath && ctx.evPassive !== undefined && a.toCall > 0) {
    if (cls === 'fold' && ctx.evPassive > 0) mathLossBB = ctx.evPassive / bb;
    if (cls === 'passive' && ctx.evPassive < 0) mathLossBB = -ctx.evPassive / bb;
  }
  // Slow-playing / flat-calling instead of raising postflop is a judgment call, never a big error (as long as calling isn't -EV).
  if (a.kind === 'postflop' && cls === 'passive' && best.cls === 'aggressive' && (ctx.evPassive === undefined || ctx.evPassive >= 0)) tier = 'judgment';
  // Raise-vs-call depends on the fold-equity model, not exact arithmetic, even when fold-vs-call is exact.
  if (a.kind === 'postflop' && cls === 'aggressive' && (tier ?? a.tier) === 'math') tier = 'judgment';

  const lossBB = Math.max(0, (best.ev - ev) / bb);
  if (a.kind === 'postflop' && cls === 'aggressive' && acceptable && ev < best.ev - a.tolerance) acceptable = false;
  if (mathLossBB !== undefined && mathLossBB > 0) acceptable = false;
  return { cls, label, evBB: ev / bb, lossBB, acceptable, sizingNote, sizeIssue, tier, mathLossBB, coachLabel };
}

// ---------------------------------------------------------------------------
// Preflop
// ---------------------------------------------------------------------------

/** Iso-raise range for the big blind after limpers. Everything else just checks. */
const BB_ISO = '77+,ATs+,KQs,AJo+,KQo';
/** Wider iso-raise range when the only limper is the small blind (or the heads-up button). */
const BB_ISO_VS_BLIND = '22+,A2s+,K8s+,Q9s+,J9s+,T9s,A8o+,KTo+,QJo';

function preflopAdvice(hand: HandState, opts: AdviceOptions): Advice {
  const seat = hand.toAct;
  const p = hand.players[seat]!;
  const hole = p.hole as [Card, Card];
  const legal = legalActions(hand)!;
  const bb = hand.config.bb;
  const n = hand.config.numSeats;
  const headsUp = hand.players.filter((x) => x.inHand).length === 2;
  const pos = positionOf(seat, hand.button, n);
  const label = handLabel(hole[0], hole[1]);
  const pre = hand.actions.filter((a) => a.street === 'preflop');
  const raises = pre.filter((a) => a.type === 'raise');
  const limpers = raises.length === 0 ? pre.filter((a) => a.type === 'call').length : 0;
  const heroRaised = raises.some((a) => a.seat === seat);
  const firstRaise = raises[0];
  const lastRaise: ActionRecord | undefined = raises[raises.length - 1];
  const raiserPos = firstRaise ? positionOf(firstRaise.seat, hand.button, n) : null;
  const pot = potTotal(hand);
  const winPot = winnablePot(hand, seat);
  const toCall = legal.callAmount;
  const effBB = effectiveStack(hand, seat) / bb;
  /** 13-25 big blinds: the 100bb charts still pick the hands, but re-raises go all-in and flat-calling a re-raise is out. */
  const shallow = effBB <= 25;
  const u = HAND_EQUITY_VS_RANDOM[label]! * 100;
  const potBB = pot / bb;
  const scale = Math.sqrt(Math.max(1, potBB / 1.5)); // chart scores grow (gently) with the pot at stake
  const heroTotal = p.stack + p.bet;
  const callAllIn = toCall > 0 && toCall >= p.stack;

  // ---- Which situation, which chart ----
  let sit: Exclude<Situation, 'postflop'>;
  const facingShove = toCall > 0 && !!lastRaise && lastRaise.seat !== seat && (isShoveLike(lastRaise) || callAllIn || toCall >= 0.4 * heroTotal);
  if (facingShove) sit = 'vs-shove';
  else if (effBB <= 12) sit = 'short';
  else if (raises.length === 0) sit = pos === 'BB' ? 'bb-option' : 'rfi';
  else if (raises.length === 1 && !heroRaised) sit = 'vs-open';
  else if (raises.length === 2 && firstRaise!.seat === seat) sit = 'vs-3bet';
  // Hero flat-called the open and a player behind re-raised (a squeeze): hero faces a 3-bet, not a 4-bet.
  else if (raises.length === 2 && !heroRaised && pre.some((a, i) => a.seat === seat && a.type === 'call' && i > pre.indexOf(firstRaise!))) sit = 'vs-3bet';
  else sit = 'vs-4bet';

  let verdict: ChartVerdict;
  let evRaise = 0;
  let evCall = 0;
  let recAction: 'raise' | 'call' | 'fold' | 'check' = 'fold';
  const why: WhyPart[] = [];
  const nudges: WhyPart[] = [];
  let concept = 'open-range';
  let tier: Tier = 'standard';
  let evKind: Advice['evKind'] = 'score';
  let callMath = false;
  /** Classes that are fine here on top of the chart's alternatives (e.g. the big blind flatting a min-raise when short). */
  const extraAcceptable: ActionClass[] = [];
  let shoveEq: { equity: number; exact: boolean; entries: Advice['opponents'] } | null = null;
  const pctOpen = (q: Position): number => Math.round(rangePercent(openRange(q, headsUp)));
  const rng = createRng(hashSeed(hand.seed, 'advice', hand.actions.length));

  /** Make chart scores agree with the chart: the chart action is the best non-fold option; folding stays 0. */
  const shapeScores = (chart: 'raise' | 'call' | 'fold', rawCall: number, rawRaise: number): void => {
    if (chart === 'raise') {
      evRaise = Math.max(rawRaise, 0.05);
      evCall = Math.min(rawCall, evRaise - 0.05);
    } else if (chart === 'call') {
      evCall = Math.max(rawCall, 0.05);
      evRaise = Math.min(rawRaise, evCall - 0.05);
    } else {
      evCall = Math.min(rawCall, -0.1);
      evRaise = Math.min(rawRaise, -0.1);
    }
    evCall *= scale;
    evRaise *= scale;
  };

  if (sit === 'vs-shove') {
    // ---- Facing an all-in (or a raise that commits most of your stack): a pure pot-odds decision ----
    concept = 'pot-odds';
    evKind = 'ev';
    const shover = lastRaise!;
    const shoverPos = positionOf(shover.seat, hand.button, n);
    const raisesBefore = raises.indexOf(shover);
    // Opponents who put chips in voluntarily and are still in (the shover plus any callers).
    const vol = new Set(pre.filter((a) => a.type === 'call' || a.type === 'raise').map((a) => a.seat));
    const volOpps = liveOpps(hand, seat).filter((q) => vol.has(q.seat));
    // Only players who have matched the all-in (or are all-in themselves) are committed. Someone who raised or
    // called earlier but still has to act on the shove usually folds: don't count them, but flag the spot as judgment.
    const opps = volOpps.filter((q) => q.allIn || q.bet === hand.currentBet);
    const pending = volOpps.filter((q) => !opps.includes(q));
    const ests = opps.map((q) => estimateOpponent(hand, q.seat, hole));
    const brackets = (q: number, which: 'base' | 'tight' | 'wide'): Combo[] => {
      const e = ests[q]!;
      const rec = [...pre].reverse().find((a) => a.seat === e.seat && a.type !== 'fold');
      if (rec && rec.type === 'raise' && isShoveLike(rec)) {
        const rb = raises.indexOf(rec);
        const s = shoveRanges(positionOf(e.seat, hand.button, n), shoveDepthBB(hand, rec), rb === 0, headsUp, rb === 1 && raiserPos ? raiserPos : undefined);
        return expandRange(s[which], hole);
      }
      if (which === 'base') return e.preflopCombos;
      const pctR = e.preflopPercent;
      return expandRange(parseRangeCached(`top:${which === 'tight' ? pctR * 0.6 : Math.min(100, pctR * 1.7)}`), hole);
    };
    const eqOf = (which: 'base' | 'tight' | 'wide', salt: number) => {
      const groups = ests.map((_, i) => brackets(i, which));
      return preflopEquity(hole, groups, opts, hashSeed(hand.seed, 'shove', hand.actions.length + salt), which === 'base' ? 6000 : 3000);
    };
    const base = eqOf('base', 0);
    const eq = base.equity;
    evCall = (eq * (winPot + toCall) - toCall) / bb;
    const tol = Math.max(0.5, (0.06 * winPot) / bb);
    const evT = (eqOf('tight', 1).equity * (winPot + toCall) - toCall) / bb;
    const evW = (eqOf('wide', 2).equity * (winPot + toCall) - toCall) / bb;
    callMath = pending.length === 0 && Math.sign(evT) === Math.sign(evCall) && Math.sign(evW) === Math.sign(evCall) && Math.abs(evCall) > tol;
    tier = callMath ? 'math' : 'judgment';
    // Moving in yourself is the same as calling when you are committed anyway (nobody left to fold out).
    evRaise = evCall - 0.01;
    recAction = evCall > 0 ? 'call' : 'fold';
    verdict = { action: recAction === 'call' ? 'call' : 'fold', marginal: false, alternatives: [], source: 'Pot odds against an all-in' };
    shoveEq = { equity: eq, exact: base.exact, entries: ests.map((e) => ({ name: e.name, description: e.description, percent: e.preflopPercent })) };
    const be = breakEvenEquity(toCall, winPot);
    const who = ests.length === 1 ? ests[0]!.name : 'your opponents';
    const shoveWord = shover.allIn ? 'moved all-in' : 'made a raise that commits most of the stacks';
    why.push({
      concept: 'pot-odds',
      text: `${hand.players[shover.seat]!.name} ${shoveWord}${raisesBefore === 0 ? ` from ${shoverPos}` : ''}, so ${pending.length === 0 ? 'there is no more betting to plan for: this is a pure price decision' : 'this is mostly a price decision'}. You risk ${fmtChips(toCall)} to win ${fmtChips(winPot)}, so you need to win at least ${pct(be)} of the time (${formatRatio(toCall, winPot)}). Against the hands ${who} likely ${ests.length === 1 ? 'has' : 'hold'} here, ${label} wins about ${pct(eq)}, ${eq > be ? 'more than the price requires: call' : 'less than the price requires: fold'}.`,
    });
    if (winPot < pot) why.push({ concept: 'pot-odds', text: `Only ${fmtChips(winPot)} of the ${fmtChips(pot)} in the pot can go to you: you are all-in for less, so the rest of their bet goes back to them.` });
    for (const q of pending) why.push({ concept: 'opponents', text: `${q.name} can still act behind you; if they call, your chances drop.` });
    if (!callMath && pending.length === 0) why.push({ concept: 'opponents', text: 'This one depends on how wide you think they shove: against a tighter or wider range the answer changes.' });
    nudges.push({ concept: 'pot-odds', text: 'Someone has put you to a decision for your stack. Compare the price (what you risk against what you can win) with how often your hand wins against the hands they would do this with.' });
  } else if (sit === 'short') {
    concept = 'short-stack';
    tier = 'judgment';
    const firstIn = raises.length === 0;
    const raiserPosShort = !firstIn && raises.length === 1 && raiserPos ? raiserPos : undefined;
    const shoveR = firstIn ? (limpers > 0 ? pushRange(pos, effBB * 1.4, true, headsUp) : pushRange(pos, effBB, true, headsUp)) : pushRange(pos, effBB, false, headsUp, raiserPosShort);
    const f = (l: string): PreflopAction => ((shoveR.get(l) ?? 0) > 0 ? 'raise' : 'fold');
    const inRange = f(label) === 'raise';
    const alts = neighbourActions(label, f);
    verdict = { action: inRange ? 'raise' : 'fold', marginal: alts.length > 0, alternatives: alts, source: `Short-stack push/fold rule of thumb (${Math.round(effBB)} big blinds; about ${Math.round(rangePercent(shoveR))}% of hands ${firstIn ? 'from this seat' : `over a raise${raiserPosShort ? ` from ${raiserPosShort}` : ''}`})` };
    recAction = inRange ? 'raise' : legal.canCheck ? 'check' : 'fold';
    const cut = cumulativeEquityCut(shoveR, 0) * 100;
    const raw = K_PRE * (u - cut) * 1.5;
    if (inRange) evRaise = Math.max(raw, 0.05) * scale;
    else evRaise = Math.min(raw, -0.1) * scale;
    // Flat-calling short is rarely right, but it can't cost much more than the chips it puts in.
    evCall = legal.canCheck ? 0 : Math.min(-0.1 * scale, Math.max(Math.min(evRaise, 0) - 0.1 * scale, -toCall / bb));
    // Big blind facing a min-raise: the price is so good (about 3.5 to 1) that calling with a decent hand is fine too.
    const bbFlat = !firstIn && raises.length === 1 && pos === 'BB' && toCall <= 1.5 * bb && (inRange || parseRangeCached('top:50').has(label));
    if (bbFlat) {
      evCall = Math.max(evCall, Math.min(evRaise, 0) - 0.05 * scale);
      extraAcceptable.push('passive');
    }
    const weakText = legal.canCheck ? 'is not strong enough to move all-in, so just check' : bbFlat ? 'is not strong enough to move all-in' : 'is too weak to risk your stack on';
    const opening = bbFlat ? `With only ${Math.round(effBB)} big blinds, most hands are either all-in or thrown away.` : `With only ${Math.round(effBB)} big blinds, you can't raise and then fold: hands are either all-in or thrown away.`;
    why.push({ concept: 'preflop-chart', text: `${opening} ${label} ${inRange ? 'is strong enough to move all-in' : weakText} from ${pos}${firstIn ? '' : ' after a raise'}.${bbFlat ? ' In the big blind facing a small raise you get a good price, so calling and seeing a flop is also fine.' : ''}` });
    nudges.push({ concept: 'basics', text: 'Your stack is short. With so few chips, the choice is usually all-in or fold. Is this hand strong enough to risk everything?' });
  } else if (sit === 'bb-option') {
    concept = 'position';
    const limpSeat = pre.find((a) => a.type === 'call')?.seat;
    // A lone small-blind (or heads-up button) limp is weak and you have position on it: raise more hands.
    const blindLimp = limpers === 1 && limpSeat !== undefined && (headsUp || positionOf(limpSeat, hand.button, n) === 'SB');
    const iso = parseRangeCached(blindLimp ? BB_ISO_VS_BLIND : BB_ISO);
    const f = (l: string): PreflopAction => ((iso.get(l) ?? 0) > 0 ? 'raise' : 'call');
    const isoIn = f(label) === 'raise';
    const alts = neighbourActions(label, f);
    verdict = { action: isoIn ? 'raise' : 'call', marginal: alts.length > 0, alternatives: alts, source: 'Big blind option after limpers (raise strong hands, otherwise check)' };
    recAction = isoIn ? 'raise' : 'check';
    const cut = cumulativeEquityCut(iso, 0) * 100;
    evCall = 0;
    evRaise = (isoIn ? Math.min(1.2, Math.max(0.05, K_PRE * (u - cut))) : -Math.max(0.1, K_PRE * (cut - u))) * scale;
    why.push({ concept: 'preflop-chart', text: `You are in the big blind and nobody raised, so you can see the flop for free. ${isoIn ? `With ${label} it is worth raising to make ${limpers === 1 ? 'the limper' : 'the limpers'} pay.` : 'There is nothing to gain by raising a hand like this: just check.'}` });
    nudges.push({ concept: 'basics', text: 'Nobody has raised. You can check and see a flop for free. Is your hand strong enough to raise instead?' });
  } else if (sit === 'rfi') {
    verdict = openVerdict(pos, label, headsUp);
    const rngR = openRange(pos, headsUp);
    const cut = cumulativeEquityCut(rngR, 0) * 100;
    const edge = K_PRE * (u - cut);
    // Limping is rarely best: it earns less than raising with good hands and loses chips with bad ones.
    const rawCall0 = edge > 0 ? edge * (pos === 'SB' ? 0.5 : 0.4) : edge * 0.8;
    // Open-limping a strong hand (tier 1-2) gives up a lot: the lessons teach raising these from every seat.
    const rawCall = verdict.action === 'raise' && limpers === 0 && tierOf(label) <= 2 ? Math.min(rawCall0, Math.max(edge, 0.05) - 0.85) : rawCall0;
    shapeScores(verdict.action === 'raise' ? 'raise' : 'fold', verdict.action === 'raise' ? rawCall : Math.min(rawCall, -0.08), edge);
    recAction = verdict.action === 'raise' ? 'raise' : 'fold';
    const inOut = verdict.action === 'raise' ? 'is inside' : 'is outside';
    const seatNote = headsUp ? ' (wide: heads-up there is only one player left to beat)' : pos === 'UTG' ? ' (tight, because many players still act after you)' : pos === 'BTN' ? ' (wide, because you act last after the flop)' : '';
    why.push({
      concept: 'preflop-chart',
      text: `From ${headsUp ? 'the button' : pos}, a solid opening range is about ${pctOpen(pos)}% of hands${seatNote}. ${label} ${inOut} that range, so the standard play is to ${verdict.action === 'raise' ? 'raise' : 'fold'}.`,
    });
    if (limpers > 0 && verdict.action === 'raise') why.push({ concept: 'preflop-chart', text: 'Since someone limped, raise a little bigger (add one big blind per limper).' });
    concept = 'open-range';
    nudges.push({ concept: 'basics', text: `Nobody has raised yet. Is ${label} a hand you'd be proud to raise with?` });
    nudges.push({ concept: 'position', text: `You're in ${pos}. The more players left to act behind you, the stronger your hand should be.` });
  } else if (sit === 'vs-open') {
    concept = 'facing-raise';
    const chart = headsUp ? (pos === 'BB' ? huDefendRanges() : null) : raiserPos && hasDefendChart(pos, raiserPos) ? defendRanges_(pos, raiserPos) : null;
    if (chart) {
      verdict = headsUp ? huDefendVerdict(label) : facingRaiseVerdict(pos, raiserPos!, label);
      const callCut = cumulativeEquityCut(new Map([...chart.call, ...chart.threeBet]), 0.1) * 100;
      const threeCut = cumulativeEquityCut(chart.threeBet, 0.25) * 100;
      const rawCall = K_PRE * (u - callCut);
      shapeScores(verdict.action === '3bet' ? 'raise' : verdict.action === 'call' ? 'call' : 'fold', rawCall, rawCall + K_PRE * (u - threeCut));
      recAction = verdict.action === '3bet' ? 'raise' : verdict.action === 'call' ? 'call' : 'fold';
    } else {
      // No chart for this seating: a tight generic continuing range.
      const cont = parseRangeCached('top:12');
      const three = parseRangeCached('QQ+,AKs,AKo');
      const f = (l: string): PreflopAction => (three.has(l) ? '3bet' : cont.has(l) ? 'call' : 'fold');
      const alts = neighbourActions(label, f);
      verdict = { action: f(label), marginal: alts.length > 0, alternatives: alts, source: 'General defence guideline' };
      recAction = verdict.action === '3bet' ? 'raise' : verdict.action === 'call' ? 'call' : 'fold';
      const rawCall = K_PRE * (u - cumulativeEquityCut(cont, 0) * 100);
      shapeScores(recAction, rawCall, rawCall + K_PRE * (u - cumulativeEquityCut(three, 0) * 100));
      tier = 'judgment';
    }
    if (shallow) {
      // The charts assume 100bb. With 25bb or less a re-raise goes all-in, and calling just to hit a set or a draw
      // no longer pays (too little left to win), so folding a calling hand is fine.
      tier = 'judgment';
      verdict = { ...verdict, source: verdict.source.replace('(6-max, 100bb)', '(6-max)') + `, adjusted for ${Math.round(effBB)} big blinds: re-raises go all-in` };
      if (verdict.action === 'call') verdict = { ...verdict, marginal: true, alternatives: [...new Set([...(verdict.alternatives ?? []), 'fold' as PreflopAction])] };
    }
    const word = recAction === 'raise' ? 're-raise (3-bet)' : recAction;
    const intro = pos === 'BB'
      ? 'You already have a big blind in the pot, so you get a good price and can defend fairly wide.'
      : 'Against a raise you should continue with a narrower set than the raiser opens, and you re-raise your best hands.';
    why.push({
      concept: 'preflop-chart',
      text: `${raiserPos ?? 'Someone'} raised, and you are in ${pos}. ${intro} ${label} is a ${recAction === 'raise' ? 'strong enough hand to re-raise' : recAction === 'call' ? 'good enough hand to call' : 'hand that should be folded'} here, so the standard play is to ${word}.`,
    });
    if (recAction === 'raise' && /^A[2-5]s$/.test(label)) why.push({ concept: 'betting', text: 'Suited aces like this make good occasional bluff re-raises: they block strong hands and have decent equity when called.' });
    if (shallow) why.push({ concept: 'short-stack', text: `With only ${Math.round(effBB)} big blinds, a re-raise commits you, so re-raise all-in. Calling to hit a set or a draw needs deeper stacks, so folding a hand that only calls is fine.` });
    nudges.push({ concept: 'basics', text: 'Someone raised in front of you. Raisers usually have good hands, so you should be pickier than when you are first in. Does your hand hold up?' });
    nudges.push({ concept: 'position', text: 'Think about who raised and where they sit. A raise from early position is stronger than one from the button.' });
  } else if (sit === 'vs-3bet') {
    concept = 'facing-3bet';
    const squeezed = !heroRaised; // hero flat-called the open and a player behind re-raised
    const threeBettorPos = positionOf(raises[1]!.seat, hand.button, n);
    verdict = squeezed ? facing3betVerdict(label) : facing3betVerdict(label, pos, threeBettorPos);
    if (squeezed) verdict = { ...verdict, source: 'Standard response to a squeeze after you called a raise (use your calling range against a 3-bet)' };
    const r = squeezed ? facing3betRanges() : facing3betRanges(pos, threeBettorPos);
    if (shallow) {
      // With 25 big blinds or less, calling a 3-bet leaves too little behind to play a flop: all-in or fold.
      // (Use the tighter out-of-position continuing range: position matters little when the money goes in now.)
      const rs = facing3betRanges();
      const cont = new Map([...rs.call, ...rs.fourBet]);
      const f = (l: string): PreflopAction => (cont.has(l) ? '4bet' : 'fold');
      const alts = neighbourActions(label, f);
      verdict = { action: f(label), marginal: alts.length > 0, alternatives: alts, source: `${squeezed ? 'Standard response to a squeeze after you called a raise' : 'Standard response when you opened and someone 3-bet you'}, adjusted for ${Math.round(effBB)} big blinds: continue by moving all-in` };
      tier = 'judgment';
      const rawJam = K_PRE * (u - cumulativeEquityCut(cont, 0) * 100);
      shapeScores(verdict.action === '4bet' ? 'raise' : 'fold', Math.min(rawJam, 0) - 0.1, rawJam);
    } else {
      const callCut = cumulativeEquityCut(new Map([...r.call, ...r.fourBet]), 0) * 100;
      const rawCall = K_PRE * (u - callCut);
      shapeScores(verdict.action === '4bet' ? 'raise' : verdict.action === 'call' ? 'call' : 'fold', rawCall, rawCall + K_PRE * (u - cumulativeEquityCut(r.fourBet, 0.3) * 100));
    }
    recAction = verdict.action === '4bet' ? 'raise' : verdict.action === 'call' ? 'call' : 'fold';
    const raiseWord = shallow ? 'move all-in' : 're-raise again';
    const verdictText = recAction === 'raise' ? `${label} is strong enough to ${raiseWord}` : recAction === 'call' ? `${label} is good enough to call` : `${label} should be folded${squeezed ? '' : ', even though you raised it'}`;
    const shallowNote = shallow ? ` With only ${Math.round(effBB)} big blinds, calling leaves too little behind to play after the flop, so continue by moving all-in.` : '';
    if (squeezed) why.push({ concept: 'preflop-chart', text: `You called a raise and a player behind you re-raised (a squeeze). Continue with the hands you would call a 3-bet with: ${verdictText}.${shallowNote}` });
    else why.push({ concept: 'preflop-chart', text: `You raised and someone re-raised. That range is strong, so only your best hands continue${r.ip && !shallow ? ' (you will have position after the flop, so you can call with a few more)' : ''}: ${verdictText}.${shallowNote}` });
    nudges.push({ concept: 'basics', text: squeezed ? 'You called and someone re-raised behind you. That takes a strong hand. Is yours worth putting more chips in?' : 'You raised and were re-raised. That takes a strong hand. Is yours worth putting more chips in?' });
  } else {
    concept = 'facing-3bet';
    const cold = !heroRaised && raises.length === 2; // a raise and a re-raise in front of you: your raise is a 4-bet
    verdict = facing4betVerdict(label, !heroRaised);
    const cont = FACING_4BET.continue;
    const rawCall = K_PRE * (u - cumulativeEquityCut(cont, 0) * 100);
    shapeScores(verdict.action === '4bet' ? 'raise' : verdict.action === 'call' ? 'call' : 'fold', rawCall, rawCall + K_PRE * (u - cumulativeEquityCut(FACING_4BET.jam, 0.3) * 100));
    recAction = verdict.action === '4bet' ? 'raise' : verdict.action === 'call' ? 'call' : 'fold';
    const what = cold ? 'There has already been a raise and a re-raise in front of you' : heroRaised ? 'You have been re-raised again (a 4-bet)' : 'There have already been several raises in front of you';
    const plan = cold ? 'AA, KK and AK usually re-raise again (a 4-bet); QQ can call or re-raise.' : 'AA, KK and AK usually move all-in; QQ can call or move all-in.';
    const raiseText = cold ? 'is one of the best: re-raise (4-bet)' : 'is one of the best: move all-in';
    why.push({ concept: 'preflop-chart', text: `${what}, which shows a very strong hand. Only QQ or better and AK continue. ${plan} ${label} ${recAction === 'fold' ? 'is not one of them, so fold' : recAction === 'raise' ? raiseText : 'is good enough to call'}.` });
    nudges.push({ concept: 'basics', text: 'Lots of raising means lots of strength. Only the very best hands keep going.' });
  }

  // ---- Options ----
  const evs: Record<ActionClass, number> = { fold: 0, passive: evCall, aggressive: evRaise };
  // Free checks can't lose chips: folding when you can check is never better.
  if (legal.canCheck) {
    evs.passive = Math.max(evs.passive, 0);
    evs.fold = Math.min(0, evs.passive - 0.05);
  }
  let chartClass: ActionClass = recAction === 'raise' ? 'aggressive' : recAction === 'call' || recAction === 'check' ? 'passive' : 'fold';
  if (chartClass === 'aggressive' && !legal.canRaise) {
    // Re-raising is impossible (e.g. facing an all-in): the strong hand simply calls.
    chartClass = 'passive';
    evs.passive = Math.max(evs.passive, evs.aggressive);
  }

  const capTo = raiseCap(hand, seat, legal);
  // Sizing: short-ish stacks re-raise all-in; a cold 4-bet (raise and re-raise in front) is sized like any 4-bet.
  const sizeSit = shallow && (sit === 'vs-open' || sit === 'vs-3bet') ? 'short' : sit === 'vs-4bet' && !heroRaised && raises.length === 2 ? 'vs-3bet' : sit;
  const raiseTo = preflopRaiseSize(hand, legal, pos, limpers, sizeSit, capTo, seat);
  const options: ClassOption[] = [
    { cls: 'fold', label: 'Fold', action: { seat, type: 'fold' }, ev: evs.fold * bb, evBB: evs.fold },
    {
      cls: 'passive',
      label: legal.canCheck ? 'Check' : callAllIn ? `Call ${fmtChips(toCall)} (all-in)` : `Call ${fmtChips(toCall)}`,
      action: { seat, type: legal.canCheck ? 'check' : 'call' },
      ev: evs.passive * bb,
      evBB: evs.passive,
    },
  ];
  if (legal.canRaise) {
    options.push({
      cls: 'aggressive',
      label: aggressiveLabel(raiseTo, legal, capTo, 'preflop'),
      action: raiseTo >= legal.maxRaiseTo ? { seat, type: 'allin' } : { seat, type: legal.raiseType, amount: raiseTo },
      ev: evs.aggressive * bb,
      evBB: evs.aggressive,
    });
  }
  const has = (c: ActionClass): boolean => options.some((o) => o.cls === c) && !(c === 'fold' && legal.canCheck);
  const recommended = options.find((o) => o.cls === chartClass) ?? options[1]!;
  const tolBB = sit === 'vs-shove' ? Math.max(0.5, (0.06 * winPot) / bb) : 0.15;
  const tol = tolBB * bb;
  const bestEv = Math.max(...options.map((o) => o.ev));
  let acceptable: ActionClass[] = [recommended.cls];
  for (const o of options) if (o.ev >= bestEv - tol && has(o.cls)) acceptable.push(o.cls);
  if (verdict.marginal) {
    // On the edge of a chart, the action a NEIGHBOURING hand gets is also fine (and only that one).
    for (const alt of verdict.alternatives ?? []) {
      let c = actionClassOf(alt);
      if (c === 'aggressive' && !legal.canRaise) c = 'passive';
      if (sit === 'bb-option' && alt === 'call') c = 'passive';
      if (has(c)) acceptable.push(c);
    }
  }
  for (const c of extraAcceptable) if (has(c)) acceptable.push(c);
  acceptable = [...new Set(acceptable)].filter((c) => has(c) || c === recommended.cls);
  // The lessons teach "we do not limp": open-limping when first in is never one of the reasonable options.
  if (sit === 'rfi' && limpers === 0 && !legal.canCheck && recommended.cls !== 'passive') acceptable = acceptable.filter((c) => c !== 'passive');
  const close = acceptable.length > 1;

  // ---- Equity against what the opponent likely holds (for the Full coach) ----
  let equity: number | null = null;
  let equityExact = false;
  const opponents: Advice['opponents'] = [];
  if (shoveEq) {
    equity = shoveEq.equity;
    equityExact = shoveEq.exact;
    opponents.push(...shoveEq.entries);
  } else if (raises.length > 0) {
    const live = liveOpps(hand, seat);
    const target = live.find((x) => x.seat === lastRaise!.seat) ?? live[0];
    if (target) {
      const est = estimateOpponent(hand, target.seat, hole);
      opponents.push({ name: est.name, description: est.description, percent: est.preflopPercent });
      const r = equityVsRange(hole, est.combos, [], { iterations: opts.iterations ?? 6000, rng, exactLimit: opts.exactLimit });
      if (Number.isFinite(r.equity)) {
        equity = r.equity;
        equityExact = r.exact;
      }
    }
  }
  if (equity === null) equity = HAND_EQUITY_VS_RANDOM[label]!;
  const breakEven = toCall > 0 ? breakEvenEquity(toCall, winPot) : null;

  const headline = recommended.label + (close ? '  (close spot)' : '');
  const a: Advice = {
    seat, street: 'preflop', kind: 'preflop', situation: sit, unopened: raises.length === 0, evKind,
    handLabel: label, position: pos, pot, winPot, toCall, stack: p.stack, spr: streetSpr(hand, seat),
    options, recommended, acceptable, close, tier, concept, headline, whyParts: why, nudges,
    equity, equityExact, breakEven, potOdds: toCall > 0 ? formatRatio(toCall, winPot) : null,
    opponents, assessment: null, texture: null, outs: null,
    chart: { source: verdict.source, marginal: verdict.marginal, action: verdict.action }, tolerance: tol,
  };
  if (opts.chosen) a.chosen = describeChosen(a, opts.chosen, { legal, bb, effBB, callMath: sit === 'vs-shove' && callMath, evPassive: sit === 'vs-shove' ? evs.passive * bb : undefined });
  return a;
}

function preflopEquity(hole: readonly [Card, Card], groups: Combo[][], o: AdviceOptions, seed: number, iters: number): { equity: number; exact: boolean } {
  const rng = createRng(seed);
  const live = groups.filter((g) => g.length > 0);
  if (live.length === 0) return { equity: HAND_EQUITY_VS_RANDOM[handLabel(hole[0], hole[1])]!, exact: false };
  if (live.length === 1) {
    const r = equityVsRange(hole, live[0]!, [], { iterations: o.iterations ? Math.min(o.iterations, iters) : iters, rng, exactLimit: o.exactLimit });
    return { equity: r.equity, exact: r.exact };
  }
  const res = equityMulti([[{ hand: [hole[0], hole[1]], weight: 1 }], ...live], [], { iterations: o.iterations ? Math.min(o.iterations, iters) : iters, rng, exactLimit: o.exactLimit });
  return { equity: res[0]!.equity, exact: res[0]!.exact };
}

function preflopRaiseSize(hand: HandState, legal: LegalActions, pos: Position, limpers: number, sit: string, capTo: number, seat: number): number {
  const bb = hand.config.bb;
  let to: number;
  if (sit === 'short' || sit === 'vs-shove' || sit === 'vs-4bet') to = capTo;
  else if (sit === 'rfi' || sit === 'bb-option') {
    const base = pos === 'UTG' || pos === 'HJ' ? 3 : pos === 'SB' ? 3.5 : 2.5;
    to = Math.round(bb * (base + limpers + (sit === 'bb-option' ? 0.5 : 0)));
  } else if (sit === 'vs-open') {
    const pre = hand.actions.filter((a) => a.street === 'preflop');
    const first = pre.findIndex((a) => a.type === 'raise');
    const callers = pre.slice(first + 1).filter((a) => a.type === 'call').length;
    // In position = you act after the raiser on every later street.
    const n = hand.players.length;
    const order = (x: number): number => (x - hand.button - 1 + n) % n; // postflop order: SB first, button last
    const ip = order(seat) > order(pre[first]!.seat);
    to = Math.round(legal.currentBet * (ip ? 3 : 4) + callers * legal.currentBet);
  } else to = Math.round(legal.currentBet * 2.3);
  // Raising to most of the stack: just move all-in.
  if (to >= 0.65 * capTo) to = capTo;
  return Math.max(legal.minRaiseTo, Math.min(capTo, to));
}

// ---------------------------------------------------------------------------
// Postflop
// ---------------------------------------------------------------------------

function isInPosition(hand: HandState, seat: number): boolean {
  const n = hand.players.length;
  const order = (x: number): number => (x - hand.button - 1 + n) % n;
  return hand.players.every((p) => !p.inHand || p.folded || p.seat === seat || order(p.seat) < order(seat));
}

function heroEquity(hole: readonly [Card, Card], opps: Combo[][], board: readonly Card[], o: AdviceOptions, rngSeed: number) {
  const rng = createRng(rngSeed);
  if (opps.length === 1) {
    const r = equityVsRange(hole, opps[0]!, board, { iterations: o.iterations ?? 8000, rng, exactLimit: o.exactLimit });
    return { equity: r.equity, exact: r.exact };
  }
  const res = equityMulti([[{ hand: [hole[0], hole[1]], weight: 1 }], ...opps], board, { iterations: o.iterations ?? 8000, rng, exactLimit: o.exactLimit });
  return { equity: res[0]!.equity, exact: res[0]!.exact };
}

function pickBetFraction(assess: Assessment, tex: BoardTexture, river: boolean): number {
  let f = tex.wetness === 'dry' ? 0.33 : tex.wetness === 'medium' ? 0.5 : 0.7;
  if (river) f = assess.bucket === 'monster' || assess.bucket === 'strong' ? 0.66 : 0.5;
  else if ((assess.bucket === 'monster') && tex.wetness === 'dry') f = 0.5;
  return f;
}

function postflopAdvice(hand: HandState, opts: AdviceOptions): Advice {
  const seat = hand.toAct;
  const p = hand.players[seat]!;
  const hole = p.hole as [Card, Card];
  const legal = legalActions(hand)!;
  const bb = hand.config.bb;
  const n = hand.config.numSeats;
  const pos = positionOf(seat, hand.button, n);
  const label = handLabel(hole[0], hole[1]);
  const board = hand.board;
  const pot = potTotal(hand);
  const winPot = winnablePot(hand, seat);
  const toCall = legal.callAmount;
  const river = hand.street === 'river';
  const ip = isInPosition(hand, seat);
  const assess = assessHand(hole, board);
  const tex = classifyBoard(board);
  const seed = hashSeed(hand.seed, 'advice', hand.actions.length);
  const live = liveOpps(hand, seat);
  const ests: OppEstimate[] = live.map((x) => estimateOpponent(hand, x.seat, hole));
  const eqRes = heroEquity(hole, ests.map((e) => e.combos), board, opts, seed);
  const eq = eqRes.equity;
  const nOpp = live.length;
  // After this call, will any more betting happen? If not, the hero realises all of their equity.
  const callAllIn = toCall > 0 && toCall >= p.stack;
  const othersCanBet = live.filter((q) => !q.allIn && q.stack > 0).length;
  const noMoreBetting = callAllIn || (toCall > 0 && othersCanBet === 0) || (toCall > 0 && live.every((q) => q.allIn || q.stack === 0))
    || (toCall > 0 && river && live.length === 1); // a heads-up river call ends the betting
  const R = noMoreBetting ? 1 : ip ? 1 : 0.92; // in-position players realise more of their equity

  // ---- Passive and fold options ----
  const evFold = 0;
  const evPassive = toCall > 0 ? R * eq * (winPot + toCall) - toCall : R * eq * pot;

  // ---- Aggressive option (bet or raise), modelled against opponents who defend at MDF ----
  const capTo = raiseCap(hand, seat, legal);
  const foldable = live.filter((q) => !q.allIn);
  const evAggAt = (to: number): number => {
    const effTo = Math.max(legal.currentBet + 1, Math.min(to, capTo));
    const X = effTo - p.bet; // chips hero adds (the uncalled part of a bigger raise comes back)
    const c = pot / (pot + X); // minimum defence frequency vs this bet/raise
    const k = Math.max(1, foldable.length);
    const tops = ests.map((e) => {
      const sorted = sortByStrength(e.combos, board);
      return sorted.slice(0, Math.max(1, Math.ceil(sorted.length * c)));
    });
    const pFold = Math.pow(1 - c, k);
    const callers = (k * c) / Math.max(1e-9, 1 - pFold); // expected callers when at least one calls
    const adds = foldable.map((q) => Math.max(0, Math.min(effTo, q.bet + q.stack) - q.bet));
    const avgAdd = adds.length ? adds.reduce((x, y) => x + y, 0) / adds.length : 0;
    const finalPot = pot + X + callers * avgAdd;
    const calledEq = heroEquity(hole, tops, board, { ...opts, iterations: Math.min(opts.iterations ?? 8000, 5000) }, seed + 1 + (to % 997)).equity;
    return pFold * pot + (1 - pFold) * (calledEq * finalPot - X);
  };
  let evAgg: number | null = null;
  let aggTo = 0;
  let aggLabel = '';
  let aggFoldPct = 0;
  if (legal.canRaise && capTo > legal.currentBet) {
    const behind = capTo - p.bet; // most chips hero can usefully add
    const spr0 = behind / Math.max(1, pot);
    if (toCall === 0) {
      const frac = pickBetFraction(assess, tex, river);
      aggTo = Math.round(Math.max(legal.minRaiseTo, Math.min(capTo, frac * pot)));
    } else {
      const threeX = legal.currentBet * 3;
      aggTo = Math.round(Math.max(legal.minRaiseTo, Math.min(capTo, Math.min(threeX, legal.currentBet + pot + toCall))));
    }
    if (aggTo >= capTo * 0.65 || spr0 <= 1.2) aggTo = Math.max(legal.minRaiseTo, capTo);
    aggTo = Math.min(aggTo, legal.maxRaiseTo);
    evAgg = evAggAt(aggTo);
    const X = Math.min(aggTo, capTo) - p.bet;
    aggFoldPct = Math.pow(1 - pot / (pot + X), Math.max(1, foldable.length));
  }

  const fmt = fmtChips;
  const options: ClassOption[] = [
    { cls: 'fold', label: 'Fold', action: { seat, type: 'fold' }, ev: evFold, evBB: evFold / bb },
    {
      cls: 'passive',
      label: legal.canCheck ? 'Check' : callAllIn ? `Call ${fmt(toCall)} (all-in)` : `Call ${fmt(toCall)}`,
      action: { seat, type: legal.canCheck ? 'check' : 'call' },
      ev: evPassive,
      evBB: evPassive / bb,
    },
  ];
  if (evAgg !== null) {
    aggLabel = aggressiveLabel(aggTo, legal, capTo, hand.street);
    options.push({
      cls: 'aggressive',
      label: aggLabel,
      action: aggTo >= legal.maxRaiseTo ? { seat, type: 'allin' } : { seat, type: legal.raiseType, amount: aggTo },
      ev: evAgg,
      evBB: evAgg / bb,
    });
  }
  // Folding when a check is free is never right.
  if (legal.canCheck) options[0]!.ev = Math.min(options[0]!.ev, evPassive - 0.05 * bb);
  options[0]!.evBB = options[0]!.ev / bb;

  const baseTol = Math.max(0.5 * bb, 0.06 * pot);
  const top = options.reduce((m, o) => (o.ev > m.ev ? o : m), options[0]!);
  // A bet/raise that only beats the best non-aggressive option by noise (e.g. a 0%-equity bluff against opponents
  // who defend exactly at MDF has EV 0) is not worth recommending: prefer the simpler check/call/fold.
  const nonAgg = options
    .filter((o) => o.cls !== 'aggressive' && !(o.cls === 'fold' && legal.canCheck))
    .reduce((m, o) => (o.ev > m.ev ? o : m));
  const best = top.cls === 'aggressive' && top.ev - nonAgg.ev < 0.25 * bb ? nonAgg : top;
  const recommended = best;

  // ---- Is the fold-vs-call comparison exact? (It must survive a wider and a tighter opponent range.) ----
  const be = toCall > 0 ? breakEvenEquity(toCall, winPot) : null;
  let callMath = false;
  if (toCall > 0) {
    const wide = ests.map((e) => e.preflopCombos);
    const tight = ests.map((e) => narrowByStrength(e.combos, board, 0.55));
    const decide = (opps: Combo[][], salt: number): boolean => {
      const e = heroEquity(hole, opps, board, { ...opts, iterations: Math.min(opts.iterations ?? 8000, 4000) }, seed + salt).equity;
      return R * e * (winPot + toCall) - toCall > 0;
    };
    const base = evPassive > 0;
    callMath = decide(wide, 2) === base && decide(tight, 3) === base && Math.abs(evPassive) > baseTol;
  }

  // ---- Confidence tier ----
  let tier: Tier = 'judgment';
  if (toCall > 0 && recommended.cls !== 'aggressive' && callMath) tier = 'math';
  else if (recommended.cls === 'aggressive' && eq >= 0.8) tier = 'standard';
  else if (toCall === 0 && recommended.cls === 'passive' && assess.bucket === 'air' && !assess.draws.any) tier = 'standard';

  // Be generous between checking/calling and betting/raising (that depends on the opponent model),
  // but never accept a fold that gives up a clearly profitable call, or a clearly losing call.
  const tol = tier === 'math' ? baseTol : Math.max(1.5 * bb, 0.15 * pot);
  const badFold = toCall > 0 && evPassive > 0 && (callMath || evPassive > 3 * bb);
  const badCall = toCall > 0 && evPassive < 0 && (callMath || evPassive < -3 * bb);
  let acceptable = options
    .filter((o) => o.ev >= best.ev - tol && !(o.cls === 'fold' && legal.canCheck))
    .filter((o) => !(o.cls === 'fold' && badFold) && !(o.cls === 'passive' && badCall))
    .map((o) => o.cls);
  if (!acceptable.includes(recommended.cls)) acceptable = [recommended.cls, ...acceptable];
  // A call that the price clearly justifies (the lessons' pot-odds rule) is never graded down just because the
  // coach's opponent model likes a raise more: that edge depends on how opponents defend, which is a judgment.
  if (recommended.cls === 'aggressive' && toCall > 0 && callMath && evPassive > 0 && !acceptable.includes('passive')) acceptable.push('passive');
  const close = acceptable.length > 1;

  // ---- Outs and draws ----
  let outs: Advice['outs'] = null;
  let outsMakes = { flush: false, straight: false, boat: false };
  if (!river && (assess.bucket === 'draw' || assess.draws.strong || (assess.draws.straightRanks >= 1 && assess.bucket !== 'monster'))) {
    const o = findOuts(hole, board);
    const toCome: 1 | 2 = board.length === 3 ? 2 : 1;
    // "Outs" here means the cards that complete a straight or better (cards likely to make the best hand), not
    // pairs that may still lose to an obvious better hand. The equity figure already counts every other way to win.
    const real = o.outs.filter((x) => x.category >= Category.Straight);
    const clean = real.filter((x) => !x.dirty).length;
    const cats = new Set(real.map((x) => x.category));
    outsMakes = {
      flush: cats.has(Category.Flush) || cats.has(Category.StraightFlush),
      straight: cats.has(Category.Straight),
      boat: cats.has(Category.FullHouse) || cats.has(Category.Quads),
    };
    const dirty = real.length - clean;
    const all = real.length;
    if (all > 0) outs = {
      count: all, clean, dirty,
      rule: ruleOf2And4(all, toCome, true) / 100,
      adjusted: toCome === 2 && all > 8,
      exact: exactHitChance(all, o.unseen, toCome),
      ruleOne: ruleOf2And4(all, 1) / 100,
      exactOne: exactHitChance(all, o.unseen, 1),
    };
  }

  // ---- Explanations ----
  const single = ests.length === 1;
  const who = single ? ests[0]!.name : 'your opponents';
  const hasWord = single ? 'has' : 'hold';
  const parts: WhyPart[] = [];
  const boardNote = `${tex.wetness} board${tex.paired !== 'none' ? ' that is paired' : ''}`;
  const highName = RANK_NAMES[Math.max(rankOf(hole[0]), rankOf(hole[1]))]!.toLowerCase();
  let handText: string;
  if (assess.bucket === 'draw') {
    const draw = assess.label.replace(/^no made hand, but /i, '');
    handText = `You don't have a made hand yet (${assess.description.toLowerCase()}), but you have ${withArticle(draw)} on a ${boardNote}.`;
  } else if (assess.bucket === 'air' && assess.pair === 'board') {
    handText = eq < 0.3
      ? `The made part of your hand is on the board, so everyone shares it. On your own you have only ${highName} high and no real draw on a ${boardNote}: that rarely wins at showdown, so this hand mostly wins when others fold.`
      : `The made part of your hand is on the board, so everyone shares it; your ${highName} decides the winner against other hands that don't improve on it. There is no real draw on this ${boardNote}.`;
  } else if (assess.bucket === 'air') {
    handText = eq < 0.3
      ? `You have ${withArticle(assess.description)} and no real draw on a ${boardNote} (air): it rarely wins at showdown, so it mostly wins when others fold.`
      : `You have ${withArticle(assess.description)} and no real draw on a ${boardNote} (air): no pair and no draw, but against the wide range of hands ${who} likely ${hasWord}, high cards like yours still win a fair share of the time.`;
  } else {
    handText = `You have ${labelWithDescription(assess.label, assess.description)} on a ${boardNote}.`;
  }
  parts.push({ concept: 'hand-strength', text: cap1(handText) });
  const flopPriced = board.length === 3 && toCall > 0 && !noMoreBetting;
  if (be !== null) {
    parts.push({
      concept: 'pot-odds',
      text: `You risk ${fmt(toCall)} to win ${fmt(winPot)}, so you need to win at least ${pct(be)} of the time to break even (${formatRatio(toCall, winPot)}). Against the hands ${who} likely ${hasWord}, you win about ${pct(eq)}${flopPriced ? ' if you see both the turn and the river' : ''} — ${eq > be ? 'more than the price requires' : 'less than the price requires'}.${
        R < 1 && eq > be && evPassive <= 0 ? ' Out of position you will not always get to use all of that chance, so the coach counts about 92% of it, which is not quite enough.' : ''}`,
    });
    if (winPot < pot) parts.push({ concept: 'pot-odds', text: `Only ${fmt(winPot)} of the ${fmt(pot)} in the pot can go to you: you are all-in for less than the bet, so the rest of it goes back to its owner.` });
  } else {
    parts.push({ concept: 'equity', text: `Against the hands ${who} likely ${hasWord}, you win about ${pct(eq)} of the time.` });
  }
  let outsPart: WhyPart | null = null;
  if (outs && !river) {
    const madeNames: string[] = [];
    if (outsMakes.flush) madeNames.push('a flush');
    if (outsMakes.straight) madeNames.push('a straight');
    if (outsMakes.boat) madeNames.push('a full house or better');
    const makesText = madeNames.length ? ` to ${madeNames.length > 1 ? `${madeNames.slice(0, -1).join(', ')} or ${madeNames[madeNames.length - 1]}` : madeNames[0]}` : '';
    const outsWord = `You have ${outs.count} out${outs.count === 1 ? '' : 's'}${makesText}${outs.dirty ? ` (${outs.dirty === outs.count ? (outs.count === 1 ? 'it is' : 'all of them are') : outs.dirty === 1 ? '1 of them is' : `${outs.dirty} of them are`} risky: ${outs.dirty === 1 ? 'it' : 'they'} could also give an opponent a better hand, so ${outs.dirty === 1 ? 'it is' : 'they are'} worth less)` : ''}.`;
    let ruleText: string;
    const cleanNote = outs.dirty && outs.clean > 0 && outs.clean < outs.count
      ? ` Counting only the ${outs.clean} clean out${outs.clean === 1 ? '' : 's'}, it is about ${board.length === 3 ? ruleOf2And4(outs.clean, 2, true) : ruleOf2And4(outs.clean, 1)}%: the truth is somewhere in between.`
      : outs.dirty && outs.clean === 0
        ? ` Because every one of these outs is risky, your real chance of ending up with the best hand is somewhat lower than this.`
        : '';
    if (board.length === 3) {
      ruleText = ` The ${outs.adjusted ? 'Rule of 4, adjusted (subtract one for each out above 8),' : 'Rule of 4'} says about ${Math.round(outs.rule * 100)}% to hit by the river; the exact number is ${pct(outs.exact)}.${cleanNote}`;
      if (flopPriced && be !== null) {
        const one = outs.ruleOne;
        ruleText += ` But this bet only pays for the turn card, and more bets may come before the river. By the Rule of 2 the turn alone is about ${Math.round(one * 100)}% (exactly ${pct(outs.exactOne)}), ${
          outs.exactOne >= be ? `enough for the ${pct(be)} the price asks.` : outs.exact >= be ? `less than the ${pct(be)} the price asks, so calling also relies on winning more chips when you hit, or seeing the river cheaply.` : `and even counting both cards, these outs alone fall short of the ${pct(be)} the price asks.`
        }`;
      } else if (toCall > 0) {
        ruleText += ' No more betting can happen, so you will see both cards for this price.';
      }
    } else {
      ruleText = ` The Rule of 2 says about ${Math.round(outs.ruleOne * 100)}% to hit on the river; the exact number is ${pct(outs.exactOne)}.${cleanNote}`;
    }
    outsPart = { concept: 'outs', text: outsWord + ruleText };
  }
  const betWord = toCall > 0 ? 'raising' : 'betting';
  const passWord = toCall > 0 ? 'calling' : 'checking';
  if (recommended.cls === 'aggressive') {
    const reason =
      assess.bucket === 'draw' && !river
        ? eq >= 0.3
          ? `You have a strong draw with ${pct(eq)} equity: ${betWord} is a semi-bluff — it can win the pot now, and you still have your outs when called`
          : `Your draw wins only about ${pct(eq)} if it gets to showdown, but the model expects folds often enough that ${betWord} earns more than ${passWord} (a semi-bluff: it can win the pot now, and you still have some outs when called)`
        : eq >= 0.65
        ? `Your hand is likely best, so ${betWord} gets worse hands to pay you (value)${river ? '' : ' and makes draws pay to see the next card'}`
        : eq < 0.3
          ? `Your hand rarely wins at showdown, but the model expects folds often enough that ${betWord} earns more than ${passWord} (a bluff using fold equity)`
          : `Your hand has a fair share of the pot, and the model expects folds often enough that ${betWord} earns more than ${passWord} (fold equity)`;
    parts.push({ concept: 'betting', text: `${reason}. ${aggLabel} is a reasonable size on a ${tex.wetness} board${aggFoldPct > 0 ? ` — the model expects ${single ? 'a fold' : 'everyone to fold'} about ${pct(aggFoldPct)} of the time` : ''}.` });
  } else if (recommended.cls === 'passive' && toCall === 0) {
    const text = assess.bucket === 'air'
      ? eq < 0.3
        ? 'Checking is fine here: your hand is not strong enough to bet for value and has little equity to bluff with, so you keep the pot small.'
        : `Checking is fine here: your hand is not strong enough to bet for value, and checking keeps the pot small${river ? ' while your high cards may still win at showdown' : ' and shows you the next card for free'}.`
      : assess.bucket === 'draw'
        ? `Checking is fine here: you see the next card for free${nOpp >= 2 ? ', and betting into several opponents rarely makes them all fold' : ''}.`
        : 'Checking is fine here: your hand is good enough to see a showdown but not strong enough to build a big pot, so you keep the pot small.';
    parts.push({ concept: 'betting', text });
  } else if (recommended.cls === 'fold') {
    parts.push({ concept: 'pot-odds', text: `Folding costs nothing more; calling would lose chips on average.` });
  }
  // The reason for the recommended action comes before the outs detail, so it survives when the panel shows only
  // the first few parts.
  if (outsPart) parts.push(outsPart);
  if (!ip && !noMoreBetting && !(river && toCall > 0)) {
    parts.push({
      concept: 'position',
      text: toCall > 0
        ? `If you continue, you will have to act first on the next street${nOpp >= 2 ? ' against at least one opponent' : ''}, which makes it harder to play.`
        : `You act before ${nOpp >= 2 ? 'at least one of your opponents' : 'your opponent'}, so you have to decide without seeing what they do first.`,
    });
  }
  if (nOpp >= 2) parts.push({ concept: 'opponents', text: `With ${nOpp} opponents in the pot, each one makes it more likely that someone has a strong hand.` });

  const nudges: WhyPart[] = [];
  if (toCall > 0) {
    nudges.push({ concept: 'basics', text: 'You are facing a bet. Ask: how big is it compared with the pot, and does my hand look good enough to keep going?' });
    nudges.push({ concept: 'pot-odds', text: 'Compare the price you are being offered with your chance of winning. Count your outs if you have a draw.' });
  } else {
    nudges.push({ concept: 'basics', text: 'Nobody has bet. Do you want to bet (for value or as a bluff) or check?' });
    nudges.push({ concept: 'betting', text: 'Is your hand strong enough that worse hands would call? If not, is it worth bluffing?' });
  }

  const headline = recommended.label + (close ? '  (close spot)' : '');
  const result: Advice = {
    seat, street: hand.street, kind: 'postflop', situation: 'postflop', unopened: false, evKind: 'ev',
    handLabel: label, position: pos, pot, winPot, toCall, stack: p.stack, spr: streetSpr(hand, seat),
    options, recommended, acceptable: [...new Set(acceptable)], close, tier,
    concept: toCall > 0 ? (outs ? 'pot-odds-draws' : 'pot-odds') : recommended.cls === 'aggressive' ? 'betting' : 'check-back',
    headline, whyParts: parts, nudges,
    equity: eq, equityExact: eqRes.exact, breakEven: be, potOdds: toCall > 0 ? formatRatio(toCall, winPot) : null,
    opponents: ests.map((e) => ({ name: e.name, description: e.description, percent: e.preflopPercent })),
    assessment: assess, texture: tex, outs, chart: null, tolerance: tol,
  };
  if (opts.chosen) {
    result.chosen = describeChosen(result, opts.chosen, { legal, bb, evAggAt: legal.canRaise ? evAggAt : undefined, callMath, evPassive, bucket: assess.bucket });
  }
  return result;
}
