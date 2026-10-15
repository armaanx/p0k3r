import { memo } from 'react';
import { type Card, RANK_CHARS, RANK_NAMES, SUIT_NAMES, rankOf, suitOf } from '../../engine/cards';

// Suit glyphs drawn in a 20x20 box so they stay crisp at any size.
const SUIT_PATHS: Record<number, string> = {
  // clubs (0): drawn as circles below; path is the stem only
  0: 'M10 9 L8.2 20 L11.8 20 Z',
  // diamonds
  1: 'M10 0 C11.5 4.6 15.4 8.2 19 10 C15.4 11.8 11.5 15.4 10 20 C8.5 15.4 4.6 11.8 1 10 C4.6 8.2 8.5 4.6 10 0 Z',
  // hearts
  2: 'M10 19 C3 13.6 0.5 9.6 0.5 6 C0.5 2.8 2.9 0.8 5.4 0.8 C7.4 0.8 9.1 1.9 10 3.7 C10.9 1.9 12.6 0.8 14.6 0.8 C17.1 0.8 19.5 2.8 19.5 6 C19.5 9.6 17 13.6 10 19 Z',
  // spades
  3: 'M10 0.5 C12.5 4.6 19.5 8 19.5 12.6 C19.5 15.4 17.4 17 15 17 C13.2 17 11.8 16.2 11 15 C11.1 17.2 11.7 18.8 13.4 20 L6.6 20 C8.3 18.8 8.9 17.2 9 15 C8.2 16.2 6.8 17 5 17 C2.6 17 0.5 15.4 0.5 12.6 C0.5 8 7.5 4.6 10 0.5 Z',
};

/** Classic two-colour deck: brick red on bone for hearts/diamonds, near-black for spades/clubs. */
export function suitColor(suit: number): string {
  return suit === 1 || suit === 2 ? '#c23b2e' : '#15140f';
}

