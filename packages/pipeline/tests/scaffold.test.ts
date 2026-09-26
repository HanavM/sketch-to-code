import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { buildScaffold, componentName, scaffoldDir } from '../src/scaffold.js'
import { finishSource } from '../src/finish.js'
import { appPalette } from '../src/palette.js'
import { compositionFromSource, compositionFromStrokes, scoreComposition } from '../src/composition.js'
import { DEFAULT_FIDELITY, type FidelityControls } from '../src/fidelity.js'
import type { GroundedAction } from '../src/intent2.js'
import type { Stroke } from '@s2c/ink'

const controls = (over: Partial<FidelityControls> = {}): FidelityControls => ({
  ...DEFAULT_FIDELITY, ...over, keep: { ...DEFAULT_FIDELITY.keep, ...(over.keep ?? {}) },
})

const action = (over: Partial<GroundedAction> = {}): GroundedAction => ({
  kind: 'design', targets: [], instruction: 'draw it', needsConfirm: false,
  region: { x: 100, y: 100, w: 80, h: 104 },
  svgPaths: [
    { strokeId: 's0', d: 'M34,1 C55,2 70,10 74,26 C76,32 68,38 68,44 C60,70 40,90 30,103 Z' },
    { strokeId: 's1', d: 'M46,34 C49,31 55,31 58,33' },
  ],
  depicts: 'a side profile of a face, looking right',
  fidelity: 'recognized',
  ...over,
})

describe('componentName', () => {
  it('finds the identity in a model-written phrase', () => {
    expect(componentName('a side profile of a face, looking right')).toBe('SideProfile')
    expect(componentName('a small cartoon crab-like doodle creature (rounded body, two eyes)')).toBe('CartoonCrab')
    expect(componentName('ribbon')).toBe('Ribbon')
  })
  it('falls back rather than emitting something that is not a component', () => {
    expect(componentName(undefined)).toBe('SketchShape')
    expect(componentName('a the of with')).toBe('SketchShape')
    expect(componentName('123 456')).toBe('SketchShape')
  })
})

describe('buildScaffold — the geometry is supplied, not requested', () => {
  it('writes the drawn paths into a real component', () => {
    const sc = buildScaffold(action(), 0, controls())!
    expect(sc.name).toBe('SideProfile')
    expect(sc.rel).toBe('src/components/SideProfile.tsx')
    expect(sc.code).toContain('M34,1 C55,2')
    expect(sc.code).toContain('M46,34 C49,31')
    expect(sc.code).toContain('viewBox="0 0 80 104"')
    expect(sc.code).toContain('export default function SideProfile()')
  })

  it('fills closed shapes and strokes open ones when a filled result is asked for', () => {
    const sc = buildScaffold(action(), 0, controls({ fill: 'filled' }))!
    const closed = sc.code.split('\n').find((l) => l.includes('M34,1'))!
    const open = sc.code.split('\n').find((l) => l.includes('M46,34'))!
    expect(closed).toContain('fill="currentColor"')
    expect(open).toContain('fill="none"')
    expect(open).toContain('stroke="currentColor"')
  })

  it('strokes everything when line art is asked for', () => {
    const sc = buildScaffold(action(), 0, controls({ fill: 'outline' }))!
    expect(sc.code).not.toContain('fill="currentColor"')
  })

  it('carries the drawn colour as the app token when there is one', () => {
    const sc = buildScaffold(
      action({ color: { drawn: '#dc2626', nearest: { token: 'text-red-600', css: 'rgb(220,38,38)', rgb: { r: 220, g: 38, b: 38 }, count: 3 }, distance: 1 } }),
      0, controls(),
    )!
    expect(sc.code).toContain('text-red-600')
  })

  it('refuses when the user asked for a free reinterpretation', () => {
    // handing over the outline would contradict what they asked for
    expect(buildScaffold(action(), 0, controls({ resemblance: 0.1 }))).toBeNull()
  })

  it('refuses when there is no geometry to supply', () => {
    expect(buildScaffold(action({ svgPaths: [] }), 0, controls())).toBeNull()
    expect(buildScaffold(action({ region: undefined }), 0, controls())).toBeNull()
  })

  it('never reuses a name already taken in the same run', () => {
    const taken = new Set<string>()
    const a = buildScaffold(action(), 0, controls(), { dir: 'src/components', taken })!
    const b = buildScaffold(action(), 1, controls(), { dir: 'src/components', taken })!
    expect(a.name).toBe('SideProfile')
    expect(b.name).toBe('SideProfile2')
  })

  it('puts components where the app keeps them', () => {
    expect(scaffoldDir('src/App.tsx:20:5')).toBe('src/components')
    expect(scaffoldDir('src/components/UserTable.tsx:4:3')).toBe('src/components')
    expect(scaffoldDir('app/ui/Page.tsx:1:1')).toBe('app/ui/components')
    expect(scaffoldDir(null)).toBe('src/components')
  })

  /** The whole point: structure should now be right BEFORE the model runs. */
  it('scores as the drawing, by construction', () => {
    const strokes: Stroke[] = [
      { id: 's0', points: Array.from({ length: 30 }, (_, i) => {
        const t = (i / 30) * Math.PI * 2
        return { x: 140 + Math.cos(t) * 34, y: 150 + Math.sin(t) * 46, t: i }
      }) },
    ]
    const region = { x: 106, y: 104, w: 68, h: 92 }
    const d = `M${strokes[0]!.points.map((p) => `${(p.x - region.x).toFixed(1)},${(p.y - region.y).toFixed(1)}`).join(' L')} Z`
    const sc = buildScaffold(action({ region, svgPaths: [{ strokeId: 's0', d }] }), 0, controls())!
    const verdict = scoreComposition(compositionFromStrokes(strokes), compositionFromSource(sc.code), controls())
    expect(verdict.massSimilarity).toBeGreaterThan(0.9)
    expect(verdict.flaws).not.toContain('displaced')
  })
})

