import type { Card } from '../cards';
import type { Tier } from '../coach/advice';
import type { Position } from '../preflopCharts';

export type DrillType =
  | 'hand-category'
  | 'rank-winner'
  | 'best-five'
  | 'position-name'
  | 'tier-place'
  | 'open-fold'
  | 'facing-raise'
  | 'made-draw-air'
  | 'board-texture'
  | 'outs'
  | 'pot-odds'
  | 'equity-guess'
  | 'bet-size'
  | 'player-type'
  | 'mdf'
  | 'spr';

export interface Visual {
  hole?: Card[];
  board?: Card[];
  /** Named hands that share a board (which hand wins?). */
  hands?: { label: string; cards: Card[] }[];
  pot?: number;
  bet?: number;
  stack?: number;
  /** Table diagram for position questions. */
  seats?: { position: Position; hero?: boolean; button?: boolean; raiser?: boolean }[];
  /** Revealed with the feedback: outs, best five, etc. */
  highlight?: Card[];
  /** The highlighted cards are outs to show separately (not part of the board/hand). */
  highlightIsOuts?: boolean;
  grid?: { primary: string[]; secondary?: string[]; primaryLabel: string; secondaryLabel?: string; focus?: string };
  stats?: { vpip?: number; pfr?: number; af?: number };
  tells?: string[];
  /** Short line shown under the cards (e.g. "You have 9 outs"). */
  note?: string;
}

export type DrillInput =
  | { kind: 'choice'; options: string[] }
  | { kind: 'slider'; min: number; max: number; step: number; unit: string }
  | { kind: 'cards'; pool: Card[]; pick: number };

export interface DrillItem {
  id: string;
  type: DrillType;
  /** SRS concept id, e.g. "pot-odds". */
  concept: string;
  /** SRS spot id, e.g. "open:UTG". */
  spot: string;
  module: number;
  difficulty: 1 | 2 | 3;
  prompt: string;
  visual: Visual;
  input: DrillInput;
  /** choice: acceptable option indices. slider: [true value]. cards: unused. */
  answer: number[];
  /** The option to highlight as "the" answer when several are acceptable. */
  bestIndex: number;
  tolerance: number;
  /** For `cards` input: the best achievable hand score. */
  bestScore?: number;
  explanation: string;
  /** Targeted feedback for a specific wrong option index. */
  wrong: Record<number, string>;
  tier: Tier;
  /** Suggested time budget in seconds. */
  seconds: number;
}

export interface DrillGrade {
  correct: boolean;
  /** The response was in the acceptable set but not the best one (a "close spot"). */
  alternative: boolean;
  feedback: string;
}
