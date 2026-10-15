import { pct } from '../../engine/coach/odds';

/** Equity vs the equity you need: a bar with a marker. Shows "chance" against "price". */
export function EquityMeter({ equity, needed, exact, caption }: { equity: number; needed?: number | null; exact: boolean; caption?: string }) {
  const e = Math.max(0, Math.min(1, equity));
  const ok = needed == null ? null : e >= needed;
  return (
    <figure className="meter" aria-label={`Your share of the pot (equity): about ${pct(e)}${needed != null ? `. You need ${pct(needed)} to break even.` : ''}${caption ? ` ${caption}` : ''}`}>
      <div className="meter-track">
        <div className={`meter-fill ${ok === false ? 'meter-bad' : 'meter-good'}`} style={{ width: `${e * 100}%` }} />
        {needed != null && (
          <div className="meter-mark" style={{ left: `${Math.min(1, needed) * 100}%` }}>
            <span>need {pct(needed)}</span>
          </div>
        )}
      </div>
      <figcaption>
        <span>Your share of the pot (equity)</span>
        <b className="num">{pct(e)}{exact ? '' : ' ≈'}</b>
      </figcaption>
      {caption && <p className="small faint" style={{ margin: '0.2rem 0 0' }}>{caption}</p>}
    </figure>
  );
}

/**
 * Price vs chance: how many chips you risk compared with what you can win.
 * `pot` is everything you can win before your call (only the matched part of a bet when you are all-in for less).
 */
export function PotOddsBar({ toCall, pot, fmt }: { toCall: number; pot: number; fmt: (n: number) => string }) {
  const total = pot + toCall;
  const riskPct = (toCall / total) * 100;
  return (
    <figure className="odds-bar" aria-label={`You risk ${fmt(toCall)} to win ${fmt(pot)}`}>
      <div className="odds-track">
        <div className="odds-risk" style={{ width: `${riskPct}%` }}><span>risk {fmt(toCall)}</span></div>
        <div className="odds-win" style={{ width: `${100 - riskPct}%` }}><span>win {fmt(pot)}</span></div>
      </div>
      <figcaption>The price: you risk {fmt(toCall)} to win {fmt(pot)}.</figcaption>
    </figure>
  );
}
