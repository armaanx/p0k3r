// localStorage with graceful fallback to memory (private mode, file:// quirks, quota errors).
import { freshProgress, normalize, type Progress } from './types';

export const STORAGE_KEY = 'p0k3r.v1';

let memory: string | null = null;
let persistent = true;

export function storageIsPersistent(): boolean {
  return persistent;
}

export function loadProgress(): Progress {
  let text: string | null = null;
  try {
    text = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    persistent = false;
    text = memory;
  }
  if (!text) return freshProgress();
  try {
    return normalize(JSON.parse(text));
  } catch {
    return freshProgress();
  }
}

export function saveProgress(p: Progress): void {
  const text = JSON.stringify(p);
  memory = text;
  try {
    window.localStorage.setItem(STORAGE_KEY, text);
    persistent = true;
  } catch {
    persistent = false;
  }
}

export function clearProgress(): void {
  memory = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function exportJson(p: Progress): string {
  return JSON.stringify({ app: 'p0k3r', exportedAt: new Date().toISOString(), data: p }, null, 2);
}

/** Parse an exported file. Throws a readable Error when the file is not a p0k3r export. */
export function parseImport(text: string): Progress {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const o = obj as { app?: string; data?: unknown };
  if (o && o.app === 'p0k3r' && o.data) return normalize(o.data);
  if (o && typeof o === 'object' && 'settings' in (o as object) && 'srs' in (o as object)) return normalize(o);
  throw new Error('That file does not look like a p0k3r progress export.');
}

/** Trigger a browser download (works from file://). */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
