import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain .mjs bench module, no types
import { kindOf, memberOf, scoreIntent, assignRegions, REALIZED_MIN, scoreEdits, listSize } from './lib/intent.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { matchRegions } from './lib/score.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import page05 from './sketches/05-logo-wall-testimonial.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import page12 from './sketches/12-timeline-steps.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import page04 from './sketches/04-pricing-tiers.mjs'

/**
 * A tiny DOM builder: each node becomes an element record shaped like what
 * score.mjs's readElements() returns, with parent indices and child counts.
 */
type Node = { tag: string; rect: [number, number, number, number]; text?: string; kids?: Node[]; [k: string]: unknown }
function flatten(root: Node[]) {
  const out: any[] = []
  // allText = own text + all descendants' text in document order, like innerText
  const walk = (n: Node, parent: number, inSvg: boolean): string => {
    const i = out.length
    const { tag, rect, text = '', kids = [], ...rest } = n
    const rec: any = { tag, rect: { x: rect[0], y: rect[1], w: rect[2], h: rect[3] }, text, parent, children: kids.length, classes: [], srcLoc: 'src/App.tsx:1:1', inSvg, ...rest }
    out.push(rec)
    const inner = kids.map((k) => walk(k, i, inSvg || tag === 'svg'))
    rec.allText = [text, ...inner].filter(Boolean).join(' ')
    return rec.allText
  }
  root.forEach((n) => walk(n, -1, false))
  return out
}
const n = (tag: string, rect: Node['rect'], text = '', kids: Node[] = [], extra: Record<string, unknown> = {}): Node => ({ tag, rect, text, kids, ...extra })

describe('kindOf / memberOf', () => {
  it('reads the head noun first', () => {
    expect(kindOf({ role: 'hero-headline' }).kind).toBe('text')
    expect(kindOf({ role: 'logo-wall' }).kind).toBe('container')
    expect(kindOf({ role: 'cta-primary' }).kind).toBe('control')
    expect(kindOf({ role: 'email-input' }).kind).toBe('input')
    expect(kindOf({ role: 'quote' })).toEqual({ kind: 'text', minWords: 6 })
    expect(kindOf({ role: 'avatar' }).kind).toBe('media')
    expect(kindOf({ role: 'mystery' }).kind).toBe('container')
  })
  it('lets the spec override', () => {
    expect(kindOf({ role: 'hero', kind: 'media' }).kind).toBe('media')
  })
  it('numbered roles are repeat members', () => {
    expect(memberOf('tier-2')).toEqual({ base: 'tier', n: 2 })
    expect(memberOf('footer-col-4')).toEqual({ base: 'footer-col', n: 4 })
    expect(memberOf('heading')).toBeNull()
  })
})

/** Page 12 as findings.md describes it: correct, but centred in the upper third. */
function timelineCorrectButMoved() {
  const step = (x: number, k: number) =>
    n('li', [x, 140, 160, 120], '', [n('span', [x + 55, 140, 50, 50], String(k), [], { filled: true }), n('p', [x, 205, 160, 40], ['Sign up free', 'Connect your app', 'Draw a sketch', 'Ship the change'][k - 1])])
  return flatten([
    n('section', [240, 20, 800, 300], '', [
      n('h2', [440, 30, 400, 40], 'How it works'),
      n('ol', [240, 140, 800, 140], '', [step(240, 1), step(450, 2), step(660, 3), step(870, 4)]),
    ]),
  ])
}

