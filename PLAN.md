# p0k3r — PLAN

An offline, play-money Texas Hold'em trainer. Goal (stated honestly in the app): a **solid, disciplined low-stakes player**, not a "pro".

## 1. Architecture

Three layers with one-way dependencies: `ui → learning/content → engine`. The engine never imports React, the DOM, localStorage or anything from `ui`.

```
src/
  engine/            PURE TS. No DOM, no React, no storage. Fully unit-tested.
    cards.ts         Card encoding (0..51), parse/format, deck
    rng.ts           Seedable PRNG (mulberry32 / sfc32), shuffle, fork
    evaluator.ts     7-card evaluator -> comparable integer rank + category
    pots.ts          Side-pot construction and distribution (odd chip rule)
    game.ts          No-Limit Hold'em state machine (pure reducer-style API)
    ranges.ts        Range notation parser ("AKs, 77+, A5s-A2s"), weighted combos, 13x13 grid
    equity.ts        Exact enumeration + Monte Carlo; vs hand and vs weighted range
    outs.ts          Outs counting, dirty-out detection, rule of 2 & 4
    texture.ts       Board texture classifier (dry/wet/paired/monotone...)
    handStrength.ts  Made hand / draw / air categorisation
    preflopCharts.ts 6-max open / vs-raise / 3-bet charts AS DATA
    bots.ts          Archetype bots (nit, station, maniac, TAG, LAG)
    coach/           odds (pot odds, MDF, SPR), opponent range estimate,
                     advice (with confidence tier), grading (EV-lost + verdict)
    learning/        srs.ts (SM-2 variant), mastery.ts, calibration.ts,
                     drills/ (generators per drill type), concepts.ts
  content/           Lessons, glossary, cheat-sheet data, module map (plain data)
  state/             localStorage persistence, export/import, reducers for progress
  workers/           equity.worker.ts (inlined into bundle), client wrapper w/ sync fallback
  ui/                React components, screens, SVG cards/chips, themes, audio
```

**Engine API shape.** `game.ts` exposes `newHand(config, seed) -> HandState`, `legalActions(state)`, `applyAction(state, action) -> HandState` (immutable), `isHandOver`, `settle`. Every applied action is appended to `state.history`, so a hand is fully replayable from `(config, seed, actions[])`. This is the basis for hand review and "replay this spot".

**Single-file build.** `vite-plugin-singlefile` inlines JS + CSS. The worker is imported with `?worker&inline` (Vite inlines it as a Blob/base64 in the bundle); no `type="module"` external fetches. Vite `base: './'`. Because `file://` + module scripts can fail (CORS on module scripts in Chrome), the build output is post-processed if needed to emit a classic script. **M0 verifies this before anything else.** Fonts are embedded as base64 `@font-face`.

## 2. Folder layout (root)

```
PLAN.md README.md package.json tsconfig*.json vite.config.ts index.html
scripts/   verify-file-url.mjs (Playwright: open file://dist/index.html, assert no network, no console errors), screenshots.mjs
src/       (above)
dist/index.html   (build output, single file)
```

## 3. Data models (sketch)

```ts
type Card = number;                       // 0..51 = rank*4 + suit
interface GameConfig { seats: 2|6; sb: number; bb: number; startStack: number; }
interface Player { seat; name; stack; bet; totalCommitted; folded; allIn; hole: [Card,Card]|null; archetype?: Archetype }
interface HandState { config; seed; button; street; board; players; pot; toAct; currentBet; minRaise; history: Action[]; result?: HandResult }
interface Action { seat; type: 'fold'|'check'|'call'|'bet'|'raise'|'allin'; amount?: number }

// Learning
interface ConceptId = string                       // e.g. "pot-odds", "open-range:UTG"
interface SrsItem { id; ease; intervalDays; due: number; reps; lapses; history: {t,correct,confidence?}[] }
interface Progress { version; concepts: Record<ConceptId, SrsItem>; lessons: Record<id, {done, score}>;
   hands: HandRecord[]; drills: DrillAttempt[]; settings; streak; unlocked: ModuleId[] }
interface HandRecord { seed; config; actions; heroSeat; grades: DecisionGrade[]; netChips; evLost; coachCompare?: ... }
interface DecisionGrade { street; verdict: 'great'|'fine'|'inaccuracy'|'mistake'|'blunder'; evLostBB; tier: 'math'|'standard'|'judgment'; why: string; concept: ConceptId }
```

