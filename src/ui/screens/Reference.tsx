import { useMemo, useState } from 'react';
import { GLOSSARY } from '../../content/glossary';
import { highestUnlockedModule, lessonDone, LESSON_BY_ID } from '../../content/curriculum';
import { OPEN_SPECS, POSITION_FULL_NAMES, POSITION_ORDER, type Position } from '../../engine/preflopCharts';
import { PROFILES, ARCHETYPES } from '../../engine/bots';
import { parseRange } from '../../engine/ranges';
import { exactHitChance, ruleOf2And4 } from '../../engine/outs';
import { breakEvenEquity } from '../../engine/coach/odds';
import { chartPercent, chartRange, PF_DEPTHS, PF_EXPLOITABILITY, type PushFoldRole } from '../../engine/pushFold';
import { rakeBreakEven } from '../../engine/learning/drills';
import { useStore } from '../../state/store';
import { Ladder, RangeGrid, SeatRing } from '../learn/visuals';
import { positionOf } from '../../engine/preflopCharts';
import { Icon } from '../Icon';

function Locked({ lesson }: { lesson: string }) {
  // "m1-l1" → "Module 1, lesson 1 (title)", matching how modules are named elsewhere in the app.
  const l = LESSON_BY_ID.get(lesson);
  const label = lesson.replace(/^m(\d+)-l(\d+)$/, 'Module $1, lesson $2') + (l ? ` (${l.title})` : '');
  return <p className="muted small"><Icon name="lock" size={14} /> Unlocks when you finish {label}.</p>;
}

