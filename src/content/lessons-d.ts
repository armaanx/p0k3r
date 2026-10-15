// Module 10: short stacks (heads-up push/fold) and rake. Every number about the charts is read from the solved charts,
// so the text cannot drift from what the coach and the drills use.
import { chartEdgeBB, chartPercent, chartRange, inChart } from '../engine/pushFold';
import { rangeLabels } from '../engine/ranges';
import { ask, complete, opt, read, worked } from './dsl';
import type { Lesson } from './types';

const p = (role: 'shove' | 'call', bb: number): number => Math.round(chartPercent(role, bb));
const spec = (role: 'shove' | 'call', bb: number): string => rangeLabels(chartRange(role, bb)).join(',');
const edge = (role: 'shove' | 'call', label: string, bb: number): string => {
  const e = chartEdgeBB(role, label, bb);
  return `${e >= 0 ? '+' : '−'}${Math.abs(e).toFixed(2)}`;
};

/** The worked example's hands (the text follows whatever the chart says about them). */
export const PF_EXAMPLE = { shove: 'J6o', call: 'A3o', depth: 10 } as const;
const shoveEx = inChart('shove', PF_EXAMPLE.shove, PF_EXAMPLE.depth);
const callEx = inChart('call', PF_EXAMPLE.call, PF_EXAMPLE.depth);

