/**
 * n213: a fix that breaks one part puts back only that part.
 *
 * Until now a fix that emptied one piece of text, ran two pieces together or copied one into another place
 * had its whole edit thrown away (r46 c4: "white lines only" read right and was lost because of one line of
 * copy). Here the fix's edit is split into hunks against the page as it was, and only the hunks that hold the
 * broken words go back. No model is asked. The caller checks the page again and falls back to the whole
 * put-back when that does not clear it, so a wrong guess here costs a re-check and nothing else.
 */
import type { FixVerdict } from './fixcheck.js'

export interface FilePair { rel: string; old: string; now: string }
export interface Hunk { oldStart: number; oldEnd: number; newStart: number; newEnd: number }

/** Past this many lines either side the diff is not worth holding in memory: the whole put-back still works. */
const MAX_LINES = 4000
/** Hunks this close are one edit: a changed class line and the text two lines down. */
const JOIN_GAP = 2

export function diffHunks(a: readonly string[], b: readonly string[]): Hunk[] {
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const n = a.length - pre - suf, m = b.length - pre - suf
  if (n === 0 && m === 0) return []
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    lcs[i]![j] = a[pre + i] === b[pre + j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  }
  const raw: Hunk[] = []
  let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[pre + i] === b[pre + j]) { i++; j++; continue }
    const h: Hunk = { oldStart: pre + i, oldEnd: pre + i, newStart: pre + j, newEnd: pre + j }
    while ((i < n || j < m) && !(i < n && j < m && a[pre + i] === b[pre + j])) {
      if (j >= m || (i < n && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) { i++; h.oldEnd = pre + i } else { j++; h.newEnd = pre + j }
    }
    raw.push(h)
  }
  const joined: Hunk[] = []
  for (const h of raw) {
    const last = joined[joined.length - 1]
    if (last && h.oldStart - last.oldEnd <= JOIN_GAP) { last.oldEnd = h.oldEnd; last.newEnd = h.newEnd } else joined.push({ ...h })
  }
  return joined
}

/** Opens minus closes of brackets and JSX tags: a hunk whose two sides differ here is not a whole piece of the tree. */
function net(lines: readonly string[]): string {
  const s = lines.join('\n')
  const count = (re: RegExp): number => (s.match(re) ?? []).length
  return [
    count(/\{/g) - count(/\}/g),
    count(/\(/g) - count(/\)/g),
    count(/\[/g) - count(/\]/g),
    count(/<[A-Za-z]/g) - count(/<\//g) - count(/\/>/g),
  ].join(',')
}

const squash = (s: string): string => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()

/** What to look for in the source: the words whole, then their first and last four (a long text may be split over lines or joined from parts). */
function keysOf(text: string): string[] {
  const words = squash(text).split(' ').filter(Boolean)
  const keys = [words.join(' ')]
  if (words.length > 4) keys.push(words.slice(0, 4).join(' '), words.slice(-4).join(' '))
  return keys
}

const hasKey = (lines: readonly string[], keys: readonly string[]): boolean => {
  const s = squash(lines.join(' '))
  return keys.some((k) => s.includes(k))
}

const lineSets = (lines: readonly string[], keys: readonly string[]): number[] => {
  const out: number[] = []
  lines.forEach((l, k) => { const s = squash(l); if (keys.some((x) => s.includes(x))) out.push(k) })
  return out
}

/** The broken parts a fix check named, or null when one of them cannot be mended by putting source back. */
function brokenKeys(v: FixVerdict): { gone: string[][]; extra: string[][]; touching: string[][] } | null {
  // a panel it was told to take away is still there: nothing to put back, the note just did not happen
  if (v.noFill.length) return null
  return {
    gone: (v.lost ?? []).map((l) => keysOf(l.text)),
    extra: (v.copied ?? []).map((c) => keysOf(c.text)),
    touching: v.overlaps.flatMap((o) => [keysOf(o.a), keysOf(o.b)]),
  }
}

export interface PartBack {
  /** The files as they should now read. */
  files: Array<{ rel: string; content: string }>
  /** Edits put back and edits kept, across all files. */
  undone: number
  kept: number
}

/**
 * The fix with only its broken parts put back, or null when that is not possible: a part cannot be found in the
 * source, a part is not a whole piece of the tree, or every edit would go back (that is the whole put-back).
 */
export function partBack(pairs: readonly FilePair[], verdict: FixVerdict): PartBack | null {
  const broken = brokenKeys(verdict)
  if (!broken) return null
  const wanted = [...broken.gone, ...broken.extra, ...broken.touching]
  if (!wanted.length) return null
  const found = new Set<number>()
  const files: PartBack['files'] = []
  let undone = 0, kept = 0
  for (const p of pairs) {
    const a = p.old.split('\n'), b = p.now.split('\n')
    if (a.length > MAX_LINES || b.length > MAX_LINES) { kept++; continue }
    const hunks = diffHunks(a, b)
    const picked = new Set<number>()
    hunks.forEach((h, k) => {
      const was = a.slice(h.oldStart, h.oldEnd), is = b.slice(h.newStart, h.newEnd)
      broken.gone.forEach((keys) => { if (hasKey(was, keys)) { picked.add(k); found.add(wanted.indexOf(keys)) } })
      broken.extra.forEach((keys) => { if (hasKey(is, keys)) { picked.add(k); found.add(wanted.indexOf(keys)) } })
      // text that now touches other text was often moved by a class line just above it, not by a change to its words
      broken.touching.forEach((keys) => {
        const near = lineSets(b, keys).some((l) => l >= h.newStart - JOIN_GAP && l < h.newEnd + JOIN_GAP)
        if (near) { picked.add(k); found.add(wanted.indexOf(keys)) }
      })
    })
    for (const k of picked) if (net(a.slice(hunks[k]!.oldStart, hunks[k]!.oldEnd)) !== net(b.slice(hunks[k]!.newStart, hunks[k]!.newEnd))) return null
    undone += picked.size
    kept += hunks.length - picked.size
    if (!picked.size) continue
    // from the bottom up, so earlier line numbers stay true
    const out = [...b]
    for (const k of [...picked].sort((x, y) => y - x)) {
      const h = hunks[k]!
      out.splice(h.newStart, h.newEnd - h.newStart, ...a.slice(h.oldStart, h.oldEnd))
    }
    files.push({ rel: p.rel, content: out.join('\n') })
  }
  if (!undone || !kept) return null
  // an emptied or copied part that is nowhere in an edit cannot be mended from here
  if ([...broken.gone, ...broken.extra].some((keys) => !found.has(wanted.indexOf(keys)))) return null
  return { files, undone, kept }
}

/** The part a person is told about, in their words. */
export function brokenPartName(v: FixVerdict): string {
  if (v.lost?.length) return `"${v.lost[0]!.text.slice(0, 30)}"`
  if (v.copied?.length) return `the extra "${v.copied[0]!.text.slice(0, 30)}"`
  if (v.overlaps.length) return `"${v.overlaps[0]!.a.slice(0, 30)}"`
  return 'that part'
}
