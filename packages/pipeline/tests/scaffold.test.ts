import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { buildScaffold, componentName, isPrimitivePath, lostStrokes, onlyPrimitives, pictureCrossIds, restoreLostStrokes, scaffoldDir } from '../src/scaffold.js'
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
    expect(sc.code).toContain('export default function SideProfile({ className')
  })

  it('fills closed shapes and strokes open ones when a filled result is asked for', () => {
    const sc = buildScaffold(action(), 0, controls({ fill: 'filled' }))!
    const closed = sc.code.split('\n').find((l) => l.includes('M34,1'))!
    const open = sc.code.split('\n').find((l) => l.includes('M46,34'))!
    // a gradient, not a flat colour: three values is what makes a shape read
    // as a form rather than a cut-out
    expect(closed).toMatch(/fill="url\(#[\w-]+\)"/)
    expect(sc.code).toContain('linearGradient')
    expect(open).toContain('fill="none"')
    expect(open).toContain('stroke="currentColor"')
  })

  it('fills a shape asked for as a vivid colour at full strength, not a faint tint', () => {
    const faint = buildScaffold(action(), 0, controls({ fill: 'filled' }))!
    expect(faint.code).toContain('stopOpacity="0.42"')
    const vivid = buildScaffold(action({ instruction: 'Soft blurred big vivid pink circle behind the card' }), 0, controls({ fill: 'filled' }))!
    expect(vivid.code).toContain('stopOpacity="1"')
    expect(vivid.code).not.toContain('stopOpacity="0.16"')
  })

  it('fills a gradient block at full strength unless the words soften it (round-5 c4 pale photo)', () => {
    const photo = buildScaffold(action({ instruction: 'Tilted rectangular block with a light orange-to-brown gradient fill and a hard dark-brown drop shadow' }), 0, controls({ fill: 'filled' }))!
    expect(photo.code).toContain('stopOpacity="1"')
    expect(photo.code).not.toContain('stopOpacity="0.16"')
    const soft = buildScaffold(action({ instruction: 'a blob with a subtle pink gradient' }), 0, controls({ fill: 'filled' }))!
    expect(soft.code).toContain('stopOpacity="0.42"')
  })

  it('leaves a shape asked for as an outline or ring unfilled (round-3 c3 orbit rings)', () => {
    for (const instruction of ['Large spinning outline circle in lavender', 'a hollow cyan ring behind the headline']) {
      const sc = buildScaffold(action({ instruction }), 0, controls({ fill: 'filled' }))!
      expect(sc.code).not.toContain('linearGradient')
      expect(sc.code.split('\n').find((l) => l.includes('M34,1'))).toContain('fill="none"')
    }
    // 'outline' inside another word is not a request for one
    expect(buildScaffold(action({ instruction: 'a ringed planet, filled' }), 0, controls({ fill: 'filled' }))!.code).toContain('linearGradient')
  })

  it('strokes everything when line art is asked for', () => {
    const sc = buildScaffold(action(), 0, controls({ fill: 'outline' }))!
    expect(sc.code).not.toContain('linearGradient')
    expect(sc.code).not.toMatch(/fill="url/)
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

  /**
   * A card box or a button outline is a WIDGET: the interpreter leaves its
   * fidelity unset and the contract says rectify it, don't reproduce it. Before
   * s2c-014 the default rung still wrote its wobbly outline into a component
   * labelled "drawn by the user, keep it".
   */
  describe('widgets are rectified, not scaffolded', () => {
    const box = 'M2,3 L118,1 L121,62 L4,66'          // a rough, unclosed card
    const widget = (over: Partial<GroundedAction> = {}) => action({
      region: { x: 40, y: 200, w: 124, h: 68 },
      svgPaths: [{ strokeId: 's3', d: box }],
      depicts: undefined, fidelity: undefined,
      instruction: 'pricing card', ...over,
    })

    it('a widget design action gets no scaffold at the default rung', () => {
      expect(buildScaffold(widget(), 0, controls())).toBeNull()
      expect(buildScaffold(widget({ kind: 'add' }), 0, controls())).toBeNull()
    })

    it('nor at normalize or rebuild', () => {
      expect(buildScaffold(widget(), 0, controls({ resemblance: 0.4 }))).toBeNull()
      expect(buildScaffold(widget(), 0, controls({ resemblance: 0.7 }))).toBeNull()
    })

    it('a depiction and a decoration still do, at the same rung', () => {
      expect(buildScaffold(action(), 0, controls())).not.toBeNull()
      const wave = buildScaffold(widget({ fidelity: 'verbatim', depicts: 'wave' }), 0, controls())!
      expect(wave.code).toContain(box)
    })

    it("at the trace rung run2 marks every drawn form 'verbatim', widgets included, and they are scaffolded", () => {
      // mirrors run2: rung === 'trace' -> a.fidelity = 'verbatim' for any action with paths
      const traced = widget({ fidelity: 'verbatim' })
      expect(buildScaffold(traced, 0, controls({ resemblance: 0.9 }))).not.toBeNull()
    })
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

describe('pictureCrossIds — the X of a picture box is a sign, not geometry', () => {
  const box = { strokeId: 's2', d: 'M0.5,0.8 C100,0 300,1 398,0.6 C399,200 398,400 398,511 C300,512 100,511 1,511 C1,300 0,100 0.5,0.8 Z' }
  const down = { strokeId: 's3', d: 'M0.5,0.8 C53.4,73.5 111.7,142.4 166.8,213.5 C243.8,313 319,414.3 398.5,511.8' }
  const up = { strokeId: 's4', d: 'M398.5,0.8 C337.7,80.2 274.7,157.7 213.7,237 C57.5,439.7 27.4,474.5 0.5,511.8' }
  const region = { x: 510, y: 153, w: 399, h: 513 }
  it('finds both diagonals of a crossed box (round 5 c4 photo)', () => {
    expect([...pictureCrossIds([box, down, up], region)].sort()).toEqual(['s3', 's4'])
  })
  it('keeps a lone diagonal: it may be a real line', () => {
    expect(pictureCrossIds([box, down], region).size).toBe(0)
  })
  it('drops the X from the scaffold but keeps the box', () => {
    const sc = buildScaffold(action({ region, svgPaths: [box, down, up], depicts: 'gradient block' }), 0, controls())
    expect(sc?.code).toContain('s2: drawn by the user')
    expect(sc?.code).not.toContain('s3: drawn by the user')
    expect(sc?.code).not.toContain('s4: drawn by the user')
  })
})

describe('lostStrokes — a drawn stroke stays drawn where it was', () => {
  const box = { strokeId: 's2', d: 'M0.5,0.8 C100,0 300,1 398,0.6 C399,200 398,400 398,511 C300,512 100,511 1,511 C1,300 0,100 0.5,0.8 Z' }
  const region = { x: 510, y: 153, w: 399, h: 513 }
  const sc = buildScaffold(action({ region, svgPaths: [box], depicts: 'gradient block' }), 0, controls())!
  it('passes the scaffold as written, and a restyled path with the same d', () => {
    expect(lostStrokes(sc.code, sc.code)).toEqual([])
    expect(lostStrokes(sc.code, `<path d="${box.d}" fill="url(#g)" />`)).toEqual([])
  })
  it('flags a stroke left only as a translated shadow copy (round 5 c4 photo built dark brown)', () => {
    const now = `{/* hard shadow */}\n<path transform="translate(24,24)" d="${box.d}" fill="#3b2a1f" />\n{/* s2: drawn by the user — measured geometry, keep it */}\n</svg>`
    expect(lostStrokes(sc.code, now)).toEqual(['s2'])
  })
  it('flags a stroke that is gone', () => {
    expect(lostStrokes(sc.code, '<svg></svg>')).toEqual(['s2'])
  })
})

describe('restoreLostStrokes — put a lost drawn stroke back without a model', () => {
  const box = { strokeId: 's1', d: 'M0.9,0.8 C92,-1 184,2 275,1.1 C365,0 365,200 364,444 C200,446 100,446 0.3,445 C0,300 0,100 0.9,0.8 Z' }
  const sc = buildScaffold(action({ region: { x: 480, y: 79, w: 366, h: 446 }, svgPaths: [box], depicts: 'gradient block' }), 0, controls())!
  const shadowOnly = `<svg>\n<defs><linearGradient id="g2"/></defs>\n<path d="${box.d}" fill="#000" fillOpacity={0.18} transform="translate(14,14)" />\n{/* s1: drawn by the user — measured geometry, keep it */}\n</svg>`
  it('puts the path back after its comment, on top of the shadow copy (round 4 c1 grey slab)', () => {
    const out = restoreLostStrokes(sc.code, shadowOnly, ['s1'])!
    expect(lostStrokes(sc.code, out)).toEqual([])
    expect(out.indexOf('translate(14,14)')).toBeLessThan(out.lastIndexOf(`d="${box.d}"`))
  })
  it('falls back to currentColor when the gradient it pointed at is gone, and to before </svg> with no comment', () => {
    const out = restoreLostStrokes(sc.code, '<svg>\n</svg>', ['s1'])!
    expect(lostStrokes(sc.code, out)).toEqual([])
    expect(out).not.toMatch(/url\(#/)
  })
  it('gives up when there is no svg to put it in', () => {
    expect(restoreLostStrokes(sc.code, 'export default () => null', ['s1'])).toBeNull()
  })
})

describe('onlyPrimitives — a widget drawn as plain boxes is not a form (round 7 e4)', () => {
  const rect = (x: number, y: number, w: number, h: number, id: string) => ({
    strokeId: id, d: `M${x + 1},${y} C${x + w / 3},${y + 1} ${x + 2 * w / 3},${y - 1} ${x + w},${y + 1} C${x + w + 1},${y + h / 3} ${x + w},${y + 2 * h / 3} ${x + w - 1},${y + h} C${x + 2 * w / 3},${y + h + 1} ${x + w / 3},${y + h} ${x},${y + h - 1} C${x - 1},${y + 2 * h / 3} ${x + 1},${y + h / 3} ${x + 1},${y} Z`,
  })
  const dot = (cx: number, cy: number, r: number, id: string) => {
    const k = 0.55 * r
    return { strokeId: id, d: `M${cx + r},${cy} C${cx + r},${cy + k} ${cx + k},${cy + r} ${cx},${cy + r} C${cx - k},${cy + r} ${cx - r},${cy + k} ${cx - r},${cy} C${cx - r},${cy - k} ${cx - k},${cy - r} ${cx},${cy - r} C${cx + k},${cy - r} ${cx + r},${cy - k} ${cx + r},${cy} Z` }
  }
  const line = (x0: number, y0: number, x1: number, y1: number, id: string) => ({ strokeId: id, d: `M${x0},${y0} C${(2 * x0 + x1) / 3},${(2 * y0 + y1) / 3 + 1} ${(x0 + 2 * x1) / 3},${(y0 + 2 * y1) / 3 - 1} ${x1},${y1}` })
  const rounded = { strokeId: 'b', d: 'M16,0 L384,0 C393,0 400,7 400,16 L400,28 C400,37 393,44 384,44 L16,44 C7,44 0,37 0,28 L0,16 C0,7 7,0 16,0 Z' }
  const heart = { strokeId: 'h', d: 'M25,12 C20,0 0,0 2,16 C4,30 20,38 25,46 C30,38 46,30 48,16 C50,0 30,0 25,12 Z' }
  const tilted = { strokeId: 't', d: 'M0,60 L600,0 L610,90 L10,150 Z' }
  const garment = { strokeId: 'g', d: 'M120,40 C160,20 240,20 280,40 L360,120 L320,160 L300,140 L300,420 L100,420 L100,140 L80,160 L40,120 Z' }

  it('reads boxes, rounded buttons, small dots and straight lines as primitives', () => {
    expect(isPrimitivePath(rect(0, 0, 84, 84, 'r').d)).toBe(true)
    expect(isPrimitivePath(rounded.d)).toBe(true)
    expect(isPrimitivePath(dot(18, 18, 16, 'd').d)).toBe(true)
    expect(isPrimitivePath(line(0, 0, 84, 84, 'l').d)).toBe(true)
  })
  it('keeps real geometry: a heart, a tilted band, a silhouette, a big circle', () => {
    expect(isPrimitivePath(heart.d)).toBe(false)
    expect(isPrimitivePath(tilted.d)).toBe(false)
    expect(isPrimitivePath(garment.d)).toBe(false)
    expect(isPrimitivePath(dot(150, 150, 140, 'm').d)).toBe(false)
  })
  it('skips a column of crossed thumbnails, a swatch row and an icon button square', () => {
    const thumbs = [0, 1, 2, 3].flatMap((i) => [rect(0, i * 94, 84, 84, `b${i}`), line(0, i * 94, 84, i * 94 + 84, `x${i}`), line(84, i * 94, 0, i * 94 + 84, `y${i}`)])
    expect(buildScaffold(action({ region: { x: 51, y: 119, w: 86, h: 370 }, svgPaths: thumbs, depicts: 'thumbnails' }), 0, controls())).toBeNull()
    const swatches = [0, 1, 2, 3].map((i) => dot(18 + i * 48, 18, 16, `s${i}`))
    expect(buildScaffold(action({ region: { x: 738, y: 304, w: 184, h: 36 }, svgPaths: swatches, depicts: 'swatches' }), 0, controls())).toBeNull()
    expect(buildScaffold(action({ region: { x: 1152, y: 522, w: 50, h: 50 }, svgPaths: [rect(0, 0, 48, 48, 'w')], depicts: 'heart icon' }), 0, controls())).toBeNull()
  })
  it('still scaffolds a single big box, a drawn heart, and anything at the trace rung', () => {
    expect(buildScaffold(action({ region: { x: 0, y: 0, w: 520, h: 620 }, svgPaths: [rect(0, 0, 518, 618, 'p')], depicts: 'photo' }), 0, controls())).not.toBeNull()
    expect(buildScaffold(action({ region: { x: 0, y: 0, w: 50, h: 50 }, svgPaths: [heart], depicts: 'heart' }), 0, controls())).not.toBeNull()
    const swatches = [0, 1].map((i) => dot(18 + i * 48, 18, 16, `s${i}`))
    expect(buildScaffold(action({ region: { x: 0, y: 0, w: 90, h: 36 }, svgPaths: swatches, fidelity: 'verbatim' }), 0, controls({ resemblance: 0.95 }))).not.toBeNull()
  })
  it('keeps a drawing that mixes a primitive with real geometry', () => {
    expect(onlyPrimitives([rect(0, 0, 84, 84, 'r'), garment], { w: 400, h: 440 })).toBe(false)
  })
  it('keeps one or two big boxes and boxes of mixed sizes (creative cubes, skylines, tilted photos)', () => {
    expect(onlyPrimitives([rect(0, 0, 260, 210, 'a'), rect(10, 10, 240, 60, 'b')], { w: 262, h: 212 })).toBe(false)
    expect(onlyPrimitives([rect(0, 0, 400, 300, 'a'), line(0, 0, 400, 300, 'x'), line(400, 0, 0, 300, 'y')], { w: 402, h: 302 })).toBe(false)
    expect(onlyPrimitives([rect(0, 0, 400, 60, 'a'), rect(0, 80, 120, 300, 'b'), rect(140, 80, 260, 300, 'c')], { w: 402, h: 382 })).toBe(false)
  })
})
