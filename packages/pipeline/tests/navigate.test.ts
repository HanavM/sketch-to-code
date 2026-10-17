import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parse } from '@babel/parser'
import { linkToScreen, screenSlug } from '../src/navigate.js'

const MAIN = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`

//  4 <section> 5   5 <button> 7   8 <a> 7   9 <button onClick> 7   10 <p> 7   11 <a href=https> 7
const HERO = `export default function Hero() {
  return (
    <div>
    <section>
      <button className="btn">See pricing</button>
      <button
        className="btn"
      >Sign up</button>
      <a href="#">Docs</a>
      <button onClick={() => alert(1)}>Busy</button>
      <p>Plain</p>
      <a href="https://example.com">Away</a>
    </section>
    </div>
  )
}
`

function app(files: Record<string, string>, deps: Record<string, string> = { react: '^19.0.0' }): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-nav-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', dependencies: deps }))
  for (const [rel, text] of Object.entries({ 'src/main.tsx': MAIN, 'src/App.tsx': 'export default function App() { return null }\n', 'src/Hero.tsx': HERO, ...files })) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return root
}
const read = (root: string, rel: string) => readFileSync(join(root, rel), 'utf8')
const parses = (code: string) => parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })

describe('linkToScreen — draw a link to a new screen', () => {
  it('names screens the way people write them', () => {
    expect(screenSlug('Pricing')).toBe('pricing')
    expect(screenSlug('Sign up!')).toBe('sign-up')
    expect(screenSlug('  ')).toBe('')
  })

  it('a button: writes the screen, the registry, the lib, mounts it, and points the button at it', () => {
    const root = app({})
    const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:5:7', screen: 'Pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(out.route).toBe('#/pricing')
    expect(out.screenFile).toBe('src/screens/Pricing.tsx')
    expect(out.files!.sort()).toEqual(['src/Hero.tsx', 'src/lib/screens.tsx', 'src/main.tsx', 'src/screens/Pricing.tsx', 'src/screens/index.ts'])
    expect(out.change).toMatch(/added a "Pricing" screen/)

    const hero = read(root, 'src/Hero.tsx')
    expect(hero).toContain(`<button onClick={() => openScreen('pricing')} className="btn">See pricing</button>`)
    expect(hero.startsWith(`import { openScreen } from './lib/screens'\n`)).toBe(true)
    const main = read(root, 'src/main.tsx')
    expect(main).toContain('<Screens home={<App />} screens={screens} />')
    expect(main).toContain(`import { Screens } from './lib/screens'`)
    expect(main).toContain(`import { screens } from './screens'`)
    expect(read(root, 'src/screens/index.ts')).toContain(`'pricing': Pricing,`)
    const screen = read(root, 'src/screens/Pricing.tsx')
    expect(screen).toContain('<h1>Pricing</h1>')
    expect(screen).toContain(`import { goBack } from '../lib/screens'`)
    for (const f of out.files!) expect(() => parses(read(root, f))).not.toThrow()
  })

  it('stacked attributes get the new one on its own line', () => {
    const root = app({})
    const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:6:7', screen: 'sign up' })
    expect(out.ok, out.error).toBe(true)
    expect(read(root, 'src/Hero.tsx')).toContain(`<button\n        onClick={() => openScreen('sign-up')}\n        className="btn"`)
    expect(read(root, 'src/screens/SignUp.tsx')).toContain('<h1>Sign up</h1>')
  })

  it('a second screen is added beside the first; the mount is not wrapped twice', () => {
    const root = app({})
    expect(linkToScreen(root, { srcLoc: 'src/Hero.tsx:5:7', screen: 'Pricing' }).ok).toBe(true)
    // the first edit added an import line above the buttons: every stamp moved down by 1
    const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:7:7', screen: 'Sign up' })
    expect(out.ok, out.error).toBe(true)
    expect(out.files).not.toContain('src/main.tsx')
    expect(out.files).not.toContain('src/lib/screens.tsx')
    const reg = read(root, 'src/screens/index.ts')
    expect(reg).toContain(`'pricing': Pricing,`)
    expect(reg).toContain(`'sign-up': SignUp,`)
    expect(() => parses(reg)).not.toThrow()
    expect(read(root, 'src/main.tsx').match(/<Screens /g)).toHaveLength(1)
    expect(read(root, 'src/Hero.tsx').match(/import \{ openScreen \}/g)).toHaveLength(1)
  })

  it('an arrow to a screen that already exists only adds the link', () => {
    const root = app({})
    linkToScreen(root, { srcLoc: 'src/Hero.tsx:5:7', screen: 'Pricing' })
    const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:10:7', screen: 'pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(out.reused).toBe(true)
    expect(out.files).toEqual(['src/Hero.tsx'])
    expect(read(root, 'src/Hero.tsx')).toContain('<a href="#/pricing">Docs</a>')
  })

  it('a link with href="#" is repointed', () => {
    const root = app({})
    const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:9:7', screen: 'Docs' })
    expect(out.ok, out.error).toBe(true)
    expect(read(root, 'src/Hero.tsx')).toContain('<a href="#/docs">Docs</a>')
    expect(read(root, 'src/Hero.tsx')).not.toContain('openScreen')
  })

  describe('refusals say why, in plain words, and change nothing', () => {
    const untouched = (root: string) => {
      expect(read(root, 'src/Hero.tsx')).toBe(HERO)
      expect(read(root, 'src/main.tsx')).toBe(MAIN)
      expect(existsSync(join(root, 'src/screens'))).toBe(false)
      expect(existsSync(join(root, 'src/lib'))).toBe(false)
    }
    it('no screen name', () => {
      const root = app({})
      const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:5:7', screen: ' ' })
      expect(out.ok).toBe(false)
      expect(out.error).toMatch(/has no name/)
      untouched(root)
    })
    it('the app already has a router', () => {
      const root = app({}, { react: '^19', wouter: '^3' })
      const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:5:7', screen: 'Pricing' })
      expect(out.error).toMatch(/already uses wouter/)
      untouched(root)
    })
    it('not a button or link', () => {
      const root = app({})
      const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:11:7', screen: 'Pricing' })
      expect(out.error).toMatch(/has to start at a button or a link, and that is a <p>/)
      untouched(root)
    })
    it('a button that already does something', () => {
      const root = app({})
      const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:10:7', screen: 'Pricing' })
      expect(out.error).toMatch(/already does something/)
      untouched(root)
    })
    it('a link that already goes somewhere', () => {
      const root = app({})
      const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:12:7', screen: 'Pricing' })
      expect(out.error).toMatch(/already goes somewhere \(https:\/\/example.com\)/)
      untouched(root)
    })
    it('a screen file someone else wrote', () => {
      const root = app({ 'src/screens/Pricing.tsx': 'export default 1\n' })
      const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:5:7', screen: 'Pricing' })
      expect(out.error).toMatch(/already exists/)
      expect(read(root, 'src/Hero.tsx')).toBe(HERO)
      expect(read(root, 'src/main.tsx')).toBe(MAIN)
    })
    it('no ./App mounted in main', () => {
      const root = app({ 'src/main.tsx': `import { createRoot } from 'react-dom/client'\ncreateRoot(document.body).render(<div />)\n` })
      const out = linkToScreen(root, { srcLoc: 'src/Hero.tsx:5:7', screen: 'Pricing' })
      expect(out.error).toMatch(/couldn't find where the app's main component is shown/)
      expect(read(root, 'src/Hero.tsx')).toBe(HERO)
    })
    it('a stale stamp', () => {
      const root = app({})
      expect(linkToScreen(root, { srcLoc: 'src/Hero.tsx:99:1', screen: 'P' }).error).toMatch(/stale stamp/)
      untouched(root)
    })
  })
})

// ── grounding: the verb survives from the model's JSON to the engine ──
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { buildEvidence, groundInterpretation, INTERPRETATION_SCHEMA } from '../src/intent2.js'

const dnode = (id: string, tag: string, srcLoc: string, text: string, rect: DomNode['rect']): DomNode => ({
  id, tag, srcLoc, text, classes: [], parent: null, depth: 1, rect,
  style: {
    color: 'rgb(17,24,39)', backgroundColor: 'rgb(255,255,255)', display: 'block', position: 'static',
    zIndex: 'auto', flexDirection: 'row', gap: '', padding: '', margin: '', fontSize: '',
    fontWeight: '', borderRadius: '',
  } as DomNode['style'],
})
const arrow: Stroke = { id: 's0', points: Array.from({ length: 12 }, (_, i) => ({ x: 120 + i * 40, y: 115, t: i * 10 })) }

describe('navigate — grounding', () => {
  const btn = dnode('e1', 'button', 'src/Hero.tsx:5:7', 'See pricing', { x: 100, y: 100, w: 120, h: 32 })
  const snap: DomSnapshot = {
    nodes: [btn], truncated: false, url: 'http://x/', takenAt: 0, viewport: { w: 1200, h: 800, scrollX: 0, scrollY: 0 },
  }
  const ev = buildEvidence([arrow], snap, [])
  const raw = (over: Record<string, unknown>) => ({
    reading: 'an arrow from the button to a box labelled Pricing',
    actions: [{
      kind: 'navigate' as const, elements: ['e1'], destElement: null, position: null,
      instruction: 'clicking "See pricing" opens a Pricing screen', strokes: ['s0'], layer: null, depicts: null, fidelity: null,
      screen: 'Pricing', ...over,
    }],
  })

  it('the schema offers the verb and asks for the screen name', () => {
    const item = INTERPRETATION_SCHEMA.properties.actions.items
    expect(item.properties.kind.enum).toContain('navigate')
    expect(item.required).toContain('screen')
  })

  it('carries the screen name and the button\'s stamp through', () => {
    const g = groundInterpretation(raw({}), ev, snap, 'gesture')
    expect(g.rejected).toEqual([])
    expect(g.actions[0]!.kind).toBe('navigate')
    expect(g.actions[0]!.screen).toBe('Pricing')
    expect(g.actions[0]!.targets[0]!.srcLoc).toBe('src/Hero.tsx:5:7')
    // s2c-040: the cited strokes are kept, so run2 can find the box among them
    expect(g.actions[0]!.strokeIds).toEqual(['s0'])
  })

  it('a navigate with no screen name is rejected out loud', () => {
    const g = groundInterpretation(raw({ screen: null }), ev, snap, 'gesture')
    expect(g.actions).toHaveLength(0)
    expect(g.rejected[0]).toMatch(/names no screen/)
  })
})

import { whyRefused } from '../src/explain.js'
describe('navigate — refusals reach the card', () => {
  it('passes the engine\'s own plain sentence through, minus the reassurance', () => {
    const root = app({})
    const err = linkToScreen(root, { srcLoc: 'src/Hero.tsx:10:7', screen: 'Pricing' }).error!
    expect(whyRefused(`action 0 (navigate): ${err}`)).toBe(
      'that button already does something when it is clicked, and I won\'t replace it. Draw the arrow from a button that does nothing yet',
    )
  })
})