export const LESSONS_D: Lesson[] = [
  // =====================================================================
  // MODULE 10 — Short stacks and real games
  // =====================================================================
  {
    id: 'm10-l1', module: 10, title: 'Short stacks: push or fold', minutes: 8,
    goal: 'Use the heads-up push/fold charts to decide when to move all-in and when to call an all-in.',
    steps: [
      read(
        `With a short stack, the usual plan of raising and folding to a re-raise throws chips away: after a raise there is too little left to fold. So short stacks play [[push-fold|push or fold]]: move all-in, or fold.\n\nWith two players there is an exact answer. The app computed a [[nash|Nash equilibrium]] for this simple game: one chart for the button (all-in or fold) and one for the big blind (call or fold), where neither player can win more by changing their chart. Stacks are measured as the [[effective-stack|effective stack]] in big blinds, before the blinds go in.\n\nThe grid shows the button's chart at 10 big blinds: about ${p('shove', 10)}% of hands move all-in.`,
        { grid: { spec: spec('shove', 10), label: 'Button moves all-in (10bb)' } },
        'When stacks get short',
      ),
      ask('push-fold', `At 10 big blinds the button moves all-in with about ${p('shove', 10)}% of hands, but the big blind calls with only about ${p('call', 10)}%. Why can the button use so many more hands?`, [
        opt('Moving all-in also wins whenever the big blind folds; calling can only win at showdown', 'Correct: the shove has fold equity, the call has none.'),
        opt('The button is dealt better cards on average', 'Both players get random cards. The difference is in what each action can win.'),
        opt('The big blind should save chips because it already paid a blind', 'The blind already in the pot is gone either way; it actually gives the big blind a better price to call.'),
      ], 0, 'An all-in can win without a showdown; a call cannot.'),
      read(
        `The charts widen as stacks get shorter, because the blinds are worth more compared with the chips at risk:\n\n- **5 big blinds**: all-in with about ${p('shove', 5)}%, call with about ${p('call', 5)}%\n- **10 big blinds**: all-in ${p('shove', 10)}%, call ${p('call', 10)}%\n- **15 big blinds**: all-in ${p('shove', 15)}%, call ${p('call', 15)}%\n- **20 big blinds**: all-in ${p('shove', 20)}%, call ${p('call', 20)}%\n\nEvery pair and every ace moves all-in at all of these depths. Below about 10 big blinds these charts are close to the best you can do. With more chips, strong players also make small raises or just call with some hands, so treat the chart as a solid default there.`,
        { grid: { spec: spec('call', 10), label: 'Big blind calls an all-in (10bb)' } },
        'Reading the charts',
      ),
      worked('Using the charts', [
        'Heads-up, blinds 300/600. You have 6,000 chips on the button and your opponent has 9,000.',
        'The effective stack is the smaller one: 6,000 ÷ 600 = 10 big blinds. Use the 10bb charts.',
        `You hold ${PF_EXAMPLE.shove}. The 10bb button chart ${shoveEx ? 'moves it all-in' : 'folds it'}: against a big blind who calls by its chart, moving all-in earns about ${edge('shove', PF_EXAMPLE.shove, 10)} big blinds compared with folding.`,
        `Next hand, the button moves all-in for 10 big blinds and you hold ${PF_EXAMPLE.call} in the big blind. The calling chart ${callEx ? 'calls' : 'folds'}: calling earns about ${edge('call', PF_EXAMPLE.call, 10)} big blinds compared with folding.`,
      ], 'First work out the effective stack in big blinds, then look up your hand in the right chart: all-in for the button, call for the big blind.'),
      { kind: 'practice', drill: 'push-fold', count: 6, difficulty: 1, label: 'Push, call or fold?', mastery: true, passAt: 5 },
    ],
  },
  {
    id: 'm10-l2', module: 10, title: "Rake: the house's cut", minutes: 6,
    goal: 'Work out how rake changes the price of a call, and why it rewards raising or folding before the flop.',
    steps: [
      read(
        'In a real cardroom or on a poker site, the house takes a small cut of most cash-game pots: the [[rake|rake]]. A typical rake is about 5% of the pot, up to a maximum called the [[rake-cap|cap]] (often $3 to $5 at low stakes). Many rooms take nothing when the hand ends before the flop: [[no-flop-no-drop|no flop, no drop]].\n\nTournaments work differently: you pay an entry fee once and nothing comes out of the pots, so the prices you learned still apply. Some rooms charge a fee per hour instead of rake.\n\nThis app uses play money and takes no rake. But if you play for real money, rake changes the maths.',
        undefined,
        'What rake is',
      ),
      worked('The price of a call after rake', [
        'On the river the pot is $40 and your opponent bets $30. The rake is 5%, capped at $5.',
        'If you call, the final pot is $40 + $30 + $30 = $100.',
        'Without rake you risk $30 to win a $100 pot: you need 30 ÷ 100 = 30%.',
        'With rake, 5% of $100 is $5 (exactly the cap). The winner gets $95, so you need 30 ÷ 95 = 31.6%.',
        'A hand that wins 31% of the time made a small profit without rake (about +$1.00 per call) and now loses a little (about −$0.55).',
      ], 'Rake raises the bar for every call that goes to showdown: you need your call ÷ (final pot − rake).'),
      ask('rake', 'Your room takes no rake when the hand ends before the flop. Why does that favour raising (or folding) over just calling before the flop?', [
        opt('A pot you win with a raise before the flop pays no rake; a pot that sees a flop is raked', 'Correct: pots that end preflop are free, so winning them right away is worth more.'),
        opt('Calling is not allowed in raked games', 'You may call; it just costs more, because called pots usually see a flop and pay rake.'),
        opt('Rake is only taken from all-in pots', 'Rake is taken from most pots that see a flop, all-in or not.'),
      ], 0, 'Pots that end before the flop pay no rake.'),
      complete('Your turn: a small pot', [
        'On the river the pot is $60 and your opponent bets $40.',
        'The rake is 5%, capped at $3.',
      ], [
        { prompt: 'The final pot if you call', options: ['$100', '$140', '$180'], correct: 1, why: '$60 + $40 + $40 = $140.' },
        { prompt: 'The rake taken', options: ['$7', '$3', '$0'], correct: 1, why: '5% of $140 is $7, but the cap is $3.' },
        { prompt: 'The chance of winning you need', options: ['28.6%', '29.2%', '40.0%'], correct: 1, why: '40 ÷ (140 − 3) = 40 ÷ 137 = 29.2%. Without rake it would be 40 ÷ 140 = 28.6%.' },
      ], 'The cap limits the rake in big pots, so small and medium pots feel it most.'),
      { kind: 'practice', drill: 'rake', count: 4, difficulty: 2, label: 'Pot odds after rake', mastery: true, passAt: 3 },
    ],
  },
];
