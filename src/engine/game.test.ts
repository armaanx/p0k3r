import { describe, expect, it } from 'vitest';
import { parseCards, fullDeck, type Card } from './cards';
import {
  applyAction, assertInvariants, IllegalActionError, legalActions, newHand, potTotal, replayHand, toReplayRecord,
  type ActionType, type GameConfig, type HandState,
} from './game';
import { describeResult } from './session';
import { makeFmt } from '../ui/format';

const cfg = (numSeats: number, sb = 50, bb = 100): GameConfig => ({ numSeats, sb, bb });

/** Build a deck so seat i receives holes[i] and the board is `board`. */
function mkDeck(numSeats: number, button: number, holes: string[], board: string): Card[] {
  const sb = numSeats === 2 ? button : (button + 1) % numSeats;
  const order = Array.from({ length: numSeats }, (_, i) => (sb + i) % numSeats);
  const h = holes.map((x) => parseCards(x));
  const deck: Card[] = [];
  for (const seat of order) deck.push(h[seat]![0]!);
  for (const seat of order) deck.push(h[seat]![1]!);
  deck.push(...parseCards(board));
  const used = new Set(deck);
  for (const c of fullDeck()) if (!used.has(c)) deck.push(c);
  return deck;
}

function start(numSeats: number, stacks: number[], holes: string[], board: string, button = 0, blinds: [number, number] = [50, 100]): HandState {
  return newHand({
    config: cfg(numSeats, blinds[0], blinds[1]), stacks, button, seed: 1,
    stackedDeck: mkDeck(numSeats, button, holes, board),
  });
}

const act = (s: HandState, seat: number, type: ActionType, amount?: number): HandState => {
  const r = applyAction(s, { seat, type, amount });
  assertInvariants(r);
  return r;
};

describe('blinds and action order', () => {
  it('6-max: posts blinds and UTG acts first', () => {
    const s = start(6, Array(6).fill(10000), ['AsAd', 'KsKd', 'QsQd', 'JsJd', 'TsTd', '9s9d'], '2c3c4c5d6h');
    expect(s.sbSeat).toBe(1);
    expect(s.bbSeat).toBe(2);
    expect(s.players[1]!.bet).toBe(50);
    expect(s.players[2]!.bet).toBe(100);
    expect(s.toAct).toBe(3);
    expect(potTotal(s)).toBe(150);
    assertInvariants(s);
  });

  it('6-max preflop action order is UTG, HJ, CO, BTN, SB, BB; then postflop starts with SB', () => {
    let s = start(6, Array(6).fill(10000), ['AsAd', 'KsKd', 'QsQd', 'JsJd', 'TsTd', '9s9d'], '2c3c4c5d6h');
    const order: number[] = [];
    for (const seat of [3, 4, 5, 0]) { order.push(s.toAct); s = act(s, seat, 'call'); }
    order.push(s.toAct); s = act(s, 1, 'call');
    order.push(s.toAct);
    expect(order).toEqual([3, 4, 5, 0, 1, 2]);
    s = act(s, 2, 'check'); // BB gets the option
    expect(s.street).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(1);
  });

  it('heads-up: button is small blind and acts first preflop, last postflop', () => {
    let s = start(2, [10000, 10000], ['AsAd', 'KsKd'], '2c3c4c5d6h', 0);
    expect(s.sbSeat).toBe(0);
    expect(s.bbSeat).toBe(1);
    expect(s.toAct).toBe(0);
    s = act(s, 0, 'call');
    s = act(s, 1, 'check');
    expect(s.street).toBe('flop');
    expect(s.toAct).toBe(1); // BB first postflop
  });

  it('BB wins uncontested blinds when everyone folds', () => {
    let s = start(6, Array(6).fill(10000), ['AsAd', 'KsKd', 'QsQd', 'JsJd', 'TsTd', '9s9d'], '2c3c4c5d6h');
    for (const seat of [3, 4, 5, 0, 1]) s = act(s, seat, 'fold');
    expect(s.result!.showdown).toBe(false);
    expect(s.result!.net).toEqual([0, -50, 50, 0, 0, 0]);
  });

  it('short stacks post what they have and are all-in', () => {
    const s = start(3, [10000, 30, 10000], ['AsAd', 'KsKd', 'QsQd'], '2c3c4c5d6h', 0);
    expect(s.players[1]!.bet).toBe(30);
    expect(s.players[1]!.allIn).toBe(true);
    expect(potTotal(s)).toBe(130);
  });
});

