/**
 * v2 intent: model-led interpretation over owned geometry.
 *
 * The deterministic layer PREPARES EVIDENCE and VALIDATES ANSWERS; a
 * multimodal model decides WHAT the user meant. The model only ever
 * references element ids and stroke ids from menus we provide — every
 * coordinate in the executed plan is computed by us from those ids.
 * ("Models never decide where" survives; "models never see the drawing
 * whole" — the v1 mistake — does not.)
 */
import {
  analyzeStrokes, bboxOf, bboxUnion, encodePng, pathLength,
  renderScene, resampleBySpacing, toSvgPath,
  type BBox, type Stroke,
} from '@s2c/ink'
import { nearestSourced, type DomNode, type DomSnapshot } from '@s2c/dom'

// ---------- model-facing output schema ----------

export type ActionKind = 'delete' | 'modify' | 'add' | 'move' | 'swap' | 'design'

/** What the model returns. Ids only — no coordinates, no free geometry. */
export interface RawAction {
  kind: ActionKind
  /** Target DOM element ids from the menu (delete/modify/move/swap). */
  elements?: string[] | null
  /** Destination element id (move: relative to it; add/design: container). */
  destElement?: string | null
  position?: 'before' | 'after' | 'into' | null
  /** What to do, in words — includes any transcribed handwriting. */
  instruction: string
  /** Ink stroke ids this action derives from. */
  strokes?: string[] | null
  layer?: 'in-flow' | 'background-overlay' | 'container' | null
  /** What the drawing DEPICTS when it's iconography ("crab", "purse"). */
  depicts?: string | null
  /** verbatim = trace the strokes (decoration); recognized = substitute a
   *  proper icon/asset for the depicted concept. */
  fidelity?: 'verbatim' | 'recognized' | null
}

export interface RawInterpretation {
  /** One or two plain sentences: what the user wants, as you read it. */
  reading: string
  actions: RawAction[]
  /** Anything genuinely ambiguous, worth surfacing to the user. */
  unclear?: string | null
}

// OpenAI strict mode demands every key in `required`; optionality is
// expressed as nullable unions (anyOf with null), which both Azure strict
// and Claude structured outputs accept.
const nullable = (t: Record<string, unknown>) => ({ anyOf: [t, { type: 'null' }] })

export const DESIGN_KINDS = ['add', 'design'] as const
export const GESTURE_KINDS = ['delete', 'modify', 'add', 'move', 'swap', 'design'] as const

/**
 * Schema is mode-dependent as a HARD guarantee: in design mode the enum
 * itself contains only creative kinds — the model cannot emit a delete.
 */
export function interpretationSchema(mode: 'gesture' | 'design'): Record<string, unknown> {
  const schema = JSON.parse(JSON.stringify(INTERPRETATION_SCHEMA)) as {
    properties: { actions: { items: { properties: { kind: { enum: string[] } } } } }
  }
  if (mode === 'design') {
    schema.properties.actions.items.properties.kind.enum = [...DESIGN_KINDS]
  }
  return schema as unknown as Record<string, unknown>
}

export const INTERPRETATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reading', 'unclear', 'actions'],
  properties: {
    reading: { type: 'string' },
    unclear: nullable({ type: 'string' }),
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'elements', 'destElement', 'position', 'instruction', 'strokes', 'layer', 'depicts', 'fidelity'],
        properties: {
          kind: { type: 'string', enum: ['delete', 'modify', 'add', 'move', 'swap', 'design'] },
          elements: nullable({ type: 'array', items: { type: 'string' } }),
          destElement: nullable({ type: 'string' }),
          position: nullable({ type: 'string', enum: ['before', 'after', 'into'] }),
          instruction: { type: 'string' },
          strokes: nullable({ type: 'array', items: { type: 'string' } }),
          layer: nullable({ type: 'string', enum: ['in-flow', 'background-overlay', 'container'] }),
          depicts: nullable({ type: 'string' }),
          fidelity: nullable({ type: 'string', enum: ['verbatim', 'recognized'] }),
        },
      },
    },
  },
} as const

