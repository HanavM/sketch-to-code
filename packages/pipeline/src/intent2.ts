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
  isFillDot, inkFills, pageFill,
  type BBox, type InkFill, type Stroke,
} from '@s2c/ink'
import { nearestSourced, type DomNode, type DomSnapshot } from '@s2c/dom'
import { appPalette, matchColor, type ColorMatch } from './palette.js'
import { isTextMark, textStacks, type TextStack } from './textmark.js'
import { shapeOf, cleanPath, type ShapeMark } from './shapemark.js'
import { findInsertSlot, type InsertSlot } from './insert-slot.js'

// ---------- model-facing output schema ----------

/**
 * Everything a sentence or a gesture is allowed to mean.
 *
 * The first six change what the page looks like. The last two change where its
 * data lives, and they are here rather than left to the codegen model on
 * purpose: both are mechanical, both already have a tested implementation that
 * writes the route, the hook and the rewrite, and both are the kind of thing a
 * model asked to "make this save" would otherwise invent from scratch — a
 * different shape every time, unverified, usually with the hook in the wrong
 * scope. A named verb backed by one implementation is the cheaper and safer
 * half of this: the model's job shrinks to recognising which verb it is.
 */
export type ActionKind =
  | 'delete' | 'modify' | 'add' | 'move' | 'swap' | 'design'
  /** This list should come from the server instead of being written in. */
  | 'serve'
  /** This form should keep what people type into it. */
  | 'save'
  /** Clicking this button/link opens another screen (navigate.ts). */
  | 'navigate'

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
  /** navigate: the screen's name as written in the box the arrow points at. */
  screen?: string | null
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
    | { kind: 'strokes'; strokeIds: string[]; focus?: string[] }
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
   * The strokes in `strokeIds` right where the note was typed, when that is
   * fewer than all of them. A note's cluster chains every stroke drawn close
   * in space and time, so a headline, its subtitle and a button can share one;
   * "huge serif headline" is about the headline only. Absent = all of them.
   */
  focus?: string[]
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
export const GESTURE_KINDS = [
  'delete', 'modify', 'add', 'move', 'swap', 'design', 'serve', 'save', 'navigate',
] as const
/**
 * The two that change where data lives rather than how the page looks.
 *
 * Applied deterministically before the model is asked anything, by the same
 * engines the keyboard shortcut uses — so a sentence and a keypress produce
 * byte-identical edits, and neither spends a token.
 */
export const BACKEND_KINDS = ['serve', 'save'] as const

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
  // n41 (2026-10-21): 'unclear' is NOT required. Traced failing readings: the
  // model often drops a null 'unclear' (or its tool-call markup swallows it
  // into 'reading'), every retry was rejected for that one empty field, and the
  // reading died at max turns with a good answer in hand.
  required: ['reading', 'actions'],
  properties: {
    reading: { type: 'string' },
    unclear: nullable({ type: 'string' }),
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'elements', 'destElement', 'position', 'instruction', 'strokes', 'layer', 'depicts', 'fidelity', 'screen'],
        properties: {
          kind: { type: 'string', enum: [...GESTURE_KINDS] },
          elements: nullable({ type: 'array', items: { type: 'string' } }),
          destElement: nullable({ type: 'string' }),
          position: nullable({ type: 'string', enum: ['before', 'after', 'into'] }),
          instruction: { type: 'string' },
          strokes: nullable({ type: 'array', items: { type: 'string' } }),
          layer: nullable({ type: 'string', enum: ['in-flow', 'background-overlay', 'container'] }),
          depicts: nullable({ type: 'string' }),
          fidelity: nullable({ type: 'string', enum: ['verbatim', 'recognized'] }),
          screen: nullable({ type: 'string' }),
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
  /** n10: coloured taps and what each fills (a mark, or the page). */
  fills?: InkFill[]
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
  strokes: Stroke[] = [],
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
      const focus = noteFocus(ids, anchor.focus, n.at, strokes)
      out.push(ids.length
        ? { id: n.id, text, scope: 'strokes', strokeIds: ids, ...(focus ? { focus } : {}), ...withRefs }
        : { id: n.id, text, scope: 'run', ...withRefs })
      continue
    }
    out.push({ id: n.id, text, scope: 'run', ...withRefs })
  }
  return out
}

