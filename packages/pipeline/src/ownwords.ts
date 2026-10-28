/**
 * The first build keeps to the words people typed, and never stacks words on words (n41).
 *
 * Round 32 c2 (roastery, n39 try 2): the heading note "Small batch, roasted on Thursdays." was drawn as
 * three lines; the note bound to two of them. The third, unnoted line got copy nobody typed
 * ("Fresh-roasted, thoughtfully sourced"), built right on top of the heading's last line. No check
 * looked: the fix check (n37) only catches overlaps a fix creates, and a first build starts from a
 * blank page. A person then spent a fix note on it.
 *
 * Two zero-token checks on every build, measured on the page after it:
 *
 *  1. Words run into words. Two pieces of text (neither inside the other) whose letter boxes overlap
 *     by a quarter of the smaller one fail, unless they already did before the run.
 *  2. Words nobody typed. A new piece of text of two or more words, where fewer than a third of its
 *     words appear in anything the user typed, fails when it runs into other text (rule 1) or sits on
 *     no drawn mark at all (no line, box or ring under or around it). Untyped words on a drawn line
 *     with room of their own are left alone: a drawn line with no note still says "text here".
 */
import type { BBox } from '@s2c/ink'

interface NodeLike { id: string; parent?: string | null; rect: BBox; text?: string; textBox?: BBox; style?: { opacity?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
interface MarkLike { box: BBox }
export interface OwnWordsVerdict { satisfied: boolean; unverifiable?: boolean; reason: string; invented?: string[]; overlaps?: Array<{ a: string; b: string; share: number }> }

const say = (n: NodeLike) => (n.text ?? '').replace(/\s+/g, ' ').trim()
const boxOf = (n: NodeLike): BBox => n.textBox ?? n.rect

function inter(a: BBox, b: BBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}
const share = (a: BBox, b: BBox) => { const i = inter(a, b); return i ? i / Math.max(1, Math.min(a.w * a.h, b.w * b.h)) : 0 }

/** Lower-case word stems worth matching: letters or digits, two characters or more. */
export function wordsOf(s: string): string[] {
  return (s.toLowerCase().normalize('NFKD').match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 2)
}

function pieces(snap: Snap) {
  const seen = new Set<string>()
  const out: Array<{ key: string; node: NodeLike; box: BBox }> = []
  for (const n of snap.nodes) {
    const key = say(n)
    if (key.length < 2 || seen.has(key)) continue
    const b = boxOf(n)
    if (b.w < 2 || b.h < 4) continue
    if (n.style?.opacity && Number(n.style.opacity) < 0.15) continue
    seen.add(key)
    out.push({ key, node: n, box: b })
  }
  return out
}

function ancestor(byId: Map<string, NodeLike>, a: NodeLike, b: NodeLike): boolean {
  for (let p = b.parent; p; p = byId.get(p)?.parent ?? null) if (p === a.id) return true
  return false
}

/** Is a piece of text on some drawn mark: its middle inside a mark's box grown by about a line? */
function onMark(b: BBox, marks: readonly MarkLike[]): boolean {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const pad = Math.max(24, Math.min(60, b.h))
  return marks.some(({ box: m }) => cx >= m.x - pad && cx <= m.x + m.w + pad && cy >= m.y - pad && cy <= m.y + m.h + pad)
}

export function verifyOwnWords(typed: readonly string[], marks: readonly MarkLike[], before: Snap, after: Snap): OwnWordsVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const vocab = new Set(typed.flatMap(wordsOf))
  const now = pieces(after)
  if (!now.length) return { satisfied: true, unverifiable: true, reason: 'no text on the page' }
  const was = new Map(pieces(before).map((t) => [t.key, t]))
  const byId = new Map(after.nodes.map((n) => [n.id, n]))

  // rule 1: words on words
  const overlaps: Array<{ a: string; b: string; share: number }> = []
  const hit = new Set<string>()
  for (let i = 0; i < now.length; i++) {
    for (let j = i + 1; j < now.length; j++) {
      const A = now[i]!, B = now[j]!
      if (ancestor(byId, A.node, B.node) || ancestor(byId, B.node, A.node)) continue
      const s = share(A.box, B.box)
      if (s < 0.25) continue
      const a0 = was.get(A.key), b0 = was.get(B.key)
      if (a0 && b0 && share(a0.box, b0.box) >= 0.125) continue // they touched before this run
      overlaps.push({ a: A.key, b: B.key, share: Math.round(s * 100) / 100 })
      hit.add(A.key); hit.add(B.key)
    }
  }

  // rule 2: words nobody typed (only judged when the user typed something to compare with)
  const invented: string[] = []
  if (vocab.size) {
    for (const t of now) {
      if (was.has(t.key)) continue
      const w = wordsOf(t.key)
      if (w.length < 2) continue
      const known = w.filter((x) => vocab.has(x)).length
      if (known / w.length >= 1 / 3) continue
      if (hit.has(t.key) || !onMark(t.box, marks)) invented.push(t.key)
    }
  }

  const q = (s: string) => `"${s.slice(0, 48)}"`
  const lines: string[] = []
  for (const k of invented.slice(0, 4)) {
    const runs = overlaps.find((o) => o.a === k || o.b === k)
    const other = runs ? (runs.a === k ? runs.b : runs.a) : null
    lines.push(other
      ? `${q(k)} is words nobody typed, built on top of ${q(other)}. Take it out: if a drawn line was left for it, that line belongs to the typed text next to it (let that text run onto it)`
      : `${q(k)} is words nobody typed, on no drawn mark. Take it out`)
  }
  for (const o of overlaps.slice(0, 4)) {
    if (invented.includes(o.a) || invented.includes(o.b)) continue
    lines.push(`${q(o.a)} runs into ${q(o.b)} (${String(Math.round(o.share * 100))}% of the smaller one covered). Keep both where drawn but size or space them so they do not touch`)
  }
  if (!lines.length) return { satisfied: true, reason: 'only typed words, none on top of each other', invented, overlaps }
  return { satisfied: false, reason: lines.join('; '), invented, overlaps }
}
