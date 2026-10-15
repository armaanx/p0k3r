import type { Settings } from '../state/types';

export function makeFmt(settings: Pick<Settings, 'showBB'>, bb: number): (n: number) => string {
  return (n: number) => {
    if (settings.showBB) {
      const v = n / bb;
      return `${Number.isInteger(v) ? v : v.toFixed(1)} bb`;
    }
    return Math.round(n).toLocaleString('en-US');
  };
}
