import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuizItem } from '../../content/types';
import { gradeDrill } from '../../engine/learning/drills';
import { elaborationFor, shouldElaborate, type Elaboration } from '../../engine/learning/elaboration';
import { createRng, hashSeed } from '../../engine/rng';
import type { DrillGrade, DrillItem } from '../../engine/learning/types';
import { PlayingCard } from '../cards/PlayingCard';
import { debugSet } from '../debug';
import { Icon, Mark, TierTag } from '../Icon';
import { Rich } from './Rich';
import { DrillVisual, VisualView } from './visuals';

export interface DrillResult {
  correct: boolean;
  alternative: boolean;
  ms: number;
  confidence?: 1 | 2 | 3;
  response: number | number[];
  reasoning?: 'good' | 'poor';
}

const CONF: { v: 1 | 2 | 3; label: string }[] = [
  { v: 1, label: 'Guessing' },
  { v: 2, label: 'Fairly sure' },
  { v: 3, label: 'Certain' },
];

function ConfidenceRow({ value, onPick, disabled }: { value: 1 | 2 | 3 | null; onPick: (v: 1 | 2 | 3) => void; disabled?: boolean }) {
  return (
    <div className="conf-row" role="group" aria-label="How sure are you?">
      <span className="small muted">How sure are you?</span>
      {CONF.map((c) => (
        <button key={c.v} className="chip-btn" aria-pressed={value === c.v} disabled={disabled} onClick={() => onPick(c.v)}>{c.label}</button>
      ))}
    </div>
  );
}

function Timer({ seconds, running }: { seconds: number; running: boolean }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    const id = setInterval(() => setT((performance.now() - start) / 1000), 200);
    return () => clearInterval(id);
  }, [running]);
  const pct = Math.min(1, t / seconds);
  return (
    <div className="timer" aria-hidden="true" title={`Suggested time: ${seconds}s. There is no penalty for taking longer.`}>
      <div className={`timer-fill ${pct > 0.85 ? 'timer-late' : ''}`} style={{ width: `${(1 - pct) * 100}%` }} />
    </div>
  );
}

export interface DrillCardProps {
  item: DrillItem;
  onDone: (r: DrillResult) => void;
  /** Ask "how sure are you?" before answering (calibration). */
  askConfidence?: boolean;
  showTimer?: boolean;
  /** Label for the Next button. */
  nextLabel?: string;
  /** Occasionally ask "why did you choose that?" after the answer. */
  elaborate?: boolean;
}

