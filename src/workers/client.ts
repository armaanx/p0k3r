// Main-thread client for the equity/coach worker. Falls back to running on the main thread
// (slower, but correct) if the worker cannot start, e.g. an unusual browser/file:// policy.
import { advise, type Advice, type AdviceOptions } from '../engine/coach/advice';
import type { Card } from '../engine/cards';
import { equityVsRange, type EquityOptions, type EquityResult } from '../engine/equity';
import type { HandState } from '../engine/game';
import { createRng } from '../engine/rng';
import type { Range } from '../engine/ranges';
import EquityWorker from './equity.worker?worker&inline';
import type { WorkerRequest, WorkerResponse } from './protocol';

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface Pending {
  resolve: (v: Advice | EquityResult | number) => void;
  reject: (e: Error) => void;
  fallback: () => Advice | EquityResult | number;
  timer: ReturnType<typeof setTimeout>;
}

export class CoachClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  /** True when calls are being answered by the worker (observable for tests/diagnostics). */
  usingWorker = false;

  constructor() {
    try {
      const w = new EquityWorker();
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        clearTimeout(p.timer);
        if (e.data.ok) p.resolve(e.data.result);
        else p.reject(new Error(e.data.error));
      };
      w.onerror = () => this.failOver();
      this.worker = w;
      this.usingWorker = true;
    } catch {
      this.worker = null;
      this.usingWorker = false;
    }
  }

  private failOver(): void {
    this.usingWorker = false;
    this.worker?.terminate();
    this.worker = null;
    for (const [id, p] of this.pending) {
      this.pending.delete(id);
      clearTimeout(p.timer);
      try { p.resolve(p.fallback()); } catch (e) { p.reject(e as Error); }
    }
  }

  private call<T extends Advice | EquityResult | number>(req: DistOmit<WorkerRequest, 'id'>, fallback: () => T, timeoutMs = 20000): Promise<T> {
    if (!this.worker) return new Promise<T>((res, rej) => setTimeout(() => { try { res(fallback()); } catch (e) { rej(e as Error); } }, 0));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Worker unresponsive: answer from the main thread instead of hanging the UI.
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        try { resolve(fallback()); } catch (e) { reject(e as Error); }
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as Pending['resolve'], reject, fallback, timer });
      this.worker!.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  advise(hand: HandState, opts: AdviceOptions = {}): Promise<Advice> {
    return this.call<Advice>({ kind: 'advise', hand, opts }, () => advise(hand, opts));
  }

  equity(hero: [Card, Card], villain: Range, board: Card[], opts: Omit<EquityOptions, 'rng'> & { seed?: number } = {}): Promise<EquityResult> {
    return this.call<EquityResult>({ kind: 'equity', hero, villain: [...villain.entries()], board, opts }, () => {
      const { seed, ...rest } = opts;
      return equityVsRange(hero, villain, board, { ...rest, rng: createRng(seed ?? 1) });
    });
  }

  /** CPU burn used by the responsiveness check. */
  burn(iterations: number): Promise<number> {
    return this.call<number>({ kind: 'burn', iterations }, () => {
      let acc = 0;
      const rng = createRng(3);
      for (let i = 0; i < iterations; i++) acc += rng.next();
      return acc;
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
  }
}

let shared: CoachClient | null = null;
export function getCoach(): CoachClient {
  if (!shared) shared = new CoachClient();
  return shared;
}
