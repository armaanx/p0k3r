import { useMemo, useState } from 'react';
import { MODULES, moduleStates } from '../../content/curriculum';
import { LEVEL_LABEL, dailyPlan, forecast, masteryMap, whatNext, type MasteryLevel } from '../../content/progressView';
import { calibration, decisionVsResult, evLostPer100, leaks, mistakeTrend } from '../../engine/learning/analytics';
import { dueCount } from '../../engine/learning/srs';
import { DRILL_LABELS, ALL_DRILL_TYPES } from '../../engine/learning/drills';
import { typeStats } from '../../content/practice';
import { downloadText, exportJson, parseImport, storageIsPersistent } from '../../state/storage';
import { useStore } from '../../state/store';
import type { Progress } from '../../state/types';
import { CalibrationChart } from '../learn/CalibrationChart';
import { currentStreak } from './Home';
import { Icon } from '../Icon';

const go = (to: string): void => { window.location.hash = to; };
/** Labelled segmented fill: grey (not started), bone (in progress), sage (mastered). */
const FILLED: Record<MasteryLevel, number> = { new: 0, shaky: 1, learning: 2, mastered: 4 };
function SegFill({ level }: { level: MasteryLevel }) {
  return (
    <span className={`seg-fill ${level === 'mastered' ? 'mastered' : ''}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <i key={i} className={i < FILLED[level] ? 'on' : ''} />)}
    </span>
  );
}

/** Small accessible line chart. `points` are y-values; the x axis is their order. */
function LineChart({ points, label, yMax, yFmt, empty }: { points: number[]; label: string; yMax?: number; yFmt?: (v: number) => string; empty: string }) {
  if (points.length < 2) return <p className="muted small">{empty}</p>;
  const W = 520;
  const H = 150;
  const hi = yMax ?? Math.max(...points, 0.0001);
  const x = (i: number): number => 36 + (i / (points.length - 1)) * (W - 50);
  const y = (v: number): number => H - 24 - (v / hi) * (H - 40);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const f = yFmt ?? ((v: number) => String(Math.round(v)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sim-chart" role="img" aria-label={`${label}. Starts at ${f(points[0]!)} and ends at ${f(points[points.length - 1]!)}.`}>
      {/* Hairline axes with small ticks and mono labels; no gridlines. */}
      <line x1="36" x2="36" y1={y(hi)} y2={y(0)} className="chart-axis" strokeWidth="1" />
      <line x1="36" x2={W - 10} y1={y(0)} y2={y(0)} className="chart-axis" strokeWidth="1" />
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1="32" x2="36" y1={y(hi * t)} y2={y(hi * t)} className="chart-axis" strokeWidth="1" />
          <text x="28" y={y(hi * t) + 3.5} textAnchor="end" className="chart-label">{f(hi * t)}</text>
        </g>
      ))}
      {points.map((_, i) => <line key={`t${i}`} x1={x(i)} x2={x(i)} y1={y(0)} y2={y(0) + 4} className="chart-axis" strokeWidth="1" />)}
      <path d={d} fill="none" className="chart-line" strokeWidth="1.5" />
      {points.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />)}
    </svg>
  );
}

function DataPanel() {
  const { progress, replaceAll, reset } = useStore();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<Progress | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPending(parseImport(await file.text()));
      setMsg(null);
    } catch (err) {
      setPending(null);
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not read that file.' });
    }
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <section className="card-panel" aria-labelledby="data-h">
      <h2 id="data-h">Your data</h2>
      <p className="muted small">Everything lives in this browser on this device. Nothing is ever uploaded. Export a backup file now and then, especially before clearing your browser data or moving to another computer.</p>
      {!storageIsPersistent() && <p className="warn-box small"><span className="warn-box-title"><Icon name="alert" size={13} /> Not saving</span>Your browser is not letting this page save data, so progress will be lost when you close the tab. Export a backup file before you leave.</p>}
      <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
        <button className="btn-ghost" onClick={() => { downloadText(`p0k3r-progress-${stamp}.json`, exportJson(progress)); setMsg({ ok: true, text: 'Backup downloaded.' }); }}>Export progress</button>
        <label className="btn-quiet file-btn">
          Import progress…
          <input type="file" accept="application/json,.json" onChange={(e) => void onFile(e)} aria-label="Import a progress file" />
        </label>
        <button className="btn-ghost" onClick={() => setConfirmReset(true)}>Reset progress…</button>
      </div>
      {msg && <p className={msg.ok ? 'txt-good' : 'txt-bad'} role="status"><Icon name={msg.ok ? 'check' : 'cross'} size={14} /> {msg.text}</p>}
      {pending && (
        <div className="warn-box" role="alertdialog" aria-label="Confirm import">
          <div className="warn-box-title"><Icon name="alert" size={13} /> Replace progress</div>
          <p><b>Replace your current progress?</b> The file has {Object.values(pending.lessons).filter((l) => l.done).length} finished lessons, {pending.hands.length} saved hands and {pending.attempts.length} answers. Your current progress ({Object.values(progress.lessons).filter((l) => l.done).length} lessons, {progress.hands.length} hands) will be replaced.</p>
          <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
            <button className="btn-ghost" onClick={() => { replaceAll(pending); setPending(null); setMsg({ ok: true, text: 'Progress imported.' }); }}>Replace with the file</button>
            <button className="btn-quiet" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
      {confirmReset && (
        <div className="warn-box" role="alertdialog" aria-label="Confirm reset">
          <div className="warn-box-title"><Icon name="alert" size={13} /> Reset</div>
          <p><b>Reset everything?</b> This deletes all lessons, drill history, hands and settings on this device. It cannot be undone. Export a backup first if you might want it back.</p>
          <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
            <button className="btn-ghost" onClick={() => { reset(); setConfirmReset(false); setMsg({ ok: true, text: 'Progress reset. You are back at the beginning.' }); }}>Yes, reset everything</button>
            <button className="btn-quiet" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ProgressScreen() {
  const { progress } = useStore();
  const now = Date.now();
  const rows = useMemo(() => masteryMap(progress), [progress]);
  const next = useMemo(() => whatNext(progress, now), [progress, now]);
  const lk = useMemo(() => leaks(progress.attempts).slice(0, 4), [progress.attempts]);
  const cal = useMemo(() => calibration(progress.attempts), [progress.attempts]);
  const trend = useMemo(() => mistakeTrend(progress.hands, 20), [progress.hands]);
  const per100 = evLostPer100(progress.hands);
  const q = useMemo(() => decisionVsResult(progress.hands), [progress.hands]);
  const fc = useMemo(() => forecast(progress.srs, now, 7), [progress.srs, now]);
  const ts = useMemo(() => typeStats(progress), [progress]);
  const due = dueCount(progress.srs, now);
  const streak = currentStreak(progress.days);
  const plan = dailyPlan(progress, now);
  const accSeries = useMemo(() => {
    const a = progress.attempts;
    const out: number[] = [];
    for (let i = 20; i <= a.length; i += 10) out.push(a.slice(i - 20, i).filter((x) => x.correct).length / 20);
    return out;
  }, [progress.attempts]);
  const evSeries = useMemo(() => {
    const g = progress.hands.filter((h) => h.grades && h.grades.length > 0);
    const out: number[] = [];
    for (let i = 20; i <= g.length; i += 10) out.push((100 * g.slice(i - 20, i).reduce((s, h) => s + (h.evLostBB ?? 0), 0)) / 20);
    return out;
  }, [progress.hands]);
  const totalNet = progress.hands.reduce((a, h) => a + h.net / h.bb, 0);
  const fcMax = Math.max(1, ...fc.map((f) => f.count));
  const totalAnswers = progress.attempts.length;

  return (
    <div>
      <div className="page-head">
        <h1>Progress</h1>
        <p className="muted">Where you are, where the leaks are, and what to do next. These numbers measure your decisions and your learning, which you control, more than your chip results, which luck moves around.</p>
      </div>

      <section className="card-panel next-panel">
        <h2>What to work on next</h2>
        <ol className="next-list">
          {next.map((s, i) => (
            <li key={s.title}>
              <div><b>{s.title}</b><p className="muted small" style={{ margin: '0.15rem 0 0' }}>{s.text}</p></div>
              {s.to && <button className={i === 0 ? 'btn-primary' : 'btn-ghost'} onClick={() => go(s.to!)}>Go</button>}
            </li>
          ))}
        </ol>
      </section>

      <div className="home-grid" style={{ margin: '1rem 0' }}>
        <section className="card-panel home-card"><h3 className="panel-title">Modules mastered</h3><div className="big-num num">{moduleStates(progress).filter((m) => m.status === 'mastered' && !m.skipped).length} / {MODULES.length}</div></section>
        <section className="card-panel home-card"><h3 className="panel-title">Reviews due</h3><div className="mid-num num">{due}</div><p className="faint small">Next 7 days below</p></section>
        <section className="card-panel home-card"><h3 className="panel-title">Days practised</h3><div className="mid-num num">{progress.days.length}</div><p className="faint small">{streak > 1 ? `Current run: ${streak} days. ` : ''}Missing a day costs you nothing.</p></section>
        <section className="card-panel home-card"><h3 className="panel-title">Today's loop</h3><div className="mid-num num">{plan.done} / {plan.steps.length}</div><p className="faint small">steps done</p></section>
      </div>

      <section className="card-panel">
        <h2>Mastery map</h2>
        <p className="muted small">Each concept shows your accuracy on the last few answers. Mastered means 85% or better over at least eight answers. Symbols and words, not only colours, mark the level.</p>
        <div className="mastery-map">
          {MODULES.map((m) => {
            const mr = rows.filter((r) => r.module === m.id);
            return (
              <div key={m.id} className="mm-module">
                <h3>Module {m.id}: {m.title}</h3>
                <ul>
                  {mr.map((r) => (
                    <li key={r.concept} className={`mm-${r.level}`}>
                      <span className="mm-icon"><SegFill level={r.level} /></span>
                      <span className="mm-name">{r.label}</span>
                      <span className="mm-level">{LEVEL_LABEL[r.level]}</span>
                      <span className="num mm-acc">{r.acc === null ? '—' : `${Math.round(r.acc * 100)}%`} <span className="faint small">({r.n})</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <div className="two-col">
        <section className="card-panel">
          <h2>Mistake rate over time</h2>
          <p className="muted small">Share of your decisions at the table graded as a mistake or blunder, over rolling 20-hand windows. Lower is better.</p>
          <LineChart points={trend.map((t) => t.rate * 100)} label="Mistake rate" yMax={Math.max(20, ...trend.map((t) => t.rate * 100))} yFmt={(v) => `${Math.round(v)}%`} empty="Play at least 20 hands with grading to see a trend." />
        </section>
        <section className="card-panel">
          <h2>EV lost per 100 hands</h2>
          <div className="big-num num">{per100 === null ? '—' : `${per100.toFixed(1)} bb`}</div>
          <p className="muted small">The value your decisions gave up, estimated by the coach's model. Chip result over the same hands: <b className={totalNet >= 0 ? 'pos' : 'neg'}>{totalNet >= 0 ? '+' : ''}{totalNet.toFixed(1)} bb</b> (this swings with luck).</p>
          <LineChart points={evSeries} label="EV lost per 100 hands" yFmt={(v) => `${Math.round(v)}`} empty="Needs 20 graded hands." />
          <p className="faint small">Decisions vs results so far: {q.goodLost} good decisions that lost, {q.poorWon} mistakes that won.</p>
        </section>
      </div>

      <div className="two-col">
        <section className="card-panel">
          <h2>Biggest leaks</h2>
          {lk.length === 0 ? <p className="muted small">No clear leaks yet. Leaks appear once you have answered a concept at least four times and missed some.</p> : (
            <ol className="leaks">
              {lk.map((l, i) => (
                <li key={l.concept}>
                  <b>{i === 0 ? 'Biggest leak: ' : ''}{i === 0 ? l.title : l.title.charAt(0).toUpperCase() + l.title.slice(1)}.</b> {l.advice}{' '}
                  <button className="link-btn" onClick={() => go(`/learn/${l.lessonId}`)}>Review the lesson</button>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="card-panel">
          <h2>Review schedule</h2>
          <p className="muted small">Spots due over the next week. Missed items come back soon; mastered items come back at longer and longer gaps.</p>
          <div className="forecast" role="img" aria-label={fc.map((f) => `${f.label}: ${f.count}`).join(', ')}>
            {fc.map((f) => (
              <div key={f.label} className="fc-col">
                <div className="fc-bar" style={{ height: `${(f.count / fcMax) * 70}px` }} />
                <b className="num small">{f.count}</b>
                <span className="faint small">{f.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card-panel">
        <h2>Drill accuracy</h2>
        {totalAnswers === 0 ? <p className="muted small">Answer some questions to see accuracy by skill.</p> : (
          <ul className="acc-list">
            {ALL_DRILL_TYPES.map((t) => {
              const s = ts.get(t)!;
              return (
                <li key={t}>
                  <span>{DRILL_LABELS[t]}</span>
                  <div className="bar" role="img" aria-label={s.acc === null ? 'not tried' : `${Math.round(s.acc * 100)} percent`}><div className="bar-fill" style={{ width: `${(s.acc ?? 0) * 100}%` }} /></div>
                  <b className="num">{s.acc === null ? '—' : `${Math.round(s.acc * 100)}%`}</b>
                </li>
              );
            })}
          </ul>
        )}
        <h3 style={{ marginTop: '1rem' }}>Accuracy over time</h3>
        <LineChart points={accSeries.map((v) => v * 100)} label="Answer accuracy" yMax={100} yFmt={(v) => `${Math.round(v)}%`} empty="Needs 30 answers." />
      </section>

      <section className="card-panel" style={{ marginTop: '1rem' }}>
        <h2>Calibration</h2>
        <p className="muted small">When you say you are sure, are you right? Teaching yourself to notice the difference is one of the biggest poker skills.</p>
        <CalibrationChart cal={cal} />
      </section>

      <div style={{ marginTop: '1rem' }}><DataPanel /></div>
    </div>
  );
}

export { DataPanel };
