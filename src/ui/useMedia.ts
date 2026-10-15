import { useEffect, useState } from 'react';

/** Tracks a CSS media query (for the few layout decisions that cannot be made in CSS alone). */
export function useMedia(query: string): boolean {
  const get = (): boolean => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(query);
    const on = (): void => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Phones in portrait (and any similarly narrow window). The table switches to a tall, compact layout. */
export const NARROW_QUERY = '(max-width: 640px)';
