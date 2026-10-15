// No-Limit Texas Hold'em hand state machine. Pure and immutable: every call returns a new state.
import { type Card, fullDeck } from './cards';
import { evaluate, describeScore } from './evaluator';
import { createRng } from './rng';
import { awardPot, buildPots, type Pot } from './pots';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
export type RecordedType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface GameConfig {
  numSeats: number; // 2..9 (6 and 2 are the supported teaching formats)
  sb: number;
  bb: number;
}

export interface PlayerState {
  seat: number;
  name: string;
  stack: number; // chips behind
  bet: number; // chips bet on the current street
  committed: number; // chips put in over the whole hand
  folded: boolean;
  allIn: boolean;
  inHand: boolean; // was dealt in
  hole: [Card, Card] | null;
  hasActed: boolean; // acted since the last full raise
  raiseLocked: boolean; // faced only an incomplete all-in raise since acting: may not re-raise
}

export interface ActionInput {
  seat: number;
  type: ActionType;
  /** For bet/raise: the TOTAL amount the player will have bet on this street ("raise to"). */
  amount?: number;
}

export interface ActionRecord {
  seat: number;
  street: Street;
  type: RecordedType;
  /** Player's total bet on this street after the action. */
  toAmount: number;
  /** Chips added by this action. */
  chips: number;
  allIn: boolean;
  /** Chips to call before this action. */
  toCall: number;
  /** Total pot (all committed chips) before this action. */
  potBefore: number;
  stackBefore: number;
}

export interface PotResult {
  amount: number;
  eligible: number[];
  awards: { seat: number; amount: number }[];
}

export interface HandResult {
  showdown: boolean;
  pots: PotResult[];
  /** Per-seat net change in chips for the hand (after returning uncalled bets). */
  net: number[];
  /** Seats that showed cards, in the order they show. */
  showdownOrder: number[];
  /** Score & description for seats at showdown. */
  hands: { seat: number; score: number; description: string }[];
  /** Uncalled bets returned to players. */
  refunds: { seat: number; amount: number; street: Street }[];
}

export interface HandState {
  config: GameConfig;
  seed: number;
  handNumber: number;
  button: number;
  sbSeat: number;
  bbSeat: number;
  street: Street;
  board: Card[];
  deck: readonly Card[];
  deckPos: number;
  players: PlayerState[];
  startStacks: number[];
  toAct: number; // -1 when nobody
  currentBet: number;
  lastRaiseSize: number;
  lastFullLevel: number;
  actions: ActionRecord[];
  refunds: { seat: number; amount: number; street: Street }[];
  result: HandResult | null;
}

export interface NewHandParams {
  config: GameConfig;
  stacks: number[];
  names?: string[];
  button: number;
  seed: number;
  handNumber?: number;
  /**
   * Fixed cards for tests/scripted hands, in dealing order: the first card for each seat dealt in
   * (starting with the small blind and going clockwise), then the second card for each seat in the
   * same order, then the board (up to 5). Heads-up the small blind is the button, so it gets the first card.
   */
  stackedDeck?: Card[];
}

/** Next seat clockwise after `from` satisfying `pred` (not including `from` unless it wraps). */
function findSeat(s: { players: PlayerState[] }, from: number, pred: (p: PlayerState) => boolean): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n;
    if (pred(s.players[seat]!)) return seat;
  }
  return -1;
}

/** Like findSeat but checks `from` itself first. */
function findFrom(s: { players: PlayerState[] }, from: number, pred: (p: PlayerState) => boolean): number {
  const n = s.players.length;
  for (let i = 0; i < n; i++) {
    const seat = (from + i) % n;
    if (pred(s.players[seat]!)) return seat;
  }
  return -1;
}

export const potTotal = (s: HandState): number => s.players.reduce((a, p) => a + p.committed, 0);
const live = (p: PlayerState): boolean => p.inHand && !p.folded;
const able = (p: PlayerState): boolean => live(p) && !p.allIn;
export const liveSeats = (s: HandState): number[] => s.players.filter(live).map((p) => p.seat);

function cloneState(s: HandState): HandState {
  return {
    ...s,
    players: s.players.map((p) => ({ ...p })),
    board: [...s.board],
    actions: [...s.actions],
    refunds: [...s.refunds],
  };
}