// ---------- evidence pack ----------

export interface Evidence {
  /** Clean composite: gray DOM wireframe underlay + blue ink. No marks. */
  png: Buffer
  /** JSON the model receives alongside the image. */
  brief: string
  /** Menus for validation. */
  elements: Map<string, DomNode>
  strokes: Map<string, Stroke>
}

const MENU_CAP = 70

export function buildEvidence(strokes: Stroke[], snap: DomSnapshot): Evidence {
  let inkBox: BBox | null = null
  for (const s of strokes) {
    if (s.points.length === 0) continue
    const b = bboxOf(s.points)
    inkBox = inkBox ? bboxUnion(inkBox, b) : b
  }

  // Element menu: prefer stamped, visible, reasonably-sized elements; rank by
  // distance to the ink so the cap trims the far periphery first.
  const viewArea = snap.viewport.w * snap.viewport.h
  const candidates = snap.nodes.filter((n) => {
    const a = n.rect.w * n.rect.h
    return a >= 16 && a <= viewArea * 0.9
  })
  const dist = (n: DomNode) => {
    if (!inkBox) return 0
    const cx = n.rect.x + n.rect.w / 2
    const cy = n.rect.y + n.rect.h / 2
    const dx = Math.max(0, Math.max(inkBox.x - cx, cx - (inkBox.x + inkBox.w)))
    const dy = Math.max(0, Math.max(inkBox.y - cy, cy - (inkBox.y + inkBox.h)))
    return Math.hypot(dx, dy)
  }
  const menu = candidates
    .sort((a, b) => dist(a) - dist(b))
    .slice(0, MENU_CAP)
    .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)

  const elements = new Map(menu.map((n) => [n.id, n]))
  const strokeMap = new Map(strokes.map((s) => [s.id, s]))

  // NOTE: the v1 shape classifier is deliberately NOT consulted here — its
  // confidently-wrong guesses (a zigzag reading as 'rect') poisoned the
  // interpretation. The exact per-stroke features below carry the same
  // discriminative signal without a failure mode.
  const scene = analyzeStrokes(strokes)

  // exact ink↔element correlation — models are demonstrably weak at
  // correlating image positions with coordinate lists (SeeAct), so we hand
  // them the answer: which elements each stroke touches, starts and ends on
  const viewAreaCap = viewArea * 0.5
  const elementsAt = (x: number, y: number): DomNode | null => {
    let best: DomNode | null = null
    for (const n of menu) {
      const r = n.rect
      if (r.w * r.h > viewAreaCap) continue
      if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue
      if (!best || n.rect.w * n.rect.h < best.rect.w * best.rect.h) best = n
    }
    return best
  }
  const strokeList = strokes.map((s) => {
    const b = bboxOf(s.points)
    const started = s.points[0]?.t ?? 0
    const touched = new Set<string>()
    for (let i = 0; i < s.points.length; i += Math.max(1, Math.floor(s.points.length / 40))) {
      const p = s.points[i]!
      const el = elementsAt(p.x, p.y)
      if (el) touched.add(el.id)
    }
    const first = s.points[0]
    const last = s.points[s.points.length - 1]
    // jaggedness: sharp direction reversals per 100px — a delete-scribble is
    // jagged and dense; a decorative wave is smooth
    const rs = resampleBySpacing(s.points, 8)
    let sharpTurns = 0
    for (let i = 2; i < rs.length; i++) {
      const a1 = Math.atan2(rs[i - 1]!.y - rs[i - 2]!.y, rs[i - 1]!.x - rs[i - 2]!.x)
      const a2 = Math.atan2(rs[i]!.y - rs[i - 1]!.y, rs[i]!.x - rs[i - 1]!.x)
      let d = Math.abs(a2 - a1)
      if (d > Math.PI) d = 2 * Math.PI - d
      if (d > Math.PI / 3) sharpTurns++
    }
    const len = pathLength(s.points)
    // confinement: is ≥85% of the stroke inside one single element?
    const insideCounts = new Map<string, number>()
    for (const p2 of rs) {
      const el = elementsAt(p2.x, p2.y)
      if (el) insideCounts.set(el.id, (insideCounts.get(el.id) ?? 0) + 1)
    }
    let mostlyInsideElement: string | null = null
    for (const [id, c] of insideCounts) {
      if (c / rs.length >= 0.85) mostlyInsideElement = id
    }
    return {
      id: s.id,
      bbox: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) },
      lengthPx: Math.round(len),
      startedMs: Math.round(started),
      sharpTurnsPer100px: len > 0 ? Math.round((sharpTurns / len) * 1000) / 10 : 0,
      directionReversals: sharpTurns,
      mostlyInsideElement,
      touchesElements: [...touched].slice(0, 8),
      startsOnElement: first ? (elementsAt(first.x, first.y)?.id ?? null) : null,
      endsOnElement: last ? (elementsAt(last.x, last.y)?.id ?? null) : null,
    }
  })

  const brief = JSON.stringify(
    {
      viewport: snap.viewport,
      inkBoundingBox: inkBox
        ? { x: Math.round(inkBox.x), y: Math.round(inkBox.y), w: Math.round(inkBox.w), h: Math.round(inkBox.h) }
        : null,
      strokes: strokeList,
      elementMenu: menu.map((n) => ({
        id: n.id,
        tag: n.tag,
        text: n.text.slice(0, 60),
        rect: {
          x: Math.round(n.rect.x), y: Math.round(n.rect.y),
          w: Math.round(n.rect.w), h: Math.round(n.rect.h),
        },
        srcLoc: n.srcLoc,
      })),
    },
    null,
    1,
  )

  // composite render: page wireframe under the ink, to scale, unmarked
  const raster = renderScene(scene, {
    labels: false,
    maxSize: 1100,
    underlayRects: menu.map((n) => n.rect),
  })
  return { png: encodePng(raster), brief, elements, strokes: strokeMap }
}