describe('the intent score fixes what findings.md caught the IoU score getting wrong', () => {
  it('page 12: a correct page drawn somewhere else is realized, though IoU finds almost nothing', () => {
    const els = timelineCorrectButMoved()
    const iouHits = matchRegions(page12.regions, els).matched.size
    expect(iouHits).toBeLessThanOrEqual(1) // the old ruler: ~0%
    const s = scoreIntent(page12, els)
    expect(s.structure).toBe(1)
    expect(s.content).toBe(1)
    expect(s.order).toBe(1)
    expect(s.realized).toBe(true)
  })

  const logoWall = () =>
    n('div', [140, 170, 1000, 80], '', [0, 1, 2, 3, 4].map((i) => n('img', [160 + i * 200, 180, 160, 60], '', [], { alt: `logo ${i}` })))

  it('page 05 before the fix: squiggles traced as SVG paths is NOT realized, and says why', () => {
    const els = flatten([
      n('section', [0, 60, 1280, 500], '', [
        n('p', [520, 100, 240, 24], 'Trusted by teams at'),
        logoWall(),
        n('svg', [320, 310, 640, 140], '', [
          n('path', [320, 320, 640, 30]), n('path', [320, 370, 640, 30]), n('path', [610, 470, 180, 20]),
        ]),
        n('img', [534, 444, 52, 52], '', [], { alt: '' }),
      ]),
    ])
    const s = scoreIntent(page05, els)
    expect(s.content).toBeLessThan(0.5)
    expect(s.realized).toBe(false)
    expect(s.notes.join(' ')).toMatch(/traced/)
  })

  it('page 05 after the fix: real quote and attribution, laid out its own way, is realized', () => {
    const els = flatten([
      n('section', [0, 40, 1280, 600], '', [
        n('p', [520, 60, 240, 24], 'Trusted by teams at'),
        logoWall(),
        n('figure', [240, 300, 800, 260], '', [
          n('blockquote', [240, 300, 800, 120], 'This replaced three tools for our design team and nobody misses them.'),
          n('figcaption', [440, 440, 400, 60], '', [n('img', [440, 450, 48, 48]), n('span', [500, 460, 300, 24], 'Dana Reyes, Head of Design at Northwind')]),
        ]),
      ]),
    ])
    const s = scoreIntent(page05, els)
    expect(s.content).toBe(1)
    expect(s.structure).toBe(1)
    expect(s.realized).toBe(true)
  })
})

describe('scoreIntent', () => {
  const simple = {
    regions: [
      { role: 'headline', rect: { x: 100, y: 100, w: 600, h: 60 }, must: true },
      { role: 'subhead', rect: { x: 100, y: 200, w: 600, h: 40 } },
      { role: 'cta', rect: { x: 100, y: 300, w: 200, h: 50 }, must: true },
    ],
  }

  it('a scrambled page loses order, not structure', () => {
    const els = flatten([
      n('a', [100, 20, 200, 50], 'Start free trial'),
      n('p', [100, 100, 600, 40], 'Turn rough sketches into working code in seconds'),
      n('h1', [100, 200, 600, 60], 'Sketch it, ship it'),
    ])
    const s = scoreIntent(simple, els)
    expect(s.structure).toBe(1)
    expect(s.order).toBe(0)
    expect(s.realized).toBe(false)
  })

  it('placeholder copy is present but not content', () => {
    const els = flatten([
      n('h1', [100, 100, 600, 60], 'Heading goes here'),
      n('p', [100, 200, 600, 40], 'Lorem ipsum dolor sit amet'),
      n('button', [100, 300, 200, 50], 'Go'),
    ])
    const s = scoreIntent(simple, els)
    expect(s.structure).toBe(1)
    expect(s.content).toBe(0)
    expect(s.intent).toBeLessThan(REALIZED_MIN)
  })

  it('a missing must region blocks realized even with a high mean', () => {
    const spec = { regions: [...simple.regions, { role: 'heading', rect: { x: 0, y: 400, w: 10, h: 10 } }, { role: 'body', rect: { x: 0, y: 500, w: 10, h: 10 } }] }
    const els = flatten([
      n('h1', [100, 100, 600, 60], 'Sketch it, ship it'),
      n('p', [100, 200, 600, 40], 'Turn rough sketches into working code'),
      n('h2', [100, 400, 600, 40], 'Why people like it'),
      n('p', [100, 500, 600, 40], 'Because nobody has to draw carefully anymore'),
    ])
    const s = scoreIntent(spec, els)
    expect(s.intent).toBeGreaterThanOrEqual(REALIZED_MIN)
    expect(s.mustStructure).toBe(0.5)
    expect(s.realized).toBe(false)
  })

  it('an empty page scores zero, and a spec with no regions scores nothing', () => {
    expect(scoreIntent(simple, []).structure).toBe(0)
    expect(scoreIntent(simple, []).realized).toBe(false)
    expect(scoreIntent({ regions: [] }, []).intent).toBeNull()
  })

  it('a button cannot satisfy a headline, and a generic container cannot eat the button', () => {
    const els = flatten([n('div', [0, 0, 800, 400], '', [n('button', [100, 300, 200, 50], 'Start free trial'), n('span', [0, 0, 5, 5], '')])])
    const a = assignRegions(simple.regions, els)
    expect(a.get(0)).toBeNull()
    expect(a.get(2)?.el.tag).toBe('button')
  })
})

