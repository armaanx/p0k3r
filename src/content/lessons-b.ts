// Modules 3–5: preflop, reading the flop, outs/equity/pot odds.
import { DEFEND_SPECS, OPEN_SPECS, TIERS } from '../engine/preflopCharts';
import { ask, complete, item, opt, quiz, read, worked } from './dsl';
import type { Lesson } from './types';

const T12 = `${TIERS[0]!.spec},${TIERS[1]!.spec}`;
const T34 = `${TIERS[2]!.spec},${TIERS[3]!.spec}`;

export const LESSONS_B: Lesson[] = [
  // =====================================================================
  // MODULE 3 — Preflop
  // =====================================================================
  {
    id: 'm3-l1', module: 3, title: 'Starting hands and tiers', minutes: 6,
    goal: 'Recognise your starting hand and place it in a tier.',
    steps: [
      read(
        'There are 1,326 ways to be dealt two cards, but they collapse into just **169 kinds** of [[starting-hand|starting hand]]. We write them like this:\n\n- A [[pocket-pair|pocket pair]]: **77** (two sevens)\n- [[suited|Suited]] (same suit): **AKs**, read "ace-king suited"\n- [[offsuit|Offsuit]] (different suits): **AKo**\n\nSuited hands are a bit stronger than the same offsuit hand because they can make a flush. Cards close together, called [[connectors|connectors]] (like 9-8), can make straights.',
        { hole: 'Ah Kh' },
        'Reading a starting hand',
      ),
      read(
        'Not all hands are equal. We group them in five [[tier|tiers]]:\n\n1. **Premium**: AA, KK, QQ, AK\n2. **Strong**: JJ, TT, 99, AQ, AJs, ATs, KQs\n3. **Playable**: medium pairs, good aces, suited high cards like K-J or Q-J\n4. **Speculative**: small pairs, small suited aces, suited connectors and weaker offsuit high cards. A few of the best (like 55, A5s or 98s) open from any seat; most are for later seats.\n5. **Weak**: everything else. Most hands live here. Fold them from early and middle seats; a few become opens from the cutoff, and many more from the button or the small blind.\n\nThe colours on the grid show tiers 1–2 (Premium and Strong) and tiers 3–4 (Playable and Speculative).',
        { grid: { spec: T12, label: 'Tiers 1–2: Premium and Strong', spec2: T34, label2: 'Tiers 3–4: Playable and Speculative' } },
        'Five tiers',
      ),
      ask('hand-tiers', 'Which hand is better before the flop: K♠ Q♠ or K♠ Q♦?', [
        opt('K♠ Q♠ (suited)', 'Correct: the same cards in the same suit can also make flushes, so suited is stronger.'),
        opt('K♠ Q♦ (offsuit)', 'They are the same high cards, but suited hands have extra ways to win.'),
        opt('They are exactly equal', 'Close, but the chance of a flush gives the suited hand a small edge.'),
      ], 0, 'Suited hands are better than the same offsuit hands.'),
      ask('hand-tiers', 'Which of these is a Tier 1 (premium) hand?', [
        opt('J♦ 10♦', 'A fun hand, but not premium.'),
        opt('A♣ K♥', 'Correct: AK is one of the four premium hands with AA, KK and QQ.'),
        opt('7♠ 7♦', 'Decent, but not premium.'),
      ], 1, 'Premium hands: AA, KK, QQ and AK.'),
      { kind: 'practice', drill: 'tier-place', count: 6, difficulty: 1, label: 'Place the hand in a tier', mastery: true, passAt: 5 },
    ],
  },
  {
    id: 'm3-l2', module: 3, title: 'Folding is the main skill', minutes: 6,
    goal: 'Decide whether to raise or fold when nobody has entered the pot.',
    steps: [
      ask('open-range', 'Before you read on: out of 100 hands dealt to you at a six-player table, how many do you think a winning player chooses to play?', [
        opt('About 70', 'That is far too many. Most of those hands lose money.'),
        opt('About 40', 'That is a very loose player. Winners usually play fewer.'),
        opt('About 20 to 25 (so they fold the other 75 to 80)', 'Right. Disciplined players fold roughly three out of every four hands, or more.'),
      ], 2, 'Folding is the main preflop skill. The chips you do not lose on weak hands add up.'),
      read(
        'When everyone before you has folded, you have two choices: fold, or raise. This is called [[open-raise|opening]] (we do not [[limp|limp]], meaning just calling the big blind).\n\nThe more players still to act behind you, the more likely someone holds a strong hand. So the **earlier your seat, the tighter your [[range|range]]**. A range is the whole set of hands you would play in a situation.\n\nApproximate share of hands to open: UTG 14%, hijack 19%, cutoff 27%, button 44%.',
        { grid: { spec: OPEN_SPECS.UTG, label: 'UTG opening range (about 14%)' } },
        'Early seats play fewer hands',
      ),
      read(
        'Compare the same picture for the button. Every hand that is coloured is a hand to raise with; every empty square is a fold. On the button only two players are left to act behind you, and you will act last after the flop.',
        { grid: { spec: OPEN_SPECS.BTN, label: 'Button opening range (about 44%)' } },
        'The button opens much more',
      ),
      worked('Should I open 7♥ 6♥?', [
        'From UTG: look at the UTG grid. 76s is not coloured there, and five players still act behind us. Fold.',
        'From the button: look at the button grid. 76s is coloured. Only two players act behind us and we will act last. Raise.',
        'Same hand, different seat, different answer.',
      ], 'A hand is never "good" or "bad" on its own: it depends on your seat.', { hole: '7h 6h' }),
      complete('Your turn', ['You are in the cutoff. Everyone folds to you. You hold A♦ 9♣.'], [
        { prompt: 'Is A9o inside the cutoff range on the grid?', options: ['Yes', 'No'], correct: 0, why: 'The cutoff opens A8o and better, so A9o is inside. Raise.' },
      ], 'Check the chart for your seat before you decide.', { grid: { spec: OPEN_SPECS.CO, label: 'Cutoff opening range (about 27%)', focus: 'A9o' }, hole: 'Ad 9c' }),
      { kind: 'practice', drill: 'open-fold', count: 6, difficulty: 1, label: 'Raise or fold?', mastery: true, passAt: 5 },
    ],
  },
  {
    id: 'm3-l3', module: 3, title: 'Mixing seats: opening ranges by position', minutes: 5,
    goal: 'Choose correctly across every seat without the lesson telling you which seat to expect.',
    steps: [
      read(
        'Do not memorise 169 hands for every seat. Learn the **shape**:\n\n- Every seat opens pairs of 55 and up, and strong aces. The smallest pairs join later: 44 from the hijack, 33 and 22 from the cutoff on.\n- Earlier seats drop the weaker hands first: offsuit hands fall away, then weaker suited hands.\n- The small blind opens a little tighter than the button because it will be out of position.\n\nThe big blind never gets to open: if everyone folds to it, it simply wins the blinds. (If someone just calls, the big blind may check or raise.)',
        { grid: { spec: OPEN_SPECS.HJ, label: 'Hijack (about 19%)', spec2: OPEN_SPECS.UTG, label2: 'UTG (about 14%)' } },
        'Learn the shape, not every square',
      ),
      ask('open-range', 'Which seat opens the widest range of hands?', [
        opt('Under the gun (UTG)', 'UTG is first to act, so it is the tightest.'),
        opt('Cutoff', 'Wide, but the button is wider.'),
        opt('Button', 'Correct: fewest players left to act, and it acts last after the flop.'),
      ], 2, 'The button opens about 44% of hands.'),
      { kind: 'practice', drill: 'open-fold', count: 6, difficulty: 2, label: 'Raise or fold? (all seats mixed)', mastery: true, passAt: 5 },
    ],
  },
  {
    id: 'm3-l4', module: 3, title: 'Facing a raise', minutes: 6,
    goal: 'Choose fold, call or re-raise when someone has already raised.',
    steps: [
      read(
        'When someone has raised before you, the situation changes. A raise usually means a good hand, and you may be out of position for the rest of the hand. So you need a **stronger** hand to continue than you needed to open.\n\nYou have three choices: fold (most hands), call (good hands), or re-raise. Re-raising is called a [[3bet|3-bet]] (the blind was bet one, the raise bet two, your re-raise bet three).\n\nA simple plan: re-raise your very best hands, call with good hands that play well after the flop, and fold the rest. (The charts also re-raise a few small suited aces such as A5s.)',
        { grid: { spec: DEFEND_SPECS['BTN>CO']!.threeBet, label: 'Button vs cutoff raise: re-raise', spec2: DEFEND_SPECS['BTN>CO']!.call, label2: 'Call' } },
        'Tighter than opening',
      ),
      ask('facing-raise', 'The under-the-gun player raises. You are in the hijack with J♥ 9♥. What is the standard play?', [
        opt('Call: it is suited', 'Suited hands are nice, but J9s is not strong enough against an early-position raise.'),
        opt('Fold', 'Correct. Against a raise from early position, J9s is outside the calling range.'),
        opt('Re-raise', 'That turns a weak hand into a big pot against a strong range.'),
      ], 1, 'Fold is right. Being suited is not enough against a strong range.', { hole: 'Jh 9h' }),
      ask('facing-raise', 'You are on the button. The cutoff raises. You hold A♠ A♦. What is the standard play?', [
        opt('Just call to hide your strength', 'A premium hand wants a big pot now, before the flop.'),
        opt('Re-raise (3-bet)', 'Correct: build the pot with the best hand.'),
        opt('Fold', 'Never fold aces preflop.'),
      ], 1, 'Re-raise your best hands for value.', { hole: 'As Ad' }),
      worked('Where the big blind is different', [
        'The big blind already has a full blind in the pot, so calling costs less than it does for other seats.',
        'That makes the big blind the seat that defends the widest range against a raise.',
        'But "defend wide" is not "defend everything": weak offsuit hands are still folds.',
      ], 'Your price depends on your seat. The big blind gets the best price.'),
      { kind: 'practice', drill: 'facing-raise', count: 6, difficulty: 1, label: 'Fold, call or re-raise?', mastery: true, passAt: 5 },
    ],
  },

  // =====================================================================
  // MODULE 4 — Postflop reading
  // =====================================================================
  {
    id: 'm4-l1', module: 4, title: 'How the flop connects to your hand', minutes: 6,
    goal: 'Tell whether you have a made hand, a draw, or nothing.',
    steps: [
      read(
        'After the flop, every hand you hold is one of three things:\n\n- A [[made-hand|made hand]]: a pair or better that already uses your cards. It can win at showdown as it is.\n- A [[draw|draw]]: not yet a hand, but one card away from a strong one. The most common are the [[flush-draw|flush draw]] (four of one suit) and the [[straight-draw|straight draw]] (four cards toward a straight).\n- [[air|Air]]: no pair, no real draw. It rarely wins a showdown, so it mostly wins only when everyone folds.\n\nAsking "made, draw, or air?" is the first question on every street.',
        { hole: 'Ah Kh', board: 'Qh 7h 2c' },
        'Made, draw, or air?',
      ),
      ask('hand-strength', 'You hold A♥ K♥. The flop is Q♥ 7♥ 2♣. What do you have?', [
        opt('A made hand', 'You have no pair: A-high is not a pair.'),
        opt('A draw (four hearts)', 'Correct: you have four hearts and need one more for a flush.'),
        opt('Air', 'You do have something: four hearts is a real draw.'),
      ], 1, 'Four cards of one suit is a flush draw.', { hole: 'Ah Kh', board: 'Qh 7h 2c' }),
      ask('hand-strength', 'You hold 5♣ 5♦. The flop is K♠ 9♥ 3♦. What do you have?', [
        opt('A made hand (a pair of fives)', 'Correct, though a weak one: both kings and nines are higher.'),
        opt('Air', 'A pair is a made hand, even if a small one.'),
        opt('A flush draw', 'You only have two diamonds (5♦ and 3♦). A flush draw needs four of one suit.'),
      ], 0, 'Pocket pairs are made hands even when some board cards are higher.', { hole: '5c 5d', board: 'Ks 9h 3d' }),
      read(
        'Made hands also vary. For a quick vocabulary:\n\n- [[top-pair|Top pair]]: your hole card matches the highest board card.\n- [[overpair|Overpair]]: a pocket pair higher than every board card.\n- [[overcards|Overcards]]: hole cards higher than every board card. Two overcards are a weak draw.\n\nStronger made hands: two pair, three of a kind (a "set" when you hold a pocket pair and hit the board).',
        { hole: 'Qd Qs', board: '9c 6h 2s' },
        'Words for pairs',
      ),
      { kind: 'practice', drill: 'made-draw-air', count: 6, difficulty: 1, label: 'Made hand, draw, or nothing?', mastery: true, passAt: 5 },
    ],
  },
  {
    id: 'm4-l2', module: 4, title: 'Reading the board: dry or wet?', minutes: 6,
    goal: 'Describe a flop as dry, medium or wet, paired or monotone.',
    steps: [
      read(
        'The cards on the table shape what everyone is likely to hold. The [[texture|texture]] of the board tells you how dangerous it is.\n\nA [[dry-board|dry board]] like K♠ 7♦ 2♣ has few draws: the cards are far apart and different suits. A [[wet-board|wet board]] like J♥ 10♥ 8♠ has flush and straight draws everywhere.\n\nBoards can also be [[paired-board|paired]] (two cards of one rank, so full houses are possible but straights and flushes are less likely) or [[monotone|monotone]] (all one suit).',
        { board: 'Ks 7d 2c', caption: 'Dry: few draws' },
        'Dry and wet',
      ),
      read(
        'On a dry board, a made hand usually stays best. On a wet board, hands change strength fast: a pair can be beaten by a draw that hits. The wetter the board, the more careful you must be with a one-pair hand.',
        { board: 'Jh Th 8s', caption: 'Wet: draws everywhere' },
        'Why it matters',
      ),
      ask('board-texture', 'Which flop is the wettest (most draws)?', [
        opt('A♠ 7♦ 2♣', 'The cards are spread out and in different suits. Very dry.'),
        opt('9♥ 8♥ 7♣', 'Correct: three cards in a row, two of a suit. Straight and flush draws everywhere.'),
        opt('K♠ K♦ 4♣', 'Paired, with few draws. Dry.'),
      ], 1, 'Connected cards plus two of a suit make a wet board.', { board: '9h 8h 7c' }),
      { kind: 'practice', drill: 'board-texture', count: 6, difficulty: 1, label: 'Read the board', mastery: true, passAt: 5 },
    ],
  },
  {
    id: 'm4-l3', module: 4, title: 'How strong is my hand?', minutes: 5,
    goal: 'Sort made hands into strong, medium and weak, and know when to be careful.',
    steps: [
      read(
        'Rough strength groups for a made hand:\n\n- **Monster**: a set, a straight, the best possible flush, a full house or better. You want a big pot.\n- **Strong**: two pair using both your cards, three of a kind using one of your cards and a pair on the board, an overpair of tens or better, top pair with a good kicker (a jack or higher), or a flush that is not the best possible one.\n- **Medium**: top pair with a weaker kicker (ten or lower), second pair, a small overpair (nines or lower), two pair where one pair is on the board.\n- **Weak**: bottom pair, or a pocket pair below the top two board cards (such as 5-5 on K-9-3, or below every board card).\n\nTop pair is only as good as its kicker: top pair with an ace kicker beats top pair with a 3 kicker.',
        { hole: 'As Kd', board: 'Kh 8c 3d' },
        'Four groups',
      ),
      ask('hand-strength', 'Before the quiz: which is better, top pair with an ace kicker or top pair with a 3 kicker?', [
        opt('Top pair with the ace kicker', 'Correct: the kicker breaks ties when two players both pair the top card.'),
        opt('They are equal', 'Not equal: the higher side card wins.'),
        opt('The 3 kicker, it is less obvious', 'Hiding is not a thing here. The ace is simply higher.'),
      ], 0, 'Kickers decide between similar pairs.', { board: 'Kh 8c 3d' }),
      quiz([
        item('hand-strength', 'Board: K♥ 8♣ 3♦. You hold A♠ K♦. How strong is your hand?', [
          opt('Strong: top pair with an ace kicker', 'Correct: top pair with the best kicker.'), opt('Weak', 'Top pair with an ace kicker is one of the best one-pair hands.'), opt('Monster', 'A single pair is not a monster.'),
        ], 0, 'Top pair, top kicker is strong.', { hole: 'As Kd', board: 'Kh 8c 3d' }),
        item('hand-strength', 'Board: K♥ 8♣ 3♦. You hold 3♠ 2♦. How strong is your hand?', [
          opt('Weak: bottom pair', 'Correct: a pair of threes is the smallest pair on the board.'), opt('Strong', 'Two of the three board cards are higher.'), opt('Air', 'You do have a pair, even if a poor one.'),
        ], 0, 'Bottom pair is weak.', { hole: '3s 2d', board: 'Kh 8c 3d' }),
        item('hand-strength', 'Board: 9♠ 9♦ 4♣. You hold A♥ K♥. What do you have?', [
          opt('Air, with two overcards', 'Correct: you have no pair of your own. The pair of nines is on the board and everyone shares it.'), opt('A strong pair of nines', 'The nines belong to everyone, not to you.'), opt('Two pair', 'You have no second pair.'),
        ], 0, 'A pair on the board does not count as your own strength.', { hole: 'Ah Kh', board: '9s 9d 4c' }),
        item('hand-strength', 'On a wet board you have one pair. What should you be careful about?', [
          opt('Many draws can overtake you', 'Correct: draws hit often on wet boards.'), opt('Nothing: a pair is always safe', 'On a wet board even top pair is often beaten.'), opt('Your pair gets weaker when you bet', 'Betting does not change your cards.'),
        ], 0, 'Wet boards punish one-pair hands.'),
      ], 3, 'Mastery check'),
    ],
  },

  // =====================================================================
  // MODULE 5 — Outs, equity, pot odds
  // =====================================================================
  {
    id: 'm5-l1', module: 5, title: 'Counting your outs', minutes: 6,
    goal: 'Count the cards that would complete your draw.',
    steps: [
      read(
        'An [[out|out]] is a card still in the deck that would improve your hand to one that is probably the best. To count outs: picture the deck, and count the unseen cards that finish your hand. You cannot count cards you can already see (your own and the board).\n\nThe common draws:\n\n- [[flush-draw|Flush draw]]: 13 cards in the suit − the 4 you can see = **9 outs**\n- [[open-ended|Open-ended straight draw]] (four in a row, both ends open): two ranks that finish it × 4 suits = **8 outs**\n- Double gutshot (not four in a row, but two different ranks finish it, like 9-7 on J-8-5: a ten or a six): also **8 outs**\n- [[gutshot|Gutshot]]: one rank × 4 suits = **4 outs**\n- Two [[overcards|overcards]]: 3 cards left of each = **6 outs** to pair one',
        { hole: 'Ah Kh', board: 'Qh 7h 2c' },
        'What is an out?',
      ),
      worked('Counting a flush draw', [
        'You hold A♥ K♥. The board is Q♥ 7♥ 2♣. That is four hearts.',
        'There are 13 hearts in the deck.',
        'You can see 4 of them (two in your hand, two on the board).',
        '13 − 4 = 9 hearts remain. Any one makes a flush. 9 outs.',
        'Your A♥ and K♥ are also overcards: any of the other 3 aces or 3 kings gives you top pair. So this hand has about 9 + 6 = 15 outs; the flush part alone is 9.',
      ], 'Suit size (13) minus the cards you can see.', { hole: 'Ah Kh', board: 'Qh 7h 2c' }),
      complete('Now you finish one', ['You hold 9♣ 8♦. The flop is 7♥ 6♠ 2♦.', 'You have four cards in a row: 9-8-7-6.'], [
        { prompt: 'Which two ranks finish your straight?', options: ['Ten or five', 'Ten or jack', 'Five or four'], correct: 0, why: 'A ten makes 6-7-8-9-10 and a five makes 5-6-7-8-9.' },
        { prompt: 'How many outs does the straight draw give? (4 suits each)', options: ['4', '8', '9'], correct: 1, why: '2 ranks × 4 suits = 8 outs for the straight. (Your 9 and 8 are also overcards, worth up to 6 more outs to pair one.)' },
      ], 'Ranks that finish the hand × 4 suits.', { hole: '9c 8d', board: '7h 6s 2d' }),
      { kind: 'practice', drill: 'outs', count: 5, difficulty: 1, label: 'Count the outs', mastery: true, passAt: 4 },
    ],
  },
  {
    id: 'm5-l2', module: 5, title: 'The Rule of 2 and 4, and dirty outs', minutes: 6,
    goal: 'Turn outs into a chance of winning, and spot outs that might not be real.',
    steps: [
      read(
        'How likely are you to hit your outs? The [[rule-2-4|Rule of 2 and 4]] gives a quick estimate in percent:\n\n- On the **flop** (two cards to come): outs × **4**\n- On the **turn** (one card to come): outs × **2**\n\nExample: a flush draw has 9 outs. On the turn it is about 9 × 2 = 18% (the exact chance is 9 ÷ 46, about 20%).\n\nFor big draws (more than 8 outs) the ×4 is too high: subtract (outs − 8). A flush draw on the flop: 9 × 4 = 36, minus 1 = **35%**. 12 outs: 48 − 4 = 44%. 15 outs: 60 − 7 = 53%.',
        { meter: { equity: 0.35 }, caption: 'Flush draw on the flop: about 35% (9 × 4 = 36, minus 1)' },
        'Turning outs into percent',
      ),
      ask('outs', 'You have a gutshot (4 outs) on the turn, one card to come. Roughly what is your chance to hit?', [
        opt('About 8%', 'Correct: 4 × 2 = 8% (the exact number is 4/46 ≈ 8.7%).'),
        opt('About 16%', 'That would be ×4, which is for two cards to come (the flop).'),
        opt('About 40%', 'Far too high: a gutshot is a long shot.'),
      ], 0, 'One card to come: outs × 2.'),
      read(
        'Beware of [[dirty-out|dirty outs]]: cards that look like they help you, but might also hand an opponent a better hand. Examples:\n\n- Your straight-completing card also puts three cards of one suit on the board: someone with two of that suit now has a flush.\n- Your flush-completing card pairs the board: someone could have a full house.\n\nWhen outs are dirty, count them as only "half" or leave them out.',
        { hole: '9c 8d', board: '7h 6h 2s', caption: 'A heart ten or five would complete your straight, but it would also put three hearts on the board.' },
        'Not every out is clean',
      ),
      { kind: 'practice', drill: 'outs', count: 4, difficulty: 3, label: 'Count only the clean outs', mastery: true, passAt: 3 },
    ],
  },
  {
    id: 'm5-l3', module: 5, title: 'Pot odds: price vs chance', minutes: 7,
    goal: 'Decide whether a call is profitable by comparing price with chance.',
    steps: [
      read(
        'Every call has a **price** and gives you a **chance** of winning. If the chance is bigger than the price asks for, calling makes money over many hands.\n\nThe price is set by [[pot-odds|pot odds]]. Suppose the pot is 300 and your opponent bets 100. The pot is now 400 and it costs you 100 to call: you **risk 100 to win 400** (you need to win more than 1 time in 5).\n\nThe chance you need is the [[break-even|break-even equity]]: **risk ÷ (win + risk)**, where "win" is everything already in the pot, including their bet. Here: 100 ÷ (400 + 100) = 100 ÷ 500 = 20%.',
        { odds: { pot: 400, bet: 100 } },
        'The price of a call',
      ),
      worked('Is this call profitable?', [
        'The pot is 600. Your opponent bets 300. You hold Q♥ 8♥: a flush draw on the turn, 9 outs (pairing your queen or eight would not beat a king).',
        'Price: you risk 300 to win 900 (the 600 pot plus their 300 bet). Need 300 ÷ (900 + 300) = 300 ÷ 1,200 = 25%.',
        'Chance: 9 outs × 2 = 18% (one card to come).',
        '18% is less than 25%, so folding is correct (unless you can expect to win a lot more later).',
      ], 'Compare: chance vs price. Chance higher → call. Chance lower → fold.', { hole: 'Qh 8h', board: 'Kh 9h 2c 7d', odds: { pot: 900, bet: 300 } }),
      complete('Your turn', ['The pot is 200. Your opponent bets 100, so you risk 100 to win 300.', 'You estimate a 30% chance to win the hand.'], [
        { prompt: 'What chance do you need to break even? (100 ÷ (300 + 100))', options: ['20%', '25%', '33%'], correct: 1, why: '100 ÷ 400 = 25%.' },
        { prompt: 'Call or fold?', options: ['Call', 'Fold'], correct: 0, why: 'You have 30% and need only 25%: calling is profitable.' },
      ], 'Need 25%, have 30%: call.', { odds: { pot: 300, bet: 100 } }),
      { kind: 'practice', drill: 'pot-odds', count: 6, difficulty: 2, label: 'Right price?', mastery: true, passAt: 5, confidence: true },
    ],
  },
  {
    id: 'm5-l4', module: 5, title: 'Estimating your chances', minutes: 5,
    goal: 'Guess your chance of winning within a few points.',
    steps: [
      read(
        'Your chance of winning the hand is called your [[equity|equity]]. You will not compute it exactly at the table, but you can learn benchmarks:\n\n- Pair vs two overcards (like QQ vs AK): roughly **55% to 45%**, a coin flip with a small edge (a bit more against offsuit AK).\n- Bigger pair vs smaller pair (like QQ vs 77): about **80%** for the bigger pair.\n- Dominated hand (like A-Q vs A-K): about **25%**.\n- A flush draw on the flop completes by the river about **35%** of the time.\n\nThe skill is calibration: your guesses should be close to the truth. Practise with the slider below. The app computes the exact answer each time.',
        { meter: { equity: 0.46 }, caption: 'A♠K♠ against Q♥Q♦ is almost a coin flip: about 46%' },
        'Benchmarks',
      ),
      ask('equity', 'A♠ K♠ against Q♥ Q♦ before the flop. Who is the favourite, and roughly by how much?', [
        opt('The queens, but only slightly (about 54% to 46%)', 'Correct: this is almost a coin flip.'),
        opt('The ace-king, by a lot', 'Pairs are usually ahead of two high cards, and only slightly here.'),
        opt('The queens, by a lot (about 80%)', 'A pair is that far ahead of a smaller pair, not of two higher cards.'),
      ], 0, 'Pair versus two overcards is about 55/45.', { hole: 'As Ks', hands: [{ label: 'Opponent', cards: 'Qh Qd' }] }),
      { kind: 'practice', drill: 'equity-guess', count: 4, difficulty: 1, label: 'Estimate the chance', mastery: true, passAt: 3, confidence: true },
    ],
  },
];