const node = (classes: string[], style: Partial<DomNode['style']>): DomNode => ({
  id: 'e0', tag: 'div', srcLoc: null, text: '', classes, parent: null, depth: 0,
  rect: { x: 0, y: 0, w: 10, h: 10 },
  style: { color: '', backgroundColor: '', display: 'block', position: 'static', zIndex: 'auto',
    flexDirection: 'row', gap: '', padding: '', margin: '', fontSize: '', fontWeight: '',
    borderRadius: '', ...style } as DomNode['style'],
})
const snap = (nodes: DomNode[]): DomSnapshot => ({
  nodes, truncated: false, url: 'http://x/', takenAt: 0, viewport: { w: 100, h: 100, scrollX: 0, scrollY: 0 },
})

describe('the finishing pass', () => {
  const palette = appPalette(snap([
    node(['text-red-600'], { color: 'rgb(220, 38, 38)' }),
    node(['bg-blue-600'], { backgroundColor: 'rgb(37, 99, 235)' }),
  ]))

  it('turns a one-off literal into the token the app already has', () => {
    const { code, edits } = finishSource('<p className="text-[#dc2627] font-bold">x</p>', palette)
    expect(code).toContain('text-red-600')
    expect(code).not.toContain('#dc2627')
    expect(edits[0]!.kind).toBe('colour-snapped')
  })

  it('leaves a colour the app does not have alone', () => {
    const { code, edits } = finishSource('<p className="text-[#22c55e]">x</p>', palette)
    expect(code).toContain('text-[#22c55e]')
    expect(edits).toEqual([])
  })

  it('never turns a text utility into a background one', () => {
    const { code } = finishSource('<p className="bg-[#dc2626]">x</p>', palette)
    expect(code).toContain('bg-[#dc2626]')
  })

  it('leaves literals outside a class alone — swapping one literal for another is not a fix', () => {
    const { code, edits } = finishSource('<path fill="#dc2626" d="M0,0 L1,1" />', palette)
    expect(code).toContain('fill="#dc2626"')
    expect(edits.filter((e) => e.kind === 'colour-snapped')).toEqual([])
  })

  it('drops geometry that cannot render', () => {
    const { code, edits } = finishSource(
      '<svg><path d="M0,0" /><path d="" /><path d="M0,0 L10,10" /></svg>', palette,
    )
    expect(code).toContain('M0,0 L10,10')
    expect(code).not.toContain('d="M0,0" ')
    expect(edits.filter((e) => e.kind === 'empty-path-dropped')).toHaveLength(2)
  })

  it('drops a path emitted twice — invisible, and it doubles the stroke weight', () => {
    const { code, edits } = finishSource(
      '<svg><path d="M0,0 L10,10" /><path d="M0,0 L10,10" /></svg>', palette,
    )
    expect(code.match(/M0,0 L10,10/g)).toHaveLength(1)
    expect(edits.some((e) => e.kind === 'duplicate-path-dropped')).toBe(true)
  })

  it('does nothing to source that is already clean', () => {
    const src = '<svg><path d="M0,0 C1,1 2,2 3,3" fill="none" /></svg>'
    expect(finishSource(src, palette)).toEqual({ code: src, edits: [] })
  })
})
