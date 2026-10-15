import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActionInput, LegalActions } from '../../engine/game';

export interface ActionBarProps {
  legal: LegalActions;
  seat: number;
  bb: number;
  street: string;
  fmt: (n: number) => string;
  /** Called with the chosen action. */
  onAction: (a: ActionInput) => void;
  /** Keyboard shortcuts are only active when true. */
  keysEnabled: boolean;
  /** Buttons the coach wants to call attention to (never hides options). */
  hintAction?: 'fold' | 'call' | 'raise' | null;
  /** Guided mode: only this action is allowed (others are disabled). */
  only?: 'fold' | 'call' | 'raise' | null;
}

interface Quick { key: string; label: string; to: number }

export function quickSizes(legal: LegalActions, bb: number, street: string): Quick[] {
  const { minRaiseTo, maxRaiseTo, potSize, currentBet, callAmount } = legal;
  const clamp = (x: number): number => Math.max(minRaiseTo, Math.min(maxRaiseTo, Math.round(x)));
  const out: Quick[] = [];
  if (street === 'preflop') {
    for (const m of currentBet <= bb ? [2.5, 3, 4] : [2.5, 3, 4]) {
      out.push({ key: `${m}x`, label: `${m}×`, to: clamp(currentBet * m) });
    }
  } else {
    for (const [f, label] of [[1 / 3, '⅓ pot'], [1 / 2, '½ pot'], [2 / 3, '⅔ pot'], [1, 'Pot']] as const) {
      out.push({ key: label, label, to: clamp(currentBet + f * (potSize + callAmount)) });
    }
  }
  // De-duplicate by amount, keeping order
  const seen = new Set<number>();
  return out.filter((q) => (seen.has(q.to) ? false : (seen.add(q.to), true)));
}