function Glossary() {
  const { progress } = useStore();
  const [q, setQ] = useState('');
  const top = highestUnlockedModule(progress);
  const list = useMemo(() => GLOSSARY.filter((g) => (g.term + ' ' + g.def).toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <div>
      <label className="search">
        <span className="sr-only">Search the glossary</span>
        <input type="search" placeholder="Search words…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <dl className="glossary">
        {list.map((g) => (
          <div key={g.id} className={g.module > top ? 'gl-future' : ''}>
            <dt>{g.term} <span className="faint small">Module {g.module}</span></dt>
            <dd>{g.def}</dd>
          </div>
        ))}
        {list.length === 0 && <p className="muted">No matching words.</p>}
      </dl>
    </div>
  );
}

function CheatSheet() {
  const { progress } = useStore();
  const d = (id: string): boolean => lessonDone(progress, id);
  const [pos, setPos] = useState<Position>('UTG');
  const grid = useMemo(() => new Set(pos === 'BB' ? [] : [...parseRange(OPEN_SPECS[pos as Exclude<Position, 'BB'>]).keys()]), [pos]);
  const [pfRole, setPfRole] = useState<PushFoldRole>('shove');
  const [pfDepth, setPfDepth] = useState(10);
  const pfGrid = useMemo(() => new Set(chartRange(pfRole, pfDepth).keys()), [pfRole, pfDepth]);
  const worstMbb = (Math.max(...PF_EXPLOITABILITY) * 1000).toFixed(1);
  return (
    <div className="cheat">
      <section className="card-panel">
        <h2>Hand rankings</h2>
        {d('m1-l1') ? <Ladder /> : <Locked lesson="m1-l1" />}
      </section>
      <section className="card-panel">
        <h2>Seats, from the button</h2>
        {d('m2-l1') ? (
          <>
            <SeatRing seats={Array.from({ length: 6 }, (_, s) => ({ position: positionOf(s, 0, 6), button: s === 0 }))} />
            <ol className="pos-list">{(['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'] as Position[]).map((p) => <li key={p}><b>{p}</b> {POSITION_FULL_NAMES[p]}</li>)}</ol>
            <p className="muted small">After the flop, the first player still in to the left of the button acts first (usually the small blind) and the button, if still in, acts last. Before the flop, UTG acts first and the big blind acts last. Heads-up, the button posts the small blind, acts first before the flop and last after it.</p>
          </>
        ) : <Locked lesson="m2-l1" />}
      </section>
      <section className="card-panel wide">
        <h2>Opening ranges (first in, 6 players)</h2>
        {d('m3-l2') ? (
          <>
            <div className="seg" role="group" aria-label="Seat">
              {POSITION_ORDER.filter((p) => p !== 'BB').map((p) => <button key={p} aria-pressed={pos === p} onClick={() => setPos(p)}>{p}</button>)}
            </div>
            <RangeGrid primary={grid} primaryLabel={`${pos} raises first in`} size={24} />
          </>
        ) : <Locked lesson="m3-l2" />}
      </section>
      <section className="card-panel wide">
        <h2>Outs and chances</h2>
        {d('m5-l1') ? (
          <table className="ref-table">
            <thead>
              <tr><th scope="col">Draw</th><th scope="col">Outs</th><th scope="col">Rule of 2 (one card)</th><th scope="col">Exact, one card</th><th scope="col">Rule of 4, adjusted</th><th scope="col">Exact, flop → river</th></tr>
            </thead>
            <tbody>
              {OUTS_ROWS.map(([n, o]) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td className="num">{o}</td>
                  <td className="num">{ruleOf2And4(o, 1)}%</td>
                  <td className="num">{pct1(exactHitChance(o, 46, 1))}</td>
                  <td className="num">{ruleOf2And4(o, 2, true)}%</td>
                  <td className="num">{pct1(exactHitChance(o, 47, 2))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Locked lesson="m5-l1" />}
        <p className="muted small">
          Rule of 2 and 4: outs × 2 for one card to come, outs × 4 for two cards (flop to river, only if you see both). With more than 8 outs, ×4 runs high, so subtract (outs − 8): 9 → 35%, 15 → 53%.
          “Exact, one card” is the river from the turn (46 unseen cards); the turn alone from the flop is a little lower (47 unseen). Two overcards and one overcard count the cards that pair them.
        </p>
      </section>
      <section className="card-panel">
        <h2>Chance you need to call</h2>
        {d('m5-l3') ? (
          <table className="ref-table">
            <thead><tr><th scope="col">Their bet (share of the pot before it)</th><th scope="col">You need to win</th></tr></thead>
            <tbody>
              {BET_ROWS.map(([n, b]) => <tr key={n}><td>{n}</td><td className="num">{Math.round(breakEvenEquity(b, 1 + b) * 100)}%</td></tr>)}
            </tbody>
          </table>
        ) : <Locked lesson="m5-l3" />}
        <p className="muted small">You risk X (the call) to win Y (everything already in the pot, including their bet). Need = X ÷ (Y + X). Compare it with your real chance of winning.</p>
      </section>
      <section className="card-panel wide">
        <h2>Heads-up push or fold</h2>
        {d('m10-l1') ? (
          <>
            <div className="toolbar" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
              <span className="seg" role="group" aria-label="Chart">
                <button aria-pressed={pfRole === 'shove'} onClick={() => setPfRole('shove')}>Button: all-in</button>
                <button aria-pressed={pfRole === 'call'} onClick={() => setPfRole('call')}>Big blind: call</button>
              </span>
            </div>
            <label className="pf-depth">
              <span>Effective stack: <b className="num">{pfDepth} big blinds</b></span>
              <input type="range" min={PF_DEPTHS[0]} max={PF_DEPTHS[PF_DEPTHS.length - 1]} step={0.5} value={pfDepth} onChange={(e) => setPfDepth(Number(e.target.value))} aria-label="Effective stack in big blinds" />
            </label>
            <RangeGrid primary={pfGrid} primaryLabel={`${pfRole === 'shove' ? 'Moves all-in' : 'Calls an all-in'} at ${pfDepth}bb (${Math.round(chartPercent(pfRole, pfDepth))}% of hands)`} size={24} />
          </>
        ) : <Locked lesson="m10-l1" />}
        <p className="muted small">
          Nash equilibrium of heads-up push or fold (chip EV, no ante): the button only moves all-in or folds, the big blind only calls or folds. Computed by this app from the all-in equity of every pair of starting hands; against these charts a perfect opponent gains at most {worstMbb} thousandths of a big blind per hand.
        </p>
      </section>
      <section className="card-panel">
        <h2>Calling after rake</h2>
        {d('m10-l2') ? (
          <table className="ref-table">
            <thead><tr><th scope="col">River: pot, then bet</th><th scope="col">No rake</th><th scope="col">5%, cap $3</th><th scope="col">5%, cap $5</th></tr></thead>
            <tbody>
              {RAKE_ROWS.map(([pot, bet]) => (
                <tr key={`${pot}-${bet}`}>
                  <td className="num">${pot}, ${bet}</td>
                  <td className="num">{pct1(rakeBreakEven(pot, bet, 0, 0))}</td>
                  <td className="num">{pct1(rakeBreakEven(pot, bet, 0.05, 3))}</td>
                  <td className="num">{pct1(rakeBreakEven(pot, bet, 0.05, 5))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Locked lesson="m10-l2" />}
        <p className="muted small">Chance of winning you need to call. Need = your call ÷ (final pot − rake). Pots that end before the flop usually pay no rake.</p>
      </section>
      <section className="card-panel">
        <h2>Player types</h2>
        {d('m7-l1') ? (
          <table className="ref-table">
            <thead><tr><th>Type</th><th>VPIP / PFR</th><th>Plan</th></tr></thead>
            <tbody>
              {ARCHETYPES.map((a) => (
                <tr key={a}><td><b>{PROFILES[a].title}</b></td><td className="num">{PROFILES[a].vpip} / {PROFILES[a].pfr}</td><td className="small">{PLANS[a]}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <Locked lesson="m7-l1" />}
      </section>
    </div>
  );
}

const PLANS: Record<string, string> = {
  nit: 'Steal their blinds; fold medium hands to their big bets.',
  station: 'Value bet thinner; do not bluff.',
  maniac: 'Be patient; call down lighter with medium-strong hands.',
  tag: 'Respect their raises.',
  lag: 'Play solid; defend good hands a little wider (they raise light).',
};

/** Draws for the outs table: [name, outs]. Percentages are computed, never typed in. */
const OUTS_ROWS: readonly (readonly [string, number])[] = [
  ['Flush draw', 9],
  ['Open-ended straight draw', 8],
  ['Double gutshot', 8],
  ['Gutshot', 4],
  ['Two overcards', 6],
  ['One overcard', 3],
  ['Flush draw + open-ended', 15],
];

/** Bet sizes as a share of the pot before the bet. */
const BET_ROWS: readonly (readonly [string, number])[] = [['¼ pot', 1 / 4], ['⅓ pot', 1 / 3], ['½ pot', 1 / 2], ['⅔ pot', 2 / 3], ['Full pot', 1], ['2× pot', 2]];

/** River spots for the rake table: [pot before the bet, bet], in dollars. */
const RAKE_ROWS: readonly (readonly [number, number])[] = [[20, 10], [40, 30], [60, 40], [100, 75], [200, 150]];

const pct1 = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function ReferenceScreen() {
  const [tab, setTab] = useState<'cheat' | 'glossary'>('cheat');
  return (
    <div>
      <div className="page-head">
        <h1>Reference</h1>
        <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
          <span className="seg" role="group" aria-label="Reference section">
            <button aria-pressed={tab === 'cheat'} onClick={() => setTab('cheat')}>Cheat sheet</button>
            <button aria-pressed={tab === 'glossary'} onClick={() => setTab('glossary')}>Glossary</button>
          </span>
          {tab === 'cheat' && <button className="btn-ghost" onClick={() => window.print()}>Print</button>}
        </div>
        {tab === 'cheat' && <p className="muted">This sheet grows as you learn: each section unlocks when you finish its lesson.</p>}
      </div>
      {tab === 'cheat' ? <CheatSheet /> : <Glossary />}
    </div>
  );
}
