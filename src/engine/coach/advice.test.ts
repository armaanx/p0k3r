import { describe, expect, it } from 'vitest';
import { PROFILES, botDecide } from '../bots';
import { type Card, fullDeck, parseCards } from '../cards';
import { type ActionInput, type ActionType, type HandState, applyAction, legalActions, newHand } from '../game';
import { createSession, nextHand } from '../session';
import { advise, withArticle } from './advice';
import { explainDecision, gradeAdvice } from './grade';
import { breakEvenEquity, formatRatio, minDefenseFrequency, sprBand, streetSpr, winnablePot } from './odds';

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
const start = (n: number, holes: string[], board: string, button = 0, stack = 10000): HandState =>
  newHand({ config: { numSeats: n, sb: 50, bb: 100 }, stacks: Array(n).fill(stack), button, seed: 1, stackedDeck: mkDeck(n, button, holes, board) });
const startS = (holes: string[], board: string, stacks: number[], button = 0): HandState =>
  newHand({ config: { numSeats: stacks.length, sb: 50, bb: 100 }, stacks, button, seed: 1, stackedDeck: mkDeck(stacks.length, button, holes, board) });
const act = (s: HandState, type: ActionType, amount?: number): HandState => applyAction(s, { seat: s.toAct, type, amount });
const grade = (s: HandState, chosen: Omit<ActionInput, 'seat'>) => {
  const a = advise(s, { chosen: { seat: s.toAct, ...chosen } });
  const g = gradeAdvice(a, 100);
  return { a, g, ex: explainDecision(a, g) };
};
const OK = ['great', 'fine'];
const MISTAKE_PLUS = ['mistake', 'blunder'];
// 6-max with button 0: seat 1 SB, 2 BB, 3 UTG, 4 HJ, 5 CO. Unique filler hands for the other seats.
const FILL = ['9c9d', '8c8d', '7c7d', '6c6d', '5c5d', '4c4d'];
const sixWith = (heroSeat: number, hero: string, stacks = Array(6).fill(10000) as number[]): HandState => {
  const holes = FILL.map((h, i) => (i === heroSeat ? hero : h));
  return startS(holes, 'Kd Js 3h Th 2s', stacks);
};

describe('odds arithmetic', () => {
  it('break-even equity and ratios', () => {
    expect(breakEvenEquity(50, 150)).toBeCloseTo(0.25, 10); // call 50 to win 150: 25%
    expect(formatRatio(50, 150)).toBe('3.0 to 1');
    expect(breakEvenEquity(100, 100)).toBeCloseTo(0.5, 10); // pot already includes their 100 bet
    expect(minDefenseFrequency(50, 100)).toBeCloseTo(2 / 3, 10);
  });
});

describe('preflop advice', () => {
  const six = (hole: string, seatCards = 'UTG'): HandState => {
    // button = 0 => seat 3 is UTG. Give the hero (UTG) the cards.
    void seatCards;
    const holes = ['AsAd', 'KsKd', 'QsQd', hole, 'TsTd', '9s9d'];
    return start(6, holes, '2c7d9hJc4s', 0);
  };

  it('UTG: AA raises, 72o folds, both tier "standard"', () => {
    const aa = advise(six('AhAc'));
    // hole duplicates are irrelevant for preflop charts (AhAc dupes with AsAd in deck) — use distinct cards:
    expect(aa.recommended.cls).toBe('aggressive');
    const trash = advise(six('7h2c'));
    expect(trash.recommended.cls).toBe('fold');
    expect(trash.tier).toBe('standard');
    expect(trash.close).toBe(false);
    expect(trash.chosen).toBeUndefined();
  });

  it('a marginal hand accepts both actions (generous near the edge of the chart)', () => {
    const j9 = advise(six('Jh9h'));
    expect(j9.chart!.marginal).toBe(true);
    expect(j9.acceptable).toContain('fold');
    expect(j9.acceptable).toContain('aggressive');
    const fold = advise(six('Jh9h'), { chosen: { seat: 3, type: 'fold' } });
    expect(fold.chosen!.acceptable).toBe(true);
    const raise = advise(six('Jh9h'), { chosen: { seat: 3, type: 'raise', amount: 300 } });
    expect(raise.chosen!.acceptable).toBe(true);
  });

  it('folding AA is a big EV loss; raising 72o UTG is a real loss', () => {
    const f = advise(six('AhAc'), { chosen: { seat: 3, type: 'fold' } });
    expect(f.chosen!.acceptable).toBe(false);
    expect(f.chosen!.lossBB).toBeGreaterThan(2);
    const r = advise(six('7h2c'), { chosen: { seat: 3, type: 'raise', amount: 300 } });
    expect(r.chosen!.acceptable).toBe(false);
    expect(r.chosen!.lossBB).toBeGreaterThan(0.8);
  });

  it('facing a raise uses the defence chart: BTN vs CO raise, AQo calls, AA re-raises, 72o folds', () => {
    const mk = (hole: string): HandState => {
      let s = start(6, ['AsAd', 'KsKd', 'QsQd', 'JsJd', 'Ts3d', hole], '2c7d9hJc4s', 0);
      // seat 3 UTG folds, seat 4 HJ folds, seat 5 CO raises, seat 0 BTN is hero
      s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'raise', 250);
      return s;
    };
    expect(mk('AcQh') && advise(mkWithHero('AhQc')).recommended.cls).toBe('passive');
    function mkWithHero(hero: string): HandState {
      let s = start(6, [hero, 'KsKd', 'QsQd', 'JsJd', 'Ts3d', '8s8d'], '2c7d9hJc4s', 0);
      s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'raise', 250);
      return s;
    }
    expect(advise(mkWithHero('AhAc')).recommended.cls).toBe('aggressive');
    expect(advise(mkWithHero('7h2c')).recommended.cls).toBe('fold');
    const a = advise(mkWithHero('AhQc'));
    expect(a.equity).toBeGreaterThan(0.4);
    expect(a.breakEven).toBeGreaterThan(0.15);
    expect(a.opponents[0]!.description).toMatch(/CO/);
  });
});

