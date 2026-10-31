/**
 * A note listing label-value pairs is a panel's rows, one line each, from just under its heading (n133).
 *
 * Round 39 e4 (vet booking, n127-n131): the person drew a tall Summary panel with only a heading line and a button at
 * its foot, and typed one note: "Pet Biscuit, Date Tue 15 Dec, Time 10:30, Vet Dr. Okafor, Fee €45". The target is a
 * plain summary: five rows, the label at the left and its value at the right on the same line, starting right under
 * the heading. In 2 of 4 builds the value was stacked under its label (ten lines, not five rows) and the rows began
 * a third of the way down the panel, spread to fill it. Nothing told the build the note's shape, and nothing checked it.
 *
 * A person writing "Label Value, Label Value, ..." on a panel means a details list. Here such a note is read as
 * pairs: 3 to 8 comma items, each a capitalised one-word label (two words when the second is lower case: "Due date")
 * and a short value of 1 to 5 words, labels all different, and at least half the values holding a digit, a currency
 * sign or a capital (a name, a date, a price). A comma list of one form ("Mon 14, Tue 15", n130) is not this, and
 * neither is a list split by semicolons (n119 legends).
 *
 * The build is told: one row per pair in typed order, label left and value right-aligned on ONE line, the rows from
 * just under the panel's heading at a steady pitch, spare panel height left empty below them. Checked on the page:
 * each label and its value are both there, on one line (never stacked, never one run of text), the value to the
 * label's right, rows in typed order at a pitch of at most 64px, and (when the panel's drawn box is known) the first
 * row in the panel's top part. Zero tokens.
 */
interface Box { x: number; y: number; w: number; h: number }
interface NodeLike { rect: Box; text?: string; textBox?: Box }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
interface ActionLike { notes?: string[]; region?: Box; dest?: { rect?: Box }; kind?: string; onScreen?: unknown }

export interface Pair { label: string; value: string }
export interface PairNote { note: string; pairs: Pair[]; panel: Box | null }
export interface PairRowsVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export const PAIR_PITCH_MAX_PX = 64
const r = Math.round
const q = (s: string) => `"${s}"`
const LOOK = /^(big|small|bold|light|dark|grey|gray|muted|right|left|top|bottom|centred|centered|aligned|rows?|lines?|dividers?|thin|each|every)$/i

