/**
 * What a repair turn is told besides the failures.
 *
 * Round 7 e4 (n107): the build wrote src/App.tsx in 9 tool calls; the repair
 * turn for a spacing drift then spent 91k tokens, 16 tool calls and 8.7
 * minutes (Grep x7, Tailwind's preflight.css read twice) working out default
 * spacing before five Edits to the same file. The failures already give the
 * built and drawn pixels, so the fix needs no investigation: name the files
 * this run wrote and ask for arbitrary px classes on them, nothing looked up.
 */

/** Source files this session wrote or edited, from tool-log lines like "Write src/App.tsx". */
export function touchedFiles(toolLog: string[]): string[] {
  const out: string[] = []
  for (const line of toolLog) {
    const m = /^(?:Write|Edit|MultiEdit)\s+(\S+)$/.exec(line.trim())
    const f = m?.[1]
    if (!f || f.includes('node_modules')) continue
    if (!out.includes(f)) out.push(f)
  }
  return out
}

export function leanRepairNote(toolLog: string[]): string {
  const files = touchedFiles(toolLog)
  const where = files.length
    ? `The page you built is in ${files.join(', ')}: fix it there. `
    : ''
  return (
    `HOW TO REPAIR: ${where}Each failure above already says the built and the drawn pixels, so change ` +
    `the elements it names directly with exact arbitrary values (mt-[12px], h-[48px], py-[10px], gap-[14px]). ` +
    `Do not Grep or Glob, do not read node_modules or Tailwind/CSS internals to look up default sizes, ` +
    // round 6 e2 n112: a repair turn read index.html and the vite config (7 tools) before touching the page
    `do not open index.html, package.json or any vite/tailwind/postcss/ts config (the page is only in the files named), ` +
    `and do not re-plan the page: read the file once if you need to, then Edit.`
  )
}

/**
 * n169: a repair facing many failed checks at once acts biggest first.
 *
 * Round 42 e1 podcast (n168 try 2): the build ran the page past the screen
 * (rows 72px apart, the player pushed off) and nine checks failed. The repair
 * was handed all nine at once, in check order, read App.tsx, main.tsx, two
 * Globs and the vite config, and went 180 s with no edit, so the build was kept
 * as it was (38.9). A person facing that page fixes the one thing that pushed
 * everything down first. So: rank the failures by how much of the page they
 * move, put the few that matter most first, and ask for an edit straight away.
 */
export const MANY_FAILURES = 4
export const FIX_FIRST = 3

/** How much a failure costs the page: the pixels it moves, more for missing or off-screen parts. */
export function failureWeight(f: string): number {
  const s = f.toLowerCase()
  let px = 0
  // "sits 45px too low", "move the rows up 48px", "91px too lo(w)", "72px apart"
  const near = /(\d{1,4})\s*px\s+(?:too|off|low|high|left|right|apart|past|below|above|further)/g
  for (let m = near.exec(s); m; m = near.exec(s)) px = Math.max(px, Number(m[1]))
  const moveBy = /\b(?:up|down|left|right)\s+(?:by\s+)?(?:about\s+)?(\d{1,4})\s*px/g
  for (let m = moveBy.exec(s); m; m = moveBy.exec(s)) px = Math.max(px, Number(m[1]))
  let w = px
  if (/whole page|the page from here down|past the screen|off the screen|off screen|below the screen|past the bottom|pushed off/.test(s)) w += 200
  if (/nothing (?:about that size |that size |near it )?(?:was )?built|has no element|no longer draws/.test(s)) w += 120
  const de = /δe\s*(\d+(?:\.\d+)?)/.exec(s)
  if (de) w = Math.max(w, Math.min(100, Number(de[1])))
  if (/a rule you drew|drawn earlier/.test(s)) w = Math.max(w, 60)
  // a colour is one class to change and moves nothing: after anything that moves the page
  if (/^(?:action \d+ \()?(?:colour|ink-colours|solids)\b/.test(s)) w = Math.min(w || 60, 60)
  return w || 30
}

/** Failures biggest first (stable for ties). */
export function rankFailures(failures: string[]): string[] {
  return failures
    .map((f, i) => ({ f, i, w: failureWeight(f) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((x) => x.f)
}

/**
 * The failures part of a repair message. A few failures go as they are. Many
 * go ranked, the biggest FIX_FIRST marked to fix first, the rest after (or,
 * with `onlyFirst`, left for a later round), with a first edit asked for at once.
 */
export function failureBrief(failures: string[], opts: { onlyFirst?: boolean } = {}): string {
  if (failures.length < MANY_FAILURES) {
    // n170: a fresh repair after a stalled one is held to a quick first edit, however few the problems
    const quick = opts.onlyFirst ? 'Make your first Edit within a minute; do not read anything but the page file first.\n' : ''
    return `${quick}Verification against the live DOM found problems:\n${failures.join('\n')}`
  }
  const ranked = rankFailures(failures)
  const first = ranked.slice(0, FIX_FIRST)
  const rest = ranked.slice(FIX_FIRST)
  const head =
    `Verification against the live DOM found ${failures.length} problems. They are ranked biggest first: ` +
    `the first ${first.length} move the most of the page, and fixing them often fixes the others. ` +
    `Make your first Edit within a minute, starting with problem 1; do not read anything but the page file first.`
  const list = (fs: string[], from: number) => fs.map((f, i) => `${from + i}. ${f}`).join('\n')
  if (opts.onlyFirst || !rest.length) {
    return `${head}\n\nFIX FIRST:\n${list(first, 1)}` +
      (rest.length ? `\n\n(${rest.length} smaller problems are left for the next round; do not work on them now.)` : '')
  }
  return `${head}\n\nFIX FIRST:\n${list(first, 1)}\n\nTHEN, IF QUICK:\n${list(rest, first.length + 1)}`
}

/**
 * n231: the last try after two repairs thought with no edit. One problem, the biggest, and the page's own text in the
 * message, so there is nothing to read first. Fixing the biggest often fixes others; the next round sees what is left.
 */
export const LAST_REPAIR_PAGE_CHARS = 60_000

export function lastRepairBrief(failures: string[], pages: { file: string; text: string }[]): string {
  const [one] = rankFailures(failures)
  const left = failures.length - 1
  const shown = pages.filter((p) => p.text.length <= LAST_REPAIR_PAGE_CHARS)
  const page = shown.map((p) => `${p.file}:\n\`\`\`\n${p.text}\n\`\`\``).join('\n\n')
  return (
    `Two repairs of this page stopped before making any edit, so this one is small. Fix this one problem, with one or ` +
    `two Edits, now. Do not plan the rest of the page and do not read anything` +
    (shown.length ? ': the page is below.' : ' but the page file.') +
    `\n\nPROBLEM:\n${one ?? ''}` +
    (left > 0 ? `\n\n(${left} other problems are for the next round, and fixing this one may fix some of them.)` : '') +
    (page ? `\n\nTHE PAGE AS IT IS NOW:\n${page}` : '') +
    `\n\nChange the element it names directly, with exact arbitrary values (mt-[12px], h-[48px]). Keep everything else as it is.`
  )
}
