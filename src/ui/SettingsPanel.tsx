import { useStore } from '../state/store';
import { Icon } from './Icon';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { progress, setSettings } = useStore();
  const s = progress.settings;
  return (
    <div className="card-panel settings-pop" role="dialog" aria-label="Display settings">
      <div className="row" style={{ paddingTop: 0 }}>
        <h3 className="panel-title" style={{ margin: 0 }}>Display &amp; accessibility</h3>
        <button className="btn-ghost" onClick={onClose} aria-label="Close settings"><Icon name="close" /></button>
      </div>
      <div className="row">
        <span>Text size</span>
        <span className="seg" role="group" aria-label="Text size">
          {([100, 115, 130] as const).map((t) => (
            <button key={t} aria-pressed={s.textScale === t} onClick={() => setSettings({ textScale: t })}>{t === 100 ? 'A' : t === 115 ? 'A+' : 'A++'}</button>
          ))}
        </span>
      </div>
      <label className="row switch">
        <span>Large cards</span>
        <input type="checkbox" checked={s.largeCards} onChange={(e) => setSettings({ largeCards: e.target.checked })} />
      </label>
      <label className="row switch">
        <span>Sound effects (off by default)</span>
        <input type="checkbox" checked={s.sound} onChange={(e) => setSettings({ sound: e.target.checked })} />
      </label>
      <div className="row">
        <span>Motion</span>
        <span className="seg" role="group" aria-label="Motion">
          <button aria-pressed={s.reducedMotion === 'system'} onClick={() => setSettings({ reducedMotion: 'system' })}>System</button>
          <button aria-pressed={s.reducedMotion === 'on'} onClick={() => setSettings({ reducedMotion: 'on' })}>Reduce</button>
          <button aria-pressed={s.reducedMotion === 'off'} onClick={() => setSettings({ reducedMotion: 'off' })}>Full</button>
        </span>
      </div>
      <p className="small muted" style={{ margin: '0.6rem 0 0' }}>Export, import or reset your progress on the <a href="#/progress" onClick={onClose}>Progress page</a>.</p>
    </div>
  );
}
