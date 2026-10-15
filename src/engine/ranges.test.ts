import { describe, expect, it } from 'vitest';
import { ALL_LABELS, comboCount, expandRange, gridLabel, parseRange, rangeLabels, rangePercent, labelCombos } from './ranges';
import { HAND_RANKING } from './handRankingData';
import { parseCards } from './cards';

describe('range notation', () => {
  it('parses pairs, plus and dash forms', () => {
    expect(rangeLabels(parseRange('77+'))).toHaveLength(8);
    expect(rangeLabels(parseRange('22-55')).sort()).toEqual(['22', '33', '44', '55']);
    expect(new Set(rangeLabels(parseRange('A2s+'))).size).toBe(12);
    expect(new Set(rangeLabels(parseRange('KTs+')))).toEqual(new Set(['KTs', 'KJs', 'KQs']));
    expect(new Set(rangeLabels(parseRange('A5s-A2s')))).toEqual(new Set(['A5s', 'A4s', 'A3s', 'A2s']));
    expect(new Set(rangeLabels(parseRange('T9s-65s')))).toEqual(new Set(['T9s', '98s', '87s', '76s', '65s']));
  });

  it('AK means both suited and offsuit; weights parse', () => {
    expect(new Set(rangeLabels(parseRange('AK')))).toEqual(new Set(['AKs', 'AKo']));
    expect(parseRange('AKo:0.5').get('AKo')).toBe(0.5);
  });

  it('rejects malformed tokens instead of silently producing nothing', () => {
    for (const bad of ['XX-YY', 'AKs-QJo', '22-AK', 'AKs-T8s', 'AAs', 'AKx', 'A', 'AKQs', 'AK:', 'AK:2', '22+-55', 'A5s-A2s-A3s']) {
      expect(() => parseRange(bad), bad).toThrow();
    }
    // reversed ends and both orders still work
    expect(new Set(rangeLabels(parseRange('A2s-A5s')))).toEqual(new Set(['A5s', 'A4s', 'A3s', 'A2s']));
    expect(rangeLabels(parseRange('66-22'))).toHaveLength(5);
    expect(new Set(rangeLabels(parseRange('JTo-87o')))).toEqual(new Set(['JTo', 'T9o', '98o', '87o']));
  });

  it('counts combos correctly: AA=6, AKs=4, AKo=12, and 169 hands = 1326 combos', () => {
    expect(comboCount('AA')).toBe(6);
    expect(comboCount('AKs')).toBe(4);
    expect(comboCount('AKo')).toBe(12);
    expect(ALL_LABELS.reduce((a, l) => a + comboCount(l), 0)).toBe(1326);
    expect(new Set(ALL_LABELS).size).toBe(169);
    expect(rangePercent(parseRange('22+,A2s+,A2o+,K2s+,K2o+,Q2s+,Q2o+,J2s+,J2o+,T2s+,T2o+,92s+,92o+,82s+,82o+,72s+,72o+,62s+,62o+,52s+,52o+,42s+,42o+,32s+,32o+'))).toBeCloseTo(100, 5);
  });

  it('expands to concrete combos and removes dead cards', () => {
    expect(expandRange(parseRange('AKs'))).toHaveLength(4);
    expect(expandRange(parseRange('AA'), parseCards('As'))).toHaveLength(3);
    expect(labelCombos('AKo')).toHaveLength(12);
  });

  it('grid layout: pairs on the diagonal, suited above, offsuit below', () => {
    expect(gridLabel(0, 0)).toBe('AA');
    expect(gridLabel(0, 1)).toBe('AKs');
    expect(gridLabel(1, 0)).toBe('AKo');
    expect(gridLabel(12, 12)).toBe('22');
    expect(gridLabel(11, 12)).toBe('32s');
  });

  it('hand ranking covers all 169 hands with sane extremes', () => {
    expect(new Set(HAND_RANKING).size).toBe(169);
    expect(HAND_RANKING[0]).toBe('AA');
    expect(HAND_RANKING[1]).toBe('KK');
    expect(HAND_RANKING.indexOf('AKs')).toBeLessThan(12);
    expect(HAND_RANKING.indexOf('72o')).toBeGreaterThan(160);
    expect(HAND_RANKING[168]).toBe('32o');
  });
});
