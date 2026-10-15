import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearProgress, exportJson, loadProgress, parseImport, saveProgress, storageIsPersistent, STORAGE_KEY } from './storage';
import { DEFAULT_SETTINGS, freshProgress, normalize, SCHEMA_VERSION, type Progress } from './types';
import { dayKey, withAttempt, withLessonDone, withSeenTerms } from './actions';

function fakeStorage(opts: { failGet?: boolean; failSet?: boolean } = {}): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => { if (opts.failGet) throw new Error('blocked'); return m.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (opts.failSet) throw new Error('quota'); m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  } as Storage;
}
const setStorage = (s: Storage): void => { (globalThis as unknown as { window: unknown }).window = { localStorage: s }; };

const populated = (): Progress => {
  let p = freshProgress(1000);
  p.firstRunDone = true;
  p = withAttempt(p, { t: 5000, concept: 'pot-odds', spot: 'odds:draw', kind: 'pot-odds', correct: false, confidence: 3 });
  p = withLessonDone(p, 'm0-l1', 0.9);
  p = withSeenTerms(p, ['pot', 'blinds']);
  p.settings = { ...p.settings, largeCards: true, textScale: 130, coach: 'full' };
  p.skippedModules = ['2'];
  return p;
};

describe('persistence', () => {
  beforeEach(() => setStorage(fakeStorage()));
  afterEach(() => clearProgress());

  it('saves and loads progress through localStorage', () => {
    const p = populated();
    saveProgress(p);
    expect(storageIsPersistent()).toBe(true);
    expect(loadProgress()).toEqual(p);
  });

  it('starts fresh when nothing is stored or the stored text is corrupt', () => {
    expect(loadProgress().firstRunDone).toBe(false);
    (window.localStorage as Storage).setItem(STORAGE_KEY, '{not json');
    expect(loadProgress().lessons).toEqual({});
  });

  it('falls back gracefully when storage is blocked (private mode, file:// policies)', () => {
    setStorage(fakeStorage({ failGet: true, failSet: true }));
    expect(() => saveProgress(populated())).not.toThrow();
    expect(storageIsPersistent()).toBe(false);
    const p = loadProgress(); // served from the in-memory copy
    expect(p.lessons['m0-l1']?.done).toBe(true);
    expect(() => clearProgress()).not.toThrow();
  });

  it('survives a full quota', () => {
    setStorage(fakeStorage({ failSet: true }));
    expect(() => saveProgress(populated())).not.toThrow();
    expect(storageIsPersistent()).toBe(false);
  });
});

describe('export / import / reset', () => {
  it('round-trips everything through an exported file', () => {
    const p = populated();
    const text = exportJson(p);
    expect(JSON.parse(text).app).toBe('p0k3r');
    expect(parseImport(text)).toEqual(p);
  });

  it('rejects files that are not progress exports, with a readable message', () => {
    expect(() => parseImport('hello')).toThrow(/not valid JSON/);
    expect(() => parseImport('{"foo":1}')).toThrow(/does not look like/);
    expect(() => parseImport('[1,2,3]')).toThrow();
  });

  it('accepts a raw progress object and upgrades older or partial saves', () => {
    const old = { settings: { theme: 'study', fourColorDeck: true, largeCards: true }, srs: {}, lessons: { 'm0-l1': { done: true, step: 0 } } };
    const p = parseImport(JSON.stringify(old));
    expect(p.version).toBe(SCHEMA_VERSION);
    expect(p.settings.largeCards).toBe(true);
    expect('theme' in p.settings).toBe(false); // retired setting is dropped
    expect('fourColorDeck' in p.settings).toBe(false);
    expect(p.settings.coach).toBe(DEFAULT_SETTINGS.coach);
    expect(p.hands).toEqual([]);
  });

  it('reset removes stored progress', () => {
    setStorage(fakeStorage());
    saveProgress(populated());
    clearProgress();
    expect(loadProgress().firstRunDone).toBe(false);
  });
});

describe('normalize never throws on garbage', () => {
  it.each([null, undefined, 42, 'x', [], [1], {}, { settings: 5, srs: [], lessons: 'a', attempts: {}, hands: 7 }, { settings: null }])('%j', (bad) => {
    const p = normalize(bad);
    expect(Array.isArray(p.attempts)).toBe(true);
    expect(Array.isArray(p.hands)).toBe(true);
    expect(typeof p.srs).toBe('object');
    expect(p.settings.coach).toBeTruthy();
  });
});

describe('progress actions', () => {
  it('a graded attempt updates history, the review schedule, and the practice day', () => {
    const t = new Date(2026, 2, 5, 10).getTime();
    const p = withAttempt(freshProgress(), { t, concept: 'outs', spot: 'outs:flush', kind: 'outs', correct: true });
    expect(p.attempts).toHaveLength(1);
    expect(Object.keys(p.srs).sort()).toEqual(['c:outs', 's:outs:flush']);
    expect(p.days).toEqual([dayKey(t)]);
    expect(withAttempt(p, { t: t + 1000, concept: 'outs', spot: 'outs:flush', kind: 'outs', correct: true }).days).toHaveLength(1);
  });
  it('caps stored attempts so storage stays small', () => {
    let p = freshProgress();
    for (let i = 0; i < 3100; i++) p = withAttempt(p, { t: i, concept: 'x', spot: 'x', kind: 'x', correct: true });
    expect(p.attempts).toHaveLength(3000);
  });
});
