import { STORAGE_KEY } from '../../state/storage';

/** Plain-spoken "what this is and isn't" page. Keep claims modest: this is a teaching tool, not a guarantee. */
export function AboutScreen() {
  return (
    <div className="about">
      <div className="page-head">
        <h1>About p0k3r</h1>
        <p className="muted">What this app is, what it isn't, and where to go next.</p>
      </div>

      <section className="card-panel rich" aria-labelledby="about-goal">
        <h2 id="about-goal">The honest goal</h2>
        <p>
          p0k3r aims to make you a <b>solid, disciplined low-stakes player</b>: someone who knows the rules cold, folds the hands that should be folded, understands pot odds and position, and
          can tell a good decision from a lucky result.
        </p>
        <p>
          It does <b>not</b> turn anyone into a professional. Nothing here can promise winnings, and poker has a lot of luck in the short run. Reaching a professional level takes thousands of hours of study and play
          well beyond what a free offline app can give you.
        </p>
      </section>

      <section className="card-panel rich" aria-labelledby="about-coach">
        <h2 id="about-coach">How much to trust the coach</h2>
        <p>
          The coach is <b>not a solver</b>. Preflop advice comes from fixed, standard charts; the numbers it shows there are rough chart scores, not true expected values, except when you face an
          all-in, where it does the real pot-odds sum. After the flop it estimates the hands your opponents likely hold from what they did, works out your winning chance against them (exactly when that is quick,
          otherwise with a simulation), and compares simple expected-value estimates for folding, checking or calling, and betting or raising at one sensible size. That's good for learning fundamentals and
          catching clear errors. It's not solver-level, and it will sometimes differ from what a solver prefers.
        </p>
        <p>Every piece of advice carries a confidence label so you know how firmly to take it:</p>
        <ul>
          <li><b>Math (exact)</b> — the arithmetic is exact (the price of a call against your winning chance), and the answer stays the same when the coach checks it against a wider and a tighter guess of the opponent's hands. The winning chance itself is still an estimate.</li>
          <li><b>Standard play</b> — what mainstream beginner-to-intermediate strategy recommends: the preflop charts, betting a very strong hand, and checking when you have nothing.</li>
          <li><b>Judgment call (reasonable players differ)</b> — the answer depends on guesses about the opponent: bet sizes, bluffs, raising instead of calling, slow-plays, short-stack all-ins. The coach never grades these worse than an inaccuracy, unless the choice also folds a clearly profitable call or makes a clearly losing one.</li>
        </ul>
        <p>
          Grading is deliberately generous. A play is only called a mistake when it is clearly worse by the coach's own numbers, and the grade is about your <i>decision</i>, never about how the cards fell.
        </p>
        <p>
          The practice opponents are simple, consistent bots with distinct styles (tight, loose, aggressive and so on). Real people are messier, so expect real games to be different.
        </p>
      </section>

      <section className="card-panel rich" aria-labelledby="about-next">
        <h2 id="about-next">What to study after this</h2>
        <ul>
          <li>Play real low-stakes games (or free online play-money tables) and keep reviewing your own hands, as you do in the Review tab.</li>
          <li>Read a well-regarded strategy book for beginners and intermediates. Pick one that suits you and work through it slowly.</li>
          <li>Try a solver or trainer app to study specific spots. Solvers are good at showing <i>why</i> a line is close and how mixed strategies work.</li>
          <li>Practise bankroll management: play stakes where a bad run won't hurt. This matters as much as strategy.</li>
          <li>Keep a hand-history habit: note the hands you weren't sure about and look them up later.</li>
        </ul>
        <p className="muted small">This is a suggestion list, not a promise. Any results depend on you, your opponents and luck.</p>
      </section>

      <section className="card-panel rich" aria-labelledby="about-learn">
        <h2 id="about-learn">How the learning works</h2>
        <ul>
          <li>Short lessons, each introducing a few ideas, followed by questions. You answer before you see the explanation.</li>
          <li>Spaced review: things you miss come back soon; things you know come back later.</li>
          <li>Mixed practice: drills interleave topics instead of repeating one at a time.</li>
          <li>Confidence ratings, so you can see whether your confidence matches your accuracy.</li>
          <li>Topics unlock as you go, and a module test (17 of 20 right) opens the next module. You can skip ahead, with a warning.</li>
          <li>No streaks and no guilt. Come back whenever you like.</li>
        </ul>
      </section>

      <section className="card-panel rich" aria-labelledby="about-data">
        <h2 id="about-data">Play money, offline, and your data</h2>
        <ul>
          <li>Everything is play money. There is no real-money play, no accounts, no network access and no analytics.</li>
          <li>Progress is stored only in this browser (localStorage, key <code>{STORAGE_KEY}</code>). Clearing site data clears it. Use <b>Progress → Your data</b> to export a backup file, import one, or reset.</li>
          <li>If your browser blocks storage, the app still works for the session but won't remember anything afterwards.</li>
        </ul>
      </section>

      <section className="card-panel rich" aria-labelledby="about-credits">
        <h2 id="about-credits">Credits</h2>
        <p>
          Fonts are embedded in the app and used under the SIL Open Font License 1.1: Instrument Serif, Hanken Grotesk and JetBrains Mono (via Fontsource). Cards, chips and avatars are drawn with SVG and CSS, and sounds are
          synthesised on the fly, so there are no image or audio files.
        </p>
      </section>
    </div>
  );
}