describe('bet sizing rules', () => {
  const fresh = (): HandState => start(3, [10000, 10000, 10000], ['AsAd', 'KsKd', 'QsQd'], '2c3c4c5d6h', 0);

  it('min open-raise is to 2bb; min re-raise is the size of the previous raise', () => {
    let s = fresh(); // seat 0 BTN acts first (3-handed: UTG = button)
    let l = legalActions(s)!;
    expect(l.minRaiseTo).toBe(200);
    expect(() => act(s, 0, 'raise', 150)).toThrow(IllegalActionError);
    s = act(s, 0, 'raise', 500); // raise of 400 over 100
    l = legalActions(s)!;
    expect(l.seat).toBe(1);
    expect(l.minRaiseTo).toBe(900);
    expect(l.callAmount).toBe(450);
    expect(() => act(s, 1, 'raise', 800)).toThrow(IllegalActionError);
    s = act(s, 1, 'raise', 900);
    expect(legalActions(s)!.minRaiseTo).toBe(1300);
  });

  it('postflop: min bet is 1bb, min raise is double the bet', () => {
    let s = fresh();
    s = act(s, 0, 'call'); s = act(s, 1, 'call'); s = act(s, 2, 'check');
    expect(s.street).toBe('flop');
    expect(legalActions(s)!.raiseType).toBe('bet');
    expect(legalActions(s)!.minRaiseTo).toBe(100);
    s = act(s, 1, 'bet', 300);
    expect(legalActions(s)!.raiseType).toBe('raise');
    expect(legalActions(s)!.minRaiseTo).toBe(600);
  });

  it('rejects illegal actions', () => {
    const s = fresh();
    expect(() => act(s, 1, 'call')).toThrow(/not seat 1/);
    expect(() => act(s, 0, 'check')).toThrow(IllegalActionError);
    expect(() => act(s, 0, 'raise', 20000)).toThrow(IllegalActionError);
  });

  it('calling all-in for less than the bet closes the round and deals the next street', () => {
    // 3 players postflop. Seat 1 bets 100, seat 2 calls, seat 0 (short) shoves 150 total.
    let s = start(3, [150, 10000, 10000], ['AsAd', 'KsKd', 'QsQd'], '2c3c4c5d6h', 0);
    // Preflop: everyone limps, flop
    s = act(s, 0, 'call'); // 100 from a 150 stack, leaving 50
    s = act(s, 1, 'call'); s = act(s, 2, 'check');
    expect(s.street).toBe('flop');
    s = act(s, 1, 'bet', 100);
    s = act(s, 2, 'call');
    s = act(s, 0, 'allin'); // only 50 behind: a call for less, not a raise
    expect(s.players[0]!.allIn).toBe(true);
    expect(s.street).toBe('turn');
  });

  it('a short all-in raise (incomplete) locks players who already acted; a full one reopens', () => {
    // Seat 2 has only 250: after limping 100 it has 150 behind, so a shove over a 100 bet is an incomplete raise.
    let s = start(3, [10000, 10000, 250], ['AsAd', 'KsKd', 'QsQd'], '2c3c4c5d6h', 0);
    s = act(s, 0, 'call'); s = act(s, 1, 'call'); s = act(s, 2, 'check'); // each in for 100; seat 2 has 150 behind
    s = act(s, 1, 'bet', 100);
    s = act(s, 2, 'allin'); // to 150: raise of 50, less than min raise 100 -> incomplete
    expect(s.toAct).toBe(0);
    s = act(s, 0, 'call'); // seat 0 has not acted on this street yet
    // Seat 1 already acted (bet 100) and now faces only an incomplete raise: may call or fold, not re-raise
    const l = legalActions(s)!;
    expect(l.seat).toBe(1);
    expect(l.canRaise).toBe(false);
    expect(l.callAmount).toBe(50);
    expect(() => act(s, 1, 'raise', 400)).toThrow(IllegalActionError);
  });

  it('a full all-in raise reopens the betting for players who already acted', () => {
    let s = start(3, [10000, 10000, 500], ['AsAd', 'KsKd', 'QsQd'], '2c3c4c5d6h', 0);
    s = act(s, 0, 'call'); s = act(s, 1, 'call'); s = act(s, 2, 'check');
    s = act(s, 1, 'bet', 100);
    s = act(s, 2, 'allin'); // 400 behind -> raises to 400: +300 >= 100, a full raise
    expect(s.players[2]!.bet).toBe(400);
    s = act(s, 0, 'call');
    const l = legalActions(s)!;
    expect(l.seat).toBe(1);
    expect(l.canRaise).toBe(true);
  });

  describe('re-opening is judged per player (TDA Rule 47 illustrations, blinds 50/100)', () => {
    // Five players; button = seat 4, so postflop order is 0,1,2,3,4 = A,B,C,D,E.
    // B has 125 left on the flop and D has 200 left (after each put 100 in preflop).
    // Flop: A bets 100, B all-in 125, C calls 125, D all-in 200, E calls 200; back to A.
    const ex1 = (): HandState => {
      let s = start(5, [10000, 225, 10000, 300, 10000], ['AsAd', 'KsKd', 'QsQd', 'JsJd', 'TsTd'], '2c3c4h8d9h', 4);
      for (const seat of [2, 3, 4, 0]) s = act(s, seat, 'call');
      s = act(s, 1, 'check');
      expect(s.street).toBe('flop');
      s = act(s, 0, 'bet', 100);
      s = act(s, 1, 'allin'); // to 125: +25, incomplete
      s = act(s, 2, 'call');
      s = act(s, 3, 'allin'); // to 200: +75, incomplete on its own
      s = act(s, 4, 'call');
      return s;
    };

    it('Ex. 1: two short all-ins that add up to a full raise re-open the betting for A', () => {
      const l = legalActions(ex1())!;
      expect(l.seat).toBe(0);
      expect(l.callAmount).toBe(100); // 100 more than A's bet of 100 = a full raise
      expect(l.canRaise).toBe(true);
      expect(l.minRaiseTo).toBe(300); // Ex. 2: the minimum raise stays the last full raise size (100)
    });

    it('Ex. 1-A: A calls; C faces only +75 (less than a full raise) and may only call or fold', () => {
      let s = act(ex1(), 0, 'call');
      const l = legalActions(s)!;
      expect(l.seat).toBe(2);
      expect(l.callAmount).toBe(75);
      expect(l.canRaise).toBe(false);
      expect(() => act(s, 2, 'raise', 400)).toThrow(IllegalActionError);
      s = act(s, 2, 'call');
      expect(s.street).toBe('turn'); // E already matched 200; the round is closed
    });

    it('Ex. 1-B: A re-raises the minimum; C and E now face a full raise and may re-raise', () => {
      let s = act(ex1(), 0, 'raise', 300);
      let l = legalActions(s)!;
      expect(l.seat).toBe(2);
      expect(l.callAmount).toBe(175);
      expect(l.canRaise).toBe(true);
      s = act(s, 2, 'call');
      l = legalActions(s)!;
      expect(l.seat).toBe(4);
      expect(l.callAmount).toBe(100);
      expect(l.canRaise).toBe(true);
      expect(l.minRaiseTo).toBe(400);
    });
  });
});

