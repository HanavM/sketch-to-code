import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { linkToScreen } from '../src/navigate.js'
import { insideShare, retargetIntoScreens, screenBox, screenMainStamp } from '../src/screen-contents.js'
import { judgeProbe, type ProbeObservation, type ProbeSpec, type ProbeVerdict } from '../src/probe.js'
import { verifyActions } from '../src/run2.js'
import { explainRun } from '../src/explain.js'
import type { GroundedAction, GroundedTarget } from '../src/intent2.js'

const MAIN = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`
const HERO = `export default function Hero() {
  return (
    <section>
      <button className="btn">See pricing</button>
    </section>
  )
}
`
function app(): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-screen-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', dependencies: { react: '^19.0.0' } }))
  for (const [rel, text] of Object.entries({ 'src/main.tsx': MAIN, 'src/App.tsx': 'export default function App() { return null }\n', 'src/Hero.tsx': HERO })) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return root
}

// ── ink: an arrow from the button to a box off to the right, a form sketched inside it
const rect = (id: string, x0: number, y0: number, x1: number, y1: number): Stroke => ({
  id, points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0 + 3, y: y0 + 4 }],
})
const ARROW: Stroke = { id: 's1', points: [{ x: 200, y: 100 }, { x: 400, y: 120 }, { x: 600, y: 140 }, { x: 590, y: 130 }, { x: 600, y: 140 }, { x: 590, y: 150 }] }
const BOX = rect('s2', 620, 60, 1000, 460)
const NAME: Stroke = { id: 's3', points: [{ x: 660, y: 90 }, { x: 680, y: 80 }, { x: 700, y: 92 }, { x: 720, y: 82 }] }
const FIELD = rect('s4', 660, 160, 940, 200)
const SUBMIT = rect('s5', 660, 230, 780, 270)
const ELSEWHERE = rect('s6', 100, 500, 400, 600)
const STROKES = [ARROW, BOX, NAME, FIELD, SUBMIT, ELSEWHERE]

const T = (srcLoc: string, tag: string, text: string): GroundedTarget => ({
  domId: 'e1', srcLoc, tag, text, subtreeText: text, classes: [], rect: { x: 150, y: 90, w: 100, h: 30 },
})
const navAction = (): GroundedAction => ({
  kind: 'navigate', targets: [T('src/Hero.tsx:4:7', 'button', 'See pricing')], instruction: 'opens Pricing',
  screen: 'Pricing', needsConfirm: false, region: { x: 200, y: 60, w: 800, h: 400 },
  strokeIds: ['s1', 's2', 's3'],
})
const addAction = (ids: string[], region: { x: number; y: number; w: number; h: number }, instruction = 'a login form'): GroundedAction => ({
  kind: 'add', targets: [], instruction, needsConfirm: false, region,
  dest: T('src/Hero.tsx:3:5', 'section', 'See pricing'), position: 'after',
  svgPaths: ids.map((strokeId) => ({ strokeId, d: 'M0 0' })),
})

describe('screenBox: which stroke is the screen', () => {
  it('is the largest stroke that closes on itself, never the arrow', () => {
    expect(screenBox(navAction(), STROKES)).toEqual({ x: 620, y: 60, w: 380, h: 400 })
  })
  it('is nothing when no cited stroke closes (an open bracket, a lone arrow)', () => {
    const a = navAction()
    a.strokeIds = ['s1', 's3']
    expect(screenBox(a, STROKES)).toBeNull()
  })
})

describe('insideShare', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 }
  it('measures how much of a region lies in the box', () => {
    expect(insideShare({ x: 10, y: 10, w: 20, h: 20 }, box)).toBe(1)
    expect(insideShare({ x: 90, y: 0, w: 20, h: 10 }, box)).toBeCloseTo(0.5)
    expect(insideShare({ x: 200, y: 0, w: 20, h: 10 }, box)).toBe(0)
    expect(insideShare({ x: 50, y: 50, w: 0, h: 0 }, box)).toBe(1)
  })
})

describe('retargetIntoScreens: a sketch inside the screen box goes on the screen (s2c-040)', () => {
  const setup = () => {
    const root = app()
    const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:4:7', screen: 'Pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(out.screenAt).toBe('src/screens/Pricing.tsx')
    const applied = [{ index: 0, file: out.screenAt!, route: out.route!, title: out.title! }]
    return { root, applied }
  }

  it('finds the <main> the engine wrote', () => {
    const { root } = setup()
    const stamp = screenMainStamp(root, 'src/screens/Pricing.tsx')
    expect(stamp).toBe('src/screens/Pricing.tsx:5:5')
    const line = readFileSync(join(root, 'src/screens/Pricing.tsx'), 'utf8').split('\n')[4]!
    expect(line.slice(4).startsWith('<main')).toBe(true)
  })

  it('points the add inside the box at the screen file, says so in its instruction, and leaves the rest alone', () => {
    const { root, applied } = setup()
    const inside = addAction(['s4', 's5'], { x: 660, y: 160, w: 280, h: 110 })
    const outside = addAction(['s6'], { x: 100, y: 500, w: 300, h: 100 }, 'a footer')
    const actions = [navAction(), inside, outside]
    const moved = retargetIntoScreens(root, actions, STROKES, applied, new Set([0]))
    expect(moved).toEqual([{ index: 1, navIndex: 0, file: 'src/screens/Pricing.tsx' }])
    expect(inside.dest?.srcLoc).toBe('src/screens/Pricing.tsx:5:5')
    expect(inside.position).toBe('into')
    expect(inside.onScreen).toEqual({ name: 'Pricing', route: '#/pricing', file: 'src/screens/Pricing.tsx', navIndex: 0 })
    expect(inside.instruction).toMatch(/^ON THE "Pricing" SCREEN, not the page it was drawn on: build this inside the <main> of src\/screens\/Pricing\.tsx/)
    expect(inside.instruction).toMatch(/a login form$/)
    expect(outside.onScreen).toBeUndefined()
    expect(outside.dest?.srcLoc).toBe('src/Hero.tsx:3:5')
    expect(outside.instruction).toBe('a footer')
  })

  it('a sketch that pokes a little over the edge still counts; one mostly outside does not', () => {
    const { root, applied } = setup()
    const poke = addAction(['s4'], { x: 660, y: 160, w: 370, h: 40 }) // 340/370 inside
    const mostlyOut = addAction(['s5'], { x: 900, y: 400, w: 200, h: 200 })
    retargetIntoScreens(root, [navAction(), poke, mostlyOut], STROKES, applied, new Set([0]))
    expect(poke.onScreen?.name).toBe('Pricing')
    expect(mostlyOut.onScreen).toBeUndefined()
  })

  it('never moves the box itself cited as an add, an action an engine handled, or anything when no box closes', () => {
    const { root, applied } = setup()
    const box = addAction(['s2'], { x: 620, y: 60, w: 380, h: 400 })
    const done = addAction(['s4'], { x: 660, y: 160, w: 280, h: 40 })
    retargetIntoScreens(root, [navAction(), box, done], STROKES, applied, new Set([0, 2]))
    expect(box.onScreen).toBeUndefined()
    expect(done.onScreen).toBeUndefined()

    const open = navAction()
    open.strokeIds = ['s1']
    const inner = addAction(['s4'], { x: 660, y: 160, w: 280, h: 40 })
    expect(retargetIntoScreens(root, [open, inner], STROKES, applied, new Set([0]))).toEqual([])
    expect(inner.onScreen).toBeUndefined()
  })
})

describe('verifying what was built on another screen', () => {
  const snap = { nodes: [], viewport: { w: 1280, h: 900 }, url: 'http://x/' } as unknown as DomSnapshot
  const onScreen = (): GroundedAction => ({
    ...addAction(['s4'], { x: 660, y: 160, w: 280, h: 40 }),
    onScreen: { name: 'Pricing', route: '#/pricing', file: 'src/screens/Pricing.tsx', navIndex: 0 },
    color: { drawn: '#ff0000' } as GroundedAction['color'],
  })
  const probe = (p: Partial<ProbeVerdict>): ProbeVerdict => ({ actionIndex: 0, status: 'passed', reason: 'opened', ...p })

  it('passes when the navigate probe saw new things on the screen, and does not judge it by the page it was drawn on', () => {
    const r = verifyActions([navAction(), onScreen()], snap, snap, undefined, [probe({ screenContent: { count: 3, sample: 'Email · Sign in' } })])
    expect(r.failures).toEqual([])
    expect(r.score).toBe(1)
    expect(JSON.stringify(r.detail)).toContain('the \\"Pricing\\" screen shows it (Email · Sign in)')
  })

  it('fails in plain words when the screen opened empty, or could not be opened', () => {
    const empty = verifyActions([navAction(), onScreen()], snap, snap, undefined, [probe({ screenContent: { count: 0, sample: '' } })])
    expect(empty.failures).toEqual(['action 1 (add): the "Pricing" screen opened, but nothing you drew in its box is on it'])
    const none = verifyActions([navAction(), onScreen()], snap, snap, undefined, [probe({ status: 'unverified', reason: 'x' })])
    expect(none.failures.some((f) => /action 1 \(add\): couldn't open the "Pricing" screen/.test(f))).toBe(true)
  })
})

describe('the navigate probe carries what the screen showed', () => {
  const spec: ProbeSpec = {
    actionIndex: 0, kind: 'navigate', trigger: { srcLoc: 'a:1:1', label: '"See pricing"' },
    screen: { route: '#/pricing', heading: 'Pricing' }, claim: '',
  }
  const obs = (contents?: { count: number; sample: string }): ProbeObservation => ({
    ran: true, requests: [], before: '', after: '', ms: 5,
    nav: { hashBefore: '', hashAfter: '#/pricing', triggerGone: true, headingShown: true, back: 'button', backOk: true, ...(contents ? { contents } : {}) },
  })
  it('passes it through on a pass, and stays absent when the browser said nothing', () => {
    const clean = { changed: [], restored: true }
    expect(judgeProbe(spec, obs({ count: 2, sample: 'Email' }), clean)).toMatchObject({ status: 'passed', screenContent: { count: 2, sample: 'Email' } })
    expect(judgeProbe(spec, obs(), clean).screenContent).toBeUndefined()
  })
})

describe('the receipt names both the screen and what went on it', () => {
  it('says the sketch was put on the screen, in the user\'s word', () => {
    const add = { ...addAction(['s4'], { x: 0, y: 0, w: 1, h: 1 }), notes: ['login form'],
      onScreen: { name: 'Pricing', route: '#/pricing', file: 'src/screens/Pricing.tsx', navIndex: 0 } }
    const ex = explainRun({ reading: 'See pricing opens a Pricing screen with a login form', actions: [navAction(), add], failures: [], files: ['src/screens/Pricing.tsx'] })
    expect(ex.sentence).toMatch(/"Pricing" screen/)
    expect(ex.sentence).toMatch(/put "login form" on the "Pricing" screen/)
  })
  it('does not echo the screen name back as the content, and says which screen when it fails', () => {
    const add = { ...addAction(['s4'], { x: 0, y: 0, w: 1, h: 1 }), notes: ['pricing'],
      onScreen: { name: 'Pricing', route: '#/pricing', file: 'src/screens/Pricing.tsx', navIndex: 0 } }
    const ok = explainRun({ reading: 'r', actions: [navAction(), add], failures: [], files: ['src/screens/Pricing.tsx'] })
    expect(ok.sentence).toMatch(/put what you drew in its box on the "Pricing" screen/)
    const bad = explainRun({ reading: 'r', actions: [navAction(), add],
      failures: ['action 1 (add): the "Pricing" screen opened, but nothing you drew in its box is on it'], files: ['src/screens/Pricing.tsx'] })
    expect(bad.problem).toBe(true)
    expect(bad.sentence).toMatch(/couldn't put what you drew in its box on the "Pricing" screen/)
  })
})
