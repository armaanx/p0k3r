// Seedable, serialisable PRNG (mulberry32). Deterministic across platforms.
export interface Rng {
  /** float in [0,1) */
  next(): number;
  /** integer in [0,n) */
  int(n: number): number;
  /** Fisher–Yates in place; returns the same array. */
  shuffle<T>(arr: T[]): T[];
  pick<T>(arr: readonly T[]): T;
  /** Derive an independent child generator (stable for a given label). */
  fork(label: string | number): Rng;
  /** Current internal state (for persistence/debug). */
  state(): number;
}

export function hashSeed(...parts: (string | number)[]): number {
  // FNV-1a over the string form; good enough for seeding.
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
      return arr;
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)]!,
    fork: (label) => createRng(hashSeed(a, label)),
    state: () => a,
  };
  return rng;
}

/** A fresh non-deterministic seed (UI only; the engine itself never calls this). */
export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
