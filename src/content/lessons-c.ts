// Modules 6–9: betting, opponents, intermediate ideas, the mental game.
import { PROFILES, type Archetype } from '../engine/bots';
import { ask, item, opt, quiz, read, worked } from './dsl';
import type { Lesson } from './types';

// VPIP / PFR of the practice bots, taken from the engine so the lesson always matches the opponents you play.
const BOT_STATS = ([['nit', 'nit'], ['tag', 'TAG'], ['lag', 'LAG'], ['station', 'calling station'], ['maniac', 'maniac']] as const satisfies readonly (readonly [Archetype, string])[])
  .map(([a, name]) => `${name} **${PROFILES[a].vpip} / ${PROFILES[a].pfr}**`)
  .join(', ');

export const LESSONS_C: Lesson[] = [
  // =====================================================================
  // MODULE 6 — Betting
  // =====================================================================
  {
    id: 'm6-l1', module: 6, title: 'Why we bet: value, protection, bluff', minutes: 6,
    goal: 'Give the reason behind every bet you make.',
    steps: [
      read(
        'A bet without a reason is a mistake. There are exactly three good reasons to bet:\n\n1. [[value-bet|Value]]: you have a strong hand and expect **worse hands to call**.\n2. [[protection|Protection]]: you have a decent hand and want draws to **pay** for the next card instead of seeing it cheaply.\n3. [[bluff|Bluff]]: you have a weak hand and hope **better hands fold**.\n\nBefore you bet, say the reason out loud. If you cannot, check instead.',
        undefined,
        'Three reasons',
      ),
      ask('value-betting', 'You hold A♠ A♦ on a flop of K♠ 7♦ 2♣ and your opponent checks. What is the main reason to bet?', [
        opt('Value: worse hands like K-Q or pocket eights can call', 'Correct: you have the best hand and worse hands can pay you.'),
        opt('Bluff: to make a better hand fold', 'You already have a very strong hand. There are few better hands to fold out.'),
        opt('There is no reason to bet', 'There is: get paid by worse hands.'),
      ], 0, 'Value bets target worse hands that call.', { hole: 'As Ad', board: 'Ks 7d 2c' }),
      ask('protection', 'You hold K♣ Q♦ on a flop of K♦ 9♥ 8♥, and your opponent checks. Besides value, what extra reason makes betting important here?', [
        opt('Protection: charge the flush and straight draws for the next card', 'Right: this two-tone, connected board has several draws, and you have a decent but vulnerable top pair.'),
        opt('Value only', 'Value is part of it, but on this board the extra reason is that the flush and straight draws can overtake you.'),
        opt('To bluff', 'You hold a good hand already. Think about what could beat you.'),
      ], 0, 'When the board has several draws, a decent hand bets to make draws pay.', { hole: 'Kc Qd', board: 'Kd 9h 8h' }),
      ask('bluffing', 'You hold 7♣ 2♦ on a flop of A♠ K♦ 5♣. What is the realistic way to win with this hand?', [
        opt('Make your opponent fold', 'Correct: you have nothing, so you will rarely win at showdown. You mostly win if they give up. That is a bluff.'),
        opt('Hope they also have nothing and check it down', 'Possible, but it is not a plan.'),
        opt('Bet because a bet always wins', 'Bets lose when called.'),
      ], 0, 'With nothing, betting is only a bluff and wins by folds.', { hole: '7c 2d', board: 'As Kd 5c' }),
      quiz([
        item('value-betting', 'Which of these is a good value bet?', [
          opt('Betting top pair with an ace kicker when weaker pairs can call', 'Correct.'),
          opt('Betting the nut flush on a board where nobody could possibly call', 'If nobody can call, there is no value to collect.'),
          opt('Betting the worst pair', 'Only better hands call a bet when you have the worst pair.'),
        ], 0, 'A value bet needs worse hands that can call.'),
        item('bluffing', 'A bluff makes money mainly when...', [
          opt('Your opponent folds often enough', 'Correct: a bluff relies on folds.'),
          opt('Your opponent always calls', 'Then the bluff loses.'),
          opt('You are sitting on the button', 'Position helps but is not the mechanism.'),
        ], 0, 'Bluffs profit only if the opponent folds often enough.'),
        item('protection', 'Protection means...', [
          opt('Betting to make draws pay to see the next card', 'Correct.'),
          opt('Hiding your cards', 'Protection is about betting, not hiding anything.'),
          opt('Folding to a big bet', 'That is just folding. Protection is a kind of bet.'),
        ], 0, 'Protection = charging draws.'),
      ], 3, 'Mastery check'),
    ],
  },
  {
    id: 'm6-l2', module: 6, title: 'Choosing a bet size', minutes: 5,
    goal: 'Match your bet size to the board texture.',
    steps: [
      read(
        '[[sizing|Bet sizing]] is usually described as a fraction of the pot: one third, half, two thirds, or the full pot.\n\nA good guide is the board:\n\n- **Dry board**: few draws to charge, so a **small** bet (about ⅓ pot) is enough. It gets called by worse pairs and costs little if it fails.\n- **Medium board**: about **½ pot**.\n- **Wet board**: many draws. Bet **bigger** (⅔ pot or more) so that draws must pay the wrong price.\n\nThis is a guideline, not a law. Opponents who call too much deserve bigger value bets; opponents who fold too much allow smaller bluffs.',
        { board: 'Ks 7d 2c', caption: 'Dry: small bets' },
        'Size follows the board',
      ),
      ask('bet-sizing', 'You have top pair on a very wet board (J♥ 10♥ 8♠). About how much should you bet?', [
        opt('A small bet, about ⅓ pot', 'A small bet gives drawing hands a good price to call.'),
        opt('Two thirds of the pot or more', 'Correct: charge the many draws.'),
        opt('Nothing: always check wet boards', 'Checking gives draws free cards.'),
      ], 1, 'Wet boards call for bigger bets.', { board: 'Jh Th 8s' }),
      { kind: 'practice', drill: 'bet-size', count: 5, difficulty: 1, label: 'Pick the bet size', mastery: true, passAt: 4 },
    ],
  },
  {
    id: 'm6-l3', module: 6, title: 'Continuation bets, and when not to', minutes: 6,
    goal: 'Know when a continuation bet is good and when to give up.',
    steps: [
      read(
        'If you raised before the flop, you showed strength. When the flop comes and you bet (first, or after your opponent checks), that bet is called a [[cbet|continuation bet]] (c-bet). It works because your opponent misses the flop most of the time.\n\n**C-bet more** when: the board is dry, you have few opponents, and the board favours the cards a raiser would hold (high cards).\n\n**C-bet less (check instead)** when: there are several opponents, the board is wet and low (it likely helped the caller), or you have a weak hand that cannot stand a raise.\n\nThe c-bet is a tool, not a habit.',
        { board: 'As 7d 2c', hole: 'Kh Qd', caption: 'You raised with K-Q and missed, but this dry ace-high flop favours the raiser: a good small c-bet' },
        'Taking the initiative',
      ),
      ask('cbet', 'Before the quiz: you raised before the flop and your opponent checks on the flop. What are you trying to use when you bet?', [
        opt('The fact that your opponent misses the flop most of the time', 'Correct: most hands do not connect with the flop, so a bet often wins the pot.'),
        opt('A guarantee that you win', 'Nothing is guaranteed in poker.'),
        opt('The rules say the raiser must bet', 'There is no such rule.'),
      ], 0, 'A continuation bet works because flops usually miss.'),
      quiz([
        item('cbet', 'You raised before the flop and three players called. The flop is 9♥ 8♥ 6♠ and you hold A♣ K♣. What is usually best?', [
          opt('Check: there are many opponents and a wet, connected board', 'Correct: too many ways for someone to have hit, and you only have ace-high.'),
          opt('Bet big as a bluff', 'Bluffing into three opponents on a wet board rarely works.'),
          opt('Bet small to see where you stand', 'That just loses chips.'),
        ], 0, 'Multiple opponents + wet board = give up with weak hands.', { hole: 'Ac Kc', board: '9h 8h 6s' }),
        item('cbet', 'You raised before the flop and one player called. The flop is A♠ 7♦ 2♣ and you hold K♥ Q♥. What is a good plan?', [
          opt('C-bet small: a dry ace-high flop favours the raiser', 'Correct.'),
          opt('Always check', 'You give up a profitable spot.'),
          opt('Go all-in', 'Far too big for a bluff with little equity.'),
        ], 0, 'A small c-bet on a dry board is often profitable.', { hole: 'Kh Qh', board: 'As 7d 2c' }),
        item('cbet', 'Which board is best for a continuation bet?', [
          opt('A♦ 7♣ 2♠ (dry, high card)', 'Correct.'), opt('9♥ 8♥ 7♦ (wet, connected)', 'A wet connected board hits many calling hands.'), opt('6♠ 5♠ 4♠ (monotone, low)', 'This board hits calling hands hard.'),
        ], 0, 'Dry boards with high cards favour the raiser.'),
      ], 3, 'Mastery check'),
    ],
  },
  {
    id: 'm6-l4', module: 6, title: 'Pot control and the check-raise', minutes: 6,
    goal: 'Keep the pot small with medium hands and recognise the check-raise.',
    steps: [
      read(
        '[[pot-control|Pot control]]: with a medium-strength hand (like second pair or top pair with a weak kicker), you want to reach showdown cheaply. Do that by checking, or betting small, instead of inflating the pot. When lots of chips go in, worse hands fold and better hands stay, so a big pot with a medium hand is usually played against hands that beat you.\n\nThe [[check-raise|check-raise]]: you check, your opponent bets, and you raise. It is one of the strongest actions in poker. Use it with monsters and sometimes with strong draws. When an opponent check-raises you, believe the strength, especially when the board is dry.',
        undefined,
        'Small pots for medium hands',
      ),
      ask('pot-control', 'You have a medium-strength hand. Which plan usually loses the least when you are beaten?', [
        opt('Keep the pot small', 'Correct: a small pot limits what better hands can win from you.'),
        opt('Build a big pot', 'A big pot with a medium hand is the risky way to play it.'),
        opt('Always fold', 'You would throw away too many winning hands.'),
      ], 0, 'Medium hands play small pots.'),
      quiz([
        item('pot-control', 'You hold K♥ 6♥ on a flop of K♠ 9♦ 4♣: top pair with a weak kicker. Which plan fits pot control?', [
          opt('Bet small or check to keep the pot manageable', 'Correct: you have something, but not enough to play a big pot.'),
          opt('Bet the pot and hope for the best', 'A big bet turns a medium hand into a big risk.'),
          opt('Fold immediately', 'Never fold when you can check for free, and top pair is a good hand.'),
        ], 0, 'Medium hands play small pots.', { hole: 'Kh 6h', board: 'Ks 9d 4c' }),
        item('check-raise', 'On a dry board (K♠ 7♦ 2♣) your opponent checks, you bet, and they raise. What does the raise usually mean?', [
          opt('A strong hand: a set, two pair, or a very good hand', 'Correct: check-raises are usually strong, especially on dry boards.'),
          opt('A bluff almost every time', 'Occasionally, but most players check-raise with strength.'),
          opt('They misclicked', 'Misclicks are rare. Treat a raise as a real decision.'),
        ], 0, 'Treat check-raises with respect.'),
        item('pot-control', 'Why do medium hands prefer small pots?', [
          opt('Because they can only beat worse hands, and a big pot means risking a lot against better ones', 'Correct.'),
          opt('Because small pots pay more', 'Small pots pay less. That is the price of safety.'),
          opt('Because of the rules', 'There is no rule, only good judgement.'),
        ], 0, 'Protect your stack when you are not strong.'),
      ], 3, 'Mastery check'),
    ],
  },

  // =====================================================================
  // MODULE 7 — Opponents
  // =====================================================================
  {
    id: 'm7-l1', module: 7, title: 'Four kinds of players', minutes: 6,
    goal: 'Place a player on the tight/loose and passive/aggressive map.',
    steps: [
      read(
        'Players differ in two main ways:\n\n- **How many hands they play**: [[tight|tight]] (few) or [[loose|loose]] (many).\n- **How they play them**: [[passive|passive]] (mostly check and call) or [[aggressive|aggressive]] (bet and raise).\n\nThat gives four combinations. The player types you will meet most:\n\n- The [[nit|nit]]: very tight. Plays only strong hands, about one in ten, and almost never bluffs. When a nit bets big, believe them.\n- The [[station|calling station]]: loose and passive. Calls too much. Do not bluff them; bet for value.\n- The [[maniac|maniac]]: loose and aggressive to extremes. Stay patient and let them bluff into your good hands.\n- The [[tag|TAG]] and the [[lag|LAG]]: tight-aggressive and loose-aggressive. The strong styles. TAG is your model.',
        { playerMap: true },
        'The map',
      ),
      ask('player-types', 'A player calls almost every bet but never raises. Which label fits best?', [
        opt('Calling station: loose and passive', 'Correct: they play many hands and rarely raise.'),
        opt('Maniac', 'Maniacs bet and raise constantly.'),
        opt('TAG', 'A TAG plays few hands and plays them aggressively.'),
      ], 0, 'Loose + passive = calling station.'),
      { kind: 'practice', drill: 'player-type', count: 5, difficulty: 2, label: 'Name that player (by behaviour)', mastery: true, passAt: 4 },
    ],
  },
  {
    id: 'm7-l2', module: 7, title: 'VPIP and PFR: numbers that reveal style', minutes: 6,
    goal: 'Read two simple statistics and name the player type.',
    steps: [
      read(
        `Two numbers tell you most of what you need:\n\n- [[vpip|VPIP]] (voluntarily put chips in the pot): the percent of hands a player chooses to play. **Low = tight, high = loose.** Under about 15 is very tight (a nit); about 15 to 24 is tight, the normal range for a solid player (a TAG); over about 25 is loose.\n- [[pfr|PFR]] (preflop raise): the percent of hands they raise before the flop. A big gap between VPIP and PFR means they call a lot (passive).\n\nThe app\'s practice opponents (measured at six-player tables), VPIP / PFR: ${BOT_STATS}.\n\nYou can look these numbers up any time on the Reference page.`,
        { playerMap: true },
        'Two numbers',
      ),
      ask('player-types', 'A player has VPIP 42 and PFR 6. What are they?', [
        opt('A calling station: plays many hands but rarely raises', 'Correct: a huge gap between VPIP and PFR means they call too much.'),
        opt('A nit', 'Nits play very few hands, so their VPIP would be low, not 42.'),
        opt('A maniac', 'Maniacs raise a lot; this player rarely raises.'),
      ], 0, 'High VPIP, low PFR = calling station.'),
      { kind: 'practice', drill: 'player-type', count: 5, difficulty: 1, label: 'Name that player (by stats)', mastery: true, passAt: 4 },
    ],
  },
  {
    id: 'm7-l3', module: 7, title: 'Adjusting to your opponent', minutes: 6,
    goal: 'Choose one simple adjustment for each type of player.',
    steps: [
      read(
        'To [[exploit|exploit]] a player means to change your play because of a habit you spotted. Keep it simple:\n\n- **Against a nit**: steal their blinds, and fold to their big bets.\n- **Against a calling station**: value bet more and thinner; stop bluffing.\n- **Against a maniac**: call down lighter with medium-strong hands; let them bluff.\n- **Against a TAG**: respect their raises.\n- **Against a LAG**: play solid poker and defend your good hands a little wider; they raise light.\n\nDo not adjust on too little information. Ten hands is not enough to call someone a maniac.',
        undefined,
        'One adjustment each',
      ),
      ask('exploits', 'Your opponent calls far too often. What is the simplest profitable change in your play?', [
        opt('Bet for value more often and bluff less', 'Correct: a caller pays off your good hands and ignores your bluffs.'),
        opt('Bluff more often', 'Players who call too much do not fold to bluffs.'),
        opt('Fold more hands', 'That ignores the weakness you spotted.'),
      ], 0, 'Against callers: value bet, do not bluff.'),
      quiz([
        item('exploits', 'A calling station bets the river for the first time. What does that usually mean?', [
          opt('A strong hand: stations bluff very rarely', 'Correct: they call a lot but almost never bluff.'),
          opt('A bluff', 'Stations rarely bluff.'),
          opt('Nothing', 'It is information: their betting hands are usually strong.'),
        ], 0, 'Stations bluff rarely, so their bets are strong.'),
        item('exploits', 'What is the best adjustment against a player who calls almost everything?', [
          opt('Bluff more', 'They will simply call, so bluffs lose chips against this kind of player.'),
          opt('Value bet more, even with medium hands', 'Correct: they pay off with worse hands.'),
          opt('Fold more', 'No need; use their weakness.'),
        ], 1, 'Value bet thinner against callers.'),
        item('exploits', 'Against a nit who raises your bet on the turn, what should you usually do with a medium hand?', [
          opt('Fold', 'Correct: nits rarely bluff.'), opt('Call', 'You are mostly paying off a strong hand.'), opt('Re-raise', 'You are likely crushed.'),
        ], 0, 'Fold medium hands to nit aggression.'),
        item('exploits', 'Why should you avoid judging a player after only a few hands?', [
          opt('A few hands is too small a sample; luck can mislead you', 'Correct.'), opt('Players change every hand', 'Habits are stable over time, but you need enough hands to see them.'), opt('It is against the rules', 'There is no such rule; it is just good judgement.'),
        ], 0, 'Observe many hands before you change your plan.'),
      ], 3, 'Mastery check'),
    ],
  },

  // =====================================================================
  // MODULE 8 — Intermediate ideas
  // =====================================================================
  {
    id: 'm8-l1', module: 8, title: 'Implied odds and reverse implied odds', minutes: 6,
    goal: 'Explain why some calls are worth more than their immediate price.',
    steps: [
      read(
        '[[implied-odds|Implied odds]]: when you hit your draw, you may win **more** chips on later streets. A call that is slightly unprofitable right now can be correct if your opponent will pay you off when you hit. Implied odds are best when you hit a **hidden** hand (a set is hidden; a flush on a scary board is not) and when you both have big stacks.\n\n[[reverse-implied|Reverse implied odds]] are the danger on the other side: you make a hand that looks good but is second best and lose more chips later. Example: a low flush when a higher flush is possible, or a weak top pair.',
        undefined,
        'More than the current price',
      ),
      ask('implied-odds', 'You are a little short on pot odds for a call, but if you hit your hand your opponent will likely pay you off with a big bet. Is the call worse or better than it looks?', [
        opt('Better: the extra chips you win later count in your favour', 'Correct: that is the idea of implied odds.'),
        opt('Worse: you should never call without the right price', 'The immediate price is not the whole story.'),
        opt('The same', 'Future winnings change the value of the call.'),
      ], 0, 'Future winnings improve the call.'),
      quiz([
        item('implied-odds', 'Which situation has the best implied odds?', [
          opt('You hold 5♠ 5♦ and hope to make a set against a player with a big stack', 'Correct: a set is well hidden and can win a huge pot.'),
          opt('You need a flush that would put four hearts on the board', 'Obvious hands win less from opponents.'),
          opt('You have top pair', 'That is a made hand, not a draw that hits.'),
        ], 0, 'Hidden hands and deep stacks give big implied odds.'),
        item('reverse-implied', 'What is a reverse implied odds problem?', [
          opt('Making a hand that is second best and losing more chips', 'Correct: the hand looks good but is beaten.'),
          opt('Having too many outs', 'Outs are a good thing; having more outs is never a problem.'),
          opt('A pot that is too large to call', 'That is just pot odds.'),
        ], 0, 'Weak flushes and weak top pairs can cost extra.'),
        item('implied-odds', 'Your call is a little short on pot odds. Which fact makes it more acceptable?', [
          opt('The opponent has a deep stack and would pay you off if you hit', 'Correct.'),
          opt('You have a short stack', 'A short stack means little to win later.'),
          opt('It is the river', 'On the river there are no more cards to come, so implied odds disappear.'),
        ], 0, 'Deep stacks and hidden hands help implied odds.'),
      ], 3, 'Mastery check'),
    ],
  },
  {
    id: 'm8-l2', module: 8, title: 'Minimum defence frequency', minutes: 5,
    goal: 'Calculate how often you must continue against a bet.',
    steps: [
      read(
        'If you fold too often, opponents can bluff you profitably with any two cards. The [[mdf|minimum defence frequency]] tells you how often you must call or raise to stop that:\n\n**MDF = pot ÷ (pot + bet)** (using the pot before the bet).\n\nExample: the pot is 100 and your opponent bets 50. MDF = 100 ÷ 150 = **67%**. You should continue with roughly two thirds of your hands. Against a pot-sized bet, MDF is 50%.\n\nMDF is a reminder, not a command: against a nit who never bluffs you can fold more; against a maniac you can defend more.',
        undefined,
        'Do not fold too much',
      ),
      ask('mdf', 'An opponent bets the pot every time. If you fold almost every hand, what can they do?', [
        opt('Bluff with any two cards and still profit', 'Correct: if you give up too often, their bluffs always work.'),
        opt('Nothing', 'They can exploit a player who folds too much.'),
        opt('Lose chips', 'Their bluffs only lose chips if you defend more often than the minimum; at exactly the MDF they break even.'),
      ], 0, 'Fold too much and bluffs print money.'),
      worked('Half-pot bet', [
        'The pot is 200 and your opponent bets 100.',
        'MDF = 200 ÷ (200 + 100) = 200 ÷ 300 = 67%.',
        'If you fold more than 33% of your hands, their bluffs make an automatic profit.',
      ], 'Bigger bets lower the MDF: you may fold more against a bigger bet.'),
      { kind: 'practice', drill: 'mdf', count: 4, difficulty: 2, label: 'How often must you defend?', mastery: true, passAt: 3 },
    ],
  },
  {
    id: 'm8-l3', module: 8, title: 'Stack-to-pot ratio', minutes: 5,
    goal: 'Use the SPR to decide how committed a hand is.',
    steps: [
      read(
        'The [[spr|stack-to-pot ratio (SPR)]] is the effective stack (the smaller of your stack and the biggest opponent stack in the hand) divided by the pot at the start of the street. It is usually measured on the flop.\n\n- **Low SPR (under 3)**: the pot is big compared with the stacks. Top pair or better is usually happy to go all-in.\n- **Medium SPR (3 to under 8)**: strong hands can stack off, but careful hands fold to big action.\n- **High SPR (8 or more)**: it takes a very strong hand (a set or better) to risk your whole stack; speculative hands gain.\n\nSPR tells you *before* you bet how committed you will be.',
        undefined,
        'How committed am I?',
      ),
      ask('spr', 'The pot is small compared with the stacks (a high ratio). Which hand is comfortable risking a whole stack?', [
        opt('A very strong hand, like a set or better', 'Correct: with deep stacks only the strongest hands should go all-in.'),
        opt('Top pair with a weak kicker', 'That is a medium hand; deep stacks make it costly.'),
        opt('Any pair', 'Too loose when the stack is large.'),
      ], 0, 'High ratio: only monsters stack off.'),
      { kind: 'practice', drill: 'spr', count: 4, difficulty: 2, label: 'Compute the SPR', mastery: true, passAt: 3 },
    ],
  },
  {
    id: 'm8-l4', module: 8, title: 'Semi-bluffs, thin value, and the river', minutes: 7,
    goal: 'Use drawing hands as weapons, and make better river decisions.',
    steps: [
      read(
        'A [[semi-bluff|semi-bluff]] is a bet with a draw. It can win two ways: your opponent folds right away (that extra chance is [[fold-equity|fold equity]]), or you hit your draw. That makes a semi-bluff better than a plain bluff.\n\nA [[thin-value|thin value bet]] is a value bet with a hand only a little better than what will call, for example top pair, weak kicker, on the river against a player who calls with any pair.\n\nOn the river there are no more cards. Hands are either good enough to beat something or they are not. Ask: **what worse hands can call me?** and **what better hands fold?** A [[bluff-catcher|bluff-catcher]] is a hand that beats bluffs but loses to value hands, and you call with it when the price is right.',
        undefined,
        'Three advanced tools',
      ),
      ask('semi-bluff', 'You bet with a flush draw and your opponent folds. Was the bet a failure because you never got to hit your draw?', [
        opt('No: the bet won the pot right away, one of its two ways to win', 'Correct: a draw bet wins by folds or by hitting.'),
        opt('Yes: you should always check draws', 'Semi-bluffs are a strong weapon.'),
        opt('Yes: folds mean the bet was wrong', 'Winning the pot with a fold is the goal of a bluff.'),
      ], 0, 'A semi-bluff wins when they fold.'),
      quiz([
        item('semi-bluff', 'You have a flush draw on the flop and your opponent checks. Why is betting good?', [
          opt('You can win if they fold, or if you hit the flush', 'Correct: two ways to win.'),
          opt('You cannot lose chips', 'You can, if they raise or call and you miss.'),
          opt('Flush draws must always be bet', 'Not always, but it is a strong option.'),
        ], 0, 'Semi-bluffs win in two ways.'),
        item('thin-value', 'On the river you hold top pair with a decent kicker and your opponent tends to call with any pair. What is a good play?', [
          opt('A small value bet', 'Correct: they call with worse pairs.'), opt('Check and fold to anything', 'That gives up the value your hand can earn.'), opt('Jam everything', 'Too big for a thin hand.'),
        ], 0, 'Thin value bets collect from weaker calls.'),
        item('river', 'The best question to ask before a river bet is...', [
          opt('What worse hands can call me, and what better hands fold?', 'Correct.'), opt('How strong do I feel?', 'Feelings do not pay. Think about their actual hands.'), opt('How big is my stack?', 'Not the key question.'),
        ], 0, 'Ask what calls and what folds.'),
        item('semi-bluff', 'What is fold equity?', [
          opt('The value gained from the chance your opponent folds', 'Correct.'), opt('Equity when you fold', 'You have no equity after folding.'), opt('A bonus for good players', 'It is not a bonus, it is the value a bet gets from opponents folding.'),
        ], 0, 'Fold equity is the extra value from folds.'),
      ], 3, 'Mastery check'),
    ],
  },

  // =====================================================================
  // MODULE 9 — The mental game
  // =====================================================================
  {
    id: 'm9-l1', module: 9, title: 'Decisions versus results', minutes: 8,
    goal: 'Judge a decision by its quality, not by how the cards fell.',
    steps: [
      read(
        'Poker\'s biggest trap is [[results-thinking|judging a decision by its result]]. If you put your chips in with the best of it and lose, that was still a good decision. If you make a terrible call and get lucky, that was still a bad decision.\n\nThe cards you cannot control. The decision you can. So you must grade your choices separately from the outcome.\n\nTry the experiment below: your opponent is all-in and you are an 80% favourite every time. Run it many times and look at the real results against what should have happened.',
        undefined,
        'The biggest trap',
      ),
      { kind: 'variance-sim' },
      quiz([
        item('results-thinking', 'You get all your chips in as an 80% favourite and lose. What was the quality of your decision?', [
          opt('Good: you had the better of it and the cards just did not fall your way', 'Correct: 20% of the time the favourite loses.'),
          opt('Bad, because it lost', 'That is results-oriented thinking.'),
          opt('Impossible to say', 'You can say: it was a good decision.'),
        ], 0, 'Good decisions sometimes lose. The result does not change the decision.'),
        item('results-thinking', 'You call a pot-sized bet (you needed 33%) with only 5% to win and get lucky. Was it a good decision?', [
          opt('Yes, because you won', 'That is results-oriented thinking.'),
          opt('No: it lost money on average, you just got lucky', 'Correct.'),
        ], 1, 'A lucky win does not make a bad call good.'),
      ], 2, 'Mastery check'),
    ],
  },
  {
    id: 'm9-l2', module: 9, title: 'Variance and bankroll', minutes: 5,
    goal: 'Explain why short-term results are noisy and how to protect your bankroll.',
    steps: [
      read(
        '[[variance|Variance]] is the natural up and down of results caused by luck. Even a strong player can lose for many sessions in a row: a [[downswing|downswing]]. In the short term, skill is hidden by luck. In the long term, skill shows.\n\nYour [[bankroll|bankroll]] is the money you set aside for poker. Keep it separate from money you need. A common guideline for cash games is to hold at least **20 to 30 buy-ins** for the stakes you play, so a bad run does not end your game. This is a common poker rule of thumb, not financial advice.\n\nThis app uses play money, but build the habit now: never play with money you cannot afford to lose.',
        undefined,
        'Luck and money',
      ),
      ask('variance', 'A winning player can still lose for a whole week. Why?', [
        opt('Luck swings results in the short term', 'Correct: that is variance.'),
        opt('They suddenly forgot how to play', 'Skill does not disappear in a week.'),
        opt('It means they were never winning', 'A long run proves skill, a short one proves little.'),
      ], 0, 'Short-term results are noisy.'),
      quiz([
        item('variance', 'You have lost four sessions in a row but your decisions were sound. What is the most likely explanation?', [
          opt('Variance: short-term results are noisy', 'Correct.'), opt('You are a bad player', 'Not necessarily: check your decisions, not just your results.'), opt('The game is rigged', 'Short losing streaks are normal in any game with luck in it.'),
        ], 0, 'Short-term results are mostly luck.'),
        item('bankroll', 'What is a bankroll for?', [
          opt('Surviving bad runs so that you can keep playing', 'Correct.'), opt('Paying bills', 'Keep poker money separate from money you need.'), opt('Showing off', 'A bankroll is a safety net, not a status symbol.'),
        ], 0, 'A bankroll protects you from variance.'),
        item('bankroll', 'A sensible cash-game bankroll guideline is about...', [
          opt('20 to 30 buy-ins', 'Correct.'), opt('2 buy-ins', 'One bad run would wipe you out.'), opt('Exactly one buy-in', 'Far too thin: one bad run would end your game.'),
        ], 0, 'Many buy-ins keep you safe.'),
      ], 3, 'Mastery check'),
    ],
  },
  {
    id: 'm9-l3', module: 9, title: 'Tilt, and review habits', minutes: 6,
    goal: 'Recognise tilt, protect your decisions, and review hands well.',
    steps: [
      read(
        '[[tilt|Tilt]] is playing worse because of emotion: anger after a bad beat, excitement after a win, or tiredness. It is costly because it makes you play hands you would normally fold.\n\nTools against tilt:\n- Set a stop-loss (a loss limit) before you start.\n- Take a break after a big loss. Even a five-minute walk helps.\n- Ask after each hand: "Would I make the same decision if I had not just lost?"\n\nTo improve, **review one hand a day**. Pick a hand where you felt unsure, or where you lost a big pot, and study the decision, not the result. This app does that for you in the Review tab.',
        undefined,
        'Protecting your decisions',
      ),
      { kind: 'why', prompt: 'After a hard loss you feel like playing the next hand recklessly. What is the best response?', options: [
        { text: 'Take a short break and reset before the next hand', good: true, feedback: 'Yes: a reset stops emotion from making your decisions.' },
        { text: 'Play faster to win the chips back', good: false, feedback: 'Chasing losses is the classic tilt mistake. Chips lost are gone; each hand stands alone.' },
        { text: 'Raise your stakes so one hand fixes it', good: false, feedback: 'Bigger risk under stress makes things worse.' },
        { text: 'Keep playing exactly the same, ignore how you feel', good: false, feedback: 'Ignoring tilt rarely works. Notice it and act on it.' },
      ] },
      quiz([
        item('tilt', 'Which of these is a sign of tilt?', [
          opt('Playing hands you would normally fold because you are frustrated', 'Correct.'), opt('Folding a weak hand', 'That is discipline, the opposite of tilt.'), opt('Taking a break', 'That is the cure for tilt, not a sign of it.'),
        ], 0, 'Tilt makes you deviate from your plan.'),
        item('tilt', 'What is the best way to review a hand?', [
          opt('Study the decision quality, not only the result', 'Correct.'), opt('Only look at hands you lost', 'You can also learn from hands you won by luck.'), opt('Never review', 'Review is the fastest way to improve.'),
        ], 0, 'Judge the decision, not the result.'),
        item('results-thinking', 'A session ends with a loss. What is a healthy question?', [
          opt('Did I make good decisions?', 'Correct.'), opt('Who was lucky?', 'That blames luck instead of learning.'), opt('How can I win it back tomorrow by playing bigger?', 'Chasing losses is tilt.'),
        ], 0, 'Measure yourself by decisions.'),
      ], 3, 'Mastery check'),
    ],
  },
];

