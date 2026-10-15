// Heavy poker maths runs here so the UI never stutters. Pure engine code only.
import { advise } from '../engine/coach/advice';
import { equityVsRange } from '../engine/equity';
import { createRng } from '../engine/rng';
import type { Range } from '../engine/ranges';
import type { WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as { onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null; postMessage: (m: WorkerResponse) => void };

ctx.onmessage = (e) => {
  const req = e.data;
  try {
    if (req.kind === 'advise') {
      ctx.postMessage({ id: req.id, ok: true, result: advise(req.hand, req.opts) });
    } else if (req.kind === 'equity') {
      const range: Range = new Map(req.villain);
      const { seed, ...rest } = req.opts;
      ctx.postMessage({ id: req.id, ok: true, result: equityVsRange(req.hero, range, req.board, { ...rest, rng: createRng(seed ?? 1) }) });
    } else {
      // Deliberately heavy job used by the responsiveness test.
      let acc = 0;
      const rng = createRng(3);
      for (let i = 0; i < req.iterations; i++) acc += rng.next();
      ctx.postMessage({ id: req.id, ok: true, result: acc });
    }
  } catch (err) {
    ctx.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
