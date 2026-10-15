// Everything the Progress and Home screens need, computed from saved progress. Pure and tested.
import { calibration, conceptStats, leaks, type Leak } from '../engine/learning/analytics';
import { dueCount } from '../engine/learning/srs';
import type { Progress } from '../state/types';
import { dayKey } from '../state/actions';
import { LESSON_BY_ID, MODULES, lessonDone, nextLesson, moduleStates } from './curriculum';
import { availableDrillTypes } from './practice';

export const CONCEPT_LABELS: Record<string, string> = {
  basics: 'How a hand flows', 'hand-rankings': 'Hand rankings', 'best-five': 'Best five of seven', kickers: 'Kickers', ties: 'Ties and split pots', position: 'Position',
  'hand-tiers': 'Starting-hand tiers', 'open-range': 'Opening ranges', 'facing-raise': 'Facing a raise', 'hand-strength': 'Hand strength', 'board-texture': 'Board texture',
  outs: 'Counting outs', 'pot-odds': 'Pot odds', 'pot-odds-draws': 'Pot odds with draws', equity: 'Estimating equity', 'value-betting': 'Value betting', protection: 'Protection',
  bluffing: 'Bluffing', 'bet-sizing': 'Bet sizing', cbet: 'Continuation bets', 'pot-control': 'Pot control', 'check-raise': 'Check-raising', 'player-types': 'Player types',
  exploits: 'Adjusting to opponents', 'implied-odds': 'Implied odds', 'reverse-implied': 'Reverse implied odds', mdf: 'Minimum defence', spr: 'Stack-to-pot ratio',
  'semi-bluff': 'Semi-bluffs', 'thin-value': 'Thin value', river: 'River decisions', variance: 'Variance', bankroll: 'Bankroll', tilt: 'Tilt', 'results-thinking': 'Decisions vs results',
  'push-fold': 'Push or fold', rake: 'Rake',
};

export type MasteryLevel = 'new' | 'learning' | 'shaky' | 'mastered';

export interface ConceptRow {
  concept: string;
  label: string;
  module: number;
  n: number;
  acc: number | null;
  level: MasteryLevel;
}

export function masteryMap(p: Progress): ConceptRow[] {
  const stats = new Map(conceptStats(p.attempts).map((s) => [s.concept, s] as const));
  const rows: ConceptRow[] = [];
  for (const m of MODULES) {
    for (const c of m.concepts) {
      const s = stats.get(c);
      const recent = s ? (s.recentAcc ?? s.acc) : null;
      let level: MasteryLevel = 'new';
      if (s && s.n > 0) {
        if (s.n >= 8 && recent! >= 0.85) level = 'mastered';
        else if (s.n >= 4 && recent! < 0.6) level = 'shaky';
        else level = 'learning';
      }
      rows.push({ concept: c, label: CONCEPT_LABELS[c] ?? c, module: m.id, n: s?.n ?? 0, acc: s ? s.acc : null, level });
    }
  }
  return rows;
}

export const LEVEL_LABEL: Record<MasteryLevel, string> = { new: 'Not started', learning: 'Learning', shaky: 'Needs work', mastered: 'Mastered' };

/** How many spots come due on each of the next days (today includes anything overdue and anything just missed). */
export function forecast(srs: Progress['srs'], now: number, days = 7): { label: string; count: number }[] {
  const out: { label: string; count: number }[] = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let d = 0; d < days; d++) {
    const from = d === 0 ? -Infinity : start.getTime() + d * 86_400_000;
    const to = start.getTime() + (d + 1) * 86_400_000;
    let count = 0;
    for (const i of Object.values(srs)) {
      if (!i.id.startsWith('s:') || (i.reps === 0 && i.lapses === 0)) continue;
      const due = i.reps === 0 && i.lapses > 0 ? now : i.due;
      if (due >= from && due < to) count++;
    }
    out.push({ label: d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : new Date(start.getTime() + d * 86_400_000).toLocaleDateString(undefined, { weekday: 'short' }), count });
  }
  return out;
}

export interface Suggestion {
  title: string;
  text: string;
  to?: string;
}

