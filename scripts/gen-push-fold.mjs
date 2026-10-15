// Heads-up push/fold Nash equilibrium (chip EV, no ante), computed offline.
//
// The game: both players have S big blinds (the effective stack, before blinds). The small blind (the button) may only
// move all-in or fold; facing an all-in, the big blind may only call or fold.
//
//  1. Equity table: for every pair of the 169 starting-hand classes, the exact number of card-disjoint combo pairs
//     and the all-in equity (ties count half), by Monte Carlo over every combo pair and random boards.
//     Cached in scripts/data/hu-preflop-equity.json (delete it to recompute). Runs on all CPU cores.
//  2. For each stack size, solve the game with CFR+ (regret matching+, linear averaging), round to a pure chart,
//     and measure how exploitable the rounded chart is (best response gains, in big blinds per hand).
//  3. Write src/engine/pushFoldData.ts: the charts, the EV of each hand's decision against the other chart, and the
//     measured exploitability.
//
// Usage: node scripts/gen-push-fold.mjs [--samples=N]
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const EQ_FILE = 'scripts/data/hu-preflop-equity.json';
const SAMPLES = Number(arg('samples', 120000));

async function engine() {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', root: process.cwd() });
  const mods = {
    ranges: await server.ssrLoadModule('/src/engine/ranges.ts'),
    evaluator: await server.ssrLoadModule('/src/engine/evaluator.ts'),
    rng: await server.ssrLoadModule('/src/engine/rng.ts'),
  };
  return { ...mods, close: () => server.close() };
}

/** Compatible combo pairs of two classes. */
function pairsOf(labelCombos, a, b) {
  const out = [];
  for (const x of labelCombos(a)) for (const y of labelCombos(b)) if (x[0] !== y[0] && x[0] !== y[1] && x[1] !== y[0] && x[1] !== y[1]) out.push([x, y]);
  return out;
}

// ---------------------------------------------------------------------------
// Shard worker: equities for the pairs (i, j), i < j, with i % of === shard.
// ---------------------------------------------------------------------------
if (arg('shard', null) !== null) {
  const shard = Number(arg('shard')), of = Number(arg('of')), out = arg('out');
  const { ranges, evaluator, rng: R, close } = await engine();
  const { ALL_LABELS, labelCombos } = ranges;
  const { evaluate } = evaluator;
  const rng = R.createRng(9000 + shard);
  const res = [];
  const h = [0, 0, 0, 0, 0, 0, 0];
  const v = [0, 0, 0, 0, 0, 0, 0];
  for (let i = shard; i < 169; i += of) {
    for (let j = i + 1; j < 169; j++) {
      const L = pairsOf(labelCombos, ALL_LABELS[i], ALL_LABELS[j]);
      let score = 0;
      const per = Math.ceil(SAMPLES / L.length);
      for (const [x, y] of L) {
        const deck = [];
        for (let c = 0; c < 52; c++) if (c !== x[0] && c !== x[1] && c !== y[0] && c !== y[1]) deck.push(c);
        h[0] = x[0]; h[1] = x[1]; v[0] = y[0]; v[1] = y[1];
        for (let s = 0; s < per; s++) {
          for (let k = 0; k < 5; k++) {
            const r = k + rng.int(48 - k);
            const t = deck[k]; deck[k] = deck[r]; deck[r] = t;
            h[k + 2] = deck[k]; v[k + 2] = deck[k];
          }
          const a = evaluate(h), b = evaluate(v);
          score += a > b ? 1 : a === b ? 0.5 : 0;
        }
      }
      res.push([i, j, L.length, score / (per * L.length)]);
    }
  }
  writeFileSync(out, JSON.stringify(res));
  await close();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const { ranges, close } = await engine();
const { ALL_LABELS, labelCombos, comboCount } = ranges;
const N = 169;

if (!existsSync(EQ_FILE)) {
  const of = Math.max(1, availableParallelism() - 1);
  const tmp = 'scripts/data/.eq-shards';
  mkdirSync(tmp, { recursive: true });
  console.log(`Equity table: ${SAMPLES} samples per class pair on ${of} processes...`);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: of }, (_, k) => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['scripts/gen-push-fold.mjs', `--shard=${k}`, `--of=${of}`, `--out=${tmp}/${k}.json`, `--samples=${SAMPLES}`], { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`shard ${k} exited ${code}`))));
  })));
  const W = Array.from({ length: N }, () => new Array(N).fill(0));
  const E = Array.from({ length: N }, () => new Array(N).fill(0.5));
  for (let k = 0; k < of; k++) {
    for (const [i, j, w, e] of JSON.parse(readFileSync(`${tmp}/${k}.json`, 'utf8'))) {
      W[i][j] = W[j][i] = w;
      E[i][j] = e;
      E[j][i] = 1 - e;
    }
  }
  for (let i = 0; i < N; i++) W[i][i] = pairsOf(labelCombos, ALL_LABELS[i], ALL_LABELS[i]).length;
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(EQ_FILE, JSON.stringify({
    note: 'Heads-up preflop all-in equity between the 169 hand classes. w[i][j] = card-disjoint combo pairs (exact); eq[i][j] = equity of class i against class j, ties count half (Monte Carlo). Generated by scripts/gen-push-fold.mjs.',
    samplesPerPair: SAMPLES, labels: ALL_LABELS, w: W, eq: E.map((r) => r.map((x) => Math.round(x * 1e5) / 1e5)),
  }));
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const { w: W, eq: E, labels } = JSON.parse(readFileSync(EQ_FILE, 'utf8'));
if (labels.join() !== ALL_LABELS.join()) throw new Error('label order changed: delete the equity file and rerun');