describe('postflop advice', () => {
  /** Heads-up: button (seat 0) raised and hero (seat 1, BB) called. Flop given. Returns state with hero to act. */
  function headsUpToFlop(villain: string, hero: string, board: string): HandState {
    let s = start(2, [villain, hero], board, 0);
    s = act(s, 'raise', 250);
    s = act(s, 'call');
    return s;
  }

  it('never folds the nuts to a bet, and the rationale mentions pot odds', () => {
    let s = headsUpToFlop('KsKd', '7h7c', '7d 2c Ks'.replace('Ks', 'Jh'));
    s = act(s, 'check');
    s = act(s, 'bet', 300);
    const a = advise(s);
    expect(a.recommended.cls).not.toBe('fold');
    expect(a.equity!).toBeGreaterThan(0.75);
    expect(a.breakEven).toBeCloseTo(300 / (800 + 300), 5);
    expect(a.whyParts.some((w) => w.concept === 'pot-odds')).toBe(true);
    const folded = advise(s, { chosen: { seat: 1, type: 'fold' } });
    expect(folded.chosen!.acceptable).toBe(false);
    expect(folded.chosen!.lossBB).toBeGreaterThan(3);
  });

  it('a hopeless hand facing a huge river overbet should fold, and the tier is "math"', () => {
    let s = headsUpToFlop('AsKs', '9d8d', 'Ah 7c 2d');
    s = act(s, 'check'); s = act(s, 'check'); // flop
    s = act(s, 'check'); s = act(s, 'check'); // turn (board card 4s)
    s = act(s, 'check');
    s = act(s, 'bet', 1500); // 3x pot shove-ish bet into 500
    const a = advise(s);
    expect(a.street).toBe('river');
    expect(a.recommended.cls).toBe('fold');
    expect(a.tier).toBe('math');
    const call = advise(s, { chosen: { seat: 1, type: 'call' } });
    expect(call.chosen!.acceptable).toBe(false);
    expect(call.chosen!.lossBB).toBeGreaterThan(2);
  });

  it('a flush draw with a good price is a call (outs and Rule of 4 are explained)', () => {
    let s = headsUpToFlop('AsKd', 'Qh9h', 'Ah 7h 2c');
    s = act(s, 'check');
    s = act(s, 'bet', 150); // small bet into 500
    const a = advise(s);
    expect(a.outs).not.toBeNull();
    expect(a.outs!.count).toBeGreaterThanOrEqual(8);
    expect(a.recommended.cls).not.toBe('fold');
    expect(a.whyParts.some((w) => w.concept === 'outs')).toBe(true);
    // the fold is an error, the call is fine
    expect(advise(s, { chosen: { seat: 1, type: 'fold' } }).chosen!.acceptable).toBe(false);
    expect(advise(s, { chosen: { seat: 1, type: 'call' } }).chosen!.acceptable).toBe(true);
  });

  it('folding when a check is free is flagged', () => {
    const s = headsUpToFlop('AsKd', '9c8c', 'Ah 7h 2c');
    const a = advise(s, { chosen: { seat: 1, type: 'fold' } });
    expect(a.chosen!.acceptable).toBe(false);
    expect(a.acceptable).not.toContain('fold');
  });

  it('advice is deterministic and JSON-serialisable (safe to send across a Web Worker)', () => {
    let s = headsUpToFlop('AsKd', 'Qh9h', 'Ah 7h 2c');
    s = act(s, 'check'); s = act(s, 'bet', 150);
    const a1 = advise(s);
    const a2 = advise(s);
    expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));
    expect(() => structuredClone(a1)).not.toThrow();
  });
});

describe('advice fuzz on real bot-played decision points', () => {
  it('advises every decision across 150 bot hands without errors, with sane structure', () => {
    let sess = createSession({ seats: ['tag', 'station', 'maniac', 'nit', 'lag', 'tag'].map((a, i) => ({ name: `B${i}`, isHero: false, archetype: a as 'tag' })), seed: 11 });
    let decisions = 0;
    let totalMs = 0;
    let maxMs = 0;
    const tiers: Record<string, number> = { math: 0, standard: 0, judgment: 0 };
    for (let h = 0; h < 150; h++) {
      const r = nextHand(sess);
      sess = r.session;
      let hand = r.hand;
      while (!hand.result) {
        const legal = legalActions(hand)!;
        const t0 = performance.now();
        const a = advise(hand, { iterations: 1500 });
        const dt = performance.now() - t0;
        totalMs += dt;
        maxMs = Math.max(maxMs, dt);
        decisions++;
        tiers[a.tier]!++;
        expect(a.options.length).toBeGreaterThanOrEqual(2);
        expect(a.acceptable).toContain(a.recommended.cls);
        for (const o of a.options) expect(Number.isFinite(o.ev)).toBe(true);
        expect(a.whyParts.length).toBeGreaterThan(0);
        expect(a.nudges.length).toBeGreaterThan(0);
        if (legal.canCheck) expect(a.acceptable).not.toContain('fold');
        // Each option's action must be legal
        const probe = applyAction(hand, a.recommended.action);
        expect(probe).toBeDefined();
        const bot: ActionInput = botDecide(hand, PROFILES[sess.seats[hand.toAct]!.archetype!]);
        hand = applyAction(hand, bot);
      }
      sess = { ...sess, stacks: hand.players.map((p) => p.stack) };
    }
    // eslint-disable-next-line no-console
    console.log(`advise(): ${decisions} decisions, avg ${(totalMs / decisions).toFixed(1)}ms, max ${maxMs.toFixed(0)}ms, tiers`, tiers);
    expect(decisions).toBeGreaterThan(500);
  }, 300000);
});


