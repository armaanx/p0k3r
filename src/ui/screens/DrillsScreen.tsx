import { useMemo, useState } from 'react';
import { buildMixedSession, buildReview, DRILL_UNLOCK, availableDrillTypes, typeStats } from '../../content/practice';
import { LESSON_BY_ID } from '../../content/curriculum';
import type { SeqItem } from '../../content/moduleTest';
import { calibration, conceptStats, leaks } from '../../engine/learning/analytics';
import { ALL_DRILL_TYPES, DRILL_LABELS, DRILL_MODULE } from '../../engine/learning/drills';
import { dueItems, dueText } from '../../engine/learning/srs';
import type { DrillType } from '../../engine/learning/types';
import { createRng, hashSeed } from '../../engine/rng';
import { markDaily } from '../../content/progressView';
import { useStore } from '../../state/store';
import { CalibrationChart } from '../learn/CalibrationChart';
import { ItemSequence } from '../learn/Sequence';
import { Icon } from '../Icon';

const go = (to: string): void => { window.location.hash = to; };

interface Session {
  items: SeqItem[];
  label: string;
  mixed: boolean;
  confidence: boolean;
  key: number;
}

export function DrillsScreen() {
  const { progress, update } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [result, setResult] = useState<{ session: Session; correct: boolean[] } | null>(null);
  const [confidence, setConfidence] = useState(true);
  const now = Date.now();
  const avail = useMemo(() => availableDrillTypes(progress), [progress]);
  const stats = useMemo(() => typeStats(progress), [progress]);
  const due = dueItems(progress.srs, now, 's');
  const upcoming = Object.values(progress.srs).filter((i) => i.id.startsWith('s:') && i.due > now).sort((a, b) => a.due - b.due)[0];
  const cal = useMemo(() => calibration(progress.attempts), [progress.attempts]);
  const weak = useMemo(() => leaks(progress.attempts).slice(0, 3), [progress.attempts]);

  const start = (items: SeqItem[], label: string, mixed: boolean): void => {
    if (items.length === 0) return;
    setResult(null);
    setSession({ items, label, mixed, confidence, key: Date.now() });
  };
  const seedFor = (s: string): ReturnType<typeof createRng> => createRng(hashSeed(s, Date.now()));

  if (result) {
    const byConcept = new Map<string, { ok: number; n: number }>();
    result.session.items.forEach((it, i) => {
      const c = it.kind === 'drill' ? it.item.concept : it.q.concept;
      const e = byConcept.get(c) ?? { ok: 0, n: 0 };
      e.n++;
      if (result.correct[i]) e.ok++;
      byConcept.set(c, e);
    });
    const score = result.correct.filter(Boolean).length;
    const missed = [...byConcept.entries()].filter(([, v]) => v.ok < v.n).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
    return (
      <div className="card-panel outcome outcome-ok">
        <div className="worked-tag">{result.session.label}</div>
        <h2>Session complete</h2>
        <p className="big-score"><b className="num">{score}</b> / {result.session.items.length} correct</p>
        <ul className="breakdown">
          {[...byConcept.entries()].map(([c, v]) => <li key={c}><span>{c}</span><b className="num">{v.ok}/{v.n}</b></li>)}
        </ul>
        {missed.length > 0 ? <p className="muted">Missed items are now scheduled to come back soon, so they do not slip. Weakest this round: <b>{missed[0]![0]}</b>.</p> : <p className="muted">A clean round. Those items will return at longer intervals.</p>}
        <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
          <button className="btn-primary" onClick={() => { setResult(null); setSession(null); }} autoFocus>Back to drills</button>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div>
        <div className="lesson-head">
          <button className="btn-ghost" onClick={() => setSession(null)}><Icon name="arrow-left" /> Drills</button>
          <h1 className="lesson-title">{session.label}</h1>
        </div>
        <div className="card-panel lesson-body">
          <ItemSequence
            key={session.key}
            items={session.items}
            mixed={session.mixed}
            askConfidence={session.confidence}
            elaborate={!session.mixed || session.label.startsWith('Mixed')}
            label={session.label}
            onFinish={(correct) => {
              setResult({ session, correct });
              if (session.label === "Today's review" || session.label.startsWith('Mixed')) update((p) => markDaily(p, 'warmup'));
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <h1>Drills</h1>
        <p className="muted">Short, fast questions. The same skills come back mixed together on purpose: in a real hand nobody tells you which skill to use.</p>
      </div>
      {avail.length === 0 ? (
        <div className="card-panel">
          <p>Drills unlock as you learn. Finish the first lesson in <b>Module 1: {LESSON_BY_ID.get('m1-l1')!.title}</b> to open the first drill.</p>
          <button className="btn-primary" onClick={() => go('/learn')}>Go to Learn</button>
        </div>
      ) : (
        <>
          <div className="home-grid">
            <section className="card-panel home-card">
              <h2>Today's review</h2>
              {due.length > 0 ? (
                <p className="muted"><b className="num">{due.length}</b> {due.length === 1 ? 'spot is' : 'spots are'} due. Things you missed come back first; things you know come back at longer and longer intervals.</p>
              ) : (
                <p className="muted">Nothing is due right now.{upcoming ? ` The next review is ${dueText(upcoming, now)}.` : ' Answer some questions and reviews will be scheduled.'}</p>
              )}
              <button className={due.length > 0 ? 'btn-primary' : 'btn-ghost'} disabled={due.length === 0} onClick={() => { const r = buildReview(progress, 12, seedFor('review'), now); start(r.items, "Today's review", true); }}>Start review</button>
            </section>
            <section className="card-panel home-card">
              <h2>Mixed practice</h2>
              <p className="muted">15 questions in random order from everything you have learned, with extra weight on your weak areas. Difficulty adapts to you.</p>
              <label className="switch small" style={{ marginBottom: '0.6rem' }}>
                <input type="checkbox" checked={confidence} onChange={(e) => setConfidence(e.target.checked)} />
                <span>Rate how sure I am before answering (builds calibration)</span>
              </label>
              <button className={due.length > 0 ? 'btn-ghost' : 'btn-primary'} onClick={() => start(buildMixedSession(progress, 15, seedFor('mixed'), now), 'Mixed practice', true)}>Start mixed practice</button>
            </section>
          </div>

          {weak.length > 0 && (
            <section className="card-panel" style={{ marginTop: '1rem' }}>
              <h2>Your biggest leak{weak.length > 1 ? 's' : ''}</h2>
              <ol className="leaks">
                {weak.map((l, i) => (
                  <li key={l.concept}>
                    <b>{i === 0 ? 'Biggest leak: ' : ''}{i === 0 ? l.title : l.title.charAt(0).toUpperCase() + l.title.slice(1)}.</b> {l.advice}{' '}
                    <button className="link-btn" onClick={() => go(`/learn/${l.lessonId}`)}>Review the lesson</button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <h2 style={{ marginTop: '1.4rem' }}>Focused drills</h2>
          <div className="drill-grid">
            {ALL_DRILL_TYPES.slice().sort((a, b) => DRILL_MODULE[a] - DRILL_MODULE[b]).map((t: DrillType) => {
              const unlocked = avail.includes(t);
              const st = stats.get(t)!;
              return (
                <button key={t} className={`drill-tile ${unlocked ? '' : 'drill-locked'}`} disabled={!unlocked} onClick={() => start(buildMixedSession(progress, 10, seedFor(t), now, [t]), DRILL_LABELS[t], false)}>
                  <b>{DRILL_LABELS[t]}</b>
                  <span className="small muted">Module {DRILL_MODULE[t]}</span>
                  {unlocked ? (
                    <span className="small">{st.acc === null ? 'Not tried yet' : <>Accuracy <b className="num">{Math.round(st.acc * 100)}%</b> <span className="faint">({st.n})</span></>}</span>
                  ) : (
                    <span className="small faint"><Icon name="lock" size={13} /> Finish lesson {DRILL_UNLOCK[t].toUpperCase().replace('-L', ' · ')}</span>
                  )}
                </button>
              );
            })}
          </div>

          <section className="card-panel" style={{ marginTop: '1.2rem' }}>
            <h2>Calibration</h2>
            <p className="muted small">Confident and wrong is the most valuable kind of mistake: it shows where your mental model is off.</p>
            <CalibrationChart cal={cal} />
          </section>
          <p className="faint small" style={{ marginTop: '0.8rem' }}>{conceptStats(progress.attempts).length} concepts practised so far.</p>
        </>
      )}
    </div>
  );
}
