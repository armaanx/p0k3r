import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../../engine/cards';
import { describeScore, evaluate } from '../../engine/evaluator';
import { potTotal, type HandState } from '../../engine/game';
import { PROFILES } from '../../engine/bots';
import { positionOf } from '../../engine/preflopCharts';
import type { Session } from '../../engine/session';
import type { Settings } from '../../state/types';
import { Avatar } from '../Avatar';
import { CardBack, PlayingCard } from '../cards/PlayingCard';
import { ChipStack } from '../chips/Chips';
import type { Features } from '../features';
import { Icon } from '../Icon';
import { NARROW_QUERY, useMedia } from '../useMedia';

export interface TableProps {
  hand: HandState;
  session: Session;
  heroSeat: number;
  settings: Settings;
  features: Features;
  fmt: (n: number) => string;
  /** Reveal every live player's cards (showdown). */
  revealAll?: boolean;
  /** Cards to highlight (the cards that make the hand). */
  highlight?: readonly Card[];
  /** Dim the cards that are not highlighted (showdown). Otherwise highlighted cards just glow. */
  dimOthers?: boolean;
  /** Seats to decorate as winners. */
  winners?: readonly number[];
  /** Extra per-seat caption (e.g. the stats HUD). */
  seatExtra?: (seat: number) => React.ReactNode;
  /** Whether to show opponents' archetype titles (after Module 7). */
  showArchetypes?: boolean;
}

const CENTER = { x: 50, y: 46 };
/** Phones in portrait get a tall oval so six seats, the board and the pot all fit without shrinking cards below legibility. */
const CENTER_COMPACT = { x: 50, y: 47 };
export const TABLE_ASPECT = 1.62;
export const TABLE_ASPECT_COMPACT = 0.86;

