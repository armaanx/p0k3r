import { describe, expect, it } from 'vitest';
import { ALL_DRILL_TYPES, DRILL_MODULE, generateDrill } from '../engine/learning/drills';
import { recordSrs } from '../engine/learning/srs';
import { createRng } from '../engine/rng';
import { freshProgress, type Attempt, type Progress } from '../state/types';
import { LESSONS } from './curriculum';
import { availableDrillTypes, buildMixedSession, buildReview, difficultyFor, generateForSpot, TYPE_CONCEPT } from './practice';

const allLessonsDone = (): Progress => {
  const p = freshProgress();
  for (const l of LESSONS) p.lessons[l.id] = { done: true, step: 0 };
  return p;
};
const att = (concept: string, correct: boolean, t = 1_000, spot = concept): Attempt => ({ t, concept, spot, kind: 'x', correct });

describe('availability', () => {
  it('a drill type unlocks only when its lesson is done', () => {
    const p = freshProgress();
    expect(availableDrillTypes(p)).toEqual([]);
    p.lessons['m1-l1'] = { done: true, step: 0 };
    expect(availableDrillTypes(p)).toEqual(['hand-category']);
    expect(availableDrillTypes(allLessonsDone()).length).toBe(ALL_DRILL_TYPES.length);
  });
});

describe('mixed sessions (interleaving + deliberate practice)', () => {
  it('mix many drill types in random order, never the same type twice in a row', () => {
    const p = allLessonsDone();
    const items = buildMixedSession(p, 120, createRng(1), 0);
    const types = items.map((i) => (i.kind === 'drill' ? i.item.type : 'quiz'));
    for (let i = 1; i < types.length; i++) expect(types[i]).not.toBe(types[i - 1]);
    expect(new Set(types).size).toBeGreaterThanOrEqual(10);
    const modules = new Set(items.map((i) => (i.kind === 'drill' ? i.item.module : -1)));
    expect(modules.size).toBeGreaterThanOrEqual(6);
  });

  it('weights toward weak areas: a weak concept appears far more than a mastered one', () => {
    const p = allLessonsDone();
    for (let i = 0; i < 30; i++) p.attempts.push(att('pot-odds', i % 5 === 0), att('outs', true));
    const items = buildMixedSession(p, 600, createRng(2), 0);
    const count = (t: string): number => items.filter((i) => i.kind === 'drill' && i.item.type === t).length;
    expect(count('pot-odds')).toBeGreaterThan(count('outs') * 1.5);
  });

  it('matches difficulty to ability (desirable difficulty)', () => {
    const p = allLessonsDone();
    expect(difficultyFor(p, 'pot-odds')).toBe(1); // unseen
    for (let i = 0; i < 12; i++) p.attempts.push(att(TYPE_CONCEPT['pot-odds'], true));
    expect(difficultyFor(p, 'pot-odds')).toBe(3);
    const q = allLessonsDone();
    for (let i = 0; i < 12; i++) q.attempts.push(att(TYPE_CONCEPT['pot-odds'], i % 4 !== 0));
    expect(difficultyFor(q, 'pot-odds')).toBe(2);
    const r = allLessonsDone();
    for (let i = 0; i < 12; i++) r.attempts.push(att(TYPE_CONCEPT['pot-odds'], i % 3 === 0));
    expect(difficultyFor(r, 'pot-odds')).toBe(1);
  });

  it('respects a single-type focus and returns nothing when nothing is unlocked', () => {
    expect(buildMixedSession(freshProgress(), 10, createRng(3))).toEqual([]);
    const items = buildMixedSession(allLessonsDone(), 10, createRng(3), 0, ['outs']);
    expect(items.every((i) => i.kind === 'drill' && i.item.type === 'outs')).toBe(true);
  });
});

describe('recreating a missed spot', () => {
  it('regenerates the same spot for every drill type', () => {
    const rng = createRng(5);
    let ok = 0;
    let total = 0;
    for (const t of ALL_DRILL_TYPES) {
      for (let k = 0; k < 6; k++) {
        const it = generateDrill(t, rng, (1 + (k % 3)) as 1 | 2 | 3);
        const again = generateForSpot(it.spot, createRng(100 + k));
        total++;
        if (again && again.kind === 'drill' && again.item.spot === it.spot) ok++;
      }
    }
    expect(ok / total).toBeGreaterThan(0.9);
  });

  it('recreates static lesson questions from their spot ids', () => {
    expect(generateForSpot('ask:m0-l1:1', createRng(1))).toMatchObject({ kind: 'quiz' });
    expect(generateForSpot('quiz:m0-l1:0', createRng(1))).toMatchObject({ kind: 'quiz' });
    expect(generateForSpot('test:m0:0', createRng(1))).toMatchObject({ kind: 'quiz' });
    expect(generateForSpot('nonsense', createRng(1))).toBeNull();
  });
});

describe("today's review", () => {
  it('surfaces missed spots first, then nothing until something is due', () => {
    const p = allLessonsDone();
    const t0 = 1_000_000;
    p.srs = recordSrs(p.srs, { ...att('open-range', true, t0, 'open:UTG'), kind: 'open-fold' });
    p.srs = recordSrs(p.srs, { ...att('pot-odds', false, t0, 'odds:draw'), kind: 'pot-odds' });
    const soon = buildReview(p, 10, createRng(1), t0 + 30 * 60_000);
    expect(soon.due).toBe(1); // only the miss is due half an hour later
    expect(soon.items.length).toBeGreaterThanOrEqual(1);
    const first = soon.items[0]!;
    expect(first.kind === 'drill' && first.item.concept).toBe('pot-odds');
    const justAfter = buildReview(p, 10, createRng(1), t0 + 60_000);
    expect(justAfter.due).toBe(1); // a miss is available for re-learning straight away
    const later = buildReview(p, 10, createRng(1), t0 + 2 * 86_400_000);
    expect(later.due).toBe(2);
  });
});

describe('module mapping', () => {
  it('every drill type has a module and concept mapping', () => {
    for (const t of ALL_DRILL_TYPES) {
      expect(TYPE_CONCEPT[t]).toBeTruthy();
      expect(DRILL_MODULE[t]).toBeGreaterThan(0);
    }
  });
});
