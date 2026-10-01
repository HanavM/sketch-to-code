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
import { appPalette, matchColor, type ColorMatch } from './palette.js'

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

/**
 * A note the user TYPED while sketching, with what it was pointing at.
 *
 * Handwriting has to be read by a model and can be misread; typed text is
 * exact, free and unambiguous, so it outranks any reading of the ink it
 * annotates. The anchor is resolved here, never by the model: an element is
 * addressed by its own build-time stamp plus the point the user was over, and
 * ink by stroke ids we issued.
 */
/**
 * An element the sentence names by token, because the user pointed at it while
 * typing.
 *
 * The anchor says what a note is ABOUT; these say what it MENTIONS, and the
 * distinction carries real information: "when this is clicked, add the row to
 * @2" is one instruction involving two elements, and only the first is the one
 * the person was standing on. Without this the second element has to be
 * described in words and resolved by guesswork, which is exactly the step this
 * tool exists to remove — the stamp was already known at the moment somebody
 * pointed at it.
 */
export interface NoteRef {
  /** '@1', '@2', … as it appears in the text. */
  token: string
  srcLoc: string
  /** How it read on screen, for the brief: `<button> "Send invite"`. */
  label: string
}

export interface TypedNote {
  id: string
  text: string
  at: { x: number; y: number }
  anchor:
    | { kind: 'element'; srcLoc: string }
    | { kind: 'strokes'; strokeIds: string[] }
    | { kind: 'run' }
  /** Elements named inside `text` by token. Usually empty. */
  refs?: NoteRef[]
}

/** A note after its anchor has been resolved against the live snapshot. */
export interface ResolvedNote {
  id: string
  text: string
  scope: 'element' | 'strokes' | 'run'
  /** Element menu id, when it resolved to one. */
  elementId?: string
  strokeIds?: string[]
  /**
   * Tokens in `text`, each already resolved to a menu id the model can target.
   * A ref whose element is gone keeps its label and loses its id, so the
   * sentence still reads — the words are never dropped for a stale stamp.
   */
  refs?: Array<{ token: string; elementId?: string; label: string }>
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
  /** Typed notes, anchored to ids (never to coordinates from the model). */
  notes: ResolvedNote[]
}

const MENU_CAP = 70

/**
 * Resolve each typed note onto ids the interpretation stage can cite.
 *
 * An element note carries a srcLoc rather than a snapshot id because the note
 * was typed before this snapshot existed. A srcLoc can render many times (a
 * .map() template), so the point the user was actually over breaks the tie.
 */
export function resolveNotes(
  notes: TypedNote[],
  snap: DomSnapshot,
  strokeIds: Set<string>,
): ResolvedNote[] {
  const out: ResolvedNote[] = []
  for (const n of notes) {
    const text = typeof n.text === 'string' ? n.text.trim() : ''
    if (!text) continue
    const anchor = n.anchor
    // Tokens resolve the same way the anchor does, and independently of it: a
    // run-scope note can still name elements, and a note whose own subject has
    // been remounted away should not lose the things it mentions.
    const refs = (n.refs ?? [])
      .filter((r) => r && typeof r.token === 'string' && text.includes(r.token))
      .map((r) => {
        const hits = snap.nodes.filter((e) => e.srcLoc === r.srcLoc)
        // nearest to where the note was typed, for the same reason the anchor
        // does it: one .map() template renders N times and they share a stamp
        const near = hits.sort((a, b) => distToRect(n.at, a.rect) - distToRect(n.at, b.rect))[0]
        return near
          ? { token: r.token, elementId: near.id, label: r.label }
          : { token: r.token, label: r.label }
      })
    const withRefs = refs.length > 0 ? { refs } : {}
    if (anchor?.kind === 'element') {
      const matches = snap.nodes.filter((e) => e.srcLoc === anchor.srcLoc)
      const near = matches.sort((a, b) => distToRect(n.at, a.rect) - distToRect(n.at, b.rect))[0]
      if (near) {
        out.push({ id: n.id, text, scope: 'element', elementId: near.id, ...withRefs })
        continue
      }
      // the element is gone (or was never stamped): keep the words, lose the
      // anchor — dropping what the user typed is never the right failure
      out.push({ id: n.id, text, scope: 'run', ...withRefs })
      continue
    }
    if (anchor?.kind === 'strokes') {
      const ids = (anchor.strokeIds ?? []).filter((id) => strokeIds.has(id))
      out.push(ids.length
        ? { id: n.id, text, scope: 'strokes', strokeIds: ids, ...withRefs }
        : { id: n.id, text, scope: 'run', ...withRefs })
      continue
    }
    out.push({ id: n.id, text, scope: 'run', ...withRefs })
  }
  return out
}