export function newHand(params: NewHandParams): HandState {
  const { config, stacks, button, seed } = params;
  const n = config.numSeats;
  if (stacks.length !== n) throw new Error('stacks length must equal numSeats');
  const players: PlayerState[] = stacks.map((stack, seat) => ({
    seat,
    name: params.names?.[seat] ?? `Seat ${seat + 1}`,
    stack,
    bet: 0,
    committed: 0,
    folded: stack <= 0,
    allIn: false,
    inHand: stack > 0,
    hole: null,
    hasActed: false,
    raiseLocked: false,
  }));
  const active = players.filter((p) => p.inHand);
  if (active.length < 2) throw new Error('need at least two players with chips');
  if (!players[button]!.inHand) throw new Error('button must be an active seat');

  const deck = params.stackedDeck ?? createRng(seed).shuffle(fullDeck());
  const s: HandState = {
    config,
    seed,
    handNumber: params.handNumber ?? 1,
    button,
    sbSeat: -1,
    bbSeat: -1,
    street: 'preflop',
    board: [],
    deck,
    deckPos: 0,
    players,
    startStacks: [...stacks],
    toAct: -1,
    currentBet: config.bb,
    lastRaiseSize: config.bb,
    lastFullLevel: config.bb,
    actions: [],
    refunds: [],
    result: null,
  };

  // Blinds. Heads-up: the button is the small blind.
  const headsUp = active.length === 2;
  s.sbSeat = headsUp ? button : findSeat(s, button, (p) => p.inHand);
  s.bbSeat = findSeat(s, s.sbSeat, (p) => p.inHand);

  // Deal two hole cards each, starting with the small blind.
  const order: number[] = [];
  let cur = s.sbSeat;
  for (let i = 0; i < active.length; i++) {
    order.push(cur);
    cur = findSeat(s, cur, (p) => p.inHand);
  }
  const firstCards: Record<number, Card> = {};
  for (const seat of order) firstCards[seat] = s.deck[s.deckPos++]!;
  for (const seat of order) s.players[seat]!.hole = [firstCards[seat]!, s.deck[s.deckPos++]!];

  postBlind(s, s.sbSeat, config.sb);
  postBlind(s, s.bbSeat, config.bb);

  // First to act preflop: heads-up => button/SB; otherwise left of the big blind.
  const first = headsUp ? s.sbSeat : findSeat(s, s.bbSeat, (p) => p.inHand);
  const ableCount = s.players.filter(able).length;
  s.toAct = findFrom(s, first, (p) => needsToAct(s, p, ableCount));
  return s.toAct >= 0 ? s : endBettingRound(s);
}

