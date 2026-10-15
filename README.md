# p0k3r

An offline, play-money Texas Hold'em trainer for complete beginners. It teaches with short lessons, retrieval practice, spaced review, mixed drills, play against bots with a coach, and hand review.

**Honest goal:** a solid, disciplined low-stakes player. It does not make anyone a professional and promises no winnings. The in-app **About** page says the same.

The whole app is a single file, `dist/index.html`. Double-click it: no server, no network, no accounts, no analytics.

## Run, test, build

Requires Node 22+ and npm.

```bash
npm install
npm run dev          # Vite dev server with hot reload
npm test             # Vitest (engine, coach, learning, content lint, state)
npm run typecheck    # tsc --noEmit (strict)
npm run build        # typecheck + production build -> dist/index.html (single file)
npm run verify:file  # opens dist/index.html via file:// in headless Chrome and checks it
```

`npm run build` must run before `verify:file` (it tests the built file). `verify:file` needs Chrome or Chromium (it looks in `/usr/bin`, or set `CHROME_PATH`). It asserts the app renders from `file://`, a hand can be dealt, localStorage persists, there are **no network requests** and **no console errors**.

Extra end-to-end checks per area (each takes the same path):

```bash
EXTRA_CHECKS=scripts/checks/m4.mjs node scripts/verify-file-url.mjs   # a robot completes all 33 lessons
```

`m3`…`m10` cover the coach, lessons, drills/SRS, review, progress/data, polish (fonts, themes, sound, reduced motion, tablet widths) and the About/accessibility checks; `m10` checks phones and tablets (touch emulation, portrait and landscape: no sideways scrolling, 40 px touch targets, menu, table and seats on screen, raise and cancel by touch, glossary by tap).

Debug: add `?debug` to the URL to expose `window.__p0k3r` test hooks (used only by the robot scripts).

## What's inside

- **Learn:** 33 short lessons in 10 modules (how a hand flows → hand rankings → position → preflop → reading the flop → outs and pot odds → betting → opponents → intermediate ideas → the mental game). Each lesson: short explanation → a question before the answer → worked example → partly completed example → independent problems → mastery check. Only concepts you've been taught appear in the coach and reference (progressive disclosure).
- **Gating:** a module opens after you pass a 20-question interleaved module test (17/20, 85%). You can skip ahead, with a warning.
- **Drills:** 16 generated drill types (hand categories, best five, outs, pot odds, equity guesses, opening ranges, facing a raise, board texture, bet sizing, player types, MDF, SPR…), mixed and interleaved, weighted towards your weak and due items. Optional confidence rating and a calibration chart. Occasional "why?" self-explanation prompts.
- **Spaced review:** SM-2 with Leitner boxes. A just-missed item can come back straight away; repeats within six hours don't inflate intervals.
- **Play:** 6-max or heads-up no-limit hold'em against five bot styles (nit, calling station, maniac, TAG, LAG). Keyboard: **F** fold, **C** call/check, **R** raise/bet, **A** all-in, **N** next hand. Chips or big-blind display, 40/100/200bb stacks.
- **Coach:** Off / Hints / Full. In Hints you're nudged to think before any advice shows. It fades automatically as you master a concept (and you can always override).
- **Review:** replay any hand street by street. Each of your decisions gets a verdict (Great / Fine / Inaccuracy / Mistake / Blunder) with estimated EV lost, kept separate from the result ("good decision, bad luck"). "Replay this spot" lets you try another action and regrades it.
- **Progress:** what to do next, mastery map, mistake trend, EV lost per 100 hands, named leaks linked to lessons, review forecast. A gentle daily loop (~15 minutes: warm-up review, play 5 hands, review 1 hand, learn 1 idea). No guilt-based streaks.
- **Data:** everything lives in one localStorage key (`p0k3r.v1`). Export/Import JSON and Reset (with confirmation) are under Progress → Your data. If storage is blocked, the app falls back to memory.
- **Display:** the "Graphite & Grain" design: a dark, monochrome interface on grainy paper, where colour only ever means state (sage = good, amber = caution or close call, coral = error), always paired with an icon and a word. Classic two-colour cards. Settings: large cards, text scale, reduced motion (also follows the OS setting), optional synthesised sound (off by default).

## Architecture

Dependencies only point one way: `ui → content/state → engine`. The engine never touches React, the DOM or storage.

```
src/
  engine/       pure TypeScript, unit-tested
    cards, rng (seedable), evaluator (7-card), pots (side pots, odd chip), game (NLHE state machine)
    ranges, equity (exact + Monte Carlo), outs, texture, handStrength, preflopCharts (as data), bots, session
    coach/      odds, oppRange, advice, grade
    learning/   drills (16 generators), srs, analytics, elaboration, review
  content/      lessons (a/b/c), glossary, curriculum/gating, module tests, practice builder, progress view
  state/        Progress types, localStorage (with fallback), store, actions, export/import
  workers/      equity.worker (inlined into the bundle), client with synchronous fallback
  ui/           React screens, SVG cards/chips/avatars, table, coach panel, themes, audio
```

