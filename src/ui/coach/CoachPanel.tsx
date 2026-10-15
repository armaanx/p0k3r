import { useEffect, useMemo, useRef, useState } from 'react';
import { TIER_LABELS, type ActionClass, type Advice } from '../../engine/coach/advice';
import { VERDICT_LABELS, type Explanation, type Grade } from '../../engine/coach/grade';
import type { HandState } from '../../engine/game';
import type { CoachCompare, CoachLevel } from '../../state/types';
import { getCoach } from '../../workers/client';
import { visibleParts, type Features } from '../features';
import { EquityMeter, PotOddsBar } from './Meters';
import { Icon, TierTag, VerdictChip } from '../Icon';

export interface LastDecision {
  grade: Grade;
  explanation: Explanation;
  label: string;
}

const CLASS_WORD: Record<ActionClass, string> = { fold: 'Fold', passive: 'Check / Call', aggressive: 'Bet / Raise' };

export interface CoachPanelProps {
  hand: HandState | null;
  heroSeat: number;
  level: CoachLevel;
  features: Features;
  fmt: (n: number) => string;
  onLevel: (l: CoachLevel) => void;
  onCompare: (c: CoachCompare) => void;
  last: LastDecision | null;
  /** Exposes the current advice to the parent (for hint highlighting). */
  onAdvice?: (a: Advice | null, revealed: boolean) => void;
  thinkFirst: boolean;
  onThinkFirst: (v: boolean) => void;
  /** How much help this concept still needs, from the learner's recent accuracy. */
  fade: (concept: string) => 'full' | 'nudge' | 'none';
  autoFade: boolean;
  onAutoFade: (v: boolean) => void;
}