// ---- The push/fold game ----
// Values for the small blind, in big blinds, relative to its stack before the hand. SB fold: -0.5.
// Shove, BB folds: +1. Shove, BB calls: S * (2E - 1). Zero-sum: the big blind's value is the negative.
function sbValues(S, c) {
  const shove = new Float64Array(N), fold = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let a = 0, t = 0;
    for (let j = 0; j < N; j++) {
      const w = W[i][j];
      if (!w) continue;
      a += w * ((1 - c[j]) + c[j] * S * (2 * E[i][j] - 1));
      t += w;
    }
    shove[i] = a; fold[i] = -0.5 * t;
  }
  return { shove, fold };
}
function bbValues(S, s) {
  const call = new Float64Array(N), fold = new Float64Array(N), reach = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    let a = 0, r = 0;
    for (let i = 0; i < N; i++) {
      const w = W[i][j] * s[i];
      if (!w) continue;
      a += w * S * (1 - 2 * E[i][j]);
      r += w;
    }
    call[j] = a; fold[j] = -r; reach[j] = r;
  }
  return { call, fold, reach };
}
const TOTAL = 1326 * 1225;

/** Best-response gains for both players against (s, c), in big blinds per hand: 0 at an exact equilibrium. */
function exploitability(S, s, c) {
  const sb = sbValues(S, c);
  const bb = bbValues(S, s);
  let value = 0, brSb = 0, brBb = 0;
  for (let i = 0; i < N; i++) {
    value += s[i] * sb.shove[i] + (1 - s[i]) * sb.fold[i];
    brSb += Math.max(sb.shove[i], sb.fold[i]);
  }
  // SB's value when the BB best-responds: folds by the SB, plus each BB hand's worst case for the SB.
  let sbFolds = 0;
  for (let i = 0; i < N; i++) sbFolds += (1 - s[i]) * sb.fold[i];
  for (let j = 0; j < N; j++) {
    // Against a shove, the BB's value for hand j is max(call, fold); the SB's is the negative.
    // The SB's shove value when BB folds hand j: +1 per combo pair that reached.
    brBb += -Math.max(bb.call[j], bb.fold[j]);
  }
  const minSb = sbFolds + brBb;
  return { value: value / TOTAL, gainSb: (brSb - value) / TOTAL, gainBb: (value - minSb) / TOTAL, total: (brSb - minSb) / TOTAL };
}

function solve(S, iters = 4000) {
  const rs = Array.from({ length: N }, () => [0, 0]); // [shove, fold]
  const rb = Array.from({ length: N }, () => [0, 0]); // [call, fold]
  const avgS = new Float64Array(N), avgC = new Float64Array(N);
  let wsum = 0;
  const strat = (r) => { const a = Math.max(r[0], 0), b = Math.max(r[1], 0); return a + b > 0 ? a / (a + b) : 0.5; };
  const s = new Float64Array(N), c = new Float64Array(N);
  for (let t = 1; t <= iters; t++) {
    for (let i = 0; i < N; i++) s[i] = strat(rs[i]);
    for (let j = 0; j < N; j++) c[j] = strat(rb[j]);
    // Alternating updates: SB first, then BB against the SB's new strategy.
    const sb = sbValues(S, c);
    for (let i = 0; i < N; i++) {
      const v = s[i] * sb.shove[i] + (1 - s[i]) * sb.fold[i];
      rs[i][0] = Math.max(0, rs[i][0] + sb.shove[i] - v);
      rs[i][1] = Math.max(0, rs[i][1] + sb.fold[i] - v);
      s[i] = strat(rs[i]);
    }
    const bb = bbValues(S, s);
    for (let j = 0; j < N; j++) {
      const v = c[j] * bb.call[j] + (1 - c[j]) * bb.fold[j];
      rb[j][0] = Math.max(0, rb[j][0] + bb.call[j] - v);
      rb[j][1] = Math.max(0, rb[j][1] + bb.fold[j] - v);
      c[j] = strat(rb[j]);
    }
    const wt = t; // linear averaging (CFR+)
    for (let i = 0; i < N; i++) { avgS[i] += wt * s[i]; avgC[i] += wt * c[i]; }
    wsum += wt;
  }
  for (let i = 0; i < N; i++) { avgS[i] /= wsum; avgC[i] /= wsum; }
  return { s: avgS, c: avgC };
}

