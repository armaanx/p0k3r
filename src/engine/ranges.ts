// Poker ranges: notation parser, weighted combos, and the 13x13 grid layout.
import { type Card, RANK_CHARS, makeCard, rankOf, suitOf, handLabel } from './cards';

/** A range maps a 169-hand label ("AKs", "QQ", "72o") to a weight 0..1. */
export type Range = Map<string, number>;

export interface Combo {
  hand: [Card, Card];
  weight: number;
}

const R = (ch: string): number => RANK_CHARS.indexOf(ch);

/** All 169 labels in grid order: row = first rank (A..2), col = second rank (A..2). Above diagonal = suited. */
export function gridLabel(row: number, col: number): string {
  const r1 = 12 - row;
  const r2 = 12 - col;
  if (row === col) return RANK_CHARS[r1]! + RANK_CHARS[r2]!;
  if (col > row) return RANK_CHARS[r1]! + RANK_CHARS[r2]! + 's'; // upper-right: suited
  return RANK_CHARS[r2]! + RANK_CHARS[r1]! + 'o'; // lower-left: offsuit (high card first)
}

export const ALL_LABELS: string[] = (() => {
  const out: string[] = [];
  for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) out.push(gridLabel(r, c));
  return out;
})();

/** Number of card combinations for a label: pair 6, suited 4, offsuit 12. */
export function comboCount(label: string): number {
  if (label.length === 2) return 6;
  return label[2] === 's' ? 4 : 12;
}

/** Specific card pairs for a label. */
export function labelCombos(label: string): [Card, Card][] {
  const r1 = R(label[0]!);
  const r2 = R(label[1]!);
  const out: [Card, Card][] = [];
  if (label.length === 2) {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) out.push([makeCard(r1, a), makeCard(r2, b)]);
  } else if (label[2] === 's') {
    for (let s = 0; s < 4; s++) out.push([makeCard(r1, s), makeCard(r2, s)]);
  } else {
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) out.push([makeCard(r1, a), makeCard(r2, b)]);
  }
  return out;
}

const norm = (hi: number, lo: number, suffix: string): string => {
  if (hi === lo) return RANK_CHARS[hi]! + RANK_CHARS[lo]!;
  return RANK_CHARS[Math.max(hi, lo)]! + RANK_CHARS[Math.min(hi, lo)]! + suffix;
};

/** A single hand token like "AKs", "AKo", "AK", "77" (no "+" or dash). Throws on anything else. */
function parseHandToken(t: string, raw: string): { hi: number; lo: number; suffix: '' | 's' | 'o' } {
  if (t.length < 2 || t.length > 3) throw new Error(`Bad range token "${raw}"`);
  const a = R(t[0]!.toUpperCase());
  const b = R(t[1]!.toUpperCase());
  const sfx = t.length === 3 ? t[2]!.toLowerCase() : '';
  if (a < 0 || b < 0 || (sfx !== '' && sfx !== 's' && sfx !== 'o')) throw new Error(`Bad range token "${raw}"`);
  if (a === b && sfx !== '') throw new Error(`Bad range token "${raw}": a pair cannot be suited or offsuit`);
  return { hi: Math.max(a, b), lo: Math.min(a, b), suffix: sfx as '' | 's' | 'o' };
}

/**
 * Parse range notation. Supports: "AA", "AKs", "AKo", "AK" (suited+offsuit), "77+", "22-66",
 * "A2s+", "ATs-A5s", "T9s-65s" (connectors), optional weights "AKo:0.5". Separated by commas/spaces.
 * Throws on malformed tokens (unknown ranks or suffixes, "+" inside a dash range, or dash ends of different
 * shapes such as "AKs-QJo", "22-AK" or "AKs-T8s").
 */
