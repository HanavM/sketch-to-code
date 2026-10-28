/**
 * A codegen turn never hangs a run silently.
 *
 * n18 (login, twice): the verify check failed, the repair turn was sent, and
 * then nothing: no tool call, no reply, no record, for 8+ minutes until the
 * person gave up. The run cap would only have stopped it at 12 minutes, and a
 * cap-stopped run throws its build away and writes no record either.
 *
 * So every turn is watched. A turn that has heard nothing from the agent for
 * STALL_MS, or that would eat the time a verify needs before the run cap, is
 * ended with a TurnStalled saying why. The caller decides what that means: a
 * stalled repair keeps the build that was already written and verified.
 */
export const STALL_MS = 150_000
/**
 * n22: a repair turn gets this long to make its first edit (and between
 * edits). Repairs are told the exact pixels to change; a good one reads the
 * file and edits within seconds (n20 try 3: 7 s). Try 2's third round read the
 * file, then thought for 8 minutes with no edit until the cap stopped it.
 */
export const REPAIR_EDIT_MS = 120_000
export const WATCH_EVERY_MS = 5_000

export class TurnStalled extends Error {
  constructor(public readonly why: string) {
    super(why)
    this.name = 'TurnStalled'
  }
}

export interface StallInput {
  now: number
  /** When the agent last moved the turn on (a tool call, a result, reply text; not thinking). */
  lastActivity: number
  /** When the agent last edited a file (or the turn began); set only for turns that must edit. */
  lastEdit?: number
  editMs?: number
  /** Host run cap, if any. */
  deadline?: number
  /** Time to leave before the cap (e.g. for the verify after a repair). */
  marginMs?: number
  stallMs?: number
}

/** Why this turn should be ended now, or null to let it run. */
export function stallReason(o: StallInput): string | null {
  const stallMs = o.stallMs ?? STALL_MS
  const quiet = o.now - o.lastActivity
  if (quiet >= stallMs) return `the agent made no progress for ${Math.round(quiet / 1000)} s`
  if (o.lastEdit !== undefined) {
    const sinceEdit = o.now - o.lastEdit
    if (sinceEdit >= (o.editMs ?? REPAIR_EDIT_MS)) return `the repair went ${Math.round(sinceEdit / 1000)} s without an edit (thinking is not progress)`
  }
  if (o.deadline !== undefined && Number.isFinite(o.deadline)) {
    const left = o.deadline - o.now
    if (left <= (o.marginMs ?? 0)) return `only ${Math.max(0, Math.round(left / 1000))} s left before the run cap`
  }
  return null
}

/**
 * Resolve with the turn, or reject with TurnStalled as soon as `check` names a
 * reason. The turn itself is not cancelled here: the caller closes the session.
 */
export function watchTurn<T>(turn: Promise<T>, check: () => string | null, everyMs = WATCH_EVERY_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false
    const timer = setInterval(() => {
      if (done) return
      const why = check()
      if (why) {
        done = true
        clearInterval(timer)
        reject(new TurnStalled(why))
      }
    }, everyMs)
    turn.then(
      (v) => { if (!done) { done = true; clearInterval(timer); resolve(v) } },
      (e: unknown) => { if (!done) { done = true; clearInterval(timer); reject(e instanceof Error ? e : new Error(String(e))) } },
    )
  })
}
