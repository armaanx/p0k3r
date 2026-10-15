// Archetype bots. They only use information a human could see (own cards + public action).
// Decisions are deterministic given the game state (the RNG is derived from the hand seed and action count),
// which makes hands replayable: the same spot always produces the same bot action.
import { type Card, handLabel } from './cards';
import { type ActionInput, type HandState, legalActions, potTotal } from './game';
import { assessHand, strengthScore, type Assessment } from './handStrength';
import { HAND_RANKING, topPercent } from './handRanking';
import { createRng, hashSeed, type Rng } from './rng';
import { type Range, comboCount, parseRange } from './ranges';
import { classifyBoard } from './texture';
import {
  FACING_3BET, defendRanges_, hasDefendChart, openRange, positionOf,
} from './preflopCharts';

export type Archetype = 'nit' | 'station' | 'maniac' | 'tag' | 'lag';

export interface BotProfile {
  id: Archetype;
  /** Default display name. */
  name: string;
  title: string;
  /** Key for the UI avatar artwork. */
  avatar: string;
  color: string;
  blurb: string;
  /** Things a learner can observe at the table (used by lessons, drills and the Reference page). */
  tells: string[];
  /** Typical stats, measured by the 6-max simulation test (VPIP/PFR in %, AF = postflop bets+raises per call). */
  vpip: number;
  pfr: number;
  af: number;
  // behaviour knobs
  openScale: number;
  callScale: number;
  threeBetScale: number;
  limpProb: number;
  cbet: number;
  bluff: number;
  semiBluff: number;
  valueBet: number;
  callDown: number;
  raiseFreq: number;
  sizeMult: number;
}

export const PROFILES: Record<Archetype, BotProfile> = {
  nit: {
    id: 'nit', name: 'Walter', title: 'The Nit', avatar: 'owl', color: '#7d9bb5',
    blurb: 'Plays very few hands and almost never bluffs. When Walter bets big, believe him.',
    tells: ['Folds most hands preflop', 'Raises only with strong hands', 'Gives up quickly when a board looks scary'],
    vpip: 11, pfr: 7, af: 3.0,
    openScale: 0.55, callScale: 0.5, threeBetScale: 0.45, limpProb: 0, cbet: 0.6, bluff: 0.02, semiBluff: 0.2, valueBet: 0.8, callDown: 0.3, raiseFreq: 0.35, sizeMult: 1,
  },
  station: {
    id: 'station', name: 'Gloria', title: 'The Calling Station', avatar: 'cat', color: '#d9a05b',
    blurb: 'Loves to see flops and hates folding. Rarely raises, rarely bluffs, and calls far too often.',
    tells: ['Calls a lot preflop (limps and calls raises)', 'Rarely raises', 'Calls bets on every street with weak pairs'],
    vpip: 41, pfr: 7, af: 0.4,
    openScale: 0.4, callScale: 4.0, threeBetScale: 0.4, limpProb: 0.8, cbet: 0.25, bluff: 0.01, semiBluff: 0.15, valueBet: 0.5, callDown: 0.9, raiseFreq: 0.12, sizeMult: 0.8,
  },
  maniac: {
    id: 'maniac', name: 'Rico', title: 'The Maniac', avatar: 'fox', color: '#d6604d',
    blurb: 'Raises constantly and bets huge with anything. Rico is fun to play against if you stay patient.',
    tells: ['Plays about half the hands', 'Raises and re-raises constantly', 'Fires big bets with weak hands'],
    vpip: 52, pfr: 43, af: 3.7,
    openScale: 2.5, callScale: 2.8, threeBetScale: 3.5, limpProb: 0.05, cbet: 0.9, bluff: 0.45, semiBluff: 0.95, valueBet: 0.95, callDown: 0.6, raiseFreq: 0.5, sizeMult: 1.5,
  },
  tag: {
    id: 'tag', name: 'Maya', title: 'Tight-Aggressive', avatar: 'heron', color: '#6fb28a',
    blurb: 'Solid and selective. Maya plays strong hands aggressively: the style this app teaches.',
    tells: ['Plays a tight range by position', 'Raises more than she calls', 'Bets for value and occasionally bluffs'],
    vpip: 21, pfr: 15, af: 2.2,
    openScale: 1.3, callScale: 1.15, threeBetScale: 1, limpProb: 0, cbet: 0.65, bluff: 0.15, semiBluff: 0.65, valueBet: 0.8, callDown: 0.5, raiseFreq: 0.3, sizeMult: 1,
  },
  lag: {
    id: 'lag', name: 'Jin', title: 'Loose-Aggressive', avatar: 'wolf', color: '#b57bd1',
    blurb: 'Plays lots of hands and applies pressure. Jin bluffs often, but is not reckless.',
    tells: ['Opens many hands, especially late', '3-bets light', 'Bets and raises often after the flop'],
    vpip: 29, pfr: 23, af: 3.3,
    openScale: 1.75, callScale: 1.35, threeBetScale: 2.0, limpProb: 0, cbet: 0.75, bluff: 0.28, semiBluff: 0.8, valueBet: 0.9, callDown: 0.55, raiseFreq: 0.4, sizeMult: 1.1,
  },
};

