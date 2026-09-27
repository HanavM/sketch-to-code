/**
 * A minimal line diff, so "show me exactly what you are about to do to my vite
 * config" costs no dependency. Classic LCS table — configs are tens of lines,
 * so the O(n·m) table is free and the code stays readable.
 */
export function unifiedDiff(before: string, after: string, path: string, context = 3): string {
  if (before === after) return ''
  const a = before.length === 0 ? [] : before.split('\n')
  const b = after.length === 0 ? [] : after.split('\n')

  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  type Op = { kind: ' ' | '-' | '+'; text: string; aLine: number; bLine: number }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: ' ', text: a[i]!, aLine: i + 1, bLine: j + 1 })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ kind: '-', text: a[i]!, aLine: i + 1, bLine: j + 1 })
      i++
    } else {
      ops.push({ kind: '+', text: b[j]!, aLine: i + 1, bLine: j + 1 })
      j++
    }
  }
  while (i < a.length) ops.push({ kind: '-', text: a[i]!, aLine: ++i, bLine: j + 1 })
  while (j < b.length) ops.push({ kind: '+', text: b[j]!, aLine: i + 1, bLine: ++j })

  // group changed ops into hunks with `context` unchanged lines around them
  const changed = ops.map((o) => o.kind !== ' ')
  const keep = new Array<boolean>(ops.length).fill(false)
  ops.forEach((_, idx) => {
    if (!changed[idx]) return
    for (let k = Math.max(0, idx - context); k <= Math.min(ops.length - 1, idx + context); k++) keep[k] = true
  })

  const out: string[] = [`--- a/${path}`, `+++ b/${path}`]
  let idx = 0
  while (idx < ops.length) {
    if (!keep[idx]) {
      idx++
      continue
    }
    let end = idx
    while (end < ops.length && keep[end]) end++
    const hunk = ops.slice(idx, end)
    const aStart = hunk.find((o) => o.kind !== '+')?.aLine ?? hunk[0]!.aLine
    const bStart = hunk.find((o) => o.kind !== '-')?.bLine ?? hunk[0]!.bLine
    const aCount = hunk.filter((o) => o.kind !== '+').length
    const bCount = hunk.filter((o) => o.kind !== '-').length
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`)
    for (const o of hunk) out.push(`${o.kind}${o.text}`)
    idx = end
  }
  return `${out.join('\n')}\n`
}
