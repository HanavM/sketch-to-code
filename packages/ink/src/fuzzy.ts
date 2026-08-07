/**
 * Trapezoidal fuzzy membership (CALI): 0 below a, ramps a→b, 1 on [b,c], ramps c→d, 0 above d.
 * Degenerate (a=b=c=d): membership 1 only at exactly that value.
 */
export function trapezoid(v: number, a: number, b: number, c: number, d: number): number {
  if (a === b && b === c && c === d) return v === a ? 1 : 0
  if (v < a || v > d) return 0
  if (v >= b && v <= c) return 1
  if (v < b) return (v - a) / (b - a)
  return (d - v) / (d - c)
}

export const BIG = 1e9
