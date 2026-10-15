import type { Progress } from '../state/types';
import { LESSONS_A } from './lessons-a';
import { LESSONS_B } from './lessons-b';
import { LESSONS_C } from './lessons-c';
import type { Lesson, ModuleDef, QuizItem, Step } from './types';

export const LESSONS: Lesson[] = [...LESSONS_A, ...LESSONS_B, ...LESSONS_C];
export const LESSON_BY_ID: ReadonlyMap<string, Lesson> = new Map(LESSONS.map((l) => [l.id, l]));

export const MODULES: ModuleDef[] = [
  { id: 0, title: 'How a hand flows', blurb: 'Blinds, the four betting rounds, the six actions, and a showdown. Play one guided hand.', lessons: ['m0-l1', 'm0-l2', 'm0-l3'], concepts: ['basics'], unlocks: ['basics'] },
  { id: 1, title: 'Hand rankings', blurb: 'Know the nine hands cold, including kickers, ties and when the board plays.', lessons: ['m1-l1', 'm1-l2', 'm1-l3'], concepts: ['hand-rankings', 'best-five', 'kickers', 'ties'], unlocks: [] },
  { id: 2, title: 'Position', blurb: 'The button, the seat names, and why acting last is powerful.', lessons: ['m2-l1', 'm2-l2'], concepts: ['position'], unlocks: ['position'] },
  { id: 3, title: 'Preflop: which hands to play', blurb: 'Tiers of hands, opening ranges by seat, and what to do facing a raise. Folding is the main skill.', lessons: ['m3-l1', 'm3-l2', 'm3-l3', 'm3-l4'], concepts: ['hand-tiers', 'open-range', 'facing-raise'], unlocks: ['preflop-chart'] },
  { id: 4, title: 'Reading the flop', blurb: 'Made hands, draws and air. Dry versus wet boards. How strong is my hand?', lessons: ['m4-l1', 'm4-l2', 'm4-l3'], concepts: ['hand-strength', 'board-texture'], unlocks: ['hand-strength'] },
  { id: 5, title: 'Outs, equity and pot odds', blurb: 'Count outs, use the Rule of 2 and 4, and decide whether you have the right price.', lessons: ['m5-l1', 'm5-l2', 'm5-l3', 'm5-l4'], concepts: ['outs', 'pot-odds', 'equity'], unlocks: ['outs', 'pot-odds', 'equity'] },
  { id: 6, title: 'Betting', blurb: 'Why we bet, how big, continuation bets, pot control and the check-raise.', lessons: ['m6-l1', 'm6-l2', 'm6-l3', 'm6-l4'], concepts: ['value-betting', 'protection', 'bluffing', 'bet-sizing', 'cbet', 'pot-control', 'check-raise'], unlocks: ['betting'] },
  { id: 7, title: 'Opponents', blurb: 'Four kinds of players, the two statistics that reveal them, and how to adjust.', lessons: ['m7-l1', 'm7-l2', 'm7-l3'], concepts: ['player-types', 'exploits'], unlocks: ['opponents'] },
  { id: 8, title: 'Intermediate ideas', blurb: 'Implied odds, minimum defence, stack-to-pot ratio, semi-bluffs and river decisions.', lessons: ['m8-l1', 'm8-l2', 'm8-l3', 'm8-l4'], concepts: ['implied-odds', 'reverse-implied', 'mdf', 'spr', 'semi-bluff', 'thin-value', 'river'], unlocks: [] },
  { id: 9, title: 'The mental game', blurb: 'Variance, tilt, bankroll, and judging decisions instead of results.', lessons: ['m9-l1', 'm9-l2', 'm9-l3'], concepts: ['variance', 'bankroll', 'tilt', 'results-thinking'], unlocks: [] },
];

export const MODULE_BY_ID: ReadonlyMap<number, ModuleDef> = new Map(MODULES.map((m) => [m.id, m]));

/** Concepts recorded by the coach during real hands map onto curriculum concepts. */
const ALIAS: Record<string, string> = {
  'facing-3bet': 'facing-raise', 'pot-odds-draws': 'pot-odds', betting: 'value-betting', 'check-back': 'pot-control', 'short-stack': 'open-range',
};
export const canonicalConcept = (c: string): string => ALIAS[c] ?? c;

