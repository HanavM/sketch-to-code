import { describe, expect, it } from 'vitest'
import {
  containedElements, coverage, elementAtPoint, iou, nearestSourced,
  primaryTarget, smallestContainingElement,
} from '../src/query.js'
import type { DomNode, DomSnapshot } from '../src/types.js'

const N = (
  id: string, x: number, y: number, w: number, h: number,
  parent: string | null, depth: number, srcLoc: string | null = null,
): DomNode => ({
  id, tag: 'div', srcLoc, rect: { x, y, w, h }, text: '', classes: [],
  style: {
    display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row',
    gap: '0', padding: '0', margin: '0', backgroundColor: '', color: '',
    fontSize: '14px', fontWeight: '400', borderRadius: '0',
  },
  parent, depth,
})

/** page: body > main > [card1(x=100), card2(x=400)]; card1 > button */
const snap: DomSnapshot = {
  nodes: [
    N('body', 0, 0, 1000, 800, null, 0),
    N('main', 50, 50, 900, 700, 'body', 1, 'src/App.tsx:3:5'),
    N('card1', 100, 100, 200, 150, 'main', 2, 'src/Card.tsx:2:3'),
    N('card2', 400, 100, 200, 150, 'main', 2, 'src/Card.tsx:2:3'),
    N('btn', 120, 200, 80, 30, 'card1', 3, 'src/Card.tsx:9:5'),
  ],
  viewport: { w: 1000, h: 800, scrollX: 0, scrollY: 0 },
  url: 'http://test/', takenAt: 0, truncated: false,
}

describe('geometry queries', () => {
  it('iou and coverage', () => {
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(1)
    expect(coverage({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 5, h: 10 })).toBeCloseTo(0.5)
  })

  it('circling a card selects the card, not its button or the page', () => {
    // gesture loosely around card1
    const target = primaryTarget(snap, { x: 90, y: 90, w: 220, h: 170 })
    expect(target?.id).toBe('card1')
  })

  it('circling just the button selects the button', () => {
    const target = primaryTarget(snap, { x: 112, y: 192, w: 96, h: 46 })
    expect(target?.id).toBe('btn')
  })

  it('a gesture in empty space resolves to its container', () => {
    const target = primaryTarget(snap, { x: 700, y: 400, w: 100, h: 60 })
    expect(target?.id).toBe('main')
  })

  it('containedElements is deepest-first', () => {
    const els = containedElements(snap, { x: 90, y: 90, w: 220, h: 170 })
    expect(els.map((e) => e.id)).toEqual(['btn', 'card1'])
  })

  it('smallestContainingElement finds the tightest container', () => {
    expect(smallestContainingElement(snap, { x: 130, y: 205, w: 20, h: 10 })?.id).toBe('btn')
    expect(smallestContainingElement(snap, { x: 320, y: 120, w: 60, h: 40 })?.id).toBe('main')
  })

  it('elementAtPoint picks deepest', () => {
    expect(elementAtPoint(snap, 130, 210)?.id).toBe('btn')
    expect(elementAtPoint(snap, 450, 120)?.id).toBe('card2')
    expect(elementAtPoint(snap, 10, 10)?.id).toBe('body')
  })

  it('nearestSourced walks up to a stamped ancestor', () => {
    const bodyNode = snap.nodes[0]!
    expect(nearestSourced(snap, bodyNode)).toBeNull()
    const btn = snap.nodes[4]!
    expect(nearestSourced(snap, btn)?.srcLoc).toBe('src/Card.tsx:9:5')
  })
})
