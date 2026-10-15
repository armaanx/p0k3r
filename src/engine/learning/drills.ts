// Drill generators: every question is generated from the engine, so answers are computed, never hand-typed.
import { type Card, deckWithout, makeCard, rankOf, suitOf, RANK_CHARS, RANK_PLURALS, SUIT_NAMES, SUIT_SYMBOLS } from '../cards';
import { minDefenseFrequency, sprBand } from '../coach/odds';
import { PROFILES, ARCHETYPES, type Archetype } from '../bots';
import { Category, CATEGORY_NAMES, bestFive, categoryOf, describeScore, evaluate, straightHigh } from '../evaluator';
import { equityVsHand } from '../equity';
import { assessHand, straightCompletingRanks } from '../handStrength';
import { findOuts, type OutCard } from '../outs';
import {
  DEFEND_SPECS, POSITION_FULL_NAMES, TIER_BLURBS, TIER_NAMES, defendRanges_, facingRaiseVerdict, neighbourActions, openPercent, openRange, openVerdict,
  positionOf, tierOf, type Position, type PreflopAction,
} from '../preflopCharts';
import { ALL_LABELS, labelCombos, rangeLabels } from '../ranges';
import type { Rng } from '../rng';
import { classifyBoard, type BoardTexture } from '../texture';
import type { DrillGrade, DrillInput, DrillItem, DrillType, Visual } from './types';

type Diff = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_DEFS = [
  'no pair and nothing else',
  'two cards of the same rank',
  'two different pairs',
  'three cards of the same rank',
  'five cards in a row (any suits)',
  'five cards of the same suit',
  'three of one rank plus a pair of another',
  'four cards of the same rank',
  'five in a row, all of one suit',
];

/** Category names as they read inside a sentence ("a pair", "three of a kind"). */
const CATEGORY_PHRASE = ['high card', 'a pair', 'two pair', 'three of a kind', 'a straight', 'a flush', 'a full house', 'four of a kind', 'a straight flush'];

const cap = (s: string): string => `${s[0]!.toUpperCase()}${s.slice(1)}`;
const withArticle = (s: string): string => `${/^[aeiou]/i.test(s) ? 'an' : 'a'} ${s}`;

/** "A", "A and B", "A, B and C". */
const joinList = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** A card as short text, e.g. "K♥". */
const cardText = (c: Card): string => `${RANK_CHARS[rankOf(c)]}${SUIT_SYMBOLS[suitOf(c)]}`;

function id(type: string, rng: Rng): string {
  return `${type}-${rng.int(1_000_000_000).toString(36)}`;
}

