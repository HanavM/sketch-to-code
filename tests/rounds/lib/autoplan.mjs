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
  // a sibling that is plain text (no region in it), left-aligned with el and within 28px above or below
  const near = (el, sib, side) => {
    if (!sib || sib.dataset?.r || sib.querySelector('[data-r]')) return null
    const t = (sib.innerText || '').replace(/\s+/g, ' ').trim()
    if (!t || t.length > (side === 'above' ? 32 : 90)) return null
    const a = el.getBoundingClientRect(), b = sib.getBoundingClientRect()
    const gap = side === 'above' ? a.top - b.bottom : b.top - a.bottom
    if (gap < -2 || gap > 28 || Math.abs(a.left - b.left) > 24) return null
    // a line under a heading is smaller type; a label above a field is a short single line
    if (side === 'under' && parseFloat(getComputedStyle(sib).fontSize) >= parseFloat(getComputedStyle(el).fontSize)) return null
    if (side === 'above' && b.height > 40) return null
    return t
  }
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
      // text of children that are not regions and hold none (a card title beside a marked picture)
      looseTexts: kids.filter((k) => !k.dataset?.r && !k.querySelector('[data-r]')).map((k) => (k.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
      // unmarked text right beside this block: a label just above a field, a sub-line just under a heading.
      // No mark carries it, so the block's own note must, or the build drops or rewrites it.
      labelAbove: near(el, el.previousElementSibling, 'above'),
      lineUnder: near(el, el.nextElementSibling, 'under'),
      // unmarked buttons in the same row right beside this one ('Today', 'Next ›' after a marked '‹ Prev'):
      // no mark carries them, so the marked button's note must, in order
      rowMates: (() => {
        const isBtn = (k) => { if (!k || k.dataset?.r || k.querySelector('[data-r]')) return false; const c = getComputedStyle(k); const t = (k.innerText || '').trim(); return t && t.length <= 24 && (rgba(c.backgroundColor)?.a > 0.05 || parseFloat(c.borderTopWidth) >= 1) }
        const r0 = el.getBoundingClientRect(), mid = (k) => { const b = k.getBoundingClientRect(); return b.top + b.height / 2 }
        const c0 = getComputedStyle(el)
        // same row, same size, same look ('Today' beside an outline 'Prev', not beside a green 'New event')
        const same = (k) => { const c = getComputedStyle(k); return Math.abs(mid(k) - (r0.top + r0.height / 2)) <= 8 && Math.abs(k.getBoundingClientRect().height - r0.height) <= 8 && c.backgroundColor === c0.backgroundColor && c.borderTopColor === c0.borderTopColor }
        const before = [], after = []
        for (let k = el.previousElementSibling; isBtn(k) && same(k); k = k.previousElementSibling) before.unshift((k.innerText || '').trim())
        for (let k = el.nextElementSibling; isBtn(k) && same(k); k = k.nextElementSibling) after.push((k.innerText || '').trim())
        return before.length || after.length ? { before, after } : null
      })(),
      // a pager: short leaf items with page numbers (and Next/Prev), the filled one is the current page
      pager: (() => {
        const leaves = [...el.querySelectorAll('*')].filter((k) => !k.children.length && (k.innerText || '').trim())
        const items = leaves.map((k) => ({ t: (k.innerText || '').trim(), on: rgba(getComputedStyle(k).backgroundColor)?.a > 0.05 }))
        const nums = items.filter((i) => /^\d{1,3}$/.test(i.t))
        if (nums.length < 2 || !items.some((i) => /next|prev|›|»/i.test(i.t))) return null
        return { items: items.filter((i) => i.t.length <= 8).map((i) => i.t), current: items.find((i) => i.on && /^\d+$/.test(i.t))?.t ?? null, caption: items.find((i) => i.t.length > 8)?.t ?? null }
      })(),
      stroke: parseFloat(cs.webkitTextStrokeWidth) || 0,
      strokeColour: rgba(cs.webkitTextStrokeColor),
      rotate: (() => { const m = cs.transform.match(/matrix\(([^,]+),\s*([^,]+)/); return m ? Math.round(Math.atan2(+m[2], +m[1]) * 180 / Math.PI) : 0 })(),
      blur: parseFloat((cs.filter.match(/blur\(([\d.]+)px/) || [])[1]) || 0,
      backdrop: /blur/.test(cs.backdropFilter || cs.webkitBackdropFilter || ''),
      // what moves, read off the keyframes of the block or anything inside it (a marquee's track)
      motion: (() => {
        const a = [el, ...el.querySelectorAll('*')].map((k) => getComputedStyle(k).animationName).find((n) => n && n !== 'none')
        if (!a) return null
        let kf = ''
        for (const sh of document.styleSheets) for (const r of sh.cssRules) if (r.type === 7 && r.name === a) kf = r.cssText
        return /rotate/.test(kf) ? 'spinning' : /translate/.test(kf) ? 'scrolling' : /scale/.test(kf) ? 'pulsing' : /opacity/.test(kf) ? 'fading' : 'moving'
      })(),
      vertical: /^vertical/.test(cs.writingMode),
      clipPoints: /polygon\(/.test(cs.clipPath) ? cs.clipPath.split(',').length : 0,
      blend: cs.mixBlendMode && cs.mixBlendMode !== 'normal' ? cs.mixBlendMode : null,
      shadows: (cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\))/)).map((p) => {
        const n = (p.replace(/rgba?\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat)
        return { x: n[0] ?? 0, y: n[1] ?? 0, blur: n[2] ?? 0, clear: /rgba\([^)]*,\s*0\)/.test(p) }
      }),
      bleeds: r.left < -4 || r.right > innerWidth + 4 || r.top < -4,
      // a textless filled block inside (a picture placeholder): makes this a picture card
      pictureKid: [...el.querySelectorAll('*')].some((k) => { const c = getComputedStyle(k); const b = k.getBoundingClientRect(); return !(k.innerText || '').trim() && !k.children.length && (rgba(c.backgroundColor)?.a > 0.05 || /gradient|url/.test(c.backgroundImage)) && b.width >= 48 && b.height >= 48 && Math.abs(b.width - b.height) < Math.max(b.width, b.height) * 2 }),
      // kids that are themselves label + empty box fields (a row of fields)
      fieldKids: kids.filter((k) => [...k.children].some((g) => { const c = getComputedStyle(g); return !(g.innerText || '').trim() && parseFloat(c.borderTopWidth) >= 1 && g.getBoundingClientRect().height >= 30 })).map((k) => (k.innerText || '').replace(/\s+/g, ' ').trim()),
      // a small textless pill: a toggle switch
      toggle: [...el.querySelectorAll('*')].map((k) => { const c = getComputedStyle(k); const b = k.getBoundingClientRect(); return !(k.innerText || '').trim() && b.width >= 30 && b.width <= 70 && b.height >= 16 && b.height <= 40 && b.width > b.height * 1.3 && parseFloat(c.borderTopLeftRadius) >= b.height / 2 - 1 ? rgba(c.backgroundColor) : null }).find(Boolean) || null,
      dense: dense(el),
    }
  }
  // ---- dense app UI: the structure a box can't show (table, month grid, stat cards, bars, bubbles, cards, lists)
  const txt = (k) => (k.innerText || '').replace(/\s+/g, ' ').trim()
  const filled = (k) => { const c = rgba(getComputedStyle(k).backgroundColor); return c && c.a > 0.05 ? c : null }
  // a small rounded label with its own fill: a status pill or a tag. Its ink names it better than a pale fill.
  const chips = (el) => [...el.querySelectorAll('*')].filter((k) => {
    const b = k.getBoundingClientRect(); const t = txt(k)
    return t && t.length <= 18 && !k.children.length && filled(k) && b.height <= 30 && b.width <= 160 && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= 3
  }).map((k) => ({ text: txt(k), ink: rgba(getComputedStyle(k).color), fill: filled(k) }))
  // siblings that repeat: the same tag and class, 3 or more (rows, cards, conversations)
  const repeats = (el) => {
    let best = []
    for (const p of [el, ...el.querySelectorAll('*')]) {
      const groups = new Map()
      // a state class ('conv on', 'page active') doesn't split the selected item from its row
      for (const k of p.children) { const key = `${k.tagName}.${k.className.replace(/\b(on|active|selected|current|today|open)\b/g, '').trim()}`; groups.set(key, [...(groups.get(key) ?? []), k]) }
      // marked regions are drawn on their own: they aren't a list's items
      for (const g of groups.values()) if (g.length >= 3 && g.length > best.length && g.every((k) => txt(k) && !k.dataset?.r && !k.querySelector('[data-r]'))) best = g
    }
    return best
  }
  function dense(el) {
    const cs = getComputedStyle(el)
    // table: header cells and body rows
    const trs = el.tagName === 'TABLE' ? [...el.querySelectorAll('tr')] : []
    if (trs.length >= 3) {
      const head = [...trs[0].children].map(txt)
      return { type: 'table', columns: head, rows: trs.length - 1, chips: chips(el) }
    }
    // month grid: seven columns, weekday heads, events as coloured chips in day cells
    const cols = cs.display === 'grid' ? cs.gridTemplateColumns.split(' ').length : 0
    if (cols === 7 && el.children.length >= 28) {
      const days = [...el.children]
      const heads = days.slice(0, 7).map(txt).filter((t) => /^[A-Za-z]{2,9}$/.test(t))
      const cells = days.length - heads.length
      const page = rgba(getComputedStyle(document.body).backgroundColor)
      const marked = days.slice(heads.length).filter((d) => { const f = filled(d); return f && (!page || Math.hypot(f.r - page.r, f.g - page.g, f.b - page.b) > 6) }).map((d) => txt(d).split(' ')[0])
      // each event keeps the day it sits on: 'Standup' on 2, 9, 16, 23 (the day cell is the grid child holding it)
      const dayOf = (k) => { let c = k; while (c && c.parentElement !== el) c = c.parentElement; return c ? txt(c).split(' ')[0] : null }
      const evs = [...el.querySelectorAll('*')].filter((k) => { const b = k.getBoundingClientRect(); const t = txt(k); return t && t.length <= 18 && !k.children.length && filled(k) && b.height <= 30 && b.width <= 160 && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= 3 })
        .map((k) => ({ text: txt(k), ink: filled(k), fill: filled(k), day: dayOf(k) }))
      return { type: 'month', heads, weeks: Math.round(cells / 7), events: evs, marked }
    }
    const kids = [...el.children].filter((k) => getComputedStyle(k).display !== 'none')
    // stat cards: 3+ same-size cards in a row, each with one big number
    const big = (k) => [...k.querySelectorAll('*')].find((g) => parseFloat(getComputedStyle(g).fontSize) >= 22 && /\d/.test(txt(g)) && !g.children.length)
    if (kids.length >= 3 && kids.every((k) => big(k) && txt(k).length <= 48)) {
      const ys = kids.map((k) => Math.round(k.getBoundingClientRect().y))
      if (Math.max(...ys) - Math.min(...ys) <= 8) return { type: 'stats', cards: kids.map((k) => ({ label: txt(k).replace(txt(big(k)), '|').split('|')[0].trim(), value: txt(big(k)), rest: txt(k).split(txt(big(k)))[1]?.trim() ?? '' })) }
    }
    // bar chart: 4+ textless filled blocks side by side on one baseline, different heights
    const bars = [...el.querySelectorAll('*')].filter((k) => !txt(k) && !k.children.length && filled(k) && k.getBoundingClientRect().height >= 8)
    if (bars.length >= 4) {
      const r = bars.map((k) => k.getBoundingClientRect())
      const base = r.map((b) => Math.round(b.bottom)), hs = r.map((b) => Math.round(b.height))
      if (Math.max(...base) - Math.min(...base) <= 2 && new Set(hs).size >= 3 && r.every((b) => b.width < b.height * 2.5)) {
        const title = kids.map(txt).find((t) => t && t.length <= 40)
        return { type: 'bars', count: bars.length, colour: filled(bars[0]), title, rising: hs[hs.length - 1] > hs[0], heights: hs.map((h) => Math.round(h / Math.max(...hs) * 100)) }
      }
    }
    // chat bubbles: rounded filled boxes, some hugging the left, some the right
    const box = el.getBoundingClientRect()
    const bubbles = kids.filter((k) => txt(k) && (filled(k) || parseFloat(getComputedStyle(k).borderTopWidth) >= 1) && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= 10)
    if (bubbles.length >= 3 && bubbles.length === kids.length) {
      const side = (k) => { const b = k.getBoundingClientRect(); return b.left - box.left < box.right - b.right ? 'left' : 'right' }
      const sides = bubbles.map(side)
      if (sides.includes('left') && sides.includes('right') && bubbles.every((k) => k.getBoundingClientRect().width < box.width * 0.8)) {
        return { type: 'bubbles', items: bubbles.map((k) => ({ side: side(k), text: txt(k), fill: filled(k), ink: rgba(getComputedStyle(k).color) })) }
      }
    }
    // cards or a list: repeated items, with a heading above them and tags inside
    const rep = repeats(el)
    const cardKids = kids.filter((k) => filled(k) && txt(k))
    const headKid = kids.find((k) => !filled(k) && /^H\d$/.test(k.tagName))
    if (headKid && cardKids.length >= 1 && cardKids.length === kids.length - 1) {
      return { type: 'cards', head: txt(headKid), items: cardKids.map((k) => ({ text: txt(k), tags: chips(k) })) }
    }
    if (rep.length >= 3) {
      // the highlighted item: the one whose fill differs from all the others
      const key = (k) => { const c = filled(k); return c ? `${c.r},${c.g},${c.b}` : 'none' }
      const odd = rep.filter((k) => rep.filter((j) => key(j) === key(k)).length === 1)
      const on = odd.length === 1 && rep.length >= 3 ? [...odd[0].childNodes].map((n) => (n.textContent || '').trim()).find(Boolean) : null
      // a heading or a lead line beside the list ('Showing 1-7 of 48')
      const head = kids.find((k) => !rep.includes(k) && !rep.some((r) => k.contains(r)) && txt(k) && txt(k).length <= 40)
      return { type: 'list', head: head ? txt(head) : null, items: rep.map((k) => [...k.childNodes].map((n) => (n.textContent || '').trim()).filter(Boolean)), on }
    }
    return null
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
  ['lime', 132, 204, 22], ['pale yellow', 254, 249, 215], ['indigo', 79, 70, 229], ['off-white', 244, 244, 245],
]
const NEUTRAL = new Set(['black', 'near-black', 'white', 'off-white', 'light grey', 'grey', 'dark grey'])
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
  c = parse(c); if (!c || c.a <= 0.05) return null
  // a grey is named among greys: weighted distance alone calls light grey "cream"
  const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
  let best = null, bd = Infinity
  for (const [n, r, g, b] of NAMED) {
    if (chroma <= 6 && !NEUTRAL.has(n)) continue
    const d = (c.r - r) ** 2 * 0.3 + (c.g - g) ** 2 * 0.59 + (c.b - b) ** 2 * 0.11
    if (d < bd) { bd = d; best = n }
  }
  return best
}
const dist = (a, b) => (a && b ? Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) : 999)
const visible = (c) => c && c.a > 0.05
const isSerif = (fam) => /serif/i.test(fam) && !/sans-serif/i.test(fam) || /georgia|times|garamond|playfair|didot|bodoni/i.test(fam)
const isMono = (fam) => /mono|courier|consolas/i.test(fam)
// cut-short copy puts its ellipsis OUTSIDE the quotes ("Looks great. Can we"…), so it
// never reads as a literal placeholder ellipsis ("Write a message…")
const quote = (s, n = 48) => (s.length > n ? `"${s.slice(0, n).replace(/\s+\S*$/, '')}"…` : `"${s}"`)
const uniq = (xs) => [...new Set(xs.filter(Boolean))]

