import { useEffect, useMemo, useRef, useState } from 'react';
import { GLOSSARY_BY_ID } from '../../content/glossary';
import { LESSON_BY_ID, MODULE_BY_ID, lessonDone, moduleStates } from '../../content/curriculum';
import type { Lesson, QuizItem, Step } from '../../content/types';
import { generateDrill } from '../../engine/learning/drills';
import type { DrillType } from '../../engine/learning/types';
import { createRng, hashSeed } from '../../engine/rng';
import { withAttempt, withLessonDone, withSeenTerms } from '../../state/actions';
import { useStore } from '../../state/store';
import { debugSet } from '../debug';
import { QuizCard } from './Cards';
import { Rich, termsIn } from './Rich';
import { ScriptedHand } from './ScriptedHand';
import { ItemSequence } from './Sequence';
import type { SeqItem } from '../../content/moduleTest';
import { VarianceSim } from './VarianceSim';
import { VisualView } from './visuals';
import { Icon, Mark } from '../Icon';
import { focusInView } from '../focus';

function NewWords({ text }: { text: string }) {
  const { progress } = useStore();
  const fresh = termsIn(text).filter((id) => !progress.seenTerms.includes(id) && GLOSSARY_BY_ID.has(id));
  if (fresh.length === 0) return null;
  return (
    <aside className="newwords" aria-label="New words">
      <div className="newwords-title">New {fresh.length === 1 ? 'word' : 'words'}</div>
      <dl>
        {fresh.map((id) => {
          const t = GLOSSARY_BY_ID.get(id)!;
          return (
            <div key={id}>
              <dt>{t.term}</dt>
              <dd>{t.def}</dd>
            </div>
          );
        })}
      </dl>
    </aside>
  );
}

function stepText(st: Step): string {
  switch (st.kind) {
    case 'read': return st.body;
    case 'worked': return st.steps.join(' ') + st.takeaway;
    case 'complete': return st.given.join(' ') + st.takeaway;
    default: return '';
  }
}

function ReadLike({ step, onNext, children, nextLabel = 'Continue' }: { step: Step; onNext: () => void; children: React.ReactNode; nextLabel?: string }) {
  const { update } = useStore();
  const go = (): void => {
    const ids = termsIn(stepText(step));
    if (ids.length) update((p) => withSeenTerms(p, ids));
    onNext();
  };
  return (
    <div>
      {children}
      <NewWords text={stepText(step)} />
      <button className="btn-primary" onClick={go} ref={focusInView}>{nextLabel} <span className="faint">(Enter)</span></button>
    </div>
  );
}

function WorkedStep({ step, onNext }: { step: Extract<Step, { kind: 'worked' }>; onNext: () => void }) {
  const [shown, setShown] = useState(1);
  const all = shown >= step.steps.length;
  return (
    <ReadLike step={step} onNext={onNext}>
      <div className="worked-tag">Worked example</div>
      <h2>{step.title}</h2>
      {step.visual && <VisualView v={step.visual} />}
      <ol className="worked-steps">
        {step.steps.slice(0, shown).map((s, i) => <li key={i} className="worked-step"><Rich text={s} /></li>)}
      </ol>
      {!all ? (
        <button className="btn-quiet" onClick={() => setShown((s) => s + 1)}>Show the next step</button>
      ) : (
        <div className="takeaway"><b>Takeaway:</b> <Rich text={step.takeaway} /></div>
      )}
    </ReadLike>
  );
}

