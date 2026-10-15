import { useMemo } from 'react';
import { type Card, parseCards } from '../../engine/cards';
import { parseRange } from '../../engine/ranges';
import { gridLabel } from '../../engine/ranges';
import { positionOf } from '../../engine/preflopCharts';
import type { StepVisual } from '../../content/types';
import type { Visual } from '../../engine/learning/types';
import { PlayingCard } from '../cards/PlayingCard';
import { EquityMeter, PotOddsBar } from '../coach/Meters';

export function CardRow({ cards, width = 54, highlight, label, dimOthers }: { cards: readonly Card[]; width?: number; highlight?: readonly Card[]; label?: string; dimOthers?: boolean }) {
  const hl = new Set(highlight ?? []);
  return (
    <div className="cardrow" role="group" aria-label={label}>
      {cards.map((c) => (
        <PlayingCard key={c} card={c} width={width} glow={hl.has(c)} dim={dimOthers && hl.size > 0 && !hl.has(c)} />
      ))}
    </div>
  );
}

const RANK_CH = 'AKQJT98765432';

/** The 13×13 starting-hand grid. Two colours (primary / secondary) and an outlined focus hand. */
export function RangeGrid({ primary, secondary, primaryLabel, secondaryLabel, focus, size = 22 }: { primary: ReadonlySet<string>; secondary?: ReadonlySet<string>; primaryLabel: string; secondaryLabel?: string; focus?: string; size?: number }) {
  const cells = useMemo(() => {
    const rows: string[][] = [];
    for (let r = 0; r < 13; r++) rows.push(Array.from({ length: 13 }, (_, c) => gridLabel(r, c)));
    return rows;
  }, []);
  return (
    <figure className="grid-fig">
      <div className="range-grid" style={{ ['--cell' as string]: `${size}px` }} role="img" aria-label={`Starting-hand grid. ${primaryLabel}: ${primary.size} hand types${secondary ? `. ${secondaryLabel}: ${secondary.size} hand types` : ''}.${focus ? ` Highlighted: ${focus}.` : ''}`}>
        <div className="grid-head" aria-hidden="true">
          <span />
          {RANK_CH.split('').map((ch) => <span key={ch}>{ch}</span>)}
        </div>
        {cells.map((row, r) => (
          <div className="grid-row" key={r} aria-hidden="true">
            <span className="grid-side">{RANK_CH[r]}</span>
            {row.map((l) => (
              <span key={l} className={`gcell ${primary.has(l) ? 'g1' : secondary?.has(l) ? 'g2' : ''} ${focus === l ? 'gfocus' : ''}`} title={l}>
                {l}
              </span>
            ))}
          </div>
        ))}
      </div>
      <figcaption className="grid-legend">
        <span><i className="swatch g1" /> {primaryLabel}</span>
        {secondary && <span><i className="swatch g2" /> {secondaryLabel}</span>}
        <span className="faint">Pairs on the diagonal · suited above · offsuit below</span>
      </figcaption>
    </figure>
  );
}

