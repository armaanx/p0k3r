// Turning raw attempts into feedback the learner can act on: accuracy per concept, calibration, leaks.
import type { Attempt, HandRecord } from '../../state/types';

export interface ConceptStat {
  concept: string;
  n: number;
  correct: number;
  acc: number;
  /** Accuracy over the last 10 attempts (null if fewer than 4). */
  recentAcc: number | null;
  evLostBB: number;
  last: number;
}

/** Canonical concept names: in-hand coach concepts fold into the curriculum concepts they practise. */
const ALIAS: Record<string, string> = {
  'facing-3bet': 'facing-raise', 'pot-odds-draws': 'pot-odds-draws', betting: 'betting', 'check-back': 'check-back', 'short-stack': 'open-range',
};
export const canon = (c: string): string => ALIAS[c] ?? c;

export function conceptStats(attempts: readonly Attempt[]): ConceptStat[] {
  const map = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const k = canon(a.concept);
    const l = map.get(k) ?? [];
    l.push(a);
    map.set(k, l);
  }
  const out: ConceptStat[] = [];
  for (const [concept, list] of map) {
    const correct = list.filter((a) => a.correct).length;
    const recent = list.slice(-10);
    out.push({
      concept, n: list.length, correct, acc: correct / list.length,
      recentAcc: recent.length >= 4 ? recent.filter((a) => a.correct).length / recent.length : null,
      evLostBB: list.reduce((s, a) => s + (a.evLostBB ?? 0), 0),
      last: list[list.length - 1]!.t,
    });
  }
  return out.sort((a, b) => a.concept.localeCompare(b.concept));
}

// ---------------------------------------------------------------------------
// Calibration (metacognition): does confidence match accuracy?
// ---------------------------------------------------------------------------

export const NOMINAL: Record<1 | 2 | 3, number> = { 1: 0.5, 2: 0.75, 3: 0.95 };
export const CONFIDENCE_NAMES: Record<1 | 2 | 3, string> = { 1: 'Guessing', 2: 'Fairly sure', 3: 'Certain' };

export interface CalibrationBucket {
  confidence: 1 | 2 | 3;
  n: number;
  acc: number | null;
  nominal: number;
}

export interface Calibration {
  buckets: CalibrationBucket[];
  total: number;
  /** Times the learner was "Certain" and wrong: the most valuable mistakes to study. */
  confidentWrong: number;
  verdict: 'unknown' | 'overconfident' | 'underconfident' | 'uninformative' | 'well-calibrated';
  message: string;
}

export function calibration(attempts: readonly Attempt[], scope?: (a: Attempt) => boolean): Calibration {
  const rated = attempts.filter((a) => a.confidence !== undefined && (!scope || scope(a)));
  const buckets: CalibrationBucket[] = ([1, 2, 3] as const).map((c) => {
    const l = rated.filter((a) => a.confidence === c);
    return { confidence: c, n: l.length, acc: l.length >= 3 ? l.filter((a) => a.correct).length / l.length : null, nominal: NOMINAL[c] };
  });
  const confidentWrong = rated.filter((a) => a.confidence === 3 && !a.correct).length;
  if (rated.length < 10) return { buckets, total: rated.length, confidentWrong, verdict: 'unknown', message: 'Rate how sure you are on about 10 questions to see how well your confidence matches reality.' };
  // Weighted gap between what you claimed and what happened.
  let gap = 0;
  let w = 0;
  for (const b of buckets) {
    if (b.acc === null) continue;
    gap += (b.nominal - b.acc) * b.n;
    w += b.n;
  }
  const avg = w ? gap / w : 0;
  const [guess, sure, certain] = buckets as [CalibrationBucket, CalibrationBucket, CalibrationBucket];
  let verdict: Calibration['verdict'] = 'well-calibrated';
  let message = 'Your confidence matches your results well. That is a real skill: it tells you when to trust your read.';
  // "Certain" is where overconfidence hurts most, so it is judged on its own as well as on the average.
  if (avg > 0.08 || (certain.acc !== null && certain.n >= 5 && certain.acc < 0.8)) {
    verdict = 'overconfident';
    message = `You tend to be overconfident${certain.acc !== null ? `: when you say "Certain" you are right ${Math.round(certain.acc * 100)}% of the time` : ''}. Confident-and-wrong answers are the most valuable ones to study.`;
  } else if (avg < -0.1) {
    verdict = 'underconfident';
    message = 'You tend to be underconfident: you are right more often than you expect. Trust your reads a little more.';
  } else if (guess.acc !== null && sure.acc !== null && certain.acc !== null && guess.n >= 5 && certain.n >= 5 && certain.acc < guess.acc - 0.05) {
    verdict = 'uninformative';
    message = 'Your confidence is not yet predicting your accuracy: you are no more right when you feel sure than when you guess. Try to notice what actually makes you sure.';
  }
  return { buckets, total: rated.length, confidentWrong, verdict, message };
}

