import { describe, expect, it } from 'vitest';
import { ARCHETYPES, PROFILES, type Archetype } from './bots';
import { applyAction, assertInvariants, replayHand, toReplayRecord, legalActions, type HandState } from './game';
import { advanceBots, completeHand, createSession, describeRebuys, nextHand, type SeatSetup, type Session } from './session';
import { positionOf } from './preflopCharts';
import { botDecide } from './bots';

interface Stats { hands: number; vpip: number; pfr: number; bets: number; calls: number; net: number }

function runSession(sess0: Session, hands: number, check = true): { stats: Stats[]; showdowns: number; allins: number; splits: number; sess: Session; maxActions: number } {
  let sess = sess0;
  const stats: Stats[] = sess.seats.map(() => ({ hands: 0, vpip: 0, pfr: 0, bets: 0, calls: 0, net: 0 }));
  let showdowns = 0;
  let allins = 0;
  let splits = 0;
  let maxActions = 0;
  for (let i = 0; i < hands; i++) {
    const before = sess.stacks.reduce((a, b) => a + b, 0);
    const started = nextHand(sess);
    sess = started.session;
    let hand: HandState = started.hand;
    const total = hand.startStacks.reduce((a, b) => a + b, 0);
    // Rebuys add chips; nothing else changes between hands (no chips vanish).
    expect(total).toBe(before + started.rebought.reduce((a, r) => a + r.amount, 0));
    if (check) assertInvariants(hand);
    let guard = 0;
    while (!hand.result) {
      if (guard++ > 200) throw new Error('hand did not terminate');
      const seat = hand.toAct;
      const setup = sess.seats[seat]!;
      const action = botDecide(hand, PROFILES[setup.archetype!]);
      const legal = legalActions(hand)!;
      // Legality: the bot's action must be one the engine offers.
      if (action.type === 'check') expect(legal.canCheck).toBe(true);
      if (action.type === 'call') expect(legal.canCall).toBe(true);
      hand = applyAction(hand, action);
      if (check) assertInvariants(hand);
    }
    maxActions = Math.max(maxActions, hand.actions.length);
    expect(hand.players.reduce((a, p) => a + p.stack, 0)).toBe(total); // chips conserved
    if (hand.result.showdown) showdowns++;
    if (hand.actions.some((a) => a.allIn)) allins++;
    if (hand.result.pots.some((p) => p.awards.length > 1)) splits++;
    // stats (first voluntary action per player preflop)
    const pre = hand.actions.filter((a) => a.street === 'preflop');
    for (const p of hand.players) {
      const st = stats[p.seat]!;
      st.hands++;
      const mine = pre.filter((a) => a.seat === p.seat);
      const voluntary = mine.some((a) => (a.type === 'call' && !(p.seat === hand.bbSeat && a.toCall === 0)) || a.type === 'raise');
      if (voluntary) st.vpip++;
      if (mine.some((a) => a.type === 'raise')) st.pfr++;
      st.net += hand.result.net[p.seat]!;
    }
    for (const a of hand.actions) {
      if (a.street === 'preflop') continue;
      if (a.type === 'bet' || a.type === 'raise') stats[a.seat]!.bets++;
      if (a.type === 'call') stats[a.seat]!.calls++;
    }
    // replay check on a sample of hands
    if (i % 50 === 0) {
      const again = replayHand(toReplayRecord(hand));
      expect(again.result).toEqual(hand.result);
    }
    sess = completeHand(sess, hand);
  }
  return { stats, showdowns, allins, splits, sess, maxActions };
}

const botSeats = (lineup: Archetype[]): SeatSetup[] => lineup.map((a, i) => ({ name: `${PROFILES[a].name}${i}`, isHero: false, archetype: a }));