export function parseRange(spec: string): Range {
  const range: Range = new Map();
  const put = (label: string, w: number): void => {
    range.set(label, w);
  };
  for (const raw of spec.split(/[,\s]+/).filter(Boolean)) {
    const parts = raw.split(':');
    if (parts.length > 2) throw new Error(`Bad range token "${raw}"`);
    const token = parts[0]!;
    const wStr = parts[1];
    const weight = wStr === undefined ? 1 : wStr.trim() === '' ? NaN : Number(wStr);
    if (!(weight >= 0 && weight <= 1)) throw new Error(`Bad weight in "${raw}"`);
    if (token.includes('-')) {
      const sides = token.split('-');
      if (sides.length !== 2 || sides.some((x) => x.endsWith('+'))) throw new Error(`Bad range token "${raw}"`);
      const L = parseHandToken(sides[0]!, raw);
      const Rt = parseHandToken(sides[1]!, raw);
      const lPair = L.hi === L.lo;
      const rPair = Rt.hi === Rt.lo;
      if (lPair !== rPair || L.suffix !== Rt.suffix) throw new Error(`Bad range token "${raw}": both ends must be the same kind of hand`);
      const kinds = L.suffix ? [L.suffix] : ['s', 'o'];
      if (lPair) {
        for (let r = Math.min(L.hi, Rt.hi); r <= Math.max(L.hi, Rt.hi); r++) put(RANK_CHARS[r]! + RANK_CHARS[r]!, weight);
      } else if (L.hi === Rt.hi) {
        // same high card, kicker range: A5s-A2s
        for (let k = Math.min(L.lo, Rt.lo); k <= Math.max(L.lo, Rt.lo); k++) for (const sfx of kinds) put(norm(L.hi, k, sfx), weight);
      } else {
        // same gap connectors: T9s-65s
        const gap = L.hi - L.lo;
        if (Rt.hi - Rt.lo !== gap) throw new Error(`Bad range token "${raw}": a connector range needs the same gap at both ends`);
        for (let hi = Math.min(L.hi, Rt.hi); hi <= Math.max(L.hi, Rt.hi); hi++) for (const sfx of kinds) put(norm(hi, hi - gap, sfx), weight);
      }
      continue;
    }
    // A single token, optionally with "+"
    const plus = token.endsWith('+');
    const { hi, lo, suffix } = parseHandToken(plus ? token.slice(0, -1) : token, raw);
    if (hi === lo) {
      for (let r = hi; r <= (plus ? 12 : hi); r++) put(RANK_CHARS[r]! + RANK_CHARS[r]!, weight);
      continue;
    }
    const kinds = suffix === '' ? ['s', 'o'] : [suffix];
    for (let l = lo; l <= (plus ? hi - 1 : lo); l++) for (const k of kinds) put(norm(hi, l, k), weight);
  }
  return range;
}

export function rangeLabels(r: Range): string[] {
  return ALL_LABELS.filter((l) => (r.get(l) ?? 0) > 0);
}

/** Percentage of all 1326 starting hands this range covers (weighted). */
export function rangePercent(r: Range): number {
  let c = 0;
  for (const [l, w] of r) c += comboCount(l) * w;
  return (100 * c) / 1326;
}

/** Expand to specific combos, removing any that use dead cards. */
export function expandRange(r: Range, dead: readonly Card[] = []): Combo[] {
  const deadSet = new Set(dead);
  const out: Combo[] = [];
  for (const [label, weight] of r) {
    if (weight <= 0) continue;
    for (const hand of labelCombos(label)) {
      if (deadSet.has(hand[0]) || deadSet.has(hand[1])) continue;
      out.push({ hand, weight });
    }
  }
  return out;
}

export function rangeHas(r: Range, a: Card, b: Card): boolean {
  return (r.get(handLabel(a, b)) ?? 0) > 0;
}

export function singleHandRange(a: Card, b: Card): Combo[] {
  return [{ hand: [a, b], weight: 1 }];
}

/** Union of ranges keeping the max weight. */
export function unionRanges(...rs: Range[]): Range {
  const out: Range = new Map();
  for (const r of rs) for (const [l, w] of r) out.set(l, Math.max(out.get(l) ?? 0, w));
  return out;
}

export function subtractRange(a: Range, b: Range): Range {
  const out: Range = new Map();
  for (const [l, w] of a) if (!(b.get(l) ?? 0)) out.set(l, w);
  return out;
}

export { rankOf, suitOf };