## 4. Curriculum outline (Modules 0–10)

Each lesson = short explanation → active question(s) → worked example → partially-completed example → independent problems → mastery check. Each module ends with an interleaved test. One new concept per lesson.

| M | Topic | Key concepts |
|---|-------|--------------|
| 0 | How a hand flows | blinds, 4 streets, actions, showdown (scripted hand) |
| 1 | Hand rankings | ranks, kickers, board plays, ties |
| 2 | Position | button, seat names, why acting last matters |
| 3 | Preflop | tiers → open ranges by seat → facing a raise |
| 4 | Postflop reading | made/draw/air, board texture |
| 5 | Outs, equity, pot odds | outs, dirty outs, rule of 2/4, price vs chance |
| 6 | Betting | value/protection/bluff, sizing, c-bet, pot control, check-raise |
| 7 | Opponents | tight/loose × passive/aggressive, VPIP/PFR |
| 8 | Intermediate | implied odds, MDF, SPR, semi-bluffs, fold equity, thin value, rivers |
| 9 | Mental game | variance, tilt, bankroll, decisions vs results, review habits |
| 10 | Short stacks and real games | heads-up push or fold (solved Nash charts), rake and the price of a call |

Mastery gate: ≥85% over last 20 mixed items in the module (fewer items → proportionally scaled minimum of 10). "Skip ahead" allowed with warning.

## 5. Coach's brain (honesty rules)

1. **Math (exact):** hand strength, equity, outs, pot odds, break-even equity.
2. **Standard play:** preflop charts (data), cited by name. Heuristics for sizing/c-betting.
3. **Judgment call:** anything postflop where range-estimate + heuristics decide. Labelled as such.
Grading: a **Mistake/Blunder** requires a large EV-loss estimate AND the recommendation being Math or Standard tier. Close spots (EV diff < ~0.5bb or mixed-frequency hands) are "Fine". Never grade *results*, only decisions.

## 6. Milestones & verification gates

| # | Deliverable | Gate |
|---|-------------|------|
| 0 | Scaffold + single-file build | `file://` load in headless Chrome shows the app, worker round-trip works, zero network requests |
| 1 | Engine | `vitest` green; 10k+ bot hands conserve chips; evaluator cross-checked against brute force |
| 2 | Table UI/play loop | Playwright plays hands via keyboard; screenshots inspected |
| 3 | Coach + equity | Known equities match references (e.g. AKs vs QQ ≈ 46/54); worker doesn't block UI |
| 4 | Lessons | Every lesson renders; content lint (all terms in glossary) |
| 5 | Drills + SRS | SRS unit tests; drill generators produce valid, answerable items (fuzzed) |
| 6 | Hand review | Replays reproduce exact results from seed+actions |
| 7 | Progress | Export → reset → import roundtrip |
| 8 | Polish | Reduced-motion honoured; screenshots at laptop/tablet widths |
| 9 | QA | Full E2E, typecheck, lint, README |

## 7. Main risks

- **Correctness of the engine** (side pots, min-raise, odd chips): mitigate with property tests + conservation sim + brute-force evaluator cross-check.
- **`file://` quirks** (module scripts, workers, localStorage): proved in M0, re-proved at M9.
- **Coach credibility:** false "mistake" verdicts destroy trust → conservative thresholds, confidence tiers, "close spot" bucket.
- **Scope:** very large. Content is data-driven so lessons/drills can be extended without UI work; engine is built first and fully tested.
- **Bundle size / worker inlining:** keep deps minimal (React only; CSS animations rather than an animation library).
- **Fonts offline:** need font files on disk to base64-embed; no network at runtime, but build-time fetch may be needed (fallback: carefully chosen system serif stack + any locally available OFL fonts).

