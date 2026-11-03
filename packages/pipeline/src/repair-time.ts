/**
 * Whether a repair turn can finish before the host's run cap.
 *
 * The cap stops the whole run: a repair turn cut by it throws away a build
 * that had already been written and verified, and the user is told the run
 * failed (round 7 e4, three runs in a row: the build turn took most of the
 * 12 minutes, the repair turn started anyway and the cap stopped it). Better
 * to keep the build and report its open failures.
 *
 * A repair's likely length: the longest repair this run has already sent,
 * else 40% of the build turn, never under 2 minutes; plus a minute for the
 * verify that follows it. No deadline (a host without a cap): always fits.
 */
export interface TurnTime { kind: 'build' | 'repair'; ms: number }

export const MIN_REPAIR_MS = 120_000
export const VERIFY_MARGIN_MS = 60_000

export function repairEstimateMs(sends: TurnTime[]): number {
  const repairs = sends.filter((s) => s.kind === 'repair').map((s) => s.ms)
  if (repairs.length) return Math.max(MIN_REPAIR_MS, ...repairs)
  const build = Math.max(0, ...sends.filter((s) => s.kind === 'build').map((s) => s.ms))
  return Math.max(MIN_REPAIR_MS, 0.4 * build)
}

export function repairFits(deadline: number | undefined, now: number, sends: TurnTime[]): boolean {
  if (deadline === undefined || !Number.isFinite(deadline)) return true
  return deadline - now >= repairEstimateMs(sends) + VERIFY_MARGIN_MS
}

/**
 * n170: a fresh repair after a stalled one is short on purpose: a new agent told only the biggest problems, held to
 * a first edit within FRESH_REPAIR_MS. Round 42 e5 gradebook (n165 try 1): the repair sat silent 152 s (no tokens at
 * all) and was not retried, because the stalled turn's own length made a retry look too long for the run cap.
 * A stalled turn says nothing about how long a working repair takes, so it is not counted here.
 */
export const FRESH_REPAIR_MS = 90_000

/**
 * n231: when the fresh repair stalls too, one last agent is told a single problem and handed the page's text, so it has
 * nothing to read and little to weigh. It gets longer than the fresh repair: stopping it leaves the page as it is, and
 * timesheet (n228 try 2) and gradebook (n165) both stopped at 90 s and kept a page with 14 faults.
 */
export const LAST_REPAIR_MS = 150_000

export function freshRepairFits(deadline: number | undefined, now: number, ms: number = FRESH_REPAIR_MS): boolean {
  if (deadline === undefined || !Number.isFinite(deadline)) return true
  return deadline - now >= ms + VERIFY_MARGIN_MS
}
