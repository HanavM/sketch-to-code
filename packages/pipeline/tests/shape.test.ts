import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { paintShape } from '../src/shape.js'

/** A component shaped like the ones the pipeline generates. */
const ART = `export default function Face({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 104" className={className}>
      <defs>
        <linearGradient id="face-form" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#dda882" stopOpacity="0.42" />
          <stop offset="60%" stopColor="#dda882" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#dda882" stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <path d="M10,10 L70,10 L40,90 Z" fill="url(#face-form)" />
      <path d="M20,30 L30,30" fill="none" stroke="#232f36" strokeWidth={2} />
      <circle cx="40" cy="40" r="4" fill="#a06746" />
      <ellipse cx="20" cy="60" rx="6" ry="9" />
      <path d="M0,0 L1,1" fill={skin} />
    </svg>
  )
}
`

function repo() {
  const root = mkdtempSync(join(tmpdir(), 's2c-paint-'))
  mkdirSync(join(root, 'src/components'), { recursive: true })
  writeFileSync(join(root, 'src/components/Face.tsx'), ART)
  return root
}
const read = (root: string) => readFileSync(join(root, 'src/components/Face.tsx'), 'utf8')

describe('painting one shape', () => {
  it('swaps a literal fill in place', () => {
    const root = repo()
    // the <circle>
    const r = paintShape(root, { srcLoc: 'src/components/Face.tsx:13:7', prop: 'fill', value: '#ff0000' })
    expect(r.ok).toBe(true)
    expect(r.change).toBe('fill: #a06746 → #ff0000')
    expect(read(root)).toContain('<circle cx="40" cy="40" r="4" fill="#ff0000" />')
    // and nothing else moved
    expect(read(root).replace('#ff0000', '#a06746')).toBe(ART)
  })

  it('adds the attribute when the shape has none', () => {
    const root = repo()
    const r = paintShape(root, { srcLoc: 'src/components/Face.tsx:14:7', prop: 'fill', value: '#00ff00' })
    expect(r.ok).toBe(true)
    expect(read(root)).toContain('<ellipse fill="#00ff00" cx="20"')
  })

  it('paints a stroke without touching the fill', () => {
    const root = repo()
    const r = paintShape(root, { srcLoc: 'src/components/Face.tsx:12:7', prop: 'stroke', value: '#0000ff' })
    expect(r.ok).toBe(true)
    expect(read(root)).toContain('fill="none" stroke="#0000ff"')
  })

  it('recolours a gradient rather than flattening the shading', () => {
    const root = repo()
    // the big <path> is painted by url(#face-form)
    const r = paintShape(root, { srcLoc: 'src/components/Face.tsx:11:7', prop: 'fill', value: '#3366ff' })
    expect(r.ok).toBe(true)
    expect(r.change).toMatch(/recoloured 3 gradient stop\(s\)/)
    const out = read(root)
    // every stop is the new hue…
    expect(out.match(/stopColor="#3366ff"/g)).toHaveLength(3)
    // …and the opacities that carry the form are untouched
    expect(out).toContain('stopOpacity="0.42"')
    expect(out).toContain('stopOpacity="0.26"')
    expect(out).toContain('stopOpacity="0.16"')
    // the shape still references the gradient
    expect(out).toContain('fill="url(#face-form)"')
  })

  it('refuses a value the page computes rather than guessing', () => {
    const root = repo()
    const r = paintShape(root, { srcLoc: 'src/components/Face.tsx:15:7', prop: 'fill', value: '#ff0000' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/expression/)
    expect(read(root)).toBe(ART)
  })

  it('refuses anything that is not a shape, a colour, or a live stamp', () => {
    const root = repo()
    expect(paintShape(root, { srcLoc: 'src/components/Face.tsx:3:5', prop: 'fill', value: '#fff' }).error)
      .toMatch(/not a shape/)
    expect(paintShape(root, { srcLoc: 'src/components/Face.tsx:99:1', prop: 'fill', value: '#fff' }).error)
      .toMatch(/stale stamp/)
    expect(paintShape(root, { srcLoc: 'src/components/Face.tsx:13:7', prop: 'fill', value: 'reddish' }).error)
      .toMatch(/not a colour/)
    expect(paintShape(root, { srcLoc: '../outside.tsx:1:1', prop: 'fill', value: '#fff' }).error)
      .toMatch(/escapes/)
    expect(read(root)).toBe(ART)
  })

  it('stacks: ten paints in a row are ten edits', () => {
    const root = repo()
    for (const c of ['#111111', '#222222', '#333333']) {
      expect(paintShape(root, { srcLoc: 'src/components/Face.tsx:13:7', prop: 'fill', value: c }).ok).toBe(true)
    }
    expect(read(root)).toContain('fill="#333333"')
    expect(paintShape(root, { srcLoc: 'src/components/Face.tsx:13:7', prop: 'fill', value: '#333333' }).change)
      .toMatch(/no change/)
  })
})