export function DrillCard({ item, onDone, askConfidence, showTimer = true, nextLabel = 'Next', elaborate }: DrillCardProps) {
  const [conf, setConf] = useState<1 | 2 | 3 | null>(null);
  const [slider, setSlider] = useState(50);
  const [picked, setPicked] = useState<number[]>([]);
  const [grade, setGrade] = useState<DrillGrade | null>(null);
  const [response, setResponse] = useState<number | number[] | null>(null);
  const [elab, setElab] = useState<Elaboration | null>(null);
  const [elabPick, setElabPick] = useState<number | null>(null);
  const t0 = useRef(performance.now());
  const ms = useRef(0);

  useEffect(() => {
    setElab(null); setElabPick(null);
    setConf(null); setGrade(null); setPicked([]); setSlider(50); setResponse(null);
    t0.current = performance.now();
    debugSet('item', item);
    debugSet('quiz', null);
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = askConfidence && conf === null;
  const submit = useCallback((r: number | number[]) => {
    if (grade) return;
    ms.current = performance.now() - t0.current;
    setResponse(r);
    setGrade(gradeDrill(item, r));
  }, [grade, item]);

  const finish = useCallback((reasoning?: 'good' | 'poor') => {
    if (!grade || response === null) return;
    onDone({ correct: grade.correct, alternative: grade.alternative, ms: ms.current, confidence: conf ?? undefined, response, reasoning });
  }, [grade, response, conf, onDone]);

  const next = useCallback(() => {
    if (!grade || response === null) return;
    if (elab) return; // the self-explanation card is showing
    if (elaborate && shouldElaborate(item.id)) {
      const e = elaborationFor(item, response, createRng(hashSeed(item.id, 'elab')));
      if (e) { setElab(e); return; }
    }
    finish();
  }, [grade, response, elab, elaborate, item, finish]);

  // Keyboard: 1..n picks a choice, Enter advances.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (grade) {
        if (e.key === 'Enter' && !elab) { e.preventDefault(); next(); }
        return;
      }
      if (item.input.kind === 'choice' && !locked && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < item.input.options.length) { e.preventDefault(); submit(i); }
      }
      if (askConfidence && conf === null && /^[qwe]$/i.test(e.key)) setConf(({ q: 1, w: 2, e: 3 } as const)[e.key.toLowerCase() as 'q' | 'w' | 'e']);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grade, next, item, locked, submit, askConfidence, conf, elab]);

  return (
    <div className="drill" aria-live="polite">
      {showTimer && <Timer seconds={item.seconds} running={!grade && !locked} />}
      <p className="drill-prompt">{item.prompt}</p>
      <DrillVisual v={item.visual} revealed={!!grade} />
      {askConfidence && !grade && <ConfidenceRow value={conf} onPick={setConf} />}

      {item.input.kind === 'choice' && (
        <div className="choices" role="group" aria-label="Answers">
          {item.input.options.map((o, i) => {
            const chosen = response === i;
            const isAns = !!grade && item.answer.includes(i);
            return (
              <button
                key={i}
                className={`choice ${grade ? (isAns ? 'choice-right' : chosen ? 'choice-wrong' : '') : ''}`}
                disabled={!!grade || !!locked}
                onClick={() => submit(i)}
                aria-keyshortcuts={String(i + 1)}
              >
                <kbd>{i + 1}</kbd>
                <span>{o}</span>
                {grade && isAns && <Mark ok />}
                {grade && chosen && !isAns && <Mark ok={false} />}
              </button>
            );
          })}
        </div>
      )}

      {item.input.kind === 'slider' && (
        <div className="slider-wrap">
          <div className="row">
            <input type="range" className="slider" min={item.input.min} max={item.input.max} step={item.input.step} value={slider} disabled={!!grade || !!locked} onChange={(e) => setSlider(Number(e.target.value))} aria-label="Your estimate" />
            <b className="num slider-val">{slider}{item.input.unit}</b>
          </div>
          {!grade && <button className="btn-primary" disabled={!!locked} onClick={() => submit(slider)}>Lock in my guess</button>}
          {grade && (
            <div className="meter-compare" aria-label={`You said ${slider} percent, the truth is ${item.answer[0]} percent`}>
              <div className="mc-track"><span className="mc-you" style={{ left: `${slider}%` }}>you</span><span className="mc-truth" style={{ left: `${item.answer[0]}%` }}>actual</span></div>
            </div>
          )}
        </div>
      )}

      {item.input.kind === 'cards' && (
        <div>
          <div className="pick-row" role="group" aria-label="Choose five cards">
            {item.input.pool.map((c, i) => {
              const on = picked.includes(i);
              return (
                <button key={i} className={`pickcard ${on ? 'pickcard-on' : ''}`} aria-pressed={on} disabled={!!grade || !!locked} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== i) : p.length < 5 ? [...p, i] : p))}>
                  <PlayingCard card={c} width={58} dim={!!grade && !on} glow={on} />
                </button>
              );
            })}
          </div>
          {!grade && <button className="btn-primary" disabled={picked.length !== 5 || !!locked} onClick={() => submit(picked)}>Check my five ({picked.length}/5)</button>}
        </div>
      )}

      {grade && elab && (
        <div className="feedback elab" role="group" aria-label="Explain your reasoning">
          <p><b>{elab.prompt}</b></p>
          <div className="choices">
            {elab.options.map((o, i) => (
              <button key={i} className={`choice ${elabPick !== null ? (o.good ? 'choice-right' : i === elabPick ? 'choice-wrong' : '') : ''}`} disabled={elabPick !== null} onClick={() => setElabPick(i)}>
                <kbd>{i + 1}</kbd><span>{o.text}</span>
                {elabPick !== null && o.good && <Mark ok label="sound reasoning" />}
                {elabPick === i && !o.good && <Mark ok={false} label="weak reasoning" />}
              </button>
            ))}
          </div>
          {elabPick !== null && (
            <div>
              <p><b>{elab.options[elabPick]!.good ? 'Sound reasoning.' : 'That reasoning has a gap.'}</b> {elab.options[elabPick]!.feedback}</p>
              {!elab.options[elabPick]!.good && <p><b>Better:</b> {elab.options.find((o) => o.good)!.text}</p>}
              <button className="btn-primary" autoFocus onClick={() => finish(elab.options[elabPick]!.good ? 'good' : 'poor')}>{nextLabel}</button>
            </div>
          )}
        </div>
      )}

      {grade && !elab && (
        <div className={`feedback ${grade.correct ? 'feedback-ok' : 'feedback-bad'}`} role="status">
          <div className="feedback-head">
            <span className="feedback-icon" aria-hidden="true"><Icon name={grade.correct ? 'check' : 'cross'} /></span>
            <b>{grade.correct ? (grade.alternative ? 'Acceptable — a close spot' : 'Correct') : 'Not quite'}</b>
            <TierTag tier={item.tier} />
          </div>
          <p>{grade.feedback}</p>
          <button className="btn-primary" onClick={next} autoFocus>{nextLabel} <span className="faint">(Enter)</span></button>
        </div>
      )}
    </div>
  );
}