function onePair(item: string): Pair | null {
  const ws = item.trim().split(/\s+/)
  if (ws.length < 2 || ws.length > 7) return null
  let n = 1
  if (ws.length >= 3 && /^[a-z]{2,10}$/.test(ws[1]!) && !/^(of|and|or|to|in|on|at|the|a)$/.test(ws[1]!)) n = 2
  const label = ws.slice(0, n).join(' '), value = ws.slice(n).join(' ')
  if (!/^\p{Lu}[\p{L}'-]{1,13}$/u.test(ws[0]!)) return null
  const vw = value.split(/\s+/)
  if (!vw.length || vw.length > 5) return null
  if (ws.slice(0, n).some((w) => LOOK.test(w))) return null
  if (vw.every((w) => LOOK.test(w))) return null
  return { label, value }
}

/** The pairs of a "Label Value, Label Value, ..." note, or null. */
export function pairList(text: string): Pair[] | null {
  if (/[;\n·•|/]/.test(text) || !/,\s/.test(text)) return null
  const items = text.split(/,\s+/).map((t) => t.trim()).filter(Boolean)
  if (items.length < 3 || items.length > 8) return null
  // one form throughout (n130's day row: "Mon 14, Tue 15, ..."): a row of items, not label-value pairs
  const counts = items.map((t) => t.split(/\s+/).length)
  if (new Set(counts).size === 1 && counts[0]! <= 3 && new Set(items.map((t) => /\d/.test(t))).size === 1) return null
  const pairs = items.map(onePair)
  if (pairs.some((p) => !p)) return null
  const ps = pairs as Pair[]
  if (new Set(ps.map((p) => p.label.toLowerCase())).size !== ps.length) return null
  const strong = ps.filter((p) => /[\d€$£¥%]|^\p{Lu}/u.test(p.value)).length
  if (strong * 2 < ps.length) return null
  return ps
}

/** Every pair note, with the drawn panel it was typed on when known. */
export function pairNotes(actions: readonly ActionLike[], loose: readonly string[] = []): PairNote[] {
  const out: PairNote[] = []
  const seen = new Set<string>()
  for (const a of actions) {
    if (a.onScreen) continue
    for (const t of a.notes ?? []) {
      if (seen.has(t)) continue
      const pairs = pairList(t)
      if (!pairs) continue
      seen.add(t)
      const reg = a.region ?? a.dest?.rect ?? null
      // a panel: tall enough to hold the rows (a note bound to a small field or the whole page is no panel)
      const panel = reg && reg.h >= 24 * pairs.length && reg.h <= 1400 && reg.w >= 120 ? reg : null
      out.push({ note: t, pairs, panel })
    }
  }
  for (const t of loose) {
    if (seen.has(t)) continue
    const pairs = pairList(t)
    if (!pairs) continue
    seen.add(t)
    out.push({ note: t, pairs, panel: null })
  }
  return out
}

export function pairRowsBrief(actions: readonly ActionLike[], loose: readonly string[] = []): string {
  const found = pairNotes(actions, loose)
  if (!found.length) return ''
  const lines = found.slice(0, 6).map((p) => {
    const rows = p.pairs.map((x, k) => `row ${String(k + 1)} = ${q(x.label)} left | ${q(x.value)} right`).join('; ')
    const at = p.panel
      ? ` It was typed on the panel drawn at x ${String(r(p.panel.x))}, y ${String(r(p.panel.y))}, ${String(r(p.panel.w))}x${String(r(p.panel.h))}: the first row's top no lower than y ${String(r(p.panel.y + Math.max(60, Math.min(110, 0.25 * p.panel.h))))} (right under the panel's heading), whatever the panel's height`
      : ''
    return `- ${q(p.note)}: ${String(p.pairs.length)} rows, in this order top to bottom: ${rows}.${at}.`
  })
  return `LABEL-VALUE ROWS (deterministic; checked on the page). A note lists a panel's details as label-value pairs:\n${lines.join('\n')}\n` +
    `Each pair is ONE row on ONE line: the label at the row's left (smaller, muted), its value on the same line at the row's right (right-aligned, darker), as two separate text items in a flex row with space-between; a thin divider between rows is fine. Never stack the value under its label, never print the commas or the pair as one run of words. The rows start right under the panel's heading (or its top padding when it has none) at a steady pitch of about 32-48px, and any spare height in the drawn panel stays empty below the rows (above any button pinned at its foot): never spread the rows out or push them down to fill it.\n\n`
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()
const cy = (b: Box) => b.y + b.h / 2

/** Each label and value present, on one line, value to the right; rows in order at a steady pitch near the panel top. */
export function verifyPairRows(actions: readonly ActionLike[], loose: readonly string[], after: Snap): PairRowsVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const found = pairNotes(actions, loose)
  if (!found.length) return { satisfied: true, unverifiable: true, reason: 'no label-value notes' }
  const L = after.nodes.filter((x) => (x.text ?? '').trim()).map((x) => ({ t: norm(x.text!), b: x.textBox ?? x.rect, raw: x.text! }))
  if (!L.length) return { satisfied: true, unverifiable: true, reason: 'no text on the page' }
  const problems: string[] = []
  let checked = 0
  for (const p of found) {
    const inPanel = (b: Box) => !p.panel || (cy(b) >= p.panel.y - 40 && cy(b) <= p.panel.y + p.panel.h + 40 && b.x + b.w / 2 >= p.panel.x - 40 && b.x + b.w / 2 <= p.panel.x + p.panel.w + 40)
    const pick = (s: string) => {
      const n = norm(s)
      const c = L.filter((l) => inPanel(l.b))
      return c.find((l) => l.t === n) ?? c.find((l) => l.t.replace(/[:.]$/, '') === n) ?? null
    }
    const rows: Array<{ y: number; top: number }> = []
    const bad: string[] = []
    for (const x of p.pairs) {
      const lab = pick(x.label), val = pick(x.value)
      if (!lab || !val) {
        const joined = L.find((l) => inPanel(l.b) && l.t.includes(norm(x.label)) && l.t.includes(norm(x.value)))
        if (joined) bad.push(`${q(joined.raw.slice(0, 40))} runs the label and value of ${q(`${x.label} ${x.value}`)} together: make them two text items, label left, value right on one line`)
        else bad.push(`${q(`${x.label} ${x.value}`)} is not on the page as a label ${q(x.label)} and a value ${q(x.value)}`)
        continue
      }
      const tol = Math.max(8, 0.6 * Math.max(lab.b.h, val.b.h))
      if (Math.abs(cy(lab.b) - cy(val.b)) > tol) bad.push(`${q(x.value)} sits ${String(r(cy(val.b) - cy(lab.b)))}px ${cy(val.b) > cy(lab.b) ? 'under' : 'over'} its label ${q(x.label)}: put them on ONE line (a flex row, label left, value right-aligned)`)
      else if (val.b.x + val.b.w <= lab.b.x + lab.b.w + 12) bad.push(`${q(x.value)} is not to the right of its label ${q(x.label)}: label left, value right-aligned on the same line`)
      rows.push({ y: cy(lab.b), top: Math.min(lab.b.y, val.b.y) })
    }
    checked++
    if (bad.length) { problems.push(...bad.slice(0, 3)); continue }
    if (rows.some((row, k) => k > 0 && row.y < rows[k - 1]!.y - 4)) { problems.push(`the rows of ${q(p.note.slice(0, 40))} are not in the typed order top to bottom`); continue }
    const gaps = rows.slice(1).map((row, k) => row.y - rows[k]!.y)
    const wide = gaps.findIndex((g) => g > PAIR_PITCH_MAX_PX)
    if (wide >= 0) problems.push(`the rows of ${q(p.note.slice(0, 40))} are spread out (${String(r(gaps[wide]!))}px from ${q(p.pairs[wide]!.label)} to ${q(p.pairs[wide + 1]!.label)}, at most ${String(PAIR_PITCH_MAX_PX)}): keep a steady pitch of about 32-48px and leave the spare panel height empty below them`)
    if (p.panel) {
      const lim = p.panel.y + Math.max(90, Math.min(140, 0.3 * p.panel.h))
      if (rows[0]!.top > lim) problems.push(`the first row ${q(p.pairs[0]!.label)} starts at y ${String(r(rows[0]!.top))}, ${String(r(rows[0]!.top - p.panel.y))}px into the panel drawn at y ${String(r(p.panel.y))}: start the rows right under the panel's heading (top no lower than y ${String(r(lim))}) and leave the spare height empty below them`)
    }
  }
  if (!checked) return { satisfied: true, unverifiable: true, reason: 'nothing to check' }
  return problems.length
    ? { satisfied: false, reason: problems.slice(0, 5).join('; ') + '; change nothing else' }
    : { satisfied: true, reason: `${String(found.length)} label-value note${found.length > 1 ? 's' : ''} built as rows: label left, value right, one line each, near the panel top` }
}