export const ARCHETYPES: readonly Archetype[] = ['nit', 'station', 'maniac', 'tag', 'lag'];

// ---------------------------------------------------------------------------
// Range scaling helpers
// ---------------------------------------------------------------------------

const RANK_INDEX = new Map(HAND_RANKING.map((l, i) => [l, i] as const));
const scaleCache = new Map<string, Range>();

/** Make a range narrower (scale<1, keeping its best hands) or wider (scale>1, adding the next-best hands). */
export function scaleRange(base: Range, scale: number, key: string): Range {
  const ck = `${key}@${scale.toFixed(2)}`;
  const hit = scaleCache.get(ck);
  if (hit) return hit;
  let baseCombos = 0;
  for (const [l, w] of base) baseCombos += comboCount(l) * w;
  const target = Math.min(1326 * 0.9, baseCombos * scale);
  const out: Range = new Map();
  if (scale <= 1) {
    const sorted = [...base.keys()].sort((a, b) => RANK_INDEX.get(a)! - RANK_INDEX.get(b)!);
    let c = 0;
    for (const l of sorted) {
      if (c >= target) break;
      out.set(l, 1);
      c += comboCount(l);
    }
  } else {
    for (const [l, w] of base) out.set(l, w);
    let c = baseCombos;
    for (const l of HAND_RANKING) {
      if (c >= target) break;
      if (out.has(l)) continue;
      out.set(l, 1);
      c += comboCount(l);
    }
  }
  scaleCache.set(ck, out);
  return out;
}

const has = (r: Range, l: string): boolean => (r.get(l) ?? 0) > 0;

// ---------------------------------------------------------------------------
// Decision entry point
// ---------------------------------------------------------------------------

export function botRng(s: HandState, seat: number): Rng {
  return createRng(hashSeed(s.seed, 'bot', seat, s.actions.length));
}

export function botDecide(s: HandState, profile: BotProfile): ActionInput {
  const seat = s.toAct;
  const legal = legalActions(s);
  if (!legal) throw new Error('no action available');
  const rng = botRng(s, seat);
  const raw = s.street === 'preflop' ? preflopDecision(s, profile, rng) : postflopDecision(s, profile, rng);
  return sanitize(s, raw, legal);
}

interface RawDecision {
  kind: 'fold' | 'check' | 'call' | 'raise';
  /** Desired raise-to total (for raise). */
  to?: number;
}

