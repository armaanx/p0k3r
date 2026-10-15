import { useCallback, useState } from 'react';
import type { SeqItem } from '../../content/moduleTest';
import type { Attempt } from '../../state/types';
import { useStore } from '../../state/store';
import { withAttempt } from '../../state/actions';
import { DrillCard } from './Cards';
import { QuizCard } from './Cards';

export type { SeqItem };

/** Runs a list of questions one at a time, records every attempt, and reports the results. */
export function ItemSequence({ items, askConfidence, mixed, onFinish, label, elaborate }: { items: SeqItem[]; askConfidence?: boolean; mixed?: boolean; onFinish: (correct: boolean[]) => void; label?: string; elaborate?: boolean }) {
  const { update } = useStore();
  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);

  const record = useCallback((a: Omit<Attempt, 't'>) => {
    update((p) => withAttempt(p, { ...a, t: Date.now() }));
  }, [update]);

  const advance = (ok: boolean): void => {
    const next = [...results, ok];
    setResults(next);
    if (i + 1 >= items.length) onFinish(next);
    else setI(i + 1);
  };

  const cur = items[i]!;
  return (
    <div>
      <div className="seq-head">
        <span className="small muted">{label ?? 'Practice'}</span>
        <span className="dots" role="img" aria-label={`Question ${i + 1} of ${items.length}`}>
          {items.map((_, k) => (
            <i key={k} className={`dot ${k < results.length ? (results[k] ? 'dot-ok' : 'dot-bad') : k === i ? 'dot-cur' : ''}`} />
          ))}
        </span>
        <span className="small muted num">{i + 1}/{items.length}</span>
      </div>
      {cur.kind === 'drill' ? (
        <DrillCard
          key={cur.item.id}
          item={cur.item}
          askConfidence={askConfidence}
          elaborate={elaborate}
          nextLabel={i + 1 >= items.length ? 'Finish' : 'Next'}
          onDone={(r) => {
            record({ concept: cur.item.concept, spot: cur.item.spot, kind: cur.item.type, correct: r.correct, confidence: r.confidence, ms: Math.round(r.ms), mixed, reasoning: r.reasoning });
            advance(r.correct);
          }}
        />
      ) : (
        <QuizCard
          key={`${i}-${cur.q.prompt}`}
          q={cur.q}
          askConfidence={askConfidence}
          nextLabel={i + 1 >= items.length ? 'Finish' : 'Next'}
          onDone={(r) => {
            record({ concept: cur.q.concept, spot: cur.spot, kind: 'quiz', correct: r.correct, confidence: r.confidence, ms: Math.round(r.ms), mixed });
            advance(r.correct);
          }}
        />
      )}
    </div>
  );
}
