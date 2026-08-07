import { describe, expect, it } from 'vitest'
import { analyzeStrokes } from '@s2c/ink'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { buildEditPlan } from '../src/plan.js'
import {
  drawArrow, drawCircle, drawHandwriting, drawRect, drawScribble,
} from '../../ink/tests/fixtures.js'

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

/** body > main > [card1, card2, card3 (row)], form > button */
const snap: DomSnapshot = {
  nodes: [
    N('body', 0, 0, 1200, 900, null, 0, null, 'body'),
    N('main', 40, 40, 1120, 820, 'body', 1, 'src/App.tsx:5:5', 'main'),
    N('card1', 60, 80, 300, 160, 'main', 2, 'src/Cards.tsx:8:7'),
    N('card2', 400, 80, 300, 160, 'main', 2, 'src/Cards.tsx:8:7'),
    N('card3', 740, 80, 300, 160, 'main', 2, 'src/Cards.tsx:8:7'),
    N('form', 60, 300, 500, 400, 'main', 2, 'src/Form.tsx:3:5', 'form'),
    N('btn', 80, 620, 140, 44, 'form', 3, 'src/Form.tsx:31:9', 'button', 'Send invite'),
  ],
  viewport: { w: 1200, h: 900, scrollX: 0, scrollY: 0 },
  url: 'http://t/', takenAt: 0, truncated: false,
}

describe('buildEditPlan', () => {
  it('scribble over a card → DELETE that card', () => {
    const scene = analyzeStrokes([drawScribble(410, 90, 280, 140, { seed: 1 })])
    const plan = buildEditPlan(scene, snap)
    expect(plan.ops).toHaveLength(1)
    const op = plan.ops[0]!
    expect(op.op).toBe('DELETE')
    if (op.op === 'DELETE') {
      expect(op.target.domId).toBe('card2')
      expect(op.target.srcLoc).toBe('src/Cards.tsx:8:7')
    }
  })

  it('circle around the button → MODIFY the button', () => {
    const scene = analyzeStrokes([drawCircle(150, 642, 95, { seed: 2 })])
    const plan = buildEditPlan(scene, snap)
    const op = plan.ops.find((o) => o.op === 'MODIFY')
    expect(op).toBeDefined()
    if (op?.op === 'MODIFY') expect(op.target.domId).toBe('btn')
  })

  it('rect drawn in empty form space → ADD into the form', () => {
    // empty area of the form: below the button region, x 300-500
    const scene = analyzeStrokes([drawRect(300, 380, 200, 60, { seed: 3 })])
    const plan = buildEditPlan(scene, snap)
    expect(plan.ops).toHaveLength(1)
    const op = plan.ops[0]!
    expect(op.op).toBe('ADD')
    if (op.op === 'ADD') {
      expect(op.container.domId).toBe('form')
      expect(['rect', 'rounded-rect']).toContain(op.sketch.kind)
    }
  })

  it('arrow from card3 to card1 → MOVE with a sensible position', () => {
    const scene = analyzeStrokes([drawArrow(890, 160, 210, 160, { seed: 4 })])
    const plan = buildEditPlan(scene, snap)
    const op = plan.ops.find((o) => o.op === 'MOVE')
    expect(op).toBeDefined()
    if (op?.op === 'MOVE') {
      expect(op.source.domId).toBe('card3')
      expect(op.dest.domId).toBe('card1')
      expect(op.position).toBe('before')
    }
  })

  it('handwriting near a circled element attaches to that op', () => {
    const circle = drawCircle(150, 642, 95, { seed: 5, t0: 0 })
    const lastT = circle.points[circle.points.length - 1]!.t
    const hw = drawHandwriting(260, 610, { seed: 6, glyphs: 5, t0: lastT + 2000 })
    const scene = analyzeStrokes([circle, ...hw])
    const plan = buildEditPlan(scene, snap)
    const op = plan.ops.find((o) => o.op === 'MODIFY')
    expect(op).toBeDefined()
    expect(op!.pendingTextIds).toHaveLength(1)
    expect(plan.textRefs).toHaveLength(1)
  })

  it('handwriting alone over a card → MODIFY that card with pending text', () => {
    const hw = drawHandwriting(430, 120, { seed: 7, glyphs: 5 })
    const scene = analyzeStrokes(hw)
    const plan = buildEditPlan(scene, snap)
    expect(plan.ops).toHaveLength(1)
    const op = plan.ops[0]!
    expect(op.op).toBe('MODIFY')
    if (op.op === 'MODIFY') expect(op.target.domId).toBe('card2')
    expect(op.pendingTextIds).toHaveLength(1)
  })

  it('nothing is silently dropped', () => {
    // a lone line in empty space resolves to no op but is reported
    const scene = analyzeStrokes([
      { id: 'ln', points: Array.from({ length: 40 }, (_, i) => ({ x: 1150 + i * 0.5, y: 880, t: i * 5 })) },
    ])
    const plan = buildEditPlan(scene, snap)
    expect(plan.ops).toHaveLength(0)
    expect(plan.unresolvedInkIds.length).toBeGreaterThan(0)
  })
})
