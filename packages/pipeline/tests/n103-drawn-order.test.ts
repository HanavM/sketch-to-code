import { describe, expect, it } from 'vitest'
import type { ShapeMark } from '../src/shapemark.js'
import { drawnOrderBrief, drawnStacks, verifyDrawnOrder } from '../src/drawnorder.js'

type R = { x: number; y: number; w: number; h: number }
const box = (id: string, b: R, own?: string): ShapeMark => ({ strokeId: id, shape: 'box', box: b, ...(own ? { own } : {}) }) as ShapeMark
const t = (id: string, rect: R, text: string) => ({ id, rect, text })
const snap = (nodes: Array<ReturnType<typeof t>>) => ({ nodes, truncated: false })

// r37 e4 team chat (n98 sketch): five message boxes drawn top to bottom, Ravi's note typed last
const sidebar = box('side', { x: 0, y: 0, w: 300, h: 900 })
const rowA = box('ra', { x: 20, y: 131, w: 259, h: 64 }, '#launch / Mia: shipping at 5')
const mia = box('m1', { x: 340, y: 130, w: 451, h: 50 }, 'Mia · 2:14 pm above; Copy is final. Can someone check the pricing page on mobile?')
const onit = box('m2', { x: 866, y: 220, w: 374, h: 50 }, 'On it. Looks fine on iPhone, checking Android now.')
const ravi = box('m3', { x: 340, y: 330, w: 361, h: 50 }, 'Ravi · 2:20 pm above; Android is good too. One typo in the footer, fixed.')
const great = box('m4', { x: 1000, y: 420, w: 240, h: 50 }, 'Great. Shipping at 5 then.')
const image = box('m5', { x: 340, y: 520, w: 260, h: 170 }, 'Mia · 2:31 pm above; image in grey bubble')
const marks = [sidebar, rowA, mia, onit, ravi, great, image]

const miaT = t('a', { x: 360, y: 150, w: 400, h: 18 }, 'Copy is final. Can someone check the pricing page on mobile?')
const onitT = t('b', { x: 880, y: 240, w: 340, h: 18 }, 'On it. Looks fine on iPhone, checking Android now.')
const raviT = (y: number) => t('c', { x: 360, y, w: 330, h: 18 }, 'Android is good too. One typo in the footer, fixed.')
const greatT = t('d', { x: 1020, y: 440, w: 200, h: 18 }, 'Great. Shipping at 5 then.')

describe('n103: marks drawn one under another keep the drawn order', () => {
  it('finds the message boxes as one stack, top to bottom, not the sidebar row', () => {
    const s = drawnStacks(marks)
    expect(s).toHaveLength(1)
    expect(s[0]!.map((m) => m.strokeId)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
  })

  it('tells the build the drawn order with each drawn height', () => {
    const b = drawnOrderBrief([{ shapeMarks: marks }])
    expect(b).toContain('DRAWN ORDER')
    expect(b.indexOf('On it')).toBeLessThan(b.indexOf('Ravi'))
    expect(b).toContain('drawn at y 330-380')
  })

  it('passes when every bubble is built in the drawn order near its height', () => {
    const v = verifyDrawnOrder(marks, snap([miaT, onitT, raviT(350), greatT]))
    expect(v.satisfied).toBe(true)
    expect(v.unverifiable).toBeFalsy()
  })

  it('fails when Ravi is built above On it (n72 try 2), naming both', () => {
    const v = verifyDrawnOrder(marks, snap([miaT, onitT, raviT(200), greatT]))
    expect(v.satisfied).toBe(false)
    expect(v.swapped).toHaveLength(1)
    expect(v.reason).toMatch(/"On it.*drawn above "Ravi.*built below it/)
  })

  it('fails a bubble built far from its drawn height even in order', () => {
    const v = verifyDrawnOrder(marks, snap([miaT, onitT, raviT(395), t('d', { x: 1020, y: 640, w: 200, h: 18 }, 'Great. Shipping at 5 then.')]))
    expect(v.satisfied).toBe(false)
    expect(v.far?.[0]).toMatch(/Great.*lower/)
  })

  it('ignores a whole page a little low (drift is another check)', () => {
    const d = 30
    const v = verifyDrawnOrder(marks, snap([miaT, onitT, raviT(350), greatT].map((n) => ({ ...n, rect: { ...n.rect, y: n.rect.y + d } }))))
    expect(v.satisfied).toBe(true)
  })

  it('is not judged with fewer than three stacked worded marks, or side by side', () => {
    expect(verifyDrawnOrder([mia, onit], snap([miaT, onitT])).unverifiable).toBe(true)
    const row = [box('p1', { x: 100, y: 100, w: 100, h: 40 }, 'Week view now'), box('p2', { x: 220, y: 100, w: 100, h: 40 }, 'Month view now'), box('p3', { x: 340, y: 100, w: 100, h: 40 }, 'Year view now')]
    expect(drawnStacks(row)).toHaveLength(0)
  })

  it('does not take the same text as evidence for two marks', () => {
    const a = box('x1', { x: 100, y: 100, w: 300, h: 40 }, 'Order shipped today')
    const b = box('x2', { x: 100, y: 200, w: 300, h: 40 }, 'Order shipped today')
    const c = box('x3', { x: 100, y: 300, w: 300, h: 40 }, 'Order shipped today')
    const v = verifyDrawnOrder([a, b, c], snap([t('o', { x: 110, y: 10, w: 200, h: 18 }, 'Order shipped today')]))
    expect(v.unverifiable).toBe(true)
  })
})
