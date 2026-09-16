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
interface V2Target { rect: { x: number; y: number; w: number; h: number }; tag: string; text: string }
interface V2Action {
  kind: string
  targets: V2Target[]
  dest?: V2Target
  region?: { x: number; y: number; w: number; h: number }
  instruction: string
  needsConfirm: boolean
}
interface V2Preview {
  interpretation: { reading: string; unclear?: string; actions: V2Action[]; rejected: string[] }
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
interface Fidelity {
  /** 0..1 — the resemblance dial the four zones below name. */
  resemblance: number
  keep: FidelityKeep
  /** 'app' snaps to the design system · 'sketch' keeps the hand-drawn look. */
  palette: 'app' | 'sketch'
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

/** A fresh install sends exactly this. Deep-cloned per read — the panel
 *  mutates its copy, and a shared literal would drift the "default". */
function defaultFidelity(): Fidelity {
  return {
    resemblance: 0.5,
    keep: { asymmetry: true, rhythm: true, proportions: true, placement: true },
    palette: 'app',
  }
}

/** Where the fidelity settings survive a reload (same contract as s2c:hud). */
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
  #status { max-width: 380px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #9ca3af; }
  #status.err { color: #f87171; }
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
  /* Absolutely positioned INSIDE #hud (which is position:fixed, so it's the
     containing block): the panel then drags, hides and stacks with the bar
     for free, and being out of flow it can't widen the pill. Only the left
     offset and the above/below flip are computed — see layoutFidelityPanel. */
  #fidelityPanel {
    position: absolute; left: 0; bottom: calc(100% + 10px);
    display: none; width: 300px; max-width: calc(100vw - 20px);
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
  private fidelityBtn: HTMLButtonElement
  private fidelityPanel: HTMLElement
  private fidelityRange: HTMLInputElement
  private keepBoxes = {} as Record<keyof FidelityKeep, HTMLInputElement>
  private fidelityOpen = false
  private fidelity: Fidelity = defaultFidelity()
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
      <button id="fidelityBtn" aria-haspopup="dialog" aria-expanded="false">🎚<span id="fidelityNow"></span></button>
      <button id="run" disabled>▶ Run</button>
      <button id="confirm" class="primary" style="display:none">✓ Go</button>
      <button id="cancel" style="display:none">✗ Cancel</button>
      <button id="undo" disabled>↩</button>
      <button id="clear" disabled>✕</button>
      <!-- the bar is width:max-content, so this string sizes the whole HUD:
           keep it to the length it has always been and let ? carry the rest -->
      <span id="status">sketch2code · Alt+D draw · ? all keys</span>
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
    this.buildFidelityPanel()

    // Button handlers stay thin wrappers around named methods: every one of
    // them is also a keybinding, and two code paths for one action is how the
    // mouse and the keyboard drift apart.
    for (const m of ['gesture', 'design', 'screenshot'] as const) {
      this.shadow.getElementById(`mode-${m}`)!.addEventListener('click', () => this.setRunMode(m))
    }
    this.shadow.getElementById('tweakBtn')!.addEventListener('click', () => this.toggleTweak())
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

