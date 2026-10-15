import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { ALL_DRILL_TYPES, generateDrill } from './drills';
import { elaborationFor, shouldElaborate } from './elaboration';

describe('self-explanation prompts', () => {
  it('offers 4 reasons with exactly one sound reason and targeted feedback on the others', () => {
    let seen = 0;
    const rng = createRng(1);
    for (const t of ALL_DRILL_TYPES) {
      for (let k = 0; k < 10; k++) {
        const item = generateDrill(t, rng, 1);
        const e = elaborationFor(item, item.bestIndex, createRng(k));
        if (!e) continue;
        seen++;
        expect(e.options).toHaveLength(4);
        expect(e.options.filter((o) => o.good)).toHaveLength(1);
        for (const o of e.options.filter((o) => !o.good)) expect(o.feedback.length).toBeGreaterThan(25);
        expect(e.prompt).toContain('reason');
      }
    }
    expect(seen).toBeGreaterThan(30);
  });

  it('open-fold: the sound reason is neutral, so it never contradicts a wrong choice', () => {
    const rng = createRng(3);
    for (let k = 0; k < 20; k++) {
      const item = generateDrill('open-fold', rng, 1);
      for (const response of [0, 1]) {
        const good = elaborationFor(item, response, createRng(k))!.options.find((o) => o.good)!;
        expect(good.text).toBe('I checked whether this hand is in the range for my seat.');
      }
    }
  });

  it('is only used for decision drills, not for pure identification drills', () => {
    const item = generateDrill('hand-category', createRng(2), 1);
    expect(elaborationFor(item, item.bestIndex, createRng(1))).toBeNull();
  });

  it('is occasional: about one question in five, deterministic per item', () => {
    let n = 0;
    for (let i = 0; i < 2000; i++) if (shouldElaborate(`item-${i}`)) n++;
    expect(n / 2000).toBeGreaterThan(0.15);
    expect(n / 2000).toBeLessThan(0.25);
    expect(shouldElaborate('x')).toBe(shouldElaborate('x'));
  });
});
