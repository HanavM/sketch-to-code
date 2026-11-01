/**
 * n191: a plan target named by how it looks, not by its tag.
 *
 * Round 44 e5 (n190): the plan for "grey track to right edge" said `MODIFY e9 · <path>`. Nothing in that says
 * "the orange map route", so the wrong pick sat in plain sight and ✓ Go turned the route grey. A part with no
 * words of its own is now named by what a person sees: its colour and its shape ("orange line", "grey bar",
 * "dark dot"), from the element's own painted look. Pure: main.ts reads the computed style, this names it.
 */

export interface Look {
  tag: string
  w: number
  h: number
  /** Painted colours, as the browser reports them ('rgb(234, 88, 12)'); empty or transparent = none. */
  fill?: string
  stroke?: string
  color?: string
  /** Smallest corner radius in px, or the element is an svg circle/ellipse. */
  radius?: number
}

const NAMED: Array<[string, [number, number, number]]> = [
  ['black', [17, 17, 17]], ['dark', [31, 41, 55]], ['grey', [156, 163, 175]], ['light grey', [221, 224, 229]],
  ['white', [255, 255, 255]], ['red', [220, 38, 38]], ['orange', [234, 88, 12]], ['peach', [254, 215, 170]],
  ['yellow', [234, 179, 8]], ['green', [22, 163, 74]], ['pale green', [210, 230, 205]], ['teal', [13, 148, 136]],
  ['blue', [37, 99, 235]], ['navy', [30, 41, 90]], ['purple', [124, 58, 237]], ['pink', [219, 39, 119]],
  ['brown', [120, 72, 40]], ['cream', [250, 243, 224]],
]

export function parseRgb(css: string | undefined): [number, number, number, number] | null {
  if (!css) return null
  const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/.exec(css)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])]
  const h = /^#([0-9a-f]{6})$/i.exec(css.trim())
  if (h) { const v = parseInt(h[1]!, 16); return [v >> 16, (v >> 8) & 255, v & 255, 1] }
  return null
}

export function colourWord(css: string | undefined): string | null {
  const c = parseRgb(css)
  if (!c || c[3] < 0.1) return null
  let best: [string, number] = ['', Infinity]
  for (const [name, [r, g, b]] of NAMED) {
    const d = (c[0] - r) ** 2 * 2 + (c[1] - g) ** 2 * 4 + (c[2] - b) ** 2 * 3
    if (d < best[1]) best = [name, d]
  }
  return best[0]
}

export function shapeWord(l: Look): string {
  const tag = l.tag.toLowerCase()
  const long = Math.max(l.w, l.h), short = Math.min(l.w, l.h)
  if (tag === 'circle' || tag === 'ellipse' || (l.radius != null && l.radius >= short / 2 - 0.5 && short > 0 && long / short < 1.3)) {
    return long <= 24 ? 'dot' : 'circle'
  }
  if (tag === 'path' || tag === 'line' || tag === 'polyline') return 'line'
  if (tag === 'svg') return 'drawing'
  if (tag === 'img') return 'picture'
  if (short <= 12 && long >= 40) return long / short >= 6 ? 'bar' : 'strip'
  if (/^(button|a)$/.test(tag)) return tag === 'a' ? 'link' : 'button'
  if (/^(input|textarea|select)$/.test(tag)) return 'field'
  return 'box'
}

/** "orange line", "grey bar", "dark dot", or just the shape when no colour paints. */
export function lookName(l: Look): string {
  const tag = l.tag.toLowerCase()
  const svgShape = /^(path|line|polyline|polygon|circle|ellipse|rect)$/.test(tag)
  // an svg line is its stroke; a filled svg shape is its fill; a box is its background
  const paint = svgShape
    ? (tag === 'path' || tag === 'line' || tag === 'polyline' ? colourWord(l.stroke) ?? colourWord(l.fill) : colourWord(l.fill) ?? colourWord(l.stroke))
    : colourWord(l.fill) ?? (shapeWord(l) === 'drawing' ? colourWord(l.color) : null)
  const shape = shapeWord(l)
  return paint ? `${paint} ${shape}` : shape
}