function CompleteStep({ step, onNext }: { step: Extract<Step, { kind: 'complete' }>; onNext: () => void }) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const done = idx >= step.blanks.length;
  useEffect(() => { debugSet('answer', step.blanks[Math.min(idx, step.blanks.length - 1)]!.correct); }, [idx, step]);
  const b = step.blanks[Math.min(idx, step.blanks.length - 1)]!;
  return (
    <ReadLike step={step} onNext={onNext}>
      <div className="worked-tag">Now you finish it</div>
      <h2>{step.title}</h2>
      {step.visual && <VisualView v={step.visual} />}
      <ul className="given">{step.given.map((g, i) => <li key={i}>{g}</li>)}</ul>
      {!done ? (
        <div className="blank">
          <p><b>{b.prompt}</b></p>
          <div className="choices">
            {b.options.map((o, i) => (
              <button key={i} className={`choice ${picked !== null ? (i === b.correct ? 'choice-right' : i === picked ? 'choice-wrong' : '') : ''}`} disabled={picked !== null} onClick={() => setPicked(i)}>
                <kbd>{i + 1}</kbd><span>{o}</span>
                {picked !== null && i === b.correct && <Mark ok />}
                {picked !== null && i === picked && i !== b.correct && <Mark ok={false} />}
              </button>
            ))}
          </div>
          {picked !== null && (
            <div className={`feedback ${picked === b.correct ? 'feedback-ok' : 'feedback-bad'}`} role="status">
              <p><b>{picked === b.correct ? 'Yes.' : 'Not quite.'}</b> {b.why}</p>
              <button className="btn-quiet" onClick={() => { setPicked(null); setIdx((x) => x + 1); }} ref={focusInView}>Next</button>
            </div>
          )}
        </div>
      ) : (
        <div className="takeaway"><b>Takeaway:</b> <Rich text={step.takeaway} /></div>
      )}
    </ReadLike>
  );
}