// ---------------------------------------------------------------------------
// Audit regressions: every "WRONG" item gets a concrete spot.
// ---------------------------------------------------------------------------

describe('pot odds use only the chips you can win (all-in for less)', () => {
  it('winnablePot / breakEven / text when the bet is bigger than your stack', () => {
    // Heads-up: hero (BB, seat 1) has 3,100; button limps, hero checks, button bets 15,000 on the flop.
    let s = startS(['AsKd', 'Qh9h'], 'Ah 7h 2c 5s 9d', [20000, 3100]);
    s = act(s, 'call'); s = act(s, 'check');
    s = act(s, 'check'); s = act(s, 'bet', 15000);
    expect(winnablePot(s, 1)).toBe(3200); // 100 (hero) + 100 (button's preflop) + 3,000 of the 15,000 bet
    const a = advise(s);
    expect(a.toCall).toBe(3000);
    expect(a.winPot).toBe(3200);
    expect(a.breakEven).toBeCloseTo(3000 / 6200, 6);
    expect(a.potOdds).toBe(formatRatio(3000, 3200));
    expect(a.whyParts.find((w) => w.concept === 'pot-odds')!.text).toMatch(/risk 3,000 to win 3,200/);
    expect(a.options.find((o) => o.cls === 'passive')!.ev).toBeCloseTo(a.equity! * 6200 - 3000, 0);
  });

  it('preflop: a 15bb big blind facing a button shove needs ~46%, not 12%', () => {
    // seat 0 BTN has 10,000 and shoves; seat 2 BB has 1,500.
    let s = sixWith(2, 'Ah9c', [10000, 10000, 1500, 10000, 10000, 10000]);
    s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'allin'); s = act(s, 'fold');
    const a = advise(s);
    expect(a.situation).toBe('vs-shove');
    expect(a.winPot).toBe(100 + 1500 + 50); // hero's blind + the 1,500 of the shove hero can match + the small blind
    expect(a.breakEven).toBeCloseTo(1400 / (1650 + 1400), 6); // ~46%
  });

  it('SPR is effective stack / pot at the start of the street', () => {
    let s = startS(['AsKd', 'Qh9h'], 'Ah 7h 2c 5s 9d', [20000, 3100]);
    s = act(s, 'call'); s = act(s, 'check');
    expect(streetSpr(s, 0)).toBeCloseTo(3000 / 200, 6); // the button's 19,900 does not count: hero only has 3,000
    s = act(s, 'check'); s = act(s, 'bet', 15000);
    expect(advise(s).spr).toBeCloseTo(3000 / 200, 6); // still measured at the start of the street
    expect([sprBand(2.9), sprBand(3), sprBand(7.9), sprBand(8)]).toEqual(['low', 'medium', 'medium', 'high']);
  });
});

