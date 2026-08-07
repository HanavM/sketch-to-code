import { describe, expect, it } from 'vitest'
import { analyzeStrokes } from '@s2c/ink'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { buildEditPlan } from '../src/plan.js'
import { drawLine } from '../../ink/tests/fixtures.js'

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

const snap: DomSnapshot = {
  nodes: [
    N('body', 0, 0, 1200, 900, null, 0, null, 'body'),
    N('main', 40, 40, 1120, 820, 'body', 1, 'src/App.tsx:5:5', 'main'),
    N('label', 100, 100, 260, 22, 'main', 2, 'src/S.tsx:12:11', 'p', 'Active users'),
  ],
  viewport: { w: 1200, h: 900, scrollX: 0, scrollY: 0 },
  url: 'http://t/', takenAt: 0, truncated: false,
}

describe('strikethrough over DOM elements', () => {
  it('horizontal line through a text element → DELETE', () => {
    const scene = analyzeStrokes([drawLine(96, 111, 372, 113, { seed: 1, jitter: 1 })])
    const plan = buildEditPlan(scene, snap)
    expect(plan.ops).toHaveLength(1)
    const op = plan.ops[0]!
    expect(op.op).toBe('DELETE')
    if (op.op === 'DELETE') expect(op.target.domId).toBe('label')
  })

  it('a line in empty space stays unresolved (no guessing)', () => {
    const scene = analyzeStrokes([drawLine(500, 500, 800, 505, { seed: 2, jitter: 1 })])
    const plan = buildEditPlan(scene, snap)
    expect(plan.ops).toHaveLength(0)
    expect(plan.unresolvedInkIds.length).toBeGreaterThan(0)
  })

  it('a short tick over the element is not a strikethrough', () => {
    const scene = analyzeStrokes([drawLine(110, 111, 150, 112, { seed: 3, jitter: 1 })])
    const plan = buildEditPlan(scene, snap)
    expect(plan.ops.filter((o) => o.op === 'DELETE')).toHaveLength(0)
  })
})
