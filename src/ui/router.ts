import { useEffect, useState } from 'react';

/** Tiny hash router: works from file:// and keeps the browser back button useful. */
export function useRoute(): [string, (to: string) => void] {
  const read = (): string => (window.location.hash.replace(/^#/, '') || '/');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = (): void => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (to) => { window.location.hash = to; }];
}