describe('preflop all-ins and short stacks', () => {
  const vsBtnShove = (hero: string, btnStack: number): HandState => {
    let s = sixWith(2, hero, [btnStack, 10000, 10000, 10000, 10000, 10000]);
    s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'allin'); s = act(s, 'fold');
    return s;
  };

  it('W1: AA, QQ and AKo call an 8bb shove (raising is impossible, so the chart 3-bet becomes a call)', () => {
    for (const h of ['AhAs', 'QhQd', 'AcKs']) {
      const s = vsBtnShove(h, 800);
      const a = advise(s);
      expect(legalActions(s)!.canRaise).toBe(false);
      expect(a.recommended.cls, h).toBe('passive');
      expect(a.acceptable, h).not.toContain('fold');
      expect(a.acceptable, h).not.toContain('aggressive');
      expect(MISTAKE_PLUS, h).toContain(grade(s, { type: 'fold' }).g.verdict);
    }
  });

  it('W1/W2: AA calls a 100bb shove; folding it is a blunder', () => {
    const s = vsBtnShove('AhAs', 10000);
    expect(advise(s).recommended.cls).toBe('passive');
    expect(grade(s, { type: 'fold' }).g.verdict).toBe('blunder');
  });

  it('W2: folding 22 or 76s to a 100bb shove is correct (no 100bb open-raise chart here)', () => {
    for (const h of ['2h2d', '7h6h']) {
      const s = vsBtnShove(h, 10000);
      const a = advise(s);
      expect(a.situation).toBe('vs-shove');
      expect(a.recommended.cls, h).toBe('fold');
      expect(OK, h).toContain(grade(s, { type: 'fold' }).g.verdict);
      expect(OK, h).not.toContain(grade(s, { type: 'call' }).g.verdict);
    }
  });

  it('W4: BTN with 10bb shoves K9o and Q8s first in; UTG folds them', () => {
    for (const h of ['Kc9h', 'Qh8h']) {
      let s = sixWith(0, h, Array(6).fill(1000));
      s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold');
      const a = advise(s);
      expect(a.situation).toBe('short');
      expect(a.recommended.cls, h).toBe('aggressive');
      expect(a.recommended.action.type, h).toBe('allin');
    }
    const utg = advise(sixWith(3, 'Kc9h', Array(6).fill(1000)));
    expect(utg.recommended.cls).toBe('fold');
  });

  it('W5: facing a 4-bet, AK continues (AK jams, QQ calls) and folding AA is a blunder', () => {
    const vs4 = (hero: string): HandState => {
      let s = sixWith(0, hero);
      s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'raise', 250); // CO opens
      s = act(s, 'raise', 750); // hero (BTN) 3-bets
      s = act(s, 'fold'); s = act(s, 'fold');
      s = act(s, 'raise', 2000); // CO 4-bets
      return s;
    };
    expect(advise(vs4('AcKc')).recommended.cls).toBe('aggressive');
    expect(advise(vs4('AcKs')).recommended.cls).toBe('aggressive');
    expect(advise(vs4('QhQd')).recommended.cls).toBe('passive');
    expect(advise(vs4('JhJc')).recommended.cls).toBe('fold');
    expect(advise(vs4('TcTd')).recommended.cls).toBe('fold');
    expect(grade(vs4('AhAs'), { type: 'fold' }).g.verdict).toBe('blunder');
    expect(advise(vs4('JhJc')).whyParts[0]!.text).toMatch(/QQ or better and AK/);
    // Review fixes: jamming AKo over a 4-bet is standard; flatting AA/KK (a trap) and jamming QQ are fine too.
    expect(OK).toContain(grade(vs4('AcKs'), { type: 'allin' }).g.verdict);
    expect(OK).toContain(grade(vs4('AcKs'), { type: 'call' }).g.verdict);
    expect(OK).toContain(grade(vs4('AhAs'), { type: 'call' }).g.verdict);
    expect(OK).toContain(grade(vs4('KhKc'), { type: 'call' }).g.verdict);
    expect(OK).toContain(grade(vs4('QhQd'), { type: 'allin' }).g.verdict);
    expect(advise(vs4('JhJc')).whyParts[0]!.text).toMatch(/AA, KK and AK usually move all-in; QQ can call or move all-in/);
  });

  it('review: a squeeze after you flat-called is a 3-bet (JJ/TT call), not a 4-bet', () => {
    const sq = (hero: string): HandState => {
      let s = sixWith(0, hero);
      s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'raise', 250); // CO opens
      s = act(s, 'call'); s = act(s, 'fold'); // hero (BTN) calls, SB folds
      s = act(s, 'raise', 1200); s = act(s, 'fold'); // BB squeezes, CO folds
      return s;
    };
    const jj = advise(sq('JhJs'));
    expect(jj.situation).toBe('vs-3bet');
    expect(jj.recommended.cls).toBe('passive');
    expect(jj.whyParts[0]!.text).toMatch(/squeeze/);
    expect(OK).toContain(grade(sq('ThTs'), { type: 'call' }).g.verdict);
    expect(advise(sq('7h2c')).recommended.cls).toBe('fold');
  });

  it('review: a raise and a re-raise in front of you (cold) cites the right chart and sizes a 4-bet, not an all-in', () => {
    let s = sixWith(0, 'AhKd');
    s = act(s, 'raise', 300); s = act(s, 'raise', 900); s = act(s, 'fold'); // UTG opens, HJ 3-bets, CO folds
    const a = advise(s);
    expect(a.chart!.source).toMatch(/raise and a re-raise/);
    expect(a.recommended.cls).toBe('aggressive');
    expect(a.recommended.action.type).not.toBe('allin');
  });

  it('review: an all-in with an earlier raiser still to act is a judgment call against the shover alone', () => {
    // CO raises to 250, BTN moves all-in for 1,200, SB folds; hero BB 88 (CO can still act behind).
    let s = sixWith(2, '8h8s', [1200, 10000, 1200, 10000, 10000, 10000]);
    s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'raise', 250); s = act(s, 'allin'); s = act(s, 'fold');
    const { a, g } = grade(s, { type: 'call' });
    expect(a.tier).toBe('judgment');
    expect(a.equity!).toBeGreaterThan(0.44); // heads-up against the BTN re-shove range, not 3-way
    expect(OK).toContain(g.verdict);
    expect(a.whyParts.some((w) => /can still act behind you/.test(w.text))).toBe(true);
  });

  it('review: open-limping first in is never "fine"; limping a strong hand is a mistake; BB checking stays fine', () => {
    for (const h of ['KhJd', '4h4s', 'Jh9h', 'QhJd']) expect(grade(sixWith(3, h), { type: 'call' }).g.verdict).toBe('inaccuracy');
    let co = sixWith(5, '5h4h'); co = act(co, 'fold'); co = act(co, 'fold');
    expect(OK).not.toContain(grade(co, { type: 'call' }).g.verdict);
    let sb = sixWith(1, 'Jh5d'); for (let i = 0; i < 4; i++) sb = act(sb, 'fold');
    const sbG = grade(sb, { type: 'call' });
    expect(OK).not.toContain(sbG.g.verdict);
    expect(sbG.ex.summary).toMatch(/Limping/);
    for (const h of ['AhAc', 'AhKh', 'KhQh', '9h9s']) expect(MISTAKE_PLUS).toContain(grade(sixWith(3, h), { type: 'call' }).g.verdict);
    let bb = sixWith(2, 'Jh5d'); for (let i = 0; i < 4; i++) bb = act(bb, 'fold'); bb = act(bb, 'call');
    expect(OK).toContain(grade(bb, { type: 'check' }).g.verdict);
  });

  it('review: a multiway all-in lists every opponent and has no double period', () => {
    // UTG shoves 10bb, BTN calls; hero BB.
    let s = sixWith(2, 'QhQs', [1000, 10000, 10000, 1000, 10000, 10000]);
    s = act(s, 'allin'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'call'); s = act(s, 'fold');
    const a = advise(s);
    expect(a.situation).toBe('vs-shove');
    expect(a.opponents.length).toBe(2);
    expect(a.opponents.map((o) => o.description).join(' ')).not.toMatch(/\.\./);
  });

  it('review: 10bb big blind vs a button min-raise re-shoves wide and may flat', () => {
    const bb = (hero: string): HandState => {
      let s = sixWith(2, hero, Array(6).fill(1000));
      s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'raise', 200); s = act(s, 'fold');
      return s;
    };
    expect(advise(bb('Kh9d')).recommended.cls).toBe('aggressive');
    expect(OK).toContain(grade(bb('Ah4d'), { type: 'allin' }).g.verdict);
    expect(OK).toContain(grade(bb('Kh9d'), { type: 'call' }).g.verdict);
    expect(advise(bb('Kh9d')).whyParts[0]!.text).not.toMatch(/can't raise and then fold/);
    // Calling 1bb can't cost much more than the 1bb it puts in.
    const q5 = grade(bb('Th2d'), { type: 'call' });
    expect(q5.g.lossBB).toBeLessThanOrEqual(1.05);
  });

  it('review: at 20bb, 3-bets are all-in-or-fold and set-mining folds are fine', () => {
    const st = Array(6).fill(2000) as number[];
    const vs3 = (hero: string): HandState => {
      let s = sixWith(3, hero, st);
      s = act(s, 'raise', 250); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'raise', 700); s = act(s, 'fold'); s = act(s, 'fold');
      return s;
    };
    const a = advise(vs3('7h7s'));
    expect(a.recommended.action.type).toBe('allin');
    expect(OK).toContain(grade(vs3('KhQh'), { type: 'allin' }).g.verdict);
    let s = sixWith(0, '6h6s', st);
    s = act(s, 'raise', 300); s = act(s, 'fold'); s = act(s, 'fold');
    expect(OK).toContain(grade(s, { type: 'fold' }).g.verdict);
    expect(advise(s).chart!.source).not.toMatch(/100bb/);
    let s2 = sixWith(0, 'AhKd', st);
    s2 = act(s2, 'raise', 300); s2 = act(s2, 'fold'); s2 = act(s2, 'fold');
    expect(advise(s2).recommended.action.type).toBe('allin');
  });

  it('review: the suited-ace bluff note only appears for A5s-A2s', () => {
    let s = startS(['9c9d', 'KhQd'], 'Kd Js 3h Th 2s', [10000, 10000]);
    s = act(s, 'raise', 250);
    expect(advise(s).whyParts.some((w) => /Suited aces/.test(w.text))).toBe(false);
    let s2 = sixWith(2, 'Ah5h');
    s2 = act(s2, 'raise', 300);
    for (let i = 0; i < 4; i++) s2 = act(s2, 'fold');
    const a2 = advise(s2);
    if (a2.recommended.cls === 'aggressive') expect(a2.whyParts.some((w) => /Suited aces/.test(w.text))).toBe(true);
  });

  it('review: BB raises wider over a lone small-blind limp', () => {
    let s = sixWith(2, 'KhTd');
    for (let i = 0; i < 4; i++) s = act(s, 'fold');
    s = act(s, 'call'); // SB limps
    expect(advise(s).recommended.cls).toBe('aggressive');
    expect(OK).toContain(grade(s, { type: 'raise', amount: 350 }).g.verdict);
  });
});

