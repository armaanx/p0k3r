import type { ReactNode } from 'react';

/**
 * Thin line-art animal avatars (1.5px strokes, rounded caps) in bone on dark paper.
 * Monochrome by design: the player type is told by the drawing and the name, never by a colour.
 * `color` is accepted for API compatibility and ignored.
 */
export function Avatar({ kind, size = 44 }: { kind: string; color?: string; size?: number }) {
  let art: ReactNode;
  switch (kind) {
    case 'owl':
      art = (
        <>
          <path d="M14 15l3.5-5 3 4.2M34 15l-3.5-5-3 4.2" />
          <path d="M12.5 26c0-7 5-12 11.5-12s11.5 5 11.5 12-5 11.5-11.5 11.5S12.5 33 12.5 26z" />
          <circle cx="19" cy="24.5" r="4.2" />
          <circle cx="29" cy="24.5" r="4.2" />
          <circle cx="19" cy="24.5" r="1" fill="currentColor" />
          <circle cx="29" cy="24.5" r="1" fill="currentColor" />
          <path d="M24 28l-1.6 3h3.2z" />
        </>
      );
      break;
    case 'cat':
      art = (
        <>
          <path d="M11 24l1.5-12.5 8 6.2M37 24l-1.5-12.5-8 6.2" />
          <path d="M11.5 25c0-5.8 5.6-9 12.5-9s12.5 3.2 12.5 9-5.6 11-12.5 11-12.5-5.2-12.5-11z" />
          <path d="M18.5 24v2.2M29.5 24v2.2" />
          <path d="M22.5 29.5h3l-1.5 1.6z" />
          <path d="M9 29.5l7 .8M9 33l7-1M39 29.5l-7 .8M39 33l-7-1" />
        </>
      );
      break;
    case 'fox':
      art = (
        <>
          <path d="M10.5 22.5L12.5 9l8.2 7.6M37.5 22.5L35.5 9l-8.2 7.6" />
          <path d="M10.5 22.5c4-5 8.4-6.6 13.5-6.6s9.5 1.6 13.5 6.6L24 39z" />
          <path d="M15.5 28.5c3 2 5.6 2.8 8.5 2.8s5.5-.8 8.5-2.8" />
          <circle cx="18.5" cy="24" r="1.1" fill="currentColor" />
          <circle cx="29.5" cy="24" r="1.1" fill="currentColor" />
          <circle cx="24" cy="36.3" r="1.2" fill="currentColor" />
        </>
      );
      break;
    case 'heron':
      art = (
        <>
          <circle cx="21" cy="25" r="10.5" />
          <path d="M19 14.5c3-4 7.5-5 11-3.5-3.2.6-5.4 2.2-6.4 4.6" />
          <path d="M31 23.5l11 3.2-11 2.4" />
          <circle cx="25" cy="22.5" r="1.2" fill="currentColor" />
          <path d="M14 33c2 2 4.4 3 7 3" />
        </>
      );
      break;
    case 'wolf':
      art = (
        <>
          <path d="M11 25V9.5l9.5 7M37 25V9.5l-9.5 7" />
          <path d="M11 24c3.8-5.2 8.2-7.6 13-7.6s9.2 2.4 13 7.6l-4 9.5-9 5.5-9-5.5z" />
          <path d="M19 32.5c1.6-1.2 3.2-1.7 5-1.7s3.4.5 5 1.7" />
          <path d="M18 24.5l2.4.8M30 24.5l-2.4.8" />
          <circle cx="24" cy="35.2" r="1.2" fill="currentColor" />
        </>
      );
      break;
    default:
      art = (
        <>
          <circle cx="24" cy="19" r="6.5" />
          <path d="M12.5 37.5c1.2-6 5.6-9.5 11.5-9.5s10.3 3.5 11.5 9.5" />
        </>
      );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="avatar" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink)' }}>
      <circle cx="24" cy="24" r="23" fill="var(--raised)" stroke="var(--line-strong)" strokeWidth="1" />
      {art}
    </svg>
  );
}
