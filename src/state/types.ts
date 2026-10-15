// Persisted data model. Bump SCHEMA_VERSION and extend `normalize` when the shape changes.
import type { Archetype } from '../engine/bots';
import type { ReplayRecord } from '../engine/game';

export const SCHEMA_VERSION = 1;

export type CoachLevel = 'off' | 'hints' | 'full';

export interface Settings {
  largeCards: boolean;
  sound: boolean;
  textScale: 100 | 115 | 130;
  coach: CoachLevel;
  /** In Full coach mode, ask the learner to commit to a plan before showing the recommendation. */
  thinkFirst: boolean;
  /** Let coach help fade as mastery of a concept grows. */
  autoFade: boolean;
  /** Show amounts in big blinds instead of chips. */
  showBB: boolean;
  /** 'system' follows the OS preference. */
  reducedMotion: 'system' | 'on' | 'off';
  botSpeed: 'fast' | 'normal';
  tableSize: 6 | 2;
  stackBB: number;
}

export const DEFAULT_SETTINGS: Settings = {
  largeCards: false,
  sound: false,
  textScale: 100,
  coach: 'hints',
  thinkFirst: true,
  autoFade: true,
  showBB: false,
  reducedMotion: 'system',
  botSpeed: 'normal',
  tableSize: 6,
  stackBB: 100,
};

/** Keep only known settings keys (older saves may carry retired ones such as `theme` or `fourColorDeck`). */
function normalizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (k in src && typeof src[k] === typeof DEFAULT_SETTINGS[k]) (out as unknown as Record<string, unknown>)[k] = src[k];
  }
  return out;
}

/** Spaced-repetition state for one concept/spot. */
export interface SrsItem {
  id: string;
  ease: number;
  /** Current interval in days. */
  interval: number;
  /** Epoch ms when the item is next due. */
  due: number;
  reps: number;
  lapses: number;
  /** Leitner box 0..5 (0 = new/failed). */
  box: number;
  last: number;
}

export interface Attempt {
  t: number;
  /** Concept this attempt practises, e.g. "pot-odds". */
  concept: string;
  /** Specific spot, e.g. "open:UTG". */
  spot: string;
  kind: string; // drill type or 'lesson' | 'hand'
  correct: boolean;
  /** 1 = guessing, 2 = fairly sure, 3 = certain */
  confidence?: 1 | 2 | 3;
  ms?: number;
  evLostBB?: number;
  mixed?: boolean;
  /** Self-explanation result: did the learner pick sound reasoning? */
  reasoning?: 'good' | 'poor';
}

export interface LessonProgress {
  done: boolean;
  step: number;
  score?: number;
  completedAt?: number;
}

export interface GradeRecord {
  street: string;
  seat: number;
  verdict: 'great' | 'fine' | 'inaccuracy' | 'mistake' | 'blunder';
  evLostBB: number;
  tier: 'math' | 'standard' | 'judgment';
  concept: string;
  why: string;
  actionIndex: number;
}

export interface CoachCompare {
  actionIndex: number;
  committed: string;
  recommended: string;
  agreed: boolean;
}

export interface HandRecord {
  id: string;
  t: number;
  replay: ReplayRecord;
  heroSeat: number;
  archetypes: (Archetype | null)[];
  /** Hero chip result for the hand. */
  net: number;
  bb: number;
  grades?: GradeRecord[];
  evLostBB?: number;
  coachCompare?: CoachCompare[];
  /** Star for "review this later". */
  starred?: boolean;
}

export interface Progress {
  version: number;
  createdAt: number;
  firstRunDone: boolean;
  settings: Settings;
  srs: Record<string, SrsItem>;
  attempts: Attempt[];
  lessons: Record<string, LessonProgress>;
  moduleTests: Record<string, { best: number; passed: boolean; t: number }>;
  skippedModules: string[];
  hands: HandRecord[];
  /** YYYY-MM-DD days on which the learner practised. */
  days: string[];
  /** Terms the learner has already met (glossary first-use explanations). */
  seenTerms: string[];
  /** Per-day daily-loop checklist. */
  daily: Record<string, { warmup: boolean; play: boolean; review: boolean; learn: boolean }>;
}

export function freshProgress(now = Date.now()): Progress {
  return {
    version: SCHEMA_VERSION,
    createdAt: now,
    firstRunDone: false,
    settings: { ...DEFAULT_SETTINGS },
    srs: {},
    attempts: [],
    lessons: {},
    moduleTests: {},
    skippedModules: [],
    hands: [],
    days: [],
    seenTerms: [],
    daily: {},
  };
}

/** Merge unknown input (older save, imported file) onto defaults. Never throws. */
export function normalize(raw: unknown): Progress {
  const base = freshProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Progress>;
  const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  const obj = <T,>(x: unknown): Record<string, T> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, T>) : {});
  return {
    version: SCHEMA_VERSION,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : base.createdAt,
    firstRunDone: !!r.firstRunDone,
    settings: normalizeSettings(r.settings),
    srs: obj(r.srs),
    attempts: arr(r.attempts),
    lessons: obj(r.lessons),
    moduleTests: obj(r.moduleTests),
    skippedModules: arr<string>(r.skippedModules),
    hands: arr<HandRecord>(r.hands),
    days: arr<string>(r.days),
    seenTerms: arr<string>(r.seenTerms),
    daily: obj(r.daily),
  };
}