describe('preflop charts in the coach', () => {
  it('W6: folding JJ to a UTG open is not "fine" (only the neighbouring 3-bet is also acceptable)', () => {
    let s = sixWith(4, 'JhJc');
    s = act(s, 'raise', 300);
    const a = advise(s);
    expect(a.recommended.cls).toBe('passive');
    expect(a.acceptable).not.toContain('fold');
    expect(a.acceptable).toContain('aggressive');
    expect(OK).not.toContain(grade(s, { type: 'fold' }).g.verdict);
  });

  it('W6: big blind folding AQs vs UTG or 99 vs BTN is not fine', () => {
    let s = sixWith(2, 'AhQh');
    s = act(s, 'raise', 300); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold');
    expect(OK).not.toContain(grade(s, { type: 'fold' }).g.verdict);
    let t = sixWith(2, '9h9s');
    t = act(t, 'fold'); t = act(t, 'fold'); t = act(t, 'fold'); t = act(t, 'raise', 250); t = act(t, 'fold');
    expect(OK).not.toContain(grade(t, { type: 'fold' }).g.verdict);
  });

  it('W7: folding 72o in a limped big blind costs almost nothing and says checking is free', () => {
    let s = sixWith(2, '7h2c');
    s = act(s, 'call'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'call');
    const { a, g, ex } = grade(s, { type: 'fold' });
    expect(a.situation).toBe('bb-option');
    expect(g.lossBB).toBeLessThan(0.2);
    expect(ex.summary).toBe('Folding when you can check for free never helps.');
    expect(ex.detail).not.toMatch(/most common beginner leak/);
  });

  it('M2: big blind defends K9o, A5o and Q9o vs the button, and K7s vs the cutoff', () => {
    const vs = (hero: string, raiserSeat: 0 | 5): HandState => {
      let s = sixWith(2, hero);
      s = act(s, 'fold'); s = act(s, 'fold');
      if (raiserSeat === 5) { s = act(s, 'raise', 250); s = act(s, 'fold'); s = act(s, 'fold'); }
      else { s = act(s, 'fold'); s = act(s, 'raise', 250); s = act(s, 'fold'); }
      return s;
    };
    for (const h of ['Kc9h', 'As5h', 'Qc9h']) expect(advise(vs(h, 0)).recommended.cls, h).toBe('passive');
    expect(advise(vs('Kc7c', 5)).recommended.cls).toBe('passive');
  });

  it('M1: preflop chart scores keep fold at 0 and give the chart action the top non-fold score', () => {
    let s = sixWith(2, 'Tc2h');
    s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'fold'); s = act(s, 'raise', 250); s = act(s, 'fold');
    const a = advise(s);
    expect(a.evKind).toBe('score');
    expect(a.recommended.cls).toBe('fold');
    expect(a.options.find((o) => o.cls === 'fold')!.evBB).toBe(0);
    for (const o of a.options) if (o.cls !== 'fold') expect(o.evBB).toBeLessThan(0);
  });

  it('W8: the learner\'s own size is graded and reported (100bb open-shove with AA, min-raise is fine)', () => {
    const s = sixWith(3, 'AhAs');
    const jam = grade(s, { type: 'allin' });
    expect(jam.a.chosen!.label).toBe('All-in 10,000');
    expect(OK).not.toContain(jam.g.verdict);
    expect(jam.g.verdict).toBe('inaccuracy'); // the decision to raise was right; only the size was off
    expect(jam.ex.summary).toMatch(/Your size \(All-in 10,000\)/);
    const minr = grade(s, { type: 'raise', amount: 200 });
    expect(minr.a.chosen!.label).toBe('Raise to 200');
    expect(OK).toContain(minr.g.verdict);
    expect(minr.ex.summary).toMatch(/^Raise to 200/);
  });

  it('M13 data: unopened pots are flagged so the UI can hide the equity meter', () => {
    expect(advise(sixWith(3, 'Kc9h')).unopened).toBe(true);
    let s = sixWith(4, 'Kc9h');
    s = act(s, 'raise', 300);
    expect(advise(s).unopened).toBe(false);
  });
});

