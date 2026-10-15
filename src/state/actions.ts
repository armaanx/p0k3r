// Pure helpers that update Progress. The UI calls these through `update()`.
import type { Attempt, Progress } from './types';
import { recordSrs } from '../engine/learning/srs';

export const dayKey = (t = Date.now()): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Record one graded attempt: history, spaced-repetition schedule and the practice day. */
export function withAttempt(p: Progress, a: Attempt): Progress {
  const day = dayKey(a.t);
  return {
    ...p,
    attempts: [...p.attempts, a].slice(-3000),
    srs: recordSrs(p.srs, a),
    days: p.days.includes(day) ? p.days : [...p.days, day].slice(-400),
  };
}

export function withLessonDone(p: Progress, id: string, score?: number): Progress {
  const day = dayKey();
  return {
    ...p,
    lessons: { ...p.lessons, [id]: { done: true, step: 0, score, completedAt: Date.now() } },
    days: p.days.includes(day) ? p.days : [...p.days, day].slice(-400),
  };
}

export function withSeenTerms(p: Progress, ids: string[]): Progress {
  const fresh = ids.filter((i) => !p.seenTerms.includes(i));
  return fresh.length ? { ...p, seenTerms: [...p.seenTerms, ...fresh] } : p;
}
