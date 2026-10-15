import { CONFIDENCE_NAMES, type Calibration } from '../../engine/learning/analytics';
import { Icon } from '../Icon';

/** Confidence versus reality: each row shows how often you were right when you said each level. */
export function CalibrationChart({ cal }: { cal: Calibration }) {
  return (
    <figure className="calib" aria-label="Calibration: how often you are right at each confidence level">
      <div className="calib-rows">
        {cal.buckets.map((b) => (
          <div key={b.confidence} className="calib-row">
            <span className="calib-name">{CONFIDENCE_NAMES[b.confidence]}</span>
            <div className="calib-track" role="img" aria-label={b.acc === null ? 'Not enough answers yet' : `Right ${Math.round(b.acc * 100)}% of the time; a well-calibrated answer here would be right about ${Math.round(b.nominal * 100)}%`}>
              {b.acc !== null && <div className={`calib-fill ${b.acc < b.nominal - 0.1 ? 'calib-over' : 'calib-ok'}`} style={{ width: `${b.acc * 100}%` }} />}
              <div className="calib-nominal" style={{ left: `${b.nominal * 100}%` }} title={`Expected about ${Math.round(b.nominal * 100)}%`} />
            </div>
            <span className="num calib-val">
              {b.acc !== null && (b.acc < b.nominal - 0.1
                ? <span className="txt-warn" title="Overconfident"><Icon name="alert" size={12} /> Over </span>
                : <span className="txt-good" title="Well calibrated"><Icon name="check" size={12} /> OK </span>)}
              {b.acc === null ? '—' : `${Math.round(b.acc * 100)}%`} <span className="faint small">({b.n})</span>
            </span>
          </div>
        ))}
      </div>
      <figcaption className="small muted">The tick marks where a well-calibrated learner would be. A bar that stops short of its tick means overconfidence. {cal.message}</figcaption>
    </figure>
  );
}