/** Plain-language "what to work on next". At most three items, most important first. */
export function whatNext(p: Progress, now = Date.now()): Suggestion[] {
  const out: Suggestion[] = [];
  const due = dueCount(p.srs, now);
  if (due > 0) out.push({ title: `Do today's review (${due} ${due === 1 ? 'spot' : 'spots'})`, text: 'Reviewing what you missed is the fastest way to turn mistakes into skill.', to: '/drills' });
  const l: Leak | undefined = leaks(p.attempts)[0];
  if (l) out.push({ title: `Fix your biggest leak: ${l.title}`, text: l.advice, to: `/learn/${l.lessonId}` });
  const next = nextLesson(p);
  if (next) out.push({ title: `Learn next: ${next.title}`, text: next.goal, to: `/learn/${next.id}` });
  else {
    const open = moduleStates(p).find((s) => s.status === 'open');
    if (open) out.push({ title: `Take the Module ${open.id} test`, text: 'You finished the lessons. A mixed test unlocks the next module.', to: `/learn/test/${open.id}` });
  }
  if (p.hands.length < 10 && lessonDone(p, 'm0-l3')) out.push({ title: 'Play 10 hands with the coach on', text: 'Real decisions are graded and show up in your Review tab.', to: '/play' });
  const cal = calibration(p.attempts);
  if (cal.verdict === 'overconfident') out.push({ title: 'Slow down on the ones you are "certain" about', text: cal.message, to: '/drills' });
  if (out.length === 0) out.push({ title: 'Start with Module 0', text: 'A short guided hand teaches the whole flow of poker.', to: '/learn/m0-l1' });
  return out.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Daily session: a guided ~15 minute loop. Never guilt-based: it only ever offers, it never scolds.
// ---------------------------------------------------------------------------

export interface DailyStep {
  id: 'warmup' | 'play' | 'review' | 'learn';
  title: string;
  minutes: number;
  done: boolean;
  detail: string;
  to: string;
}

export const DAILY_HANDS = 5;

export function handsToday(p: Progress, now: number): number {
  const key = dayKey(now);
  return p.hands.filter((h) => dayKey(h.t) === key).length;
}

export function markDaily(p: Progress, step: 'warmup' | 'review', now = Date.now()): Progress {
  const key = dayKey(now);
  const cur = p.daily[key] ?? { warmup: false, play: false, review: false, learn: false };
  if (cur[step]) return p;
  return { ...p, daily: { ...p.daily, [key]: { ...cur, [step]: true } } };
}

export function dailyPlan(p: Progress, now = Date.now()): { steps: DailyStep[]; done: number } {
  const key = dayKey(now);
  const flags = p.daily[key] ?? { warmup: false, play: false, review: false, learn: false };
  const steps: DailyStep[] = [];
  if (availableDrillTypes(p).length > 0) {
    const due = dueCount(p.srs, now);
    steps.push({ id: 'warmup', title: 'Warm up with review', minutes: 3, done: flags.warmup, detail: due > 0 ? `${due} ${due === 1 ? 'spot is' : 'spots are'} due` : 'Nothing is due, so a short mixed round', to: '/drills' });
  }
  if (lessonDone(p, 'm0-l3')) {
    const n = handsToday(p, now);
    steps.push({ id: 'play', title: 'Play a few hands with the coach', minutes: 5, done: n >= DAILY_HANDS, detail: `${Math.min(n, DAILY_HANDS)} of ${DAILY_HANDS} hands`, to: '/play' });
  }
  if (p.hands.some((h) => h.grades && h.grades.length > 0)) {
    const today = p.hands.filter((h) => dayKey(h.t) === key && h.grades && h.grades.length > 0);
    const pool = today.length ? today : p.hands.filter((h) => h.grades && h.grades.length > 0);
    const best = [...pool].sort((a, b) => (b.evLostBB ?? 0) - (a.evLostBB ?? 0))[0]!;
    steps.push({ id: 'review', title: 'Review one hand in depth', minutes: 3, done: flags.review, detail: 'A hand with a lot to learn from', to: `/review/${best.id}` });
  }
  const next = nextLesson(p);
  const learnedToday = Object.values(p.lessons).some((l) => l.done && l.completedAt && dayKey(l.completedAt) === key)
    || Object.values(p.moduleTests).some((t) => t.passed && dayKey(t.t) === key);
  if (next) {
    steps.push({ id: 'learn', title: 'Learn one new idea', minutes: next.minutes, done: learnedToday || flags.learn, detail: next.title, to: `/learn/${next.id}` });
  } else {
    const open = moduleStates(p).find((s) => s.status === 'open' && s.lessonsDone === s.totalLessons);
    if (open) steps.push({ id: 'learn', title: `Take the Module ${open.id} test`, minutes: 5, done: learnedToday || flags.learn, detail: 'A mixed test unlocks the next module', to: `/learn/test/${open.id}` });
    else if (learnedToday) steps.push({ id: 'learn', title: 'Learn one new idea', minutes: 4, done: true, detail: 'Lesson finished', to: '/learn' });
  }
  return { steps, done: steps.filter((s) => s.done).length };
}

export { LESSON_BY_ID };