const DEPTHS = [];
for (let d = 1.5; d <= 20.0001; d += 0.5) DEPTHS.push(Math.round(d * 10) / 10);

const shoveMasks = [], callMasks = [], shoveEv = [], callEv = [], expl = [], mixedEx = [], mixedCounts = [];
const hex = (bits) => {
  let out = '';
  for (let k = 0; k < bits.length; k += 4) out += ((bits[k] ?? 0) | ((bits[k + 1] ?? 0) << 1) | ((bits[k + 2] ?? 0) << 2) | ((bits[k + 3] ?? 0) << 3)).toString(16);
  return out;
};
const pctOf = (bits) => (100 * bits.reduce((a, b, i) => a + b * comboCount(ALL_LABELS[i]), 0)) / 1326;

for (const S of DEPTHS) {
  const { s, c } = solve(S);
  const mixed = exploitability(S, s, c);
  const ps = Array.from(s, (x) => (x >= 0.5 ? 1 : 0));
  const pc = Array.from(c, (x) => (x >= 0.5 ? 1 : 0));
  const pure = exploitability(S, ps, pc);
  // EV of each decision against the other (pure) chart: shove minus fold, per SB hand; call minus fold, per BB hand facing a shove.
  const sb = sbValues(S, pc);
  const bb = bbValues(S, ps);
  const wi = (i) => W[i].reduce((a, b) => a + b, 0);
  shoveEv.push(...ALL_LABELS.map((_, i) => Math.round(((sb.shove[i] - sb.fold[i]) / wi(i)) * 100)));
  callEv.push(...ALL_LABELS.map((_, j) => (bb.reach[j] > 0 ? Math.round(((bb.call[j] - bb.fold[j]) / bb.reach[j]) * 100) : 0)));
  shoveMasks.push(hex(ps));
  callMasks.push(hex(pc));
  expl.push(Math.round(pure.total * 1e6) / 1e6);
  mixedEx.push(mixed.total);
  mixedCounts.push([s.filter((x) => x > 0.02 && x < 0.98).length, c.filter((x) => x > 0.02 && x < 0.98).length]);
  console.log(`${String(S).padStart(4)}bb  shove ${pctOf(ps).toFixed(1).padStart(5)}%  call ${pctOf(pc).toFixed(1).padStart(5)}%  exploitability: solved ${(mixed.total * 1000).toFixed(3)} mbb/hand, rounded chart ${(pure.total * 1000).toFixed(3)} mbb/hand  mixed hands ${mixedCounts.at(-1)}`);
}

// Int16 little-endian, base64: EVs in hundredths of a big blind, depth-major (depth index * 169 + hand index).
const b64 = (arr) => Buffer.from(new Int16Array(arr).buffer).toString('base64');
const body = `// GENERATED by scripts/gen-push-fold.mjs — do not edit by hand.
// Heads-up push/fold Nash equilibrium, chip EV, no ante. Stack = effective stack in big blinds, before the blinds.
// Masks: one bit per hand in ALL_LABELS order (4 bits per hex digit, lowest bit first).
export const PF_DEPTHS: readonly number[] = ${JSON.stringify(DEPTHS)};
export const PF_SHOVE_MASKS: readonly string[] = ${JSON.stringify(shoveMasks)};
export const PF_CALL_MASKS: readonly string[] = ${JSON.stringify(callMasks)};
/** Shove minus fold for the small blind against the calling chart, in 1/100 big blind (Int16LE, base64). */
export const PF_SHOVE_EV_B64 = '${b64(shoveEv)}';
/** Call minus fold for the big blind facing a shove from the pushing chart, in 1/100 big blind (Int16LE, base64). */
export const PF_CALL_EV_B64 = '${b64(callEv)}';
/** How much a perfect opponent could gain against these rounded charts, in big blinds per hand (both players combined). */
export const PF_EXPLOITABILITY: readonly number[] = ${JSON.stringify(expl)};
`;
writeFileSync('src/engine/pushFoldData.ts', body);
console.log(`max exploitability of the rounded charts: ${(Math.max(...expl) * 1000).toFixed(3)} mbb/hand`);
await close();
