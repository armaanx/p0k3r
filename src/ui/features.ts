import { taughtConcepts } from '../content/curriculum';
import type { Progress } from '../state/types';

/**
 * Progressive disclosure: the table only shows what the learner has been taught.
 * Module completion unlocks overlays (wired to the curriculum in the lessons milestone).
 */
export interface Features {
  showPositions: boolean;
  showHandName: boolean;
  showPotOdds: boolean;
  showEquity: boolean;
  showHud: boolean;
  /** Concepts the learner has met; coach explanations only mention these. */
  concepts: ReadonlySet<string>;
}

export const ALL_CONCEPTS: readonly string[] = ['basics', 'hand-strength', 'preflop-chart', 'position', 'pot-odds', 'outs', 'equity', 'betting', 'opponents'];

export const ALL_FEATURES: Features = {
  showPositions: true, showHandName: true, showPotOdds: true, showEquity: true, showHud: true, concepts: new Set(ALL_CONCEPTS),
};

export function featuresFor(progress: Progress): Features {
  const c = taughtConcepts(progress);
  return {
    showPositions: c.has('position'),
    showHandName: c.has('hand-name'),
    showPotOdds: c.has('pot-odds'),
    showEquity: c.has('equity'),
    showHud: c.has('hud'),
    concepts: c,
  };
}

/** Keep at most `max` explanation parts the learner is ready for (always keeps the first basic one). */
export function visibleParts<T extends { concept: string }>(parts: T[], f: Features, max = 3): T[] {
  const ok = parts.filter((p) => f.concepts.has(p.concept));
  return (ok.length ? ok : parts.slice(0, 1)).slice(0, max);
}
