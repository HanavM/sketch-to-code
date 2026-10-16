/**
 * Stopping a run, for the parts of the pipeline that aren't the agent.
 *
 * The agent itself is killed through the SDK (codegen.ts). Everything else a
 * run does between agent turns — codemods, scaffolds, the finishing pass,
 * waiting for HMR, asking the page for a snapshot — happens in this process,
 * and each of those can write source. They check here first, so a run that
 * was told to stop stops at the next step instead of carrying on to the end
 * after the user has been told it stopped.
 */
import { abortError } from './codegen.js'

/** Throw the stop reason if the run has been told to stop. */
export function throwIfStopped(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal)
}

/** Resolve after `ms`, or reject the moment the run is told to stop. */
export function sleepUnlessStopped(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return untilStopped(new Promise<void>((r) => setTimeout(r, ms)), signal)
}

/**
 * `p`, unless the run is told to stop first.
 *
 * For waits this process can't cancel itself (a snapshot round-trip through
 * the browser): the wait is abandoned rather than cancelled, which is fine
 * because nothing that resolves it writes source.
 */
export function untilStopped<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return p
  if (signal.aborted) return Promise.reject(abortError(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
      (e: unknown) => { signal.removeEventListener('abort', onAbort); reject(e) },
    )
  })
}

/**
 * Wait for a closed agent session to actually end, but not forever.
 *
 * close() kills the subprocess; this waits for its message loop to drain so
 * no tool call is still landing when the caller reports the run stopped. The
 * cap is a backstop for an SDK that never ends its iterator: a killed process
 * can't write, so after a few seconds the wait proves nothing more.
 */
export async function settleSession(closed: Promise<void>, capMs = 5_000): Promise<void> {
  let t: ReturnType<typeof setTimeout> | undefined
  await Promise.race([closed, new Promise<void>((r) => { t = setTimeout(r, capMs) })])
  clearTimeout(t)
}
