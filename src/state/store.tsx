import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { freshProgress, type Progress, type Settings } from './types';
import { clearProgress, loadProgress, saveProgress } from './storage';

interface Store {
  progress: Progress;
  /** Update progress immutably. The updater receives the latest state. */
  update: (fn: (p: Progress) => Progress) => void;
  setSettings: (patch: Partial<Settings>) => void;
  replaceAll: (p: Progress) => void;
  reset: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: Progress }) {
  const [progress, setProgress] = useState<Progress>(() => initial ?? loadProgress());
  const latest = useRef(progress);
  latest.current = progress;

  // Debounced persistence
  useEffect(() => {
    const t = setTimeout(() => saveProgress(progress), 250);
    return () => clearTimeout(t);
  }, [progress]);
  useEffect(() => {
    const flush = (): void => saveProgress(latest.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const update = useCallback((fn: (p: Progress) => Progress) => setProgress((p) => fn(p)), []);
  const setSettings = useCallback((patch: Partial<Settings>) => setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), []);
  const replaceAll = useCallback((p: Progress) => setProgress(p), []);
  const reset = useCallback(() => {
    clearProgress();
    setProgress(freshProgress());
  }, []);

  const value = useMemo(() => ({ progress, update, setSettings, replaceAll, reset }), [progress, update, setSettings, replaceAll, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export const useSettings = (): Settings => useStore().progress.settings;