function gradientWords(f) {
  if (!/gradient/.test(f.bgImage)) return null
  const names = uniq(f.bgImageColours.map((c) => (parse(c)?.a ?? 1) < 0.3 ? null : colourName(c)))
  if (/linear-gradient\([^)]*1px/.test(f.bgImage) || /background-size/.test(f.bgImage)) return null
  if (names.length < 2) return null
  // hard colour stops (a b 20%, b 20% 40%) are stripes, not a blend
  const hard = (f.bgImage.match(/\d+%\s*,\s*rgb[^)]+\)\s+\d+%/g) || []).length >= 2 || /\)\s+\d+%\s+\d+%/.test(f.bgImage)
  return hard ? `${names.join(', ')} stripes` : `${names.join(' to ')} gradient`
}
/** Look words any block can carry: tilt, blur, glass, bleeding off the page. */
function effectWords(f) {
  const w = []
  const turn = Math.abs(f.rotate)
  // a vertical label is often flipped 180deg to read bottom-up: that's not a tilt
  if (f.vertical) w.push('vertical')
  else if (turn >= 3 && turn <= 60) w.push('tilted')
  else if (turn > 60 && turn < 170) w.push('diagonal')
  if (f.motion) w.push(f.motion === 'scrolling' && f.bleeds ? 'scrolling marquee' : f.motion)
  if (f.blend) w.push('colour-inverting where it crosses what is under it')
  if (f.blur >= 10) w.push('soft blurred')
  if (f.backdrop || (f.bg && f.bg.a > 0.03 && f.bg.a < 0.4)) w.push('frosted glass')
  if (f.bleeds) w.push('bleeding off the page edge')
  return w
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
  if (f.stroke >= 1 && (!f.colour || f.colour.a <= 0.05)) w.push(`hollow outlined ${colourName(f.strokeColour) ?? ''}`.trim())
  return w
}