export function ActionBar({ legal, seat, bb, street, fmt, onAction, keysEnabled, hintAction, only }: ActionBarProps) {
  const ok = (k: 'fold' | 'call' | 'raise'): boolean => !only || only === k;
  const [raising, setRaising] = useState(false);
  const [amount, setAmount] = useState(legal.minRaiseTo);
  const allInOnly = legal.canRaise && legal.minRaiseTo >= legal.maxRaiseTo;

  // Reset the slider whenever the decision changes.
  useEffect(() => {
    setRaising(false);
    setAmount(legal.minRaiseTo);
  }, [legal.minRaiseTo, legal.maxRaiseTo, legal.currentBet, seat, street]);

  const quick = useMemo(() => quickSizes(legal, bb, street), [legal, bb, street]);
  const clampAmt = useCallback((x: number) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(x))), [legal.minRaiseTo, legal.maxRaiseTo]);

  const fold = useCallback(() => { if (ok('fold')) onAction({ seat, type: 'fold' }); }, [onAction, seat, only]); // eslint-disable-line react-hooks/exhaustive-deps
  const callOrCheck = useCallback(() => { if (ok('call')) onAction({ seat, type: legal.canCheck ? 'check' : 'call' }); }, [onAction, seat, legal.canCheck, only]); // eslint-disable-line react-hooks/exhaustive-deps
  const confirmRaise = useCallback(() => {
    if (!ok('raise')) return;
    const to = clampAmt(amount);
    onAction(to >= legal.maxRaiseTo ? { seat, type: 'allin' } : { seat, type: legal.raiseType, amount: to });
  }, [amount, clampAmt, legal.maxRaiseTo, legal.raiseType, onAction, seat, only]); // eslint-disable-line react-hooks/exhaustive-deps
  const shove = useCallback(() => { if (ok('raise')) onAction({ seat, type: 'allin' }); }, [onAction, seat, only]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'number')) {
        if (e.key === 'Enter') { e.preventDefault(); confirmRaise(); }
        if (e.key === 'Escape') setRaising(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f') { e.preventDefault(); fold(); }
      else if (k === 'c') { e.preventDefault(); callOrCheck(); }
      else if (k === 'r' && legal.canRaise) {
        e.preventDefault();
        if (allInOnly) shove();
        else if (raising) confirmRaise();
        else setRaising(true);
      } else if (k === 'a' && legal.canRaise) { e.preventDefault(); shove(); }
      else if (k === 'enter' && raising) { e.preventDefault(); confirmRaise(); }
      else if (k === 'escape') setRaising(false);
      else if (raising && (k === 'arrowup' || k === 'arrowright')) { e.preventDefault(); setAmount((a) => clampAmt(a + bb)); }
      else if (raising && (k === 'arrowdown' || k === 'arrowleft')) { e.preventDefault(); setAmount((a) => clampAmt(a - bb)); }
      else if (raising && /^[1-5]$/.test(k)) {
        const q = quick[Number(k) - 1];
        if (q) setAmount(q.to);
        else if (Number(k) === quick.length + 1) setAmount(legal.maxRaiseTo);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keysEnabled, fold, callOrCheck, confirmRaise, shove, legal.canRaise, allInOnly, raising, clampAmt, bb, quick, legal.maxRaiseTo]);

  const raiseWord = legal.raiseType === 'bet' ? 'Bet' : 'Raise';
  // With nothing in front of you a bet's "to" total equals the chips you put in, so say "Bet 300", not "Bet to 300".
  const sizeWord = legal.raiseType === 'bet' ? 'Bet' : 'Raise to';
  const callAllIn = !legal.canCheck && legal.callAmount >= legal.stack;
  const raiseAllIn = clampAmt(amount) >= legal.maxRaiseTo;
  const hint = (a: 'fold' | 'call' | 'raise'): string => (hintAction === a ? ' hint-pulse' : '');

  return (
    <div className="actionbar" role="group" aria-label="Your actions">
      {raising && !allInOnly && (
        <div className="raise-panel">
          <div className="raise-row">
            <input
              type="range"
              aria-label={`${raiseWord} size`}
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              step={1}
              value={clampAmt(amount)}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="slider"
            />
            <input
              type="number"
              aria-label={legal.raiseType === 'bet' ? 'Bet amount' : 'Raise to'}
              className="amount-input num"
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              value={clampAmt(amount)}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="quick-row">
            <button className="chip-btn" onClick={() => setAmount(legal.minRaiseTo)}>Min</button>
            {quick.map((q, i) => (
              <button key={q.key} className="chip-btn" onClick={() => setAmount(q.to)} aria-keyshortcuts={String(i + 1)}>
                {q.label}
              </button>
            ))}
            <button className="chip-btn" onClick={() => setAmount(legal.maxRaiseTo)} aria-keyshortcuts={String(quick.length + 1)}>All-in</button>
            <span className="kbd-hint">↑↓ adjust · Enter confirm · Esc cancel</span>
          </div>
        </div>
      )}
      <div className="action-buttons">
        <button className={`btn btn-fold${hint('fold')}`} disabled={!ok('fold')} onClick={fold} aria-keyshortcuts="F" aria-label="Fold">
          <span>Fold</span>
          <kbd>F</kbd>
        </button>
        <button className={`btn btn-call${hint('call')}${only === 'call' ? ' hint-pulse' : ''}`} disabled={!ok('call')} onClick={callOrCheck} aria-keyshortcuts="C" aria-label={legal.canCheck ? 'Check' : `Call ${fmt(legal.callAmount)}${callAllIn ? ' (all-in)' : ''}`}>
          <span>{legal.canCheck ? 'Check' : <>Call <b className="num">{fmt(legal.callAmount)}</b>{callAllIn && ' (all-in)'}</>}</span>
          <kbd>C</kbd>
        </button>
        {legal.canRaise && (
          <button
            className={`btn btn-raise${hint('raise')}`}
            disabled={!ok('raise')}
            aria-keyshortcuts="R"
            aria-label={allInOnly ? `All-in for ${fmt(legal.maxRaiseTo)}` : raising ? `${sizeWord} ${fmt(clampAmt(amount))}${raiseAllIn ? ' (all-in)' : ''}` : raiseWord}
            onClick={() => (allInOnly ? shove() : raising ? confirmRaise() : setRaising(true))}
          >
            <span>
              {allInOnly ? <>All-in <b className="num">{fmt(legal.maxRaiseTo)}</b></> : raising ? <>{sizeWord} <b className="num">{fmt(clampAmt(amount))}</b>{raiseAllIn && ' (all-in)'}</> : raiseWord + '…'}
            </span>
            <kbd>R</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
