/**
 * s2c-002: a reading outlives the page that asked for it.
 *
 * The instant render writes a new module, vite full-reloads the page, and the
 * fetch that was waiting on the (slow, paid) model reading dies with it. The
 * model call itself carries on in the dev server, so the answer exists; it
 * just had nowhere to go. This keeps it, by an id the overlay chose and
 * parked in sessionStorage before asking, so the page that comes back after
 * the reload can collect it instead of the user drawing it all again.
 *
 * In memory on purpose: a reading is about one sketch on one page, and a dev
 * server restart already means the snapshot it was grounded against is gone.
 */

/** What the interpret endpoint would have sent: HTTP status + JSON body. */
export interface ReadingReply { status: number; body: unknown }

export type ReadingLookup =
  | { state: 'done'; reply: ReadingReply }
  | { state: 'pending' }
  | { state: 'unknown' }

export interface ReadingStore {
  /** Track `work` under `id`. Returns the same promise, for the live reply. */
  begin(id: string, work: Promise<ReadingReply>): Promise<ReadingReply>
  /** The reply, waiting up to `waitMs` for one still in flight. */
  wait(id: string, waitMs: number): Promise<ReadingLookup>
  size(): number
}

/** A reading id: what the overlay generates, and nothing an attacker can widen. */
export const READING_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export function isReadingId(v: unknown): v is string {
  return typeof v === 'string' && READING_ID_RE.test(v)
}

interface Entry { done: ReadingReply | null; work: Promise<ReadingReply>; at: number }

export function createReadingStore(opts: { ttlMs?: number; max?: number; now?: () => number } = {}): ReadingStore {
  const ttl = opts.ttlMs ?? 5 * 60_000
  const max = opts.max ?? 16
  const now = opts.now ?? Date.now
  const entries = new Map<string, Entry>()

  const sweep = () => {
    const t = now()
    for (const [id, e] of entries) {
      // a finished reply ages out; one still in flight is kept, since a model
      // call that is slow is exactly the case this exists for
      if (e.done && t - e.at > ttl) entries.delete(id)
    }
    // oldest first; Map iteration is insertion order
    while (entries.size > max) {
      const first = entries.keys().next().value
      if (first === undefined) break
      entries.delete(first)
    }
  }

  return {
    begin(id, work) {
      const entry: Entry = { done: null, work, at: now() }
      entries.set(id, entry)
      sweep()
      // a reading that throws still has an answer: the error the live page
      // would have shown. Never a rejection, so a waiter can't hang on one.
      const settled = work.then(
        (reply) => reply,
        (err: unknown) => ({ status: 400, body: { ok: false, error: String(err) } }),
      )
      void settled.then((reply) => {
        entry.done = reply
        entry.at = now()
      })
      entry.work = settled
      return settled
    },
    async wait(id, waitMs) {
      sweep()
      const e = entries.get(id)
      if (!e) return { state: 'unknown' }
      if (e.done) return { state: 'done', reply: e.done }
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<null>((r) => { timer = setTimeout(() => r(null), Math.max(0, waitMs)) })
      const reply = await Promise.race([e.work, timeout])
      if (timer) clearTimeout(timer)
      return reply ? { state: 'done', reply } : { state: 'pending' }
    },
    size: () => entries.size,
  }
}
