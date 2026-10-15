import type { ReactNode } from 'react';

/** Custom thin line icons (24 x 24 grid, 1.5px strokes, rounded caps and joins). No icon font, no emoji. */
export type IconName =
  | 'check' | 'cross' | 'alert' | 'lock' | 'gear' | 'arrow-left' | 'arrow-right' | 'skip-start' | 'skip-end'
  | 'chev-left' | 'chev-right' | 'star' | 'star-fill' | 'approx' | 'info' | 'dot' | 'close' | 'play' | 'flag' | 'spark';

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  cross: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  close: <path d="M7 7l10 10M17 7L7 17" />,
  alert: (
    <>
      <path d="M12 6.5v7.5" />
      <path d="M12 17.6v.1" strokeWidth="2.2" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" />
    </>
  ),
  'arrow-left': <path d="M19 12H5.5M11 6l-6 6 6 6" />,
  'arrow-right': <path d="M5 12h13.5M13 6l6 6-6 6" />,
  'chev-left': <path d="M14.5 6l-6 6 6 6" />,
  'chev-right': <path d="M9.5 6l6 6-6 6" />,
  'skip-start': <path d="M7 6v12M18 6l-7.5 6 7.5 6z" />,
  'skip-end': <path d="M17 6v12M6 6l7.5 6L6 18z" />,
  star: <path d="M12 4.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 16.4l-4.6 2.4.9-5.2L4.5 10l5.2-.7z" />,
  'star-fill': <path d="M12 4.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 16.4l-4.6 2.4.9-5.2L4.5 10l5.2-.7z" fill="currentColor" />,
  approx: <path d="M5 10c2.3-2.4 4.7-2.4 7 0s4.7 2.4 7 0M5 15c2.3-2.4 4.7-2.4 7 0s4.7 2.4 7 0" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.8v.1" strokeWidth="2.2" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="3.5" fill="currentColor" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  flag: <path d="M6 20V4.5M6 5h10.5l-2 4 2 4H6" />,
  spark: <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />,
};

export function Icon({ name, size = 16, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The only three hues in the interface, each always shown with an icon and a word. */
export type StateKind = 'good' | 'warn' | 'bad' | 'info' | 'neutral';
const STATE_ICON: Record<StateKind, IconName> = { good: 'check', warn: 'alert', bad: 'cross', info: 'dot', neutral: 'dot' };

export function StateBadge({ kind, children, icon, className }: { kind: StateKind; children: ReactNode; icon?: IconName; className?: string }) {
  return (
    <span className={`state-badge state-${kind} ${className ?? ''}`}>
      <Icon name={icon ?? STATE_ICON[kind]} size={13} />
      <span>{children}</span>
    </span>
  );
}

/** Coach verdicts and their state colour + icon. */
export const VERDICT_STATE: Record<string, StateKind> = { great: 'good', fine: 'good', inaccuracy: 'warn', mistake: 'bad', blunder: 'bad' };


/** Answer marks shown after grading: always icon + word. */
export function Mark({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span className="mark" aria-label={label ?? (ok ? 'correct' : 'your answer, incorrect')}>
      <Icon name={ok ? 'check' : 'cross'} size={14} />
      <span aria-hidden="true">{ok ? 'Correct' : 'Your pick'}</span>
    </span>
  );
}

/** Coach / drill confidence tier. "Judgment call" is a close call, so it carries the caution colour with its icon. */
export function TierTag({ tier, label }: { tier: 'math' | 'standard' | 'judgment'; label?: string }) {
  const text = label ?? (tier === 'math' ? 'Math (exact)' : tier === 'standard' ? 'Standard play' : 'Judgment call');
  return (
    <span className={`tag tag-${tier}`}>
      {tier === 'judgment' && <Icon name="approx" size={12} />}
      {text}
    </span>
  );
}


const VERDICT_ICON: Record<string, IconName> = { great: 'check', fine: 'check', inaccuracy: 'alert', mistake: 'cross', blunder: 'cross' };

/** A coach verdict: icon + word + muted state colour ("✓ Great", "! Inaccuracy", "✕ Mistake"). */
export function VerdictChip({ verdict, label }: { verdict: string; label: string }) {
  return (
    <span className={`verdict-chip verdict-chip-${verdict}`}>
      <Icon name={VERDICT_ICON[verdict] ?? 'dot'} size={12} />
      {label}
    </span>
  );
}
