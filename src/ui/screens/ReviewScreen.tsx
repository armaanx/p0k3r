import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { TIER_LABELS, type Advice } from '../../engine/coach/advice';
import { VERDICT_LABELS, explainDecision, gradeAdvice, type Verdict } from '../../engine/coach/grade';
import { decisionVsResult, evLostPer100 } from '../../engine/learning/analytics';
import { sessionFromRecord, summarizeHand } from '../../engine/learning/review';
import { cardToString } from '../../engine/cards';
import { applyAction, legalActions, replayHand, type ActionInput, type ActionRecord, type HandState } from '../../engine/game';
import { withAttempt } from '../../state/actions';
import { markDaily } from '../../content/progressView';
import { useStore } from '../../state/store';
import type { HandRecord } from '../../state/types';
import { getCoach } from '../../workers/client';
import { featuresFor } from '../features';
import { makeFmt } from '../format';
import { CardRow } from '../learn/visuals';
import { ActionBar } from '../table/ActionBar';
import { Table } from '../table/Table';
import { Icon, TierTag, VerdictChip } from '../Icon';
import { focusInView } from '../focus';

const go = (to: string): void => { window.location.hash = to; };

export function ReviewScreen({ sub }: { sub: string }) {
  const id = sub.split('/').filter(Boolean)[0];
  const { progress } = useStore();
  if (id) {
    const rec = progress.hands.find((h) => h.id === id);
    return rec ? <HandDetail rec={rec} /> : (
      <div className="card-panel"><p>That hand is no longer saved.</p><button className="btn-primary" onClick={() => go('/review')}>Back to the list</button></div>
    );
  }
  return <HandList />;
}

const verdictChip = (v: Verdict | null): ReactElement => (v ? <VerdictChip verdict={v} label={VERDICT_LABELS[v]} /> : <span className="faint">—</span>);

