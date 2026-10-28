import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { applyInstant, instantEligible, mountPoint, planInstant } from '../src/instant.js'
import { DEFAULT_FIDELITY } from '../src/fidelity.js'

const node = (over: Partial<DomNode> & { rect: DomNode['rect'] }): DomNode => ({
  id: 'e0', tag: 'div', srcLoc: null, text: '', classes: [], parent: null, depth: 1,
  style: {
    position: 'static', color: '', backgroundColor: '', display: 'block', zIndex: 'auto',
    flexDirection: 'row', gap: '', padding: '', margin: '', fontSize: '', fontWeight: '', borderRadius: '',
  } as DomNode['style'],
  ...over,
})

const snapshot = (nodes: DomNode[], truncated = false): DomSnapshot => ({
  nodes, truncated, url: 'http://x/', takenAt: 0, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 },
})

/** A page with a positioned container and a card inside it. */
const page = () => snapshot([
  node({ id: 'e1', srcLoc: 'src/App.tsx:8:7', rect: { x: 0, y: 0, w: 1200, h: 800 }, style: { position: 'relative' } as DomNode['style'] }),
  node({ id: 'e2', srcLoc: 'src/components/Card.tsx:3:5', tag: 'section', rect: { x: 100, y: 100, w: 300, h: 160 } }),
])

/** A closed freehand blob (a lumpy star, not a plain ring) drawn in empty space, well clear of the card. */
const blob = (cx = 800, cy = 500, r = 60): Stroke[] => [{
  id: 's0',
  points: Array.from({ length: 40 }, (_, i) => {
    const t = (i / 39) * Math.PI * 2
    const k = 1 + 0.4 * Math.sin(5 * t)
    return { x: cx + Math.cos(t) * r * k, y: cy + Math.sin(t) * r * 0.8 * k, t: i * 16 }
  }),
}]

/** A tight back-and-forth over the card: the classic delete mark. */
const scribble = (): Stroke[] => [{
  id: 's0',
  points: Array.from({ length: 40 }, (_, i) => ({
    x: 120 + i * 6, y: 180 + (i % 2 ? 22 : -22), t: i * 16,
  })),
}]

describe('the gate — it refuses far more than it fires', () => {
  it('accepts a drawing made in empty space', () => {
    expect(instantEligible(blob(), page())).toEqual({ ok: 'maybe' })
  })

  it('refuses a scratch-out, which usually means delete', () => {
    const v = instantEligible(scribble(), page())
    expect(v.ok).toBe(false)
    expect('reason' in v && v.reason).toMatch(/scratch-out|sits on/)
  })

  it('refuses a stroke sitting on an element — it could be a mark about it', () => {
    // a plain line drawn inside the card, no scribbling
    const overCard: Stroke[] = [{
      id: 's0',
      points: Array.from({ length: 20 }, (_, i) => ({ x: 120 + i * 8, y: 180 + i, t: i * 16 })),
    }]
    const v = instantEligible(overCard, page())
    expect(v.ok).toBe(false)
    expect('reason' in v && v.reason).toMatch(/sits on <section>/)
  })

  it('refuses ink too small to be a drawing', () => {
    const v = instantEligible(blob(800, 500, 6), page())
    expect(v.ok).toBe(false)
    expect('reason' in v && v.reason).toMatch(/too small/)
  })

  it('refuses when the page snapshot was truncated', () => {
    const v = instantEligible(blob(), snapshot(page().nodes, true))
    expect(v.ok).toBe(false)
    expect('reason' in v && v.reason).toMatch(/truncated/)
  })

  it('refuses when nothing was drawn', () => {
    expect(instantEligible([], page()).ok).toBe(false)
  })
})

