// A session is a sequence of hands at one table: it carries stacks and the button between hands.
import { type Archetype, PROFILES, botDecide } from './bots';
import { type ActionInput, type GameConfig, type HandState, applyAction, newHand } from './game';
import { createRng, hashSeed } from './rng';

export interface SeatSetup {
  name: string;
  isHero: boolean;
  archetype: Archetype | null;
}

export interface Session {
  config: GameConfig;
  startStack: number;
  seats: SeatSetup[];
  stacks: number[];
  /** Button seat of the hand most recently started (-1 before the first hand). */
  button: number;
  handNumber: number;
  seedBase: number;
  /** How many times each seat has rebought (a player with no chips left rebuys a fresh starting stack). */
  rebuys: number[];
}

/** A rebuy made before a hand: `seat` added `amount` chips (always a full starting stack). */
export interface Rebuy {
  seat: number;
  amount: number;
}

export const DEFAULT_BB = 100;
export const DEFAULT_CONFIG_6MAX: GameConfig = { numSeats: 6, sb: 50, bb: 100 };
export const DEFAULT_CONFIG_HU: GameConfig = { numSeats: 2, sb: 50, bb: 100 };

export function defaultSeats(numSeats: number, heroName = 'You'): SeatSetup[] {
  const lineup: Archetype[] = ['tag', 'station', 'maniac', 'nit', 'lag'];
  const seats: SeatSetup[] = [{ name: heroName, isHero: true, archetype: null }];
  for (let i = 0; i < numSeats - 1; i++) {
    const a = lineup[i % lineup.length]!;
    seats.push({ name: PROFILES[a].name, isHero: false, archetype: a });
  }
  return seats;
}

export function createSession(opts: { config?: GameConfig; stackBB?: number; seats?: SeatSetup[]; seed: number }): Session {
  const config = opts.config ?? DEFAULT_CONFIG_6MAX;
  const seats = opts.seats ?? defaultSeats(config.numSeats);
  if (seats.length !== config.numSeats) throw new Error('seat count mismatch');
  const startStack = (opts.stackBB ?? 100) * config.bb;
  return {
    config,
    startStack,
    seats,
    stacks: seats.map(() => startStack),
    button: -1,
    handNumber: 0,
    seedBase: opts.seed,
    rebuys: seats.map(() => 0),
  };
}

/** Start the next hand: rebuy busted players, move the button, deal. */
export function nextHand(sess: Session): { session: Session; hand: HandState; rebought: Rebuy[] } {
  const stacks = [...sess.stacks];
  const rebuys = [...sess.rebuys];
  const rebought: Rebuy[] = [];
  for (let i = 0; i < stacks.length; i++) {
    // Only a player with no chips at all rebuys (to a fresh starting stack). A player with a few chips
    // left keeps them and plays on: they post what they can and may be all-in for less.
    if (stacks[i]! <= 0) {
      stacks[i] = sess.startStack;
      rebuys[i]!++;
      rebought.push({ seat: i, amount: sess.startStack });
    }
  }
  const n = sess.config.numSeats;
  const handNumber = sess.handNumber + 1;
  const button = sess.button < 0 ? createRng(hashSeed(sess.seedBase, 'button')).int(n) : (sess.button + 1) % n;
  const hand = newHand({
    config: sess.config,
    stacks,
    names: sess.seats.map((s) => s.name),
    button,
    seed: hashSeed(sess.seedBase, 'hand', handNumber),
    handNumber,
  });
  return { session: { ...sess, stacks, rebuys, button, handNumber }, hand, rebought };
}

export function completeHand(sess: Session, hand: HandState): Session {
  if (!hand.result) throw new Error('hand is not finished');
  return { ...sess, stacks: hand.players.map((p) => p.stack) };
}

/** The action a bot would take now. Throws if it's a human's seat. */
export function botAction(sess: Session, hand: HandState): ActionInput {
  const setup = sess.seats[hand.toAct]!;
  if (!setup.archetype) throw new Error('not a bot seat');
  return botDecide(hand, PROFILES[setup.archetype]);
}

export const isBotTurn = (sess: Session, hand: HandState): boolean => hand.toAct >= 0 && !hand.result && sess.seats[hand.toAct]!.archetype !== null;

/** Play bots forward until a human must act or the hand ends. */
export function advanceBots(sess: Session, hand: HandState): HandState {
  let h = hand;
  while (isBotTurn(sess, h)) h = applyAction(h, botAction(sess, h));
  return h;
}


// ---------------------------------------------------------------------------
// Plain-language text for the table (result line, rebuy notices)
// ---------------------------------------------------------------------------

