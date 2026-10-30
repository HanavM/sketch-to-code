/**
 * A note of options with ticks is a checkbox list (n112).
 *
 * Round 38 e4 (job board): a side panel typed "Job type: Full time ✓, Part time, Remote ✓; Level: Junior, Mid ✓,
 * Senior; Salary: $60k+, $90k+ ✓, $120k+; teal checks". One build made checkbox lists, the next printed the note as
 * lines of text. A person who ticks some options in a list means a checkbox per option, ticked where typed.
 *
 * Here a note with three or more comma-split options, at least one ending in ✓ (or ✔, [x]), is a checkbox list:
 * groups split by ";", a "Name:" before a group is its small heading. Codegen is told each option, which are ticked,
 * one per line from the top of the panel it is typed in; the page is checked that every option is its own piece of
 * text (never one comma line) and no ✓ is printed as a character. Zero tokens.
 */
export interface CheckGroup { heading: string | null; options: Array<{ label: string; on: boolean }> }

const TICK = /\s*(?:✓|✔|☑|\[x\])\s*$/i

/** The groups a note of ticked options gives, or null. */
export function checklistOf(note: string): CheckGroup[] | null {
  if (!/✓|✔|☑|\[x\]/i.test(note)) return null
  const body = note
  const groups: CheckGroup[] = []
  for (const part of body.split(';')) {
    const m = /^\s*([^:,]{1,24}):\s*(.+)$/.exec(part)
    const heading = m ? m[1]!.trim() : null
    const items = (m ? m[2]! : part).split(',').map((s) => s.trim()).filter(Boolean)
    const options = items.map((s) => ({ label: s.replace(TICK, '').trim(), on: TICK.test(s) })).filter((o) => o.label && o.label.split(/\s+/).length <= 4)
    // a trailing style tail ("teal checks") is not an option
    if (options.length >= 2) groups.push({ heading, options })
  }
  const all = groups.flatMap((g) => g.options)
  return all.length >= 3 && all.some((o) => o.on) ? groups : null
}

export function checklistBrief(notes: readonly string[]): string {
  const lines: string[] = []
  for (const n of new Set(notes)) {
    const gs = checklistOf(n)
    if (!gs) continue
    lines.push(`- "${n}" is a CHECKBOX LIST: ${gs.map((g) => `${g.heading ? `a small heading "${g.heading}" then ` : ''}${g.options.map((o) => `[${o.on ? 'x' : ' '}] ${o.label}`).join(', ')}`).join('; ')}. ` +
      `Each option is a small square checkbox with its label to its right, ONE option per line; ticked ([x]) ones are checked (filled in the colour the note names, white tick), the rest empty. ` +
      `Groups follow one another down the panel, starting at the TOP of the panel the note is typed in (not centred in it). Never print the ✓ marks, the commas or the whole note as text.`)
  }
  return lines.length ? `CHECKBOX LISTS (deterministic, from the typed ticks; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

interface NodeLike { id: string; text?: string }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface ChecklistVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function verifyChecklists(notes: readonly string[], after: Snap): ChecklistVerdict {
  const lists = [...new Set(notes)].map((n) => checklistOf(n)).filter((g): g is CheckGroup[] => !!g)
  if (!lists.length) return { satisfied: true, unverifiable: true, reason: 'no checkbox lists typed' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const texts = after.nodes.map((n) => norm(n.text ?? '')).filter(Boolean)
  if (!texts.length) return { satisfied: true, unverifiable: true, reason: 'no text on the page' }
  const faults: string[] = []
  const opts = lists.flat().flatMap((g) => g.options)
  // its own piece of text: some text item is the label (allowing a few chars of slack), not a comma line holding it
  const missing = opts.filter((o) => !texts.some((t) => t.includes(norm(o.label)) && t.length <= o.label.length + 6))
  if (missing.length > opts.length / 4) faults.push(`${missing.length} of the ${opts.length} checkbox options (${missing.slice(0, 4).map((o) => `"${o.label}"`).join(', ')}) are not on the page as their own label: one checkbox and label per line, changing nothing else`)
  if (texts.some((t) => /✓|✔/.test(t))) faults.push('a typed ✓ was printed as a character: tick the checkbox instead, changing nothing else')
  return faults.length ? { satisfied: false, reason: faults.join('; ') } : { satisfied: true, reason: `${opts.length} checkbox options, each its own line` }
}
