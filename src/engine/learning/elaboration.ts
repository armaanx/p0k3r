// Self-explanation prompts ("Why did you choose that?"): feedback on the reasoning, not just the action.
import type { Rng } from '../rng';
import type { DrillItem } from './types';

export interface ElabOption {
  text: string;
  good: boolean;
  feedback: string;
}
export interface Elaboration {
  prompt: string;
  options: ElabOption[];
}

const SUPPORTED = new Set(['open-fold', 'facing-raise', 'pot-odds', 'outs', 'bet-size']);

export function elaborationFor(item: DrillItem, response: number | number[], rng: Rng): Elaboration | null {
  if (!SUPPORTED.has(item.type) || item.input.kind !== 'choice') return null;
  const chosen = item.input.options[response as number];
  const prompt = `You chose "${chosen}". What was your main reason?`;
  let opts: ElabOption[];
  switch (item.type) {
    case 'open-fold': {
      // Neutral wording: this prompt is also shown after a wrong answer, so the sound reason must not
      // claim the hand is inside (or outside) the range.
      opts = [
        { text: 'I checked whether this hand is in the range for my seat.', good: true, feedback: 'Yes: the right question is always "is this hand in the range for this seat?"' },
        { text: 'Suited hands and high cards are always worth a raise.', good: false, feedback: 'Not always. A suited hand from an early seat can still be outside the range. Position changes the answer.' },
        { text: 'I like to see flops, so I play most hands.', good: false, feedback: 'Playing too many hands is the most common beginner leak. Every hand you fold is chips you keep.' },
        { text: 'The seat does not matter for starting hands.', good: false, feedback: 'It matters a lot: the earlier your seat, the more players are left to act with a strong hand.' },
      ];
      break;
    }
    case 'facing-raise':
      opts = [
        { text: 'I checked this hand against the chart for my seat and the raiser\'s seat.', good: true, feedback: 'Exactly: raisers usually have strong hands, so most seats continue with fewer hands than they would open. The big blind, with chips already in the pot, can defend wider.' },
        { text: 'A raise is probably a bluff, so I can call with many hands.', good: false, feedback: 'Most raises are real hands. Calling wide out of position loses money.' },
        { text: 'If my hand is suited, calling is always right.', good: false, feedback: 'Suited hands are only slightly better than offsuit ones. They do not make a weak hand strong.' },
        { text: 'Re-raising is always the strongest option.', good: false, feedback: 'Re-raise with your very best hands and a few selected ones, not everything.' },
      ];
      break;
    case 'pot-odds':
      opts = [
        { text: 'I compared my chance of winning with the chance I need to break even.', good: true, feedback: 'That is the whole method: chance versus price.' },
        { text: 'The pot is big, so calling is worth it.', good: false, feedback: 'A big pot also usually means a big bet. What matters is the price compared with your chance.' },
        { text: 'Big bets are usually bluffs.', good: false, feedback: 'Against most players, big bets are usually strong. Do not rely on guessing bluffs when the numbers can answer.' },
        { text: 'I wanted to see the next card.', good: false, feedback: 'Seeing a card is not free. Ask whether the price is right first.' },
      ];
      break;
    case 'outs':
      opts = [
        { text: 'I counted the unseen cards that complete the draw (for a flush: 13 minus the cards of that suit I can see), and left out risky ones if the question asked for clean outs.', good: true, feedback: 'Correct: only cards you cannot see are still in the deck, and a risky out can also give an opponent a better hand.' },
        { text: 'I counted every card of that suit, including the ones in my hand.', good: false, feedback: 'The cards in your hand and on the board are not in the deck any more, so they cannot be outs.' },
        { text: 'I counted every card higher than my cards.', good: false, feedback: 'Outs are cards that complete a specific draw, not just high cards.' },
        { text: 'I guessed.', good: false, feedback: 'Guessing works for a while, but counting is quick: for a flush, 13 minus the cards of that suit you see; for a straight, 4 for each rank that completes it, minus any of those you see.' },
      ];
      break;
    default:
      opts = [
        { text: 'The board texture decides: dry boards need smaller bets, wet boards bigger ones.', good: true, feedback: 'Yes: match the size to how many draws are out there.' },
        { text: 'Always bet the pot to win the most.', good: false, feedback: 'On dry boards, big bets mostly fold out the worse hands you wanted to get value from, and get called by better ones.' },
        { text: 'Small bets are always safer.', good: false, feedback: 'On wet boards a small bet gives draws a great price.' },
        { text: 'Bet size does not matter.', good: false, feedback: 'It matters a lot: it decides who can afford to call.' },
      ];
  }
  return { prompt, options: rng.shuffle(opts) };
}

/** Deterministic ~1 in 5 chance per question so the prompts stay occasional, not annoying. */
export function shouldElaborate(itemId: string, rate = 0.2): boolean {
  let h = 7;
  for (let i = 0; i < itemId.length; i++) h = (h * 31 + itemId.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000 < rate;
}
