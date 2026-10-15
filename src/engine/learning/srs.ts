// Spaced repetition: an SM-2 style schedule layered on Leitner boxes.
// Pure functions over a plain record so it can be persisted, exported and unit-tested.
import type { Attempt, SrsItem } from '../../state/types';

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
export const SESSION_GAP = 6 * 60 * MIN; // repeats within 6 hours are "the same session"

export const conceptKey = (concept: string): string => `c:${concept}`;
export const spotKey = (spot: string): string => `s:${spot}`;

export function newItem(id: string, now: number): SrsItem {
  return { id, ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, box: 0, last: 0 };
}

/** 0..5 quality from an attempt. Confident-and-wrong is the worst: the biggest thing to fix. */
export function quality(a: Pick<Attempt, 'correct' | 'confidence'>): number {
  if (!a.correct) return a.confidence === 3 ? 0 : 1;
  if (a.confidence === 1) return 3;
  if (a.confidence === 3) return 5;
  return 4;
}

export function review(item: SrsItem, a: Pick<Attempt, 'correct' | 'confidence' | 't'>): SrsItem {
  const q = quality(a);
  const now = a.t;
  const next: SrsItem = { ...item, last: now };
  if (q < 3) {
    next.reps = 0;
    next.lapses = item.lapses + 1;
    next.box = 0;
    next.ease = Math.max(1.3, item.ease - (q === 0 ? 0.3 : 0.2));
    next.interval = 0;
    next.due = now + 10 * MIN; // missed items come back soon
    return next;
  }
  // A repeat in the same session is practice, not spaced review: do not stretch the interval.
  if (item.reps > 0 && now - item.last < SESSION_GAP) {
    next.ease = Math.min(3, item.ease + (q === 5 ? 0.02 : 0));
    return next;
  }
  next.reps = item.reps + 1;
  next.interval = next.reps === 1 ? 1 : next.reps === 2 ? 3 : Math.max(item.interval + 1, Math.round(item.interval * item.ease));
  next.ease = Math.max(1.3, item.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  next.box = Math.min(5, item.box + 1);
  next.due = now + next.interval * DAY;
  return next;
}

/** Update both the concept item and the specific spot item for an attempt. */
export function recordSrs(srs: Record<string, SrsItem>, a: Attempt): Record<string, SrsItem> {
  const out = { ...srs };
  for (const key of [conceptKey(a.concept), spotKey(a.spot)]) {
    const cur = out[key] ?? newItem(key, a.t);
    out[key] = review(cur, a);
  }
  return out;
}

/**
 * An item is due when its review time has come. An item that was just missed (and has not been answered correctly
 * since) is re-learning: it is available for review straight away, so a miss never slips away unnoticed.
 */
export const isDue = (i: SrsItem, now: number): boolean => {
  if (i.reps === 0 && i.lapses > 0) return true;
  return i.reps > 0 ? i.due <= now : false;
};

/** Items whose review time has come, most overdue first. Only items that have been seen before. */
export function dueItems(srs: Record<string, SrsItem>, now: number, kind: 'c' | 's' | 'any' = 'any'): SrsItem[] {
  return Object.values(srs)
    .filter((i) => (kind === 'any' || i.id.startsWith(`${kind}:`)) && isDue(i, now))
    .sort((a, b) => a.due - b.due);
}

export function dueCount(srs: Record<string, SrsItem>, now: number): number {
  return dueItems(srs, now, 's').length;
}

/** Describe when an item is next due, in plain language. */
export function dueText(i: SrsItem, now: number): string {
  const diff = i.due - now;
  if (diff <= 0) return 'due now';
  if (diff < 60 * MIN) return `in ${Math.max(1, Math.round(diff / MIN))} min`;
  if (diff < DAY) return `in ${Math.round(diff / (60 * MIN))} h`;
  return `in ${Math.round(diff / DAY)} day${Math.round(diff / DAY) === 1 ? '' : 's'}`;
}
