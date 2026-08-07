import { bboxOf, bboxUnion } from './geometry.js'
import type { BBox, InkScene, Stroke } from './types.js'

export interface RenderOptions {
  /** Stroke brush radius in px. */
  brush?: number
  /** Padding around the ink, px. */
  pad?: number
  /** Max output dimension; scene is scaled down to fit. */
  maxSize?: number
  /** Draw node-id badges for set-of-mark prompting. */
  labels?: boolean
  background?: [number, number, number, number]
  ink?: [number, number, number, number]
}

export interface Raster {
  width: number
  height: number
  /** RGBA, width*height*4. */
  data: Uint8ClampedArray
  /** Maps page coords → raster coords. */
  toRaster: (x: number, y: number) => { x: number; y: number }
}

function stampDisc(r: Raster, cx: number, cy: number, rad: number, color: [number, number, number, number]) {
  const x0 = Math.max(0, Math.floor(cx - rad))
  const x1 = Math.min(r.width - 1, Math.ceil(cx + rad))
  const y0 = Math.max(0, Math.floor(cy - rad))
  const y1 = Math.min(r.height - 1, Math.ceil(cy + rad))
  const r2 = rad * rad
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy <= r2) {
        const i = (y * r.width + x) * 4
        r.data[i] = color[0]
        r.data[i + 1] = color[1]
        r.data[i + 2] = color[2]
        r.data[i + 3] = color[3]
      }
    }
}

function drawLine(r: Raster, x0: number, y0: number, x1: number, y1: number, brush: number, color: [number, number, number, number]) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    stampDisc(r, x0 + t * (x1 - x0), y0 + t * (y1 - y0), brush, color)
  }
}

/** 3x5 bitmap digits + lowercase letters used in ids (n, t, a, g). */
const GLYPHS: Record<string, number[]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
  n: [0b000, 0b110, 0b101, 0b101, 0b101],
  t: [0b010, 0b111, 0b010, 0b010, 0b011],
  a: [0b000, 0b111, 0b011, 0b101, 0b111],
  g: [0b011, 0b101, 0b011, 0b001, 0b110],
}

function drawLabel(r: Raster, text: string, x: number, y: number, scale: number) {
  const w = text.length * 4 * scale + 2 * scale
  const h = 7 * scale
  // badge background
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const px = Math.round(x + xx), py = Math.round(y + yy)
      if (px < 0 || py < 0 || px >= r.width || py >= r.height) continue
      const i = (py * r.width + px) * 4
      r.data[i] = 37; r.data[i + 1] = 99; r.data[i + 2] = 235; r.data[i + 3] = 255
    }
  // glyphs
  for (let c = 0; c < text.length; c++) {
    const glyph = GLYPHS[text[c]!]
    if (!glyph) continue
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 3; col++) {
        if ((glyph[row]! >> (2 - col)) & 1) {
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++) {
              const px = Math.round(x + scale + c * 4 * scale + col * scale + sx)
              const py = Math.round(y + scale + row * scale + sy)
              if (px < 0 || py < 0 || px >= r.width || py >= r.height) continue
              const i = (py * r.width + px) * 4
              r.data[i] = 255; r.data[i + 1] = 255; r.data[i + 2] = 255; r.data[i + 3] = 255
            }
        }
      }
  }
}

/** Rasterize strokes (optionally with node-id badges) to RGBA. Deterministic, zero-dep. */
export function renderScene(scene: InkScene, opts: RenderOptions = {}): Raster {
  const brush = opts.brush ?? 2
  const pad = opts.pad ?? 16
  const maxSize = opts.maxSize ?? 1400
  const bg = opts.background ?? [255, 255, 255, 255]
  const ink = opts.ink ?? [17, 17, 17, 255]

  let box: BBox | null = null
  for (const s of scene.strokes) {
    if (s.points.length === 0) continue
    const b = bboxOf(s.points)
    box = box ? bboxUnion(box, b) : b
  }
  if (!box) box = { x: 0, y: 0, w: 1, h: 1 }

  const scale = Math.min(1, maxSize / Math.max(1, Math.max(box.w, box.h) + pad * 2))
  const width = Math.max(8, Math.ceil((box.w + pad * 2) * scale))
  const height = Math.max(8, Math.ceil((box.h + pad * 2) * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; data[i + 3] = bg[3]
  }
  const toRaster = (x: number, y: number) => ({
    x: (x - box.x + pad) * scale,
    y: (y - box.y + pad) * scale,
  })
  const raster: Raster = { width, height, data, toRaster }

  for (const s of scene.strokes) {
    for (let i = 1; i < s.points.length; i++) {
      const a = toRaster(s.points[i - 1]!.x, s.points[i - 1]!.y)
      const b = toRaster(s.points[i]!.x, s.points[i]!.y)
      drawLine(raster, a.x, a.y, b.x, b.y, brush * scale, ink)
    }
    if (s.points.length === 1) {
      const p = toRaster(s.points[0]!.x, s.points[0]!.y)
      stampDisc(raster, p.x, p.y, brush * scale, ink)
    }
  }

  if (opts.labels) {
    const labelScale = Math.max(2, Math.round(2 * scale))
    for (const n of scene.nodes) {
      const p = toRaster(n.bbox.x, n.bbox.y)
      drawLabel(raster, n.id, p.x, p.y - 8 * labelScale, labelScale)
    }
    for (const t of scene.textRegions) {
      const p = toRaster(t.bbox.x, t.bbox.y)
      drawLabel(raster, t.id, p.x, p.y - 8 * labelScale, labelScale)
    }
  }
  return raster
}

/** Crop a raster to a page-space bbox (plus padding), e.g. a text region for OCR. */
export function cropRaster(r: Raster, pageBox: BBox, padPx = 6): Raster {
  const a = r.toRaster(pageBox.x, pageBox.y)
  const b = r.toRaster(pageBox.x + pageBox.w, pageBox.y + pageBox.h)
  const x0 = Math.max(0, Math.floor(a.x - padPx))
  const y0 = Math.max(0, Math.floor(a.y - padPx))
  const x1 = Math.min(r.width, Math.ceil(b.x + padPx))
  const y1 = Math.min(r.height, Math.ceil(b.y + padPx))
  const w = Math.max(1, x1 - x0)
  const h = Math.max(1, y1 - y0)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const src = ((y + y0) * r.width + x0) * 4
    data.set(r.data.subarray(src, src + w * 4), y * w * 4)
  }
  return {
    width: w,
    height: h,
    data,
    toRaster: (x, y) => {
      const p = r.toRaster(x, y)
      return { x: p.x - x0, y: p.y - y0 }
    },
  }
}

/** Convenience for tests/debug: render a bare stroke list. */
export function renderStrokes(strokes: Stroke[], opts: RenderOptions = {}): Raster {
  return renderScene(
    { strokes, groups: [], nodes: [], textRegions: [], arrows: [] },
    opts,
  )
}
