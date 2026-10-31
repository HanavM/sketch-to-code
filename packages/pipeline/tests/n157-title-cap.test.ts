import { describe, expect, it } from 'vitest'
import { titleCapBrief, titleCaps, verifyTitleCaps } from '../src/titlecap.js'

const line = (id: string, x: number, y: number, w: number, words?: string) =>
  ({ strokeId: id, shape: 'line', box: { x, y, w, h: 0 }, from: { x, y }, to: { x: x + w, y }, ...(words ? { words } : {}) })
const text = (id: string, t: string, x: number, y: number, w: number, h: number, fs: number) =>
  ({ id, rect: { x, y, w, h }, textBox: { x, y, w, h }, text: t, style: { fontSize: `${fs}px` } })
// round 41 e3 to-do as drawn in n150: "Today, huge bold" on a 115px line at y 92, the date on a line 40px under it
const todo = () => [line('s2', 320, 92, 115, 'Today, huge bold'), line('s3', 320, 132, 135, 'Tuesday, March 10'), line('s9', 320, 400, 640)]

describe('n157 a big title is only as big as the gap drawn under it', () => {
  it('to-do: Today capped by the 40px gap to the date line', () => {
    const caps = titleCaps(todo())
    expect(caps).toHaveLength(1)
    expect(caps[0]!.pitch).toBe(40)
    expect(caps[0]!.cap).toBe(38)
    expect(titleCapBrief(caps)).toContain('font-size about 38px and NEVER more')
  })

  it('fails the 60px build that ran over the date, passes a 36px one', () => {
    const caps = titleCaps(todo())
    const bad = verifyTitleCaps(caps, { nodes: [text('a', 'Today', 320, 62, 183, 60, 60), text('b', 'Tuesday, March 10', 320, 116, 140, 18, 13)] })
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toContain('about 38px')
    const ok = verifyTitleCaps(caps, { nodes: [text('a', 'Today', 320, 58, 100, 40, 36), text('b', 'Tuesday, March 10', 320, 118, 140, 18, 13)] })
    expect(ok.satisfied).toBe(true)
  })

  it('leaves alone: long hero lines, two big lines, far subtitles, stacked lines', () => {
    expect(titleCaps([line('a', 100, 200, 600, 'Fresh herbs, big'), line('b', 100, 240, 400, 'picked this morning')])).toHaveLength(0)
    expect(titleCaps([line('a', 100, 200, 150, 'SLOW, huge'), line('b', 100, 240, 150, 'WORK, huge')])).toHaveLength(0)
    expect(titleCaps([line('a', 100, 200, 150, 'Today, huge'), line('b', 100, 330, 150, 'date')])).toHaveLength(0)
    expect(titleCaps(todo(), new Set(['s2']))).toHaveLength(0)
    expect(titleCaps([line('a', 100, 200, 150, 'Today'), line('b', 100, 240, 150, 'date')])).toHaveLength(0)
  })

  it('cannot judge with the words missing', () => {
    expect(verifyTitleCaps(titleCaps(todo()), { nodes: [] }).unverifiable).toBe(true)
    expect(verifyTitleCaps([], { nodes: [] }).unverifiable).toBe(true)
  })
})
