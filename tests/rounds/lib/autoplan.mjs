/**
 * Auto-sketch (approach n2): derive what a person would draw and type for a
 * target page from the target's own [data-r] blocks, by one fixed rule set,
 * instead of planning each page by hand. Every page is then asked for the same
 * honest way, and a new round needs only target HTML.
 *
 * Per region, from computed style:
 *   mark kind  — image | circle | button | heading | box | text | (skip)
 *   note       — the few words a picture can't carry: the copy of headings and
 *                buttons, and look words (colour names, serif/italic/uppercase,
 *                heavy, gradient, glow, outline, pill).
 * Plus one whole-page note for the page background and type feel.
 *
 * Containers whose content is other marked regions are skipped unless they have
 * their own visible fill or border (then they are a box), the way a person
 * draws the parts and not an invisible wrapper.
 *
 * Zero tokens: a browser reads the target, nothing else.
 */

/** Runs in the target page. Returns raw facts per [data-r] element + the body. */
function factsInPage() {
  const rgba = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return { r, g, b, a }
  }
  const colours = (s) => [...s.matchAll(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi)].map((m) => m[0])
  const fact = (el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const regionKids = [...el.querySelectorAll('[data-r]')].map((k) => k.dataset.r)
    const kids = [...el.children].filter((k) => getComputedStyle(k).display !== 'none')
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim()
    return {
      role: el.dataset?.r ?? '*',
      tag: el.tagName.toLowerCase(),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
      ownText,
      kidTexts: kids.map((k) => (k.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
      kidCount: kids.length,
      regionKids,
      font: { size: parseFloat(cs.fontSize), family: cs.fontFamily, weight: Number(cs.fontWeight) || 400, style: cs.fontStyle, transform: cs.textTransform },
      colour: rgba(cs.color),
      bg: rgba(cs.backgroundColor),
      bgImage: cs.backgroundImage,
      bgImageColours: colours(cs.backgroundImage),
      clipText: (cs.webkitBackgroundClip || cs.backgroundClip) === 'text',
      border: { w: parseFloat(cs.borderTopWidth) || 0, colour: rgba(cs.borderTopColor), bottom: parseFloat(cs.borderBottomWidth) || 0 },
      radius: parseFloat(cs.borderTopLeftRadius) || 0,
      radiusPct: cs.borderTopLeftRadius.includes('%') ? parseFloat(cs.borderTopLeftRadius) : null,
      shadow: cs.boxShadow,
      centred: cs.textAlign === 'center' || cs.justifyContent === 'center',
      // a form field: a label plus an empty bordered box, or an input-like box with left text
      fieldKid: kids.some((k) => { const c = getComputedStyle(k); return !(k.innerText || '').trim() && parseFloat(c.borderTopWidth) >= 1 && k.getBoundingClientRect().height >= 30 }),
      kidButtons: kids.filter((k) => { const c = getComputedStyle(k); const t = (k.innerText || '').trim(); return t && t.length <= 32 && (rgba(c.backgroundColor)?.a > 0.05 || parseFloat(c.borderTopWidth) >= 1) }).length,
      hasImg: !!el.querySelector('img,svg,picture,video,canvas') || /url\(/.test(cs.backgroundImage),
    }
  }
  return { body: fact(document.body), regions: [...document.querySelectorAll('[data-r]')].map(fact) }
}

// ---------------------------------------------------------------- naming

const NAMED = [
  ['black', 10, 10, 10], ['near-black', 22, 18, 34], ['dark navy', 18, 26, 54], ['white', 255, 255, 255],
  ['cream', 245, 238, 220], ['warm paper', 236, 226, 205], ['light grey', 225, 228, 232], ['grey', 128, 132, 140],
  ['dark grey', 55, 60, 68], ['yellow', 250, 220, 30], ['orange', 249, 115, 22], ['coral', 255, 127, 100],
  ['red', 220, 38, 38], ['pink', 236, 72, 153], ['purple', 147, 51, 234], ['lavender', 196, 181, 253],
  ['blue', 37, 99, 235], ['sky blue', 125, 190, 245], ['cyan', 34, 211, 238], ['teal', 20, 150, 140],
  ['green', 34, 160, 80], ['deep green', 22, 70, 50], ['brown', 120, 72, 40],
]
const parse = (s) => {
  if (typeof s !== 'string') return s
  if (s.startsWith('#')) {
    let h = s.slice(1); if (h.length <= 4) h = [...h].map((c) => c + c).join('')
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length > 6 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null
  const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }
}
export function colourName(c) {
  c = parse(c); if (!c) return null
  let best = null, bd = Infinity
  for (const [n, r, g, b] of NAMED) {
    const d = (c.r - r) ** 2 * 0.3 + (c.g - g) ** 2 * 0.59 + (c.b - b) ** 2 * 0.11
    if (d < bd) { bd = d; best = n }
  }
  return best
}
const dist = (a, b) => (a && b ? Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) : 999)
const visible = (c) => c && c.a > 0.05
const isSerif = (fam) => /serif/i.test(fam) && !/sans-serif/i.test(fam) || /georgia|times|garamond|playfair|didot|bodoni/i.test(fam)
const isMono = (fam) => /mono|courier|consolas/i.test(fam)
const quote = (s, n = 48) => `"${s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s}"`
const uniq = (xs) => [...new Set(xs.filter(Boolean))]

function gradientWords(f) {
  if (!/gradient/.test(f.bgImage)) return null
  const names = uniq(f.bgImageColours.map((c) => (parse(c)?.a ?? 1) < 0.3 ? null : colourName(c)))
  if (/linear-gradient\([^)]*1px/.test(f.bgImage) || /background-size/.test(f.bgImage)) return null
  return names.length >= 2 ? `${names.join(' to ')} gradient` : null
}
const gridLines = (f) => /gradient\([^,]*,?\s*rgba?\([^)]+\)\s*1px/.test(f.bgImage) || /1px,\s*transparent 1px/.test(f.bgImage)

function typeWords(f, page) {
  const w = []
  if (f.font.size >= 80) w.push('giant'); else if (f.font.size >= 52) w.push('huge'); else if (f.font.size >= 32) w.push('big')
  if (f.font.style === 'italic') w.push('italic')
  if (isSerif(f.font.family) && !isSerif(page.font.family)) w.push('serif')
  else if (isSerif(f.font.family) && f.font.size >= 32) w.push('serif')
  if (isMono(f.font.family)) w.push('mono')
  if (f.font.weight >= 800 && f.font.size >= 32) w.push('heavy')
  if (f.font.transform === 'uppercase') w.push('uppercase')
  return w
}

/** One region -> {kind, note} (kind null = don't draw). */
function decide(f, page, marked) {
  const { w, h } = f.rect
  const fill = visible(f.bg) && dist(f.bg, page.bg ?? { r: 255, g: 255, b: 255 }) > 6
  const grad = gradientWords(f)
  const bordered = f.border.w >= 1 && visible(f.border.colour)
  const ruled = !bordered && f.border.bottom >= 2
  const round = f.radiusPct >= 40 || f.radius >= Math.min(w, h) / 2 - 1
  const square = Math.abs(w - h) <= 0.15 * Math.max(w, h)
  const short = f.text.length > 0 && f.text.length <= 32
  const glow = /\d+px \d+px (\d{2,})px/.test(f.shadow) && !/0px 0px 0px/.test(f.shadow)
  const hardShadow = /(\d+)px (\d+)px 0px/.test(f.shadow) && !/0px 0px 0px/.test(f.shadow)
  const look = []
  const textCol = f.colour && dist(f.colour, page.colour) > 60 ? colourName(f.colour) : null

  if (f.hasImg && f.text.length < 4) return { kind: 'image', note: null }
  // a textless filled block with no parts inside is a picture placeholder
  if (!f.text && (fill || grad) && !f.regionKids.length && !round && w >= 60 && h >= 50) return { kind: 'image', note: null }
  if (f.fieldKid && f.kidCount <= 3) return { kind: 'box', note: `field ${quote(f.kidTexts[0] ?? f.role)}` }
  // an input: bordered, left-aligned short text (placeholder)
  if (bordered && !fill && short && !f.centred && h <= 70 && f.kidCount === 0 && f.tag !== 'a' && f.tag !== 'button') return { kind: 'box', note: `input ${quote(f.text)}` }
  if (round && square && f.text.length < 4 && (fill || grad)) {
    const glowy = glow || /radial/.test(f.bgImage)
    return { kind: 'circle', note: `big ${glowy ? 'glowing ' : ''}${grad ? grad.replace(' gradient', '') : colourName(f.bg)} circle` }
  }
  // a row of buttons
  if (f.kidButtons >= 2 && f.kidButtons === f.kidCount && h <= 120 && !f.regionKids.length) return { kind: 'box', note: `buttons: ${f.kidTexts.map((t) => quote(t)).join(', ')}` }
  const buttonish = (/^(a|button)$/.test(f.tag) || ((fill || bordered || grad) && f.centred)) && short && h <= 90 && f.kidCount <= 1 && w <= 420
  if (buttonish) {
    if (grad) look.push(grad)
    else if (fill) look.push(colourName(f.bg))
    else if (bordered) look.push(`${colourName(f.border.colour)} outline`)
    if (f.radius >= h / 2 - 2) look.push('pill')
    if (glow) look.push('glowing'); if (hardShadow) look.push('hard offset shadow')
    if (textCol && fill) look.push(`${textCol} text`)
    const kind = f.kidCount === 0 || f.tag === 'a' || f.tag === 'button' || fill || bordered ? 'button' : 'text'
    return { kind, note: `${uniq(look).join(' ')} button ${quote(f.text)}`.replace(/\s+/g, ' ').trim() }
  }
  if (f.regionKids.length && f.regionKids.every((r) => marked.has(r)) && !fill && !bordered && !grad) return { kind: null, note: null }
  if (/^h[1-3]$/.test(f.tag) || f.font.size >= 30) {
    const tw = typeWords(f, page)
    if (f.clipText && grad) tw.push(`${grad} text`); else if (textCol) tw.push(textCol)
    return { kind: 'heading', note: `${tw.join(' ')} ${quote(f.text, 60)}`.trim() }
  }
  // a row of short items (nav links, tabs)
  if (f.kidCount >= 3 && f.kidTexts.length >= 3 && f.kidTexts.every((t) => t.length <= 16) && h <= 80 && !f.regionKids.length) {
    return { kind: fill || bordered ? 'box' : 'text', note: `links: ${f.kidTexts.slice(0, 6).join(', ')}` }
  }
  if (fill || grad || bordered || ruled || /^(nav|header|aside|table|input|textarea|form)$/.test(f.tag) || f.regionKids.length) {
    if (grad) look.push(grad); else if (fill) look.push(colourName(f.bg))
    const bc = bordered ? colourName(f.border.colour) : null
    if (bordered && !fill && !/grey|white/.test(bc)) look.push(`${bc} border`)
    if (fill && /light grey|white/.test(colourName(f.bg)) && dist(f.bg, page.bg) < 30) look.pop() // a faint card: the box shows it
    if (ruled) look.push('thick rule under')
    const what = f.tag === 'table' ? 'table' : f.tag === 'nav' ? 'nav bar' : f.tag === 'aside' ? 'sidebar' : null
    // only say it when there is something a box can't show
    const say = uniq([...look, what]).join(' ')
    const head = f.kidTexts[0] && f.kidTexts[0].length <= 40 ? f.kidTexts[0] : null
    const copy = f.text && f.text.length <= 40 && !f.regionKids.length ? quote(f.text) : head && !f.regionKids.length ? `${quote(head)} and text` : ''
    return { kind: 'box', note: say || copy ? `${say} ${copy}`.trim() : null }
  }
  if (f.text) return { kind: 'text', note: f.text.length <= 40 && f.font.size >= 18 ? `${typeWords(f, page).join(' ')} ${quote(f.text)}`.trim() : null }
  return { kind: 'box', note: null }
}

function pageNote(b) {
  const w = []
  const plain = (!visible(b.bg) || dist(b.bg, { r: 255, g: 255, b: 255 }) < 12) && !/gradient|url/.test(b.bgImage) && !isSerif(b.font.family) && !isMono(b.font.family)
  if (plain) return null
  const grad = gradientWords(b)
  if (grad) w.push(`${grad} page`)
  else if (visible(b.bg)) w.push(`${colourName(b.bg)} page`)
  if (gridLines(b)) w.push('faint grid lines')
  if (isSerif(b.font.family)) w.push('serif type'); else if (isMono(b.font.family)) w.push('mono type')
  if (b.colour) w.push(`${colourName(b.colour)} text`)
  return `whole page: ${w.join(', ')}`
}

/**
 * Plan a page: [[role, kind]...] in reading order and [[role|'*', note]...].
 * Same shape as the hand plans in <round>/sketches.mjs.
 */
export async function autoPlan(browser, htmlPath, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport })
  await page.goto(`file://${htmlPath}`)
  const { body, regions } = await page.evaluate(factsInPage)
  await page.close()
  body.bg = visible(body.bg) ? body.bg : { r: 255, g: 255, b: 255, a: 1 }
  // decide leaves first, so a container knows whether its parts got marks
  const marked = new Set()
  const out = new Map()
  const depthFirst = [...regions].sort((a, b) => a.regionKids.length - b.regionKids.length)
  for (const f of depthFirst) {
    const d = decide(f, body, marked)
    if (d.kind) marked.add(f.role)
    out.set(f.role, d)
  }
  const plan = regions.filter((f) => out.get(f.role).kind).map((f) => [f.role, out.get(f.role).kind])
  const notes = [...(pageNote(body) ? [['*', pageNote(body)]] : []), ...regions.filter((f) => out.get(f.role).note).map((f) => [f.role, out.get(f.role).note])]
  return { plan, notes }
}

export const wordCount = (notes) => notes.reduce((s, [, t]) => s + t.split(/\s+/).filter(Boolean).length, 0)
