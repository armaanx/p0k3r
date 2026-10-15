// Card encoding: card = rank * 4 + suit. rank 0..12 => 2..A, suit 0..3 => c,d,h,s.
export type Card = number;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';
export const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
export const RANK_PLURALS = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
export const SUIT_NAMES = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const makeCard = (rank: number, suit: number): Card => rank * 4 + suit;

export function cardToString(c: Card): string {
  return RANK_CHARS[rankOf(c)]! + SUIT_CHARS[suitOf(c)]!;
}

export function parseCard(s: string): Card {
  const r = RANK_CHARS.indexOf(s[0]!.toUpperCase());
  const su = SUIT_CHARS.indexOf(s[1]!.toLowerCase());
  if (s.length !== 2 || r < 0 || su < 0) throw new Error(`Bad card: "${s}"`);
  return makeCard(r, su);
}

/** Parse "AsKd" or "As Kd" or "As,Kd" into cards. Empty string -> []. */
export function parseCards(s: string): Card[] {
  const t = s.replace(/[\s,]+/g, '');
  if (t.length % 2 !== 0) throw new Error(`Bad card list: "${s}"`);
  const out: Card[] = [];
  for (let i = 0; i < t.length; i += 2) out.push(parseCard(t.slice(i, i + 2)));
  return out;
}

export const cardsToString = (cs: readonly Card[]): string => cs.map(cardToString).join(' ');

export const cardName = (c: Card): string => `${RANK_NAMES[rankOf(c)]} of ${SUIT_NAMES[suitOf(c)]}`;

export function fullDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

/** Deck minus dead cards. */
export function deckWithout(dead: readonly Card[]): Card[] {
  const set = new Set(dead);
  return fullDeck().filter((c) => !set.has(c));
}

/** Canonical 169-hand label for two hole cards: "AKs", "AKo", "QQ". Higher rank first. */
export function handLabel(a: Card, b: Card): string {
  let ra = rankOf(a);
  let rb = rankOf(b);
  if (ra < rb) [ra, rb] = [rb, ra];
  if (ra === rb) return RANK_CHARS[ra]! + RANK_CHARS[rb]!;
  return RANK_CHARS[ra]! + RANK_CHARS[rb]! + (suitOf(a) === suitOf(b) ? 's' : 'o');
}