export const DESIGN_INTERPRET_PROMPT = `
You are the intent-reading stage of a sketch-to-code tool, in DESIGN mode:
EVERYTHING the user drew is new UI to CREATE. Nothing is a command — there
are no deletes, no moves, no modifications of existing elements in this mode.
The image shows their ink (dark strokes) over a gray wireframe of the page's
actual elements, to scale. The JSON lists each stroke (id, bbox, draw order,
exact geometric features) and the page's element menu (id, tag, text, rect,
source location). TRUST THE IMAGE for shape/form.

FIDELITY — decide per drawing, this matters most:
- DEPICTION: the sketch represents a recognizable thing (an animal, object,
  symbol — a crab, a purse, a sun). Set depicts:"<the thing>" and
  fidelity:"recognized". The user wants a proper icon/illustration of that
  thing, NOT their wobbly outline cleaned up.
- DECORATION: abstract form (wave, ribbon, blob) whose shape IS the point.
  fidelity:"verbatim" — the exact path will be reproduced.
- WIDGET: looks like a UI element from the lexicon → normal add/design.

Read the drawing AS A WHOLE as a design: boxes = containers/cards/inputs,
labeled rounded rects = buttons, squiggly lines = text placeholders, circles
= avatars/icons, a smooth wavy band = ONE decorative ribbon (even if drawn in
several strokes), arrows here are FLOW/annotation between sketched parts.
Handwriting = labels/copy for the new UI — transcribe it into instructions.
Existing elements only matter as CONTEXT: which container the new UI goes in
(destElement) and what it should sit near or span across (layer:
background-overlay when a decoration sweeps across existing elements).

Rules for your answer:
- Only 'add' and 'design' actions exist in this mode.
- Reference ONLY ids from the menus; never invent ids or output coordinates.
  'destElement' takes a DOM element id (the container); stroke ids go in
  'strokes' ONLY.
- Prefer ONE composite action per coherent drawing.
- reading: 1-2 plain sentences. Note real ambiguity in 'unclear'.
`.trim()

