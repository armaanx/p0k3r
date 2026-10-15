import { describe, expect, it } from 'vitest';
import { parseCards } from '../engine/cards';
import { ALL_DRILL_TYPES } from '../engine/learning/drills';
import { PROFILES } from '../engine/bots';
import { sprBand } from '../engine/coach/odds';
import { ruleOf2And4 } from '../engine/outs';
import { parseRange } from '../engine/ranges';
import { createRng } from '../engine/rng';
import { LESSONS, LESSON_BY_ID, MODULES, staticItemsOf } from './curriculum';
import { GLOSSARY, GLOSSARY_BY_ID } from './glossary';
import { buildModuleTest } from './moduleTest';
import type { QuizItem, Step, StepVisual } from './types';

const plain = (s: string): string => s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => GLOSSARY_BY_ID.get(id)?.term ?? id).replace(/\*\*/g, '');

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
const rawTextsOf = textsOf;

function visualsOf(st: Step): StepVisual[] {
  if (st.kind === 'read' || st.kind === 'worked' || st.kind === 'complete' || st.kind === 'ask') return st.visual ? [st.visual] : [];
  if (st.kind === 'quiz') return st.items.flatMap((q) => (q.visual ? [q.visual] : []));
  return [];
}
function itemsOf(st: Step): QuizItem[] {
  if (st.kind === 'ask') return [st];
  if (st.kind === 'quiz') return st.items;
  return [];
}

// Words the learner has not met yet must not appear before the module that teaches them.
const INTRODUCED: [RegExp, number][] = [
  [/\bequity\b/i, 5], [/\bpot odds\b/i, 5], [/\bouts\b|\b(?:an|the|one|your|clean|dirty) out\b(?! of)/i, 5], [/\brange\b/i, 3], [/\b3-?bet\b/i, 3], [/\bc-?bet\b/i, 6], [/\bcontinuation\b/i, 6],
  [/\bsemi-?bluff/i, 8], [/\bvpip\b/i, 7], [/\bpfr\b/i, 7], [/\bimplied odds\b/i, 8], [/\bmdf\b/i, 8], [/\bspr\b/i, 8], [/\bfold equity\b/i, 8],
  [/\bbluff/i, 4], [/\bkickers?\b/i, 1], [/\bpositions?\b/i, 2], [/\butg\b/i, 2], [/\btiers?\b/i, 3], [/\bsuited\b/i, 3], [/\boffsuit\b/i, 3],
  [/\bdraws?\b/i, 4], [/\bovercards?\b/i, 4], [/\btexture\b/i, 4], [/\btilt\b/i, 9], [/\bvariance\b/i, 9], [/\bbankroll\b/i, 9], [/\bvalue bet/i, 6],
  [/\bnit\b/i, 7], [/\bmaniac\b/i, 7], [/\btag\b/i, 7], [/\blag\b/i, 7], [/\bexploit/i, 7], [/\bthin value\b/i, 8], [/\bprotection\b/i, 6],
  [/\bcheck-raise\b/i, 6], [/\bpot control\b/i, 6], [/\bexpected value\b/i, 5], [/\brule of 2\b/i, 5], [/\bgutshot\b/i, 4], [/\bflush draw\b/i, 4],
];

