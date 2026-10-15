import { describe, expect, it } from 'vitest';
import { newHand, toReplayRecord } from '../game';
import type { GradeRecord, HandRecord } from '../../state/types';
import { sessionFromRecord, summarizeHand } from './review';

const g = (verdict: GradeRecord['verdict'], loss: number, street = 'flop', why = 'You called at the wrong price. Details here.'): GradeRecord => ({ street, seat: 0, verdict, evLostBB: loss, tier: 'math', concept: 'pot-odds', why, actionIndex: 3 });
const rec = (net: number, grades: GradeRecord[]): HandRecord => {
  const s = newHand({ config: { numSeats: 6, sb: 50, bb: 100 }, stacks: Array(6).fill(10000), button: 0, seed: 1 });
  return { id: 'x', t: 1, replay: toReplayRecord(s), heroSeat: 0, archetypes: [null, 'tag', 'nit', 'lag', 'station', 'maniac'], net, bb: 100, grades, evLostBB: grades.reduce((a, x) => a + x.evLostBB, 0) };
};

describe('hand summary', () => {
  it('names the key moment and separates decision quality from the result', () => {
    const s = summarizeHand(rec(-500, [g('fine', 0, 'preflop'), g('mistake', 2.4, 'turn')]));
    expect(s.worst!.street).toBe('turn');
    expect(s.decisionVerdict).toBe('mistake');
    expect(s.takeaway).toMatch(/on the turn/);
    expect(s.quadrant).toBe('poor-lost');
  });

  it('good decision that lost is reassuring, not blaming', () => {
    const s = summarizeHand(rec(-1000, [g('fine', 0), g('great', 0)]));
    expect(s.quadrant).toBe('good-lost');
    expect(s.resultNote).toMatch(/variance/);
    expect(s.takeaway).toMatch(/sound decisions/);
  });

  it('bad decision that won is called out', () => {
    const s = summarizeHand(rec(800, [g('blunder', 5)]));
    expect(s.quadrant).toBe('poor-won');
    expect(s.resultNote).toMatch(/Winning does not make a bad decision good/);
    // The mistake is not claimed to have caused the result.
    expect(s.resultNote).toBe('You won 8 big blinds, but there was a mistake along the way. Winning does not make a bad decision good: repeated often, it loses money.');
  });

  it('result notes use correct singular/plural and do not blame the result on the mistake', () => {
    expect(summarizeHand(rec(-100, [g('mistake', 1)])).resultNote).toBe('You lost 1 big blind, and there was also a mistake you can fix.');
    expect(summarizeHand(rec(-150, [g('fine', 0)])).resultNote).toMatch(/^You lost 1\.5 big blinds, but/);
    expect(summarizeHand(rec(100, [g('fine', 0)])).resultNote).toMatch(/^You won 1 big blind with/);
  });

  it('inaccuracies are small leaks, and hands without decisions are handled', () => {
    expect(summarizeHand(rec(300, [g('inaccuracy', 0.8, 'river')])).takeaway).toMatch(/small leak on the river/);
    expect(summarizeHand(rec(-50, [])).takeaway).toMatch(/did not face a decision/);
  });

  it('builds a session view for drawing saved hands', () => {
    const r = rec(0, []);
    const s = sessionFromRecord(r);
    expect(s.seats).toHaveLength(6);
    expect(s.seats[1]!.archetype).toBe('tag');
    expect(s.seats[0]!.isHero).toBe(true);
  });
});