export const INTERPRET_PROMPT = `
You are the intent-reading stage of a sketch-to-code tool. The user drew with
a mouse on a transparent overlay over their RUNNING web app. The image shows
their ink (dark strokes) over a gray wireframe of the page's actual elements,
to scale. The JSON lists: each stroke (id, bbox, draw order, exact geometric
features) and the page's element menu (id, tag, text, rect, source location).
TRUST THE IMAGE for shape/form. Each stroke's touchesElements / startsOnElement /
endsOnElement fields are computed EXACTLY from geometry — your element choices
MUST be grounded in them: an action's targets must come from the elements its
strokes actually touch (or, for empty-space drawings, the enclosing
container). Never target an element no stroke touches.

Read the drawing AS A WHOLE and decide what the user wants. Conventions:
scribble/X/strikethrough over an element = delete it; a ring/box around an
element + a note = modify it; DELETE-SCRIBBLE vs DECORATIVE WAVE — decide
from the exact stroke features, which are size-invariant: a delete mark has
MANY direction reversals (directionReversals ≥ 4) and is confined
(mostlyInsideElement set, or touching one element it covers); a decorative
wave is smooth (directionReversals ≤ 2 per stroke) and sweeps across a whole
section. Reversals ≥ 4 + confined to one element = DELETE that element, never
a decoration — this convention outranks any aesthetic reading; an arrow between two elements = move one
relative to the other; TWO arrows between the same two elements (or crossing)
= swap them; shapes drawn in open space or over a region = a design to build
(a multi-stroke wavy band is ONE ribbon/decoration, not several objects);
handwriting = instructions or labels — transcribe it into the instruction.

Rules for your answer:
- Reference ONLY ids from the menus. Never invent ids. Never output
  coordinates — geometry is derived from the ids you cite. 'elements' and
  'destElement' take DOM element ids (from elementMenu) ONLY; stroke ids go
  in 'strokes' ONLY.
- 'design' actions: cite the strokes that form the drawing, name the
  container element (destElement), and set layer: background-overlay if the
  drawing sweeps across existing elements as decoration.
- Prefer ONE composite action over fragments (one 'swap', not two 'move';
  one 'design' for one drawing).
- swap: 'elements' must contain EXACTLY the two elements being exchanged —
  never bystanders the ink merely passes over.
- reading: 1-2 plain sentences a developer would say out loud.
- If something is genuinely ambiguous, still commit to the best reading and
  note the doubt in 'unclear'.
`.trim()

// ---------- validation & grounding ----------

export interface GroundedTarget {
  domId: string
  srcLoc: string | null
  tag: string
  text: string
  /** Own + descendant text, first 80 chars — identity for empty-own-text
   *  containers (a section's own text is usually ''). */
  subtreeText: string
  classes: string[]
  rect: BBox
}

export interface GroundedAction {
  kind: ActionKind
  targets: GroundedTarget[]
  dest?: GroundedTarget
  position?: 'before' | 'after' | 'into'
  instruction: string
  /** Region computed from the cited strokes (never from the model). */
  region?: BBox
  /** Fitted svg paths of the cited strokes (design actions). */
  svgPaths?: Array<{ strokeId: string; d: string }>
  layer?: 'in-flow' | 'background-overlay' | 'container'
  depicts?: string
  fidelity?: 'verbatim' | 'recognized'
  needsConfirm: boolean
}

export interface GroundedInterpretation {
  reading: string
  unclear?: string
  actions: GroundedAction[]
  /** Model references that failed validation (reported, never executed). */
  rejected: string[]
}

