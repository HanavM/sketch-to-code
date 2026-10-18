/**
 * --read-only rows -> how many readings failed and why (s2c-056).
 *
 * A cause is the server's error with the volatile parts (seconds, token
 * counts) taken out, so ten timeouts at different lengths count as one cause.
 */
export function readingCause(row) {
  const raw = row.reading?.error ?? row.readingError ?? row.error ?? 'unknown'
  return String(raw)
    .replace(/^interpret failed: /, '')
    .replace(/^(Perception)?Failure: |^Error: /, '')
    .replace(/, \d+s\b/g, '')
    .replace(/\d{2,}/g, 'N')
    .trim()
}

export function readingSummary(rows) {
  const done = rows.filter((r) => r.readOnly)
  const ok = done.filter((r) => r.reading?.ok)
  const failed = done.filter((r) => !r.reading?.ok)
  const causes = new Map()
  for (const r of failed) {
    const c = readingCause(r)
    causes.set(c, (causes.get(c) ?? 0) + 1)
  }
  const ms = done.map((r) => r.readingMs ?? 0).sort((a, b) => a - b)
  const tok = (k) => done.reduce((a, r) => a + (r.reading?.tokens?.[k] ?? 0), 0)
  return {
    total: done.length,
    ok: ok.length,
    failed: failed.length,
    noModel: ok.filter((r) => r.reading?.plain).length,
    causes: [...causes.entries()].sort((a, b) => b[1] - a[1]),
    medianMs: ms.length ? ms[Math.floor((ms.length - 1) / 2)] : 0,
    maxMs: ms.length ? ms[ms.length - 1] : 0,
    billed: tok('input') + tok('output'),
    cacheRead: tok('cacheRead'),
  }
}
