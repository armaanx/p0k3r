import { useMemo, useState } from 'react';
import { LESSON_BY_ID, MODULES, MASTERY_THRESHOLD, moduleStates, nextLesson, TEST_LENGTH } from '../../content/curriculum';
import { buildModuleTest, passMark } from '../../content/moduleTest';
import type { DrillType } from '../../engine/learning/types';
import { createRng, hashSeed } from '../../engine/rng';
import { canonicalConcept } from '../../content/curriculum';
import { useStore } from '../../state/store';
import { ItemSequence } from '../learn/Sequence';
import { LessonRunner } from '../learn/LessonRunner';
import { Icon } from '../Icon';
import { focusInView } from '../focus';

const go = (to: string): void => { window.location.hash = to; };

export function LearnScreen({ sub }: { sub: string }) {
  const parts = sub.split('/').filter(Boolean); // [] | [lessonId] | ['test', n]
  if (parts[0] === 'test') return <ModuleTestScreen moduleId={Number(parts[1])} />;
  if (parts[0]) return <LessonRunner lessonId={parts[0]} onExit={() => go('/learn')} onGoLesson={(id) => go(`/learn/${id}`)} />;
  return <ModuleMap />;
}

function ModuleMap() {
  const { progress, update } = useStore();
  const states = moduleStates(progress);
  const next = nextLesson(progress);
  const [skipTarget, setSkipTarget] = useState<number | null>(null);

  const confirmSkip = (target: number): void => {
    update((p) => {
      const skipped = new Set(p.skippedModules);
      for (let m = 0; m < target; m++) {
        if (!moduleStates(p)[m]!.testPassed) skipped.add(String(m));
      }
      return { ...p, skippedModules: [...skipped] };
    });
    setSkipTarget(null);
  };

  return (
    <div>
      <div className="page-head">
        <h1>Learn</h1>
        <p className="muted">Eleven short modules, in an order that matters: mechanics first, then which hands to play, then the math after the flop, and finally short stacks and rake. Each lesson is a few minutes. Finish a module test with 85% or better to unlock the next one.</p>
      </div>
      {next ? (
        <div className="card-panel continue-card">
          <div>
            <div className="small muted">Up next · Module {next.module}</div>
            <h2 style={{ margin: '0.2rem 0' }}>{next.title}</h2>
            <p className="muted" style={{ margin: 0 }}>{next.goal} · about {next.minutes} minutes</p>
          </div>
          <button className="btn-primary" onClick={() => go(`/learn/${next.id}`)}>Start</button>
        </div>
      ) : (
        (() => {
          const open = states.find((s) => s.status === 'open');
          return open ? (
            <div className="card-panel continue-card">
              <div>
                <div className="small muted">Up next · Module {open.id}</div>
                <h2 style={{ margin: '0.2rem 0' }}>Module test</h2>
                <p className="muted" style={{ margin: 0 }}>You finished the lessons. Score {Math.round(MASTERY_THRESHOLD * 100)}% or more on a mixed test to unlock the next module.</p>
              </div>
              <button className="btn-primary" onClick={() => go(`/learn/test/${open.id}`)}>Take the test</button>
            </div>
          ) : null;
        })()
      )}

      <div className="module-grid">
        {MODULES.map((m) => {
          const s = states[m.id]!;
          const locked = s.status === 'locked';
          return (
            <section key={m.id} className={`module-card card-panel module-${s.status}`} aria-labelledby={`mod-${m.id}`}>
              <header>
                <span className="module-num">{m.id}</span>
                <div>
                  <h2 id={`mod-${m.id}`}>{m.title}</h2>
                  <span className={`status-chip status-${s.status}`}>{s.status === 'mastered' ? (s.skipped ? 'Skipped ahead' : 'Mastered') : s.status === 'open' ? 'In progress' : 'Locked'}</span>
                </div>
              </header>
              <p className="muted small">{m.blurb}</p>
              <div className="bar" role="img" aria-label={`${s.lessonsDone} of ${s.totalLessons} lessons done`}><div className="bar-fill" style={{ width: `${(100 * s.lessonsDone) / s.totalLessons}%` }} /></div>
              <ul className="lesson-list">
                {m.lessons.map((lid) => {
                  const l = LESSON_BY_ID.get(lid)!;
                  const done = progress.lessons[lid]?.done || s.skipped;
                  return (
                    <li key={lid}>
                      <button className="lesson-link" disabled={locked} onClick={() => go(`/learn/${lid}`)}>
                        <span className={`check ${done ? 'check-on' : ''}`} aria-label={done ? 'done' : 'not done'}>{done ? <Icon name="check" size={12} /> : ''}</span>
                        <span>{l.title}</span>
                        <span className="faint small">{l.minutes} min</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!locked && (
                <div className="mastery-row">
                  <span className="small muted">Recent accuracy</span>
                  <b className="num">{s.accuracy === null ? '—' : `${Math.round(s.accuracy * 100)}%`}</b>
                  <span className="small faint">goal {Math.round(MASTERY_THRESHOLD * 100)}%</span>
                </div>
              )}
              <div className="toolbar" style={{ justifyContent: 'flex-start', marginTop: '0.6rem' }}>
                {s.status === 'open' && s.lessonsDone === s.totalLessons && <button className="btn-ghost" onClick={() => go(`/learn/test/${m.id}`)}>Take the module test</button>}
                {s.status === 'mastered' && !s.skipped && <button className="btn-quiet" onClick={() => go(`/learn/test/${m.id}`)}>Retake the test</button>}
                {locked && <button className="btn-ghost" onClick={() => setSkipTarget(m.id)}>Skip ahead to here…</button>}
              </div>
              {skipTarget === m.id && (
                <div className="warn-box" role="alertdialog" aria-label="Skip ahead warning">
                  <div className="warn-box-title"><Icon name="alert" size={13} /> Skipping ahead</div>
                  <p><b>Are you sure?</b> Later modules assume you know the earlier ones. If you skip, the coach will assume you know the skipped material, and you may find the lessons harder. Modules you skip are marked "skipped", not "mastered", and you can go back any time.</p>
                  <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
                    <button className="btn-ghost" onClick={() => confirmSkip(m.id)}>Skip ahead anyway</button>
                    <button className="btn-quiet" onClick={() => setSkipTarget(null)}>Stay here</button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ModuleTestScreen({ moduleId }: { moduleId: number }) {
  const { progress, update } = useStore();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<boolean[] | null>(null);
  const mod = MODULES.find((m) => m.id === moduleId);

  // Bias earlier-module questions toward concepts the learner is weakest at.
  const weight = useMemo(() => {
    const byConcept = new Map<string, { ok: number; n: number }>();
    for (const a of progress.attempts.slice(-400)) {
      const c = canonicalConcept(a.concept);
      const e = byConcept.get(c) ?? { ok: 0, n: 0 };
      e.n++;
      if (a.correct) e.ok++;
      byConcept.set(c, e);
    }
    return (t: DrillType): number => {
      const concept = sampleConcept(t);
      const e = byConcept.get(concept);
      return e && e.n >= 3 ? 1 + 2 * (1 - e.ok / e.n) : 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(() => (mod ? buildModuleTest(moduleId, createRng(hashSeed('test', moduleId, attempt, Date.now() >>> 8)), weight) : []), [mod, moduleId, attempt, weight]);
  if (!mod) return <div className="card-panel"><p>No such module.</p><button className="btn-primary" onClick={() => go('/learn')}>Back to the map</button></div>;

  if (result) {
    const score = result.filter(Boolean).length;
    const need = passMark(items.length);
    const passed = score >= need;
    return (
      <div className={`card-panel outcome ${passed ? 'outcome-ok' : ''}`} role="status">
        <div className="worked-tag">Module {moduleId} test</div>
        <h2>{passed ? 'Module mastered' : 'Not quite yet'}</h2>
        <p className="big-score"><b className="num">{score}</b> / {items.length} <span className="muted small">(you need {need}, that is {Math.round(MASTERY_THRESHOLD * 100)}%)</span></p>
        <p className="muted">{passed ? (moduleId < MODULES[MODULES.length - 1]!.id ? `The next module is unlocked. The questions you missed will come back in your daily review.` : 'You have finished the whole path. From here, practise with the drills and play with the coach.') : 'Your missed questions are scheduled for review. Revisit the lessons you found hardest, then try a fresh test: it uses new questions.'}</p>
        <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
          {passed ? <button className="btn-primary" onClick={() => go('/learn')} ref={focusInView}>Back to the map</button> : (
            <>
              <button className="btn-primary" onClick={() => { setResult(null); setAttempt((a) => a + 1); }} ref={focusInView}>Try a fresh test</button>
              <button className="btn-quiet" onClick={() => go('/learn')}>Back to the map</button>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="lesson-head">
        <button className="btn-ghost" onClick={() => go('/learn')}><Icon name="arrow-left" /> Map</button>
        <div>
          <div className="small muted">Module {moduleId}: {mod.title}</div>
          <h1 className="lesson-title">Module test</h1>
        </div>
      </div>
      <p className="muted small" style={{ maxWidth: 680 }}>{items.length} mixed questions{moduleId > 0 ? ', including review of earlier modules in random order' : ''}. Score {passMark(items.length)} or more to pass. Up to {TEST_LENGTH} questions; take your time.</p>
      <div className="card-panel lesson-body">
        <ItemSequence
          key={attempt}
          items={items}
          mixed
          label="Module test"
          onFinish={(res) => {
            setResult(res);
            const score = res.filter(Boolean).length;
            const passed = score >= passMark(items.length);
            update((p) => {
              const prev = p.moduleTests[String(moduleId)];
              return { ...p, moduleTests: { ...p.moduleTests, [String(moduleId)]: { best: Math.max(prev?.best ?? 0, score / items.length), passed: passed || !!prev?.passed, t: Date.now() } } };
            });
          }}
        />
      </div>
    </div>
  );
}

const CONCEPT_OF_TYPE: Partial<Record<DrillType, string>> = {
  'hand-category': 'hand-rankings', 'rank-winner': 'hand-rankings', 'best-five': 'best-five', 'position-name': 'position', 'tier-place': 'hand-tiers',
  'open-fold': 'open-range', 'facing-raise': 'facing-raise', 'made-draw-air': 'hand-strength', 'board-texture': 'board-texture', outs: 'outs',
  'pot-odds': 'pot-odds', 'equity-guess': 'equity', 'bet-size': 'bet-sizing', 'player-type': 'player-types', mdf: 'mdf', spr: 'spr', 'push-fold': 'push-fold', rake: 'rake',
};
function sampleConcept(t: DrillType): string {
  return CONCEPT_OF_TYPE[t] ?? t;
}