export function SeatRing({ seats }: { seats: { position: string; hero?: boolean; button?: boolean }[] }) {
  const n = seats.length;
  return (
    <svg viewBox="0 0 260 160" className="seat-ring" role="img" aria-label={`Table with ${n} seats. ${seats.map((s) => `${s.hero ? 'highlighted seat' : s.position}${s.button ? ' with the dealer button' : ''}`).join(', ')}`}>
      <ellipse cx="130" cy="80" rx="92" ry="48" fill="var(--raised)" stroke="var(--line-strong)" strokeWidth="1" />
      {seats.map((s, i) => {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = 130 + 108 * Math.cos(a);
        const y = 80 + 60 * Math.sin(a);
        const bx = x + (x > 130 ? -24 : 24);
        return (
          <g key={i}>
            {/* The seat being asked about is "selected": a 2px bone ring, no hue. */}
            <circle cx={x} cy={y} r="17" fill="var(--paper)" stroke={s.hero ? 'var(--ink)' : 'var(--line-strong)'} strokeWidth={s.hero ? 2 : 1} />
            <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9.5" fontFamily="var(--font-mono)" letterSpacing="0.06em" fill={s.hero ? 'var(--ink)' : 'var(--muted)'}>{s.hero ? '?' : s.position}</text>
            {s.button && (
              <g>
                <circle cx={bx} cy={y - 10} r="7.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
                <text x={bx} y={y - 7} textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="var(--ink)">D</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const LADDER: { name: string; cards: string }[] = [
  { name: 'Straight flush', cards: '9h 8h 7h 6h 5h' },
  { name: 'Four of a kind', cards: 'Ks Kh Kd Kc 4s' },
  { name: 'Full house', cards: 'Qs Qh Qd 7c 7s' },
  { name: 'Flush', cards: 'Ad 10d 8d 5d 3d' },
  { name: 'Straight', cards: '10s 9h 8d 7c 6s' },
  { name: 'Three of a kind', cards: '9s 9h 9d Ac 4s' },
  { name: 'Two pair', cards: 'Js Jh 5d 5c As' },
  { name: 'Pair', cards: '8s 8h Kd 6c 2s' },
  { name: 'High card', cards: 'As Jh 9d 6c 3s' },
];

export function Ladder() {
  return (
    <ol className="ladder" aria-label="Hand rankings from strongest (top) to weakest (bottom)">
      {LADDER.map((r, i) => (
        <li key={r.name}>
          <span className="ladder-rank" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <span className="ladder-name">{r.name}</span>
          <CardRow cards={parseCards(r.cards.replace(/10/g, 'T'))} width={34} />
        </li>
      ))}
      <li className="ladder-foot faint">Strongest at the top. Each type beats everything below it.</li>
    </ol>
  );
}

export function FlowDiagram() {
  const steps = [
    { name: 'Preflop', detail: 'Two private cards', cards: 0 },
    { name: 'Flop', detail: 'Three board cards', cards: 3 },
    { name: 'Turn', detail: 'One more card', cards: 1 },
    { name: 'River', detail: 'The last card', cards: 1 },
    { name: 'Showdown', detail: 'Best hand wins', cards: 0 },
  ];
  return (
    <ol className="flow" aria-label="The order of a hand">
      {steps.map((s, i) => (
        <li key={s.name}>
          <span className="flow-n">{i + 1}</span>
          <b>{s.name}</b>
          <span className="faint small">{s.detail}</span>
        </li>
      ))}
    </ol>
  );
}

export function PlayerMap() {
  // The nit is "very tight", not necessarily passive (the app's nit raises most hands it plays), so it sits at the
  // far-tight edge of the map rather than in the tight-passive cell.
  return (
    <div className="pmap" role="img" aria-label="Player map: tight aggressive is the TAG, loose aggressive is the LAG, extremely loose aggressive is the maniac, tight passive players play few hands and mostly check and call, loose passive is the calling station. The nit is at the very tight edge of the map.">
      <div className="pmap-y">Aggressive</div>
      <div className="pmap-cell"><b>TAG</b><span>Tight-aggressive</span></div>
      <div className="pmap-cell"><b>LAG</b><span>Loose-aggressive</span><i>Maniac at the extreme</i></div>
      <div className="pmap-y">Passive</div>
      <div className="pmap-cell"><b>Tight-passive</b><span>Few hands, mostly checks and calls</span></div>
      <div className="pmap-cell"><b>Calling station</b><span>Loose-passive</span></div>
      <div />
      <div className="pmap-x">Tight (few hands)<br />Nit at the very tight edge</div>
      <div className="pmap-x">Loose (many hands)</div>
    </div>
  );
}

/** Renders any lesson or drill visual. */
export function VisualView({ v }: { v: StepVisual }) {
  const hole = v.hole ? parseCards(v.hole.replace(/10/g, 'T')) : null;
  const board = v.board ? parseCards(v.board.replace(/10/g, 'T')) : null;
  const hl = v.highlight ? parseCards(v.highlight.replace(/10/g, 'T')) : undefined;
  const gridSets = v.grid ? { p: new Set(parseRangeLabels(v.grid.spec)), s: v.grid.spec2 ? new Set(parseRangeLabels(v.grid.spec2)) : undefined } : null;
  return (
    <div className="visual">
      {v.ladder && <Ladder />}
      {v.flow && <FlowDiagram />}
      {v.seats && (
        <SeatRing seats={Array.from({ length: 6 }, (_, s) => ({ position: positionOf(s, v.seats!.button, 6), hero: s === v.seats!.hero, button: s === v.seats!.button }))} />
      )}
      {(hole || board) && (
        <div className="visual-cards">
          {hole && <div><div className="vlabel">Your hand</div><CardRow cards={hole} highlight={hl} label="Your hole cards" /></div>}
          {board && <div><div className="vlabel">Board</div><CardRow cards={board} highlight={hl} dimOthers={!!hl} label="Board" /></div>}
        </div>
      )}
      {v.hands && (
        <div className="visual-hands">
          {v.hands.map((h) => (
            <div key={h.label}><div className="vlabel">{h.label}</div><CardRow cards={parseCards(h.cards.replace(/10/g, 'T'))} label={h.label} /></div>
          ))}
        </div>
      )}
      {gridSets && v.grid && <RangeGrid primary={gridSets.p} secondary={gridSets.s} primaryLabel={v.grid.label} secondaryLabel={v.grid.label2} focus={v.grid.focus} />}
      {v.odds && <PotOddsBar toCall={v.odds.bet} pot={v.odds.pot} fmt={(n) => n.toLocaleString('en-US')} />}
      {v.meter && <EquityMeter equity={v.meter.equity} needed={v.meter.needed ?? null} exact />}
      {v.playerMap && <PlayerMap />}
      {v.caption && <p className="vcaption">{v.caption}</p>}
    </div>
  );
}

function parseRangeLabels(spec: string): string[] {
  return [...parseRange(spec).keys()];
}

/** Visual produced by a drill generator (engine types). */
export function DrillVisual({ v, revealed }: { v: Visual; revealed: boolean }) {
  const hl = revealed ? v.highlight : undefined;
  return (
    <div className="visual">
      {v.seats && <SeatRing seats={v.seats} />}
      {v.hands ? (
        <div className="visual-hands">
          {v.board && <div><div className="vlabel">Board</div><CardRow cards={v.board} highlight={hl} label="Board" width={50} /></div>}
          {v.hole && <div><div className="vlabel">You</div><CardRow cards={v.hole} label="Your hole cards" /></div>}
          {v.hands.map((h) => (
            <div key={h.label}><div className="vlabel">{h.label}</div><CardRow cards={h.cards} label={h.label} /></div>
          ))}
        </div>
      ) : (
        <div className="visual-cards">
          {v.hole && <div><div className="vlabel">Your hand</div><CardRow cards={v.hole} highlight={hl} label="Your hole cards" /></div>}
          {v.board && <div><div className="vlabel">Board</div><CardRow cards={v.board} highlight={hl} dimOthers={!!hl && !v.highlightIsOuts} label="Board" width={v.hole ? 50 : 54} /></div>}
        </div>
      )}
      {revealed && hl && v.highlightIsOuts && (
        <div><div className="vlabel">Your outs ({hl.length})</div><CardRow cards={hl} width={34} label="Outs" /></div>
      )}
      {v.pot !== undefined && v.bet !== undefined && <PotOddsBar toCall={v.bet} pot={v.pot} fmt={(n) => n.toLocaleString('en-US')} />}
      {v.pot !== undefined && v.bet === undefined && <p className="vcaption">Pot: <b className="num">{v.pot.toLocaleString('en-US')}</b>{v.stack !== undefined ? <> · Stack: <b className="num">{v.stack.toLocaleString('en-US')}</b></> : null}</p>}
      {v.stats && (
        <div className="stat-chips">
          {v.stats.vpip !== undefined && <span className="statchip"><i>VPIP</i><b className="num">{v.stats.vpip}%</b></span>}
          {v.stats.pfr !== undefined && <span className="statchip"><i>PFR</i><b className="num">{v.stats.pfr}%</b></span>}
          {v.stats.af !== undefined && <span className="statchip"><i>Aggression</i><b className="num">{v.stats.af}</b></span>}
        </div>
      )}
      {v.tells && <ul className="tells">{v.tells.map((t) => <li key={t}>{t}</li>)}</ul>}
      {v.note && !v.pot && <p className="vcaption">{v.note}</p>}
      {revealed && v.grid && (
        <RangeGrid primary={new Set(v.grid.primary)} secondary={v.grid.secondary ? new Set(v.grid.secondary) : undefined} primaryLabel={v.grid.primaryLabel} secondaryLabel={v.grid.secondaryLabel} focus={v.grid.focus} size={20} />
      )}
    </div>
  );
}
