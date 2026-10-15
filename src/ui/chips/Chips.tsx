import { memo } from 'react';

/** Monochrome chips: denominations differ by tone and by the dash pattern of the edge spots (no hues). */
export const CHIP_DENOMS: { value: number; color: string; edge: string; dash: string }[] = [
  { value: 5000, color: '#f6f2e7', edge: '#14130f', dash: '1.2 1.2' },
  { value: 1000, color: '#14130f', edge: '#ece8dc', dash: '1.2 1.2' },
  { value: 500, color: '#b3ac9a', edge: '#14130f', dash: '4 2' },
  { value: 100, color: '#2a2924', edge: '#ece8dc', dash: '4 2' },
  { value: 25, color: '#6e6a60', edge: '#ece8dc', dash: '2 2.6' },
  { value: 5, color: '#ece8dc', edge: '#5a574e', dash: '2 2.6' },
  { value: 1, color: '#8a867b', edge: '#14130f', dash: '0.8 3' },
];

/** Break an amount into a few chip stacks (largest denominations first). */
export function chipBreakdown(amount: number, maxStacks = 4): { value: number; count: number; color: string; edge: string; dash: string }[] {
  let left = Math.max(0, Math.round(amount));
  const out: { value: number; count: number; color: string; edge: string; dash: string }[] = [];
  for (const d of CHIP_DENOMS) {
    const n = Math.floor(left / d.value);
    if (n > 0) {
      out.push({ value: d.value, count: n, color: d.color, edge: d.edge, dash: d.dash });
      left -= n * d.value;
    }
  }
  // Merge the smallest stacks if there are too many
  while (out.length > maxStacks) {
    const last = out.pop()!;
    out[out.length - 1]!.count += Math.ceil((last.value * last.count) / out[out.length - 1]!.value);
  }
  return out;
}

export const ChipStack = memo(function ChipStack({ amount, size = 26 }: { amount: number; size?: number }) {
  const stacks = chipBreakdown(amount);
  if (stacks.length === 0) return null;
  const h = size * 0.24;
  const visible = (n: number): number => Math.min(n, 7);
  const tallest = Math.max(...stacks.map((s) => visible(s.count)));
  const width = stacks.length * (size + 2);
  const height = size * 0.6 + tallest * h + 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="chipstack">
      {stacks.map((s, si) => {
        const cx = si * (size + 2) + size / 2 + 1;
        return (
          <g key={s.value}>
            {Array.from({ length: visible(s.count) }, (_, i) => {
              const cy = height - size * 0.3 - 1 - i * h;
              return (
                <g key={i}>
                  {/* chip side (a hairline below the face gives depth without a shadow) */}
                  <ellipse cx={cx} cy={cy + h * 0.5} rx={size / 2 - 0.5} ry={size * 0.25} fill={s.color} stroke="#14130f" strokeWidth="0.8" />
                  <ellipse cx={cx} cy={cy} rx={size / 2 - 0.5} ry={size * 0.25} fill={s.color} stroke="#14130f" strokeWidth="0.8" />
                  <ellipse cx={cx} cy={cy} rx={size / 2 - 2.2} ry={size * 0.25 - 1.6} fill="none" stroke={s.edge} strokeWidth="1.6" strokeDasharray={s.dash} opacity="0.9" />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
});