export function groundInterpretation(
  raw: RawInterpretation,
  ev: Evidence,
  snap: DomSnapshot,
  mode: 'gesture' | 'design' = 'gesture',
): GroundedInterpretation {
  const rejected: string[] = []
  const viewArea = snap.viewport.w * snap.viewport.h

  const childrenOf = new Map<string | null, DomNode[]>()
  for (const n of snap.nodes) {
    const list = childrenOf.get(n.parent) ?? []
    list.push(n)
    childrenOf.set(n.parent, list)
  }
  const subtreeText = (root: DomNode): string => {
    let out = root.text
    const stack = [...(childrenOf.get(root.id) ?? [])]
    while (stack.length && out.length < 80) {
      const n = stack.pop()!
      if (n.text) out += (out ? ' ' : '') + n.text
      stack.push(...(childrenOf.get(n.id) ?? []))
    }
    return out.slice(0, 80)
  }

  const toTarget = (id: string): GroundedTarget | null => {
    const n = ev.elements.get(id)
    if (!n) {
      rejected.push(`unknown element id "${id}"`)
      return null
    }
    const sourced = n.srcLoc ? n : nearestSourced(snap, n)
    return {
      domId: n.id,
      srcLoc: sourced?.srcLoc ?? null,
      tag: n.tag,
      text: n.text,
      subtreeText: subtreeText(n),
      classes: n.classes,
      rect: n.rect,
    }
  }

  const actions: GroundedAction[] = []
  for (const a of raw.actions) {
    // design mode is creation-only — belt to the schema's suspenders
    if (mode === 'design' && !(DESIGN_KINDS as readonly string[]).includes(a.kind)) {
      rejected.push(`'${a.kind}' is not allowed in design mode (creation only)`)
      continue
    }
    const targets = (a.elements ?? []).map(toTarget).filter((t): t is GroundedTarget => t !== null)
    const dest = a.destElement ? (toTarget(a.destElement) ?? undefined) : undefined

    // region + paths from cited strokes — geometry computed here, never taken
    // from the model
    let region: BBox | undefined
    const svgPaths: Array<{ strokeId: string; d: string }> = []
    const citedStrokes = (a.strokes ?? [])
      .map((id) => {
        const s = ev.strokes.get(id)
        if (!s) rejected.push(`unknown stroke id "${id}"`)
        return s
      })
      .filter((s): s is Stroke => Boolean(s))
    if (citedStrokes.length) {
      for (const s of citedStrokes) {
        const b = bboxOf(s.points)
        region = region ? bboxUnion(region, b) : b
      }
      if (a.kind === 'design' || a.kind === 'add') {
        for (const s of citedStrokes) {
          const fit = toSvgPath(s.points, { tolerance: 2, origin: { x: region!.x, y: region!.y } })
          if (fit) svgPaths.push({ strokeId: s.id, d: fit.d })
        }
      }
    }

    // structural validity per kind
    if ((a.kind === 'delete' || a.kind === 'modify') && targets.length === 0) {
      rejected.push(`${a.kind} action with no valid targets ("${a.instruction.slice(0, 50)}")`)
      continue
    }
    if (a.kind === 'move' && (targets.length === 0 || !dest)) {
      rejected.push(`move action missing source or destination`)
      continue
    }
    if (a.kind === 'swap' && targets.length !== 2) {
      rejected.push(`swap action needs exactly 2 targets, got ${targets.length}`)
      continue
    }
    if ((a.kind === 'add' || a.kind === 'design') && !dest && !region) {
      rejected.push(`${a.kind} action with neither container nor strokes`)
      continue
    }

    // destructive-width gate is ours, not the model's
    const targetArea = targets.reduce((acc, t) => acc + t.rect.w * t.rect.h, 0)
    const needsConfirm =
      a.kind === 'delete' && (targets.length >= 3 || targetArea > viewArea * 0.35)

    actions.push({
      kind: a.kind,
      targets,
      dest,
      position: a.position ?? undefined,
      instruction: a.instruction,
      region,
      svgPaths: svgPaths.length ? svgPaths : undefined,
      layer: a.layer ?? undefined,
      depicts: a.depicts ?? undefined,
      fidelity: a.fidelity ?? undefined,
      needsConfirm,
    })
  }

  return { reading: raw.reading, unclear: raw.unclear ?? undefined, actions, rejected }
}
