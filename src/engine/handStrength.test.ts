import { describe, expect, it } from 'vitest';
import { parseCards } from './cards';
import { assessHand, detectDraws, madeHandCards } from './handStrength';

const a = (hole: string, board: string) => assessHand(parseCards(hole) as [number, number], parseCards(board));

describe('assessHand', () => {
  it('made hands', () => {
    expect(a('AsAd', 'Ah 7c 2d').bucket).toBe('monster');
    expect(a('AsAd', 'Ah 7c 2d').label).toMatch(/Set of Aces/);
    expect(a('AsKd', 'Ah 7c 2d').label).toBe('Top pair, good kicker');
    expect(a('As5d', 'Ah 7c 2d').label).toBe('Top pair, weak kicker');
    expect(a('QsQd', '9h 7c 2d').label).toBe('Overpair');
    expect(a('5s5d', '9h 7c 2d').label).toMatch(/^Third pair/); // above the 2, so not an underpair
    expect(a('5s5d', '9h 7c 6d').pair).toBe('underpair');
    expect(a('7s6d', '9h 7c 2d').label).toBe('Second pair');
    expect(a('2s3d', '9h 7c 2d').label).toBe('Bottom pair');
    expect(a('9s7d', '9h 7c 2d').label).toBe('Two pair');
    expect(a('AsKs', '9s 7s 2s').bucket).toBe('monster');
    expect(a('QsJd', '9h Tc 8d').bucket).toBe('monster'); // straight
  });

  it('air and draws', () => {
    expect(a('4s3d', 'Kh 9c 2d').bucket).toBe('air');
    expect(a('KsJd', '9h 7c 2d').label).toBe('Two overcards');
    expect(a('AsKs', '9s 7s 2d').label).toBe('Nut flush draw');
    expect(a('AsKs', '9s 7s 2d').bucket).toBe('draw');
    expect(a('QsJd', '9h Tc 2d').label).toMatch(/Open-ended/);
    expect(a('9h8h', '7h 6d 2h').label).toMatch(/Monster draw/);
  });

  it('board plays', () => {
    expect(a('2s3d', 'As Ks Qs Js Ts').label).toMatch(/board plays/i);
    expect(a('2s3d', 'As Ks Qs Js Ts').bucket).toBe('air');
  });

  it('an ace kicker on a paired board is not a made hand', () => {
    expect(a('AsKd', 'Qh Qc 7d').bucket).toBe('air');
  });

  it('pairs with the 2 of clubs (card 0) are real pairs', () => {
    const x = a('2c3h', 'Qs 4s 2d');
    expect(x.label).toBe('Bottom pair');
    expect(x.bucket).toBe('weak');
    expect(x.usesHoleCards).toBe(true);
    expect(a('2c4c', 'Ts 2d Jd').pair).toBe('bottom');
    expect(a('2c9s', '4d 6h Jh 2h').pair).toBe('bottom');
    expect(a('Kd2c', 'Kh 9s 4d').label).toBe('Top pair, weak kicker');
  });

  it('a made hand that is all on the board is never called your hand', () => {
    const trips = a('AhQc', '6h 6s 6d');
    expect(trips.label).toBe('Three of a kind on the board (you have a kicker only)');
    expect(trips.boardMade).toBe(true);
    expect(trips.usesHoleCards).toBe(false);
    expect(trips.bucket).toBe('weak'); // AK has a better kicker, but the ace kicker still wins often
    expect(a('AhKc', '6h 6s 6d').bucket).toBe('medium'); // the best possible kicker: beats or ties every kicker-only hand
    expect(a('Ac6h', '7s Qc 7c Qh').label).toBe('Two pair on the board (your ace is only a kicker)');
    expect(a('As3d', 'Kh Kc 9d 9s 5c').label).toBe('Two pair on the board (your ace is only a kicker)');
    expect(a('Ks7d', '9h 9c 5d 5s 2c').label).toBe('Two pair on the board (your king is only a kicker)');
    expect(a('Ks7d', '9h 9c 5d 5s 2c').bucket).toBe('weak'); // only an ace kicker beats the king
    expect(a('6s6d', 'Kh Kc 9d 9s 5c').label).toBe('Two pair on the board (your pocket sixes only count as a kicker)');
    expect(a('As5d', 'Kh Kc Kd 7s 2c').label).toBe('Three of a kind on the board (you have a kicker only)');
    const quads = a('3s4d', 'Kh Kc Kd Ks 2c');
    expect(quads.label).toBe('Four of a kind on the board (you have a kicker only)');
    expect(quads.bucket).toBe('air');
    expect(a('As4d', 'Kh Kc Kd Ks 2c').bucket).toBe('strong'); // the ace kicker cannot be beaten
    // A pair on the board with a strong draw is a draw, not a made hand
    expect(a('9h8h', '7h 7c 6h').bucket).toBe('draw');
  });

  it('board-made hands are bucketed by the real showdown value of the kicker', () => {
    // Regression: good-but-not-top kickers were all bucketed 'air' ("rarely wins at showdown")
    expect(a('AhQc', '6h 6s 6d Tc 3h').bucket).toBe('weak');
    expect(a('KhQc', '6h 6s 6d Tc 3h').bucket).toBe('weak'); // only an ace beats the king kicker
    expect(a('AhKc', '6h 6s 6d Tc 3h').bucket).toBe('medium');
    expect(a('8s5d', 'Kh Kc Kd 7s 2c').bucket).toBe('air'); // A, Q, J, T and 9 all beat the eight
    expect(a('Js4d', 'Kh Kc 9d 9s 2c').bucket).toBe('weak'); // A and Q above the jack
    expect(a('Ts4d', 'Kh Kc 9d 9s 2c').bucket).toBe('air'); // A, Q and J above the ten
  });

  it('two pair counts only the pairs that use your cards', () => {
    expect(a('7s2d', 'Kh Kc 7d 2c').label).toBe('Two pair (one pair is on the board)'); // the 2 is only a kicker
    expect(a('QsQd', 'Kh Kc 9d 9s 5c').label).toBe('Pocket pair plus a pair on the board'); // QQ beats the 9s
    expect(a('Ks7d', 'Kh 7c 2d').label).toBe('Two pair');
  });

  it('a pocket pair between board cards is second/third pair, not an underpair', () => {
    expect(a('8s8d', 'Kh 5c 2d').pair).toBe('second');
    expect(a('8s8d', 'Kh 5c 2d').label).toMatch(/^Second pair/);
    expect(a('8s8d', 'Kh Qc 2d').label).toMatch(/^Third pair/);
    expect(a('8s8d', 'Kh Qc 2d').pair).toBe('middle');
    expect(a('5s5d', '9h 7c 6d').pair).toBe('underpair');
    expect(a('5s5d', '9h 7c 6d').label).toBe('Pocket pair below the board');
  });

  it('double gutshots are not called open-ended', () => {
    expect(a('9c7d', 'Jh 8s 5d').label).toBe('Double gutshot straight draw');
    expect(a('9c8d', '7h 6s 2d').label).toBe('Open-ended straight draw');
  });

  it('nut flush compares with the highest unseen card of the suit', () => {
    expect(a('Kh3c', 'Ah 7h 2h').label).toBe('Nut flush draw');
    expect(a('Kh3h', 'Ah 7h 2c').label).toBe('Nut flush draw');
    expect(a('Qh3h', 'Ah 7h 2c').label).toBe('Flush draw');
    expect(a('Kh3h', 'Ah 7h 2h').label).toBe('Nut flush');
    expect(a('Qh3h', 'Ah 7h 2h').label).toBe('Flush');
  });
});

