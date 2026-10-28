import { describe, expect, it } from 'vitest'
import { resolveNotes } from '../src/intent2.js'

describe('n29: a note typed in empty space keeps its spot', () => {
  it('placed run notes carry where they were typed; whole-sketch ones do not', () => {
    const snap = { nodes: [], viewport: { w: 1280, h: 900 } } as never
    const out = resolveNotes([
      { id: 'a', text: 'Today · Fri 14 June', at: { x: 1140, y: 45 }, anchor: { kind: 'run', placed: true } },
      { id: 'b', text: 'all text white', at: { x: 900, y: 750 }, anchor: { kind: 'run' } },
    ], snap, new Set())
    expect(out[0]).toMatchObject({ scope: 'run', placed: true, at: { x: 1140, y: 45 } })
    expect(out[1]).toEqual({ id: 'b', text: 'all text white', scope: 'run' })
  })
})