function HandList() {
  const { progress, update } = useStore();
  const [filter, setFilter] = useState<'all' | 'mistakes' | 'starred'>('all');
  const settings = progress.settings;
  const fmt = useMemo(() => makeFmt(settings, 100), [settings]);
  const hands = useMemo(() => [...progress.hands].reverse(), [progress.hands]);
  const rows = useMemo(() => hands.map((h) => ({ h, s: summarizeHand(h) })), [hands]);
  const shown = rows.filter(({ h, s }) => (filter === 'all' ? true : filter === 'starred' ? !!h.starred : s.decisionVerdict === 'mistake' || s.decisionVerdict === 'blunder'));
  const q = useMemo(() => decisionVsResult(progress.hands), [progress.hands]);
  const per100 = evLostPer100(progress.hands);
  const totalNet = progress.hands.reduce((a, h) => a + h.net / h.bb, 0);

  return (
    <div>
      <div className="page-head">
        <h1>Review</h1>
        <p className="muted">Replay any hand street by street. Each decision is graded on its own, separately from how the cards fell, because a good decision can lose and a bad one can win.</p>
      </div>
      {hands.length === 0 ? (
        <div className="card-panel"><p>No hands yet. Play some hands at the table and they will appear here, graded.</p><button className="btn-primary" onClick={() => go('/play')}>Go to the table</button></div>
      ) : (
        <>
          <section className="card-panel ev-panel" aria-label="Decisions versus results">
            <h2>Decisions versus results</h2>
            <p className="muted small">Your last {progress.hands.length} hands, sorted by decision quality and by what happened. Only the <b>decisions</b> are in your control.</p>
            <div className="quad">
              <div className="quad-cell quad-good"><b className="num">{q.goodWon}</b><span><Icon name="check" size={12} />Good decision, won</span></div>
              <div className="quad-cell quad-good"><b className="num">{q.goodLost}</b><span><Icon name="check" size={12} />Good decision, lost</span><em>Bad luck: nothing to fix</em></div>
              <div className="quad-cell quad-luck"><b className="num">{q.poorWon}</b><span><Icon name="alert" size={12} />Mistake, won</span><em>Lucky: still a leak</em></div>
              <div className="quad-cell quad-bad"><b className="num">{q.poorLost}</b><span><Icon name="cross" size={12} />Mistake, lost</span><em>The one to study</em></div>
            </div>
            <div className="stats-grid">
              <div className="stat"><span>Chip result</span><b className={totalNet >= 0 ? 'pos' : 'neg'}>{totalNet >= 0 ? '+' : ''}{totalNet.toFixed(1)} bb</b></div>
              <div className="stat"><span>EV lost to decisions / 100 hands</span><b>{per100 === null ? '—' : `${per100.toFixed(1)} bb`}</b></div>
              <div className="stat"><span>Hands graded</span><b>{progress.hands.filter((h) => h.grades?.length).length}</b></div>
            </div>
            <p className="faint small">EV lost is an estimate from the coach's model, not a solver. It is more stable than your chip result, which swings with luck.</p>
          </section>

          <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
            <span className="seg" role="group" aria-label="Filter hands">
              <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
              <button aria-pressed={filter === 'mistakes'} onClick={() => setFilter('mistakes')}>With mistakes</button>
              <button aria-pressed={filter === 'starred'} onClick={() => setFilter('starred')}>Starred</button>
            </span>
          </div>
          <ul className="hand-list">
            {shown.map(({ h, s }) => {
              const hero = h.replay ? replayHand(h.replay, 0).players[h.heroSeat]!.hole : null;
              return (
                <li key={h.id}>
                  <button className="hand-row" onClick={() => go(`/review/${h.id}`)}>
                    <span className="hand-cards">{hero ? hero.map(cardToString).join(' ') : ''}</span>
                    <span className="hand-col"><i>Result</i><b className={`num ${h.net > 0 ? 'pos' : h.net < 0 ? 'neg' : ''}`}>{h.net > 0 ? '+' : ''}{fmt(h.net)}</b></span>
                    <span className="hand-col"><i>Decisions</i>{verdictChip(s.decisionVerdict)}</span>
                    <span className="hand-col"><i>EV lost</i><b className="num">{s.evLostBB.toFixed(1)} bb</b></span>
                    <span className="hand-when faint small">{new Date(h.t).toLocaleString()}</span>
                  </button>
                  <button className={`star ${h.starred ? 'star-on' : ''}`} aria-pressed={!!h.starred} aria-label={h.starred ? 'Unstar this hand' : 'Star this hand to review later'} onClick={() => update((p) => ({ ...p, hands: p.hands.map((x) => (x.id === h.id ? { ...x, starred: !x.starred } : x)) }))}><Icon name={h.starred ? 'star-fill' : 'star'} /></button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="muted">No hands match this filter.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

function actionText(a: ActionRecord, name: string, fmt: (n: number) => string): string {
  switch (a.type) {
    case 'fold': return `${name} folds`;
    case 'check': return `${name} checks`;
    case 'call': return `${name} calls ${fmt(a.chips)}${a.allIn ? ' (all-in)' : ''}`;
    case 'bet': return `${name} bets ${fmt(a.toAmount)}${a.allIn ? ' (all-in)' : ''}`;
    default: return `${name} raises to ${fmt(a.toAmount)}${a.allIn ? ' (all-in)' : ''}`;
  }
}

function HandDetail({ rec }: { rec: HandRecord }) {
  const { progress, update } = useStore();
  const settings = progress.settings;
  const features = featuresFor(progress);
  const fmt = useMemo(() => makeFmt(settings, rec.bb), [settings, rec.bb]);
  const sess = useMemo(() => sessionFromRecord(rec), [rec]);
  const n = rec.replay.actions.length;
  const summary = useMemo(() => summarizeHand(rec), [rec]);
  const grades = rec.grades ?? [];
  const firstDecision = grades.length ? Math.min(...grades.map((g) => g.actionIndex)) : 0;
  const [step, setStep] = useState(n);
  const [spot, setSpot] = useState<number | null>(null);
  const hand = useMemo(() => replayHand(rec.replay, step), [rec, step]);
  // Opening a hand to study it counts as the day's in-depth review.
  useEffect(() => { update((p) => markDaily(p, 'review')); }, [rec.id, update]);
  const gradeHere = grades.find((g) => g.actionIndex === step);
  const streetStart = useMemo(() => {
    const m: Record<string, number> = { preflop: 0 };
    rec.replay.actions.forEach((a, i) => { if (!(a.street in m)) m[a.street] = i; });
    return m;
  }, [rec]);
  const reachedShowdown = !!hand.result?.showdown;
  const winners = hand.result ? [...new Set(hand.result.pots.flatMap((p) => p.awards.map((a) => a.seat)))] : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (spot !== null) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); setStep((s) => Math.min(n, s + 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setStep((s) => Math.max(0, s - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, spot]);

  if (spot !== null) return <SpotTrainer rec={rec} actionIndex={spot} onClose={() => setSpot(null)} />;

  const compare = rec.coachCompare?.find((c) => c.actionIndex === step);
  const CLASS_WORD: Record<string, string> = { fold: 'Fold', passive: 'Check / Call', aggressive: 'Bet / Raise' };
  const net = rec.net;

  return (
    <div className="review-layout">
      <div className="review-main">
        <div className="lesson-head">
          <button className="btn-ghost" onClick={() => go('/review')}><Icon name="arrow-left" /> All hands</button>
          <h1 className="lesson-title">Hand review</h1>
          <button className={`star ${rec.starred ? 'star-on' : ''}`} aria-pressed={!!rec.starred} aria-label="Star this hand" onClick={() => update((p) => ({ ...p, hands: p.hands.map((x) => (x.id === rec.id ? { ...x, starred: !x.starred } : x)) }))}><Icon name={rec.starred ? 'star-fill' : 'star'} /></button>
        </div>
        <Table hand={hand} session={sess} heroSeat={rec.heroSeat} settings={settings} features={features} fmt={fmt} revealAll={reachedShowdown} winners={hand.result ? winners : []} />
        <div className="stepper" role="group" aria-label="Replay controls">
          <button className="btn-quiet" onClick={() => setStep(0)} disabled={step === 0} aria-label="Go to the start"><Icon name="skip-start" /></button>
          <button className="btn-quiet" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}><Icon name="chev-left" /> Back</button>
          <span className="num small muted">step {step} / {n}</span>
          <button className="btn-quiet" onClick={() => setStep((s) => Math.min(n, s + 1))} disabled={step === n}>Next <Icon name="chev-right" /></button>
          <button className="btn-quiet" onClick={() => setStep(n)} disabled={step === n} aria-label="Go to the end"><Icon name="skip-end" /></button>
          <span className="seg" role="group" aria-label="Jump to a street">
            {(['preflop', 'flop', 'turn', 'river'] as const).filter((s) => s in streetStart).map((s) => (
              <button key={s} aria-pressed={hand.street === s && !hand.result} onClick={() => setStep(streetStart[s]!)}>{s[0]!.toUpperCase() + s.slice(1)}</button>
            ))}
          </span>
        </div>
        <ol className="timeline" aria-label="Actions in this hand">
          {rec.replay.actions.map((a, i) => {
            const g = grades.find((x) => x.actionIndex === i);
            return (
              <li key={i} className={`${i === step ? 'tl-cur' : ''} ${i < step ? 'tl-past' : ''}`}>
                <button onClick={() => setStep(i)}>
                  <span className="tl-street">{a.street}</span>
                  <span className={`tl-text ${a.seat === rec.heroSeat ? 'tl-hero' : ''}`}>{actionText(a, a.seat === rec.heroSeat ? 'You' : sess.seats[a.seat]!.name, fmt)}</span>
                  {g && <VerdictChip verdict={g.verdict} label={VERDICT_LABELS[g.verdict]} />}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <aside className="review-side">
        <section className="card-panel">
          <h3 className="panel-title">Result and decisions, separately</h3>
          <div className="split-grade">
            <div><i>Result</i><b className={`num ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}`}>{net > 0 ? '+' : ''}{fmt(net)}</b></div>
            <div><i>Decision grade</i>{verdictChip(summary.decisionVerdict)}</div>
            <div><i>EV lost</i><b className="num">{summary.evLostBB.toFixed(1)} bb</b></div>
          </div>
          <p className="small">{summary.resultNote}</p>
        </section>

        <section className="card-panel takeaway-card">
          <h3 className="panel-title">The one takeaway</h3>
          <p>{summary.takeaway}</p>
          {summary.worst && summary.worst.actionIndex !== step && (
            <button className="btn-quiet" onClick={() => setStep(summary.worst!.actionIndex)}>Jump to that moment</button>
          )}
        </section>

        {gradeHere ? (
          <DecisionCard rec={rec} gradeIndex={grades.indexOf(gradeHere)} compareText={compare ? `Before the coach spoke you planned "${CLASS_WORD[compare.committed] ?? compare.committed}"; the coach said "${CLASS_WORD[compare.recommended] ?? compare.recommended}". ${compare.agreed ? 'You agreed.' : 'You differed.'}` : null} onReplay={() => setSpot(gradeHere.actionIndex)} />
        ) : (
          <section className="card-panel">
            <h3 className="panel-title">Your decisions</h3>
            {grades.length === 0 ? <p className="muted small">You made no decisions in this hand.</p> : (
              <ul className="dec-list">
                {grades.map((g, i) => (
                  <li key={i}><button className="link-btn" onClick={() => setStep(g.actionIndex)}>{g.street[0]!.toUpperCase() + g.street.slice(1)}</button> {verdictChip(g.verdict)} <span className="faint small">−{g.evLostBB.toFixed(1)} bb</span></li>
                ))}
              </ul>
            )}
            {grades.length > 0 && <button className="btn-quiet" onClick={() => setStep(firstDecision)}>Go to my first decision</button>}
          </section>
        )}
        {rec.coachCompare && rec.coachCompare.length > 0 && (
          <p className="faint small">Pause-and-think record: you agreed with the coach on {rec.coachCompare.filter((c) => c.agreed).length} of {rec.coachCompare.length} plans.</p>
        )}
      </aside>
    </div>
  );
}

function DecisionCard({ rec, gradeIndex, compareText, onReplay }: { rec: HandRecord; gradeIndex: number; compareText: string | null; onReplay: () => void }) {
  const g = rec.grades![gradeIndex]!;
  const act = rec.replay.actions[g.actionIndex]!;
  return (
    <section className={`card-panel decision verdict-${g.verdict}`}>
      <div className="row" style={{ padding: 0 }}>
        <h3 className="panel-title" style={{ margin: 0 }}>Your decision · {g.street}</h3>
        <VerdictChip verdict={g.verdict} label={VERDICT_LABELS[g.verdict]} />
      </div>
      <p style={{ margin: '0.5rem 0 0.3rem' }}><b>You {act.type === 'raise' || act.type === 'bet' ? `${act.type} to ${act.toAmount}` : act.type}</b></p>
      <p className="small">{g.why}</p>
      <div className="tier-row">
        <TierTag tier={g.tier} label={TIER_LABELS[g.tier]} />
        <span className="tag">EV lost ≈ {g.evLostBB.toFixed(1)} bb</span>
      </div>
      {g.verdict === 'inaccuracy' || g.verdict === 'mistake' || g.verdict === 'blunder' ? null : <p className="small muted">Close or clearly fine: no action needed.</p>}
      {compareText && <p className="small compare compare-diff" style={{ marginTop: '0.6rem' }}>{compareText}</p>}
      <button className="btn-primary" style={{ marginTop: '0.7rem' }} onClick={onReplay}>Replay this spot</button>
    </section>
  );
}

/** Re-deal the same decision: try a different action and see how it would have been graded. */
function SpotTrainer({ rec, actionIndex, onClose }: { rec: HandRecord; actionIndex: number; onClose: () => void }) {
  const { progress, update } = useStore();
  const settings = progress.settings;
  const features = featuresFor(progress);
  const fmt = useMemo(() => makeFmt(settings, rec.bb), [settings, rec.bb]);
  const sess = useMemo(() => sessionFromRecord(rec), [rec]);
  const start: HandState = useMemo(() => replayHand(rec.replay, actionIndex), [rec, actionIndex]);
  const [hand, setHand] = useState<HandState>(start);
  const [result, setResult] = useState<{ advice: Advice; verdict: Verdict; summary: string; detail: string; chosenLabel: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const original = rec.replay.actions[actionIndex]!;
  const originalGrade = rec.grades?.find((g) => g.actionIndex === actionIndex);
  const legal = !result && hand.toAct === rec.heroSeat ? legalActions(hand) : null;

  const onAction = useCallback((a: ActionInput) => {
    if (busy || result) return;
    setBusy(true);
    getCoach().advise(start, { chosen: a, iterations: 6000 }).then((adv) => {
      const g = gradeAdvice(adv, rec.bb);
      const ex = explainDecision(adv, g);
      setHand(applyAction(start, a));
      setResult({ advice: adv, verdict: g.verdict, summary: ex.summary, detail: ex.detail, chosenLabel: adv.chosen!.label });
      update((p) => withAttempt(p, { t: Date.now(), concept: adv.concept, spot: `${adv.kind === 'preflop' ? adv.position : adv.street}:${adv.concept}`, kind: 'replay', correct: adv.chosen!.acceptable, evLostBB: g.lossBB }));
    }).finally(() => setBusy(false));
  }, [busy, result, start, rec.bb, update]);

  const retry = (): void => { setResult(null); setHand(start); };
  const a = result?.advice;

  return (
    <div className="review-layout">
      <div className="review-main">
        <div className="lesson-head">
          <button className="btn-ghost" onClick={onClose}><Icon name="arrow-left" /> Back to the review</button>
          <h1 className="lesson-title">Replay this spot</h1>
        </div>
        <p className="muted" style={{ maxWidth: 680 }}>This is the same decision, with the same cards. Choose an action, then see how it would have been graded. Opponents' hands stay hidden, just like in the real hand.</p>
        <Table hand={result ? start : hand} session={sess} heroSeat={rec.heroSeat} settings={settings} features={features} fmt={fmt} />
        {legal && <ActionBar legal={legal} seat={rec.heroSeat} bb={rec.bb} street={hand.street} fmt={fmt} onAction={onAction} keysEnabled />}
        {busy && <p className="muted" style={{ textAlign: 'center' }}>Checking… <span className="spinner" /></p>}
      </div>
      <aside className="review-side">
        <section className="card-panel">
          <h3 className="panel-title">The original hand</h3>
          <p className="small">You chose <b>{original.type === 'raise' || original.type === 'bet' ? `${original.type} to ${original.toAmount}` : original.type}</b>{originalGrade ? <> and it was graded {verdictChip(originalGrade.verdict)}.</> : '.'}</p>
          <CardRow cards={start.players[rec.heroSeat]!.hole ?? []} width={46} label="Your cards" />
        </section>
        {result && a ? (
          <section className={`card-panel decision verdict-${result.verdict}`} aria-live="polite">
            <div className="row" style={{ padding: 0 }}>
              <h3 className="panel-title" style={{ margin: 0 }}>Your new choice</h3>
              <VerdictChip verdict={result.verdict} label={VERDICT_LABELS[result.verdict]} />
            </div>
            <p style={{ margin: '0.4rem 0' }}><b>{result.chosenLabel}</b></p>
            <p className="small"><b>{result.summary}</b> {result.detail}</p>
            <p className="small">The coach would <b>{a.recommended.label.toLowerCase()}</b>. <TierTag tier={a.tier} label={TIER_LABELS[a.tier]} /></p>
            <table className="ref-table">
              <thead><tr><th>Option</th><th>{a.evKind === 'score' ? 'Chart score' : 'Estimated value'}</th></tr></thead>
              <tbody>
                {a.options.map((o) => <tr key={o.cls}><td>{o.label}</td><td className="num">{o.evBB >= 0 ? '+' : ''}{o.evBB.toFixed(1)} bb</td></tr>)}
              </tbody>
            </table>
            <p className="faint small">
              {a.evKind === 'score'
                ? '"Chart score" is a rough preflop number built from the charts: how far this hand is inside or outside the range for this spot, scaled by the size of the pot. It is not a true expected value. Folding is the zero line.'
                : '"Value" is what the coach\'s model expects each option to win or lose on average from here. Folding is the zero line. It is an estimate, not a solver result.'}
            </p>
            <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
              <button className="btn-primary" onClick={retry} ref={focusInView}>Try a different action</button>
              <button className="btn-quiet" onClick={onClose}>Done</button>
            </div>
          </section>
        ) : (
          <section className="card-panel"><p className="muted small">Decide first. The coach's view appears after you choose.</p></section>
        )}
      </aside>
    </div>
  );
}

