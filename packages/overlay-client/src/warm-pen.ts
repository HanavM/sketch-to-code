/**
 * Warm the pen's lift path before the first lift (goal loop n23).
 *
 * The first pen lift of a session ran every reading cold: classifyStroke,
 * analyzeStrokes, findInsertSlot, quickReading and the snapshot walk were
 * parsed, compiled and run in the interpreter for the first time inside the
 * lift handler, so the first caret's placeholder showed 31-57 ms after lift
 * (later ones 12-20 ms). Here the same pure readings run on made-up strokes
 * while the browser is idle, a slice per callback, and the results are
 * thrown away. Nothing on the page is touched.
 */
import type { QPoint, QStroke } from './optimistic.js'

const caret = (x: number, y: number): QPoint[] => {
  const out: QPoint[] = []
  for (let i = 0; i <= 6; i++) out.push({ x: x - 9 + (9 * i) / 6, y: y + 16 - (16 * i) / 6, t: i * 16 })
  for (let i = 1; i <= 6; i++) out.push({ x: x + (9 * i) / 6, y: y + (16 * i) / 6, t: (6 + i) * 16 })
  return out
}
const line = (pts: [number, number][]): QPoint[] => {
  const out: QPoint[] = []
  let t = 0
  for (let k = 0; k + 1 < pts.length; k++) {
    const [x0, y0] = pts[k]!
    const [x1, y1] = pts[k + 1]!
    for (let i = k === 0 ? 0 : 1; i <= 8; i++) out.push({ x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8, t: (t += 16) })
  }
  return out
}
const ring = (x: number, y: number, r: number): QPoint[] =>
  Array.from({ length: 33 }, (_, i) => ({ x: x + r * Math.cos((i / 32) * 2 * Math.PI), y: y + r * 0.6 * Math.sin((i / 32) * 2 * Math.PI), t: i * 16 }))

/** Made-up strokes of every kind the lift path reads, around (x, y). */
export function warmStrokes(x: number, y: number): QStroke[][] {
  const zig: [number, number][] = []
  for (let i = 0; i < 8; i++) zig.push([x - 30 + (i % 2) * 60, y - 12 + i * 3])
  return [
    [{ id: 'warm-caret', points: caret(x, y) }],
    [{ id: 'warm-arrow', points: line([[x - 120, y], [x + 120, y], [x + 104, y - 12], [x + 120, y], [x + 104, y + 12]]) }],
    [{ id: 'warm-box', points: line([[x - 80, y - 40], [x + 80, y - 40], [x + 80, y + 40], [x - 80, y + 40], [x - 80, y - 40]]) }],
    [{ id: 'warm-scribble', points: line(zig) }],
    [{ id: 'warm-ring', points: ring(x, y, 60), color: '#dc2626' }],
  ]
}

type Idle = (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number

/**
 * Run each slice in its own idle callback (so a person who starts drawing is
 * never held up by more than one slice). Errors are swallowed: a warm-up that
 * fails just leaves the path cold, as before.
 */
export function warmInIdle(slices: (() => void)[], rounds = 3): void {
  const ric: Idle = (globalThis as unknown as { requestIdleCallback?: Idle }).requestIdleCallback
    ?? ((cb) => setTimeout(() => cb({ timeRemaining: () => 8 }), 30) as unknown as number)
  const queue: (() => void)[] = []
  for (let r = 0; r < rounds; r++) queue.push(...slices)
  const next = () => {
    const job = queue.shift()
    if (!job) return
    ric(() => {
      try { job() } catch { /* stays cold */ }
      next()
    }, { timeout: 2000 })
  }
  next()
}
