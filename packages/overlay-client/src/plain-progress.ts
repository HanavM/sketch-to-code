/**
 * s2c-030: the lines a person watches while a run works.
 *
 * The pipeline narrates itself in stage events ("verify: round 1: snapshotting
 * edited page", "codemod: action 0: App now saves email to
 * server/data/apps.json through POST /api/apps"). That narration is right for
 * the runs viewer and the console, and wrong for the bar: a non-coder reads a
 * file path, an action number and an HTTP verb while waiting to learn whether
 * their sketch worked.
 *
 * So the bar gets a fixed vocabulary, one line per stage, and never echoes the
 * stage's detail. The detail is model- or code-written text and can carry
 * anything; a fixed sentence can't. The raw "stage: detail" stays on the
 * line's tooltip and in console.debug.
 */

export interface StageEvent {
  stage: string
  detail?: string
}

/** The raw line, as the bar used to show it: kept for the tooltip/console. */
export const rawStage = (d: StageEvent): string => `${d.stage}${d.detail ? `: ${d.detail}` : ''}`

/**
 * The plain line for one stage event, or null when the bar should not change
 * (the run's own Done/✗ line follows and says it better).
 */
export function plainStage(d: StageEvent): string | null {
  const detail = d.detail ?? ''
  switch (d.stage) {
    case 'safety':
      return 'Saving a restore point first, so this can be undone…'
    case 'intent':
      return 'Got it. Making the change…'
    case 'rule':
      return 'One part of what you drew can’t be done here. Doing the rest…'
    case 'codemod':
    case 'codegen':
    case 'finish':
      return /refused/.test(detail) ? 'One part didn’t go in. Carrying on with the rest…' : 'Making the change…'
    case 'candidate': {
      // "attempt 2/3: generating" -> "Trying version 2 of 3…"
      const m = /attempt (\d+)\/(\d+)/.exec(detail)
      if (m) return `Trying version ${m[1]} of ${m[2]}, to keep the best one…`
      if (/^keeping/.test(detail)) return 'Keeping the best version…'
      return 'Trying a few versions, to keep the best one…'
    }
    case 'verify':
      if (/behaviour|testing/.test(detail)) return 'Trying it out in the page…'
      if (/^(passed|failed|unverified|skipped)\b/.test(detail)) return 'Trying it out in the page…'
      if (/no improvement/.test(detail)) return 'Checking the result…'
      return 'Checking the page matches your sketch…'
    case 'repair': {
      const m = /round (\d+)/.exec(detail)
      return m ? `Not quite right yet. Fixing it (try ${m[1]})…` : 'Not quite right yet. Fixing it…'
    }
    case 'stopping':
      // the run is winding down after Esc (or its time limit); "Working…"
      // here read as if the Esc had been ignored
      return 'Stopping… waiting for the change in progress to stop (Esc again to stop waiting)'
    case 'done':
      return null
    default:
      return 'Working…'
  }
}

/**
 * "interpret failed: <anything>" used to reach the bar verbatim (an HTTP code,
 * a JSON parse error, a fetch TypeError). The person needs to know the sketch
 * is still there and what to press.
 */
export function readingFailedLine(): string {
  return '✗ I couldn’t read that sketch just now. Your drawing is still here: press ▶ Run to try again.'
}
