// Hand review helpers: which moment mattered most, and how the result relates to decision quality.
import { type Grade, VERDICT_LABELS, verdictRank, type Verdict } from '../coach/grade';
import type { GradeRecord, HandRecord } from '../../state/types';
import type { Session } from '../session';

export interface HandSummary {
  /** Most serious decision in the hand (null if the hero never made a decision). */
  worst: GradeRecord | null;
  /** Overall decision grade for the hand, separate from the result. */
  decisionVerdict: Verdict | null;
  decisions: number;
  evLostBB: number;
  quadrant: 'good-won' | 'good-lost' | 'poor-won' | 'poor-lost' | 'even';
  takeaway: string;
  resultNote: string;
}

const firstSentence = (s: string): string => {
  const m = /^(.+?[.!?])(\s|$)/.exec(s.trim());
  return m ? m[1]! : s.trim();
};

const STREET_WORD: Record<string, string> = { preflop: 'before the flop', flop: 'on the flop', turn: 'on the turn', river: 'on the river' };

export function summarizeHand(h: HandRecord): HandSummary {
  const grades = h.grades ?? [];
  let worst: GradeRecord | null = null;
  for (const g of grades) {
    if (!worst || verdictRank[g.verdict] > verdictRank[worst.verdict] || (verdictRank[g.verdict] === verdictRank[worst.verdict] && g.evLostBB > worst.evLostBB)) worst = g;
  }
  const bad = !!worst && (worst.verdict === 'mistake' || worst.verdict === 'blunder');
  const decisionVerdict = worst ? (worst.verdict === 'great' ? 'fine' : worst.verdict) : null;
  const even = Math.abs(h.net) < h.bb;
  const quadrant: HandSummary['quadrant'] = even || grades.length === 0 ? 'even' : bad ? (h.net > 0 ? 'poor-won' : 'poor-lost') : h.net > 0 ? 'good-won' : 'good-lost';
  const bbAbs = Math.abs(h.net / h.bb);
  const rounded = Number(bbAbs.toFixed(1));
  const bbText = `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} big blind${rounded === 1 ? '' : 's'}`;

  let takeaway: string;
  if (grades.length === 0) takeaway = 'You did not face a decision in this hand.';
  else if (worst && bad) takeaway = `The key moment was ${STREET_WORD[worst.street] ?? worst.street}. ${firstSentence(worst.why)} ${worst.why.replace(firstSentence(worst.why), '').trim()}`.trim();
  else if (worst && worst.verdict === 'inaccuracy') takeaway = `One small leak ${STREET_WORD[worst.street] ?? worst.street}: ${firstSentence(worst.why)} Nothing serious, but it is the thing to tidy up.`;
  else takeaway = 'You made sound decisions in this hand. Nothing to fix here.';

  let resultNote: string;
  switch (quadrant) {
    case 'good-lost': resultNote = `You lost ${bbText}, but your decisions were sound. Good decisions lose sometimes: that is variance, not a mistake. Do not change anything because of this result.`; break;
    case 'poor-won': resultNote = `You won ${bbText}, but there was a mistake along the way. Winning does not make a bad decision good: repeated often, it loses money.`; break;
    case 'poor-lost': resultNote = `You lost ${bbText}, and there was also a mistake you can fix.`; break;
    case 'good-won': resultNote = `You won ${bbText} with sound decisions. That is how it is supposed to work.`; break;
    default: resultNote = 'A small pot: not much to learn from the result.';
  }
  return {
    worst, decisionVerdict, decisions: grades.length, evLostBB: h.evLostBB ?? grades.reduce((a, g) => a + g.evLostBB, 0), quadrant, takeaway, resultNote,
  };
}

/** A Session-shaped view of a saved hand so the table component can draw it. */
export function sessionFromRecord(h: HandRecord): Session {
  const r = h.replay;
  return {
    config: r.config,
    startStack: Math.max(...r.stacks),
    seats: r.stacks.map((_, i) => ({ name: r.names?.[i] ?? `Seat ${i + 1}`, isHero: i === h.heroSeat, archetype: h.archetypes[i] ?? null })),
    stacks: r.stacks,
    button: r.button,
    handNumber: r.handNumber ?? 1,
    seedBase: r.seed,
    rebuys: r.stacks.map(() => 0),
  };
}

export const verdictLabel = (v: Verdict | null): string => (v ? VERDICT_LABELS[v] : '—');

export type { Grade };