describe('showdown, side pots and splits', () => {
  it('three-way all-in with side pots pays each pot to the right winner', () => {
    // Seat 0 (short, 1000) has the best hand; seat 1 (3000) second best; seat 2 (5000) worst.
    // Board gives no help: AA > KK > QQ.
    let s = start(3, [1000, 3000, 5000], ['AsAd', 'KsKd', 'QsQd'], '2c7d9hJc4s', 0);
    s = act(s, 0, 'allin');
    s = act(s, 1, 'allin');
    s = act(s, 2, 'call');
    expect(s.result).not.toBeNull();
    const r = s.result!;
    // Main pot 3000 -> seat 0; side pot (2000+2000) 4000 -> seat 1; seat 2 keeps 2000 behind.
    expect(r.net).toEqual([2000, 1000, -3000]);
    expect(r.pots.map((p) => p.amount)).toEqual([3000, 4000]);
    expect(s.players.map((p) => p.stack)).toEqual([3000, 4000, 2000]);
    expect(r.refunds).toEqual([]); // seat 2 only called 3000, so nothing is uncalled
    assertInvariants(s);
  });

  it('the short stack can lose the main pot while the side pot goes elsewhere', () => {
    // Seat 0 short with the WORST hand; seat 1 has AA, seat 2 KK
    let s = start(3, [1000, 3000, 3000], ['2s3d', 'AsAd', 'KsKd'], '7c8d9hJc4s', 0);
    s = act(s, 0, 'allin'); s = act(s, 1, 'allin'); s = act(s, 2, 'call');
    const r = s.result!;
    expect(r.pots).toHaveLength(2);
    expect(r.pots[0]!.awards).toEqual([{ seat: 1, amount: 3000 }]);
    expect(r.pots[1]!.awards).toEqual([{ seat: 1, amount: 4000 }]);
    expect(r.net).toEqual([-1000, 4000, -3000]);
  });

  it('splits the pot when the board plays for both players (broadway on board)', () => {
    let s = start(2, [10000, 10000], ['2s3d', '4s5d'], 'AsKsQsJsTs', 0);
    s = act(s, 0, 'allin'); s = act(s, 1, 'call');
    expect(s.result!.net).toEqual([0, 0]);
    expect(s.result!.pots[0]!.awards).toHaveLength(2);
  });

  it('odd chip in a split pot goes to the player closest left of the button', () => {
    // Seat 0 (button) limps 101 then folds to the shove = 101 of dead money. Seats 1 and 2 chop with KK vs KK on an AA board.
    let s = start(3, [1001, 1001, 1001], ['2s3d', 'KsKd', 'KcKh'], 'AsAd9h7c4s', 0, [51, 101]);
    s = act(s, 0, 'call');
    s = act(s, 1, 'allin');
    s = act(s, 2, 'call');
    s = act(s, 0, 'fold');
    const r = s.result!;
    expect(r.pots.reduce((a, p) => a + p.amount, 0)).toBe(2103);
    // Seat 1 is closest to the left of the button (seat 0), so it gets the odd chip.
    expect(s.players[1]!.stack).toBe(1052);
    expect(s.players[2]!.stack).toBe(1051);
    assertInvariants(s);
  });

  it('wheel straight wins over a pair at showdown', () => {
    let s = start(2, [1000, 1000], ['Ac2d', 'KsKd'], '3h4c5d9sJc', 0);
    s = act(s, 0, 'allin'); s = act(s, 1, 'call');
    expect(s.result!.hands.find((h) => h.seat === 0)!.description).toMatch(/wheel/);
    expect(s.result!.net).toEqual([1000, -1000]);
  });

  it('kicker decides: same pair, better kicker wins', () => {
    let s = start(2, [1000, 1000], ['AcKd', 'As9d'], 'Ah7c4d3s2h', 0);
    s = act(s, 0, 'allin'); s = act(s, 1, 'call');
    expect(s.result!.net).toEqual([1000, -1000]);
  });

  it('runs out the board when players are all-in, and deals exactly five cards', () => {
    let s = start(2, [1000, 1000], ['AcKd', 'QsQd'], '2h7c4d9s3h', 0);
    s = act(s, 0, 'allin'); s = act(s, 1, 'call');
    expect(s.board).toHaveLength(5);
    expect(s.street).toBe('complete');
  });

  it('showdown order: last aggressor on the river shows first; otherwise first left of the button', () => {
    let s = start(3, [10000, 10000, 10000], ['AsAd', 'KsKd', 'QsQd'], '2c7d9hJc4s', 0);
    s = act(s, 0, 'call'); s = act(s, 1, 'call'); s = act(s, 2, 'check');
    for (let i = 0; i < 2; i++) { s = act(s, 1, 'check'); s = act(s, 2, 'check'); s = act(s, 0, 'check'); }
    // river: 1 checks, 2 bets, 0 folds, 1 calls
    s = act(s, 1, 'check'); s = act(s, 2, 'bet', 200); s = act(s, 0, 'fold'); s = act(s, 1, 'call');
    expect(s.result!.showdown).toBe(true);
    expect(s.result!.showdownOrder).toEqual([2, 1]);

    let t = start(3, [10000, 10000, 10000], ['AsAd', 'KsKd', 'QsQd'], '2c7d9hJc4s', 0);
    t = act(t, 0, 'call'); t = act(t, 1, 'call'); t = act(t, 2, 'check');
    for (let i = 0; i < 3; i++) { t = act(t, 1, 'check'); t = act(t, 2, 'check'); t = act(t, 0, 'check'); }
    expect(t.result!.showdownOrder).toEqual([1, 2, 0]);
  });
});