/** A static multiple-choice question from the lesson content. */
export function QuizCard({ q, onDone, askConfidence, nextLabel = 'Continue', }: { q: QuizItem; onDone: (r: { correct: boolean; ms: number; confidence?: 1 | 2 | 3; picked: number }) => void; askConfidence?: boolean; nextLabel?: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [conf, setConf] = useState<1 | 2 | 3 | null>(null);
  const t0 = useRef(performance.now());
  useEffect(() => { setPicked(null); setConf(null); t0.current = performance.now(); debugSet('quiz', q); debugSet('item', null); }, [q]);
  const ms = useRef(0);
  const locked = askConfidence && conf === null;
  const choose = (i: number): void => {
    if (picked !== null) return;
    ms.current = performance.now() - t0.current;
    setPicked(i);
  };
  const done = (): void => {
    if (picked === null) return;
    onDone({ correct: picked === q.correct, ms: ms.current, confidence: conf ?? undefined, picked });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (picked !== null) { if (e.key === 'Enter') { e.preventDefault(); done(); } return; }
      if (!locked && /^[1-9]$/.test(e.key) && Number(e.key) <= q.options.length) choose(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, locked, q]);
  return (
    <div className="drill" aria-live="polite">
      <p className="drill-prompt"><Rich text={q.prompt} /></p>
      {q.visual && <VisualView v={q.visual} />}
      {askConfidence && picked === null && <ConfidenceRow value={conf} onPick={setConf} />}
      <div className="choices" role="group" aria-label="Answers">
        {q.options.map((o, i) => {
          const right = picked !== null && i === q.correct;
          const wrong = picked === i && i !== q.correct;
          return (
            <button key={i} className={`choice ${right ? 'choice-right' : wrong ? 'choice-wrong' : ''}`} disabled={picked !== null || !!locked} onClick={() => choose(i)}>
              <kbd>{i + 1}</kbd>
              <span>{o.text}</span>
              {right && <Mark ok />}
              {wrong && <Mark ok={false} />}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className={`feedback ${picked === q.correct ? 'feedback-ok' : 'feedback-bad'}`} role="status">
          <div className="feedback-head">
            <span className="feedback-icon" aria-hidden="true"><Icon name={picked === q.correct ? 'check' : 'cross'} /></span>
            <b>{picked === q.correct ? 'Correct' : 'Not quite'}</b>
          </div>
          <p>{q.options[picked]!.why}</p>
          {picked !== q.correct && <p><b>The answer:</b> {q.options[q.correct]!.text}</p>}
          <p className="muted small">{q.explain}</p>
          <button className="btn-primary" onClick={done} autoFocus>{nextLabel} <span className="faint">(Enter)</span></button>
        </div>
      )}
    </div>
  );
}
