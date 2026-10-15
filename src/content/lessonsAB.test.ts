// Regression tests for lesson content in modules 0-5 (lessons-a.ts, lessons-b.ts).
import { describe, expect, it } from 'vitest';
import { type Card, parseCards } from '../engine/cards';
import { equityVsHand } from '../engine/equity';
import { LESSON_BY_ID } from './curriculum';
import type { Step } from './types';

function textsOf(st: Step): string[] {
  switch (st.kind) {
    case 'read': return [st.body, st.title ?? ''];
    case 'ask': return [st.prompt, st.explain, ...st.options.flatMap((o) => [o.text, o.why])];
    case 'worked': return [st.title, ...st.steps, st.takeaway];
    case 'complete': return [st.title, ...st.given, st.takeaway, ...st.blanks.flatMap((b) => [b.prompt, ...b.options, b.why])];
    case 'why': return [st.prompt, ...st.options.flatMap((o) => [o.text, o.feedback])];
    case 'quiz': return st.items.flatMap((q) => [q.prompt, q.explain, ...q.options.flatMap((o) => [o.text, o.why])]);
    default: return [];
  }
}
const allText = (id: string): string => LESSON_BY_ID.get(id)!.steps.flatMap(textsOf).join('\n');
const two = (s: string): [Card, Card] => {
  const c = parseCards(s);
  return [c[0]!, c[1]!];
};

describe('lessons modules 3-5 regression', () => {
  it('m5-l3 worked fold example really is a fold against king-x hands (no hidden live outs)', () => {
    const st = LESSON_BY_ID.get('m5-l3')!.steps.find((s) => s.kind === 'worked');
    if (!st || st.kind !== 'worked') throw new Error('missing worked step');
    expect(st.visual?.hole).toBe('Qh 8h');
    const board = parseCards(st.visual!.board!);
    const need = 300 / 1200;
    for (const vil of ['Kc Qd', 'Kd Jc', 'Ac Kd', 'Ks 7s']) {
      const r = equityVsHand(two('Qh 8h'), two(vil), board);
      expect(r.exact).toBe(true);
      expect(r.equity).toBeLessThan(need);
    }
    // The visual's pot includes the bet: 600 pot + 300 bet.
    expect(st.visual!.odds).toEqual({ pot: 900, bet: 300 });
  });

  it('m5-l1 flush-draw example also counts the overcard outs', () => {
    expect(allText('m5-l1')).toMatch(/9 \+ 6 = 15 outs/);
  });

  it('m4-l3 Weak group covers a pocket pair between board cards (5-5 on K-9-3)', () => {
    expect(allText('m4-l3')).toMatch(/pocket pair below the top two board cards/);
  });

  it('m3-l2 open-range feedback matches "fold 75 to 80"', () => {
    const t = allText('m3-l2');
    expect(t).not.toMatch(/three or four hands out of every five/);
    expect(t).toMatch(/three out of every four/);
  });

  it('m5-l4 does not call a preflop pair an "overpair"', () => {
    expect(allText('m5-l4')).not.toMatch(/[Oo]verpair vs underpair/);
  });
});
