/**
 * "4 rows, title + grey line": every row gets every part (n24).
 *
 * r2 e3 settings (n22): a whole-sketch note said each of the four rows is a
 * title plus a grey line, and gave only the titles. The build made four
 * titles and dropped every grey line, because nothing was typed for them. A
 * person writing "title + grey line" means each row has both, stacked; the
 * words of the second line are not the point, its presence and look are.
 */
const ROWISH = /\b(rows?|items?|entries|cards?|lines?|each|every|list)\b/i
const JOIN = /\s*(?:\+|\bplus\b|&)\s*/i

export interface RowParts { note: string; parts: string[] }

export function rowParts(notes: string[]): RowParts[] {
  const out: RowParts[] = []
  for (const note of notes) {
    if (!ROWISH.test(note)) continue
    // "4 rows, title + grey line: Email..." -> the clause with the plus signs, cut at them
    const clause = note.split(/[,:;()]/).find((c) => JOIN.test(c))
    if (!clause) continue
    const words = (p: string) => p.trim().split(/\s+/).filter((w) => /^[a-z-]+$/i.test(w) && (!ROWISH.test(w) || /^lines?$/i.test(w)))
    const bits = clause.split(JOIN)
    const parts = bits.map((p, k) => (k === 0 ? words(p).slice(-2) : words(p).slice(0, 3)).join(' ')).filter(Boolean)
    if (parts.length >= 2) out.push({ note, parts })
  }
  return out
}

export function rowPartsBrief(notes: string[]): string {
  const found = rowParts(notes)
  if (!found.length) return ''
  return `EVERY ROW HAS ALL ITS PARTS. The user typed what each row is made of:\n` +
    found.map((f) => `- "${f.note}": every row gets ${f.parts.map((p) => `a ${p}`).join(' and ')}, stacked in that order`).join('\n') +
    `\nBuild every part in every row, even where only the first part's words were typed: a part with no words ` +
    `typed gets one short plain placeholder in the look named (a "grey line" is one short grey sentence, smaller ` +
    `than the title, right under it). Never leave a named part out of any row.\n\n`
}

/**
 * n25 (r2 e3 settings, n22 and n24): every on toggle was built with its knob
 * past the end of its track (translate-x larger than the track allows). When
 * a note names a toggle or switch, codegen is told the arithmetic once.
 */
const TOGGLE = /\b(toggles?|switch(es)?)\b/i

export function toggleBrief(notes: string[]): string {
  if (!notes.some((n) => TOGGLE.test(n))) return ''
  return `TOGGLES: a toggle is a rounded track with a round knob that always stays INSIDE the track. ` +
    `Give the track position: relative and an exact width and height (the drawn box), and the knob an exact ` +
    `size (track height minus 2 * inset, inset 2-3px), absolutely placed at top: inset, left: inset. On, it moves ` +
    `right by exactly track width - knob width - 2 * inset px (for a 44x24 track and 20px knob with 2px inset: ` +
    `translate-x-[20px]), never more. Do not use a Tailwind translate step that does not match that number.\n\n`
}