Key design points:

- **Replayable hands.** `game.ts` is immutable and reducer-like; a hand is fully reproduced from `(config, seed, actions[])`. Review and "replay this spot" rely on this. The RNG is seedable (so simulations and tests are deterministic).
- **Single file.** `vite-plugin-singlefile` inlines JS and CSS; the equity worker is imported with `?worker&inline`; fonts are inlined as base64 `@font-face` from Fontsource packages (SIL OFL). Hash routing (`#/learn`) is used because it works from `file://`. Bundle ≈ 0.8 MB (≈ 0.33 MB gzipped).
- **Off the main thread.** Equity and advice run in a Web Worker; if a worker can't start, the client falls back to running synchronously. During a 1.2 s coach job the main thread stayed responsive (measured longest gap ≈ 10 ms).
- **Content is data.** Lessons, glossary and drill specs are plain data, with lint tests (every glossary reference exists; no jargon before its lesson; no walls of text; every lesson ends with a mastery check; drills are valid and answerable).

## How the coach reaches its advice

The coach compares three action classes: fold, passive (check/call) and aggressive (bet/raise/all-in). Folding is worth 0.

1. **Opponent range:** `oppRange` starts from each opponent's preflop action and seat (open, call, 3-bet, limp, all-in by stack depth, from the chart data), then keeps only the stronger part of the range for each postflop street, using their most aggressive action on it: a call keeps the top 72%, a bet about 35–62% (less for bigger bets and all-ins), a raise about 30%.
2. **Equity:** `equity` computes your winning chance against those ranges: exact enumeration when the work is small enough, otherwise a seeded Monte Carlo simulation.
3. **Preflop, chart spots** (first in, big blind option, facing an open, a 3-bet or a 4-bet): the recommendation is the chart action. The numbers are a rough **chart score, not a true EV**: 0.08bb per point of equity-vs-a-random-hand above (or below) the weakest hands in the chart's range, scaled gently with the pot, and shaped so the chart action scores best. The tolerance is 0.15bb, and hands on a chart border also accept the action a neighbouring hand gets. With 12bb or less the coach uses a push/fold rule of thumb instead.
4. **Preflop, facing an all-in** (or a raise of 40% or more of the raiser's stack, or a call costing 40% or more of yours): a **true EV** pot-odds decision. EV(call) = equity × (winnable pot + call) − call, where the winnable pot is "Y" in "risk X to win Y": everything in the pot you can actually win, including their bet, before your call (if you are all-in for less, the unmatched part of their bet is excluded).
5. **Postflop EV** (in chips, using the winnable pot):
   - Call: R × equity × (winnable pot + call) − call. Check: R × equity × pot. R = 0.92 when you are out of position and more betting can follow, otherwise 1 (a heads-up river call ends the betting, so it uses 1).
   - Aggressive: **one size** is evaluated. Betting uses about ⅓ pot on dry boards, ½ on medium, 0.7 on wet (river: about ⅔ with strong hands, ½ otherwise; a monster on a dry flop or turn: ½). Raising uses 3× the bet, capped at a pot-sized raise. If that is 65% or more of the most you can usefully put in (the effective stack), or what is left is at most 1.2× the pot, the size becomes all-in. Each opponent is assumed to defend at the minimum defence frequency, pot ÷ (pot + your bet), with the strongest part of their range, and to fold otherwise; your equity when called is computed against that stronger part. If you choose a different size, your size is evaluated the same way.
6. **Outs:** the coach counts only cards that make a straight or better (a flush, a straight, a full house), never pair cards that may still lose, and says what they make ("9 outs to a flush"). Outs that could also give an opponent a better hand are marked risky; when some (not all) are risky it also shows the chance counting only the clean ones. On the flop the coach shows the Rule of 4, adjusted (subtract outs − 8 above 8 outs), and the exact chance by the river; when a flop bet pays only for the turn, it also shows the Rule of 2 and the exact turn-card chance. On the turn it shows the Rule of 2 and the exact river chance.
7. **Recommendation and tolerance:** the highest-EV class is recommended, except that a bet or raise that beats the best check/call/fold by less than 0.25bb is not recommended over it (against MDF defenders a zero-equity bluff is worth exactly as much as folding). Options within the tolerance are also acceptable (the spot is marked close if more than one is). Tolerance: max(0.5bb, 6% of the pot) for Math-tier spots, max(1.5bb, 15% of the pot) for other postflop spots, 0.15bb for preflop chart spots, max(0.5bb, 6% of the winnable pot) facing an all-in preflop. Postflop, a fold is never acceptable when the call is +EV robustly (see Math) or by more than 3bb, and a call is never acceptable when it is −EV in the same way.
8. **Confidence tier:**
   - *Math (exact)*: postflop, facing a bet, when fold or call is recommended and the call's EV has the same sign against a wider range (their unnarrowed preflop range) and a tighter one (the top 55% of the estimate), and is bigger than the Math tolerance. Preflop facing an all-in, the same test with a tighter and a wider shoving range.
   - *Standard play*: preflop chart spots; postflop, betting or raising with 80% equity or more, or checking air with no draw.
   - *Judgment call (reasonable players differ)*: everything else, including push/fold with a short stack, facing an open with no chart for the seats, close all-in calls, bet sizing, and flat-calling or slow-playing instead of raising. In a Math spot, a postflop bet or raise you choose is graded as a Judgment call (raise-versus-call depends on the fold model), and so is a size that loses clearly more than the coach's size when betting or raising was right.
9. **Grading (EV lost in bb):** an acceptable choice is "Great" if it is the recommended class with no sizing problem, loses at most 0.1bb, the recommended class beats every other class by at least 1bb, and the spot is not a Judgment call; otherwise "Fine". Other choices are graded by tier: Math: mistake ≥ 1, blunder ≥ 3. Standard: mistake ≥ 0.8, blunder ≥ 2. Below that: inaccuracy. Judgment: never worse than an inaccuracy. The one override: folding a robustly +EV call, or making a robustly −EV one, is graded on the Math scale whatever the tier. Results are never graded, only decisions.

## Verification performed

- `npm test`: 636 tests across 23 files: exhaustive 5-card hand frequency check plus a naive-evaluator cross-check, side pots and odd chips, min-raise/incomplete-raise rules, a 12,000-hand bot simulation (chip conservation), a 20,000-hand fuzz run, equity against known values (e.g. AKs vs QQ ≈ 46/54), outs, charts, coach advice fuzzing on 150 bot hands, SRS, analytics, content lint, storage/export/import, WCAG contrast of the palette, and a scan that no UI file uses a colour outside the palette.
- `scripts/checks/m3…m10`, run against `dist/index.html` over `file://` in headless Chrome: the coach flow, all 33 lessons played by a robot, drills/SRS/calibration, review, progress/data roundtrip, fonts loaded, the design rules on every screen (no shadows, glow or gradients; at most one inverted element), sound off by default, reduced motion, no horizontal overflow at tablet width (820 px) on every screen, skip link, accessible names on every route, visible focus, zero network requests and zero console errors.
- A Firefox file:// smoke test (via Playwright's Firefox): app loads, a hand deals, keyboard play, all main routes open, no errors or network requests.
- Screenshots at desktop (1360 px), tablet (820 px) and large-cards mode were inspected by eye.

## Known limitations

- **Not a solver.** Postflop advice is a transparent heuristic (range estimate + equity + a simple EV model with one bet size and an MDF-based opponent). It ignores mixed strategies, blockers, detailed future-street planning and multiway subtleties beyond basic adjustments. Preflop charts are simplified to pure actions for teaching, and outside all-in spots the preflop numbers are chart scores, not true EVs, so preflop "EV lost" is only a rough guide.
- **Bots are simple.** Five fixed styles with some randomness. Real opponents bluff, adapt and are inconsistent in ways these aren't.
- **Scope of game:** no-limit cash-game hold'em only, 2 or 6 players, no antes, no tournaments, no rake, no straddles. Default stacks 100bb (40bb and 200bb selectable).
- **Variance:** short-term results are luck-heavy; "EV lost" is an estimate from the coach's own model, not ground truth.
- **Browser coverage:** tested in headless Chrome and Firefox on Linux. Safari, mobile browsers and screen readers were not tested. The layout targets laptop and tablet widths; phones are not a design target.
- **Audio** is synthesised with WebAudio and off by default; some browsers need a click before it can play.
- **Storage:** data is per browser profile and per file location. Opening the file from a different path can use a different localStorage area, so export a backup before moving things.
- **Dependency audit:** `npm audit` reports 3 high findings via `braces` through `vite-plugin-singlefile`. It is build-time only and isn't part of the shipped file.
- **No ESLint** is configured; strict TypeScript and the content-lint tests are the guardrails.
- `dist/` is git-ignored, so run `npm run build` to regenerate `dist/index.html`.

## Licences

Fonts (Instrument Serif, Hanken Grotesk, JetBrains Mono) are SIL Open Font License 1.1, embedded in the build. All cards, chips and avatars are SVG/CSS drawn in code.
