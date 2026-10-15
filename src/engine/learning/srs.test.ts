import { describe, expect, it } from 'vitest';
import type { Attempt } from '../../state/types';
import { conceptKey, dueCount, dueItems, dueText, newItem, quality, recordSrs, review, spotKey } from './srs';

const DAY = 86_400_000;
const att = (t: number, correct: boolean, confidence?: 1 | 2 | 3, spot = 'open:UTG', concept = 'open-range'): Attempt => ({ t, concept, spot, kind: 'open-fold', correct, confidence });

describe('spaced repetition schedule', () => {
  it('quality: confident-and-wrong is the worst, unsure-but-right is weaker than sure-and-right', () => {
    expect(quality({ correct: false, confidence: 3 })).toBe(0);
    expect(quality({ correct: false })).toBe(1);
    expect(quality({ correct: true, confidence: 1 })).toBe(3);
    expect(quality({ correct: true })).toBe(4);
    expect(quality({ correct: true, confidence: 3 })).toBe(5);
  });

  it('mastered items return at expanding intervals: 1 day, 3 days, then roughly ×ease', () => {
    let it = newItem('x', 0);
    let t = 0;
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      it = review(it, { t, correct: true });
      intervals.push(it.interval);
      t += it.interval * DAY + 1000; // review exactly when due
    }
    expect(intervals.slice(0, 2)).toEqual([1, 3]);
    for (let i = 2; i < intervals.length; i++) expect(intervals[i]!).toBeGreaterThan(intervals[i - 1]!);
    expect(intervals[5]!).toBeGreaterThan(30);
  });

  it('a miss brings the item back within minutes, resets the streak, and costs ease', () => {
    let it = review(review(newItem('x', 0), { t: 0, correct: true }), { t: DAY, correct: true });
    expect(it.interval).toBe(3);
    const before = it.ease;
    it = review(it, { t: 4 * DAY, correct: false });
    expect(it.reps).toBe(0);
    expect(it.lapses).toBe(1);
    expect(it.due - 4 * DAY).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(it.ease).toBeLessThan(before);
    expect(it.box).toBe(0);
  });

  it('confident-and-wrong is penalised more than a plain miss', () => {
    const a = review(newItem('x', 0), { t: 0, correct: false, confidence: 3 });
    const b = review(newItem('x', 0), { t: 0, correct: false });
    expect(a.ease).toBeLessThan(b.ease);
  });

  it('repeating an item within one session does not inflate the interval', () => {
    let it = newItem('x', 0);
    for (let i = 0; i < 20; i++) it = review(it, { t: i * 60_000, correct: true });
    expect(it.reps).toBe(1);
    expect(it.interval).toBe(1);
  });

  it('ease never drops below 1.3', () => {
    let it = newItem('x', 0);
    for (let i = 0; i < 30; i++) it = review(it, { t: i * DAY, correct: false, confidence: 3 });
    expect(it.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('recordSrs tracks both the concept and the specific spot', () => {
    const srs = recordSrs({}, att(0, true, 2, 'open:UTG', 'open-range'));
    expect(Object.keys(srs).sort()).toEqual([conceptKey('open-range'), spotKey('open:UTG')].sort());
    const again = recordSrs(srs, att(1000, false, 2, 'open:UTG', 'open-range'));
    expect(again[spotKey('open:UTG')]!.lapses).toBe(1);
    expect(again[conceptKey('open-range')]!.lapses).toBe(1);
  });

  it('due queue: only seen items, most overdue first, missed items first', () => {
    let srs = recordSrs({}, att(0, true, 2, 'a', 'c1'));
    srs = recordSrs(srs, att(0, false, 2, 'b', 'c2'));
    srs = recordSrs(srs, att(0, true, 2, 'c', 'c3'));
    // Right after answering, only the miss is up for review (re-learning); items answered correctly wait a day.
    expect(dueItems(srs, 0, 's').map((i) => i.id)).toEqual(['s:b']);
    const now = 2 * DAY;
    const due = dueItems(srs, now, 's');
    expect(due.map((i) => i.id)).toEqual(['s:b', 's:a', 's:c'].filter((x) => due.some((d) => d.id === x)));
    expect(due[0]!.id).toBe('s:b'); // the miss is due first
    expect(dueCount(srs, now)).toBe(due.length);
  });

  it('describes due times in plain language', () => {
    const it = { ...newItem('x', 0), due: 3 * DAY, reps: 1 };
    expect(dueText(it, 0)).toBe('in 3 days');
    expect(dueText(it, 4 * DAY)).toBe('due now');
    expect(dueText({ ...it, due: 20 * 60_000 }, 0)).toBe('in 20 min');
  });
});