const distToRect = (p: { x: number; y: number }, r: BBox): number => {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w))
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h))
  return Math.hypot(dx, dy)
}

export function buildEvidence(strokes: Stroke[], snap: DomSnapshot, notes: TypedNote[] = []): Evidence {
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
      // a deliberately chosen pen colour is an instruction; the default is not
      ...(s.color ? { drawnColor: s.color } : {}),
    }
  })

  const resolved = resolveNotes(notes, snap, new Set(strokes.map((s) => s.id)))

  const brief = JSON.stringify(
    {
      viewport: snap.viewport,
      inkBoundingBox: inkBox
        ? { x: Math.round(inkBox.x), y: Math.round(inkBox.y), w: Math.round(inkBox.w), h: Math.round(inkBox.h) }
        : null,
      strokes: strokeList,
      typedNotes: resolved.length ? resolved : undefined,
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
  return { png: encodePng(raster), brief, elements, strokes: strokeMap, notes: resolved }
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
labeled rounded rects = buttons, squiggly lines = text placeholders,
scribble/hatching between or inside boundary lines = a FILLED/shaded region
(say so in the instruction — it is fill, not strokes), circles
= avatars/icons, a smooth wavy band = ONE decorative ribbon (even if drawn in
several strokes), arrows here are FLOW/annotation between sketched parts.
Handwriting = labels/copy for the new UI — transcribe it into instructions.
Existing elements only matter as CONTEXT: which container the new UI goes in
(destElement) and what it should sit near or span across (layer:
background-overlay when a decoration sweeps across existing elements).


TYPED NOTES outrank your reading of the ink. When the JSON carries
"typedNotes", each is the user's own words, typed while sketching, already
anchored for you: scope "element" names an element id, scope "strokes" names
stroke ids, scope "run" applies to the whole drawing. They are exact — no
transcription, no guesswork — so where a note and your reading of a gesture
disagree, the note wins, and every note must be carried into the instruction
of the action it is anchored to. A note can also be the ONLY intent: ink that
would otherwise read as decoration becomes whatever the note says it is.

A note's "refs" are elements the SENTENCE names, as against the one element it
is about. Each ref gives a token exactly as it appears in the text ("@1"), the
element id it resolves to, and how it read on screen. The user pointed at each
of these while typing, so the token is already resolved: never re-guess which
element "@2" means from its label, and never match it by text. A sentence like
"when this is clicked, add the name to @2" is ONE action — the note's own
element is what it acts on, and @2 is something that action has to know about,
so carry the whole sentence, tokens included, into the instruction. Do not
invent a separate action per token. A ref with no element id is one whose
element is gone: keep the words and say in "unclear" that it could not be
found, rather than silently picking something else.

A stroke with "drawnColor" was drawn in a deliberately chosen pen colour.
That colour is an instruction about the result ("make this red"), not a
description of the ink; say so in the instruction. Never invent a colour for
ink that has no drawnColor.

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


TYPED NOTES outrank your reading of the ink. When the JSON carries
"typedNotes", each is the user's own words, typed while sketching, already
anchored for you: scope "element" names an element id, scope "strokes" names
stroke ids, scope "run" applies to the whole drawing. They are exact — no
transcription, no guesswork — so where a note and your reading of a gesture
disagree, the note wins, and every note must be carried into the instruction
of the action it is anchored to. A note can also be the ONLY intent: ink that
would otherwise read as decoration becomes whatever the note says it is.

A note's "refs" are elements the SENTENCE names, as against the one element it
is about. Each ref gives a token exactly as it appears in the text ("@1"), the
element id it resolves to, and how it read on screen. The user pointed at each
of these while typing, so the token is already resolved: never re-guess which
element "@2" means from its label, and never match it by text. A sentence like
"when this is clicked, add the name to @2" is ONE action — the note's own
element is what it acts on, and @2 is something that action has to know about,
so carry the whole sentence, tokens included, into the instruction. Do not
invent a separate action per token. A ref with no element id is one whose
element is gone: keep the words and say in "unclear" that it could not be
found, rather than silently picking something else.

A stroke with "drawnColor" was drawn in a deliberately chosen pen colour.
That colour is an instruction about the result ("make this red"), not a
description of the ink; say so in the instruction. Never invent a colour for
ink that has no drawnColor.

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
  /** Exactly what the user typed about this action — authoritative. */
  notes?: string[]
  /**
   * Elements the notes NAME by token, resolved here.
   *
   * Kept out of `targets` on purpose. A target is a thing the action is being
   * done to, and the counting and gating downstream mean it: the destructive
   * confirmation counts targets, swap requires exactly two, verification checks
   * that each one changed. An element merely mentioned in a sentence is none of
   * those things — folding it into targets would make "add the row to the team
   * table" look like an action on the team table, and a delete that mentions
   * another element would ask for confirmation at the wrong threshold.
   */
  refs?: Array<{ token: string; label: string; domId?: string; srcLoc?: string }>
  /** Colour the strokes were drawn in, snapped to the app's own palette. */
  color?: ColorMatch
  needsConfirm: boolean
}

export interface GroundedInterpretation {
  reading: string
  unclear?: string
  actions: GroundedAction[]
  /** Typed notes that matched no single action — they apply to the run. */
  runNotes?: string[]
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
  const palette = appPalette(snap)
  // notes that name no action of their own end up on the run
  const attached = new Set<string>()

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

    // Typed notes attach deterministically: an element note to the actions
    // touching that element, an ink note to the actions citing those strokes.
    // The model never decides which words apply where.
    const citedIds = new Set(citedStrokes.map((s) => s.id))
    const targetIds = new Set([...targets.map((t) => t.domId), ...(dest ? [dest.domId] : [])])
    const notes: string[] = []
    const refs: NonNullable<GroundedAction['refs']> = []
    for (const note of ev.notes) {
      const hit =
        (note.scope === 'element' && note.elementId && targetIds.has(note.elementId)) ||
        (note.scope === 'strokes' && (note.strokeIds ?? []).some((id) => citedIds.has(id)))
      if (!hit) continue
      notes.push(note.text)
      attached.add(note.id)
      // the sentence came with this action, so the elements it names come too —
      // including the source location, which is what codegen actually needs
      for (const r of note.refs ?? []) {
        if (refs.some((x) => x.token === r.token)) continue
        const node = r.elementId ? snap.nodes.find((n) => n.id === r.elementId) : undefined
        refs.push({
          token: r.token,
          label: r.label,
          ...(r.elementId ? { domId: r.elementId } : {}),
          ...(node?.srcLoc ? { srcLoc: node.srcLoc } : {}),
        })
      }
    }

    // Colour intent: the pen colour the strokes were drawn in, snapped to a
    // colour the app already uses. Majority wins when a drawing mixes pens.
    const tally = new Map<string, number>()
    for (const st of citedStrokes) {
      if (st.color) tally.set(st.color, (tally.get(st.color) ?? 0) + 1)
    }
    const drawnColor = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const color = drawnColor ? (matchColor(drawnColor, palette) ?? undefined) : undefined

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
      notes: notes.length ? notes : undefined,
      refs: refs.length ? refs : undefined,
      color,
      needsConfirm,
    })
  }

  // A note the user typed must never be silently dropped because no action
  // claimed it — an unattached one still describes this run.
  const runNotes = ev.notes.filter((n) => !attached.has(n.id)).map((n) => n.text)

  return {
    reading: raw.reading, unclear: raw.unclear ?? undefined, actions, rejected,
    runNotes: runNotes.length ? runNotes : undefined,
  }
}