function sanitize(s: HandState, d: RawDecision, legal: NonNullable<ReturnType<typeof legalActions>>): ActionInput {
  const seat = legal.seat;
  const toCall = legal.callAmount;
  if (d.kind === 'raise') {
    if (!legal.canRaise) return toCall > 0 ? { seat, type: 'call' } : { seat, type: 'check' };
    let to = Math.round(d.to ?? legal.minRaiseTo);
    to = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, to));
    // Don't leave a tiny stack behind: just shove.
    if (legal.maxRaiseTo - to < s.config.bb * 1.5 || to >= legal.maxRaiseTo * 0.8) to = legal.maxRaiseTo;
    if (to >= legal.maxRaiseTo) return { seat, type: 'allin' };
    return { seat, type: legal.raiseType, amount: to };
  }
  if (d.kind === 'call') {
    if (toCall === 0) return { seat, type: 'check' };
    return { seat, type: 'call' };
  }
  if (d.kind === 'check') return toCall === 0 ? { seat, type: 'check' } : { seat, type: 'fold' };
  // fold
  return toCall === 0 ? { seat, type: 'check' } : { seat, type: 'fold' };
}

// ---------------------------------------------------------------------------
// Preflop
// ---------------------------------------------------------------------------

interface PreCtx {
  raises: number;
  limpers: number;
  firstRaiser: number;
  lastRaiser: number;
  heroRaised: boolean;
  callersAfterRaise: number;
}

function preCtx(s: HandState, seat: number): PreCtx {
  const pre = s.actions.filter((a) => a.street === 'preflop');
  const raises = pre.filter((a) => a.type === 'raise');
  const firstIdx = raises.length ? pre.indexOf(raises[0]!) : -1;
  return {
    raises: raises.length,
    limpers: raises.length === 0 ? pre.filter((a) => a.type === 'call').length : 0,
    firstRaiser: raises[0]?.seat ?? -1,
    lastRaiser: raises[raises.length - 1]?.seat ?? -1,
    heroRaised: raises.some((a) => a.seat === seat),
    callersAfterRaise: firstIdx >= 0 ? pre.slice(firstIdx + 1).filter((a) => a.type === 'call').length : 0,
  };
}