describe('the mount point', () => {
  it('is the tightest POSITIONED ancestor — an unpositioned one would drop it elsewhere', () => {
    const snap = snapshot([
      node({ id: 'e1', srcLoc: 'src/App.tsx:8:7', rect: { x: 0, y: 0, w: 1200, h: 800 }, style: { position: 'relative' } as DomNode['style'] }),
      // tighter, but static: an absolute child would escape it
      node({ id: 'e2', srcLoc: 'src/Inner.tsx:2:3', rect: { x: 700, y: 400, w: 300, h: 250 } }),
    ])
    expect(mountPoint({ x: 740, y: 440, w: 120, h: 96 }, snap)?.id).toBe('e1')
  })

  it('prefers the tighter one when both are positioned', () => {
    const snap = snapshot([
      node({ id: 'e1', srcLoc: 'src/App.tsx:8:7', rect: { x: 0, y: 0, w: 1200, h: 800 }, style: { position: 'relative' } as DomNode['style'] }),
      node({ id: 'e2', srcLoc: 'src/Inner.tsx:2:3', rect: { x: 700, y: 400, w: 300, h: 250 }, style: { position: 'relative' } as DomNode['style'] }),
    ])
    expect(mountPoint({ x: 740, y: 440, w: 120, h: 96 }, snap)?.id).toBe('e2')
  })

  it('declines when nothing positioned contains the ink', () => {
    const v = planInstant(blob(), snapshot([node({ id: 'e1', srcLoc: 'src/App.tsx:8:7', rect: { x: 0, y: 0, w: 1200, h: 800 } })]), DEFAULT_FIDELITY)
    expect(v.ok).toBe(false)
    expect('reason' in v && v.reason).toMatch(/positioned container/)
  })
})

describe('writing and mounting it', () => {
  const repo = () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-instant-'))
    mkdirSync(join(root, 'src/components'), { recursive: true })
    writeFileSync(join(root, 'src/App.tsx'), [
      `import Card from './components/Card'`,
      ``,
      `export default function App() {`,
      `  return (`,
      `    <div className="relative">`,
      `      <Card />`,
      `    </div>`,
      `  )`,
      `}`,
      ``,
    ].join('\n'))
    return root
  }

  it('writes the component and mounts it where it was drawn', () => {
    const root = repo()
    const snap = snapshot([
      node({ id: 'e1', srcLoc: 'src/App.tsx:5:5', rect: { x: 0, y: 0, w: 1200, h: 800 }, style: { position: 'relative' } as DomNode['style'] }),
    ])
    const v = planInstant(blob(800, 500, 60), snap, DEFAULT_FIDELITY)
    expect(v.ok).toBe(true)
    if (!v.ok) return

    const res = applyInstant(root, v.plan)
    const comp = readFileSync(join(root, res.file), 'utf8')
    const app = readFileSync(join(root, 'src/App.tsx'), 'utf8')

    // the drawing is in the component…
    expect(comp).toMatch(/<path d="M/)
    expect(comp).toContain('s2cDraw') // and it paints itself on
    // …and the component is mounted at the ink's offset in the container
    expect(app).toContain(`import ${res.name} from './components/${res.name}'`)
    // mounted at the ink's own offset inside the container
    expect(app).toContain(`<${res.name} className="absolute left-[720px] top-[444px] s2c-etch" />`)
  })

  it('refuses to clobber a component that already exists', () => {
    const root = repo()
    const snap = snapshot([
      node({ id: 'e1', srcLoc: 'src/App.tsx:5:5', rect: { x: 0, y: 0, w: 1200, h: 800 }, style: { position: 'relative' } as DomNode['style'] }),
    ])
    const v = planInstant(blob(), snap, DEFAULT_FIDELITY)
    if (!v.ok) throw new Error('expected a plan')
    writeFileSync(join(root, v.plan.scaffold.rel), 'export default function Existing() { return null }\n')
    expect(() => applyInstant(root, v.plan)).toThrow(/already exists/)
  })

  it('leaves source that still parses', () => {
    const root = repo()
    const snap = snapshot([
      node({ id: 'e1', srcLoc: 'src/App.tsx:5:5', rect: { x: 0, y: 0, w: 1200, h: 800 }, style: { position: 'relative' } as DomNode['style'] }),
    ])
    const v = planInstant(blob(), snap, DEFAULT_FIDELITY)
    if (!v.ok) throw new Error('expected a plan')
    // applyInstant re-parses before writing; a throw here would mean it wrote junk
    expect(() => applyInstant(root, v.plan)).not.toThrow()
  })
})
