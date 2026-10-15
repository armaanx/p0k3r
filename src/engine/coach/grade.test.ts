import { describe, expect, it } from 'vitest';
import { fullDeck, parseCards, type Card } from '../cards';
import { type ActionType, type HandState, applyAction, newHand } from '../game';
import { advise } from './advice';
import { explainDecision, gradeAdvice } from './grade';

function mkDeck(n: number, button: number, holes: string[], board: string): Card[] {
  const sb = n === 2 ? button : (button + 1) % n;
  const order = Array.from({ length: n }, (_, i) => (sb + i) % n);
  const h = holes.map((x) => parseCards(x));
  const deck: Card[] = [];
  for (const seat of order) deck.push(h[seat]![0]!);
  for (const seat of order) deck.push(h[seat]![1]!);
  deck.push(...parseCards(board));
  const used = new Set(deck);
  for (const c of fullDeck()) if (!used.has(c)) deck.push(c);
  return deck;
}
const six = (hole: string): HandState => newHand({ config: { numSeats: 6, sb: 50, bb: 100 }, stacks: Array(6).fill(10000), button: 0, seed: 1, stackedDeck: mkDeck(6, 0, ['AsAd', 'KsKd', 'QsQd', hole, 'TsTd', '9s9d'], '2c7d9hJc4s') });
const act = (s: HandState, type: ActionType, amount?: number): HandState => applyAction(s, { seat: s.toAct, type, amount });

describe('grading is generous and honest', () => {
  it('folding a premium hand preflop is a mistake or blunder; folding trash is fine', () => {
    const aa = gradeAdvice(advise(six('AhAc'), { chosen: { seat: 3, type: 'fold' } }), 100);
    expect(['mistake', 'blunder']).toContain(aa.verdict);
    const trash = gradeAdvice(advise(six('7h2c'), { chosen: { seat: 3, type: 'fold' } }), 100);
    expect(['great', 'fine']).toContain(trash.verdict);
  });

  it('raising a borderline hand is fine (no false mistakes near chart edges)', () => {
    const g = gradeAdvice(advise(six('Jh9h'), { chosen: { seat: 3, type: 'raise', amount: 300 } }), 100);
    expect(g.verdict).toBe('fine');
  });

  it('a judgment-tier spot can never be graded worse than an inaccuracy', () => {
    // Heads-up flop, weak hand bets into a check: whatever the EV model says, this is a judgment call.
    let s = newHand({ config: { numSeats: 2, sb: 50, bb: 100 }, stacks: [10000, 10000], button: 0, seed: 1, stackedDeck: mkDeck(2, 0, ['AsKd', '9c8c'], 'Ah 7h 2c 5s 9d') });
    s = act(s, 'raise', 250); s = act(s, 'call');
    const a = advise(s, { chosen: { seat: 1, type: 'bet', amount: 400 } });
    const g = gradeAdvice(a, 100);
    if (a.tier === 'judgment') expect(['great', 'fine', 'inaccuracy']).toContain(g.verdict);
  });

  it('calling a huge river bet with hopeless hand (math tier) is a mistake or blunder', () => {
    let s = newHand({ config: { numSeats: 2, sb: 50, bb: 100 }, stacks: [10000, 10000], button: 0, seed: 1, stackedDeck: mkDeck(2, 0, ['AsKs', '9d8d'], 'Ah 7c 2d 4s Kh') });
    s = act(s, 'raise', 250); s = act(s, 'call');
    s = act(s, 'check'); s = act(s, 'check'); s = act(s, 'check'); s = act(s, 'check'); s = act(s, 'check');
    s = act(s, 'bet', 1500);
    const g = gradeAdvice(advise(s, { chosen: { seat: 1, type: 'call' } }), 100);
    expect(['mistake', 'blunder']).toContain(g.verdict);
    const f = gradeAdvice(advise(s, { chosen: { seat: 1, type: 'fold' } }), 100);
    expect(['great', 'fine']).toContain(f.verdict);
  });
});


describe('feedback wording (W11, M6, M7, M8, M14)', () => {
  // button 0: seat 3 UTG, 4 HJ, 5 CO, 1 SB, 2 BB
  const holes = (seat: number, hero: string): string[] => ['9c9d', '8c8d', '7c7d', '6c6d', '5c5d', '4c4d'].map((h, i) => (i === seat ? hero : h));
  const table = (seat: number, hero: string): HandState => newHand({ config: { numSeats: 6, sb: 50, bb: 100 }, stacks: Array(6).fill(10000), button: 0, seed: 1, stackedDeck: mkDeck(6, 0, holes(seat, hero), 'Kd Js 3h Th 2s') });

  it('W11: folding a chart hand does not claim folding too much is the biggest leak', () => {
    const a = advise(table(3, 'AhAs'), { chosen: { seat: 3, type: 'fold' } });
    const ex = explainDecision(a, gradeAdvice(a, 100));
    expect(ex.detail).not.toMatch(/most common beginner leak/);
    expect(ex.detail).toMatch(/includes this hand, so folding gives up the profit it makes on average/);
  });

  it('M6: "too loose" feedback does not blame early position on the button', () => {
    let s = table(0, '7h2c');
    s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold');
    const a = advise(s, { chosen: { seat: 0, type: 'raise', amount: 250 } });
    const ex = explainDecision(a, gradeAdvice(a, 100));
    expect(ex.detail).not.toMatch(/early position/);
    expect(ex.detail).toMatch(/Hands outside the chart for this spot lose money/);
  });

  it('M7: checking AA in a limped big blind says "checking", is not a blunder, and checking 22 there is fine', () => {
    let s = table(2, 'AhAs');
    s = act(s, 'call'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'call');
    const a = advise(s, { chosen: { seat: 2, type: 'check' } });
    const g = gradeAdvice(a, 100);
    expect(g.verdict).not.toBe('blunder');
    expect(explainDecision(a, g).summary).toMatch(/^Just checking with AA/);
    let t = table(2, '2h2d');
    t = act(t, 'call'); t = act(t, 'fold'); t = act(t, 'fold'); t = act(t, 'fold'); t = act(t, 'call');
    expect(['great', 'fine']).toContain(gradeAdvice(advise(t, { chosen: { seat: 2, type: 'check' } }), 100).verdict);
  });

  it('M14: big blind defence text explains the good price instead of "narrower than you open"', () => {
    let s = table(2, 'Kc9h');
    s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'raise', 250); s = act(s, 'fold');
    const t = advise(s).whyParts[0]!.text;
    expect(t).toMatch(/You already have a big blind in the pot/);
    expect(t).not.toMatch(/narrower set than you'd open/);
  });

  it('M8: passive-vs-bet feedback does not say calling gives free cards; river mentions value', () => {
    let s = newHand({ config: { numSeats: 2, sb: 50, bb: 100 }, stacks: [10000, 10000], button: 0, seed: 1, stackedDeck: mkDeck(2, 0, ['KsQd', 'AhTh'], 'Kh 7h 2h 5c 9d') });
    s = act(s, 'raise', 250); s = act(s, 'call');
    for (let i = 0; i < 5; i++) s = act(s, 'check');
    s = act(s, 'bet', 300);
    const a = advise(s, { chosen: { seat: 1, type: 'call' } });
    const g = gradeAdvice(a, 100);
    expect(['great', 'fine', 'inaccuracy']).toContain(g.verdict);
    const ex = explainDecision(a, g);
    expect(ex.detail).not.toMatch(/see cards for free/);
    if (g.verdict === 'inaccuracy') expect(ex.detail).toMatch(/leaves value behind/);
  });
});
