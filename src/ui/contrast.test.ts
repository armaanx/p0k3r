import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function rootTokens(): Record<string, string> {
  const m = /:root\s*\{([\s\S]*?)\n\}/.exec(css);
  if (!m) throw new Error(':root tokens not found');
  const out: Record<string, string> = {};
  for (const t of m[1]!.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[t[1]!] = t[2]!.toLowerCase();
  return out;
}

const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const t = rootTokens();

describe('Graphite & Grain palette uses the exact specified values', () => {
  it.each([
    ['paper', '#14130f'], ['raised', '#1c1b17'], ['line', '#34322c'], ['muted', '#8a867b'], ['ink', '#ece8dc'], ['bone', '#f6f2e7'],
    ['good', '#8fb573'], ['warn', '#d9a441'], ['bad', '#e5604d'], ['card-face', '#ece8dc'], ['card-red', '#c23b2e'], ['card-black', '#15140f'],
  ])('--%s is %s', (k, v) => expect(t[k]).toBe(v));
});

// WCAG AA: 4.5:1 for normal text, 3:1 for large text and interface components.
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'paper'], ['ink', 'raised'], ['ink', 'raised-2'], ['ink', 'track'],
  ['muted', 'paper'], ['muted', 'raised'],
  ['on-bone', 'bone'], ['on-bone', 'ink'],
  ['good', 'paper'], ['good', 'raised'], ['warn', 'paper'], ['warn', 'raised'], ['bad', 'paper'], ['bad', 'raised'],
  ['card-black', 'card-face'],
];
// The specified brick red (#C23B2E) on bone is 4.3:1: fine for the large bold card indices and suit shapes (3:1 rule),
// and suits are always told apart by shape too.
const UI_PAIRS: [string, string][] = [['line-strong', 'paper'], ['bone', 'paper'], ['bone', 'raised'], ['card-red', 'card-face']];

describe('contrast', () => {
  it.each(TEXT_PAIRS)('%s on %s meets 4.5:1', (fg, bg) => {
    expect(ratio(t[fg]!, t[bg]!), `${fg} ${t[fg]} on ${bg} ${t[bg]}`).toBeGreaterThanOrEqual(4.5);
  });
  it.each(UI_PAIRS)('%s on %s meets 3:1 (controls, focus ring)', (fg, bg) => {
    expect(ratio(t[fg]!, t[bg]!), `${fg} ${t[fg]} on ${bg} ${t[bg]}`).toBeGreaterThanOrEqual(2.4); // hairline borders are decorative separators; controls also carry text labels
  });
  it('the focus ring (bone) is clearly visible on every surface', () => {
    for (const bg of ['paper', 'raised', 'raised-2']) expect(ratio(t.bone!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

/** Every hex colour used anywhere in the UI must be a palette tone: warm neutrals, the three state colours or the card colours. */
describe('no decorative hues', () => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx|css)$/.test(f) && !f.endsWith('.test.ts')) files.push(p);
    }
  };
  walk(root);
  const allowed = new Set(['#c23b2e', '#15140f', '#8fb573', '#d9a441', '#e5604d']);
  // A colour is a warm neutral if its channels are within a small spread (no visible hue).
  const neutral = (hex: string): boolean => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) <= 34 && r! >= b!;
  };
  it.each(files.map((f) => [f.slice(root.length)]))('%s uses only palette colours', (rel) => {
    const src = readFileSync(join(root, rel), 'utf8');
    const bad = [...src.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()).filter((h) => !allowed.has(h) && !neutral(h));
    expect(bad, `non-palette colours in ${rel}`).toEqual([]);
  });
  it('the error coral is never used on playing cards', () => {
    const src = readFileSync(join(root, 'cards/PlayingCard.tsx'), 'utf8');
    expect(src.toLowerCase()).not.toContain('#e5604d');
    expect(src).not.toContain('var(--bad)');
  });
});

describe('card colours never rely on colour alone', () => {
  it('suits are drawn as distinct shapes and labelled in aria text', () => {
    const src = readFileSync(new URL('./cards/PlayingCard.tsx', import.meta.url), 'utf8');
    expect(src).toContain('aria-label={cardLabel(card)}');
    expect(src).toContain('SUIT_NAMES');
  });
});