function postBlind(s: HandState, seat: number, amount: number): void {
  const p = s.players[seat]!;
  const pay = Math.min(amount, p.stack);
  p.stack -= pay;
  p.bet += pay;
  p.committed += pay;
  if (p.stack === 0) p.allIn = true;
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

export interface LegalActions {
  seat: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** Chips needed to call (capped to the player's stack). */
  callAmount: number;
  canRaise: boolean;
  /** 'bet' when nobody has bet this street, otherwise 'raise'. */
  raiseType: 'bet' | 'raise';
  /** Minimum raise-to total. May equal maxRaiseTo (short stack: only all-in is possible). */
  minRaiseTo: number;
  /** All-in total (bet + stack). */
  maxRaiseTo: number;
  potSize: number;
  stack: number;
  currentBet: number;
}

/**
 * The bet `p` has to match. Normally the current bet; but when nobody else can still act, only the largest
 * bet among the other live players can be won (e.g. a big blind all-in for less than a full blind), and
 * anything more would just be refunded as uncalled, so that is the real price.
 */
function matchTarget(s: HandState, p: PlayerState): number {
  if (s.players.some((q) => q.seat !== p.seat && able(q))) return s.currentBet;
  const others = s.players.filter((q) => q.seat !== p.seat && live(q)).map((q) => q.bet);
  return Math.min(s.currentBet, Math.max(0, ...others));
}

export function legalActions(s: HandState): LegalActions | null {
  if (s.toAct < 0 || s.result) return null;
  const p = s.players[s.toAct]!;
  const toCall = Math.max(0, matchTarget(s, p) - p.bet);
  const othersAble = s.players.some((q) => q.seat !== p.seat && able(q));
  const maxRaiseTo = p.bet + p.stack;
  const canRaise = !p.raiseLocked && othersAble && maxRaiseTo > s.currentBet;
  const minRaiseTo = Math.min(s.currentBet + s.lastRaiseSize, maxRaiseTo);
  return {
    seat: p.seat,
    canFold: true,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount: Math.min(toCall, p.stack),
    canRaise,
    raiseType: s.currentBet === 0 ? 'bet' : 'raise',
    minRaiseTo,
    maxRaiseTo,
    potSize: potTotal(s),
    stack: p.stack,
    currentBet: s.currentBet,
  };
}

// ---------------------------------------------------------------------------
// Applying actions
// ---------------------------------------------------------------------------

export class IllegalActionError extends Error {}

export function applyAction(prev: HandState, input: ActionInput): HandState {
  if (prev.result || prev.toAct < 0) throw new IllegalActionError('hand is over');
  if (input.seat !== prev.toAct) throw new IllegalActionError(`not seat ${input.seat}'s turn (seat ${prev.toAct} to act)`);
  const s = cloneState(prev);
  const p = s.players[input.seat]!;
  const legal = legalActions(prev)!;
  const toCall = Math.max(0, matchTarget(s, p) - p.bet);
  const rec: ActionRecord = {
    seat: p.seat,
    street: s.street,
    type: 'check',
    toAmount: p.bet,
    chips: 0,
    allIn: false,
    toCall,
    potBefore: potTotal(s),
    stackBefore: p.stack,
  };

  let type = input.type;
  let to = input.amount ?? 0;
  if (type === 'allin') {
    to = p.bet + p.stack;
    type = to > s.currentBet ? (s.currentBet === 0 ? 'bet' : 'raise') : 'call';
  }
  if (type === 'bet' || type === 'raise') type = s.currentBet === 0 ? 'bet' : 'raise';

  switch (type) {
    case 'fold':
      p.folded = true;
      rec.type = 'fold';
      break;
    case 'check':
      if (toCall !== 0) throw new IllegalActionError('cannot check: there is a bet to call');
      p.hasActed = true;
      rec.type = 'check';
      break;
    case 'call': {
      if (toCall === 0) throw new IllegalActionError('nothing to call; use check');
      const pay = Math.min(toCall, p.stack);
      p.stack -= pay;
      p.bet += pay;
      p.committed += pay;
      p.hasActed = true;
      rec.type = 'call';
      rec.chips = pay;
      rec.toAmount = p.bet;
      if (p.stack === 0) p.allIn = true;
      break;
    }
    case 'bet':
    case 'raise': {
      if (!legal.canRaise) throw new IllegalActionError('raising is not allowed here');
      to = Math.round(to);
      const max = p.bet + p.stack;
      if (to > max) throw new IllegalActionError(`cannot bet more than your stack (${max})`);
      if (to <= s.currentBet) throw new IllegalActionError('raise must exceed the current bet');
      if (to < legal.minRaiseTo && to !== max) throw new IllegalActionError(`minimum raise is to ${legal.minRaiseTo}`);
      const pay = to - p.bet;
      p.stack -= pay;
      p.bet = to;
      p.committed += pay;
      p.hasActed = true;
      p.raiseLocked = false;
      if (p.stack === 0) p.allIn = true;
      // Re-opening (TDA Rule 47), judged per player: someone who already acted may re-raise only if,
      // compared with the amount THEY last acted on, they now face at least a full raise (several
      // short all-ins can add up to one). Otherwise they may only call or fold.
      const increment = s.lastRaiseSize; // size of a full raise before this action
      for (const q of s.players) {
        if (q.seat === p.seat || !q.hasActed) continue;
        if (to - q.bet >= increment) { q.hasActed = false; q.raiseLocked = false; }
        else q.raiseLocked = true;
      }
      // Min-raise bookkeeping: a raise is "full" if it increases the bet by at least the last full
      // raise size, measured from the last full raise level (so several short all-ins can add up).
      // The next minimum raise stays the largest full raise increment (TDA Rule 47 Ex. 2).
      if (to - s.lastFullLevel >= s.lastRaiseSize) {
        s.lastRaiseSize = Math.max(s.lastRaiseSize, to - s.currentBet);
        s.lastFullLevel = to;
      }
      s.currentBet = to;
      rec.type = type;
      rec.chips = pay;
      rec.toAmount = to;
      break;
    }
    default:
      throw new IllegalActionError(`unknown action ${String(type)}`);
  }
  rec.allIn = p.allIn;
  s.actions.push(rec);

  // Everyone else folded?
  if (s.players.filter(live).length === 1) return finishByFold(s);
  return settleRound(s, p.seat);
}

const needsToAct = (s: HandState, p: PlayerState, ableCount: number): boolean =>
  able(p) && (p.bet < matchTarget(s, p) || (!p.hasActed && ableCount >= 2));

/** After an action: find the next actor or end the betting round. */
function settleRound(s: HandState, lastActor: number): HandState {
  const ableCount = s.players.filter(able).length;
  const next = findSeat(s, lastActor, (p) => needsToAct(s, p, ableCount));
  if (next >= 0) {
    s.toAct = next;
    return s;
  }
  return endBettingRound(s);
}

function returnUncalled(s: HandState): void {
  const sorted = [...s.players].sort((x, y) => y.bet - x.bet);
  const top = sorted[0]!;
  const second = sorted[1]?.bet ?? 0;
  if (top.bet > second) {
    const refund = top.bet - second;
    top.stack += refund;
    top.bet -= refund;
    top.committed -= refund;
    if (top.stack > 0) top.allIn = false;
    s.refunds.push({ seat: top.seat, amount: refund, street: s.street });
  }
}

function dealStreet(s: HandState): void {
  if (s.street === 'preflop') {
    s.board.push(s.deck[s.deckPos++]!, s.deck[s.deckPos++]!, s.deck[s.deckPos++]!);
    s.street = 'flop';
  } else if (s.street === 'flop') {
    s.board.push(s.deck[s.deckPos++]!);
    s.street = 'turn';
  } else if (s.street === 'turn') {
    s.board.push(s.deck[s.deckPos++]!);
    s.street = 'river';
  }
}

function endBettingRound(s: HandState): HandState {
  returnUncalled(s);
  for (const p of s.players) {
    p.bet = 0;
    p.hasActed = false;
    p.raiseLocked = false;
  }
  s.currentBet = 0;
  s.lastRaiseSize = s.config.bb;
  s.lastFullLevel = 0;
  s.toAct = -1;

  if (currentStreet(s) === 'river') return showdown(s);
  // Deal the next street; if nobody can bet (all-in runout) keep dealing.
  for (;;) {
    dealStreet(s);
    const ableCount = s.players.filter(able).length;
    if (ableCount >= 2) {
      s.toAct = findSeat(s, s.button, able);
      return s;
    }
    if (currentStreet(s) === 'river') return showdown(s);
  }
}

// (Function indirection stops TypeScript from over-narrowing `s.street` across dealStreet().)
const currentStreet = (s: HandState): Street => s.street;

function finishByFold(s: HandState): HandState {
  returnUncalled(s);
  const winner = s.players.find(live)!;
  const total = potTotal(s);
  winner.stack += total;
  for (const p of s.players) p.bet = 0;
  s.toAct = -1;
  s.street = 'complete';
  s.result = {
    showdown: false,
    pots: [{ amount: total, eligible: [winner.seat], awards: [{ seat: winner.seat, amount: total }] }],
    net: netResults(s),
    showdownOrder: [],
    hands: [],
    refunds: s.refunds,
  };
  return s;
}

const netResults = (s: HandState): number[] => s.players.map((p, i) => p.stack - s.startStacks[i]!);

function showdownOrderFor(s: HandState, contenders: number[]): number[] {
  const n = s.players.length;
  // Last aggressor on the final betting street shows first; else first seat left of the button.
  const lastStreet = s.actions.length ? s.actions[s.actions.length - 1]!.street : undefined;
  let start = -1;
  if (lastStreet) {
    const agg = [...s.actions].reverse().find((a) => a.street === lastStreet && (a.type === 'bet' || a.type === 'raise'));
    if (agg && contenders.includes(agg.seat)) start = agg.seat;
  }
  if (start < 0) {
    for (let i = 1; i <= n; i++) {
      const seat = (s.button + i) % n;
      if (contenders.includes(seat)) { start = seat; break; }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const seat = (start + i) % n;
    if (contenders.includes(seat)) out.push(seat);
  }
  return out;
}

function showdown(s: HandState): HandState {
  s.street = 'showdown';
  const contenders = liveSeats(s);
  const scores = new Map<number, number>();
  const hands = contenders.map((seat) => {
    const score = evaluate([...s.players[seat]!.hole!, ...s.board]);
    scores.set(seat, score);
    return { seat, score, description: describeScore(score) };
  });
  const pots: Pot[] = buildPots(s.players.map((p) => ({ seat: p.seat, total: p.committed, folded: !live(p) })));
  const results: PotResult[] = pots.map((pot) => {
    const awards = awardPot(pot, scores, s.button, s.players.length);
    for (const a of awards) s.players[a.seat]!.stack += a.amount;
    return { amount: pot.amount, eligible: pot.eligible, awards };
  });
  s.toAct = -1;
  s.street = 'complete';
  s.result = { showdown: true, pots: results, net: netResults(s), showdownOrder: showdownOrderFor(s, contenders), hands, refunds: s.refunds };
  return s;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const isHandOver = (s: HandState): boolean => s.result !== null;

/** Sanity checks used by tests and the simulation harness. Throws on any violation. */
export function assertInvariants(s: HandState): void {
  const start = s.startStacks.reduce((a, b) => a + b, 0);
  const now = s.players.reduce((a, p) => a + p.stack, 0);
  const inPot = s.result ? 0 : s.players.reduce((a, p) => a + p.committed, 0);
  if (now + inPot !== start) throw new Error(`chips not conserved: start ${start}, stacks ${now}, pot ${inPot}`);
  for (const p of s.players) {
    if (p.stack < 0) throw new Error(`negative stack seat ${p.seat}`);
    if (p.bet < 0 || p.bet > p.committed) throw new Error(`bad bet seat ${p.seat}`);
    if (p.allIn && p.stack !== 0 && !s.result) throw new Error(`all-in with chips seat ${p.seat}`);
  }
  if (s.result) {
    const paid = s.result.pots.reduce((a, pot) => a + pot.amount, 0);
    const awarded = s.result.pots.reduce((a, pot) => a + pot.awards.reduce((x, w) => x + w.amount, 0), 0);
    if (paid !== awarded) throw new Error(`pots ${paid} != awards ${awarded}`);
    if (s.result.net.reduce((a, b) => a + b, 0) !== 0) throw new Error('net results do not sum to zero');
  }
  if (s.board.length !== ({ preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5, complete: s.board.length } as Record<Street, number>)[s.street]) {
    throw new Error(`board length ${s.board.length} on ${s.street}`);
  }
  const seen = new Set<Card>();
  for (const c of [...s.board, ...s.players.flatMap((p) => p.hole ?? [])]) {
    if (seen.has(c)) throw new Error(`duplicate card ${c}`);
    seen.add(c);
  }
}

export interface ReplayRecord {
  config: GameConfig;
  stacks: number[];
  names?: string[];
  button: number;
  seed: number;
  handNumber?: number;
  actions: ActionRecord[];
}

/** Re-create a hand (or any prefix of it) from its seed and action list. */
export function replayHand(rec: ReplayRecord, upTo: number = rec.actions.length): HandState {
  let s = newHand({ config: rec.config, stacks: rec.stacks, names: rec.names, button: rec.button, seed: rec.seed, handNumber: rec.handNumber });
  for (let i = 0; i < upTo; i++) {
    const a = rec.actions[i]!;
    s = applyAction(s, { seat: a.seat, type: a.type, amount: a.type === 'bet' || a.type === 'raise' ? a.toAmount : undefined });
  }
  return s;
}

export const toReplayRecord = (s: HandState): ReplayRecord => ({
  config: s.config,
  stacks: s.startStacks,
  names: s.players.map((p) => p.name),
  button: s.button,
  seed: s.seed,
  handNumber: s.handNumber,
  actions: s.actions,
});

