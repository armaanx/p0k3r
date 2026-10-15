import { describe, expect, it } from 'vitest';
import {
  DEFEND_SPECS, HU_OPEN_SPEC, OPEN_SPECS, POSITION_ORDER, TIERS, TIER_BLURBS, TIER_NAMES, WEAK_TIER, defendRanges_, facing3betRanges, facing3betVerdict,
  facing4betVerdict, facingRaiseVerdict, gridNeighbors, hasDefendChart, huDefendRanges, huDefendVerdict, neighbourActions, opener3betInPosition,
  openPercent, openVerdict, positionOf, pushRange, shoveRanges, tierOf, type Position,
} from './preflopCharts';
import { ALL_LABELS, comboCount, parseRange, rangePercent } from './ranges';

describe('positions', () => {
  it('6-max seat names rotate with the button', () => {
    const names = [0, 1, 2, 3, 4, 5].map((s) => positionOf(s, 0, 6));
    expect(names).toEqual(['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']);
    expect(positionOf(2, 3, 6)).toBe('CO');
    expect(positionOf(0, 3, 6)).toBe('UTG');
  });
  it('heads-up: button and BB only', () => {
    expect(positionOf(0, 0, 2)).toBe('BTN');
    expect(positionOf(1, 0, 2)).toBe('BB');
  });
});

describe('open ranges', () => {
  it('get wider toward the button, with plausible sizes', () => {
    const pcts = (['UTG', 'HJ', 'CO', 'BTN'] as const).map((p) => openPercent(p));
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeGreaterThan(pcts[i - 1]!);
    expect(pcts[0]).toBeGreaterThan(12);
    expect(pcts[0]).toBeLessThan(18);
    expect(pcts[3]).toBeGreaterThan(38);
    expect(pcts[3]).toBeLessThan(50);
  });
  it('each later position range contains the earlier one (nested)', () => {
    const order = ['UTG', 'HJ', 'CO', 'BTN'] as const;
    for (let i = 1; i < order.length; i++) {
      const early = parseRange(OPEN_SPECS[order[i - 1]!]);
      const late = parseRange(OPEN_SPECS[order[i]!]);
      for (const l of early.keys()) expect(late.has(l), `${l} in ${order[i - 1]} but not ${order[i]}`).toBe(true);
    }
  });
  it('verdicts: 72o folds everywhere, AA raises everywhere', () => {
    for (const p of ['UTG', 'HJ', 'CO', 'BTN', 'SB'] as Position[]) {
      expect(openVerdict(p, '72o').action).toBe('fold');
      expect(openVerdict(p, 'AA').action).toBe('raise');
    }
    expect(openVerdict('UTG', 'J9s').action).toBe('fold');
    expect(openVerdict('BTN', 'J9s').action).toBe('raise');
  });
  it('boundary hands are marginal; clear decisions are not', () => {
    expect(openVerdict('UTG', '72o').marginal).toBe(false);
    expect(openVerdict('UTG', 'AA').marginal).toBe(false);
    expect(openVerdict('UTG', '55').marginal).toBe(true);
  });
});