function preflopDecision(s: HandState, pr: BotProfile, rng: Rng): RawDecision {
  const seat = s.toAct;
  const p = s.players[seat]!;
  const hole = p.hole!;
  const label = handLabel(hole[0], hole[1]);
  const n = s.config.numSeats;
  const headsUp = s.players.filter((x) => x.inHand).length === 2;
  const pos = positionOf(seat, s.button, n);
  const bb = s.config.bb;
  const ctx = preCtx(s, seat);
  const legal = legalActions(s)!;
  const stackBB = (p.stack + p.bet) / bb;

  // Short stack: push or fold.
  if (stackBB <= 12) {
    const shove = topPercent(stackBB <= 7 ? 32 : 20);
    if (ctx.raises === 0 || has(topPercent(stackBB <= 7 ? 14 : 10), label)) {
      return has(shove, label) ? { kind: 'raise', to: legal.maxRaiseTo } : legal.canCheck ? { kind: 'check' } : { kind: 'fold' };
    }
    return has(topPercent(5), label) ? { kind: 'raise', to: legal.maxRaiseTo } : { kind: 'fold' };
  }

  const sizeOpen = (): number => {
    const base = pos === 'UTG' || pos === 'HJ' ? 3 : pos === 'SB' ? 3.5 : 2.5;
    const jitter = 0.8 + rng.next() * 0.5;
    return Math.round(bb * (base * (1 + (pr.sizeMult - 1) * 0.8) * jitter + ctx.limpers));
  };

  // ---- Nobody has raised yet ----
  if (ctx.raises === 0) {
    const openR = scaleRange(openRange(pos, headsUp), pr.openScale, `open:${pos}:${headsUp}`);
    if (pos === 'BB') {
      // Big blind option after limps: raise strong hands to isolate, otherwise check.
      const isoR = scaleRange(openRange('CO'), pr.openScale * 0.7, 'iso');
      if (ctx.limpers > 0 && has(isoR, label) && rng.next() < 0.75) return { kind: 'raise', to: sizeOpen() + bb };
      return { kind: 'check' };
    }
    if (has(openR, label)) return { kind: 'raise', to: sizeOpen() };
    // Limp / complete with playable hands (passive, loose players)
    if (pr.limpProb > 0) {
      const limpR = topPercent(Math.min(70, pr.vpip + 8));
      if (has(limpR, label) && rng.next() < pr.limpProb) return { kind: 'call' };
    }
    if (pos === 'SB' && pr.callScale > 1 && has(topPercent(pr.vpip), label)) return { kind: 'call' };
    return legal.canCheck ? { kind: 'check' } : { kind: 'fold' };
  }

  // ---- Facing a single raise (possibly with callers) ----
  if (ctx.raises === 1 && !ctx.heroRaised) {
    const raiserPos = positionOf(ctx.firstRaiser, s.button, n);
    const raiseTo = s.currentBet;
    const bigRaise = raiseTo > bb * 4.5;
    let threeBet: Range;
    let call: Range;
    if (hasDefendChart(pos, raiserPos) && !headsUp) {
      const r = defendRanges_(pos, raiserPos);
      threeBet = scaleRange(r.threeBet, pr.threeBetScale, `3b:${pos}>${raiserPos}`);
      call = scaleRange(r.call, pr.callScale, `call:${pos}>${raiserPos}`);
    } else if (headsUp) {
      threeBet = scaleRange(parseRange('TT+,AJs+,KQs,AQo+,A5s-A3s'), pr.threeBetScale, 'hu3b');
      call = scaleRange(parseRange('22-99,A2s-ATs,K7s+,Q9s+,J9s+,T9s,98s,87s,76s,65s,A8o+,KTo+,QTo+,JTo'), pr.callScale, 'hucall');
    } else {
      threeBet = scaleRange(parseRange('QQ+,AKs,AKo'), pr.threeBetScale, 'gen3b');
      call = scaleRange(parseRange('77-JJ,AQs,AJs,KQs'), pr.callScale, 'gencall');
    }
    if (ctx.callersAfterRaise > 0) call = scaleRange(call, 0.85, `squeezecall:${pos}>${raiserPos}:${pr.callScale}`);
    if (bigRaise && pr.callDown < 0.8) call = scaleRange(call, 0.75, `bigcall:${pos}>${raiserPos}:${pr.callScale}`);
    if (has(threeBet, label)) {
      const ip = pos === 'BTN' || pos === 'CO';
      const mult = (ip ? 3 : 4) * (1 + (pr.sizeMult - 1) * 0.6);
      return { kind: 'raise', to: Math.round(raiseTo * mult * (0.9 + rng.next() * 0.3)) };
    }
    if (has(call, label)) return { kind: 'call' };
    return legal.canCheck ? { kind: 'check' } : { kind: 'fold' };
  }

  // ---- Facing a 3-bet after we opened ----
  if (ctx.raises === 2 && ctx.heroRaised) {
    const fourBet = scaleRange(FACING_3BET.fourBet, pr.threeBetScale * 0.9, 'fb');
    const callR = scaleRange(FACING_3BET.call, pr.callScale, 'f3call');
    if (has(fourBet, label)) return { kind: 'raise', to: Math.round(s.currentBet * 2.3) };
    if (has(callR, label) && s.currentBet < stackBB * bb * 0.4) return { kind: 'call' };
    return { kind: 'fold' };
  }

  // ---- Facing 2+ raises as a non-raiser, or a 4-bet+: only continue with the very top ----
  const cont = scaleRange(topPercent(ctx.raises >= 3 ? 2 : 3.5), Math.max(0.6, pr.callScale ** 0.7), `deep:${ctx.raises}`);
  if (has(topPercent(1.2), label)) return { kind: 'raise', to: legal.maxRaiseTo };
  if (has(cont, label)) return { kind: 'call' };
  return { kind: 'fold' };
}

