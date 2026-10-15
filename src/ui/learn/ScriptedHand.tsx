import { useMemo, useState } from 'react';
import { type Card, fullDeck, parseCards } from '../../engine/cards';
import { applyAction, legalActions, newHand, type ActionInput, type HandState } from '../../engine/game';
import { createSession, defaultSeats } from '../../engine/session';
import { useStore } from '../../state/store';
import { featuresFor } from '../features';
import { makeFmt } from '../format';
import { ActionBar } from '../table/ActionBar';
import { Table } from '../table/Table';
import { Rich } from './Rich';
import { Icon } from '../Icon';

// Seat 0 (you) is the big blind. Button = seat 4. Action order preflop: 1,2,3,4,5,0.
interface ScriptStep {
  seat: number;
  action: ActionInput['type'];
  amount?: number;
  say: string;
}

const SCRIPT: ScriptStep[] = [
  { seat: 1, action: 'fold', say: 'You are in the **big blind**: you already posted 100 chips before seeing your cards, and the player beside you posted the smaller **small blind** (50). Your two private cards are at the bottom of the table. Everybody acts in turn, clockwise, starting with the player left of the big blind. The first player looks at their cards and chooses to **fold**: they give up their hand.' },
  { seat: 2, action: 'fold', say: 'The next player folds too. Folding costs nothing; only players who already put chips in (like the blinds) lose them.' },
  { seat: 3, action: 'raise', amount: 300, say: 'The player to the right of the dealer button **raises** to 300. A raise makes the bet bigger: anyone who wants to stay in must match 300.' },
  { seat: 4, action: 'fold', say: 'The player on the dealer button (the "D") folds.' },
  { seat: 5, action: 'fold', say: 'The small blind folds, giving up the 50 already posted. Now the action comes to you.' },
  { seat: 0, action: 'call', say: '**Your turn.** Facing a raise you may **fold**, **call** or **raise**. K♦ 9♦ is a decent hand, so let\'s **call**: click Call (or press C). You will put in 200 more chips to match the 300.' },
  { seat: 0, action: 'check', say: 'The **flop**: three board cards are dealt face up. You now have **two pair** (kings and nines)! Nobody has bet in this round yet, so you can **check**, which means passing without betting. Click Check (or press C).' },
  { seat: 3, action: 'bet', amount: 300, say: 'Your opponent **bets** 300 chips.' },
  { seat: 0, action: 'call', say: 'A bet is in front of you, so you cannot check. With two pair you want to stay in: **call** 300.' },
  { seat: 0, action: 'check', say: 'The **turn**: a fourth board card. Check again.' },
  { seat: 3, action: 'check', say: 'Your opponent checks too.' },
  { seat: 0, action: 'check', say: 'The **river**: the fifth and last board card. One more betting round. Check.' },
  { seat: 3, action: 'check', say: 'Your opponent checks. Both players have passed, so the betting is over.' },
];

function buildHand(): { hand: HandState; cards: Card[] } {
  const board = parseCards('9s 4c Ks 2d 7h');
  // Deal order starts with the small blind (seat 5), then 0, 1, 2, 3, 4.
  const holes: Record<number, Card[]> = {
    0: parseCards('Kd 9d'), 1: parseCards('8s 3h'), 2: parseCards('Jc 5s'), 3: parseCards('Ac Qc'), 4: parseCards('6h Td'), 5: parseCards('Jd 3s'),
  };
  const order = [5, 0, 1, 2, 3, 4];
  const deck: Card[] = [];
  for (const s of order) deck.push(holes[s]![0]!);
  for (const s of order) deck.push(holes[s]![1]!);
  deck.push(...board);
  const used = new Set(deck);
  for (const c of fullDeck()) if (!used.has(c)) deck.push(c);
  const hand = newHand({
    config: { numSeats: 6, sb: 50, bb: 100 }, stacks: Array(6).fill(10000), names: ['You', 'Maya', 'Walter', 'Jin', 'Gloria', 'Rico'], button: 4, seed: 1, stackedDeck: deck,
  });
  return { hand, cards: deck };
}

export function ScriptedHand({ onComplete }: { onComplete: () => void }) {
  const { progress } = useStore();
  const settings = progress.settings;
  const sess = useMemo(() => {
    const s = createSession({ seats: defaultSeats(6), seed: 1 });
    return { ...s, seats: s.seats.map((x, i) => ({ ...x, name: ['You', 'Maya', 'Walter', 'Jin', 'Gloria', 'Rico'][i]!, archetype: i === 0 ? null : x.archetype })) };
  }, []);
  const [hand, setHand] = useState<HandState>(() => buildHand().hand);
  const [i, setI] = useState(0);
  const [nudge, setNudge] = useState('');
  const bb = 100;
  const fmt = useMemo(() => makeFmt(settings, bb), [settings]);
  const features = { ...featuresFor(progress), showPositions: false, showHandName: true };

  const over = !!hand.result;
  const step = SCRIPT[Math.min(i, SCRIPT.length - 1)]!;
  const heroTurn = !over && step.seat === 0 && hand.toAct === 0;
  const legal = heroTurn ? legalActions(hand) : null;

  const advance = (act: ActionInput): void => {
    setHand((h) => applyAction(h, act));
    setI((x) => x + 1);
    setNudge('');
  };
  const runBot = (): void => {
    advance({ seat: step.seat, type: step.action, amount: step.amount });
  };
  const onHero = (a: ActionInput): void => {
    const want = step.action === 'check' || step.action === 'call' ? 'call' : 'raise';
    const got = a.type === 'check' || a.type === 'call' ? 'call' : a.type === 'fold' ? 'fold' : 'raise';
    if (got !== want) {
      setNudge(`For this first hand, please ${step.action === 'check' ? 'check' : step.action}. You will have real choices very soon.`);
      return;
    }
    advance(a);
  };

  const winnerText = (): string => {
    const r = hand.result!;
    const heroWon = r.net[0]! > 0;
    const hands = r.hands;
    const me = hands.find((h) => h.seat === 0)?.description ?? '';
    const opp = hands.find((h) => h.seat === 3)?.description ?? '';
    return `At the **showdown** the remaining players turn their cards face up. You show K♦ 9♦ and make **${me.toLowerCase()}**; your opponent shows A♣ Q♣ and makes only **${opp.toLowerCase()}**. ${heroWon ? 'You win the pot!' : ''} The best five-card hand wins.`;
  };

  return (
    <div className="scripted">
      <div className="guide card-panel" aria-live="polite">
        <div className="guide-label">Guide</div>
        <div>
          {over ? <Rich text={winnerText()} /> : <Rich text={step.say} />}
          {nudge && <p className="nudge-warn"><Icon name="alert" size={14} /> {nudge}</p>}
        </div>
        {!over && step.seat !== 0 && <button className="btn-primary" onClick={runBot} autoFocus>Continue</button>}
        {!over && step.seat === 0 && <p className="muted small">Use the buttons below the table (or the keyboard shortcut shown on the button).</p>}
        {over && <button className="btn-primary" onClick={onComplete} autoFocus>Finish the hand</button>}
      </div>
      <Table hand={hand} session={sess} heroSeat={0} settings={settings} features={features} fmt={fmt} revealAll={over} winners={over ? [0] : []} />
      {legal && (
        <ActionBar
          legal={legal} seat={0} bb={bb} street={hand.street} fmt={fmt} onAction={onHero} keysEnabled
          only={step.action === 'fold' ? 'fold' : step.action === 'raise' || step.action === 'bet' ? 'raise' : 'call'}
        />
      )}
    </div>
  );
}
