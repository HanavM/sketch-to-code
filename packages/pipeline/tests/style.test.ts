import { describe, expect, it } from 'vitest'
import { normalizeStyle, renderTraits, STYLE_IDS, STYLES, styleFaults } from '../src/style.js'
import { DEFAULT_FIDELITY, fidelityDirective, normalizeFidelity } from '../src/fidelity.js'
import { buildScaffold } from '../src/scaffold.js'
import type { GroundedAction } from '../src/intent2.js'

const action = (): GroundedAction => ({
  kind: 'design', targets: [], instruction: 'draw it', needsConfirm: false,
  region: { x: 0, y: 0, w: 80, h: 100 },
  svgPaths: [{ strokeId: 's0', d: 'M10,10 C40,0 70,30 40,90 Z' }],
  depicts: 'a pear', fidelity: 'recognized',
})

const controls = (over: Partial<typeof DEFAULT_FIDELITY> = {}) => ({
  ...DEFAULT_FIDELITY, ...over, keep: { ...DEFAULT_FIDELITY.keep },
})

describe('style selection', () => {
  it('defaults to imposing nothing', () => {
    expect(DEFAULT_FIDELITY.style).toBe('auto')
    expect(normalizeStyle(undefined)).toBe('auto')
    expect(normalizeStyle('watercolour')).toBe('auto')
    expect(normalizeFidelity({ style: 'glow' }).style).toBe('glow')
    expect(normalizeFidelity({ style: 'nonsense' }).style).toBe('auto')
  })

  it('every style says something specific to the agent', () => {
    for (const id of STYLE_IDS) {
      const d = fidelityDirective(controls({ style: id }))
      expect(d).toContain('STYLE —')
      expect(d).toContain(STYLES[id].directive.slice(0, 40))
    }
  })
})

describe('reading how something was rendered', () => {
  it('sees gradients, filters and fills', () => {
    const t = renderTraits(`
      <svg><defs>
        <linearGradient id="a"><stop stopColor="#fff" /></linearGradient>
        <filter id="g"><feTurbulence baseFrequency="0.8" /><feDisplacementMap scale="3" /></filter>
      </defs>
      <path d="M0,0 L1,1" fill="#abc" /><path d="M2,2 L3,3" fill="none" /></svg>
    `)
    expect(t.gradients).toBe(1)
    expect(t.filters).toEqual(['feTurbulence', 'feDisplacementMap'])
    expect(t.filled).toBe(1)
    expect(t.shapes).toBe(2)
  })
})

describe('a style is checked, not merely requested', () => {
  const FLAT_OK = '<svg><path fill="#123" /><path fill="#456" /><path fill="#789" /></svg>'
  const GRADIENTY = '<svg><defs><linearGradient id="a" /></defs><path fill="url(#a)" /></svg>'

  it('flat rejects gradients and wants real value separation', () => {
    expect(styleFaults('flat', FLAT_OK, 3)).toEqual([])
    expect(styleFaults('flat', GRADIENTY, 3).join(' ')).toMatch(/forbids gradients/)
    expect(styleFaults('flat', FLAT_OK, 1).join(' ')).toMatch(/at least 3 distinct values/)
  })

  it('soft wants the gradient that flat forbids', () => {
    expect(styleFaults('soft', GRADIENTY, 4)).toEqual([])
    expect(styleFaults('soft', FLAT_OK, 4).join(' ')).toMatch(/wants gradients/)
  })

  it('line art refuses fills', () => {
    expect(styleFaults('line', '<svg><path fill="none" stroke="#000" /></svg>', null)).toEqual([])
    expect(styleFaults('line', FLAT_OK, 3).join(' ')).toMatch(/drawn, not painted/)
  })

  it('grain and glow need the filter that makes them what they are', () => {
    expect(styleFaults('grain', FLAT_OK, 3).join(' ')).toMatch(/feTurbulence/)
    expect(styleFaults('grain', '<svg><filter><feTurbulence /></filter><path fill="#1" /><path fill="#2" /><path fill="#3" /></svg>', 3)).toEqual([])
    expect(styleFaults('glow', FLAT_OK, 3).join(' ')).toMatch(/feGaussianBlur/)
  })

  it('auto imposes nothing', () => {
    for (const src of [FLAT_OK, GRADIENTY, '<svg><path fill="none" /></svg>']) {
      expect(styleFaults('auto', src, 1)).toEqual([])
    }
  })
})

describe('the instant render already looks like the style', () => {
  it('flat gets a solid fill, not a gradient', () => {
    const sc = buildScaffold(action(), 0, controls({ style: 'flat' }))!
    expect(sc.code).not.toContain('linearGradient')
    expect(sc.code).toContain('fillOpacity="0.26"')
  })
  it('line art does not fill at all', () => {
    const sc = buildScaffold(action(), 0, controls({ style: 'line' }))!
    expect(sc.code).not.toMatch(/fill="(?!none)/)
  })
  it('soft keeps the gradient', () => {
    const sc = buildScaffold(action(), 0, controls({ style: 'soft' }))!
    expect(sc.code).toContain('linearGradient')
  })
})
