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
    `and do not re-plan the page: read the file once if you need to, then Edit.`
  )
}
