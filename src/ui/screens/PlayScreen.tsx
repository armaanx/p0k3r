import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Advice } from '../../engine/coach/advice';
import { explainDecision, gradeAdvice } from '../../engine/coach/grade';
import { bestFive } from '../../engine/evaluator';
import { madeHandCards } from '../../engine/handStrength';
import { applyAction, legalActions, toReplayRecord, type ActionInput, type HandState } from '../../engine/game';
import { randomSeed } from '../../engine/rng';
import {
  completeHand, createSession, defaultSeats, DEFAULT_CONFIG_HU, DEFAULT_CONFIG_6MAX, botAction, describeRebuys, describeResult, isBotTurn, nextHand, type Session,
} from '../../engine/session';
import type { CoachCompare, GradeRecord, HandRecord } from '../../state/types';
import { useStore } from '../../state/store';
import { featuresFor } from '../features';
import { makeFmt } from '../format';
import { ActionBar } from '../table/ActionBar';
import { Table } from '../table/Table';
import { playSound } from '../audio';
import { CoachPanel, type LastDecision } from '../coach/CoachPanel';
import { getCoach } from '../../workers/client';
import { accuracyOf } from '../../content/practice';
import { canon } from '../../engine/learning/analytics';
import { focusQuiet, focusInView } from '../focus';

const MAX_HANDS_KEPT = 300;

function makeSession(tableSize: 6 | 2, stackBB: number): Session {
  const config = tableSize === 2 ? DEFAULT_CONFIG_HU : DEFAULT_CONFIG_6MAX;
  const seats = defaultSeats(tableSize);
  if (tableSize === 2) seats[1] = { name: 'Maya', isHero: false, archetype: 'tag' };
  return createSession({ config, stackBB, seats, seed: randomSeed() });
}