export function SuitGlyph({ suit, size = 20, color, x = 0, y = 0, rotate = 0 }: { suit: number; size?: number; color: string; x?: number; y?: number; rotate?: number }) {
  const s = size / 20;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s}) translate(-10 -10)`} fill={color}>
      {suit === 0 ? (
        <>
          <circle cx="10" cy="5.3" r="4.6" />
          <circle cx="4.9" cy="12.4" r="4.6" />
          <circle cx="15.1" cy="12.4" r="4.6" />
          <circle cx="10" cy="10" r="3.2" />
          <path d={SUIT_PATHS[0]} />
        </>
      ) : (
        <path d={SUIT_PATHS[suit]} />
      )}
    </g>
  );
}

export interface PlayingCardProps {
  card: Card;
  width?: number;
  /** Dim the card (used to de-emphasise cards that are not part of the best five). */
  dim?: boolean;
  /** Selection ring (cards that make the hand). */
  glow?: boolean;
  className?: string;
}

export const cardLabel = (c: Card): string => `${RANK_NAMES[rankOf(c)]} of ${SUIT_NAMES[suitOf(c)]}`;

const INDEX_FONT = "'Hanken Grotesk', system-ui, sans-serif";

export const PlayingCard = memo(function PlayingCard({ card, width = 64, dim, glow, className }: PlayingCardProps) {
  const r = rankOf(card);
  const s = suitOf(card);
  const color = suitColor(s);
  const rc = RANK_CHARS[r] === 'T' ? '10' : RANK_CHARS[r]!;
  const ten = rc === '10';
  const compact = width < 50;
  return (
    <svg
      viewBox="0 0 100 140"
      width={width}
      height={(width * 140) / 100}
      role="img"
      aria-label={cardLabel(card)}
      className={`pcard ${glow ? 'pcard-glow' : ''} ${dim ? 'pcard-dim' : ''} ${className ?? ''}`}
    >
      <rect x="0.5" y="0.5" width="99" height="139" rx="8" fill="#ece8dc" />
      <rect x="0.5" y="0.5" width="99" height="139" rx="8" fill="url(#cardGrain)" />
      <rect x="0.5" y="0.5" width="99" height="139" rx="8" fill="none" stroke="#b3ac9a" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {compact ? (
        <>
          {/* Small cards: one large index and a large suit, so they stay legible at 30-48px wide. */}
          <text x="9" y="50" fontFamily={INDEX_FONT} fontWeight="700" fontSize={ten ? 40 : 50} letterSpacing={ten ? -4 : 0} fill={color}>{rc}</text>
          <SuitGlyph suit={s} size={46} color={color} x={62} y={100} />
        </>
      ) : (
        <>
      {/* Top-left index: rank above a small suit. */}
      <text x="15" y="31" textAnchor="middle" fontFamily={INDEX_FONT} fontWeight="700" fontSize={ten ? 25 : 30} letterSpacing={ten ? -2.5 : 0} fill={color}>{rc}</text>
      <SuitGlyph suit={s} size={15} color={color} x={15} y={44} />
      {/* Bottom-right index, upright (avoids the 6/9 ambiguity of a rotated index). */}
      <text x="85" y="118" textAnchor="middle" fontFamily={INDEX_FONT} fontWeight="700" fontSize={ten ? 25 : 30} letterSpacing={ten ? -2.5 : 0} fill={color}>{rc}</text>
      <SuitGlyph suit={s} size={15} color={color} x={85} y={130} />
      {/* One big suit glyph in the centre. */}
      <SuitGlyph suit={s} size={42} color={color} x={50} y={72} />
        </>
      )}
    </svg>
  );
});

export const CardBack = memo(function CardBack({ width = 64, className }: { width?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 140" width={width} height={(width * 140) / 100} role="img" aria-label="Face-down card" className={`pcard ${className ?? ''}`}>
      <rect x="0.5" y="0.5" width="99" height="139" rx="8" fill="#1c1b17" />
      <rect x="0.5" y="0.5" width="99" height="139" rx="8" fill="url(#backGrain)" />
      <rect x="0.5" y="0.5" width="99" height="139" rx="8" fill="none" stroke="#5a574e" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <rect x="9" y="9" width="82" height="122" rx="4" fill="url(#backLattice)" stroke="#5a574e" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <rect x="38" y="58" width="24" height="24" rx="2" transform="rotate(45 50 70)" fill="#1c1b17" stroke="#8a867b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

/* Paper grain for card faces (darker fibres on bone) and backs (light fibres on charcoal). Rendered once as images. */
const FACE_GRAIN = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='140'><filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='1.1 0.75' numOctaves='3' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.33  0 0 0 0 0.3  0 0 0 0 0.24  -0.7 0 0 0 0.36'/></filter><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.05' numOctaves='2' seed='9' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.3  0.25 0 0 0 -0.09'/></filter><rect width='100%' height='100%' filter='url(#f)'/><rect width='100%' height='100%' filter='url(#g)'/></svg>",
)}`;
const BACK_GRAIN = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='140'><filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='1.2 0.8' numOctaves='3' seed='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.95  0 0 0 0 0.93  0 0 0 0 0.87  0.55 0 0 0 -0.24'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>",
)}`;

/** Shared pattern definitions; render once near the root of the app. */
export function CardDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="cardGrain" patternUnits="userSpaceOnUse" width="100" height="140">
          <image href={FACE_GRAIN} width="100" height="140" />
        </pattern>
        <pattern id="backGrain" patternUnits="userSpaceOnUse" width="100" height="140">
          <image href={BACK_GRAIN} width="100" height="140" />
        </pattern>
        {/* Fine hairline geometric lattice for card backs. */}
        <pattern id="backLattice" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <path d="M0 0 H8 M0 0 V8" stroke="#3e3c35" strokeWidth="0.6" fill="none" />
        </pattern>
      </defs>
    </svg>
  );
}
