import { describe, expect, it } from 'vitest'
import { fitScreenBrief, screenFit, verifyFitsScreen } from '../src/fitscreen.js'

const vp = { w: 1280, h: 900 }
const node = (id: string, parent: string | null, y: number, h: number, extra: Partial<{ tag: string; text: string; position: string }> = {}) => ({
  id, parent, tag: extra.tag ?? 'div', srcLoc: null, text: extra.text ?? '',
  rect: { x: 0, y, w: 400, h }, style: { position: extra.position ?? 'static' },
})
const snap = (h: number, nodes: ReturnType<typeof node>[] = []) => ({ nodes, viewport: { ...vp }, doc: { w: 1280, h } })
const stroke = (y: number) => ({ points: [{ x: 10, y: 10 }, { x: 300, y }] })
const fit = { drawnBottom: 898 }

describe('n247 a page drawn inside the screen stays inside it', () => {
  it('holds a drawing inside the screen to it', () => {
    expect(screenFit([stroke(898)], [], vp)).toEqual({ drawnBottom: 898 })
    expect(fitScreenBrief(screenFit([stroke(898)], [], vp), vp)).toContain('does not scroll')
  })
  it('lets a page drawn past the screen run on', () => {
    expect(screenFit([stroke(1400)], [], vp)).toBeNull()
    expect(fitScreenBrief(null, vp)).toBe('')
  })
  it('lets a note ask for a long page', () => {
    expect(screenFit([stroke(600)], ['long page, it scrolls'], vp)).toBeNull()
    expect(screenFit([stroke(600)], ['scrolling list of orders'], vp)).toBeNull()
  })
  it('a look word is not a long page', () => {
    expect(screenFit([stroke(600)], ['tall white panel', 'long line of words'], vp)).not.toBeNull()
  })
  it('lets a count that reaches past the screen run on', () => {
    expect(screenFit([stroke(400)], [], vp, [{ axis: 'y', n: 12, gap: 10, mark: { y: 300, h: 60 } }])).toBeNull()
    expect(screenFit([stroke(400)], [], vp, [{ axis: 'y', n: 4, gap: 10, mark: { y: 300, h: 60 } }])).not.toBeNull()
    expect(screenFit([stroke(400)], [], vp, [{ axis: 'x', n: 40, gap: 10, mark: { y: 300, h: 60 } }])).not.toBeNull()
  })
  it('passes a page that fits, and a rounding hair over', () => {
    expect(verifyFitsScreen(fit, snap(900), snap(900)).satisfied).toBe(true)
    expect(verifyFitsScreen(fit, snap(900), snap(902)).satisfied).toBe(true)
  })
  it('the wifi page: empty room under the last button is named as that', () => {
    const v = verifyFitsScreen(fit, snap(900), snap(918, [
      node('m', null, 0, 918, { tag: 'main' }),
      node('a', 'm', 0, 918, { tag: 'aside' }),
      node('i', 'a', 84, 40, { tag: 'a', text: 'Devices' }),
      node('b', 'm', 831, 47, { tag: 'button', text: 'Restart router' }),
    ]))
    expect(v.satisfied).toBe(false)
    expect(v.over).toBe(18)
    expect(v.reason).toContain('18px past')
    expect(v.reason).toContain('Restart router')
    expect(v.reason).toContain('empty room')
    expect(v.reason).toContain('moving nothing')
  })
  it('one part a little off the bottom is named too', () => {
    const v = verifyFitsScreen(fit, snap(900), snap(930, [
      node('m', null, 0, 930, { tag: 'main' }),
      node('b', 'm', 880, 50, { tag: 'button', text: 'Save' }),
    ]))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('ends at y 930')
    expect(v.reason).toContain('Save')
  })
  it('a long overrun of real content is left to the placement checks', () => {
    const v = verifyFitsScreen(fit, snap(900), snap(1400, [
      node('m', null, 0, 1400, { tag: 'main' }),
      node('b', 'm', 1300, 80, { tag: 'button', text: 'Save' }),
    ]))
    expect(v.unverifiable).toBe(true)
  })
  it('empty room is named however far it runs', () => {
    const v = verifyFitsScreen(fit, snap(900), snap(1400, [
      node('m', null, 0, 1400, { tag: 'main' }),
      node('b', 'm', 700, 80, { tag: 'button', text: 'Save' }),
    ]))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('empty room')
  })
  it('a fixed bar is not what ends lowest', () => {
    const v = verifyFitsScreen(fit, snap(900), snap(930, [
      node('m', null, 0, 930, { tag: 'main' }),
      node('b', 'm', 700, 50, { tag: 'button', text: 'Save' }),
      node('t', 'm', 860, 70, { text: 'toast', position: 'fixed' }),
    ]))
    expect(v.reason).toContain('Save')
  })
  it('a fix on a page that already ran past is not asked to shorten it', () => {
    expect(verifyFitsScreen(fit, snap(1200), snap(1200)).unverifiable).toBe(true)
  })
  it('a host without the height stays silent, and no claim means no check', () => {
    expect(verifyFitsScreen(fit, snap(900), { nodes: [], viewport: { ...vp } }).unverifiable).toBe(true)
    expect(verifyFitsScreen(null, snap(900), snap(1200)).unverifiable).toBe(true)
  })
})
