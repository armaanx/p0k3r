// Turning an EV comparison into a verdict. Deliberately generous on judgment calls (false "mistakes" destroy trust),
// but never lenient on exact pot-odds errors.
import { tierOf } from '../preflopCharts';
import type { Advice, ActionClass, Tier } from './advice';

export type Verdict = 'great' | 'fine' | 'inaccuracy' | 'mistake' | 'blunder';

export const VERDICT_LABELS: Record<Verdict, string> = {
  great: 'Great',
  fine: 'Fine',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/** Loss thresholds in big blinds for [inaccuracy, mistake] by confidence tier. */
const THRESHOLDS: Record<Tier, { mistake: number; blunder: number }> = {
  math: { mistake: 1, blunder: 3 },
  standard: { mistake: 0.8, blunder: 2 },
  judgment: { mistake: Infinity, blunder: Infinity }, // judgment calls can never be graded harsher than an inaccuracy
};

export interface Grade {
  verdict: Verdict;
  lossBB: number;
  tier: Tier;
  cls: ActionClass;
}

export const verdictRank: Record<Verdict, number> = { great: 0, fine: 1, inaccuracy: 2, mistake: 3, blunder: 4 };

const byLoss = (loss: number, tier: Tier): Verdict => {
  const t = THRESHOLDS[tier];
  return loss >= t.blunder ? 'blunder' : loss >= t.mistake ? 'mistake' : 'inaccuracy';
};

/** Grade the `chosen` evaluation attached to an Advice (call `advise(hand, { chosen })` first). */
export function gradeAdvice(a: Advice, bb: number): Grade {
  const c = a.chosen;
  if (!c) throw new Error('advice has no chosen action');
  let loss = c.lossBB;
  const rec = a.recommended;
  const others = a.options.filter((o) => o.cls !== rec.cls).map((o) => o.ev);
  const gapBB = others.length ? (rec.ev - Math.max(...others)) / bb : 0;
  let tier: Tier = c.tier ?? a.tier;
  let verdict: Verdict;
  if (c.acceptable) verdict = c.cls === rec.cls && !c.sizeIssue && c.lossBB <= 0.1 && gapBB >= 1 && a.tier !== 'judgment' ? 'great' : 'fine';
  else verdict = byLoss(loss, tier);
  // An exact pot-odds error (folding a clearly profitable call, or making a clearly losing one) is graded as math,
  // whatever else the coach would have preferred.
  if (c.mathLossBB !== undefined && c.mathLossBB > 0) {
    const v = byLoss(c.mathLossBB, 'math');
    if (verdictRank[v] > verdictRank[verdict]) {
      verdict = v;
      tier = 'math';
      loss = Math.max(loss, c.mathLossBB);
    }
  }
  return { verdict, lossBB: loss, tier, cls: c.cls };
}

const pctS = (x: number): string => `${Math.round(x * 100)}%`;

export interface Explanation {
  /** One-line summary of what happened, e.g. "You called; folding was better." */
  summary: string;
  /** The specific misconception (or confirmation) in plain English. */
  detail: string;
}

/**
 * Targeted feedback: names the specific misunderstanding rather than a generic "incorrect".
 * Requires an Advice created with `chosen`.
 */
export function explainDecision(a: Advice, g: Grade): Explanation {
  const c = a.chosen!;
  const rec = a.recommended;
  const good = g.verdict === 'great' || g.verdict === 'fine';
  const pre = a.kind === 'preflop';
  // "Close spot" only softens small errors; a big loss is not excused because two OTHER actions were close.
  const near = a.close && g.verdict === 'inaccuracy' ? ' This was a close spot, so reasonable players could differ.' : '';
  if (good) {
    const why = a.whyParts[0]?.text ?? '';
    const alt = a.acceptable.length > 1 ? ' Other actions were also reasonable here.' : '';
    return { summary: `${c.label} was ${g.verdict === 'great' ? 'the best play' : 'a fine play'}.`, detail: `${why}${alt}` };
  }
  const costStr = g.lossBB >= 0.05 ? ` Estimated cost: about ${g.lossBB.toFixed(1)} big blinds.` : '';
  const eq = a.equity ?? 0;
  const be = a.breakEven;
  const theyHave = a.opponents.length > 1 ? 'the hands your opponents likely hold' : 'the hands your opponent likely has';
  const river = a.street === 'river';

  // ---- Any street ----
  if (c.cls === 'fold' && a.toCall === 0) {
    return { summary: 'Folding when you can check for free never helps.', detail: 'Checking costs nothing and keeps your chance of winning. Folding throws the hand away for no reason.' };
  }
  if (c.sizeIssue && c.cls === 'aggressive' && a.acceptable.includes('aggressive')) {
    return {
      summary: `Your size (${c.label}) was very different from the coach's${c.coachLabel ? ` (${c.coachLabel})` : ''}.`,
      detail: `${c.sizingNote ?? ''}${costStr}`.trim(),
    };
  }
  const sizeTail = c.cls === 'aggressive' && c.sizingNote ? ` ${c.sizingNote}` : '';
  const passiveEv = a.options.find((o) => o.cls === 'passive')?.ev ?? 0;
  // Exact price decisions (postflop, and preflop all-ins).
  if (!pre || a.situation === 'vs-shove') {
    const losingCall = c.cls === 'passive' && a.toCall > 0 && be !== null && (rec.cls === 'fold' || (c.mathLossBB ?? 0) > 0 || (!pre && c.evBB < 0));
    if (losingCall && (eq < be || pre)) {
      return { summary: 'The price was too high for this call.', detail: `You needed to win about ${pctS(be)} of the time to break even, but against ${theyHave} you win only about ${pctS(eq)}. Calling when the price is wrong loses chips over time, even though it feels close.${costStr}` };
    }
    if (losingCall) {
      return { summary: 'This call was just short of the price.', detail: `Your ${pctS(eq)} chance is only a little above the ${pctS(be)} the price asks, and out of position you will not always get to use all of it (more betting can follow), so the coach counts about 92% of it, which is not quite enough.${costStr}` };
    }
    if (c.cls === 'fold' && a.toCall > 0 && rec.cls !== 'fold' && be !== null && (pre || passiveEv > 0)) {
      return { summary: 'This hand had the right price to continue.', detail: `You needed about ${pctS(be)} to break even and you have roughly ${pctS(eq)}. When your chance of winning is bigger than the price requires, folding gives up profit.${costStr}` };
    }
    if (c.cls === 'fold' && a.toCall > 0 && rec.cls === 'aggressive' && !pre) {
      return { summary: 'The coach preferred a raise (a bluff) to folding.', detail: `Calling would lose chips at this price, but the model expects enough folds that raising earns a little more than folding. This depends on the opponent, so folding is only a small error.${costStr}` };
    }
  }
  // ---- Preflop ----
  if (pre) {
    if (c.cls === 'aggressive' && rec.cls === 'fold') {
      const verb = c.label.startsWith('All-in') ? 'Moving all-in with' : a.situation === 'vs-open' ? 'Re-raising (3-betting)' : a.situation === 'vs-3bet' ? '4-betting' : 'Raising';
      return { summary: `${verb} ${a.handLabel} from ${a.position} is too loose.`, detail: `${a.chart?.source ?? 'The standard chart'} leaves this hand out. Hands outside the chart for this spot lose money on average when you put more chips in.${costStr}${near}` };
    }
    if (c.cls === 'fold' && rec.cls !== 'fold') {
      return { summary: `Folding ${a.handLabel} gives up a profitable hand.`, detail: `${a.chart?.source ?? 'The standard chart'} includes this hand, so folding gives up the profit it makes on average.${costStr}${near}` };
    }
    if (a.situation === 'rfi' && c.cls === 'passive' && a.toCall > 0) {
      const strong = tierOf(a.handLabel) <= 2;
      const plan = rec.cls === 'fold'
        ? `${a.handLabel} is not strong enough to raise from ${a.position}, so fold it instead.`
        : strong
          ? `${a.handLabel} is a strong hand: raise to build the pot while you are ahead and take the initiative.`
          : `${a.handLabel} is in the ${a.position} raising range, so raise it.`;
      return {
        summary: `Limping (just calling the big blind) with ${a.handLabel} is a weak choice.`,
        detail: `When nobody has raised yet, the choice is raise or fold. Limping lets the players behind you, including the big blind, see a flop cheaply, and it can never win the pot right away. ${plan}${costStr}${near}`,
      };
    }
    if (c.cls === 'passive' && rec.cls === 'aggressive') {
      const strong = tierOf(a.handLabel) <= 2;
      const verb = a.toCall === 0 ? 'checking' : 'calling';
      if (a.situation === 'vs-3bet' || a.situation === 'vs-4bet') {
        // After re-raises the flop is not cheap: the point is getting chips in while ahead (or the stack depth).
        const reason = tierOf(a.handLabel) === 1 ? 'With a hand this strong you usually want to get more chips in now, while you are a big favourite.' : (a.whyParts[0]?.text ?? '');
        return { summary: `Just calling with ${a.handLabel} is too passive.`, detail: `${reason}${costStr}${near}` };
      }
      return {
        summary: `Just ${verb} with ${a.handLabel} is too passive.`,
        detail: `${strong ? 'With a hand this strong you want to build the pot and take the initiative' : 'The chart raises this hand here: raising takes the initiative and can win the pot right away'}, instead of letting others see a cheap flop.${costStr}${near}`,
      };
    }
    return { summary: `${c.label} was not the standard play with ${a.handLabel}.`, detail: `The usual choice is ${rec.label.toLowerCase()}. ${a.whyParts[0]?.text ?? ''}${costStr}${near}` };
  }
  // ---- Postflop ----
  if (c.cls === 'aggressive' && rec.cls !== 'aggressive') {
    return { summary: `This ${a.toCall > 0 ? 'raise' : 'bet'} puts chips in with a hand that does not want a big pot.`, detail: `${a.toCall > 0 ? 'Raising' : 'Betting'} works when worse hands call (value) or better hands fold (bluff). With this hand neither is likely enough.${sizeTail}${costStr}${near}` };
  }
  if (c.cls === 'passive' && rec.cls === 'aggressive') {
    const isDraw = a.assessment?.bucket === 'draw';
    const leak = river
      ? eq >= 0.5
        ? 'Just calling or checking leaves value behind when worse hands would pay.'
        : 'Here the model expects a bet or raise to make better hands fold often enough to be worth more (a bluff); that depends on the opponent.'
      : isDraw
        ? a.toCall === 0
          ? 'Checking gives up fold equity: a bet can win the pot right away, and you still have your outs when called.'
          : 'Just calling gives up fold equity: a raise can win the pot right away, and you still have your outs when called.'
        : a.toCall === 0
          ? 'Checking lets opponents see the next card for free.'
          : 'Just calling gives up the chance to build the pot and charge draws.';
    const slow = eq >= 0.8 ? ' Slow-playing a very strong hand is sometimes fine, so this is only a small error.' : '';
    const why = isDraw ? 'your draw has enough equity to put pressure on.' : 'your hand is strong enough to get value, or has enough equity to put pressure on.';
    return { summary: `A ${a.toCall > 0 ? 'raise' : 'bet'} was worth more here.`, detail: `${rec.label} earns more than ${c.label.toLowerCase()} in the coach's model: ${why} ${leak}${slow}${costStr}${near}` };
  }
  return { summary: `${c.label} was not the best choice.`, detail: `The coach preferred ${rec.label.toLowerCase()}.${sizeTail}${costStr}${near}` };
}
