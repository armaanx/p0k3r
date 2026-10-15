import type { Advice, AdviceOptions } from '../engine/coach/advice';
import type { EquityOptions, EquityResult } from '../engine/equity';
import type { Card } from '../engine/cards';
import type { HandState } from '../engine/game';

export type WorkerRequest =
  | { id: number; kind: 'advise'; hand: HandState; opts: AdviceOptions }
  | { id: number; kind: 'equity'; hero: [Card, Card]; villain: [string, number][]; board: Card[]; opts: Omit<EquityOptions, 'rng'> & { seed?: number } }
  | { id: number; kind: 'burn'; iterations: number };

export type WorkerResponse =
  | { id: number; ok: true; result: Advice | EquityResult | number }
  | { id: number; ok: false; error: string };