describe('uncalled bets and replay', () => {
  it('returns an uncalled bet when the opponent folds or calls all-in for less', () => {
    let s = start(2, [10000, 1500], ['AsAd', 'KsKd'], '2c7d9hJc4s', 0);
    s = act(s, 0, 'raise', 5000);
    s = act(s, 1, 'call'); // all-in for 1500 total
    expect(s.result!.refunds).toEqual([{ seat: 0, amount: 3500, street: 'preflop' }]);
    expect(s.result!.net).toEqual([1500, -1500]);
  });

  it('facing only a big blind all-in for less than a full blind, the call price is just the difference', () => {
    // Regression: SB was asked to "Call 50" and then got 40 back as uncalled.
    let s = start(2, [1000, 60], ['AsAd', 'KsKd'], '2c7d9hJc4s', 0);
    const legal = legalActions(s)!;
    expect(legal).toMatchObject({ canCall: true, callAmount: 10, canRaise: false, canCheck: false });
    s = act(s, 0, 'call');
    expect(s.actions[s.actions.length - 1]).toMatchObject({ type: 'call', chips: 10, toCall: 10 });
    expect(s.result!.refunds).toEqual([]);
    expect(s.result!.net).toEqual([60, -60]);
    // A big blind all-in for less than the small blind: nobody needs to act; the SB's extra 20 is returned.
    const t = start(2, [1000, 30], ['AsAd', 'KsKd'], '2c7d9hJc4s', 0);
    expect(t.result!.refunds).toEqual([{ seat: 0, amount: 20, street: 'preflop' }]);
    expect(t.result!.net).toEqual([30, -30]);
  });

  it('with another player still able to act, calling the full big blind is still required', () => {
    let s = start(3, [1000, 1000, 60], ['AsAd', 'KsKd', 'QsQd'], '2c7d9hJc4s', 0);
    expect(legalActions(s)!.callAmount).toBe(100);
    s = act(s, 0, 'fold');
    expect(legalActions(s)!.callAmount).toBe(10); // only the all-in BB is left to match
  });

  it('replayHand reproduces the result from seed + actions', () => {
    let s = newHand({ config: cfg(6), stacks: Array(6).fill(10000), button: 2, seed: 777 });
    const script: [ActionType, number?][] = [['raise', 300], ['fold'], ['fold'], ['call'], ['fold'], ['call']];
    for (const [t, amt] of script) s = applyAction(s, { seat: s.toAct, type: t, amount: amt });
    // play out postflop by checking, then bet/fold
    while (!s.result) s = applyAction(s, { seat: s.toAct, type: legalActions(s)!.canCheck ? 'check' : 'call' });
    const rec = toReplayRecord(s);
    const again = replayHand(rec);
    expect(again.result).toEqual(s.result);
    expect(again.players.map((p) => p.stack)).toEqual(s.players.map((p) => p.stack));
    // Prefix replay stops mid-hand
    const mid = replayHand(rec, 3);
    expect(mid.actions).toHaveLength(3);
    expect(mid.result).toBeNull();
  });

  it('same seed deals the same cards; different seeds differ', () => {
    const a = newHand({ config: cfg(6), stacks: Array(6).fill(10000), button: 0, seed: 5 });
    const b = newHand({ config: cfg(6), stacks: Array(6).fill(10000), button: 0, seed: 5 });
    const c = newHand({ config: cfg(6), stacks: Array(6).fill(10000), button: 0, seed: 6 });
    expect(a.players.map((p) => p.hole)).toEqual(b.players.map((p) => p.hole));
    expect(a.players.map((p) => p.hole)).not.toEqual(c.players.map((p) => p.hole));
  });
});


