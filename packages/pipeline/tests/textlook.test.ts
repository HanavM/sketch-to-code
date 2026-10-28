import { describe, expect, it } from 'vitest'
import { contrast, markOutlined, outlinedOf, textLookBrief, verifyOutlined, verifyReadable } from '../src/textlook.js'
import type { ShapeMark } from '../src/shapemark.js'

const vp = { w: 1280, h: 900 }
const node = (id: string, parent: string | null, rect: { x: number; y: number; w: number; h: number }, style: Record<string, string> = {}, text = '', tag = 'div') =>
  ({ id, tag, parent, rect, text, style: { backgroundColor: 'rgba(0, 0, 0, 0)', position: 'static', zIndex: 'auto', ...style } })
const box = (): ShapeMark => ({ strokeId: 'b', shape: 'box', box: { x: 400, y: 140, w: 510, h: 375 }, area: true })

describe('outlinedOf (n16)', () => {
  it('reads hollow letters and their colour', () => {
    expect(outlinedOf('huge outlined 09, white')).toEqual({ colour: 'white' })
    expect(outlinedOf('giant hollow number 7')).toEqual({ colour: null })
  })
  it('an outlined frame or plain words are not hollow letters', () => {
    expect(outlinedOf('outlined box round the logo')).toBeNull()
    expect(outlinedOf('huge 09, white')).toBeNull()
  })
})

describe('markOutlined', () => {
  it('flags an area box typed outlined, not a rows box', () => {
    const marks: ShapeMark[] = [box(), { strokeId: 'r', shape: 'box', box: { x: 900, y: 600, w: 300, h: 200 }, area: true, areaOf: 'rows' }]
    markOutlined(marks, [{ text: 'huge outlined 09, white', focus: ['b'] }, { text: '3 rows outlined: A, B', focus: ['r'] }])
    expect(marks[0]!.outlined).toEqual({ colour: 'white' })
    expect(marks[1]!.outlined).toBeUndefined()
    expect(textLookBrief([{ shapeMarks: marks }])).toMatch(/OUTLINED.*transparent.*text-stroke: 2px white/)
  })
})

describe('verifyOutlined', () => {
  const m = () => { const b = box(); b.outlined = { colour: 'white' }; return b }
  const page = (digits: Record<string, string>) => ({
    viewport: vp,
    nodes: [node('p', null, { x: 0, y: 0, w: 1280, h: 900 }, { backgroundColor: 'rgb(225, 40, 30)' }),
      node('d', 'p', { x: 420, y: 160, w: 470, h: 330 }, { fontSize: '320px', ...digits }, '09')],
  })
  it('passes hollow digits', () => {
    expect(verifyOutlined([m()], page({ color: 'rgba(0, 0, 0, 0)', textStroke: '2px' })).satisfied).toBe(true)
  })
  it('fails the solid white digits of round 12 c4 try 1', () => {
    const v = verifyOutlined([m()], page({ color: 'rgb(255, 255, 255)' }))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/solid letters.*hollow/)
  })
  it('no outlined boxes: unverifiable', () => {
    expect(verifyOutlined([box()], page({})).unverifiable).toBe(true)
  })
})

describe('verifyReadable', () => {
  const RED = 'rgb(225, 40, 30)', LIME = 'rgb(200, 240, 60)'
  // a split page: red under, a lime layer clipped to the left of a slanted line
  const split = (navColour: string) => ({
    viewport: vp,
    nodes: [
      node('p', null, { x: 0, y: 0, w: 1280, h: 900 }, { backgroundColor: RED }),
      node('l', 'p', { x: 0, y: 0, w: 1280, h: 900 }, { backgroundColor: LIME, position: 'absolute', clipPath: 'polygon(0px 0px, 700px 0px, 500px 900px, 0px 900px)' }),
      node('h', 'p', { x: 40, y: 300, w: 300, h: 80 }, { color: 'rgb(17, 17, 17)', position: 'relative' }, 'Big headline'),
      node('n', 'p', { x: 1000, y: 30, w: 80, h: 20 }, { color: navColour, position: 'relative' }, 'Menu'),
    ],
  })
  it('black nav on the red half fails (round 12 c4 try 2)', () => {
    const v = verifyReadable(split('rgb(17, 17, 17)'))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/"Menu".*white or light/)
    expect(v.reason).not.toMatch(/Big headline/)
  })
  it('white nav on red and dark text on lime pass', () => {
    expect(verifyReadable(split('rgb(255, 255, 255)')).satisfied).toBe(true)
  })
  it('white text on a white page fails; text on a picture is not judged', () => {
    const page = {
      viewport: vp,
      nodes: [node('p', null, { x: 0, y: 0, w: 1280, h: 900 }, { backgroundColor: 'rgb(255, 255, 255)' }),
        node('t', 'p', { x: 40, y: 40, w: 200, h: 30 }, { color: 'rgb(250, 250, 250)' }, 'Sign in')],
    }
    expect(verifyReadable(page).satisfied).toBe(false)
    const pic = { viewport: vp, nodes: [...page.nodes.slice(0, 1), node('i', 'p', { x: 0, y: 0, w: 400, h: 200 }, { backgroundImage: 'url(a.png)' }), page.nodes[1]!] }
    expect(verifyReadable(pic).unverifiable).toBe(true)
  })
  it('judges text on a red gradient by its stops (round 12 c4 n16 try 1: nav black on the red half)', () => {
    const page = {
      viewport: vp,
      nodes: [node('p', null, { x: 0, y: 0, w: 1280, h: 900 }, { backgroundImage: 'linear-gradient(135deg, rgb(200, 50, 50), rgb(140, 30, 40))' }),
        node('n', 'p', { x: 1000, y: 30, w: 80, h: 20 }, { color: 'rgb(0, 0, 0)' }, 'Routes')],
    }
    expect(verifyReadable(page).reason).toMatch(/"Routes" is #000000 on #aa282d/)
    expect(verifyReadable(page, { skip: (n) => n.text === 'Routes' }).unverifiable).toBe(true)
  })
  it('contrast is WCAG', () => {
    expect(contrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0)
  })
})

describe('oklab colours (n16: Chrome reports text-white/70 as oklab)', () => {
  it('parses white at 70% as white', async () => {
    const { parseCssColor } = await import('../src/palette.js')
    expect(parseCssColor('oklab(0.999994 0.0000455677 0.0000200868 / 0.7)')).toEqual({ r: 255, g: 255, b: 255 })
  })
})
