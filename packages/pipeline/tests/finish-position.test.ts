import { describe, expect, it } from 'vitest'
import { finishSource } from '../src/finish.js'

// n204: round 20 e4's card visual hard-coded `relative` beside the className it was handed, so the caller's
// `absolute` lost in Tailwind's order and the card sat in the flow 60px low
describe('finishSource: a hard-coded relative yields to a passed position', () => {
  const card = 'return <div className={`relative rounded-[14px] ${className}`} style={style}>x</div>'
  it('rewrites relative to yield when className carries absolute, fixed or sticky', () => {
    const { code, edits } = finishSource(card, [])
    expect(edits.map((e) => e.kind)).toEqual(['position-yields'])
    const cls = (className: string) => {
      const m = code.match(/className=\{`(.*)`\}/)!
      return new Function('className', `return \`${m[1]}\``)(className).replace(/\s+/g, ' ').trim()
    }
    expect(cls('absolute z-20 h-[150px]')).toBe('rounded-[14px] absolute z-20 h-[150px]')
    expect(cls('w-full')).toBe('relative rounded-[14px] w-full')
  })
  it('is idempotent and leaves roots that already set a position alone', () => {
    const once = finishSource(card, []).code
    expect(finishSource(once, []).edits).toEqual([])
    const own = 'className={`relative md:absolute ${className}`}'
    expect(finishSource(own, []).edits).toEqual([])
    const plain = 'className="relative rounded"'
    expect(finishSource(plain, []).code).toBe(plain)
  })
})