export function CoachPanel({ hand, heroSeat, level, features, fmt, onLevel, onCompare, last, onAdvice, thinkFirst, onThinkFirst, fade, autoFade, onAutoFade }: CoachPanelProps) {
  const heroTurn = !!hand && !hand.result && hand.toAct === heroSeat;
  const key = hand && heroTurn ? `${hand.seed}:${hand.actions.length}` : '';
  const [advice, setAdvice] = useState<{ key: string; a: Advice } | null>(null);
  const [committed, setCommitted] = useState<ActionClass | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [override, setOverride] = useState(false);
  const started = useRef<string>('');

  // Reset per-decision state
  useEffect(() => {
    setCommitted(null);
    setSkipped(false);
    setStuck(false);
    setShowWhy(false);
    setOverride(false);
  }, [key]);

  // Ask the worker for advice whenever it's the hero's turn.
  useEffect(() => {
    if (!hand || !heroTurn || level === 'off') return;
    if (started.current === key) return;
    started.current = key;
    let cancelled = false;
    getCoach().advise(hand, { iterations: 6000 }).then((a) => { if (!cancelled) setAdvice({ key, a }); }).catch(() => { if (!cancelled) setAdvice(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, level]);

  const a = advice && advice.key === key ? advice.a : null;
  // Fading: as mastery of a concept grows the coach steps back, from full advice to nudges to silence.
  const fadeState = a && autoFade ? fade(a.concept) : 'full';
  const eff: 'off' | 'hints' | 'full' | 'none' = level === 'off' ? 'off' : override ? level : fadeState === 'none' ? 'none' : fadeState === 'nudge' ? 'hints' : level;
  const revealed = (eff === 'full' && !!a && (!thinkFirst || committed !== null || skipped)) || (eff === 'hints' && stuck && !!a);

  useEffect(() => { onAdvice?.(a, revealed); }, [a, revealed, onAdvice]);

  const commit = (c: ActionClass): void => {
    if (!a || !hand) return;
    setCommitted(c);
    onCompare({
      actionIndex: hand.actions.length,
      committed: c,
      recommended: a.recommended.cls,
      agreed: a.acceptable.includes(c),
    });
  };

  const parts = useMemo(() => (a ? visibleParts(a.whyParts, features, 3) : []), [a, features]);
  const nudge = useMemo(() => (a ? visibleParts(a.nudges, features, 1)[0]?.text ?? '' : ''), [a, features]);
  // Preflop with nobody raising, raw equity vs one random hand says nothing useful (several players are still to act).
  const meters = !!a && !(a.kind === 'preflop' && a.unopened);

  return (
    <section className="card-panel coach" aria-label="Coach">
      <div className="row" style={{ paddingTop: 0 }}>
        <h3 className="panel-title" style={{ margin: 0 }}>Coach</h3>
        <span className="seg" role="group" aria-label="Coach level">
          {(['off', 'hints', 'full'] as const).map((l) => (
            <button key={l} aria-pressed={level === l} onClick={() => onLevel(l)}>{l === 'off' ? 'Off' : l === 'hints' ? 'Hints' : 'Full'}</button>
          ))}
        </span>
      </div>

      {level !== 'off' && (
        <label className="switch small" style={{ margin: '0.2rem 0 0.4rem' }}>
          <input type="checkbox" checked={autoFade} onChange={(e) => onAutoFade(e.target.checked)} />
          <span>Fade the coach as I improve</span>
        </label>
      )}
      {level !== 'off' && autoFade && fadeState !== 'full' && heroTurn && a && eff !== 'none' && (
        <p className="small muted" style={{ margin: '0 0 0.4rem' }}>Your recent accuracy on this is good, so the coach is only nudging.</p>
      )}
      {level === 'off' && <p className="muted small">The coach is off. Turn on <b>Hints</b> for gentle nudges, or <b>Full</b> for numbers and a recommendation.</p>}

      {level !== 'off' && !heroTurn && !last && <p className="muted small">The coach will speak up when it is your turn.</p>}

      {level !== 'off' && heroTurn && !a && <p className="muted small" aria-live="polite">Thinking… <span className="spinner" aria-hidden="true" /></p>}

      {eff === 'none' && heroTurn && a && (
        <div className="coach-body coach-fade" aria-live="polite">
          <p><b>You've got this.</b> You have been accurate on this kind of decision, so the coach is staying quiet. Decide, then check your decision in the feedback.</p>
          <button className="link-btn" onClick={() => setOverride(true)}>Show the coach anyway</button>
        </div>
      )}

      {eff === 'hints' && heroTurn && a && !revealed && (
        <div className="coach-body" aria-live="polite">
          <p className="nudge">{nudge}</p>
          <button className="btn-quiet" onClick={() => setStuck(true)}>I'm stuck — show the advice</button>
        </div>
      )}

      {eff === 'full' && heroTurn && a && !revealed && (
        <div className="coach-body" aria-live="polite">
          <p className="think-q"><b>Pause and think.</b> What would you do here?</p>
          <div className="commit-row" role="group" aria-label="Commit to a plan before seeing the coach's view">
            {(['fold', 'passive', 'aggressive'] as const).filter((c) => a.options.some((o) => o.cls === c) && !(c === 'fold' && a.toCall === 0)).map((c) => (
              <button key={c} className="btn-quiet" onClick={() => commit(c)}>
                {c === 'passive' ? (a.toCall === 0 ? 'Check' : 'Call') : c === 'fold' ? 'Fold' : a.options.find((o) => o.cls === 'aggressive') && a.street !== 'preflop' && a.toCall === 0 ? 'Bet' : 'Raise'}
              </button>
            ))}
          </div>
          <button className="link-btn" onClick={() => setSkipped(true)}>Just show me the advice</button>
          <label className="switch small" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={thinkFirst} onChange={(e) => onThinkFirst(e.target.checked)} />
            <span>Always ask me first</span>
          </label>
        </div>
      )}

      {heroTurn && a && revealed && (
        <div className="coach-body" aria-live="polite">
          {committed && (
            <p className={`compare ${a.acceptable.includes(committed) ? 'compare-ok' : 'compare-diff'}`}>
              You planned: <b>{CLASS_WORD[committed]}</b> · Coach: <b>{CLASS_WORD[a.recommended.cls]}</b> {a.acceptable.includes(committed) ? <span className="txt-good"><Icon name="check" size={13} /> You agree</span> : <span className="txt-warn"><Icon name="alert" size={13} /> Different: read why below</span>}
            </p>
          )}
          <div className="coach-headline">{a.recommended.label}</div>
          <div className="tier-row">
            <TierTag tier={a.tier} label={TIER_LABELS[a.tier]} />
            {a.close && <span className="tag"><Icon name="approx" size={12} />Close spot</span>}
          </div>
          {a.close && <p className="small muted">More than one action is reasonable here: {a.acceptable.map((c) => CLASS_WORD[c]).join(', ')}.</p>}
          {meters && features.showEquity && a.equity !== null && (
            <EquityMeter
              equity={a.equity}
              needed={features.showPotOdds ? a.breakEven : null}
              exact={a.equityExact}
              caption={a.kind === 'preflop' && a.situation !== 'vs-shove' ? 'Raw equity ignores position and future betting; the chart decides preflop.' : undefined}
            />
          )}
          {meters && features.showPotOdds && a.toCall > 0 && <PotOddsBar toCall={a.toCall} pot={a.winPot} fmt={fmt} />}
          <ul className="why">{parts.map((p, i) => <li key={i}>{p.text}</li>)}</ul>
          {a.opponents.length > 0 && (
            <>
              <button className="link-btn" aria-expanded={showWhy} onClick={() => setShowWhy((s) => !s)}>{showWhy ? 'Hide' : 'How did I estimate their hand?'}</button>
              {showWhy && <p className="small muted">{a.opponents.map((o) => o.description).join(' ')}</p>}
            </>
          )}
          <p className="small faint foot">
            {a.tier === 'math' ? 'Exact arithmetic that holds up against wide and narrow guesses about their hand.' : a.tier === 'standard' ? 'Based on widely-taught charts and guidelines, not a solver.' : 'Depends on assumptions about your opponent. Strong players sometimes choose differently.'}
          </p>
        </div>
      )}

      {level !== 'off' && last && (
        <div className={`last-decision verdict-${last.grade.verdict}`}>
          <div className="row" style={{ padding: 0 }}>
            <span className="panel-title" style={{ margin: 0 }}>Your last decision</span>
            <VerdictChip verdict={last.grade.verdict} label={VERDICT_LABELS[last.grade.verdict]} />
          </div>
          <p className="small" style={{ margin: '0.3rem 0 0' }}><b>{last.explanation.summary}</b> {last.explanation.detail}</p>
          <p className="small faint" style={{ margin: '0.3rem 0 0' }}>Graded on the decision, not on how the cards fall.</p>
        </div>
      )}
    </section>
  );
}
