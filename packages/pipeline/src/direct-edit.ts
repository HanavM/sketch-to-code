/**
 * goal loop n10: erase and recolour land in code without the model.
 *
 * At pen lift the overlay already knows, for a plain scribble or a plain
 * coloured ring, exactly which element the drawing means (optimistic.ts) and
 * shows the change. Sending that to the model to be read again costs seconds
 * and tokens and can only agree. This takes the element the page showed the
 * change on and writes the same change through the deterministic engines the
 * full run already trusts: the structural delete (codemod.ts) and the colour
 * literal (recolor.ts). Anything they can't do unambiguously is refused with
 * the reason, and the overlay falls back to the ordinary model run.
 */
import type { DomSnapshot } from '@s2c/dom'
import { commitPlan, planStructuralEdits } from './codemod.js'
import type { GroundedAction } from './intent2.js'
import { appPalette, matchColor } from './palette.js'
import { recolorElement } from './recolor.js'

export interface DirectEditRequest {
  kind: 'delete' | 'recolor'
  /** Stamp of the element the overlay changed. */
  srcLoc: string
  /** Which of the elements carrying that stamp, in document order. */
  instanceIndex: number
  /** The page as the code has it (instant changes lifted). */
  snapshot: DomSnapshot
  /** recolor: the pen colour as drawn (#rrggbb). */
  color?: string
  /** recolor: which colour, the words or the fill. */
  prop?: 'color' | 'backgroundColor'
}

export interface DirectEditResult {
  ok: boolean
  file?: string
  change?: string
  error?: string
}

export function applyDirectEdit(root: string, req: DirectEditRequest): DirectEditResult {
  const snap = req.snapshot
  if (!snap || !Array.isArray(snap.nodes)) return { ok: false, error: 'no page snapshot' }
  const instances = snap.nodes.filter((n) => n.srcLoc === req.srcLoc)
  const node = instances[req.instanceIndex]
  if (!node) return { ok: false, error: `the page has no element ${req.instanceIndex + 1} at ${req.srcLoc}` }

  if (req.kind === 'delete') {
    // the same destructive-size gate a reading applies (intent2 needsConfirm):
    // erasing something this big waits for a person to confirm it
    const view = snap.viewport ? snap.viewport.w * snap.viewport.h : 0
    if (view > 0 && node.rect.w * node.rect.h > view * 0.35) {
      return { ok: false, error: 'too large to erase without confirming' }
    }
    const action = {
      kind: 'delete',
      targets: [{
        domId: node.id, srcLoc: node.srcLoc, tag: node.tag, text: node.text, subtreeText: node.text,
        classes: node.classes, rect: node.rect,
      }],
      instruction: 'remove this',
    } as unknown as GroundedAction
    const plan = planStructuralEdits(root, [action], snap)
    if (plan.refused.length || plan.handled.length === 0) {
      return { ok: false, error: plan.refused[0]?.reason ?? 'nothing to remove' }
    }
    commitPlan(root, plan)
    const h = plan.handled[0]!
    return { ok: true, file: h.file, change: h.change }
  }

  if (req.kind === 'recolor') {
    if (!req.color || !/^#[0-9a-f]{6}$/i.test(req.color)) return { ok: false, error: `unreadable colour "${req.color ?? ''}"` }
    const palette = appPalette(snap)
    const color = matchColor(req.color, palette) ?? { drawn: req.color }
    return recolorElement(root, {
      srcLoc: req.srcLoc,
      prop: req.prop === 'color' ? 'color' : 'backgroundColor',
      color,
      tailwind: palette.length > 0,
      instanceCount: instances.length,
    })
  }
  return { ok: false, error: `unknown direct edit '${String((req as { kind: unknown }).kind)}'` }
}