/** One sentence per rebuy, e.g. "Maya rebought for 100 big blinds." */
export function describeRebuys(rebought: readonly Rebuy[], names: readonly string[], heroSeat: number, bb: number): string[] {
  return rebought.map((r) => {
    const n = r.amount / bb;
    const size = `${Number.isInteger(n) ? n : n.toFixed(1)} big blind${n === 1 ? '' : 's'}`;
    return r.seat === heroSeat ? `You ran out of chips, so you rebought for ${size}.` : `${names[r.seat] ?? `Seat ${r.seat + 1}`} ran out of chips and rebought for ${size}.`;
  });
}

export interface ResultText {
  /** Who won what, pot by pot. */
  summary: string;
  /** The hero's result, e.g. "You won", "You won the side pot", "You lost". */
  heroLabel: string;
  /** Amount text to show next to the label ('' for none), e.g. "+1,200", "(net −800)", "(even)". */
  heroAmount: string;
  tone: 'pos' | 'neg' | 'even';
}

const ORDINAL = ['', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

/**
 * Describe a finished hand pot by pot. "Split" is only used when one pot is shared by tied hands;
 * when different players win the main and side pots, each pot is named with its winner.
 */
export function describeResult(hand: HandState, heroSeat: number, fmt: (n: number) => string): ResultText {
  const r = hand.result;
  if (!r) throw new Error('hand is not finished');
  const name = (seat: number): string => (seat === heroSeat ? 'You' : hand.players[seat]!.name);
  const list = (seats: number[]): string => {
    const ns = [...seats].sort((a, b) => Number(b === heroSeat) - Number(a === heroSeat)).map(name); // "You" first
    return ns.length <= 2 ? ns.join(' and ') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]!}`;
  };
  const desc = (seat: number): string => r.hands.find((h) => h.seat === seat)?.description ?? '';
  const minus = (n: number): string => `\u2212${fmt(Math.abs(n))}`;

  let summary: string;
  if (!r.showdown) {
    const pot = r.pots[0]!;
    summary = `${name(pot.awards[0]!.seat)} won the pot of ${fmt(pot.amount)}: everyone else folded.`;
  } else if (r.pots.length === 1) {
    const pot = r.pots[0]!;
    const seats = pot.awards.map((a) => a.seat);
    summary = seats.length > 1
      ? `${list(seats)} split ${fmt(pot.amount)} (${desc(seats[0]!)}).`
      : `${name(seats[0]!)} won ${fmt(pot.amount)} with ${desc(seats[0]!)}.`;
  } else {
    summary = r.pots.map((pot, i) => {
      const title = i === 0 ? 'Main pot' : i === 1 ? 'Side pot' : ORDINAL[i - 1] ? `${ORDINAL[i - 1]!} side pot` : `Side pot ${i}`;
      const seats = pot.awards.map((a) => a.seat);
      const who = pot.eligible.length === 1
        ? `${name(seats[0]!)} (everyone else who paid into it folded)`
        : seats.length > 1
          ? `split by ${list(seats)} (${desc(seats[0]!)})`
          : `${name(seats[0]!)} (${desc(seats[0]!)})`;
      return `${title} ${fmt(pot.amount)}: ${who}.`;
    }).join(' ');
  }

  const net = r.net[heroSeat]!;
  const hero = hand.players[heroSeat]!;
  const tone: ResultText['tone'] = net > 0 ? 'pos' : net < 0 ? 'neg' : 'even';
  const potsWon = r.pots.map((pot, i) => ({ i, pot, share: pot.awards.find((a) => a.seat === heroSeat) })).filter((x) => x.share);
  let heroLabel: string;
  let heroAmount: string;
  if (!hero.inHand) { heroLabel = 'You sat out'; heroAmount = ''; }
  else if (net > 0) { heroLabel = 'You won'; heroAmount = `+${fmt(net)}`; }
  else if (hero.folded) { heroLabel = 'You folded'; heroAmount = net < 0 ? minus(net) : ''; }
  else if (potsWon.length > 0) {
    const shared = potsWon.some((x) => x.pot.awards.length > 1);
    const allShared = potsWon.every((x) => x.pot.awards.length > 1);
    const which = r.pots.length === 1
      ? 'the pot'
      : potsWon.length === r.pots.length
        ? (r.pots.length === 2 ? 'both pots' : 'every pot')
        : potsWon.length === 1
          ? (potsWon[0]!.i === 0 ? 'the main pot' : r.pots.length === 2 ? 'the side pot' : 'a side pot')
          : 'some of the pots';
    // Mixed (won one pot outright, split another): say both so the label stays true.
    const verb = !shared ? 'won' : allShared ? 'split' : 'won or split';
    heroLabel = net === 0 && shared && r.pots.length === 1 ? 'Split pot' : `You ${verb} ${which}`;
    heroAmount = net === 0 ? '(even)' : `(net ${minus(net)})`;
  } else if (net < 0) { heroLabel = 'You lost'; heroAmount = fmt(-net); }
  else { heroLabel = 'Even'; heroAmount = ''; }
  return { summary, heroLabel, heroAmount, tone };
}
