/**
 * sketch2code overlay client. Injected into the dev app by the vite plugin.
 * Framework-free; lives entirely inside a shadow root so the host app's DOM
 * and styles are untouched (and the snapshot walker excludes it).
 */
import { takeSnapshot } from '@s2c/dom'

interface Pt { x: number; y: number; t: number }
interface Stroke { id: string; points: Pt[] }

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
  } | null
  /**
   * Free-move drag: the element follows the cursor via transform (no file
   * writes mid-drag). All geometry is cached at drag start so pointermove
   * does zero layout reads. On release: sibling slot → reorder, else the
   * server's move ladder (margin → translate) decides.
   */
  moveDrag: {
    startX: number
    startY: number
    /** displacement AFTER magnetic snapping — what previews and commits */
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
  :host([data-mode='draw']) #canvas { pointer-events: auto; cursor: crosshair; }
  :host([data-mode='preview']) #canvas { pointer-events: auto; cursor: pointer; }
  :host([data-mode='tweak']) #canvas { pointer-events: auto; cursor: default; }
  #hud {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    z-index: 2147483001; display: flex; gap: 8px; align-items: center;
    background: #111827ee; color: #f9fafb; padding: 8px 12px;
    border-radius: 999px; box-shadow: 0 4px 24px rgb(0 0 0 / 0.25);
    font-size: 13px; user-select: none;
  }
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
`

class Overlay {
  private host: HTMLElement
  private shadow: ShadowRoot
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private statusEl: HTMLElement
  private drawBtn: HTMLButtonElement
  private runBtn: HTMLButtonElement
  private confirmBtn: HTMLButtonElement
  private cancelBtn: HTMLButtonElement
  private undoBtn: HTMLButtonElement
  private clearBtn: HTMLButtonElement

  private mode: Mode = 'idle'
  private runMode: 'gesture' | 'design' | 'screenshot' = 'gesture'
  private tweak: TweakState | null = null
  private tweakHover: DOMRect | null = null
  /** last still-click on the selected element — double-click scope toggle */
  private lastTweakClick: { el: HTMLElement; at: number } | null = null
  private strokes: Stroke[] = []
  private preview: PreviewData | null = null
  private v2: V2Preview | null = null
  private overrides: Record<string, string> = {}
  private chipBoxes: Array<{ x: number; y: number; w: number; h: number; shapeId: string }> = []
  private live: Stroke | null = null
  private strokeSeq = 0
  private events: EventSource | null = null

  constructor() {
    this.host = document.createElement('div')
    this.host.id = HOST_ID
    this.shadow = this.host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = STYLES
    this.shadow.appendChild(style)

    this.canvas = document.createElement('canvas')
    this.canvas.id = 'canvas'
    this.shadow.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!

    const hud = document.createElement('div')
    hud.id = 'hud'
    hud.innerHTML = `
      <button id="draw" class="primary">✏️ Draw</button>
      <span id="modes" title="gesture: mark up existing UI · design: sketch new UI · screenshot: pixels-only benchmark">
        <button id="mode-gesture" class="mode on" title="gesture commands">✏️</button>
        <button id="mode-design" class="mode" title="design sketch">🎨</button>
        <button id="mode-screenshot" class="mode" title="screenshot benchmark">📸</button>
      </span>
      <button id="tweakBtn" title="tweak: click a container, drag its gaps and padding — zero tokens">🔧</button>
      <button id="run" disabled>▶ Run</button>
      <button id="confirm" class="primary" style="display:none">✓ Go</button>
      <button id="cancel" style="display:none">✗ Cancel</button>
      <button id="undo" disabled>↩</button>
      <button id="clear" disabled>✕</button>
      <span id="status">sketch2code · Alt+D to draw</span>
    `
    this.shadow.appendChild(hud)
    this.statusEl = this.shadow.getElementById('status')!
    this.drawBtn = this.shadow.getElementById('draw') as HTMLButtonElement
    this.runBtn = this.shadow.getElementById('run') as HTMLButtonElement
    this.confirmBtn = this.shadow.getElementById('confirm') as HTMLButtonElement
    this.cancelBtn = this.shadow.getElementById('cancel') as HTMLButtonElement
    this.undoBtn = this.shadow.getElementById('undo') as HTMLButtonElement
    this.clearBtn = this.shadow.getElementById('clear') as HTMLButtonElement

    for (const m of ['gesture', 'design', 'screenshot'] as const) {
      this.shadow.getElementById(`mode-${m}`)!.addEventListener('click', () => {
        this.runMode = m
        for (const mm of ['gesture', 'design', 'screenshot']) {
          this.shadow.getElementById(`mode-${mm}`)!.classList.toggle('on', mm === m)
        }
        this.status(
          m === 'gesture' ? 'gesture mode: mark up existing UI'
          : m === 'design' ? 'design mode: sketch new UI to build'
          : 'screenshot mode: pixels-only benchmark (will ask to share this tab)',
        )
      })
    }
    this.shadow.getElementById('tweakBtn')!.addEventListener('click', () => {
      const btn = this.shadow.getElementById('tweakBtn')!
      if (this.mode === 'tweak') {
        btn.classList.remove('primary')
        this.exitTweak('tweak off')
      } else {
        btn.classList.add('primary')
        this.setMode('tweak')
        this.status('tweak: click any element — drag to move, handles to resize, gaps/padding to space')
      }
    })
    this.drawBtn.addEventListener('click', () => this.toggleDraw())
    this.runBtn.addEventListener('click', () => void this.run())
    this.confirmBtn.addEventListener('click', () => void this.proceed())
    this.cancelBtn.addEventListener('click', () => this.exitPreview('cancelled'))
    this.undoBtn.addEventListener('click', () => { this.strokes.pop(); this.redraw(); this.sync() })
    this.clearBtn.addEventListener('click', () => { this.strokes = []; this.redraw(); this.sync() })

    window.addEventListener('keydown', (e) => {
      // don't hijack typing in the host app's inputs
      const target = e.composedPath()[0] as HTMLElement | undefined
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (this.mode === 'draw' && this.strokes.length > 0) {
          this.strokes.pop()
          this.redraw()
          this.sync()
          this.status('stroke undone')
        } else if (this.mode !== 'running') {
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
        return
      }
      if (e.altKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) {
        e.preventDefault()
        this.toggleDraw()
      }
      if (e.key === 'Escape') {
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
          this.setMode('idle')
        }
      }
    })
    window.addEventListener('resize', () => this.resize())
    window.addEventListener('scroll', () => this.redraw(), { passive: true })

    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e))
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e))
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e))
    this.canvas.addEventListener('pointercancel', (e) => this.onUp(e))

    document.body.appendChild(this.host)
    this.resize()
    this.connectEvents()
  }

  private setMode(m: Mode) {
    this.mode = m
    this.host.dataset.mode = m
    this.drawBtn.textContent = m === 'draw' ? '✋ Done' : '✏️ Draw'
    this.drawBtn.classList.toggle('primary', m !== 'draw')
    this.sync()
  }

  private toggleDraw() {
    if (this.mode === 'running') return
    this.setMode(this.mode === 'draw' ? 'idle' : 'draw')
  }

  private sync() {
    const busy = this.mode === 'running'
    const previewing = this.mode === 'preview' || this.mode === 'tweak'
    this.runBtn.style.display = previewing ? 'none' : ''
    this.confirmBtn.style.display = previewing ? '' : 'none'
    this.cancelBtn.style.display = previewing ? '' : 'none'
    this.runBtn.disabled = busy || this.strokes.length === 0
    this.undoBtn.disabled = busy || previewing || this.strokes.length === 0
    this.clearBtn.disabled = busy || previewing || this.strokes.length === 0
    this.drawBtn.disabled = busy || previewing
  }

  private status(msg: string, err = false) {
    this.statusEl.textContent = msg
    this.statusEl.classList.toggle('err', err)
  }

  // ---- drawing ----

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
    this.live = { id: `s${this.strokeSeq++}`, points: [this.toPage(e)] }
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
    this.redraw()
  }

  private onUp(e: PointerEvent) {
    if (this.mode === 'tweak') {
      void this.onTweakUp(e)
      return
    }
    if (!this.live) return
    this.live.points.push(this.toPage(e))
    if (this.live.points.length > 2) this.strokes.push(this.live)
    this.live = null
    this.redraw()
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
          strokes: this.strokes, snapshot: this.snapshot(), mode: this.runMode, overrides: this.overrides,
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
    this.tweakHover = null
    this.shadow.getElementById('tweakBtn')?.classList.remove('primary')
    this.setMode('idle')
    this.status(msg)
    this.redraw()
  }

  private deselect(msg: string) {
    if (this.tweak) this.clearTweakPreview()
    this.tweak = null
    this.tweakHover = null
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
  }

  /** Deepest stamped element under the point — anything stamped is fair game. */
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
    const guides: Guide[] = []
    const parent = el.parentElement
    if (!parent) return guides
    const pr = parent.getBoundingClientRect()
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
      const kr = k.getBoundingClientRect()
      if (kr.width <= 0 && kr.height <= 0) continue
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

  /** Current visual selection rect — cached geometry during drags (no reads). */
  private selRect(t: TweakState): SelRect {
    if (t.handleDrag) {
      const hd = t.handleDrag
      return {
        left: hd.startRect.left,
        top: hd.startRect.top,
        width: hd.w ?? hd.startRect.width,
        height: hd.h ?? hd.startRect.height,
      }
    }
    if (t.moveDrag) {
      const md = t.moveDrag
      return {
        left: md.startRect.left + md.dx,
        top: md.startRect.top + md.dy,
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

  private selectElement(el: HTMLElement) {
    if (this.tweak) this.clearTweakPreview()
    this.tweak = this.buildTweakState(el)
    this.tweakHover = null
    const t = this.tweak
    const r = el.getBoundingClientRect()
    const layout = t.display === 'flex' || t.display === 'grid' ? ` · ${t.display} ${t.direction}` : ''
    const linked = t.instanceEls.length > 1
      ? ` · ${t.instanceEls.length} linked (double-click: just this one)`
      : ''
    this.status(
      `${el.tagName.toLowerCase()} · ${Math.round(r.width)}×${Math.round(r.height)}${layout} · ` +
      `${t.srcLoc.split(':')[0]}${linked} — drag to move, handles to resize`,
    )
    this.redraw()
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
            siblings.push({ index: i, left: kr.left, top: kr.top, right: kr.right, bottom: kr.bottom })
          }
        })
        parentSrcLoc = parent.dataset.s2c ?? null
      }
    }
    const cs = getComputedStyle(t.el)
    const baseTransform = cs.transform
    const guides = this.collectGuides(t.el)
    const prev = { opacity: t.el.style.opacity, position: t.el.style.position, zIndex: t.el.style.zIndex }
    // unclipped preview: ghost when an ancestor would clip, else lift in place
    let ghost: HTMLElement | null = null
    if (this.hasClippingAncestor(t.el)) {
      ghost = t.el.cloneNode(true) as HTMLElement
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
      t.el.style.opacity = '0.4'
    } else {
      if (cs.position === 'static') t.el.style.position = 'relative'
      t.el.style.zIndex = '2147482998'
      t.el.style.willChange = 'transform'
    }
    t.moveDrag = {
      startX: e.clientX,
      startY: e.clientY,
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
      ghost,
      prev,
    }
    this.canvas.setPointerCapture(e.pointerId)
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
    const t = this.tweak
    if (t) {
      const sr = this.selRect(t)
      // 1) resize handles win over everything
      const hp = this.hitHandle(sr, e.clientX, e.clientY)
      if (hp) {
        t.handleDrag = {
          handle: hp.kind, startX: e.clientX, startY: e.clientY,
          startRect: sr, w: null, h: null,
          guides: this.collectGuides(t.el), activeGuides: [],
          snappedW: false, snappedH: false,
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
        t.drag = { zone, startX: e.clientX, startY: e.clientY, startValue }
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
      const rawDx = e.clientX - md.startX
      const rawDy = e.clientY - md.startY
      // magnetic alignment: edges + centers of the moving rect vs cached guides
      md.activeGuides = []
      md.snappedX = false
      md.snappedY = false
      let dx = rawDx
      let dy = rawDy
      if (Math.hypot(rawDx, rawDy) >= CLICK_SLOP) {
        const mr = md.startRect
        const sx = this.bestSnap(md.guides, 'v', [
          mr.left + rawDx, mr.left + mr.width / 2 + rawDx, mr.left + mr.width + rawDx,
        ])
        if (sx) {
          dx = rawDx + sx.delta
          md.snappedX = true
          md.activeGuides.push(sx.guide)
        }
        const sy = this.bestSnap(md.guides, 'h', [
          mr.top + rawDy, mr.top + mr.height / 2 + rawDy, mr.top + mr.height + rawDy,
        ])
        if (sy) {
          dy = rawDy + sy.delta
          md.snappedY = true
          md.activeGuides.push(sy.guide)
        }
      }
      md.dx = dx
      md.dy = dy
      // free move: the preview follows the cursor exactly (compositor-only).
      // Clipped ancestors → the document-level ghost moves; else the element
      // itself (lifted via z-index), any pre-existing transform preserved.
      if (md.ghost) md.ghost.style.transform = `translate(${dx}px, ${dy}px)`
      else t.el.style.transform = `${md.baseTransform}translate(${dx}px, ${dy}px)`
      // slot detent: cursor inside another sibling's (cached) rect
      md.proposedIndex = -1
      for (const s of md.siblings) {
        if (e.clientX >= s.left && e.clientX <= s.right && e.clientY >= s.top && e.clientY <= s.bottom) {
          md.proposedIndex = s.index
          break
        }
      }
      if (Math.hypot(md.dx, md.dy) >= CLICK_SLOP) {
        const snap = md.snappedX || md.snappedY ? ' · ⌖ snapped' : ''
        this.status(
          (md.proposedIndex >= 0 && md.proposedIndex !== md.fromIndex
            ? `→ slot ${md.proposedIndex + 1} — release to reorder`
            : this.moveLabel(md.dx, md.dy, t.inFlow)) + snap,
        )
      }
      this.redraw()
      return
    }
    if (t?.handleDrag) {
      const hd = t.handleDrag
      const dx = e.clientX - hd.startX
      const dy = e.clientY - hd.startY
      const k = hd.handle
      let w: number | null = null
      let h: number | null = null
      if (k === 'e' || k === 'ne' || k === 'se') w = hd.startRect.width + dx
      if (k === 'w' || k === 'nw' || k === 'sw') w = hd.startRect.width - dx
      if (k === 's' || k === 'se' || k === 'sw') h = hd.startRect.height + dy
      if (k === 'n' || k === 'ne' || k === 'nw') h = hd.startRect.height - dy
      // magnetic alignment on the moving edge (right/bottom of the preview rect)
      hd.activeGuides = []
      hd.snappedW = false
      hd.snappedH = false
      if (w !== null) {
        const s = this.bestSnap(hd.guides, 'v', [hd.startRect.left + w])
        if (s) {
          w += s.delta
          hd.snappedW = true
          hd.activeGuides.push(s.guide)
        }
      }
      if (h !== null) {
        const s = this.bestSnap(hd.guides, 'h', [hd.startRect.top + h])
        if (s) {
          h += s.delta
          hd.snappedH = true
          hd.activeGuides.push(s.guide)
        }
      }
      hd.w = w === null ? null : Math.max(8, Math.round(w))
      hd.h = h === null ? null : Math.max(8, Math.round(h))
      // live preview via inline size; committed as w-*/h-* on release
      if (hd.w !== null) t.el.style.width = `${hd.w}px`
      if (hd.h !== null) t.el.style.height = `${hd.h}px`
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
        this.tweakHover = null
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
        this.tweakHover = null
        this.redraw()
        return
      }
      if (
        e.clientX >= sr.left && e.clientX <= sr.left + sr.width &&
        e.clientY >= sr.top && e.clientY <= sr.top + sr.height
      ) {
        this.canvas.style.cursor = 'move'
        this.tweakHover = null
        this.redraw()
        return
      }
      const el = this.pickAnyStamped(e.clientX, e.clientY)
      this.tweakHover = el && el !== t.el ? el.getBoundingClientRect() : null
      this.canvas.style.cursor = el ? 'pointer' : 'default'
      this.redraw()
      return
    }
    if (!t) {
      const el = this.pickAnyStamped(e.clientX, e.clientY)
      this.tweakHover = el ? el.getBoundingClientRect() : null
      this.canvas.style.cursor = el ? 'pointer' : 'default'
      this.redraw()
      return
    }
    if (!t.drag) return
    const { zone, startX, startY, startValue } = t.drag
    const axisDelta =
      zone.kind === 'gap'
        ? (t.direction === 'row' ? e.clientX - startX : e.clientY - startY)
        : zone.kind === 'pt' ? e.clientY - startY
        : zone.kind === 'pb' ? startY - e.clientY
        : zone.kind === 'pl' ? e.clientX - startX
        : startX - e.clientX
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
      const rawDist = Math.hypot(e.clientX - md.startX, e.clientY - md.startY)
      if (rawDist < CLICK_SLOP) {
        this.handleTweakClick(t, e)
        return
      }
      this.lastTweakClick = null
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
      await this.commitManipulation(
        {
          srcLoc: t.srcLoc, prop: 'resize', w, h,
          exactW: w !== undefined && hd.snappedW, exactH: h !== undefined && hd.snappedH,
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
    if (this.tweakHover) {
      // light outline on hover — every stamped element is interactable
      ctx.save()
      ctx.strokeStyle = 'rgba(8,145,178,0.55)'
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.5
      const h = this.tweakHover
      ctx.strokeRect(h.left, h.top, h.width, h.height)
      ctx.setLineDash([])
      ctx.restore()
    }
    const t = this.tweak
    if (!t) return
    const r = this.selRect(t)
    ctx.save()
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
      ctx.strokeStyle = GUIDE_COLOR
      ctx.lineWidth = 1
      for (const g of activeGuides) {
        ctx.beginPath()
        if (g.axis === 'v') {
          ctx.moveTo(g.pos, Math.min(g.lo, r.top) - 4)
          ctx.lineTo(g.pos, Math.max(g.hi, r.top + r.height) + 4)
        } else {
          ctx.moveTo(Math.min(g.lo, r.left) - 4, g.pos)
          ctx.lineTo(Math.max(g.hi, r.left + r.width) + 4, g.pos)
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
    const label = `${t.el.tagName.toLowerCase()} · ${Math.round(r.width)}×${Math.round(r.height)}${scopeNote}`
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
    const sx = window.scrollX
    const sy = window.scrollY
    for (const s of [...this.strokes, ...(this.live ? [this.live] : [])]) {
      ctx.beginPath()
      s.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x - sx, p.y - sy)
        else ctx.lineTo(p.x - sx, p.y - sy)
      })
      ctx.stroke()
    }
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
    if (this.strokes.length === 0) return
    if (this.runMode === 'screenshot') return void this.proceed()
    this.status('reading your drawing…')
    try {
      const res = await fetch('/@s2c/interpret', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ strokes: this.strokes, snapshot: this.snapshot(), mode: this.runMode }),
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

  private async proceed() {
    this.setMode('running')
    this.status('running…')
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
          strokes: this.strokes,
          snapshot: this.snapshot(),
          clientId: CLIENT_ID,
          mode: this.runMode,
          screenshot,
          overrides: Object.keys(this.overrides).length ? this.overrides : undefined,
          rawInterpretation: this.v2?.raw,
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
      this.redraw()
      this.setMode('idle')
    })
    this.events.addEventListener('error-event', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { message: string; clientId?: string }
      if (!this.mine(d)) return
      this.status(`✗ ${d.message}`, true)
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
