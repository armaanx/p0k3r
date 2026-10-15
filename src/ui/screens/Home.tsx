import { nextLesson, moduleStates, MODULES } from '../../content/curriculum';
import { dueCount } from '../../engine/learning/srs';
import { dailyPlan } from '../../content/progressView';
import { useStore } from '../../state/store';
import { Icon } from '../Icon';

const go = (to: string): void => { window.location.hash = to; };

export function Welcome() {
  const { update } = useStore();
  const start = (to: string): void => {
    update((p) => ({ ...p, firstRunDone: true }));
    go(to);
  };
  return (
    <div className="welcome">
      <div className="welcome-card card-panel">
        <div className="eyebrow">Welcome to p0k3r</div>
        <h1>Learn Texas Hold'em, one small step at a time.</h1>
        <p className="lead">You do not need to know anything. We explain every word the first time it appears, then ask you to try things yourself, because that is how skills stick.</p>
        <ul className="promise">
          <li><b>Play money only.</b> There is nothing to win or lose for real, and nothing is ever sent anywhere: everything stays on this device.</li>
          <li><b>An honest goal.</b> The aim is a solid, disciplined player who beats typical low-stakes games. It will not make you a professional, and nobody can promise that.</li>
          <li><b>Short daily practice.</b> About 15 minutes a day works better than one long session. There are no streak penalties: miss a day and nothing bad happens.</li>
        </ul>
        <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
          <button className="btn-primary big" onClick={() => start('/learn/m0-l1')} autoFocus>Start the first lesson</button>
          <button className="btn-ghost" onClick={() => start('/learn')}>I already know the basics</button>
        </div>
        <p className="faint small">Nothing to sign up for and nothing to configure. You can make the text or the cards bigger, turn sound on, or reduce motion any time under Display.</p>
      </div>
    </div>
  );
}

export function Home() {
  const { progress } = useStore();
  const next = nextLesson(progress);
  const states = moduleStates(progress);
  const open = states.find((s) => s.status === 'open');
  const due = dueCount(progress.srs, Date.now());
  const done = states.filter((s) => s.status === 'mastered').length;
  const streakDays = currentStreak(progress.days);
  return (
    <div className="home">
      <div className="page-head">
        <h1>Welcome back</h1>
        <p className="muted">{done === 0 ? 'Your path is just beginning.' : `${done} of ${MODULES.length} modules mastered.`}</p>
      </div>
      <TodayCard />
      <div className="home-grid">
        <section className="card-panel home-card">
          <h2>Continue learning</h2>
          {next ? (
            <>
              <p><b>Module {next.module}: {next.title}</b></p>
              <p className="muted">{next.goal}</p>
              <button className="btn-ghost" onClick={() => go(`/learn/${next.id}`)}>Start ({next.minutes} min)</button>
            </>
          ) : open ? (
            <>
              <p><b>Module {open.id} test</b></p>
              <p className="muted">All lessons done. Take the mixed test to unlock the next module.</p>
              <button className="btn-ghost" onClick={() => go(`/learn/test/${open.id}`)}>Take the test</button>
            </>
          ) : (
            <p className="muted">You have finished every lesson. Keep sharpening with drills and real hands.</p>
          )}
        </section>
        <section className="card-panel home-card">
          <h2>Play with a coach</h2>
          <p className="muted">Six-player tables with five very different opponents. The coach only speaks about things you have learned.</p>
          <button className="btn-quiet" onClick={() => go('/play')}>Go to the table</button>
        </section>
        <section className="card-panel home-card">
          <h2>Review</h2>
          <p className="muted">{due > 0 ? `${due} spot${due === 1 ? '' : 's'} due for review.` : 'Nothing is due right now. Nice.'}</p>
          <p className="faint small">Days practised: <b className="num">{progress.days.length}</b>{streakDays > 1 ? ` · current run: ${streakDays} days` : ''}</p>
        </section>
      </div>
    </div>
  );
}

/** Consecutive practised days ending today or yesterday. No guilt: a missed day is simply not counted. */
export function currentStreak(days: string[]): number {
  const set = new Set(days);
  const d = new Date();
  const key = (x: Date): string => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (!set.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(key(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** The guided daily loop. It offers; it never nags: no countdowns, no lost-streak messages. */
export function TodayCard() {
  const { progress } = useStore();
  const plan = dailyPlan(progress);
  if (plan.steps.length === 0) return null;
  const nextStep = plan.steps.find((s) => !s.done);
  const total = plan.steps.reduce((a, s) => a + s.minutes, 0);
  return (
    <section className="card-panel today-card" aria-labelledby="today-h">
      <div className="row" style={{ paddingTop: 0 }}>
        <h2 id="today-h" style={{ margin: 0 }}>Today's practice <span className="faint small">about {total} minutes</span></h2>
        <span className="small muted">{plan.done} of {plan.steps.length} done</span>
      </div>
      <ol className="today-steps">
        {plan.steps.map((s, i) => (
          <li key={s.id} className={s.done ? 'today-done' : ''}>
            <span className={`check ${s.done ? 'check-on' : ''}`} aria-label={s.done ? 'done' : 'not done'}>{s.done ? <Icon name="check" size={12} /> : i + 1}</span>
            <div>
              <b>{s.title}</b> <span className="faint small">· {s.minutes} min</span>
              <div className="small muted">{s.detail}</div>
            </div>
            <button className={s.done ? 'btn-ghost' : 'btn-quiet'} onClick={() => go(s.to)}>{s.done ? 'Again' : 'Start'}</button>
          </li>
        ))}
      </ol>
      {nextStep ? (
        <button className="btn-primary" onClick={() => go(nextStep.to)}>Start: {nextStep.title}</button>
      ) : (
        <p style={{ margin: 0 }}><b className="txt-good"><Icon name="check" size={14} /> That is today's practice done.</b> <span className="muted">Anything more is optional.</span></p>
      )}
    </section>
  );
}