    window.addEventListener('keydown', (e) => this.onKeyDown(e))
    // the panel is clamped against the viewport, so a resize has to re-run it
    window.addEventListener('resize', () => {
      this.resize()
      this.clampHud()
      this.layoutFidelityPanel()
      if (this.penOpen) this.layoutPanel(this.penPanel)
    })
    // capture: nested scroll containers' scroll events don't bubble, but a
    // capture listener on window still sees them
    window.addEventListener('scroll', () => {
      const t = this.tweak
      if (t?.moveDrag) this.applyMovePreview(t, t.moveDrag)
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
    this.restoreFidelity()
    this.connectEvents()

    // dev-only debug surface (the whole overlay is dev-only): lets e2e
    // compare the drawn selection rect against the element's live rect
    ;(globalThis as unknown as Record<string, unknown>).__S2C_DEBUG__ = {
      selRect: () => (this.tweak ? this.selRect(this.tweak) : null),
      // lets e2e compare what the overlay BELIEVES against what it puts on
      // the wire, and assert the help overlay lists every binding there is
      notes: () => this.notesPayload(),
      keymap: () => this.binds.map((b) => ({ id: b.id, keys: b.keys, label: b.label, group: b.group })),
      // what each stroke believes it is drawn on, so a drifting overlay can be
      // told apart from a stroke that never anchored in the first place
      strokes: () => this.strokes.map((st) => ({ id: st.id, color: st.color, anchor: st.anchor })),
    }
  }

  private setMode(m: Mode) {
    if (this.mode === 'draw' && m !== 'draw') this.resetBridge()
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
  }

  /** The ✕ button: the drawing AND the words about it go together — a note
   *  whose strokes are gone points at nothing. */
  private clearAll() {
    this.strokes = []
    this.notes = []
    if (this.noteDraft) this.closeNote('cleared')
    this.resetBridge()
    this.renderInk()
    this.renderNotes()
    this.sync()
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
        label: 'close the top thing: note → this list → fidelity → preview / tweak / draw',
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
      const ours = (this.fidelityOpen || this.penOpen) && e.key === 'Escape' &&
        target instanceof Node && this.fidelityPanel.contains(target)
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
    // Requirement: the user must be able to tell what will happen WITHOUT
    // opening the panel — the bar carries the zone + %, and the full state
    // (including which aspects are still being kept) hangs off the tooltip.
    this.shadow.getElementById('fidelityNow')!.textContent = `${z.name} ${String(pct)}%`
    const kept = KEEP_KEYS.filter((k) => f.keep[k]).map((k) => KEEP_LABELS[k].label.replace('keep ', ''))
    const summary = `fidelity: ${z.name} ${String(pct)}% — ${z.hint}` +
      ` · keeping: ${kept.length ? kept.join(', ') : 'nothing (everything may be normalized)'}` +
      ` · ${f.palette === 'app' ? "app's design system" : 'hand-drawn look'}`
    this.fidelityBtn.title = summary
    this.fidelityBtn.setAttribute('aria-label', summary)
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

  private renderPenSwatches() {
    const swatch = (color: string | null, label: string) => {
      const b = document.createElement('button')
      b.className = `swatch${color ? '' : ' ink'}`
      b.dataset.color = color ?? ''
      b.title = label
      if (color) b.style.background = color
      b.addEventListener('click', () => this.setPen(color))
      return b
    }
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
    const f = defaultFidelity()
    try {
      const raw = localStorage.getItem(FIDELITY_STORE_KEY)
      const v = raw ? (JSON.parse(raw) as unknown) : null
      if (v && typeof v === 'object') {
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
      }
    } catch { /* unreadable storage just means the default settings */ }
    this.fidelity = f
    this.syncFidelityUi()
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
    }
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
    this.sync()
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

  private drawV2Preview() {
    if (!this.v2) return
    const { ctx } = this
    const sx = window.scrollX
    const sy = window.scrollY
    ctx.save()
    ctx.font = '12px ui-sans-serif, system-ui'
    const COLORS: Record<string, string> = {
      delete: '#dc2626', modify: '#d97706', move: '#2563eb',
      swap: '#7c3aed', add: '#059669', design: '#059669',
    }
    for (const a of this.v2.interpretation.actions) {
      const color = COLORS[a.kind] ?? '#374151'
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = a.needsConfirm ? 3 : 2
      for (const t of a.targets) {
        ctx.strokeRect(t.rect.x - sx, t.rect.y - sy, t.rect.w, t.rect.h)
        ctx.fillText(`${a.needsConfirm ? '⚠ ' : ''}${a.kind.toUpperCase()}`, t.rect.x - sx + 4, t.rect.y - sy + 14)
      }
      if (a.kind === 'swap' && a.targets.length === 2) {
        const p = a.targets[0]!
        const q = a.targets[1]!
        ctx.beginPath()
        ctx.moveTo(p.rect.x - sx + p.rect.w / 2, p.rect.y - sy + p.rect.h / 2)
        ctx.lineTo(q.rect.x - sx + q.rect.w / 2, q.rect.y - sy + q.rect.h / 2)
        ctx.stroke()
      }
      if (a.kind === 'move' && a.dest && a.targets[0]) {
        const p = a.targets[0]
        ctx.beginPath()
        ctx.setLineDash([6, 4])
        ctx.moveTo(p.rect.x - sx + p.rect.w / 2, p.rect.y - sy + p.rect.h / 2)
        ctx.lineTo(a.dest.rect.x - sx + a.dest.rect.w / 2, a.dest.rect.y - sy + a.dest.rect.h / 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.strokeRect(a.dest.rect.x - sx, a.dest.rect.y - sy, a.dest.rect.w, a.dest.rect.h)
      }
      if ((a.kind === 'design' || a.kind === 'add') && a.region) {
        ctx.setLineDash([8, 5])
        ctx.strokeRect(a.region.x - sx, a.region.y - sy, a.region.w, a.region.h)
        ctx.setLineDash([])
        ctx.fillText(`${a.kind.toUpperCase()}: ${a.instruction.slice(0, 60)}`, a.region.x - sx + 4, a.region.y - sy - 6)
      }
    }
    ctx.restore()
  }

  private drawPreview() {
    if (this.v2) return this.drawV2Preview()
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
    t.zones = this.computeZones(t.el)
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

  private pickAnyStamped(x: number, y: number): HTMLElement | null {
    this.canvas.style.pointerEvents = 'none'
    let el = document.elementFromPoint(x, y) as HTMLElement | null
    this.canvas.style.pointerEvents = ''
    while (el && el !== document.body) {
      if (el.dataset.s2c) return el
      el = el.parentElement
    }
    return null
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
    const zones = this.computeZones(el)

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
            exactX: md.snappedX, exactY: md.snappedY, ...inst,
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
    this.hoverEl = null
    const t = this.tweak
    const r = el.getBoundingClientRect()
    const layout = t.display === 'flex' || t.display === 'grid' ? ` · ${t.display} ${t.direction}` : ''
    const linked = t.instanceEls.length > 1
      ? ` · ${t.instanceEls.length} linked (double-click: just this one)`
      : ''
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
      // 1) resize handles win over everything
      const hp = this.hitHandle(sr, e.clientX, e.clientY)
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
      // 3) inside the selection body → free move (a still release is a click)
      if (
        e.clientX >= sr.left && e.clientX <= sr.left + sr.width &&
        e.clientY >= sr.top && e.clientY <= sr.top + sr.height
      ) {
        this.startMoveDrag(t, e)
        return
      }
    }
    // 4) select whatever stamped element is under the cursor, or deselect
    const el = this.pickAnyStamped(e.clientX, e.clientY)
    if (!el) {
      if (t) this.deselect('deselected')
      else this.status('nothing stamped here — hover highlights what you can select')
      return
    }
    this.selectElement(el)
    // select + drag is one gesture; a still release keeps it a plain click
    this.startMoveDrag(this.tweak!, e)
  }

  private onTweakMove(e: PointerEvent) {
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
      const hp = this.hitHandle(sr, e.clientX, e.clientY)
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
        e.clientX >= sr.left && e.clientX <= sr.left + sr.width &&
        e.clientY >= sr.top && e.clientY <= sr.top + sr.height
      ) {
        this.canvas.style.cursor = 'move'
        this.hoverEl = null
        this.redraw()
        return
      }
      const el = this.pickAnyStamped(e.clientX, e.clientY)
      this.hoverEl = el && el !== t.el ? el : null
      this.canvas.style.cursor = el ? 'pointer' : 'default'
      this.redraw()
      return
    }
    if (!t) {
      const el = this.pickAnyStamped(e.clientX, e.clientY)
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
    const el = this.pickAnyStamped(e.clientX, e.clientY)
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
        body: JSON.stringify(body),
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
      // rect read LIVE so the outline tracks scroll/layout
      ctx.save()
      ctx.strokeStyle = 'rgba(8,145,178,0.55)'
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
      ctx.strokeStyle = 'rgba(8,145,178,0.5)'
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
    ctx.strokeStyle = '#0891b2'
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
    // 8 Canva-style drag handles: white squares with a border
    for (const hp of this.handlePoints(r)) {
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#0891b2'
      ctx.lineWidth = 1.5
      ctx.fillRect(hp.x - HANDLE_SIZE / 2, hp.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
      ctx.strokeRect(hp.x - HANDLE_SIZE / 2, hp.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
    }
    // floating label: tag · current size · instance scope
    const scopeNote = t.instanceEls.length > 1
      ? (t.scope === 'all' ? ` · ${t.instanceEls.length} linked` : ' · this one only')
      : ''
    const setNote = this.multiSel.length > 0 ? ` · set of ${this.multiSel.length + 1}` : ''
    const label = `${t.el.tagName.toLowerCase()} · ${Math.round(r.width)}×${Math.round(r.height)}${scopeNote}${setNote}`
    ctx.font = '11px ui-sans-serif, system-ui'
    const lw = ctx.measureText(label).width + 12
    const lx = Math.max(2, Math.min(r.left, window.innerWidth - lw - 2))
    const ly = r.top - 24 >= 2 ? r.top - 24 : r.top + r.height + 8
    ctx.fillStyle = '#0891b2'
    ctx.beginPath()
    ctx.roundRect(lx, ly, lw, 17, 8)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(label, lx + 6, ly + 12)
    ctx.restore()
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
    if (this.mode === 'preview') this.drawPreview()
    if (this.mode === 'tweak') this.drawTweak()
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
  private async run() {
    if (!this.hasWork()) return
    if (this.runMode === 'screenshot') return void this.proceed()
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
        this.v2 = body.v2
        this.preview = null
        this.setMode('preview')
        const needs = it.actions.filter((a) => a.needsConfirm).length
        this.status(
          `"${it.reading}"` +
            (it.unclear ? ` · ⚠ ${it.unclear}` : '') +
            (needs ? ` · ⚠ wide delete` : '') +
            ' · ✓ Go / ✗ Cancel',
        )
        this.redraw()
        return
      }
      this.preview = body.result!
      this.v2 = null
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
    this.v2 = null
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
    this.status('running…')
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
          // read at send time, not at preview time: the panel is still open
          // for business between ▶ Run and ✓ Go, and the LAST word wins
          fidelity: this.fidelityPayload(),
          notes: this.notesPayload(),
        }),
      })
      const body = (await res.json()) as { ok: boolean; error?: string }
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      this.preview = null
      this.v2 = null
      this.redraw()
      // completion arrives over SSE ('done'/'error'); keep running state
    } catch (err) {
      this.status(`failed: ${err instanceof Error ? err.message : String(err)}`, true)
      this.clearApplying()
      this.setMode('idle')
    }
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
      this.status(`${d.stage}${d.detail ? `: ${d.detail}` : ''}`)
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
    this.events.addEventListener('done', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { summary?: string; clientId?: string }
      if (!this.mine(d)) return
      this.status(`✓ ${d.summary ?? 'done'}`)
      this.strokes = []
      // the ink is spent, and so are the words about it
      this.notes = []
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
