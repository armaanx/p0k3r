import { ALL_DRILL_TYPES, DRILL_MODULE, drillTypesForModule, generateDrill } from '../engine/learning/drills';
import type { DrillItem, DrillType } from '../engine/learning/types';
import type { Rng } from '../engine/rng';
import { staticItemsOf, TEST_LENGTH } from './curriculum';
import type { QuizItem } from './types';

export type SeqItem =
  | { kind: 'drill'; item: DrillItem }
  | { kind: 'quiz'; q: QuizItem; spot: string };

export const passMark = (n: number): number => Math.ceil(n * 0.85);

/**
 * An interleaved module test: questions from this module mixed, in random order, with
 * questions from earlier modules, so you practise choosing the right tool and not just the latest one.
 * `weight(type)` lets the caller bias earlier-module questions toward the learner's weak spots.
 */
export function buildModuleTest(moduleId: number, rng: Rng, weight: (t: DrillType) => number = () => 1): SeqItem[] {
  const own = drillTypesForModule(moduleId);
  const earlier = ALL_DRILL_TYPES.filter((t) => DRILL_MODULE[t] < moduleId);
  const staticPool = staticItemsOf(moduleId);
  const statics = rng.shuffle([...staticPool]);
  const items: SeqItem[] = [];
  const pickWeighted = (types: DrillType[]): DrillType => {
    const total = types.reduce((a, t) => a + weight(t), 0);
    let x = rng.next() * total;
    for (const t of types) {
      x -= weight(t);
      if (x <= 0) return t;
    }
    return types[types.length - 1]!;
  };
  const nOwnDrills = own.length ? Math.min(10, TEST_LENGTH - Math.min(4, statics.length)) : 0;
  for (let i = 0; i < nOwnDrills; i++) {
    const t = own[i % own.length]!;
    items.push({ kind: 'drill', item: generateDrill(t, rng, i % 4 === 3 ? 3 : 2) });
  }
  const nStatic = Math.min(statics.length, own.length ? 4 : 12);
  statics.slice(0, nStatic).forEach((q) => items.push({ kind: 'quiz', q, spot: `test:m${moduleId}:${staticPool.indexOf(q)}` }));
  const want = TEST_LENGTH;
  while (items.length < want && earlier.length) {
    items.push({ kind: 'drill', item: generateDrill(pickWeighted(earlier), rng, 2) });
    if (items.length >= want) break;
  }
  return rng.shuffle(items);
}