// ---------------------------------------------------------------------------
// Postflop
// ---------------------------------------------------------------------------

function liveOpponents(s: HandState, seat: number): number {
  return s.players.filter((p) => p.inHand && !p.folded && p.seat !== seat).length;
}

function isInPosition(s: HandState, seat: number): boolean {
  const n = s.players.length;
  const order = (x: number): number => (x - s.button - 1 + n) % n; // 0 = acts first postflop
  return s.players.every((p) => !p.inHand || p.folded || p.seat === seat || order(p.seat) < order(seat));
}

function wasPreflopAggressor(s: HandState, seat: number): boolean {
  const raises = s.actions.filter((a) => a.street === 'preflop' && a.type === 'raise');
  return raises.length > 0 && raises[raises.length - 1]!.seat === seat;
}

function postflopDecision(s: HandState, pr: BotProfile, rng: Rng): RawDecision {
  const seat = s.toAct;
  const p = s.players[seat]!;
  const hole = p.hole as [Card, Card];
  const a = assessHand(hole, s.board);
  const legal = legalActions(s)!;
  const pot = potTotal(s);
  const toCall = legal.callAmount;
  const tex = classifyBoard(s.board);
  const opps = liveOpponents(s, seat);
  const ip = isInPosition(s, seat);
  const aggressor = wasPreflopAggressor(s, seat);
  const multiway = opps >= 2;
  const river = s.street === 'river';
  const spr = p.stack / Math.max(1, pot);

  const sized = (frac: number): number => {
    const f = frac * (0.9 + rng.next() * 0.25) * (1 + (pr.sizeMult - 1) * 0.7);
    return s.currentBet + Math.round(pot * f);
  };

  // ---------- Nobody has bet: check or bet ----------
  if (toCall === 0) {
    const sizeFrac = chooseSize(a, tex.wetness, river, rng);
    switch (a.bucket) {
      case 'monster': {
        const slow = pr.id === 'nit' || pr.id === 'tag' ? 0.22 : 0.1;
        const freq = pr.valueBet * (ip ? 1 : 0.95);
        if (rng.next() < slow && tex.wetness === 'dry' && s.street === 'flop') return { kind: 'check' };
        return rng.next() < freq ? { kind: 'raise', to: sized(Math.min(1, sizeFrac + 0.1)) } : { kind: 'check' };
      }
      case 'strong': {
        const freq = pr.valueBet * (multiway ? 0.8 : 1);
        return rng.next() < freq ? { kind: 'raise', to: sized(sizeFrac) } : { kind: 'check' };
      }
      case 'medium': {
        const freq = (aggressor ? pr.cbet * 0.75 : pr.valueBet * 0.3) * (multiway ? 0.5 : 1) * (river ? 0.5 : 1);
        return rng.next() < freq * (pr.id === 'station' ? 0.4 : 1) ? { kind: 'raise', to: sized(Math.min(sizeFrac, 0.5)) } : { kind: 'check' };
      }
      case 'draw': {
        const freq = pr.semiBluff * (multiway ? 0.6 : 1) * (river ? 0 : 1) * (a.draws.strong ? 1 : 0.5) * (aggressor ? 1 : 0.7);
        return rng.next() < freq ? { kind: 'raise', to: sized(Math.max(sizeFrac, 0.55)) } : { kind: 'check' };
      }
      case 'weak':
        return rng.next() < pr.bluff * 0.5 * (multiway ? 0.3 : 1) && !river ? { kind: 'raise', to: sized(0.4) } : { kind: 'check' };
      default: {
        // Air: continuation bet / bluff. Dry boards and fewer opponents work best.
        let freq = aggressor && s.street === 'flop' ? pr.cbet * (tex.wetness === 'dry' ? 1 : tex.wetness === 'medium' ? 0.75 : 0.5) : pr.bluff * (river ? 0.9 : 0.6);
        if (multiway) freq *= 0.35;
        if (!ip && !aggressor) freq *= 0.5;
        if (pr.id === 'station') freq *= 0.4;
        return rng.next() < freq ? { kind: 'raise', to: sized(tex.wetness === 'dry' ? 0.33 : 0.6) } : { kind: 'check' };
      }
    }
  }

  // ---------- Facing a bet ----------
  const potOdds = toCall / (pot + toCall);
  const betFrac = toCall / Math.max(1, pot - toCall);
  const strength = strengthScore(a, s.board.length);
  // How much equity do we think we have against a betting range? Bigger bets mean stronger ranges.
  let eq = equityGuess(a, strength, river);
  eq -= Math.max(0, betFrac - 0.5) * 0.12;
  eq -= multiway ? 0.05 : 0;
  // Each archetype has its own threshold for calling: stations call light, nits need the goods.
  const bias = pr.id === 'station' ? 0.55 : pr.id === 'nit' ? 1.35 : pr.id === 'maniac' ? 0.75 : pr.id === 'lag' ? 0.92 : 1;
  const need = potOdds * bias;

  // Raise for value / as a bluff
  const canRaise = legal.canRaise;
  if (canRaise) {
    if (a.bucket === 'monster' && rng.next() < 0.35 + pr.raiseFreq * 0.9) return { kind: 'raise', to: sized(0.9 + betFrac) };
    if (a.bucket === 'strong' && !river && spr > 1 && rng.next() < pr.raiseFreq * 0.5) return { kind: 'raise', to: sized(0.8 + betFrac) };
    if (a.bucket === 'draw' && a.draws.strong && s.street === 'flop' && rng.next() < pr.semiBluff * pr.raiseFreq * 0.7) return { kind: 'raise', to: sized(0.8 + betFrac) };
    if ((a.bucket === 'air' || a.bucket === 'weak') && rng.next() < pr.bluff * pr.raiseFreq * 0.35 && !multiway) return { kind: 'raise', to: sized(0.9 + betFrac) };
  }

  if (eq >= need) {
    // Call-downs with marginal hands are capped by how "sticky" the archetype is.
    if ((a.bucket === 'medium' || a.bucket === 'weak') && s.street !== 'flop' && betFrac > 0.4 && rng.next() > pr.callDown + (potOdds < 0.25 ? 0.15 : 0)) return { kind: 'fold' };
    return { kind: 'call' };
  }
  // Below the price: sometimes hero-call / float, more often for sticky players, and keep a floor so we're not a pushover.
  const floor = pr.id === 'station' ? 0.45 : pr.id === 'nit' ? 0.03 : pr.id === 'maniac' ? 0.25 : 0.09;
  const close = eq >= need * 0.7;
  if (close && rng.next() < floor + (pr.callDown - 0.5) * 0.15) return { kind: 'call' };
  if (!close && a.bucket !== 'air' && rng.next() < floor * 0.35) return { kind: 'call' };
  return { kind: 'fold' };
}

function equityGuess(a: Assessment, strength: number, river: boolean): number {
  switch (a.bucket) {
    case 'monster': return 0.92;
    case 'strong': return 0.68;
    case 'medium': return 0.42;
    case 'weak': return 0.26;
    case 'draw': return river ? 0.05 : a.draws.strong ? (a.draws.flushDraw && a.draws.straightRanks >= 2 ? 0.52 : 0.38) : 0.22;
    default: return river ? 0.04 : Math.min(0.15, strength);
  }
}

function chooseSize(a: Assessment, wet: 'dry' | 'medium' | 'wet', river: boolean, rng: Rng): number {
  const base = wet === 'dry' ? 0.4 : wet === 'medium' ? 0.55 : 0.72;
  const valueBoost = a.bucket === 'monster' ? 0.1 : 0;
  const riverBoost = river && (a.bucket === 'monster' || a.bucket === 'strong') ? 0.1 : 0;
  return Math.min(1.1, base + valueBoost + riverBoost + (rng.next() - 0.5) * 0.1);
}
