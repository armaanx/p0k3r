// Helpers built on the generated 169-hand ranking.
import { HAND_EQUITY_VS_RANDOM, HAND_RANKING } from './handRankingData';
import { type Range, comboCount } from './ranges';

export { HAND_EQUITY_VS_RANDOM, HAND_RANKING };

export const RANK_INDEX: ReadonlyMap<string, number> = new Map(HAND_RANKING.map((l, i) => [l, i] as const));

const cache = new Map<number, Range>();

/** The best `pct`% of starting hands (by raw strength vs a random hand). */
export function topPercent(pct: number): Range {
  const k = Math.max(0, Math.min(100, Math.round(pct)));
  let r = cache.get(k);
  if (!r) {
    r = new Map();
    let c = 0;
    for (const l of HAND_RANKING) {
      if (c >= (1326 * k) / 100) break;
      r.set(l, 1);
      c += comboCount(l);
    }
    cache.set(k, r);
  }
  return r;
}

/** Percentile (0 = best hand, 100 = worst) of a hand label by combos. */
export function handPercentile(label: string): number {
  let c = 0;
  for (const l of HAND_RANKING) {
    if (l === label) return (100 * (c + comboCount(l) / 2)) / 1326;
    c += comboCount(l);
  }
  return 100;
}