describe('postflop grading severity (W8, W9) and text (W10, M9-M12)', () => {
  /** Heads-up: button (seat 0) raised to 250 and hero (BB, seat 1) called. */
  const hu = (villain: string, hero: string, board: string): HandState => {
    let s = start(2, [villain, hero], board, 0);
    s = act(s, 'raise', 250); s = act(s, 'call');
    return s;
  };

  it('W8: shoving 9,750 into 500 with king-high is not fine, and the label is the learner\'s', () => {
    const s = hu('AsAd', 'Kc3d', '9h 6s 2c 5d Jh');
    const { a, g, ex } = grade(s, { type: 'allin' });
    expect(a.chosen!.label).toBe('All-in 9,750');
    expect(OK).not.toContain(g.verdict);
    expect(ex.summary).not.toMatch(/Bet 250/);
  });

  it('W8: a min-bet with a set is graded at its own size (not "great", and labelled as the learner\'s bet)', () => {
    const s = hu('AsKd', '7h7c', '7d 2c Jh 4s 9d');
    const { a, g } = grade(s, { type: 'bet', amount: 100 });
    expect(a.chosen!.label).toBe('Bet 100');
    expect(g.verdict).not.toBe('great');
    expect(a.chosen!.lossBB).toBeGreaterThan(0);
  });

  it('W9: folding an overpair (QQ on J-7-2) to a 1/3-pot bet is a mistake or worse', () => {
    let s = hu('AsKd', 'QhQc', 'Jd 7s 2c 4h 9d');
    s = act(s, 'check'); s = act(s, 'bet', 170);
    expect(MISTAKE_PLUS).toContain(grade(s, { type: 'fold' }).g.verdict);
  });

  it('W9: folding a flush draw getting 4 to 1 is a mistake or worse', () => {
    let s = hu('AsKd', 'Qh9h', 'Ah 7h 2c 5s 9d');
    s = act(s, 'check'); s = act(s, 'bet', 125);
    expect(MISTAKE_PLUS).toContain(grade(s, { type: 'fold' }).g.verdict);
  });

  it('W9: calling off with jack-high and no draw is a mistake or worse', () => {
    let s = hu('KcQc', 'Jd3h', 'Ks Qd 8c 7h 2s');
    s = act(s, 'check'); s = act(s, 'check'); // flop
    s = act(s, 'check'); s = act(s, 'check'); // turn
    s = act(s, 'check'); s = act(s, 'allin'); // river shove 9,750 into 500
    const { g, ex } = grade(s, { type: 'call' });
    expect(MISTAKE_PLUS).toContain(g.verdict);
    expect(ex.summary).toBe('The price was too high for this call.');
  });

  it('W9: flat-calling the river with the nut flush is never worse than an inaccuracy', () => {
    let s = hu('KsKd', 'AhTh', 'Kh 7h 2h 5c 9d');
    s = act(s, 'check'); s = act(s, 'check');
    s = act(s, 'check'); s = act(s, 'check');
    s = act(s, 'check'); s = act(s, 'bet', 300);
    expect(['great', 'fine', 'inaccuracy']).toContain(grade(s, { type: 'call' }).g.verdict);
  });

  it('W9: checking a set on a dry board is never worse than an inaccuracy', () => {
    const s = hu('AsKd', '7h7c', '7d 2c Kh 4s 9d');
    expect(['great', 'fine', 'inaccuracy']).toContain(grade(s, { type: 'check' }).g.verdict);
  });

  it('W10: river value text does not mention the next card', () => {
    let s = hu('KsQd', 'AhTh', 'Kh 7h 2h 5c 9d');
    s = act(s, 'check'); s = act(s, 'check');
    s = act(s, 'check'); s = act(s, 'check');
    const a = advise(s);
    expect(a.street).toBe('river');
    for (const w of a.whyParts) expect(w.text).not.toMatch(/next card/);
  });

  it('M11: board-pair air is not described as "pair of queens"', () => {
    const s = hu('AsKd', '6c5d', 'Qh Qc 9s 2d 3h');
    const a = advise(s);
    expect(a.whyParts[0]!.text).not.toMatch(/You have pair of queens/i);
    expect(a.whyParts[0]!.text).toMatch(/on the board/);
  });

  it('M3/M12: a flop draw facing a bet compares the price with the one-card chance too', () => {
    let s = hu('AsKd', 'Qh9h', 'Ah 7h 2c 5s 9d');
    s = act(s, 'check'); s = act(s, 'bet', 150);
    const outs = advise(s).whyParts.find((w) => w.concept === 'outs')!.text;
    expect(outs).toMatch(/Rule of 4/);
    expect(outs).toMatch(/Rule of 2 the turn alone/);
  });

  it('M1 (math): Rule of 4 is labelled "adjusted" when it is adjusted', () => {
    let s = hu('KsKd', 'AhJh', 'Th 9h 2c 5s 4d'); // flush draw + gutshot = 12 outs
    s = act(s, 'check');
    const a = advise(s);
    if (a.outs && a.outs.count > 8) {
      expect(a.outs.adjusted).toBe(true);
      expect(a.whyParts.find((w) => w.concept === 'outs')!.text).toMatch(/Rule of 4, adjusted/);
      expect(a.outs.rule).toBeCloseTo((a.outs.count * 4 - (a.outs.count - 8)) / 100, 6);
    }
  });

  it('labels use articles: "a flush draw", "an overpair", "the nut flush", "top pair"', () => {
    expect(withArticle('Flush draw')).toBe('a flush draw');
    expect(withArticle('Overpair')).toBe('an overpair');
    expect(withArticle('Nut flush')).toBe('the nut flush');
    expect(withArticle('Set of Sevens')).toBe('a set of sevens');
    expect(withArticle('Top pair, good kicker')).toBe('top pair, good kicker');
    expect(withArticle('Two pair')).toBe('two pair');
    expect(withArticle('Ace high')).toBe('ace high');
    expect(withArticle('Open-ended straight draw')).toBe('an open-ended straight draw');
    const s = hu('AsKd', '7h7c', '7d 2c Jh 4s 9d');
    const t = advise(s).whyParts[0]!.text;
    expect(t).toMatch(/^You have a set of sevens/);
  });
});


