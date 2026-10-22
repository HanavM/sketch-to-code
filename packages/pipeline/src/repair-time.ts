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