// ---------------------------------------------------------------------------
// Leaks
// ---------------------------------------------------------------------------

export interface LeakInfo {
  title: string;
  /** What to do about it. */
  advice: string;
  lessonId: string;
}

export const LEAKS: Record<string, LeakInfo> = {
  'pot-odds': { title: 'calling or folding at the wrong price', advice: 'Before every call, work out the chance you need, then compare it with your real chance.', lessonId: 'm5-l3' },
  'pot-odds-draws': { title: 'calling draws without the right price', advice: 'Count your outs, use the Rule of 2 and 4, and compare with the pot odds before calling with a draw.', lessonId: 'm5-l2' },
  outs: { title: 'miscounting your outs', advice: 'Count only the cards you cannot see, and leave out cards that could help an opponent more.', lessonId: 'm5-l1' },
  equity: { title: 'misjudging how often your hand wins', advice: 'Memorise the benchmark matchups: pair vs overcards, dominated hands, flush draws.', lessonId: 'm5-l4' },
  'open-range': { title: 'opening the wrong hands from some seats', advice: 'Early seats are tight, late seats are wide. Check the chart for your seat before you raise.', lessonId: 'm3-l2' },
  'facing-raise': { title: 'defending incorrectly against raises', advice: 'Against a raise most seats need a stronger hand than they would open with (the big blind, with chips already in, can defend wider). Check the chart, and re-raise your best hands.', lessonId: 'm3-l4' },
  'hand-tiers': { title: 'misjudging starting-hand strength', advice: 'Place every hand in a tier before you decide.', lessonId: 'm3-l1' },
  'hand-rankings': { title: 'misreading hands', advice: 'Scan from the top of the ladder down: straight flush, quads, full house...', lessonId: 'm1-l1' },
  kickers: { title: 'kicker and tie mistakes', advice: 'When hands are the same type, compare the cards inside the hand in order.', lessonId: 'm1-l3' },
  ties: { title: 'kicker and tie mistakes', advice: 'If nobody can beat the five board cards with their hole cards (everyone "plays the board"), the pot is split.', lessonId: 'm1-l3' },
  'best-five': { title: 'picking the wrong five cards', advice: 'Look for the strongest pattern among all seven cards first.', lessonId: 'm1-l2' },
  position: { title: 'ignoring position', advice: 'Acting last is an advantage: play more hands from late seats and fewer from early ones.', lessonId: 'm2-l2' },
  'hand-strength': { title: 'misreading how your hand connects with the board', advice: 'Ask first: made hand, draw, or nothing?', lessonId: 'm4-l1' },
  'board-texture': { title: 'misreading board texture', advice: 'Dry boards keep made hands strong; wet boards punish one pair.', lessonId: 'm4-l2' },
  betting: { title: 'betting or checking without a clear reason', advice: 'Name the reason for every bet: value, protection or bluff.', lessonId: 'm6-l1' },
  'bet-sizing': { title: 'choosing bet sizes that do not fit the board', advice: 'Small on dry boards, bigger on wet boards.', lessonId: 'm6-l2' },
  'check-back': { title: 'missing bets, or growing the pot with medium hands', advice: 'Bet your strong hands; keep the pot small with medium ones.', lessonId: 'm6-l4' },
  'player-types': { title: 'misreading opponents', advice: 'Look at how many hands they play (VPIP) and how often they raise (PFR).', lessonId: 'm7-l2' },
  mdf: { title: 'folding too much against bets', advice: 'Continue (call or raise) with at least pot before the bet ÷ (pot before the bet + bet) of your hands.', lessonId: 'm8-l2' },
  spr: { title: 'misjudging how committed you are', advice: 'Compare stacks with the pot before you choose how to play.', lessonId: 'm8-l3' },
};

