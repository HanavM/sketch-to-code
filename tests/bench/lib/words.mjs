/**
 * How much does the SKETCH carry, and how much do the words? (s2c-016)
 *
 * SEED.md: "sketch first, text prompts as support". Typed words should only
 * clarify, name, or add content no mark can hold (copy, labels, a colour). The
 * bench used to type every note in full, so a page that came out right could
 * have been carried entirely by "move the quote up here" with the arrow along
 * for decoration. This module lets the same page run three ways:
 *
 *   all      every note exactly as written (the old behaviour, the default)
 *   content  each note reduced to its `content`: the words no mark could carry
 *            (new copy, labels, a colour). Notes that only restate what the ink
 *            should already say ("move the quote up here") are dropped. This is
 *            the thesis arm: marks carry the action, words only supply content.
 *   none     no typed words at all. Answer-key checks that can only pass with
 *            words (`needsWords: true`, e.g. the new headline's exact text) are
 *            dropped; if what is left can no longer tell an edited page from an
 *            untouched one, the page is NOT JUDGED in this arm, never counted as
 *            a pass or a fail.
 *
 * Every note on a page run in `content` mode must declare `content` (a string,
 * or null for "the marks should carry this alone"). An unclassified note is an
 * error, not a guess: the classification IS the claim being measured, so it is
 * written down in the spec where it can be argued with.
 *
 * Pure; unit-tested in words.test.ts. run.mjs and rough-check.mjs both use it.
 */

export const WORD_MODES = /** @type {const} */ (['all', 'content', 'none'])

/** `--words` as given, or 'all'. A typo is worth stopping for. */
export function parseWords(value) {
  if (value === null || value === undefined || value === true) return 'all'
  const m = String(value).trim().toLowerCase()
  if (!WORD_MODES.includes(m)) {
    throw new Error(`--words must be one of ${WORD_MODES.join(', ')} (got "${String(value)}")`)
  }
  return m
}

/** Words as a person would count them: tokens with a letter or digit in them. */
export function countWords(text) {
  return String(text ?? '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

/** Notes on this page that `content` mode cannot type, because nobody classified them. */
export function unclassified(spec) {
  return (spec.notes ?? []).filter((n) => !('content' in n)).map((n) => n.text)
}

/**
 * The notes to TYPE for this page in this mode, each `{ at, text }`. In
 * `content` mode a note whose content is null or blank is dropped.
 */
export function notesFor(spec, mode) {
  const notes = spec.notes ?? []
  if (mode === 'all') return notes.map((n) => ({ at: n.at, text: n.text }))
  if (mode === 'none') return []
  const bad = unclassified(spec)
  if (bad.length) {
    throw new Error(`${spec.id}: --words content needs every note to declare \`content\`; unclassified: ${bad.map((t) => JSON.stringify(t)).join(', ')}`)
  }
  return notes
    .filter((n) => typeof n.content === 'string' && n.content.trim())
    .map((n) => ({ at: n.at, text: n.content.trim() }))
}

/** Words typed on this page in this mode. */
export function wordsTyped(spec, mode) {
  return notesFor(spec, mode).reduce((a, n) => a + countWords(n.text), 0)
}

/**
 * The answer key for this mode. Returns `{ spec, judged, dropped }`:
 * `spec` is a copy with the checks that need words removed (`none` only),
 * `dropped` names them, and `judged` is false when no `must` check that
 * describes a CHANGE survived. `kept` checks guard against collateral damage
 * and pass on the untouched page, so a key made only of them measures nothing.
 *
 * Region (new-UI) specs are unchanged: their content check asks for real words,
 * not particular ones, so a model can pass it without being told the copy.
 */
export function answerKey(spec, mode) {
  if (mode !== 'none' || !spec.edits) return { spec, judged: true, dropped: [] }
  const edits = spec.edits.filter((c) => !c.needsWords)
  const dropped = spec.edits.filter((c) => c.needsWords).map((c) => `${c.check} ${c.text ?? `${c.a} > ${c.b}`}`)
  const judged = edits.some((c) => c.must && c.check !== 'kept')
  return { spec: { ...spec, edits }, judged, dropped }
}

/**
 * Per-arm totals over bench rows (`{ realized, judged, wordsTyped }` each, as
 * run.mjs records them). `realized` is over JUDGED pages only. `wordsPerRealized`
 * is all words typed in the arm divided by pages realized: the price in typing
 * of each change that came out right. null, not 0 or Infinity, when nothing
 * was realized: no observation, not a perfect or a hopeless score.
 */
export function wordSummary(rows) {
  const judged = rows.filter((r) => r.judged !== false && typeof r.realized === 'boolean')
  const realized = judged.filter((r) => r.realized).length
  const typed = rows.reduce((a, r) => a + (r.wordsTyped ?? 0), 0)
  return {
    pages: rows.length,
    judged: judged.length,
    notJudged: rows.filter((r) => r.judged === false).length,
    realized,
    realizedPct: judged.length ? realized / judged.length : null,
    wordsTyped: typed,
    wordsPerRealized: realized ? typed / realized : null,
  }
}

/**
 * The comparison the arms exist for, as markdown: one row per arm with its
 * totals, then one row per page with realized/not per arm. `arms` maps an arm
 * name ('all' | 'content' | 'none') to that arm's bench rows (results.json).
 * The column that matters is the drop from `all` to `content`: pages that
 * only came out right because a note spelled out what the ink should say.
 */
export function armTable(arms) {
  const names = WORD_MODES.filter((m) => arms[m])
  const pct = (v) => (v === null ? '—' : `${Math.trunc(v * 1000) / 10}%`)
  const out = [
    '| words | realized | judged | not judged | words typed | words / realized page |',
    '| --- | --: | --: | --: | --: | --: |',
  ]
  for (const m of names) {
    const s = wordSummary(arms[m].filter((r) => !r.dry && !r.error))
    out.push(`| ${m} | ${pct(s.realizedPct)} | ${s.judged} | ${s.notJudged} | ${s.wordsTyped} | ${s.wordsPerRealized === null ? '—' : s.wordsPerRealized.toFixed(1)} |`)
  }
  const ids = [...new Set(names.flatMap((m) => arms[m].map((r) => r.id)))]
  out.push('', `| page | ${names.join(' | ')} |`, `| --- | ${names.map(() => ':-:').join(' | ')} |`)
  for (const id of ids) {
    const cell = (m) => {
      const r = arms[m].find((x) => x.id === id)
      if (!r || r.dry) return '—'
      if (r.judged === false) return 'n/j'
      if (r.error) return 'err'
      return r.realized ? 'yes' : 'no'
    }
    out.push(`| ${id} | ${names.map(cell).join(' | ')} |`)
  }
  return out.join('\n')
}