/** A chip's colour word: its ink when the fill is pale (green text on mint), else its fill. */
const chipColour = (c) => {
  const pale = c.fill && c.fill.r + c.fill.g + c.fill.b > 600
  const n = colourName(pale ? c.ink : c.fill)
  return n === 'deep green' ? 'green' : n
}
const chipList = (cs, n = 4) => {
  const seen = new Map()
  for (const c of cs) if (!seen.has(c.text)) seen.set(c.text, chipColour(c))
  return [...seen].slice(0, n).map(([t, col]) => `${col ? `${col} ` : ''}${quote(t, 18)}`).join(', ')
}
const short = (t, n = 28) => quote(t, n)

/** Dense app UI -> words that carry its structure (columns, rows, weeks, bars, sides). */
function denseNote(d) {
  if (!d) return null
  switch (d.type) {
    case 'table': return `table, columns ${d.columns.map((t) => quote(t, 16)).join(', ')}, ${d.rows} rows${d.chips.length ? `; status pills ${chipList(d.chips)}` : ''}`
    case 'month': {
      // with days when known: blue "Standup" on 2, 9, 16, 23 (where events sit is the calendar's content)
      const byText = new Map()
      for (const e of d.events) { if (!byText.has(e.text)) byText.set(e.text, { e, days: [] }); if (e.day) byText.get(e.text).days.push(e.day) }
      const ev = d.events.some((e) => e.day)
        ? [...byText.values()].slice(0, 6).map(({ e, days }) => `${chipColour(e) ? chipColour(e) + ' ' : ''}${quote(e.text, 18)}${days.length ? ` on ${days.join(', ')}` : ''}`).join(', ')
        : chipList(d.events, 5)
      return `month calendar grid, ${d.heads.length ? `${d.heads[0]} to ${d.heads[d.heads.length - 1]} across, ` : ''}${d.weeks} weeks of day boxes${ev ? `; event chips ${ev}` : ''}${d.marked.length === 1 ? `; day ${d.marked[0]} highlighted` : ''}`
    }
    case 'stats': return `${d.cards.length} stat cards in a row: ${d.cards.map((c) => `${quote(c.label, 16)} ${c.value}${c.rest ? ` ${c.rest}` : ''}`).join(', ')}`
    case 'bars': return `bar chart${d.title ? ` ${quote(d.title, 32)}` : ''}, ${d.count} ${colourName(d.colour) ?? ''} bars${d.heights ? `, heights ${d.heights.join('/')}% of the tallest` : ''}`.replace(/\s+/g, ' ')
    case 'bubbles': return `chat bubbles: ${d.items.slice(0, 4).map((b) => `${b.side} ${colourName(b.fill) ?? ''} ${short(b.text, 40)}`.replace(/\s+/g, ' ')).join(', ')}${d.items.length > 4 ? `, ${d.items.length - 4} more` : ''}`
    case 'cards': return `column ${quote(d.head, 20)}, cards: ${d.items.slice(0, 3).map((c) => `${short(c.text.replace(c.tags.map((t) => t.text).join(' '), '').trim(), 26)}${c.tags.length ? ` tag ${chipList(c.tags, 1)}` : ''}`).join(', ')}${d.items.length > 3 ? `, ${d.items.length - 3} more` : ''}`
    case 'list': if (d.items.every((p) => p.length === 1 && p[0].length <= 6) && d.items.filter((p) => /^\d+$/.test(p[0])).length >= 2) return `${d.head ? `${quote(d.head, 24)}, ` : ''}page numbers ${d.items.map((p) => quote(p[0])).join(', ')}${d.on ? `, ${quote(d.on)} highlighted` : ''}`
      return `${d.head ? `${quote(d.head, 20)} ` : ''}list: ${d.items.slice(0, 4).map((parts) => parts.length >= 2 && parts[1].length <= 14 ? `${quote(parts[0], 20)} ${parts[1]}` : quote(parts[0], 20)).join(', ')}${d.items.length > 4 ? `, ${d.items.length - 4} more` : ''}${d.on ? `; ${quote(d.on.split(' ').slice(0, 3).join(' '), 20)} highlighted` : ''}`
  }
  return null
}