describe('repeat groups', () => {
  const card = (x: number, name: string) =>
    n('div', [x, 300, 300, 400], '', [n('h3', [x, 300, 300, 30], name), n('p', [x, 340, 300, 30], '$9 per month'), n('button', [x, 600, 200, 40], 'Choose')])

  it('three tiers rendered as three alike cards satisfy all three members', () => {
    const els = flatten([n('section', [0, 0, 1280, 900], '', [n('h2', [400, 100, 480, 50], 'Simple pricing'), n('div', [80, 300, 1100, 400], '', [card(80, 'Starter'), card(480, 'Pro'), card(880, 'Team')])])])
    const s = scoreIntent(page04, els)
    const tiers = s.regions.filter((r: any) => /^tier-/.test(r.role))
    expect(tiers.every((r: any) => r.found)).toBe(true)
  })

  it('three tiers rendered as two leave one member missing', () => {
    const els = flatten([n('section', [0, 0, 1280, 900], '', [n('h2', [400, 100, 480, 50], 'Simple pricing'), n('div', [80, 300, 1100, 400], '', [card(80, 'Starter'), card(480, 'Pro')])])])
    const s = scoreIntent(page04, els)
    const tiers = s.regions.filter((r: any) => /^tier-/.test(r.role))
    expect(tiers.filter((r: any) => r.found).length).toBe(2)
  })
})

describe("scoreEdits 'siblings' / listSize (s2c-015 row 9: add one more of a list)", () => {
  const tile = (x: number, name: string, tag = 'div') =>
    n(tag, [x, 591, 278, 90], '', [n('h3', [x + 21, 612, 236, 24], name), n('p', [x + 21, 640, 236, 20], 'One line of copy here.')])
  const page = (tiles: Node[], extra: Node[] = []) => flatten([
    n('main', [0, 0, 1280, 900], '', [
      n('section', [0, 520, 1280, 180], '', [n('h2', [48, 535, 1184, 32], 'Works with your stack'), n('div', [48, 591, 1184, 90], '', tiles)]),
      ...extra,
    ]),
  ])
  const three = [tile(48, 'GitHub'), tile(350, 'GitLab'), tile(652, 'Slack')]
  const spec = { edits: [{ check: 'siblings', text: 'Slack', min: 4, must: true }, { check: 'kept', text: 'GitHub', must: true }] }
  const slack = (els: any[]) => els.find((e) => e.text === 'Slack')

  it('counts the tiles in the row, not the heading and paragraph inside one tile', () => {
    const els = page(three)
    expect(listSize(slack(els), els)).toBe(3)
    expect(scoreEdits(spec, els).realized).toBe(false)
  })
  it('a fourth tile passes, whatever tag the model picked for it', () => {
    for (const tag of ['div', 'article', 'li']) {
      const els = page([...three, tile(954, 'Discord', tag)])
      expect(listSize(slack(els), els)).toBe(4)
      expect(scoreEdits(spec, els).realized).toBe(true)
    }
  })
  it('a full-width banner dropped into the row is not "one more tile"', () => {
    const els = page([...three, n('div', [48, 700, 1184, 300], '', [n('p', [60, 710, 600, 20], 'Integrations coming soon')])])
    expect(listSize(slack(els), els)).toBe(3)
  })
  it('a new card elsewhere on the page does not add to this row', () => {
    const els = page(three, [n('div', [954, 720, 278, 90], '', [n('h3', [975, 741, 236, 24], 'Discord')])])
    expect(listSize(slack(els), els)).toBe(3)
  })
  it('same-tag text items are a list (nav links)', () => {
    const els = flatten([n('nav', [0, 0, 1280, 68], '', [n('a', [1025, 24, 57, 20], 'Features'), n('a', [1114, 24, 46, 20], 'Pricing'), n('a', [1193, 24, 39, 20], 'About')])])
    expect(listSize(els.find((e) => e.text === 'Pricing'), els)).toBe(3)
  })
  it('an element in no list is a list of one', () => {
    const els = flatten([n('section', [0, 0, 1280, 400], '', [n('h1', [48, 40, 1184, 48], 'Ship faster'), n('p', [300, 100, 680, 28], 'Some subhead copy')])])
    expect(listSize(els.find((e) => e.text === 'Ship faster'), els)).toBe(1)
  })
})