function drawCards(rng: Rng, n: number, dead: readonly Card[] = []): Card[] {
  const deck = deckWithout(dead);
  for (let i = 0; i < n; i++) {
    const j = i + rng.int(deck.length - i);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck.slice(0, n);
}

interface Choice {
  options: string[];
  correct: number;
  /** index map from old (before shuffle) to new */
  map: number[];
}

/** Shuffle options and keep track of where each original option went. */
function shuffleOptions(rng: Rng, options: string[], correct: number): Choice {
  const idx = options.map((_, i) => i);
  rng.shuffle(idx);
  return { options: idx.map((i) => options[i]!), correct: idx.indexOf(correct), map: options.map((_, i) => idx.indexOf(i)) };
}

const base = (type: DrillType, concept: string, module: number): Pick<DrillItem, 'type' | 'concept' | 'module'> => ({ type, concept, module });

function finish(partial: Omit<DrillItem, 'wrong' | 'tolerance' | 'bestIndex'> & Partial<Pick<DrillItem, 'wrong' | 'tolerance' | 'bestIndex'>>): DrillItem {
  return { wrong: {}, tolerance: 0, bestIndex: partial.answer[0] ?? 0, ...partial };
}

const choiceInput = (options: string[]): DrillInput => ({ kind: 'choice', options });

/**
 * The ranks of a five-card hand in the order they are compared: the biggest group first (quads, trips, pairs, higher
 * pair first), then the kickers from high to low. In a five-high straight (A-2-3-4-5) the ace is low, so it goes last.
 */
export function comparisonOrder(five: readonly Card[]): number[] {
  const score = evaluate(five);
  const cat = categoryOf(score);
  const cnt = new Map<number, number>();
  for (const c of five) cnt.set(rankOf(c), (cnt.get(rankOf(c)) ?? 0) + 1);
  const ranks = five.map(rankOf).sort((a, b) => cnt.get(b)! - cnt.get(a)! || b - a);
  if ((cat === Category.Straight || cat === Category.StraightFlush) && ((score >> 16) & 15) === 3) {
    return [...ranks.filter((r) => r !== 12), 12];
  }
  return ranks;
}

const ranksText = (ranks: readonly number[]): string => ranks.map((r) => RANK_CHARS[r]).join(' ');

/** "Pair of Eights (8 8 A K 7)": the hand name plus every rank that counts, in comparison order. */
const handText = (five: readonly Card[]): string => `${describeScore(evaluate(five))} (${ranksText(comparisonOrder(five))})`;

// ---------------------------------------------------------------------------
// Module 1: hand rankings
// ---------------------------------------------------------------------------

function dealWithCategory(rng: Rng, target: Category, n: number): Card[] {
  // Rare categories are built directly, common ones by rejection sampling.
  const r = (): number => rng.int(13);
  const others = (exclude: number[], count: number): number[] => {
    const pool = [...Array(13).keys()].filter((x) => !exclude.includes(x));
    return rng.shuffle(pool).slice(0, count);
  };
  if (n === 5) {
    if (target === Category.Quads) {
      const q = r();
      return [0, 1, 2, 3].map((s) => makeCard(q, s)).concat(makeCard(others([q], 1)[0]!, rng.int(4)));
    }
    if (target === Category.FullHouse) {
      const [t, p] = others([], 2) as [number, number];
      const ts = rng.shuffle([0, 1, 2, 3]).slice(0, 3);
      const ps = rng.shuffle([0, 1, 2, 3]).slice(0, 2);
      return [...ts.map((s) => makeCard(t, s)), ...ps.map((s) => makeCard(p, s))];
    }
    if (target === Category.Flush) {
      for (;;) {
        const suit = rng.int(4);
        const ranks = others([], 5);
        const c = ranks.map((x) => makeCard(x, suit));
        if (categoryOf(evaluate(c)) === Category.Flush) return c;
      }
    }
    if (target === Category.Straight) {
      for (;;) {
        const hi = 4 + rng.int(9); // 4..12 (5-high to Ace-high)
        const ranks = hi === 4 ? [12, 0, 1, 2, 3] : [hi, hi - 1, hi - 2, hi - 3, hi - 4];
        const c = ranks.map((x) => makeCard(x, rng.int(4)));
        if (categoryOf(evaluate(c)) === Category.Straight) return c;
      }
    }
    if (target === Category.StraightFlush) {
      const hi = 4 + rng.int(8);
      const suit = rng.int(4);
      return [hi, hi - 1, hi - 2, hi - 3, hi - 4].map((x) => makeCard(x, suit));
    }
  }
  for (let i = 0; i < 20000; i++) {
    const c = drawCards(rng, n);
    if (categoryOf(evaluate(c)) === target) return c;
  }
  return drawCards(rng, n);
}

/** Do these cards contain a hand of category `c` somewhere (not necessarily as their best hand)? */
export function containsCategory(cards: readonly Card[], c: Category): boolean {
  const cnt = new Map<number, number>();
  let mask = 0;
  for (const x of cards) {
    cnt.set(rankOf(x), (cnt.get(rankOf(x)) ?? 0) + 1);
    mask |= 1 << rankOf(x);
  }
  const mult = [...cnt.values()].sort((a, b) => b - a);
  const m0 = mult[0] ?? 0;
  const m1 = mult[1] ?? 0;
  const maxSuit = Math.max(...[0, 1, 2, 3].map((s) => cards.filter((x) => suitOf(x) === s).length));
  switch (c) {
    case Category.HighCard: return true;
    case Category.Pair: return m0 >= 2;
    case Category.TwoPair: return m0 >= 2 && m1 >= 2;
    case Category.Trips: return m0 >= 3;
    case Category.Straight: return straightHigh(mask) >= 0;
    case Category.Flush: return maxSuit >= 5;
    case Category.FullHouse: return m0 >= 3 && m1 >= 2;
    case Category.Quads: return m0 >= 4;
    default: return categoryOf(evaluate(cards)) === Category.StraightFlush;
  }
}

function genHandCategory(rng: Rng, d: Diff): DrillItem {
  const pool: Category[] = d === 1
    ? [Category.HighCard, Category.Pair, Category.TwoPair, Category.Trips, Category.Straight, Category.Flush, Category.FullHouse, Category.Quads]
    : [Category.HighCard, Category.Pair, Category.TwoPair, Category.Trips, Category.Straight, Category.Flush, Category.FullHouse, Category.Quads, Category.Straight, Category.Flush];
  const target = rng.pick(pool);
  const n = d === 1 ? 5 : 7;
  const cards = dealWithCategory(rng, target, n);
  const best = bestFive(cards);
  const actual = categoryOf(best.score);
  // Distractors: neighbouring categories are the most tempting mistakes.
  const near = [actual - 2, actual - 1, actual + 1, actual + 2].filter((c) => c >= 0 && c <= 7 && c !== actual);
  const distract = rng.shuffle(near).slice(0, 3);
  while (distract.length < 3) {
    const c = rng.int(8);
    if (c !== actual && !distract.includes(c)) distract.push(c);
  }
  const all = [actual, ...distract];
  const ch = shuffleOptions(rng, all.map((c) => CATEGORY_NAMES[c]!), 0);
  const wrong: Record<number, string> = {};
  const better = CATEGORY_PHRASE[actual]!;
  all.slice(1).forEach((c, k) => {
    const name = CATEGORY_PHRASE[c]!;
    let text: string;
    if (c > actual) text = `${cap(name)} needs ${CATEGORY_DEFS[c]}. This hand doesn't have that.`;
    else if (c === Category.HighCard) text = `High card is what you have when nothing else is made, but these cards make ${better}, which beats it.`;
    else if (containsCategory(cards, c as Category)) text = `Your hand has that, but also something better: ${better} beats ${name}.`;
    else text = `${cap(name)} needs ${CATEGORY_DEFS[c]}, which these cards don't have. They make ${better}.`;
    wrong[ch.map[k + 1]!] = text;
  });
  const shown = n === 5 ? { board: rng.shuffle([...cards]) } : { hole: cards.slice(0, 2), board: cards.slice(2) };
  return finish({
    id: id('cat', rng), ...base('hand-category', 'hand-rankings', 1), spot: `rank:${CATEGORY_NAMES[actual]!.toLowerCase().replace(/ /g, '-')}`, difficulty: d,
    prompt: n === 5 ? 'What is the best hand these five cards make?' : 'What is the best five-card hand you can make with your two cards and the board?',
    visual: { ...shown, highlight: best.cards }, input: choiceInput(ch.options), answer: [ch.correct], wrong,
    explanation: `${handText(best.cards)}: ${CATEGORY_DEFS[actual]}.`, tier: 'math', seconds: d === 1 ? 10 : 15,
  });
}

/** How two hands of the same category are compared. */
const COMPARE_HOW: Record<Category, string> = {
  [Category.HighCard]: 'compare the cards from highest to lowest',
  [Category.Pair]: 'compare the pairs first, then the kickers from highest to lowest',
  [Category.TwoPair]: 'compare the higher pairs, then the lower pairs, then the kicker',
  [Category.Trips]: 'compare the three of a kind first, then the kickers',
  [Category.Straight]: 'the straight with the higher top card wins (in A-2-3-4-5 the ace counts low)',
  [Category.Flush]: 'compare the flush cards from highest to lowest',
  [Category.FullHouse]: 'compare the three of a kind first, then the pair',
  [Category.Quads]: 'compare the four of a kind first, then the kicker',
  [Category.StraightFlush]: 'the higher top card wins (in A-2-3-4-5 the ace counts low)',
};

/** Which part of the hand position k (in comparison order) belongs to. */
function partAt(cat: Category, k: number): string {
  switch (cat) {
    case Category.Pair: return k < 2 ? 'the pair' : 'a kicker';
    case Category.TwoPair: return k < 2 ? 'the higher pair' : k < 4 ? 'the lower pair' : 'the kicker';
    case Category.Trips: return k < 3 ? 'the three of a kind' : 'a kicker';
    case Category.FullHouse: return k < 3 ? 'the three of a kind' : 'the pair';
    case Category.Quads: return k < 4 ? 'the four of a kind' : 'the kicker';
    case Category.Straight:
    case Category.StraightFlush: return 'the top card';
    default: return k === 0 ? 'the highest card' : 'the next card';
  }
}

export function explainWinner(a: Card[], b: Card[], board: Card[]): { outcome: 'A' | 'B' | 'T'; text: string; boardPlays: boolean } {
  const fa = bestFive([...a, ...board]);
  const fb = bestFive([...b, ...board]);
  const sa = fa.score;
  const sb = fb.score;
  if (sa === sb) {
    const boardPlays = sa === evaluate(board);
    return {
      outcome: 'T', boardPlays,
      text: `Both players make exactly the same five-card hand, ${handText(fa.cards)}, so the pot is split.${boardPlays ? ' The five board cards are the best hand for both of them (the board plays).' : ''}`,
    };
  }
  const aWins = sa > sb;
  const win = aWins ? 'Player A' : 'Player B';
  const lose = aWins ? 'Player B' : 'Player A';
  const [w, l] = aWins ? [sa, sb] : [sb, sa];
  const wc = aWins ? fa.cards : fb.cards;
  const lc = aWins ? fb.cards : fa.cards;
  if (categoryOf(w) !== categoryOf(l)) {
    return { outcome: aWins ? 'A' : 'B', boardPlays: false, text: `${win} wins with ${handText(wc)}, which beats ${lose}'s ${describeScore(l).toLowerCase()}: ${CATEGORY_PHRASE[categoryOf(w)]} beats ${CATEGORY_PHRASE[categoryOf(l)]}.` };
  }
  const cat = categoryOf(w);
  const rw = comparisonOrder(wc);
  const rl = comparisonOrder(lc);
  let k = 0;
  while (k < rw.length && rw[k] === rl[k]) k++;
  const wheel = (cat === Category.Straight || cat === Category.StraightFlush) && (((w >> 16) & 15) === 3 || ((l >> 16) & 15) === 3);
  const low = (r: number): string => (wheel && r === 12 ? 'A (low)' : RANK_CHARS[r]!);
  return {
    outcome: aWins ? 'A' : 'B', boardPlays: false,
    text: `Both have ${CATEGORY_PHRASE[cat]}, so ${COMPARE_HOW[cat]}: ${win} has ${ranksText(rw)} and ${lose} has ${ranksText(rl)}. The first difference is ${low(rw[k]!)} versus ${low(rl[k]!)} (${partAt(cat, k)}), so ${win} wins.`,
  };
}

function genRankWinner(rng: Rng, d: Diff): DrillItem {
  const want = d === 3 ? rng.pick(['A', 'B', 'T', 'T'] as const) : rng.pick(['A', 'B'] as const);
  let hands: { a: Card[]; b: Card[]; board: Card[] } | null = null;
  for (let i = 0; i < 40000 && !hands; i++) {
    const c = drawCards(rng, 9);
    const a = c.slice(0, 2);
    const b = c.slice(2, 4);
    const board = c.slice(4);
    const sa = evaluate([...a, ...board]);
    const sb = evaluate([...b, ...board]);
    const same = categoryOf(sa) === categoryOf(sb);
    if (d === 1 && same) continue;
    if (d === 1 && (categoryOf(sa) === Category.HighCard && categoryOf(sb) === Category.HighCard)) continue;
    if (d >= 2 && (!same || categoryOf(sa) === Category.HighCard)) continue;
    const outcome = sa === sb ? 'T' : sa > sb ? 'A' : 'B';
    if (outcome !== want) continue;
    hands = { a, b, board };
  }
  if (!hands) {
    const c = drawCards(rng, 9);
    hands = { a: c.slice(0, 2), b: c.slice(2, 4), board: c.slice(4) };
  }
  const ex = explainWinner(hands.a, hands.b, hands.board);
  const options = ['Player A wins', 'Player B wins', 'It is a tie (split pot)'];
  const correct = ex.outcome === 'A' ? 0 : ex.outcome === 'B' ? 1 : 2;
  const sameCat = categoryOf(evaluate([...hands.a, ...hands.board])) === categoryOf(evaluate([...hands.b, ...hands.board]));
  const wrong: Record<number, string> = {};
  options.forEach((_, i) => {
    if (i === correct) return;
    wrong[i] = correct === 2
      ? ex.boardPlays
        ? 'Neither player can beat the board: the five board cards are the best hand for both (the board plays), so the pot is split.'
        : 'Both players\' best five cards have exactly the same ranks (suits never break a tie), so the pot is split.'
      : i === 2
        ? sameCat
          ? 'Not a tie: the two best five-card hands are not the same. Compare them in order (pair or three of a kind first, then the kickers).'
          : 'Not a tie: the two players make different types of hand, and the higher type wins.'
        : 'Compare the hand types first. If they are the same, compare the cards inside the hand in order (pair or three of a kind first, then the kickers).';
  });
  const topic = ex.outcome === 'T' ? 'tie' : d >= 2 ? 'kicker' : 'category';
  return finish({
    id: id('win', rng), ...base('rank-winner', 'hand-rankings', 1), spot: `winner:${topic}`, difficulty: d,
    prompt: 'Both players use the five board cards plus their own two. Who wins?',
    visual: { board: hands.board, hands: [{ label: 'Player A', cards: hands.a }, { label: 'Player B', cards: hands.b }], highlight: [] },
    input: choiceInput(options), answer: [correct], wrong, explanation: ex.text, tier: 'math', seconds: d === 1 ? 12 : 20,
  });
}

function genBestFive(rng: Rng, d: Diff): DrillItem {
  let cards: Card[] = drawCards(rng, 7);
  for (let i = 0; i < 200; i++) {
    const c = drawCards(rng, 7);
    const cat = categoryOf(bestFive(c).score);
    // d1: clear made hands; d2+: include straights/flushes hidden among the seven
    if ((d === 1 && cat >= Category.Pair && cat <= Category.Trips) || (d >= 2 && cat >= Category.TwoPair)) { cards = c; break; }
  }
  const best = bestFive(cards);
  return finish({
    id: id('best5', rng), ...base('best-five', 'best-five', 1), spot: `best5:${CATEGORY_NAMES[categoryOf(best.score)]!.toLowerCase().replace(/ /g, '-')}`, difficulty: d,
    prompt: 'You have seven cards to choose from. Tap the five that make the best hand.',
    visual: { hole: cards.slice(0, 2), board: cards.slice(2), highlight: best.cards }, input: { kind: 'cards', pool: cards, pick: 5 },
    answer: [], bestScore: best.score,
    explanation: `The best five cards make ${handText(best.cards)}. Only five cards count: the other two are ignored.`, tier: 'math', seconds: 25,
  });
}

// ---------------------------------------------------------------------------
// Module 2–3: position and preflop
// ---------------------------------------------------------------------------

const POS6: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

function genPositionName(rng: Rng, d: Diff): DrillItem {
  const button = rng.int(6);
  const hero = rng.int(6);
  const pos = positionOf(hero, button, 6);
  const seats = Array.from({ length: 6 }, (_, s) => ({ position: positionOf(s, button, 6), hero: s === hero, button: s === button }));
  const ch = shuffleOptions(rng, POS6.map((p) => p), POS6.indexOf(pos));
  const wrong: Record<number, string> = {};
  POS6.forEach((p, i) => {
    if (p !== pos) wrong[ch.map[i]!] = `That's the ${p}. Count clockwise from the dealer button: the next seat is the small blind, then the big blind, then UTG, then the hijack, then the cutoff, then the button.`;
  });
  return finish({
    id: id('pos', rng), ...base('position-name', 'position', 2), spot: `seat:${pos}`, difficulty: d,
    prompt: 'The dealer button is marked "D". What is the highlighted seat called?',
    visual: { seats }, input: choiceInput(ch.options), answer: [ch.correct], wrong,
    explanation: `${pos} is the ${POSITION_FULL_NAMES[pos]}. Seats are named by how far they sit from the dealer button.`, tier: 'math', seconds: 10,
  });
}

function randomLabelWhere(rng: Rng, pred: (label: string) => boolean): string {
  for (let i = 0; i < 2000; i++) {
    const l = rng.pick(ALL_LABELS);
    if (pred(l)) return l;
  }
  return 'AKs';
}

function holeFor(rng: Rng, label: string): Card[] {
  return rng.pick(labelCombos(label));
}

const TIER_IDS = [1, 2, 3, 4, 5] as const;

function genTierPlace(rng: Rng, d: Diff): DrillItem {
  const tier = rng.pick([1, 2, 3, 4, 5, 5, 4, 3] as const);
  const label = randomLabelWhere(rng, (l) => tierOf(l) === tier);
  const names = TIER_IDS.map((t) => TIER_NAMES[t]);
  const ch = shuffleOptions(rng, names, tier - 1);
  const wrong: Record<number, string> = {};
  TIER_IDS.forEach((t, i) => {
    if (t !== tier) wrong[ch.map[i]!] = `${TIER_NAMES[t]} is a different group: ${TIER_BLURBS[t]}`;
  });
  return finish({
    id: id('tier', rng), ...base('tier-place', 'hand-tiers', 3), spot: `tier:${tier}`, difficulty: d,
    prompt: 'Which tier does this starting hand belong to?', visual: { hole: holeFor(rng, label), note: label },
    input: choiceInput(ch.options), answer: [ch.correct], wrong,
    explanation: `${label} is a ${TIER_NAMES[tier]} hand (tier ${tier}). ${TIER_BLURBS[tier]}`, tier: 'standard', seconds: 10,
  });
}

/** Players still to act behind each first-in seat in 6-max. */
const BEHIND: Record<Exclude<Position, 'BB'>, number> = { UTG: 5, HJ: 4, CO: 3, BTN: 2, SB: 1 };

function genOpenFold(rng: Rng, d: Diff): DrillItem {
  const pos = rng.pick(['UTG', 'UTG', 'HJ', 'CO', 'BTN', 'BTN', 'SB'] as const);
  const wantRaise = rng.next() < 0.5;
  const label = randomLabelWhere(rng, (l) => {
    const v = openVerdict(pos, l);
    if (d < 3 && v.marginal) return false;
    return (v.action === 'raise') === wantRaise;
  });
  const v = openVerdict(pos, label);
  const rng6 = openRange(pos);
  const options = ['Raise', 'Fold'];
  const best = v.action === 'raise' ? 0 : 1;
  const answer = v.marginal ? [0, 1] : [best];
  const pct = Math.round(openPercent(pos));
  const why = v.action === 'raise'
    ? `${label} is inside the standard ${pos} range (about ${pct}% of hands), so raise.`
    : `${label} is outside the standard ${pos} range (about ${pct}% of hands). Folding is the main skill here.`;
  const tooWeak = pos === 'SB'
    ? `${label} is too weak to raise from the small blind. Only the big blind acts after you, but it already has a big blind in the pot, and you will act first on every later street.`
    : pos === 'BTN'
      ? `${label} is too weak to raise even from the button: the two blinds still act after you, and one of them will often have a better hand.`
      : `${label} from ${pos} is too weak to raise: ${BEHIND[pos]} players act after you, and one of them will often have a better hand.`;
  return finish({
    id: id('open', rng), ...base('open-fold', 'open-range', 3), spot: `open:${pos}`, difficulty: d,
    prompt: `Everyone folds to you in ${pos}. Nobody has raised yet. Raise or fold?`,
    visual: { hole: holeFor(rng, label), note: `You are in ${pos}`, grid: { primary: rangeLabels(rng6), primaryLabel: `${pos} opening range`, focus: label } },
    input: choiceInput(options), answer, bestIndex: best,
    wrong: { [1 - best]: v.action === 'raise' ? `Folding ${label} from ${pos} gives up a profitable spot: it is in the standard range.` : tooWeak },
    explanation: `${why}${v.marginal ? ' It is right on the edge of the range, so either choice is fine.' : ''}`, tier: 'standard', seconds: 10,
  });
}

const DEFEND_KEYS = Object.keys(DEFEND_SPECS);
const BLINDS: Partial<Record<Position, number>> = { SB: 50, BB: 100 };
const ACTION_WORD: Partial<Record<PreflopAction, string>> = { fold: 'fold', call: 'call', '3bet': 're-raise (3-bet)' };

/**
 * The price of calling an open-raise to `raiseTo` with blinds 50/100: what hero must add (X) and everything in the pot
 * hero can win before calling (Y). A blind's chips are part of its own raise or call, so they are not counted twice.
 */
export function facingRaisePrice(hero: Position, raiser: Position, raiseTo: number): { toCall: number; pot: number } {
  const heroBlind = BLINDS[hero] ?? 0;
  const raiserBlind = BLINDS[raiser] ?? 0;
  return { toCall: raiseTo - heroBlind, pot: raiseTo + 150 - raiserBlind };
}

function genFacingRaise(rng: Rng, d: Diff): DrillItem {
  const key = rng.pick(DEFEND_KEYS);
  const [hero, raiser] = key.split('>') as [Position, Position];
  const { threeBet, call } = defendRanges_(hero, raiser);
  const chart = (l: string): PreflopAction => ((threeBet.get(l) ?? 0) > 0 ? '3bet' : (call.get(l) ?? 0) > 0 ? 'call' : 'fold');
  const want = rng.pick(['fold', 'call', '3bet', 'fold'] as const);
  const label = randomLabelWhere(rng, (l) => {
    if (d < 3 && neighbourActions(l, chart).length > 0) return false;
    return chart(l) === want;
  });
  const v = facingRaiseVerdict(hero, raiser, label);
  const options = ['Fold', 'Call', 'Re-raise (3-bet)'];
  const idx: Record<string, number> = { fold: 0, call: 1, '3bet': 2 };
  const best = idx[v.action]!;
  // On the edge of the chart, accept only the actions that a neighbouring hand on the grid actually gets.
  const alts = neighbourActions(label, chart);
  const answer = [best, ...alts.map((a) => idx[a]!)];
  const raiseTo = 250 + rng.int(2) * 50;
  const price = facingRaisePrice(hero, raiser, raiseTo);
  const heroBlind = BLINDS[hero] ?? 0;
  return finish({
    id: id('vs', rng), ...base('facing-raise', 'facing-raise', 3), spot: `vs:${hero}>${raiser}`, difficulty: d,
    prompt: `Blinds are 50/100. ${raiser} raises to ${raiseTo}. Everyone else folds to you in ${hero}${heroBlind ? ` (you already have ${heroBlind} in the pot)` : ''}. What do you do?`,
    visual: { hole: holeFor(rng, label), pot: price.pot, bet: price.toCall, grid: { primary: rangeLabels(threeBet), secondary: rangeLabels(call), primaryLabel: 'Re-raise', secondaryLabel: 'Call', focus: label } },
    input: choiceInput(options), answer, bestIndex: best,
    wrong: {
      0: v.action === 'fold' ? '' : `${label} is strong enough to continue against a ${raiser} raise from ${hero}.`,
      1: v.action === 'call' ? '' : v.action === 'fold' ? `Against a ${raiser} raise, ${label} is not strong enough to call from ${hero}. Raisers usually have good hands.` : `With ${label} you can do better than just calling: the chart re-raises it.`,
      2: v.action === '3bet' ? '' : `Re-raising ${label} here is too aggressive: it isn't strong enough to re-raise for value or to work as a good bluff.`,
    },
    explanation: `${v.source}: ${label} is a ${ACTION_WORD[v.action]}. Calling would mean risking ${fmtN(price.toCall)} to win ${fmtN(price.pot)}.${alts.length ? ` It is on the edge of the chart: a neighbouring hand on the grid is a ${joinList(alts.map((a) => ACTION_WORD[a]!))}, so that is also acceptable.` : ''}`,
    tier: 'standard', seconds: 12,
  });
}

// ---------------------------------------------------------------------------
// Module 4: postflop reading
// ---------------------------------------------------------------------------

const AIR_LINE = 'Air rarely wins at showdown, so it mostly wins when others fold.';

/** What the board itself makes, as a noun ("pair", "two pair", "three of a kind"). */
const BOARD_HAND = ['high card', 'pair', 'two pair', 'three of a kind', 'straight', 'flush', 'full house', 'four of a kind', 'straight flush'];

function genMadeDrawAir(rng: Rng, d: Diff): DrillItem {
  const want = rng.pick(['made', 'draw', 'air'] as const);
  for (let i = 0; i < 20000; i++) {
    const n = d === 1 ? 3 : rng.pick([3, 4]);
    const c = drawCards(rng, 2 + n);
    const hole = c.slice(0, 2) as [Card, Card];
    const board = c.slice(2);
    const a = assessHand(hole, board);
    const dr = a.draws;
    const madeBucket = a.bucket === 'monster' || a.bucket === 'strong' || a.bucket === 'medium' || a.bucket === 'weak';
    // The board makes the hand and hero holds the best kicker: hero's cards matter only as a kicker. Too fuzzy to quiz.
    if (a.boardMade && madeBucket) continue;
    // A completing card that also puts a straight on the board (4-card boards) is a muddy out: skip those spots.
    const bMask = board.reduce((m, x) => m | (1 << rankOf(x)), 0);
    if (straightCompletingRanks(hole, board).some((r) => straightHigh(bMask | (1 << r)) >= 0)) continue;
    let kind: 'made' | 'draw' | 'air' | null = null;
    if (madeBucket && a.usesHoleCards && !(dr.strong && a.bucket !== 'monster')) kind = 'made';
    else if (a.bucket === 'draw' && dr.strong) kind = 'draw';
    else if (a.bucket === 'air' && !dr.any) kind = 'air';
    if (kind !== want) continue;
    const options = ['A made hand', 'A draw (needs help)', 'Nothing yet'];
    const correct = kind === 'made' ? 0 : kind === 'draw' ? 1 : 2;
    const boardWhat = BOARD_HAND[a.category]!;
    const onBoard = a.boardMade && a.category >= Category.Pair;
    let explanation: string;
    if (kind === 'made') explanation = `${a.label}. Your best five cards: ${a.description}. Made hands can win at showdown as they are.`;
    else if (kind === 'draw') {
      const flushNote = dr.flushDraw && dr.flushDrawHoleCards === 1
        ? dr.nutFlushDraw
          ? ' Only one of your cards is of that suit, but it is the highest one left, so this is the nut flush draw.'
          : ' Only one of your cards is of that suit, so it is a weak flush draw: anyone holding a higher card of that suit makes a better flush.'
        : '';
      explanation = `${a.label}.${flushNote} Draws win only if the right card arrives.`;
    } else if (onBoard) explanation = `${a.label}. The ${boardWhat} is on the board, so every player has it: your own cards add only a kicker. ${AIR_LINE}`;
    else explanation = `${a.label === 'No pair, no real draw' ? 'No pair and no real draw' : `${a.label}: no pair and no real draw`}. ${AIR_LINE}`;
    return finish({
      id: id('mda', rng), ...base('made-draw-air', 'hand-strength', 4), spot: `mda:${kind}`, difficulty: d,
      prompt: 'Looking at your cards and the board: what do you have?', visual: { hole, board },
      input: choiceInput(options), answer: [correct],
      wrong: {
        0: kind === 'made' ? '' : onBoard
          ? `The ${boardWhat} is on the board, so everyone shares it. A made hand needs a pair or better that uses one of your cards.`
          : kind === 'draw'
            ? 'A made hand already has at least a pair that uses one of your cards. A draw is still waiting for help.'
            : 'A made hand already has at least a pair that uses one of your cards. This hand does not.',
        1: kind === 'draw' ? '' : kind === 'made' ? 'You already have a made hand, so you are not waiting for a draw.' : 'A draw needs four of the five cards for a flush or a straight. This hand does not have that.',
        2: kind === 'air' ? '' : kind === 'made' ? 'You do have something: a pair or better that uses your cards.' : 'You are not empty: four of the five cards for a flush or a straight is a real draw.',
      },
      explanation, tier: 'math', seconds: 12,
    });
  }
  return genMadeDrawAir(rng, d);
}

/** Plain-English facts about a flop that drive its wetness. */
export function textureFacts(t: BoardTexture): string[] {
  const out: string[] = [];
  out.push(t.maxSuit === 3 ? 'all three cards in one suit (flushes and flush draws)' : t.maxSuit === 2 ? 'two cards of one suit (flush draws are possible)' : 'three different suits (no flush draws)');
  if (t.paired === 'trips') {
    // One rank three times: connectedness is meaningless (no straight draw is possible with one board rank).
    out.push('three cards of the same rank (almost no draws)');
    return out;
  }
  out.push(t.connected >= 3 ? 'three cards close together in rank (many straight draws)' : t.connected === 2 ? 'only two cards close together in rank (a few straight draws)' : 'cards far apart in rank (hardly any straight draws)');
  if (t.paired !== 'none') out.push('a pair (fewer possible draws)');
  return out;
}

function genBoardTexture(rng: Rng, d: Diff): DrillItem {
  for (let i = 0; i < 5000; i++) {
    const board = drawCards(rng, 3);
    const t = classifyBoard(board);
    if (Math.abs(t.score - 1.25) < 0.45 || Math.abs(t.score - 3.5) < 0.45) continue;
    const variant = d === 1 ? 0 : rng.pick([0, 0, 1, 2]);
    if (variant === 0) {
      const names = ['Dry', 'Medium', 'Wet'];
      const correct = t.wetness === 'dry' ? 0 : t.wetness === 'medium' ? 1 : 2;
      const facts = joinList(textureFacts(t));
      const wrong: Record<number, string> = {};
      names.forEach((nm, k) => {
        if (k !== correct) wrong[k] = `This flop has ${facts}. That makes it ${names[correct]!.toLowerCase()}, not ${nm.toLowerCase()}.`;
      });
      return finish({
        id: id('tex', rng), ...base('board-texture', 'board-texture', 4), spot: `tex:${t.wetness}`, difficulty: d,
        prompt: 'Is this flop dry, medium, or wet? (Wet boards give many draws; dry boards give few.)', visual: { board },
        input: choiceInput(names), answer: [correct], wrong,
        explanation: t.summary, tier: 'standard', seconds: 10,
      });
    }
    if (variant === 1) {
      const names = ['Rainbow (three suits)', 'Two cards of one suit', 'All one suit (monotone)'];
      const correct = t.maxSuit === 3 ? 2 : t.maxSuit === 2 ? 1 : 0;
      return finish({
        id: id('tex', rng), ...base('board-texture', 'board-texture', 4), spot: 'tex:suits', difficulty: d,
        prompt: 'How are the suits on this flop?', visual: { board }, input: choiceInput(names), answer: [correct],
        explanation: `${names[correct]}. ${correct === 2 ? 'Anyone holding two cards of that suit already has a flush, and anyone holding one has a flush draw.' : correct === 1 ? 'A flush draw is possible for anyone holding two of that suit.' : 'No flush draw is possible yet: it would need the turn and the river to help.'}`, tier: 'math', seconds: 8,
      });
    }
    const names = ['Yes, the board is paired', 'No pair on the board'];
    const correct = t.paired !== 'none' ? 0 : 1;
    return finish({
      id: id('tex', rng), ...base('board-texture', 'board-texture', 4), spot: 'tex:paired', difficulty: d,
      prompt: 'Is there a pair on this board?', visual: { board }, input: choiceInput(names), answer: [correct],
      explanation: correct === 0
        ? t.paired === 'trips'
          ? 'All three cards share a rank: everyone already has three of a kind, and a full house or four of a kind is possible.'
          : 'A paired board makes trips and full houses possible, and makes straights and flushes less likely.'
        : 'No two cards share a rank.', tier: 'math', seconds: 8,
    });
  }
  return genBoardTexture(rng, d);
}

// ---------------------------------------------------------------------------
// Module 5: outs, odds, equity
// ---------------------------------------------------------------------------

type DrawKind = 'flush' | 'oesd' | 'dgut' | 'gutshot' | 'combo' | 'overcards';
const DRAW_NAMES: Record<DrawKind, string> = {
  flush: 'flush draw', oesd: 'open-ended straight draw', dgut: 'double gutshot straight draw', gutshot: 'gutshot straight draw',
  combo: 'flush draw plus a straight draw', overcards: 'two overcards',
};

const STRAIGHT_KIND_PHRASE = { 'open-ended': 'an open-ended straight draw', 'double-gutshot': 'a double gutshot', gutshot: 'a gutshot', none: '' } as const;

/** "the Fours and the Nines". */
const rankList = (ranks: readonly number[]): string => joinList([...ranks].sort((a, b) => b - a).map((r) => `the ${RANK_PLURALS[r]}`));

/** Group risky outs by their reason: "K♥ and A♥ (it is the third heart ...)". */
function riskyText(risky: readonly OutCard[]): string {
  const groups = new Map<string, Card[]>();
  for (const o of risky) {
    const why = o.reasons.join('; ');
    groups.set(why, [...(groups.get(why) ?? []), o.card]);
  }
  return [...groups].map(([why, cs]) => `${joinList(cs.map(cardText))} (${why})`).join('; ');
}

function genOuts(rng: Rng, d: Diff): DrillItem {
  const kinds: DrawKind[] = d === 1 ? ['flush', 'oesd', 'gutshot'] : d === 2 ? ['flush', 'oesd', 'dgut', 'gutshot', 'overcards'] : ['flush', 'oesd', 'dgut', 'gutshot', 'combo', 'overcards'];
  const want = rng.pick(kinds);
  const askClean = d === 3;
  for (let i = 0; i < 30000; i++) {
    const c = drawCards(rng, 5);
    const hole = c.slice(0, 2) as [Card, Card];
    const board = c.slice(2);
    const a = assessHand(hole, board);
    if (a.bucket !== 'draw') continue;
    const dr = a.draws;
    let kind: DrawKind | null = null;
    if (dr.flushDraw && dr.straightKind !== 'none') kind = 'combo';
    else if (dr.flushDraw) kind = 'flush';
    else if (dr.straightKind === 'open-ended') kind = 'oesd';
    else if (dr.straightKind === 'double-gutshot') kind = 'dgut';
    else if (dr.straightKind === 'gutshot') kind = 'gutshot';
    else if (dr.overcards === 2) kind = 'overcards';
    if (kind !== want) continue;
    // A flush draw with one hole card on a three-suited flop is weak unless it is the nut draw: skip those.
    if (dr.flushDraw && dr.flushDrawHoleCards === 1 && !dr.nutFlushDraw) continue;

    const info = findOuts(hole, board);
    const cats: Category[] = kind === 'overcards' ? [Category.Pair] : [Category.Straight, Category.Flush, Category.StraightFlush];
    const all = info.outs.filter((o) => cats.includes(o.category));
    const risky = all.filter((o) => o.dirty);
    const clean = all.filter((o) => !o.dirty);
    const counted = askClean ? clean : all;
    if (counted.length === 0) continue;
    if (askClean && risky.length === 0 && rng.next() < 0.6) continue; // mostly ask when there is something to subtract

    // The textbook count, written from the actual cards.
    const fs = dr.flushDraw ? [0, 1, 2, 3].find((s) => [...hole, ...board].filter((x) => suitOf(x) === s).length === 4)! : -1;
    const suitP = fs >= 0 ? SUIT_NAMES[fs]!.toLowerCase() : '';
    const sRanks = kind === 'overcards' ? [] : straightCompletingRanks(hole, board);
    const k = sRanks.length;
    const N = all.length;
    let formula: string;
    if (kind === 'flush') formula = `13 ${suitP} − the 4 you can see = ${N}`;
    else if (kind === 'overcards') formula = `2 overcards × 3 cards left of each = ${N}`;
    else if (kind === 'combo') formula = `9 ${suitP} + ${4 * k} cards that make the straight (${rankList(sRanks)}) − the ${k} that ${k === 1 ? 'is' : 'are'} in both groups = ${N}`;
    else formula = `${k} rank${k === 1 ? '' : 's'} (${rankList(sRanks)}) × 4 suits = ${N}`;

    const name = kind === 'combo' ? `flush draw plus ${STRAIGHT_KIND_PHRASE[dr.straightKind]}` : DRAW_NAMES[kind];
    const what = kind === 'overcards' ? 'pair one of your overcards' : 'complete your draw';
    const M = risky.length;
    const n = counted.length;
    const nutNote = dr.flushDraw && dr.flushDrawHoleCards === 1 ? ` Only one of your cards is one of the ${suitP}, but it is the highest one left, so this is the nut flush draw.` : '';
    const overNote = kind === 'overcards' ? ' Pairing an overcard gives you only one pair, so these outs are weaker than flush or straight outs.' : '';
    let explanation: string;
    if (!askClean) explanation = `${cap(name)}: ${N} outs (${formula}).${nutNote}${overNote}`;
    else if (M === 0) explanation = `${N} cards ${what} (${formula}). None of them is risky, so all ${N} are clean outs.${nutNote}`;
    else explanation = `${N} cards ${what} (${formula}). Risky: ${riskyText(risky)}. ${N} total − ${M} risky = ${n} clean out${n === 1 ? '' : 's'}.`;
    if (explanation.length > 480) continue; // too many different risks to explain briefly

    const cand = [n - 3, n - 2, n - 1, n + 1, n + 2, n + 4, 4, 8, 9, 12, 13].filter((x) => x > 0 && x !== n && x !== N && x <= 20);
    const distract = askClean && M > 0 ? [N, ...rng.shuffle([...new Set(cand)]).slice(0, 2)] : rng.shuffle([...new Set(cand)]).slice(0, 3);
    const ch = shuffleOptions(rng, [n, ...distract].map(String), 0);
    const wrong: Record<number, string> = {};
    distract.forEach((x, j) => {
      let text: string;
      if (askClean) {
        text = x === N
          ? `That counts the risky cards too. Clean outs leave them out.`
          : M === 0
            ? 'Count every unseen card that improves you: none of them is risky here.'
            : 'Start from every unseen card that improves you, then take away the risky ones.';
      } else if (x === 13 && (kind === 'flush' || kind === 'combo')) {
        text = `There are 13 ${suitP}, but you can already see 4 of them (in your hand and on the board), so they are not in the deck.`;
      } else if (x === 4 && (kind === 'oesd' || kind === 'dgut')) {
        text = `4 would be a gutshot (one rank). This draw is completed by two ranks (${rankList(sRanks)}), so it has 8.`;
      } else if (x === 8 && kind === 'gutshot') {
        text = `8 would be an open-ended draw (two ranks). Here only ${rankList(sRanks)} complete the straight, so 4.`;
      } else {
        text = `Count only the unseen cards that ${what}.`;
      }
      wrong[ch.map[j + 1]!] = text;
    });
    const prompt = askClean
      ? `You have ${kind === 'overcards' ? 'two overcards' : withArticle(name)}. How many CLEAN outs do you have? Count only the cards that ${what} and cannot also give an opponent a better hand.`
      : kind === 'overcards'
        ? 'You have two overcards (both your cards are higher than every board card). How many cards in the deck pair one of them?'
        : `You have ${withArticle(name)}. How many cards in the deck complete your draw?`;
    return finish({
      id: id('outs', rng), ...base('outs', 'outs', 5), spot: `outs:${kind}`, difficulty: d,
      prompt,
      visual: { hole, board, highlight: counted.map((o) => o.card), highlightIsOuts: true, note: askClean ? 'Clean outs improve your hand without risk.' : 'Outs are the unseen cards that improve your hand.' },
      input: choiceInput(ch.options), answer: [ch.correct], wrong, explanation, tier: 'math', seconds: askClean ? 30 : 18,
    });
  }
  return genOuts(rng, d);
}

const fmtN = (n: number): string => n.toLocaleString('en-US');

function genPotOdds(rng: Rng, d: Diff): DrillItem {
  const pot = rng.pick([200, 300, 400, 600, 800, 1000, 1200, 1500]);
  const frac = rng.pick([0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5]);
  const bet = Math.max(50, Math.round((pot * frac) / 50) * 50);
  const win = pot + bet; // Y: everything you can win before your call
  const be = bet / (win + bet);
  const variant = d === 1 ? 'decision' : rng.pick(['decision', 'needed', 'turn-outs', 'turn-outs']);
  const beText = `${Math.round(be * 100)}%`;
  const priceText = `You risk ${fmtN(bet)} to win ${fmtN(win)} (the pot plus the bet), so you need ${fmtN(bet)} ÷ (${fmtN(win)} + ${fmtN(bet)}) = ${beText}.`;
  const vis: Visual = { pot: win, bet };
  if (variant === 'needed') {
    const truth = Math.round(be * 100);
    // Common mistakes, each with its own explanation. Never 100% or more (impossible), never equal to the answer.
    const mistakes: { x: number; why: string }[] = [
      { x: Math.round((bet / win) * 100), why: `divides by ${fmtN(win)}, leaving your own call out of the final pot` },
      { x: Math.round((bet / pot) * 100), why: `compares the bet with the pot before the bet (${fmtN(bet)} ÷ ${fmtN(pot)}), which is not a share of anything you can win` },
      { x: Math.round((win / (win + bet)) * 100), why: 'is the other side of the bar: the share of the final pot that you would win, not the share you put in' },
      { x: Math.round((bet / (pot + 3 * bet)) * 100), why: `counts the bet one time too many (${fmtN(bet)} ÷ ${fmtN(pot + 3 * bet)})` },
      { x: truth + 10, why: 'is too high: work it out exactly' },
      { x: truth - 8, why: 'is too low: work it out exactly' },
    ];
    const picked: { x: number; why: string }[] = [];
    for (const m of mistakes) {
      if (picked.length >= 3) break;
      if (m.x <= 0 || m.x >= 100 || m.x === truth || picked.some((p) => p.x === m.x)) continue;
      picked.push(m);
    }
    const ch = shuffleOptions(rng, [truth, ...picked.map((p) => p.x)].map((x) => `${x}%`), 0);
    const wrong: Record<number, string> = {};
    picked.forEach((p, k) => { wrong[ch.map[k + 1]!] = `${p.x}% ${p.why}.`; });
    return finish({
      id: id('odds', rng), ...base('pot-odds', 'pot-odds', 5), spot: 'odds:needed', difficulty: d,
      prompt: `The pot is ${fmtN(pot)}. Your opponent bets ${fmtN(bet)}. What chance of winning do you need for calling to break even?`, visual: vis,
      input: choiceInput(ch.options), answer: [ch.correct], wrong,
      explanation: priceText, tier: 'math', seconds: 18,
    });
  }
  let eq: number;
  let eqText: string;
  let prompt: string;
  if (variant === 'turn-outs') {
    // Only use out counts where the Rule of 2 and the exact chance (outs ÷ 46) give the same decision, with room to spare.
    const ok = [4, 6, 8, 9, 12, 15].filter((o) => Math.abs(o * 2 - be * 100) >= 4 && (o * 2 > be * 100) === (o / 46 > be));
    const outs = rng.pick(ok);
    eq = (outs * 2) / 100;
    eqText = `${outs} outs with one card to come: about ${outs * 2}% (Rule of 2)`;
    prompt = `It's the turn. The pot is ${fmtN(pot)} and your opponent bets ${fmtN(bet)}. You have ${outs} outs and one card to come. Call or fold?`;
    vis.note = `${outs} outs`;
  } else {
    const margin = d === 1 ? 12 : d === 2 ? 8 : 5;
    let p = 0;
    for (let k = 0; k < 100; k++) {
      p = 5 * Math.round((5 + rng.int(60)) / 5);
      if (Math.abs(p - be * 100) >= margin) break;
    }
    eq = p / 100;
    eqText = `a ${p}% chance to win`;
    prompt = `The pot is ${fmtN(pot)}. Your opponent bets ${fmtN(bet)}. You estimate a ${p}% chance to win the hand. Call or fold?`;
  }
  const shouldCall = eq > be;
  const options = ['Call', 'Fold'];
  const correct = shouldCall ? 0 : 1;
  return finish({
    id: id('odds', rng), ...base('pot-odds', 'pot-odds', 5), spot: variant === 'turn-outs' ? 'odds:draw' : 'odds:decision', difficulty: d,
    prompt, visual: vis, input: choiceInput(options), answer: [correct],
    wrong: { [1 - correct]: shouldCall ? `You need ${beText} to break even and you have more than that, so folding gives up a profitable call.` : `You need ${beText} to break even but you only have ${Math.round(eq * 100)}%. Calling loses chips over time.` },
    explanation: `${priceText} You have ${eqText}. ${shouldCall ? 'That is more than you need, so call.' : 'That is less than you need, so fold.'}`, tier: 'math', seconds: 14,
  });
}

/** Classic preflop matchups with their exact equity for the first hand (every one of the 1,712,304 boards; ties count half). */
export const CLASSIC_MATCHUPS: readonly { a: string; b: string; equity: number }[] = [
  { a: 'AsKs', b: 'QhQd', equity: 46.214 }, { a: 'AsAd', b: 'KhKd', equity: 81.946 }, { a: 'QsQd', b: 'AhKc', equity: 57.165 },
  { a: '2s2d', b: 'AhKc', equity: 53.04 }, { a: 'JsTs', b: 'AhKc', equity: 41.18 }, { a: 'AsKd', b: '7h2c', equity: 67.002 },
  { a: 'AsAd', b: '7h2c', equity: 87.422 }, { a: '9s9d', b: 'AhQc', equity: 55.797 }, { a: 'AsQs', b: 'KhKd', equity: 32.121 },
  { a: 'AcJc', b: '9s9d', equity: 47.397 }, { a: 'AsKd', b: 'QhQc', equity: 42.835 }, { a: '7h2c', b: 'AsAd', equity: 12.578 },
  { a: 'AsKd', b: 'AhQc', equity: 74.016 }, { a: 'AhKc', b: '2s2d', equity: 46.96 },
];

function parseHand(s: string): [Card, Card] {
  return [makeCard(RANK_CHARS.indexOf(s[0]!), 'cdhs'.indexOf(s[1]!)), makeCard(RANK_CHARS.indexOf(s[2]!), 'cdhs'.indexOf(s[3]!))];
}

function genEquityGuess(rng: Rng, d: Diff): DrillItem {
  let heroH: [Card, Card];
  let vilH: [Card, Card];
  let board: Card[] = [];
  let exactPct: number;
  if (d === 1) {
    const sc = rng.pick(CLASSIC_MATCHUPS);
    heroH = parseHand(sc.a);
    vilH = parseHand(sc.b);
    exactPct = sc.equity;
  } else {
    const n = d === 2 ? 3 : rng.pick([3, 4]);
    for (;;) {
      const c = drawCards(rng, 4 + n);
      heroH = [c[0]!, c[1]!];
      vilH = [c[2]!, c[3]!];
      board = c.slice(4);
      // Flop (990 runouts) and turn (44) are always enumerated exactly.
      const e = equityVsHand(heroH, vilH, board, { exactLimit: 60000 }).equity;
      if (e > 0.12 && e < 0.88) { exactPct = e * 100; break; }
    }
  }
  const truth = Math.round(exactPct);
  const tol = d === 1 ? 8 : d === 2 ? 7 : 5;
  return finish({
    id: id('eq', rng), ...base('equity-guess', 'equity', 5), spot: `equity:${board.length === 0 ? 'preflop' : board.length === 3 ? 'flop' : 'turn'}`, difficulty: d,
    prompt: `What is the chance that your hand (first two cards) wins${board.length ? ' by the river' : ''}? Drag the slider to your best guess.`,
    visual: { hole: heroH, board, hands: [{ label: 'Opponent', cards: vilH }] },
    input: { kind: 'slider', min: 0, max: 100, step: 1, unit: '%' }, answer: [truth], tolerance: tol,
    explanation: `Your hand wins ${exactPct.toFixed(1)}% of the time (ties count half), counting every possible ${board.length ? 'runout' : 'board'} exactly. You were close if you were within ${tol} points. Estimating equity gets easier the more matchups you see.`, tier: 'math', seconds: 20,
  });
}

// ---------------------------------------------------------------------------
// Modules 6–8
// ---------------------------------------------------------------------------

function genBetSize(rng: Rng, d: Diff): DrillItem {
  for (let i = 0; i < 5000; i++) {
    const c = drawCards(rng, 5);
    const hole = c.slice(0, 2) as [Card, Card];
    const board = c.slice(2);
    const t = classifyBoard(board);
    if (Math.abs(t.score - 1.25) < 0.45 || Math.abs(t.score - 3.5) < 0.45) continue;
    const a = assessHand(hole, board);
    const valueHand = (a.bucket === 'strong' || a.bucket === 'monster') && a.usesHoleCards && !a.boardMade;
    const semiBluff = d >= 2 && a.bucket === 'draw' && a.draws.strong;
    if (!valueHand && !semiBluff) continue;
    const opts = ['Small (about ⅓ of the pot)', 'Medium (about ½ of the pot)', 'Large (about ⅔ of the pot)', 'Very large (the whole pot)'];
    const best = t.wetness === 'dry' ? 0 : t.wetness === 'medium' ? 1 : 2;
    const answer = t.wetness === 'dry' ? [0, 1] : t.wetness === 'medium' ? [1, 2] : [2, 3];
    const pot = rng.pick([300, 400, 600, 800]);
    const reason =
      t.wetness === 'dry'
        ? 'On a dry board there are few draws to charge, so a small bet gets called by worse pairs and costs little if it fails.'
        : t.wetness === 'medium'
          ? 'A medium board has some draws, so a medium bet balances charging them with keeping worse hands in.'
          : 'On a wet board many hands have draws. A bigger bet makes those draws pay the wrong price and protects your hand.';
    return finish({
      id: id('size', rng), ...base('bet-size', 'bet-sizing', 6), spot: `size:${t.wetness}`, difficulty: d,
      prompt: `The pot is ${fmtN(pot)} and it is checked to you. ${semiBluff ? 'You are betting a draw as a semi-bluff.' : 'You want to bet for value.'} What size is best?`,
      visual: { hole, board, pot }, input: choiceInput(opts), answer, bestIndex: best,
      wrong: { [t.wetness === 'dry' ? 3 : 0]: t.wetness === 'dry' ? 'A pot-sized bet on a dry board risks a lot and only gets called by better hands.' : 'A small bet on a wet board lets draws see the next card too cheaply.' },
      explanation: `${t.summary} ${reason}`, tier: 'standard', seconds: 12,
    });
  }
  return genBetSize(rng, d);
}

const PLAYER_NAMES: Record<Archetype, string> = { nit: 'Nit (very tight)', station: 'Calling station', maniac: 'Maniac', tag: 'Tight-aggressive', lag: 'Loose-aggressive' };

function genPlayerType(rng: Rng, d: Diff): DrillItem {
  const arch = rng.pick(ARCHETYPES);
  const p = PROFILES[arch];
  const jitter = (x: number, j: number): number => Math.max(1, Math.round(x + (rng.next() - 0.5) * 2 * j));
  // Every preflop raise also counts toward VPIP, so PFR can never exceed VPIP.
  const vpip = d === 2 ? 0 : jitter(p.vpip, d === 1 ? 2 : 3);
  const stats = d === 2 ? undefined : { vpip, pfr: Math.min(vpip, jitter(p.pfr, d === 1 ? 1 : 3)), af: d === 1 ? Math.round((p.af + (rng.next() - 0.5) * 0.4) * 10) / 10 : undefined };
  const tells = d === 1 ? undefined : p.tells;
  const names = ARCHETYPES.map((a) => PLAYER_NAMES[a]);
  const ch = shuffleOptions(rng, names, ARCHETYPES.indexOf(arch));
  const wrong: Record<number, string> = {};
  ARCHETYPES.forEach((a, i) => {
    if (a !== arch) wrong[ch.map[i]!] = `That would be ${PLAYER_NAMES[a]}: ${PROFILES[a].tells[0]!.toLowerCase()}. This player looks different.`;
  });
  return finish({
    id: id('ptype', rng), ...base('player-type', 'player-types', 7), spot: `ptype:${arch}`, difficulty: d,
    prompt: 'What type of player is this?', visual: { stats, tells }, input: choiceInput(ch.options), answer: [ch.correct], wrong,
    explanation: `${PLAYER_NAMES[arch]}. ${p.blurb} (Typical: plays ${p.vpip}% of hands, raises ${p.pfr}% preflop.)`, tier: 'standard', seconds: 15,
  });
}

function genMdf(rng: Rng, _d: Diff): DrillItem {
  const pot = rng.pick([100, 200, 300, 400, 600]);
  const bet = rng.pick([pot / 4, pot / 3, pot / 2, (2 * pot) / 3, pot]);
  const b = Math.round(bet);
  const m = Math.round(minDefenseFrequency(b, pot) * 100);
  const foldShare = Math.round((b / (pot + b)) * 100);
  const potOdds = Math.round((b / (pot + 2 * b)) * 100);
  const named: { x: number; why: string }[] = [
    { x: foldShare, why: `${foldShare}% is the bet's share of the pot after the bet: the most you can fold, not how often you must defend` },
    { x: potOdds, why: `${potOdds}% is the caller's pot odds (the equity needed to call), which answers a different question` },
  ];
  const picked = named.filter((c, i) => c.x !== m && named.findIndex((o) => o.x === c.x) === i);
  const extra = rng.shuffle([50, 75, 33, 67, 60, 40].filter((x) => x !== m && !picked.some((p) => p.x === x)));
  const distract = [...picked.map((p) => p.x), ...extra].slice(0, 3);
  const ch = shuffleOptions(rng, [m, ...distract].map((x) => `${x}%`), 0);
  const wrong: Record<number, string> = {};
  distract.forEach((x, k) => {
    const why = picked.find((p) => p.x === x)?.why;
    if (why) wrong[ch.map[k + 1]!] = `${why}.`;
  });
  return finish({
    id: id('mdf', rng), ...base('mdf', 'mdf', 8), spot: 'mdf:calc', difficulty: 2,
    prompt: `The pot is ${fmtN(pot)} and your opponent bets ${fmtN(b)} into it. Roughly how often must you call or raise so that a bluff cannot show an automatic profit? (minimum defence frequency)`,
    visual: { pot: pot + b, bet: b }, input: choiceInput(ch.options), answer: [ch.correct], wrong,
    explanation: `MDF = pot before the bet ÷ (pot before the bet + bet) = ${fmtN(pot)} ÷ (${fmtN(pot)} + ${fmtN(b)}) = ${m}%. If you fold more than ${100 - m}% of the time, bluffs profit even with the worst hand.`, tier: 'math', seconds: 20,
  });
}

const SPR_MEANING = {
  low: 'low (under 3): top pair is often strong enough to put all your chips in',
  medium: 'medium (3 to under 8): play carefully, strong hands can still stack off',
  high: 'high (8 or more): it takes a very strong hand to risk a whole stack',
} as const;

function genSpr(rng: Rng, d: Diff): DrillItem {
  const pot = rng.pick([200, 300, 400, 500, 600, 800]);
  const mult = rng.pick([1.5, 2, 3, 4, 6, 8, 12, 15]);
  const eff = Math.round(pot * mult);
  // From difficulty 2, the stacks are sometimes different: only the smaller one (the effective stack) counts.
  const uneven = d >= 2 && rng.next() < 0.5;
  const heroShort = rng.next() < 0.5;
  const other = uneven ? eff * rng.pick([2, 3]) : eff;
  const [heroStack, oppStack] = heroShort ? [eff, other] : [other, eff];
  const spr = eff / pot;
  const show = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  const cands: { x: string; why?: string }[] = [
    { x: show(spr) },
    ...(uneven ? [{ x: show(other / pot), why: 'That uses the bigger stack. Only the smaller stack can be won or lost, so SPR uses the effective stack.' }] : []),
    { x: show(pot / eff), why: 'That is pot ÷ stack, upside down. SPR is stack ÷ pot.' },
    { x: show(spr * 2), why: 'Divide the effective stack by the pot, nothing more.' },
    { x: show(spr / 2 < 1 ? spr + 3 : spr / 2), why: 'Divide the effective stack by the pot, nothing more.' },
    { x: show(spr + 5), why: 'Divide the effective stack by the pot, nothing more.' },
  ];
  const uniq: { x: string; why?: string }[] = [];
  for (const c of cands) if (!uniq.some((u) => u.x === c.x) && uniq.length < 4) uniq.push(c);
  const ch = shuffleOptions(rng, uniq.map((u) => u.x), 0);
  const wrong: Record<number, string> = {};
  uniq.forEach((u, k) => { if (k > 0 && u.why) wrong[ch.map[k]!] = u.why; });
  const prompt = uneven
    ? `The flop is dealt. The pot is ${fmtN(pot)}. You have ${fmtN(heroStack)} behind and your only opponent has ${fmtN(oppStack)}. What is the stack-to-pot ratio (SPR)?`
    : `The flop is dealt. You and your opponent each have ${fmtN(eff)} behind and the pot is ${fmtN(pot)}. What is the stack-to-pot ratio (SPR)?`;
  return finish({
    id: id('spr', rng), ...base('spr', 'spr', 8), spot: 'spr:calc', difficulty: 2,
    prompt, visual: uneven ? { pot } : { pot, stack: eff }, input: choiceInput(ch.options), answer: [ch.correct], wrong,
    explanation: `SPR = effective stack ÷ pot = ${fmtN(eff)} ÷ ${fmtN(pot)} = ${show(spr)}.${uneven ? ` The effective stack is the smaller of the two stacks (${fmtN(eff)}).` : ''} That is ${SPR_MEANING[sprBand(spr)]}.`, tier: 'math', seconds: 15,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const GENERATORS: Record<DrillType, (rng: Rng, d: Diff) => DrillItem> = {
  'hand-category': genHandCategory,
  'rank-winner': genRankWinner,
  'best-five': genBestFive,
  'position-name': genPositionName,
  'tier-place': genTierPlace,
  'open-fold': genOpenFold,
  'facing-raise': genFacingRaise,
  'made-draw-air': genMadeDrawAir,
  'board-texture': genBoardTexture,
  outs: genOuts,
  'pot-odds': genPotOdds,
  'equity-guess': genEquityGuess,
  'bet-size': genBetSize,
  'player-type': genPlayerType,
  mdf: genMdf,
  spr: genSpr,
};

export const ALL_DRILL_TYPES = Object.keys(GENERATORS) as DrillType[];

export const DRILL_MODULE: Record<DrillType, number> = {
  'hand-category': 1, 'rank-winner': 1, 'best-five': 1, 'position-name': 2, 'tier-place': 3, 'open-fold': 3, 'facing-raise': 3,
  'made-draw-air': 4, 'board-texture': 4, outs: 5, 'pot-odds': 5, 'equity-guess': 5, 'bet-size': 6, 'player-type': 7, mdf: 8, spr: 8,
};

export const DRILL_LABELS: Record<DrillType, string> = {
  'hand-category': 'Name the hand', 'rank-winner': 'Who wins?', 'best-five': 'Best five of seven', 'position-name': 'Name the seat',
  'tier-place': 'Hand tiers', 'open-fold': 'Open or fold', 'facing-raise': 'Facing a raise', 'made-draw-air': 'Made, draw, or nothing',
  'board-texture': 'Read the board', outs: 'Count the outs', 'pot-odds': 'Pot odds', 'equity-guess': 'Guess the equity',
  'bet-size': 'Bet sizing', 'player-type': 'Name that player', mdf: 'Defence frequency', spr: 'Stack-to-pot ratio',
};

export function generateDrill(type: DrillType, rng: Rng, difficulty: Diff = 1): DrillItem {
  return GENERATORS[type](rng, difficulty);
}

export function drillTypesForModule(m: number): DrillType[] {
  return ALL_DRILL_TYPES.filter((t) => DRILL_MODULE[t] === m);
}

export function gradeDrill(item: DrillItem, response: number | number[]): DrillGrade {
  if (item.input.kind === 'choice') {
    const r = response as number;
    const ok = item.answer.includes(r);
    const alt = ok && r !== item.bestIndex && item.answer.length > 1;
    const targeted = item.wrong[r];
    return {
      correct: ok,
      alternative: alt,
      feedback: ok ? item.explanation : `${targeted ? `${targeted} ` : ''}${item.explanation}`.trim(),
    };
  }
  if (item.input.kind === 'slider') {
    const r = response as number;
    const diff = Math.abs(r - item.answer[0]!);
    const ok = diff <= item.tolerance;
    return {
      correct: ok,
      alternative: false,
      feedback: `${ok ? 'Good estimate.' : r > item.answer[0]! ? 'Too optimistic.' : 'Too pessimistic.'} You said ${r}%, the true number is ${item.answer[0]}%. ${item.explanation}`,
    };
  }
  const picked = (response as number[]).map((i) => (item.input as Extract<DrillInput, { kind: 'cards' }>).pool[i]!);
  const ok = picked.length === 5 && evaluate(picked) === item.bestScore;
  if (ok) return { correct: true, alternative: false, feedback: item.explanation };
  const sameType = picked.length === 5 && item.bestScore !== undefined && categoryOf(evaluate(picked)) === categoryOf(item.bestScore);
  return {
    correct: false,
    alternative: false,
    feedback: `Your five cards make ${picked.length === 5 ? handText(picked) : 'an incomplete hand'}, but a better hand is available${sameType ? ': the same type of hand with higher cards' : ''}. ${item.explanation}`,
  };
}
