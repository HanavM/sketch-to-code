/**
 * plain.mjs — judging the no-model readings against the bench's answer keys
 * (s2c-052).
 *
 * plain-reading.ts answers two kinds of sketch itself, at zero tokens: only
 * scribbles on single elements (delete them), and one coloured ring round one
 * element (recolour it). Its tests are hand-made marks. The bench has marks a
 * hurried hand would make, and an answer key for each page, so it can say
 * three things the unit tests can't:
 *
 *   - right:      it fired, with the rule the answer key needs, on the element
 *                 the key names, and on nothing the key says to keep
 *   - wrong:      it fired and the answer is not the key's. This is the bad one:
 *                 a plain reading skips the model, so nothing else gets a say
 *   - missed:     the key is a delete or a recolour with no words, and it
 *                 declined, so a model call was paid for an answer a rule holds
 *   - false-fire: it fired on a page whose key is neither (a move, an add, a
 *                 design page). Also bad, for the same reason as wrong
 *   - declined:   it declined a page it has no rule for. Correct
 *
 * Pure: takes the wire body (what Run would POST to /@s2c/interpret) and the
 * plainReading result, so the sweep can judge thousands of synthetic marks
 * without a browser.
 */

/** Which plain rule a page's answer key calls for, or null when none can. */
export function expectedRule(keySpec, { words, pen }) {
  if (words) return null // typed words: the model reads them, by design
  const must = (keySpec.edits ?? []).filter((e) => e.must && e.check !== 'kept')
  if (must.length !== 1) return null
  const m = must[0]
  if (m.check === 'absent') return 'scribble-delete'
  if ((m.check === 'bg' || m.check === 'color') && pen) return 'ring-recolor'
  return null
}

/** All text in an element and below it, from the snapshot as sent. */
export function subtreeText(snap, id) {
  const kids = new Map()
  for (const n of snap.nodes) {
    if (!n.parent) continue
    if (!kids.has(n.parent)) kids.set(n.parent, [])
    kids.get(n.parent).push(n)
  }
  const byId = new Map(snap.nodes.map((n) => [n.id, n]))
  const out = []
  const walk = (nid, seen = new Set()) => {
    if (seen.has(nid)) return
    seen.add(nid)
    const n = byId.get(nid)
    if (n?.text) out.push(n.text)
    for (const k of kids.get(nid) ?? []) walk(k.id, seen)
  }
  walk(id)
  return out.join(' ')
}

/** The element ids a plain reading acts on. */
export function plainTargets(plain) {
  if (!plain?.ok) return []
  return plain.raw.actions.flatMap((a) => a.elements ?? [])
}

/**
 * One page's outcome. `wire` is the reading request body, `plain` what
 * plainReading answered for it, `keySpec` the page's answer key for this
 * words arm (lib/words.mjs answerKey(...).spec).
 */
export function judgePlain(keySpec, wire, plain) {
  const words = (wire.notes ?? []).some((n) => typeof n.text === 'string' && n.text.trim())
  const pen = (wire.strokes ?? []).some((s) => s.color)
  const want = expectedRule(keySpec, { words, pen })
  const targets = plainTargets(plain)
  const texts = targets.map((id) => subtreeText(wire.snapshot, id))
  const base = { want, got: plain?.ok ? plain.rule : null, reason: plain?.ok ? null : plain?.reason ?? null, targets: texts }
  if (!plain?.ok) return { ...base, outcome: want ? 'missed' : 'declined' }
  if (!want) return { ...base, outcome: 'false-fire', why: `fired ${plain.rule} on a page whose key needs no plain rule` }
  if (plain.rule !== want) return { ...base, outcome: 'wrong', why: `fired ${plain.rule}, the key needs ${want}` }
  const must = keySpec.edits.find((e) => e.must && e.check !== 'kept')
  const kept = keySpec.edits.filter((e) => e.check === 'kept').map((e) => e.text)
  const all = texts.join(' ')
  if (!all.includes(must.text)) return { ...base, outcome: 'wrong', why: `acts on "${all.slice(0, 60)}", not "${must.text}"` }
  if (want === 'scribble-delete') {
    const lost = kept.filter((k) => all.includes(k))
    if (lost.length) return { ...base, outcome: 'wrong', why: `would also delete ${lost.map((k) => `"${k}"`).join(', ')}` }
  }
  return { ...base, outcome: 'right' }
}

/** Tally outcomes: counts and the share of plain-able pages read for free. */
export function tallyPlain(rows) {
  const n = { right: 0, wrong: 0, missed: 0, 'false-fire': 0, declined: 0 }
  for (const r of rows) n[r.outcome] = (n[r.outcome] ?? 0) + 1
  const able = n.right + n.wrong + n.missed
  return { ...n, total: rows.length, able, freeRate: able ? n.right / able : null, badFires: n.wrong + n['false-fire'] }
}