describe('facing a raise', () => {
  it('every chart parses, and 3-bet and call ranges are not identical', () => {
    for (const [k, v] of Object.entries(DEFEND_SPECS)) {
      const [hero, raiser] = k.split('>') as [Position, Position];
      expect(hasDefendChart(hero, raiser)).toBe(true);
      const r = defendRanges_(hero, raiser);
      expect(rangePercent(r.threeBet)).toBeGreaterThan(1);
      expect(rangePercent(r.call)).toBeGreaterThan(0.5);
      expect(v.threeBet).not.toBe(v.call);
    }
  });
  it('3-bet beats call priority; AA always 3-bets, 72o always folds', () => {
    for (const k of Object.keys(DEFEND_SPECS)) {
      const [hero, raiser] = k.split('>') as [Position, Position];
      expect(facingRaiseVerdict(hero, raiser, 'AA').action).toBe('3bet');
      expect(facingRaiseVerdict(hero, raiser, '72o').action).toBe('fold');
    }
  });
  it('big blind defends much wider than UTG does facing the same open', () => {
    const bb = defendRanges_('BB', 'BTN');
    const hj = defendRanges_('HJ', 'UTG');
    expect(rangePercent(bb.call)).toBeGreaterThan(rangePercent(hj.call) * 2);
  });
  it('facing a 3-bet', () => {
    expect(facing3betVerdict('AA').action).toBe('4bet');
    expect(facing3betVerdict('JJ').action).toBe('call');
    expect(facing3betVerdict('T7o').action).toBe('fold');
  });
  it('M4: in position against a blind 3-bet, the button calls KJs, AJo and 66; out of position it does not', () => {
    for (const l of ['KJs', 'AJo', '66']) {
      expect(facing3betVerdict(l, 'BTN', 'BB').action, l).toBe('call');
      expect(facing3betVerdict(l, 'CO', 'SB').action, l).toBe('call');
      expect(facing3betVerdict(l, 'UTG', 'BB').action, l).toBe('fold');
    }
    expect(opener3betInPosition('CO', 'BTN')).toBe(false);
    expect(facing3betRanges('BTN', 'BB').ip).toBe(true);
  });
  it('M2: big blind defence totals widen as the raiser sits later, and BB vs BTN is 45-55%', () => {
    const total = (k: string): number => rangePercent(defendRanges_('BB', k as Position).threeBet) + rangePercent(defendRanges_('BB', k as Position).call);
    const order = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
    for (let i = 1; i < order.length; i++) expect(total(order[i]!)).toBeGreaterThanOrEqual(total(order[i - 1]!));
    expect(total('BTN')).toBeGreaterThanOrEqual(45);
    expect(total('BTN')).toBeLessThanOrEqual(55);
    expect(total('CO')).toBeGreaterThanOrEqual(35);
    expect(total('CO')).toBeLessThanOrEqual(40);
    expect(total('UTG')).toBeGreaterThanOrEqual(22);
    expect(total('UTG')).toBeLessThanOrEqual(28);
  });
  it('defence ranges are nested: for a fixed defender, a later raiser never makes a hand fold that an earlier one let continue', () => {
    const heroes: Position[] = ['CO', 'BTN', 'SB', 'BB'];
    for (const h of heroes) {
      const raisers = POSITION_ORDER.filter((r) => hasDefendChart(h, r));
      for (let i = 1; i < raisers.length; i++) {
        const early = defendRanges_(h, raisers[i - 1]!);
        const late = defendRanges_(h, raisers[i]!);
        for (const l of [...early.threeBet.keys(), ...early.call.keys()]) {
          expect(late.threeBet.has(l) || late.call.has(l), `${h}: ${l} continues vs ${raisers[i - 1]} but not vs ${raisers[i]}`).toBe(true);
        }
        for (const l of early.threeBet.keys()) expect(late.threeBet.has(l), `${h}: ${l} 3-bets vs ${raisers[i - 1]} but not vs ${raisers[i]}`).toBe(true);
      }
    }
  });
  it('M3: heads-up, the button opens 75-85% and the big blind defends 65-75% (54s, 96s, T8o continue)', () => {
    expect(openPercent('BTN', true)).toBeGreaterThanOrEqual(75);
    expect(openPercent('BTN', true)).toBeLessThanOrEqual(85);
    const hu = huDefendRanges();
    const t = rangePercent(hu.threeBet) + rangePercent(hu.call);
    expect(t).toBeGreaterThanOrEqual(65);
    expect(t).toBeLessThanOrEqual(75);
    for (const l of ['54s', '96s', 'T8o']) expect(huDefendVerdict(l).action, l).toBe('call');
    for (const l of [...hu.threeBet.keys()]) expect(hu.call.has(l)).toBe(false);
    // BTN 6-max opens are a subset of the heads-up opens
    for (const l of parseRange(OPEN_SPECS.BTN).keys()) expect(parseRange(HU_OPEN_SPEC).has(l), l).toBe(true);
  });
  it('W6 helper: neighbourActions lists only the actions a neighbouring hand actually gets', () => {
    // JJ calls vs UTG from HJ; its neighbours are TT (call) and QQ (3-bet): only the 3-bet is an alternative.
    const f = (l: string): string => facingRaiseVerdict('HJ', 'UTG', l).action;
    expect(neighbourActions('JJ', f)).toEqual(['3bet']);
    expect(facingRaiseVerdict('HJ', 'UTG', 'JJ').alternatives).toEqual(['3bet']);
    expect(neighbourActions('72o', (l) => openVerdict('UTG', l).action)).toEqual([]);
  });
  it('facing a 4-bet: QQ+ and AK continue; AA, KK and AK jam (and may flat); QQ calls or jams', () => {
    expect(facing4betVerdict('AKo').action).toBe('4bet');
    expect(facing4betVerdict('AKs').action).toBe('4bet');
    expect(facing4betVerdict('QQ').action).toBe('call');
    expect(facing4betVerdict('JJ').action).toBe('fold');
    expect(facing4betVerdict('AA').alternatives).toEqual(['call']);
    expect(facing4betVerdict('QQ').alternatives).toContain('4bet');
    expect(facing4betVerdict('AKs', true).source).toMatch(/raise and a re-raise/);
  });
  it('re-shoves over a raise widen with the raiser\'s seat (10bb BB vs a BTN open ~30%)', () => {
    expect(rangePercent(pushRange('BB', 10, false, false, 'BTN'))).toBeGreaterThan(28);
    expect(rangePercent(pushRange('BB', 10, false, false, 'UTG'))).toBeLessThan(16);
    expect(pushRange('BB', 10, false, false, 'BTN').has('K9o')).toBe(true);
    expect(pushRange('BB', 10, false)).toEqual(pushRange('BB', 10, false, false, 'UTG')); // unknown raiser: tight default
  });
  it('BTN defends KQo against a CO open', () => {
    expect(facingRaiseVerdict('BTN', 'CO', 'KQo').action).not.toBe('fold');
  });
  it('short-stack push ranges by seat (10bb first in): UTG ~20%, BTN ~45%, SB ~55%', () => {
    expect(rangePercent(pushRange('UTG', 10, true))).toBeCloseTo(20, 0);
    expect(rangePercent(pushRange('BTN', 10, true))).toBeGreaterThan(43);
    expect(rangePercent(pushRange('SB', 10, true))).toBeGreaterThan(53);
    expect(pushRange('BTN', 10, true).has('K9o')).toBe(true);
    expect(pushRange('BTN', 10, true).has('Q8s')).toBe(true);
    // deep shoves are narrow
    expect([...shoveRanges('BTN', 100, false).base.keys()].sort()).toEqual(['AA', 'AKo', 'AKs', 'KK', 'QQ'].sort());
  });
});

