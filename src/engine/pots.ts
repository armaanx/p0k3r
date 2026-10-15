// Side-pot construction and distribution.

export interface Contribution {
  seat: number;
  /** Total chips this player put in over the whole hand. */
  total: number;
  folded: boolean;
}

export interface Pot {
  amount: number;
  /** Seats that can win this pot (did not fold and contributed at least to this level). */
  eligible: number[];
}

/**
 * Build the main pot and side pots. Folded players' chips are "dead money" that
 * stays in the pots they paid into but they can never win them.
 */
export function buildPots(contribs: readonly Contribution[]): Pot[] {
  const live = contribs.filter((c) => !c.folded && c.total > 0);
  const levels = [...new Set(live.map((c) => c.total))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of contribs) amount += Math.max(0, Math.min(c.total, level) - Math.min(c.total, prev));
    const eligible = live.filter((c) => c.total >= level).map((c) => c.seat);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // Chips above the highest live level (only possible if a folded player out-contributed everyone live).
  const top = levels.length ? levels[levels.length - 1]! : 0;
  let excess = 0;
  for (const c of contribs) excess += Math.max(0, c.total - Math.max(top, 0));
  if (excess > 0) {
    if (pots.length) pots[pots.length - 1]!.amount += excess;
    else pots.push({ amount: excess, eligible: [] });
  }
  return pots;
}

export interface PotAward {
  seat: number;
  amount: number;
}

/**
 * Split one pot among the best scores. Odd chips go one at a time to the winners
 * closest to the left of the button (first clockwise from the button).
 */
export function awardPot(pot: Pot, scores: ReadonlyMap<number, number>, button: number, numSeats: number): PotAward[] {
  const contenders = pot.eligible.filter((s) => scores.has(s));
  if (contenders.length === 0) return [];
  let best = -1;
  for (const s of contenders) best = Math.max(best, scores.get(s)!);
  const winners = contenders.filter((s) => scores.get(s) === best);
  // Order winners clockwise starting from the seat left of the button.
  winners.sort((a, b) => ((a - button - 1 + numSeats) % numSeats) - ((b - button - 1 + numSeats) % numSeats));
  const share = Math.floor(pot.amount / winners.length);
  let odd = pot.amount - share * winners.length;
  return winners.map((seat) => {
    const extra = odd > 0 ? 1 : 0;
    odd -= extra;
    return { seat, amount: share + extra };
  });
}