## 8. Assumptions (made without asking)

- The brief's last line was cut off ("drops the learner into Module 0 within…"). Assumed: **within ~60 seconds, max 2 screens of onboarding.**
- Working title is **p0k3r**.
- Blinds default 50/100 chips with 10,000 stacks (= 100bb). Chips are integers; EV reported in bb.
- 6-max is the primary learning format; heads-up is supported by the engine and selectable in Play.
- Bots use the same public engine API and only see information a human could see.
- No animation library: CSS transitions / Web Animations API (nothing to load, honours reduced-motion).
- State is one localStorage key (`p0k3r.v1`) with a schema `version` for migration; in-memory fallback if storage is unavailable.
- Preflop charts are solid, widely-published 100bb 6-max "cash game" style ranges, simplified to pure actions (no mixed strategies) for teaching; borderline hands are flagged `mixed` so grading stays generous.


## 9. Status at delivery (M0–M9 complete)

All milestones passed their gates; see README.md for how each was verified. Where the build departs from the plan above:

- **Layout:** `engine/learning/` holds `types, drills, srs, analytics, elaboration, review` (no separate `mastery.ts`/`calibration.ts`; mastery lives in `content/curriculum.ts`, calibration in `analytics.ts`). Progress is a single `Progress` object in `state/` rather than the sketch in section 3.
- **Mastery gate:** changed from "≥85% of the last 20 items" to a **20-item interleaved module test, pass at 17/20 (85%)**. "Skip ahead" still exists, with a warning.
- **Grading thresholds (EV lost, in big blinds):** Math tier → mistake ≥ 1, blunder ≥ 3. Standard tier → mistake ≥ 0.8, blunder ≥ 2. Judgment tier → never worse than "inaccuracy", except that a clear pot-odds error is regraded on the Math scale. A play is "Fine" if it is the recommended action class or counted as acceptable (within tolerance, a chart-border neighbour's action, or a call the price clearly justifies). The full rules are in README "How the coach reaches its advice".
- **Preflop scores:** outside all-in spots, preflop "EV" is a chart score (0.08bb per equity point from the chart cutoff, scaled with the pot), shown as "Chart score", not a true EV. Facing an all-in, the coach uses real pot odds.
- **Router:** hash router (`#/path`) so everything works from `file://`. Routes: `/, /learn, /drills, /play, /review, /progress, /reference, /about`.
- **Fonts:** Instrument Serif (headings, big numerals), Hanken Grotesk (interface), JetBrains Mono (numbers, small labels) from Fontsource (devDependencies), inlined as base64 at build time. No build-time network fetch needed beyond `npm install`.
- **TypeScript:** `strict` on; `noUncheckedIndexedAccess` off (too noisy in hot evaluator/equity loops).
- **Lint:** no ESLint is configured; `tsc --noEmit` (strict) plus the content-lint tests stand in for it.
- **`?debug` URL flag** exposes `window.__p0k3r` test hooks used only by the robot E2E scripts.
- **Known audit note:** `npm audit` reports 3 high findings via `braces` (a dependency of `vite-plugin-singlefile`). It is build-time only and is not shipped in `dist/index.html`.
- **Visual design ("Graphite & Grain"):** single dark theme; the light study theme and the four-colour deck were retired (old saved settings are ignored). Tokens live in `:root` in `src/ui/styles.css`; `src/ui/contrast.test.ts` checks the exact palette, WCAG contrast and that no file uses a colour outside the palette; `scripts/checks/m8.mjs` checks every screen for shadows, glow, gradients and more than one inverted element. Poker action buttons are deliberately all outlined (no inverted "Raise" that would nudge the learner).
