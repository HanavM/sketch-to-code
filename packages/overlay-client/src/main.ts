/**
 * sketch2code overlay client. Injected into the dev app by the vite plugin.
 * Framework-free; lives entirely inside a shadow root so the host app's DOM
 * and styles are untouched (and the snapshot walker excludes it).
 */
import { takeSnapshot } from '@s2c/dom'
import { BRIDGE_MIN_SPAN, pathD, shouldBridge, strokeDiagonal } from './stroke-capture.js'
import type { Pt } from './stroke-capture.js'

/**
 * The element a stroke was drawn over, and that element's box at the moment of
 * drawing.
 *
 * Page coordinates are what make the ink perfect through scroll and zoom — the
 * compositor moves page and ink together. They are exactly wrong for tweak
 * mode, where the PAGE stands still and an element moves inside it: the card
 * slides out from under a circle drawn around it. So a stroke remembers what
 * it was drawn on, and rides along when that element's box changes.
 */
interface StrokeAnchor {
  /** data-s2c of the element, plus which instance of a repeated template. */
  src: string
  index: number
  /** The element's page-space box when the stroke was drawn. */
  rect: { x: number; y: number; w: number; h: number }
  /** Ancestor scaling in force when that box was measured (see layerScale). */
  scale: number
}

interface Stroke {
  id: string
  points: Pt[]
  /** CSS colour this stroke was drawn in; absent = default ink, no intent. */
  color?: string
  /** What this stroke is drawn on, so it can follow it. */
  anchor?: StrokeAnchor
}

interface PreviewShape {
  id: string
  kind: string
  confidence: number
  candidates: Array<{ kind: string; confidence: number }>
  bbox: { x: number; y: number; w: number; h: number }
}
interface V2Target {
  /** The server's own menu id for this element — 'e2', 'e17'. Names the
   *  target in the plan label, because it is what the reading cited. */
  domId: string
  srcLoc?: string | null
  rect: { x: number; y: number; w: number; h: number }
  tag: string
  text: string
  subtreeText?: string
}
/** A colour the strokes were drawn in, already snapped to the app's palette. */
interface V2Color {
  drawn: string
  nearest?: { token: string; css: string }
  distance?: number
}
interface V2Action {
  kind: string
  targets: V2Target[]
  dest?: V2Target
  region?: { x: number; y: number; w: number; h: number }
  instruction: string
  /** Exactly what the user typed about this action. Shown verbatim — these
   *  are their own words and they outrank every reading of the ink. */
  notes?: string[]
  color?: V2Color
  depicts?: string
  fidelity?: 'verbatim' | 'recognized'
  needsConfirm: boolean
}
interface V2Preview {
  interpretation: {
    reading: string
    unclear?: string
    actions: V2Action[]
    /** Typed notes that matched no single action — they apply to the run. */
    runNotes?: string[]
    rejected: string[]
  }
  raw: unknown
  tokens: { input: number; cacheRead: number; output: number }
}

interface PreviewData {
  shapes: PreviewShape[]
  textRegions: Array<{ id: string; bbox: { x: number; y: number; w: number; h: number } }>
  arrows: Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number } }>
  ops: Array<{ op: string; targetTag?: string; targetText?: string; rect?: { x: number; y: number; w: number; h: number }; needsConfirm: boolean }>
  warnings: string[]
  escalatesToDesign: boolean
}

type Mode = 'idle' | 'draw' | 'preview' | 'running' | 'tweak'

interface TweakZone {
  x: number; y: number; w: number; h: number
  kind: 'gap' | 'pt' | 'pr' | 'pb' | 'pl'
}
type HandleKind = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
/** Viewport-coords rect (getBoundingClientRect shape, plain object). */
interface SelRect { left: number; top: number; width: number; height: number }
/**
 * Magnetic alignment guide: a line at `pos` (viewport px) on the given axis,
 * with the extent (lo..hi along the other axis) of the rect that donated it —
 * used to draw the pink line only as far as it's meaningful.
 */
interface Guide { axis: 'v' | 'h'; pos: number; lo: number; hi: number }
/** One extra (non-primary) member of a shift+click multi-selection. */
interface ExtraSel { el: HTMLElement; srcLoc: string; instanceIndex: number }
/** Per-element drag state for every member of a group move. */
interface GroupMember {
  el: HTMLElement
  srcLoc: string
  inFlow: boolean
  startRect: SelRect
  baseTransform: string
  ghost: HTMLElement | null
  prev: { opacity: string; position: string; zIndex: string }
}
interface TweakState {
  el: HTMLElement
  /** data-s2c stamp captured at selection time. */
  srcLoc: string
  rect: DOMRect
  display: string
  direction: 'row' | 'column'
  /** In normal flow (static/relative) — margin nudges make sense here. */
  inFlow: boolean
  /**
   * Every live DOM instance of this stamp (a .map() renders it N times) and
   * which one was clicked. scope 'all' = class edits hit the shared template
   * (every instance, shown linked); 'one' (via double-click) = per-instance
   * edit synthesized server-side.
   */
  instanceEls: HTMLElement[]
  instanceIndex: number
  scope: 'all' | 'one'
  zones: TweakZone[]
  /** gap-strip / padding-band drag (secondary affordances). */
  drag: { zone: TweakZone; startX: number; startY: number; startValue: number } | null
  /** Canva-style handle resize: live preview via inline width/height. */
  handleDrag: {
    handle: HandleKind
    startX: number
    startY: number
    startRect: SelRect
    /** live preview values (px); null = axis untouched by this handle */
    w: number | null
    h: number | null
    /** magnetic guides cached at drag start + the ones currently snapped to */
    guides: Guide[]
    activeGuides: Guide[]
    snappedW: boolean
    snappedH: boolean
    /** element's own CSS transform at drag start — anchor shift composes on top */
    baseTransform: string
    /** window scroll at drag start — deltas are computed in PAGE coords */
    scrollStartX: number
    scrollStartY: number
  } | null
  /**
   * Free-move drag: the element follows the cursor via transform (no file
   * writes mid-drag). All geometry is cached at drag start so pointermove
   * does zero layout reads. On release: sibling slot → reorder, else the
   * server's move ladder (margin → translate) decides.
   */
  moveDrag: {
    /** pointer-down position in PAGE coords (client + scroll): a scroll
     *  mid-drag must not corrupt the committed delta */
    startX: number
    startY: number
    /** pointer-down position in CLIENT coords — click-vs-drag is judged on
     *  pointer travel (a still click during scroll inertia is still a click) */
    startClientX: number
    startClientY: number
    /** PAGE-coord displacement AFTER magnetic snapping — what commits and
     *  what moves in-place previews; ghosts (position:fixed) subtract the
     *  scroll-since-start to stay glued to the cursor */
    dx: number
    dy: number
    startRect: SelRect
    /** OTHER children of the stamped flex/grid parent, rects cached at start */
    siblings: Array<{ index: number; left: number; top: number; right: number; bottom: number }>
    parentSrcLoc: string | null
    fromIndex: number
    /** sibling slot the cursor is currently inside; -1 = none */
    proposedIndex: number
    /** element's own CSS transform at drag start ('' if none) — preserved */
    baseTransform: string
    /** magnetic guides cached at drag start + the ones currently snapped to */
    guides: Guide[]
    activeGuides: Guide[]
    snappedX: boolean
    snappedY: boolean
    /**
     * Unclipped preview: when an ancestor clips (overflow≠visible) the
     * element can't visually leave it, so a document-level fixed ghost
     * follows the cursor while the original dims to 40%. Otherwise the
     * original itself is lifted (position:relative + huge z-index).
     */
    ghost: HTMLElement | null
    /** inline styles to restore on release */
    prev: { opacity: string; position: string; zIndex: string }
    /** extra multi-selection members dragged along with the primary */
    group: GroupMember[]
    /** window scroll at drag start */
    scrollStartX: number
    scrollStartY: number
  } | null
  /** current preview value px per prop */
  preview: Partial<Record<'gap' | 'pt' | 'pr' | 'pb' | 'pl', number>>
}

/** Canva-style handle rendering/hit-testing. */
const HANDLE_SIZE = 8
const HANDLE_HIT = 7
const HANDLE_CURSORS: Record<HandleKind, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}
/** Releases with less total travel than this are clicks, not drags. */
const CLICK_SLOP = 4
/** Magnetic alignment: snap when an edge/center is within this many px of a guide. */
const SNAP_PX = 6
/** Canva-pink guide lines. */
const GUIDE_COLOR = '#ec4899'
/** Two clicks on the selected element within this window toggle instance scope. */
const DBLCLICK_MS = 450

// ---- the lasso: circle elements, get a component ------------------------
// "These belong together" is a thought people have while LOOKING at a page,
// and the drawing gesture for it is to circle them. Every other tweak gesture
// is already spoken for (body drag = move, handle = resize, band = spacing,
// shift+click = multi-select, double-click = instance scope), so the lasso
// takes the one modifier the overlay already owns: Alt. Alt+drag draws it;
// Alt+L arms the next drag for anyone who would rather not hold a key.

/**
 * Violet, and neither cyan (a selection you can drag) nor amber (a shape you
 * can paint): the lasso's outlines promise a THIRD thing — that these boxes
 * are about to leave this file together.
 */
const LASSO_COLOR = '#8b5cf6'
/**
 * The hit rule, deliberately boring so it is predictable while drawing:
 * an element is caught when its CENTRE lies inside the drawn path AND at least
 * this much of its box lies inside the path's bounding box. The centre test is
 * what the user feels ("I went round it"); the area test is what keeps a
 * container the lasso merely passed THROUGH — the grid behind the two cards,
 * the <section> behind that — out of a selection nobody circled.
 */
const LASSO_INSIDE = 0.75
/** A lasso whose bbox diagonal never reaches this is an Alt+click, not a loop. */
const LASSO_MIN_SPAN = 16

// ---- drawn rules: the ink that stays ------------------------------------
// Every other gesture here is an instruction — it happens, the ink goes. A
// rule is the opposite: it is drawn once and then keeps being true, so its
// mark stays on the page and turns red the moment reality stops matching.
//
// Green for holding, red for broken. Neither cyan (draggable) nor violet
// (about to be extracted) nor amber (paintable): a rule promises a FOURTH
// thing — that this relationship is being watched.
const RULE_OK = '#10b981'
const RULE_BROKEN = '#ef4444'
/** A rule line shorter than this is a click, not a line down two edges. */
const RULE_MIN_SPAN = 24

/** One reading the server derived from the drawn line. */
interface RuleProposal {
  kind: string
  subjects: string[]
  value?: number
  tolerance: number
  desc: string
  reading: string
  labels: string[]
}

/** A saved rule plus where its subjects are right now. */
interface RuleView {
  id: string
  kind: string
  subjects: string[]
  note?: string
  value?: number
  tolerance: number
  desc: string
  broken: boolean
  message?: string
  rects: ({ x: number; y: number; w: number; h: number } | null)[]
}

// ---- drag the data -------------------------------------------------------
// Pink, and nothing else here is: this gesture is about a VALUE rather than a
// box, and it has to be obvious mid-drag that what is travelling is the
// number you can read, not the element around it.
const DATA_COLOR = '#ec4899'

/** One end of a value drag: the element, its stamp, and what to call it. */
interface DataEnd { el: HTMLElement; srcLoc: string; label: string }

/** A value being dragged from the thing that shows it to the thing that should. */
interface DataDrag {
  from: DataEnd
  /** Whatever is under the pointer right now, if it is stamped. */
  to: DataEnd | null
  /** Pointer position, PAGE coords, so the line survives a scroll mid-drag. */
  at: XY
  /** The text the source element actually shows — what the user thinks they hold. */
  value: string
}

/** One library entry, as the server holds it. */
interface LibEntry {
  id: string
  name: string
  alreadyHere?: boolean
  kind: 'drawn' | 'extracted' | 'scanned'
  file: string
  exportName: string
  props: { name: string; kind: string; required: boolean }[]
  defaults: Record<string, string>
  thumb?: string
  portable: boolean
  usedCount: number
  home: 'project' | 'global'
  /** Present only in search results: 0..1 against the current sketch. */
  score?: number
}

/** One moment on the timeline, as the server stores it. */
interface HistoryVersion {
  id: string
  at: number
  label: string
  files: string[]
  thumb?: string
}

// ---- props read off the types -------------------------------------------
/** One prop, as the server derived it from the component's own type. */
interface PropSpec {
  name: string
  kind: 'string' | 'number' | 'boolean' | 'enum' | 'other'
  options?: string[]
  required: boolean
  typeText: string
  editable: boolean
  why?: string
}
/** One place the component is used, and the literal values written there. */
interface PropCallSite {
  loc: string
  values: Record<string, string>
  expressions: string[]
}
interface PropsRead {
  ok: boolean
  component?: string
  file?: string
  props?: PropSpec[]
  callSites?: PropCallSite[]
  notes?: string[]
  error?: string
}

/** A bare page point. Not a Pt: a rule's geometry is measured, not drawn. */
interface XY { x: number; y: number }

/** Middle of a page rect — where a gap mark starts and ends. */
const centre = (r: { x: number; y: number; w: number; h: number }): XY =>
  ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** The rule line in flight. PAGE coords, like the lasso's. */
interface RuleDraw {
  from: XY
  to: XY
  /** Stamps of what the pointer was actually over at each end (see `under`). */
  under: string[]
  drawing: boolean
  proposals: RuleProposal[]
  choice: number
}
/**
 * Where a successful extract's receipt waits out the reload it causes.
 *
 * A new file in the module graph is more than React Fast Refresh can patch, so
 * vite full-reloads the page — which tears down this overlay, its mode and its
 * status line a second or two after the write lands. Without this handoff the
 * user's reward for the whole gesture is a blank status bar and being dropped
 * out of tweak mode: the one thing they need to read (what was written, and
 * where) is destroyed by the thing that proves it worked. sessionStorage, not
 * local: it belongs to this tab and this reload, and must never resurface days
 * later in another window.
 */
const EXTRACT_STORE_KEY = 's2c:extracted'
/** Older than this, the receipt is from some earlier reload — drop it. */
const EXTRACT_RECEIPT_MS = 20_000
/** One element the lasso caught: the live node, its stamp, and what to call it. */
interface LassoHit { el: HTMLElement; srcLoc: string; label: string }
/**
 * The gesture in flight. Points are PAGE coords (a scroll mid-lasso must not
 * move the loop relative to the content), and the candidate list + their rects
 * are cached at press time: nothing in the page moves while a lasso is drawn,
 * so re-reading layout on every pointermove would only cost frames.
 */
interface LassoState {
  points: Array<{ x: number; y: number }>
  cands: Array<{ el: HTMLElement; srcLoc: string; x: number; y: number; w: number; h: number }>
  hits: LassoHit[]
  /** false once the pointer is up and the confirm panel owns the gesture. */
  drawing: boolean
}

/**
 * Even-odd ray cast: is (x, y) inside the polygon the pointer traced? The path
 * is treated as closed (last point back to first), because a hand-drawn loop
 * never quite closes and refusing to catch anything until it does would make
 * the gesture feel broken.
 */
function pointInPath(pts: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!
    const b = pts[j]!
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * The page-space box covering several elements.
 *
 * A component that renders a FRAGMENT has no single root — an extracted run of
 * siblings is exactly that, and it is the commonest thing the lasso produces.
 * Measuring "the outermost stamped element" then measures one of them: for a row
 * of three nav links, one link, which is a 3:1 box standing in for a 10:1 row.
 */
function unionRect(els: HTMLElement[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width < 1 && r.height < 1) continue
    x0 = Math.min(x0, r.left + window.scrollX)
    y0 = Math.min(y0, r.top + window.scrollY)
    x1 = Math.max(x1, r.right + window.scrollX)
    y1 = Math.max(y1, r.bottom + window.scrollY)
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** "4m ago" — a timeline is read in relative time, not clock time. */
function ago(at: number): string {
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${String(mins)}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${String(hours)}h ago`
  return `${String(Math.round(hours / 24))}d ago`
}

/** What to call an element in the status line and the confirm lists. */
function elLabel(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  // its own text, if it has a short one: "a “Reports”" is recognizable on the
  // page in a way that "a · Navbar.tsx:7" is not
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text && text.length <= 24 ? `${tag} “${text}”` : tag
}

// ---- shape painting: reach INSIDE the artwork ---------------------------
// The dev plugin stamps every JSX host element, so every <path>, <circle> and
// <rect> already carries its own file:line:col. That makes a drawn shape as
// addressable as a card — one click resolves to an AST node — and recolouring
// it is an attribute edit rather than another model run.

/** The SVG tags a click can paint: exactly the SVGGeometryElement set, i.e.
 *  everything that can hit-test itself with isPointInFill/isPointInStroke. */
const SHAPE_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'line', 'polyline'])
/**
 * Selection accent for a shape. Deliberately NOT the cyan of an element
 * selection: a shape offers a palette, not eight resize handles, and one
 * outline that means two different sets of affordances is a lie the user only
 * discovers by dragging something that shouldn't move.
 */
const PAINT_ACCENT = '#f59e0b'
/**
 * How long the document's shape list is reused (ms). Hover hit-tests every
 * pointermove, and a querySelectorAll over a big app on each one is a frame
 * tax for a list that changes only when the app re-renders.
 */
const SHAPE_CACHE_MS = 400

/** Is this a paintable SVG shape (as opposed to an HTML box or an <svg>/<g>)? */
function isShapeEl(el: Element | null | undefined): el is SVGGeometryElement {
  return (
    el != null && el.namespaceURI === 'http://www.w3.org/2000/svg' &&
    SHAPE_TAGS.has(el.tagName.toLowerCase())
  )
}

/** The file part of a data-s2c stamp, e.g. 'HumanHead.tsx' — what the user
 *  recognizes, where the full 'src/components/…:12:7' would eat the status. */
function stampFile(srcLoc: string): string {
  const path = srcLoc.split(':')[0] ?? srcLoc
  return path.split('/').pop() ?? path
}

/** Where the HUD's parked position + hidden state survive a reload. */
const HUD_STORE_KEY = 's2c:hud'
/**
 * Px of the HUD that must stay inside the viewport. A bar dragged (or restored
 * from a wider monitor) past the edge would be unreachable — no scroll can
 * bring a position:fixed element back.
 */
const HUD_KEEP = 56

// ---- fidelity: how much the generated code should look like the drawing ----
// The pipeline already MEASURES fidelity (asymmetry, spacing rhythm,
// proportions, placement); these controls are the user's half of that
// conversation — they ride along on every interpret/run request and the
// server clamps/re-validates whatever arrives.

/** Which drawn qualities survive into the code, one flag each. */
interface FidelityKeep {
  asymmetry: boolean
  rhythm: boolean
  proportions: boolean
  placement: boolean
}
/**
 * The SECOND fidelity axis: how finished the result is.
 *
 * Resemblance says how closely the drawn GEOMETRY is followed. It says nothing
 * about whether what comes back is line art or a finished thing — and those are
 * genuinely independent. Someone who sketches a side profile of a face at 100%
 * resemblance still does not want their own outline re-emitted as strokes; they
 * want an actual filled face. That is the difference between "turn this drawing
 * into code" and "make me something like this", and it needs its own control.
 */
type FillMode = 'outline' | 'filled' | 'realized'

interface Fidelity {
  /** 0..1 — the resemblance dial the four zones below name. */
  resemblance: number
  keep: FidelityKeep
  /** 'app' snaps to the design system · 'sketch' keeps the hand-drawn look. */
  palette: 'app' | 'sketch'
  /** How filled-in the result is — line art, solid shapes, or a real picture. */
  fill: FillMode
  /** The aesthetic: flat, soft, line art, grain, neon — or none imposed. */
  style: StyleMode
}

/** Iteration order for validation and for the always-visible summary. */
const KEEP_KEYS = ['asymmetry', 'rhythm', 'proportions', 'placement'] as const
/** Checkbox id suffix → label + the WHY that goes in its tooltip. */
const KEEP_LABELS: Record<keyof FidelityKeep, { label: string; tip: string }> = {
  asymmetry: { label: 'keep it lopsided', tip: 'never mirror one side onto the other to make it tidy' },
  rhythm: { label: 'keep uneven spacing', tip: 'repeated parts keep the pitch you drew — no cloning one template onto a uniform grid' },
  proportions: { label: 'keep proportions', tip: 'the width:height ratio you drew survives' },
  placement: { label: 'keep placement', tip: 'parts stay where you drew them relative to each other' },
}

/**
 * The four zones of the resemblance dial, ascending. The user drags a single
 * number, so the zone name + line under it are the ONLY explanation of what
 * that number buys — they have to carry the whole model.
 */
const FIDELITY_ZONES: Array<{ min: number; icon: string; name: string; hint: string }> = [
  { min: 0, icon: '🪄', name: 'reinterpret', hint: 'the drawing is a hint — free to redesign it' },
  { min: 0.35, icon: '📐', name: 'normalize', hint: 'rebuild with clean geometry, keep the composition' },
  { min: 0.6, icon: '📏', name: 'rebuild', hint: 'smooth line, but every measured proportion preserved' },
  { min: 0.85, icon: '✍️', name: 'trace', hint: 'reproduce the drawn line, wobble and all' },
]

/** Iteration order for validation, for the segment, and for Alt+5/6/7. */
const FILL_KEYS = ['outline', 'filled', 'realized'] as const
/**
 * Button label + the one-line hint under the segment + the tooltip WHY.
 *
 * The hint is the only place the three words are actually defined, so it has
 * to say what comes back, not what the mode is called. `glyph` is the bar's
 * always-visible token — a text symbol rather than an emoji so it occupies a
 * predictable width in the pill (see #fillNow). `short` is the one-clause
 * version the help overlay and the status line use, where a full sentence
 * would wrap the row.
 */
const FILL_LABELS: Record<FillMode, { label: string; glyph: string; short: string; hint: string; tip: string }> = {
  outline: {
    label: 'outline', glyph: '◻',
    short: 'line art, no fills',
    hint: 'Line art: strokes, no fills — what the drawing literally is.',
    tip: 'reproduce it as line art — strokes only, nothing filled in',
  },
  filled: {
    label: 'filled', glyph: '◼',
    short: 'solid shapes, not outlines',
    hint: "Solid shapes, not outlines — closed forms get fills from the app's palette.",
    tip: "solid shapes rather than outlines: closed forms get fills from the app's palette",
  },
  realized: {
    label: 'realized', glyph: '✦',
    short: 'a finished picture of what you drew',
    hint: 'A finished illustration of what you drew — filled, shaded, detailed.',
    tip: 'the drawing is the brief, the result is the artwork: a sketched face comes back as an actual face, not a line drawing of one',
  },
}

/**
 * The THIRD fidelity axis: what the result should LOOK like.
 *
 * Resemblance says how closely the drawn GEOMETRY is followed; RESULT says how
 * finished the thing is. Neither says anything about its aesthetic — the same
 * sketch, traced exactly and fully realized, is a flat illustration or a neon
 * sign or a risograph print, and the user cares about that difference as much
 * as about either of the other two. So the aesthetic is its own axis, and it
 * is chosen by FEEL: one word per look, one line saying what comes back.
 */
type StyleMode = 'auto' | 'flat' | 'soft' | 'line' | 'grain' | 'glow'

/** Iteration order for validation, for the picker, and for Alt+Y's cycle. */
const STYLE_KEYS = ['auto', 'flat', 'soft', 'line', 'grain', 'glow'] as const
/**
 * 'auto' imposes nothing: the result is meant to look like the app it is going
 * into, which is what someone who never opens this control wants. Every other
 * value is an aesthetic the user asked for on purpose — so an unknown or
 * missing one lands here, never on a look nobody chose.
 */
const DEFAULT_STYLE: StyleMode = 'auto'
/**
 * One word for the picker, one clause beside it, one line of hint, one tooltip
 * WHY — all from a single table, so the option, the hint, the bar tooltip, the
 * status line and Alt+Y can never say different things.
 *
 * `hint` is a SINGLE line by contract (see .fStyleHint): the box is fixed and
 * never grows, so every string here has to fit one line at the panel's 300px.
 */
const STYLE_LABELS: Record<StyleMode, { label: string; short: string; hint: string; tip: string }> = {
  auto: {
    label: 'auto', short: 'match the app',
    hint: 'No look imposed — it matches the app.',
    tip: 'no aesthetic of its own: the result is rendered to look like the app it is going into',
  },
  flat: {
    label: 'flat', short: 'solid shapes',
    hint: 'Solid shapes, no gradients — flat, modern.',
    tip: 'modern flat illustration: solid shapes and hard edges, no gradients, no shadows',
  },
  soft: {
    label: 'soft', short: 'gradients, shadows',
    hint: 'Gradients and soft shadows — rounded, lit.',
    tip: 'gradients, soft shadows, dimension — things look rounded and lit rather than cut out',
  },
  line: {
    label: 'line', short: 'line art',
    hint: 'Line art: uniform strokes, no fills.',
    tip: 'line art: uniform strokes and nothing filled in',
  },
  grain: {
    label: 'grain', short: 'flat + texture',
    hint: 'Few flat colours, visible grain. Printed.',
    tip: 'a few flat colours plus visible grain and texture — printed, risograph-ish',
  },
  glow: {
    label: 'glow', short: 'neon',
    hint: 'Dark ground, saturated colour, neon edges.',
    tip: 'neon: a dark ground, saturated colour and luminous edges',
  },
}

/** A fresh install sends exactly this. Deep-cloned per read — the panel
 *  mutates its copy, and a shared literal would drift the "default". */
function defaultFidelity(): Fidelity {
  return {
    resemblance: 0.5,
    keep: { asymmetry: true, rhythm: true, proportions: true, placement: true },
    palette: 'app',
    // 'filled', not 'outline': re-emitting someone's drawing as strokes is
    // almost never what they asked for, and the outline is always one click
    // away for the case where it is.
    fill: 'filled',
    // 'auto', because the honest default is "no aesthetic imposed": a look the
    // user never asked for is a look they have to notice and undo.
    style: DEFAULT_STYLE,
  }
}

/** Where the fidelity settings survive a reload (same contract as s2c:hud). */
/**
 * Validate a fidelity object field by field, falling back per field.
 *
 * Shared by the stored settings and by a past run's bundle: both are untrusted
 * shapes that may predate an axis, and neither should lose the rest of the
 * object because one field is missing or wrong.
 */
function parseFidelity(v: unknown): Fidelity {
  const f = defaultFidelity()
  if (!v || typeof v !== 'object') return f
  const o = v as Record<string, unknown>
  const r = o.resemblance
  if (typeof r === 'number' && Number.isFinite(r)) f.resemblance = Math.min(1, Math.max(0, r))
  const keep = o.keep
  if (keep && typeof keep === 'object') {
    const ko = keep as Record<string, unknown>
    for (const k of KEEP_KEYS) {
      const kv = ko[k]
      if (typeof kv === 'boolean') f.keep[k] = kv
    }
  }
  const pal = o.palette
  if (pal === 'app' || pal === 'sketch') f.palette = pal
  // anything unknown (including a profile saved before this axis existed,
  // which has no `fill` at all) keeps the default rather than dropping the
  // rest of the object
  const fill = o.fill
  if (FILL_KEYS.includes(fill as FillMode)) f.fill = fill as FillMode
  // same per-field fallback as `fill`: a profile saved before this axis existed
  // has no `style` at all, and a value this client doesn't know is not a look
  // the server can render — either way the REST of the object survives
  const style = o.style
  if (STYLE_KEYS.includes(style as StyleMode)) f.style = style as StyleMode
  return f
}

/** How long the editor's cursor stays painted on the page. */
const IDE_CURSOR_MS = 1600

const FIDELITY_STORE_KEY = 's2c:fidelity'

/**
 * Any CSS colour → '#rrggbb', via the one parser guaranteed to agree with what
 * the page actually paints.
 *
 * getComputedStyle hands back whatever syntax the stylesheet used — rgb() from
 * plain CSS, oklch() from Tailwind v4, oklab() once a colour has been mixed —
 * and a colour the server can't parse is a colour intent silently lost. Going
 * through the canvas means only one syntax ever reaches the wire.
 *
 * Returns null for anything translucent: a 25%-alpha tint is a surface effect,
 * not a colour the user is asking the result to be.
 */
const round1 = (v: number) => Math.round(v * 10) / 10
const round3 = (v: number) => Math.round(v * 1000) / 1000

/** An element's box in PAGE coordinates — the space ink lives in. */
function pageRect(el: Element): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect()
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }
}

let hexCanvas: CanvasRenderingContext2D | null = null
function toHex(css: string): string | null {
  if (!css || css === 'transparent' || css === 'none') return null
  if (!CSS.supports('color', css)) return null
  hexCanvas ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const ctx = hexCanvas
  if (!ctx) return null
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  if ((a ?? 0) < 230) return null
  return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, '0')).join('')}`
}
/** Where the pen colour survives a reload. */
const PEN_STORE_KEY = 's2c:pen'
/** How many of the app's own colours the pen offers as swatches. */
const PEN_SWATCHES = 10
/** Breathing room between the panel and both the bar and the viewport edge. */
const PANEL_GAP = 10

// ---- typed notes: exact words, attached to what they're about ----------
// A drawing is ambiguous by construction and every reading of it is a guess.
// Typed text is not: it is exactly what the user meant, so it never goes near
// a model for transcription and it outranks anything inferred from ink. The
// only hard problem left is ATTACHMENT — what does the note refer to?

/**
 * Where a note hangs. An element anchor travels as its data-s2c stamp plus
 * the page point, never as a DOM id: the server resolves it against ITS OWN
 * snapshot, and snapshot ids don't exist yet at the moment the note is typed.
 */
type NoteAnchor =
  | { kind: 'element'; srcLoc: string }
  | { kind: 'strokes'; strokeIds: string[] }
  | { kind: 'run' }

interface Note {
  /** 'n0', 'n1', … — stable for the session, never reused after a delete. */
  id: string
  /** Exactly what the user typed. Never trimmed, never rewritten. */
  text: string
  /** PAGE coords of the pointer when the note was opened. */
  at: { x: number; y: number }
  anchor: NoteAnchor
}

/** Page-space rect. Same {x,y,w,h} shape the ink and the snapshot both use. */
interface Box { x: number; y: number; w: number; h: number }

/**
 * How far from the pointer a stroke's bbox may sit and still count as "this
 * note is about that". Generous on purpose: people gesture NEAR the thing
 * they mean, and the alternative (a run-level note) loses information.
 */
const NOTE_NEAR_PX = 120
/** Two strokes belong to the same drawing if their boxes are this close… */
const NOTE_CLUSTER_PX = 120
/** …and were drawn this close in time. A shape drawn now on top of one drawn
 *  five minutes ago is a different thought, however much they overlap. */
const NOTE_CLUSTER_MS = 20_000
/**
 * A stamped element covering this much of the viewport in BOTH axes is the
 * page wrapper, not something the user pointed at — "this note is about the
 * root layout div" is never what anyone meant, so rule 1 declines it and the
 * stroke/run rules get their turn.
 */
const NOTE_BG_COVER = 0.9

// ---- the plan: show it before spending a single token -------------------
// Everything needed to DRAW what a run will do is already in the interpret
// response — targets with rects, destinations, regions, colours and the user's
// own notes. A one-line summary in the status bar throws all of it away and
// makes ✓ Go a leap of faith, so the plan is painted over the page itself:
// every rect that will be touched, outlined where it actually sits.

/** One colour and one word per action kind — the legend IS the outline. */
const PLAN_KINDS: Record<string, { color: string; label: string }> = {
  delete: { color: '#dc2626', label: 'DELETE' },
  modify: { color: '#d97706', label: 'MODIFY' },
  move: { color: '#2563eb', label: 'MOVE' },
  swap: { color: '#7c3aed', label: 'SWAP' },
  add: { color: '#059669', label: 'ADD' },
  design: { color: '#0891b2', label: 'DESIGN' },
}
/** A kind the server grew that this client hasn't learned yet still draws. */
const PLAN_FALLBACK = { color: '#4b5563', label: 'ACTION' }
/** Gap between an outlined rect and the label sitting above it. */
const PLAN_LABEL_GAP = 6
/** How much of an action's instruction a label carries. The instruction is a
 *  paraphrase (unlike a note), so trimming it loses nothing that matters. */
const PLAN_INSTR_MAX = 100

// ---- attempts: pay N times for one result, keep the best one ------------
// The pipeline can generate N independent codegen attempts from the SAME
// confirmed interpretation, score each against the drawing with the
// composition measurement it already runs, and keep only the best. That is a
// real improvement in faithfulness and a real, proportional bill — so the
// choice is the user's, it defaults to 1, and the copy says both halves out
// loud rather than selling the upside.

/** Integer 1–3. Anything else on the wire or in storage falls back to 1. */
type Candidates = 1 | 2 | 3
const CANDIDATE_KEYS = [1, 2, 3] as const
const DEFAULT_CANDIDATES: Candidates = 1
/** Where the attempts count survives a reload (same contract as s2c:fidelity). */
const CANDIDATES_STORE_KEY = 's2c:candidates'
/**
 * Button label + the hint under the segment + the tooltip WHY.
 *
 * The hint has to state the cost in the same breath as the benefit: an
 * attempt is a FULL generation, so three attempts is three times the tokens
 * and three times the wait, and two of the three are thrown away.
 */
const CANDIDATE_LABELS: Record<Candidates, { label: string; short: string; hint: string; tip: string }> = {
  1: {
    label: '1×', short: 'one attempt',
    hint: 'One generation. Cheapest and fastest — what comes back is what you get.',
    tip: 'one generation: the cheapest, fastest run, and the only one billed',
  },
  2: {
    label: '2×', short: 'best of two',
    hint: 'Two full generations, each scored against your drawing. The better one is kept — about 2× the tokens and 2× the wait.',
    tip: 'two full generations, scored against your drawing; the better one is kept and the other discarded — about 2× the tokens and 2× the time',
  },
  3: {
    label: '3×', short: 'best of three',
    hint: 'Three full generations, each scored against your drawing. Only the best is kept — about 3× the tokens and 3× the wait.',
    tip: 'three full generations, scored against your drawing; only the best is kept and the other two discarded — about 3× the tokens and 3× the time',
  },
}

// ---- auto mode: a finished drawing runs itself -------------------------
// Everything else here is one click away from a run; this is zero. The whole
// value is not pressing ✓ Go, so the only hard question is WHEN a drawing is
// finished — and the answer cannot be pointerup, because a drawing is many
// strokes. It is "the pen has stopped moving": the last stroke ended and
// nothing new began for a while.

/** Where the toggle survives a reload (same contract as s2c:fidelity). */
const AUTO_STORE_KEY = 's2c:auto'
/**
 * How long the pen must rest before the drawing counts as finished.
 *
 * The gaps INSIDE one drawing are short — lifting to start the next side of a
 * box, crossing a t, going back over a line — and they cluster well under half
 * a second; the pause that means "there, done" is the long one. 900ms sits
 * above the natural inter-stroke gap without making the tool feel asleep, and
 * it is a floor rather than a guess: every stroke restarts the wait, and the
 * countdown is cancellable, so guessing early costs an Esc rather than a run.
 */
const AUTO_SETTLE_MS = 900
/**
 * How often the countdown redraws. A tenth of a second, because with a
 * sub-second settle a whole-second countdown would only ever read '1' — which
 * tells the user nothing about whether it is about to fire.
 */
const AUTO_TICK_MS = 100

// ---- keymap: one table, two consumers ---------------------------------
// Every action the HUD offers has to be reachable without the mouse. Scattering
// `if (e.altKey && …)` branches through the keydown handler is how bindings go
// undocumented and start colliding, so there is exactly ONE table: the handler
// walks it, and the help overlay is rendered from it. A binding that isn't in
// the table cannot exist, and one that is, is automatically documented.

interface KeyBind {
  id: string
  /** What the help overlay prints, e.g. 'Alt+Shift+N'. */
  keys: string
  label: string
  group: string
  match: (e: KeyboardEvent) => boolean
  run: () => void
}

/**
 * Alt+<letter>. macOS rewrites e.key while Alt is held (∂ for d, ˙ for h), so
 * e.code is the reliable half and the letter is only the layout-independent
 * fallback — the same pattern the original Alt+D binding used.
 */
function altBind(code: string, letter: string, shift = false): (e: KeyboardEvent) => boolean {
  return (e) =>
    e.altKey && !e.metaKey && !e.ctrlKey && e.shiftKey === shift &&
    (e.code === code || e.key.toLowerCase() === letter)
}

/** A bare key with no modifiers at all (Esc). */
function plainBind(code: string, key: string): (e: KeyboardEvent) => boolean {
  return (e) => !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && (e.code === code || e.key === key)
}

/** Cmd (or Ctrl) + <letter>, without Shift — the platform undo shape. */
function metaBind(code: string, letter: string): (e: KeyboardEvent) => boolean {
  return (e) =>
    (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey &&
    (e.code === code || e.key.toLowerCase() === letter)
}

const HOST_ID = 's2c-overlay-host'
/** Per-boot token injected ahead of this bundle by the dev middleware. */
const TOKEN: string = (globalThis as Record<string, unknown>).__S2C_TOKEN__ as string ?? ''
/** Identifies this tab so multi-tab SSE events don't cross-talk. */
const CLIENT_ID = crypto.randomUUID()
/** If no SSE event lands for this long while running, assume the run died. */
const RUNNING_WATCHDOG_MS = 10 * 60_000

function css(strings: TemplateStringsArray): string {
  return strings.join('')
}

const STYLES = css`
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, sans-serif; }
  #canvas {
    position: fixed; inset: 0; z-index: 2147483000;
    pointer-events: none; touch-action: none;
  }
  /* Ink lives in PAGE space, not viewport space: an absolutely positioned
     layer at the document origin, so the compositor moves it with the content.
     No scroll handler, no per-frame repaint, nothing to lag — and pinch/browser
     zoom scale it exactly like the elements it was drawn over. */
  /* Size matters: a zero width or height DISABLES rendering of an <svg>
     outright (SVG 1.1 §5.1.2) — the paths keep reporting correct geometry to
     getBoundingClientRect while painting nothing. Percentages resolve against
     the initial containing block (the viewport), and overflow:visible paints
     the strokes that lie outside it, so the whole page's ink shows without
     the box ever extending the scrollable area. */
  #ink {
    position: absolute; left: 0; top: 0; width: 100%; height: 100%;
    overflow: visible; pointer-events: none; z-index: 2147482999;
  }
  /* A known-size box: measuring it reveals any scaling applied to the layer
     by an ancestor (CSS zoom/transform on the host page). */
  #scaleProbe { position: absolute; left: 0; top: 0; width: 100px; height: 100px; visibility: hidden; pointer-events: none; }
  #ink path { fill: none; stroke: #2563eb; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
  #penDot {
    display: inline-block; width: 12px; height: 12px; border-radius: 999px;
    border: 1.5px solid #f9fafb55; vertical-align: -1px;
  }
  /* Same anchoring as the fidelity popover: above the bar by default, flipped
     below only when there is no room — a panel that merely sits at its flow
     position lands on top of the bar and runs off the viewport. */
  #penPanel {
    position: absolute; left: 0; bottom: calc(100% + 10px);
    display: none; width: 244px; max-width: calc(100vw - 20px);
    padding: 12px; border-radius: 12px;
    background: #111827fa; box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    border: 1px solid #374151; color: #f9fafb; font-size: 12px; line-height: 1.5;
    cursor: default; text-align: left; white-space: normal;
  }
  #penPanel.on { display: block; }
  #penPanel.below { bottom: auto; top: calc(100% + 10px); }
  #penPanel .pHead { font-weight: 600; margin-bottom: 8px; }
  #penPanel .pNote { color: #9ca3af; margin-top: 8px; }
  #penRow { display: flex; flex-wrap: wrap; gap: 6px; }
  .swatch {
    width: 24px; height: 24px; border-radius: 999px; padding: 0;
    border: 2px solid transparent; background-clip: padding-box; cursor: pointer;
  }
  .swatch.on { border-color: #f9fafb; }
  .swatch.ink { background: #2563eb; }
  #penCustom { width: 34px; height: 24px; padding: 0; border: 0; background: none; cursor: pointer; }
  /* ---- paint popover: the swatches belong NEXT TO the shape ------------
     Every other control in this overlay is a global setting, so it lives in
     the bar. This one paints ONE shape, and a palette parked 600px away from
     the thing it recolours makes the user look twice to check which shape is
     selected. So it is position:fixed (the shadow root's fixed containing
     block is the viewport) and layoutPaintPanel writes left/top from the
     selection's LIVE rect on every repaint — it rides along through scroll,
     zoom and the remount that HMR causes after each paint. Above the canvas'
     z-index, or the tweak-mode hit layer would swallow every swatch click. */
  #paintPanel {
    position: fixed; left: 0; top: 0; z-index: 2147483001;
    display: none; width: 214px; max-width: calc(100vw - 20px);
    padding: 10px; border-radius: 12px;
    background: #111827fa; box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    border: 1px solid #b45309; color: #f9fafb; font-size: 12px; line-height: 1.45;
    cursor: default; text-align: left; white-space: normal;
  }
  #paintPanel.on { display: block; }
  /* amber, matching PAINT_ACCENT: the popover and the outline it belongs to
     have to read as one object across the gap between them */
  #paintPanel .qHead { font-weight: 600; margin-bottom: 7px; color: #fcd34d; }
  #paintSeg {
    display: flex; gap: 2px; background: #1f2937; border-radius: 999px;
    padding: 2px; margin-bottom: 8px;
  }
  #paintSeg .qSegBtn { flex: 1; padding: 4px 8px; font-size: 11px; background: transparent; color: #9ca3af; }
  #paintSeg .qSegBtn:hover { color: #f9fafb; background: #374151; }
  #paintSeg .qSegBtn.on { background: #f59e0b; color: #1f2937; }
  #paintRow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  #paintCustom { width: 34px; height: 24px; padding: 0; border: 0; background: none; cursor: pointer; }
  #paintPanel .qNote { color: #9ca3af; margin-top: 8px; }
  /* The extract confirmation. Same reasoning as #paintPanel — it describes a
     specific set of boxes on the page, so it sits beside them rather than in
     the bar 600px away — but violet, matching LASSO_COLOR, and it is a
     CONFIRMATION: nothing has been written when it appears. */
  #lassoPanel {
    position: fixed; left: 0; top: 0; z-index: 2147483001;
    display: none; width: 250px; max-width: calc(100vw - 20px);
    padding: 10px; border-radius: 12px;
    background: #111827fa; box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    border: 1px solid #6d28d9; color: #f9fafb; font-size: 12px; line-height: 1.45;
    cursor: default; text-align: left; white-space: normal;
  }
  #lassoPanel.on { display: block; }
  #lassoPanel .qHead { font-weight: 600; margin-bottom: 7px; color: #c4b5fd; }
  #lassoList {
    margin-bottom: 8px; max-height: 108px; overflow-y: auto;
    color: #d1d5db; font-size: 11px;
  }
  #lassoList div { padding: 1px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #lassoName {
    width: 100%; box-sizing: border-box; padding: 5px 8px; margin-bottom: 6px;
    border-radius: 7px; border: 1px solid #4b5563; background: #1f2937;
    color: #f9fafb; font: inherit;
  }
  #lassoName:focus { outline: none; border-color: #8b5cf6; }
  #lassoActions { display: flex; gap: 6px; }
  #lassoActions button { flex: 1; padding: 5px 8px; border-radius: 999px; font-size: 11px; }
  #lassoGo { background: #7c3aed; color: #f9fafb; }
  #lassoGo:hover { background: #8b5cf6; }
  #lassoCancel { background: #374151; color: #d1d5db; }
  #lassoCancel:hover { background: #4b5563; }
  #lassoPanel .qNote { color: #9ca3af; margin-top: 8px; }
  /* The rule confirmation: the readings a drawn line could mean, one of which
     is about to be saved. Green-bordered, matching the marks on the page. */
  #rulePanel {
    position: fixed; left: 0; top: 0; z-index: 2147483001;
    display: none; width: 288px; max-width: calc(100vw - 20px);
    padding: 10px; border-radius: 12px;
    background: #111827fa; box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    border: 1px solid #047857; color: #f9fafb; font-size: 12px; line-height: 1.45;
    cursor: default; text-align: left; white-space: normal;
  }
  #rulePanel.on { display: block; }
  #rulePanel .qHead { font-weight: 600; margin-bottom: 7px; color: #6ee7b7; }
  #ruleList { margin-bottom: 8px; max-height: 190px; overflow-y: auto; }
  #ruleList button {
    display: block; width: 100%; text-align: left; margin: 0 0 4px; padding: 5px 7px;
    border-radius: 8px; border: 1px solid transparent; background: #1f2937;
    color: #e5e7eb; font: inherit; font-size: 11px; line-height: 1.35; cursor: pointer;
  }
  #ruleList button:hover { background: #374151; }
  #ruleList button[aria-checked='true'] { border-color: #10b981; background: #064e3b; }
  #ruleList .rKey { color: #6ee7b7; font-weight: 600; margin-right: 5px; }
  #ruleList .rRead { display: block; color: #9ca3af; }
  #ruleNote {
    width: 100%; box-sizing: border-box; padding: 5px 8px; margin-bottom: 6px;
    border-radius: 7px; border: 1px solid #4b5563; background: #1f2937;
    color: #f9fafb; font: inherit;
  }
  #ruleNote:focus { outline: none; border-color: #10b981; }
  #ruleActions { display: flex; gap: 6px; }
  #ruleActions button { flex: 1; padding: 5px 8px; border-radius: 999px; font-size: 11px; }
  #ruleGo { background: #047857; color: #f9fafb; }
  #ruleGo:hover { background: #10b981; }
  #ruleCancel { background: #374151; color: #d1d5db; }
  #ruleCancel:hover { background: #4b5563; }
  #rulePanel .qNote { color: #9ca3af; margin-top: 8px; }
  /* Everything being watched. Unlike the confirmation this is not anchored to
     anything on the page, so it sits with the toolbar. */
  #watchPanel {
    position: fixed; right: 12px; bottom: 12px; z-index: 2147483000;
    display: none; width: 300px; max-width: calc(100vw - 24px);
    padding: 10px; border-radius: 12px;
    background: #111827f2; box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    border: 1px solid #374151; color: #f9fafb; font-size: 12px; line-height: 1.45;
    text-align: left; white-space: normal;
  }
  #watchPanel.on { display: block; }
  #watchPanel .qHead { font-weight: 600; margin-bottom: 7px; color: #6ee7b7; }
  #watchList { max-height: 208px; overflow-y: auto; }
  #watchList .wRow {
    display: flex; gap: 6px; align-items: flex-start; padding: 4px 0;
    border-top: 1px solid #1f2937;
  }
  #watchList .wRow:first-child { border-top: 0; }
  #watchList .wText { flex: 1; font-size: 11px; }
  #watchList .wBroken { color: #fca5a5; }
  #watchList .wOk { color: #9ca3af; }
  #watchList .wNote { color: #d1d5db; font-style: italic; }
  #watchList button {
    flex: none; padding: 1px 6px; border-radius: 999px; background: #374151;
    color: #d1d5db; font-size: 11px; line-height: 1.5;
  }
  #watchList button:hover { background: #7f1d1d; color: #fee2e2; }
  #watchPanel .qNote { color: #9ca3af; margin-top: 8px; }
  /* Responsive demonstration is the one mode here that changes what a NORMAL
     gesture writes, so unlike every other toggle it has to be visible without
     being used — otherwise a drag lands at a breakpoint nobody remembered
     choosing. */
  #bandChip {
    background: #0e7490; color: #ecfeff; font-variant-numeric: tabular-nums;
    cursor: default;
  }
  #bandChip:hover { background: #0e7490; }
  /* The props panel: controls derived from the component's own TypeScript
     types. Beside the element for the same reason the paint popover is — it is
     about THAT component — and slate rather than a gesture colour, because
     nothing here is a gesture. */
  #propsPanel {
    position: fixed; left: 0; top: 0; z-index: 2147483001;
    display: none; width: 276px; max-width: calc(100vw - 20px);
    padding: 10px; border-radius: 12px;
    background: #111827fa; box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    border: 1px solid #475569; color: #f9fafb; font-size: 12px; line-height: 1.45;
    cursor: default; text-align: left; white-space: normal;
  }
  #propsPanel.on { display: block; }
  #propsPanel .qHead { font-weight: 600; margin-bottom: 2px; color: #cbd5e1; }
  #propsWhere {
    color: #94a3b8; font-size: 11px; margin-bottom: 8px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  #propsWhere select { width: 100%; margin-top: 4px; }
  #propsBody { max-height: 260px; overflow-y: auto; }
  #propsBody .pRow { display: flex; gap: 8px; align-items: center; padding: 3px 0; }
  #propsBody .pName { flex: 0 0 84px; color: #e5e7eb; font-size: 11px; }
  #propsBody .pName i { color: #64748b; font-style: normal; }
  #propsBody .pCtl { flex: 1; min-width: 0; }
  #propsBody input[type='text'], #propsBody input[type='number'], #propsBody select {
    width: 100%; box-sizing: border-box; padding: 3px 6px; border-radius: 6px;
    border: 1px solid #475569; background: #1f2937; color: #f9fafb; font: inherit; font-size: 11px;
  }
  #propsBody input:focus, #propsBody select:focus { outline: none; border-color: #94a3b8; }
  #propsBody input[type='checkbox'] { width: 14px; height: 14px; accent-color: #64748b; }
  #propsBody .pOff { color: #64748b; font-size: 11px; padding: 3px 0 5px; }
  #propsBody .pOff b { color: #94a3b8; font-weight: 600; }
  #propsNotes { color: #9ca3af; font-size: 11px; margin-top: 8px; }
  /* The timeline. Bottom-left, opposite the watch panel, and wide rather than
     tall: it is a strip of moments, and moments read left to right. */
  #timePanel {
    position: fixed; left: 12px; bottom: 12px; z-index: 2147483000;
    display: none; width: 420px; max-width: calc(100vw - 24px);
    padding: 10px; border-radius: 12px;
    background: #111827f2; box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    border: 1px solid #374151; color: #f9fafb; font-size: 12px; line-height: 1.45;
    text-align: left; white-space: normal;
  }
  #timePanel.on { display: block; }
  #timePanel .qHead { font-weight: 600; margin-bottom: 7px; color: #cbd5e1; }
  #timeStrip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
  #timeStrip .tCard {
    flex: 0 0 82px; padding: 3px; border-radius: 8px; border: 1px solid #374151;
    background: #0b1120; cursor: pointer; text-align: left;
  }
  #timeStrip .tCard:hover { border-color: #64748b; }
  #timeStrip .tCard[aria-pressed='true'] { border-color: #38bdf8; background: #0c4a6e; }
  #timeStrip .tCard img {
    display: block; width: 100%; height: 54px; object-fit: cover; object-position: top;
    border-radius: 5px; background: #1f2937;
  }
  #timeStrip .tCard .tNoShot {
    display: flex; align-items: center; justify-content: center; height: 54px;
    border-radius: 5px; background: #1f2937; color: #4b5563; font-size: 16px;
  }
  #timeStrip .tCard .tWhen { color: #94a3b8; font-size: 10px; margin-top: 3px; }
  #timeStrip .tCard .tWhat {
    color: #e5e7eb; font-size: 10px; line-height: 1.25; max-height: 25px; overflow: hidden;
  }
  /* The library. A grid rather than a strip: these are things to browse, not
     moments in an order, and the picture is the index. */
  #libPanel {
    position: fixed; right: 12px; top: 12px; z-index: 2147483000;
    display: none; width: 318px; max-width: calc(100vw - 24px);
    padding: 10px; border-radius: 12px;
    background: #111827f2; box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    border: 1px solid #374151; color: #f9fafb; font-size: 12px; line-height: 1.45;
    text-align: left; white-space: normal;
  }
  #libPanel.on { display: block; }
  #libPanel .qHead { font-weight: 600; margin-bottom: 7px; color: #cbd5e1; }
  #libGrid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
    max-height: 330px; overflow-y: auto;
  }
  #libGrid .lCard {
    position: relative; padding: 3px; border-radius: 8px; border: 1px solid #374151;
    background: #0b1120; cursor: pointer; text-align: left;
  }
  #libGrid .lCard:hover { border-color: #64748b; }
  #libGrid .lCard[aria-pressed='true'] { border-color: #a78bfa; background: #2e1065; }
  #libGrid .lCard img, #libGrid .lCard .lNoShot {
    display: block; width: 100%; height: 52px; border-radius: 5px; background: #1f2937;
    object-fit: cover; object-position: top;
  }
  #libGrid .lCard .lNoShot {
    display: flex; align-items: center; justify-content: center;
    color: #4b5563; font-size: 15px;
  }
  #libGrid .lCard .lName {
    color: #e5e7eb; font-size: 10px; margin-top: 3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  #libGrid .lCard .lMeta { color: #6b7280; font-size: 9px; }
  #libGrid .lCard .lGlobe { color: #a78bfa; }
  #libGrid .lDrop {
    position: absolute; top: 2px; right: 2px; padding: 0 4px; border-radius: 999px;
    background: #1f2937c0; color: #9ca3af; font-size: 10px; line-height: 1.5;
  }
  #libGrid .lDrop:hover { background: #7f1d1d; color: #fee2e2; }
  #libFoot { color: #9ca3af; font-size: 11px; margin-top: 8px; }
  #timeFoot { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
  #timeWhat { flex: 1; color: #9ca3af; font-size: 11px; min-width: 0; }
  #timeGo { flex: none; padding: 4px 10px; border-radius: 999px; background: #0369a1; color: #f0f9ff; font-size: 11px; }
  #timeGo:hover { background: #0284c7; }
  #timeGo:disabled { background: #374151; color: #6b7280; }
  #propsPanel .qNote { color: #9ca3af; margin-top: 8px; }
  /* confirmed and being applied — dimmed until the edit lands, then removed */
  #ink.applying { opacity: 0.22; }
  :host([data-mode='draw']) #canvas { pointer-events: auto; cursor: crosshair; }
  :host([data-mode='preview']) #canvas { pointer-events: auto; cursor: pointer; }
  :host([data-mode='tweak']) #canvas { pointer-events: auto; cursor: default; }
  #hud {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    z-index: 2147483001; display: flex; gap: 8px; align-items: center;
    background: #111827ee; color: #f9fafb; padding: 8px 12px;
    border-radius: 999px; box-shadow: 0 4px 24px rgb(0 0 0 / 0.25);
    font-size: 13px; user-select: none; cursor: grab;
    /* left:50% leaves shrink-to-fit only half the viewport to work with, so
       the bar would squeeze the status line even on a wide screen. Size to
       content and cap against the viewport instead — narrow windows still get
       the graceful ellipsis, wide ones get the whole hint. */
    width: max-content; max-width: calc(100vw - 24px);
  }
  /* Parked: the bar owns explicit left/top, so the centering transform MUST
     go — translateX(-50%) would shift every dragged position by half a bar —
     and bottom must stop fighting top. Set as a class so the default layout
     stays entirely in CSS (nothing to restore when the user never drags). */
  #hud.placed, #hudShow.placed { bottom: auto; transform: none; }
  /* display:none, not detach: the HUD keeps its listeners and el.click()
     still dispatches, so scripted/e2e clicks work on a hidden bar. */
  #hud.off { display: none; }
  #hudGrip { color: #6b7280; letter-spacing: -3px; font-size: 15px; padding: 0 2px; }
  /* Shown only while an editor is attached: an indicator for a thing that is
     not connected is just noise on a toolbar that is already full. */
  #ideDot { display: none; color: #34d399; font-size: 13px; padding: 0 2px; }
  #ideDot.on { display: inline; }
  #hud:active { cursor: grabbing; }
  button.icon { padding: 4px 9px; background: transparent; color: #9ca3af; }
  button.icon:hover { background: #374151; color: #f9fafb; }
  /* The restore affordance: a dot in the spot the bar was parked in, small
     enough to stay out of the way of whatever the user wanted to see. */
  #hudShow {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    z-index: 2147483001; display: none; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 999px; cursor: pointer;
    background: #111827cc; box-shadow: 0 2px 10px rgb(0 0 0 / 0.25);
    font-size: 12px; line-height: 1; user-select: none;
  }
  #hudShow.on { display: flex; }
  button {
    border: 0; border-radius: 999px; padding: 6px 12px; font-size: 13px;
    background: #374151; color: #f9fafb; cursor: pointer;
  }
  button:hover { background: #4b5563; }
  button.primary { background: #2563eb; }
  button.primary:hover { background: #1d4ed8; }
  button:disabled { opacity: 0.45; cursor: default; }
  #modes { display: flex; gap: 2px; background: #1f2937; border-radius: 999px; padding: 2px; }
  button.mode { padding: 4px 8px; background: transparent; }
  button.mode.on { background: #2563eb; }
  /* The ellipsis budget, and the second half of the bar's width budget: with a
     long message the status is ALL the slack there is, so this cap is what the
     bar's widest state is made of. It came down by exactly the width of the ⚡
     toggle, because the popovers are anchored to the bar's LEFT edge — a wider
     bar is a bar whose centred left edge slides further left, dragging an open
     panel across the viewport with it. Growing the pill is not a cosmetic
     choice; it moves other people's controls. */
  #status { max-width: 316px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #9ca3af; }
  #status.err { color: #f87171; }
  /* ---- auto mode -------------------------------------------------------
     A toggle that spends tokens and edits source with no click, so its state
     has to be readable at a glance: the word says it, the colour repeats it. */
  #autoBtn { display: flex; align-items: center; gap: 3px; padding: 5px 8px; }
  #autoBtn.on { background: #2563eb; }
  /* FIXED width, for the reason #fidelityNow documents one level up: the bar is
     width:max-content and centred with translateX(-50%), so a shrink-to-fit
     'on'/'off' would slide the WHOLE toolbar sideways every time it flipped.
     Sized for 'off', the wider of the two. */
  #autoState {
    display: inline-block; width: 18px; text-align: left;
    font-size: 11px; color: #d1d5db; letter-spacing: 0.2px;
  }
  #autoBtn.on #autoState { color: #eff6ff; }
  /* The countdown ticks ten times a second INSIDE the status line, and #status
     sizes the bar — an un-boxed number would slide the whole toolbar sideways
     on every tick, which is the one thing a "nothing moved, I promise" UI must
     not do. Fixed width sized for '0.9s' (the unit rides inside the slot, so
     the slack lands next to the separator rather than mid-number), tabular
     digits so even that width is never re-measured. */
  #autoCount {
    display: inline-block; width: 30px; text-align: left;
    font-variant-numeric: tabular-nums;
  }
  /* ---- fidelity control: one pill button + a popover ------------------
     The bar is a compact pill and has to stay one; five widgets inline
     would double its width. So the bar carries only the glyph plus the
     live "zone %" readout (so the user knows what will happen without
     opening anything) and everything else lives in the panel. */
  #fidelityBtn { display: flex; align-items: center; gap: 5px; padding: 5px 10px; }
  #fidelityBtn.on { background: #2563eb; }
  /* Fixed width for the same reason as #fidelityZone, one level up: the pill
     is width:max-content and centred with translateX(-50%), so a readout that
     grew from 'trace 100%' to 'reinterpret 34%' would slide the WHOLE toolbar
     sideways on every slider tick. Sized for the longest reachable string. */
  #fidelityNow {
    display: inline-block; width: 88px; text-align: left;
    font-size: 11px; color: #d1d5db; letter-spacing: 0.2px;
  }
  #fidelityBtn.on #fidelityNow { color: #eff6ff; }
  /* The fill choice, visible without opening anything. Fixed width for exactly
     the reason #fidelityNow is: its glyph changes with the selection, and a
     shrink-to-fit slot in a width:max-content bar centred by translateX(-50%)
     would slide the WHOLE toolbar sideways every time the user switched mode.
     A text symbol (not an emoji) so the 14px actually holds it on every font. */
  #fillNow {
    flex: none; width: 14px; text-align: center;
    font-size: 12px; line-height: 1; color: #d1d5db;
  }
  #fidelityBtn.on #fillNow { color: #eff6ff; }
  /* Absolutely positioned INSIDE #hud (which is position:fixed, so it's the
     containing block): the panel then drags, hides and stacks with the bar
     for free, and being out of flow it can't widen the pill. Only the left
     offset and the above/below flip are computed — see layoutFidelityPanel. */
  /* The panel grew a third section (attempts). Cap it against the viewport and
     scroll the overflow rather than letting the tallest section fall off the
     top of a short window — a control that can't be reached is worse than one
     that needs a scroll. No effect at all while it fits, which is the common
     case, so no box moves on a normal screen. */
  #fidelityPanel {
    position: absolute; left: 0; bottom: calc(100% + 10px);
    display: none; width: 300px; max-width: calc(100vw - 20px);
    max-height: calc(100vh - 32px); overflow-y: auto;
    background: #111827fa; color: #f9fafb;
    border: 1px solid #374151; border-radius: 12px;
    box-shadow: 0 10px 34px rgb(0 0 0 / 0.5);
    padding: 12px; font-size: 12px; line-height: 1.45;
    cursor: default; text-align: left; white-space: normal;
  }
  #fidelityPanel.on { display: block; }
  /* Near the top of the viewport there is no room above the bar. */
  #fidelityPanel.below { bottom: auto; top: calc(100% + 10px); }
  #fidelityPanel .fHead { color: #f9fafb; font-weight: 600; margin-bottom: 8px; }
  #fidelityPanel .fSlider { display: flex; align-items: center; gap: 9px; }
  /* accent-color is the whole dark-mode treatment for range + checkbox:
     no custom thumb to keep in sync with the native hit area. */
  #fidelityRange { flex: 1; min-width: 0; accent-color: #2563eb; height: 18px; margin: 0; }
  /* FIXED width, not shrink-to-fit: the zone name changes on every input
     event, and a label that resizes would resize the flex track next to it —
     re-mapping cursor position to value UNDER the thumb the user is dragging.
     Wide enough for the longest name ('reinterpret'). */
  #fidelityZone {
    flex: none; width: 100px; text-align: right;
    font-size: 12px; font-weight: 600; color: #93c5fd; white-space: nowrap;
  }
  #fidelityPanel .fHint { color: #9ca3af; margin: 4px 0 2px; min-height: 2.9em; }
  #fidelityPanel .fSect {
    color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
    margin: 10px 0 5px; border-top: 1px solid #1f2937; padding-top: 8px;
  }
  #fidelityPanel .fCheck { display: flex; align-items: center; gap: 7px; padding: 2px 0; cursor: pointer; color: #e5e7eb; }
  #fidelityPanel .fCheck input { accent-color: #2563eb; width: 13px; height: 13px; margin: 0; cursor: pointer; }
  #fidelityPanel .fCheck:hover { color: #f9fafb; }
  #fidelityPanel .fNote { color: #6b7280; font-size: 11px; margin-top: 6px; }
  #fidelityPanel .fSeg { display: flex; gap: 2px; background: #1f2937; border-radius: 999px; padding: 2px; }
  #fidelityPanel .fSegBtn {
    flex: 1; padding: 5px 8px; font-size: 11px; background: transparent; color: #9ca3af;
  }
  #fidelityPanel .fSegBtn:hover { color: #f9fafb; background: #374151; }
  #fidelityPanel .fSegBtn.on { background: #2563eb; color: #f9fafb; }
  /* The fill hint rewrites itself on every selection, so its height is FIXED
     rather than min-height: the panel is anchored to the bar's top edge and
     grows UPWARD, so a hint reflowing from two lines to one would jump the
     whole panel — and the segment buttons the user is clicking — several px
     up under the cursor. 2.9em = two lines at this font-size/line-height, and
     the longest of the three strings fits in two at the panel's 300px. */
  #fidelityPanel .fFillHint {
    color: #9ca3af; height: 2.9em; margin: 5px 0 0; overflow: hidden;
  }
  /* Same fixed-height contract as .fFillHint, and for the same reason: this
     hint rewrites itself on every attempts click, and the panel grows upward
     from the bar — a hint reflowing from three lines to two would yank the
     segment out from under the cursor. 4.35em = three lines here, which the
     longest of the three strings needs at the panel's 300px. */
  #fidelityPanel .fCandHint {
    color: #9ca3af; height: 4.35em; margin: 5px 0 0; overflow: hidden;
  }
  /* ---- the style axis: six looks, one row ------------------------------
     Six options, where the segments above have two and three. Six pills do not
     stay legible across the panel's 300px, and the 3x2 grid of buttons that
     would (a section heading, two rows and a hint) costs ~100px of height this
     panel does not own: it is already 768px tall, it must NOT scroll (the
     e2e-guarded promise is that nothing in it moves, and a scrolled popover
     hides controls instead), and past ~827px it stops fitting either above or
     below a bar parked in a top corner — at which point layoutFidelityPanel
     leaves it hanging off the screen. A <select> says the same thing in ONE
     row: its popup is an OS window that costs no layout at all, the closed box
     always reads as the current choice, and it cannot widen the panel. */
  #fidelityPanel .fPick { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  #fidelityPanel .fPickLabel { flex: none; color: #9ca3af; }
  /* flex:1 + min-width:0, so the box is the same width for every option: the
     selected label is the text that changes here, and a shrink-to-fit control
     would move its own neighbours every time the user picked something. */
  #styleSel {
    flex: 1; min-width: 0; height: 22px;
    background: #1f2937; color: #f9fafb; border: 1px solid #374151; border-radius: 7px;
    font-family: inherit; font-size: 11px; padding: 0 4px; cursor: pointer;
  }
  #styleSel:hover { background: #374151; }
  /* The .fFillHint contract taken one step further. This hint rewrites itself
     on every pick and sits one row UNDER the control being clicked, in a panel
     anchored to the bar's top edge — so a string reflowing to a second line
     would jump the picker out from under the cursor. Fixed height AND nowrap,
     with an ellipsis rather than a half-clipped word if copy ever outgrows the
     box (the e2e asserts no ellipsis ever actually shows). */
  #fidelityPanel .fStyleHint {
    color: #9ca3af; font-size: 11px; height: 16px; line-height: 16px;
    margin: 4px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  /* ---- typed notes ----------------------------------------------------
     Exactly the trick #ink uses: ONE absolutely positioned layer pinned at
     the document origin, so chips and the editor are laid out in PAGE
     coordinates and the compositor carries them with the content. No scroll
     listener anywhere — a chip that drifts off its anchor when the page
     scrolls is a bug, not a rounding error. */
  #notes {
    position: absolute; left: 0; top: 0; width: 100%; height: 100%;
    overflow: visible; pointer-events: none; z-index: 2147483000;
  }
  .noteChip {
    position: absolute; pointer-events: auto;
    display: flex; align-items: center; gap: 6px;
    max-width: 260px; padding: 3px 4px 3px 10px; border-radius: 999px;
    background: #1d4ed8; color: #eff6ff; font-size: 11px; line-height: 1.6;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.35); cursor: pointer;
  }
  .noteChip:hover { background: #2563eb; }
  .noteChip .noteText { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .noteChip .noteDel {
    flex: none; width: 17px; height: 17px; padding: 0; border-radius: 999px;
    background: #1e3a8a; color: #bfdbfe; font-size: 11px; line-height: 1;
  }
  .noteChip .noteDel:hover { background: #ef4444; color: #fff; }
  /* The editor: what it will attach to, then the field — opened AT the
     pointer rather than as a modal, so the user types where they're looking. */
  #noteBox {
    position: absolute; pointer-events: auto; display: none;
    flex-direction: column; gap: 4px; width: 320px; max-width: calc(100vw - 24px);
  }
  #noteBox.on { display: flex; }
  #noteWhat {
    align-self: flex-start; padding: 2px 9px; border-radius: 999px;
    background: #0f172aee; color: #93c5fd;
    font-size: 10px; letter-spacing: 0.4px; text-transform: uppercase;
  }
  #noteInput {
    width: 100%; padding: 8px 11px; border-radius: 10px;
    border: 1px solid #3b82f6; background: #0f172afa; color: #f9fafb;
    font-size: 13px; outline: none; box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
  }
  #noteInput::placeholder { color: #64748b; }
  /* The subject, outlined while the field is open: the ONLY way the user can
     tell whether the note landed on the element, the strokes, or the run. */
  #noteHi {
    position: absolute; display: none; pointer-events: none;
    border: 2px solid #38bdf8; border-radius: 6px; background: rgb(56 189 248 / 0.12);
  }
  #noteHi.on { display: block; }
  /* ---- the plan overlay -----------------------------------------------
     Third user of the page-space trick (#ink, #notes, now this): one
     absolutely positioned layer at the document origin, so every outline and
     every label is laid out in PAGE coordinates and the compositor carries
     them with the content. Zero scroll handlers, and browser/pinch zoom
     scales the plan exactly like the elements it is describing.
     pointer-events:none throughout — the canvas underneath still has to
     receive the per-shape correction tap. */
  #plan {
    position: absolute; left: 0; top: 0; width: 100%; height: 100%;
    overflow: visible; pointer-events: none; z-index: 2147483000;
    display: none;
  }
  #plan.on { display: block; }
  /* Non-zero width/height is load-bearing: a 0×0 <svg> is not rendered at all
     (SVG 1.1 §5.1.2) while its children keep reporting perfect geometry. */
  #planSvg {
    position: absolute; left: 0; top: 0; width: 100%; height: 100%;
    overflow: visible; pointer-events: none;
  }
  #planSvg .pOutline { fill: none; stroke-width: 2.5; }
  #planSvg .pOutline.wide { stroke-width: 4; }
  #planSvg .pRegion { fill: none; stroke-width: 2.5; stroke-dasharray: 9 6; }
  #planSvg .pLink { stroke-width: 2.5; stroke-dasharray: 7 5; }
  #planSvg .pHead { stroke: none; }
  .planLabel {
    position: absolute; pointer-events: none; max-width: 280px;
    padding: 4px 8px 5px; border-radius: 8px;
    border-left: 3px solid var(--k, #4b5563);
    background: #0b1220f2; color: #f3f4f6;
    font-size: 11px; line-height: 1.45; text-align: left;
    box-shadow: 0 3px 14px rgb(0 0 0 / 0.45);
  }
  .planLabel .pRow { display: flex; align-items: center; gap: 6px; }
  .planLabel .pKind {
    flex: none; padding: 0 6px; border-radius: 999px;
    background: var(--k, #4b5563); color: #fff;
    font-size: 10px; font-weight: 700; letter-spacing: 0.6px;
  }
  .planLabel .pWhat {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px;
    color: #e5e7eb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .planLabel .pInstr { color: #9ca3af; margin-top: 2px; }
  /* The swatch shows the RESOLVED colour, so it must paint the real value —
     a border rather than a background would be a picture of a colour. */
  .planLabel .pSwatch {
    flex: none; width: 12px; height: 12px; border-radius: 3px;
    border: 1px solid #ffffff55;
  }
  .planLabel .pToken {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px;
    color: #a5b4fc;
  }
  /* The user's own words: loudest thing on the label, never truncated, never
     ellipsised — the whole point of a typed note is that it is exact. */
  .planLabel .pNote {
    margin-top: 3px; padding: 2px 7px; border-radius: 6px;
    background: #1d4ed8; color: #eff6ff;
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  /* ---- keyboard help --------------------------------------------------
     Rendered from the keymap table, so it can never fall behind it. The
     status line holds one hint; this holds all of them. */
  #help {
    position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
    z-index: 2147483002; display: none;
    width: 560px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px);
    overflow: auto; background: #111827fa; color: #f9fafb;
    border: 1px solid #374151; border-radius: 14px;
    box-shadow: 0 18px 50px rgb(0 0 0 / 0.55);
    padding: 16px 18px; font-size: 12px; line-height: 1.5; text-align: left;
  }
  #help.on { display: block; }
  #help .hHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  #help .hTitle { font-size: 14px; font-weight: 600; }
  #help .hGroup {
    color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
    margin: 12px 0 4px; border-top: 1px solid #1f2937; padding-top: 8px;
  }
  #help .hRow { display: flex; align-items: baseline; gap: 12px; padding: 2px 0; }
  #help .hKeys {
    flex: none; width: 104px; text-align: right; color: #93c5fd;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
  }
  #help .hLabel { color: #e5e7eb; }
  #help .hFoot { color: #6b7280; margin-top: 12px; border-top: 1px solid #1f2937; padding-top: 8px; }
`

class Overlay {
  private host: HTMLElement
  private shadow: ShadowRoot
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private ink: SVGSVGElement
  private scaleProbe: HTMLElement
  private livePath: SVGPathElement | null = null
  private statusEl: HTMLElement
  private drawBtn: HTMLButtonElement
  private runBtn: HTMLButtonElement
  private confirmBtn: HTMLButtonElement
  private cancelBtn: HTMLButtonElement
  private undoBtn: HTMLButtonElement
  private clearBtn: HTMLButtonElement
  private hud: HTMLElement
  /** Compact restore dot shown wherever the bar was parked while it's hidden. */
  private hudShow: HTMLElement
  /** null = still in the default centered-bottom slot, i.e. CSS owns placement. */
  private hudPos: { x: number; y: number } | null = null
  private hudHidden = false
  /** Fidelity popover + its state. The settings object is the single source
   *  of truth: the controls render FROM it and the request bodies read it. */
  private penBtn: HTMLButtonElement
  private penPanel: HTMLElement
  private penDot: HTMLElement
  private penRow: HTMLElement
  /** CSS colour the pen writes in; null = default ink, which asks for nothing. */
  private pen: string | null = null
  private penOpen = false
  /** Shape-paint popover: anchored to the selected shape, not to the bar. */
  private paintPanel: HTMLElement
  private paintWhat: HTMLElement
  private paintRow: HTMLElement
  private paintOpen = false
  /** Which attribute the next swatch click writes. */
  private paintProp: 'fill' | 'stroke' = 'fill'
  /** The extract confirmation, anchored to the lasso the same way. */
  private lassoPanel: HTMLElement
  private lassoWhat: HTMLElement
  private lassoList: HTMLElement
  private lassoName: HTMLInputElement
  /** The lasso in flight: being drawn, or drawn and awaiting confirmation. */
  private lasso: LassoState | null = null
  /** Alt+L armed the NEXT drag as a lasso, for anyone not holding Alt. */
  private lassoArmed = false
  /** The rule confirmation, and the panel listing everything being watched. */
  private rulePanel: HTMLElement
  private ruleWhat: HTMLElement
  private ruleList: HTMLElement
  private ruleNote: HTMLInputElement
  private watchPanel: HTMLElement
  private watchList: HTMLElement
  private watchHead: HTMLElement
  /** The rule line being drawn, or drawn and awaiting a choice. */
  private ruleDraw: RuleDraw | null = null
  /** Alt+Shift+R armed the next drag as a rule line. */
  private ruleArmed = false
  /** Every saved rule, as of the last check against the page. */
  private rules: RuleView[] = []
  /** Whether rules that HOLD are drawn. A broken one always is. */
  private watching = false
  private ruleCheckTimer: ReturnType<typeof setTimeout> | null = null
  /** The element library: entries, the one armed for placing, and the panel. */
  private libPanel: HTMLElement
  private libHead: HTMLElement
  private libGrid: HTMLElement
  private libFoot: HTMLElement
  private libOpen = false
  private entries: LibEntry[] = []
  /** The entry the next click on the page will place. */
  private libArmed: LibEntry | null = null
  /** True while the panel is showing matches for the current ink. */
  private libSearching = false
  private libSearchTimer: ReturnType<typeof setTimeout> | null = null
  /** The timeline: entries as the server holds them, and which one is picked. */
  private timePanel: HTMLElement
  private timeHead: HTMLElement
  private timeStrip: HTMLElement
  private timeWhat: HTMLElement
  private timeGo: HTMLButtonElement
  private timeOpen = false
  private versions: HistoryVersion[] = []
  private timePick: string | null = null
  /** Responsive demonstration: while on, edits land at the current width's band. */
  private responsive = false
  private bandChip: HTMLButtonElement
  private screens: { screens: Record<string, number>; source: string } | null = null
  /** The props panel: controls derived from the selected component's types. */
  private propsPanel: HTMLElement
  private propsHead: HTMLElement
  private propsWhere: HTMLElement
  private propsBody: HTMLElement
  private propsNotes: HTMLElement
  private propsOpen = false
  private propsData: PropsRead | null = null
  /** Which call site the controls write to, when a component is used more than once. */
  private propsSite = 0
  /** The value drag in flight, and whether the next drag is one. */
  private dataDrag: DataDrag | null = null
  private dataArmed = false
  /** Cached shape list for geometric hit-testing (see SHAPE_CACHE_MS). */
  private shapeCache: { at: number; els: SVGGeometryElement[] } | null = null
  private fidelityBtn: HTMLButtonElement
  private fidelityPanel: HTMLElement
  private fidelityRange: HTMLInputElement
  /** The style axis' picker. Options are generated from STYLE_LABELS. */
  private styleSel: HTMLSelectElement
  private keepBoxes = {} as Record<keyof FidelityKeep, HTMLInputElement>
  private fidelityOpen = false
  private fidelity: Fidelity = defaultFidelity()
  /** The auto-mode toggle and everything the settle timer needs.
   *  OFF is the only safe default — see restoreAuto. */
  private autoBtn: HTMLButtonElement
  private auto = false
  /** The settle timer, and the moment it is counting down to (performance.now
   *  ms). Non-null timer == a run is pending, which is what Esc cancels. */
  private autoTimer: ReturnType<typeof setInterval> | null = null
  private autoDeadline = 0
  /** The single-run lock: one auto-run at a time, start to finish. The mode
   *  alone isn't enough — interpret and run are two awaits with a gap. */
  private autoBusy = false
  /** Page-space layer holding the plan outlines and their labels. */
  private planLayer: HTMLElement
  private planSvg: SVGSVGElement
  /** How many independent codegen attempts one ✓ Go should pay for. */
  private candidates: Candidates = DEFAULT_CANDIDATES
  /** Page-space layer holding the note chips, the editor and the highlight. */
  private notesLayer: HTMLElement
  private noteBox: HTMLElement
  private noteWhat: HTMLElement
  private noteInput: HTMLInputElement
  private noteHi: HTMLElement
  /** Open editor: null id = a new note, else the note being re-edited. */
  private noteDraft: { id: string | null; at: { x: number; y: number }; anchor: NoteAnchor } | null = null
  private notes: Note[] = []
  private noteSeq = 0
  /** Last pointer position in CLIENT coords — where Alt+N resolves against.
   *  null until the pointer has moved at all (fresh tab, keyboard-only). */
  private pointer: { x: number; y: number } | null = null
  /** The keymap, and the overlay rendered from it. */
  private binds: KeyBind[] = []
  private helpEl: HTMLElement
  private helpOpen = false
  /** Live bar drag: origin is the bar's top-left at pointerdown, in client px. */
  private hudDrag: { pointerId: number; startX: number; startY: number; originX: number; originY: number } | null = null

  private mode: Mode = 'idle'
  private runMode: 'gesture' | 'design' | 'screenshot' = 'gesture'
  private tweak: TweakState | null = null
  /** hovered stamped element (rect read live at draw — it must track) */
  private hoverEl: HTMLElement | null = null
  /** last still-click on the selected element — double-click scope toggle */
  private lastTweakClick: { el: HTMLElement; at: number } | null = null
  /** shift+click multi-selection: extras beyond the primary (this.tweak) */
  private multiSel: ExtraSel[] = []
  /** Component written by the instant render, if one landed this run. */
  private instant: string | null = null
  /** An editor is attached to the dev server (pushed over the SSE hub). */
  private ideEditor: string | null = null
  /** Where the editor's cursor is, painted briefly so it can be seen. */
  private ideHighlight: { rect: { x: number; y: number; w: number; h: number }; until: number } | null = null
  private strokes: Stroke[] = []
  private preview: PreviewData | null = null
  private v2: V2Preview | null = null
  private overrides: Record<string, string> = {}
  private chipBoxes: Array<{ x: number; y: number; w: number; h: number; shapeId: string }> = []
  private live: Stroke | null = null
  private strokeSeq = 0
  private events: EventSource | null = null
  /** End point of the last committed stroke, for trackpad-hop bridging —
   *  null whenever there's nothing eligible to continue. */
  private lastStrokeEnd: Pt | null = null
  /** Whether that stroke was gesture-sized (bbox diagonal ≥ BRIDGE_MIN_SPAN),
   *  i.e. an actual bridge candidate rather than a stray letter stroke. */
  private lastStrokeBig = false

  constructor() {
    this.host = document.createElement('div')
    this.host.id = HOST_ID
    this.shadow = this.host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = STYLES
    this.shadow.appendChild(style)

    this.scaleProbe = document.createElement('i')
    this.scaleProbe.id = 'scaleProbe'
    this.shadow.appendChild(this.scaleProbe)

    this.ink = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.ink.id = 'ink'
    this.shadow.appendChild(this.ink)

    this.canvas = document.createElement('canvas')
    this.canvas.id = 'canvas'
    this.shadow.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!

    // AFTER the canvas so DOM order paints the plan on top of it, but BEFORE
    // the notes layer so a chip the user can click is never buried under a
    // label they can't. The layer itself never takes pointer events — the
    // canvas below it still has to receive the per-shape correction tap.
    this.planLayer = document.createElement('div')
    this.planLayer.id = 'plan'
    this.planSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.planSvg.id = 'planSvg'
    this.planLayer.appendChild(this.planSvg)
    this.shadow.appendChild(this.planLayer)

    // AFTER the canvas: same stacking level, so DOM order is what puts chips
    // and the editor above it — in draw mode the canvas is pointer-events:auto
    // across the whole viewport and would otherwise swallow every chip click.
    this.notesLayer = document.createElement('div')
    this.notesLayer.id = 'notes'
    this.notesLayer.innerHTML = `
      <div id="noteHi"></div>
      <div id="noteBox">
        <span id="noteWhat"></span>
        <input id="noteInput" type="text" autocomplete="off" spellcheck="false"
               placeholder="what should happen here? (Enter to attach · Esc to cancel)">
      </div>
    `
    this.shadow.appendChild(this.notesLayer)
    this.noteBox = this.shadow.getElementById('noteBox')!
    this.noteWhat = this.shadow.getElementById('noteWhat')!
    this.noteInput = this.shadow.getElementById('noteInput') as HTMLInputElement
    this.noteHi = this.shadow.getElementById('noteHi')!

    const hud = document.createElement('div')
    hud.id = 'hud'
    hud.innerHTML = `
      <span id="hudGrip" title="drag to move this toolbar">⋮⋮</span>
      <button id="draw" class="primary">✏️ Draw</button>
      <span id="modes" title="gesture: mark up existing UI · design: sketch new UI · screenshot: pixels-only benchmark">
        <button id="mode-gesture" class="mode on" title="gesture commands">✏️</button>
        <button id="mode-design" class="mode" title="design sketch">🎨</button>
        <button id="mode-screenshot" class="mode" title="screenshot benchmark">📸</button>
      </span>
      <button id="tweakBtn" title="tweak: click a container, drag its gaps and padding — zero tokens">🔧</button>
      <button id="penBtn" aria-haspopup="dialog" aria-expanded="false" title="pen colour (Alt+P) — what you draw in is what it becomes"><span id="penDot"></span></button>
      <button id="fidelityBtn" aria-haspopup="dialog" aria-expanded="false">🎚<span id="fidelityNow"></span><span id="fillNow"></span></button>
      <button id="autoBtn" aria-pressed="false">⚡<span id="autoState"></span></button>
      <button id="run" disabled>▶ Run</button>
      <button id="confirm" class="primary" style="display:none">✓ Go</button>
      <button id="cancel" style="display:none">✗ Cancel</button>
      <button id="bandChip" style="display:none" title="responsive demonstration is on (Alt+M)"></button>
      <button id="undo" disabled>↩</button>
      <button id="clear" disabled>✕</button>
      <!-- the bar is width:max-content, so this string sizes the whole HUD: it
           is the bar's width BUDGET, not a sentence. The ⚡ toggle beside
           ▶ Run was paid for out of it — 'sketch2code · ' went, because a new
           control has to come from here or the pill stops being a pill, and a
           name the user already knows buys less than a key they don't. ?
           carries the rest, which is the whole reason ? exists. -->
      <span id="status">Alt+D draw · ? all keys</span>
      <span id="ideDot" title="an editor is connected — click an element to reveal it there (Alt+J)">⌁</span>
      <button id="hudHide" class="icon" title="hide the toolbar (Alt+H)">–</button>
      <div id="penPanel" role="dialog" aria-label="pen colour">
        <div class="pHead">Draw in a colour to ask for it</div>
        <div id="penRow"></div>
        <div class="pNote">
          The colour you draw in becomes the instruction, and it snaps to the nearest
          colour this app already uses. Swatches are sampled from the page.
          <br>Alt+I picks up the colour under the pointer.
        </div>
      </div>
      <div id="fidelityPanel" role="dialog" aria-label="drawing fidelity">
        <div class="fHead">How much should the result look like your drawing?</div>
        <div class="fSlider">
          <input id="fidelityRange" type="range" min="0" max="100" step="1" value="50"
                 aria-label="resemblance to the drawing">
          <span id="fidelityZone"></span>
        </div>
        <div id="fidelityHint" class="fHint"></div>
        <div class="fSect">keep from the drawing</div>
        <div id="fidelityKeep"></div>
        <div class="fNote">
          Unchecked = that aspect is free to be normalized, and is no longer scored when the
          result is verified against your drawing.
        </div>
        <div class="fSect">look</div>
        <div class="fSeg">
          <button id="palette-app" class="fSegBtn"
                  title="snap colour, stroke weight and spacing to the app's design system">app design system</button>
          <button id="palette-sketch" class="fSegBtn"
                  title="keep the drawing's own hand-drawn look — its colours, wobble and weight">hand-drawn</button>
        </div>
        <div class="fPick">
          <span class="fPickLabel">style</span>
          <select id="styleSel" aria-label="visual style"
                  title="the look the result is rendered in — Alt+Y cycles, Alt+Shift+Y goes back"></select>
        </div>
        <div id="styleHint" class="fStyleHint"></div>
        <div class="fSect">result</div>
        <div id="fillSeg" class="fSeg"></div>
        <div id="fillHint" class="fFillHint"></div>
        <div class="fNote">
          The dial above says how closely your geometry is followed. This says what comes
          back: line art, or a finished thing.
        </div>
        <div class="fSect">attempts</div>
        <div id="candSeg" class="fSeg"></div>
        <div id="candHint" class="fCandHint"></div>
        <div class="fNote">
          Each attempt is a full, independent generation from the same confirmed reading,
          measured against your drawing. Only the best-scoring one is kept — the rest are
          discarded, and you pay for them anyway. More attempts = better odds of a faithful
          result, proportionally more tokens and more waiting.
          <br>Alt+8 and Alt+9 change this from the keyboard.
        </div>
      </div>
    `
    this.shadow.appendChild(hud)
    this.hud = hud
    this.hudShow = document.createElement('div')
    this.hudShow.id = 'hudShow'
    this.hudShow.title = 'show the sketch2code toolbar (Alt+H)'
    this.hudShow.textContent = '✏️'
    this.shadow.appendChild(this.hudShow)
    this.helpEl = document.createElement('div')
    this.helpEl.id = 'help'
    this.helpEl.setAttribute('role', 'dialog')
    this.helpEl.setAttribute('aria-label', 'sketch2code keyboard shortcuts')
    this.shadow.appendChild(this.helpEl)
    // OUTSIDE the HUD, on purpose: the bar is a width:max-content pill whose
    // own comment calls its status line a width budget, and this popover
    // belongs beside the shape it paints anyway (see #paintPanel).
    const paint = document.createElement('div')
    paint.id = 'paintPanel'
    paint.setAttribute('role', 'dialog')
    paint.setAttribute('aria-label', 'paint this shape')
    paint.innerHTML = `
      <div class="qHead" id="paintWhat"></div>
      <div id="paintSeg">
        <button id="paint-fill" class="qSegBtn" title="the next colour fills the shape">fill</button>
        <button id="paint-stroke" class="qSegBtn" title="the next colour paints its outline">stroke</button>
      </div>
      <div id="paintRow"></div>
      <div class="qNote">
        Swatches are sampled from the page. A click writes the colour into source —
        Ctrl+Z reverts it. Alt+K reopens this, Esc closes it.
      </div>
    `
    this.shadow.appendChild(paint)
    this.paintPanel = paint
    this.paintWhat = this.shadow.getElementById('paintWhat')!
    this.paintRow = this.shadow.getElementById('paintRow')!
    for (const p of ['fill', 'stroke'] as const) {
      this.shadow.getElementById(`paint-${p}`)!.addEventListener('click', () => this.setPaintProp(p))
    }
    // The panel sits over the tweak-mode hit canvas; a press inside it is a
    // press on a control, never the start of a selection or a drag.
    paint.addEventListener('pointerdown', (e) => e.stopPropagation())

    // The extract confirmation. Beside the lasso for the same reason the paint
    // popover is beside its shape: it is about THESE boxes, and it has to be
    // read next to them. Nothing is written until its button is pressed.
    const lasso = document.createElement('div')
    lasso.id = 'lassoPanel'
    lasso.setAttribute('role', 'dialog')
    lasso.setAttribute('aria-label', 'extract a component')
    lasso.innerHTML = `
      <div class="qHead" id="lassoWhat"></div>
      <div id="lassoList"></div>
      <input id="lassoName" type="text" autocomplete="off" spellcheck="false"
             aria-label="component name" placeholder="Component name">
      <div id="lassoActions">
        <button id="lassoGo" title="move these elements into their own file">extract</button>
        <button id="lassoCancel" title="write nothing (Esc)">cancel</button>
      </div>
      <div class="qNote">
        These siblings move into a new file; a call site stays behind, and whatever
        they needed from the surrounding scope is threaded through as props.
        Enter extracts · Esc cancels.
      </div>
    `
    this.shadow.appendChild(lasso)
    this.lassoPanel = lasso
    this.lassoWhat = this.shadow.getElementById('lassoWhat')!
    this.lassoList = this.shadow.getElementById('lassoList')!
    this.lassoName = this.shadow.getElementById('lassoName') as HTMLInputElement
    this.shadow.getElementById('lassoGo')!.addEventListener('click', () => void this.commitExtract())
    this.shadow.getElementById('lassoCancel')!.addEventListener('click', () =>
      this.cancelLasso('extract cancelled — nothing written'))
    lasso.addEventListener('pointerdown', (e) => e.stopPropagation())
    // Same contract as the note field: the name belongs to this input, not to
    // the overlay's keymap (Alt-less letters are free, but Escape and Enter
    // are not) and not to the host app.
    this.lassoName.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        void this.commitExtract()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.cancelLasso('extract cancelled — nothing written')
      }
    })
    this.lassoName.addEventListener('keyup', (e) => e.stopPropagation())
    this.lassoName.addEventListener('keypress', (e) => e.stopPropagation())

    // The rule confirmation. A drawn line is unambiguous about WHICH elements
    // and which axis, and ambiguous about the rule — down two left edges could
    // mean aligned-left or same-width. So every reading the geometry allows is
    // listed, each with what the page says right now, and one is chosen.
    const rule = document.createElement('div')
    rule.id = 'rulePanel'
    rule.setAttribute('role', 'dialog')
    rule.setAttribute('aria-label', 'what should this rule say')
    rule.innerHTML = `
      <div class="qHead" id="ruleWhat"></div>
      <div id="ruleList" role="radiogroup" aria-label="readings"></div>
      <input id="ruleNote" type="text" autocomplete="off" spellcheck="false"
             aria-label="why this rule exists" placeholder="why (optional)">
      <div id="ruleActions">
        <button id="ruleGo" title="watch this from now on">watch it</button>
        <button id="ruleCancel" title="save nothing (Esc)">cancel</button>
      </div>
      <div class="qNote">
        1–5 picks a reading · Enter saves it · Esc cancels. From then on it is
        checked against the live page — on every edit, and on every run.
      </div>
    `
    this.shadow.appendChild(rule)
    this.rulePanel = rule
    this.ruleWhat = this.shadow.getElementById('ruleWhat')!
    this.ruleList = this.shadow.getElementById('ruleList')!
    this.ruleNote = this.shadow.getElementById('ruleNote') as HTMLInputElement
    this.shadow.getElementById('ruleGo')!.addEventListener('click', () => void this.commitRule())
    this.shadow.getElementById('ruleCancel')!.addEventListener('click', () =>
      this.cancelRule('rule cancelled — nothing saved'))
    rule.addEventListener('pointerdown', (e) => e.stopPropagation())
    this.ruleNote.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        void this.commitRule()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.cancelRule('rule cancelled — nothing saved')
      } else if (/^[1-9]$/.test(e.key)) {
        // the number keys keep working while the note has focus: picking a
        // reading and explaining it are one thought
        e.preventDefault()
        this.pickReading(Number(e.key) - 1)
      }
    })
    this.ruleNote.addEventListener('keyup', (e) => e.stopPropagation())
    this.ruleNote.addEventListener('keypress', (e) => e.stopPropagation())

    // Everything being watched. Not anchored to the page: it is a list, and
    // the rules in it are about elements all over the document.
    const watch = document.createElement('div')
    watch.id = 'watchPanel'
    watch.setAttribute('role', 'dialog')
    watch.setAttribute('aria-label', 'rules being watched')
    watch.innerHTML = `
      <div class="qHead" id="watchHead">watching</div>
      <div id="watchList"></div>
      <div class="qNote">
        Alt+Shift+R draws another · Alt+W hides this. A broken rule shows on the
        page whether this is open or not.
      </div>
    `
    this.shadow.appendChild(watch)
    this.watchPanel = watch
    this.watchList = this.shadow.getElementById('watchList')!
    this.watchHead = this.shadow.getElementById('watchHead')!
    watch.addEventListener('pointerdown', (e) => e.stopPropagation())

    // The props panel. Its contents are built entirely from what the server
    // read out of the component's types, so there is nothing to declare here
    // but the frame.
    const props = document.createElement('div')
    props.id = 'propsPanel'
    props.setAttribute('role', 'dialog')
    props.setAttribute('aria-label', 'component props')
    props.innerHTML = `
      <div class="qHead" id="propsHead"></div>
      <div id="propsWhere"></div>
      <div id="propsBody"></div>
      <div id="propsNotes"></div>
      <div class="qNote">
        Read from this component's TypeScript types · every change is a real
        edit at the call site · 0 tokens · Ctrl+Z undoes it.
      </div>
    `
    this.shadow.appendChild(props)
    this.propsPanel = props
    this.propsHead = this.shadow.getElementById('propsHead')!
    this.propsWhere = this.shadow.getElementById('propsWhere')!
    this.propsBody = this.shadow.getElementById('propsBody')!
    this.propsNotes = this.shadow.getElementById('propsNotes')!
    props.addEventListener('pointerdown', (e) => e.stopPropagation())
    // the controls own their keys: typing a title must not fire the overlay's
    // single-letter bindings, and Escape belongs to the field being edited
    for (const ev of ['keydown', 'keyup', 'keypress']) {
      props.addEventListener(ev, (e) => e.stopPropagation())
    }

    // The library. Cards are built from what the server holds; the frame is all
    // there is to declare.
    const lib = document.createElement('div')
    lib.id = 'libPanel'
    lib.setAttribute('role', 'dialog')
    lib.setAttribute('aria-label', 'element library')
    lib.innerHTML = `
      <div class="qHead" id="libHead">library</div>
      <div id="libGrid"></div>
      <div id="libFoot">draw something to search by shape</div>
    `
    this.shadow.appendChild(lib)
    this.libPanel = lib
    this.libHead = this.shadow.getElementById('libHead')!
    this.libGrid = this.shadow.getElementById('libGrid')!
    this.libFoot = this.shadow.getElementById('libFoot')!
    lib.addEventListener('pointerdown', (e) => e.stopPropagation())

    // The timeline. Its cards are built from what the server holds, so there is
    // nothing to declare here but the frame and the one button that writes.
    const time = document.createElement('div')
    time.id = 'timePanel'
    time.setAttribute('role', 'dialog')
    time.setAttribute('aria-label', 'visual history')
    time.innerHTML = `
      <div class="qHead" id="timeHead">history</div>
      <div id="timeStrip"></div>
      <div id="timeFoot">
        <div id="timeWhat">pick a moment to see what it changed</div>
        <button id="timeGo" disabled>put this back</button>
      </div>
    `
    this.shadow.appendChild(time)
    this.timePanel = time
    this.timeHead = this.shadow.getElementById('timeHead')!
    this.timeStrip = this.shadow.getElementById('timeStrip')!
    this.timeWhat = this.shadow.getElementById('timeWhat')!
    this.timeGo = this.shadow.getElementById('timeGo') as HTMLButtonElement
    // two deliberate steps to rewrite files: picking a card only describes it,
    // and a stray click on a 82px thumbnail must not rewrite someone's project
    this.timeGo.addEventListener('click', () => void this.restoreVersion())
    time.addEventListener('pointerdown', (e) => e.stopPropagation())

    this.statusEl = this.shadow.getElementById('status')!
    this.drawBtn = this.shadow.getElementById('draw') as HTMLButtonElement
    this.runBtn = this.shadow.getElementById('run') as HTMLButtonElement
    this.confirmBtn = this.shadow.getElementById('confirm') as HTMLButtonElement
    this.cancelBtn = this.shadow.getElementById('cancel') as HTMLButtonElement
    this.undoBtn = this.shadow.getElementById('undo') as HTMLButtonElement
    this.clearBtn = this.shadow.getElementById('clear') as HTMLButtonElement
    this.penBtn = this.shadow.getElementById('penBtn') as HTMLButtonElement
    this.penPanel = this.shadow.getElementById('penPanel')!
    this.penDot = this.shadow.getElementById('penDot')!
    this.penRow = this.shadow.getElementById('penRow')!
    this.fidelityBtn = this.shadow.getElementById('fidelityBtn') as HTMLButtonElement
    this.fidelityPanel = this.shadow.getElementById('fidelityPanel')!
    this.fidelityRange = this.shadow.getElementById('fidelityRange') as HTMLInputElement
    this.styleSel = this.shadow.getElementById('styleSel') as HTMLSelectElement
    this.bandChip = this.shadow.getElementById('bandChip') as HTMLButtonElement
    this.autoBtn = this.shadow.getElementById('autoBtn') as HTMLButtonElement
    this.buildFidelityPanel()

    // Button handlers stay thin wrappers around named methods: every one of
    // them is also a keybinding, and two code paths for one action is how the
    // mouse and the keyboard drift apart.
    for (const m of ['gesture', 'design', 'screenshot'] as const) {
      this.shadow.getElementById(`mode-${m}`)!.addEventListener('click', () => this.setRunMode(m))
    }
    this.shadow.getElementById('tweakBtn')!.addEventListener('click', () => this.toggleTweak())
    this.autoBtn.addEventListener('click', () => this.setAuto(!this.auto))
    this.drawBtn.addEventListener('click', () => this.toggleDraw())
    this.runBtn.addEventListener('click', () => void this.run())
    this.confirmBtn.addEventListener('click', () => void this.proceed())
    this.cancelBtn.addEventListener('click', () => this.exitPreview('cancelled'))
    this.undoBtn.addEventListener('click', () => this.undoStroke())
    this.clearBtn.addEventListener('click', () => this.clearAll())
    this.shadow.getElementById('hudHide')!.addEventListener('click', () => this.setHudHidden(true))
    this.hudShow.addEventListener('click', () => this.setHudHidden(false))
    // The bar sits over the app the user is trying to look at, so it moves:
    // grip, status text and the bar's own padding are all drag surface. These
    // are the only pointer handlers outside the canvas, so nothing competes.
    // …but the popover is NOT drag surface: its slider and checkboxes are not
    // <button>s, so onHudDown would happily grab the bar out from under a
    // slider drag. Stop the event before it reaches the bar's own handler.
    // (Capture listeners on window — the click-outside check — already ran.)
    this.fidelityPanel.addEventListener('pointerdown', (e) => e.stopPropagation())
    this.hud.addEventListener('pointerdown', (e) => this.onHudDown(e))
    this.hud.addEventListener('pointermove', (e) => this.onHudMove(e))
    this.hud.addEventListener('pointerup', (e) => this.onHudUp(e))
    this.hud.addEventListener('pointercancel', (e) => this.onHudUp(e))

    // Click-outside dismissal. Capture on window so it runs before anything
    // in the page (or the panel's own stopPropagation) can eat the event, and
    // composedPath() — not e.target — because shadow DOM retargets: from the
    // outside every press on the overlay looks like it hit the host div.
    window.addEventListener('pointerdown', (e) => {
      const path = e.composedPath()
      if (this.fidelityOpen) {
        // the button toggles itself; closing here too would make its click a no-op
        if (!path.includes(this.fidelityPanel) && !path.includes(this.fidelityBtn)) {
          this.setFidelityOpen(false)
        }
      }
      if (this.penOpen && !path.includes(this.penPanel) && !path.includes(this.penBtn)) this.setPenOpen(false)
      if (this.helpOpen && !path.includes(this.helpEl)) this.setHelpOpen(false)
      // An open note editor commits on a press elsewhere rather than
      // vanishing: it is an inline field, not a modal, and silently throwing
      // away words the user typed is the one unrecoverable outcome here.
      if (this.noteDraft && !path.includes(this.noteBox)) this.commitNote()
    }, true)

    // Alt+N attaches the note to whatever is under the POINTER, which means
    // the pointer's last resting place has to be known even while the user is
    // on the keyboard. Capture, so nested scrollers and stopPropagation in the
    // host app can't blind it; passive, so it never costs a frame.
    window.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY }
    }, { capture: true, passive: true })

    // Keystrokes inside the note field belong to the note — not to the overlay
    // (they would toggle modes mid-sentence) and not to the host app (which
    // may bind bare letters). Stopping propagation here is what buys both.
    this.noteInput.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        this.commitNote()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.closeNote('note cancelled')
      }
    })
    this.noteInput.addEventListener('keyup', (e) => e.stopPropagation())
    this.noteInput.addEventListener('keypress', (e) => e.stopPropagation())

    this.binds = this.buildKeymap()
    this.buildHelp()
    this.loadPen()
    void this.restoreFromRun()
    // Existing rules are watching from the moment the page loads, whether or
    // not anyone opens the panel.
    void this.refreshRules()
    // A baseline moment, so the first edit has something to be a change FROM.
    // Recorded once the page has actually laid out, or the thumbnail is a
    // picture of an empty document.
    setTimeout(() => void this.recordVersion('opened'), 1200)
    // Breakpoints up front, not on first use: a band computed before they
    // arrive reads 'base' at any width, so toggling the mode would flash a
    // wrong answer and then correct itself.
    void this.loadScreens()
    void fetch('/@s2c/ide/status')
      .then((r) => r.json() as Promise<{ connected: boolean; editor?: string }>)
      .then((d) => this.setIdeEditor(d.connected ? (d.editor ?? 'editor') : null))
      .catch(() => { /* an older dev server without the bridge just stays dark */ })

    window.addEventListener('keydown', (e) => this.onKeyDown(e))
    // the panel is clamped against the viewport, so a resize has to re-run it
    window.addEventListener('resize', () => {
      this.resize()
      this.clampHud()
      this.layoutFidelityPanel()
      if (this.penOpen) this.layoutPanel(this.penPanel)
      if (this.ruleDraw) this.layoutRulePanel()
      if (this.propsOpen) this.layoutPropsPanel()
      // the whole gesture is "resize, then rearrange", so the band indicator
      // has to track the window as it is being dragged
      if (this.responsive) this.syncBandChip()
      // an alignment that holds at 1280px is exactly the thing that breaks at
      // 900, so a resize is a real reason to re-check
      if (this.rules.length) this.scheduleRuleCheck()
    })

    /**
     * Re-check rules when the page's structure changes.
     *
     * The valuable case is not one of this overlay's own edits — those already
     * re-check — but a change made in the EDITOR: someone reorders a flex
     * container in their IDE, HMR remounts it, and the rule they drew last
     * week turns red on the page without anyone asking it to. That is the
     * difference between a rule and a comment.
     *
     * Attributes as well as children, and this is not a detail: React's Fast
     * Refresh usually RECONCILES an edited component rather than remounting
     * it, so adding a margin to an input changes one attribute and adds no
     * nodes at all. Watching childList alone made rules blind to exactly the
     * edits they exist to catch.
     *
     * Only while something is being watched, and never mid-drag: an app that
     * draws no rules must not pay a fetch per mutation, and a drag's own live
     * preview writes a style attribute on every frame.
     */
    new MutationObserver(() => {
      if (!this.rules.length) return
      const t = this.tweak
      if (t?.moveDrag || t?.handleDrag || t?.drag) return
      this.scheduleRuleCheck(600)
    }).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'],
    })
    // capture: nested scroll containers' scroll events don't bubble, but a
    // capture listener on window still sees them
    window.addEventListener('scroll', () => {
      const t = this.tweak
      if (t?.moveDrag) this.applyMovePreview(t, t.moveDrag)
      if (this.propsOpen) this.layoutPropsPanel()
      this.redraw()
    }, { passive: true, capture: true })

    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e))
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e))
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e))
    this.canvas.addEventListener('pointercancel', (e) => this.onUp(e))

    document.body.appendChild(this.host)
    this.resize()
    // after the append: restoring clamps against measured widths, and an
    // un-laid-out element measures 0
    this.restoreHud()
    // before restoreFidelity: its syncFidelityUi writes the bar tooltip, and
    // that string names the attempts count
    this.restoreCandidates()
    this.restoreFidelity()
    this.restoreAuto()
    // last of the restores: it owns the status line, and it only fires on the
    // one boot that follows an extract
    this.restoreAfterExtract()
    this.connectEvents()

    // dev-only debug surface (the whole overlay is dev-only): lets e2e
    // compare the drawn selection rect against the element's live rect
    ;(globalThis as unknown as Record<string, unknown>).__S2C_DEBUG__ = {
      selRect: () => (this.tweak ? this.selRect(this.tweak) : null),
      // lets e2e compare what the overlay BELIEVES against what it puts on
      // the wire, and assert the help overlay lists every binding there is
      notes: () => this.notesPayload(),
      // the snapshot AS SENT: every server-side geometry decision is made
      // against this, so when a gesture picks the wrong element this is the
      // only place that can say whether the page or the reading was wrong
      snapshot: () => this.snapshot(),
      keymap: () => this.binds.map((b) => ({ id: b.id, keys: b.keys, label: b.label, group: b.group })),
      // what each stroke believes it is drawn on, so a drifting overlay can be
      // told apart from a stroke that never anchored in the first place
      strokes: () => this.strokes.map((st) => ({ id: st.id, color: st.color, anchor: st.anchor })),
      // what the overlay BELIEVES it will spend, next to what it puts on the
      // wire — the two drifting apart is the only way this control can lie
      candidates: () => this.candidatesPayload(),
      // auto mode fires with no click, so e2e has to be able to see the state
      // it fires FROM: armed, counting down, or locked mid-run
      auto: () => ({ on: this.auto, pending: this.autoTimer != null, busy: this.autoBusy }),
      // what the paint popover believes it is pointed at: the whole risk here
      // is painting a DIFFERENT shape than the one outlined, so the stamp it
      // would put on the wire has to be observable
      paint: () => ({
        open: this.paintOpen,
        prop: this.paintProp,
        shape: isShapeEl(this.tweak?.el),
        tag: this.tweak?.el.tagName.toLowerCase() ?? null,
        srcLoc: this.tweak?.srcLoc ?? null,
      }),
      // What the lasso believes it caught, and what it would put on the wire.
      // The whole risk in this gesture is extracting DIFFERENT elements than
      // the ones highlighted, so the highlight set has to be observable.
      lasso: () => (this.lasso == null ? null : {
        drawing: this.lasso.drawing,
        armed: this.lassoArmed,
        points: this.lasso.points.length,
        hits: this.lasso.hits.map((h) => ({ srcLoc: h.srcLoc, label: h.label })),
        srcLocs: [...new Set(this.lasso.hits.map((h) => h.srcLoc))],
        panelOpen: this.lassoPanel.classList.contains('on'),
      }),
      // What the library holds and what is being held — placing a DIFFERENT
      // entry than the one lit up would look exactly like it working.
      library: () => ({
        open: this.libOpen,
        searching: this.libSearching,
        armed: this.libArmed?.id ?? null,
        armedName: this.libArmed?.name ?? null,
        entries: this.entries.map((e) => ({
          id: e.id, name: e.name, kind: e.kind, file: e.file, home: e.home,
          portable: e.portable, hasThumb: !!e.thumb, usedCount: e.usedCount,
          alreadyHere: e.alreadyHere ?? false, score: e.score ?? null,
          props: e.props.map((p) => p.name),
        })),
      }),
      // The timeline as the page sees it, plus the size of the picture it
      // draws — a thumbnail that silently comes out blank would otherwise look
      // exactly like a working one.
      history: () => ({
        open: this.timeOpen,
        picked: this.timePick,
        versions: this.versions.map((v) => ({
          id: v.id, label: v.label, files: v.files, hasThumb: !!v.thumb,
        })),
        thumbBytes: (this.thumbnail() ?? '').length,
      }),
      // Whether a drag will be banded, and into which band — the mode that
      // changes what an ordinary gesture writes has to be observable.
      responsive: () => ({
        on: this.responsive,
        band: this.responsive ? this.band() : null,
        width: window.innerWidth,
        screens: this.screens?.screens ?? null,
        source: this.screens?.source ?? null,
      }),
      // What the props panel read, and what it would write where. A control
      // that edits a DIFFERENT call site than the one named is the failure
      // mode here, so both have to be observable.
      props: () => ({
        open: this.propsOpen,
        component: this.propsData?.component ?? null,
        site: (this.propsData?.callSites ?? [])[this.propsSite]?.loc ?? null,
        values: (this.propsData?.callSites ?? [])[this.propsSite]?.values ?? null,
        specs: (this.propsData?.props ?? []).map((p) => ({
          name: p.name, kind: p.kind, options: p.options, editable: p.editable, why: p.why,
        })),
        notes: this.propsData?.notes ?? [],
      }),
      // Which two elements a value drag would put on the wire. Copying from
      // or into a DIFFERENT element than the one outlined is the failure mode
      // here, so both ends have to be observable.
      data: () => ({
        armed: this.dataArmed,
        from: this.dataDrag?.from.srcLoc ?? null,
        to: this.dataDrag?.to?.srcLoc ?? null,
        value: this.dataDrag?.value ?? null,
      }),
      // What the rule gesture is about to save, and what every saved rule
      // currently reads. A rule that silently watches the WRONG elements is
      // the failure mode worth being able to see from a test.
      rules: () => ({
        armed: this.ruleArmed,
        watching: this.watching,
        panelOpen: this.rulePanel.classList.contains('on'),
        listOpen: this.watchPanel.classList.contains('on'),
        drawing: this.ruleDraw?.drawing ?? null,
        choice: this.ruleDraw?.choice ?? null,
        proposals: this.ruleDraw?.proposals.map((p) => ({
          kind: p.kind, desc: p.desc, reading: p.reading, subjects: p.subjects,
        })) ?? [],
        saved: this.rules.map((r) => ({
          id: r.id, kind: r.kind, desc: r.desc, broken: r.broken, message: r.message,
          note: r.note, subjects: r.subjects,
        })),
      }),
      // the plan as painted, in VIEWPORT coords, so a drifting overlay can be
      // compared against the live rects of the elements it is describing
      plan: () => [...this.planLayer.querySelectorAll('.planLabel')].map((el) => {
        const r = el.getBoundingClientRect()
        return { text: el.textContent, x: r.left, y: r.top, w: r.width, h: r.height }
      }),
    }
  }

  private setMode(m: Mode) {
    if (this.mode === 'draw' && m !== 'draw') this.resetBridge()
    // the paint popover describes a tweak-mode selection; it must not outlive
    // the mode that owns it (it is position:fixed and would hang over the app)
    if (m !== 'tweak' && this.paintOpen) this.setPaintOpen(false)
    // …and neither may a lasso: it describes elements in tweak mode's own
    // coordinate system of "things you can select", and drawing continues over
    // the same canvas
    if (m !== 'tweak' && (this.lasso || this.lassoArmed || this.ruleDraw || this.ruleArmed ||
        this.dataDrag || this.dataArmed)) {
      this.dataDrag = null
      this.dataArmed = false
      if (this.propsOpen) void this.setPropsOpen(false)
      this.lasso = null
      this.lassoArmed = false
      this.lassoPanel.classList.remove('on')
      this.ruleDraw = null
      this.ruleArmed = false
      this.rulePanel.classList.remove('on')
    }
    this.mode = m
    this.host.dataset.mode = m
    // tweak-mode overlays must TRACK their elements through scroll/zoom/
    // layout churn; outside tweak mode the loop is stopped — zero idle cost
    if (m === 'tweak' || this.strokes.some((st) => st.anchor)) this.startTracking()
    else this.stopTracking()
    this.drawBtn.textContent = m === 'draw' ? '✋ Done' : '✏️ Draw'
    this.drawBtn.classList.toggle('primary', m !== 'draw')
    this.sync()
  }

  private toggleDraw() {
    if (this.mode === 'running') return
    this.setMode(this.mode === 'draw' ? 'idle' : 'draw')
  }

  /** The three run modes, from the mode pills or from Alt+G / Alt+E / Alt+S. */
  private setRunMode(m: 'gesture' | 'design' | 'screenshot') {
    this.runMode = m
    for (const mm of ['gesture', 'design', 'screenshot']) {
      this.shadow.getElementById(`mode-${mm}`)!.classList.toggle('on', mm === m)
    }
    this.status(
      m === 'gesture' ? 'gesture mode: mark up existing UI'
      : m === 'design' ? 'design mode: sketch new UI to build'
      : 'screenshot mode: pixels-only benchmark (will ask to share this tab)',
    )
  }

  private toggleTweak() {
    const btn = this.shadow.getElementById('tweakBtn')!
    if (this.mode === 'tweak') {
      btn.classList.remove('primary')
      this.exitTweak('tweak off')
    } else {
      btn.classList.add('primary')
      this.setMode('tweak')
      this.status('tweak: click any element — drag to move, handles to resize, gaps/padding to space')
    }
  }

  /** The ↩ button: drop the last stroke. */
  private undoStroke() {
    this.strokes.pop()
    this.resetBridge()
    this.renderInk()
    this.sync()
    // the drawing changed, so the "is it finished?" wait starts over — and if
    // that was the last stroke, scheduleAuto drops the pending run entirely
    this.scheduleAuto()
  }

  /** The ✕ button: the drawing AND the words about it go together — a note
   *  whose strokes are gone points at nothing. */
  private clearAll() {
    this.strokes = []
    this.notes = []
    this.endSketchSearch()
    // a new drawing gets its own instant render
    this.instant = null
    if (this.noteDraft) this.closeNote('cleared')
    this.resetBridge()
    this.renderInk()
    this.renderNotes()
    this.sync()
    // nothing left to auto-run: this drops the pending countdown
    this.scheduleAuto()
  }

  /**
   * Cmd/Ctrl+Z. While drawing it walks back the ink; otherwise it asks the
   * server to revert the last edit it wrote.
   */
  private undo() {
    if (this.mode === 'draw' && this.strokes.length > 0) {
      this.undoStroke()
      this.status('stroke undone')
      return
    }
    if (this.mode === 'running') return
    void (async () => {
      try {
        const res = await fetch('/@s2c/undo', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
          body: '{}',
        })
        const body = (await res.json()) as { ok: boolean; undid?: string | null; files?: string[]; error?: string }
        if (!res.ok || !body.ok) throw new Error(body.error ?? String(res.status))
        this.status(body.undid ? `↩ undid: ${body.undid}` : 'nothing to undo')
        // an undo rewrites the files the panel and the rules read from, so
        // both would otherwise keep showing the state that was just discarded
        if (this.propsOpen) await this.readProps()
        if (this.rules.length) this.scheduleRuleCheck()
      } catch (err) {
        this.status(`undo failed: ${err instanceof Error ? err.message : String(err)}`, true)
      }
    })()
  }

  /** "Do I have anything to run?" — strokes OR notes. A typed note is the
   *  least ambiguous input the pipeline can get; it is never dead weight. */
  private hasWork(): boolean {
    return this.strokes.length > 0 || this.notes.length > 0
  }

  private sync() {
    const busy = this.mode === 'running'
    const previewing = this.mode === 'preview' || this.mode === 'tweak'
    this.runBtn.style.display = previewing ? 'none' : ''
    this.confirmBtn.style.display = previewing ? '' : 'none'
    this.cancelBtn.style.display = previewing ? '' : 'none'
    this.runBtn.disabled = busy || !this.hasWork()
    this.undoBtn.disabled = busy || previewing || this.strokes.length === 0
    this.clearBtn.disabled = busy || previewing || !this.hasWork()
    this.drawBtn.disabled = busy || previewing
  }

  private status(msg: string, err = false) {
    this.statusEl.textContent = msg
    this.statusEl.classList.toggle('err', err)
  }

  // ---- the keymap -------------------------------------------------------
  // Everything the bar can do, plus the two things only the keyboard can do
  // (a note, and this list). Alt+<letter> throughout, to match the Alt+D the
  // overlay shipped with; the fidelity keeps take digits because their four
  // names (asymmetry / rhythm / proportions / placement) collide on letters.

  private buildKeymap(): KeyBind[] {
    const keep = (k: keyof FidelityKeep, digit: '1' | '2' | '3' | '4'): KeyBind => ({
      id: `keep-${k}`,
      keys: `Alt+${digit}`,
      label: `fidelity: ${KEEP_LABELS[k].label}`,
      group: 'fidelity',
      match: altBind(`Digit${digit}`, digit),
      run: () => this.toggleKeep(k),
    })
    // Digits again, continuing where the keeps stop: the three fill names
    // (outline / filled / realized) collide on letters with existing binds
    // (Alt+F is the panel itself), and 5/6/7 keep the whole fidelity block
    // on one contiguous run of keys the user can learn as a row.
    const fill = (k: FillMode, digit: '5' | '6' | '7'): KeyBind => ({
      id: `fill-${k}`,
      keys: `Alt+${digit}`,
      label: `result: ${FILL_LABELS[k].label} — ${FILL_LABELS[k].short}`,
      group: 'fidelity',
      match: altBind(`Digit${digit}`, digit),
      run: () => this.setFill(k),
    })
    return [
      {
        id: 'draw', keys: 'Alt+D', label: 'draw / stop drawing', group: 'drawing',
        match: altBind('KeyD', 'd'), run: () => this.toggleDraw(),
      },
      {
        id: 'mode-gesture', keys: 'Alt+G', label: 'gesture mode — mark up existing UI', group: 'drawing',
        match: altBind('KeyG', 'g'), run: () => this.setRunMode('gesture'),
      },
      {
        // D is already draw, so design takes the E of dEsign
        id: 'mode-design', keys: 'Alt+E', label: 'design mode — sketch new UI to build', group: 'drawing',
        match: altBind('KeyE', 'e'), run: () => this.setRunMode('design'),
      },
      {
        id: 'mode-screenshot', keys: 'Alt+S', label: 'screenshot mode — pixels-only benchmark', group: 'drawing',
        match: altBind('KeyS', 's'), run: () => this.setRunMode('screenshot'),
      },
      {
        id: 'tweak', keys: 'Alt+T', label: 'tweak mode — move/resize/space elements, zero tokens', group: 'drawing',
        match: altBind('KeyT', 't'), run: () => this.toggleTweak(),
      },
      {
        // The gesture is Alt+drag; this key exists so it is discoverable HERE,
        // and so the loop can be drawn without holding a modifier down.
        id: 'lasso', keys: 'Alt+L',
        label: 'lasso: circle elements → extract a component (or just hold Alt and drag)',
        group: 'drawing', match: altBind('KeyL', 'l'), run: () => this.armLasso(),
      },
      {
        // Alt+R runs; Alt+Shift+R writes down something that must KEEP being
        // true. Same letter on purpose — one fires the pipeline once, the
        // other makes a check that fires on every run after this one.
        id: 'rule', keys: 'Alt+Shift+R', group: 'drawing',
        label: 'rule: drag a line down two edges (or across a gap) → a check that keeps watching',
        match: altBind('KeyR', 'r', true), run: () => this.armRule(),
      },
      {
        // Alt+L circles elements INTO a component; Alt+Shift+L is where those
        // components live afterwards. Same letter, one idea.
        id: 'library', keys: 'Alt+Shift+L', group: 'drawing',
        label: 'element library — everything you have made, to put back on the page',
        match: altBind('KeyL', 'l', true), run: () => void this.setLibOpen(!this.libOpen),
      },
      {
        id: 'history', keys: 'Alt+B', group: 'overlay',
        label: 'history — moments of this page you can put back (B for back)',
        match: altBind('KeyB', 'b'), run: () => void this.setTimeOpen(!this.timeOpen),
      },
      {
        id: 'responsive', keys: 'Alt+M', group: 'drawing',
        label: 'responsive demonstration — rearrange at this window width, get that breakpoint',
        match: altBind('KeyM', 'm'), run: () => void this.toggleResponsive(),
      },
      {
        id: 'props', keys: 'Alt+O', group: 'drawing',
        label: 'props panel — controls for the selected component, read off its own types',
        match: altBind('KeyO', 'o'), run: () => void this.setPropsOpen(!this.propsOpen),
      },
      {
        id: 'dragdata', keys: 'Alt+V', group: 'drawing',
        label: 'drag a value — press on a value, drop it where it should also show',
        match: altBind('KeyV', 'v'), run: () => this.armData(),
      },
      {
        id: 'watching', keys: 'Alt+W', group: 'drawing',
        label: 'show / hide the rules being watched (a broken one shows itself anyway)',
        match: altBind('KeyW', 'w'), run: () => this.toggleWatching(),
      },
      {
        id: 'undo', keys: 'Ctrl/⌘+Z', label: 'undo — last stroke while drawing, else the last edit written',
        group: 'drawing', match: metaBind('KeyZ', 'z'), run: () => this.undo(),
      },
      {
        id: 'clear', keys: 'Alt+X', label: 'clear the drawing and its notes', group: 'drawing',
        // mirrors the button exactly, disabled state included: a keybinding
        // that fires when its button can't is a second, divergent code path
        match: altBind('KeyX', 'x'), run: () => { if (!this.clearBtn.disabled) this.clearAll() },
      },
      {
        id: 'run', keys: 'Alt+R', label: 'run — read the drawing and preview what it means', group: 'run',
        match: altBind('KeyR', 'r'), run: () => { if (!this.runBtn.disabled) void this.run() },
      },
      {
        id: 'confirm', keys: 'Alt+Enter', label: 'go — apply the previewed edit', group: 'run',
        match: altBind('Enter', 'enter'),
        run: () => { if (this.confirmBtn.style.display !== 'none') void this.proceed() },
      },
      {
        id: 'cancel', keys: 'Alt+C', label: 'cancel the preview', group: 'run',
        match: altBind('KeyC', 'c'),
        run: () => { if (this.cancelBtn.style.display !== 'none') this.exitPreview('cancelled') },
      },
      {
        // A is free, and it is the letter of the thing — unlike the attempts
        // controls, which took digits precisely so that Alt+A could stay the
        // one binding that means "auto".
        id: 'auto', keys: 'Alt+A', group: 'run',
        label: 'auto mode (ON by default) — stop drawing and the sketch runs itself, no ✓ Go',
        match: altBind('KeyA', 'a'), run: () => this.setAuto(!this.auto),
      },
      {
        id: 'note', keys: 'Alt+N', label: 'note here — type words onto whatever is under the pointer', group: 'notes',
        match: altBind('KeyN', 'n'), run: () => this.openNote(false),
      },
      {
        id: 'note-run', keys: 'Alt+Shift+N', label: 'note about the whole sketch, whatever the pointer is over',
        group: 'notes', match: altBind('KeyN', 'n', true), run: () => this.openNote(true),
      },
      {
        id: 'fidelity', keys: 'Alt+F', label: 'open / close the fidelity panel', group: 'fidelity',
        match: altBind('KeyF', 'f'), run: () => this.setFidelityOpen(!this.fidelityOpen),
      },
      {
        id: 'fidelity-up', keys: 'Alt+↑', label: 'resemble the drawing more (+5%)', group: 'fidelity',
        match: altBind('ArrowUp', 'arrowup'), run: () => this.nudgeFidelity(0.05),
      },
      {
        id: 'fidelity-down', keys: 'Alt+↓', label: 'resemble the drawing less (−5%)', group: 'fidelity',
        match: altBind('ArrowDown', 'arrowdown'), run: () => this.nudgeFidelity(-0.05),
      },
      keep('asymmetry', '1'),
      keep('rhythm', '2'),
      keep('proportions', '3'),
      keep('placement', '4'),
      fill('outline', '5'),
      fill('filled', '6'),
      fill('realized', '7'),
      {
        // A letter, not another digit: 1-4 are the keeps, 5-7 the fill and 8-9
        // the attempts, so the row is full — and six styles would want six of
        // them anyway. Y is free, and ONE key that cycles is the only shape
        // that reaches six options without spending six bindings.
        id: 'style-next', keys: 'Alt+Y', group: 'fidelity',
        label: 'next visual style — auto / flat / soft / line / grain / glow',
        match: altBind('KeyY', 'y'), run: () => this.cycleStyle(1),
      },
      {
        // Shift reverses it, the shape Alt+Shift+N already established here —
        // six options is far enough round the cycle for backwards to matter.
        id: 'style-prev', keys: 'Alt+Shift+Y', group: 'fidelity',
        label: 'previous visual style — the same cycle, backwards',
        match: altBind('KeyY', 'y', true), run: () => this.cycleStyle(-1),
      },
      {
        // 8/9 continue the fidelity digit row (1-4 keeps, 5-7 fill) rather
        // than taking letters: Alt+A is free but "attempts" and "asymmetry"
        // would be one typo apart on a control that spends money.
        id: 'candidates-fewer', keys: 'Alt+8', group: 'fidelity',
        label: 'fewer attempts — fewer tokens, less waiting, worse odds',
        match: altBind('Digit8', '8'), run: () => this.nudgeCandidates(-1),
      },
      {
        id: 'candidates-more', keys: 'Alt+9', group: 'fidelity',
        label: 'more attempts — best of N scored against the drawing, N× the tokens and time',
        match: altBind('Digit9', '9'), run: () => this.nudgeCandidates(1),
      },
      {
        id: 'pen', keys: 'Alt+P', label: 'pen colour — draw in a colour to ask for it', group: 'colour',
        match: altBind('KeyP', 'p'), run: () => this.setPenOpen(!this.penOpen),
      },
      {
        id: 'eyedrop', keys: 'Alt+I', label: 'pick up the colour under the pointer', group: 'colour',
        match: altBind('KeyI', 'i'), run: () => this.eyedrop(),
      },
      {
        id: 'pen-off', keys: 'Alt+0', label: 'back to the default ink (no colour asked for)', group: 'colour',
        match: altBind('Digit0', '0'), run: () => this.setPen(null),
      },
      {
        id: 'reveal', keys: 'Alt+J', label: 'reveal the selection in your editor', group: 'overlay',
        match: altBind('KeyJ', 'j'),
        run: () => {
          const loc = this.tweak?.el.dataset.s2c ?? this.hoverEl?.dataset.s2c
          if (!loc) return this.status('select something first')
          if (!this.ideEditor) return this.status('no editor connected — see packages/vscode-extension', true)
          this.revealInEditor(loc)
          this.status(`revealed ${loc} in ${this.ideEditor}`)
        },
      },
      {
        // K for "kolour"? No — P is the pen and C is cancel, and this is the
        // only free letter next to them that nothing else claims. It opens the
        // popover the shape click already opens, which is what makes it a
        // reopen rather than a second way to do a new thing.
        id: 'paint', keys: 'Alt+K', group: 'colour',
        label: 'paint the selected shape — recolour one <path> in source, zero tokens',
        match: altBind('KeyK', 'k'), run: () => this.setPaintOpen(!this.paintOpen),
      },
      {
        id: 'hud', keys: 'Alt+H', label: 'hide / show the toolbar', group: 'overlay',
        match: altBind('KeyH', 'h'),
        run: () => {
          this.setHudHidden(!this.hudHidden)
          if (!this.hudHidden) this.status('toolbar back · Alt+H hides it again')
        },
      },
      {
        id: 'help', keys: '?', label: 'show / hide this list', group: 'overlay',
        // by e.key alone: '?' sits behind Shift on some layouts and AltGr on
        // others, and the character is what the user actually pressed
        match: (e) => !e.altKey && !e.metaKey && !e.ctrlKey && e.key === '?',
        run: () => this.setHelpOpen(!this.helpOpen),
      },
      {
        id: 'escape', keys: 'Esc', group: 'overlay',
        label: 'close the top thing: paint → pending auto-run → note → this list → fidelity → preview / tweak / draw',
        match: plainBind('Escape', 'Escape'), run: () => this.onEscape(),
      },
    ]
  }

  private onKeyDown(e: KeyboardEvent) {
    // don't hijack typing in the host app's inputs
    const target = e.composedPath()[0] as HTMLElement | undefined
    const tag = target?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
      // …except that Esc must still dismiss OUR popover when focus is
      // sitting in its slider or a checkbox — otherwise the panel would be
      // un-closable by keyboard the moment a control took focus. Every
      // other key (arrows, space) still belongs to the control.
      // (The note field never reaches here: it stops its own keystrokes.)
      const ours = e.key === 'Escape' && target instanceof Node && (
        ((this.fidelityOpen || this.penOpen) && this.fidelityPanel.contains(target)) ||
        // …and the same for the paint popover's native colour input
        (this.paintOpen && this.paintPanel.contains(target))
      )
      if (!ours) return
    }
    // first match wins; the table is small and the matchers are disjoint
    for (const b of this.binds) {
      if (!b.match(e)) continue
      e.preventDefault()
      b.run()
      return
    }
  }

  /**
   * The Escape ladder, newest-and-shallowest first. Each rung RETURNS: falling
   * through would cancel a tweak drag or drop the selection underneath a
   * popover — destroying work the user never aimed at while they were only
   * closing a menu.
   */
  private onEscape() {
    // Holding something from the library is the shallowest state there is: Esc
    // puts it down, and must not also close the panel it came from.
    if (this.libArmed) {
      this.libArmed = null
      this.renderLibrary()
      this.libFoot.textContent = 'pick one, then click where it should go'
      this.status('put it back — nothing placed')
      this.redraw()
      return
    }
    if (this.libOpen) {
      void this.setLibOpen(false)
      return
    }
    // The props panel closes before anything that would drop the selection it
    // is describing: Esc here means "done with these controls", not "deselect".
    if (this.propsOpen) {
      void this.setPropsOpen(false)
      return
    }
    if (this.timeOpen) {
      void this.setTimeOpen(false)
      return
    }
    // A value in mid-air, or an armed-but-unused value drag: nothing has been
    // written, and the user is still inside the gesture.
    if (this.dataDrag) {
      this.cancelData('value drag cancelled — nothing copied')
      return
    }
    if (this.dataArmed) {
      this.dataArmed = false
      this.status('value drag off — drag moves elements again')
      return
    }
    // A rule being drawn, or one waiting for a reading to be picked: same rung
    // as the lasso, for the same reason — nothing is written yet and the user
    // is still inside the gesture.
    if (this.ruleDraw) {
      this.cancelRule(
        this.ruleDraw.drawing ? 'rule cancelled' : 'rule cancelled — nothing saved',
      )
      return
    }
    if (this.ruleArmed) {
      this.ruleArmed = false
      this.status('rule off — drag moves elements again')
      return
    }
    // The newest and shallowest rung there is: a loop being drawn, or one
    // waiting for a name. Neither has written anything, and both are gestures
    // the user is still inside — so Esc here means "not these", not "leave
    // tweak mode" and not "close the palette underneath".
    if (this.lasso) {
      this.cancelLasso(
        this.lasso.drawing ? 'lasso cancelled' : 'extract cancelled — nothing written',
      )
      return
    }
    // …and an armed-but-undrawn lasso disarms rather than doing nothing: Alt+L
    // with second thoughts should not need a drag to undo.
    if (this.lassoArmed) {
      this.lassoArmed = false
      this.status('lasso off — drag moves elements again')
      return
    }
    // Above even the pending-run rung, and it costs that rung nothing: the
    // paint popover only exists while a shape is selected in TWEAK mode, and
    // autoBlock() already refuses to count down outside draw mode — so these
    // two can never be on the stack together. What this ordering does buy is
    // that Esc closes the palette WITHOUT also dropping the shape selection
    // underneath it, which is the one thing the user was not aiming at.
    if (this.paintOpen) {
      this.setPaintOpen(false)
      return
    }
    // The newest and shallowest rung of all: a run is about to fire on its
    // own, and this is the keystroke the countdown advertises. It RETURNS like
    // every other rung — falling through would also drop the user out of draw
    // mode, i.e. the same Esc would both stop the run and throw away the
    // context they were about to redraw in.
    // …but only while the countdown is actually COUNTING. A wait that is held
    // open behind a note or a panel is not the thing on top of the stack, and
    // stealing Esc from the note editor would make a note uncancellable for as
    // long as auto mode is armed.
    if (this.autoTimer && !this.autoBlock()) {
      this.cancelAuto('auto-run cancelled — draw again to restart the wait, Alt+A to turn it off')
      return
    }
    if (this.noteDraft) {
      this.closeNote('note cancelled')
      return
    }
    if (this.helpOpen) {
      this.setHelpOpen(false)
      return
    }
    if (this.penOpen) {
      this.setPenOpen(false)
      return
    }
    if (this.fidelityOpen) {
      this.setFidelityOpen(false)
      return
    }
    const tw = this.tweak
    if (this.mode === 'tweak' && tw && (tw.moveDrag || tw.handleDrag || tw.drag)) {
      // Esc DURING a drag cancels the drag — it must never fall through
      // to the scope toggle (a 'one'-scope drag would silently commit
      // as 'all' at release) or leak the ghost/dim/lift visuals
      this.clearTweakPreview()
      tw.moveDrag = null
      tw.handleDrag = null
      tw.drag = null
      this.status('cancelled')
      this.redraw()
    }
    else if (this.mode === 'tweak' && this.tweak && this.multiSel.length > 0) {
      this.multiSel = []
      this.status('multi-selection cleared')
      this.redraw()
    }
    else if (this.mode === 'tweak' && this.tweak?.scope === 'one') {
      // step back out to all-instances scope before deselecting
      this.tweak.scope = 'all'
      this.status(`all ${this.tweak.instanceEls.length} linked — edits apply to every instance`)
      this.redraw()
    }
    else if (this.mode === 'tweak' && this.tweak) this.deselect('deselected — Esc again to leave tweak')
    else if (this.mode === 'tweak') this.exitTweak('tweak off')
    else if (this.mode === 'preview') this.exitPreview('cancelled')
    else if (this.mode === 'draw') this.setMode('idle')
    else if (this.mode === 'running') {
      // escape hatch: the server may have restarted mid-run
      this.status('cancelled locally (server run may still finish)', true)
      this.clearApplying()
      this.setMode('idle')
    }
  }

  /** Rendered once FROM the keymap: the list can't drift from the bindings. */
  private buildHelp() {
    const head = document.createElement('div')
    head.className = 'hHead'
    const title = document.createElement('span')
    title.className = 'hTitle'
    title.textContent = 'sketch2code — keyboard'
    const close = document.createElement('button')
    close.id = 'helpClose'
    close.textContent = 'close'
    close.addEventListener('click', () => this.setHelpOpen(false))
    head.append(title, close)
    this.helpEl.replaceChildren(head)

    let group = ''
    for (const b of this.binds) {
      if (b.group !== group) {
        group = b.group
        const g = document.createElement('div')
        g.className = 'hGroup'
        g.textContent = group
        this.helpEl.appendChild(g)
      }
      const row = document.createElement('div')
      row.className = 'hRow'
      row.dataset.bind = b.id
      const keys = document.createElement('span')
      keys.className = 'hKeys'
      keys.textContent = b.keys
      const label = document.createElement('span')
      label.className = 'hLabel'
      label.textContent = b.label
      row.append(keys, label)
      this.helpEl.appendChild(row)
    }
    const foot = document.createElement('div')
    foot.className = 'hFoot'
    foot.textContent =
      'Alt+N attaches to what the pointer is over: a stamped element, else the strokes near it, else the whole sketch. ' +
      'Hold Shift to force the whole sketch.'
    this.helpEl.appendChild(foot)
  }

  private setHelpOpen(open: boolean) {
    this.helpOpen = open
    this.helpEl.classList.toggle('on', open)
    if (open) this.status(`${this.binds.length} shortcuts · Esc or ? to close`)
  }

  // ---- HUD placement: draggable, hideable, remembered -------------------
  // The bar is fixed on top of the app under inspection, so it must be
  // movable out of the way and dismissible in one keystroke. Everything here
  // is chrome state only — it never touches modes, strokes or runs.

  /**
   * Whichever of bar/dot is currently on screen: the hidden one measures 0,
   * and clamping against 0 would strand the visible one at the edge.
   */
  private hudBox(): HTMLElement {
    return this.hudHidden ? this.hudShow : this.hud
  }

  /** Clamp a candidate top-left so at least HUD_KEEP px stay in the viewport. */
  private clampHudPoint(x: number, y: number): { x: number; y: number } {
    const box = this.hudBox()
    const w = box.offsetWidth
    const h = box.offsetHeight
    // keep-in px is capped by the element's own size, so a small dot can still
    // sit flush against an edge while a wide bar always leaves a grab strip
    const keepX = Math.min(w, HUD_KEEP)
    const keepY = Math.min(h, HUD_KEEP)
    return {
      x: Math.min(Math.max(x, keepX - w), Math.max(0, window.innerWidth - keepX)),
      y: Math.min(Math.max(y, 0), Math.max(0, window.innerHeight - keepY)),
    }
  }

  /** Push hudPos onto both anchors. Empty strings hand placement back to the
   *  stylesheet's centered-bottom default — no layout values to reconstruct. */
  private applyHudPos() {
    const p = this.hudPos
    for (const el of [this.hud, this.hudShow]) {
      el.classList.toggle('placed', p != null)
      el.style.left = p ? `${p.x}px` : ''
      el.style.top = p ? `${p.y}px` : ''
    }
  }

  /** Re-clamp in place: a shrunk viewport (resize, devtools, rotation) or a
   *  bar/dot swap must never leave the toolbar unreachable. */
  private clampHud() {
    if (!this.hudPos) return
    this.hudPos = this.clampHudPoint(this.hudPos.x, this.hudPos.y)
    this.applyHudPos()
  }

  private setHudHidden(hidden: boolean) {
    this.hudHidden = hidden
    this.hud.classList.toggle('off', hidden)
    this.hudShow.classList.toggle('on', hidden)
    this.clampHud() // the dot and the bar have very different footprints
    this.saveHudState()
  }

  /**
   * Persisted chrome state. localStorage throws outright in some embeddings
   * (blocked third-party storage, Safari private mode) and its contents are
   * user-editable, so every field is re-validated and anything off-shape
   * falls back to the default centered-visible layout.
   */
  private restoreHud() {
    let pos: { x: number; y: number } | null = null
    let hidden = false
    try {
      const raw = localStorage.getItem(HUD_STORE_KEY)
      const v = raw ? (JSON.parse(raw) as unknown) : null
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>
        const x = o.x
        const y = o.y
        if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
          pos = { x, y }
        }
        hidden = o.hidden === true
      }
    } catch { /* unreadable storage just means the default layout */ }
    this.hudPos = pos
    this.applyHudPos()
    // via setHudHidden so the dot/bar classes and the re-clamp (the saved
    // position may come from a wider window) go through one path
    this.setHudHidden(hidden)
  }

  private saveHudState() {
    try {
      localStorage.setItem(HUD_STORE_KEY, JSON.stringify({
        x: this.hudPos?.x ?? null, y: this.hudPos?.y ?? null, hidden: this.hudHidden,
      }))
    } catch { /* quota/blocked: placement is a nicety, not state we owe anyone */ }
  }

  private onHudDown(e: PointerEvent) {
    if (e.button !== 0) return
    // a press that lands on a control belongs to that control — buttons must
    // keep behaving like buttons, so only the bar's own surface starts a drag
    const src = e.composedPath()[0]
    if (src instanceof Element && src.closest('button')) return
    const r = this.hud.getBoundingClientRect()
    // pin to the pixels it ALREADY occupies before the first move: swapping
    // bottom/translateX(-50%) for left/top mid-drag would make it jump
    this.hudPos = { x: r.left, y: r.top }
    this.applyHudPos()
    this.hudDrag = {
      pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: r.left, originY: r.top,
    }
    this.hud.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  private onHudMove(e: PointerEvent) {
    const d = this.hudDrag
    if (!d || e.pointerId !== d.pointerId) return
    // straight off the pointer delta — no rAF, no debounce: the bar has to be
    // exactly under the cursor that grabbed it, every frame
    this.hudPos = this.clampHudPoint(d.originX + (e.clientX - d.startX), d.originY + (e.clientY - d.startY))
    this.applyHudPos()
    // the panel rides along as a child, but its viewport clamp does not: a bar
    // dragged into a corner would push an open panel off-screen
    this.layoutFidelityPanel()
    if (this.penOpen) this.layoutPanel(this.penPanel)
  }

  private onHudUp(e: PointerEvent) {
    const d = this.hudDrag
    if (!d || e.pointerId !== d.pointerId) return
    this.hudDrag = null
    if (this.hud.hasPointerCapture(e.pointerId)) this.hud.releasePointerCapture(e.pointerId)
    this.saveHudState()
  }

  // ---- fidelity controls ------------------------------------------------
  // The user's half of the fidelity contract: one dial for how much the
  // output should resemble the drawing, four per-aspect switches, and a
  // palette choice. All of it is chrome + a field on two request bodies —
  // nothing here touches strokes, modes or the run lifecycle.

  /** Checkbox rows are generated so the label and its WHY live in one table
   *  (KEEP_LABELS) rather than being duplicated between markup and handlers. */
  private buildFidelityPanel() {
    const host = this.shadow.getElementById('fidelityKeep')!
    for (const k of KEEP_KEYS) {
      const row = document.createElement('label')
      row.className = 'fCheck'
      row.title = KEEP_LABELS[k].tip
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.id = `keep-${k}`
      const text = document.createElement('span')
      text.textContent = KEEP_LABELS[k].label
      row.append(box, text)
      host.appendChild(row)
      this.keepBoxes[k] = box
      box.addEventListener('change', () => {
        this.fidelity.keep[k] = box.checked
        this.syncFidelityUi()
        this.saveFidelity()
      })
    }

    this.penBtn.addEventListener('click', () => this.setPenOpen(!this.penOpen))
    this.fidelityBtn.addEventListener('click', () => this.setFidelityOpen(!this.fidelityOpen))
    // 'input', not 'change': the zone name has to update WHILE the thumb
    // moves — that live feedback is how the four zones become learnable
    this.fidelityRange.addEventListener('input', () => {
      this.fidelity.resemblance = Number(this.fidelityRange.value) / 100
      this.syncFidelityUi()
    })
    // …but only commit to storage when the drag ends: one write per gesture
    this.fidelityRange.addEventListener('change', () => this.saveFidelity())
    for (const p of ['app', 'sketch'] as const) {
      this.shadow.getElementById(`palette-${p}`)!.addEventListener('click', () => {
        this.fidelity.palette = p
        this.syncFidelityUi()
        this.saveFidelity()
      })
    }

    // The fill segment is generated for the same reason the checkboxes are:
    // label, tooltip and hint all come from FILL_LABELS, so the markup can
    // never disagree with what Alt+5/6/7 and the wire payload mean.
    const seg = this.shadow.getElementById('fillSeg')!
    for (const k of FILL_KEYS) {
      const b = document.createElement('button')
      b.id = `fill-${k}`
      b.className = 'fSegBtn'
      b.title = FILL_LABELS[k].tip
      b.textContent = FILL_LABELS[k].label
      b.addEventListener('click', () => this.setFill(k))
      seg.appendChild(b)
    }

    // The style options are generated from STYLE_LABELS for the same reason
    // the fill segment is: label, tooltip, hint and Alt+Y all read one table,
    // so the picker cannot disagree with what goes on the wire. Ids on the
    // options (style-auto … style-glow) so each one is addressable, exactly
    // like the buttons of the segments above.
    for (const k of STYLE_KEYS) {
      const o = document.createElement('option')
      o.id = `style-${k}`
      o.value = k
      // word + clause: the closed box has ~230px, and the one-line hint under
      // it carries the rest of the meaning
      o.textContent = `${STYLE_LABELS[k].label} — ${STYLE_LABELS[k].short}`
      o.title = STYLE_LABELS[k].tip
      this.styleSel.appendChild(o)
    }
    this.styleSel.addEventListener('change', () => this.setStyle(this.styleSel.value as StyleMode))

    // The attempts segment, generated from CANDIDATE_LABELS for the same
    // reason: the tradeoff copy is stated in exactly one place, so the button,
    // its tooltip, the hint and Alt+8/9 can never say different things.
    const cands = this.shadow.getElementById('candSeg')!
    for (const n of CANDIDATE_KEYS) {
      const b = document.createElement('button')
      b.id = `cand-${String(n)}`
      b.className = 'fSegBtn'
      b.title = CANDIDATE_LABELS[n].tip
      b.textContent = CANDIDATE_LABELS[n].label
      b.addEventListener('click', () => this.setCandidates(n))
      cands.appendChild(b)
    }
  }

  /** The zone the dial currently sits in — highest threshold it clears. */
  private fidelityZone() {
    let zone = FIDELITY_ZONES[0]!
    for (const z of FIDELITY_ZONES) {
      if (this.fidelity.resemblance >= z.min) zone = z
    }
    return zone
  }

  /** Render every control (and the always-visible bar readout) FROM state —
   *  one path, so a restore from storage and a click look identical. */
  private syncFidelityUi() {
    const f = this.fidelity
    const z = this.fidelityZone()
    const pct = Math.round(f.resemblance * 100)
    this.fidelityRange.value = String(pct)
    this.shadow.getElementById('fidelityZone')!.textContent = `${z.icon} ${z.name}`
    this.shadow.getElementById('fidelityHint')!.textContent = z.hint
    for (const k of KEEP_KEYS) this.keepBoxes[k].checked = f.keep[k]
    for (const p of ['app', 'sketch'] as const) {
      this.shadow.getElementById(`palette-${p}`)!.classList.toggle('on', f.palette === p)
    }
    const fill = FILL_LABELS[f.fill]
    for (const k of FILL_KEYS) {
      this.shadow.getElementById(`fill-${k}`)!.classList.toggle('on', f.fill === k)
    }
    this.shadow.getElementById('fillHint')!.textContent = fill.hint
    // The select's own value IS the selection, so it is written FROM state like
    // every other control here — a click, Alt+Y and a restore from storage all
    // end up in the same place.
    const style = STYLE_LABELS[f.style]
    this.styleSel.value = f.style
    this.shadow.getElementById('styleHint')!.textContent = style.hint
    // Requirement: the user must be able to tell what will happen WITHOUT
    // opening the panel — the bar carries the zone + %, and the full state
    // (including which aspects are still being kept) hangs off the tooltip.
    this.shadow.getElementById('fidelityNow')!.textContent = `${z.name} ${String(pct)}%`
    // The fill axis rides along as one glyph in its own fixed-width slot: the
    // second axis is invisible otherwise, and there is no room in the readout
    // beside it for a fourth word.
    this.shadow.getElementById('fillNow')!.textContent = fill.glyph
    const kept = KEEP_KEYS.filter((k) => f.keep[k]).map((k) => KEEP_LABELS[k].label.replace('keep ', ''))
    const summary = `fidelity: ${z.name} ${String(pct)}% — ${z.hint}` +
      ` · keeping: ${kept.length ? kept.join(', ') : 'nothing (everything may be normalized)'}` +
      ` · ${f.palette === 'app' ? "app's design system" : 'hand-drawn look'}` +
      ` · result: ${fill.label} — ${fill.short}` +
      // The style axis rides in the TOOLTIP and nowhere else on the bar: the
      // pill is already ~868px and two e2e suites hold it under 900, so a
      // fourth always-visible readout is not available at any price.
      ` · style: ${style.label} — ${style.short}` +
      // The attempts count rides in the TOOLTIP rather than in the bar: the
      // pill is width:max-content and centred with translateX(-50%), so any
      // new always-visible readout would slide the whole toolbar sideways the
      // first time it changed. The tooltip costs no layout at all.
      ` · ${CANDIDATE_LABELS[this.candidates].short}`
    this.fidelityBtn.title = summary
    this.fidelityBtn.setAttribute('aria-label', summary)
  }

  // ---- attempts: N generations, one survivor ----------------------------

  /** Render the attempts segment FROM state — one path for restore and click. */
  private syncCandidatesUi() {
    for (const n of CANDIDATE_KEYS) {
      this.shadow.getElementById(`cand-${String(n)}`)!.classList.toggle('on', this.candidates === n)
    }
    this.shadow.getElementById('candHint')!.textContent = CANDIDATE_LABELS[this.candidates].hint
    // the always-visible summary names the count too
    this.syncFidelityUi()
  }

  /**
   * Set the attempts count, from the segment or from Alt+8/9. Idempotent for
   * the same reason setFill is: the keys set a value, they don't cycle.
   */
  private setCandidates(n: Candidates) {
    this.candidates = n
    this.syncCandidatesUi()
    this.saveCandidates()
    // Status ONLY while the panel is shut — writing to #status resizes the
    // width:max-content pill, which with the popover open would shuffle the
    // very buttons the user is clicking. The hint under the segment has
    // already said this, in more words and without moving anything.
    if (!this.fidelityOpen) this.status(`attempts: ${CANDIDATE_LABELS[n].label} — ${CANDIDATE_LABELS[n].tip}`)
  }

  /** Alt+8 / Alt+9. Clamped rather than wrapped: wrapping from 3 back to 1
   *  would silently triple or third the bill on one keystroke too many. */
  private nudgeCandidates(delta: number) {
    this.setCandidates(Math.min(3, Math.max(1, this.candidates + delta)) as Candidates)
  }

  /** Same contract as restoreFidelity: storage can throw and its contents are
   *  user-editable, so anything off-shape falls back to the default of 1. */
  private restoreCandidates() {
    let n: Candidates = DEFAULT_CANDIDATES
    try {
      const raw = localStorage.getItem(CANDIDATES_STORE_KEY)
      const v = raw ? (JSON.parse(raw) as unknown) : null
      if (CANDIDATE_KEYS.includes(v as Candidates)) n = v as Candidates
    } catch { /* unreadable storage just means one attempt */ }
    this.candidates = n
    this.syncCandidatesUi()
  }

  private saveCandidates() {
    try {
      localStorage.setItem(CANDIDATES_STORE_KEY, JSON.stringify(this.candidatesPayload()))
    } catch { /* quota/blocked: one attempt is a safe place to land */ }
  }

  /**
   * The wire value, re-validated at send time. Top-level on the run body, NOT
   * inside `fidelity`: this is about how many times to pay for the same
   * confirmed interpretation, not about what the result should look like.
   */
  private candidatesPayload(): Candidates {
    return CANDIDATE_KEYS.includes(this.candidates) ? this.candidates : DEFAULT_CANDIDATES
  }

  private setFidelityOpen(open: boolean) {
    this.fidelityOpen = open
    this.fidelityPanel.classList.toggle('on', open)
    this.fidelityBtn.classList.toggle('on', open)
    this.fidelityBtn.setAttribute('aria-expanded', String(open))
    // after the class flip: a display:none panel measures 0 and would clamp
    // to nonsense
    if (open) this.layoutFidelityPanel()
  }

  /**
   * Keyboard nudge of the resemblance dial. Snapped to the same 2dp the wire
   * payload uses, so Alt+↑ twenty times lands on exactly 1.00 rather than on
   * float dust, and routed through syncFidelityUi so the bar readout, the
   * zone name and the slider thumb all move together.
   */
  private nudgeFidelity(delta: number) {
    const next = Math.round(Math.min(1, Math.max(0, this.fidelity.resemblance + delta)) * 100) / 100
    this.fidelity.resemblance = next
    this.syncFidelityUi()
    this.saveFidelity()
    const z = this.fidelityZone()
    this.status(`fidelity ${Math.round(next * 100)}% · ${z.icon} ${z.name} — ${z.hint}`)
  }

  private toggleKeep(k: keyof FidelityKeep) {
    this.fidelity.keep[k] = !this.fidelity.keep[k]
    this.syncFidelityUi()
    this.saveFidelity()
    this.status(`${KEEP_LABELS[k].label}: ${this.fidelity.keep[k] ? 'on' : 'off'} — ${KEEP_LABELS[k].tip}`)
  }

  /**
   * The fill axis, from the segment buttons or from Alt+5/6/7. Idempotent on
   * purpose — the keybinding sets a value rather than cycling, so pressing
   * Alt+6 twice leaves you where pressing it once did.
   */
  private setFill(k: FillMode) {
    this.fidelity.fill = k
    this.syncFidelityUi()
    this.saveFidelity()
    // Status ONLY when the panel is shut. #status is the bar's ellipsis
    // surface and the bar is width:max-content, so writing to it resizes the
    // pill — which, with the popover open, would shuffle the very buttons the
    // user is clicking. While it IS open the hint under the segment has
    // already said this, in more words and without moving anything.
    if (!this.fidelityOpen) this.status(`result: ${FILL_LABELS[k].label} — ${FILL_LABELS[k].tip}`)
  }

  /**
   * The style axis, from the picker or from Alt+Y. Idempotent like setFill —
   * the picker sets a value; only the keybinding walks the list.
   */
  private setStyle(k: StyleMode) {
    this.fidelity.style = k
    this.syncFidelityUi()
    this.saveFidelity()
    // Status ONLY while the panel is shut, for the reason setFill documents:
    // #status sizes the width:max-content pill, so writing to it with the
    // popover open would shuffle the very control the user is aiming at. With
    // it open, the hint under the picker has already said this.
    if (!this.fidelityOpen) this.status(`style: ${STYLE_LABELS[k].label} — ${STYLE_LABELS[k].tip}`)
  }

  /**
   * Alt+Y / Alt+Shift+Y. WRAPS rather than clamps — the opposite of
   * nudgeCandidates, and for the opposite reason: every style costs exactly the
   * same, so there is nothing here to protect the user from, and one key that
   * reaches all six beats six bindings on a digit row that has none left.
   */
  private cycleStyle(delta: number) {
    const n = STYLE_KEYS.length
    const i = Math.max(0, STYLE_KEYS.indexOf(this.fidelity.style))
    this.setStyle(STYLE_KEYS[(((i + delta) % n) + n) % n]!)
  }

  /**
   * Keep the popover on screen. The bar can be parked in any corner, so the
   * panel gets clamped horizontally against the viewport and flipped below
   * the bar when there is no room above it. Offsets are expressed relative to
   * the bar (the panel's containing block) so the two stay glued together
   * through drags without a second positioning system.
   */
  // ---- pen colour: the colour you draw in is the colour you're asking for ----
  // Naming a colour ("make it red") goes through a model and comes back as
  // whatever red it likes. Drawing in one states the value exactly — and the
  // server snaps it to a colour this app already renders, so the result is a
  // token from the project's own palette rather than a new arbitrary hue.

  private setPenOpen(open: boolean) {
    this.penOpen = open
    this.penPanel.classList.toggle('on', open)
    this.penBtn.classList.toggle('on', open)
    this.penBtn.setAttribute('aria-expanded', String(open))
    // swatches are sampled fresh on open: the page's palette is whatever the
    // app renders right now, and it changes as the app is edited
    if (open) {
      this.renderPenSwatches()
      this.layoutPanel(this.penPanel)
    }
  }

  private setPen(color: string | null) {
    this.pen = color
    this.savePen()
    this.syncPenUi()
  }

  private syncPenUi() {
    this.penDot.style.background = this.pen ?? '#2563eb'
    this.penBtn.title = this.pen
      ? `pen colour ${this.pen} (Alt+P) — drawn colour becomes the instruction`
      : 'pen colour: default ink (Alt+P) — drawing in a colour asks for that colour'
    for (const el of this.penRow.querySelectorAll('.swatch')) {
      el.classList.toggle('on', (el as HTMLElement).dataset.color === (this.pen ?? ''))
    }
  }

  /**
   * Colours the page actually renders, most-used first.
   *
   * Sampled from the live page rather than a fixed palette for the same reason
   * the server snaps against the app's own colours: an offered swatch should
   * be a colour this project already uses, so drawing with it asks for an
   * existing token instead of introducing a new one.
   */
  private samplePageColors(): string[] {
    const tally = new Map<string, number>()
    const bump = (c: string) => {
      const hex = toHex(c)
      if (!hex) return
      tally.set(hex, (tally.get(hex) ?? 0) + 1)
    }
    let seen = 0
    for (const el of document.body.querySelectorAll('*')) {
      if (seen++ > 1200) break // a big app shouldn't cost a long frame here
      if (el === this.host || this.host.contains(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) continue
      const cs = getComputedStyle(el)
      bump(cs.color)
      bump(cs.backgroundColor)
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, PEN_SWATCHES).map(([c]) => c)
  }

  /**
   * One round colour button. Shared by the pen panel and the shape-paint
   * popover — they offer the same sampled palette for the same reason, and two
   * builders would drift in exactly the details (hex in `data-color`, the
   * null-is-default-ink swatch) that the e2e suites read.
   */
  private swatchButton(color: string | null, label: string, pick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = `swatch${color ? '' : ' ink'}`
    b.dataset.color = color ?? ''
    b.title = label
    if (color) b.style.background = color
    b.addEventListener('click', pick)
    return b
  }

  private renderPenSwatches() {
    const swatch = (color: string | null, label: string) =>
      this.swatchButton(color, label, () => this.setPen(color))
    const kids: HTMLElement[] = [swatch(null, 'default ink — no colour asked for')]
    for (const c of this.samplePageColors()) kids.push(swatch(c, `${c} — already used on this page`))
    const custom = document.createElement('input')
    custom.type = 'color'
    custom.id = 'penCustom'
    custom.title = 'any other colour'
    custom.value = '#ef4444'
    custom.addEventListener('input', () => this.setPen(custom.value))
    kids.push(custom)
    this.penRow.replaceChildren(...kids)
    this.syncPenUi()
  }

  /**
   * Eyedropper: take the colour under the pointer. Text colour when the
   * element carries its own text (that is the colour the user is looking at),
   * otherwise the nearest non-transparent background up the tree.
   */
  private eyedrop() {
    const p = this.pointer
    if (!p) {
      this.status('move the pointer over a colour first')
      return
    }
    const el = this.pickAnyStamped(p.x, p.y) ?? (document.elementFromPoint(p.x, p.y) as HTMLElement | null)
    if (!el) {
      this.status('nothing under the pointer to pick up')
      return
    }
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())
    let picked = ownText ? getComputedStyle(el).color : ''
    if (!picked) {
      for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        const bg = getComputedStyle(node).backgroundColor
        if (toHex(bg)) { picked = bg; break }
      }
    }
    const hex = toHex(picked)
    if (!hex) {
      this.status('no colour to pick up there')
      return
    }
    this.setPen(hex)
    this.status(`pen: ${hex}`)
  }

  private savePen() {
    try {
      if (this.pen) localStorage.setItem(PEN_STORE_KEY, this.pen)
      else localStorage.removeItem(PEN_STORE_KEY)
    } catch { /* storage blocked — the pen just won't survive a reload */ }
  }

  private loadPen() {
    try {
      const raw = localStorage.getItem(PEN_STORE_KEY)
      // only accept something the browser agrees is a colour: a junk value
      // would paint nothing and send a colour intent the server can't read
      if (raw && CSS.supports('color', raw)) this.pen = raw
    } catch { /* ignore */ }
    this.syncPenUi()
  }

  // ---- shape painting: click the shape, click a colour ------------------
  // Canva mode could move and resize boxes but never reach inside generated
  // artwork: changing one line of a drawn face meant another model run. The
  // stamps make each shape addressable, so this is a click and an attribute
  // edit — deterministic, checkpointed, undoable, zero tokens.

  private setPaintOpen(open: boolean) {
    if (!open) {
      this.paintOpen = false
      this.paintPanel.classList.remove('on')
      return
    }
    const t = this.tweak
    if (!t || !isShapeEl(t.el)) {
      // Alt+K with no shape selected: say what to do rather than flashing an
      // empty palette at a selection it cannot paint
      this.status('select a shape first — in tweak mode, click any drawn line or filled region')
      return
    }
    this.paintOpen = true
    this.paintPanel.classList.add('on')
    // Open on the prop that is actually PAINTING this shape: line art has
    // fill:none, and a palette that defaults to fill there would make the
    // user's first click land on an attribute they cannot see.
    const cs = getComputedStyle(t.el)
    this.paintProp = cs.fill === 'none' && cs.stroke !== 'none' ? 'stroke' : 'fill'
    // sampled fresh on every open, like the pen panel: the app's palette is
    // whatever it renders right now, and painting is what changes it
    this.renderPaintSwatches()
    this.syncPaintUi()
    this.layoutPaintPanel()
  }

  private setPaintProp(prop: 'fill' | 'stroke') {
    this.paintProp = prop
    // the swatches carry the prop in their tooltips ("paint stroke #6a7282"),
    // so they are rebuilt rather than left saying the opposite of what they do
    this.renderPaintSwatches()
    this.syncPaintUi()
  }

  private syncPaintUi() {
    const t = this.tweak
    if (!t) return
    this.paintWhat.textContent = `paint <${t.el.tagName.toLowerCase()}> · ${stampFile(t.srcLoc)}`
    for (const p of ['fill', 'stroke'] as const) {
      this.shadow.getElementById(`paint-${p}`)?.classList.toggle('on', this.paintProp === p)
    }
  }

  /**
   * The palette, plus a native colour input for everything else.
   *
   * The shape's OWN current fill and stroke lead the row: recolouring artwork
   * is mostly moving one shape to a colour already in the picture, and those
   * two are the colours the user is looking at.
   */
  private renderPaintSwatches() {
    const t = this.tweak
    if (!t) return
    const cs = getComputedStyle(t.el)
    const own = [toHex(cs.fill), toHex(cs.stroke)].filter((c): c is string => c != null)
    const seen = new Set<string>()
    const kids: HTMLElement[] = []
    for (const c of [...own, ...this.samplePageColors()]) {
      if (seen.has(c)) continue
      seen.add(c)
      kids.push(this.swatchButton(
        c, `paint ${this.paintProp} ${c}`, () => void this.paintShape(c),
      ))
    }
    const custom = document.createElement('input')
    custom.type = 'color'
    custom.id = 'paintCustom'
    custom.title = 'any other colour'
    custom.value = own[0] ?? '#ef4444'
    // 'change', not 'input': the native picker fires input on every drag of its
    // gradient, and each one of those would be a source edit and an undo step
    custom.addEventListener('change', () => void this.paintShape(custom.value))
    kids.push(custom)
    this.paintRow.replaceChildren(...kids)
  }

  /**
   * Keep the popover beside its shape. Right of it by preference (that keeps
   * the shape itself unobscured), flipped left when there is no room, and
   * clamped into the viewport — re-run from drawTweak on every repaint, so it
   * rides scroll, zoom and the HMR remount each paint causes.
   */
  private layoutPaintPanel() {
    const t = this.tweak
    if (!t || !this.paintOpen) return
    const r = this.selRect(t)
    const w = this.paintPanel.offsetWidth
    const h = this.paintPanel.offsetHeight
    let x = r.left + r.width + PANEL_GAP
    if (x + w > window.innerWidth - PANEL_GAP) x = r.left - w - PANEL_GAP
    x = Math.min(Math.max(PANEL_GAP, x), Math.max(PANEL_GAP, window.innerWidth - w - PANEL_GAP))
    const y = Math.min(
      Math.max(PANEL_GAP, r.top),
      Math.max(PANEL_GAP, window.innerHeight - h - PANEL_GAP),
    )
    this.paintPanel.style.left = `${String(Math.round(x))}px`
    this.paintPanel.style.top = `${String(Math.round(y))}px`
  }

  /**
   * Write the colour into source. The server owns the hard half: a literal
   * attribute is swapped, a missing one is added, a gradient reference has its
   * STOPS recoloured (shading kept) — and a value the page computes is refused,
   * because there is no literal there to edit.
   *
   * Refusals land on the status line verbatim: "nothing happened" with no
   * reason is the failure mode that makes a direct-manipulation tool feel
   * broken, and this one has an honest reason to give.
   */
  private async paintShape(value: string): Promise<void> {
    const t = this.tweak
    if (!t) return
    const prop = this.paintProp
    this.status(`painting ${prop} ${value}…`)
    try {
      const res = await fetch('/@s2c/paint', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ srcLoc: t.srcLoc, prop, value }),
      })
      const out = (await res.json()) as { ok: boolean; change?: string; file?: string; error?: string }
      if (!res.ok || !out.ok) throw new Error(out.error ?? `HTTP ${String(res.status)}`)
      this.status(`✓ ${out.change ?? 'painted'} in ${out.file ?? '?'} · 0 tokens · Ctrl+Z reverts`)
      // Same re-resolve as every other commit: HMR remounts the shape and the
      // selection has to survive it, or the second click of ten would paint
      // nothing. The tracking loop catches a fast remount; this catches a slow
      // one — and both keep the popover anchored, because it is laid out from
      // whatever element the selection currently holds.
      this.reselectAfterCommit(t)
    } catch (err) {
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
    }
  }

  // ---- the lasso: circle elements, get a component ----------------------
  // The gesture: hold Alt in tweak mode and drag a loop around a few elements
  // (Alt+L arms the next drag instead, for anyone who would rather not hold a
  // key). Alt is the one modifier free here — plain drag moves, handle drag
  // resizes, band drag spaces, shift+click multi-selects, double-click
  // rescopes — and it is already the overlay's own namespace (Alt+T, Alt+K),
  // so "hold the overlay's key and draw" reads as one idea rather than a
  // second convention.
  //
  // What comes back is decided server-side (siblings, contiguous, one file),
  // and its refusals are written for a human, so they are shown verbatim.

  /**
   * Pick the receipt back up after the reload the extract caused: say what was
   * written, and put the user back in tweak mode, where they were and where
   * the next lasso has to start. Runs once — the key is consumed.
   */
  private restoreAfterExtract() {
    let parked: { receipt?: unknown; at?: unknown } | null = null
    try {
      const raw = sessionStorage.getItem(EXTRACT_STORE_KEY)
      sessionStorage.removeItem(EXTRACT_STORE_KEY)
      parked = raw ? (JSON.parse(raw) as { receipt?: unknown; at?: unknown }) : null
    } catch { /* unreadable storage just means no receipt */ }
    if (!parked || typeof parked.receipt !== 'string') return
    // a stale key (an old tab restored from history) must not claim that
    // something was just written
    if (typeof parked.at !== 'number' || Date.now() - parked.at > EXTRACT_RECEIPT_MS) return
    if (this.mode !== 'tweak') this.toggleTweak()
    this.status(parked.receipt)
  }

  /** Alt+L: arm the next drag, entering tweak mode if we're not in it. */
  private armLasso() {
    if (this.lasso) {
      this.cancelLasso('lasso cancelled')
      return
    }
    // a lasso outside tweak mode has nothing to circle — the hit canvas isn't
    // even taking pointer events there, so arming alone would do nothing
    if (this.mode !== 'tweak') this.toggleTweak()
    this.lassoArmed = !this.lassoArmed
    this.status(
      this.lassoArmed
        ? 'lasso armed — drag a loop around the elements to extract (Esc cancels)'
        : 'lasso off — drag moves elements again',
    )
  }

  /** True while a drawn lasso is waiting for a name and a press. */
  private lassoPending(): boolean {
    return this.lasso != null && !this.lasso.drawing
  }

  /**
   * Every stamped element that could be caught, with its PAGE rect, measured
   * once at press time. Layout cannot move while a lasso is being drawn (the
   * lasso writes nothing), so this is both cheaper and steadier than
   * re-reading rects on every pointermove.
   */
  private lassoCandidates(): LassoState['cands'] {
    const out: LassoState['cands'] = []
    for (const el of document.querySelectorAll<HTMLElement>('[data-s2c]')) {
      const srcLoc = el.dataset.s2c
      if (!srcLoc || this.host.contains(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      out.push({ el, srcLoc, x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height })
    }
    return out
  }

  /**
   * The hit rule, in three passes:
   *
   *  1. GEOMETRY (see LASSO_INSIDE): centre inside the drawn path, box mostly
   *     inside the path's bounding box.
   *  2. VISIBILITY: at its own centre, the element has to be what the pointer
   *     would find — itself, something inside it, or (for pointer-events:none
   *     artwork) something that contains it. This is pickShape's guard, for
   *     pickShape's reason: the demo app has a full-bleed decorative SVG at
   *     -z-10, and without this, circling two cards catches seven invisible
   *     chevrons sitting BEHIND them — a selection spanning two files that the
   *     user never saw and the server rightly refuses.
   *  3. OUTERMOST only: circling two cards means the two cards, not also the
   *     six paragraphs inside them.
   */
  private lassoHits(l: LassoState): LassoHit[] {
    if (l.points.length < 3) return []
    const xs = l.points.map((p) => p.x)
    const ys = l.points.map((p) => p.y)
    const bx0 = Math.min(...xs)
    const by0 = Math.min(...ys)
    const bx1 = Math.max(...xs)
    const by1 = Math.max(...ys)
    const geo = l.cands.filter((c) => {
      if (!pointInPath(l.points, c.x + c.w / 2, c.y + c.h / 2)) return false
      const ox = Math.max(0, Math.min(bx1, c.x + c.w) - Math.max(bx0, c.x))
      const oy = Math.max(0, Math.min(by1, c.y + c.h) - Math.max(by0, c.y))
      return ox * oy >= LASSO_INSIDE * c.w * c.h
    })
    // one pointer-events toggle for the whole batch: elementUnder flips it per
    // call, and a style flush per candidate per pointermove is a frame tax
    this.canvas.style.pointerEvents = 'none'
    const caught = geo.filter((c) => {
      const u = document.elementFromPoint(c.x + c.w / 2 - window.scrollX, c.y + c.h / 2 - window.scrollY)
      // off-viewport (a scroll mid-lasso): geometry is the only evidence there is
      if (!u) return true
      return u === c.el || c.el.contains(u) || u.contains(c.el)
    })
    this.canvas.style.pointerEvents = ''
    return caught
      .filter((c) => !caught.some((o) => o !== c && o.el.contains(c.el)))
      .map((c) => ({ el: c.el, srcLoc: c.srcLoc, label: elLabel(c.el) }))
  }

  private startLasso(e: PointerEvent) {
    // a palette describing a selection we're about to replace is noise
    if (this.paintOpen) this.setPaintOpen(false)
    this.lassoArmed = false
    this.hoverEl = null
    this.lasso = {
      points: [{ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY }],
      cands: this.lassoCandidates(),
      hits: [],
      drawing: true,
    }
    this.canvas.setPointerCapture(e.pointerId)
    this.canvas.style.cursor = 'crosshair'
    this.status('drawing a lasso — circle the elements to extract')
    this.redraw()
  }

  private moveLasso(e: PointerEvent) {
    const l = this.lasso
    if (!l?.drawing) return
    const evs = 'getCoalescedEvents' in e ? e.getCoalescedEvents() : [e]
    for (const ev of evs) {
      l.points.push({ x: ev.clientX + window.scrollX, y: ev.clientY + window.scrollY })
    }
    l.hits = this.lassoHits(l)
    // the count is the live feedback: it tells the user whether the loop is
    // wide enough BEFORE they let go
    this.status(
      l.hits.length === 0
        ? 'lasso: nothing caught yet — go all the way round the elements'
        : `lasso: ${l.hits.length} element${l.hits.length === 1 ? '' : 's'} — ${l.hits.map((h) => h.label).join(', ')}`,
    )
    this.redraw()
  }

  private endLasso(e: PointerEvent) {
    const l = this.lasso
    if (!l?.drawing) return
    this.canvas.releasePointerCapture?.(e.pointerId)
    this.canvas.style.cursor = 'default'
    if (e.type === 'pointercancel') {
      this.cancelLasso('lasso cancelled')
      return
    }
    const xs = l.points.map((p) => p.x)
    const ys = l.points.map((p) => p.y)
    const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    if (span < LASSO_MIN_SPAN) {
      // an Alt+click, or a twitch: not a loop, and silently selecting whatever
      // was under it would be a different gesture than the one attempted
      this.cancelLasso('lasso too small — hold Alt and drag a loop around the elements')
      return
    }
    l.hits = this.lassoHits(l)
    if (l.hits.length === 0) {
      this.cancelLasso('lasso caught nothing — the loop has to go round an element’s centre')
      return
    }
    l.drawing = false
    this.openLassoConfirm(l)
  }

  /**
   * Show what is about to happen, then wait. A refactor that renames a file
   * and rewrites a call site is not something to fire off the back of a mouse
   * release — so the count, the elements, and the name are all on screen, and
   * nothing is written until the button (or Enter) is pressed.
   */
  private openLassoConfirm(l: LassoState) {
    const stamps = [...new Set(l.hits.map((h) => h.srcLoc))]
    const n = l.hits.length
    this.lassoWhat.textContent =
      `extract ${String(n)} element${n === 1 ? '' : 's'} into a component`
    this.lassoList.replaceChildren(...l.hits.map((h) => {
      const row = document.createElement('div')
      row.textContent = `${h.label} · ${stampFile(h.srcLoc)}`
      row.title = h.srcLoc
      return row
    }))
    // One stamp caught more than once = a .map() template: the extraction is
    // of the TEMPLATE, so every instance moves. Saying so here is cheaper than
    // the user discovering it from three cards changing at once.
    if (stamps.length < n) {
      const note = document.createElement('div')
      note.textContent = `(${String(stamps.length)} template${stamps.length === 1 ? '' : 's'} — the others are repeats of it)`
      note.style.color = '#c4b5fd'
      this.lassoList.appendChild(note)
    }
    // Neutral on purpose: the server will PascalCase whatever lands here and
    // fall back to exactly this when it is not a usable identifier.
    this.lassoName.value = 'Extracted'
    this.lassoPanel.classList.add('on')
    this.layoutLassoPanel()
    this.lassoName.focus()
    this.lassoName.select()
    this.status(`lasso: ${String(n)} element${n === 1 ? '' : 's'} — name it and press Enter, Esc cancels`)
    this.redraw()
  }

  /** Keep the confirmation beside the loop it describes (cf. layoutPaintPanel). */
  private layoutLassoPanel() {
    const l = this.lasso
    if (!l || l.drawing) return
    const xs = l.points.map((p) => p.x - window.scrollX)
    const ys = l.points.map((p) => p.y - window.scrollY)
    const right = Math.max(...xs)
    const top = Math.min(...ys)
    const w = this.lassoPanel.offsetWidth
    const h = this.lassoPanel.offsetHeight
    let x = right + PANEL_GAP
    if (x + w > window.innerWidth - PANEL_GAP) x = Math.min(...xs) - w - PANEL_GAP
    x = Math.min(Math.max(PANEL_GAP, x), Math.max(PANEL_GAP, window.innerWidth - w - PANEL_GAP))
    const y = Math.min(Math.max(PANEL_GAP, top), Math.max(PANEL_GAP, window.innerHeight - h - PANEL_GAP))
    this.lassoPanel.style.left = `${String(Math.round(x))}px`
    this.lassoPanel.style.top = `${String(Math.round(y))}px`
  }

  /** Drop the gesture with nothing written. Idempotent. */
  private cancelLasso(msg: string) {
    this.lasso = null
    this.lassoArmed = false
    this.lassoPanel.classList.remove('on')
    this.canvas.style.cursor = 'default'
    this.status(msg)
    this.redraw()
  }

  /**
   * POST the stamps. The server owns every hard question — are these siblings,
   * are they contiguous, which identifiers have to become props — and answers
   * refusals in sentences written to be read, so they land on the status line
   * WORD FOR WORD. "extract failed" would be the same information as nothing.
   */
  private async commitExtract(): Promise<void> {
    const l = this.lasso
    if (!l || l.drawing) return
    // dedupe: three cards from one .map() are one JSX element, and sending the
    // same stamp three times would only make the server dedupe it
    const srcLocs = [...new Set(l.hits.map((h) => h.srcLoc))]
    const name = this.lassoName.value.trim()
    this.status(`extracting ${String(srcLocs.length)} element${srcLocs.length === 1 ? '' : 's'}…`)
    this.lassoPanel.classList.remove('on')
    try {
      const res = await fetch('/@s2c/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ srcLocs, ...(name ? { name } : {}) }),
      })
      const out = (await res.json()) as {
        ok: boolean; file?: string; name?: string; from?: string; props?: string[]; error?: string
      }
      if (!res.ok || !out.ok) throw new Error(out.error ?? `HTTP ${String(res.status)}`)
      const props = out.props?.length ? ` · props: ${out.props.join(', ')}` : ''
      const receipt =
        `✓ ${out.name ?? 'component'} → ${out.file ?? '?'} · call site in ${out.from ?? '?'}${props} · ` +
        '0 tokens · Ctrl+Z undoes it'
      this.status(receipt)
      // …and park it where the reload this write is about to cause can't
      // destroy it (see EXTRACT_STORE_KEY)
      try {
        sessionStorage.setItem(EXTRACT_STORE_KEY, JSON.stringify({ receipt, at: Date.now() }))
      } catch { /* blocked storage: the receipt is just shorter-lived */ }
      // The page is about to hot-reload with a DIFFERENT tree: the elements
      // that were circled no longer exist at those stamps. Holding any of it
      // would leave the overlay outlining ghosts and pointing later edits at
      // lines that moved.
      this.lasso = null
      this.lassoArmed = false
      this.tweak = null
      this.multiSel = []
      this.hoverEl = null
      this.lastTweakClick = null
      this.redraw()
    } catch (err) {
      // keep the lasso and the panel: a refusal is usually fixable by drawing
      // a slightly different loop, and dropping the selection would make the
      // user start over to act on what they were just told
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
      if (this.lasso) {
        this.lassoPanel.classList.add('on')
        this.layoutLassoPanel()
      }
      this.redraw()
    }
  }

  /** The loop, the boxes it caught, and the count — violet throughout. */
  private drawLasso() {
    const l = this.lasso
    if (!l) return
    const { ctx } = this
    const sx = window.scrollX
    const sy = window.scrollY
    ctx.save()
    // caught boxes first, so the loop draws over them
    ctx.strokeStyle = LASSO_COLOR
    ctx.fillStyle = 'rgba(139,92,246,0.12)'
    ctx.lineWidth = 2
    for (const h of l.hits) {
      if (!document.contains(h.el)) continue
      const r = h.el.getBoundingClientRect()
      ctx.fillRect(r.left, r.top, r.width, r.height)
      ctx.strokeRect(r.left, r.top, r.width, r.height)
    }
    // the loop itself: dashed while it is still being drawn (it is not a shape
    // yet), closed and solid once it is waiting for confirmation
    ctx.beginPath()
    ctx.moveTo(l.points[0]!.x - sx, l.points[0]!.y - sy)
    for (const p of l.points.slice(1)) ctx.lineTo(p.x - sx, p.y - sy)
    if (!l.drawing) ctx.closePath()
    ctx.strokeStyle = LASSO_COLOR
    ctx.lineWidth = 2
    ctx.setLineDash(l.drawing ? [7, 5] : [])
    ctx.stroke()
    ctx.setLineDash([])
    // count badge at the loop's start, where the pointer began
    const n = l.hits.length
    const label = n === 0 ? 'lasso — nothing caught' : `${String(n)} to extract`
    ctx.font = '11px ui-sans-serif, system-ui'
    const lw = ctx.measureText(label).width + 12
    const lx = Math.max(2, Math.min(l.points[0]!.x - sx, window.innerWidth - lw - 2))
    const ly = Math.max(2, l.points[0]!.y - sy - 24)
    ctx.fillStyle = LASSO_COLOR
    ctx.beginPath()
    ctx.roundRect(lx, ly, lw, 17, 8)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(label, lx + 6, ly + 12)
    ctx.restore()
    if (!l.drawing) this.layoutLassoPanel()
  }

  /** Clamp a popover under the bar, shared by both panels. */
  private layoutPanel(panel: HTMLElement) {
    panel.style.left = '0px'
    const hudR = this.hud.getBoundingClientRect()
    const w = panel.offsetWidth
    const h = panel.offsetHeight
    const maxX = Math.max(PANEL_GAP, window.innerWidth - w - PANEL_GAP)
    const x = Math.min(Math.max(hudR.left, PANEL_GAP), maxX)
    panel.style.left = `${String(Math.round(x - hudR.left))}px`
    const fitsAbove = hudR.top - h - PANEL_GAP >= PANEL_GAP
    const fitsBelow = hudR.bottom + h + PANEL_GAP <= window.innerHeight - PANEL_GAP
    panel.classList.toggle('below', !fitsAbove && fitsBelow)
  }

  private layoutFidelityPanel() {
    if (!this.fidelityOpen) return
    // reset first: measuring while the last open's offset is still applied
    // would make each call compound the one before it
    this.fidelityPanel.style.left = '0px'
    const hudR = this.hud.getBoundingClientRect()
    const w = this.fidelityPanel.offsetWidth
    const h = this.fidelityPanel.offsetHeight
    const maxX = Math.max(PANEL_GAP, window.innerWidth - w - PANEL_GAP)
    const x = Math.min(Math.max(hudR.left, PANEL_GAP), maxX)
    this.fidelityPanel.style.left = `${String(Math.round(x - hudR.left))}px`
    // above is the default (the bar usually sits at the bottom); only flip
    // when above genuinely doesn't fit AND below does
    const fitsAbove = hudR.top - h - PANEL_GAP >= PANEL_GAP
    const fitsBelow = hudR.bottom + h + PANEL_GAP <= window.innerHeight - PANEL_GAP
    this.fidelityPanel.classList.toggle('below', !fitsAbove && fitsBelow)
  }

  /**
   * Persisted settings, same contract as the HUD's: localStorage can throw
   * outright (blocked storage, private mode) and its contents are
   * user-editable, so every field is validated on its own and anything
   * off-shape falls back to that field's default rather than dropping the
   * whole object.
   */
  private restoreFidelity() {
    let v: unknown = null
    try {
      const raw = localStorage.getItem(FIDELITY_STORE_KEY)
      v = raw ? (JSON.parse(raw) as unknown) : null
    } catch { /* unreadable storage just means the default settings */ }
    this.fidelity = parseFidelity(v)
    this.syncFidelityUi()
  }

  /**
   * Re-enter a past run's settings from `?s2c-reuse=<runId>`.
   *
   * This is the other half of the runs page's "reuse": the settings a run used
   * are already on disk in its bundle, so restoring them needs no clipboard
   * and no retyping. The NOTES are deliberately not re-added — they were
   * anchored to that run's ink, which no longer exists, so they are reported
   * rather than resurrected.
   */
  private async restoreFromRun() {
    const id = new URLSearchParams(location.search).get('s2c-reuse')
    if (!id || !/^[\w.-]+$/.test(id)) return
    // drop the parameter immediately: a reload should not silently re-apply
    // settings the user may have changed since
    const url = new URL(location.href)
    url.searchParams.delete('s2c-reuse')
    history.replaceState(null, '', url.toString())
    try {
      const res = await fetch(`/@s2c/runs/${encodeURIComponent(id)}/settings.json`)
      if (!res.ok) {
        this.status(`couldn't reuse ${id} — no such run`, true)
        return
      }
      const body = (await res.json()) as { fidelity?: unknown; notes?: unknown; mode?: unknown }
      if (body.fidelity) {
        this.fidelity = parseFidelity(body.fidelity)
        this.saveFidelity()
        this.syncFidelityUi()
      }
      if (body.mode === 'gesture' || body.mode === 'design' || body.mode === 'screenshot') {
        this.setRunMode(body.mode)
      }
      const notes = Array.isArray(body.notes) ? body.notes.filter((n) => typeof n === 'string') : []
      this.status(
        `settings from ${id}: ${this.fidelityZone().name} ` +
        `${Math.round(this.fidelity.resemblance * 100)}% · ${FILL_LABELS[this.fidelity.fill].label}` +
        (notes.length ? ` · that run also had ${notes.length} typed note(s) — draw and retype if you want them` : ''),
      )
    } catch {
      this.status(`couldn't reach the run history for ${id}`, true)
    }
  }

  private saveFidelity() {
    try {
      localStorage.setItem(FIDELITY_STORE_KEY, JSON.stringify(this.fidelityPayload()))
    } catch { /* quota/blocked: the defaults are a fine place to land */ }
  }

  /**
   * The wire shape, rebuilt fresh for every request. Resemblance is snapped
   * to 2dp so the number the panel shows and the number the server scores
   * against are the same one — float noise off a raw slider ratio would make
   * "70%" arrive as 0.7000000000000001.
   */
  private fidelityPayload(): Fidelity {
    const f = this.fidelity
    return {
      resemblance: Math.round(Math.min(1, Math.max(0, f.resemblance)) * 100) / 100,
      keep: {
        asymmetry: f.keep.asymmetry, rhythm: f.keep.rhythm,
        proportions: f.keep.proportions, placement: f.keep.placement,
      },
      palette: f.palette === 'sketch' ? 'sketch' : 'app',
      fill: FILL_KEYS.includes(f.fill) ? f.fill : 'filled',
      style: STYLE_KEYS.includes(f.style) ? f.style : DEFAULT_STYLE,
    }
  }

  // ---- drawn rules: the ink that stays ----------------------------------
  // Alt+Shift+R, then drag a line: down the two edges that should stay
  // aligned, or across the gap that should stay. The server reads the
  // geometry and answers with every rule that line could mean, each measured
  // against the page; one of them is chosen and saved.
  //
  // After that the rule is checked on every edit and on every run, using the
  // same evaluator the verification round uses — so a badge on the page and a
  // failure in a run can never disagree.

  /** Alt+Shift+R: arm the next drag as a rule line. */
  private armRule() {
    if (this.ruleDraw) {
      this.cancelRule('rule cancelled — nothing saved')
      return
    }
    // a rule is about elements, and only tweak mode is hit-testing them
    if (this.mode !== 'tweak') this.toggleTweak()
    this.ruleArmed = !this.ruleArmed
    if (this.ruleArmed) this.lassoArmed = false
    this.status(
      this.ruleArmed
        ? 'rule armed — drag a line down the edges that must stay aligned, or across a gap (Esc cancels)'
        : 'rule off — drag moves elements again',
    )
  }

  /**
   * What the line actually runs along, in order of how much of the line each
   * element accounts for.
   *
   * This answers the question geometry cannot. A form input, its wrapper div,
   * its label and the <form> can all share the same left edge, because nothing
   * pads them apart — a line down that edge is equally near all four, and the
   * choice decides whether the rule watches the fields or some text above
   * them. The hit test knows, because it respects stacking, visibility and
   * pointer-events: it sees what the user saw.
   *
   * Sampled along the whole line rather than at its two ends, because where a
   * drag STARTS is the least deliberate part of it — beginning four pixels
   * high lands on the label and would quietly make the rule about that.
   */
  private stampsAlong(from: XY, to: XY): string[] {
    const n = 24
    const counts = new Map<string, number>()
    // one pointer-events toggle for the whole batch, as lassoHits does: a
    // style flush per sample is a frame's worth of work for nothing
    this.canvas.style.pointerEvents = 'none'
    for (let i = 0; i <= n; i++) {
      const x = from.x + ((to.x - from.x) * i) / n - window.scrollX
      const y = from.y + ((to.y - from.y) * i) / n - window.scrollY
      let el: Element | null = document.elementFromPoint(x, y)
      while (el) {
        const stamp = (el as HTMLElement).dataset?.s2c
        if (stamp && !this.host.contains(el)) {
          counts.set(stamp, (counts.get(stamp) ?? 0) + 1)
          break
        }
        el = el.parentElement
      }
    }
    this.canvas.style.pointerEvents = ''
    // ranked, and more than two: the server drops any that turn out to nest
    // each other, and needs something left over when it does
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s)
  }

  /** Alt+W: show/hide the rules that are HOLDING. Broken ones always show. */
  private toggleWatching() {
    this.watching = !this.watching
    this.watchPanel.classList.toggle('on', this.watching)
    if (this.watching) void this.refreshRules()
    this.status(
      this.watching
        ? this.rulesSummary(true)
        : 'rules hidden — a broken one will still show itself',
    )
    this.redraw()
  }

  /** True while a drawn line is waiting for a reading to be picked. */
  private rulePending(): boolean {
    return this.ruleDraw != null && !this.ruleDraw.drawing
  }

  private rulesSummary(verbose = false): string {
    const n = this.rules.length
    const bad = this.rules.filter((r) => r.broken).length
    if (n === 0) {
      return verbose ? 'no rules yet — Alt+Shift+R draws one' : ''
    }
    const head = `${String(n)} rule${n === 1 ? '' : 's'} watched`
    if (bad === 0) return `${head} · all holding`
    return `${head} · ${String(bad)} broken`
  }

  private startRuleLine(e: PointerEvent) {
    if (this.paintOpen) this.setPaintOpen(false)
    this.ruleArmed = false
    this.hoverEl = null
    const at = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY }
    this.ruleDraw = { from: at, to: at, under: [], drawing: true, proposals: [], choice: 0 }
    this.canvas.setPointerCapture(e.pointerId)
    this.canvas.style.cursor = 'crosshair'
    this.status('drawing a rule line — release it across what the rule is about')
    this.redraw()
  }

  /**
   * A rule line is STRAIGHT, anchored at the press.
   *
   * Freehand would be the wrong shape for this: a rule is about an axis, and
   * the axis is the one thing the gesture has to state exactly. Rubber-banding
   * from the press point says "this line, this direction" while it is still
   * being aimed.
   */
  private moveRuleLine(e: PointerEvent) {
    const r = this.ruleDraw
    if (!r?.drawing) return
    r.to = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY }
    const dx = Math.abs(r.to.x - r.from.x)
    const dy = Math.abs(r.to.y - r.from.y)
    const span = Math.hypot(dx, dy)
    this.status(
      span < RULE_MIN_SPAN
        ? 'rule line too short — drag it along the edges the rule is about'
        : `rule line: ${dy > dx ? 'vertical' : 'horizontal'}, ${String(Math.round(span))}px`,
    )
    this.redraw()
  }

  private async endRuleLine(e: PointerEvent): Promise<void> {
    const r = this.ruleDraw
    if (!r?.drawing) return
    this.canvas.releasePointerCapture?.(e.pointerId)
    this.canvas.style.cursor = 'default'
    if (e.type === 'pointercancel') {
      this.cancelRule('rule cancelled')
      return
    }
    const span = Math.hypot(r.to.x - r.from.x, r.to.y - r.from.y)
    if (span < RULE_MIN_SPAN) {
      this.cancelRule('rule line too short — drag it along the edges the rule is about')
      return
    }
    r.drawing = false
    // once, at release: the line is final, and 25 hit tests per pointermove
    // would be a frame tax for an answer nobody has asked for yet
    r.under = this.stampsAlong(r.from, r.to)
    this.status('reading the line…')
    this.redraw()
    try {
      const res = await fetch('/@s2c/rules/propose', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({
          line: { x0: r.from.x, y0: r.from.y, x1: r.to.x, y1: r.to.y },
          under: r.under,
          snapshot: this.snapshot(),
        }),
      })
      const out = (await res.json()) as { ok: boolean; proposals?: RuleProposal[]; error?: string }
      if (!out.ok || !out.proposals?.length) {
        // the server's refusals name the fix ("draw it down the edges, or
        // across the gap") so they travel word for word
        this.cancelRule(`✗ ${out.error ?? 'nothing to make a rule about there'}`)
        return
      }
      r.proposals = out.proposals
      r.choice = 0
      this.openRuleConfirm(r)
    } catch (err) {
      this.cancelRule(`✗ ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private openRuleConfirm(r: RuleDraw) {
    const subjects = [...new Set(r.proposals.flatMap((p) => p.labels))]
    this.ruleWhat.textContent = subjects.length === 1
      ? `a rule about ${subjects[0]!}`
      : `a rule between ${subjects.slice(0, 2).join(' and ')}`
    this.renderReadings(r)
    this.ruleNote.value = ''
    this.rulePanel.classList.add('on')
    this.layoutRulePanel()
    this.ruleNote.focus()
    this.status(`${String(r.proposals.length)} readings — 1–5 picks one, Enter saves it, Esc cancels`)
    this.redraw()
  }

  private renderReadings(r: RuleDraw) {
    this.ruleList.replaceChildren(...r.proposals.map((p, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-checked', String(i === r.choice))
      b.dataset.kind = p.kind
      const key = document.createElement('span')
      key.className = 'rKey'
      key.textContent = `${String(i + 1)}`
      const read = document.createElement('span')
      read.className = 'rRead'
      read.textContent = p.reading
      b.append(key, document.createTextNode(p.desc), read)
      b.addEventListener('click', () => this.pickReading(i))
      return b
    }))
  }

  /** Choose which reading gets saved. Out-of-range keys are simply ignored. */
  private pickReading(i: number) {
    const r = this.ruleDraw
    if (!r || r.drawing || i < 0 || i >= r.proposals.length) return
    r.choice = i
    this.renderReadings(r)
    this.status(`${r.proposals[i]!.desc} — Enter saves it`)
    this.redraw()
  }

  /** Keep the confirmation beside the line it describes (cf. layoutLassoPanel). */
  private layoutRulePanel() {
    const r = this.ruleDraw
    if (!r || r.drawing) return
    const xs = [r.from.x - window.scrollX, r.to.x - window.scrollX]
    const ys = [r.from.y - window.scrollY, r.to.y - window.scrollY]
    const w = this.rulePanel.offsetWidth
    const h = this.rulePanel.offsetHeight
    let x = Math.max(...xs) + PANEL_GAP
    if (x + w > window.innerWidth - PANEL_GAP) x = Math.min(...xs) - w - PANEL_GAP
    x = Math.min(Math.max(PANEL_GAP, x), Math.max(PANEL_GAP, window.innerWidth - w - PANEL_GAP))
    const y = Math.min(Math.max(PANEL_GAP, Math.min(...ys)), Math.max(PANEL_GAP, window.innerHeight - h - PANEL_GAP))
    this.rulePanel.style.left = `${String(Math.round(x))}px`
    this.rulePanel.style.top = `${String(Math.round(y))}px`
  }

  /** Drop the gesture with nothing saved. Idempotent. */
  private cancelRule(msg: string) {
    this.ruleDraw = null
    this.ruleArmed = false
    this.rulePanel.classList.remove('on')
    this.canvas.style.cursor = 'default'
    this.status(msg, msg.startsWith('✗'))
    this.redraw()
  }

  private async commitRule(): Promise<void> {
    const r = this.ruleDraw
    if (!r || r.drawing) return
    const p = r.proposals[r.choice]
    if (!p) return
    const note = this.ruleNote.value.trim()
    this.rulePanel.classList.remove('on')
    try {
      const res = await fetch('/@s2c/rules/add', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({
          kind: p.kind, subjects: p.subjects, value: p.value, tolerance: p.tolerance,
          ...(note ? { note } : {}),
        }),
      })
      const out = (await res.json()) as { ok: boolean; error?: string }
      if (!out.ok) throw new Error(out.error ?? `HTTP ${String(res.status)}`)
      this.ruleDraw = null
      // a rule you just drew is one you want to see: turn the marks on
      this.watching = true
      this.watchPanel.classList.add('on')
      await this.refreshRules()
      this.status(`✓ watching: ${p.desc} · 0 tokens · checked on every edit and every run`)
    } catch (err) {
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
      if (this.ruleDraw) {
        this.rulePanel.classList.add('on')
        this.layoutRulePanel()
      }
    }
    this.redraw()
  }

  /**
   * Re-measure every rule against the page as it is now.
   *
   * Cheap (one snapshot, no model) and the answer is only meaningful after
   * layout has settled, so callers debounce through scheduleRuleCheck rather
   * than calling this on every mutation.
   */
  private async refreshRules(): Promise<void> {
    try {
      const res = await fetch('/@s2c/rules/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ snapshot: this.snapshot() }),
      })
      const out = (await res.json()) as { ok: boolean; rules?: RuleView[] }
      if (!out.ok || !out.rules) return
      const wasBroken = this.rules.filter((r) => r.broken).map((r) => r.id).join(',')
      this.rules = out.rules
      this.renderWatchList()
      const nowBroken = this.rules.filter((r) => r.broken)
      // Only SAY something when the answer changed: a rule that has been
      // broken for ten edits should not narrate itself on each one, and a
      // rule that just broke is the most important thing on screen.
      if (nowBroken.length && nowBroken.map((r) => r.id).join(',') !== wasBroken) {
        const first = nowBroken[0]!
        this.status(
          `⚠ ${first.desc} — ${first.message ?? 'broken'}${nowBroken.length > 1 ? ` (+${String(nowBroken.length - 1)} more)` : ''}`,
          true,
        )
      }
      this.redraw()
    } catch { /* an older dev server without the rules endpoints just has none */ }
  }

  /** Coalesce the checks an edit's HMR, reflow and remount would each trigger. */
  private scheduleRuleCheck(delay = 400) {
    if (this.ruleCheckTimer) clearTimeout(this.ruleCheckTimer)
    this.ruleCheckTimer = setTimeout(() => {
      this.ruleCheckTimer = null
      void this.refreshRules()
    }, delay)
  }

  private renderWatchList() {
    const n = this.rules.length
    this.watchHead.textContent = n === 0 ? 'watching nothing yet' : this.rulesSummary()
    if (n === 0) {
      const empty = document.createElement('div')
      empty.className = 'wRow wOk'
      empty.textContent = 'Alt+Shift+R, then drag a line down two edges.'
      this.watchList.replaceChildren(empty)
      return
    }
    this.watchList.replaceChildren(...this.rules.map((r) => {
      const row = document.createElement('div')
      row.className = 'wRow'
      const text = document.createElement('div')
      text.className = 'wText'
      const head = document.createElement('div')
      head.className = r.broken ? 'wBroken' : 'wOk'
      head.textContent = `${r.broken ? '⚠ ' : '✓ '}${r.desc}`
      text.appendChild(head)
      if (r.broken && r.message) {
        const why = document.createElement('div')
        why.className = 'wBroken'
        why.textContent = r.message
        text.appendChild(why)
      }
      if (r.note) {
        const note = document.createElement('div')
        note.className = 'wNote'
        note.textContent = `“${r.note}”`
        text.appendChild(note)
      }
      const del = document.createElement('button')
      del.type = 'button'
      del.textContent = '✕'
      del.title = 'stop watching this'
      del.dataset.ruleId = r.id
      del.addEventListener('click', () => void this.forgetRule(r.id))
      row.append(text, del)
      return row
    }))
  }

  private async forgetRule(id: string): Promise<void> {
    const gone = this.rules.find((r) => r.id === id)
    try {
      await fetch('/@s2c/rules/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ id }),
      })
      await this.refreshRules()
      this.status(`stopped watching: ${gone?.desc ?? id}`)
    } catch (err) {
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
    }
  }

  /**
   * The rule line in flight, and every rule worth showing.
   *
   * A broken rule draws whether or not the user asked to see rules: that is
   * the entire point of having drawn it. A holding one draws only while
   * watching is on, because a page wearing every invariant it satisfies is
   * unreadable.
   */
  private drawRules() {
    const { ctx } = this
    const sx = window.scrollX
    const sy = window.scrollY
    for (const r of this.rules) {
      if (!r.broken && !this.watching) continue
      const rects = r.rects.filter((x): x is NonNullable<typeof x> => x != null)
      if (rects.length === 0) continue
      const colour = r.broken ? RULE_BROKEN : RULE_OK
      ctx.save()
      ctx.strokeStyle = colour
      ctx.lineWidth = r.broken ? 2 : 1.5
      ctx.setLineDash(r.broken ? [] : [5, 4])
      const mark = this.ruleMark(r, rects)
      ctx.beginPath()
      for (const [a, b] of mark.lines) {
        ctx.moveTo(a.x - sx, a.y - sy)
        ctx.lineTo(b.x - sx, b.y - sy)
      }
      ctx.stroke()
      ctx.setLineDash([])
      // the label: what it says, and what reality says when they differ
      const label = r.broken ? `${r.desc} — ${r.message ?? 'broken'}` : r.desc
      this.ruleBadge(mark.at.x - sx, mark.at.y - sy, label, colour)
      ctx.restore()
    }

    const d = this.ruleDraw
    if (!d) return
    ctx.save()
    ctx.strokeStyle = RULE_OK
    ctx.lineWidth = 2
    ctx.setLineDash(d.drawing ? [7, 5] : [])
    ctx.beginPath()
    ctx.moveTo(d.from.x - sx, d.from.y - sy)
    ctx.lineTo(d.to.x - sx, d.to.y - sy)
    ctx.stroke()
    ctx.setLineDash([])
    // end caps, so a rule line reads as a measurement rather than a stroke
    for (const p of [d.from, d.to]) {
      ctx.beginPath()
      ctx.arc(p.x - sx, p.y - sy, 3, 0, Math.PI * 2)
      ctx.fillStyle = RULE_OK
      ctx.fill()
    }
    if (!d.drawing && d.proposals[d.choice]) {
      this.ruleBadge(d.to.x - sx, d.to.y - sy, d.proposals[d.choice]!.desc, RULE_OK)
    }
    ctx.restore()
  }

  /**
   * Where a rule's mark goes: along the edge it is about, so the mark is the
   * rule rather than a decoration near it.
   */
  private ruleMark(
    r: RuleView,
    rects: { x: number; y: number; w: number; h: number }[],
  ): { lines: [XY, XY][]; at: XY } {
    const [a, b] = rects as [typeof rects[0], typeof rects[0] | undefined]
    const pad = 6
    if (!b) {
      // a rule about one element: ring its box
      return {
        lines: [
          [{ x: a.x, y: a.y }, { x: a.x + a.w, y: a.y }],
          [{ x: a.x + a.w, y: a.y }, { x: a.x + a.w, y: a.y + a.h }],
          [{ x: a.x + a.w, y: a.y + a.h }, { x: a.x, y: a.y + a.h }],
          [{ x: a.x, y: a.y + a.h }, { x: a.x, y: a.y }],
        ],
        at: { x: a.x, y: a.y },
      }
    }
    const y0 = Math.min(a.y, b.y) - pad
    const y1 = Math.max(a.y + a.h, b.y + b.h) + pad
    const x0 = Math.min(a.x, b.x) - pad
    const x1 = Math.max(a.x + a.w, b.x + b.w) + pad
    switch (r.kind) {
      case 'aligned-left':
        return { lines: [[{ x: a.x, y: y0 }, { x: a.x, y: y1 }], [{ x: b.x, y: y0 }, { x: b.x, y: y1 }]], at: { x: Math.min(a.x, b.x), y: y0 } }
      case 'aligned-right': {
        const ra = a.x + a.w
        const rb = b.x + b.w
        return { lines: [[{ x: ra, y: y0 }, { x: ra, y: y1 }], [{ x: rb, y: y0 }, { x: rb, y: y1 }]], at: { x: Math.max(ra, rb), y: y0 } }
      }
      case 'aligned-top':
        return { lines: [[{ x: x0, y: a.y }, { x: x1, y: a.y }], [{ x: x0, y: b.y }, { x: x1, y: b.y }]], at: { x: x0, y: Math.min(a.y, b.y) } }
      case 'aligned-bottom': {
        const ba = a.y + a.h
        const bb = b.y + b.h
        return { lines: [[{ x: x0, y: ba }, { x: x1, y: ba }], [{ x: x0, y: bb }, { x: x1, y: bb }]], at: { x: x0, y: Math.max(ba, bb) } }
      }
      case 'same-width':
        return {
          lines: [
            [{ x: a.x, y: a.y + a.h + pad }, { x: a.x + a.w, y: a.y + a.h + pad }],
            [{ x: b.x, y: b.y + b.h + pad }, { x: b.x + b.w, y: b.y + b.h + pad }],
          ],
          at: { x: a.x, y: a.y + a.h + pad },
        }
      case 'same-height':
        return {
          lines: [
            [{ x: a.x + a.w + pad, y: a.y }, { x: a.x + a.w + pad, y: a.y + a.h }],
            [{ x: b.x + b.w + pad, y: b.y }, { x: b.x + b.w + pad, y: b.y + b.h }],
          ],
          at: { x: a.x + a.w + pad, y: a.y },
        }
      case 'inside':
        return {
          lines: [
            [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }],
            [{ x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }],
            [{ x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }],
            [{ x: b.x, y: b.y + b.h }, { x: b.x, y: b.y }],
          ],
          at: { x: b.x, y: b.y },
        }
      default: {
        // gap and order: the span between the two, along whichever axis
        // actually separates them
        const vertical = Math.abs(centre(a).y - centre(b).y) >= Math.abs(centre(a).x - centre(b).x)
        const [lo, hi] = (vertical ? a.y <= b.y : a.x <= b.x) ? [a, b] : [b, a]
        const p1 = vertical
          ? { x: centre(lo).x, y: lo.y + lo.h }
          : { x: lo.x + lo.w, y: centre(lo).y }
        const p2 = vertical ? { x: centre(lo).x, y: hi.y } : { x: hi.x, y: centre(lo).y }
        return { lines: [[p1, p2]], at: p1 }
      }
    }
  }

  /** A small rounded caption, clamped into the viewport (cf. drawLasso's). */
  private ruleBadge(x: number, y: number, text: string, colour: string) {
    const { ctx } = this
    ctx.font = '11px ui-sans-serif, system-ui'
    const label = text.length > 64 ? `${text.slice(0, 63)}…` : text
    const w = ctx.measureText(label).width + 12
    const lx = Math.max(2, Math.min(x, window.innerWidth - w - 2))
    const ly = Math.max(2, Math.min(y - 22, window.innerHeight - 19))
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.roundRect(lx, ly, w, 17, 8)
    ctx.fill()
    ctx.fillStyle = '#0b1120'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, lx + 6, ly + 9)
    ctx.textBaseline = 'alphabetic'
  }

  // ---- the element library ----------------------------------------------
  // Alt+Shift+L. Entries file themselves: a sketch that became a component, a
  // lasso that extracted one. An entry is a POINTER to a component that already
  // compiles here, so placing it is an import and a JSX insert — which means
  // using the same entry five times makes five usages of one component, rather
  // than five copies that then drift apart.

  /** Ink gone, query gone: the panel goes back to the whole library. */
  private endSketchSearch() {
    if (this.libSearchTimer) clearTimeout(this.libSearchTimer)
    this.libSearchTimer = null
    if (!this.libSearching) return
    this.libSearching = false
    // drop the scores here rather than waiting for the reload: otherwise there
    // is a window where nothing is being searched and every entry still carries
    // a match percentage from a sketch that no longer exists
    this.entries = this.entries.map(({ score: _score, ...rest }) => rest)
    this.renderLibrary()
    if (this.libOpen) void this.loadEntries()
  }

  private async setLibOpen(on: boolean): Promise<void> {
    this.libOpen = on
    this.libPanel.classList.toggle('on', on)
    if (!on) {
      this.libArmed = null
      return
    }
    await this.loadEntries()
    // A run files what it created without a picture, because only the page can
    // draw one. This is where that debt gets paid — along with the outlines that
    // make a component findable by drawing at it.
    void this.backfillThumbs()
    if (this.strokes.length > 0) {
      // there is ink on the page: that IS the query
      await this.searchBySketch()
      return
    }
    this.status(
      this.entries.length === 0
        ? 'library is empty — sketch something, or lasso a few elements into a component'
        : `${String(this.entries.length)} in the library · draw something to search by shape`,
    )
  }

  private async loadEntries(): Promise<void> {
    try {
      const res = await fetch('/@s2c/library/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: '{}',
      })
      const out = (await res.json()) as { ok: boolean; entries?: LibEntry[] }
      // A portable entry lives in BOTH libraries — this project's and the
      // global one that follows the user. They are one thing, and showing two
      // cards for it invites picking "the wrong copy" of something that has no
      // copies. The global row is dropped when the project already has it;
      // global rows for things this project has never seen do show, because
      // those are the entries that travelled here.
      this.entries = (out.ok ? (out.entries ?? []) : [])
        .filter((e) => !(e.home === 'global' && e.alreadyHere))
      this.renderLibrary()
    } catch { /* an older dev server simply has no library */ }
  }

  /**
   * File a component that is on the page right now.
   *
   * The picture is the part only the page can supply, and the element has to
   * have rendered before it can be drawn — so this waits for something stamped
   * into that file to appear rather than assuming HMR has already landed.
   */
  private async captureToLibrary(
    file: string,
    kind: 'drawn' | 'extracted',
    name?: string,
  ): Promise<void> {
    const els = await this.waitForStampedIn(file)
    try {
      await fetch('/@s2c/library/capture', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({
          file, kind, ...(name ? { name } : {}),
          ...(els.length ? { thumbnail: this.thumbnail(unionRect(els)) } : {}),
        }),
      })
      if (this.libOpen) await this.loadEntries()
    } catch { /* the edit landed; filing it is a bonus */ }
  }

  /**
   * Every root a given file renders, once they exist.
   *
   * A set, not one element: a component can return a FRAGMENT, and an extracted
   * run of siblings always does. Taking the first root then measures a third of
   * a nav row and calls it the component.
   */
  private async waitForStampedIn(file: string, ms = 4000): Promise<HTMLElement[]> {
    const deadline = performance.now() + ms
    while (performance.now() < deadline) {
      const all = [...document.querySelectorAll<HTMLElement>(`[data-s2c^="${file}:"]`)]
        .filter((e) => !this.host.contains(e))
      // the outermost ones: a component's picture is the whole component, not
      // the paragraphs inside it
      const roots = all.filter((e) => !all.some((o) => o !== e && o.contains(e)))
        .filter((e) => {
          const r = e.getBoundingClientRect()
          return r.width >= 1 && r.height >= 1
        })
      if (roots.length) return roots
      await new Promise((r) => setTimeout(r, 200))
    }
    return []
  }

  /** Give a picture to entries filed by the server, which has no page. */
  private async backfillThumbs(): Promise<void> {
    let filled = false
    for (const e of this.entries) {
      // a drawn entry already has the truest shape there is — its ink — so only
      // the picture is missing; one that was never drawn needs both
      const wantsThumb = !e.thumb
      const wantsShape = e.kind !== 'drawn'
      if (e.home !== 'project' || (!wantsThumb && !wantsShape)) continue
      const els = await this.waitForStampedIn(e.file, 600)
      if (els.length === 0) continue
      try {
        await fetch('/@s2c/library/capture', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
          body: JSON.stringify({
            file: e.file, exportName: e.exportName, name: e.name, kind: e.kind,
            ...(wantsThumb ? { thumbnail: this.thumbnail(unionRect(els)) } : {}),
            ...(wantsShape ? { outlines: this.outlinesOf(els) } : {}),
          }),
        })
        filled = true
      } catch { break }
    }
    if (filled && this.libOpen) {
      if (this.libSearching) await this.searchBySketch()
      else await this.loadEntries()
    }
  }


  /**
   * The outlines of a rendered component: its own box, the boxes inside it, and
   * its text as single bars.
   *
   * This is what makes a component findable by drawing at it. Ink is the best
   * shape an entry can have, but an extracted card was never drawn, and a
   * component of plain divs has no SVG geometry for the source reader to find
   * either — so without this, half the library could never be searched. Edges
   * rather than filled areas, because that is what people draw: a solid block
   * and a sketched rectangle score poorly against each other, while every solid
   * block scores well against every other.
   *
   * Element-local coordinates: the signature is normalised to its own bounding
   * box anyway, and sending page coordinates would only invite a reader to think
   * position mattered.
   */
  private outlinesOf(els: HTMLElement[], cap = 60): { x: number; y: number }[][] {
    const base = unionRect(els)
    if (base.w < 1 || base.h < 1) return []
    const out: { x: number; y: number }[][] = []
    const push = (r: DOMRect) => {
      const x = r.left + window.scrollX - base.x
      const y = r.top + window.scrollY - base.y
      out.push([
        { x, y }, { x: x + r.width, y }, { x: x + r.width, y: y + r.height },
        { x, y: y + r.height }, { x, y },
      ])
    }
    for (const el of els) {
      if (out.length >= cap) break
      push(el.getBoundingClientRect())
      for (const child of el.querySelectorAll<HTMLElement>('*')) {
        if (out.length >= cap) break
        if (this.host.contains(child)) continue
        const r = child.getBoundingClientRect()
        if (r.width < 4 || r.height < 4) continue
        const cs = getComputedStyle(child)
        if (cs.visibility === 'hidden' || cs.display === 'none') continue
        // text becomes one bar through its middle, which is how a person
        // sketches a line of text; everything else keeps its edges
        const ownText = [...child.childNodes]
          .some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0)
        if (ownText && child.children.length === 0) {
          const y = r.top + window.scrollY - base.y + r.height / 2
          out.push([
            { x: r.left + window.scrollX - base.x, y },
            { x: r.right + window.scrollX - base.x, y },
          ])
        } else {
          push(r)
        }
      }
    }
    return out
  }

  /**
   * Rank the library against what is drawn right now.
   *
   * Runs on its own when the panel opens with ink on the page, and again as the
   * drawing grows: the whole point is that you do not have to remember what you
   * called something, so making it a second deliberate action would give the
   * feature back its problem.
   */
  private async searchBySketch(): Promise<void> {
    if (this.strokes.length === 0) {
      if (this.libSearching) {
        this.libSearching = false
        await this.loadEntries()
      }
      return
    }
    try {
      const res = await fetch('/@s2c/library/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ strokes: this.strokesForWire() }),
      })
      const out = (await res.json()) as { ok: boolean; matches?: LibEntry[]; error?: string }
      if (!out.ok || !out.matches) return
      this.libSearching = true
      this.entries = out.matches.filter((e) => !(e.home === 'global' && e.alreadyHere))
      this.renderLibrary()
      const best = this.entries[0]
      if (best && (best.score ?? 0) > 0) {
        this.status(
          `closest to your sketch: ${best.name} (${String(Math.round((best.score ?? 0) * 100))}%) — ` +
          'click it, then click where it should go',
        )
      }
    } catch { /* an older dev server just cannot search */ }
  }

  /** Coalesce the searches a fast scribble would otherwise fire. */
  private scheduleSketchSearch(delay = 500) {
    if (!this.libOpen) return
    if (this.libSearchTimer) clearTimeout(this.libSearchTimer)
    this.libSearchTimer = setTimeout(() => {
      this.libSearchTimer = null
      void this.searchBySketch()
    }, delay)
  }

  private renderLibrary() {
    const n = this.entries.length
    this.libHead.textContent = n === 0
      ? 'library — nothing filed yet'
      : this.libSearching ? `library · closest to your sketch` : `library · ${String(n)}`
    if (n === 0) {
      const empty = document.createElement('div')
      empty.className = 'lMeta'
      empty.textContent = 'Sketch something, or lasso elements into a component — whatever you make is filed here.'
      this.libGrid.replaceChildren(empty)
      return
    }
    this.libGrid.replaceChildren(...this.entries.map((e) => {
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'lCard'
      card.dataset.entryId = e.id
      card.setAttribute('aria-pressed', String(this.libArmed?.id === e.id))
      if (e.thumb) {
        const img = document.createElement('img')
        img.src = `/@s2c/library/thumb?id=${encodeURIComponent(e.id)}&home=${e.home}`
        img.alt = e.name
        card.appendChild(img)
      } else {
        const none = document.createElement('div')
        none.className = 'lNoShot'
        none.textContent = '◌'
        card.appendChild(none)
      }
      const nm = document.createElement('div')
      nm.className = 'lName'
      nm.textContent = e.name
      const meta = document.createElement('div')
      meta.className = 'lMeta'
      // the globe earns its place: it is the difference between an entry that
      // follows you to the next project and one that cannot
      meta.textContent = this.libSearching
        // while searching, how well it matches is the only thing worth the row
        ? ((e.score ?? 0) > 0 ? `${String(Math.round((e.score ?? 0) * 100))}% match` : 'no shape on file')
        : (e.home === 'global' ? '🌐 anywhere' : (e.portable ? '🌐 travels' : e.kind))
      const drop = document.createElement('button')
      drop.type = 'button'
      drop.className = 'lDrop'
      drop.textContent = '✕'
      drop.title = `forget ${e.name} (your component file is untouched)`
      drop.dataset.forget = e.id
      drop.addEventListener('click', (ev) => {
        ev.stopPropagation()
        void this.forgetEntry(e)
      })
      card.append(nm, meta, drop)
      card.title = `${e.name} · ${e.file}${e.props.length ? ` · props: ${e.props.map((p) => p.name).join(', ')}` : ''}`
      card.addEventListener('click', () => this.armEntry(e))
      return card
    }))
  }

  /** Pick one up. The next click on the page decides where it lands. */
  private armEntry(e: LibEntry) {
    this.libArmed = this.libArmed?.id === e.id ? null : e
    for (const c of this.libGrid.querySelectorAll('.lCard')) {
      c.setAttribute('aria-pressed', String((c as HTMLElement).dataset.entryId === this.libArmed?.id))
    }
    if (!this.libArmed) {
      this.libFoot.textContent = this.libSearching
        ? 'ranked by how much each one looks like your sketch'
        : 'pick one, then click where it should go'
      this.status('nothing picked up')
      return
    }
    // a placement needs somewhere to put it, and only tweak mode is hit-testing
    if (this.mode !== 'tweak') this.toggleTweak()
    const needs = e.props.filter((p) => p.required && !(p.name in e.defaults)).map((p) => p.name)
    this.libFoot.textContent = needs.length
      ? `${e.name} needs ${needs.join(', ')} — it will be placed without them`
      : `click where ${e.name} should go`
    this.status(`holding ${e.name} — click where it should go (Esc puts it back)`)
    this.redraw()
  }

  private async placeArmed(at: string): Promise<void> {
    const e = this.libArmed
    if (!e) return
    this.libArmed = null
    this.renderLibrary()
    this.status(`placing ${e.name}…`)
    try {
      const res = await fetch('/@s2c/library/place', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ id: e.id, at }),
      })
      const out = (await res.json()) as {
        ok: boolean; jsx?: string; file?: string; name?: string; error?: string
        needs?: string[]; aliased?: boolean; reusedImport?: boolean; materialised?: string
      }
      if (!out.ok) throw new Error(out.error ?? `HTTP ${String(res.status)}`)
      // each of these is a thing the user would otherwise discover later
      const notes = [
        out.materialised ? `copied in as ${out.materialised}` : '',
        out.aliased ? `renamed to ${out.name ?? '?'} (that name was taken)` : '',
        out.reusedImport ? 'reused the import already there' : '',
        out.needs?.length ? `still needs ${out.needs.join(', ')}` : '',
      ].filter(Boolean)
      this.tweak = null
      this.hoverEl = null
      this.status(
        `✓ ${out.jsx ?? e.name} → ${out.file ?? '?'}${notes.length ? ` · ${notes.join(' · ')}` : ''} · ` +
        '0 tokens · Ctrl+Z undoes it',
      )
      await this.loadEntries()
      if (this.rules.length) this.scheduleRuleCheck()
    } catch (err) {
      // placement refusals name the container to drop onto instead, so they are
      // worth showing exactly as written
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
    }
    this.redraw()
  }

  private async forgetEntry(e: LibEntry): Promise<void> {
    const drop = (home: 'project' | 'global') =>
      fetch('/@s2c/library/forget', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ id: e.id, home }),
      })
    try {
      await drop(e.home)
      // a portable entry was mirrored to the global library, and forgetting
      // only this project's copy would leave the card to reappear from there —
      // which reads as the ✕ not working
      if (e.home === 'project' && e.portable) await drop('global')
      if (this.libArmed?.id === e.id) this.libArmed = null
      await this.loadEntries()
      this.status(`forgot ${e.name} — ${e.file} is untouched`)
    } catch (err) {
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
    }
  }

  /** The drop target under the pointer, outlined while something is held. */
  private drawLibDrop() {
    const e = this.libArmed
    if (!e || !this.hoverEl) return
    const { ctx } = this
    const r = this.hoverEl.getBoundingClientRect()
    ctx.save()
    ctx.strokeStyle = '#a78bfa'
    ctx.fillStyle = 'rgba(167,139,250,0.12)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.fillRect(r.left, r.top, r.width, r.height)
    ctx.strokeRect(r.left, r.top, r.width, r.height)
    ctx.setLineDash([])
    const label = `${e.name} goes in here`
    ctx.font = '11px ui-sans-serif, system-ui'
    const w = ctx.measureText(label).width + 12
    const lx = Math.max(2, Math.min(r.left, window.innerWidth - w - 2))
    const ly = Math.max(2, r.top - 22)
    ctx.fillStyle = '#a78bfa'
    ctx.beginPath()
    ctx.roundRect(lx, ly, w, 17, 8)
    ctx.fill()
    ctx.fillStyle = '#1e1b4b'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, lx + 6, ly + 9)
    ctx.textBaseline = 'alphabetic'
    ctx.restore()
  }

  // ---- visual history ---------------------------------------------------
  // A timeline of the page's own past, with pictures. Git answers "what changed
  // in this commit"; the question someone has while looking at a page is "put
  // back the version I liked", which is visual and happens between commits —
  // including at the moments git cannot see, like a file saved by hand.
  //
  // The thumbnail is drawn by the page, from the DOM snapshot it already takes:
  // boxes in their own background colours, text as grey bars. Not a photograph
  // — a real screenshot would mean asking for screen-capture permission on
  // every recording, or shipping a rasteriser — but recognisable, which is all
  // a timeline needs, and free.

  private async setTimeOpen(on: boolean): Promise<void> {
    this.timeOpen = on
    this.timePanel.classList.toggle('on', on)
    if (!on) return
    await this.loadVersions()
    this.status(
      this.versions.length === 0
        ? 'no history yet — it records itself as you edit, including edits you make in your editor'
        : `${String(this.versions.length)} moment${this.versions.length === 1 ? '' : 's'} — pick one to see what it changed`,
    )
  }

  private async loadVersions(): Promise<void> {
    try {
      const res = await fetch('/@s2c/history/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: '{}',
      })
      const out = (await res.json()) as { ok: boolean; versions?: HistoryVersion[] }
      this.versions = out.ok ? (out.versions ?? []) : []
      this.renderTimeline()
    } catch { /* an older dev server simply has no history */ }
  }

  /**
   * A diagram of the page as it is now, as a PNG.
   *
   * Drawn from the snapshot rather than captured: every node's page rect and
   * its own background colour are already there, so the result is the page's
   * silhouette — enough to recognise "the version with the wide card" — with no
   * permission prompt and no rasteriser.
   */
  private thumbnail(region?: XY & { w: number; h: number }): string | undefined {
    try {
      const snap = this.snapshot()
      const doc = document.scrollingElement ?? document.body
      // a region in PAGE coordinates, or the whole page. The library wants a
      // picture of one component, and the timeline wants the page — same
      // drawing, two frames, so the difference is where the origin is rather
      // than a second renderer that would drift from this one. A rect rather
      // than an element because a component can render a FRAGMENT, which has
      // several roots and no single box.
      const box = region
      const ox = box ? box.x : 0
      const oy = box ? box.y : 0
      const pw = Math.max(box ? box.w : Math.max(doc.scrollWidth, window.innerWidth), 1)
      const ph = Math.max(box ? box.h : Math.max(doc.scrollHeight, window.innerHeight), 1)
      const w = 240
      const h = Math.max(40, Math.min(420, Math.round((w * ph) / pw)))
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const g = cv.getContext('2d')
      if (!g) return undefined
      const k = w / pw
      g.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff'
      g.fillRect(0, 0, w, h)
      // shallowest first, so a child paints over the box that contains it —
      // the same order the browser used
      const nodes = [...snap.nodes]
        // a region's picture is what falls inside it: anything outside would
        // draw the page around the component rather than the component
        .filter((n) => !box || (
          n.rect.x + n.rect.w > ox && n.rect.x < ox + pw &&
          n.rect.y + n.rect.h > oy && n.rect.y < oy + ph))
        .sort((a, b) => a.depth - b.depth)
      for (const n of nodes) {
        const x = (n.rect.x - ox) * k
        const y = (n.rect.y - oy) * k
        const bw = Math.max(1, n.rect.w * k)
        const bh = Math.max(1, n.rect.h * k)
        if (y > h || y + bh < 0 || bw < 1.5 || bh < 1.5) continue
        const bg = n.style.backgroundColor
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          g.fillStyle = bg
          g.fillRect(x, y, bw, bh)
        }
        // text as a bar in its own colour: unreadable at this size either way,
        // and a bar carries the layout, which is the whole point
        if (n.text) {
          g.fillStyle = n.style.color || '#6b7280'
          g.globalAlpha = 0.55
          const tw = Math.min(bw, Math.max(2, n.text.length * 4 * k * 1.6))
          g.fillRect(x, y + bh / 2 - Math.max(1, bh * 0.18), tw, Math.max(1, bh * 0.36))
          g.globalAlpha = 1
        }
      }
      return cv.toDataURL('image/png')
    } catch {
      // a thumbnail is a nice-to-have; a recording without one is still a
      // moment you can put back
      return undefined
    }
  }

  /** Record a moment. The server drops it if nothing actually changed. */
  private async recordVersion(label: string): Promise<void> {
    try {
      const res = await fetch('/@s2c/history/record', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ label, thumbnail: this.thumbnail() }),
      })
      const out = (await res.json()) as { ok: boolean; unchanged?: boolean }
      if (out.ok && !out.unchanged && this.timeOpen) await this.loadVersions()
    } catch { /* nothing to do: the next edit will try again */ }
  }

  private renderTimeline() {
    const n = this.versions.length
    this.timeHead.textContent = n === 0 ? 'history — nothing recorded yet' : `history · ${String(n)} moments`
    if (!this.versions.some((v) => v.id === this.timePick)) this.timePick = null
    // oldest on the left: a timeline that runs backwards is a list, not a
    // timeline
    const cards = [...this.versions].reverse().map((v) => {
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'tCard'
      card.dataset.versionId = v.id
      card.setAttribute('aria-pressed', String(v.id === this.timePick))
      if (v.thumb) {
        const img = document.createElement('img')
        // through the plugin, not Vite's static serving: the history lives in a
        // dot-directory, and relying on a dev server's file-serving rules for
        // something the user sees would be a silent breakage waiting to happen
        img.src = `/@s2c/history/thumb?id=${encodeURIComponent(v.id)}`
        img.alt = v.label
        card.appendChild(img)
      } else {
        const none = document.createElement('div')
        none.className = 'tNoShot'
        none.textContent = '◌'
        card.appendChild(none)
      }
      const when = document.createElement('div')
      when.className = 'tWhen'
      when.textContent = ago(v.at)
      const what = document.createElement('div')
      what.className = 'tWhat'
      what.textContent = v.label
      card.append(when, what)
      card.title = `${v.label} · ${new Date(v.at).toLocaleTimeString()}`
      card.addEventListener('click', () => this.pickVersion(v.id))
      return card
    })
    this.timeStrip.replaceChildren(...cards)
    this.timeStrip.scrollLeft = this.timeStrip.scrollWidth
    this.syncTimeFoot()
  }

  private pickVersion(id: string) {
    this.timePick = this.timePick === id ? null : id
    for (const c of this.timeStrip.querySelectorAll('.tCard')) {
      c.setAttribute('aria-pressed', String((c as HTMLElement).dataset.versionId === this.timePick))
    }
    this.syncTimeFoot()
  }

  private syncTimeFoot() {
    const v = this.versions.find((x) => x.id === this.timePick)
    this.timeGo.disabled = !v
    if (!v) {
      this.timeWhat.textContent = this.versions.length
        ? 'pick a moment to see what it changed'
        : 'it records itself as you edit — including edits you make in your editor'
      return
    }
    const files = v.files.length === 0
      ? 'no file changes'
      : `${v.files.length === 1 ? v.files[0]! : `${String(v.files.length)} files`}`
    this.timeWhat.textContent = `${ago(v.at)} · ${files}`
    this.timeWhat.title = v.files.join('\n')
  }

  /**
   * Put the files back. Undoable twice over: the engine records the current
   * state before replacing it, and the plugin pushes this onto the undo stack,
   * so Ctrl+Z reaches it like any other edit.
   */
  private async restoreVersion(): Promise<void> {
    const v = this.versions.find((x) => x.id === this.timePick)
    if (!v) return
    this.timeGo.disabled = true
    this.status(`putting back: ${v.label}…`)
    try {
      const res = await fetch('/@s2c/history/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ id: v.id, thumbnail: this.thumbnail() }),
      })
      const out = (await res.json()) as { ok: boolean; files?: string[]; error?: string }
      if (!out.ok) throw new Error(out.error ?? `HTTP ${String(res.status)}`)
      // the tree the selection pointed into has just been rewritten
      this.tweak = null
      this.multiSel = []
      this.hoverEl = null
      const n = out.files?.length ?? 0
      this.status(
        `✓ back to: ${v.label} · ${String(n)} file${n === 1 ? '' : 's'} · ` +
        '0 tokens · Ctrl+Z undoes this too',
      )
      await this.loadVersions()
      if (this.rules.length) this.scheduleRuleCheck()
    } catch (err) {
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
      this.syncTimeFoot()
    }
    this.redraw()
  }

  // ---- responsive by demonstration --------------------------------------
  // Alt+M, then use the page exactly as usual: drag the window narrow,
  // rearrange something, and the edit is written at the band that width falls
  // in. Nothing about the gesture changes — which is the point. The only new
  // thing to learn is the window itself.
  //
  // Mobile-first makes the narrow direction the surprising one: demonstrating
  // on a phone means the new value becomes the UNPREFIXED class and the old one
  // is pushed up to the next breakpoint. That is decided in the pipeline; all
  // this has to do is send the width and say honestly which band it is.

  private async toggleResponsive(): Promise<void> {
    this.responsive = !this.responsive
    if (this.responsive && !this.screens) {
      // they are fetched at boot, so getting here means that failed or is
      // still in flight — say so rather than name a band computed from nothing
      this.status('working out this project’s breakpoints…')
      await this.loadScreens()
    }
    this.syncBandChip()
    if (!this.responsive) {
      this.status('responsive demonstration off — edits apply at every width again')
      return
    }
    // a mode that changes what every drag writes has to say what it will do
    // BEFORE the first drag, not in the receipt afterwards
    this.status(`${this.bandSentence()} · rearrange anything and the edit lands there`)
  }

  private async loadScreens(): Promise<void> {
    try {
      const res = await fetch('/@s2c/screens', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: '{}',
      })
      const out = (await res.json()) as {
        ok: boolean; screens?: Record<string, number>; source?: string
      }
      if (out.ok && out.screens) this.screens = { screens: out.screens, source: out.source ?? '' }
    } catch { /* an older dev server just leaves the band unnamed */ }
  }

  /** The band the current viewport width falls in, mobile-first. */
  private band(): string {
    const screens = this.screens?.screens ?? {}
    let band = 'base'
    let best = -1
    for (const [name, min] of Object.entries(screens)) {
      if (window.innerWidth >= min && min > best) {
        best = min
        band = name
      }
    }
    return band
  }

  /** What this width means, in the words the pipeline will write it in. */
  private bandSentence(): string {
    const screens = this.screens?.screens ?? {}
    const band = this.band()
    const w = window.innerWidth
    if (band === 'base') {
      const smallest = Math.min(...Object.values(screens).filter((n) => n > 0))
      return Number.isFinite(smallest)
        ? `demonstrating at ${String(w)}px — below ${String(smallest)}px, so wider screens keep what they have`
        : `demonstrating at ${String(w)}px`
    }
    return `demonstrating at ${String(w)}px — ${band} and up (from ${String(screens[band] ?? 0)}px)`
  }

  private syncBandChip() {
    this.bandChip.style.display = this.responsive ? '' : 'none'
    if (!this.responsive) return
    const band = this.band()
    this.bandChip.textContent = `📐 ${band === 'base' ? `<${String(this.smallestScreen())}` : band}`
    this.bandChip.title = `${this.bandSentence()} · ${this.screens?.source ?? ''} · Alt+M turns this off`
    this.clampHud()
  }

  private smallestScreen(): number {
    const vals = Object.values(this.screens?.screens ?? {}).filter((n) => n > 0)
    return vals.length ? Math.min(...vals) : 0
  }

  /** Sent with every manipulation while demonstrating, and never otherwise. */
  private responsiveWidth(): { width?: number } {
    return this.responsive ? { width: window.innerWidth } : {}
  }

  // ---- props read off the types -----------------------------------------
  // Alt+O on a selection. The component that renders the selected element is
  // resolved from its stamp, its props are read out of its own TypeScript
  // types, and the controls follow from the types: a text field for a string,
  // a number field for a number, a checkbox for a boolean, a dropdown for a
  // union of string literals. Nothing is declared twice, and a prop no control
  // can honestly represent is shown greyed WITH the reason rather than hidden.

  private async setPropsOpen(on: boolean): Promise<void> {
    if (on && !this.tweak) {
      this.status('select something first — the panel reads the props of whatever renders it')
      return
    }
    this.propsOpen = on
    this.propsPanel.classList.toggle('on', on)
    if (!on) {
      this.propsData = null
      return
    }
    await this.readProps()
  }

  /** Re-read the selected element's component. Cheap: one parse, no model. */
  private async readProps(): Promise<void> {
    const srcLoc = this.tweak?.srcLoc
    if (!srcLoc) return
    this.propsHead.textContent = 'reading the types…'
    this.propsWhere.textContent = ''
    this.propsBody.replaceChildren()
    this.propsNotes.textContent = ''
    this.layoutPropsPanel()
    try {
      const res = await fetch('/@s2c/props/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ srcLoc }),
      })
      const out = (await res.json()) as PropsRead
      this.propsData = out
      this.propsSite = 0
      this.renderProps()
    } catch (err) {
      this.propsData = null
      this.propsHead.textContent = 'could not read the props'
      this.propsNotes.textContent = err instanceof Error ? err.message : String(err)
      this.layoutPropsPanel()
    }
  }

  private renderProps() {
    const d = this.propsData
    if (!d) return
    if (!d.ok) {
      this.propsHead.textContent = 'no props here'
      this.propsWhere.textContent = ''
      this.propsBody.replaceChildren()
      this.propsNotes.textContent = d.error ?? ''
      this.layoutPropsPanel()
      return
    }
    this.propsHead.textContent = d.component ?? 'component'
    const sites = d.callSites ?? []
    const site = sites[this.propsSite]
    this.propsWhere.replaceChildren()
    if (sites.length === 0) {
      // resolvable but never used: worth saying, because empty controls with no
      // explanation read as a broken panel
      this.propsWhere.textContent = `${d.file ?? ''} · used nowhere yet, so there is no call site to edit`
    } else if (sites.length === 1) {
      this.propsWhere.textContent = `used in ${site!.loc}`
    } else {
      // more than one call site means "which of these did you mean?", and only
      // the user knows — so it is a choice, not a guess
      this.propsWhere.textContent = `used in ${String(sites.length)} places — editing:`
      const sel = document.createElement('select')
      sel.setAttribute('aria-label', 'which call site to edit')
      for (const [i, s] of sites.entries()) {
        const o = document.createElement('option')
        o.value = String(i)
        o.textContent = s.loc
        sel.appendChild(o)
      }
      sel.value = String(this.propsSite)
      sel.addEventListener('change', () => {
        this.propsSite = Number(sel.value)
        this.renderProps()
      })
      this.propsWhere.appendChild(sel)
    }

    const rows: HTMLElement[] = []
    for (const p of d.props ?? []) {
      if (!p.editable) {
        const off = document.createElement('div')
        off.className = 'pOff'
        const b = document.createElement('b')
        b.textContent = p.name
        off.append(b, document.createTextNode(` — ${p.why ?? p.typeText}`))
        rows.push(off)
        continue
      }
      const row = document.createElement('div')
      row.className = 'pRow'
      const name = document.createElement('div')
      name.className = 'pName'
      name.textContent = p.name
      name.title = `${p.name}: ${p.typeText}`
      if (!p.required) {
        const opt = document.createElement('i')
        opt.textContent = '?'
        name.appendChild(opt)
      }
      const ctl = document.createElement('div')
      ctl.className = 'pCtl'
      ctl.appendChild(this.propControl(p, site))
      row.append(name, ctl)
      rows.push(row)
    }
    if (rows.length === 0) {
      const none = document.createElement('div')
      none.className = 'pOff'
      none.textContent = 'this component takes no props you can set from here'
      rows.push(none)
    }
    this.propsBody.replaceChildren(...rows)
    this.propsNotes.textContent = (d.notes ?? []).join(' · ')
    this.layoutPropsPanel()
  }

  /**
   * One control, chosen by the prop's kind.
   *
   * A prop wired to an EXPRESSION at this call site is shown but disabled: the
   * server would refuse to overwrite it (that would unplug the wiring), and a
   * control that looks live and then refuses is worse than one that says up
   * front that this value comes from code.
   */
  private propControl(p: PropSpec, site: PropCallSite | undefined): HTMLElement {
    const wired = site?.expressions.includes(p.name) ?? false
    const current = site?.values[p.name]
    const commit = (value: string | number | boolean) => void this.writeProp(p, value)

    if (p.kind === 'boolean') {
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = current === 'true' || current === ''
      box.disabled = wired || !site
      box.title = wired ? `${p.name} is wired to an expression here` : ''
      box.addEventListener('change', () => commit(box.checked))
      return box
    }
    if (p.kind === 'enum') {
      const sel = document.createElement('select')
      sel.disabled = wired || !site
      // a prop that is not required can be absent, and "not set" is a real
      // state the dropdown has to be able to show
      if (!p.required) {
        const none = document.createElement('option')
        none.value = ''
        none.textContent = '(not set)'
        sel.appendChild(none)
      }
      for (const o of p.options ?? []) {
        const opt = document.createElement('option')
        opt.value = o
        opt.textContent = o
        sel.appendChild(opt)
      }
      sel.value = current ?? ''
      sel.addEventListener('change', () => { if (sel.value !== '') commit(sel.value) })
      return sel
    }
    const input = document.createElement('input')
    input.type = p.kind === 'number' ? 'number' : 'text'
    input.value = current ?? ''
    input.disabled = wired || !site
    input.placeholder = wired ? 'from code' : p.typeText
    // change, not input: a write per keystroke would be a write per keystroke
    input.addEventListener('change', () => {
      commit(p.kind === 'number' ? Number(input.value) : input.value)
    })
    return input
  }

  private async writeProp(p: PropSpec, value: string | number | boolean): Promise<void> {
    const site = (this.propsData?.callSites ?? [])[this.propsSite]
    if (!site) return
    try {
      const res = await fetch('/@s2c/props/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ callSite: site.loc, name: p.name, value }),
      })
      const out = (await res.json()) as { ok: boolean; change?: string; error?: string }
      if (!out.ok) throw new Error(out.error ?? `HTTP ${String(res.status)}`)
      this.status(`✓ ${out.change ?? `${p.name} = ${String(value)}`} · 0 tokens · Ctrl+Z undoes it`)
      // the file changed, so the call site's literal values did too — and a
      // rule may be about what this value renders
      await this.readProps()
      if (this.rules.length) this.scheduleRuleCheck()
    } catch (err) {
      // the refusals name the fix ("wired to an expression here … change it
      // where it comes from"), so they are shown as written
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
      await this.readProps()
    }
  }

  /** Beside the selection it describes (cf. layoutPaintPanel). */
  private layoutPropsPanel() {
    if (!this.propsOpen) return
    const t = this.tweak
    const r = t && document.contains(t.el)
      ? t.el.getBoundingClientRect()
      : { right: window.innerWidth / 2, left: window.innerWidth / 2, top: 80 } as DOMRect
    const w = this.propsPanel.offsetWidth
    const h = this.propsPanel.offsetHeight
    let x = r.right + PANEL_GAP
    if (x + w > window.innerWidth - PANEL_GAP) x = r.left - w - PANEL_GAP
    x = Math.min(Math.max(PANEL_GAP, x), Math.max(PANEL_GAP, window.innerWidth - w - PANEL_GAP))
    const y = Math.min(Math.max(PANEL_GAP, r.top), Math.max(PANEL_GAP, window.innerHeight - h - PANEL_GAP))
    this.propsPanel.style.left = `${String(Math.round(x))}px`
    this.propsPanel.style.top = `${String(Math.round(y))}px`
  }

  // ---- drag the data ----------------------------------------------------
  // Alt+V, then drag from the thing that SHOWS a value onto the thing that
  // should show it too. The page's contribution is the only one it can make
  // and the server cannot: which two elements, resolved by hit test so that
  // stacking and pointer-events are respected. Everything hard — what
  // expression produces that value, whether the names it depends on even
  // exist at the destination, whether they mean the same thing there — is
  // decided from the AST, and its refusals are written to be read, so they
  // land on the status line word for word.

  /** Alt+V: arm the next drag as a value copy. */
  private armData() {
    if (this.dataDrag) {
      this.cancelData('value drag cancelled')
      return
    }
    if (this.mode !== 'tweak') this.toggleTweak()
    this.dataArmed = !this.dataArmed
    if (this.dataArmed) {
      this.lassoArmed = false
      this.ruleArmed = false
    }
    this.status(
      this.dataArmed
        ? 'value drag armed — press on the value you want, drag onto where it should also show (Esc cancels)'
        : 'value drag off — drag moves elements again',
    )
  }

  /** The stamped element under a viewport point, with what to call it. */
  private pickStamped(x: number, y: number): DataEnd | null {
    let el: Element | null = this.elementUnder(x, y)
    while (el) {
      const srcLoc = (el as HTMLElement).dataset?.s2c
      if (srcLoc && !this.host.contains(el)) {
        return { el: el as HTMLElement, srcLoc, label: elLabel(el as HTMLElement) }
      }
      el = el.parentElement
    }
    return null
  }

  private startDataDrag(e: PointerEvent) {
    const from = this.pickStamped(e.clientX, e.clientY)
    if (!from) {
      this.cancelData('nothing stamped there — press on the element that shows the value')
      return
    }
    if (this.paintOpen) this.setPaintOpen(false)
    this.dataArmed = false
    this.hoverEl = null
    const value = (from.el.textContent ?? '').replace(/\s+/g, ' ').trim()
    this.dataDrag = {
      from,
      to: null,
      at: { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY },
      value: value.length > 40 ? `${value.slice(0, 39)}…` : value,
    }
    this.canvas.setPointerCapture(e.pointerId)
    this.canvas.style.cursor = 'copy'
    this.status(`holding “${this.dataDrag.value}” — drop it on what should show it too`)
    this.redraw()
  }

  private moveDataDrag(e: PointerEvent) {
    const d = this.dataDrag
    if (!d) return
    d.at = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY }
    const over = this.pickStamped(e.clientX, e.clientY)
    d.to = over && over.el !== d.from.el ? over : null
    this.status(
      d.to
        ? `“${d.value}” → ${d.to.label}`
        : `holding “${d.value}” — drop it on what should show it too`,
    )
    this.redraw()
  }

  private async endDataDrag(e: PointerEvent): Promise<void> {
    const d = this.dataDrag
    if (!d) return
    this.canvas.releasePointerCapture?.(e.pointerId)
    this.canvas.style.cursor = 'default'
    if (e.type === 'pointercancel') {
      this.cancelData('value drag cancelled')
      return
    }
    const to = this.pickStamped(e.clientX, e.clientY)
    if (!to) {
      this.cancelData('dropped on nothing stamped — the value stayed where it was')
      return
    }
    // released where it started: a change of mind, not an edit, and worth
    // saying differently from a drop that missed
    if (to.el === d.from.el) {
      this.cancelData('dropped where it started — nothing copied')
      return
    }
    const label = to.label
    this.dataDrag = null
    this.canvas.style.cursor = 'default'
    this.status(`copying “${d.value}” into ${label}…`)
    this.redraw()
    try {
      const res = await fetch('/@s2c/data', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ from: d.from.srcLoc, to: to.srcLoc }),
      })
      const out = (await res.json()) as { ok: boolean; change?: string; file?: string; error?: string }
      if (!out.ok) throw new Error(out.error ?? `HTTP ${String(res.status)}`)
      // the selection and hover point at elements this edit is about to
      // replace: holding either would outline a box that no longer exists
      this.tweak = null
      this.multiSel = []
      this.hoverEl = null
      this.status(`✓ ${out.change ?? 'copied'} · 0 tokens · Ctrl+Z undoes it`)
      // a value landing somewhere can change layout, and a rule may be about
      // exactly that
      if (this.rules.length) this.scheduleRuleCheck()
    } catch (err) {
      // the refusals are the valuable half of this gesture — they name the
      // scope the value belongs to and what to do instead — so they are shown
      // exactly as written
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
    }
    this.redraw()
  }

  private cancelData(msg: string) {
    this.dataDrag = null
    this.dataArmed = false
    this.canvas.style.cursor = 'default'
    this.status(msg, msg.startsWith('✗'))
    this.redraw()
  }

  /** The value in flight: both ends outlined, a line between them. */
  private drawDataDrag() {
    const d = this.dataDrag
    if (!d) return
    const { ctx } = this
    const sx = window.scrollX
    const sy = window.scrollY
    ctx.save()
    ctx.strokeStyle = DATA_COLOR
    ctx.fillStyle = 'rgba(236,72,153,0.10)'
    ctx.lineWidth = 2
    for (const end of [d.from, d.to]) {
      if (!end || !document.contains(end.el)) continue
      const r = end.el.getBoundingClientRect()
      ctx.fillRect(r.left, r.top, r.width, r.height)
      // the source is solid, the destination dashed: one is where the value
      // IS, the other only where it might go
      ctx.setLineDash(end === d.from ? [] : [6, 4])
      ctx.strokeRect(r.left, r.top, r.width, r.height)
    }
    ctx.setLineDash([])
    const r = d.from.el.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(r.left + r.width / 2, r.top + r.height / 2)
    ctx.lineTo(d.at.x - sx, d.at.y - sy)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(d.at.x - sx, d.at.y - sy, 4, 0, Math.PI * 2)
    ctx.fillStyle = DATA_COLOR
    ctx.fill()
    const label = d.to ? `“${d.value}” → ${d.to.label}` : `“${d.value}”`
    ctx.font = '11px ui-sans-serif, system-ui'
    const w = ctx.measureText(label).width + 12
    const lx = Math.max(2, Math.min(d.at.x - sx + 10, window.innerWidth - w - 2))
    const ly = Math.max(2, d.at.y - sy - 24)
    ctx.fillStyle = DATA_COLOR
    ctx.beginPath()
    ctx.roundRect(lx, ly, w, 17, 8)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, lx + 6, ly + 9)
    ctx.textBaseline = 'alphabetic'
    ctx.restore()
  }

  // ---- typed notes ------------------------------------------------------
  // The user hovers something, hits Alt+N, types, hits Enter. What they typed
  // is exact — no transcription, no model, no ambiguity — so the whole
  // problem is deciding what the words are ABOUT. Three rules, in order:
  //   1. a stamped element under the pointer (and not the page wrapper)
  //   2. else the cluster of strokes near the pointer — "I just drew these,
  //      the note is about them"
  //   3. else the run as a whole
  // Alt+SHIFT+N forces rule 3 outright, so a note about the whole drawing is
  // always one keystroke away no matter where the pointer happens to rest.

  /** Page-space bbox of one stroke (points are captured in page coords). */
  private strokeBox(st: Stroke): Box {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of st.points) {
      if (p.x < x0) x0 = p.x
      if (p.y < y0) y0 = p.y
      if (p.x > x1) x1 = p.x
      if (p.y > y1) y1 = p.y
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }

  /** Shortest distance from a point to a rect; 0 inside it. */
  private boxDist(b: Box, x: number, y: number): number {
    return Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)))
  }

  /** Gap between two rects; 0 when they touch or overlap. */
  private boxGap(a: Box, b: Box): number {
    const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0)
    const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0)
    return Math.hypot(dx, dy)
  }

  /** When the stroke was finished — its last point's timestamp. */
  private strokeTime(st: Stroke): number {
    return st.points[st.points.length - 1]?.t ?? 0
  }

  /**
   * Rule 2's stroke group. Seeded with the MOST RECENTLY DRAWN stroke within
   * NOTE_NEAR_PX of the pointer — when two drawings are both in reach, the
   * one the user just made is the one they are talking about — then grown
   * transitively over strokes that are both spatially adjacent and drawn in
   * the same sitting. That closure is what turns "the nearest stroke" into
   * "the four strokes that make up the box I drew".
   */
  private clusterNear(x: number, y: number): Stroke[] {
    const boxes = new Map<Stroke, Box>()
    for (const st of this.strokes) boxes.set(st, this.strokeBox(st))
    let seed: Stroke | null = null
    for (const st of this.strokes) {
      // later strokes overwrite earlier ones: this.strokes is in draw order
      if (this.boxDist(boxes.get(st)!, x, y) <= NOTE_NEAR_PX) seed = st
    }
    if (!seed) return []
    const group = [seed]
    for (;;) {
      const next = this.strokes.find((st) =>
        !group.includes(st) &&
        group.some((g) =>
          this.boxGap(boxes.get(g)!, boxes.get(st)!) <= NOTE_CLUSTER_PX &&
          Math.abs(this.strokeTime(st) - this.strokeTime(g)) <= NOTE_CLUSTER_MS),
      )
      if (!next) break
      group.push(next)
    }
    // report them in draw order, the order the user made them in
    return group.sort((a, b) => this.strokes.indexOf(a) - this.strokes.indexOf(b))
  }

  /** See NOTE_BG_COVER: the stamped root wrapper is never the subject. */
  private isPageBackground(el: HTMLElement): boolean {
    if (el === document.body || el === document.documentElement) return true
    const r = el.getBoundingClientRect()
    return r.width >= window.innerWidth * NOTE_BG_COVER && r.height >= window.innerHeight * NOTE_BG_COVER
  }

  /** The three rules, applied in order, at the instant the key was pressed. */
  private resolveAnchor(
    clientX: number,
    clientY: number,
    forceRun: boolean,
  ): { anchor: NoteAnchor; strokes: Stroke[]; el: HTMLElement | null } {
    if (forceRun) return { anchor: { kind: 'run' }, strokes: [], el: null }
    const el = this.pickAnyStamped(clientX, clientY)
    const srcLoc = el?.dataset.s2c
    if (el && srcLoc && !this.isPageBackground(el)) {
      return { anchor: { kind: 'element', srcLoc }, strokes: [], el }
    }
    const group = this.clusterNear(clientX + window.scrollX, clientY + window.scrollY)
    if (group.length > 0) {
      return { anchor: { kind: 'strokes', strokeIds: group.map((s) => s.id) }, strokes: group, el: null }
    }
    return { anchor: { kind: 'run' }, strokes: [], el: null }
  }

  /** The tiny "what did this land on" line — the only feedback that says
   *  which of the three rules fired. */
  private anchorLabel(anchor: NoteAnchor, el: HTMLElement | null): string {
    if (anchor.kind === 'element') {
      return `on this element · ${el ? el.tagName.toLowerCase() : anchor.srcLoc.split(':')[0]}`
    }
    if (anchor.kind === 'strokes') {
      const n = anchor.strokeIds.length
      return n === 1 ? 'on this stroke' : `on these ${n} strokes`
    }
    return 'whole sketch'
  }

  /** Alt+N / Alt+Shift+N: resolve, then open the field at the pointer. */
  private openNote(forceRun: boolean) {
    if (this.mode === 'running') return
    const p = this.pointer ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const r = this.resolveAnchor(p.x, p.y, forceRun)
    this.openEditor(null, { x: p.x + window.scrollX, y: p.y + window.scrollY }, r, '')
  }

  /** Clicking a chip re-opens its note, on its original anchor and point. */
  private editNote(n: Note) {
    const el = n.anchor.kind === 'element'
      ? (document.querySelector(`[data-s2c="${n.anchor.srcLoc}"]`) as HTMLElement | null)
      : null
    const strokes = n.anchor.kind === 'strokes'
      ? this.strokes.filter((s) => (n.anchor as { strokeIds: string[] }).strokeIds.includes(s.id))
      : []
    this.openEditor(n.id, n.at, { anchor: n.anchor, strokes, el }, n.text)
  }

  private openEditor(
    id: string | null,
    at: { x: number; y: number },
    r: { anchor: NoteAnchor; strokes: Stroke[]; el: HTMLElement | null },
    text: string,
  ) {
    this.noteDraft = { id, at, anchor: r.anchor }
    this.noteWhat.textContent = this.anchorLabel(r.anchor, r.el)
    this.showNoteHighlight(r)
    // the box lives in PAGE space, so the clamp is against the viewport's
    // current page window — it only has to be right at open time
    const w = Math.min(320, window.innerWidth - 24)
    const left = Math.min(
      Math.max(at.x, window.scrollX + 12),
      window.scrollX + window.innerWidth - w - 12,
    )
    this.noteBox.style.left = `${String(Math.round(left))}px`
    this.noteBox.style.top = `${String(Math.round(at.y + 14))}px`
    this.noteBox.classList.add('on')
    this.noteInput.value = text
    this.noteInput.focus()
    this.noteInput.select()
    this.status(`note ${this.noteWhat.textContent} · Enter attaches · Esc cancels`)
  }

  /** Outline the subject, in page space, so it stays on it through a scroll. */
  private showNoteHighlight(r: { anchor: NoteAnchor; strokes: Stroke[]; el: HTMLElement | null }) {
    let box: Box | null = null
    if (r.el) {
      const b = r.el.getBoundingClientRect()
      box = { x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height }
    } else if (r.strokes.length > 0) {
      const boxes = r.strokes.map((s) => this.strokeBox(s))
      const x0 = Math.min(...boxes.map((b) => b.x))
      const y0 = Math.min(...boxes.map((b) => b.y))
      const x1 = Math.max(...boxes.map((b) => b.x + b.w))
      const y1 = Math.max(...boxes.map((b) => b.y + b.h))
      const PAD = 8
      box = { x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + PAD * 2, h: y1 - y0 + PAD * 2 }
    }
    // a run-level note has no subject to outline — the label carries it
    if (!box) {
      this.noteHi.classList.remove('on')
      return
    }
    this.noteHi.style.left = `${String(Math.round(box.x))}px`
    this.noteHi.style.top = `${String(Math.round(box.y))}px`
    this.noteHi.style.width = `${String(Math.round(box.w))}px`
    this.noteHi.style.height = `${String(Math.round(box.h))}px`
    this.noteHi.classList.add('on')
  }

  private commitNote() {
    const d = this.noteDraft
    if (!d) return
    // the raw value: "untrimmed of meaning" — trailing spaces are the user's
    // business, and only an ENTIRELY blank field means "never mind"
    const text = this.noteInput.value
    if (text.trim() === '') {
      if (d.id) this.deleteNote(d.id)
      else this.closeNote('empty note discarded')
      return
    }
    const existing = d.id ? this.notes.find((n) => n.id === d.id) : undefined
    if (existing) existing.text = text
    else this.notes.push({ id: `n${this.noteSeq++}`, text, at: d.at, anchor: d.anchor })
    this.closeNote(`note ${existing ? 'updated' : 'attached'} — ${this.noteWhat.textContent ?? ''}`)
    this.renderNotes()
    this.sync()
  }

  private closeNote(msg: string) {
    this.noteDraft = null
    this.noteBox.classList.remove('on')
    this.noteHi.classList.remove('on')
    this.noteInput.value = ''
    this.noteInput.blur()
    this.status(msg)
  }

  private deleteNote(id: string) {
    this.notes = this.notes.filter((n) => n.id !== id)
    if (this.noteDraft?.id === id) this.closeNote('note deleted')
    else this.status('note deleted')
    this.renderNotes()
    this.sync()
  }

  /**
   * Rebuild the chips. They are positioned in PAGE coordinates inside the
   * page-space #notes layer — exactly like the ink — so scroll and zoom move
   * them with their subject and there is no scroll listener to be late.
   */
  private renderNotes() {
    for (const old of [...this.notesLayer.querySelectorAll('.noteChip')]) old.remove()
    for (const n of this.notes) {
      const chip = document.createElement('div')
      chip.className = 'noteChip'
      chip.dataset.note = n.id
      // +10 so the chip sits beside the anchor point rather than under the
      // cursor that placed it
      chip.style.left = `${String(Math.round(n.at.x + 10))}px`
      chip.style.top = `${String(Math.round(n.at.y + 10))}px`
      chip.title = `${n.text}\n${this.anchorLabel(n.anchor, null)} — click to edit`
      const text = document.createElement('span')
      text.className = 'noteText'
      text.textContent = n.text
      const del = document.createElement('button')
      del.className = 'noteDel'
      del.textContent = '✕'
      del.title = 'delete this note'
      del.addEventListener('click', (e) => {
        e.stopPropagation() // the chip itself opens the editor
        this.deleteNote(n.id)
      })
      chip.append(text, del)
      chip.addEventListener('click', () => this.editNote(n))
      this.notesLayer.appendChild(chip)
      // Flip to the other side of the anchor when the chip would run off the
      // page. Clamped against the DOCUMENT's width, never the viewport's: a
      // viewport clamp would have to be redone on every scroll, which is the
      // drift bug this whole layer exists to avoid.
      const pageW = document.documentElement.scrollWidth
      const w = chip.offsetWidth
      if (n.at.x + 10 + w > pageW - 8) {
        chip.style.left = `${String(Math.max(8, Math.round(n.at.x - 10 - w)))}px`
      }
    }
  }

  /**
   * The wire shape, rebuilt fresh per request (same contract as the fidelity
   * payload). Page coords are rounded to whole pixels: sub-pixel precision
   * means nothing to a server resolving the anchor against its own snapshot.
   */
  private notesPayload(): Note[] {
    return this.notes.map((n) => ({
      id: n.id,
      text: n.text,
      at: { x: Math.round(n.at.x), y: Math.round(n.at.y) },
      anchor: n.anchor.kind === 'element'
        ? { kind: 'element' as const, srcLoc: n.anchor.srcLoc }
        : n.anchor.kind === 'strokes'
          ? { kind: 'strokes' as const, strokeIds: [...n.anchor.strokeIds] }
          : { kind: 'run' as const },
    }))
  }

  // ---- drawing ----
  // pathD/strokeDiagonal/shouldBridge live in stroke-capture.ts — pure math,
  // testable without a browser (pointer capture can't be exercised outside one).

  /** Forget the bridge candidate — call on anything that invalidates it
   *  (undo, clear, a completed run, leaving draw mode). */
  private resetBridge() {
    this.lastStrokeEnd = null
    this.lastStrokeBig = false
  }

  private inkPath(): SVGPathElement {
    return document.createElementNS('http://www.w3.org/2000/svg', 'path')
  }

  /** Re-render committed strokes. Called only when the stroke SET changes —
   *  never on scroll, zoom or resize: the layer moves with the page itself. */
  private renderInk() {
    this.ink.replaceChildren(...this.strokes.map((st) => {
      const path = this.inkPath()
      path.setAttribute('d', pathD(st.points))
      // A coloured stroke paints in its own colour, so what the user sees on
      // the page is exactly the colour the run will ask for. Inline style, not
      // a stroke="" attribute: presentation attributes rank BELOW stylesheet
      // rules, so #ink path{stroke:…} would repaint every pen blue.
      if (st.color) path.style.stroke = st.color
      const t = st.anchor ? this.anchorTransform(st.anchor) : null
      if (t) path.setAttribute('transform', t)
      return path
    }))
    if (this.live && this.livePath) this.ink.appendChild(this.livePath)
  }

  private toPage(e: PointerEvent): Pt {
    return { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY, t: performance.now() }
  }

  private onDown(e: PointerEvent) {
    if (this.mode === 'tweak') {
      this.onTweakDown(e)
      return
    }
    if (this.mode === 'preview') {
      this.onPreviewTap(e)
      return
    }
    if (this.mode !== 'draw') return
    if (e.button !== 0) return // left button/pen tip only
    // the drawing isn't finished after all. Drop the pending auto-run HERE
    // rather than at pointerup: one slow deliberate stroke takes longer than
    // the settle period, and a run firing mid-line would read the drawing
    // half-made.
    this.cancelAuto()
    this.canvas.setPointerCapture(e.pointerId)
    const p = this.toPage(e)
    // a trackpad hop: lands right back where the last gesture-sized stroke
    // ended, right after it ended — resume it instead of starting a new one
    if (shouldBridge(this.lastStrokeEnd, this.lastStrokeBig, p)) {
      this.live = this.strokes.pop()!
      this.live.points.push(p)
    } else {
      this.live = { id: `s${this.strokeSeq++}`, points: [p], ...(this.pen ? { color: this.pen } : {}) }
    }
    this.livePath = this.inkPath()
    if (this.live.color) this.livePath.style.stroke = this.live.color
    this.livePath.setAttribute('d', pathD(this.live.points))
    this.ink.appendChild(this.livePath)
  }

  private onMove(e: PointerEvent) {
    if (this.mode === 'tweak') {
      this.onTweakMove(e)
      return
    }
    if (!this.live) return
    // coalesced events give the full-resolution trace on fast moves
    const evs = 'getCoalescedEvents' in e ? e.getCoalescedEvents() : [e]
    for (const ev of evs) this.live.points.push(this.toPage(ev as PointerEvent))
    this.livePath?.setAttribute('d', pathD(this.live.points))
  }

  private onUp(e: PointerEvent) {
    if (this.mode === 'tweak') {
      void this.onTweakUp(e)
      return
    }
    if (!this.live) return
    this.live.points.push(this.toPage(e))
    if (this.live.points.length > 2) {
      this.live.anchor = this.anchorFor(this.live.points) ?? undefined
      this.strokes.push(this.live)
      const last = this.live.points[this.live.points.length - 1]!
      this.lastStrokeEnd = last
      this.lastStrokeBig = strokeDiagonal(this.live.points) >= BRIDGE_MIN_SPAN
    } else {
      this.resetBridge()
    }
    this.live = null
    this.livePath = null
    this.renderInk()
    if (this.strokes.some((st) => st.anchor)) this.startTracking()
    // an open library is showing matches for what is drawn, so the drawing
    // growing is a new query
    this.scheduleSketchSearch()
    this.sync()
    // The pen is up. If this was the LAST stroke of the drawing, the settle
    // period that fires the auto-run starts now; if it wasn't, the next
    // pointerdown cancels it again. That is the whole firing rule.
    this.scheduleAuto()
  }

  private async onPreviewTap(e: PointerEvent) {
    const x = e.clientX
    const y = e.clientY
    const hit = this.chipBoxes.find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h)
    if (!hit || !this.preview) return
    const shape = this.preview.shapes.find((sh) => sh.id === hit.shapeId)
    if (!shape) return
    // cycle: recognized candidates → 'ink' (keep as drawn) → 'ignore'
    const current = this.overrides[shape.id] ?? shape.kind
    const kinds = [...new Set([...shape.candidates.map((c) => c.kind), 'ink', 'ignore'])]
    const next = kinds[(kinds.indexOf(current) + 1) % kinds.length]!
    this.overrides[shape.id] = next
    shape.kind = next
    // re-interpret so the op list reflects the corrected kind
    try {
      const res = await fetch('/@s2c/interpret', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({
          strokes: this.strokesForWire(), snapshot: this.snapshot(), mode: this.runMode, overrides: this.overrides,
          // a chip correction re-reads the SAME drawing, so it must carry the
          // same fidelity settings and the same notes, or the op list would
          // shift under the user
          fidelity: this.fidelityPayload(),
          notes: this.notesPayload(),
        }),
      })
      const body = (await res.json()) as { ok: boolean; result?: PreviewData }
      if (body.ok && body.result) {
        this.preview = body.result
        for (const sh of this.preview.shapes) {
          if (this.overrides[sh.id]) sh.kind = this.overrides[sh.id]!
        }
      }
    } catch { /* keep local state */ }
    this.status(`${shape.id} → ${next}`)
    this.redraw()
  }

  // ---- the plan overlay -------------------------------------------------
  // Painted in PAGE space (see the #plan styles), so it is rendered once when
  // the interpretation arrives and then never again: scroll and zoom are the
  // compositor's problem, exactly as they are for the ink. Nothing here reads
  // window.scrollX — a plan that needed the scroll offset would be a plan that
  // could drift from the thing it is describing.

  private svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
    return document.createElementNS('http://www.w3.org/2000/svg', tag)
  }

  /** One outlined box in page coords. */
  private planRect(box: Box, color: string, cls: string): SVGRectElement {
    const r = this.svgEl('rect')
    r.setAttribute('class', cls)
    r.setAttribute('x', String(round1(box.x)))
    r.setAttribute('y', String(round1(box.y)))
    r.setAttribute('width', String(Math.max(0, round1(box.w))))
    r.setAttribute('height', String(Math.max(0, round1(box.h))))
    // inline style, not a stroke="" attribute: presentation attributes rank
    // BELOW stylesheet rules, so a #planSvg rule would repaint every kind the
    // same colour (the exact trap #ink path already documents)
    r.style.stroke = color
    return r
  }

  /**
   * The relationship, drawn: a dashed line between two box centres with a
   * solid head at the destination (both ends for a swap, which has no
   * direction). Skipped when the centres nearly coincide — a 4px arrow is
   * noise, not information.
   */
  private planArrow(from: Box, to: Box, color: string, twoWay: boolean) {
    const x1 = from.x + from.w / 2
    const y1 = from.y + from.h / 2
    const x2 = to.x + to.w / 2
    const y2 = to.y + to.h / 2
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len < 24) return
    const ux = (x2 - x1) / len
    const uy = (y2 - y1) / len
    const line = this.svgEl('line')
    line.setAttribute('class', 'pLink')
    line.setAttribute('x1', String(round1(x1 + ux * 10)))
    line.setAttribute('y1', String(round1(y1 + uy * 10)))
    line.setAttribute('x2', String(round1(x2 - ux * 10)))
    line.setAttribute('y2', String(round1(y2 - uy * 10)))
    line.style.stroke = color
    this.planSvg.appendChild(line)
    const head = (tipX: number, tipY: number, dx: number, dy: number) => {
      const bx = tipX - dx * 14
      const by = tipY - dy * 14
      const p = this.svgEl('polygon')
      p.setAttribute('class', 'pHead')
      p.setAttribute('points', [
        `${round1(tipX)},${round1(tipY)}`,
        `${round1(bx - dy * 6)},${round1(by + dx * 6)}`,
        `${round1(bx + dy * 6)},${round1(by - dx * 6)}`,
      ].join(' '))
      p.style.fill = color
      this.planSvg.appendChild(p)
    }
    head(x2 - ux * 8, y2 - uy * 8, ux, uy)
    if (twoWay) head(x1 + ux * 8, y1 + uy * 8, -ux, -uy)
  }

  /**
   * A label chip in page coords. `top` is provisional: the chip's height is
   * only knowable once it is in the document, so callers collect the chips and
   * one batched pass afterwards lifts each above its box.
   */
  private planChip(box: Box, color: string, kind: string, what: string): HTMLElement {
    const el = document.createElement('div')
    el.className = 'planLabel'
    el.style.setProperty('--k', color)
    el.style.left = `${String(Math.round(box.x))}px`
    el.style.top = `${String(Math.round(box.y))}px`
    const row = document.createElement('div')
    row.className = 'pRow'
    const k = document.createElement('span')
    k.className = 'pKind'
    k.textContent = kind
    const w = document.createElement('span')
    w.className = 'pWhat'
    w.textContent = what
    row.append(k, w)
    el.appendChild(row)
    return el
  }

  /** `e2 · <button> "Sign up"` — the id the reading cited, then what it is. */
  private targetName(t: V2Target): string {
    const text = (t.text || t.subtreeText || '').trim().replace(/\s+/g, ' ')
    return `${t.domId} · <${t.tag}>${text ? ` "${text.slice(0, 24)}"` : ''}`
  }

  /**
   * Everything the run will do, drawn over the page it will do it to. Called
   * whenever the interpretation changes — never on scroll.
   */
  private renderPlan() {
    for (const old of [...this.planLayer.querySelectorAll('.planLabel')]) old.remove()
    this.planSvg.replaceChildren()
    const it = this.v2?.interpretation
    if (!it) {
      this.planLayer.classList.remove('on')
      return
    }
    this.planLayer.classList.add('on')
    // chips are positioned against their box's TOP edge, which needs their
    // own height — measured in one batch after everything is in the document
    const lift: Array<{ el: HTMLElement; top: number }> = []
    for (const a of it.actions) {
      const spec = PLAN_KINDS[a.kind] ?? PLAN_FALLBACK
      const color = spec.color
      const kind = `${a.needsConfirm ? '⚠ ' : ''}${spec.label}`
      // the action's detail (instruction, colour, the user's notes) hangs off
      // ONE chip — repeating it on every target of a 6-element delete would
      // paper over the page it is supposed to be explaining
      let primary: HTMLElement | null = null
      for (const t of a.targets) {
        const el = this.planChip(t.rect, color, kind, this.targetName(t))
        this.planSvg.appendChild(this.planRect(t.rect, color, `pOutline${a.needsConfirm ? ' wide' : ''}`))
        this.planLayer.appendChild(el)
        lift.push({ el, top: t.rect.y })
        primary ??= el
      }
      if (a.region) {
        // where the new thing goes: dashed, because nothing is there yet
        this.planSvg.appendChild(this.planRect(a.region, color, 'pRegion'))
        const el = this.planChip(a.region, color, kind, a.depicts ? `new · ${a.depicts}` : 'new here')
        this.planLayer.appendChild(el)
        lift.push({ el, top: a.region.y })
        primary ??= el
      }
      if (a.dest) {
        // dest means two different things: for a move it is what the thing
        // goes NEXT TO, for a creation it is the container it goes INSIDE
        const word = a.kind === 'add' || a.kind === 'design' ? 'INTO' : 'TO'
        this.planSvg.appendChild(this.planRect(a.dest.rect, color, 'pOutline'))
        const el = this.planChip(a.dest.rect, color, word, this.targetName(a.dest))
        this.planLayer.appendChild(el)
        lift.push({ el, top: a.dest.rect.y })
        if (a.targets[0]) this.planArrow(a.targets[0].rect, a.dest.rect, color, false)
      }
      // a swap has two targets and no direction — the arrow points both ways
      if (a.kind === 'swap' && a.targets.length === 2) {
        this.planArrow(a.targets[0]!.rect, a.targets[1]!.rect, color, true)
      }
      if (!primary) continue
      if (a.instruction) {
        const instr = document.createElement('div')
        instr.className = 'pInstr'
        instr.textContent = a.instruction.length > PLAN_INSTR_MAX
          ? `${a.instruction.slice(0, PLAN_INSTR_MAX)}…`
          : a.instruction
        primary.appendChild(instr)
      }
      if (a.color) {
        const row = document.createElement('div')
        row.className = 'pRow'
        const sw = document.createElement('span')
        sw.className = 'pSwatch'
        // the resolved colour itself, painted — a swatch that merely named a
        // hex would be a picture of the answer rather than the answer
        sw.style.background = a.color.nearest?.css ?? a.color.drawn
        const tok = document.createElement('span')
        tok.className = 'pToken'
        tok.textContent = a.color.nearest ? a.color.nearest.token : a.color.drawn
        row.append(sw, tok)
        primary.appendChild(row)
      }
      // LAST and loudest: the user's own typed words, uncut. Everything above
      // is a reading of the drawing; this is not a reading of anything.
      for (const n of a.notes ?? []) {
        const note = document.createElement('div')
        note.className = 'pNote'
        note.textContent = n
        primary.appendChild(note)
      }
    }
    const pageW = document.documentElement.scrollWidth
    for (const { el, top } of lift) {
      const h = el.offsetHeight
      // above the box when there is room for it, else just inside the top
      el.style.top = `${String(Math.round(top - h - PLAN_LABEL_GAP >= 2 ? top - h - PLAN_LABEL_GAP : top + 3))}px`
      // clamped against the DOCUMENT's width, never the viewport's — a
      // viewport clamp would have to be redone on every scroll, which is the
      // drift this whole layer exists to avoid
      const w = el.offsetWidth
      const left = Number.parseFloat(el.style.left)
      if (left + w > pageW - 4) el.style.left = `${String(Math.max(2, Math.round(pageW - w - 4)))}px`
    }
  }

  /** The one place `this.v2` changes, so the plan can never outlive it. */
  private setV2(v: V2Preview | null) {
    this.v2 = v
    this.renderPlan()
  }

  private drawPreview() {
    // v2's plan lives in the page-space #plan layer, not on this canvas.
    // Clearing chipBoxes matters: they are viewport-space hit boxes from a
    // previous v1 preview and would otherwise keep swallowing taps.
    if (this.v2) {
      this.chipBoxes = []
      return
    }
    if (!this.preview) return
    const { ctx } = this
    const sx = window.scrollX
    const sy = window.scrollY
    this.chipBoxes = []
    ctx.save()
    ctx.font = '11px ui-sans-serif, system-ui'
    ctx.lineWidth = 1.5

    for (const sh of this.preview.shapes) {
      const bx = sh.bbox.x - sx, by = sh.bbox.y - sy
      ctx.strokeStyle = '#059669'
      ctx.setLineDash([5, 4])
      ctx.strokeRect(bx, by, sh.bbox.w, sh.bbox.h)
      ctx.setLineDash([])
      const kindLabel = sh.kind === 'ink' ? 'as-drawn' : sh.kind
      const label = `${sh.id} ${this.overrides[sh.id] === 'ignore' ? '✕ ignored' : kindLabel} ${(this.overrides[sh.id] ? '✎' : Math.round(sh.confidence * 100) + '%')}`
      const w = ctx.measureText(label).width + 12
      const cy = Math.max(2, by - 20)
      ctx.fillStyle = '#059669'
      ctx.beginPath()
      ctx.roundRect(bx, cy, w, 17, 8)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(label, bx + 6, cy + 12)
      this.chipBoxes.push({ x: bx, y: cy, w, h: 17, shapeId: sh.id })
    }
    for (const t of this.preview.textRegions) {
      ctx.strokeStyle = '#7c3aed'
      ctx.setLineDash([3, 3])
      ctx.strokeRect(t.bbox.x - sx, t.bbox.y - sy, t.bbox.w, t.bbox.h)
      ctx.setLineDash([])
      ctx.fillStyle = '#7c3aed'
      ctx.fillText(`${t.id} text`, t.bbox.x - sx + 2, Math.max(10, t.bbox.y - sy - 6))
    }
    for (const op of this.preview.ops) {
      if (!op.rect) continue
      const color = op.op === 'DELETE' ? '#dc2626' : '#d97706'
      ctx.strokeStyle = color
      ctx.lineWidth = op.needsConfirm ? 3 : 1.5
      ctx.strokeRect(op.rect.x - sx, op.rect.y - sy, op.rect.w, op.rect.h)
      ctx.fillStyle = color
      const lbl = `${op.needsConfirm ? '⚠ ' : ''}${op.op} <${op.targetTag ?? '?'}>${op.targetText ? ` "${op.targetText.slice(0, 18)}"` : ''}`
      ctx.fillText(lbl, op.rect.x - sx + 4, op.rect.y - sy + 13)
      ctx.lineWidth = 1.5
    }
    ctx.restore()
  }

  // ---------- tweak mode: Canva-style direct manipulation (zero tokens) ----------
  // Every stamped element is selectable: solid outline + 8 drag handles.
  // Body drag = free move (reorder / margin / translate ladder on release);
  // handle drag = resize (w-*/h-*); gap strips + padding bands remain as
  // secondary affordances on the selected element.

  private exitTweak(msg: string) {
    if (this.tweak) this.clearTweakPreview()
    if (this.paintOpen) this.setPaintOpen(false)
    // a loop (or a pending extract) is a tweak-mode gesture: leaving the mode
    // takes it with us, and never commits it
    if (this.lasso || this.lassoArmed) {
      this.lasso = null
      this.lassoArmed = false
      this.lassoPanel.classList.remove('on')
    }
    this.tweak = null
    this.hoverEl = null
    this.multiSel = []
    this.shadow.getElementById('tweakBtn')?.classList.remove('primary')
    this.setMode('idle')
    this.status(msg)
    this.redraw()
  }

  private deselect(msg: string) {
    if (this.tweak) this.clearTweakPreview()
    // the palette describes the selection; with nothing selected it has no
    // subject, and a popover hanging over the app with no outline to belong to
    // is the worst of both
    if (this.paintOpen) this.setPaintOpen(false)
    // …and with nothing selected it has no component to read
    if (this.propsOpen) void this.setPropsOpen(false)
    this.tweak = null
    this.hoverEl = null
    this.multiSel = []
    this.status(msg)
    this.redraw()
  }

  private clearTweakPreview() {
    const t = this.tweak
    if (!t) return
    if (t.moveDrag) this.endMoveVisuals(t) // Esc mid-drag: don't leak the ghost
    for (const p of [
      'gap', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'transform', 'width', 'height', 'will-change',
    ]) t.el.style.removeProperty(p)
  }

  /**
   * Free-move preview transforms. In-place elements scroll WITH the page, so
   * they take the page delta; position:fixed ghosts don't, so they take the
   * client delta (page − scroll-since-start). Re-applied from the scroll
   * listener too: a wheel scroll with a stationary pointer fires no
   * pointermove, and a parked ghost would diverge from the outline AND from
   * what the release commits.
   */
  private applyMovePreview(t: TweakState, md: NonNullable<TweakState['moveDrag']>) {
    const csx = window.scrollX - md.scrollStartX
    const csy = window.scrollY - md.scrollStartY
    if (md.ghost) md.ghost.style.transform = `translate(${md.dx - csx}px, ${md.dy - csy}px)`
    else t.el.style.transform = `${md.baseTransform}translate(${md.dx}px, ${md.dy}px)`
    for (const g of md.group) {
      if (g.ghost) g.ghost.style.transform = `translate(${md.dx - csx}px, ${md.dy - csy}px)`
      else g.el.style.transform = `${g.baseTransform}translate(${md.dx}px, ${md.dy}px)`
    }
  }

  /** Tear down free-move preview state: ghost, dimming, lift. Idempotent. */
  private endMoveVisuals(t: TweakState) {
    const md = t.moveDrag
    if (!md) return
    md.ghost?.remove()
    md.ghost = null
    t.el.style.opacity = md.prev.opacity
    t.el.style.position = md.prev.position
    t.el.style.zIndex = md.prev.zIndex
    t.el.style.removeProperty('transform')
    t.el.style.removeProperty('will-change')
    for (const g of md.group) {
      g.ghost?.remove()
      g.ghost = null
      g.el.style.opacity = g.prev.opacity
      g.el.style.position = g.prev.position
      g.el.style.zIndex = g.prev.zIndex
      g.el.style.removeProperty('transform')
      g.el.style.removeProperty('will-change')
    }
  }

  // ---- geometry tracking ----------------------------------------------
  // Everything drawn on the overlay derives from LIVE rects at paint time;
  // this rAF loop watches a cheap geometry signature (selection, linked
  // instances, extras, hover, scroll/viewport) and, when it changes,
  // re-derives the selection-time caches (zones) and repaints. Runs only in
  // tweak mode; drags pause it (they repaint themselves every pointermove).

  private trackRaf: number | null = null
  private trackSig = ''

  private startTracking() {
    if (this.trackRaf == null) this.trackRaf = requestAnimationFrame(this.trackTick)
  }

  private stopTracking() {
    if (this.trackRaf != null) cancelAnimationFrame(this.trackRaf)
    this.trackRaf = null
    this.trackSig = ''
  }

  private trackTick = (): void => {
    this.trackRaf = null
    // Ink anchored to an element has to track it the same way tweak overlays
    // do — the loop is no longer tweak's alone.
    const anchored = this.strokes.some((st) => st.anchor)
    if (this.mode !== 'tweak' && !anchored) {
      this.trackSig = ''
      return
    }
    this.trackRaf = requestAnimationFrame(this.trackTick)
    const t = this.tweak
    if (t && (t.moveDrag || t.handleDrag || t.drag)) {
      // a drag repaints itself every pointermove, but the ink still has to
      // ride along with whatever the hand is moving
      if (anchored) this.followAnchors()
      return
    }
    // primary remounted (external edit + HMR): re-resolve by instance index.
    // A transient EMPTY result (suspense fallback, error-boundary flash,
    // mid-remount) is NOT a deselect — keep waiting; reselectAfterCommit's
    // settle timer must stay in play for slow remounts.
    if (t && !document.contains(t.el)) {
      const all = [...document.querySelectorAll(`[data-s2c="${t.srcLoc}"]`)] as HTMLElement[]
      if (all.length === 0) return
      const next = all[Math.min(t.instanceIndex, all.length - 1)]!
      this.tweak = this.buildTweakState(next, t.scope)
      this.trackSig = ''
      this.redraw()
      return
    }
    const sig = `${this.trackSignature()}${this.anchorSignature()}`
    if (sig !== this.trackSig) {
      this.trackSig = sig
      if (t) this.refreshTweakGeometry(t)
      if (anchored) this.followAnchors()
      this.redraw()
    }
  }

  /** Cheap change detector: every rect the overlay renders from, plus the
   *  scroll/viewport state that maps them to canvas space. */
  private trackSignature(): string {
    const vv = window.visualViewport
    const parts: number[] = [
      window.scrollX, window.scrollY, window.innerWidth, window.innerHeight,
      vv?.scale ?? 1, vv?.offsetLeft ?? 0, vv?.offsetTop ?? 0,
    ]
    const push = (r: DOMRect) => parts.push(r.left, r.top, r.width, r.height)
    const t = this.tweak
    if (t && document.contains(t.el)) push(t.el.getBoundingClientRect())
    if (t) {
      for (const ie of t.instanceEls) {
        if (ie !== t.el && document.contains(ie)) push(ie.getBoundingClientRect())
      }
    }
    for (const m of this.multiSel) {
      const el = this.resolveExtra(m)
      if (el && el !== t?.el) push(el.getBoundingClientRect())
    }
    if (this.hoverEl && document.contains(this.hoverEl)) push(this.hoverEl.getBoundingClientRect())
    return parts.join(',')
  }

  /** Re-derive the selection-time geometry caches from the live layout —
   *  including style-derived fields: a breakpoint-crossing resize can flip
   *  flex direction (gap-drag axis) or display, and inFlow rides commits. */
  private refreshTweakGeometry(t: TweakState) {
    const cs = getComputedStyle(t.el)
    t.rect = t.el.getBoundingClientRect()
    t.display = cs.display
    t.direction = cs.flexDirection === 'column' ? 'column' : 'row'
    t.inFlow = cs.position === 'static' || cs.position === 'relative'
    // same rule as buildTweakState: a shape has no bands to re-derive, and
    // re-deriving them here would quietly put them back on the next scroll
    t.zones = isShapeEl(t.el) ? [] : this.computeZones(t.el)
  }

  /** Deepest stamped element under the point — anything stamped is fair game. */
  /**
   * What a stroke is drawn ON: the TIGHTEST stamped element that contains the
   * whole stroke.
   *
   * Not the element under the ink's midpoint — a ring drawn around a card
   * crosses that card's value line on its way past, and anchoring to the line
   * makes the ring scale with a paragraph instead of with the card. Containing
   * the ink is what "drawn on" means: a scribble inside a card anchors to the
   * card, a ring around it anchors to the card, and an arrow between two cards
   * anchors to the container both of them move within.
   */
  private anchorFor(points: Pt[]): StrokeAnchor | null {
    const mid = points[Math.floor(points.length / 2)]
    if (!mid) return null
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const ink = { x: Math.min(...xs), y: Math.min(...ys), w: 0, h: 0 }
    ink.w = Math.max(...xs) - ink.x
    ink.h = Math.max(...ys) - ink.y

    let el = this.pickAnyStamped(mid.x - window.scrollX, mid.y - window.scrollY)
    // a few px of slack: ink drawn "around" something usually clears it by a
    // hair, and demanding strict containment would walk up one level too far
    const contains = (r: { x: number; y: number; w: number; h: number }) =>
      r.x - 4 <= ink.x && r.y - 4 <= ink.y &&
      r.x + r.w + 4 >= ink.x + ink.w && r.y + r.h + 4 >= ink.y + ink.h
    while (el && !contains(pageRect(el))) {
      let parent: HTMLElement | null = el.parentElement
      while (parent && !parent.dataset.s2c) parent = parent.parentElement
      if (!parent) break
      el = parent
    }
    const src = el?.dataset.s2c
    if (!el || !src) return null
    const peers = [...document.querySelectorAll(`[data-s2c="${src}"]`)] as HTMLElement[]
    return { src, index: Math.max(0, peers.indexOf(el)), rect: pageRect(el), scale: this.layerScale() }
  }

  /**
   * How much an ancestor is scaling the overlay right now (CSS zoom on the
   * host page, a transform on body, …), measured off a fixed-size probe.
   *
   * The ink layer lives in page space and is scaled by the same ancestors as
   * the content, which is why zoom needs no handling at all. An anchor delta
   * measured from getBoundingClientRect, though, ALSO carries that scale — and
   * applying it on top double-counts it (a 1.25 zoom rendered ink at 1.56).
   * Normalizing both boxes by the scale in force when each was measured leaves
   * only the layout change the anchor is meant to track.
   */
  private layerScale(): number {
    const w = this.scaleProbe.getBoundingClientRect().width
    return w > 0.01 ? w / 100 : 1
  }

  /** The anchor's box and its current box, both in the layer's own units. */
  private anchorBoxes(a: StrokeAnchor): { o: Box; now: Box } | null {
    const el = this.anchorEl(a)
    if (!el) return null
    const k = this.layerScale() || 1
    const s0 = a.scale || 1
    const r = pageRect(el)
    const o = { x: a.rect.x / s0, y: a.rect.y / s0, w: a.rect.w / s0, h: a.rect.h / s0 }
    const now = { x: r.x / k, y: r.y / k, w: r.w / k, h: r.h / k }
    if (o.w < 1 || o.h < 1 || now.w < 1 || now.h < 1) return null
    return { o, now }
  }

  /** The element an anchor points at now, re-resolved after any remount. */
  private anchorEl(a: StrokeAnchor): HTMLElement | null {
    const peers = [...document.querySelectorAll(`[data-s2c="${a.src}"]`)] as HTMLElement[]
    return peers[Math.min(a.index, peers.length - 1)] ?? null
  }

  /**
   * How the anchor has moved and resized since the stroke was drawn, as an SVG
   * transform about the old box's origin. Null when it hasn't moved — the
   * common case, and worth skipping so an untouched page writes no attributes.
   */
  private anchorTransform(a: StrokeAnchor): string | null {
    // a collapsed box (display:none mid-HMR) would scale the ink to nothing
    const boxes = this.anchorBoxes(a)
    if (!boxes) return null
    const { o, now } = boxes
    const sx = now.w / o.w
    const sy = now.h / o.h
    if (Math.abs(now.x - o.x) < 0.5 && Math.abs(now.y - o.y) < 0.5 &&
        Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002) return null
    return `translate(${String(round1(now.x))} ${String(round1(now.y))}) scale(${String(round3(sx))} ${String(round3(sy))}) translate(${String(round1(-o.x))} ${String(round1(-o.y))})`
  }

  /** Apply the current anchor transforms to already-rendered paths. */
  private followAnchors() {
    const paths = this.ink.querySelectorAll('path')
    this.strokes.forEach((st, i) => {
      const path = paths[i]
      if (!path) return
      const t = st.anchor ? this.anchorTransform(st.anchor) : null
      if (t) path.setAttribute('transform', t)
      else path.removeAttribute('transform')
    })
  }

  /** A cheap signature of where every anchored stroke's element sits now. */
  private anchorSignature(): string {
    let sig = ''
    for (const st of this.strokes) {
      if (!st.anchor) continue
      const el = this.anchorEl(st.anchor)
      if (!el) { sig += '|x'; continue }
      const r = el.getBoundingClientRect()
      sig += `|${String(round1(r.left))},${String(round1(r.top))},${String(round1(r.width))},${String(round1(r.height))}`
    }
    return sig
  }

  /**
   * Bake the anchor transforms into the points themselves.
   *
   * The server hit-tests ink against a snapshot of the live DOM, so what it
   * receives has to be where the ink IS, not where it was drawn. Called on the
   * way out for exactly that reason.
   */
  private strokesForWire(): Stroke[] {
    return this.strokes.map((st) => {
      const a = st.anchor
      if (!a) return st
      const boxes = this.anchorBoxes(a)
      if (!boxes) return st
      const { o, now } = boxes
      const sx = now.w / o.w
      const sy = now.h / o.h
      if (Math.abs(now.x - o.x) < 0.5 && Math.abs(now.y - o.y) < 0.5 &&
          Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002) return st
      return {
        ...st,
        points: st.points.map((p) => ({
          x: now.x + (p.x - o.x) * sx,
          y: now.y + (p.y - o.y) * sy,
          t: p.t,
        })),
      }
    })
  }

  private setIdeEditor(name: string | null) {
    this.ideEditor = name
    this.shadow.getElementById('ideDot')?.classList.toggle('on', name !== null)
  }

  /**
   * Ask the editor to open the line behind an element.
   *
   * Fire-and-forget on purpose: this runs from a click, and a missing editor
   * is a normal state rather than an error — the server answers
   * delivered: 0 and the click still does whatever else it was doing.
   */
  private revealInEditor(srcLoc: string | null | undefined) {
    if (!srcLoc || !this.ideEditor) return
    const [file, line, col] = srcLoc.split(':')
    if (!file || !line) return
    void fetch('/@s2c/ide/reveal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
      body: JSON.stringify({ file, line: Number(line), col: Number(col ?? 1) }),
    }).catch(() => { /* the editor going away mid-click is not an error */ })
  }

  /**
   * Paint where the editor's cursor is.
   *
   * The cursor almost never sits on an opening tag, so the element it is
   * "in" is the one whose stamp is the LAST at or above that line — and the
   * deepest such node, since a child's tag is always below its parent's.
   */
  private showIdeCursor(file: string, line: number) {
    const candidates = [...document.querySelectorAll(`[data-s2c^="${CSS.escape(file)}:"]`)] as HTMLElement[]
    let best: HTMLElement | null = null
    let bestLine = -1
    let bestDepth = -1
    for (const el of candidates) {
      const at = Number(el.dataset.s2c?.split(':')[1] ?? 0)
      if (at > line) continue
      let depth = 0
      for (let n: HTMLElement | null = el; n; n = n.parentElement) depth++
      if (at > bestLine || (at === bestLine && depth > bestDepth)) {
        best = el
        bestLine = at
        bestDepth = depth
      }
    }
    if (!best) return
    const r = best.getBoundingClientRect()
    this.ideHighlight = {
      rect: { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height },
      until: performance.now() + IDE_CURSOR_MS,
    }
    this.redraw()
    // one repaint after it expires, so it clears itself without a ticker
    window.setTimeout(() => {
      if (this.ideHighlight && performance.now() >= this.ideHighlight.until) {
        this.ideHighlight = null
        this.redraw()
      }
    }, IDE_CURSOR_MS + 60)
  }

  private pickAnyStamped(x: number, y: number): HTMLElement | null {
    let el = this.elementUnder(x, y) as HTMLElement | null
    while (el && el !== document.body) {
      if (el.dataset.s2c) return el
      el = el.parentElement
    }
    return null
  }

  /** The raw topmost element under the point, with our own canvas taken out of
   *  the way. Both pickers start here. */
  private elementUnder(x: number, y: number): Element | null {
    this.canvas.style.pointerEvents = 'none'
    const el = document.elementFromPoint(x, y)
    this.canvas.style.pointerEvents = ''
    return el
  }

  /** Every stamped shape in the document, cached for SHAPE_CACHE_MS. */
  private shapeEls(): SVGGeometryElement[] {
    const now = performance.now()
    if (this.shapeCache && now - this.shapeCache.at < SHAPE_CACHE_MS) return this.shapeCache.els
    const sel = [...SHAPE_TAGS].map((t) => `svg ${t}[data-s2c]`).join(',')
    const els = [...document.querySelectorAll(sel)].filter(isShapeEl)
    this.shapeCache = { at: now, els }
    return els
  }

  /**
   * The SVG shape under the pointer, or null.
   *
   * Two things make this its own hit-test rather than a use of
   * document.elementFromPoint. First, artwork is almost always
   * pointer-events:none decoration, so elementFromPoint NEVER returns a
   * <path> — it returns the HTML behind it. Second, a shape's real extent is
   * its geometry, not its box: a 2px pen line across a 900px-wide bbox should
   * be clickable on the line and nowhere else. isPointInStroke/isPointInFill
   * answer exactly that, in the element's own user space (hence the screen
   * CTM inverse), so a click lands on the stroke the user aimed at.
   *
   * Two guards keep this from stealing clicks that belong to the page:
   *  - only PAINTED geometry counts. A fill:none outline is reachable by its
   *    stroke alone, which is also the honest rule: you can click what you see.
   *  - the shape must live INSIDE whatever the pointer actually hit. A
   *    full-bleed decorative layer at -z-10 sits behind every card on the
   *    page; without this, its invisible chevrons would swallow every click
   *    on those cards.
   */
  private pickShape(x: number, y: number): SVGGeometryElement | null {
    const under = this.elementUnder(x, y)
    if (!under) return null
    let best: SVGGeometryElement | null = null
    let bestArea = Infinity
    for (const el of this.shapeEls()) {
      if (el !== under && !under.contains(el)) continue
      const box = el.getBoundingClientRect()
      // a couple of px of slack for the stroke's own width at the edges
      if (x < box.left - 4 || x > box.right + 4 || y < box.top - 4 || y > box.bottom + 4) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const ctm = el.getScreenCTM()
      if (!ctm) continue
      const p = new DOMPoint(x, y).matrixTransform(ctm.inverse())
      const hit =
        (cs.stroke !== 'none' && el.isPointInStroke(p)) ||
        (cs.fill !== 'none' && el.isPointInFill(p))
      if (!hit) continue
      // the tightest hit wins: a nose inside a face is the shape you clicked
      const area = box.width * box.height
      if (area < bestArea) {
        best = el
        bestArea = area
      }
    }
    return best
  }

  /**
   * What a tweak click selects: the shape under the pointer if there is one,
   * else the deepest stamped element. Shapes go FIRST because a click that
   * lands on a drawn line means that line — walking up to the <svg> or the
   * card behind it is the answer to a question nobody asked.
   *
   * (Shift+click group moves deliberately keep using pickAnyStamped: a set of
   * shapes to drag as one body is not a thing this offers, and a shape that
   * joined a group move would commit a Tailwind position class onto a <path>.)
   */
  private pickTweakTarget(x: number, y: number): HTMLElement | null {
    const shape = this.pickShape(x, y)
    if (shape?.dataset.s2c) return shape as unknown as HTMLElement
    return this.pickAnyStamped(x, y)
  }

  /**
   * Gap strips + padding bands from the element's LIVE geometry. Called at
   * selection time and again by the tracking loop whenever layout moves —
   * stale zones would hit-test (and render) where the element used to be.
   */
  private computeZones(el: HTMLElement): TweakZone[] {
    const cs = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    const direction = cs.flexDirection === 'column' ? 'column' : 'row'
    const zones: TweakZone[] = []

    // gap strips between children (flex/grid)
    if ((cs.display === 'flex' || cs.display === 'grid') && el.children.length >= 2) {
      const kids = [...el.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0)
      const sorted = [...kids].sort((a, b) => (direction === 'row' ? a.left - b.left : a.top - b.top))
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!
        const cur = sorted[i]!
        if (direction === 'row') {
          const gx = prev.right
          const gw = cur.left - prev.right
          if (gw >= 2 && gw < 200) zones.push({ x: gx, y: rect.top, w: gw, h: rect.height, kind: 'gap' })
        } else {
          const gy = prev.bottom
          const gh = cur.top - prev.bottom
          if (gh >= 2 && gh < 200) zones.push({ x: rect.left, y: gy, w: rect.width, h: gh, kind: 'gap' })
        }
      }
    }

    // padding ring: a band along each inner edge (min 8px grab area)
    const pad = (side: string) => parseFloat(cs.getPropertyValue('padding-' + side))
    const bands: Array<['pt' | 'pr' | 'pb' | 'pl', number]> = [
      ['pt', pad('top')], ['pr', pad('right')], ['pb', pad('bottom')], ['pl', pad('left')],
    ]
    for (const [kind, v] of bands) {
      const grab = Math.max(8, v)
      if (kind === 'pt') zones.push({ x: rect.left, y: rect.top, w: rect.width, h: grab, kind })
      if (kind === 'pb') zones.push({ x: rect.left, y: rect.bottom - grab, w: rect.width, h: grab, kind })
      if (kind === 'pl') zones.push({ x: rect.left, y: rect.top, w: grab, h: rect.height, kind })
      if (kind === 'pr') zones.push({ x: rect.right - grab, y: rect.top, w: grab, h: rect.height, kind })
    }
    return zones
  }

  private buildTweakState(el: HTMLElement, scope: 'all' | 'one' = 'all'): TweakState {
    const cs = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    // all live instances of this stamp — >1 means a shared template (.map())
    const srcLoc = el.dataset.s2c ?? ''
    const instanceEls = srcLoc
      ? ([...document.querySelectorAll(`[data-s2c="${srcLoc}"]`)] as HTMLElement[])
      : [el]
    const instanceIndex = Math.max(0, instanceEls.indexOf(el))
    const direction = cs.flexDirection === 'column' ? 'column' : 'row'
    // A <path> has no gap and no padding, so it gets no bands: they would tile
    // the whole of a small shape and turn every click on it into a padding
    // drag that commits a spacing class onto a piece of artwork.
    const zones = isShapeEl(el) ? [] : this.computeZones(el)

    return {
      el,
      srcLoc,
      rect,
      display: cs.display,
      direction,
      inFlow: cs.position === 'static' || cs.position === 'relative',
      instanceEls,
      instanceIndex,
      scope: instanceEls.length > 1 ? scope : 'all',
      zones,
      drag: null,
      handleDrag: null,
      moveDrag: null,
      preview: {},
    }
  }

  /**
   * Magnetic guides for this element: sibling edges + centers, plus the
   * parent's padding box. Viewport coords, cached at drag start (the pointer
   * can't scroll mid-drag).
   */
  private collectGuides(el: HTMLElement): Guide[] {
    // PAGE coords: guides must survive a mid-drag scroll (converted back to
    // client space only when drawn)
    const sx = window.scrollX
    const sy = window.scrollY
    const guides: Guide[] = []
    const parent = el.parentElement
    if (!parent) return guides
    const pr0 = parent.getBoundingClientRect()
    const pr = { left: pr0.left + sx, right: pr0.right + sx, top: pr0.top + sy, bottom: pr0.bottom + sy }
    const pcs = getComputedStyle(parent)
    const pad = (s: string) => parseFloat(pcs.getPropertyValue('padding-' + s)) || 0
    const box = {
      left: pr.left + pad('left'), right: pr.right - pad('right'),
      top: pr.top + pad('top'), bottom: pr.bottom - pad('bottom'),
    }
    guides.push(
      { axis: 'v', pos: box.left, lo: box.top, hi: box.bottom },
      { axis: 'v', pos: box.right, lo: box.top, hi: box.bottom },
      { axis: 'h', pos: box.top, lo: box.left, hi: box.right },
      { axis: 'h', pos: box.bottom, lo: box.left, hi: box.right },
    )
    for (const k of parent.children) {
      if (k === el || k === this.host) continue
      const kr0 = k.getBoundingClientRect()
      if (kr0.width <= 0 && kr0.height <= 0) continue
      const kr = { left: kr0.left + sx, right: kr0.right + sx, top: kr0.top + sy, bottom: kr0.bottom + sy, width: kr0.width, height: kr0.height }
      guides.push(
        { axis: 'v', pos: kr.left, lo: kr.top, hi: kr.bottom },
        { axis: 'v', pos: kr.left + kr.width / 2, lo: kr.top, hi: kr.bottom },
        { axis: 'v', pos: kr.right, lo: kr.top, hi: kr.bottom },
        { axis: 'h', pos: kr.top, lo: kr.left, hi: kr.right },
        { axis: 'h', pos: kr.top + kr.height / 2, lo: kr.left, hi: kr.right },
        { axis: 'h', pos: kr.bottom, lo: kr.left, hi: kr.right },
      )
    }
    return guides
  }

  /**
   * Best snap on one axis: smallest |guide − candidate| within SNAP_PX.
   * Returns the correction to ADD to the displacement, and the guide (for
   * the pink line).
   */
  private bestSnap(
    guides: Guide[],
    axis: 'v' | 'h',
    candidates: number[],
  ): { delta: number; guide: Guide } | null {
    let best: { delta: number; guide: Guide } | null = null
    for (const g of guides) {
      if (g.axis !== axis) continue
      for (const c of candidates) {
        const d = g.pos - c
        if (Math.abs(d) <= SNAP_PX && (!best || Math.abs(d) < Math.abs(best.delta))) {
          best = { delta: d, guide: g }
        }
      }
    }
    return best
  }

  /** Does any ancestor clip its contents? Then a dragged child can't visually escape. */
  private hasClippingAncestor(el: HTMLElement): boolean {
    let p = el.parentElement
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p)
      for (const o of [cs.overflow, cs.overflowX, cs.overflowY]) {
        if (o && o !== 'visible') return true
      }
      p = p.parentElement
    }
    return false
  }

  /** Instance fields for move/resize commit bodies (shared-template scope). */
  private instanceFields(t: TweakState): Record<string, unknown> {
    if (t.instanceEls.length <= 1) return {}
    return {
      instanceIndex: t.instanceIndex,
      instanceCount: t.instanceEls.length,
      choice: t.scope === 'one' ? 'just-this-one' : 'all',
    }
  }

  /**
   * Multi-selection release: one manipulate POST per element, sequentially
   * (each pushes the undo stack, so Ctrl+Z walks them back one at a time).
   * Every receipt is logged; the status line collapses to one summary.
   */
  private async commitGroupMove(
    t: TweakState,
    md: NonNullable<TweakState['moveDrag']>,
  ): Promise<void> {
    const dx = Math.round(md.dx)
    const dy = Math.round(md.dy)
    const targets: Array<{ srcLoc: string; inFlow: boolean; el: HTMLElement; primary: boolean }> = [
      { srcLoc: t.srcLoc, inFlow: t.inFlow, el: t.el, primary: true },
      ...md.group.map((g) => ({ srcLoc: g.srcLoc, inFlow: g.inFlow, el: g.el, primary: false })),
    ]
    this.status(`committing ${targets.length} moves…`)
    let done = 0
    let firstErr: string | null = null
    // two members of one .map() template both resolve to ONE 'all' template
    // edit — committing it twice would report a phantom second receipt (and
    // a phantom undo step, since the no-change repeat pushes nothing)
    const committedTemplates = new Set<string>()
    for (const tg of targets) {
      // per-element shared-template scope: the primary honors its chosen
      // scope; extras have no scope UI, so multi-instance extras edit their
      // template ('all') — their siblings are visibly outlined anyway
      const all = [...document.querySelectorAll(`[data-s2c="${tg.srcLoc}"]`)] as HTMLElement[]
      const choice = tg.primary && t.scope === 'one' ? 'just-this-one' : 'all'
      const inst = all.length > 1
        ? { instanceIndex: Math.max(0, all.indexOf(tg.el)), instanceCount: all.length, choice }
        : {}
      if (choice === 'all' && committedTemplates.has(tg.srcLoc)) continue
      try {
        const res = await fetch('/@s2c/manipulate', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
          body: JSON.stringify({
            srcLoc: tg.srcLoc, prop: 'move', dx, dy, inFlow: tg.inFlow,
            exactX: md.snappedX, exactY: md.snappedY, ...inst, ...this.responsiveWidth(),
          }),
        })
        const out = (await res.json()) as { ok: boolean; change?: string; file?: string; error?: string }
        if (!res.ok || !out.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
        console.debug(`[s2c] ✓ ${out.change} in ${out.file}`)
        if (choice === 'all') committedTemplates.add(tg.srcLoc)
        done++
      } catch (err) {
        firstErr ??= err instanceof Error ? err.message : String(err)
      }
    }
    if (firstErr) {
      this.status(`✗ moved ${done} of ${targets.length} elements — ${firstErr}`, true)
      this.redraw()
    } else {
      this.status(`✓ moved ${done} element${done === 1 ? '' : 's'} · 0 tokens · Ctrl+Z reverts one at a time`)
    }
    this.reselectAfterCommit(t)
  }

  /** Current visual selection rect — cached geometry during drags (no reads). */
  private selRect(t: TweakState): SelRect {
    if (t.handleDrag) {
      const hd = t.handleDrag
      const width = hd.w ?? hd.startRect.width
      const height = hd.h ?? hd.startRect.height
      const k = hd.handle
      // pulling a west/north edge moves THAT edge: the opposite edge stays
      const csx = window.scrollX - hd.scrollStartX
      const csy = window.scrollY - hd.scrollStartY
      const left = ((k === 'w' || k === 'nw' || k === 'sw')
        ? hd.startRect.left + hd.startRect.width - width
        : hd.startRect.left) - csx
      const top = ((k === 'n' || k === 'ne' || k === 'nw')
        ? hd.startRect.top + hd.startRect.height - height
        : hd.startRect.top) - csy
      return { left, top, width, height }
    }
    if (t.moveDrag) {
      const md = t.moveDrag
      // dx/dy are page deltas; the canvas draws in client space
      return {
        left: md.startRect.left + md.dx - (window.scrollX - md.scrollStartX),
        top: md.startRect.top + md.dy - (window.scrollY - md.scrollStartY),
        width: md.startRect.width,
        height: md.startRect.height,
      }
    }
    const r = t.el.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }

  /**
   * The 8 Canva handles: corners + edge midpoints, viewport coords. On small
   * elements the midpoints are dropped so the handle hit-boxes don't tile the
   * whole rect and swallow body drags / drill-down clicks.
   */
  private handlePoints(r: SelRect): Array<{ kind: HandleKind; x: number; y: number }> {
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const rt = r.left + r.width
    const bt = r.top + r.height
    const pts: Array<{ kind: HandleKind; x: number; y: number }> = [
      { kind: 'nw', x: r.left, y: r.top }, { kind: 'ne', x: rt, y: r.top },
      { kind: 'se', x: rt, y: bt }, { kind: 'sw', x: r.left, y: bt },
    ]
    if (Math.min(r.width, r.height) >= HANDLE_HIT * 4) {
      pts.push(
        { kind: 'n', x: cx, y: r.top }, { kind: 'e', x: rt, y: cy },
        { kind: 's', x: cx, y: bt }, { kind: 'w', x: r.left, y: cy },
      )
    }
    return pts
  }

  private hitHandle(r: SelRect, x: number, y: number): { kind: HandleKind; x: number; y: number } | undefined {
    return this.handlePoints(r).find(
      (h) => Math.abs(x - h.x) <= HANDLE_HIT && Math.abs(y - h.y) <= HANDLE_HIT,
    )
  }

  private selectElement(el: HTMLElement, keepSet = false) {
    if (this.tweak) this.clearTweakPreview()
    if (!keepSet) this.multiSel = []
    this.tweak = this.buildTweakState(el)
    // selecting something on the page IS pointing at a line of code, so an
    // attached editor follows the selection rather than needing a second
    // gesture for the same intent
    this.revealInEditor(el.dataset.s2c)
    this.hoverEl = null
    const t = this.tweak
    const r = el.getBoundingClientRect()
    const linked = t.instanceEls.length > 1
      ? ` · ${t.instanceEls.length} linked (double-click: just this one)`
      : ''
    // A shape is a different kind of selection: it offers a colour, not eight
    // handles, so it says so — and the palette opens with it, because "click a
    // colour" is the whole interaction and making the user find a key for it
    // would be a menu in front of a one-step job.
    if (isShapeEl(el)) {
      this.status(
        `<${el.tagName.toLowerCase()}> in ${stampFile(t.srcLoc)} · ` +
        `click a colour to paint it${linked}`,
      )
      this.setPaintOpen(true)
      this.redraw()
      return
    }
    if (this.paintOpen) this.setPaintOpen(false)
    // an open props panel follows the selection: it is about whatever is
    // selected, and a panel describing the PREVIOUS element would be a lie
    // that looks exactly like the truth
    if (this.propsOpen) void this.readProps()
    const layout = t.display === 'flex' || t.display === 'grid' ? ` · ${t.display} ${t.direction}` : ''
    const set = this.multiSel.length > 0 ? ` · set of ${this.multiSel.length + 1}` : ''
    this.status(
      `${el.tagName.toLowerCase()} · ${Math.round(r.width)}×${Math.round(r.height)}${layout} · ` +
      `${t.srcLoc.split(':')[0]}${linked}${set} — drag to move, handles to resize`,
    )
    this.redraw()
  }

  /**
   * Shift+click: toggle membership in the multi-selection. The clicked
   * element becomes primary (handles live on the last-clicked); clicking a
   * member again removes it. Esc clears the set.
   */
  private onShiftPick(e: PointerEvent) {
    const el = this.pickAnyStamped(e.clientX, e.clientY)
    if (!el) return
    const t = this.tweak
    if (!t) {
      this.selectElement(el)
      return
    }
    if (el === t.el) {
      // remove the primary: promote the most recent extra, else deselect
      const last = this.multiSel.pop()
      const nextEl = last ? this.resolveExtra(last) : null
      if (nextEl) this.selectElement(nextEl, true)
      else this.deselect('deselected')
      return
    }
    const idx = this.multiSel.findIndex((m) => this.resolveExtra(m) === el)
    if (idx >= 0) {
      this.multiSel.splice(idx, 1)
      this.status(`removed from set · ${this.multiSel.length + 1} selected`)
      this.redraw()
      return
    }
    if (!t.srcLoc || !el.dataset.s2c) return
    this.multiSel.push({ el: t.el, srcLoc: t.srcLoc, instanceIndex: t.instanceIndex })
    this.selectElement(el, true)
  }

  /** Cache all geometry the move needs so pointermove never touches layout. */
  private startMoveDrag(t: TweakState, e: PointerEvent) {
    const r = t.el.getBoundingClientRect()
    const siblings: Array<{ index: number; left: number; top: number; right: number; bottom: number }> = []
    let parentSrcLoc: string | null = null
    let fromIndex = -1
    const parent = t.el.parentElement
    if (parent?.dataset.s2c) {
      const pd = getComputedStyle(parent).display
      if (pd === 'flex' || pd === 'grid') {
        const kids = [...parent.children]
        fromIndex = kids.indexOf(t.el)
        kids.forEach((k, i) => {
          if (k === t.el) return
          const kr = k.getBoundingClientRect()
          if (kr.width > 0 || kr.height > 0) {
            // page coords — the slot detent must survive a mid-drag scroll
            siblings.push({
              index: i,
              left: kr.left + window.scrollX, top: kr.top + window.scrollY,
              right: kr.right + window.scrollX, bottom: kr.bottom + window.scrollY,
            })
          }
        })
        parentSrcLoc = parent.dataset.s2c ?? null
      }
    }
    const cs = getComputedStyle(t.el)
    const baseTransform = cs.transform
    const guides = this.collectGuides(t.el)
    const lift = this.liftForDrag(t.el, r, cs)
    // extra multi-selection members ride along, each with its own ghost/lift
    const group: GroupMember[] = []
    for (const m of this.multiSel) {
      const mel = this.resolveExtra(m)
      if (!mel || mel === t.el) continue
      // ancestors/descendants of another member would DOUBLE-move: their
      // translates compose through the tree and both would commit. Skip
      // nested members (and duplicates a remount re-resolve can produce).
      if (t.el.contains(mel) || mel.contains(t.el)) continue
      if (group.some((g) => g.el === mel || g.el.contains(mel) || mel.contains(g.el))) continue
      const mr = mel.getBoundingClientRect()
      const mcs = getComputedStyle(mel)
      const mlift = this.liftForDrag(mel, mr, mcs)
      group.push({
        el: mel,
        srcLoc: m.srcLoc,
        inFlow: mcs.position === 'static' || mcs.position === 'relative',
        startRect: { left: mr.left, top: mr.top, width: mr.width, height: mr.height },
        baseTransform: mcs.transform === 'none' ? '' : `${mcs.transform} `,
        ghost: mlift.ghost,
        prev: mlift.prev,
      })
    }
    t.moveDrag = {
      startX: e.clientX + window.scrollX,
      startY: e.clientY + window.scrollY,
      startClientX: e.clientX,
      startClientY: e.clientY,
      dx: 0,
      dy: 0,
      startRect: { left: r.left, top: r.top, width: r.width, height: r.height },
      siblings,
      parentSrcLoc,
      fromIndex,
      proposedIndex: -1,
      baseTransform: baseTransform === 'none' ? '' : `${baseTransform} `,
      guides,
      activeGuides: [],
      snappedX: false,
      snappedY: false,
      ghost: lift.ghost,
      prev: lift.prev,
      group,
      scrollStartX: window.scrollX,
      scrollStartY: window.scrollY,
    }
    this.canvas.setPointerCapture(e.pointerId)
  }

  /**
   * Make one element visually draggable anywhere: a document-level fixed
   * ghost when an ancestor clips (original dims to 40%), else lift in place
   * (position:relative if static + max z-index). Returns what to restore.
   */
  private liftForDrag(
    el: HTMLElement,
    r: SelRect,
    cs: CSSStyleDeclaration,
  ): { ghost: HTMLElement | null; prev: { opacity: string; position: string; zIndex: string } } {
    const prev = { opacity: el.style.opacity, position: el.style.position, zIndex: el.style.zIndex }
    let ghost: HTMLElement | null = null
    if (this.hasClippingAncestor(el)) {
      ghost = el.cloneNode(true) as HTMLElement
      ghost.removeAttribute('data-s2c')
      for (const d of ghost.querySelectorAll('[data-s2c]')) d.removeAttribute('data-s2c')
      ghost.setAttribute('data-s2c-ghost', '')
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        margin: '0',
        boxSizing: 'border-box',
        zIndex: '2147482999',
        pointerEvents: 'none',
        transition: 'none',
        willChange: 'transform',
        // the fixed left/top already include any class translate-*; zero the
        // clone's own translate/transform so it isn't applied twice (Tailwind
        // v4 sets the CSS `translate` property, which would COMPOSE with the
        // inline transform written during the drag)
        translate: 'none',
        transform: 'translate(0px, 0px)',
      } satisfies Partial<CSSStyleDeclaration>)
      document.body.appendChild(ghost)
      el.style.opacity = '0.4'
    } else {
      if (cs.position === 'static') el.style.position = 'relative'
      el.style.zIndex = '2147482998'
      el.style.willChange = 'transform'
    }
    return { ghost, prev }
  }

  /** Live element for an extra selection, re-resolved by stamp+index if remounted. */
  private resolveExtra(m: ExtraSel): HTMLElement | null {
    if (document.contains(m.el)) return m.el
    const all = [...document.querySelectorAll(`[data-s2c="${m.srcLoc}"]`)] as HTMLElement[]
    const next = all[Math.min(m.instanceIndex, all.length - 1)] ?? null
    if (next) m.el = next
    return next
  }

  /** Mirror of the server's move ladder, for the live status line only. */
  private moveLabel(dx: number, dy: number, inFlow: boolean): string {
    const ax = Math.abs(Math.round(dx))
    const ay = Math.abs(Math.round(dy))
    if (ax < 3 && ay < 3) return 'release to keep in place'
    const aligned = (ax >= 3 && ay < 6) || (ay >= 3 && ax < 6)
    if (inFlow && aligned && Math.max(ax, ay) <= 64) {
      const prop = ax >= ay ? (dx > 0 ? 'ml' : '-ml') : (dy > 0 ? 'mt' : '-mt')
      return `${prop} ≈${Math.max(ax, ay)}px — release to nudge with margin`
    }
    return `translate ${Math.round(dx)}, ${Math.round(dy)} — release to commit (cosmetic transform)`
  }

  private onTweakDown(e: PointerEvent) {
    if (e.button !== 0) return
    // A pending extract owns the next press: pressing anywhere else means "not
    // these after all", and starting a fresh selection underneath an open
    // confirmation would leave the panel describing boxes nobody is looking at.
    if (this.lassoPending()) {
      this.cancelLasso('extract cancelled — nothing written')
      return
    }
    // Same contract for a rule waiting to be read: pressing elsewhere means
    // "not that line after all".
    if (this.rulePending()) {
      this.cancelRule('rule cancelled — nothing saved')
      return
    }
    // Something held from the library owns the next press: that IS the gesture.
    if (this.libArmed) {
      const target = this.pickStamped(e.clientX, e.clientY)
      if (!target) {
        this.status('nothing stamped there — drop it on a container the app renders', true)
        return
      }
      void this.placeArmed(target.srcLoc)
      return
    }
    // A value drag, like a rule line, is armed only by its keybind: holding a
    // modifier is already the lasso, and one gesture per modifier is the only
    // way any of them stays predictable.
    if (this.dataArmed) {
      this.startDataDrag(e)
      return
    }
    // A rule line is armed only by its keybind, never by a held modifier —
    // Alt+drag is already the lasso, and one gesture per modifier is the only
    // way either stays predictable.
    if (this.ruleArmed) {
      this.startRuleLine(e)
      return
    }
    // Alt+drag (or a drag after Alt+L) draws a lasso instead of moving things.
    if (e.altKey || this.lassoArmed) {
      this.startLasso(e)
      return
    }
    // an external edit's HMR may have remounted the selection: re-resolve via
    // its stamp instead of hit-testing a detached element's 0×0 phantom rect
    if (this.tweak && !document.contains(this.tweak.el)) {
      // preserve WHICH instance and the chosen scope across the remount —
      // grabbing the first match would silently retarget instance 1 / 'all'
      const all = [...document.querySelectorAll(`[data-s2c="${this.tweak.srcLoc}"]`)] as HTMLElement[]
      const next = all[Math.min(this.tweak.instanceIndex, all.length - 1)] ?? null
      this.tweak = next ? this.buildTweakState(next, this.tweak.scope) : null
    }
    // shift+click: grow/shrink the multi-selection instead of dragging
    if (e.shiftKey) {
      this.onShiftPick(e)
      return
    }
    const t = this.tweak
    if (t) {
      const sr = this.selRect(t)
      // 1) resize handles win over everything — except on a shape, which has
      //    none: a w-*/h-* class on a <path> resizes nothing but its box
      const hp = isShapeEl(t.el) ? undefined : this.hitHandle(sr, e.clientX, e.clientY)
      if (hp) {
        const bt = getComputedStyle(t.el).transform
        t.handleDrag = {
          handle: hp.kind, startX: e.clientX + window.scrollX, startY: e.clientY + window.scrollY,
          startRect: sr, w: null, h: null,
          guides: this.collectGuides(t.el), activeGuides: [],
          snappedW: false, snappedH: false,
          baseTransform: bt === 'none' ? '' : `${bt} `,
          scrollStartX: window.scrollX, scrollStartY: window.scrollY,
        }
        this.canvas.setPointerCapture(e.pointerId)
        return
      }
      // 2) gap strips / padding bands (secondary affordances — unchanged)
      const zone = t.zones.find(
        (z) => e.clientX >= z.x && e.clientX <= z.x + z.w && e.clientY >= z.y && e.clientY <= z.y + z.h,
      )
      if (zone) {
        const cs = getComputedStyle(t.el)
        const startValue =
          zone.kind === 'gap'
            ? parseFloat(cs.gap) || 0
            : parseFloat(cs.getPropertyValue(
                { pt: 'padding-top', pr: 'padding-right', pb: 'padding-bottom', pl: 'padding-left' }[zone.kind],
              )) || 0
        t.drag = { zone, startX: e.clientX + window.scrollX, startY: e.clientY + window.scrollY, startValue }
        this.canvas.setPointerCapture(e.pointerId)
        return
      }
      // 3) inside the selection body → free move (a still release is a click).
      //    Not for a shape: its bbox is mostly empty space belonging to the
      //    page behind it, and a dragged <path> would commit a translate class
      //    onto artwork. Falling through to (4) re-picks whatever shape or
      //    element is actually under the pointer instead.
      if (
        !isShapeEl(t.el) &&
        e.clientX >= sr.left && e.clientX <= sr.left + sr.width &&
        e.clientY >= sr.top && e.clientY <= sr.top + sr.height
      ) {
        this.startMoveDrag(t, e)
        return
      }
    }
    // 4) select whatever is under the cursor (a shape first), or deselect
    const el = this.pickTweakTarget(e.clientX, e.clientY)
    if (!el) {
      if (t) this.deselect('deselected')
      else this.status('nothing stamped here — hover highlights what you can select')
      return
    }
    this.selectElement(el)
    // select + drag is one gesture; a still release keeps it a plain click.
    // A shape is the exception: selecting it opens a palette, and there is
    // nothing to drag it into.
    if (!isShapeEl(el)) this.startMoveDrag(this.tweak!, e)
  }

  private onTweakMove(e: PointerEvent) {
    if (this.dataDrag) {
      this.moveDataDrag(e)
      return
    }
    if (this.ruleDraw?.drawing) {
      this.moveRuleLine(e)
      return
    }
    if (this.lasso?.drawing) {
      this.moveLasso(e)
      return
    }
    // A pending extract or rule: the page is not hoverable while a
    // confirmation is describing a set of boxes — a dashed outline round a different element
    // would read as part of the selection being confirmed.
    if (this.lassoPending() || this.rulePending()) {
      this.canvas.style.cursor = 'default'
      if (this.hoverEl) {
        this.hoverEl = null
        this.redraw()
      }
      return
    }
    // Alt held with nothing drawn yet: the cursor has to say that this drag
    // would draw a loop rather than move whatever is under it
    if (!this.lasso && (e.altKey || this.lassoArmed)) {
      this.canvas.style.cursor = 'crosshair'
      this.hoverEl = null
      this.redraw()
      return
    }
    const t = this.tweak
    if (t?.moveDrag) {
      const md = t.moveDrag
      // PAGE-coord deltas: a scroll mid-drag changes client coords but not
      // the user's intent relative to the page content
      const pageX = e.clientX + window.scrollX
      const pageY = e.clientY + window.scrollY
      const rawDx = pageX - md.startX
      const rawDy = pageY - md.startY
      // scroll since drag start — fixed-position ghosts live in client space
      const csx = window.scrollX - md.scrollStartX
      const csy = window.scrollY - md.scrollStartY
      // magnetic alignment: edges + centers of the moving rect vs cached
      // guides, all in page space
      md.activeGuides = []
      md.snappedX = false
      md.snappedY = false
      let dx = rawDx
      let dy = rawDy
      if (Math.hypot(rawDx, rawDy) >= CLICK_SLOP) {
        const mrL = md.startRect.left + md.scrollStartX
        const mrT = md.startRect.top + md.scrollStartY
        const sx = this.bestSnap(md.guides, 'v', [
          mrL + rawDx, mrL + md.startRect.width / 2 + rawDx, mrL + md.startRect.width + rawDx,
        ])
        if (sx) {
          dx = rawDx + sx.delta
          md.snappedX = true
          md.activeGuides.push(sx.guide)
        }
        const sy = this.bestSnap(md.guides, 'h', [
          mrT + rawDy, mrT + md.startRect.height / 2 + rawDy, mrT + md.startRect.height + rawDy,
        ])
        if (sy) {
          dy = rawDy + sy.delta
          md.snappedY = true
          md.activeGuides.push(sy.guide)
        }
      }
      md.dx = dx
      md.dy = dy
      this.applyMovePreview(t, md)
      // slot detent: cursor inside another sibling's (cached, page-space)
      // rect. Group moves never reorder — the set translates as one body.
      md.proposedIndex = -1
      if (md.group.length === 0) {
        for (const s of md.siblings) {
          if (pageX >= s.left && pageX <= s.right && pageY >= s.top && pageY <= s.bottom) {
            md.proposedIndex = s.index
            break
          }
        }
      }
      if (Math.hypot(md.dx, md.dy) >= CLICK_SLOP) {
        const snap = md.snappedX || md.snappedY ? ' · ⌖ snapped' : ''
        this.status(
          (md.proposedIndex >= 0 && md.proposedIndex !== md.fromIndex
            ? `→ slot ${md.proposedIndex + 1} — release to reorder`
            : md.group.length > 0
              ? `moving ${md.group.length + 1} elements — release to commit`
              : this.moveLabel(md.dx, md.dy, t.inFlow)) + snap,
        )
      }
      this.redraw()
      return
    }
    if (t?.handleDrag) {
      const hd = t.handleDrag
      const dx = e.clientX + window.scrollX - hd.startX
      const dy = e.clientY + window.scrollY - hd.startY
      const k = hd.handle
      let w: number | null = null
      let h: number | null = null
      if (k === 'e' || k === 'ne' || k === 'se') w = hd.startRect.width + dx
      if (k === 'w' || k === 'nw' || k === 'sw') w = hd.startRect.width - dx
      if (k === 's' || k === 'se' || k === 'sw') h = hd.startRect.height + dy
      if (k === 'n' || k === 'ne' || k === 'nw') h = hd.startRect.height - dy
      const isWest = k === 'w' || k === 'nw' || k === 'sw'
      const isNorth = k === 'n' || k === 'ne' || k === 'nw'
      // magnetic alignment on the MOVING edge: right/bottom for east/south
      // handles, left/top for west/north (where the opposite edge anchors)
      hd.activeGuides = []
      hd.snappedW = false
      hd.snappedH = false
      const startPageL = hd.startRect.left + hd.scrollStartX
      const startPageT = hd.startRect.top + hd.scrollStartY
      if (w !== null) {
        const edge = isWest ? startPageL + hd.startRect.width - w : startPageL + w
        const s = this.bestSnap(hd.guides, 'v', [edge])
        if (s) {
          w += isWest ? -s.delta : s.delta
          hd.snappedW = true
          hd.activeGuides.push(s.guide)
        }
      }
      if (h !== null) {
        const edge = isNorth ? startPageT + hd.startRect.height - h : startPageT + h
        const s = this.bestSnap(hd.guides, 'h', [edge])
        if (s) {
          h += isNorth ? -s.delta : s.delta
          hd.snappedH = true
          hd.activeGuides.push(s.guide)
        }
      }
      hd.w = w === null ? null : Math.max(8, Math.round(w))
      hd.h = h === null ? null : Math.max(8, Math.round(h))
      // live preview via inline size; committed as w-*/h-* on release.
      // West/north drags also shift the element so the dragged edge follows
      // the cursor and the OPPOSITE edge stays pixel-fixed — in flow, a
      // width change alone would grow rightward/downward from the anchor.
      if (hd.w !== null) t.el.style.width = `${hd.w}px`
      if (hd.h !== null) t.el.style.height = `${hd.h}px`
      const compX = isWest && hd.w !== null ? hd.startRect.width - hd.w : 0
      const compY = isNorth && hd.h !== null ? hd.startRect.height - hd.h : 0
      if (compX !== 0 || compY !== 0) {
        t.el.style.transform = `${hd.baseTransform}translate(${compX}px, ${compY}px)`
      } else {
        t.el.style.removeProperty('transform')
      }
      const snap = hd.snappedW || hd.snappedH ? ' · ⌖ snapped' : ''
      this.status(
        `${t.el.tagName.toLowerCase()} · ` +
        `${hd.w ?? Math.round(hd.startRect.width)}×${hd.h ?? Math.round(hd.startRect.height)} — release to commit${snap}`,
      )
      this.redraw()
      return
    }
    if (t && !t.drag) {
      const sr = this.selRect(t)
      // a shape has no handles and no body drag (see onTweakDown), so the
      // cursor must not promise either
      const shapeSel = isShapeEl(t.el)
      const hp = shapeSel ? undefined : this.hitHandle(sr, e.clientX, e.clientY)
      if (hp) {
        this.canvas.style.cursor = HANDLE_CURSORS[hp.kind]
        this.hoverEl = null
        this.redraw()
        return
      }
      const over = t.zones.find(
        (z) => e.clientX >= z.x && e.clientX <= z.x + z.w && e.clientY >= z.y && e.clientY <= z.y + z.h,
      )
      if (over) {
        this.canvas.style.cursor =
          over.kind === 'gap'
            ? (t.direction === 'row' ? 'col-resize' : 'row-resize')
            : (over.kind === 'pt' || over.kind === 'pb' ? 'ns-resize' : 'ew-resize')
        this.hoverEl = null
        this.redraw()
        return
      }
      if (
        !shapeSel &&
        e.clientX >= sr.left && e.clientX <= sr.left + sr.width &&
        e.clientY >= sr.top && e.clientY <= sr.top + sr.height
      ) {
        this.canvas.style.cursor = 'move'
        this.hoverEl = null
        this.redraw()
        return
      }
      const el = this.pickTweakTarget(e.clientX, e.clientY)
      this.hoverEl = el && el !== t.el ? el : null
      this.canvas.style.cursor = el ? 'pointer' : 'default'
      this.redraw()
      return
    }
    if (!t) {
      const el = this.pickTweakTarget(e.clientX, e.clientY)
      this.hoverEl = el
      this.canvas.style.cursor = el ? 'pointer' : 'default'
      this.redraw()
      return
    }
    if (!t.drag) return
    const { zone, startX, startY, startValue } = t.drag
    const px2 = e.clientX + window.scrollX
    const py2 = e.clientY + window.scrollY
    const axisDelta =
      zone.kind === 'gap'
        ? (t.direction === 'row' ? px2 - startX : py2 - startY)
        : zone.kind === 'pt' ? py2 - startY
        : zone.kind === 'pb' ? startY - py2
        : zone.kind === 'pl' ? px2 - startX
        : startX - px2
    const raw = Math.max(0, startValue + axisDelta)
    // token detents: snap to 4px steps while dragging so the user FEELS the scale
    const snapped = Math.round(raw / 4) * 4
    t.preview[zone.kind] = snapped
    const styleProp = zone.kind === 'gap'
      ? 'gap'
      : { pt: 'padding-top', pr: 'padding-right', pb: 'padding-bottom', pl: 'padding-left' }[zone.kind]
    t.el.style.setProperty(styleProp, `${snapped}px`)
    const cls = zone.kind === 'gap' ? 'gap' : zone.kind
    this.status(`${cls}-${snapped % 4 === 0 ? snapped / 4 : `[${snapped}px]`} (${snapped}px) — release to commit`)
    // zones move as layout shifts; rebuild lazily on next selection; just redraw ring
    this.redraw()
  }

  private async onTweakUp(e: PointerEvent) {
    if (this.dataDrag) {
      await this.endDataDrag(e)
      return
    }
    if (this.ruleDraw?.drawing) {
      await this.endRuleLine(e)
      return
    }
    if (this.lasso?.drawing) {
      this.endLasso(e)
      return
    }
    const t = this.tweak
    // pointercancel = the browser took the gesture away (pen left range,
    // gesture takeover): abandon the drag, never commit from it
    const aborted = e.type === 'pointercancel'
    if (t?.moveDrag) {
      const md = t.moveDrag
      this.endMoveVisuals(t) // ghost/dim/lift teardown before any commit
      t.moveDrag = null
      this.canvas.releasePointerCapture?.(e.pointerId)
      if (aborted) {
        this.status('move cancelled')
        this.redraw()
        return
      }
      // click-vs-drag on RAW travel: at rest a card already sits on sibling
      // guides, so a small wiggle snaps back to (0,0) — judging the snapped
      // displacement would misread such drags as (scope-toggling) clicks
      const rawDist = Math.hypot(e.clientX - md.startClientX, e.clientY - md.startClientY)
      if (rawDist < CLICK_SLOP) {
        this.handleTweakClick(t, e)
        return
      }
      this.lastTweakClick = null
      if (md.group.length > 0) {
        // multi-selection: one manipulate call per element, receipts collapsed
        await this.commitGroupMove(t, md)
        return
      }
      if (md.proposedIndex >= 0 && md.proposedIndex !== md.fromIndex && md.parentSrcLoc && md.fromIndex >= 0) {
        // ladder rung (a): dropped on a sibling's slot → structural reorder
        await this.commitManipulation(
          { srcLoc: md.parentSrcLoc, prop: 'reorder', from: md.fromIndex, to: md.proposedIndex },
          t, 'committing reorder…',
        )
        return
      }
      // rungs (b)/(c): server decides margin nudge vs cosmetic translate
      await this.commitManipulation(
        {
          srcLoc: t.srcLoc, prop: 'move',
          dx: Math.round(md.dx), dy: Math.round(md.dy), inFlow: t.inFlow,
          exactX: md.snappedX, exactY: md.snappedY,
          ...this.instanceFields(t),
        },
        t, 'committing move…',
      )
      return
    }
    if (t?.handleDrag) {
      const hd = t.handleDrag
      t.handleDrag = null
      this.canvas.releasePointerCapture?.(e.pointerId)
      t.el.style.removeProperty('width')
      t.el.style.removeProperty('height')
      t.el.style.removeProperty('transform')
      if (aborted) {
        this.status('resize cancelled')
        this.redraw()
        return
      }
      const w = hd.w !== null && Math.abs(hd.w - hd.startRect.width) >= 2 ? hd.w : undefined
      const h = hd.h !== null && Math.abs(hd.h - hd.startRect.height) >= 2 ? hd.h : undefined
      if (w === undefined && h === undefined) {
        this.status('resize cancelled (no change)')
        this.redraw()
        return
      }
      const k2 = hd.handle
      const isWest2 = k2 === 'w' || k2 === 'nw' || k2 === 'sw'
      const isNorth2 = k2 === 'n' || k2 === 'ne' || k2 === 'nw'
      await this.commitManipulation(
        {
          srcLoc: t.srcLoc, prop: 'resize', w, h,
          exactW: w !== undefined && hd.snappedW, exactH: h !== undefined && hd.snappedH,
          // west/north drags anchor the opposite edge: the server adds a
          // position compensation (ml-/mt- or translate) sized against the
          // SNAPPED committed dimension so that edge stays pixel-fixed
          anchorX: w !== undefined && isWest2 ? 'right' as const : undefined,
          anchorY: h !== undefined && isNorth2 ? 'bottom' as const : undefined,
          startW: w !== undefined && isWest2 ? Math.round(hd.startRect.width) : undefined,
          startH: h !== undefined && isNorth2 ? Math.round(hd.startRect.height) : undefined,
          inFlow: t.inFlow,
          ...this.instanceFields(t),
        },
        t, 'committing resize…',
      )
      return
    }
    if (!t || !t.drag) return
    const { zone } = t.drag
    const px = t.preview[zone.kind]
    t.drag = null
    this.canvas.releasePointerCapture?.(e.pointerId)
    if (aborted) {
      this.clearTweakPreview()
      this.status('adjustment cancelled')
      this.redraw()
      return
    }
    if (px === undefined) {
      // the "drag" never moved: it's a click that happened to land on a
      // zone band — treat it like any other click (drill / scope toggle)
      this.handleTweakClick(t, e)
      return
    }
    await this.commitManipulation({ srcLoc: t.srcLoc, prop: zone.kind, px }, t, 'committing…')
  }

  /**
   * A still release inside the selection: drill into whatever stamped
   * element is under the cursor, or — second click on the SELECTED element
   * within the double-click window — toggle instance scope for shared
   * templates (all linked ⇄ just this one).
   */
  private handleTweakClick(t: TweakState, e: PointerEvent) {
    const el = this.pickTweakTarget(e.clientX, e.clientY)
    const now = performance.now()
    if (el && el === t.el) {
      if (
        this.lastTweakClick?.el === el &&
        now - this.lastTweakClick.at < DBLCLICK_MS &&
        t.instanceEls.length > 1
      ) {
        t.scope = t.scope === 'all' ? 'one' : 'all'
        this.lastTweakClick = null
        this.status(
          t.scope === 'one'
            ? `this one only — instance ${t.instanceIndex + 1} of ${t.instanceEls.length} (double-click or Esc to relink)`
            : `all ${t.instanceEls.length} linked — edits apply to every instance`,
        )
      } else {
        this.lastTweakClick = { el, at: now }
      }
      this.redraw()
    } else if (el) {
      this.selectElement(el)
      this.lastTweakClick = { el, at: now }
    } else {
      this.redraw()
    }
  }

  /**
   * POST to the token-gated manipulate endpoint. Deterministic, zero model
   * calls; the receipt names exactly what was written + the revert SHA. After
   * HMR settles (~500ms) the selection is re-resolved and rebuilt.
   */
  private async commitManipulation(
    body: Record<string, unknown>,
    t: TweakState,
    note: string,
  ): Promise<void> {
    this.status(note)
    try {
      const res = await fetch('/@s2c/manipulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        // the width goes on the wire only while demonstrating: its presence IS
        // the instruction to band the edit, so an ordinary drag stays the
        // byte-for-byte request it always was
        body: JSON.stringify({ ...body, ...this.responsiveWidth() }),
      })
      const out = (await res.json()) as {
        ok: boolean; change?: string; file?: string; error?: string; checkpoint?: string
        shared?: boolean; instanceCount?: number
      }
      if (!res.ok || !out.ok) {
        if (out.shared) {
          // structured 409: template renders N times and no scope was sent
          // (normally pre-empted client-side by the linked/one selection state)
          throw new Error(
            `affects all ${out.instanceCount ?? '?'} instances — double-click the element for "just this one", or repeat to apply to all`,
          )
        }
        throw new Error(out.error ?? `HTTP ${res.status}`)
      }
      this.clearTweakPreview()
      this.status(
        `✓ ${out.change} in ${out.file} · 0 tokens · revert: git restore --source=${(out.checkpoint ?? '').slice(0, 10)}`,
      )
      this.reselectAfterCommit(t)
    } catch (err) {
      this.clearTweakPreview()
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
      this.redraw()
    }
  }

  /** After commit + HMR, re-resolve the element (it may have been remounted). */
  private reselectAfterCommit(t: TweakState) {
    const { el, srcLoc } = t
    setTimeout(() => {
      // the user may have selected something else (or deselected) meanwhile —
      // never clobber a newer selection with the committed one
      if (this.mode !== 'tweak' || this.tweak !== t) return
      // …and never clobber an in-flight drag: rebuilding would orphan its
      // ghost/dim/lift visuals with no release path
      if (t.moveDrag || t.handleDrag || t.drag) return
      // re-resolve by instance INDEX, not first match — after an HMR remount
      // of a .map() the first instance is usually the wrong one
      const all = [...document.querySelectorAll(`[data-s2c="${srcLoc}"]`)] as HTMLElement[]
      const next = document.contains(el)
        ? el
        : all[Math.min(t.instanceIndex, all.length - 1)] ?? null
      if (next?.dataset.s2c) this.tweak = this.buildTweakState(next, t.scope)
      else this.tweak = null
      this.redraw()
    }, 500)
  }

  private drawTweak() {
    const { ctx } = this
    if (this.hoverEl && document.contains(this.hoverEl)) {
      // light outline on hover — every stamped element is interactable;
      // rect read LIVE so the outline tracks scroll/layout. A shape hovers in
      // its own accent, so the user can tell BEFORE clicking whether they are
      // about to select a box or a paintable shape.
      ctx.save()
      ctx.strokeStyle = isShapeEl(this.hoverEl) ? 'rgba(245,158,11,0.75)' : 'rgba(8,145,178,0.55)'
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.5
      const h = this.hoverEl.getBoundingClientRect()
      ctx.strokeRect(h.left, h.top, h.width, h.height)
      ctx.setLineDash([])
      ctx.restore()
    }
    const t = this.tweak
    if (!t) return
    const r = this.selRect(t)
    // A selected shape reads as a DIFFERENT object: amber, no handles, and a
    // palette beside it. Cyan + eight handles would promise a resize that a
    // <path> cannot honour.
    const shapeSel = isShapeEl(t.el)
    const accent = shapeSel ? PAINT_ACCENT : '#0891b2'
    ctx.save()
    // multi-selection extras: solid outline each (handles stay on primary).
    // During a group drag their cached start rects follow dx/dy — ghost
    // members' originals don't move, so live rects would lag behind.
    if (this.multiSel.length > 0) {
      ctx.strokeStyle = '#0891b2'
      ctx.lineWidth = 1.5
      const md = t.moveDrag
      if (md && md.group.length > 0) {
        const csx = window.scrollX - md.scrollStartX
        const csy = window.scrollY - md.scrollStartY
        for (const g of md.group) {
          ctx.strokeRect(
            g.startRect.left + md.dx - csx, g.startRect.top + md.dy - csy,
            g.startRect.width, g.startRect.height,
          )
        }
      } else {
        for (const m of this.multiSel) {
          const mel = this.resolveExtra(m)
          if (!mel || mel === t.el) continue
          const mr = mel.getBoundingClientRect()
          ctx.strokeRect(mr.left, mr.top, mr.width, mr.height)
        }
      }
    }
    // linked instances of a shared template (.map()): lighter outlines while
    // scope is 'all' — the highlighting IS the "this affects all N" warning
    if (t.scope === 'all' && t.instanceEls.length > 1) {
      ctx.strokeStyle = shapeSel ? 'rgba(245,158,11,0.5)' : 'rgba(8,145,178,0.5)'
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 1.5
      for (const ie of t.instanceEls) {
        if (ie === t.el || !document.contains(ie)) continue
        const ir = ie.getBoundingClientRect()
        ctx.strokeRect(ir.left, ir.top, ir.width, ir.height)
      }
      ctx.setLineDash([])
    }
    // solid selection outline
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.strokeRect(r.left, r.top, r.width, r.height)
    // magnetic alignment guides (Canva-pink) while a drag is snapped
    const activeGuides = t.moveDrag?.activeGuides ?? t.handleDrag?.activeGuides ?? []
    if (activeGuides.length > 0) {
      // guides are cached in page coords; the canvas draws in client space
      const gsx = window.scrollX
      const gsy = window.scrollY
      ctx.strokeStyle = GUIDE_COLOR
      ctx.lineWidth = 1
      for (const g of activeGuides) {
        ctx.beginPath()
        if (g.axis === 'v') {
          ctx.moveTo(g.pos - gsx, Math.min(g.lo - gsy, r.top) - 4)
          ctx.lineTo(g.pos - gsx, Math.max(g.hi - gsy, r.top + r.height) + 4)
        } else {
          ctx.moveTo(Math.min(g.lo - gsx, r.left) - 4, g.pos - gsy)
          ctx.lineTo(Math.max(g.hi - gsx, r.left + r.width) + 4, g.pos - gsy)
        }
        ctx.stroke()
      }
    }
    // secondary affordances: gap strips (blue) + padding bands (purple).
    // Hidden while a move/resize drag is in flight — their cached geometry
    // no longer matches the layout.
    if (!t.moveDrag && !t.handleDrag) {
      for (const z of t.zones) {
        ctx.fillStyle = z.kind === 'gap' ? 'rgba(8,145,178,0.18)' : 'rgba(147,51,234,0.12)'
        ctx.fillRect(z.x, z.y, z.w, z.h)
      }
    }
    // 8 Canva-style drag handles: white squares with a border. Not on a shape:
    // it is painted, not resized, and eight handles would say otherwise.
    if (!shapeSel) {
      for (const hp of this.handlePoints(r)) {
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = accent
        ctx.lineWidth = 1.5
        ctx.fillRect(hp.x - HANDLE_SIZE / 2, hp.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
        ctx.strokeRect(hp.x - HANDLE_SIZE / 2, hp.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
      }
    }
    // floating label: tag · current size · instance scope
    const scopeNote = t.instanceEls.length > 1
      ? (t.scope === 'all' ? ` · ${t.instanceEls.length} linked` : ' · this one only')
      : ''
    const setNote = this.multiSel.length > 0 ? ` · set of ${this.multiSel.length + 1}` : ''
    // a shape's size is its bbox, which says nothing useful about a line; the
    // file is what the user needs to recognize it (and to find it in source)
    const label = shapeSel
      ? `${t.el.tagName.toLowerCase()} · ${stampFile(t.srcLoc)}${scopeNote}`
      : `${t.el.tagName.toLowerCase()} · ${Math.round(r.width)}×${Math.round(r.height)}${scopeNote}${setNote}`
    ctx.font = '11px ui-sans-serif, system-ui'
    const lw = ctx.measureText(label).width + 12
    const lx = Math.max(2, Math.min(r.left, window.innerWidth - lw - 2))
    const ly = r.top - 24 >= 2 ? r.top - 24 : r.top + r.height + 8
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.roundRect(lx, ly, lw, 17, 8)
    ctx.fill()
    ctx.fillStyle = shapeSel ? '#1f2937' : '#fff'
    ctx.fillText(label, lx + 6, ly + 12)
    ctx.restore()
    // the popover is anchored to this rect, and this runs on every repaint the
    // tracking loop asks for — so scroll, zoom and HMR remounts all carry it
    if (this.paintOpen) this.layoutPaintPanel()
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = window.innerWidth * dpr
    this.canvas.height = window.innerHeight * dpr
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.redraw()
  }

  private redraw() {
    const { ctx } = this
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // strokes are NOT painted here — they live in the page-space #ink layer
    const hi = this.ideHighlight
    if (hi && performance.now() < hi.until) {
      ctx.save()
      ctx.strokeStyle = '#34d399'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(hi.rect.x - window.scrollX, hi.rect.y - window.scrollY, hi.rect.w, hi.rect.h)
      ctx.restore()
    }
    if (this.mode === 'preview') this.drawPreview()
    if (this.mode === 'tweak') this.drawTweak()
    // after drawTweak: the lasso is the thing the user is doing RIGHT NOW, and
    // a selection ring drawn over it would hide which boxes it has caught
    if (this.mode === 'tweak') {
      this.drawLasso()
      this.drawDataDrag()
      this.drawLibDrop()
    }
    // Rules draw in EVERY mode: a broken invariant is not a tweak-mode
    // concern, it is the page being wrong.
    this.drawRules()
  }

  // ---- pipeline ----

  private snapshot() {
    return takeSnapshot(document, { exclude: (el) => this.host.contains(el) || el.id === HOST_ID })
  }

  private watchdog: ReturnType<typeof setTimeout> | null = null

  private armWatchdog() {
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = setTimeout(() => {
      if (this.mode === 'running') {
        this.status('no progress from server — resetting (run may have died)', true)
        this.clearApplying()
        this.setMode('idle')
      }
    }, RUNNING_WATCHDOG_MS)
  }

  /**
   * Screenshot-benchmark capture: one frame of this tab via getDisplayMedia.
   * The HUD is hidden during capture; the ink canvas stays visible — the ink
   * IS the payload. Downscaled to ≤1400px wide to keep image tokens sane.
   */
  private async captureScreen(): Promise<string> {
    const hud = this.shadow.getElementById('hud')!
    hud.style.visibility = 'hidden'
    try {
      const capture = (navigator.mediaDevices.getDisplayMedia as (
        c: MediaStreamConstraints & { preferCurrentTab?: boolean },
      ) => Promise<MediaStream>)({
        video: { displaySurface: 'browser' } as MediaTrackConstraints,
        audio: false,
        preferCurrentTab: true,
      })
      const stream = await Promise.race([
        capture,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('screen capture timed out (dialog dismissed?)')), 30_000),
        ),
      ])
      try {
        const video = document.createElement('video')
        video.srcObject = stream
        await video.play()
        await new Promise((r) => setTimeout(r, 200)) // first real frame
        const scale = Math.min(1, 1400 / video.videoWidth)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/png').split(',')[1]!
      } finally {
        for (const t of stream.getTracks()) t.stop()
      }
    } finally {
      hud.style.visibility = ''
    }
  }

  /**
   * Run = interpret first. The deterministic reading is drawn back onto the
   * canvas for confirmation/correction BEFORE any source file is touched —
   * this is also the confirmation gate for destructive ops. Screenshot mode
   * skips interpretation (pixels-only benchmark by definition).
   */
  /**
   * The instant render: ask the server to turn the ink into a real mounted
   * component before anything slow starts.
   *
   * Fires on the way into a run, so it only ever happens when the user has
   * asked for one — the point is to collapse the wait, not to write code
   * nobody requested. The server declines anything ambiguous, and a decline
   * costs nothing: the normal interpreted path runs either way.
   */
  private async etch(): Promise<void> {
    if (this.instant || this.strokes.length === 0) return
    try {
      const res = await fetch('/@s2c/instant', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({
          strokes: this.strokesForWire(), snapshot: this.snapshot(), fidelity: this.fidelityPayload(),
        }),
      })
      const body = (await res.json()) as { ok: boolean; file?: string; name?: string; reason?: string }
      if (body.ok && body.file) {
        this.instant = body.file
        this.status(`✏️ ${body.name ?? 'sketch'} is on the page — refining it now…`)
        // a shape drawn onto the page is a component now: file it, with the ink
        // that made it as its picture
        void this.captureToLibrary(body.file, 'drawn', body.name)
      }
    } catch { /* the slow path is the fallback, and it is already running */ }
  }

  private async run() {
    if (!this.hasWork()) return
    if (this.runMode === 'screenshot') return void this.proceed()
    // start the instant render and the reading together: neither waits on the
    // other, and the drawing is usually on the page before the reading lands
    const etching = this.etch()
    this.status('reading your drawing…')
    try {
      const res = await fetch('/@s2c/interpret', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({
          strokes: this.strokesForWire(), snapshot: this.snapshot(), mode: this.runMode,
          fidelity: this.fidelityPayload(),
          // exact words beat inferred ones: whatever the reading makes of the
          // ink, the notes say what the user actually asked for
          notes: this.notesPayload(),
        }),
      })
      const body = (await res.json()) as {
        ok: boolean; error?: string; result?: PreviewData; v2?: V2Preview
      }
      if (!res.ok || !body.ok || (!body.result && !body.v2)) throw new Error(body.error ?? `HTTP ${res.status}`)
      await etching
      this.overrides = {}
      if (body.v2) {
        const it = body.v2.interpretation
        if (it.actions.length === 0) {
          this.status(
            `couldn't turn that into actions${it.rejected.length ? ` (${it.rejected[0]})` : ''} — redraw or rephrase`,
            true,
          )
          return
        }
        this.setV2(body.v2)
        this.preview = null
        this.setMode('preview')
        const needs = it.actions.filter((a) => a.needsConfirm).length
        this.status(
          `"${it.reading}"` +
            (it.unclear ? ` · ⚠ ${it.unclear}` : '') +
            (needs ? ` · ⚠ wide delete` : '') +
            // run-scope notes belong to no single action, so the plan has
            // nowhere to draw them — but they are still the user's own words
            (it.runNotes?.length ? ` · note: ${it.runNotes.join(' · ')}` : '') +
            ` · ${it.actions.length} action(s) outlined on the page` +
            (this.candidates > 1 ? ` · ${CANDIDATE_LABELS[this.candidates].short}` : '') +
            ' · ✓ Go / ✗ Cancel',
        )
        this.redraw()
        return
      }
      this.preview = body.result!
      this.setV2(null)
      this.setMode('preview')
      const p = body.result!
      const needs = p.ops.filter((o) => o.needsConfirm).length
      this.status(
        p.escalatesToDesign
          ? 'no commands recognized — will run as a DESIGN sketch. ✓ Go to proceed'
          : `${p.ops.length ? `${p.ops.length} op(s)` : `${p.shapes.length} shape(s)`}` +
            `${needs ? ` · ⚠ ${needs} wide DELETE — check the red boxes` : ''} · tap a chip to correct · ✓ Go`,
      )
      this.redraw()
    } catch (err) {
      this.status(`interpret failed: ${err instanceof Error ? err.message : String(err)}`, true)
    }
  }

  private exitPreview(msg: string) {
    this.preview = null
    this.setV2(null)
    this.overrides = {}
    this.setMode('draw')
    this.status(msg)
    this.redraw()
  }

  /** Ink returns to full strength (a run ended without landing an edit). */
  private clearApplying() {
    this.ink.classList.remove('applying')
  }

  private async proceed() {
    this.setMode('running')
    // a multi-attempt run takes N times as long before ANYTHING lands, so say
    // so up front rather than letting the first long silence read as a hang
    this.status(
      this.candidates > 1
        ? `running ${String(this.candidates)} attempts — each one scored, only the best kept…`
        : 'running…',
    )
    // the drawing is now a request in flight: dim it, and drop it entirely
    // once 'done' says the edit landed
    this.ink.classList.add('applying')
    this.armWatchdog()
    try {
      let screenshot: string | undefined
      if (this.runMode === 'screenshot') {
        this.status('capturing screen — pick this tab in the share dialog')
        screenshot = await this.captureScreen()
        this.status('running…')
      }
      const res = await fetch('/@s2c/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({
          strokes: this.strokesForWire(),
          snapshot: this.snapshot(),
          clientId: CLIENT_ID,
          mode: this.runMode,
          screenshot,
          overrides: Object.keys(this.overrides).length ? this.overrides : undefined,
          rawInterpretation: this.v2?.raw,
          // the instant render already wrote and mounted this; the run should
          // refine it in place, not create a second component for one drawing
          instant: this.instant,
          // read at send time, not at preview time: the panel is still open
          // for business between ▶ Run and ✓ Go, and the LAST word wins
          fidelity: this.fidelityPayload(),
          // TOP-LEVEL, deliberately not inside `fidelity`: this says how many
          // times to generate the same confirmed interpretation, not what the
          // result should look like
          candidates: this.candidatesPayload(),
          notes: this.notesPayload(),
        }),
      })
      const body = (await res.json()) as { ok: boolean; error?: string }
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      this.preview = null
      this.setV2(null)
      this.redraw()
      // completion arrives over SSE ('done'/'error'); keep running state
    } catch (err) {
      this.status(`failed: ${err instanceof Error ? err.message : String(err)}`, true)
      this.clearApplying()
      this.setMode('idle')
    }
  }

  // ---- auto mode: the trigger, not a second pipeline --------------------
  // Everything below decides WHEN to pull the existing run() / proceed()
  // levers. It deliberately owns no payload, no request and no interpretation
  // of its own: a second copy of either path is a second place for the wire
  // shape to drift, and the whole feature is supposed to be indistinguishable
  // from a very fast, very punctual user.

  private setAuto(on: boolean) {
    this.auto = on
    this.syncAutoUi()
    this.saveAuto()
    if (!on) {
      this.cancelAuto()
      this.status('auto mode off — nothing runs until you press ▶ Run (Alt+A turns it back on)')
      return
    }
    // short enough to survive #status's ellipsis: the caveats (a wide delete
    // still asks) are in the button's tooltip, where there is room for them
    this.status(`auto mode on — pause ${String(AUTO_SETTLE_MS / 1000)}s and it runs itself · Esc cancels`)
    // Arming it with a finished drawing already on the page starts the wait
    // immediately: "turn it on and it runs" is the promise, and making the
    // user add one more stroke to collect on it would be a riddle. The
    // countdown then overwrites the line above — which is the more urgent of
    // the two, because it is the one offering Esc.
    this.scheduleAuto()
  }

  /** Render the toggle FROM state — one path for a restore and for a click. */
  private syncAutoUi() {
    this.autoBtn.classList.toggle('on', this.auto)
    this.autoBtn.setAttribute('aria-pressed', String(this.auto))
    this.shadow.getElementById('autoState')!.textContent = this.auto ? 'on' : 'off'
    const tip = this.auto
      ? `auto mode ON (Alt+A) — stop drawing for ${String(AUTO_SETTLE_MS / 1000)}s and the sketch is read and` +
        ' applied with no ✓ Go. Esc cancels the pending run; a wide delete always stops for confirmation.'
      : 'auto mode OFF (Alt+A) — nothing runs until you press ▶ Run. It is ON by default;' +
        ' turning it off here is remembered.'
    this.autoBtn.title = tip
    this.autoBtn.setAttribute('aria-label', tip)
  }

  /**
   * Why an auto-run must not fire right now, or null.
   *
   * `hold` separates "the user is mid-something" from "the premise is gone".
   * A note being typed or a panel being adjusted PAUSES the wait — those end,
   * and when they do the drawing is still finished — whereas no ink, no draw
   * mode or a run already in flight means there is nothing to wait for and the
   * countdown is dropped.
   */
  private autoBlock(): { why: string; hold: boolean } | null {
    if (!this.auto) return { why: 'auto mode is off', hold: false }
    if (this.mode !== 'draw') return { why: `not drawing (${this.mode})`, hold: false }
    if (this.strokes.length === 0) return { why: 'nothing drawn', hold: false }
    if (this.autoBusy) return { why: 'a run is already in flight', hold: false }
    if (this.noteDraft) return { why: 'a note is open', hold: true }
    if (this.fidelityOpen || this.penOpen || this.helpOpen) return { why: 'a panel is open', hold: true }
    return null
  }

  /**
   * (Re)start the settle period. Called from every event that changes the
   * drawing, so "any new stroke restarts the wait" is one line of behaviour
   * rather than a rule to remember.
   */
  private scheduleAuto() {
    this.cancelAuto()
    if (this.autoBlock()) return
    this.autoDeadline = performance.now() + AUTO_SETTLE_MS
    // paint the first frame of the countdown NOW: waiting a tick to say
    // anything is exactly the silence that makes a tool feel like it went off
    // on its own
    this.autoTick()
    this.autoTimer = setInterval(() => this.autoTick(), AUTO_TICK_MS)
  }

  /** Drop a pending run. `msg` only when the user deserves to be told (Esc). */
  private cancelAuto(msg?: string) {
    if (!this.autoTimer) return
    clearInterval(this.autoTimer)
    this.autoTimer = null
    if (msg) this.status(msg)
    // A countdown left on the line when nothing is counting is the one status
    // message that would actually lie: it promises something about the next
    // second. Clear it even when there is nothing to announce.
    else if (this.shadow.getElementById('autoCount')) {
      this.status('auto mode on — pause when the drawing is done and it runs itself')
    }
  }

  private autoTick() {
    const block = this.autoBlock()
    if (block?.hold) {
      // Pause rather than cancel, and say nothing: the status line currently
      // belongs to whatever the user is doing (the note they are typing, the
      // slider they are dragging) and stomping on it ten times a second would
      // be worse than useless. Pushing the deadline means the countdown
      // resumes from full the moment they are done.
      this.autoDeadline = performance.now() + AUTO_SETTLE_MS
      return
    }
    if (block) {
      this.cancelAuto()
      return
    }
    const left = this.autoDeadline - performance.now()
    if (left > 0) {
      this.showAutoCountdown(left)
      return
    }
    // stop the ticker BEFORE the run: the whole point of the lock is that the
    // next tick must not stack a second interpret on top of this one
    this.cancelAuto()
    void this.autoRun()
  }

  /**
   * The visible, cancellable window. Rebuilt once per countdown and then only
   * the number is touched — see #autoCount for why that matters to the bar's
   * width.
   */
  private showAutoCountdown(left: number) {
    const secs = (Math.ceil(left / AUTO_TICK_MS) * AUTO_TICK_MS / 1000).toFixed(1)
    let num = this.shadow.getElementById('autoCount')
    if (!num) {
      num = document.createElement('span')
      num.id = 'autoCount'
      // the unit rides INSIDE the fixed slot, so the slack sits next to the
      // separator rather than as a gap in the middle of '0.9 s'
      this.statusEl.replaceChildren(
        document.createTextNode('⚡ auto-run in '),
        num,
        document.createTextNode('· Esc to cancel'),
      )
      this.statusEl.classList.remove('err')
    }
    num.textContent = `${secs}s `
  }

  /**
   * How many elements this reading would delete behind the user's back.
   *
   * The server already draws this line for us: groundInterpretation sets
   * needsConfirm on a delete of three or more elements, or of more than a third
   * of the viewport. Auto mode is allowed to WRITE code without a click; it is
   * not allowed to destroy things without one.
   */
  private autoDestroys(): number {
    if (this.v2) {
      const acts = this.v2.interpretation.actions.filter((a) => a.needsConfirm)
      if (acts.length === 0) return 0
      // one very large element trips the same gate, so never report 0 for a
      // gate that did fire
      return Math.max(acts.reduce((n, a) => n + a.targets.length, 0), 1)
    }
    return this.preview?.ops.filter((o) => o.needsConfirm).length ?? 0
  }

  /**
   * Interpret, then — unless the reading is destructive — apply it with no
   * ✓ Go. run() and proceed() are called as-is: they own the payloads, the
   * status phases and the error handling, and this only decides whether the
   * gate between them is skipped.
   */
  private async autoRun() {
    if (this.autoBlock()) return
    this.autoBusy = true
    try {
      // phase 2 of 4: run() writes 'reading your drawing…' itself, and on
      // success leaves the plan painted and the mode in 'preview' — which is
      // exactly the gate this has to make a decision about
      await this.run()
      if (this.mode === 'running') return // screenshot mode goes straight through
      if (this.mode !== 'preview') {
        // The reading failed or found no actions. run() has already said why,
        // in red, and the ink is untouched — so append what it cannot know
        // (that a run was pending and is not happening) and leave the drawing
        // exactly where it is for another try.
        const why = this.statusEl.textContent ?? 'the reading failed'
        this.status(`${why} · auto-run stopped — your ink is still here, ▶ Run to retry`, true)
        return
      }
      const destroys = this.autoDestroys()
      if (destroys > 0) {
        // Back to the normal gate, which is already standing: the plan is
        // painted, ✓ Go and ✗ Cancel are already showing. All that is missing
        // is the reason it stopped.
        this.status(
          `⚠ auto-run stopped — this would delete ${String(destroys)} element(s); confirm it yourself with ✓ Go`,
          true,
        )
        return
      }
      // phase 3: proceed() writes 'running…', then the server's own stage
      // events take over the line, and 'done' closes it out (phase 4)
      await this.proceed()
    } finally {
      this.autoBusy = false
    }
  }

  /**
   * ON unless the user has said otherwise.
   *
   * This started OFF, on the reasoning that it is the one setting that spends
   * tokens and rewrites source with no click. That reasoning has been overtaken:
   * drawing a thing and then hunting for ▶ Run and ✓ Go is the bulk this whole
   * tool exists to remove, and everything that made the caution necessary now
   * exists — every edit is checkpointed and Ctrl+Z reaches it, the timeline
   * keeps a picture of each state, a reading that would DELETE things still
   * stops for confirmation, and the countdown is cancellable with Esc.
   *
   * So the rule inverts rather than relaxes: only a literal `false` turns it
   * off, and that choice persists. Garbage, an absent key, or a shape from some
   * later version all land on ON — the same strictness, pointing the other way.
   */
  private restoreAuto() {
    let on = true
    try {
      const raw = localStorage.getItem(AUTO_STORE_KEY)
      const v = raw ? (JSON.parse(raw) as unknown) : null
      if (v === false) on = false
    } catch { /* unreadable storage just means the default */ }
    this.auto = on
    this.syncAutoUi()
  }

  private saveAuto() {
    try {
      localStorage.setItem(AUTO_STORE_KEY, JSON.stringify(this.auto))
    } catch { /* quota/blocked: off is the right place to land */ }
  }

  /** Events carry the originating clientId; ignore other tabs' runs. */
  private mine(d: { clientId?: string | null }): boolean {
    return d.clientId == null || d.clientId === CLIENT_ID
  }

  private connectEvents() {
    this.events = new EventSource('/@s2c/events')
    this.events.addEventListener('stage', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { stage: string; detail?: string; clientId?: string }
      if (!this.mine(d)) return
      // 'candidate' is the one stage whose raw "stage: detail" rendering would
      // be actively misleading — "candidate: attempt 2/3: 71% faithful" reads
      // like a result rather than progress through a run that is still going,
      // and this is exactly the run that stays silent longest.
      if (d.stage === 'candidate') {
        this.status(`⟳ ${d.detail ?? 'generating attempts…'} · keeping the best one`)
      } else {
        this.status(`${d.stage}${d.detail ? `: ${d.detail}` : ''}`)
      }
      if (this.mode === 'running') this.armWatchdog()
    })
    this.events.addEventListener('resnapshot', async (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { runId: string; clientId?: string }
      if (!this.mine(d)) return
      // give HMR a beat to settle before snapshotting the edited page
      await new Promise((r) => setTimeout(r, 350))
      await fetch('/@s2c/verify-snapshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ runId: d.runId, snapshot: this.snapshot() }),
      }).catch(() => {})
    })
    // The editor half of the bridge rides the SSE hub that already exists —
    // no second EventSource, and these carry no clientId so every tab sees
    // them, which is what you want for a cursor.
    // The server saw a file change — ours or one typed in the user's editor —
    // and cannot draw a picture of the page. So it asks.
    this.events.addEventListener('history-due', (e) => {
      const d = JSON.parse((e as MessageEvent<string>).data) as { label?: string }
      void this.recordVersion(d.label ?? 'changed')
    })
    this.events.addEventListener('ide-status', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { connected: boolean; editor?: string }
      this.setIdeEditor(d.connected ? (d.editor ?? 'editor') : null)
    })
    this.events.addEventListener('ide-cursor', (e) => {
      const c = JSON.parse((e as MessageEvent).data) as { file: string; line: number }
      this.showIdeCursor(c.file, c.line)
    })
    this.events.addEventListener('done', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { summary?: string; clientId?: string }
      if (!this.mine(d)) return
      this.status(`✓ ${d.summary ?? 'done'}`)
      this.strokes = []
      this.endSketchSearch()
      // the ink is spent, and so are the words about it
      this.notes = []
      this.instant = null
      if (this.noteDraft) this.closeNote(`✓ ${d.summary ?? 'done'}`)
      this.resetBridge()
      this.clearApplying()
      this.renderInk()
      this.renderNotes()
      this.redraw()
      this.setMode('idle')
    })
    this.events.addEventListener('error-event', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { message: string; clientId?: string }
      if (!this.mine(d)) return
      this.status(`✗ ${d.message}`, true)
      this.clearApplying()
      this.redraw()
      this.setMode('idle')
    })
  }
}

if (!document.getElementById(HOST_ID)) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new Overlay())
  } else {
    new Overlay()
  }
}
