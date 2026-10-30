/**
 * n72: a fix can read the words typed earlier.
 *
 * Round 37 (hand, n98 / n102): the fix note "each row: name, small grey preview under", typed on a built
 * team chat, reached all four sidebar rows, but the build filled them with made-up copy ("#marketing",
 * "New mockups in review") although the person had typed every row's words before the first build
 * ("#design / New logo is up, Ravi Patel / sounds good, ..."). A fix run only saw its own notes; the
 * words from the sketch that built the page were gone.
 *
 * So:
 *  1. Every run already writes its typed notes to its run folder (notes.json). A run on a built page
 *     reads them back from the runs before it, and the build is told those words, each with where it
 *     was typed: a fix that needs copy takes it from the earlier note nearest its spot, never invents it.
 *  2. Measured on the page (zero tokens): copy that appears with the fix, was not on the page before,
 *     and whose words nobody typed (in this run or earlier) is a failure, sent to the repair rounds with
 *     the nearest earlier note to use instead.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DomNode, DomSnapshot } from '@s2c/dom'

export interface EarlierNote { text: string; x?: number; y?: number }

/** Notes typed in the runs before `currentRunId` (newest runs first, at most `maxRuns`), words de-duplicated. */
export function earlierNotes(runsDir: string, currentRunId: string, maxRuns = 4): EarlierNote[] {
  if (!existsSync(runsDir)) return []
  let dirs: string[]
  try { dirs = readdirSync(runsDir).filter((d) => d.startsWith('run-') && d !== currentRunId) } catch { return [] }
  const stamp = (d: string): number => Number(/^run-(\d+)/.exec(d)?.[1] ?? 0)
  const mine = stamp(currentRunId)
  dirs = dirs.filter((d) => !mine || stamp(d) < mine).sort((a, b) => stamp(b) - stamp(a))
  const out: EarlierNote[] = []
  const seen = new Set<string>()
  let used = 0
  for (const d of dirs) {
    if (used >= maxRuns) break
    const f = join(runsDir, d, 'notes.json')
    if (!existsSync(f)) continue
    let raw: unknown
    try { raw = JSON.parse(readFileSync(f, 'utf8')) } catch { continue }
    if (!Array.isArray(raw)) continue
    used++
    for (const n of raw) {
      const text = typeof n === 'string' ? n : (n && typeof n === 'object' && typeof (n as { text?: unknown }).text === 'string') ? (n as { text: string }).text : ''
      const t = text.replace(/\s+/g, ' ').trim()
      if (!t || seen.has(t.toLowerCase())) continue
      seen.add(t.toLowerCase())
      const at = (n as { at?: { x?: unknown; y?: unknown } })?.at
      out.push(at && typeof at.x === 'number' && typeof at.y === 'number' ? { text: t, x: Math.round(at.x), y: Math.round(at.y) } : { text: t })
    }
  }
  return out.slice(0, 40)
}

/** The brief a fix run gets: the words typed earlier, where, and the rule to use them. */
export function earlierNotesBrief(earlier: readonly EarlierNote[]): string {
  if (!earlier.length) return ''
  const lines = earlier.map((n) => `- ${n.x !== undefined ? `at (${n.x}, ${n.y}): ` : ''}"${n.text.slice(0, 200)}"`)
  return (
    `WORDS TYPED EARLIER FOR THIS PAGE (the notes from the sketch that built it, with the page spot each was typed at):\n` +
    lines.join('\n') + '\n' +
    `When a fix note asks for copy (names, previews, titles, labels, messages) on something that has none or the wrong ` +
    `words, take the words from the earlier note typed nearest that spot: a list split by "/" or "," gives one member ` +
    `each, in order, top to bottom. Never make up copy: new words that nobody typed are measured and sent back.\n\n`
  )
}

const STOP = new Set(['the', 'and', 'for', 'you', 'are', 'with', 'this', 'that', 'from', 'your', 'our', 'all', 'new', 'now', 'one', 'not', 'but', 'has', 'have', 'was', 'can', 'its', 'out', 'top', 'off', 'per'])
const toks = (s: string): string[] => (s.toLowerCase().match(/#?[\p{L}][\p{L}'’-]{2,}/gu) ?? []).map((t) => t.replace(/[’']s$/, '')).filter((t) => !STOP.has(t.replace(/^#/, '')))

/** Notes that allow invented words: "sample rows", "placeholder", "any names". */
const ALLOWS_MADE_UP = /\b(?:sample|placeholder|lorem|made[- ]up|fake|example|dummy|any (?:names?|text|words|copy)|filler|realistic)\b/i

export interface InventedCopy { text: string; near?: EarlierNote }

/**
 * Copy new with the fix whose words nobody typed. Only text that was not on the page before counts; a
 * piece is invented when at least two of its words, and most of them, are in no note and nowhere on the
 * page before. Each comes with the earlier note typed nearest it, the words it should have used.
 */
export function inventedCopy(before: DomSnapshot, after: DomSnapshot, typed: readonly string[], earlier: readonly EarlierNote[]): InventedCopy[] {
  if (!earlier.length) return []
  const all = [...typed, ...earlier.map((n) => n.text)]
  if (all.some((t) => ALLOWS_MADE_UP.test(t))) return []
  const vocab = new Set<string>()
  for (const t of all) for (const w of toks(t)) vocab.add(w.replace(/^#/, ''))
  const textOf = (n: DomNode): string => (n.text ?? '').replace(/\s+/g, ' ').trim()
  for (const n of before.nodes) for (const w of toks(textOf(n))) vocab.add(w.replace(/^#/, ''))
  const beforeAll = before.nodes.map(textOf).join(' \u0001 ').toLowerCase()
  const known = (w: string): boolean => {
    const b = w.replace(/^#/, '')
    if (vocab.has(b)) return true
    // plural / tense slack: "tickets" vs "ticket", "fixed" vs "fix"
    for (const v of [b.replace(/(?:es|s|ed|ing)$/, ''), b + 's']) if (v.length >= 3 && vocab.has(v)) return true
    return false
  }
  const out: InventedCopy[] = []
  const seen = new Set<string>()
  for (const n of after.nodes) {
    if (!n.srcLoc) continue
    const key = textOf(n)
    if (key.length < 4 || key.length > 160) continue
    const b = n.textBox ?? n.rect
    if (b.w < 2 || b.h < 4) continue
    if (n.style.opacity && Number(n.style.opacity) < 0.15) continue
    const k = key.toLowerCase()
    if (seen.has(k) || beforeAll.includes(k)) continue
    // a parent whose text is only its children's: judged once, on the leaves
    if (after.nodes.some((c) => c.parent === n.id && textOf(c) === key)) continue
    seen.add(k)
    const ws = toks(key)
    const unknown = ws.filter((w) => !known(w))
    if (unknown.length < 2 || unknown.length / ws.length < 0.6) continue
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2
    const placed = earlier.filter((e) => e.x !== undefined)
    const near = placed.sort((p, q) => Math.hypot(p.x! - cx, p.y! - cy) - Math.hypot(q.x! - cx, q.y! - cy))[0]
    out.push(near ? { text: key, near } : { text: key })
  }
  return out.slice(0, 6)
}

export function inventedFailures(found: readonly InventedCopy[]): string[] {
  return found.map((f) => `page (fix check): "${f.text.slice(0, 50)}" is new copy nobody typed.` +
    (f.near ? ` Use the words typed earlier near it: "${f.near.text.slice(0, 120)}" (one member each, in order).` : ' Use the words from the earlier notes, never made-up ones.'))
}