describe('curriculum structure', () => {
  it('every module lists real lessons, each lesson belongs to exactly one module, in order', () => {
    const seen = new Set<string>();
    for (const m of MODULES) {
      expect(m.lessons.length).toBeGreaterThan(0);
      expect(m.concepts.length).toBeGreaterThan(0);
      for (const id of m.lessons) {
        const l = LESSON_BY_ID.get(id);
        expect(l, id).toBeDefined();
        expect(l!.module).toBe(m.id);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(LESSONS.length);
    expect(MODULES.map((m) => m.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('covers every module required by the brief (0–9)', () => {
    const titles = MODULES.map((m) => m.title.toLowerCase()).join(' | ');
    for (const w of ['flows', 'rankings', 'position', 'preflop', 'flop', 'pot odds', 'betting', 'opponents', 'intermediate', 'mental']) expect(titles).toContain(w);
  });
});

describe('lesson pedagogy rules', () => {
  for (const l of LESSONS) {
    describe(`${l.id} ${l.title}`, () => {
      it('ends with a mastery check (quiz, mastery practice, or a guided hand with a quiz)', () => {
        const last = l.steps[l.steps.length - 1]!;
        expect(['quiz', 'practice']).toContain(last.kind);
        if (last.kind === 'practice') expect(last.mastery).toBe(true);
      });

      it('makes the learner retrieve before moving on: has at least one question before the final check', () => {
        const interactive = l.steps.filter((s) => ['ask', 'why', 'complete', 'quiz', 'practice', 'hand', 'variance-sim'].includes(s.kind)).length;
        expect(interactive).toBeGreaterThanOrEqual(2);
      });

      it('never shows a wall of text: no read step over 150 words, no more than two reads in a row', () => {
        let run = 0;
        for (const st of l.steps) {
          if (st.kind === 'read') {
            run++;
            expect(plain(st.body).split(/\s+/).length).toBeLessThanOrEqual(150);
          } else run = 0;
          expect(run).toBeLessThanOrEqual(2);
        }
      });

      it('fades support: a "complete" step is always preceded by a worked example', () => {
        const ci = l.steps.findIndex((s) => s.kind === 'complete');
        if (ci >= 0) expect(l.steps.slice(0, ci).some((s) => s.kind === 'worked')).toBe(true);
      });

      it('only uses glossary terms that exist and are taught by this module', () => {
        for (const st of l.steps) {
          for (const t of rawTextsOf(st)) {
            for (const m of t.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
              const term = GLOSSARY_BY_ID.get(m[1]!);
              expect(term, `unknown term [[${m[1]}]] in ${l.id}`).toBeDefined();
              expect(term!.module, `[[${m[1]}]] is taught in module ${term!.module} but used in ${l.id}`).toBeLessThanOrEqual(l.module);
            }
          }
        }
      });

      it('does not use jargon before it is introduced', () => {
        for (const st of l.steps) {
          for (const t of rawTextsOf(st)) {
            const p = plain(t);
            for (const [re, mod] of INTRODUCED) {
              if (l.module < mod) expect(re.test(p), `"${re.source}" (module ${mod}) appears in ${l.id}: "${p.slice(0, 80)}"`).toBe(false);
            }
          }
        }
      });

      it('has valid cards, grids, quiz indices and drill types', () => {
        for (const st of l.steps) {
          for (const v of visualsOf(st)) {
            for (const c of [v.hole, v.board, v.highlight, ...(v.hands ?? []).map((h) => h.cards)]) if (c) expect(() => parseCards(c.replace(/10/g, 'T'))).not.toThrow();
            if (v.grid) { parseRange(v.grid.spec); if (v.grid.spec2) parseRange(v.grid.spec2); }
          }
          for (const q of itemsOf(st)) {
            expect(q.options.length).toBeGreaterThanOrEqual(2);
            expect(q.correct).toBeGreaterThanOrEqual(0);
            expect(q.correct).toBeLessThan(q.options.length);
            // Wrong answers need a real, targeted explanation of the misconception, not a bare "No."
            q.options.forEach((o, k) => expect(o.why.length, `${l.id}: "${o.text}"`).toBeGreaterThan(k === q.correct ? 3 : 20));
          }
          if (st.kind === 'quiz') expect(st.passAt).toBeLessThanOrEqual(st.items.length);
          if (st.kind === 'practice') {
            for (const d of Array.isArray(st.drill) ? st.drill : [st.drill]) expect(ALL_DRILL_TYPES).toContain(d);
            if (st.passAt) expect(st.passAt).toBeLessThanOrEqual(st.count);
          }
          if (st.kind === 'complete') for (const b of st.blanks) expect(b.correct).toBeLessThan(b.options.length);
        }
      });
    });
  }
});

describe('glossary', () => {
  it('has unique ids, non-empty definitions, plain language (no undefined jargon in definitions beyond its module)', () => {
    expect(new Set(GLOSSARY.map((g) => g.id)).size).toBe(GLOSSARY.length);
    for (const g of GLOSSARY) {
      expect(g.def.length).toBeGreaterThan(10);
      expect(g.module).toBeGreaterThanOrEqual(0);
      expect(g.module).toBeLessThanOrEqual(9);
    }
  });
  it('covers every term the brief names', () => {
    const ids = new Set(GLOSSARY.map((g) => g.id));
    for (const id of ['blinds', 'flop', 'turn', 'river', 'showdown', 'kicker', 'position', 'range', '3bet', 'equity', 'pot-odds', 'out', 'cbet', 'vpip', 'pfr', 'spr', 'mdf', 'implied-odds', 'variance', 'tilt', 'bankroll']) expect(ids.has(id), id).toBe(true);
  });
  it('states the shared conventions the engine uses (numbers match the code)', () => {
    const def = (id: string): string => GLOSSARY_BY_ID.get(id)!.def;
    // Rule of 2 and 4, adjusted for big draws.
    for (const o of [9, 15]) expect(def('rule-2-4')).toContain(`${o} outs ≈ ${ruleOf2And4(o, 2, true)}%`);
    // SPR: effective stack, and the same band edges as sprBand.
    expect(def('spr')).toMatch(/effective stack/);
    expect([sprBand(2.99), sprBand(3), sprBand(7.99), sprBand(8)]).toEqual(['low', 'medium', 'medium', 'high']);
    expect(def('spr')).toMatch(/Under 3 is low, 3 to under 8 medium, 8 or more high/);
    // MDF and break-even formulas.
    expect(def('mdf')).toContain('pot before the bet ÷ (pot before the bet + bet)');
    expect(def('break-even')).toContain('call ÷ (pot + call)');
    // Heads-up blinds and action order.
    expect(def('heads-up')).toMatch(/button posts the small blind/);
    expect(def('heads-up')).toMatch(/first before the flop and last after it/);
    // Air can win at showdown (rarely); a nit is very tight (not "passive").
    expect(def('air')).not.toMatch(/only win/);
    expect(def('nit')).toMatch(/very tight/);
    expect(def('nit')).not.toMatch(/passive/);
  });
  it('UTG, made hand and EV definitions are precise', () => {
    const def = (id: string): string => GLOSSARY_BY_ID.get(id)!.def;
    // UTG is only "first to act" preflop; after the flop the blinds act before it.
    expect(def('utg')).not.toMatch(/worst position/i);
    expect(def('utg')).toMatch(/before the flop/);
    // A board pair is not a made hand for you (matches assessHand and the m4 lessons).
    expect(def('made-hand')).toMatch(/hole cards/);
    expect(def('made-hand')).toMatch(/only on the board does not count/);
    // A correct fold is worth 0: the good decision is the highest-EV option, not necessarily a positive one.
    expect(def('ev')).not.toMatch(/Good decisions have positive EV/);
    expect(def('ev')).toMatch(/highest EV/);
  });
  it('glossary definitions only use jargon introduced by their own module', () => {
    for (const g of GLOSSARY) {
      const p = plain(g.def);
      for (const [re, mod] of INTRODUCED) if (g.module < mod) expect(re.test(p), `"${re.source}" (module ${mod}) in the definition of ${g.id} (module ${g.module})`).toBe(false);
    }
  });
});

describe('module tests', () => {
  it('every module can build an interleaved test of valid items; later modules mix earlier material', () => {
    for (const m of MODULES) {
      const items = buildModuleTest(m.id, createRng(5 + m.id));
      expect(items.length, `module ${m.id}`).toBeGreaterThanOrEqual(10);
      expect(items.length).toBeLessThanOrEqual(20);
      if (m.id >= 3) {
        const mods = new Set(items.filter((i) => i.kind === 'drill').map((i) => (i.kind === 'drill' ? i.item.module : -1)));
        expect([...mods].some((x) => x < m.id), `module ${m.id} test mixes earlier modules`).toBe(true);
      }
    }
  });
  it('static item pools exist for the early modules', () => {
    expect(staticItemsOf(0).length).toBeGreaterThanOrEqual(10);
  });
});



describe('module 7 player types match the practice bots', () => {
  const text = (id: string): string => plain(LESSON_BY_ID.get(id)!.steps.flatMap(textsOf).join('\n'));
  it('the nit is described as playing about one hand in ten, not only premium hands', () => {
    const t = text('m7-l1');
    expect(t).not.toMatch(/only plays premium/i);
    expect(t).toMatch(/The nit: very tight\. Plays only strong hands, about one in ten/);
    expect(PROFILES.nit.vpip).toBeGreaterThanOrEqual(8);
    expect(PROFILES.nit.vpip).toBeLessThanOrEqual(13);
  });
  it('the VPIP bands put the TAG in the tight band and the LAG in the loose band (as on the player map)', () => {
    const t = text('m7-l2');
    const m = t.match(/Under about (\d+) is very tight \(a nit\); about (\d+) to (\d+) is tight[^;]*\(a TAG\); over about (\d+) is loose/);
    expect(m).not.toBeNull();
    const [veryTight, tightLo, tightHi, loose] = m!.slice(1).map(Number);
    expect(PROFILES.nit.vpip).toBeLessThan(veryTight);
    expect(PROFILES.tag.vpip).toBeGreaterThanOrEqual(tightLo);
    expect(PROFILES.tag.vpip).toBeLessThanOrEqual(tightHi);
    for (const a of ['lag', 'station', 'maniac'] as const) expect(PROFILES[a].vpip, a).toBeGreaterThan(loose);
    expect(t).not.toMatch(/\(six players\)/);
  });
});