export interface Leak {
  concept: string;
  title: string;
  advice: string;
  lessonId: string;
  /** Higher = bigger problem. */
  score: number;
  evLostBB: number;
  errors: number;
  n: number;
}

/** Rank the learner's weaknesses. Real-hand EV loss counts most; drill errors count too. */
export function leaks(attempts: readonly Attempt[], minAttempts = 4): Leak[] {
  const out: Leak[] = [];
  for (const s of conceptStats(attempts)) {
    const info = LEAKS[s.concept];
    if (!info || s.n < minAttempts) continue;
    const errors = s.n - s.correct;
    const acc = s.recentAcc ?? s.acc;
    if (errors < 2 || acc >= 0.9) continue;
    const score = s.evLostBB + errors * 0.4 * (1 - acc) * 2;
    out.push({ concept: s.concept, ...info, score, evLostBB: s.evLostBB, errors, n: s.n });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Real-hand metrics
// ---------------------------------------------------------------------------

/** Average EV lost per 100 hands (in big blinds), from graded decisions. */
export function evLostPer100(hands: readonly HandRecord[]): number | null {
  const graded = hands.filter((h) => h.grades && h.grades.length > 0);
  if (graded.length < 5) return null;
  return (100 * graded.reduce((s, h) => s + (h.evLostBB ?? 0), 0)) / graded.length;
}

/** Rolling share of decisions graded Mistake or Blunder, one point per window of hands. */
export function mistakeTrend(hands: readonly HandRecord[], window = 20): { upTo: number; rate: number }[] {
  const out: { upTo: number; rate: number }[] = [];
  const graded = hands.filter((h) => h.grades && h.grades.length > 0);
  for (let i = window; i <= graded.length; i += Math.max(1, Math.floor(window / 2))) {
    const slice = graded.slice(i - window, i);
    const decisions = slice.flatMap((h) => h.grades!);
    const bad = decisions.filter((g) => g.verdict === 'mistake' || g.verdict === 'blunder').length;
    out.push({ upTo: i, rate: decisions.length ? bad / decisions.length : 0 });
  }
  return out;
}

export interface LuckRow {
  id: string;
  decision: 'good' | 'poor';
  result: 'won' | 'lost';
  net: number;
  evLostBB: number;
}

/** Sort hands into the four quadrants of "decision quality vs result". */
export function decisionVsResult(hands: readonly HandRecord[]): { goodWon: number; goodLost: number; poorWon: number; poorLost: number; rows: LuckRow[] } {
  const rows: LuckRow[] = [];
  for (const h of hands) {
    if (!h.grades || h.grades.length === 0 || Math.abs(h.net) < h.bb) continue; // ignore walks and tiny pots
    const bad = h.grades.some((g) => g.verdict === 'mistake' || g.verdict === 'blunder');
    rows.push({ id: h.id, decision: bad ? 'poor' : 'good', result: h.net > 0 ? 'won' : 'lost', net: h.net / h.bb, evLostBB: h.evLostBB ?? 0 });
  }
  const c = (d: 'good' | 'poor', r: 'won' | 'lost'): number => rows.filter((x) => x.decision === d && x.result === r).length;
  return { goodWon: c('good', 'won'), goodLost: c('good', 'lost'), poorWon: c('poor', 'won'), poorLost: c('poor', 'lost'), rows };
}