describe('result text (describeResult)', () => {
  const chips = makeFmt({ showBB: false }, 100);
  const bbs = makeFmt({ showBB: true }, 100);

  it('main and side pots won by different players are named separately, never as a "split"', () => {
    // Hero (seat 0) KK 1200, seat 1 AA 1000 all-in, seat 2 QQ 1200. AA wins the 3000 main pot; KK wins the 400 side pot.
    let s = start(3, [1200, 1000, 1200], ['KsKd', 'AsAd', 'QsQd'], '2c3d7h8sJc', 0);
    s = act(s, 0, 'allin'); s = act(s, 1, 'call'); s = act(s, 2, 'call');
    expect(s.result!.pots.map((p) => p.amount)).toEqual([3000, 400]);
    const t = describeResult(s, 0, chips);
    expect(t.summary).toBe('Main pot 3,000: Seat 2 (Pair of Aces). Side pot 400: You (Pair of Kings).');
    expect(t.summary).not.toMatch(/split/);
    expect(`${t.heroLabel} ${t.heroAmount}`).toBe('You won the side pot (net \u2212800)');
    expect(t.tone).toBe('neg');
    expect(describeResult(s, 0, bbs).summary).toBe('Main pot 30 bb: Seat 2 (Pair of Aces). Side pot 4 bb: You (Pair of Kings).');
    // From the main-pot winner's point of view.
    expect(describeResult(s, 1, chips)).toMatchObject({ heroLabel: 'You won', heroAmount: '+2,000', tone: 'pos' });
    // The player who won nothing lost their whole stack.
    expect(describeResult(s, 2, chips)).toMatchObject({ heroLabel: 'You lost', heroAmount: '1,200', tone: 'neg' });
  });

  it('a chopped single pot is a split, and an even result says so', () => {
    let s = start(2, [10000, 10000], ['2s3d', '4s5d'], 'AsKsQsJsTs', 0);
    s = act(s, 0, 'allin'); s = act(s, 1, 'call');
    const t = describeResult(s, 0, chips);
    expect(t.summary).toBe('You and Seat 2 split 20,000 (Royal flush).');
    expect(`${t.heroLabel} ${t.heroAmount}`).toBe('Split pot (even)');
    expect(t.tone).toBe('even');
  });

  it('single winner and fold wins', () => {
    let s = start(2, [1000, 1000], ['AcKd', 'As9d'], 'Ah7c4d3s2h', 0);
    s = act(s, 0, 'allin'); s = act(s, 1, 'call');
    expect(describeResult(s, 0, chips).summary).toBe('You won 2,000 with Pair of Aces.');
    let f = start(6, Array(6).fill(10000), ['AsAd', 'KsKd', 'QsQd', 'JsJd', 'TsTd', '9s9d'], '2c3c4c5d6h');
    for (const seat of [3, 4, 5, 0, 1]) f = act(f, seat, 'fold');
    const ft = describeResult(f, 1, chips);
    expect(ft.summary).toBe('Seat 3 won the pot of 100: everyone else folded.'); // the BB's uncalled 50 is returned first
    expect(`${ft.heroLabel} ${ft.heroAmount}`).toBe('You folded \u221250');
    expect(describeResult(f, 0, chips)).toMatchObject({ heroLabel: 'You folded', heroAmount: '' });
  });

  it('a side pot with one eligible player names the folded contributors as dead money', () => {
    // Regression: said "(nobody else was in it)" although the folder paid 900 into it.
    let s = start(3, [300, 5000, 5000], ['AsAd', 'KsKd', 'QsQd'], '2c3d7h8sJc', 0);
    s = act(s, 0, 'allin'); s = act(s, 1, 'raise', 1000); s = act(s, 2, 'call');
    s = act(s, 1, 'bet', 500); s = act(s, 2, 'fold');
    const t = describeResult(s, 2, chips);
    expect(t.summary).toBe('Main pot 900: Seat 1 (Pair of Aces). Side pot 1,400: Seat 2 (everyone else who paid into it folded).');
  });

  it('splitting every pot says "both pots", not "some of the pots"', () => {
    let s = start(3, [1000, 500, 1000], ['2s3d', '4s5d', '6c7d'], 'AsKsQsJsTs', 0);
    s = act(s, 0, 'allin'); s = act(s, 1, 'allin'); s = act(s, 2, 'call');
    expect(s.result!.pots.map((p) => p.amount)).toEqual([1500, 1000]);
    expect(describeResult(s, 0, chips)).toMatchObject({ heroLabel: 'You split both pots', heroAmount: '(even)' });
  });
});