/** One region -> {kind, note} (kind null = don't draw). */
function decide(f, page, marked, said = new Set()) {
  const d = decideOne(f, page, marked, said)
  // a marked button with unmarked buttons beside it in the row: the note names the whole row, in order
  if (d.kind === 'button' && f.rowMates && d.note) {
    const all = [...f.rowMates.before, f.text, ...f.rowMates.after]
    all.forEach((t) => said.add(t))
    const look = d.note.replace(/\bbutton\s+".*$/, '').trim()
    return { ...d, note: `${look ? look + ' ' : ''}buttons in a row: ${all.map((t) => quote(t)).join(', ')}` }
  }
  return d
}

function decideOne(f, page, marked, said) {
  const { w, h } = f.rect
  const fill = visible(f.bg) && dist(f.bg, page.bg ?? { r: 255, g: 255, b: 255 }) > 6
  const grad = gradientWords(f)
  const bordered = f.border.w >= 1 && visible(f.border.colour)
  const ruled = !bordered && f.border.bottom >= 2
  const round = f.radiusPct >= 40 || f.radius >= Math.min(w, h) / 2 - 1
  const square = Math.abs(w - h) <= 0.15 * Math.max(w, h)
  const short = f.text.length > 0 && f.text.length <= 32
  // a glow is a wide blur; a hard shadow is an offset with no blur (the 4th length, spread, doesn't count)
  const glow = f.shadows.some((x) => !x.clear && x.blur >= 10)
  const hardShadow = f.shadows.some((x) => !x.clear && x.blur <= 1 && (Math.abs(x.x) >= 2 || Math.abs(x.y) >= 2))
  const look = []
  const textCol = f.colour && f.colour.a > 0.05 && dist(f.colour, page.colour) > 60 ? colourName(f.colour) : null
  const fx = effectWords(f)
  const withFx = (note) => { const t = uniq([...fx, note]).join(' ').trim(); return t || null }
  const frosted = fx.includes('frosted glass')

  if (f.hasImg && f.text.length < 4) return { kind: 'image', note: withFx(null) }
  // dense app UI: say the structure (columns and rows, weeks, bars, sides) since a box shows none of it
  // (a plain list is only said when nothing else names the block: see the box branch)
  // and only when its parts aren't drawn as marks of their own (stat cards each marked)
  const dn = f.dense?.type === 'list' || f.regionKids.some((r) => marked.has(r)) ? null : denseNote(f.dense)
  if (dn) {
    const bgName = fill ? colourName(f.bg) : null
    const col = bgName && !(/light grey|white/.test(bgName) && dist(f.bg, page.bg) < 30) ? bgName : null
    const what = f.tag === 'aside' ? 'sidebar' : null
    return { kind: 'box', note: withFx(`${uniq([col, what]).join(' ')}${col || what ? ', ' : ''}${dn}`) }
  }
  // a textless filled block with no parts inside is a picture placeholder
  if (!f.text && (fill || grad) && !f.regionKids.length && !round && w >= 60 && h >= 50) {
    const stripes = grad && /stripes/.test(grad) ? grad : null
    // a coloured block is part of the look (a dark half, a gradient photo, a mountain cut-out); a pale one is just a picture
    const col = grad ?? (fill && !/light grey|off-white|white/.test(colourName(f.bg)) ? colourName(f.bg) : null)
    const shape = f.clipPoints >= 6 ? 'jagged cut-out shape' : f.clipPoints >= 3 ? 'angled cut-out shape' : null
    const note = stripes ? `big ${stripes} block` : shape ? `${col ?? ''} ${shape}`.trim() : col ? `${col} block` : null
    return { kind: 'image', note: withFx(note) }
  }
  // a toggle row: a label and a switch
  if (f.toggle && f.text && f.text.length <= 90 && h <= 110 && !f.regionKids.length) {
    const on = f.toggle && dist(f.toggle, { r: 203, g: 213, b: 225 }) > 40 && colourName(f.toggle) !== 'light grey'
    return { kind: 'text', note: `toggle ${on ? 'on' : 'off'} ${quote(f.kidTexts[0] ?? f.text, 40)}` }
  }
  // a row of label + box fields
  if (f.fieldKids.length >= 2 && f.fieldKids.length === f.kidCount) return { kind: 'box', note: `fields side by side: ${f.fieldKids.map((t) => quote(t, 24)).join(', ')}` }
  // a picture card: a picture placeholder with a caption under it
  if (f.pictureKid && f.text && f.text.length <= 80 && !f.regionKids.length && !f.hasImg) return { kind: 'image', note: `picture with ${quote(f.text, 40)}` }
  // a label kid over an empty box: say it is a label above the box, not the box's placeholder
  if (f.fieldKid && f.kidCount <= 3) return { kind: 'box', note: f.kidTexts[0] ? `label ${quote(f.kidTexts[0])} above an empty field` : `field ${quote(f.role)}` }
  // an input: bordered, left-aligned short text (placeholder)
  const placeholder = /…$|\.\.\.$|^search\b/i.test(f.text)
  if (bordered && !placeholder && f.kidCount === 0 && f.text && f.text.length <= 24 && h <= 60 && w <= 260) {
    if (/[▾▼]$/.test(f.text)) return { kind: 'button', note: `dropdown ${quote(f.text.replace(/\s*[▾▼]$/, ''))}` }
    if (fill && dist(f.bg, page.bg) >= 12 && f.radius < h / 2 - 2) return { kind: 'button', note: `${colourName(f.bg)}${textCol ? ` ${textCol} text` : ''} button ${quote(f.text)}` }
    if (!fill || dist(f.bg, page.bg) < 12) return { kind: 'button', note: `${colourName(f.border.colour) === 'light grey' ? '' : `${colourName(f.border.colour)} `}outline ${f.radius >= h / 2 - 2 ? 'pill ' : ''}button ${quote(f.text)}`.trim() }
  }
  if (bordered && (!fill || placeholder) && f.text.length <= 40 && !f.centred && h <= 70 && f.kidCount === 0 && f.tag !== 'a' && f.tag !== 'button') {
    const label = f.labelAbove ? (said.add(f.labelAbove), `label ${quote(f.labelAbove)} above, `) : ''
    return { kind: 'box', note: `${label}${f.radius >= h / 2 - 2 ? 'pill ' : ''}${/^search|search/i.test(f.text) ? 'search ' : ''}input ${quote(f.text)}` }
  }
  if (round && square && f.text.length <= 24 && (fill || grad || bordered)) {
    const glowy = glow || /radial/.test(f.bgImage)
    const words = f.text ? ` with ${quote(f.text)}` : ''
    const paint = grad ? grad.replace(' gradient', '') : fill ? colourName(f.bg) : `${colourName(f.border.colour)} outline`
    return { kind: 'circle', note: withFx(`${f.text ? '' : 'big '}${glowy ? 'glowing ' : ''}${paint} circle${words}`) }
  }
  // a row of buttons
  if (f.kidButtons >= 2 && f.kidButtons === f.kidCount && h <= 120 && !f.regionKids.length) {
    // a row of controls: a placeholder is an input, 'Role: All' or '▾' is a dropdown, the rest are buttons
    const ctl = (t) => /…$|\.\.\.$|^search\b/i.test(t) ? `input ${quote(t)}` : /▾|▼|:\s*\S/.test(t) ? `dropdown ${quote(t.replace(/\s*[▾▼]$/, ''))}` : `button ${quote(t)}`
    const items = f.kidTexts.map(ctl)
    return { kind: 'box', note: items.every((t) => t.startsWith('button')) ? `buttons: ${f.kidTexts.map((t) => quote(t)).join(', ')}` : items.join(', ') }
  }
  // wide is fine for a filled, centred one-line label (a full-width pay button)
  const buttonish = (/^(a|button)$/.test(f.tag) || ((fill || bordered || grad) && f.centred)) && short && h <= 90 && f.kidCount <= 1 && (w <= 420 || (fill && f.centred && h <= 70))
  if (buttonish) {
    if (grad) look.push(grad)
    else if (fill) look.push(colourName(f.bg))
    else if (bordered) look.push(`${colourName(f.border.colour)} outline`)
    if (f.radius >= h / 2 - 2) look.push('pill')
    if (glow) look.push('glowing'); if (hardShadow) look.push('hard offset shadow')
    if (w > 420) look.push('full-width')
    if (textCol && fill) look.push(`${textCol} text`)
    const kind = f.kidCount === 0 || f.tag === 'a' || f.tag === 'button' || fill || bordered ? 'button' : 'text'
    return { kind, note: `${uniq(look).join(' ')} button ${quote(f.text)}`.replace(/\s+/g, ' ').trim() }
  }
  if (f.regionKids.length && f.regionKids.every((r) => marked.has(r)) && !fill && !bordered && !grad && !frosted) {
    // its parts are drawn, but text of its own (a card title, a caption) still needs saying
    // (text already said by a part's note, a field label or a heading's sub-line, isn't said twice)
    const loose = f.looseTexts.filter((t) => !said.has(t))
    const own = loose.find((t) => t.length >= 4)
    return { kind: null, note: own && loose.join(' ').length <= 140 ? `${quote(own, 40)}${loose.length > 1 ? ' and text' : ''}` : null }
  }
  if (/^h[1-3]$/.test(f.tag) || f.font.size >= 30) {
    const tw = typeWords(f, page)
    if (f.clipText && grad) tw.push(`${grad} text`); else if (textCol) tw.push(textCol)
    if (fill && !f.clipText && w > 300) tw.push(`on a ${colourName(f.bg)} band`)
    const under = f.lineUnder ? (said.add(f.lineUnder), `, line under: ${quote(f.lineUnder, 60)}`) : ''
    return { kind: 'heading', note: withFx(`${tw.join(' ')} ${quote(f.text, 60)}${under}`.trim()) }
  }
  // a row of short items (nav links, tabs)
  if (f.kidCount >= 3 && f.kidTexts.length >= 3 && f.kidTexts.every((t) => t.length <= 16) && h <= 80 && !f.regionKids.length) {
    return { kind: fill || bordered ? 'box' : 'text', note: `links: ${f.kidTexts.slice(0, 6).join(', ')}` }
  }
  if (fill || grad || bordered || ruled || /^(nav|header|aside|table|input|textarea|form)$/.test(f.tag) || f.regionKids.length) {
    look.push(...fx)
    if (grad) look.push(grad); else if (fill && !frosted) look.push(colourName(f.bg))
    const bc = bordered ? colourName(f.border.colour) : null
    if (fill && /light grey|white/.test(colourName(f.bg)) && dist(f.bg, page.bg) < 30) look.pop() // a faint card: the box shows it
    if (bordered && f.border.w >= 3) look.push(`thick ${bc} border`)
    else if (bordered && !fill && !/grey|white/.test(bc)) look.push(`${bc} border`)
    if (hardShadow) look.push('hard offset shadow')
    if (ruled) look.push('thick rule under')
    const what = f.tag === 'table' ? 'table' : f.tag === 'nav' ? 'nav bar' : f.tag === 'aside' ? 'sidebar' : null
    // only say it when there is something a box can't show
    const say = uniq([...look, what]).join(' ')
    const head = f.kidTexts[0] && f.kidTexts[0].length <= 40 ? f.kidTexts[0] : null
    const list = f.dense?.type === 'list' && !f.regionKids.length ? denseNote(f.dense) : null
    const copy = f.text && f.text.length <= 40 && !f.regionKids.length ? quote(f.text) : list ? list : head && !f.regionKids.length ? `${quote(head)} and text` : ''
    return { kind: 'box', note: say || copy ? `${say} ${copy}`.trim() : null }
  }
  if (f.pager && !f.regionKids.length) {
    const p = f.pager
    const items = p.items.map((t) => quote(t) + (t === p.current ? ' current' : '')).join(', ')
    return { kind: 'text', note: `pager${p.caption ? ` ${quote(p.caption, 40)} left,` : ''} page buttons ${items}` }
  }
  if (f.text) {
    // short text says its copy when it is display-sized or styled apart (a coloured mono date, a brown logo)
    const styled = uniq([...typeWords(f, page), NEUTRAL.has(textCol) ? null : textCol, ...fx])
    // ...or when it is a bold standalone label (a thread title, a panel header): copy no mark can carry
    const say = f.text.length <= 40 && (f.font.size >= 18 || styled.length || (f.font.weight >= 600 && f.kidCount === 0))
    return { kind: 'text', note: say ? `${styled.join(' ')} ${quote(f.text)}`.trim() : null }
  }
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
  await page.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0 }))
  const { body, regions } = await page.evaluate(factsInPage)
  await page.close()
  body.bg = visible(body.bg) ? body.bg : { r: 255, g: 255, b: 255, a: 1 }
  // decide leaves first, so a container knows whether its parts got marks
  const marked = new Set()
  const said = new Set()
  const out = new Map()
  const depthFirst = [...regions].sort((a, b) => a.regionKids.length - b.regionKids.length)
  for (const f of depthFirst) {
    const d = decide(f, body, marked, said)
    if (d.kind) marked.add(f.role)
    out.set(f.role, d)
  }
  // layering: a drawn block painted after a heading and covering part of it sits in front of it (a ridge over a word)
  regions.forEach((f, i) => {
    const d = out.get(f.role)
    if (!d.kind || d.kind === 'heading') return
    const under = regions.slice(0, i).find((g) => {
      if (out.get(g.role).kind !== 'heading' || g.regionKids.includes(f.role) || f.regionKids.includes(g.role)) return false
      const A = f.rect, B = g.rect
      const ow = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oh = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)
      return ow > 0 && oh > 0 && ow * oh > 0.15 * B.w * B.h
    })
    if (under) d.note = `${d.note ? `${d.note}, ` : ''}in front of the ${quote(under.text, 24)} heading`
  })
  const plan = regions.filter((f) => out.get(f.role).kind).map((f) => [f.role, out.get(f.role).kind])
  const notes = [...(pageNote(body) ? [['*', pageNote(body)]] : []), ...regions.filter((f) => out.get(f.role).note).map((f) => [f.role, out.get(f.role).note])]
  return { plan, notes }
}

export const wordCount = (notes) => notes.reduce((s, [, t]) => s + t.split(/\s+/).filter(Boolean).length, 0)
