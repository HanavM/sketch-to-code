/**
 * s2c-002: the sketch and the question about it, parked across a reload.
 *
 * The instant render puts the drawing on the page as a real component, which
 * is a new module, which vite answers with a full reload. The reading (the
 * slow model call) was still in flight from the page that just died, so its
 * answer had nowhere to land and the run ended in "interpret failed: Failed
 * to fetch". The cleaner the sketch, the likelier: exactly backwards.
 *
 * Before asking, the overlay parks everything the reading is about here: the
 * ink, the words, the id the server files the answer under, and the instant
 * component once it lands. The page that comes back puts the drawing back and
 * collects the answer by id. sessionStorage: this tab, this reload, never a
 * window opened next week.
 *
 * Pure on purpose (no DOM, no storage): main.ts does the I/O, this decides
 * what a parked value means, and the tests can feed it anything.
 */

export const READING_KEY = 's2c:reading'
/**
 * Older than this, the parked reading is from some other session. A model
 * reading takes ~10 s; the long tail is a minute or two. The server keeps the
 * answer for 5 minutes, so waiting longer than that collects nothing.
 */
export const READING_PARK_MS = 4 * 60_000

interface ParkedPt { x: number; y: number; t: number }
export interface ParkedStroke {
  id: string
  points: ParkedPt[]
  color?: string
  anchor?: { src: string; index: number; rect: { x: number; y: number; w: number; h: number }; scale: number }
}
export interface ParkedNote {
  id: string
  text: string
  at: { x: number; y: number }
  anchor: { kind: 'element'; srcLoc: string } | { kind: 'strokes'; strokeIds: string[] } | { kind: 'run' }
  refs: Array<{ token: string; srcLoc: string; label: string }>
}
export interface ParkedReading {
  id: string
  /** When the reading was asked for (ms epoch). Never refreshed. */
  at: number
  strokes: ParkedStroke[]
  notes: ParkedNote[]
  /** Component the instant render mounted, once it has. */
  instant: string | null
}

/** Unguessable enough for one tab's own bookkeeping; matches the server's READING_ID_RE. */
export function newReadingId(rand: () => number = Math.random): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = 'r'
  for (let i = 0; i < 20; i++) s += abc[Math.floor(rand() * abc.length)]
  return s
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function isStroke(v: unknown): v is ParkedStroke {
  if (!isObj(v) || typeof v.id !== 'string' || !Array.isArray(v.points)) return false
  if (v.color !== undefined && typeof v.color !== 'string') return false
  return v.points.every((p) => isObj(p) && isNum(p.x) && isNum(p.y) && isNum(p.t))
}

function isNote(v: unknown): v is ParkedNote {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.text !== 'string') return false
  if (!isObj(v.at) || !isNum(v.at.x) || !isNum(v.at.y)) return false
  if (!isObj(v.anchor) || !['element', 'strokes', 'run'].includes(String(v.anchor.kind))) return false
  return Array.isArray(v.refs)
}

/**
 * What a stored value means now: a reading to resume, or nothing. Anything
 * malformed, stale, or without ink is nothing: a parked value must never put
 * a drawing on the page that the user did not just make.
 */
export function parseParked(raw: string | null, now: number): ParkedReading | null {
  if (!raw) return null
  let v: unknown
  try { v = JSON.parse(raw) } catch { return null }
  if (!isObj(v) || typeof v.id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(v.id)) return null
  if (!isNum(v.at) || now - v.at > READING_PARK_MS || v.at - now > 5_000) return null
  if (!Array.isArray(v.strokes) || v.strokes.length === 0 || !v.strokes.every(isStroke)) return null
  const notes = Array.isArray(v.notes) ? v.notes : []
  if (!notes.every(isNote)) return null
  const instant = typeof v.instant === 'string' ? v.instant : null
  return { id: v.id, at: v.at, strokes: v.strokes, notes, instant }
}

/**
 * The next free sequence number after restoring ids like 's12' / 'n3', so a
 * stroke drawn after the reload never reuses the id of one already on the page
 * (notes anchor to strokes by id).
 */
export function nextSeq(ids: string[], prefix: string, current: number): number {
  let n = current
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue
    const k = Number(id.slice(prefix.length))
    if (Number.isInteger(k) && k >= n) n = k + 1
  }
  return n
}

/** What to tell the user about a reading that could not be collected. */
export type ResumeOutcome = 'done' | 'lost' | 'expired' | 'superseded'

export function lostSentence(why: 'lost' | 'expired'): string {
  return why === 'lost'
    ? 'the page reloaded and the dev server no longer has that reading (was it restarted?). Your drawing is back: press ▶ Run to read it again'
    : 'the reading took too long to come back after the reload. Your drawing is back: press ▶ Run to read it again'
}