function WhyStep({ step, onNext }: { step: Extract<Step, { kind: 'why' }>; onNext: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { debugSet('answer', step.options.findIndex((o) => o.good)); }, [step]);
  return (
    <div>
      <div className="worked-tag">Explain it to yourself</div>
      <h2>{step.prompt}</h2>
      <div className="choices">
        {step.options.map((o, i) => (
          <button key={i} className={`choice ${picked !== null ? (o.good ? 'choice-right' : i === picked ? 'choice-wrong' : '') : ''}`} disabled={picked !== null} onClick={() => setPicked(i)}>
            <kbd>{i + 1}</kbd><span>{o.text}</span>
            {picked !== null && o.good && <Mark ok label="good reasoning" />}
            {picked === i && !o.good && <Mark ok={false} label="weak reasoning" />}
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className={`feedback ${step.options[picked]!.good ? 'feedback-ok' : 'feedback-bad'}`} role="status">
          <p><b>{step.options[picked]!.good ? 'Good reasoning.' : 'That reasoning has a flaw.'}</b> {step.options[picked]!.feedback}</p>
          {!step.options[picked]!.good && <p><b>Better:</b> {step.options.find((o) => o.good)!.text} {step.options.find((o) => o.good)!.feedback}</p>}
          <button className="btn-primary" onClick={onNext} ref={focusInView}>Continue <span className="faint">(Enter)</span></button>
        </div>
      )}
    </div>
  );
}

function makeDrills(step: Extract<Step, { kind: 'practice' }>, seed: number): SeqItem[] {
  const types: DrillType[] = Array.isArray(step.drill) ? step.drill : [step.drill];
  const rng = createRng(seed);
  const used = new Set<string>();
  const out: SeqItem[] = [];
  for (let n = 0; n < step.count; n++) {
    let item = generateDrill(types[n % types.length]!, rng, step.difficulty);
    for (let tries = 0; tries < 8 && used.has(item.prompt + JSON.stringify(item.visual.hole) + JSON.stringify(item.visual.board)); tries++) item = generateDrill(item.type, rng, step.difficulty);
    used.add(item.prompt + JSON.stringify(item.visual.hole) + JSON.stringify(item.visual.board));
    out.push({ kind: 'drill', item });
  }
  return out;
}

function Outcome({ passed, score, total, need, tries, onRetry, onContinue, onReview }: { passed: boolean; score: number; total: number; need: number; tries: number; onRetry: () => void; onContinue: () => void; onReview: () => void }) {
  return (
    <div className={`card-panel outcome ${passed ? 'outcome-ok' : ''}`} role="status">
      <h2>{passed ? 'Nicely done' : 'Not there yet'}</h2>
      <p className="big-score"><b className="num">{score}</b> / {total} correct {passed ? '' : <span className="muted small">(you need {need})</span>}</p>
      <p className="muted">{passed ? 'That is mastery for this skill. It will come back in your daily review so it sticks.' : 'This is normal. Mistakes are how the skill is built. Have a look at the explanations, then try again with fresh questions.'}</p>
      <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
        {passed ? (
          <button className="btn-primary" onClick={onContinue} ref={focusInView}>Continue</button>
        ) : (
          <>
            <button className="btn-primary" onClick={onRetry} ref={focusInView}>Try again with new questions</button>
            <button className="btn-quiet" onClick={onReview}>Re-read the lesson</button>
            {tries >= 3 && <button className="btn-ghost" onClick={onContinue}>Continue anyway</button>}
          </>
        )}
      </div>
    </div>
  );
}

function PracticeStep({ lesson, step, index, onNext, onReview }: { lesson: Lesson; step: Extract<Step, { kind: 'practice' }>; index: number; onNext: (score: number) => void; onReview: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<boolean[] | null>(null);
  const items = useMemo(() => makeDrills(step, hashSeed(lesson.id, index, attempt, Date.now() >>> 10)), [lesson.id, step, index, attempt]);
  if (result) {
    const score = result.filter(Boolean).length;
    const need = step.passAt ?? Math.ceil(step.count * 0.75);
    return <Outcome passed={score >= need} score={score} total={step.count} need={need} tries={attempt + 1} onRetry={() => { setResult(null); setAttempt((a) => a + 1); }} onContinue={() => onNext(score / step.count)} onReview={onReview} />;
  }
  return (
    <div>
      <h2>{step.label}</h2>
      <p className="muted small">{step.mastery ? `Mastery check: get ${step.passAt ?? Math.ceil(step.count * 0.75)} of ${step.count} right to move on.` : 'Practice.'} {step.confidence ? 'Rate how sure you are before each answer.' : ''}</p>
      <ItemSequence key={attempt} items={items} askConfidence={step.confidence} label="Practice" onFinish={setResult} elaborate />
    </div>
  );
}

function QuizStep({ lesson, step, index, onNext, onReview }: { lesson: Lesson; step: Extract<Step, { kind: 'quiz' }>; index: number; onNext: (score: number) => void; onReview: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<boolean[] | null>(null);
  const items: SeqItem[] = useMemo(() => {
    const rng = createRng(hashSeed(lesson.id, index, attempt));
    const qs: QuizItem[] = rng.shuffle([...step.items]);
    return qs.map((q) => ({ kind: 'quiz', q, spot: `quiz:${lesson.id}:${step.items.indexOf(q)}` }));
  }, [lesson.id, step.items, index, attempt]);
  if (result) {
    const score = result.filter(Boolean).length;
    return <Outcome passed={score >= step.passAt} score={score} total={items.length} need={step.passAt} tries={attempt + 1} onRetry={() => { setResult(null); setAttempt((a) => a + 1); }} onContinue={() => onNext(score / items.length)} onReview={onReview} />;
  }
  return (
    <div>
      <h2>{step.label ?? 'Check'}</h2>
      <p className="muted small">Mastery check: get {step.passAt} of {items.length} right to move on.</p>
      <ItemSequence key={attempt} items={items} label="Check" onFinish={setResult} />
    </div>
  );
}

export function LessonRunner({ lessonId, onExit, onGoLesson }: { lessonId: string; onExit: () => void; onGoLesson: (id: string) => void }) {
  const lesson = LESSON_BY_ID.get(lessonId);
  const { progress, update } = useStore();
  const [idx, setIdx] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const finished = useRef(false);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => { setIdx(0); setScores([]); finished.current = false; }, [lessonId]);
  useEffect(() => { top.current?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior }); }, [idx, lessonId]);

  const done = !!lesson && idx >= lesson.steps.length;
  useEffect(() => {
    if (!done || !lesson || finished.current) return;
    finished.current = true;
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 1;
    update((p) => withLessonDone(p, lesson.id, avg));
  }, [done, lesson, scores, update]);

  if (!lesson) return <div className="card-panel"><p>That lesson does not exist.</p><button className="btn-primary" onClick={onExit}>Back to the map</button></div>;
  const steps = lesson.steps;
  const next = (s?: number): void => {
    if (s !== undefined) setScores((x) => [...x, s]);
    setIdx((i) => i + 1);
  };

  const mod = MODULE_BY_ID.get(lesson.module)!;
  const states = moduleStates(progress);
  const modState = states[lesson.module]!;
  const nextIdInModule = mod.lessons[mod.lessons.indexOf(lesson.id) + 1];
  const allDone = mod.lessons.every((l) => lessonDone(progress, l) || l === lesson.id);

  if (done) {
    return (
      <div className="lesson" ref={top}>
        <div className="card-panel outcome outcome-ok">
          <div className="worked-tag">Lesson complete</div>
          <h2>{lesson.title}</h2>
          <p className="muted">Goal reached: {lesson.goal}</p>
          <p>Your answers in this lesson are now on your review schedule. Items you missed come back soon; items you got right come back later and later.</p>
          <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
            {nextIdInModule && <button className="btn-primary" onClick={() => onGoLesson(nextIdInModule)} ref={focusInView}>Next lesson: {LESSON_BY_ID.get(nextIdInModule)!.title}</button>}
            {!nextIdInModule && allDone && !modState.testPassed && <button className="btn-primary" onClick={() => { window.location.hash = `/learn/test/${lesson.module}`; }} ref={focusInView}>Take the Module {lesson.module} test</button>}
            <button className="btn-quiet" onClick={onExit}>Back to the map</button>
          </div>
        </div>
      </div>
    );
  }

  const step = steps[idx]!;
  return (
    <div className="lesson" ref={top}>
      <div className="lesson-head">
        <button className="btn-ghost" onClick={onExit} aria-label="Leave lesson"><Icon name="arrow-left" /> Map</button>
        <div>
          <div className="small muted">Module {lesson.module}: {mod.title}</div>
          <h1 className="lesson-title">{lesson.title}</h1>
        </div>
        <div className="dots" role="img" aria-label={`Step ${idx + 1} of ${steps.length}`}>
          {steps.map((_, i) => <i key={i} className={`dot ${i < idx ? 'dot-ok' : i === idx ? 'dot-cur' : ''}`} />)}
        </div>
      </div>
      <div className="lesson-body card-panel">
        {step.kind === 'read' && (
          <ReadLike step={step} onNext={() => next()}>
            {step.title && <h2>{step.title}</h2>}
            {step.visual && <VisualView v={step.visual} />}
            <Rich text={step.body} />
          </ReadLike>
        )}
        {step.kind === 'ask' && (
          <QuizCard
            q={step}
            onDone={(r) => {
              const spot = `ask:${lesson.id}:${idx}`;
              update((p) => withAttempt(p, { t: Date.now(), concept: step.concept, spot, kind: 'lesson', correct: r.correct, ms: Math.round(r.ms) }));
              next();
            }}
          />
        )}
        {step.kind === 'worked' && <WorkedStep step={step} onNext={() => next()} />}
        {step.kind === 'complete' && <CompleteStep step={step} onNext={() => next()} />}
        {step.kind === 'why' && <WhyStep step={step} onNext={() => next()} />}
        {step.kind === 'practice' && <PracticeStep lesson={lesson} step={step} index={idx} onNext={next} onReview={() => setIdx(0)} />}
        {step.kind === 'quiz' && <QuizStep lesson={lesson} step={step} index={idx} onNext={next} onReview={() => setIdx(0)} />}
        {step.kind === 'hand' && <ScriptedHand onComplete={() => next()} />}
        {step.kind === 'variance-sim' && <VarianceSim onContinue={() => next()} />}
      </div>
    </div>
  );
}

