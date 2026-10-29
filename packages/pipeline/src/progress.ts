/**
 * A line noted as a progress bar is a track with that much filled (n92).
 *
 * Round 36 e3 (timesheet, n87 and n91 twice): a purple line was drawn under "Weekly target" and noted
 * "progress bar 82%, grey track to the end; 41 of 50 hours logged". Every build printed a big "82%" heading
 * over a thin purple rule: the number was read as copy and the bar as a divider. A person who types
 * "progress bar 82%" means a bar: a pale track across the drawn width with 82% of it filled in the line's
 * colour, and the percent is how full it is, not a word to print.
 *
 * Here: a note that names a progress bar (or meter, gauge bar, completion bar) with a percent, or "N of M",
 * is read as {pct}. The build is told the track and the fill, and that the percent is never printed as big text
 * (a small caption the note typed, like "41 of 50 hours logged", stays). Checked on the page: a thin track and
 * a fill on the same line whose width is about pct of the track, and no big "82%" text. Zero tokens.
 */

export interface ProgressNote { note: string; pct: number; caption: string | null }

const BAR = /\b(progress(?:\s+bar)?|meter|gauge|completion\s+bar|fill(?:ed)?\s+bar|loading\s+bar|bar\s+(?:filled|full))\b/i
const PCT = /(\d{1,3}(?:\.\d+)?)\s*%/
const OF = /\b(\d{1,5}(?:\.\d+)?)\s+(?:of|\/|out of)\s+(\d{1,5}(?:\.\d+)?)\b/i

/** "progress bar 82%, grey track; 41 of 50 hours logged" → {pct: 82, caption: "41 of 50 hours logged"}. */
export function progressOf(note: string): ProgressNote | null {
  if (!BAR.test(note)) return null
  const p = PCT.exec(note)
  const o = OF.exec(note)
  let pct: number | null = p ? Number(p[1]) : null
  if (pct === null && o && Number(o[2]) > 0) pct = Math.round((Number(o[1]) / Number(o[2])) * 100)
  if (pct === null || !(pct >= 0 && pct <= 100)) return null
  // a caption typed with it: the clause holding "N of M ..." that is not the bar clause itself
  const clauses = note.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
  const caption = clauses.find((c) => OF.test(c) && !BAR.test(c) && !PCT.test(c)) ?? null
  return { note, pct, caption }
}

export function progressAll(notes: readonly string[]): ProgressNote[] {
  const seen = new Set<string>()
  return notes.map(progressOf).filter((d): d is ProgressNote => !!d && !seen.has(d.note) && !!seen.add(d.note))
}

const q = (s: string) => `"${s}"`

export function progressBrief(notes: readonly string[]): string {
  const found = progressAll(notes)
  if (!found.length) return ''
  const lines = found.slice(0, 4).map((d) =>
    `- ${q(d.note)}: a PROGRESS BAR on the line drawn for it: a track about 8-10px tall, rounded, as long as the drawn line ` +
    `(pale grey unless a track colour is typed), and inside it a fill of the same height from the left edge to ${String(d.pct)}% of the track's width, ` +
    `in the drawn line's colour (its pen colour). The ${String(d.pct)}% is how full the bar is: never print "${String(d.pct)}%" as a heading or big number ` +
    `(only as small text if the note asks for a label)` + (d.caption ? `; ${q(d.caption)} is a small grey caption just under the bar` : '') + '.')
  return `PROGRESS BARS (deterministic; checked on the page). A line noted as a progress bar with a percent is a bar, not a rule with a number:\n${lines.join('\n')}\n` +
    `Build the track and the fill as two plain elements (a div with a child div, width set in %), not an SVG, a <progress> element or text.\n\n`
}

// ---- check -------------------------------------------------------------------------------------------------

interface NodeLike { id: string; rect: { x: number; y: number; w: number; h: number }; text?: string; style?: { backgroundColor?: string; backgroundImage?: string; fontSize?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface ProgressVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const painted = (n: NodeLike) => {
  const bg = n.style?.backgroundColor ?? ''
  return (!!bg && !/^transparent$|rgba\([^)]*,\s*0\)$/i.test(bg.replace(/\s+/g, ' '))) || !!n.style?.backgroundImage
}

/** A track with a fill about pct of its width, and no big printed percent. */
export function verifyProgress(notes: readonly string[], after: Snap): ProgressVerdict {
  const found = progressAll(notes)
  if (!found.length) return { satisfied: true, unverifiable: true, reason: 'no progress bar noted' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  const bars = after.nodes.filter((n) => painted(n) && n.rect.h >= 3 && n.rect.h <= 24 && n.rect.w >= 6)
  for (const d of found) {
    const pctText = new RegExp(`(^|\\D)${String(d.pct).replace('.', '\\.')}\\s*%`)
    const big = after.nodes.filter((n) => !!n.text && pctText.test(n.text) && (parseFloat(n.style?.fontSize ?? '0') >= 22))
    if (big.length) faults.push(`${q(d.note)}: "${String(d.pct)}%" is printed as big text (${big[0]!.style?.fontSize}); it is how full the bar is: remove the big number and show it as the bar's fill`)
    // a track (wide, thin) and a fill (same height band, starting at its left, about pct of its width)
    const ok = bars.some((t) => t.rect.w >= 80 && bars.some((f) => f !== t &&
      Math.abs(f.rect.x - t.rect.x) <= 6 && Math.abs((f.rect.y + f.rect.h / 2) - (t.rect.y + t.rect.h / 2)) <= 6 &&
      Math.abs(f.rect.w / t.rect.w - d.pct / 100) <= 0.08))
    if (d.caption) {
      const want = d.caption.toLowerCase().replace(/\s+/g, ' ')
      if (!after.nodes.some((n) => (n.text ?? '').toLowerCase().replace(/\s+/g, ' ').includes(want))) faults.push(`${q(d.caption)} was typed with the bar: show it as a small grey caption just under the bar`)
    }
    if (!ok) faults.push(`${q(d.note)}: no progress bar found (a thin track along the drawn line with a fill ${String(d.pct)}% of its width, starting at its left edge); build the track as a div and the fill as a child div with width ${String(d.pct)}%`)
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '; change nothing else' }
    : { satisfied: true, reason: `${String(found.length)} progress bar${found.length > 1 ? 's' : ''} built as track and fill` }
}
