/**
 * Regression suite for the ribbon incident: a decorative background wave must
 * (a) keep its geometry (SVG path in the legend), (b) get layerHint
 * 'background-overlay' from path-based overlap, (c) fail design placement
 * verification when implemented tiny/elsewhere.
 */
import { describe, expect, it } from 'vitest'
import { analyzeStrokes, toSvgPath } from '@s2c/ink'
import { analyzeOverlap } from '@s2c/intent'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { verifyDesignPlacement } from '../src/verify.js'
import { drawPath, drawRect } from '../../ink/tests/fixtures.js'

const N = (
  id: string, x: number, y: number, w: number, h: number,
  parent: string | null, depth: number, srcLoc: string | null = null,
  tag = 'div', text = '',
): DomNode => ({
  id, tag, srcLoc, rect: { x, y, w, h }, text, classes: [],
  style: {
    display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row',
    gap: '0', padding: '0', margin: '0', backgroundColor: '', color: '',
    fontSize: '14px', fontWeight: '400', borderRadius: '0',
  },
  parent, depth,
})

const snap = (extra: DomNode[] = []): DomSnapshot => ({
  nodes: [
    N('body', 0, 0, 1280, 900, null, 0, null, 'body'),
    N('main', 40, 60, 1200, 800, 'body', 1, 'src/App.tsx:5:5', 'main'),
    N('card1', 80, 100, 300, 150, 'main', 2, 'src/Cards.tsx:8:7', 'div', 'Revenue'),
    N('card2', 420, 100, 300, 150, 'main', 2, 'src/Cards.tsx:8:7', 'div', 'Users'),
    N('card3', 760, 100, 300, 150, 'main', 2, 'src/Cards.tsx:8:7', 'div', 'Conversion'),
    ...extra,
  ],
  viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 },
  url: 'http://t/', takenAt: 0, truncated: false,
})

/** A long wavy ribbon passing across all three cards. */
function ribbonStroke() {
  const waypoints: Array<[number, number]> = []
  for (let i = 0; i <= 24; i++) {
    waypoints.push([60 + i * 42, 175 + Math.sin(i / 2.4) * 55])
  }
  return drawPath(waypoints, { seed: 9, jitter: 1.5 })
}

describe('ribbon regression', () => {
  it('the ribbon keeps its curve: toSvgPath emits a multi-segment path', () => {
    const stroke = ribbonStroke()
    const fit = toSvgPath(stroke.points, { tolerance: 2 })
    expect(fit).not.toBeNull()
    expect(fit!.segments).toBeGreaterThanOrEqual(3) // multi-inflection wave
    expect(fit!.d.startsWith('M')).toBe(true)
  })

  it('path-based overlap yields background-overlay, never container', () => {
    const stroke = ribbonStroke()
    const scene = analyzeStrokes([stroke])
    expect(scene.nodes.length).toBeGreaterThanOrEqual(1)
    const node = scene.nodes[0]!
    const info = analyzeOverlap(node, scene.strokes, snap(), { w: 1280, h: 900 })
    expect(info.layerHint).toBe('background-overlay')
    // the path passes through the cards
    expect(info.crosses.length).toBeGreaterThanOrEqual(2)
    // a ribbon's HULL may cover card rects (the bbox lie) — but path-based
    // containment must not call it a container
    expect(info.layerHint).not.toBe('container')
  })

  it('a rect drawn AROUND a card is a container, not background', () => {
    const enclosing = drawRect(60, 80, 350, 200, { seed: 4, jitter: 1.5 })
    const scene = analyzeStrokes([enclosing])
    const node = scene.nodes[0]!
    const info = analyzeOverlap(node, scene.strokes, snap(), { w: 1280, h: 900 })
    expect(info.layerHint).toBe('container')
    expect(info.contains.some((c) => c.text === 'Revenue')).toBe(true)
  })

  it('design placement: tiny element far away FAILS; right-sized in place PASSES', () => {
    const sketch = { x: 60, y: 120, w: 1010, h: 110 } // the ribbon band region
    const before = snap()
    // failure case: the "ribbon-shaped graph" outcome — small chart elsewhere
    const tiny = snap([N('gr', 'x1', 0, 0, 0, 0) as never].slice(0, 0)) // placeholder no-op
    const afterTiny = snap([N('graph', 900, 700, 120, 40, 'main', 2, 'src/Chart.tsx:3:3', 'svg')])
    const failed = verifyDesignPlacement(before, afterTiny, sketch)
    expect(failed.satisfied).toBe(false)
    expect(failed.reason).toContain('none matches')
    void tiny

    // success case: a wide band where the ribbon was drawn
    const afterGood = snap([N('ribbon', 40, 110, 1200, 130, 'main', 2, 'src/Ribbon.tsx:3:3', 'svg')])
    const ok = verifyDesignPlacement(before, afterGood, sketch)
    expect(ok.satisfied).toBe(true)
  })

  it('design placement: full-bleed background (area >> sketch) passes via coverage', () => {
    const sketch = { x: 60, y: 120, w: 1010, h: 110 }
    const before = snap()
    // absolute inset-0 style backdrop: covers the whole main area
    const afterBleed = snap([N('bg', 40, 60, 1200, 800, 'main', 2, 'src/Bg.tsx:2:3', 'svg')])
    const ok = verifyDesignPlacement(before, afterBleed, sketch)
    expect(ok.satisfied).toBe(true)
    expect(ok.reason).toContain('matches')
  })
})