export function PlayScreen() {
  const { progress, update, setSettings } = useStore();
  const settings = progress.settings;
  const features = featuresFor(progress);
  const [sess, setSess] = useState<Session>(() => makeSession(settings.tableSize, settings.stackBB));
  const [hand, setHand] = useState<HandState | null>(null);
  const [drawer, setDrawer] = useState(true);
  const recorded = useRef<number>(-1);
  const gradesRef = useRef<GradeRecord[]>([]);
  const comparesRef = useRef<CoachCompare[]>([]);
  const pendingRef = useRef<Promise<void>[]>([]);
  const [last, setLast] = useState<LastDecision | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [rebuyNotes, setRebuyNotes] = useState<string[]>([]);
  const [liveAdvice, setLiveAdvice] = useState<{ a: Advice | null; revealed: boolean }>({ a: null, revealed: false });
  const heroSeat = 0;
  const bb = sess.config.bb;
  const fmt = useMemo(() => makeFmt(settings, bb), [settings, bb]);

  const deal = useCallback(() => {
    const r = nextHand(sess);
    setSess(r.session);
    setHand(r.hand);
    setRebuyNotes(describeRebuys(r.rebought, r.session.seats.map((s) => s.name), heroSeat, r.session.config.bb));
    gradesRef.current = [];
    comparesRef.current = [];
    pendingRef.current = [];
    setLast(null);
    setSavedId(null);
  }, [sess]);

  const newTable = useCallback((tableSize: 6 | 2, stackBB: number) => {
    setSettings({ tableSize, stackBB });
    setSess(makeSession(tableSize, stackBB));
    setHand(null);
    setRebuyNotes([]);
    recorded.current = -1;
  }, [setSettings]);

  // Bots act with a short pause so the learner can follow the action.
  useEffect(() => {
    if (!hand || hand.result || !isBotTurn(sess, hand)) return;
    const heroOut = hand.players[heroSeat]!.folded;
    const delay = heroOut ? 90 : settings.botSpeed === 'fast' ? 260 : 720;
    const t = setTimeout(() => {
      setHand((h) => (h && !h.result && isBotTurn(sess, h) ? applyAction(h, botAction(sess, h)) : h));
    }, delay);
    return () => clearTimeout(t);
  }, [hand, sess, settings.botSpeed]);

  // Record finished hands exactly once (after any background grading has finished).
  useEffect(() => {
    if (!hand?.result || recorded.current === hand.handNumber) return;
    recorded.current = hand.handNumber;
    const finished = hand;
    setSess((s) => completeHand(s, finished));
    void Promise.all(pendingRef.current).then(() => {
      const grades = [...gradesRef.current];
      const rec: HandRecord = {
        id: `${finished.seed}-${finished.handNumber}-${Date.now()}`,
        t: Date.now(),
        replay: toReplayRecord(finished),
        heroSeat,
        archetypes: sess.seats.map((s) => s.archetype),
        net: finished.result!.net[heroSeat]!,
        bb,
        grades,
        evLostBB: grades.reduce((acc, g) => acc + g.evLostBB, 0),
        coachCompare: [...comparesRef.current],
      };
      update((p) => ({ ...p, hands: [...p.hands, rec].slice(-MAX_HANDS_KEPT) }));
      setSavedId(rec.id);
    });
  }, [hand, sess.seats, bb, update]);

  const onAction = useCallback((a: ActionInput) => {
    if (!hand || hand.result || hand.toAct !== a.seat) return;
    // Grade the decision in the background (never blocks play).
    const prev = hand;
    const job = getCoach()
      .advise(prev, { chosen: a, iterations: 4000 })
      .then((adv) => {
        const g = gradeAdvice(adv, bb);
        const ex = explainDecision(adv, g);
        gradesRef.current.push({
          street: prev.street, seat: a.seat, verdict: g.verdict, evLostBB: g.lossBB, tier: g.tier, concept: adv.concept,
          why: `${ex.summary} ${ex.detail}`, actionIndex: prev.actions.length,
        });
        setLast({ grade: g, explanation: ex, label: adv.chosen!.label });
        update((p) => ({
          ...p,
          attempts: [...p.attempts, { t: Date.now(), concept: adv.concept, spot: `${adv.kind === 'preflop' ? adv.position : adv.street}:${adv.concept}`, kind: 'hand', correct: adv.chosen!.acceptable, evLostBB: g.lossBB }].slice(-3000),
        }));
      })
      .catch(() => undefined);
    pendingRef.current.push(job);
    setHand(applyAction(hand, a));
  }, [hand, bb, update]);

  // Optional synthesized sound: cards, chips, and a small chime for a win. Off unless enabled in Display settings.
  const prevSnap = useRef<{ key: string; actions: number; board: number; over: boolean } | null>(null);
  useEffect(() => {
    if (!hand) return;
    const key = `${hand.seed}:${hand.handNumber}`;
    const snap = { key, actions: hand.actions.length, board: hand.board.length, over: !!hand.result };
    const prev = prevSnap.current;
    prevSnap.current = snap;
    const on = settings.sound;
    if (!prev || prev.key !== key) { playSound('deal', on); return; }
    if (snap.board > prev.board) playSound('flip', on);
    if (snap.actions > prev.actions) {
      const a = hand.actions[hand.actions.length - 1]!;
      playSound(a.type === 'check' ? 'check' : a.type === 'fold' ? 'fold' : 'chip', on);
    }
    if (snap.over && !prev.over && hand.result!.net[heroSeat]! > 0) playSound('win', on);
    if (!snap.over && hand.toAct === heroSeat && (prev.actions !== snap.actions || snap.board !== prev.board)) playSound('turn', on);
  }, [hand, settings.sound]);

  // Space / N deals the next hand
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const isN = e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey;
      const isSpace = e.key === ' ' && !(e.target instanceof HTMLButtonElement); // Space on a focused button presses it
      if ((isN || isSpace) && (!hand || hand.result)) {
        e.preventDefault();
        deal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hand, deal]);

  const legal = hand && !hand.result && hand.toAct === heroSeat ? legalActions(hand) : null;
  const hintAction = liveAdvice.revealed && liveAdvice.a && settings.coach === 'full' ? ({ fold: 'fold', passive: 'call', aggressive: 'raise' } as const)[liveAdvice.a.recommended.cls] : null;
  const over = !!hand?.result;
  const showdown = !!hand?.result?.showdown;

  const winners = useMemo(() => (hand?.result ? [...new Set(hand.result.pots.flatMap((p) => p.awards.map((a) => a.seat)))] : []), [hand]);
  const highlight = useMemo(() => {
    if (!hand) return undefined;
    if (hand.result?.showdown && winners.length > 0) {
      const w = hand.players[winners[0]!]!;
      return bestFive([...w.hole!, ...hand.board]).cards;
    }
    // While playing: a gentle glow on the cards that make your current hand (only once hand names have been taught).
    const me = hand.players[heroSeat]!;
    if (!hand.result && features.showHandName && !me.folded && me.hole) return madeHandCards(me.hole, hand.board);
    return undefined;
  }, [hand, winners, features.showHandName]);

  const resultText = useMemo(() => (hand?.result ? describeResult(hand, heroSeat, fmt) : null), [hand, fmt]);

  const handsPlayed = sess.handNumber;
  const heroStack = hand ? hand.players[heroSeat]!.stack : sess.stacks[heroSeat]!;
  // Money in = every starting stack bought (the first plus each rebuy); no chips are ever discarded.
  const sessionNet = heroStack + (hand && !hand.result ? hand.players[heroSeat]!.committed : 0) - sess.startStack * (1 + sess.rebuys[heroSeat]!);

  return (
    <div className={`play-layout ${drawer ? '' : 'drawer-closed'}`}>
      <div className="play-main">
        <div className="panel-toggle">
          <button className="btn-ghost" onClick={() => setDrawer((d) => !d)} aria-pressed={drawer}>{drawer ? 'Hide side panel' : 'Show side panel'}</button>
        </div>
        {hand && rebuyNotes.length > 0 && (
          <p className="muted" style={{ textAlign: 'center', margin: '0.2rem 0 0.4rem' }} role="status">{rebuyNotes.join(' ')}</p>
        )}
        {hand ? (
          <Table
            hand={hand}
            session={sess}
            heroSeat={heroSeat}
            settings={settings}
            features={features}
            fmt={fmt}
            revealAll={showdown}
            highlight={highlight}
            dimOthers={showdown}
            winners={winners}
          />
        ) : (
          <div className="card-panel" style={{ maxWidth: 640, margin: '3rem auto', textAlign: 'center' }}>
            <h2>Ready when you are</h2>
            <p className="muted">
              You will play {settings.tableSize === 2 ? 'heads-up' : '6-player'} Texas Hold'em against bots with play-money chips. Press <b>Deal</b> (or the space bar) to start.
            </p>
            <button className="btn-primary" onClick={deal} ref={focusQuiet}>Deal</button>
          </div>
        )}

        {hand && legal && (
          <ActionBar legal={legal} seat={heroSeat} bb={bb} street={hand.street} fmt={fmt} onAction={onAction} keysEnabled hintAction={hintAction} />
        )}
        {hand && !over && !legal && (
          <p className="muted" style={{ textAlign: 'center', marginTop: '0.8rem' }} aria-live="polite">
            {hand.players[heroSeat]!.folded ? 'You folded. Watching the hand finish…' : `${hand.players[hand.toAct]?.name ?? ''} is thinking…`}
          </p>
        )}
        {hand && over && (
          <div className="card-panel result-card" aria-live="polite">
            <div className="result-head">
              <span className="result-title">{resultText?.summary}</span>
              <span className={`num ${resultText?.tone === 'pos' ? 'pos' : resultText?.tone === 'neg' ? 'neg' : ''}`}>
                {resultText?.heroLabel} {resultText?.heroAmount && <b>{resultText.heroAmount}</b>}
              </span>
            </div>
            <div className="toolbar" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
              <button className="btn-primary" onClick={deal} ref={focusInView}>Deal next hand <span className="faint">(N)</span></button>
              {savedId && <button className="btn-quiet" onClick={() => { window.location.hash = `/review/${savedId}`; }}>Review this hand</button>}
            </div>
          </div>
        )}
      </div>

      {drawer && (
        <aside className="side-drawer" aria-label="Coach, table settings and session">
          <CoachPanel
            hand={hand}
            heroSeat={heroSeat}
            level={settings.coach}
            features={features}
            fmt={fmt}
            onLevel={(l) => setSettings({ coach: l })}
            onCompare={(c) => { comparesRef.current.push(c); }}
            last={last}
            onAdvice={(a, revealed) => setLiveAdvice((prev) => (prev.a === a && prev.revealed === revealed ? prev : { a, revealed }))}
            thinkFirst={settings.thinkFirst}
            onThinkFirst={(v) => setSettings({ thinkFirst: v })}
            autoFade={settings.autoFade}
            onAutoFade={(v) => setSettings({ autoFade: v })}
            fade={(concept) => {
              const { acc, n } = accuracyOf(progress, canon(concept), 12);
              if (acc === null || n < 8 || acc < 0.75) return 'full';
              return acc >= 0.9 && n >= 10 ? 'none' : 'nudge';
            }}
          />
          <div className="card-panel">
            <h3 className="panel-title">Table</h3>
            <div className="row">
              <span>Format</span>
              <span className="seg" role="group" aria-label="Table format">
                <button aria-pressed={settings.tableSize === 6} onClick={() => newTable(6, settings.stackBB)}>6-max</button>
                <button aria-pressed={settings.tableSize === 2} onClick={() => newTable(2, settings.stackBB)}>Heads-up</button>
              </span>
            </div>
            <div className="row">
              <span>Stacks</span>
              <span className="seg" role="group" aria-label="Starting stack depth">
                {[40, 100, 200].map((s) => (
                  <button key={s} aria-pressed={settings.stackBB === s} onClick={() => newTable(settings.tableSize, s)}>{s}bb</button>
                ))}
              </span>
            </div>
            <div className="row">
              <span>Blinds</span>
              <b className="num">{sess.config.sb}/{sess.config.bb}</b>
            </div>
            <div className="row">
              <span>Show amounts in</span>
              <span className="seg" role="group" aria-label="Amount units">
                <button aria-pressed={!settings.showBB} onClick={() => setSettings({ showBB: false })}>Chips</button>
                <button aria-pressed={settings.showBB} onClick={() => setSettings({ showBB: true })}>Big blinds</button>
              </span>
            </div>
            <div className="row">
              <span>Bot speed</span>
              <span className="seg" role="group" aria-label="Bot speed">
                <button aria-pressed={settings.botSpeed === 'normal'} onClick={() => setSettings({ botSpeed: 'normal' })}>Normal</button>
                <button aria-pressed={settings.botSpeed === 'fast'} onClick={() => setSettings({ botSpeed: 'fast' })}>Fast</button>
              </span>
            </div>
          </div>
          <div className="card-panel">
            <h3 className="panel-title">This session</h3>
            <div className="stat"><span>Hands played</span><b>{handsPlayed}</b></div>
            <div className="stat"><span>Your stack</span><b>{fmt(heroStack)}</b></div>
            <div className="stat"><span>Session result</span><b className={sessionNet > 0 ? 'pos' : sessionNet < 0 ? 'neg' : ''}>{sessionNet > 0 ? '+' : ''}{fmt(sessionNet)}</b></div>
            <p className="faint" style={{ fontSize: '0.82rem', margin: '0.6rem 0 0' }}>
              Keys: <b>F</b> fold · <b>C</b> call/check · <b>R</b> raise/bet · <b>A</b> all-in · <b>N</b> next hand
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
