import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/fonts.css';
import './ui/styles.css';
import { getCoach } from './workers/client';
import { bestFive } from './engine/evaluator';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Diagnostics hook for automated checks only (add ?debug to the URL).
if (window.location.search.includes('debug')) {
  (window as unknown as { __p0k3r: unknown }).__p0k3r = {
    coach: getCoach(),
    bestPicks: (it: { input: { pool: number[] } }) => bestFive(it.input.pool).cards.map((c) => it.input.pool.indexOf(c)),
  };
}
