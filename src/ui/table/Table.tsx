import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

/** Layout mode: `compact` is the tall phone-portrait table; `big` is the large-cards setting. */
export interface Geo { compact: boolean; big: boolean }
export const TABLE_ASPECT = 1.62;
/** Width / height of the table. The compact table is taller than wide so three rows of seats fit with the board between them. */
export const tableAspect = (g: Geo): number => (g.compact ? (g.big ? 0.62 : 0.72) : TABLE_ASPECT);

/** Compact table rows, in % of the table height: seat row, bet row, board, bet row, seat row. */
const rowsOf = (big: boolean): { top: number; bet1: number; board: number; bet2: number; bot: number } =>
  big ? { top: 9.8, bet1: 26, board: 46.5, bet2: 65, bot: 85 } : { top: 10, bet1: 25, board: 46, bet2: 63.5, bot: 81.5 };

const centerOf = (g: Geo): { x: number; y: number } => (g.compact ? { x: 50, y: rowsOf(g.big).board } : CENTER);

export function seatCoords(rel: number, n: number, geo: Geo = { compact: false, big: false }): { x: number; y: number } {
  if (geo.compact && (n === 6 || n === 2)) {
    // Phones held upright: [left-upper, top, right-upper] across the top, the board in the middle, [left-lower, you, right-lower] below.
    const r = rowsOf(geo.big);
    if (n === 2) return rel === 0 ? { x: 50, y: r.bot } : { x: 50, y: r.top };
    const l = geo.big ? 15 : 16.5;
    return [{ x: 50, y: r.bot }, { x: l, y: r.bot }, { x: l, y: r.top }, { x: 50, y: r.top }, { x: 100 - l, y: r.top }, { x: 100 - l, y: r.bot }][rel]!;
  }
  const theta = (90 + (rel * 360) / n) * (Math.PI / 180);
  return geo.compact
    ? { x: 50 + 36 * Math.cos(theta), y: 50 + 37 * Math.sin(theta) }
    : { x: 50 + 43 * Math.cos(theta), y: 46 + 39 * Math.sin(theta) };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const potPos = (g: Geo): { x: number; y: number } => {
  const c = centerOf(g);
  return { x: c.x, y: c.y - (g.compact ? 10 : 9) };
};

/** Where a seat's bet would sit if nothing were in the way. The real position is refined by `solveBets`. */
function betSpot(rel: number, n: number, isHero: boolean, geo: Geo): { x: number; y: number } {
  const pos = seatCoords(rel, n, geo);
  const c = centerOf(geo);
  if (geo.compact && (n === 6 || n === 2)) {
    const r = rowsOf(geo.big);
    return { x: lerp(pos.x, 50, 0.3), y: pos.y <= r.top + 0.1 ? r.bet1 : r.bet2 };
  }
  if (isHero) return { x: pos.x + 15, y: pos.y - 7 };
  return { x: lerp(pos.x, c.x, 0.36), y: lerp(pos.y, c.y + 4, 0.36) };
}

interface Box { l: number; t: number; r: number; b: number }

/**
 * Bets are placed from what is actually on screen, so chips and amounts never sit on top of cards, name plates,
 * action bubbles or other bets, whatever the screen size, text size or card size. For each bet we try spots along the
 * line from its seat toward the table centre (and a little to either side) and keep the free one closest to its default.
 */
function solveBets(wrap: HTMLElement, prefer: Map<number, { x: number; y: number }>): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  if (!W || !H) return out;
  const wr = wrap.getBoundingClientRect();
  const box = (r: DOMRect): Box => ({ l: r.left - wr.left, t: r.top - wr.top, r: r.right - wr.left, b: r.bottom - wr.top });
  const obstacles: Box[] = [];
  wrap.querySelectorAll('.board-area, .plate, .seat-cards, .bubble, .plate-title, .hand-name').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) obstacles.push(box(r));
  });
  /** Overlapping area of `a` (grown by `pad`) and `b`. */
  const overlap = (a: Box, b: Box, pad: number): number => {
    const ix = Math.min(a.r + pad, b.r) - Math.max(a.l - pad, b.l);
    const iy = Math.min(a.b + pad, b.b) - Math.max(a.t - pad, b.t);
    return ix > 0 && iy > 0 ? ix * iy : 0;
  };
  const centre = box(wrap.querySelector('.board-area')?.getBoundingClientRect() ?? wr);
  const cx = (centre.l + centre.r) / 2;
  const cy = (centre.t + centre.b) / 2;
  const placed: Box[] = [];
  const bets = [...wrap.querySelectorAll<HTMLElement>('.bet[data-seat]')];
  for (const el of bets) {
    const seat = Number(el.dataset.seat);
    const seatEl = wrap.querySelector<HTMLElement>(`.seat[data-seat="${seat}"]`);
    const want = prefer.get(seat);
    if (!seatEl || !want) continue;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const sr = box(seatEl.getBoundingClientRect());
    const ax = (sr.l + sr.r) / 2;
    const ay = (sr.t + sr.b) / 2;
    const px = (want.x / 100) * W;
    const py = (want.y / 100) * H;
    let best = { x: px, y: py, cost: Infinity };
    for (let ti = 0; ti <= 25; ti++) {
      const t = ti / 25;
      for (const dxm of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
        for (const dym of [0, 0.6, -0.6, 1.2, -1.2]) {
          const x = lerp(ax, cx, t) + dxm * w;
          const y = lerp(ay, cy, t) + dym * h;
          const c: Box = { l: x - w / 2, t: y - h / 2, r: x + w / 2, b: y + h / 2 };
          if (c.l < 2 || c.r > W - 2 || c.t < 0 || c.b > H) continue;
          let hit = 0;
          for (const o of obstacles) hit += overlap(c, o, 2);
          for (const o of placed) hit += overlap(c, o, 3);
          const cost = hit * 1000 + Math.hypot(x - px, y - py) + (Math.abs(dxm) + Math.abs(dym)) * 4;
          if (cost < best.cost) best = { x, y, cost };
        }
      }
    }
    placed.push({ l: best.x - w / 2, t: best.y - h / 2, r: best.x + w / 2, b: best.y + h / 2 });
    out.set(seat, { x: (best.x / W) * 100, y: (best.y / H) * 100 });
  }
  return out;
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
  const bigCards = settings.largeCards;
  const geo = useMemo<Geo>(() => ({ compact, big: bigCards }), [compact, bigCards]);
  const center = centerOf(geo);
  const aspect = tableAspect(geo);
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
        for (const b of p.bets) added.push({ id: `${key}-${p.street}-${b.seat}`, from: betSpot((b.seat - heroSeat + n) % n, n, b.seat === heroSeat, geo), to: potPos(geo), amount: b.amount });
      }
      if (hand.result && !p.over) {
        // Each winner's chips fly from the pot: the sum of what they were awarded across all pots.
        const won = new Map<number, number>();
        for (const pot of hand.result.pots) for (const a of pot.awards) won.set(a.seat, (won.get(a.seat) ?? 0) + a.amount);
        for (const [w, amount] of won) added.push({ id: `${key}-win-${w}`, from: potPos(geo), to: seatCoords((w - heroSeat + n) % n, n, geo), amount });
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

  // Bets are positioned from the real layout so they never cover cards, plates or the board (see solveBets).
  const wrapRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Map<number, { x: number; y: number }>>(() => new Map());
  const [, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const prefer = new Map<number, { x: number; y: number }>();
    for (const q of hand.players) if (q.bet > 0) prefer.set(q.seat, betSpot((q.seat - heroSeat + n) % n, n, q.seat === heroSeat, geo));
    const next = solveBets(el, prefer);
    setPlaced((prev) => {
      if (prev.size === next.size && [...next].every(([k, v]) => { const o = prev.get(k); return !!o && Math.abs(o.x - v.x) < 0.05 && Math.abs(o.y - v.y) < 0.05; })) return prev;
      return next;
    });
  });

  return (
    <div className="table-wrap" ref={wrapRef} role="group" aria-label="Poker table" data-compact={compact ? 'true' : undefined} style={{ ['--k' as string]: bigCards ? 1.25 : 1, ['--aspect' as string]: aspect }}>
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
        const pos = seatCoords(rel, n, geo);
        const isHero = p.seat === heroSeat;
        const setup = session.seats[p.seat]!;
        const profile = setup.archetype ? PROFILES[setup.archetype] : null;
        const show = isHero || (revealAll && !p.folded && p.inHand);
        const label = lastActionLabel(hand, p.seat, fmt);
        const position = positionOf(p.seat, hand.button, n);
        const defaultBet = betSpot(rel, n, isHero, geo);
        const betPos = placed.get(p.seat) ?? defaultBet;
        const topSeat = pos.y < 22;
        const isWinner = !!winners?.includes(p.seat);
        const cardW = isHero ? heroW : oppW;
        return (
          <div key={p.seat}>
            {p.bet > 0 && (
              <div className="bet" data-seat={p.seat} style={{ left: `${betPos.x}%`, top: `${betPos.y}%` }} aria-label={`${p.name} has bet ${fmt(p.bet)}`}>
                <ChipStack amount={p.bet} size={compact ? 16 : 20} />
                <span className="num bet-amount">{fmt(p.bet)}</span>
              </div>
            )}
            <div
              data-seat={p.seat}
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
