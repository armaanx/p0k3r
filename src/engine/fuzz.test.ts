import { describe, expect, it } from 'vitest';
import { applyAction, assertInvariants, legalActions, newHand, replayHand, toReplayRecord, type ActionInput, type HandState } from './game';
import { createRng } from './rng';

/** Random-but-legal play with uneven stacks: hunts for engine edge cases bots never reach. */
describe('engine fuzz: random legal actions', () => {
  it('20,000 hands with random stacks and random legal actions keep every invariant', () => {
    const rng = createRng(2025);
    let sideSplits = 0;
    let multiAllIn = 0;
    for (let h = 0; h < 20000; h++) {
      const n = rng.pick([2, 3, 4, 5, 6]);
      const bb = 100;
      const stacks = Array.from({ length: n }, () => rng.pick([30, 120, 250, 1000, 2500, 10000, 50000]) + rng.int(37));
      const button = rng.int(n);
      let s: HandState = newHand({ config: { numSeats: n, sb: 50, bb }, stacks, button, seed: h + 1 });
      assertInvariants(s);
      let guard = 0;
      while (!s.result) {
        if (guard++ > 300) throw new Error('did not terminate');
        const l = legalActions(s)!;
        const r = rng.next();
        let a: ActionInput;
        if (r < 0.12 && !l.canCheck) a = { seat: s.toAct, type: 'fold' };
        else if (r < 0.5) a = l.canCheck ? { seat: s.toAct, type: 'check' } : { seat: s.toAct, type: 'call' };
        else if (l.canRaise) {
          const x = rng.next();
          if (x < 0.2) a = { seat: s.toAct, type: 'allin' };
          else if (x < 0.5) a = { seat: s.toAct, type: l.raiseType, amount: l.minRaiseTo };
          else a = { seat: s.toAct, type: l.raiseType, amount: l.minRaiseTo + rng.int(l.maxRaiseTo - l.minRaiseTo + 1) };
        } else a = l.canCheck ? { seat: s.toAct, type: 'check' } : { seat: s.toAct, type: 'call' };
        s = applyAction(s, a);
        assertInvariants(s);
      }
      if (s.result.pots.length > 1) sideSplits++;
      if (s.actions.filter((x) => x.allIn).length >= 2) multiAllIn++;
      if (h % 200 === 0) {
        const again = replayHand(toReplayRecord(s));
        expect(again.result).toEqual(s.result);
      }
    }
    expect(sideSplits).toBeGreaterThan(500); // we really did exercise side pots
    expect(multiAllIn).toBeGreaterThan(500);
  }, 300000);
});
