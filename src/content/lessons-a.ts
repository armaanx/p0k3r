// Modules 0–2: how a hand flows, hand rankings, position.
import { ask, complete, item, opt, quiz, read, worked } from './dsl';
import type { Lesson } from './types';

export const LESSONS_A: Lesson[] = [
  // =====================================================================
  // MODULE 0 — How a hand flows
  // =====================================================================
  {
    id: 'm0-l1', module: 0, title: 'The goal and the cards', minutes: 4,
    goal: 'Explain what you are trying to win, and which cards you can use.',
    steps: [
      read(
        'Texas Hold\'em is a game of winning chips. All the chips that have been bet so far sit in the middle in [[pot|the pot]]. You win it in one of two ways: **have the best hand when the cards are shown**, or **make everyone else [[fold|fold]]**.\n\nEach player gets two private cards, called [[hole-cards|hole cards]]. Five more cards are dealt face up in the middle. Those are the [[board|board]], and everybody can use them.',
        { hole: 'As Kd', board: '7h 7c Qs 2d 9c', caption: 'Your two hole cards (left) and the five board cards.' },
        'Two private cards, five shared cards',
      ),
      ask('basics', 'You hold A♠ K♦ and the board is 7♥ 7♣ Q♠ 2♦ 9♣. Which cards can you use to make your hand?', [
        opt('Only your two hole cards', 'Not quite: the board cards are shared, so they are yours too.'),
        opt('Any of the seven cards: your hand is the best five of them', 'Right. Your hand is the best five-card combination from your two hole cards and the five board cards.'),
        opt('Exactly two hole cards and three board cards', 'Close, but there is no such rule. You may use both, one or none of your hole cards.'),
      ], 1, 'Your hand is the best five cards from all seven you can see. That idea comes back in the next module.', { hole: 'As Kd', board: '7h 7c Qs 2d 9c' }),
      read(
        'Before the cards are dealt, two players put in small forced bets called [[blinds|the blinds]]: the [[small-blind|small blind]] and the [[big-blind|big blind]] (usually double the small). They are posted by the two players to the left of a round marker called [[button|the dealer button]]. The button shows who acts last after the flop (before the flop, the blinds get to act after it), and it moves one seat clockwise after every hand, so everybody takes a turn in every seat.\n\nWith only two players (heads-up), the button posts the small blind and the other player posts the big blind. The button then acts first before the flop and last after it.\n\nThe big blind is also the yardstick for every bet. "Raise to 3 big blinds" means raise to three times that forced bet.',
        undefined,
        'The blinds and the button',
      ),
      ask('basics', 'Why does poker have blinds?', [
        opt('They pay the dealer', 'In a home game or this app nobody is paid. The blinds have another job.'),
        opt('They make sure there is always something to win, so players cannot just wait for perfect cards', 'Exactly. Without blinds everyone could fold every hand until they got aces.'),
        opt('They are a penalty for the players sitting left of the dealer', 'They rotate to every player, so over time everyone pays the same.'),
      ], 1, 'Blinds create a pot to fight over. They are also why folding is not free when you are in a blind: you lose the chips you posted.'),
      quiz([
        item('basics', 'Which cards are called "hole cards"?', [
          opt('The five shared cards in the middle', 'Those are the board: the five shared cards everyone can use. Hole cards are private.'),
          opt('Your two private cards', 'Correct.'),
          opt('The cards you throw away', 'No. Thrown-away cards go into the "muck". Hole cards are your two private cards.'),
        ], 1, 'Hole cards are your two private cards.'),
        item('basics', 'What does the dealer button show?', [
          opt('Who wins the hand', 'The best hand wins, not the button.'),
          opt('Who acts last after the flop, and it moves one seat each hand', 'Correct.'),
          opt('Which player is the dealer\'s friend', 'It is only a marker: it has no effect on who wins the hand.'),
        ], 1, 'The button acts last on every round after the flop, and it moves one seat every hand.'),
        item('basics', 'Who puts in the blinds?', [
          opt('The two players left of the button', 'Correct: small blind first, then big blind. (Heads-up, the button itself posts the small blind.)'),
          opt('Everybody at the table', 'Only two players post blinds each hand.'),
          opt('Whoever has the worst cards', 'Nobody has looked at their cards yet, so it cannot depend on them.'),
        ], 0, 'The two seats left of the button post the blinds (heads-up: the button and the other player), before any cards are seen.'),
      ], 3, 'Quick check'),
    ],
  },
  {
    id: 'm0-l2', module: 0, title: 'Four rounds, six actions', minutes: 5,
    goal: 'Name the betting rounds in order and know which actions are allowed.',
    steps: [
      read(
        'A hand has **four betting rounds**, called [[street|streets]]:\n\n1. [[preflop|Preflop]]: everyone has only their two hole cards.\n2. [[flop|Flop]]: three board cards are dealt.\n3. [[turn|Turn]]: a fourth board card.\n4. [[river|River]]: the fifth and last board card.\n\nAfter the river betting, players still in the hand show their cards at the [[showdown|showdown]], and the best five-card hand wins the pot.',
        { flow: true },
        'Preflop, flop, turn, river',
      ),
      ask('basics', 'The flop has just been dealt. Which card comes next?', [
        opt('The river', 'The river is the very last card.'),
        opt('The turn', 'Right: flop (3 cards), then turn (1 card), then river (1 card).'),
        opt('The showdown', 'The showdown is when hands are shown, not a card.'),
      ], 1, 'The order is always preflop, flop, turn, river.'),
      read(
        'On your turn you choose one of six actions:\n\n- [[fold|Fold]]: give up your hand.\n- [[check|Check]]: pass without betting (only if there is no bet for you to match. Before the flop the big blind counts as a bet, so only the big blind can check, and only if nobody raised).\n- [[bet|Bet]]: put chips in first.\n- [[call|Call]]: match the bet in front of you.\n- [[raise|Raise]]: make the bet bigger; everyone who wants to stay in must match it.\n- [[all-in|All-in]]: bet every chip you have.\n\nIf someone has bet, you cannot check: you must call, raise or fold. If nobody has bet, you can check or bet.',
        undefined,
        'Your six actions',
      ),
      ask('basics', 'Nobody has bet on the flop yet and it is your turn. What can you do?', [
        opt('Fold or call', 'There is nothing to call yet.'),
        opt('Check or bet', 'Correct. With no bet in front of you, you can pass (check) or put chips in (bet).'),
        opt('Only raise', 'You can only raise an existing bet. With none, the action is called a bet.'),
      ], 1, 'No bet in front of you: check or bet. A bet in front of you: fold, call or raise.'),
      ask('basics', 'Your opponent bets 200 and you want to stay in the hand without raising. What do you do?', [
        opt('Check', 'You cannot check when there is a bet to answer.'),
        opt('Call 200', 'Yes: calling means matching the bet.'),
        opt('Bet 200', 'Betting is only for the first chips put in. Matching is a call.'),
      ], 1, 'To match a bet you call.'),
      quiz([
        item('basics', 'What is the correct order of the betting rounds?', [
          opt('Flop, preflop, river, turn', 'Preflop always comes first.'),
          opt('Preflop, flop, turn, river', 'Correct.'),
          opt('Preflop, turn, flop, river', 'The flop (three cards) comes before the turn.'),
        ], 1, 'Preflop, flop, turn, river.'),
        item('basics', 'How many board cards are there on the flop?', [
          opt('Three', 'Correct: the flop is three cards dealt together.'), opt('One', 'That is the turn or the river.'), opt('Five', 'Five is the complete board after the river.'),
        ], 0, 'The flop is three cards.'),
        item('basics', 'Which action is NOT possible when someone has just bet?', [
          opt('Call', 'You can call: a call simply means matching the bet in front of you.'), opt('Check', 'Correct: you cannot check once a bet is in front of you.'), opt('Fold', 'You can always fold: giving up the hand is always allowed.'),
        ], 1, 'Facing a bet, you may fold, call or raise, but not check.'),
        item('basics', 'When do players show their cards?', [
          opt('At the showdown, after the final betting round', 'Correct (unless everyone else folds first).'),
          opt('As soon as they are dealt', 'Hole cards stay private until the end.'),
          opt('After the flop', 'The flop is just the first three board cards.'),
        ], 0, 'At the showdown: after the river betting, or earlier if a player is all-in, as long as more than one player is still in.'),
      ], 3, 'Quick check'),
    ],
  },
  {
    id: 'm0-l3', module: 0, title: 'Play your first hand', minutes: 6,
    goal: 'Play one complete hand from the deal to the showdown.',
    steps: [
      read(
        'Time to play. The next hand is scripted so you can see every step without any pressure: you will be dealt a hand, see each round, and reach a showdown. A guide will tell you what to do. The other players\' cards and moves are planned too.\n\nWatch the **pot** in the middle grow and notice the round names change as the board cards appear.',
        undefined,
        'A guided hand',
      ),
      { kind: 'hand' },
      quiz([
        item('basics', 'In the hand you just played, what happened after the flop betting?', [
          opt('The river was dealt', 'The turn comes before the river.'),
          opt('The turn card was dealt', 'Correct: flop, then turn, then river.'),
          opt('Everyone showed their cards', 'Not yet: there were two more cards and betting rounds to come.'),
        ], 1, 'Flop, turn, river, then showdown.'),
        item('basics', 'How did the hand end?', [
          opt('Everyone else folded', 'That is one way, but this hand went to a showdown.'),
          opt('At a showdown: cards were shown and the best hand won', 'Correct.'),
          opt('The dealer chose the winner', 'The cards decide, never the dealer.'),
        ], 1, 'Showdown: the best five-card hand takes the pot.'),
      ], 2, 'Quick check'),
    ],
  },

  // =====================================================================
  // MODULE 1 — Hand rankings
  // =====================================================================
  {
    id: 'm1-l1', module: 1, title: 'The nine hands, weakest to strongest', minutes: 6,
    goal: 'Name any five-card hand and say which of two hand types is stronger.',
    steps: [
      read(
        'Every hand falls into one of **nine types**. The order comes from how rare each hand is in a five-card deal: the rarer the type, the higher it ranks.\n\nFrom weakest to strongest: [[high-card|high card]], [[pair|pair]], [[two-pair|two pair]], [[trips|three of a kind]], [[straight|straight]], [[flush|flush]], [[full-house|full house]], [[quads|four of a kind]], [[straight-flush|straight flush]].\n\nThis order never changes. Learn it until you do not have to think about it.',
        { ladder: true },
        'The ladder',
      ),
      ask('hand-rankings', 'Which is stronger: a flush or a straight?', [
        opt('A straight', 'A flush is harder to make than a straight, so it ranks higher.'),
        opt('A flush', 'Correct: five cards of one suit beats five cards in a row.'),
        opt('They are equal', 'They are different types and the ladder decides: flush is higher.'),
      ], 1, 'Flush beats straight. Remember: full house, quads and straight flush sit at the very top.'),
      ask('hand-rankings', 'Which is stronger: three of a kind or two pair?', [
        opt('Two pair', 'Two pair sounds like more, but three of a kind is rarer and ranks higher.'),
        opt('Three of a kind', 'Correct.'),
      ], 1, 'Three of a kind beats two pair.'),
      worked('How to read a hand: start from the top', [
        'Cards: 9♠ 9♦ 9♣ K♥ K♠. Look for the strongest pattern first.',
        'Four of a kind? No, there are only three nines.',
        'Three of a kind plus a pair? Yes: three nines and two kings.',
        'That is a full house, "nines full of kings". No need to check lower patterns.',
      ], 'Check from the top of the ladder down. The first pattern you find is the answer.', { board: '9s 9d 9c Kh Ks' }),
      { kind: 'practice', drill: 'hand-category', count: 5, difficulty: 1, label: 'Name these hands', mastery: true, passAt: 4 },
    ],
  },
  {
    id: 'm1-l2', module: 1, title: 'Best five of seven', minutes: 5,
    goal: 'Pick the best five-card hand out of your two hole cards and the board.',
    steps: [
      read(
        'In Hold\'em you see **seven cards** (two hole cards + five board cards) but a hand is exactly **five**. You pick the best five. The other two are ignored.\n\nYou may use both hole cards, one, or none. If the board alone is your best five, you are "playing the board".',
        { hole: 'Ah 5h', board: 'Kh 9h 2c 2d 7h', highlight: 'Ah Kh 9h 7h 5h' },
        'Seven cards, five count',
      ),
      worked('Finding the best five', [
        'Your cards: A♥ 5♥. Board: K♥ 9♥ 2♣ 2♦ 7♥.',
        'Pairs? There is a pair of twos on the board. That is a small hand.',
        'Flush? Hearts: A♥, 5♥, K♥, 9♥, 7♥. Five hearts!',
        'A flush beats a pair of twos. Best five: A♥ K♥ 9♥ 7♥ 5♥ (the two 2s are ignored).',
      ], 'Scan for the strongest pattern among all seven cards, then pick the five that make it.', { hole: 'Ah 5h', board: 'Kh 9h 2c 2d 7h', highlight: 'Ah Kh 9h 7h 5h' }),
      complete('Now you finish one', ['Your cards: 8♠ 8♦. Board: 8♣ Q♥ Q♠ 3♦ 4♣.', 'You can see three eights and two queens.'], [
        { prompt: 'What type of hand is that?', options: ['Two pair', 'Three of a kind', 'Full house'], correct: 2, why: 'Three eights plus a pair of queens is a full house.' },
        { prompt: 'Which five cards make it?', options: ['8-8-8-Q-Q', '8-8-Q-Q-4', '8-8-8-Q-4'], correct: 0, why: 'All three eights and both queens.' },
      ], 'When several patterns exist, take the strongest one.', { hole: '8s 8d', board: '8c Qh Qs 3d 4c' }),
      { kind: 'practice', drill: 'best-five', count: 4, difficulty: 1, label: 'Tap your best five cards', mastery: true, passAt: 3 },
    ],
  },
  {
    id: 'm1-l3', module: 1, title: 'Kickers, ties, and "the board plays"', minutes: 6,
    goal: 'Decide who wins when hands look similar, including ties.',
    steps: [
      read(
        'When two players have the same type of hand, the **cards inside the hand** decide. Compare the main part first (for example, the rank of the pair), then the remaining cards from highest to lowest.\n\nA pair of kings with an ace beats a pair of kings with a queen. That extra card is the [[kicker|kicker]]. Kickers only matter when the main part of the hands is equal.',
        { board: 'Ks 9d 4c 2h 7s', hands: [{ label: 'Player A', cards: 'Kd Ac' }, { label: 'Player B', cards: 'Kh Qc' }], caption: 'Both have a pair of kings. Player A\'s ace kicker wins.' },
        'The kicker',
      ),
      ask('kickers', 'Board: K♠ 9♦ 4♣ 2♥ 7♠. Player A has K♦ A♣. Player B has K♥ Q♣. Who wins?', [
        opt('Player A: same pair of kings, but the ace kicker is higher', 'Correct.'),
        opt('Player B', 'A queen kicker is lower than an ace kicker.'),
        opt('It is a tie', 'Only if the kickers were equal.'),
      ], 0, 'Equal pairs are decided by the next-highest card.', { board: 'Ks 9d 4c 2h 7s', hands: [{ label: 'Player A', cards: 'Kd Ac' }, { label: 'Player B', cards: 'Kh Qc' }] }),
      read(
        'Two special cases:\n\n- **The board plays.** If nobody can make a better five than the five on the board, everybody still in plays the board and splits the pot. This is a [[split-pot|split pot]]. Example: the board is 5-6-7-8-9 and nobody holds a 10, so everyone has the same nine-high straight. Careful: anyone holding a 10 has a higher straight and beats everyone who does not.\n- **The wheel.** An ace can be low in a straight: A-2-3-4-5 is the lowest straight. [[wheel|The wheel]] loses to any other straight, such as 2-3-4-5-6.',
        { board: '5s 6d 7c 8h 9s', caption: 'A straight on the board. A lower card cannot improve it, but anyone holding a 10 has a higher straight.' },
        'Ties and the wheel',
      ),
      ask('ties', 'The board is A♠ K♠ Q♠ J♠ 10♠. You hold 2♦ 3♦ and your opponent holds 9♣ 8♣. What happens?', [
        opt('You win because you hold 2 and 3', 'Your cards are lower than every board card, so they do not help you at all.'),
        opt('Your opponent wins with the 9', 'The best five are all on the board, so neither of you improves it.'),
        opt('You split the pot: the board plays for both of you', 'Correct. A royal flush on the board is the best possible hand, so everyone splits.'),
      ], 2, 'When the board makes the best five, everyone left splits the pot.', { board: 'As Ks Qs Js Ts', hole: '2d 3d' }),
      { kind: 'practice', drill: 'rank-winner', count: 5, difficulty: 2, label: 'Who wins?', mastery: true, passAt: 4 },
    ],
  },

  // =====================================================================
  // MODULE 2 — Position
  // =====================================================================
  {
    id: 'm2-l1', module: 2, title: 'The button and seat names', minutes: 4,
    goal: 'Name every seat at a six-player table from the dealer button.',
    steps: [
      read(
        'Your [[position|position]] is where you sit compared with the dealer button. At a six-player table the seats are named, clockwise from the button:\n\n- [[btn|Button (BTN)]]\n- [[sb|Small blind (SB)]]\n- [[bb|Big blind (BB)]]\n- [[utg|Under the gun (UTG)]]: first to act before the flop\n- [[hijack|Hijack (HJ)]]\n- [[cutoff|Cutoff (CO)]]: the seat right before the button\n\nThe names rotate with the button after every hand.',
        { seats: { button: 0 } },
        'Seat names',
      ),
      ask('position', 'Which seat is directly to the right of the button (just before it)?', [
        opt('Cutoff (CO)', 'Correct: the cutoff sits right before the button.'),
        opt('Small blind', 'The small blind is directly to the left of the button.'),
        opt('Under the gun', 'UTG is the first seat after the big blind.'),
      ], 0, 'Clockwise: BTN → SB → BB → UTG → HJ → CO → BTN.', { seats: { button: 0, hero: 5 } }),
      { kind: 'practice', drill: 'position-name', count: 6, difficulty: 1, label: 'Name the highlighted seat', mastery: true, passAt: 5 },
    ],
  },
  {
    id: 'm2-l2', module: 2, title: 'Why acting last is powerful', minutes: 5,
    goal: 'Explain why later positions are more valuable, in your own words.',
    steps: [
      ask('position', 'Before you read on: in a round of betting, would you rather act first or last? Why?', [
        opt('First, so I can take control', 'A fair instinct, but think about what you know when you choose.'),
        opt('Last, because I see what everyone else does first', 'Yes. Information is valuable and you get the most of it by acting last.'),
        opt('It does not matter', 'It matters a lot, and it is the reason the button is the best seat.'),
      ], 1, 'Acting last means you make every decision knowing what everyone else did.'),
      read(
        'After the flop, the first player still in the hand to the left of the button acts first, and the button, if it is still in, acts last. Acting after your opponent is called being [[in-position|in position]]. Acting before is [[out-of-position|out of position]].\n\nIn position you can:\n- see whether they check or bet before you decide,\n- check behind to see the next card for free,\n- make a bigger decision only when you know more.\n\nThe button is the only seat that is in position against everyone on every round after the flop.\n\nHeads-up (only two players), the button posts the small blind. It acts first before the flop and last after it, so it is in position on every round after the flop.',
        undefined,
        'Information is power',
      ),
      worked('In position vs out of position', [
        'You and an opponent see a flop. Your opponent is first to act.',
        'They check. Now you know they probably do not have a big hand (or want to trap).',
        'If you are in position you may bet, or check and see the next card for free.',
        'If you were out of position you would have had to decide first, with less information.',
      ], 'The player who acts second has more information for the same decision.'),
      { kind: 'why', prompt: 'Why is being in position an advantage?', options: [
        { text: 'You get to see what your opponent does before you decide.', good: true, feedback: 'Exactly: extra information makes better decisions, every round.' },
        { text: 'You win more chips automatically when you sit on the button.', good: false, feedback: 'No automatic winnings exist. Position only helps you decide better.' },
        { text: 'Your cards are stronger when you act last.', good: false, feedback: 'Cards are random and do not change with your seat. The advantage is about information.' },
        { text: 'You can raise more often because people respect the button.', good: false, feedback: 'Respect is not the reason. You act with more information, that is all.' },
      ] },
      quiz([
        item('position', 'Which seat acts last after the flop?', [
          opt('Button', 'Correct.'), opt('Big blind', 'The blinds act early after the flop.'), opt('Under the gun', 'UTG acts first before the flop but is early after it too.'),
        ], 0, 'The button acts last on every round after the flop.'),
        item('position', 'You are out of position against your opponent. What does that mean?', [
          opt('You act before them on each round', 'Correct.'), opt('You act after them', 'That would be in position.'), opt('You have folded', 'No, out of position only describes the order of acting.'),
        ], 0, 'Out of position = acting first.'),
        item('position', 'Which seat is in position against the most opponents?', [
          opt('Small blind', 'The small blind acts first after the flop: the worst seat after the flop.'), opt('Button', 'Correct.'), opt('Big blind', 'The big blind also acts early after the flop.'),
        ], 1, 'The button is in position against everyone after the flop.'),
      ], 3, 'Quick check'),
    ],
  },
];
