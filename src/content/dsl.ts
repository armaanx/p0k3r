import type { Choice, QuizItem, Step, StepVisual } from './types';

export const read = (body: string, visual?: StepVisual, title?: string): Step => ({ kind: 'read', body, visual, title });

/** Multiple-choice retrieval question. The first option is NOT special: pass the index of the correct one. */
export const ask = (concept: string, prompt: string, options: Choice[], correct: number, explain: string, visual?: StepVisual): Step => ({
  kind: 'ask', concept, prompt, options, correct, explain, visual,
});

export const item = (concept: string, prompt: string, options: Choice[], correct: number, explain: string, visual?: StepVisual): QuizItem => ({
  concept, prompt, options, correct, explain, visual,
});

export const opt = (text: string, why: string): Choice => ({ text, why });

export const worked = (title: string, steps: string[], takeaway: string, visual?: StepVisual): Step => ({ kind: 'worked', title, steps, takeaway, visual });

export const complete = (
  title: string, given: string[], blanks: { prompt: string; options: string[]; correct: number; why: string }[], takeaway: string, visual?: StepVisual,
): Step => ({ kind: 'complete', title, given, blanks, takeaway, visual });

export const quiz = (items: QuizItem[], passAt: number, label?: string): Step => ({ kind: 'quiz', items, passAt, label });
