import { useMemo, useState } from 'react';
import { createRng } from '../../engine/rng';

type Scenario = 'fav' | 'dog';
const CFG: Record<Scenario, { p: number; title: string; blurb: string }> = {
  fav: { p: 0.8, title: 'You are an 80% favourite', blurb: 'Every time you put 100 chips in as an 80% favourite, you win 100 with probability 80% and lose 100 with probability 20%. A great decision each time.' },
  dog: { p: 0.2, title: 'You call as a 20% underdog', blurb: 'Every time you call 100 chips as a 20% underdog for a pot of 100, you win 100 with probability 20% and lose 100 the rest. A bad decision each time.' },
};

export function VarianceSim({ onContinue }: { onContinue: () => void }) {
  const [scenario, setScenario] = useState<Scenario>('fav');
  const [results, setResults] = useState<boolean[]>([]);
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const rng = useMemo(() => createRng(seed), [seed]);
  const cfg = CFG[scenario];
  const run = (n: number): void => {
    const add: boolean[] = [];
    for (let i = 0; i < n; i++) add.push(rng.next() < cfg.p);
    setResults((r) => [...r, ...add]);
  };
  const reset = (s: Scenario): void => {
    setScenario(s);
    setResults([]);
    setSeed(Math.floor(Math.random() * 1e6));
  };
  const n = results.length;
  const wins = results.filter(Boolean).length;
  const actual = wins * 100 - (n - wins) * 100;
  /** Expected chips per trial: +60 for the favourite, -60 for the underdog. */
  const perTrial = Math.round(cfg.p * 100 - (1 - cfg.p) * 100);
  const ev = n * perTrial;
  // chart
  const W = 520;
  const H = 180;
  const pts = results.reduce<number[]>((acc, r) => [...acc, (acc[acc.length - 1] ?? 0) + (r ? 100 : -100)], [0]);
  const evPts = pts.map((_, i) => i * perTrial);
  const all = [...pts, ...evPts, 100, -100];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const x = (i: number): number => (n <= 1 ? 10 : 10 + (i / Math.max(1, n)) * (W - 20));
  const y = (v: number): number => H - 12 - ((v - lo) / Math.max(1, hi - lo)) * (H - 24);
  const path = (arr: number[]): string => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  return (
    <div className="card-panel sim">
      <div className="seg" role="group" aria-label="Scenario">
        <button aria-pressed={scenario === 'fav'} onClick={() => reset('fav')}>Good decision, 80% to win</button>
        <button aria-pressed={scenario === 'dog'} onClick={() => reset('dog')}>Bad decision, 20% to win</button>
      </div>
      <h3 style={{ marginTop: '0.8rem' }}>{cfg.title}</h3>
      <p className="muted">{cfg.blurb}</p>
      <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
        <button className="btn-quiet" onClick={() => run(1)}>Run 1</button>
        <button className="btn-quiet" onClick={() => run(10)}>Run 10</button>
        <button className="btn-quiet" onClick={() => run(100)}>Run 100</button>
        <button className="btn-ghost" onClick={() => reset(scenario)}>Reset</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="sim-chart" role="img" aria-label={`After ${n} trials you are ${actual >= 0 ? 'up' : 'down'} ${Math.abs(actual)} chips; the expected result is ${Math.round(ev)} chips.`}>
        <line x1="10" x2={W - 10} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="4 4" />
        <path d={path(evPts)} fill="none" stroke="var(--muted)" strokeWidth="1" strokeDasharray="4 3" />
        <path d={path(pts)} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
        <line x1="14" y1="10" x2="30" y2="10" stroke="var(--ink)" strokeWidth="1.5" />
        <text x="35" y="13" fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)" letterSpacing="0.06em">ACTUAL</text>
        <line x1="96" y1="10" x2="112" y2="10" stroke="var(--muted)" strokeWidth="1" strokeDasharray="4 3" />
        <text x="117" y="13" fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)" letterSpacing="0.06em">EXPECTED (WHAT THE DECISIONS ARE WORTH)</text>
      </svg>
      <div className="stats-grid">
        <div className="stat"><span>Trials</span><b>{n}</b></div>
        <div className="stat"><span>Won / lost</span><b>{wins} / {n - wins}</b></div>
        <div className="stat"><span>Actual result</span><b className={actual >= 0 ? 'pos' : 'neg'}>{actual >= 0 ? '+' : ''}{actual}</b></div>
        <div className="stat"><span>Expected result</span><b>{ev >= 0 ? '+' : ''}{Math.round(ev)}</b></div>
      </div>
      {n >= 10 && (
        <p className="muted" aria-live="polite">
          {scenario === 'fav'
            ? n - wins === 0
              ? `You won all ${n} so far. Keep running: about 1 in 5 of these good all-ins should lose, and those losses will be variance, not mistakes.`
              : `You lost ${n - wins} of ${n} all-ins even though every one was a good decision. ${actual < ev ? 'Running below the expected line like this is variance.' : actual > ev ? 'Running above the expected line is variance too.' : 'Right now you are exactly on the expected line; variance will soon move you off it.'} The two lines do not have to meet (in chips the gap tends to grow slowly), but over many trials your average per trial gets closer to +${perTrial}, and the luck becomes small compared with what the decisions earn.`
            : wins === 0
              ? `You lost all ${n} calls so far, which is what a bad call usually does. Keep running: about 1 in 5 should win, and that luck will not make the call a good one.`
              : `You won ${wins} of ${n} calls even though every one was a bad decision. ${actual > ev ? 'That is luck, not skill: over many more trials the losses from the bad decision will outweigh it.' : `Over a long run, the average per trial moves toward the expected loss of ${Math.abs(perTrial)} chips per call.`}`}
        </p>
      )}
      <button className="btn-primary" disabled={n < 30} onClick={onContinue}>{n < 30 ? `Run at least 30 trials to continue (${n}/30)` : 'Continue'}</button>
    </div>
  );
}