describe('postflop review fixes (coach-postflop / lessons-c)', () => {
  // HU, button 0: BTN raises to 250, BB calls (flop pot 500). BB acts first postflop.
  const hu = (btn: string, bbHole: string, board: string): HandState => act(act(start(2, [btn, bbHole], board), 'raise', 250), 'call');
  const checks = (s: HandState, n: number): HandState => { for (let i = 0; i < n; i++) s = act(s, 'check'); return s; };

  it('folding a draw the coach wanted to bluff-raise is not described as "the right price to continue"', () => {
    let s = hu('AhKd', '9c8c', 'Jd7h2s4s9h');
    s = act(s, 'check'); s = act(s, 'bet', 170); s = act(s, 'call'); s = act(s, 'check'); s = act(s, 'bet', 600);
    const { a, ex } = grade(s, { type: 'fold' });
    expect(a.equity!).toBeLessThan(a.breakEven!);
    expect(ex.summary).not.toMatch(/right price/);
    if (a.recommended.cls === 'aggressive') expect(ex.summary).toMatch(/bluff/);
  });

  it('a losing call is explained by the price, never praised for "value"', () => {
    const s = act(checks(hu('QdJd', 'As4c', 'KhKc9d7s5c'), 5), 'bet', 300);
    const { ex } = grade(s, { type: 'call' });
    expect(ex.summary).toMatch(/price was too high/);
    expect(ex.detail).not.toMatch(/value/);
  });

  it('a zero-equity raise that only ties folding at MDF is not recommended', () => {
    const s = act(checks(hu('QdJd', '6s3d', 'KhKc9d9s5c'), 5), 'bet', 300);
    const a = advise(s);
    expect(a.recommended.cls).toBe('fold');
    expect(a.whyParts.map((p) => p.text).join(' ')).not.toMatch(/bluff/);
  });

  it('calling a flush draw at a good price is always at least "fine", even if the coach prefers a raise', () => {
    for (const bet of [170, 250, 330]) {
      const s = act(act(hu('AsQd', '9h8h', 'Kh7h2c3d4s'), 'check'), 'bet', bet);
      const { a, g } = grade(s, { type: 'call' });
      expect(a.equity!).toBeGreaterThan(a.breakEven!);
      expect(OK, `bet ${bet}: ${g.verdict} (rec ${a.recommended.cls})`).toContain(g.verdict);
    }
  });

  it('"rarely wins at showdown" appears only when it is true', () => {
    // Board trips with an ace kicker: a real showdown hand, and no double bracket in the label.
    const trips = advise(checks(hu('9c8c', 'AhQc', '6h6s6dTc3h'), 4));
    const t = trips.whyParts.map((p) => p.text).join(' ');
    expect(trips.equity!).toBeGreaterThan(0.5);
    expect(t).not.toMatch(/rarely wins/);
    expect(t).not.toMatch(/\) \(/);
    // Ace high on A-high board vs a check: ~50% equity, so no "rarely wins".
    const kq = advise(act(hu('KhQh', '9c4d', 'As7d2c5h8s'), 'check'));
    expect(kq.equity!).toBeGreaterThan(0.3);
    expect(kq.whyParts.map((p) => p.text).join(' ')).not.toMatch(/rarely wins/);
  });

  it('a big draw that raises is a semi-bluff, not "likely best / value"', () => {
    const s = act(act(hu('AsKd', 'JhTh', '9h8h2c4d3s'), 'check'), 'bet', 500);
    const a = advise(s);
    expect(a.recommended.cls).toBe('aggressive');
    const t = a.whyParts.map((p) => p.text).join(' ');
    expect(t).toMatch(/semi-bluff/);
    expect(t).not.toMatch(/likely best/);
    // The reason for the raise comes before the outs detail (the panel shows only the first parts).
    const iBet = a.whyParts.findIndex((p) => p.concept === 'betting');
    const iOuts = a.whyParts.findIndex((p) => p.concept === 'outs');
    expect(iBet).toBeGreaterThanOrEqual(0);
    expect(iBet).toBeLessThan(iOuts);
    // The outs number says what the outs make.
    expect(t).toMatch(/15 outs to a flush or a straight/);
  });

  it('calling with a draw is not told to "charge draws"', () => {
    const s = act(act(hu('AsKd', 'Ah9h', 'Kh7h2c4d3s'), 'check'), 'bet', 250);
    const { a, g, ex } = grade(s, { type: 'call' });
    expect(ex.detail).not.toMatch(/charge draws/);
    if (a.recommended.cls === 'aggressive' && !OK.includes(g.verdict)) expect(ex.detail).toMatch(/fold equity/);
  });

  it('never says "Counting only the 0 clean outs"', () => {
    const s = act(act(hu('AsKd', '9h8h', 'Kh7h2c4d3s'), 'check'), 'bet', 250);
    const t = advise(s).whyParts.map((p) => p.text).join(' ');
    expect(t).not.toMatch(/Counting only the 0/);
    expect(t).toMatch(/9 outs to a flush/);
  });

  it('flush-draw outs do not include pair outs that lose to the top pair', () => {
    let s = hu('AsKd', 'Qh8h', 'Kh9h2c7d3s');
    s = checks(s, 3); s = act(s, 'bet', 400);
    const a = advise(s);
    expect(a.outs!.count).toBe(9);
  });

  it("choosing the coach's own size gets no size complaint", () => {
    const s = act(checks(hu('AsQd', 'Kh8d', 'Kc9d2hJs3c'), 5), 'bet', 2500);
    const { a, ex } = grade(s, { type: 'allin' });
    expect(a.chosen!.sizeIssue).toBeUndefined();
    expect(ex.summary).not.toMatch(/very different from the coach/);
  });

  it('an oversized raise with the right action is a sizing (judgment) error with a note, not a blunder', () => {
    const s = act(checks(hu('AsKd', 'Qs3d', '9h8c7dTsJc'), 5), 'bet', 300);
    const { a, g, ex } = grade(s, { type: 'allin' });
    expect(a.acceptable).toContain('aggressive');
    expect(g.verdict).not.toBe('blunder');
    expect(g.verdict).not.toBe('mistake');
    expect(ex.detail).toMatch(/bigger than needed/);
  });

  it('raising in a math-tier spot is graded as judgment (raise-vs-call depends on the fold model)', () => {
    const s = act(checks(hu('QdJd', '6s3d', 'KhKc9d9s5c'), 5), 'bet', 300);
    const { a, g } = grade(s, { type: 'raise', amount: 900 });
    expect(a.chosen!.tier ?? a.tier).toBe('judgment');
    expect(g.tier).toBe('judgment');
  });

  it('a heads-up river call realises all its equity (no out-of-position discount)', () => {
    const s = act(checks(hu('8c8h', 'Qc9c', 'Kh9s5d2c3h'), 5), 'bet', 900);
    const a = advise(s);
    const call = a.options.find((o) => o.cls === 'passive')!;
    expect(a.equity!).toBeGreaterThan(a.breakEven!);
    expect(call.ev).toBeGreaterThan(0);
    expect(a.recommended.cls).not.toBe('fold');
  });

  it('winnablePot uses the engine call price (BB all-in for less than a full blind)', () => {
    const s = startS(['AsKd', '7c2d'], 'Kh9s5d2c3h', [10000, 60]);
    const legal = legalActions(s)!;
    expect(legal.callAmount).toBe(10);
    expect(winnablePot(s, s.toAct)).toBe(110);
    expect(advise(s).breakEven).toBeCloseTo(10 / 120, 10);
  });
});
