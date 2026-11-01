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

/** n181: "...; Dogs, Adult, Medium checked orange": the options named before "checked" are the ticked ones. */
const TAIL = /^\s*(.+?)\s+(?:are\s+|is\s+)?(?:checked|ticked|selected|on)\b(.*)$/i
/** n181: "Animal (Dogs, Cats, Rabbits)": a heading word before a bracketed group of options. */
const PAREN = /([A-Za-z][\w\- ]{0,23}?)\s*\(([^()]+)\)/g

/** The groups a note of ticked options gives, or null. */
export function checklistOf(note: string): CheckGroup[] | null {
  const parts = note.split(';')
  // a last part naming options then "checked" (n181) marks those options, it is not a group
  let tailNames: Set<string> | null = null
  if (parts.length >= 2) {
    const m = TAIL.exec(parts[parts.length - 1]!)
    if (m && !/[()]/.test(m[1]!)) {
      tailNames = new Set(m[1]!.split(/,|\band\b/).map((s) => s.trim().toLowerCase()).filter(Boolean))
      parts.pop()
    }
  }
  if (!tailNames && !/✓|✔|☑|\[x\]/i.test(note)) return null
  const groups: CheckGroup[] = []
  const mk = (heading: string | null, itemsText: string) => {
    const items = itemsText.split(',').map((s) => s.trim()).filter(Boolean)
    const options = items.map((s) => {
      const label = s.replace(TICK, '').trim()
      return { label, on: TICK.test(s) || !!tailNames?.has(label.toLowerCase()) }
    }).filter((o) => o.label && o.label.split(/\s+/).length <= 4)
    if (options.length >= 2) groups.push({ heading, options })
  }
  const body = parts.join(';')
  const parens = [...body.matchAll(PAREN)]
  if (parens.length >= 1 && parens.every((m) => m[2]!.includes(','))) {
    for (const m of parens) mk(m[1]!.trim() || null, m[2]!)
  } else {
    for (const part of parts) {
      const m = /^\s*([^:,]{1,24}):\s*(.+)$/.exec(part)
      mk(m ? m[1]!.trim() : null, m ? m[2]! : part)
    }
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
      `Each option is a small square checkbox with its label to its right, ONE option per line; ticked ([x]) ones are checked (filled in the colour the note names, white tick); EVERY unticked option still gets its own EMPTY box, outlined in a clearly visible mid grey (about #b0b0b0, 1.5px; never a faint near-white line), so a person sees a box beside each option. ` +
      `Groups follow one another down the panel, starting at the TOP of the panel the note is typed in (not centred in it). Never print the ✓ marks, the word \"checked\", the commas or the whole note as text.`)
  }
  return lines.length ? `CHECKBOX LISTS (deterministic, from the typed ticks; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

interface NodeLike { id: string; text?: string; tag?: string; textBox?: { x: number; y: number; w: number; h: number }; rect?: { x: number; y: number; w: number; h: number }; style?: { border?: string; backgroundColor?: string } }
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
  // n181: every option, ticked or not, has a visible box just left of its label
  const boxFaults = optionBoxFaults(opts, after.nodes)
  if (boxFaults) faults.push(boxFaults)
  if (texts.some((t) => /✓|✔/.test(t))) faults.push('a typed ✓ was printed as a character: tick the checkbox instead, changing nothing else')
  return faults.length ? { satisfied: false, reason: faults.join('; ') } : { satisfied: true, reason: `${opts.length} checkbox options, each its own line` }
}

const rgbOf = (s: string | undefined): [number, number, number, number] | null => {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s ?? '')
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])] : null
}
/** A colour a person barely sees on white: every channel 216 or more, or mostly transparent. */
const faint = (c: [number, number, number, number] | null) => !c || c[3] < 0.35 || (c[0] >= 216 && c[1] >= 216 && c[2] >= 216)

/**
 * n181 (round 43 pets): the unticked filter boxes were built with a near-white border nobody could see, and no check
 * looked. For each option label with a box on the page: a small square (8-28px) must sit just left of it on its row;
 * an unticked one must show a border (or fill) a person can see. Null when fine or when the page gives no boxes.
 */
export function optionBoxFaults(opts: Array<{ label: string; on: boolean }>, nodes: readonly NodeLike[]): string | null {
  const squares = nodes.filter((n) => n.rect && !norm(n.text ?? '') && n.rect.w >= 8 && n.rect.w <= 28 && n.rect.h >= 8 && n.rect.h <= 28 && Math.abs(n.rect.w - n.rect.h) <= 4)
  const labelNodes = (o: { label: string }) => nodes.filter((n) => n.rect && norm(n.text ?? '') === norm(o.label))
  const boxLeftOf = (n: NodeLike) => {
    // the letters' own box: a <label> holding its box starts at the box, its words further right
    const r = n.textBox ?? n.rect!
    const cy = r.y + r.h / 2
    return squares.filter((q) => Math.abs(q.rect!.y + q.rect!.h / 2 - cy) <= Math.max(8, r.h * 0.6) && q.rect!.x + q.rect!.w <= r.x + 2 && q.rect!.x + q.rect!.w >= r.x - 40)
      .sort((p, q) => (q.rect!.x - p.rect!.x))[0]
  }
  // the same word can also be a nav link ("Dogs, Cats" up top): the option is the copy with a box beside it
  const placed = opts.map((o) => ({ o, ns: labelNodes(o) })).filter((x) => x.ns.length)
  if (placed.length < 3) return null
  const missing: string[] = []
  const pale: string[] = []
  for (const { o, ns } of placed) {
    const box = ns.map(boxLeftOf).find(Boolean)
    if (!box) { missing.push(o.label); continue }
    if (o.on || box.tag === 'input') continue
    const border = box.style?.border ? rgbOf(box.style.border) : null
    const widthOk = /^\s*(\d*\.?\d+)px/.exec(box.style?.border ?? '')
    const borderSeen = !!border && !!widthOk && Number(widthOk[1]) >= 1 && !faint(border)
    const fillSeen = !faint(rgbOf(box.style?.backgroundColor))
    if (!borderSeen && !fillSeen) pale.push(o.label)
  }
  const out: string[] = []
  if (missing.length) out.push(`${missing.length} checkbox options (${missing.slice(0, 4).map((l) => `"${l}"`).join(', ')}) have no box just left of their label: give every option its own small square box, ticked or not`)
  if (pale.length) out.push(`the empty boxes of ${pale.length} unticked options (${pale.slice(0, 4).map((l) => `"${l}"`).join(', ')}) are too faint to see: outline each in a visible mid grey (about #b0b0b0, 1.5px), changing nothing else`)
  return out.length ? out.join('; ') : null
}
