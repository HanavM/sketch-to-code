/**
 * One sketch run's lifetime: start it, stop it, and know when it has stopped.
 *
 * The run cap used to be `Promise.race([exec(), deadline])`. When the deadline
 * won, the plugin took the undo entry, freed the run slot and told the user the
 * run had stopped — and the pipeline, never told anything, carried on editing.
 * Pressing Undo then restored the checkpoint, and the orphaned agent wrote over
 * it. Esc had the same shape: it only reset the overlay.
 *
 * Here the deadline and Esc both ABORT the run's signal, and `settled` resolves
 * only when exec itself has returned. Callers take the undo entry and free the
 * slot on `settled`, so nothing the run writes can land after them.
 */

export type RunOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error; stopped: boolean }

export interface SupervisedRun<T> {
  signal: AbortSignal
  /** Ask the run to stop. False if it already finished or was already stopping. */
  stop: (reason: string) => boolean
  /** Resolves (never rejects) once exec has returned, however it ended. */
  settled: Promise<RunOutcome<T>>
}

export function superviseRun<T>(
  exec: (signal: AbortSignal) => Promise<T>,
  opts: {
    timeoutMs: number
    /** Called once when a stop is requested, before the run has exited. */
    onStopping?: (reason: string) => void
  },
): SupervisedRun<T> {
  const controller = new AbortController()
  let finished = false
  const stop = (reason: string): boolean => {
    if (finished || controller.signal.aborted) return false
    controller.abort(new Error(reason))
    opts.onStopping?.(reason)
    return true
  }
  const timer = setTimeout(() => stop(`run exceeded ${opts.timeoutMs / 1000}s cap`), opts.timeoutMs)
  const reasonOf = (): Error => {
    const r: unknown = controller.signal.reason
    return r instanceof Error ? r : new Error(String(r))
  }
  // Promise.resolve().then() so a synchronously-throwing exec still settles
  const settled = Promise.resolve()
    .then(() => exec(controller.signal))
    .then(
      (value): RunOutcome<T> =>
        // a run that finished anyway after being told to stop was still
        // stopped: the user was told "stopping", and gets the stop's undo
        controller.signal.aborted ? { ok: false, error: reasonOf(), stopped: true } : { ok: true, value },
      (err: unknown): RunOutcome<T> => {
        if (controller.signal.aborted) return { ok: false, error: reasonOf(), stopped: true }
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)), stopped: false }
      },
    )
    .finally(() => {
      finished = true
      clearTimeout(timer)
    })
  return { signal: controller.signal, stop, settled }
}
