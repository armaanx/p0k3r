// Heads-up push/fold charts: the Nash equilibrium of the game where the small blind (the button) may only move all-in
// or fold, and the big blind may only call or fold. Chip EV, no ante. Computed offline by scripts/gen-push-fold.mjs
// (equity between all 169 hand classes, then CFR+), which also measures how exploitable the charts are.
import { ALL_LABELS, comboCount, type Range } from './ranges';
import { PF_CALL_EV_B64, PF_CALL_MASKS, PF_DEPTHS, PF_EXPLOITABILITY, PF_SHOVE_EV_B64, PF_SHOVE_MASKS } from './pushFoldData';

export { PF_DEPTHS, PF_EXPLOITABILITY };
export const PF_MIN_BB = PF_DEPTHS[0]!;
export const PF_MAX_BB = PF_DEPTHS[PF_DEPTHS.length - 1]!;

const INDEX: ReadonlyMap<string, number> = new Map(ALL_LABELS.map((l, i) => [l, i] as const));

function decodeEv(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}
let shoveEv: Int16Array | null = null;
let callEv: Int16Array | null = null;

const bit = (mask: string, i: number): boolean => ((parseInt(mask[i >> 2]!, 16) >> (i & 3)) & 1) === 1;

/** Index of the chart for an effective stack, rounded to the nearest half big blind and clamped to 1.5 to 20. */
export function depthIndex(stackBB: number): number {
  const d = Math.min(PF_MAX_BB, Math.max(PF_MIN_BB, Math.round(stackBB * 2) / 2));
  return PF_DEPTHS.indexOf(d);
}
export const chartDepth = (stackBB: number): number => PF_DEPTHS[depthIndex(stackBB)]!;

export type PushFoldRole = 'shove' | 'call';

/** Is `label` in the small blind's all-in range (role 'shove') or the big blind's calling range (role 'call')? */
export function inChart(role: PushFoldRole, label: string, stackBB: number): boolean {
  const i = INDEX.get(label);
  if (i === undefined) throw new Error(`unknown hand ${label}`);
  return bit((role === 'shove' ? PF_SHOVE_MASKS : PF_CALL_MASKS)[depthIndex(stackBB)]!, i);
}

/**
 * Chip EV of the chart's aggressive option minus folding, in big blinds, when the other player follows their chart:
 * shove minus fold for the small blind, call minus fold for the big blind facing the shove.
 */
export function chartEdgeBB(role: PushFoldRole, label: string, stackBB: number): number {
  const i = INDEX.get(label);
  if (i === undefined) throw new Error(`unknown hand ${label}`);
  const arr = role === 'shove' ? (shoveEv ??= decodeEv(PF_SHOVE_EV_B64)) : (callEv ??= decodeEv(PF_CALL_EV_B64));
  return arr[depthIndex(stackBB) * ALL_LABELS.length + i]! / 100;
}

const rangeCache = new Map<string, Range>();
/** The chart as a range (treat as read-only). */
export function chartRange(role: PushFoldRole, stackBB: number): Range {
  const k = `${role}:${depthIndex(stackBB)}`;
  let r = rangeCache.get(k);
  if (!r) {
    r = new Map();
    for (const l of ALL_LABELS) if (inChart(role, l, stackBB)) r.set(l, 1);
    rangeCache.set(k, r);
  }
  return r;
}

/** Share of all 1,326 starting hands in the chart, in percent. */
export function chartPercent(role: PushFoldRole, stackBB: number): number {
  let c = 0;
  for (const l of chartRange(role, stackBB).keys()) c += comboCount(l);
  return (100 * c) / 1326;
}

/** The largest stack (in big blinds) at which the hand is in the chart, or null if it never is. */
export function maxDepth(role: PushFoldRole, label: string): number | null {
  let last: number | null = null;
  for (const d of PF_DEPTHS) if (inChart(role, label, d)) last = d;
  return last;
}

/**
 * A close decision: the two options are within `tolerance` big blinds of each other, or the answer changes within half a
 * big blind of this stack size (so rounding the stack could flip it).
 */
export function isCloseCall(role: PushFoldRole, label: string, stackBB: number, tolerance = 0.05): boolean {
  if (Math.abs(chartEdgeBB(role, label, stackBB)) < tolerance) return true;
  const here = inChart(role, label, stackBB);
  return inChart(role, label, stackBB - 0.5) !== here || inChart(role, label, stackBB + 0.5) !== here;
}