export function moduleOfConcept(c: string): number | null {
  const cc = canonicalConcept(c);
  return MODULES.find((m) => m.concepts.includes(cc))?.id ?? null;
}

/** Static questions from a module's lessons (used for module tests and review). */
export function staticItemsOf(moduleId: number): QuizItem[] {
  const out: QuizItem[] = [];
  for (const id of MODULE_BY_ID.get(moduleId)?.lessons ?? []) {
    for (const st of LESSON_BY_ID.get(id)?.steps ?? ([] as Step[])) {
      if (st.kind === 'quiz') out.push(...st.items);
      else if (st.kind === 'ask') out.push(st);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Progress queries
// ---------------------------------------------------------------------------

export const lessonDone = (p: Progress, id: string): boolean => {
  if (p.lessons[id]?.done) return true;
  const l = LESSON_BY_ID.get(id);
  return !!l && p.skippedModules.includes(String(l.module));
};

export interface ModuleState {
  id: number;
  status: 'locked' | 'open' | 'mastered';
  lessonsDone: number;
  totalLessons: number;
  /** Rolling accuracy over the last 20 attempts on this module's concepts (null if fewer than 5). */
  accuracy: number | null;
  attempts: number;
  testPassed: boolean;
  skipped: boolean;
}

export const MASTERY_THRESHOLD = 0.85;
export const TEST_LENGTH = 20;

export function moduleAccuracy(p: Progress, moduleId: number): { acc: number | null; n: number } {
  const concepts = new Set(MODULE_BY_ID.get(moduleId)?.concepts ?? []);
  const rel = p.attempts.filter((a) => concepts.has(canonicalConcept(a.concept))).slice(-20);
  if (rel.length < 5) return { acc: null, n: rel.length };
  return { acc: rel.filter((a) => a.correct).length / rel.length, n: rel.length };
}

export function moduleStates(p: Progress): ModuleState[] {
  const states: ModuleState[] = [];
  let prevMastered = true;
  for (const m of MODULES) {
    const skipped = p.skippedModules.includes(String(m.id));
    const done = m.lessons.filter((id) => lessonDone(p, id)).length;
    const test = p.moduleTests[String(m.id)];
    const mastered = skipped || (done === m.lessons.length && !!test?.passed);
    const open = m.id === 0 || prevMastered || skipped;
    const { acc, n } = moduleAccuracy(p, m.id);
    states.push({
      id: m.id, status: mastered ? 'mastered' : open ? 'open' : 'locked', lessonsDone: done, totalLessons: m.lessons.length,
      accuracy: acc, attempts: n, testPassed: !!test?.passed, skipped,
    });
    prevMastered = mastered;
  }
  return states;
}

/** The lesson the learner should do next (first incomplete lesson in the first non-mastered open module). */
export function nextLesson(p: Progress): Lesson | null {
  for (const s of moduleStates(p)) {
    if (s.status === 'locked') return null;
    if (s.status === 'mastered') continue;
    const id = MODULE_BY_ID.get(s.id)!.lessons.find((l) => !lessonDone(p, l));
    if (id) return LESSON_BY_ID.get(id)!;
    return null; // all lessons done: the module test is next
  }
  return null;
}

export function highestUnlockedModule(p: Progress): number {
  const st = moduleStates(p);
  let h = 0;
  for (const s of st) if (s.status !== 'locked') h = s.id;
  return h;
}

/** Which overlays and explanation concepts the learner has been taught. */
export function taughtConcepts(p: Progress): Set<string> {
  const set = new Set<string>(['basics']);
  const d = (id: string): boolean => lessonDone(p, id);
  if (d('m1-l1')) set.add('hand-name');
  if (d('m2-l1')) set.add('position');
  if (d('m3-l2')) set.add('preflop-chart');
  if (d('m4-l1')) set.add('hand-strength');
  if (d('m5-l1')) set.add('outs');
  if (d('m5-l3')) set.add('pot-odds');
  if (d('m5-l4')) set.add('equity');
  if (d('m6-l1')) set.add('betting');
  if (d('m7-l2')) { set.add('opponents'); set.add('hud'); }
  return set;
}
