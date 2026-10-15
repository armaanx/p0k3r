// Building practice sessions: mixed (interleaved, weighted to weak areas) and the daily review queue.
import { ALL_DRILL_TYPES, generateDrill } from '../engine/learning/drills';
import type { DrillType } from '../engine/learning/types';
import { canon, conceptStats } from '../engine/learning/analytics';
import { dueItems } from '../engine/learning/srs';
import type { Rng } from '../engine/rng';
import type { Progress } from '../state/types';
import { LESSON_BY_ID, lessonDone, staticItemsOf } from './curriculum';
import type { SeqItem } from './moduleTest';

/** A drill type unlocks when the lesson that teaches it is done. */
export const DRILL_UNLOCK: Record<DrillType, string> = {
  'hand-category': 'm1-l1', 'best-five': 'm1-l2', 'rank-winner': 'm1-l3', 'position-name': 'm2-l1', 'tier-place': 'm3-l1', 'open-fold': 'm3-l2',
  'facing-raise': 'm3-l4', 'made-draw-air': 'm4-l1', 'board-texture': 'm4-l2', outs: 'm5-l1', 'pot-odds': 'm5-l3', 'equity-guess': 'm5-l4',
  'bet-size': 'm6-l2', 'player-type': 'm7-l1', mdf: 'm8-l2', spr: 'm8-l3',
};

export const TYPE_CONCEPT: Record<DrillType, string> = {
  'hand-category': 'hand-rankings', 'rank-winner': 'hand-rankings', 'best-five': 'best-five', 'position-name': 'position', 'tier-place': 'hand-tiers',
  'open-fold': 'open-range', 'facing-raise': 'facing-raise', 'made-draw-air': 'hand-strength', 'board-texture': 'board-texture', outs: 'outs',
  'pot-odds': 'pot-odds', 'equity-guess': 'equity', 'bet-size': 'bet-sizing', 'player-type': 'player-types', mdf: 'mdf', spr: 'spr',
};

const SPOT_PREFIX: [string, DrillType][] = [
  ['rank:', 'hand-category'], ['winner:', 'rank-winner'], ['best5:', 'best-five'], ['seat:', 'position-name'], ['tier:', 'tier-place'], ['open:', 'open-fold'],
  ['vs:', 'facing-raise'], ['mda:', 'made-draw-air'], ['tex:', 'board-texture'], ['outs:', 'outs'], ['odds:', 'pot-odds'], ['equity:', 'equity-guess'],
  ['size:', 'bet-size'], ['ptype:', 'player-type'], ['mdf:', 'mdf'], ['spr:', 'spr'],
];

export const availableDrillTypes = (p: Progress): DrillType[] => ALL_DRILL_TYPES.filter((t) => lessonDone(p, DRILL_UNLOCK[t]));

export function accuracyOf(p: Progress, concept: string, window = 12): { acc: number | null; n: number } {
  const rel = p.attempts.filter((a) => canon(a.concept) === concept).slice(-window);
  if (rel.length === 0) return { acc: null, n: 0 };
  return { acc: rel.filter((a) => a.correct).length / rel.length, n: rel.length };
}

/** Desirable difficulty: keep the challenge just above current ability. */
export function difficultyFor(p: Progress, type: DrillType): 1 | 2 | 3 {
  const { acc, n } = accuracyOf(p, TYPE_CONCEPT[type]);
  if (acc === null || n < 4) return 1;
  if (acc >= 0.9 && n >= 6) return 3;
  if (acc >= 0.7) return 2;
  return 1;
}

export function typeWeights(p: Progress, now: number, types: DrillType[]): Map<DrillType, number> {
  const due = new Set(dueItems(p.srs, now, 'c').map((i) => i.id.slice(2)));
  const w = new Map<DrillType, number>();
  for (const t of types) {
    const { acc, n } = accuracyOf(p, TYPE_CONCEPT[t]);
    let x = n < 3 ? 1.6 : 1 + 2.5 * (1 - (acc ?? 0.5));
    if (due.has(TYPE_CONCEPT[t])) x += 1.2;
    w.set(t, x);
  }
  return w;
}

/**
 * A mixed session: random order (interleaved), biased toward weak and due areas, never the same type twice in a row
 * when there is a choice, with difficulty matched to the learner.
 */
