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
interface TweakState {
  el: HTMLElement
  rect: DOMRect
  display: string
  direction: 'row' | 'column'
  zones: TweakZone[]
  drag: { zone: TweakZone; startX: number; startY: number; startValue: number } | null
  /** reorder drag: the child follows the hand, detents into sibling slots */
  childDrag: {
    child: HTMLElement
    fromIndex: number
    proposedIndex: number
    startX: number
    startY: number
  } | null
  /** current preview value px per prop */
  preview: Partial<Record<'gap' | 'pt' | 'pr' | 'pb' | 'pl', number>>
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
        this.status('tweak: hover shows targets — click one, then drag the blue gaps / purple padding')
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
      if (e.altKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) {
        e.preventDefault()
        this.toggleDraw()
      }
      if (e.key === 'Escape') {
        if (this.mode === 'tweak') this.exitTweak('tweak off')
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

  // ---------- tweak mode: gap handle + padding ring (zero tokens) ----------

  private exitTweak(msg: string) {
    if (this.tweak) this.clearTweakPreview()
    this.tweak = null
    this.tweakHover = null
    this.shadow.getElementById('tweakBtn')?.classList.remove('primary')
    this.setMode('idle')
    this.status(msg)
    this.redraw()
  }

  private clearTweakPreview() {
    const t = this.tweak
    if (!t) return
    t.el.style.removeProperty('gap')
    t.el.style.removeProperty('padding-top')
    t.el.style.removeProperty('padding-right')
    t.el.style.removeProperty('padding-bottom')
    t.el.style.removeProperty('padding-left')
  }

  private pickTweakTarget(x: number, y: number): HTMLElement | null {
    this.canvas.style.pointerEvents = 'none'
    let el = document.elementFromPoint(x, y) as HTMLElement | null
    this.canvas.style.pointerEvents = ''
    // climb to the nearest stamped element that is a flex/grid container or
    // has padding — the thing the affordances can actually edit
    while (el && el !== document.body) {
      if (el.dataset.s2c) {
        const cs = getComputedStyle(el)
        const isContainer =
          (cs.display === 'flex' || cs.display === 'grid') && el.children.length >= 2
        const hasPad = ['Top', 'Right', 'Bottom', 'Left'].some(
          (side) => parseFloat(cs.getPropertyValue('padding-' + side.toLowerCase())) > 0,
        )
        if (isContainer || hasPad || el.children.length >= 1) return el
      }
      el = el.parentElement
    }
    return null
  }

  private buildTweakState(el: HTMLElement): TweakState {
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

    return { el, rect, display: cs.display, direction, zones, drag: null, childDrag: null, preview: {} }
  }

  private onTweakDown(e: PointerEvent) {
    if (e.button !== 0) return
    const t = this.tweak
    if (t) {
      // hit a zone? start dragging it
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
    }
    // a child of the current selection? start a reorder drag (quantized:
    // the element follows the hand, then detents into legal slots)
    if (t && (t.display === 'flex' || t.display === 'grid')) {
      const kids = [...t.el.children] as HTMLElement[]
      const idx = kids.findIndex((k) => {
        const r = k.getBoundingClientRect()
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      })
      if (idx >= 0) {
        t.childDrag = {
          child: kids[idx]!, fromIndex: idx, proposedIndex: idx,
          startX: e.clientX, startY: e.clientY,
        }
        kids[idx]!.style.transition = 'none'
        kids[idx]!.style.zIndex = '50'
        kids[idx]!.style.position = 'relative'
        this.canvas.setPointerCapture(e.pointerId)
        this.status(`dragging child ${idx + 1} — release on a slot to reorder`)
        return
      }
    }
    // otherwise (re)select
    const el = this.pickTweakTarget(e.clientX, e.clientY)
    if (!el) {
      this.status('nothing tweakable here — click a stamped container', true)
      return
    }
    if (this.tweak) this.clearTweakPreview()
    this.tweak = this.buildTweakState(el)
    const label = this.tweak.display === 'flex' || this.tweak.display === 'grid'
      ? `${this.tweak.display} ${this.tweak.direction}`
      : this.tweak.display
    this.status(`${el.dataset.s2c!.split(':')[0]} · ${label} · drag a gap strip or padding edge`)
    this.redraw()
  }

  private onTweakMove(e: PointerEvent) {
    const t = this.tweak
    if (!t) {
      const el = this.pickTweakTarget(e.clientX, e.clientY)
      this.tweakHover = el ? el.getBoundingClientRect() : null
      this.canvas.style.cursor = el ? 'pointer' : 'default'
      this.redraw()
      return
    }
    if (t.childDrag) {
      const cd = t.childDrag
      const dx = e.clientX - cd.startX
      const dy = e.clientY - cd.startY
      cd.child.style.transform = `translate(${dx}px, ${dy}px)`
      // detent: nearest OTHER sibling's center (the dragged child follows the
      // cursor, so it must be excluded or it always wins). Landing on sibling
      // j means "take j's place" — j is the final index for both directions.
      const kids = [...t.el.children] as HTMLElement[]
      let best = cd.fromIndex
      let bestD = Infinity
      kids.forEach((k, i) => {
        if (i === cd.fromIndex) return
        const r = k.getBoundingClientRect()
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
        if (d < bestD) { bestD = d; best = i }
      })
      // near the original slot? treat as unchanged (dead zone = half a sibling)
      const selfR = kids[cd.fromIndex]!.getBoundingClientRect()
      const origX = selfR.left + selfR.width / 2 - (e.clientX - cd.startX)
      const origY = selfR.top + selfR.height / 2 - (e.clientY - cd.startY)
      if (Math.hypot(e.clientX - origX, e.clientY - origY) < Math.min(selfR.width, selfR.height) / 2) {
        best = cd.fromIndex
      }
      cd.proposedIndex = best
      this.status(
        best === cd.fromIndex
          ? `position ${best + 1} (unchanged) — release to cancel`
          : `→ position ${best + 1} — release to commit reorder`,
      )
      this.redraw()
      return
    }
    if (!t.drag) {
      // hover affordance: pointer cursor over zones + highlight the element
      // the next click would select
      const over = t.zones.some(
        (z) => e.clientX >= z.x && e.clientX <= z.x + z.w && e.clientY >= z.y && e.clientY <= z.y + z.h,
      )
      this.canvas.style.cursor = over ? (t.direction === 'row' ? 'col-resize' : 'row-resize') : 'default'
      if (!over) {
        const el = this.pickTweakTarget(e.clientX, e.clientY)
        this.tweakHover = el && el !== t.el ? el.getBoundingClientRect() : null
        this.redraw()
      }
      return
    }
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
    if (t?.childDrag) {
      const cd = t.childDrag
      t.childDrag = null
      this.canvas.releasePointerCapture?.(e.pointerId)
      cd.child.style.transform = ''
      cd.child.style.zIndex = ''
      cd.child.style.position = ''
      cd.child.style.transition = ''
      if (cd.proposedIndex === cd.fromIndex) {
        this.status('reorder cancelled (same position)')
        return
      }
      const srcLoc = t.el.dataset.s2c
      if (!srcLoc) return
      this.status('committing reorder…')
      try {
        const res = await fetch('/@s2c/manipulate', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
          body: JSON.stringify({ srcLoc, prop: 'reorder', from: cd.fromIndex, to: cd.proposedIndex }),
        })
        const body = (await res.json()) as { ok: boolean; change?: string; file?: string; error?: string; checkpoint?: string }
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        this.status(`✓ ${body.change} in ${body.file} · 0 tokens · revert: git restore --source=${(body.checkpoint ?? '').slice(0, 10)}`)
        const el = t.el
        setTimeout(() => {
          if (this.mode === 'tweak' && document.contains(el)) {
            this.tweak = this.buildTweakState(el)
            this.redraw()
          }
        }, 500)
      } catch (err) {
        this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
      }
      return
    }
    if (!t || !t.drag) return
    const { zone } = t.drag
    const px = t.preview[zone.kind]
    t.drag = null
    this.canvas.releasePointerCapture?.(e.pointerId)
    if (px === undefined) return
    const srcLoc = t.el.dataset.s2c
    if (!srcLoc) return
    this.status('committing…')
    try {
      const res = await fetch('/@s2c/manipulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': TOKEN },
        body: JSON.stringify({ srcLoc, prop: zone.kind, px }),
      })
      const body = (await res.json()) as {
        ok: boolean; change?: string; file?: string; error?: string; checkpoint?: string
      }
      if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      this.clearTweakPreview()
      this.status(`✓ ${body.change} in ${body.file} · 0 tokens · revert: git restore --source=${(body.checkpoint ?? '').slice(0, 10)}`)
      // re-select after HMR settles so zones match the new layout
      const el = t.el
      setTimeout(() => {
        if (this.mode === 'tweak' && document.contains(el)) {
          this.tweak = this.buildTweakState(el)
          this.redraw()
        }
      }, 500)
    } catch (err) {
      this.clearTweakPreview()
      this.status(`✗ ${err instanceof Error ? err.message : String(err)}`, true)
    }
  }

  private drawTweak() {
    const { ctx } = this
    if (this.tweakHover) {
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
    const r = t.el.getBoundingClientRect()
    ctx.save()
    ctx.strokeStyle = '#0891b2'
    ctx.lineWidth = 2
    ctx.strokeRect(r.left, r.top, r.width, r.height)
    for (const z of t.zones) {
      ctx.fillStyle = z.kind === 'gap' ? 'rgba(8,145,178,0.18)' : 'rgba(147,51,234,0.12)'
      ctx.fillRect(z.x, z.y, z.w, z.h)
    }
    ctx.fillStyle = '#0891b2'
    ctx.font = '11px ui-sans-serif, system-ui'
    ctx.fillText('gaps = blue · padding = purple', r.left + 4, Math.max(12, r.top - 6))
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