describe('detectDraws', () => {
  const d = (hole: string, board: string) => detectDraws(parseCards(hole) as [number, number], parseCards(board));
  it('straight-draw shapes', () => {
    expect(d('9c8d', '7h 6s 2d').straightKind).toBe('open-ended');
    expect(d('9c7d', 'Jh 8s 5d').straightKind).toBe('double-gutshot');
    expect(d('9c7d', 'Jh 8s 5d').straightRanks).toBe(2);
    expect(d('9c8d', '6h 5s Kd').straightKind).toBe('gutshot');
    expect(d('QcJd', 'Ks As 2d').straightKind).toBe('gutshot'); // one-ended: only a ten
    expect(d('3c2d', '4h 5s Kd').straightKind).toBe('open-ended'); // A or 6
    expect(d('AcKd', '9h 6s 2d').straightKind).toBe('none');
  });
  it('board-only straight draws and duplicated ranks are not credited', () => {
    expect(d('7c2d', '7h 8s 9d Tc').straightRanks).toBe(0); // the board's own draw
    expect(d('Ac2d', '5h 6s 7d 8c').straightRanks).toBe(0); // a 4 or 9 makes the board's straight
    expect(d('Tc2d', '5h 6s 7d 8c').straightRanks).toBe(1); // only a 9 gives you a better straight than the board
  });
  it('flush-draw hole-card count', () => {
    expect(d('AhKh', '9h 7h 2d').flushDrawHoleCards).toBe(2);
    expect(d('Ah2c', '9h 7h 5h').flushDrawHoleCards).toBe(1);
    expect(d('AcKd', '9h 7h 2d').flushDrawHoleCards).toBe(0);
  });
  it('gutshot = 1 completing rank, open-ended = 2', () => {
    expect(detectDraws(parseCards('9c8d') as [number, number], parseCards('6h 5s Kd')).straightRanks).toBe(1);
    expect(detectDraws(parseCards('9c8d') as [number, number], parseCards('7h 6s 2d')).straightRanks).toBe(2);
  });
  it('wheel draws work with the ace', () => {
    expect(detectDraws(parseCards('As2d') as [number, number], parseCards('3h 4s Kd')).straightRanks).toBe(1);
  });
  it('no draw once a straight is made', () => {
    expect(detectDraws(parseCards('9c8d') as [number, number], parseCards('7h 6s 5d')).straightRanks).toBe(0);
  });
  it('counts overcards', () => {
    expect(detectDraws(parseCards('AcKd') as [number, number], parseCards('9h 6s 2d')).overcards).toBe(2);
    expect(detectDraws(parseCards('AcTd') as [number, number], parseCards('Kh 6s 2d')).overcards).toBe(1);
  });
});

describe('madeHandCards', () => {
  const m = (hole: string, board: string) => madeHandCards(parseCards(hole) as [number, number], parseCards(board)).length;
  it('highlights only the cards that make the hand', () => {
    expect(m('AsKd', '9h 7c 2d')).toBe(0); // high card: nothing to highlight
    expect(m('AsKd', 'Kh 7c 2d')).toBe(2); // the pair of kings
    expect(m('AsAd', 'Ah 7c 7d')).toBe(5); // full house
    expect(m('9s9d', '9h 7c 2d')).toBe(3); // set
    expect(m('9s8s', '7s 6s 2s')).toBe(5); // flush
    expect(m('AsKd', 'Kh Ac 2d')).toBe(4); // two pair
  });
});
