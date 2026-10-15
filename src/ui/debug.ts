// Diagnostics for automated tests only: active when the URL contains "?debug". Does nothing for learners.
export function debugSet(key: string, value: unknown): void {
  const g = (window as unknown as { __p0k3r?: Record<string, unknown> }).__p0k3r;
  if (g) g[key] = value;
}
