import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from '../state/store';
import { CardDefs } from './cards/PlayingCard';
import { useRoute } from './router';
import { SettingsPanel } from './SettingsPanel';
import { PlayScreen } from './screens/PlayScreen';
import { Home, Welcome } from './screens/Home';
import { LearnScreen } from './screens/LearnScreen';
import { ReferenceScreen } from './screens/Reference';
import { DrillsScreen } from './screens/DrillsScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { AboutScreen } from './screens/About';
import { dueCount } from '../engine/learning/srs';
import { GithubMark, Icon } from './Icon';

const REPO_URL = 'https://github.com/armaanx/p0k3r';

const NAV: { to: string; label: string }[] = [
  { to: '/', label: 'Home' },
  { to: '/learn', label: 'Learn' },
  { to: '/drills', label: 'Drills' },
  { to: '/play', label: 'Play' },
  { to: '/review', label: 'Review' },
  { to: '/progress', label: 'Progress' },
  { to: '/reference', label: 'Reference' },
  { to: '/about', label: 'About' },
];

function Shell() {
  const [route] = useRoute();
  const { progress } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const s = progress.settings;
  const dueNow = dueCount(progress.srs, Date.now());

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.text = String(s.textScale);
    el.dataset.motion = s.reducedMotion === 'on' ? 'reduce' : s.reducedMotion === 'off' ? 'allow' : 'system';
  }, [s.textScale, s.reducedMotion]);

  const path = route.split('?')[0]!;

  // Close the phone menu after navigating, and on Escape.
  useEffect(() => { setNavOpen(false); }, [route]);
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className="app">
      <CardDefs />
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to the main content</a>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="p0k3r home">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5c2.6 3.4 6.5 5.6 6.5 9a3.4 3.4 0 0 1-6 2.2 3.4 3.4 0 0 1-6-2.2c0-3.4 3.9-5.6 5.5-9z" /><path d="M12 14.8l-1.4 5.7h2.8z" /></svg>
          p<b>0</b>k<b>3</b>r
        </a>
        <button className="btn-ghost nav-toggle" onClick={() => setNavOpen((o) => !o)} aria-expanded={navOpen} aria-controls="main-nav">
          <Icon name={navOpen ? 'close' : 'menu'} /> Menu
        </button>
        <nav className={`nav ${navOpen ? 'nav-open' : ''}`} id="main-nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.to} href={`#${n.to}`} aria-current={path === n.to || (n.to !== '/' && path.startsWith(n.to + '/')) ? 'page' : undefined}>{n.label}{n.to === '/drills' && dueNow > 0 && <span className="due-dot" title={`${dueNow} reviews due`} aria-label={`${dueNow} reviews due`}>{dueNow}</span>}</a>
          ))}
        </nav>
        <button className="btn-ghost" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen} aria-haspopup="dialog">
          <Icon name="gear" /> Display
        </button>
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </header>
      <main className="main" id="main" tabIndex={-1}>
        {path === '/play' ? <PlayScreen /> : path.startsWith('/learn') ? <LearnScreen sub={path.slice('/learn'.length)} /> : path === '/reference' ? <ReferenceScreen /> : path === '/drills' ? <DrillsScreen /> : path === '/progress' ? <ProgressScreen /> : path === '/about' ? <AboutScreen /> : path.startsWith('/review') ? <ReviewScreen sub={path.slice('/review'.length)} /> : !progress.firstRunDone && progress.hands.length === 0 && Object.keys(progress.lessons).length === 0 ? <Welcome /> : <Home />}
      </main>
      <footer className="site-footer">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="p0k3r source code on GitHub (opens in a new tab)">
          <GithubMark /> <span>armaanx/p0k3r</span>
        </a>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