export function seatCoords(rel: number, n: number, compact = false): { x: number; y: number } {
  const theta = (90 + (rel * 360) / n) * (Math.PI / 180);
  return compact
    ? { x: 50 + 36 * Math.cos(theta), y: 50 + 37 * Math.sin(theta) }
    : { x: 50 + 43 * Math.cos(theta), y: 46 + 39 * Math.sin(theta) };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const potPos = (compact: boolean): { x: number; y: number } => {
  const c = compact ? CENTER_COMPACT : CENTER;
  return { x: c.x, y: c.y - (compact ? 12 : 9) };
};

function betSpot(rel: number, n: number, isHero: boolean, compact = false): { x: number; y: number } {
  const pos = seatCoords(rel, n, compact);
  const c = compact ? CENTER_COMPACT : CENTER;
  if (isHero) return compact ? { x: pos.x + 22, y: pos.y - 14 } : { x: pos.x + 15, y: pos.y - 7 };
  return { x: lerp(pos.x, c.x, compact ? 0.5 : 0.42), y: lerp(pos.y, c.y + 4, compact ? 0.5 : 0.42) };
}

interface Ghost {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  amount: number;
}

function lastActionLabel(hand: HandState, seat: number, fmt: (n: number) => string): string | null {
  const p = hand.players[seat]!;
  if (!p.inHand) return null;
  if (p.folded) return 'Fold';
  const mine = hand.actions.filter((a) => a.seat === seat && a.street === hand.street);
  const a = mine[mine.length - 1];
  if (!a) return p.allIn ? 'All-in' : null;
  if (a.allIn) return 'All-in';
  switch (a.type) {
    case 'check': return 'Check';
    case 'call': return `Call ${fmt(a.chips)}`;
    case 'bet': return `Bet ${fmt(a.toAmount)}`;
    case 'raise': return `Raise to ${fmt(a.toAmount)}`;
    default: return null;
  }
}

export function Table({ hand, session, heroSeat, settings, features, fmt, revealAll, highlight, dimOthers, winners, seatExtra, showArchetypes }: TableProps) {
  const n = hand.players.length;
  const compact = useMedia(NARROW_QUERY);
  const center = compact ? CENTER_COMPACT : CENTER;
  const aspect = compact ? TABLE_ASPECT_COMPACT : TABLE_ASPECT;
  const bigCards = settings.largeCards;
  const heroW = bigCards ? 96 : 76;
  const oppW = bigCards ? 62 : 46;
  const boardW = bigCards ? 92 : 72;
  const pot = potTotal(hand);
  const hl = useMemo(() => new Set(highlight ?? []), [highlight]);
  const hero = hand.players[heroSeat]!;
  const handName = useMemo(() => {
    if (!features.showHandName || !hero.hole || hero.folded || hand.board.length < 3) return null;
    return describeScore(evaluate([...hero.hole, ...hand.board]));
  }, [features.showHandName, hero.hole, hero.folded, hand.board]);

  const over = hand.result !== null;
  const acting = hand.toAct;

  // Chips glide into the pot when a betting round ends, and from the pot to the winner at the end of the hand.
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const prev = useRef<{ key: string; street: string; bets: { seat: number; amount: number }[]; pot: number; over: boolean } | null>(null);
  useEffect(() => {
    const key = `${hand.seed}:${hand.handNumber}`;
    const p = prev.current;
    const added: Ghost[] = [];
    if (p && p.key === key) {
      if (p.street !== hand.street && p.bets.length) {
        for (const b of p.bets) added.push({ id: `${key}-${p.street}-${b.seat}`, from: betSpot((b.seat - heroSeat + n) % n, n, b.seat === heroSeat, compact), to: potPos(compact), amount: b.amount });
      }
      if (hand.result && !p.over) {
        // Each winner's chips fly from the pot: the sum of what they were awarded across all pots.
        const won = new Map<number, number>();
        for (const pot of hand.result.pots) for (const a of pot.awards) won.set(a.seat, (won.get(a.seat) ?? 0) + a.amount);
        for (const [w, amount] of won) added.push({ id: `${key}-win-${w}`, from: potPos(compact), to: seatCoords((w - heroSeat + n) % n, n, compact), amount });
      }
    }
    prev.current = { key, street: hand.street, bets: hand.players.filter((x) => x.bet > 0).map((x) => ({ seat: x.seat, amount: x.bet })), pot: potTotal(hand), over };
    if (added.length) {
      setGhosts((g) => [...g, ...added]);
      const ids = new Set(added.map((a) => a.id));
      const t = setTimeout(() => setGhosts((g) => g.filter((x) => !ids.has(x.id))), 700);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand]);

  return (
    <div className="table-wrap" role="group" aria-label="Poker table" data-compact={compact ? 'true' : undefined} style={{ ['--k' as string]: bigCards ? 1.25 : 1, ['--aspect' as string]: aspect }}>
      <div className="felt">
        <div className="felt-rim" />
        <div className="felt-surface" />
        <div className="felt-brand" aria-hidden="true">p0k3r</div>
      </div>

      {/* Community cards and pot */}
      <div className="board-area" style={{ left: `${center.x}%`, top: `${center.y}%` }}>
        <div className="pot" aria-live="polite">
          <ChipStack amount={pot} size={22} />
          <span className="pot-label">Pot</span>
          <span className="pot-amount num">{fmt(pot)}</span>
        </div>
        <div className="board" aria-label={`Board: ${hand.board.length === 0 ? 'no cards yet' : `${hand.board.length} cards`}`}>
          {Array.from({ length: 5 }, (_, i) => {
            const c = hand.board[i];
            return c === undefined ? (
              <div key={i} className="board-slot cw-board" aria-hidden="true" />
            ) : (
              <div key={`${i}-${c}`} className="deal-in" style={{ animationDelay: `${(i < 3 ? i : 0) * 70}ms` }}>
                <PlayingCard card={c} width={boardW} className="cw-board" glow={hl.has(c)} dim={!!dimOthers && hl.size > 0 && !hl.has(c)} />
              </div>
            );
          })}
        </div>
        {handName && <div className="hand-name" aria-live="polite">{handName}</div>}
      </div>

      {/* Chips in flight */}
      {ghosts.map((g) => (
        <div
          key={g.id}
          className="ghost-chips"
          aria-hidden="true"
          style={{ left: `${g.from.x}%`, top: `${g.from.y}%`, ['--dx' as string]: `${g.to.x - g.from.x}`, ['--dy' as string]: `${(g.to.y - g.from.y) / aspect}` }}
        >
          <ChipStack amount={g.amount} size={20} />
        </div>
      ))}

      {/* Seats */}
      {hand.players.map((p) => {
        const rel = (p.seat - heroSeat + n) % n;
        const pos = seatCoords(rel, n, compact);
        const isHero = p.seat === heroSeat;
        const setup = session.seats[p.seat]!;
        const profile = setup.archetype ? PROFILES[setup.archetype] : null;
        const show = isHero || (revealAll && !p.folded && p.inHand);
        const label = lastActionLabel(hand, p.seat, fmt);
        const position = positionOf(p.seat, hand.button, n);
        const betPos = betSpot(rel, n, isHero, compact);
        const topSeat = pos.y < 22;
        const isWinner = !!winners?.includes(p.seat);
        const cardW = isHero ? heroW : oppW;
        return (
          <div key={p.seat}>
            {p.bet > 0 && (
              <div className="bet" style={{ left: `${betPos.x}%`, top: `${betPos.y}%` }} aria-label={`${p.name} has bet ${fmt(p.bet)}`}>
                <ChipStack amount={p.bet} size={20} />
                <span className="num bet-amount">{fmt(p.bet)}</span>
              </div>
            )}
            <div
              className={`seat ${isHero ? 'seat-hero' : ''} ${p.folded ? 'seat-folded' : ''} ${acting === p.seat ? 'seat-acting' : ''} ${isWinner ? 'seat-winner' : ''} ${!p.inHand ? 'seat-out' : ''}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              aria-label={`${p.name}${isHero ? ' (you)' : ''}, ${fmt(p.stack)} chips${p.folded ? ', folded' : ''}${p.allIn ? ', all-in' : ''}`}
            >
              {p.inHand && p.hole && (isHero || !p.folded) && (
                <div className="seat-cards">
                  {p.hole.map((c, i) => (
                    <div key={`${i}-${show ? c : 'b'}`} className={`seat-card seat-card-${i} ${show ? 'flip-in' : 'deal-in'}`} style={{ animationDelay: `${rel * 90 + i * 60}ms` }}>
                      <div className={`tilt tilt-${i}`}>
                      {show && !p.folded ? (
                        <PlayingCard card={c} width={cardW} className={isHero ? 'cw-hero' : 'cw-opp'} glow={hl.has(c)} dim={!!dimOthers && hl.size > 0 && !hl.has(c)} />
                      ) : p.folded && !isHero ? null : show ? (
                        <PlayingCard card={c} width={cardW} className={isHero ? 'cw-hero' : 'cw-opp'} dim />
                      ) : (
                        <CardBack width={cardW} className={isHero ? 'cw-hero' : 'cw-opp'} />
                      )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="plate">
                {p.seat === hand.button && <span className="dealer-btn" title="Dealer button" aria-label="Dealer button">D</span>}
                <Avatar kind={profile?.avatar ?? 'you'} size={isHero ? 40 : 36} />
                <div className="plate-text">
                  <div className="plate-name">
                    {p.name}
                    {features.showPositions && p.inHand && <span className="pos-badge" title={positionOf(p.seat, hand.button, n)}>{position}</span>}
                  </div>
                  <div className="plate-stack num">{p.allIn && p.stack === 0 ? 'All-in' : fmt(p.stack)}</div>
                </div>
              </div>
              {showArchetypes && profile && <div className="plate-title">{profile.title}</div>}
              {seatExtra?.(p.seat)}
              {label && !over && <div className={`bubble ${topSeat ? 'bubble-below' : ''} ${label.startsWith('Raise') || label.startsWith('Bet') || label === 'All-in' ? 'bubble-aggr' : ''}`}>{label}</div>}
              {over && isWinner && <div className={`bubble bubble-win ${topSeat ? 'bubble-below' : ''}`}><Icon name="check" size={11} /> Wins</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