/**
 * Is this typed note about the look of the whole page rather than one block?
 * It names the page itself (page, site, background, paper, theme, "whole"/
 * "overall"/"everywhere") — "bright yellow page", "near-black page with faint
 * purple grid lines", "magazine on warm paper". Words like "sidebar" or "panel"
 * alone never count: those are blocks.
 */
export function isPageLookNote(text: string): boolean {
  // "bleeding off the page edge", "across the page", "top of the page" say
  // WHERE a block sits, not how the page looks. Round 2 (c2, c5): the hollow
  // "NOISE" headline and a striped band were sent as page-look notes, which
  // tells codegen to style the page root with hollow type and stripes.
  const t = text.replace(
    /\b(off|past|beyond|over|across|along|down|up|around|to|at|from|on|of|out of|outside|over the edge of)\s+(the\s+)?(page|site|screen|viewport)('s)?(\s+(edges?|sides?|bottom|top|corners?))?\b/gi,
    ' ',
  ).replace(/\b(page|screen|viewport)\s+(edges?|sides?|corners?|bottom|top)\b/gi, ' ')
    .replace(/\b(in|into|behind)\s+the\s+background\b/gi, ' ')
  return /\b(page|pages|site|website|background|backdrop|bg|paper|theme|whole|overall|everywhere)\b/i.test(t)
}

import { markAreasAndEdges } from './areas.js'
export { noteFocus, GIANT_STACK_PX, NOTE_FOCUS_SLACK_PX, NOTE_ON_BLOCK_PX } from '@s2c/ink'
import { noteFocus, distToRect, bboxUnionAll as union } from '@s2c/ink'

export function buildEvidence(allStrokes: Stroke[], snap: DomSnapshot, notes: TypedNote[] = []): Evidence {
  // n10: a coloured tap is a fill, not a mark: it never reaches the reading as
  // a stroke (it would be a dot on whatever it sits on); what it fills is
  // decided from the ink here and handed over as colour
  const fills = inkFills(allStrokes)
  const strokes = allStrokes.filter((s) => !isFillDot(s))
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
  /**
   * Elements somebody POINTED AT are never trimmed away.
   *
   * The cap ranks by distance to the ink, which is the right ranking when there
   * is ink. A typed sentence need not have any — "point at this and say what
   * should happen" is a complete interaction on its own — and then every
   * distance is zero, the ranking is meaningless, and the cap keeps whatever
   * the first seventy nodes happen to be. The one element that certainly
   * matters, the one a person deliberately pointed at, can fall outside it.
   *
   * What that looks like downstream is worse than it sounds: the note still
   * reaches the model, carrying an element id the model has no entry for, so it
   * is being told about something it cannot name and therefore cannot act on.
   * No error, no refusal — the sentence just quietly does nothing.
   *
   * So the anchors and the tokens are pinned into the menu first, and the
   * distance ranking fills what is left.
   */
  const resolvedForMenu = resolveNotes(notes, snap, new Set(strokes.map((st) => st.id)), strokes)
  const pinnedIds = new Set<string>()
  for (const n of resolvedForMenu) {
    if (n.elementId) pinnedIds.add(n.elementId)
    for (const r of n.refs ?? []) if (r.elementId) pinnedIds.add(r.elementId)
  }
  // from snap.nodes, not candidates: a pointed-at element is wanted whatever
  // its size, including one bigger than the area filter allows
  const pinned = snap.nodes.filter((n) => pinnedIds.has(n.id))
  const menu = [
    ...pinned,
    ...candidates
      .filter((n) => !pinnedIds.has(n.id))
      .sort((a, b) => dist(a) - dist(b))
      .slice(0, Math.max(0, MENU_CAP - pinned.length)),
  ].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)

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

  // already resolved, to build the menu — the same list, not a second reading
  const resolved = resolvedForMenu

  const brief = JSON.stringify(
    {
      viewport: snap.viewport,
      inkBoundingBox: inkBox
        ? { x: Math.round(inkBox.x), y: Math.round(inkBox.y), w: Math.round(inkBox.w), h: Math.round(inkBox.h) }
        : null,
      strokes: strokeList,
      // n10: what the user coloured in by tapping with a colour picked
      ...(fills.length ? { colourFills: fills.map((f) => ({ fills: f.target ?? 'whole page', color: f.color })) } : {}),
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
  return { png: encodePng(raster), brief, elements, strokes: strokeMap, notes: resolved, fills }
}

export const DESIGN_INTERPRET_PROMPT = `
You are the intent-reading stage of a sketch-to-code tool, in DESIGN mode:
EVERYTHING the user drew is new UI to CREATE. Nothing is a command — there
are no deletes, no moves, no modifications of existing elements in this mode.
The image shows their ink (dark strokes) over a gray wireframe of the page's
actual elements, to scale. The JSON lists each stroke (id, bbox, draw order,
exact geometric features) and the page's element menu (id, tag, text, rect,
source location). "elements" and "strokes" are different namespaces and must never be mixed.
"elements" takes ids from the element menu below; "strokes" takes the stroke ids
you were given ("s0", "s1", …). Putting a stroke id in "elements" names nothing
and is dropped. When you are building NEW UI on empty space there is often no
element worth citing at all — leave "elements" empty and let "strokes" and
"destElement" carry the action. An empty list is correct there; a list of stroke
ids is not.

TRUST THE IMAGE for shape/form.

FIDELITY — decide PER ACTION, not once for the drawing, this matters most:
- DEPICTION: the sketch represents a recognizable thing (an animal, object,
  symbol — a crab, a purse, a sun). Set depicts:"<the thing>" and
  fidelity:"recognized". The user wants a proper icon/illustration of that
  thing, NOT their wobbly outline cleaned up.
- DECORATION: abstract form (wave, ribbon, blob) whose shape IS the point.
  fidelity:"verbatim" — the exact path will be reproduced.
- WIDGET: looks like a UI element from the lexicon → normal add/design.

One drawing routinely mixes all three — a hero with a wavy divider, an icon and
three lines of copy is one of each — so a single fidelity for the whole sketch is
wrong. Set it on the action it applies to.

NEVER verbatim: marks that STAND FOR TEXT. A squiggly line, a row of short
squiggles, a wavy line sitting where a heading or a sentence belongs — these are
text placeholders, and tracing them produces a wavy line on the page where words
were meant. That is the single most common way to ruin a result. A text
placeholder is a WIDGET: emit real copy for it (take the words from a typed note
if there is one, otherwise write plausible copy that suits the page). Length and
thickness tell you heading versus body, not whether it is decoration. Only call a
curve DECORATION when it is doing a decorative job — a divider, a background
band, a blob behind content — and never when it sits in a text slot.

Read the drawing AS A WHOLE as a design: boxes = containers/cards/inputs
(a plain box is NEVER an image: only a box with an X through it, or a note
saying picture/photo/image, is one; an empty box beside the main column is a
sidebar or panel with short plausible content),
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
stroke ids, scope "run" applies to the whole drawing. A strokes note may also
carry "focus": the strokes right where it was typed. Its "strokeIds" are the
whole nearby drawing, which can hold several things (a headline, a sentence
and a button drawn close together); the note is about its focus strokes only,
and the others get their own actions. They are exact — no
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
"colourFills" are taps the user made with a colour picked: each colours in the
stroke it names (that block's background is that colour) or the whole page
(several page taps = a gradient from the first towards the last). Each one is
exact and is handed to the build as is: never contradict it in words, and do
not cite the taps (they are not strokes).

Rules for your answer:
- Only 'add' and 'design' actions exist in this mode.
- Reference ONLY ids from the menus; never invent ids or output coordinates.
  'destElement' takes a DOM element id (the container); stroke ids go in
  'strokes' ONLY.
- Prefer ONE composite action per coherent drawing.
- A note that lists many quoted items (columns, events, cards, bubbles, list
  rows) describes the CONTENT of the one block its focus strokes drew: it is
  never one action, or one mark, per item.
- reading: 1-2 plain sentences. Note real ambiguity in 'unclear'.
- Answer with ONE object whose top-level keys are exactly "reading",
  "unclear" and "actions" (actions is the array). Never wrap the answer in
  another key such as {"actions": {...}}.
`.trim()

export const INTERPRET_PROMPT = `
You are the intent-reading stage of a sketch-to-code tool. The user drew with
a mouse on a transparent overlay over their RUNNING web app. The image shows
their ink (dark strokes) over a gray wireframe of the page's actual elements,
to scale. The JSON lists: each stroke (id, bbox, draw order, exact geometric
features) and the page's element menu (id, tag, text, rect, source location).
"elements" and "strokes" are different namespaces and must never be mixed.
"elements" takes ids from the element menu below; "strokes" takes the stroke ids
you were given ("s0", "s1", …). Putting a stroke id in "elements" names nothing
and is dropped. When you are building NEW UI on empty space there is often no
element worth citing at all — leave "elements" empty and let "strokes" and
"destElement" carry the action. An empty list is correct there; a list of stroke
ids is not.

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
stroke ids, scope "run" applies to the whole drawing. A strokes note may also
carry "focus": the strokes right where it was typed. Its "strokeIds" are the
whole nearby drawing, which can hold several things (a headline, a sentence
and a button drawn close together); the note is about its focus strokes only,
and the others get their own actions. They are exact — no
transcription, no guesswork — so where a note and your reading of a gesture
disagree, the note wins, and every note must be carried into the instruction
of the action it is anchored to. A note can also be the ONLY intent: ink that
would otherwise read as decoration becomes whatever the note says it is.

TWO ACTIONS ARE ABOUT DATA RATHER THAN APPEARANCE, and they exist because
people ask for them constantly in words:

- "serve" — this list should come from the server instead of being written into
  the component. Use it for "load this from the server", "this should come from
  the database", "make this data real", "this shouldn't be hardcoded". One
  target: the element showing the data (a row, a cell, a card — anything
  rendered from the list). Something already fetching does not need it.
- "save" — this form should keep what people type into it. Use it for "this
  should actually save", "submitting should store it", "make this form real",
  "this should persist". One target: the form, or any field or button inside it.

Both are applied mechanically, so emit the verb and nothing else — do not also
emit a "modify" describing how to write a server, and do not put the
implementation in the instruction. Say what the user asked for in the
instruction and let the verb carry it. If a sentence asks for BOTH ("submissions
from this form should show up in that table"), that is two actions: a "save" on
the form and a "serve" on the list. Only reach for "modify" when what is wanted
is neither of these — a specific endpoint shape, an authentication rule,
anything with its own logic — and say in "unclear" that it needs real backend
work rather than one of these two.

ONE ACTION ADDS A SCREEN. An arrow from a button or link to a box with a name
written in it ("Pricing", "Sign up") — the box often drawn off to the side, like
a second page — means: clicking this opens a new screen with that name. Emit
"navigate" with one target (the button or link the arrow starts at) and
"screen" set to the name exactly as written. It is applied mechanically: do not
also emit an "add" for the box. An arrow between two existing elements that
names no screen is still a "move". The navigate cites the arrow, the box and
the name. Anything drawn INSIDE the box (a form, cards, a list) is the screen's
content: emit it as its own "add" citing only those inner strokes, described as
usual. It is built on the new screen automatically, never on this page.

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
"colourFills" are taps the user made with a colour picked: each colours in the
stroke it names (that block's background is that colour) or the whole page
(several page taps = a gradient from the first towards the last). Each one is
exact and is handed to the build as is: never contradict it in words, and do
not cite the taps (they are not strokes).

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
- Answer with ONE object whose top-level keys are exactly "reading",
  "unclear" and "actions" (actions is the array). Never wrap the answer in
  another key such as {"actions": {...}}.
`.trim()

/**
 * The reading sentence with tool-call markup cut off. n41: a traced reading's
 * 'reading' ran on into "</reading>", "</parameter>" and the next field's JSON.
 */
export function cleanReading(reading: unknown): string {
  const s = typeof reading === 'string' ? reading : ''
  const cut = s.search(/<\/?(?:reading|unclear|actions|parameter|invoke)\b[^>]*>/)
  return (cut === -1 ? s : s.slice(0, cut)).trim()
}

// ---------- validation & grounding ----------

export interface GroundedTarget {
  domId: string
  srcLoc: string | null
  tag: string
  text: string
  /** Own text split around inline children (DomNode.textRuns), when it is. */
  textRuns?: string[]
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
  /** Fitted svg paths of the cited strokes (design actions). Never includes a
   *  stroke that reads as a line of text — those are in `textMarks`. */
  svgPaths?: Array<{ strokeId: string; d: string }>
  /** Cited strokes that are text squiggles: each stands for a line of real
   *  copy. Decided from the ink (textmark.ts), not by the model. */
  textMarks?: string[]
  /** Cited strokes that are plain boxes, straight lines or rings: they say where
   *  something goes and how big, never "draw my ink". Their clean geometry,
   *  decided from the ink (shapemark.ts); they have no svgPath. */
  shapeMarks?: ShapeMark[]
  /** Stacks of those squiggles (2+ lines): the drawn line spacing is the line
   *  height, so it carries a font size (textmark.ts textStacks). */
  textSize?: TextStack[]
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
  /** n10: colours stated by the ink itself, per mark (exact, never snapped). */
  inkColours?: InkColour[]
  /** navigate: the screen's name, as written. */
  screen?: string
  /**
   * add/design drawn inside a navigate's screen box: built into that screen,
   * not the page it was drawn on (screen-contents.ts, s2c-040). Set by run2
   * after the navigate engine has written the screen file.
   */
  onScreen?: { name: string; route: string; file: string; navIndex: number }
  /**
   * add/design drawn in the gap between two children of a row or column (a
   * caret between two nav links): the two it goes between, from geometry,
   * never from the model (insert-slot.ts, s2c-055).
   */
  insertSlot?: InsertSlot
  /** navigate: every stroke it cites (arrow, box, name). Paths are only fitted for creations. */
  strokeIds?: string[]
  needsConfirm: boolean
}

/** n10: a colour the ink states for one mark: its fill, or its text colour. */
export interface InkColour {
  strokeId: string
  /** 'box' | 'ring' | 'line' | 'text line' | 'outline' (a closed freehand blob) */
  mark: string
  paint: 'background' | 'text'
  color: string
  box: BBox
  /** a tap with a colour picked, or the pen colour the mark was drawn in */
  how: 'tap' | 'pen'
}

export interface GroundedInterpretation {
  reading: string
  /**
   * How many of the model's actions did not survive grounding at all.
   *
   * Separate from `rejected`, which is a list of REASONS and mixes two very
   * different things: an action thrown away whole, and an action that ran fine
   * after one unusable id was ignored. Reporting the reason count as if it were
   * the action count is actively misleading — it read as "11 of 12 actions were
   * dropped" when every action had in fact run, each carrying one junk element
   * id. A number shown to a user has to mean one thing.
   */
  droppedActions?: number
  unclear?: string
  actions: GroundedAction[]
  /** Typed notes that matched no single action — they apply to the run. */
  runNotes?: string[]
  /**
   * Typed notes that describe the look of the WHOLE page ("bright yellow page",
   * "near-black page with a faint grid"), wherever they were typed. A person
   * types the page look on whatever they drew first, often a nav box; left
   * there, it styled only that block (round 1: c2's nav became a black bar,
   * c4's dark page stopped at the content). Codegen styles the page root with
   * these, full viewport height. The note still also goes to its own action.
   */
  pageNotes?: string[]
  /** n10: the page colour the user tapped on bare page (a gradient for 2+ colours). */
  pageFill?: { colors: string[]; angle?: number; css: string }
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
  // notes whose focus strokes some action cites: those never spill onto the
  // other actions their cluster happens to touch
  const citedAnywhere = new Set<string>()
  for (const a of raw.actions) for (const id of a.strokes ?? []) {
    const s = ev.strokes.get(id)
    if (s) citedAnywhere.add(s.id)
  }
  const focusedElsewhere = new Set(
    ev.notes.filter((n) => n.focus?.some((id) => citedAnywhere.has(id))).map((n) => n.id),
  )

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
      ...(n.textRuns && n.textRuns.length > 1 ? { textRuns: n.textRuns } : {}),
      subtreeText: subtreeText(n),
      classes: n.classes,
      rect: n.rect,
    }
  }

  // Type size is read from ALL the text squiggles on the page at once, not per
  // action: round 1 c2 drew "MAKE IT LOUD" as two squiggles 172px apart, and a
  // reading that splits those lines over two actions (or cites one with the
  // body copy) would otherwise lose the stack and the headline came out at the
  // app's default heading size (~50px for a 157px drawn size).
  const pageStacks = textStacks(
    [...ev.strokes.values()].map((s) => ({ id: s.id, points: s.points })),
  )

  // A stroke one add/design action cites ALONE is that action's own mark. Any
  // other action that cites it next to strokes of its own is borrowing it as a
  // frame, and borrowing it drags its typed note along: round 6 c3 cited the
  // page-wide hills box on every action, the hills' "deep green" note landed
  // on the sun's action, and the orange sun was built deep green.
  const ownedAlone = new Map<string, number>()
  for (const a of raw.actions) {
    if (a.kind !== 'add' && a.kind !== 'design') continue
    const ids = (a.strokes ?? []).filter((id) => ev.strokes.has(id))
    if (ids.length === 1) ownedAlone.set(ids[0]!, (ownedAlone.get(ids[0]!) ?? 0) + 1)
  }
  // A big drawn rectangle that several actions cite next to a small mark of
  // their own, with no action citing it alone, is still one action's frame:
  // the one that cites the most strokes with it (the grid with its headers).
  // The others are borrowing it, and a borrowed frame became their drawn form:
  // round 30 e3 cited the month grid's rectangle with the launch bar, and the
  // bar was built as a purple slab over the whole month.
  const frameBox = new Map<string, BBox>()
  for (const s of ev.strokes.values()) frameBox.set(s.id, bboxOf(s.points))
  const frameOwner = new Map<string, number>()
  {
    const citers = new Map<string, Array<{ i: number; others: number }>>()
    raw.actions.forEach((a, i) => {
      if (a.kind !== 'add' && a.kind !== 'design') return
      const ids = [...new Set((a.strokes ?? []).filter((id) => ev.strokes.has(id)))]
      if (ids.length < 2) return
      for (const id of ids) {
        const list = citers.get(id) ?? []
        list.push({ i, others: ids.length - 1 })
        citers.set(id, list)
      }
    })
    for (const [id, list] of citers) {
      if (list.length < 2 || ownedAlone.has(id)) continue
      const sorted = [...list].sort((x, y) => y.others - x.others)
      if (sorted[0]!.others > sorted[1]!.others) frameOwner.set(id, sorted[0]!.i)
    }
  }
  const borrowedFrame = (id: string, rest: string[], i: number): boolean => {
    const owner = frameOwner.get(id)
    if (owner === undefined || owner === i) return false
    const outer = frameBox.get(id)
    const boxesIn = rest.map((r) => frameBox.get(r)).filter((b): b is BBox => Boolean(b))
    if (!outer || !boxesIn.length) return false
    const inner = union(boxesIn)
    const pad = 8
    const encloses = inner.x >= outer.x - pad && inner.y >= outer.y - pad &&
      inner.x + inner.w <= outer.x + outer.w + pad && inner.y + inner.h <= outer.y + outer.h + pad
    return encloses && outer.w * outer.h >= 4 * Math.max(1, inner.w * inner.h)
  }
  const ownStrokes = (a: (typeof raw.actions)[number], i = -1): string[] => {
    const ids = a.strokes ?? []
    if (a.kind !== 'add' && a.kind !== 'design') return ids
    const known = ids.filter((id) => ev.strokes.has(id))
    if (known.length < 2) return ids
    let kept = ids.filter((id) => !ownedAlone.has(id))
    if (!kept.some((id) => ev.strokes.has(id))) kept = ids
    const framed = kept.filter((id) => borrowedFrame(id, kept.filter((r) => r !== id && ev.strokes.has(r)), i))
    if (framed.length) {
      const rest = kept.filter((id) => !framed.includes(id))
      if (rest.some((id) => ev.strokes.has(id))) kept = rest
    }
    return kept
  }

  const actions: GroundedAction[] = []
  for (const [ai, a] of raw.actions.entries()) {
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
    const textMarks: string[] = []
    const shapeMarks: ShapeMark[] = []
    // every page stack this action cites any line of (a stack split over two
    // actions gives each of them the size)
    const textStackOf = (ids: string[]): TextStack[] =>
      pageStacks.filter((st) => st.strokes.some((id) => ids.includes(id)))
    const citedStrokes = ownStrokes(a, ai)
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
          // a squiggle that stands for words never becomes a path: not in the
          // scaffold, not in the composition check, not under the trace rung.
          // It still sets the region and stays cited (textmark.ts).
          if (isTextMark(s.points)) {
            textMarks.push(s.id)
            continue
          }
          // a box, a straight line or a ring marks where something goes and how
          // big: it never becomes a path either (shapemark.ts). Only a depiction
          // keeps paths, and then the clean shape, never the wobble.
          const shape = shapeOf(s.points)
          if (shape && !a.depicts) {
            shapeMarks.push({ strokeId: s.id, ...shape })
            continue
          }
          if (shape) {
            svgPaths.push({ strokeId: s.id, d: cleanPath(shape, { x: region!.x, y: region!.y }) })
            continue
          }
          const fit = toSvgPath(s.points, { tolerance: 2, origin: { x: region!.x, y: region!.y } })
          if (fit) svgPaths.push({ strokeId: s.id, d: fit.d })
        }
      }
      // A squiggle sits on its line's middle, so ink alone puts a block of text half a
      // line low (round 4 c1: 150px headline drawn as 3 lines built ~60px low). A pure
      // text action whose lines all form one drawn stack takes that stack's line boxes.
      // n11: the same for a heading drawn as stacked level lines (lineStacks).
      const wordLines = [...textMarks, ...shapeMarks.filter((m) => m.shape === 'line').map((m) => m.strokeId)]
      if (region && wordLines.length && !svgPaths.length && wordLines.length === citedStrokes.length) {
        for (const st of textStackOf(wordLines)) {
          if (st.strokes.every((id) => wordLines.includes(id))) region = bboxUnion(region, st.box)
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
    // Both backend verbs act on exactly one thing, and the engines behind them
    // need a source location: "serve" has to find the literal the element was
    // rendered from, "save" has to find the enclosing <form>. A target without
    // a stamp cannot be either, and refusing here is how that stays a refusal
    // the user reads instead of a mysterious no-op later.
    if (a.kind === 'serve' || a.kind === 'save') {
      if (targets.length !== 1) {
        rejected.push(`${a.kind} action needs exactly 1 target, got ${targets.length}`)
        continue
      }
      if (!targets[0]!.srcLoc) {
        rejected.push(`${a.kind} action targets an element with no source location`)
        continue
      }
    }
    if (a.kind === 'navigate') {
      if (targets.length !== 1 || !targets[0]!.srcLoc) {
        rejected.push(`navigate action needs exactly 1 button or link to start from, got ${targets.length}`)
        continue
      }
      if (!a.screen || !a.screen.trim()) {
        rejected.push(`navigate action names no screen ("${a.instruction.slice(0, 50)}")`)
        continue
      }
    }

    // Typed notes attach deterministically: an element note to the actions
    // touching that element, an ink note to the actions citing those strokes.
    // The model never decides which words apply where.
    const citedIds = new Set(citedStrokes.map((s) => s.id))
    // a note with a focus goes to the actions citing its focus strokes; only
    // when no action cites them does it fall back to its whole cluster
    const focusCited = (note: ResolvedNote): boolean | null => {
      if (!note.focus?.length) return null
      if (note.focus.some((id) => citedIds.has(id))) return true
      return focusedElsewhere.has(note.id) ? false : null
    }
    const targetIds = new Set([...targets.map((t) => t.domId), ...(dest ? [dest.domId] : [])])
    const notes: string[] = []
    const noteObjs: Array<{ text: string; focus?: string[] }> = []
    const refs: NonNullable<GroundedAction['refs']> = []
    for (const note of ev.notes) {
      const hit =
        (note.scope === 'element' && note.elementId && targetIds.has(note.elementId)) ||
        (note.scope === 'strokes' && (focusCited(note) ?? (note.strokeIds ?? []).some((id) => citedIds.has(id))))
      if (!hit) continue
      notes.push(note.text)
      noteObjs.push({ text: note.text, ...(note.focus?.length ? { focus: note.focus } : {}) })
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

    // n10: colour per mark, from the ink: a tap fills the mark it landed in; a
    // box, ring or closed blob drawn in a colour is filled with it; a line or
    // text squiggle drawn in a colour is that text's (or rule's) colour
    const inkColours: InkColour[] = []
    for (const st of citedStrokes) {
      const b = bboxOf(st.points)
      const box = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }
      const sm = shapeMarks.find((m) => m.strokeId === st.id)
      const mark = sm ? (sm.shape === 'ellipse' ? 'ring' : sm.shape) : textMarks.includes(st.id) ? 'text line' : 'outline'
      const tap = (ev.fills ?? []).filter((f) => f.target === st.id).pop()
      if (tap) { inkColours.push({ strokeId: st.id, mark, paint: 'background', color: tap.color, box, how: 'tap' }); continue }
      if (!st.color) continue
      const flat = sm?.shape === 'line' || textMarks.includes(st.id)
      inkColours.push({ strokeId: st.id, mark, paint: flat ? 'text' : 'background', color: st.color, box: sm?.box ?? box, how: 'pen' })
    }

    // destructive-width gate is ours, not the model's
    const targetArea = targets.reduce((acc, t) => acc + t.rect.w * t.rect.h, 0)
    const needsConfirm =
      a.kind === 'delete' && (targets.length >= 3 || targetArea > viewArea * 0.35)

    // Where in the row: a reading that anchors to a sibling (before/after
    // Features) already says it; one that names only the container does not,
    // and codegen then appends (s2c-055).
    const anchoredToSibling = !!dest && (a.position === 'before' || a.position === 'after')
    const insertSlot = (a.kind === 'add' || a.kind === 'design') && region && !anchoredToSibling
      ? findInsertSlot(snap, region, dest?.domId)
      : undefined

    const stacks = textStackOf([...textMarks, ...shapeMarks.filter((m) => m.shape === 'line').map((m) => m.strokeId)])
    // n14: a box round a big word is that word's area, a slanted line across the page is an edge
    if (shapeMarks.length) markAreasAndEdges(shapeMarks, noteObjs, snap.viewport)
    actions.push({
      kind: a.kind,
      targets,
      dest,
      position: a.position ?? undefined,
      ...(insertSlot ? { insertSlot } : {}),
      instruction: a.instruction,
      region,
      svgPaths: svgPaths.length ? svgPaths : undefined,
      textMarks: textMarks.length ? textMarks : undefined,
      ...(shapeMarks.length ? { shapeMarks } : {}),
      ...(stacks.length ? { textSize: stacks } : {}),
      layer: a.layer ?? undefined,
      depicts: a.depicts ?? undefined,
      // 'verbatim' on an action whose every mark stands for text is the page-05
      // failure stated as a field; there is nothing left to trace
      fidelity: a.fidelity === 'verbatim' && (textMarks.length || shapeMarks.length) && !svgPaths.length
        ? undefined
        : (a.fidelity ?? undefined),
      notes: notes.length ? notes : undefined,
      refs: refs.length ? refs : undefined,
      color,
      ...(inkColours.length ? { inkColours } : {}),
      ...(a.kind === 'navigate' && a.screen ? { screen: a.screen.trim() } : {}),
      // the arrow and the box: run2 finds the screen's box among these (s2c-040)
      ...(a.kind === 'navigate' && citedStrokes.length ? { strokeIds: citedStrokes.map((st) => st.id) } : {}),
      needsConfirm,
    })
  }

  // A note the user typed must never be silently dropped because no action
  // claimed it — an unattached one still describes this run.
  const runNotes = ev.notes.filter((n) => !attached.has(n.id)).map((n) => n.text)
  const pageNotes = ev.notes.filter((n) => isPageLookNote(n.text)).map((n) => n.text)
  const page = pageFill(ev.fills ?? [])

  return {
    reading: cleanReading(raw.reading), unclear: raw.unclear ?? undefined, actions, rejected,
    droppedActions: Math.max(0, (raw.actions?.length ?? 0) - actions.length),
    runNotes: runNotes.length ? runNotes : undefined,
    ...(pageNotes.length ? { pageNotes } : {}),
    ...(page ? { pageFill: page } : {}),
  }
}
