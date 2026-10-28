import { describe, expect, it } from 'vitest'
import { finishSource } from '../src/finish.js'

describe('n22: flow-root never beats flex on the same element', () => {
  it('drops flow-root where flex or grid sets the display (login card sat at the left edge)', () => {
    const code = '<main className="min-h-screen flow-root bg-[#f3f4f6] pt-[149px] flex justify-center">'
    const r = finishSource(code, [])
    expect(r.code).toBe('<main className="min-h-screen bg-[#f3f4f6] pt-[149px] flex justify-center">')
    expect(r.edits.map((e) => e.kind)).toContain('display-clash')
    expect(finishSource('<div className="grid flow-root gap-2">', []).code).toBe('<div className="grid gap-2">')
  })
  it('leaves flow-root alone when it is the only display', () => {
    const code = '<main className="relative flow-root min-h-screen">'
    expect(finishSource(code, []).code).toBe(code)
    expect(finishSource('<div className="flex-1 flow-root">', []).code).toBe('<div className="flex-1 flow-root">')
  })
})