describe('tiers', () => {
  it('tiers are disjoint and cover all 169 hands', () => {
    const seen = new Map<string, number>();
    for (const t of TIERS) for (const l of parseRange(t.spec).keys()) {
      expect(seen.has(l), `${l} appears in tiers ${seen.get(l)} and ${t.id}`).toBe(false);
      seen.set(l, t.id);
    }
    expect(ALL_LABELS.map(tierOf).every((t) => t >= 1 && t <= 5)).toBe(true);
    expect(tierOf('AA')).toBe(1);
    expect(tierOf('72o')).toBe(5);
    expect(tierOf('T9s')).toBe(3);
  });
  it('M5: tier 4 and 5 text matches the charts', () => {
    expect(TIER_NAMES[5]).toBe('Weak');
    expect(TIER_BLURBS[5]).toBe(WEAK_TIER.blurb);
    expect(TIERS[3]!.blurb).toMatch(/A few of the best open from any seat; most are for later seats/);
    // There really are tier-4 opens from UTG and tier-5 opens on the button.
    expect(openVerdict('UTG', '55').action).toBe('raise');
    expect(openVerdict('BTN', 'K9o').action).toBe('raise');
    expect(tierOf('K9o')).toBe(5);
  });
  it('premium tier is about 2.6% of hands', () => {
    const c = [...parseRange(TIERS[0]!.spec).keys()].reduce((a, l) => a + comboCount(l), 0);
    expect((100 * c) / 1326).toBeCloseTo(2.56, 1);
  });
  it('gridNeighbors stay within the same shape', () => {
    expect(gridNeighbors('AKs').every((l) => l.endsWith('s'))).toBe(true);
    expect(gridNeighbors('77').sort()).toEqual(['66', '88']);
  });
  it('position order constant is complete', () => {
    expect(POSITION_ORDER).toHaveLength(6);
  });
});