describe('bot-vs-bot simulation', () => {
  it('plays 12,000 six-max hands: chips conserved, no illegal states, every hand terminates', () => {
    const sess = createSession({ seats: botSeats(['tag', 'station', 'maniac', 'nit', 'lag', 'tag']), seed: 42 });
    const r = runSession(sess, 12000);
    expect(r.showdowns).toBeGreaterThan(1000);
    expect(r.allins).toBeGreaterThan(50);
    expect(r.splits).toBeGreaterThan(5);
    // eslint-disable-next-line no-console
    console.log('6-max sim:', { showdowns: r.showdowns, allins: r.allins, splits: r.splits, maxActions: r.maxActions });
  }, 300000);

  it('plays 3,000 heads-up hands cleanly', () => {
    const sess = createSession({ config: { numSeats: 2, sb: 50, bb: 100 }, seats: botSeats(['tag', 'lag']), seed: 7 });
    const r = runSession(sess, 3000);
    expect(r.showdowns).toBeGreaterThan(100);
  }, 120000);

  it('plays with short, deep and uneven stacks (all-in heavy)', () => {
    for (const stackBB of [8, 20, 300]) {
      const sess = createSession({ stackBB, seats: botSeats(['maniac', 'maniac', 'lag', 'station', 'tag', 'nit']), seed: 100 + stackBB });
      const r = runSession(sess, 1500);
      expect(r.sess.handNumber).toBe(1500);
    }
  }, 300000);

  it('archetypes behave distinctly: measured VPIP/PFR/aggression follow the intended ordering', () => {
    // Rotate seats across many hands so position doesn't bias the stats.
    const agg: Record<string, { v: number; p: number; h: number; b: number; c: number }> = {};
    for (const a of ARCHETYPES) agg[a] = { v: 0, p: 0, h: 0, b: 0, c: 0 };
    for (let rot = 0; rot < 6; rot++) {
      const lineup: Archetype[] = ['nit', 'station', 'maniac', 'tag', 'lag', 'tag'];
      const rotated = lineup.map((_, i) => lineup[(i + rot) % 6]!);
      const sess = createSession({ seats: botSeats(rotated), seed: 900 + rot });
      const r = runSession(sess, 2500, false);
      rotated.forEach((a, i) => {
        const s = r.stats[i]!;
        agg[a]!.v += s.vpip; agg[a]!.p += s.pfr; agg[a]!.h += s.hands; agg[a]!.b += s.bets; agg[a]!.c += s.calls;
      });
    }
    const out: Record<string, string> = {};
    for (const a of ARCHETYPES) {
      const x = agg[a]!;
      out[a] = `VPIP ${((100 * x.v) / x.h).toFixed(1)} PFR ${((100 * x.p) / x.h).toFixed(1)} AF ${(x.b / Math.max(1, x.c)).toFixed(2)}`;
    }
    // eslint-disable-next-line no-console
    console.log('archetype stats', out);
    const vp = (a: Archetype): number => agg[a]!.v / agg[a]!.h;
    const pf = (a: Archetype): number => agg[a]!.p / agg[a]!.h;
    const af = (a: Archetype): number => agg[a]!.b / Math.max(1, agg[a]!.c);
    expect(vp('nit')).toBeLessThan(vp('tag'));
    expect(vp('tag')).toBeLessThan(vp('lag'));
    expect(vp('lag')).toBeLessThan(vp('maniac'));
    expect(vp('station')).toBeGreaterThan(vp('tag'));
    expect(pf('station')).toBeLessThan(vp('station') * 0.4); // loose but passive
    expect(pf('maniac')).toBeGreaterThan(pf('lag'));
    expect(pf('lag')).toBeGreaterThan(pf('tag'));
    expect(af('maniac')).toBeGreaterThan(af('tag'));
    expect(af('station')).toBeLessThan(af('tag'));
    // The stats shown to the learner (Reference page, lessons, player-type drills) must match how the bots really play.
    for (const a of ARCHETYPES) {
      expect(Math.abs(100 * vp(a) - PROFILES[a].vpip), `${a} VPIP`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(100 * pf(a) - PROFILES[a].pfr), `${a} PFR`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(af(a) - PROFILES[a].af), `${a} AF`).toBeLessThanOrEqual(0.3);
    }
  }, 600000);

  it('rebuys: only a player with no chips rebuys (to a full stack); a short stack keeps its chips and plays on', () => {
    const sess0 = createSession({ seats: botSeats(['tag', 'station', 'maniac', 'nit', 'lag', 'tag']), seed: 11 });
    const sess: Session = { ...sess0, stacks: [60, 0, 10000, 10000, 10000, 19940], button: 2 };
    const r = nextHand(sess);
    expect(r.rebought).toEqual([{ seat: 1, amount: 10000 }]);
    expect(r.session.rebuys).toEqual([0, 1, 0, 0, 0, 0]);
    // No chips vanish: everything at the table plus the one rebuy.
    expect(r.hand.startStacks).toEqual([60, 10000, 10000, 10000, 10000, 19940]);
    expect(r.hand.players[0]!.inHand).toBe(true); // 60 chips: dealt in, may be all-in for less
    expect(describeRebuys(r.rebought, r.session.seats.map((s) => s.name), 0, 100)).toEqual([`${r.session.seats[1]!.name} ran out of chips and rebought for 100 big blinds.`]);
    expect(describeRebuys([{ seat: 0, amount: 10000 }], ['You'], 0, 100)).toEqual(['You ran out of chips, so you rebought for 100 big blinds.']);
    // A player under one big blind can still play the hand out (posting or calling all-in for less).
    let hand = r.hand;
    while (!hand.result) {
      hand = applyAction(hand, botDecide(hand, PROFILES[r.session.seats[hand.toAct]!.archetype!]));
      assertInvariants(hand);
    }
  });

  it('bot decisions are deterministic for a given state', () => {
    const sess = createSession({ seats: botSeats(['tag', 'station', 'maniac', 'nit', 'lag', 'tag']), seed: 5 });
    const { session, hand } = nextHand(sess);
    const a1 = botDecide(hand, PROFILES[session.seats[hand.toAct]!.archetype!]);
    const a2 = botDecide(hand, PROFILES[session.seats[hand.toAct]!.archetype!]);
    expect(a1).toEqual(a2);
    expect(positionOf(hand.toAct, hand.button, 6)).toBe('UTG');
    void advanceBots;
  });
});
