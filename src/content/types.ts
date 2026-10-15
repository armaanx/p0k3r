import type { DrillType } from '../engine/learning/types';

/** Visual aids attached to steps. Cards are plain strings such as "As Kd" (rank + suit letter c/d/h/s). */
export interface StepVisual {
  hole?: string;
  board?: string;
  hands?: { label: string; cards: string }[];
  highlight?: string;
  /** Hand-ranking ladder from weakest to strongest. */
  ladder?: boolean;
  /** Street-by-street flow diagram. */
  flow?: boolean;
  /** Six-seat ring with the button and an optional highlighted seat. */
  seats?: { button: number; hero?: number };
  /** 13x13 range grid. */
  grid?: { spec: string; label: string; spec2?: string; label2?: string; focus?: string };
  odds?: { pot: number; bet: number };
  meter?: { equity: number; needed?: number };
  /** The 2x2 player-type map (tight/loose × passive/aggressive). */
  playerMap?: boolean;
  caption?: string;
}

export interface Choice {
  text: string;
  /** Shown after choosing this option: why it is right, or the specific misconception if wrong. */
  why: string;
}

export interface QuizItem {
  prompt: string;
  visual?: StepVisual;
  options: Choice[];
  correct: number;
  explain: string;
  concept: string;
}

export type Step =
  | { kind: 'read'; title?: string; body: string; visual?: StepVisual }
  | ({ kind: 'ask' } & QuizItem)
  | { kind: 'worked'; title: string; visual?: StepVisual; steps: string[]; takeaway: string }
  | { kind: 'complete'; title: string; visual?: StepVisual; given: string[]; blanks: { prompt: string; options: string[]; correct: number; why: string }[]; takeaway: string }
  | { kind: 'why'; prompt: string; options: { text: string; good: boolean; feedback: string }[] }
  | { kind: 'practice'; drill: DrillType | DrillType[]; count: number; difficulty: 1 | 2 | 3; label: string; mastery?: boolean; passAt?: number; confidence?: boolean }
  | { kind: 'quiz'; items: QuizItem[]; passAt: number; label?: string }
  | { kind: 'hand' }
  | { kind: 'variance-sim' };

export interface Lesson {
  id: string;
  module: number;
  title: string;
  minutes: number;
  /** One-sentence promise of what the learner will be able to do. */
  goal: string;
  steps: Step[];
}

export interface ModuleDef {
  id: number;
  title: string;
  blurb: string;
  lessons: string[];
  /** SRS concepts practised in this module (used for the mastery meter). */
  concepts: string[];
  /** Coach/explanation concepts unlocked by finishing this module. */
  unlocks: string[];
}