export function buildMixedSession(p: Progress, n: number, rng: Rng, now = Date.now(), only?: DrillType[]): SeqItem[] {
  const types = (only ?? availableDrillTypes(p)).filter((t) => availableDrillTypes(p).includes(t));
  if (types.length === 0) return [];
  const weights = typeWeights(p, now, types);
  const items: SeqItem[] = [];
  let prev: DrillType | null = null;
  for (let i = 0; i < n; i++) {
    const pool = types.length > 1 ? types.filter((t) => t !== prev) : types;
    const total = pool.reduce((a, t) => a + weights.get(t)!, 0);
    let x = rng.next() * total;
    let pick = pool[pool.length - 1]!;
    for (const t of pool) {
      x -= weights.get(t)!;
      if (x <= 0) { pick = t; break; }
    }
    prev = pick;
    items.push({ kind: 'drill', item: generateDrill(pick, rng, difficultyFor(p, pick)) });
  }
  return items;
}

/** Recreate a question for a specific spot (so review re-tests exactly what was missed). */
export function generateForSpot(spot: string, rng: Rng): SeqItem | null {
  const ask = /^ask:([^:]+):(\d+)$/.exec(spot);
  if (ask) {
    const st = LESSON_BY_ID.get(ask[1]!)?.steps[Number(ask[2])];
    return st && st.kind === 'ask' ? { kind: 'quiz', q: st, spot } : null;
  }
  const test = /^test:m(\d+):(\d+)$/.exec(spot);
  if (test) {
    const q = staticItemsOf(Number(test[1]))[Number(test[2])];
    return q ? { kind: 'quiz', q, spot } : null;
  }
  const quiz = /^quiz:([^:]+):(\d+)$/.exec(spot);
  if (quiz) {
    const st = LESSON_BY_ID.get(quiz[1]!)?.steps.find((s) => s.kind === 'quiz');
    const q = st && st.kind === 'quiz' ? st.items[Number(quiz[2])] : undefined;
    return q ? { kind: 'quiz', q, spot } : null;
  }
  const match = SPOT_PREFIX.find(([pre]) => spot.startsWith(pre));
  if (!match) return null;
  for (let i = 0; i < 80; i++) {
    const it = generateDrill(match[1], rng, (1 + rng.int(3)) as 1 | 2 | 3);
    if (it.spot === spot) return { kind: 'drill', item: it };
  }
  return null;
}

export const conceptTypes = (concept: string): DrillType[] => ALL_DRILL_TYPES.filter((t) => TYPE_CONCEPT[t] === concept);

/**
 * Today's review: items that are due, most overdue first. Missed items come first (they are due within minutes).
 * Falls back to a concept-level question when the exact spot cannot be recreated (e.g. it came from a real hand).
 */
export function buildReview(p: Progress, n: number, rng: Rng, now = Date.now()): { items: SeqItem[]; due: number } {
  const dueSpots = dueItems(p.srs, now, 's');
  const dueConcepts = dueItems(p.srs, now, 'c');
  const items: SeqItem[] = [];
  const usedSpots = new Set<string>();
  for (const d of dueSpots) {
    if (items.length >= n) break;
    const spot = d.id.slice(2);
    const it = generateForSpot(spot, rng);
    if (it) { items.push(it); usedSpots.add(spot); }
  }
  const avail = new Set(availableDrillTypes(p));
  for (const d of dueConcepts) {
    if (items.length >= n) break;
    const types = conceptTypes(d.id.slice(2)).filter((t) => avail.has(t));
    if (types.length === 0) continue;
    const t = rng.pick(types);
    items.push({ kind: 'drill', item: generateDrill(t, rng, difficultyFor(p, t)) });
  }
  return { items: rng.shuffle(items), due: dueSpots.length };
}

/** Per drill type: how the learner is doing (for the picker). */
export function typeStats(p: Progress): Map<DrillType, { acc: number | null; n: number }> {
  const stats = conceptStats(p.attempts);
  const m = new Map<DrillType, { acc: number | null; n: number }>();
  for (const t of ALL_DRILL_TYPES) {
    const s = stats.find((x) => x.concept === TYPE_CONCEPT[t]);
    m.set(t, { acc: s ? s.acc : null, n: s ? s.n : 0 });
  }
  return m;
}
