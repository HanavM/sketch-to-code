import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { appPalette, colorDirective, deltaE, hexOf, matchColor, parseCssColor } from '../src/palette.js'

const node = (classes: string[], style: Partial<DomNode['style']>): DomNode => ({
  id: 'e0', tag: 'div', srcLoc: null, text: '', classes, parent: null, depth: 0,
  rect: { x: 0, y: 0, w: 10, h: 10 },
  style: { color: '', backgroundColor: '', display: 'block', position: 'static', zIndex: 'auto',
    flexDirection: 'row', gap: '', padding: '', margin: '', fontSize: '', fontWeight: '',
    borderRadius: '', ...style } as DomNode['style'],
})

const snap = (nodes: DomNode[]): DomSnapshot => ({
  nodes, truncated: false, url: 'http://x/', takenAt: 0,
  viewport: { w: 100, h: 100, scrollX: 0, scrollY: 0 },
})

describe('parseCssColor', () => {
  it('reads the syntaxes a pen or a browser produces', () => {
    expect(parseCssColor('#f00')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseCssColor('#dc2626')).toEqual({ r: 220, g: 38, b: 38 })
    expect(parseCssColor('rgb(220, 38, 38)')).toEqual({ r: 220, g: 38, b: 38 })
    expect(parseCssColor('rgba(220 38 38 / 0.5)')).toEqual({ r: 220, g: 38, b: 38 })
  })
  it('reads oklch(), which is what Tailwind v4 computes to', () => {
    // anchors: pure sRGB primaries must round-trip exactly
    expect(hexOf(parseCssColor('oklch(0.628 0.2577 29.23)')!)).toBe('#ff0000')
    expect(hexOf(parseCssColor('oklch(1 0 0)')!)).toBe('#ffffff')
    expect(hexOf(parseCssColor('oklch(0 0 0)')!)).toBe('#000000')
    // Tailwind v4 red-600 / blue-600 as Chrome reports them for this demo app
    expect(hexOf(parseCssColor('oklch(0.577 0.245 27.325)')!)).toBe('#e7000b')
    expect(hexOf(parseCssColor('oklch(0.546 0.245 262.881)')!)).toBe('#155dfc')
  })
  it('refuses what it cannot read rather than guessing a colour', () => {
    expect(parseCssColor('transparent')).toBeNull()
    expect(parseCssColor('rgba(0,0,0,0)')).toBeNull()
    expect(parseCssColor('color-mix(in srgb, red, blue)')).toBeNull()
    expect(parseCssColor('')).toBeNull()
  })
})

describe('appPalette', () => {
  it('pairs utility classes with the colour they actually render', () => {
    const p = appPalette(snap([
      node(['rounded-md', 'bg-blue-600', 'text-white'], { backgroundColor: 'rgb(37, 99, 235)', color: 'rgb(255,255,255)' }),
      node(['text-sm', 'text-gray-500'], { color: 'rgb(107, 114, 128)' }),
    ]))
    const tokens = p.map((e) => e.token)
    expect(tokens).toContain('bg-blue-600')
    expect(tokens).toContain('text-gray-500')
    expect(tokens).toContain('text-white')
    // not colours, despite the prefix
    expect(tokens).not.toContain('text-sm')
    expect(tokens).not.toContain('rounded-md')
  })
  it('ranks by how much the app uses them', () => {
    const p = appPalette(snap([
      node(['text-gray-500'], { color: 'rgb(107,114,128)' }),
      node(['text-gray-500'], { color: 'rgb(107,114,128)' }),
      node(['text-red-600'], { color: 'rgb(220,38,38)' }),
    ]))
    expect(p[0]!.token).toBe('text-gray-500')
    expect(p[0]!.count).toBe(2)
  })
})

describe('matchColor', () => {
  const palette = appPalette(snap([
    node(['bg-blue-600'], { backgroundColor: 'rgb(37, 99, 235)' }),
    node(['text-red-600'], { color: 'rgb(220, 38, 38)' }),
    node(['text-gray-500'], { color: 'rgb(107, 114, 128)' }),
  ]))

  it('snaps a drawn colour to the token the app already uses', () => {
    const m = matchColor('#e02424', palette)!
    expect(m.nearest?.token).toBe('text-red-600')
    expect(m.distance).toBeLessThan(25)
    expect(colorDirective(m)).toMatch(/use that class/)
  })
  it('keeps the drawn value when nothing in the app is close', () => {
    const m = matchColor('#22c55e', palette)!
    expect(m.nearest).toBeUndefined()
    expect(m.drawn).toBe('#22c55e')
    expect(colorDirective(m)).toMatch(/arbitrary value/)
  })
  it('is null for a colour it cannot read', () => {
    expect(matchColor('chartreuse-ish', palette)).toBeNull()
  })
  it('hexOf round-trips', () => {
    expect(hexOf({ r: 220, g: 38, b: 38 })).toBe('#dc2626')
  })
})

describe('hoisted path constants', () => {
  it('are still geometry — a long path lifted out of the JSX is the common idiom', async () => {
    const { compositionFromSource } = await import('../src/composition.js')
    const src = `
      const head = 'M34,1 C55,2 70,10 74,26 C76,32 68,38 68,44 C73,45 79,47 79,50 C79,54 67,55 66,58 Z'
      const marks = ['M46,34 L56,33', 'M48,42 L55,44 L49,46']
      export default function FaceDoodle() {
        return (
          <svg viewBox="-2 -2 84 108" fill="none">
            <path d={head} />
            {marks.map((d) => <path key={d} d={d} />)}
          </svg>
        )
      }
    `
    const sig = compositionFromSource(src)
    // without the single-string const, this scored 0 with "no drawn geometry"
    expect(sig.partCount).toBeGreaterThanOrEqual(3)
    expect(sig.fillRatio).toBe(0)
  })
})
