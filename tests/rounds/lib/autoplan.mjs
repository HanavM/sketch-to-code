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
export function factsInPage() {
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
    let r = el.getBoundingClientRect()
    // a wrapper of only absolutely placed parts collapses to 0px (round 15-17: circles, glass cards, an offset
    // title measured 1280x0, so the sketch drew them as a flat line): read the box round what it shows instead
    if (r.width < 4 || r.height < 4) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const d of el.querySelectorAll('*')) {
        const b = d.getBoundingClientRect(), ds = getComputedStyle(d)
        if (b.width < 1 || b.height < 1 || ds.visibility === 'hidden' || ds.display === 'none') continue
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom)
      }
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(innerWidth, x1); y1 = Math.min(innerHeight, y1)
      if (x1 > x0 && y1 > y0) r = { x: x0, y: y0, width: x1 - x0, height: y1 - y0, left: x0, top: y0, right: x1, bottom: y1 }
    }
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
      // how many lines the text sets in (distinct line tops of its text): a giant one-word
      // heading is drawn as one tall zigzag, a two-line one as two stacked squiggles
      textLines: (() => {
        const rg = document.createRange(); rg.selectNodeContents(el)
        const tops = [...rg.getClientRects()].filter((q) => q.width > 1 && q.height > 1).map((q) => q.top).sort((a, b) => a - b)
        const fs = parseFloat(cs.fontSize) || 16
        return tops.reduce((n, t, i) => (i === 0 || t - tops[i - 1] > fs * 0.5 ? n + 1 : n), 0)
      })(),
      font: { size: parseFloat(cs.fontSize), family: cs.fontFamily, weight: Number(cs.fontWeight) || 400, style: cs.fontStyle, transform: cs.textTransform, spacing: parseFloat(cs.letterSpacing) || 0, lineHeight: parseFloat(cs.lineHeight) || 0 },
      colour: rgba(cs.color),
      // n176: a block floated inside running text (round 17 c4 orb: float right + shape-outside circle, built absolutely
      // placed over the paragraph)
      floatIn: cs.float !== 'none' && el.parentElement && (el.parentElement.innerText || '').trim().length > 80 ? { side: cs.float, shape: cs.shapeOutside !== 'none' ? cs.shapeOutside : null, m: ['Top', 'Right', 'Bottom', 'Left'].map((d) => Math.round(parseFloat(cs[`margin${d}`]) || 0)) } : null,
      bg: rgba(cs.backgroundColor),
      bgImage: cs.backgroundImage,
      bgImageColours: colours(cs.backgroundImage),
      // n167: a ::before layer painting more stripes over the background (round 16 e2: the day-column rules lost)
      beforeImage: (() => { const b = getComputedStyle(el, '::before'); return b.content !== 'none' && /^repeating-linear-gradient/.test(b.backgroundImage) ? b.backgroundImage : null })(),
      // n168: an empty bordered overlay drawn over a grid (round 16 e1: a spreadsheet's selected range said as "blue border",
      // built running down to row 12); its place, size, border and the cells it covers, plus a ::after handle square
      selBox: (() => {
        if (cs.position !== 'absolute' || el.children.length || (el.innerText || '').trim()) return null
        const bw = parseFloat(cs.borderTopWidth) || 0, bc = rgba(cs.borderTopColor)
        if (bw < 1 || !(bc?.a > 0.5) || rgba(cs.backgroundColor)?.a > 0.3 || r.width < 30 || r.height < 30) return null
        const cells = [...document.querySelectorAll('td, th')].filter((c) => { const b = c.getBoundingClientRect(); return b.left >= r.left - 3 && b.right <= r.right + 3 && b.top >= r.top - 3 && b.bottom <= r.bottom + 3 })
        if (!cells.length) return null
        const rowsOf = [...new Set(cells.map((c) => c.parentElement))], tr0 = rowsOf[0], trN = rowsOf[rowsOf.length - 1]
        const num = (tr) => (tr.cells[0]?.innerText || '').trim()
        const head = [...(tr0.closest('table')?.rows[0]?.cells ?? [])].map((c) => (c.innerText || '').trim())
        const cols = [...new Set(cells.map((c) => head[c.cellIndex] ?? ''))].filter(Boolean)
        const a = getComputedStyle(el, '::after'), aw = parseFloat(a.width)
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bw: Math.round(bw), bc,
          rows: [num(tr0), num(trN)], nRows: rowsOf.length, cols, handle: a.content !== 'none' && aw >= 4 && aw <= 14 ? { px: Math.round(aw), fill: rgba(a.backgroundColor) } : null }
      })(),
      clipText: /^text(,\s*text)*$/.test(cs.webkitBackgroundClip || cs.backgroundClip)  /* n154: layered backgrounds read 'text, text, text' */,
      border: { w: parseFloat(cs.borderTopWidth) || 0, colour: rgba(cs.borderTopColor), bottom: parseFloat(cs.borderBottomWidth) || 0, bottomColour: rgba(cs.borderBottomColor), left: parseFloat(cs.borderLeftWidth) || 0, leftColour: rgba(cs.borderLeftColor), topStyle: cs.borderTopStyle, bottomStyle: cs.borderBottomStyle, leftStyle: cs.borderLeftStyle },
      radius: parseFloat(cs.borderTopLeftRadius) || 0,
      radiusPct: cs.borderTopLeftRadius.includes('%') ? parseFloat(cs.borderTopLeftRadius) : null,
      // n147: all four corners (a leaf: three round, one square; round 12 c5 built a circle) and the background tile size
      // (a halftone dot screen: round 12 c5 built a plain gradient)
      radii: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
      bgSize: cs.backgroundSize,
      bgBlend: cs.mixBlendMode,
      // an arch: round top corners, square bottom ones (round 4 c1 arch said as a circle, built as a ball)
      radiusBottom: parseFloat(cs.borderBottomLeftRadius) || 0,
      // its vertical part: '50% 0%' is a flat bottom under an elliptical top (a cinema screen arc)
      radiusBottomFlat: /^\S+\s+0(px|%)?$/.test(cs.borderBottomLeftRadius.trim()),
      shadow: cs.boxShadow,
      centred: cs.textAlign === 'center' || cs.justifyContent === 'center',
      inset: { t: parseFloat(cs.paddingTop) || 0, l: parseFloat(cs.paddingLeft) || 0 },
      // where its text starts (a lone quote in the top of a tall cell vs set low)
      textTop: (() => { const g = document.createRange(); g.selectNodeContents(el); const rs = [...g.getClientRects()].filter((x) => x.height > 0); return rs.length ? Math.min(...rs.map((x) => x.top)) : null })(),
      // a form field: a label plus an empty bordered box, or an input-like box with left text
      fieldKid: kids.some((k) => { const c = getComputedStyle(k); return !(k.innerText || '').trim() && parseFloat(c.borderTopWidth) >= 1 && k.getBoundingClientRect().height >= 30 }),
      kidButtons: kids.filter((k) => { const c = getComputedStyle(k); const t = (k.innerText || '').trim(); return t && t.length <= 32 && (rgba(c.backgroundColor)?.a > 0.05 || parseFloat(c.borderTopWidth) >= 1) }).length,
      hasImg: !!el.querySelector('img,svg,picture,video,canvas') || /url\(/.test(cs.backgroundImage),
      // text of children that are not regions and hold none (a card title beside a marked picture)
      looseTexts: kids.filter((k) => !k.dataset?.r && !k.querySelector('[data-r]')).map((k) => (k.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
      // loose text beside a drawn part (a post's title, blurb and date right of its picture): which side, and its lines
      // (round 1 e3: the whole text block was one cut quote, built under the picture with invented copy)
      looseBeside: (() => {
        const part = el.querySelector('[data-r]')
        const loose = kids.filter((k) => !k.dataset?.r && !k.querySelector('[data-r]') && (k.innerText || '').trim())
        if (!part || loose.length !== 1) return null
        const a = part.getBoundingClientRect(), b = loose[0].getBoundingClientRect()
        const side = b.left >= a.right - 4 ? 'right of' : b.right <= a.left + 4 ? 'left of' : b.top >= a.bottom - 4 ? 'under' : null
        const lines = [...loose[0].children].map((k) => (k.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
        return side && lines.length >= 2 && lines.length <= 4 ? { side, lines, small: [...loose[0].children].map((k) => parseFloat(getComputedStyle(k).fontSize)) } : null
      })(),
      // unmarked text right beside this block: a label just above a field, a sub-line just under a heading.
      // No mark carries it, so the block's own note must, or the build drops or rewrites it.
      labelAbove: near(el, el.previousElementSibling, 'above'),
      // n137: a card's heading broken into lines with one line in its own colour (round 10 c4 'Form follows / fun.',
      // the red second line never said)
      headLines: (() => {
        const k = [...el.children].find((q) => !q.dataset?.r && (q.innerText || '').trim()); if (!k || !k.querySelector('br') || parseFloat(getComputedStyle(k).fontSize) < 28) return null
        const base = rgba(getComputedStyle(k).color), lines = [{ t: '', c: null }]
        k.childNodes.forEach((n) => { if (n.nodeName === 'BR') { lines.push({ t: '', c: null }); return } const t = n.textContent; const L = lines[lines.length - 1]; L.t += t; if (n.nodeType === 1 && t.trim()) L.c = rgba(getComputedStyle(n).color) })
        const out = lines.map((l) => ({ t: l.t.replace(/\s+/g, ' ').trim(), c: l.c ?? base })).filter((l) => l.t)
        const cs2 = getComputedStyle(k)
        return out.length >= 2 && out.length <= 4 ? { lines: out, base, px: Math.round(parseFloat(cs2.fontSize)), w: Number(cs2.fontWeight) } : null
      })(),
      // n137: the label's own look (round 10 c2 '01 /' mono labels over each giant word were dropped)
      labelAboveStyle: (() => { const sb = el.previousElementSibling; if (!near(el, sb, 'above')) return null; const c = getComputedStyle(sb), b = sb.getBoundingClientRect(); return { px: Math.round(parseFloat(c.fontSize)), family: c.fontFamily, colour: rgba(c.color), ls: parseFloat(c.letterSpacing) || 0, gap: Math.round(r.top - b.bottom), x: Math.round(b.left), y: Math.round(b.top) } })(),
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
        // the caption may be the pager's own text node (round 7 e5 'Showing 1–10 of 128': dropped)
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(' ')
        const box = leaves.find((k) => /^\d+$/.test((k.innerText || '').trim()))?.getBoundingClientRect()
        const curEl = leaves.find((k) => /^\d+$/.test((k.innerText || '').trim()) && rgba(getComputedStyle(k).backgroundColor)?.a > 0.05 && rgba(getComputedStyle(k).backgroundColor).r + rgba(getComputedStyle(k).backgroundColor).g + rgba(getComputedStyle(k).backgroundColor).b < 600)
        return { items: items.filter((i) => i.t.length <= 8).map((i) => i.t), current: (curEl ? (curEl.innerText || '').trim() : null) ?? items.find((i) => i.on && /^\d+$/.test(i.t))?.t ?? null, caption: items.find((i) => i.t.length > 8)?.t ?? (own.length > 8 ? own : null), px: box ? Math.round(box.width) : null, curFill: curEl ? rgba(getComputedStyle(curEl).backgroundColor) : null, bordered: leaves.some((k) => parseFloat(getComputedStyle(k).borderTopWidth) >= 1) }
      })(),
      stroke: parseFloat(cs.webkitTextStrokeWidth) || 0,
      strokeColour: rgba(cs.webkitTextStrokeColor),
      // a perspective turn (rotateY/X under perspective) is a matrix3d: a flat 'tilted' builds a 2D rotate (round 4 c4)
      tilt3d: /matrix3d/.test(cs.transform),
      // n144: a code view (round 11 e1): rows of mono text, each led by its line number, said line by line in order with
      // its coloured words, so the build writes each line as one row (it placed each token at its own x,y and they collided)
      codeLines: (() => {
        const rows = [...el.children].filter((k) => k.tagName === 'DIV')
        if (rows.length < 5 || rows.length < 0.8 * el.children.length) return null
        if (!rows.every((k) => /mono|courier|consolas/i.test(getComputedStyle(k).fontFamily))) return null
        const nums = rows.map((k) => k.firstElementChild).filter((n) => n && /^\d+$/.test((n.textContent || '').trim()))
        if (nums.length < 0.9 * rows.length) return null
        const base = rgba(getComputedStyle(rows[0]).color), n0 = nums[0], ns = getComputedStyle(n0), r0 = rows[0].getBoundingClientRect()
        const lines = rows.map((k) => {
          const runs = []
          let text = ''
          for (const n of k.childNodes) {
            if (n === k.firstElementChild && /^\d+$/.test((n.textContent || '').trim())) continue
            const t = n.textContent
            text += t
            if (n.nodeType === 1 && t.trim()) { const c = rgba(getComputedStyle(n).color); if (c && Math.hypot(c.r - base.r, c.g - base.g, c.b - base.b) > 12) runs.push({ t: t.trim(), c }) }
          }
          const fill = rgba(getComputedStyle(k).backgroundColor)
          return { n: (k.firstElementChild?.textContent || '').trim(), text: text.replace(/\s+$/, ''), runs, fill: fill && fill.a > 0.05 ? fill : null }
        })
        const b = el.getBoundingClientRect()
        return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), top: Math.round(r0.top - b.top), rowH: Math.round(r0.height), left: Math.round(r0.left - b.left), px: Math.round(parseFloat(getComputedStyle(rows[0]).fontSize)), base, gutter: Math.round(n0.getBoundingClientRect().width), numInk: rgba(ns.color), numAlign: ns.textAlign, lines }
      })(),
      rotate: (() => { const m = cs.transform.match(/matrix\(([^,]+),\s*([^,]+)/); return m ? Math.round(Math.atan2(+m[2], +m[1]) * 180 / Math.PI) : 0 })(),
      blur: parseFloat((cs.filter.match(/blur\(([\d.]+)px/) || [])[1]) || 0,
      backdrop: /blur/.test(cs.backdropFilter || cs.webkitBackdropFilter || ''),
      // what moves, read off the keyframes of the block or anything inside it (a marquee's track)
      motion: (() => {
        const a = [el, ...el.querySelectorAll('*')].map((k) => getComputedStyle(k).animationName).find((n) => n && n !== 'none')
        if (!a) return null
        let kf = ''
        for (const sh of document.styleSheets) for (const r of sh.cssRules) if (r.type === 7 && r.name === a) kf = r.cssText
        // n178: a there-and-back loop (0%, 100% the same, 50% apart) bobs or wobbles, it does not scroll or spin
        // (round 18 c3 bobbing map pin said "scrolling", c2 wobbling sticker would be "spinning")
        const back = /0%,\s*100%\s*\{/.test(kf) && /\b50%\s*\{/.test(kf)
        if (back) return /translate/.test(kf) ? 'gently bobbing up and down' : /rotate/.test(kf) ? 'wobbling back and forth' : /scale/.test(kf) ? 'pulsing' : 'moving'
        return /rotate/.test(kf) ? 'spinning' : /translate/.test(kf) ? 'scrolling' : /scale/.test(kf) ? 'pulsing' : /opacity/.test(kf) ? 'fading' : 'moving'
      })(),
      vertical: /^vertical/.test(cs.writingMode),
      // n133: the vertical words' own extent in the box (round 9 c5 title built short and low)
      vSpan: /^vertical/.test(cs.writingMode) ? (() => { const rg = document.createRange(); rg.selectNodeContents(el); const q = [...rg.getClientRects()].filter((z) => z.width > 1 && z.height > 1); return q.length ? { top: Math.round(Math.min(...q.map((z) => z.top))), bottom: Math.round(Math.max(...q.map((z) => z.bottom))) } : null })() : null,
      // n133: a row with only a rule along its top and two ends spread apart (round 9 c5 byline built as a bordered box)
      topRule: parseFloat(cs.borderTopWidth) >= 1 && !parseFloat(cs.borderBottomWidth) && !parseFloat(cs.borderLeftWidth) && !parseFloat(cs.borderRightWidth) ? { px: parseFloat(cs.borderTopWidth), c: rgba(cs.borderTopColor), pad: Math.round(parseFloat(cs.paddingTop) || 0) } : null,
      spreadEnds: /flex/.test(cs.display) && cs.justifyContent === 'space-between',
      // n133: a small filled caption chip sitting ON a picture block (round 9 c5 'FIG. 1' built as a line under it)
      innerChip: (() => { const ks = [...el.children]; if (ks.length !== 1 || r.width < 200 || r.height < 200) return null; const k = ks[0], c = getComputedStyle(k), b = k.getBoundingClientRect(), t = (k.innerText || '').trim(), fl = rgba(c.backgroundColor); if (!t || t.length > 40 || !(fl?.a > 0.5) || b.width > r.width * 0.8) return null; return { t, x: Math.round(b.left - r.left), y: Math.round(b.top - r.top), w: Math.round(b.width), h: Math.round(b.height), px: Math.round(parseFloat(c.fontSize)), ink: rgba(c.color), fill: fl, spaced: (parseFloat(c.letterSpacing) || 0) >= 1.5, sans: !/serif/i.test(c.fontFamily) || /sans/i.test(c.fontFamily) } })(),
      // n136: a grid of many text-free shape tiles (round 10 c4: 48 Bauhaus tiles said as one plain box, built as nothing)
      tileGrid: (() => {
        if (!/grid/.test(cs.display) || kids.length < 12 || (el.innerText || '').trim() || el.querySelector('[data-r]') || parseFloat(cs.columnGap) > 0 || parseFloat(cs.rowGap) > 0) return null
        const o = el.getBoundingClientRect()
        const cols = cs.gridTemplateColumns.split(' ').length, rows = cs.gridTemplateRows.split(' ').length
        const tiles = kids.map((k) => {
          const c = getComputedStyle(k), b = k.getBoundingClientRect(), fl = rgba(c.backgroundColor)
          const rad = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((s) => c[`border${s}Radius`])
          const big = rad.map((v) => /%/.test(v) ? parseFloat(v) >= 50 : parseFloat(v) >= Math.min(b.width, b.height) / 2 - 1)
          const stripe = /repeating-linear-gradient/.test(c.backgroundImage) ? (() => { const cl = c.backgroundImage.match(/rgba?\([^)]+\)/); const px = [...c.backgroundImage.matchAll(/([\d.]+)px/g)].map((m) => Math.round(parseFloat(m[1]))); return { c: cl ? rgba(cl[0]) : null, band: px[1] ?? null, pitch: px[px.length - 1] ?? null } })() : null
          let kind = 'empty'
          const filled = fl?.a > 0.05
          if (stripe) kind = 'stripes'
          else if (filled && /polygon\(/.test(c.clipPath)) kind = 'triangle'
          else if (filled && big.every(Boolean)) kind = 'circle'
          else if (filled && big.filter(Boolean).length === 1) kind = 'quarter'
          else if (filled && big[0] && big[1] && !big[2] && !big[3]) kind = 'half'
          else if (filled) kind = 'square'
          const corner = ['top-left', 'top-right', 'bottom-right', 'bottom-left'][big.findIndex(Boolean)]
          return { kind, c: filled ? fl : stripe?.c, corner, stripe, x: Math.round(b.left - o.left), y: Math.round(b.top - o.top), w: Math.round(b.width), h: Math.round(b.height) }
        })
        if (tiles.filter((t) => t.kind !== 'empty').length < kids.length / 2 || o.width / cols < 80 || o.height / rows < 80) return null
        return { x: Math.round(o.left), y: Math.round(o.top), w: Math.round(o.width), h: Math.round(o.height), cols, rows, cellW: Math.round(o.width / cols), cellH: Math.round(o.height / rows), tiles }
      })(),
      // n139: short loose text (in no region) laid over a textless region (round 10 c1 star: 'JUN 12' dropped)
      textOver: (() => {
        if ((el.innerText || '').trim()) return null
        const L = [...document.body.querySelectorAll('*')].filter((k) => !k.closest('[data-r]') && !k.querySelector('[data-r]') && !k.children.length && (k.innerText || '').trim().length && (k.innerText || '').trim().length <= 24)
        const k = L.find((q) => { const b = q.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; return Math.abs(cx - (r.left + r.width / 2)) < r.width / 4 && Math.abs(cy - (r.top + r.height / 2)) < r.height / 4 })
        if (!k) return null
        const c = getComputedStyle(k)
        return { t: (k.innerText || '').replace(/\s+/g, ' ').trim(), px: Math.round(parseFloat(c.fontSize)), weight: Number(c.fontWeight) || 400, c: rgba(c.color), spins: c.animationName !== 'none' }
      })(),
      // n139: a vertical stepper: 3+ kids each led by a small round marker, a title and a sub-line, joined by
      // ::after connector lines (round 10 e5: done checks green, connectors lost)
      stepRail: (() => {
        const st = kids.map((k) => {
          const m = k.firstElementChild
          if (!m) return null
          const mc = getComputedStyle(m), mb = m.getBoundingClientRect(), kb = k.getBoundingClientRect()
          if (mb.width > 40 || mb.width < 12 || Math.abs(mb.width - mb.height) > 2 || parseFloat(mc.borderTopLeftRadius) < mb.width / 2 - 1) return null
          const rest = [...k.children].slice(1).map((q) => ({ t: (q.innerText || '').trim(), px: Math.round(parseFloat(getComputedStyle(q).fontSize)), w: Number(getComputedStyle(q).fontWeight) || 400, c: rgba(getComputedStyle(q).color) })).filter((q) => q.t)
          const a = getComputedStyle(k, '::after')
          const con = a.content && a.content !== 'none' && rgba(a.backgroundColor)?.a > 0.1 ? { c: rgba(a.backgroundColor), w: Math.round(parseFloat(a.width)), h: Math.round(parseFloat(a.height)) } : null
          return { left: mb.left - kb.left <= 10, kx: Math.round(kb.left), kr: Math.round(kb.right - mb.right), kt: Math.round(mb.top - kb.top), t: (m.innerText || '').trim(), d: Math.round(mb.width), fill: rgba(mc.backgroundColor), bc: rgba(mc.borderTopColor), bw: parseFloat(mc.borderTopWidth) || 0, ink: rgba(mc.color), x: Math.round(mb.left), y: Math.round(mb.top), rest, con, top: Math.round(kb.top) }
        })
        const ok = st.filter(Boolean)
        if (ok.length < 3 || !ok.every((q) => q.rest.length)) return null
        const column = ok.every((q, i) => !i || (Math.abs(q.kx - ok[0].kx) <= 4 && q.top > ok[i - 1].top))
        if (column && ok.every((q) => q.left)) return { radio: false, steps: ok }
        // n139: side-by-side option cards with a radio circle in a corner (round 10 e5 plan cards: circles lost)
        if (!column && ok.every((q) => !q.left)) return { radio: true, steps: ok }
        return null
      })(),
      // n136: stacked hard text-shadows (an extrusion) and a text stroke (round 10 c1: built as flat letters)
      textShadows: cs.textShadow === 'none' ? [] : cs.textShadow.split(/,(?![^(]*\))/).map((p) => { const c = p.match(/rgba?\([^)]+\)/)?.[0]; const n = p.replace(/rgba?\([^)]+\)/, '').trim().split(/\s+/).map(parseFloat); return { c: c ? rgba(c) : null, x: n[0] || 0, y: n[1] || 0, blur: n[2] || 0 } }),
      textStroke: parseFloat(cs.webkitTextStrokeWidth) > 0 ? { px: parseFloat(cs.webkitTextStrokeWidth), c: rgba(cs.webkitTextStrokeColor) } : null,
      // n136: a checkerboard of repeating conic squares (round 10 c1: read as a gradient, built a grey band)
      checker: /repeating-conic-gradient/.test(cs.backgroundImage) ? { cols: [...new Set([...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => m[0].replace(/\s/g, '')))].map((m) => rgba(m)), size: cs.backgroundSize, img: cs.backgroundImage } : null,
      // n136: a block cursor inside a glowing text line (round 10 c3: headline read as a picture)
      cursorKid: (() => { const k = [...el.children].find((q) => !(q.innerText || '').trim() && rgba(getComputedStyle(q).backgroundColor)?.a > 0.5); if (!k) return null; const c = getComputedStyle(k), b = k.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), c: rgba(c.backgroundColor), blink: c.animationName !== 'none' } })(),
      // n136: lines split by <br>, some ending in a filled chip (round 10 c3 log lines, built as invented paragraphs)
      chipLines: (() => {
        if (!el.querySelector('br') || el.querySelector('[data-r]')) return null
        const lines = el.innerHTML.split(/<br\s*\/?>/i).map((h) => { const d = document.createElement('div'); d.innerHTML = h; const b = d.querySelector('b,strong,span'); return { t: d.textContent.replace(/\s+/g, ' ').trim(), chip: b ? b.textContent.trim() : null } })
        const b0 = el.querySelector('b,strong'); const bc = b0 && getComputedStyle(b0)
        return { lines, chipFill: bc ? rgba(bc.backgroundColor) : null, chipInk: bc ? rgba(bc.color) : null, px: Math.round(parseFloat(cs.fontSize)), lh: Math.round(parseFloat(cs.lineHeight) || 0) }
      })(),
      // n136: preformatted box-drawing text (round 10 c3 ASCII frame, dropped)
      preText: /pre/.test(cs.whiteSpace) && /[┌└│─╔║═+|]/.test(el.textContent) ? el.textContent.replace(/^\n+|\n+$/g, '') : null,
      // n136: a window's title bar (a ruled strip on top with ring dots and a title at the right)
      titleBar: (() => { const k = el.firstElementChild; if (!k || k.dataset?.r) return null; const c = getComputedStyle(k), b = k.getBoundingClientRect(); const dots = [...k.children].filter((q) => !(q.innerText || '').trim() && Math.abs(q.getBoundingClientRect().width - q.getBoundingClientRect().height) < 2 && q.getBoundingClientRect().width <= 20); if (dots.length < 2 || b.height > 60) return null; const t = (k.innerText || '').trim(); const dc = getComputedStyle(dots[0]); return { h: Math.round(b.height), rule: parseFloat(c.borderBottomWidth) || 0, ruleC: rgba(c.borderBottomColor), dots: dots.length, dot: Math.round(dots[0].getBoundingClientRect().width), ring: parseFloat(dc.borderTopWidth) > 0 && !(rgba(dc.backgroundColor)?.a > 0.05), dotC: rgba(dc.borderTopColor), t, tpx: Math.round(parseFloat(getComputedStyle(k.lastElementChild).fontSize)) } })(),
      clipPoints: /polygon\(/.test(cs.clipPath) ? cs.clipPath.split(',').length : 0,
      clipCss: /polygon\(/.test(cs.clipPath) ? cs.clipPath : null,
      // the cut-out's outline as fractions of the block (percent or px corners), so it can be drawn as itself
      clipPoly: (() => {
        const m = cs.clipPath.match(/polygon\((.*)\)/)
        if (!m) return null
        const frac = (v, size) => /%$/.test(v) ? parseFloat(v) / 100 : parseFloat(v) / Math.max(1, size)
        const pts = m[1].split(',').map((c) => c.trim().split(/\s+/)).filter((c) => c.length === 2)
          .map(([a, b]) => [frac(a, r.width), frac(b, r.height)])
        return pts.length >= 3 && pts.every((p) => p.every(Number.isFinite)) ? pts : null
      })(),
      blend: cs.mixBlendMode && cs.mixBlendMode !== 'normal' ? cs.mixBlendMode : null,
      // ---- round 6 creative (n79)
      // a clip-path inset that shows only part of the block (round 6 c2: one word sliced in half, said as two lines)
      clipInset: (() => {
        const m = cs.clipPath.match(/inset\(([^)]*)\)/)
        if (!m) return null
        const v = m[1].replace(/round.*$/, '').trim().split(/\s+/)
        const [t, rr = t, b = t, l = rr] = v
        const frac = (x, size) => /%$/.test(x) ? parseFloat(x) / 100 : (parseFloat(x) || 0) / Math.max(1, size)
        return { t: frac(t, r.height), r: frac(rr, r.width), b: frac(b, r.height), l: frac(l, r.width) }
      })(),
      // a flat move or slant: matrix(a, b, c, d, e, f); skewX(k) puts tan(k) in c (round 6 c2 'Tickets' skewed, unsaid)
      shiftX: (() => { const m = cs.transform.match(/^matrix\(([^)]+)\)/); return m ? Math.round(+m[1].split(',')[4]) : 0 })(),
      skewX: (() => { const m = cs.transform.match(/^matrix\(([^)]+)\)/); if (!m) return 0; const [a, b, c, d] = m[1].split(',').map(Number); return Math.abs(b) < 0.01 && Math.abs(d) > 0.01 ? Math.round(Math.atan(c / d) * 180 / Math.PI) : 0 })(),
      // a 3D turn's angles, read off matrix3d (column-major: a6 = cos x, a7 = sin x; a1 = cos y, a3 = -sin y)
      rot3d: (() => {
        const m = cs.transform.match(/^matrix3d\(([^)]+)\)/)
        if (!m) return null
        const a = m[1].split(',').map(Number)
        return { x: Math.round(Math.atan2(a[6], a[5]) * 180 / Math.PI), y: Math.round(Math.atan2(-a[2], a[0]) * 180 / Math.PI), persp: Math.abs(a[11]) > 1e-6 ? Math.round(-1 / a[11]) : null }
      })(),
      // a small block line inside big type ('£4' then a 16px mono 'post free in the UK': round 6 c5, said as one huge heading)
      subKid: (() => {
        const big = parseFloat(cs.fontSize)
        const k = [...el.children].find((x) => { const s = getComputedStyle(x); return s.display === 'block' && parseFloat(s.fontSize) <= big * 0.4 && (x.innerText || '').trim() })
        if (!k) return null
        const s = getComputedStyle(k)
        // n147: a small block set absolutely in the big type's top-right corner, right-aligned over lines (round 12 c5
        // masthead 'ISSUE 44 / WINTER 2026 / €12': built as one line under the word, at the left)
        const kb = k.getBoundingClientRect(), eb = el.getBoundingClientRect()
        const lines = (k.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean)
        const corner = s.position === 'absolute' && kb.right >= eb.right - 8 && kb.top <= eb.top + eb.height / 2 ? { y: Math.round(kb.top - eb.top), right: s.textAlign === 'right' || s.textAlign === 'end', spacing: parseFloat(s.letterSpacing) || 0 } : null
        return { t: k.innerText.replace(/\s+/g, ' ').trim(), px: Math.round(parseFloat(s.fontSize)), mono: /mono|courier/i.test(s.fontFamily), bold: +s.fontWeight >= 600, corner, lines: lines.length >= 2 && lines.length <= 5 ? lines : null }
      })(),
      // n130: a bento tile that is more than a box: a punched hole showing the page, a clipped notch corner, icon task rows,
      // a giant gradient-clipped word (round 9 c3: hole and task list built as grey photos, notch on all four corners)
      bentoTile: (() => {
        const fl = rgba(cs.backgroundColor)
        if (!(fl?.a > 0.05 || parseFloat(cs.borderTopWidth) >= 1 || cs.backgroundImage !== 'none') || r.width < 200 || r.height < 150 || r.width > 900 || r.height > 600) return null
        const pageBg = rgba(getComputedStyle(document.body).backgroundColor)
        const near = (a, b) => a && b && Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) < 8
        const all = [...el.querySelectorAll('*')]
        const holeEl = all.find((k) => { const b = k.getBoundingClientRect(), c = getComputedStyle(k); return !(k.innerText || '').trim() && !k.children.length && b.width >= 60 && Math.abs(b.width - b.height) <= 2 && (c.borderTopLeftRadius.includes('%') ? parseFloat(c.borderTopLeftRadius) >= 40 : parseFloat(c.borderTopLeftRadius) >= b.width * 0.4) && near(rgba(c.backgroundColor), pageBg) && !near(fl, pageBg) })
        const rowEls = [...el.children].filter((k) => { const i = k.firstElementChild; if (!i || (i.innerText || '').trim() || k.children.length > 3 || k.getBoundingClientRect().height > 90 || (k.innerText || '').trim().length > 48 || [...k.children].some((g) => g.children.length)) return false; const b = i.getBoundingClientRect(); return b.width >= 20 && b.width <= 80 && Math.abs(b.width - b.height) <= 2 && rgba(getComputedStyle(i).backgroundColor)?.a > 0.05 && (k.innerText || '').trim() })
        const head = [...el.children].find((k) => /^H\d$/.test(k.tagName))
        const poly = /polygon\(/.test(cs.clipPath) ? cs.clipPath : null
        const big = all.find((x) => /^text(,\s*text)*$/.test(getComputedStyle(x).webkitBackgroundClip || getComputedStyle(x).backgroundClip) && /gradient/.test(getComputedStyle(x).backgroundImage) && parseFloat(getComputedStyle(x).fontSize) >= 100)
        if (!holeEl && rowEls.length < 2 && !(poly && head) && !big) return null
        const at = (k) => { const b = k.getBoundingClientRect(); return { x: Math.round(b.left - r.left), y: Math.round(b.top - r.top), w: Math.round(b.width), h: Math.round(b.height) } }
        const tx = (k) => { const c = getComputedStyle(k); return { t: (k.innerText || '').replace(/\s+/g, ' ').trim(), px: Math.round(parseFloat(c.fontSize)), bold: +c.fontWeight >= 600, ink: rgba(c.color), ...at(k) } }
        const others = [...el.children].filter((k) => k !== head && !rowEls.includes(k) && (k.innerText || '').trim() && !k.contains(big || null))
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), fill: fl?.a > 0.05 ? fl : null, radius: Math.round(parseFloat(cs.borderTopLeftRadius) || 0), border: parseFloat(cs.borderTopWidth) >= 1 ? rgba(cs.borderTopColor) : null, poly, pageBg,
          head: head ? tx(head) : null, hole: holeEl ? at(holeEl) : null,
          rows: rowEls.length >= 2 ? rowEls.map((k) => { const i = k.firstElementChild, ic = getComputedStyle(i), parts = [...k.childNodes].map((n) => (n.textContent || '').trim()).filter(Boolean); const last = k.lastElementChild; return { icon: rgba(ic.backgroundColor), px: Math.round(i.getBoundingClientRect().width), rad: Math.round(parseFloat(ic.borderTopLeftRadius) || 0), label: parts[0] ?? '', right: last && last !== i && (last.innerText || '').trim() ? { t: last.innerText.trim(), bold: +getComputedStyle(last).fontWeight >= 600 } : null, y: Math.round(k.getBoundingClientRect().top - r.top) } }) : null,
          big: big ? { ...tx(big), grad: getComputedStyle(big).backgroundImage, spacing: Math.round(parseFloat(getComputedStyle(big).letterSpacing) || 0) } : null,
          others: others.map(tx) }
      })(),
      // gradient-filled words inside a heading ('three dimensions' in cyan to pink: round 6 c1, unsaid)
      clipKid: (() => {
        const k = [...el.querySelectorAll('*')].find((x) => /^text(,\s*text)*$/.test(getComputedStyle(x).webkitBackgroundClip || getComputedStyle(x).backgroundClip) && /gradient/.test(getComputedStyle(x).backgroundImage))
        return k ? { t: (k.innerText || '').replace(/\s+/g, ' ').trim(), bgImage: getComputedStyle(k).backgroundImage, bgImageColours: colours(getComputedStyle(k).backgroundImage) } : null
      })(),
      // n154: a grid of glyph tiles, each tile a box holding one letter with its own weight, colour, glow, fill or
      // outline (round 14 c5: said as the one word 'AgR&QeS7?' on one line, tiles lost)
      glyphTiles: (() => {
        if (!/grid/.test(cs.display) || kids.length < 4 || kids.length > 16) return null
        const ts = kids.map((k) => {
          const s = getComputedStyle(k), b = k.getBoundingClientRect(), t = (k.innerText || '').trim()
          const sh = s.textShadow && s.textShadow !== 'none' ? s.textShadow.match(/(rgba?\([^)]+\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/) : null
          return { t, w: +s.fontWeight, italic: s.fontStyle === 'italic', px: Math.round(parseFloat(s.fontSize)), ink: rgba(s.color), fill: rgba(s.backgroundColor), border: parseFloat(s.borderTopWidth) >= 1 ? rgba(s.borderTopColor) : null, bw: Math.round(parseFloat(s.borderTopWidth) || 0), rad: Math.round(parseFloat(s.borderTopLeftRadius) || 0), stroke: parseFloat(s.webkitTextStrokeWidth) > 0 ? { w: Math.round(parseFloat(s.webkitTextStrokeWidth)), c: rgba(s.webkitTextStrokeColor) } : null, glow: sh ? { c: rgba(sh[1]), blur: Math.round(+sh[4]) } : null, bw2: Math.round(b.width), bh: Math.round(b.height) }
        })
        if (ts.some((x) => !x.t || x.t.length > 2) || !ts.every((x) => x.border || x.fill?.a > 0.05) || ts.some((x) => x.bw2 < 40)) return null
        const cols = cs.gridTemplateColumns.split(/\s+/).filter(Boolean).length
        return { tiles: ts, cols, rows: Math.ceil(ts.length / cols), gap: Math.round(parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
      })(),
      // n154: a chart card whose chart is an SVG of 2+ filled area paths (round 14 e4 stacked area chart: said only as
      // its title and legend, built as a bar chart)
      areaSvg: (() => {
        const svg = [...el.querySelectorAll('svg')].find((s) => s.querySelectorAll('path').length >= 2)
        if (!svg) return null
        const ps = [...svg.querySelectorAll('path')].filter((p) => { const f = getComputedStyle(p).fill; return f && f !== 'none' && /Z\s*$/i.test((p.getAttribute('d') || '').trim()) })
        if (ps.length < 2) return null
        const b = svg.getBoundingClientRect()
        const ls = [...svg.querySelectorAll('line')].map((l) => ({ x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2'), c: rgba(getComputedStyle(l).stroke) }))
        const sw = [...el.querySelectorAll('i, span')].filter((k) => { const kb = k.getBoundingClientRect(); return !k.children.length && !(k.innerText || '').trim() && kb.width >= 6 && kb.width <= 16 && rgba(getComputedStyle(k).backgroundColor)?.a > 0.05 }).map((k) => ({ c: rgba(getComputedStyle(k).backgroundColor), t: (k.parentElement.innerText || '').trim() }))
        return { x: Math.round(b.left - r.left), y: Math.round(b.top - r.top), w: Math.round(b.width), h: Math.round(b.height), paths: ps.map((p) => ({ d: p.getAttribute('d'), fill: rgba(getComputedStyle(p).fill), op: +getComputedStyle(p).opacity })), lines: ls, legend: sw }
      })(),
      // one word whose letters each carry their own size and weight (round 7 c2 'VARIABLE' wave: no note, invented copy)
      // n156: lines broken by <br> and set far apart (round 14 c4 chapter list: 4 labels 150px apart, built as one vertical
      // line of turned letters)
      brStack: (() => {
        if (el.querySelector('[data-r]') || [...el.childNodes].filter((n) => n.nodeName === 'BR').length < 1) return null
        const base = rgba(cs.color), L = [[]]
        el.childNodes.forEach((n) => { if (n.nodeName === 'BR') L.push([]); else L[L.length - 1].push(n) })
        const out = L.map((ns) => {
          const t = ns.map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim(); if (!t) return null
          const rg = document.createRange(); rg.setStartBefore(ns[0]); rg.setEndAfter(ns[ns.length - 1])
          const q = [...rg.getClientRects()].filter((x) => x.width > 1)
          const em = ns.find((n) => n.nodeType === 1 && n.textContent.trim())
          return q.length ? { t, x: Math.round(Math.min(...q.map((x) => x.left))), y: Math.round(Math.min(...q.map((x) => x.top))), c: em ? rgba(getComputedStyle(em).color) : base, w: em ? Number(getComputedStyle(em).fontWeight) : Number(cs.fontWeight) } : null
        }).filter(Boolean)
        return out.length >= 2 ? out : null
      })(),
      // n156: a thin track bar with one lit segment inside it (round 14 c4 progress rail: said 'deep green', segment lost)
      litTrack: (() => {
        const thin = Math.min(r.width, r.height), long = Math.max(r.width, r.height)
        if (thin > 10 || long < 120 || !(rgba(cs.backgroundColor)?.a > 0.05) || kids.length !== 1) return null
        const k = kids[0], kb = k.getBoundingClientRect(), kc = rgba(getComputedStyle(k).backgroundColor)
        if (!(kc?.a > 0.05) || (k.innerText || '').trim()) return null
        return { vertical: r.height > r.width, track: rgba(cs.backgroundColor), lit: kc, x: Math.round(kb.left - r.left), y: Math.round(kb.top - r.top), w: Math.round(kb.width), h: Math.round(kb.height) }
      })(),
      letterWave: (() => {
        if (kids.length < 3 || kids.length > 24) return null
        const ls = kids.map((k) => { const s = getComputedStyle(k); return { t: (k.innerText || '').trim(), px: Math.round(parseFloat(s.fontSize)), w: +s.fontWeight } })
        if (ls.some((l) => !l.t || l.t.length > 2)) return null
        const pxs = ls.map((l) => l.px), ws = ls.map((l) => l.w)
        if (Math.max(...pxs) - Math.min(...pxs) < 12 && Math.max(...ws) - Math.min(...ws) < 300) return null
        if (Math.max(...pxs) < 40) return null
        // n156: letters pushed apart across a wide box (round 14 c1 FLUXION: packed into the middle when said 'no gaps')
        const kb = kids.map((k) => k.getBoundingClientRect()), inked = kb.reduce((n, q) => n + q.width, 0)
        const spread = r.width >= 300 && inked < 0.8 * r.width ? { xs: kb.map((q) => Math.round(q.left)), justify: cs.justifyContent } : null
        return { letters: ls, width: Math.round(r.width), top: Math.round(r.top), left: Math.round(r.left), colour: rgba(getComputedStyle(el).color), spread }
      })(),
      // a paragraph opening on a drop cap (::first-letter floated and enlarged: round 7 c5 column, no note at all)
      dropCap: (() => {
        const fl = getComputedStyle(el, '::first-letter'), base = parseFloat(cs.fontSize)
        const px = parseFloat(fl.fontSize)
        if (!(px >= base * 2.5) || fl.cssFloat !== 'left' || !(el.innerText || '').trim()) return null
        return { letter: (el.innerText || '').trim()[0], px: Math.round(px), weight: +fl.fontWeight, colour: rgba(fl.color), base: Math.round(base), lh: parseFloat(cs.lineHeight) || Math.round(base * 1.2) }
      })(),
      // an SVG holding one unfilled stroked ellipse or circle: a hand-drawn ring round something (round 7 c5: bare box)
      ringSvg: (() => {
        if (el.tagName.toLowerCase() !== 'svg') return null
        const all = [...el.querySelectorAll('path, polygon, ellipse, circle, rect, line, polyline')]
        if (all.length !== 1 || !/^(ellipse|circle)$/.test(all[0].tagName.toLowerCase())) return null
        const p = all[0], ps = getComputedStyle(p)
        if (ps.fill !== 'none' && !(rgba(ps.fill)?.a <= 0.05)) return null
        const c = rgba(ps.stroke)
        if (!c || c.a <= 0.05) return null
        const rot = (p.getAttribute('transform') || '').match(/rotate\(\s*(-?[\d.]+)/)
        const rx = +(p.getAttribute('rx') ?? p.getAttribute('r')), ry = +(p.getAttribute('ry') ?? p.getAttribute('r'))
        const sc = r.width / (el.viewBox?.baseVal?.width || r.width)
        return { c, w: Math.round(parseFloat(ps.strokeWidth) * sc), rx: Math.round(rx * sc), ry: Math.round(ry * sc), rot: rot ? Math.round(+rot[1]) : 0 }
      })(),
      // a tile holding a stack of thin empty bars under a small label (round 7 c1 list tile: said 'near-black "SYNC"')
      barStack: (() => {
        const bs = kids.filter((k) => !k.children.length && !(k.innerText || '').trim() && rgba(getComputedStyle(k).backgroundColor)?.a > 0.05 && k.getBoundingClientRect().height <= 16 && k.getBoundingClientRect().width >= 40)
        if (bs.length < 3) return null
        const b0 = bs[0].getBoundingClientRect(), b1 = bs[1].getBoundingClientRect()
        return { bars: bs.map((k) => { const b = k.getBoundingClientRect(); return { c: rgba(getComputedStyle(k).backgroundColor), pct: Math.round((b.width / bs.reduce((m, q) => Math.max(m, q.getBoundingClientRect().width), 0)) * 100) } }), h: Math.round(b0.height), gap: Math.round(b1.top - b0.bottom), top: Math.round(b0.top - r.top), radius: Math.round(parseFloat(getComputedStyle(bs[0]).borderTopLeftRadius)) }
      })(),
      // n160: a short svg whose look lives in defs (a clipPath, a pattern, a mask) or that stretches to its box
      // (preserveAspectRatio none) said verbatim: round 15 c4 clipped striped blob said as 0x0 shapes in a window,
      // the wave divider got no note at all
      svgSrc: (() => {
        if (el.tagName.toLowerCase() !== 'svg' || el.querySelector('textPath, text')) return null
        const c = el.cloneNode(true)
        for (const n of [c, ...c.querySelectorAll('*')]) { n.removeAttribute('data-r'); n.removeAttribute('data-must'); n.removeAttribute('class') }
        const src = c.outerHTML.replace(/\s+/g, ' ').replace(/> </g, '><')
        if (src.length > 1800 || !/<clipPath|<pattern|<mask|preserveAspectRatio="none"/.test(src)) return null
        return { src, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
      })(),
      // SVG art (not a chart): filled shapes back to front and stroked paths (round 6 c3 hills: one bare box)
      svgArt: (() => {
        // an <svg>, or a <g> group marked inside one (round 7 c4 cubes: three faces per group, said as bare boxes)
        const svg = el.tagName.toLowerCase() === 'svg' || (el.tagName.toLowerCase() === 'g' && el.ownerSVGElement) ? el : null
        if (!svg) return null
        const fills = [...svg.querySelectorAll('path, polygon, ellipse, rect')].filter((p) => getComputedStyle(p).fill !== 'none' && rgba(getComputedStyle(p).fill)?.a > 0.05)
          .map((p) => { const b = p.getBoundingClientRect(); return { c: rgba(getComputedStyle(p).fill), top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), curvy: /[CSQT]/i.test(p.getAttribute('d') ?? ''),
            // a polygon's corners in page px (skyline steps, cube faces: round 7 c3/c4 built as bare boxes)
            pts: (() => { if (p.tagName.toLowerCase() !== 'polygon') return null; const m = p.getScreenCTM(); if (!m) return null; return [...p.points].map((q) => [Math.round(m.a * q.x + m.c * q.y + m.e), Math.round(m.b * q.x + m.d * q.y + m.f)]) })(),
            // the top edge's height at 5 points across: a crest alone was built with the hill's left side high (round 6 c3)
            edge: (() => { try { if (!p.getTotalLength) return null; const L = p.getTotalLength(), m = p.getScreenCTM(); if (!L || !m) return null; const pts = Array.from({ length: 401 }, (_, i) => { const q = p.getPointAtLength((L * i) / 400); return [m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f] }); const xs = [0, 1, 2, 3, 4].map((i) => b.left + ((b.right - b.left) * i) / 4); const tol = (b.right - b.left) / 40; return xs.map((X) => { const near = pts.filter(([x]) => Math.abs(x - X) <= tol); return near.length ? [Math.round(X), Math.round(Math.min(...near.map(([, y]) => y)))] : null }) } catch { return null } })() } })
        const strokes = [...svg.querySelectorAll('path, polyline, line')].filter((p) => getComputedStyle(p).fill === 'none' || p.tagName === 'line').filter((p) => rgba(getComputedStyle(p).stroke)?.a > 0.05)
          .map((p) => { const b = p.getBoundingClientRect(); const da = p.getAttribute('stroke-dasharray') ?? getComputedStyle(p).strokeDasharray; return { straight: p.tagName.toLowerCase() === 'line', c: rgba(getComputedStyle(p).stroke), w: Math.round(parseFloat(getComputedStyle(p).strokeWidth) * 2) / 2, dash: da && da !== 'none' ? da.split(/[ ,]+/).map(parseFloat)[0] : 0, x: Math.round(b.left), y: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom), curvy: /[CSQT]/i.test(p.getAttribute('d') ?? ''), via: (() => { try { const L = p.getTotalLength(), m = p.getScreenCTM(); if (!L || !m) return null; return [0, 1, 2, 3, 4, 5, 6].map((i) => { const q = p.getPointAtLength((L * i) / 6); return [Math.round(m.a * q.x + m.c * q.y + m.e), Math.round(m.b * q.x + m.d * q.y + m.f)] }) } catch { return null } })() } })
        // one lone polygon is art too (a skyline silhouette), but a lone rect or circle is not
        return fills.length >= 2 || (fills.length && strokes.length) || (fills.length === 1 && fills[0].pts?.length >= 5) || strokes.length >= 2 ? { fills, strokes } : null
      })(),
      // what sits inside a textless glass panel: a strip, a bar chart, an open ring (round 6 c4: 'frosted glass' only)
      glassParts: (() => {
        if ((el.innerText || '').trim()) return null
        const leaves = [...el.querySelectorAll('*')].filter((k) => !k.children.length)
        if (!leaves.length) return null
        const out = []
        const used = new Set()
        // a bar chart: 3+ sibling leaves of one width, bottoms aligned, heights varying
        for (const p of new Set(leaves.map((k) => k.parentElement))) {
          const ks = [...p.children].filter((k) => !k.children.length)
          if (ks.length < 3) continue
          const bs = ks.map((k) => k.getBoundingClientRect())
          if (bs.some((b) => Math.abs(b.width - bs[0].width) > 2 || Math.abs(b.bottom - bs[0].bottom) > 2)) continue
          ks.forEach((k) => used.add(k))
          out.push({ type: 'bars', n: ks.length, w: Math.round(bs[0].width), gap: Math.round(bs[1].left - bs[0].right), hs: bs.map((b) => Math.round(b.height)), fill: rgba(getComputedStyle(ks[0]).backgroundColor), at: { x: Math.round(bs[0].left - r.left), bottom: Math.round(r.bottom - bs[0].bottom) } })
        }
        for (const k of leaves) {
          if (used.has(k)) continue
          const c = getComputedStyle(k), b = k.getBoundingClientRect()
          const bw = parseFloat(c.borderTopWidth) || 0
          const roundK = parseFloat(c.borderTopLeftRadius) >= b.width * 0.4 && Math.abs(b.width - b.height) <= 2
          if (roundK && bw >= 4) {
            const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((sd) => (rgba(c[`border${sd}Color`])?.a ?? 0) < 0.05).map((sd) => sd.toLowerCase())
            out.push({ type: 'ring', px: Math.round(b.width), thick: Math.round(bw), c: rgba(c.borderTopColor), open: sides, at: { x: Math.round(b.left - r.left), y: Math.round(b.top - r.top) } })
          } else if (rgba(c.backgroundColor)?.a > 0.05 && b.height <= 24 && b.width >= 4 * b.height) {
            out.push({ type: 'strip', w: Math.round(b.width), h: Math.round(b.height), fill: rgba(c.backgroundColor), at: { x: Math.round(b.left - r.left), y: Math.round(b.top - r.top) } })
          }
        }
        return out.length ? out : null
      })(),
      // big round spots painted by a ::before/::after over a block (round 6 c5 duotone: yellow shapes on blue, unsaid)
      pseudoSpots: (() => {
        for (const w of ['::before', '::after']) {
          const c = getComputedStyle(el, w)
          if (!c.content || c.content === 'none') continue
          const rs = [...c.backgroundImage.matchAll(/radial-gradient\((?:[^()]|\([^()]*\))*\)/g)].map((m) => m[0])
          const spots = rs.map((g) => { const at = g.match(/at\s+([\d.]+)%\s+([\d.]+)%/); const col = rgba((g.match(/rgba?\([^)]+\)/) || [])[0] ?? ''); const stop = (g.match(/([\d.]+)%\s*,\s*(?:transparent|rgba\([^)]*,\s*0\))/) || [])[1]; const W = parseFloat(c.width) || r.width, H = parseFloat(c.height) || r.height; const px = at ? +at[1] / 100 * W : W / 2, py = at ? +at[2] / 100 * H : H / 2; const ray = Math.max(Math.hypot(px, py), Math.hypot(W - px, py), Math.hypot(px, H - py), Math.hypot(W - px, H - py)); return col && col.a > 0.3 ? { c: col, x: at ? +at[1] : 50, y: at ? +at[2] : 50, d: stop ? Math.round(2 * ray * +stop / 100) : null, hard: /transparent\s+[\d.]+%/.test(g) } : null }).filter(Boolean)
          if (spots.length) return { spots, inset: Math.round(parseFloat(c.top) || 0) }
        }
        return null
      })(),
      // copy set in side-by-side columns, each a small bold head over a line (round 6 c2 festival days: unsaid, invented)
      colKids: (() => {
        if (kids.length < 2 || kids.length > 4) return null
        const bs = kids.map((k) => k.getBoundingClientRect())
        if (bs.some((b) => Math.abs(b.top - bs[0].top) > 4) || bs.some((b, i) => i && b.left < bs[i - 1].right - 2)) return null
        const out = kids.map((k) => {
          const h = k.firstElementChild, hc = h && getComputedStyle(h)
          const head = h && Number(hc.fontWeight) >= 600 ? (h.innerText || '').trim() : null
          const all = (k.innerText || '').replace(/\s+/g, ' ').trim()
          // the body's rendered line count (round 6 c2: one-line columns built wrapping to two)
          const kb = k.getBoundingClientRect(), lh = parseFloat(getComputedStyle(k).lineHeight) || parseFloat(getComputedStyle(k).fontSize) * 1.2
          const bodyH = kb.bottom - (h ? h.getBoundingClientRect().bottom + (parseFloat(hc.marginBottom) || 0) : kb.top)
          return { w: Math.round(kb.width), bodyLines: Math.max(1, Math.round(bodyH / lh)), head, headPx: head ? Math.round(parseFloat(hc.fontSize)) : null, spaced: head ? (parseFloat(hc.letterSpacing) || 0) / parseFloat(hc.fontSize) >= 0.1 : false, body: head ? all.slice(head.length).trim() : all }
        })
        return out.every((c) => c.head && c.body && c.body.length <= 120) ? { cols: out, px: Math.round(parseFloat(cs.fontSize)), gap: Math.round(bs[1].left - bs[0].right) } : null
      })(),
      // a word turned on its side inside a block ('LOUD' rotated -90deg in the intro box: round 6 c5)
      turnedKid: (() => {
        const k = [...el.querySelectorAll('*')].find((x) => { const m = getComputedStyle(x).transform.match(/^matrix\(([^,]+),\s*([^,]+)/); if (!m) return false; const deg = Math.abs(Math.atan2(+m[2], +m[1]) * 180 / Math.PI); return deg >= 80 && deg <= 100 && (x.innerText || '').trim() })
        if (!k) return null
        const c = getComputedStyle(k), m = c.transform.match(/^matrix\(([^,]+),\s*([^,]+)/), b = k.getBoundingClientRect()
        return { t: (k.innerText || '').trim(), deg: Math.round(Math.atan2(+m[2], +m[1]) * 180 / Math.PI), px: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 700, at: { x: Math.round(b.left - r.left), bottom: Math.round(r.bottom - b.bottom) } }
      })(),
      shadows: (cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\))/)).map((p) => {
        const n = (p.replace(/rgba?\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat)
        return { x: n[0] ?? 0, y: n[1] ?? 0, blur: n[2] ?? 0, clear: /rgba\([^)]*,\s*0\)/.test(p), c: rgba((p.match(/rgba?\([^)]+\)/) || [])[0] ?? '') }
      }),
      // which edge it runs off: a word bleeding off the left is not one stretched across both
      bleeds: r.left < -4 && r.right > innerWidth + 4 ? 'left and right' : r.left < -4 ? 'left' : r.right > innerWidth + 4 ? 'right' : r.top < -4 ? 'top' : null,
      // how far past the edge it starts (drawn marks stop at the screen edge, so the sketch can't show it)
      // n172: the untransformed line box of a block that bleeds both ways (round 17 c1 bands built starting at x 0)
      box0: { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, abs: cs.position === 'absolute' },
      bleedPx: Math.round(r.left < -4 ? -r.left : r.right > innerWidth + 4 ? r.right - innerWidth : r.top < -4 ? -r.top : 0),
      // a textless filled block inside (a picture placeholder): makes this a picture card
      pictureKid: [...el.querySelectorAll('*')].some((k) => { const c = getComputedStyle(k); const b = k.getBoundingClientRect(); return !(k.innerText || '').trim() && !k.children.length && (rgba(c.backgroundColor)?.a > 0.05 || /gradient|url/.test(c.backgroundImage)) && b.width >= 48 && b.height >= 48 && Math.abs(b.width - b.height) < Math.max(b.width, b.height) * 2 }),
      // kids that are themselves label + empty box fields (a row of fields)
      fieldKids: kids.filter((k) => [...k.children].some((g) => { const c = getComputedStyle(g); return !(g.innerText || '').trim() && parseFloat(c.borderTopWidth) >= 1 && g.getBoundingClientRect().height >= 30 })).map((k) => (k.innerText || '').replace(/\s+/g, ' ').trim()),
      // a block with copy on the left and one filled button on the right (a danger card's 'Mute all')
      sideButton: (() => {
        if (kids.length !== 2) return null
        const [a, b] = kids, cb = getComputedStyle(b), bb = b.getBoundingClientRect(), ab = a.getBoundingClientRect()
        const t = (b.innerText || '').trim(), bg = rgba(cb.backgroundColor)
        if (!t || t.length > 24 || !(bg && bg.a > 0.05) || bb.height < 26 || bb.height > 60 || bb.left < ab.right - 2) return null
        // the copy side is plain text: not an input, not a group of buttons (a composer, a toolbar)
        const boxy = (g) => { const c = getComputedStyle(g); return rgba(c.backgroundColor)?.a > 0.05 || parseFloat(c.borderTopWidth) >= 1 || parseFloat(c.borderBottomWidth) >= 1 }
        if ([a, ...a.querySelectorAll('*')].some(boxy)) return null
        const lines = (a.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean)
        const first = [...a.querySelectorAll('*')].find((g) => !g.children.length && (g.innerText || '').trim())
        if (!lines.length || lines.length > 3) return null
        return { t, fill: bg, ink: rgba(cb.color), lines, firstInk: first ? rgba(getComputedStyle(first).color) : null, firstBold: first ? Number(getComputedStyle(first).fontWeight) >= 600 : false }
      })(),
      // a row of tabs with one picked out: underlined or filled where the others aren't (round 5 e4)
      kidOn: (() => {
        if (kids.length < 3) return null
        const key = (k) => { const c = getComputedStyle(k); return `${parseFloat(c.borderBottomWidth) >= 2 ? 'u' : ''}|${rgba(c.backgroundColor)?.a > 0.05 ? c.backgroundColor : ''}` }
        const ks = kids.map(key)
        const odd = kids.filter((k, i) => ks.filter((x) => x === ks[i]).length === 1 && ks[i] !== '|')
        if (odd.length !== 1) return null
        const c = getComputedStyle(odd[0])
        // its letter colour when the rest share another one (round 5 e5 green Q1 tab built black)
        const rest = kids.filter((k) => k !== odd[0]).map((k) => getComputedStyle(k).color)
        const ink = rest.every((x) => x === rest[0]) && rest[0] !== c.color ? rgba(c.color) : null
        return { t: (odd[0].innerText || '').trim(), under: parseFloat(c.borderBottomWidth) >= 2 ? rgba(c.borderBottomColor) : null, fill: rgba(c.backgroundColor)?.a > 0.05 ? rgba(c.backgroundColor) : null, bold: Number(c.fontWeight) >= 600, ink }
      })(),
      // round 6 e5: a nested switch (Day/Week/Month) with one filled segment, outlined buttons beside it, and a
      // number in a filled round circle (today's date) were all said as plain links and built plain
      kidPicks: (() => {
        if (kids.length < 3) return null
        const fillOf = (g) => { const b = rgba(getComputedStyle(g).backgroundColor); return b && b.a > 0.05 ? b : null }
        const t = (g) => (g.innerText || '').replace(/\s+/g, ' ').trim()
        let seg = null
        for (const k of kids) {
          const ch = [...k.children]
          if (ch.length < 2 || ch.length > 5 || !ch.every((g) => t(g) && t(g).length <= 12)) continue
          const on = ch.filter(fillOf)
          if (on.length === 1 && !fillOf(k)) seg = { items: ch.map(t), t: t(on[0]), fill: fillOf(on[0]), ink: rgba(getComputedStyle(on[0]).color), bordered: parseFloat(getComputedStyle(k).borderTopWidth) >= 1 }
        }
        // a white chip on a white bar is still an outlined chip: round 7 e1 Mine/Bugs/Blocked (border, #fff fill)
        // were never said and got built as bare words (n111)
        const barBg = fillOf(el) || { r: 255, g: 255, b: 255, a: 1 }
        const plain = (k) => { const f = fillOf(k); return !f || Math.abs(f.r - barBg.r) + Math.abs(f.g - barBg.g) + Math.abs(f.b - barBg.b) <= 6 }
        const outK = kids.filter((k) => !k.children.length && t(k) && t(k).length <= 12 && parseFloat(getComputedStyle(k).borderTopWidth) >= 1 && plain(k))
        const outl = outK.map(t)
        const pill = outK.length && outK.every((k) => parseFloat(getComputedStyle(k).borderTopLeftRadius) >= k.getBoundingClientRect().height * 0.45)
        const dot = [...el.querySelectorAll('*')].find((g) => { const b = g.getBoundingClientRect(); return !g.children.length && t(g) && t(g).length <= 3 && fillOf(g) && b.width >= 16 && b.width <= 48 && Math.abs(b.width - b.height) <= 3 && parseFloat(getComputedStyle(g).borderTopLeftRadius) >= b.width * 0.4 })
        const out = { seg, outl: outl.length >= 2 ? outl : null, pill: outl.length >= 2 && pill ? { h: Math.round(outK[0].getBoundingClientRect().height), ink: rgba(getComputedStyle(outK[0]).borderTopColor) } : null, dot: dot ? { t: t(dot), fill: fillOf(dot), ink: rgba(getComputedStyle(dot).color), px: Math.round(dot.getBoundingClientRect().width) } : null }
        return out.seg || out.outl || out.dot ? out : null
      })(),
      // a row split by one wide gap (margin-left:auto): round 6 e5 'Today ‹ ›' sit by the title on the left,
      // the Day/Week/Month switch at the far right; said as one 'links:' run, the build put all of it right
      kidSplit: (() => {
        const ks = kids.filter((k) => (k.innerText || '').trim())
        if (ks.length < 3) return null
        const bs = ks.map((k) => k.getBoundingClientRect())
        if (!bs.every((b, i) => i === 0 || Math.abs(b.top + b.height / 2 - (bs[0].top + bs[0].height / 2)) <= 12 && b.left >= bs[i - 1].right - 2)) return null
        const gaps = bs.slice(1).map((b, i) => b.left - bs[i].right)
        const at = gaps.indexOf(Math.max(...gaps)), rest = gaps.filter((_, i) => i !== at)
        if (gaps[at] < 120 || rest.some((g) => g > 48)) return null
        const t = (k) => (k.innerText || '').replace(/\s+/g, ' ').trim()
        return { left: ks.slice(0, at + 1).map(t), right: ks.slice(at + 1).map(t), gap: Math.round(gaps[at]) }
      })(),
      // a row packed at the left of a wide bar, its right part empty (round 7 e1 top bar: title, search field and
      // filter chips all at the left; said as plain 'links:' the build pushed the chips to the far right)
      kidPack: (() => {
        const ks = kids.filter((k) => (k.innerText || '').trim())
        if (ks.length < 3) return null
        const pb = el.getBoundingClientRect()
        if (pb.width < 600) return null
        const bs = ks.map((k) => k.getBoundingClientRect())
        if (!bs.every((b, i) => i === 0 || Math.abs(b.top + b.height / 2 - (bs[0].top + bs[0].height / 2)) <= 12 && b.left >= bs[i - 1].right - 2)) return null
        if (bs.slice(1).some((b, i) => b.left - bs[i].right > 48)) return null
        const end = bs[bs.length - 1].right - pb.left
        if (end > 0.6 * pb.width) return null
        const t = (k) => (k.innerText || '').replace(/\s+/g, ' ').trim()
        const field = ks.find((k, i) => { const b = bs[i], cs = getComputedStyle(k); return b.width >= 150 && parseFloat(cs.borderTopWidth) >= 1 && !(rgba(cs.backgroundColor)?.a > 0.05 && rgba(cs.backgroundColor).r + rgba(cs.backgroundColor).g + rgba(cs.backgroundColor).b < 720) && t(k).length <= 24 })
        return { end: Math.round(end), w: Math.round(pb.width), field: field ? { t: t(field), w: Math.round(field.getBoundingClientRect().width) } : null }
      })(),
      // progress steps (round 6 e4 '✓ Cart — Shipping — Payment — Review'): text items joined by short thin
      // textless rules, each step its own colour (done green, current bold dark, rest grey); said as plain
      // 'links:' the rules were dropped and every step built one grey
      kidSteps: (() => {
        if (kids.length < 5) return null
        const t = (g) => (g.innerText || '').replace(/\s+/g, ' ').trim()
        const rules = kids.filter((k) => { const b = k.getBoundingClientRect(); return !t(k) && !k.children.length && b.width >= 12 && b.width <= 120 && b.height > 0 && b.height <= 3 && rgba(getComputedStyle(k).backgroundColor)?.a > 0.05 })
        const steps = kids.filter((k) => t(k))
        if (rules.length < 2 || steps.length < 3 || rules.length + steps.length !== kids.length) return null
        if (!kids.every((k, i) => i === 0 || (!t(k)) !== (!t(kids[i - 1])))) return null
        const st = steps.map((k) => { const c = getComputedStyle(k); return { t: t(k), ink: rgba(c.color), bold: Number(c.fontWeight) >= 600 } })
        const b0 = rules[0].getBoundingClientRect()
        return { items: st, line: { w: Math.round(b0.width), h: Math.round(b0.height), fill: rgba(getComputedStyle(rules[0]).backgroundColor) } }
      })(),
      // a lead item set apart from a uniform row: bold, bigger or another colour (round 5 e5 green bold
      // 'Budget 2027' title said as one more menu link, built black)
      kidLead: (() => {
        if (kids.length < 4) return null
        const st = kids.map((k) => { const c = getComputedStyle(k); return { c: c.color, w: Number(c.fontWeight) >= 600, s: parseFloat(c.fontSize) } })
        const rest = st.slice(1)
        // the row's usual style is the one most of the rest share: a search field's grey placeholder or a
        // selected chip's white text left the whole row 'not uniform' and the lead unsaid (round 7 e1 bold
        // 18px 'Sprint 42' built as a regular link)
        const same = (x, y) => x.c === y.c && x.w === y.w && Math.abs(x.s - y.s) < 1
        const r0 = rest.reduce((b, x) => (rest.filter((y) => same(x, y)).length > rest.filter((y) => same(b, y)).length ? x : b), rest[0])
        if (rest.filter((x) => same(x, r0)).length * 2 <= rest.length) return null
        const a = st[0]
        const bold = a.w && !r0.w, big = a.s >= r0.s + 2, ink = a.c !== r0.c ? rgba(a.c) : null
        if (!bold && !big && !ink) return null
        return { t: (kids[0].innerText || '').replace(/\s+/g, ' ').trim(), bold, px: big ? Math.round(a.s) : null, ink }
      })(),
      // each text child's size, weight and colour, and how far down the card its content reaches: a stat
      // card's big figure and green delta were said as plain lines and built small, centred down the card
      // (round 5 e2 'Peak hour')
      kidStyles: kids.filter((k) => (k.innerText || '').trim()).map((k) => { const c = getComputedStyle(k); return { s: Math.round(parseFloat(c.fontSize)), b: Number(c.fontWeight) >= 600, c: rgba(c.color), o: Number(c.opacity) } }),
      // ---- round 15 (n158)
      // the same giant word printed 2-4 times, each copy absolutely placed, offset and blended (round 15 c2: three
      // 560px "27"s said as 'links: 27, 27, 27', built as tiny nav links)
      // n172: a group of filled discs overlapping in a blend mode (round 17 c2 riso circles: said as a bare 'box', lost)
      discs: (() => {
        if (kids.length < 2 || kids.length > 8 || (el.innerText || '').trim()) return null
        const ks = kids.map((k) => ({ k, c: getComputedStyle(k), b: k.getBoundingClientRect() }))
        if (!ks.every(({ c, b }) => (c.borderTopLeftRadius.includes('%') ? parseFloat(c.borderTopLeftRadius) >= 45 : parseFloat(c.borderTopLeftRadius) >= b.width / 2 - 1) && Math.abs(b.width - b.height) <= 2 && b.width >= 60 && rgba(c.backgroundColor)?.a > 0.5)) return null
        return ks.map(({ c, b }) => ({ x: Math.round(b.left), y: Math.round(b.top), d: Math.round(b.width), fill: rgba(c.backgroundColor), blend: c.mixBlendMode, op: +c.opacity }))
      })(),
      overprint: (() => {
        if (kids.length < 2 || kids.length > 4) return null
        const t0 = (kids[0].innerText || '').trim()
        if (!t0 || t0.length > 12 || !kids.every((k) => (k.innerText || '').trim() === t0)) return null
        const ks = kids.map((k) => getComputedStyle(k))
        if (!ks.every((c) => c.position === 'absolute') || parseFloat(ks[0].fontSize) < 100) return null
        if (!ks.some((c) => c.mixBlendMode && c.mixBlendMode !== 'normal')) return null
        const ink = (k) => { const rg = document.createRange(); rg.selectNodeContents(k); const b = rg.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } }
        return {
          t: t0, px: Math.round(parseFloat(ks[0].fontSize)), weight: Number(ks[0].fontWeight), ls: parseFloat(ks[0].letterSpacing) || 0,
          lh: ks[0].lineHeight, family: ks[0].fontFamily, blend: ks.find((c) => c.mixBlendMode !== 'normal').mixBlendMode,
          layers: kids.map((k, i) => { const b = k.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), ink: ink(k), c: rgba(ks[i].color), blend: ks[i].mixBlendMode } }),
        }
      })(),
      // words set along circle paths in an svg (round 15 c1: two spinning text rings said as '2 filled shapes 0x0')
      textRings: (() => {
        if (el.tagName.toLowerCase() !== 'svg' || !el.querySelector('textPath')) return null
        const vb = el.viewBox?.baseVal, sc = vb && vb.width ? r.width / vb.width : 1
        const rings = [...el.querySelectorAll('text')].map((t) => {
          const tp = t.querySelector('textPath'); if (!tp) return null
          const id = (tp.getAttribute('href') || tp.getAttribute('xlink:href') || '').replace(/^#/, '')
          const p = id && el.querySelector(`#${CSS.escape(id)}`); if (!p) return null
          const bb = p.getBBox(), tc = getComputedStyle(t)
          const d = p.getAttribute('d') || ''
          const sweep = (d.match(/a\s*[\d.]+[ ,]+[\d.]+[ ,]+[\d.]+[ ,]+([01])[ ,]*([01])/i) || [])[2]
          return {
            text: (tp.textContent || '').replace(/\s+/g, ' ').trim(), radius: Math.round(bb.width / 2 * sc), px: Math.round(parseFloat(tc.fontSize) * sc),
            cx: Math.round(r.x + (bb.x + bb.width / 2) * sc), cy: Math.round(r.y + (bb.y + bb.height / 2) * sc),
            fill: rgba(tc.fill), op: Number(tc.fillOpacity), weight: Number(tc.fontWeight), ls: parseFloat(tc.letterSpacing) || 0,
            start: Math.abs(bb.y - (parseFloat((d.match(/M\s*[\d.]+[ ,]+([\d.]+)/i) || [])[1]))) < 2 ? 'top' : 'side', clockwise: sweep !== '0',
          }
        }).filter(Boolean)
        return rings.length ? { rings, spin: cs.animationName && cs.animationName !== 'none' ? { dur: cs.animationDuration, timing: cs.animationTimingFunction } : null } : null
      })(),
      // a round crosshair registration mark: a bordered empty circle with a thin cross through it (round 15 c2: 'pill input')
      crosshair: (() => {
        if ((el.innerText || '').trim() || el.children.length) return null
        const bi = cs.backgroundImage, sz = cs.backgroundSize
        if ((bi.match(/linear-gradient/g) || []).length !== 2 || !/\b\d+px 100%|100% \d+px/.test(sz)) return null
        if (parseFloat(cs.borderTopWidth) < 1 || !/%|px/.test(cs.borderRadius)) return null
        return { w: Math.round(r.width), h: Math.round(r.height), bw: Math.round(parseFloat(cs.borderTopWidth)), bc: rgba(cs.borderTopColor), line: Math.round(parseFloat(sz)) || 2, c: rgba(bi) }
      })(),
      kidReach: kids.length && r.height > 0 ? Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)) - r.top > 0 ? (Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)) - r.top) / r.height : null : null,
      // ---- round 5 creative facts (n61)
      // see-through blocks: a faded card (opacity .2) was built solid (round 5 c3)
      opacity: Number(cs.opacity),
      // a mask that fades the block out (round 5 c1 reel fading into the page at the bottom)
      maskFade: (() => {
        const m = cs.maskImage || cs.webkitMaskImage || ''
        if (!/linear-gradient/.test(m) || !/transparent|rgba\([^)]*,\s*0\)/.test(m)) return null
        const dir = m.match(/linear-gradient\(([^,]+),/)?.[1] ?? ''
        const args = m.replace(/^.*?linear-gradient\(/, '').replace(/\)\s*$/, '').split(/,(?![^(]*\))/)
        const clear = (a) => /transparent|rgba\([^)]*,\s*0\)/.test(a)
        // n172: a mask of many hard stops cuts the block into bands (round 17 c3 striped sun: said as a fade up)
        const flips = args.reduce((n, a, i) => n + (i && clear(a) !== clear(args[i - 1]) ? 1 : 0), 0)
        if (flips >= 4) return { bands: true, img: m, n: Math.ceil(flips / 2) }
        const toEnd = clear(args[args.length - 1])
        const ax = /180deg|to bottom/.test(dir) ? ['top', 'bottom'] : /0deg|to top/.test(dir) ? ['bottom', 'top'] : /90deg|to right/.test(dir) ? ['left', 'right'] : /270deg|to left/.test(dir) ? ['right', 'left'] : ['top', 'bottom']
        const at = parseFloat(m.match(/(\d+)%/)?.[1] ?? '50')
        return { toward: toEnd ? ax[1] : ax[0], fromPct: Math.round(at) }
      })(),
      // soft colour glows (radial gradients fading to transparent) over a fill: a reel or a hero lit by blobs
      glows: (() => {
        const rs = [...cs.backgroundImage.matchAll(/radial-gradient\((?:[^()]|\([^()]*\))*\)/g)].map((m) => m[0])
        // one glow over a solid fill counts too (round 8 c3: the violet tile's lilac glow was said as plain paint)
        if (rs.length < 1 || (rs.length < 2 && !(rgba(cs.backgroundColor)?.a > 0.5))) return null
        // where each glow really shows: background-size/position move and enlarge the glows (round 5 c1: 200% size,
        // so of three glows only orange sits in view, big; purple only reaches in from the right edge)
        // read them as the likeness screenshot shows them: infinite animations cancelled (Playwright
        // animations:'disabled'), i.e. the un-animated position (c1: 0% 0%, not the drift's first frame 0% 50%)
        el.getAnimations().forEach((a) => a.cancel())
        const W = r.width, H = r.height
        const sizes = cs.backgroundSize.split(',').map((x) => x.trim()), poss = cs.backgroundPosition.split(',').map((x) => x.trim())
        const len = (v, box, img) => (v.endsWith('%') ? (parseFloat(v) / 100) * (box - img) : parseFloat(v) || 0)
        const out = []
        rs.forEach((g, i) => {
          const c = rgba((g.match(/rgba?\([^)]+\)/) || [])[0] ?? '')
          if (!c || c.a <= 0.3) return
          const sz = (sizes[i] ?? sizes[0] ?? 'auto').split(/\s+/), ps = (poss[i] ?? poss[0] ?? '0% 0%').split(/\s+/)
          const dim = (v, box) => (!v || v === 'auto' || v === 'cover' || v === 'contain' ? box : v.endsWith('%') ? (parseFloat(v) / 100) * box : parseFloat(v))
          const iw = dim(sz[0], W), ih = dim(sz[1] ?? sz[0], H)
          const ox = len(ps[0] ?? '0%', W, iw), oy = len(ps[1] ?? '50%', H, ih)
          const p = g.match(/at\s+([\d.]+)%\s+([\d.]+)%/)
          const gx = p ? (+p[1] / 100) * iw : iw / 2, gy = p ? (+p[2] / 100) * ih : ih / 2
          // ray to the farthest corner of the image (the default size); the glow ends at its transparent stop
          const ray = Math.max(Math.hypot(gx, gy), Math.hypot(iw - gx, gy), Math.hypot(gx, ih - gy), Math.hypot(iw - gx, ih - gy))
          const stop = [...g.matchAll(/(?:transparent|rgba\([^)]*,\s*0\))\s+([\d.]+)%/g)].map((m) => +m[1])[0]
          const rad = (stop ?? 70) / 100 * ray
          const x = ox + gx, y = oy + gy
          const dx = x < 0 ? -x : x > W ? x - W : 0, dy = y < 0 ? -y : y > H ? y - H : 0
          const reach = rad - Math.hypot(dx, dy)
          if (reach < Math.min(W, H) * 0.12) return
          const fx = (x / W) * 100, fy = (y / H) * 100
          const inside = !dx && !dy
          let at
          if (inside) at = `${fy < 35 ? 'top' : fy > 65 ? 'bottom' : 'middle'}${fx < 35 ? ' left' : fx > 65 ? ' right' : fy >= 35 && fy <= 65 ? '' : ''}`.trim()
          else at = `coming in from the ${dy > dx ? (y > H ? 'bottom' : 'top') : (x > W ? 'right' : 'left')} edge`
          out.push({ c, at, inside, big: inside && rad >= W * 0.45, px: Math.round(rad), fx: Math.round(fx), fy: Math.round(fy) })
        })
        out.sort((a, b) => (b.inside - a.inside) || b.px - a.px)
        return out
      })(),
      // n149: a spreadsheet grid (round 13 e1: said as 'table, 12 rows', every cell lost): column letters across the top,
      // row numbers down the left, cells by row with their fills, inks, weights, alignment and the outlined active cell
      sheetGrid: (() => {
        const tb = el.tagName === 'TABLE' ? el : el.querySelector('table'); if (!tb) return null
        const rows = [...tb.rows]; if (rows.length < 4) return null
        const head = [...rows[0].cells].map((c) => (c.innerText || '').trim())
        const letters = head.slice(1)
        if (letters.length < 4 || !letters.every((t, i) => t === String.fromCharCode(65 + i))) return null
        if (!rows.slice(1).every((r, i) => (r.cells[0]?.innerText || '').trim() === String(i + 1))) return null
        const tbr = tb.getBoundingClientRect()
        const col = (c) => { const x = rgba(getComputedStyle(c).backgroundColor); return x && x.a > 0.05 ? x : null }
        const th0 = rows[1].cells[0], hc = getComputedStyle(rows[0].cells[1])
        const lit = [...rows[0].cells].slice(1).map((c, i) => ({ c, i })).filter(({ c }) => { const b = col(c), b0 = col(rows[0].cells[1]); return b && b0 && (Math.abs(b.r - b0.r) + Math.abs(b.g - b0.g) + Math.abs(b.b - b0.b)) > 20 })
        const cell = (c) => {
          const cs = getComputedStyle(c), b = c.querySelector('b,strong'), t = (c.innerText || '').trim()
          const ol = parseFloat(cs.outlineWidth) >= 1 && cs.outlineStyle !== 'none' ? { w: parseFloat(cs.outlineWidth), c: rgba(cs.outlineColor) } : null
          return { t, bold: Number((b ? getComputedStyle(b) : cs).fontWeight) >= 600, ink: rgba((b ? getComputedStyle(b) : cs).color), fill: col(c), right: cs.textAlign === 'right' || cs.textAlign === 'end', ol }
        }
        const body = rows.slice(1).map((r) => [...r.cells].slice(1).map(cell))
        const bc = getComputedStyle(rows[1].cells[1])
        return { x: Math.round(tbr.left), y: Math.round(tbr.top), w: Math.round(tbr.width), h: Math.round(tbr.height), letters, gutter: Math.round(rows[0].cells[0].getBoundingClientRect().width), colW: Math.round(rows[0].cells[1].getBoundingClientRect().width), rowH: Math.round(rows[1].getBoundingClientRect().height),
          headFill: col(rows[0].cells[1]), headInk: rgba(hc.color), headPx: Math.round(parseFloat(hc.fontSize)), numFill: col(th0), line: rgba(bc.borderTopColor), px: Math.round(parseFloat(bc.fontSize)), ink: rgba(bc.color),
          lit: lit.map(({ c, i }) => ({ i, fill: col(c), ink: rgba(getComputedStyle(c).color), bold: Number(getComputedStyle(c).fontWeight) >= 600 })), body }
      })(),
      // a progress ring: a round conic gradient (round 5 c5 '72%' ring said as a 'near-black block')
      conicRing: (() => {
        const k = [el, ...el.querySelectorAll('*')].find((g) => /conic-gradient/.test(getComputedStyle(g).backgroundImage))
        if (!k) return null
        const b = k.getBoundingClientRect(), gs = getComputedStyle(k)
        // computed stops come one position each ('a 0%, a 72%, b 72%, b 100%'): runs of one colour make one stop
        const stops = []
        for (const m of gs.backgroundImage.matchAll(/(rgba?\([^)]+\))((?:\s+[\d.]+(?:%|deg))*)/g)) {
          const pos = [...m[2].matchAll(/[\d.]+/g)].map((x) => +x[0])
          const last = stops[stops.length - 1]
          if (last && last.key === m[1]) last.to = pos.length ? pos[pos.length - 1] : last.to
          else stops.push({ key: m[1], c: rgba(m[1]), from: pos[0] ?? (last ? last.to : 0), to: pos[pos.length - 1] ?? 100 })
        }
        const label = [k, ...k.querySelectorAll('*')].map((g) => (getComputedStyle(g, '::after').content || '').replace(/^"|"$/g, '')).find((t) => t && t !== 'none' && t !== 'normal') || txt(k)
        // a donut's hollow middle cut by a round ::after/::before disc, and a legend row of 'Name 46%' spans (round 6 e2)
        const hole = ['::after', '::before'].map((w) => getComputedStyle(k, w)).find((c) => c.content && c.content !== 'none' && parseFloat(c.width) > 0 && parseFloat(c.width) < b.width && rgba(c.backgroundColor)?.a > 0.5)
        const lg = [...el.querySelectorAll('*')].find((p) => p !== k && !k.contains(p) && p.children.length >= 2 && [...p.children].every((g) => !g.children.length && /\d%/.test(g.textContent || '') && (g.textContent || '').trim().length <= 24))
        const hd = el.querySelector('h1,h2,h3,h4')
        const extra = { hole: hole ? { ring: Math.round((b.width - parseFloat(hole.width)) / 2), fill: rgba(hole.backgroundColor) } : null, legend: lg ? [...lg.children].map((g) => (g.textContent || '').trim()) : null, legendBelow: lg ? lg.getBoundingClientRect().top >= b.bottom - 2 : false, title: hd && !k.contains(hd) ? (hd.innerText || '').trim() : null }
        // n149: a smooth conic blend (colours at single points, no hard stops) is a gradient ring, not chart segments
        const pts = [...gs.backgroundImage.matchAll(/(rgba?\([^)]+\))((?:\s+[\d.]+(?:%|deg))*)/g)].map((m) => [...m[2].matchAll(/[\d.]+/g)].map((x) => +x[0]))
        const at = pts.map((p) => p[0]).filter((x) => x !== undefined)
        const smooth = pts.length >= 3 && pts.every((p) => p.length <= 1) && at.every((x, i) => !i || x !== at[i - 1])
        return { ...extra, css: gs.backgroundImage, smooth, px: Math.round(b.width), round: gs.borderTopLeftRadius.includes('%') ? parseFloat(gs.borderTopLeftRadius) >= 40 : parseFloat(gs.borderTopLeftRadius) >= b.width * 0.4, stops, label }
      })(),
      // n152: a grid of big same-size filled tiles, each a round letter disc in the middle and a name tag in a corner
      // (round 13 e4 video call: the 2x2 tiles said as one filled button and a list, built as one tile and three rows)
      callTiles: (() => {
        if (kids.length < 4 || kids.length > 9 || el.querySelector('[data-r]')) return null
        const pr = el.getBoundingClientRect()
        const ts = kids.map((k) => ({ k, b: k.getBoundingClientRect(), cs: getComputedStyle(k) }))
        const b0 = ts[0].b
        if (b0.width < 150 || b0.height < 120 || !ts.every(({ b }) => Math.abs(b.width - b0.width) <= 4 && Math.abs(b.height - b0.height) <= 4)) return null
        if (!ts.every(({ cs }) => rgba(cs.backgroundColor).a > 0.5)) return null
        const disc = (k) => [...k.querySelectorAll('*')].find((g) => { const s = getComputedStyle(g), gb = g.getBoundingClientRect(); return gb.width >= 32 && Math.abs(gb.width - gb.height) <= 2 && (s.borderTopLeftRadius.includes('%') || parseFloat(s.borderTopLeftRadius) >= gb.width / 2 - 1) && rgba(s.backgroundColor).a > 0.5 && (g.innerText || '').trim().length <= 3 })
        const ds = ts.map(({ k }) => disc(k))
        if (ds.some((d) => !d)) return null
        const cols = new Set(ts.map(({ b }) => Math.round(b.left))).size
        const rel = (g, b) => { const gb = g.getBoundingClientRect(); return { x: Math.round(gb.left - b.left), y: Math.round(gb.top - b.top), w: Math.round(gb.width), h: Math.round(gb.height), r: Math.round(b.right - gb.right), bt: Math.round(b.bottom - gb.bottom) } }
        const tiles = ts.map(({ k, b, cs }, i) => {
          const d = ds[i], dcs = getComputedStyle(d)
          const others = [...k.children].filter((g) => g !== d && (g.innerText || '').trim())
          const parts = others.map((g) => { const s = getComputedStyle(g), p = rel(g, b); return { t: (g.innerText || '').trim(), fill: rgba(s.backgroundColor), rad: Math.round(parseFloat(s.borderTopLeftRadius) || 0), round: p.w > 0 && Math.abs(p.w - p.h) <= 2 && parseFloat(s.borderTopLeftRadius) >= p.w / 2 - 1, ...p } })
          const ol = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1 ? { w: Math.round(parseFloat(cs.outlineWidth)), c: rgba(cs.outlineColor) } : null
          const bd = !ol && parseFloat(cs.borderTopWidth) >= 2 ? { w: Math.round(parseFloat(cs.borderTopWidth)), c: rgba(cs.borderTopColor) } : null
          return { x: Math.round(b.left), y: Math.round(b.top), fill: rgba(cs.backgroundColor), disc: { t: (d.innerText || '').trim(), fill: rgba(dcs.backgroundColor), ink: rgba(dcs.color), px: Math.round(d.getBoundingClientRect().width), size: Math.round(parseFloat(dcs.fontSize)), bold: Number(dcs.fontWeight) >= 600 }, parts, ring: ol ?? bd }
        })
        return { x: Math.round(pr.left), y: Math.round(pr.top), w: Math.round(pr.width), h: Math.round(pr.height), cols, rows: Math.ceil(kids.length / cols), tw: Math.round(b0.width), th: Math.round(b0.height), gap: cols > 1 ? Math.round(ts[1].b.left - ts[0].b.right) : 0, radius: Math.round(parseFloat(ts[0].cs.borderTopLeftRadius) || 0), tiles }
      })(),
      // n150: a fan of same-size cards each turned round a shared low origin (round 13 c3: said as 7 lines of text,
      // the cards never built and a paragraph invented in their place)
      fan: (() => {
        if (kids.length < 3 || kids.length > 8 || el.querySelector('[data-r]')) return null
        const ks = kids.map((k) => ({ k, cs: getComputedStyle(k) }))
        if (!ks.every(({ cs }) => cs.position === 'absolute' && cs.transform !== 'none')) return null
        const w0 = ks[0].k.offsetWidth, h0 = ks[0].k.offsetHeight
        if (!ks.every(({ k }) => Math.abs(k.offsetWidth - w0) <= 2 && Math.abs(k.offsetHeight - h0) <= 2) || w0 < 40) return null
        const turn = (cs) => { const m = cs.transform.match(/matrix\(([^,]+),\s*([^,]+),[^,]+,[^,]+,\s*([^,]+),\s*([^)]+)\)/); return m ? { deg: Math.round(Math.atan2(+m[2], +m[1]) * 180 / Math.PI), dx: Math.round(+m[3]), dy: Math.round(+m[4]) } : null }
        const cards = ks.map(({ k, cs }) => ({ t: (k.innerText || '').trim(), bg: cs.backgroundColor, c: cs.color, ...(turn(cs) ?? {}) }))
        if (cards.filter((c) => c.deg).length < 2) return null
        const c0 = ks[0].cs, pr = el.getBoundingClientRect()
        return { cards, w: w0, h: h0, x: Math.round(pr.left + ks[0].k.offsetLeft), y: Math.round(pr.top + ks[0].k.offsetTop), origin: c0.transformOrigin, radius: c0.borderTopLeftRadius, border: c0.borderTopWidth !== '0px' ? `${c0.borderTopWidth} solid ${c0.borderTopColor}` : '', shadow: c0.boxShadow !== 'none' ? c0.boxShadow : '', font: c0.fontFamily.split(',')[0].replace(/"/g, ''), size: Math.round(parseFloat(c0.fontSize)), pad: c0.paddingTop }
      })(),
      // text set round a circle (an SVG textPath badge)
      circleText: (() => {
        const t = el.querySelector('textPath'); if (!t) return null
        const tx = t.closest('text'), cs = tx ? getComputedStyle(tx) : null
        const path = document.getElementById((t.getAttribute('href') || t.getAttribute('xlink:href') || '').replace('#', ''))
        const rad = path ? +((path.getAttribute('d') || '').match(/a\s*([\d.]+)/)?.[1] || 0) : 0
        const svg = el.closest('svg') || el, vb = svg.viewBox?.baseVal, sc = vb && vb.width ? r.width / vb.width : 1
        const dc = [...el.querySelectorAll('circle')].find((c) => getComputedStyle(c).fill === 'none' && getComputedStyle(c).strokeDasharray !== 'none')
        const ink = cs ? (cs.fill && cs.fill !== 'none' ? cs.fill : cs.color) : null
        // n172: a filled disc behind the letters (round 17 c1 badge: black disc said 'no fill', built as bare text)
        const disc = [...el.querySelectorAll('circle')].map((c) => ({ c, f: getComputedStyle(c).fill })).find(({ f }) => f && f !== 'none' && !/rgba\([^)]*,\s*0\)/.test(f))
        return { disc: disc ? { fill: disc.f, r: Math.round(+disc.c.getAttribute('r') * sc) } : null, text: (t.textContent || '').trim(), px: Math.round(r.width), size: cs ? Math.round(parseFloat(cs.fontSize) * sc) : 0, weight: cs ? Number(cs.fontWeight) : 400, spacing: cs ? Math.round((parseFloat(cs.letterSpacing) || 0) * sc) : 0, rad: Math.round(rad * sc), ink,
          dashed: dc ? { r: Math.round(+dc.getAttribute('r') * sc), w: +(getComputedStyle(dc).strokeWidth || '1').replace('px', ''), dash: getComputedStyle(dc).strokeDasharray, c: getComputedStyle(dc).stroke } : null }
      })(),
      // the text kids' boxes: a card's button, a bottom-set block of copy (round 5 c5 CTA said as 'cards')
      // a task card: a small coloured tag, a bold title, maybe a progress bar, a round avatar dot, a struck title
      // (round 7 e1: tag colours, avatars, the blocked card's red edge and done cards' strike-through all unsaid)
      taskCard: (() => {
        if (!kids.length || kids.length > 5 || el.querySelector('[data-r]')) return null
        const t = (k) => (k.innerText || '').replace(/\s+/g, ' ').trim()
        const fl = (k) => { const c = rgba(getComputedStyle(k).backgroundColor); return c && c.a > 0.05 ? c : null }
        const tag = kids.find((k) => t(k) && t(k).length <= 16 && !k.children.length && fl(k) && k.getBoundingClientRect().height <= 26 && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= 2)
        const title = kids.find((k) => k !== tag && t(k) && t(k).length <= 60)
        if (!title || kids.filter((k) => t(k)).length > 2) return null
        const av = kids.find((k) => { const b = k.getBoundingClientRect(); return !t(k) && fl(k) && b.width >= 14 && b.width <= 40 && Math.abs(b.width - b.height) <= 2 && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= b.width / 2 - 1 })
        const bar = kids.find((k) => !t(k) && k.getBoundingClientRect().height <= 10 && k.children.length === 1 && fl(k.children[0]))
        const tc = getComputedStyle(title)
        const strike = /line-through/.test(tc.textDecorationLine)
        if (!tag && !av && !strike && !bar) return null
        const ab = av?.getBoundingClientRect()
        return {
          tag: tag ? { t: t(tag), fill: fl(tag), ink: rgba(getComputedStyle(tag).color), px: Math.round(parseFloat(getComputedStyle(tag).fontSize)) } : null,
          title: { t: t(title), bold: Number(tc.fontWeight) >= 600 }, strike,
          av: av ? { fill: fl(av), px: Math.round(ab.width), corner: `${ab.top + ab.height / 2 > r.top + r.height / 2 ? 'bottom' : 'top'}-${ab.left + ab.width / 2 > r.left + r.width / 2 ? 'right' : 'left'}` } : null,
          bar: bar ? { pct: Math.round(bar.children[0].getBoundingClientRect().width / bar.getBoundingClientRect().width * 100), fill: fl(bar.children[0]), track: fl(bar), h: Math.round(bar.getBoundingClientRect().height), w: Math.round(bar.getBoundingClientRect().width), gap: Math.round(bar.getBoundingClientRect().top - title.getBoundingClientRect().bottom), inner: Math.round(r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)) } : null,
          opacity: parseFloat(cs.opacity),
        }
      })(),
      // a label with one short kid pushed to its far right (a kanban column head 'To do ... 5'; round 7 e1: unsaid,
      // the build invented the heads and dropped the counts)
      endKid: (() => {
        if (kids.length !== 1 || !ownText || ownText.length > 32) return null
        const k = kids[0], b = k.getBoundingClientRect(), c = getComputedStyle(k), t = (k.innerText || '').trim()
        if (!t || t.length > 12 || b.right < r.right - 4 || b.left < r.left + r.width * 0.5) return null
        return { t, ink: rgba(c.color), bold: Number(c.fontWeight) >= 600 }
      })(),
      // n130: side-by-side columns of running copy, the first maybe opening with a drop cap (round 9 c5: unsaid, lost)
      textCols: (() => {
        if (kids.length < 2 || kids.length > 4) return null
        const bs = kids.map((k) => k.getBoundingClientRect())
        if (!kids.every((k, i) => !k.children.length && (k.innerText || '').trim().length >= 60 && Math.abs(bs[i].top - bs[0].top) <= 4) || !bs.every((b, i) => !i || b.left >= bs[i - 1].right - 1)) return null
        const c0 = getComputedStyle(kids[0]), fl = getComputedStyle(kids[0], '::first-letter')
        const cap = fl.float === 'left' && parseFloat(fl.fontSize) >= parseFloat(c0.fontSize) * 2 ? { px: Math.round(parseFloat(fl.fontSize)), ink: rgba(fl.color), lines: Math.max(2, Math.round(parseFloat(fl.fontSize) * 0.85 / (parseFloat(c0.lineHeight) || parseFloat(c0.fontSize) * 1.4)) + 1) } : null
        return { n: kids.length, w: Math.round(bs[0].width), gap: Math.round(bs[1].left - bs[0].right), px: Math.round(parseFloat(c0.fontSize)), lh: Math.round(parseFloat(c0.lineHeight) || 0), ink: rgba(c0.color), cap, texts: kids.map((k) => (k.innerText || '').replace(/\s+/g, ' ').trim()) }
      })(),
      kidBoxes: kids.filter((k) => (k.innerText || '').trim()).map((k) => { const c = getComputedStyle(k); const b = k.getBoundingClientRect(); return { t: (k.innerText || '').replace(/\s+/g, ' ').trim(), stack: (() => { const q = [...k.children].filter((g) => (g.innerText || '').trim()); if (q.length < 2 || q.length > 3) return null; const L = q.map((g) => { const gc = getComputedStyle(g); return { t: g.innerText.replace(/\s+/g, ' ').trim(), px: Math.round(parseFloat(gc.fontSize)), bold: Number(gc.fontWeight) >= 600, ink: rgba(gc.color), sp: (parseFloat(gc.letterSpacing) || 0) >= 1 } }); return new Set(L.map((l) => l.px)).size > 1 ? L : null })(), fill: rgba(c.backgroundColor), ink: rgba(c.color), h: b.height, w: b.width, top: b.top - r.top, bottom: b.bottom - r.top, left: b.left - r.left, right: b.right - r.left, radius: parseFloat(c.borderTopLeftRadius) || 0, s: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 600, it: c.fontStyle === 'italic' || [...k.querySelectorAll('*')].some((g) => getComputedStyle(g).fontStyle === 'italic'), spacing: (parseFloat(c.letterSpacing) || 0) / (parseFloat(c.fontSize) || 16), struck: /line-through/.test(c.textDecorationLine), bw: parseFloat(c.borderTopWidth) || 0, bc: rgba(c.borderTopColor) } }),
      // one line made of differently styled runs (round 7 e4 price: '$189' big, '$240' struck grey, '-21%' red tag; said run-on)
      runs: (() => {
        if (r.height > 60 || !kids.length || kids.length > 3 || kids.some((k) => k.children.length) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return null
        const segs = []
        for (const n of el.childNodes) {
          const t = (n.textContent || '').replace(/\s+/g, ' ').trim()
          if (!t) continue
          const c = getComputedStyle(n.nodeType === 1 ? n : el)
          segs.push({ t, px: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 600, ink: rgba(c.color), struck: /line-through/.test(c.textDecorationLine), fill: n.nodeType === 1 && rgba(c.backgroundColor)?.a > 0.05 ? rgba(c.backgroundColor) : null })
        }
        if (segs.length < 2 || segs.length > 4) return null
        const k = (x) => `${x.px}|${x.bold}|${x.struck}|${!!x.fill}|${x.ink?.r},${x.ink?.g},${x.ink?.b}`
        return new Set(segs.map(k)).size >= 2 ? segs : null
      })(),
      // its text as set, line by line (code in a card: the kids are only the coloured tokens)
      setLines: (el.innerText || '').split('\n').map((x) => x.replace(/ /g, ' ').replace(/\s+$/, '')),
      // the words on each line as rendered (a headline's own breaks: round 6 c3 built 3 lines, target 2)
      // a word inside the heading set hollow: transparent fill, stroked outline (round 8 c1 'depth': built solid white)
      hollow: [...el.querySelectorAll('*')].filter((k) => { const s = getComputedStyle(k); return parseFloat(s.webkitTextStrokeWidth) > 0 && (rgba(s.color)?.a ?? 1) < 0.05 && (k.innerText || '').trim() }).map((k) => { const s = getComputedStyle(k); return { t: (k.innerText || '').trim(), px: parseFloat(s.webkitTextStrokeWidth), c: rgba(s.webkitTextStrokeColor) } }),
      // frosted glass cards over blurred colour blobs (round 9 c2: the whole stack read as 'a contents list, no box')
      glassStack: (() => {
        const abs = kids.filter((k) => getComputedStyle(k).position === 'absolute')
        const isGlass = (k) => /blur/.test(getComputedStyle(k).backdropFilter || getComputedStyle(k).webkitBackdropFilter || '')
        const cards = abs.filter(isGlass)
        const blobs = abs.filter((k) => !isGlass(k) && /blur/.test(getComputedStyle(k).filter) && !(k.innerText || '').trim())
        if (cards.length < 2) return null
        const o = el.getBoundingClientRect()
        const at = (k) => { const b = k.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } }
        const part = (g) => {
          const gs = getComputedStyle(g), t = (g.innerText || '').replace(/\s+/g, ' ').trim(), b = g.getBoundingClientRect()
          const ks = [...g.children]
          // a row of bars rising from one baseline
          if (ks.length >= 4 && ks.every((k) => !(k.innerText || '').trim() && k.tagName === g.children[0].tagName) && gs.display === 'flex' && gs.alignItems === 'flex-end')
            return { bars: ks.map((k) => Math.round((k.getBoundingClientRect().height / b.height) * 100)), w: Math.round(ks[0].getBoundingClientRect().width), h: Math.round(b.height), fill: rgba(getComputedStyle(ks[0]).backgroundColor) }
          // a track with a fill inside
          if (!t && ks.length === 1 && rgba(gs.backgroundColor)?.a > 0.05 && b.height <= 16) { const f = ks[0].getBoundingClientRect(); return { track: rgba(gs.backgroundColor), fill: rgba(getComputedStyle(ks[0]).backgroundColor), pct: Math.round((f.width / b.width) * 100), h: Math.round(b.height) } }
          // overlapping round avatars
          if (!t && ks.length >= 2 && ks.every((k) => parseFloat(getComputedStyle(k).borderTopLeftRadius) >= k.getBoundingClientRect().width * 0.4)) return { avatars: ks.map((k) => rgba(getComputedStyle(k).backgroundColor)), px: Math.round(ks[0].getBoundingClientRect().width), ring: rgba(getComputedStyle(ks[0]).borderTopColor) }
          if (t) return { t, px: Math.round(parseFloat(gs.fontSize)), weight: Number(gs.fontWeight) || 400, ink: rgba(gs.color) }
          return null
        }
        return { box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, blobs: blobs.map((k) => ({ ...at(k), c: rgba(getComputedStyle(k).backgroundColor), blur: Math.round(parseFloat((getComputedStyle(k).filter.match(/blur\(([\d.]+)px/) || [])[1]) || 0), op: Math.round(parseFloat(getComputedStyle(k).opacity) * 100) })),
          cards: cards.map((k) => { const ks2 = getComputedStyle(k); const rot = (k.style.transform.match(/rotate\(([-\d.]+)deg\)/) || [])[1] ?? null; return { ...(rot ? { x: Math.round(k.offsetLeft + (k.offsetParent === el ? o.left : 0)), y: Math.round(k.offsetTop + (k.offsetParent === el ? o.top : 0)), w: k.offsetWidth, h: k.offsetHeight } : at(k)), rot, fill: rgba(ks2.backgroundColor), border: rgba(ks2.borderTopColor), bw: parseFloat(ks2.borderTopWidth) || 0, radius: Math.round(parseFloat(ks2.borderTopLeftRadius) || 0), blur: Math.round(parseFloat(((ks2.backdropFilter || ks2.webkitBackdropFilter).match(/blur\(([\d.]+)px/) || [])[1]) || 0), shadow: ks2.boxShadow !== 'none', pad: Math.round(parseFloat(ks2.paddingLeft) || 0), parts: [...k.children].map(part).filter(Boolean) } }) }
      })(),
      // n131: a drawn map: a pale panel holding absolutely placed strips (streets), areas (water, park) and short-text
      // pills (price pins), one dark (round 9 e2: said only 'pale blue-grey', built a blank grey panel)
      mapPanel: (() => {
        if (el.querySelector('[data-r]') && ![...el.querySelectorAll('[data-r]')].every((k) => k.parentElement === el && (k.innerText || '').trim().length <= 4)) return null
        const abs = kids.filter((k) => getComputedStyle(k).position === 'absolute' && !k.dataset?.r)
        const pins = abs.filter((k) => { const t = (k.innerText || '').trim(); const c = getComputedStyle(k); return t && t.length <= 8 && parseFloat(c.borderTopLeftRadius) >= k.getBoundingClientRect().height / 2 - 1 })
        const areas = abs.filter((k) => !(k.innerText || '').trim() && rgba(getComputedStyle(k).backgroundColor)?.a > 0.05)
        if (pins.length < 3 || areas.length < 3 || abs.length < 8) return null
        const o = el.getBoundingClientRect()
        const at = (k) => { const b = k.getBoundingClientRect(); return { x: Math.round(b.left - o.left), y: Math.round(b.top - o.top), w: Math.round(b.width), h: Math.round(b.height) } }
        return { bg: rgba(cs.backgroundColor), w: Math.round(o.width), h: Math.round(o.height),
          areas: areas.map((k) => ({ ...at(k), c: rgba(getComputedStyle(k).backgroundColor), r: Math.round(parseFloat(getComputedStyle(k).borderTopLeftRadius) || 0) })),
          pins: pins.map((k) => { const c = getComputedStyle(k); return { ...at(k), t: (k.innerText || '').trim(), fill: rgba(c.backgroundColor), ink: rgba(c.color), bold: Number(c.fontWeight) >= 600, shadow: c.boxShadow !== 'none', scale: /matrix\(([\d.]+)/.test(c.transform) ? Math.round(parseFloat(c.transform.match(/matrix\(([\d.]+)/)[1]) * 100) / 100 : 1 } }) }
      })(),
      // n131: a grid of listing cards, each a gradient photo (with an optional white badge) over a title row, a grey line
      // and a price line (round 9 e2: said only 'list', built a text list with no photos)
      photoCards: (() => {
        if (kids.length < 2 || el.querySelector('[data-r]')) return null
        const ph = (k) => { const p = k.firstElementChild; if (!p) return null; const c = getComputedStyle(p); const b = p.getBoundingClientRect(); return b.height >= 80 && (/gradient/.test(c.backgroundImage) || rgba(c.backgroundColor)?.a > 0.05) && b.width >= k.getBoundingClientRect().width - 2 ? p : null }
        if (!kids.every(ph) || kids.some((k) => k.children.length < 3)) return null
        const o = el.getBoundingClientRect(), g = getComputedStyle(el)
        const cols = g.display === 'grid' ? g.gridTemplateColumns.split(' ').length : 1
        const line = (k) => { const c = getComputedStyle(k), b = k.getBoundingClientRect(), sub = [...k.children].filter((x) => (x.innerText || '').trim()); return { t: (k.innerText || '').replace(/\s+/g, ' ').trim(), px: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 600, ink: rgba(c.color), split: c.display === 'flex' && c.justifyContent === 'space-between' && sub.length ? (sub[sub.length - 1].innerText || '').trim() : null, boldPart: sub.find((x) => Number(getComputedStyle(x).fontWeight) >= 600 && Number(c.fontWeight) < 600)?.innerText?.trim() ?? null, gap: null, y: Math.round(b.top) } }
        return { cols, gap: Math.round(parseFloat(g.columnGap) || 0), rowGap: Math.round(parseFloat(g.rowGap) || 0), x: Math.round(o.left), y: Math.round(o.top), w: Math.round(o.width),
          cards: kids.map((k) => { const p = ph(k), pc = getComputedStyle(p), pb = p.getBoundingClientRect(), b = k.getBoundingClientRect(); const badge = p.firstElementChild; const bc = badge && getComputedStyle(badge)
            return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), photoH: Math.round(pb.height), radius: Math.round(parseFloat(pc.borderTopLeftRadius) || 0), grad: pc.backgroundImage !== 'none' ? pc.backgroundImage : null, fill: rgba(pc.backgroundColor),
              badge: badge && (badge.innerText || '').trim() ? { t: (badge.innerText || '').trim(), fill: rgba(bc.backgroundColor), px: Math.round(parseFloat(bc.fontSize)), bold: Number(bc.fontWeight) >= 600, r: Math.round(parseFloat(bc.borderTopLeftRadius) || 0), x: Math.round(badge.getBoundingClientRect().left - pb.left), y: Math.round(badge.getBoundingClientRect().top - pb.top) } : null,
              lines: [...k.children].slice(1).map(line).map((l, i, a) => ({ ...l, gap: l.y - (i ? a[i - 1].y : pb.bottom) })) } }) }
      })(),
      // n131: a filter panel of headed sections holding checkbox rows (a small bordered square, filled when ticked, a label,
      // an optional grey count at the right) and range sliders (track, filled span, two round knobs) (round 9 e4: read as
      // an inspector of filled field boxes; checkboxes and slider lost)
      checkPanel: (() => {
        if (el.querySelector('[data-r]')) return null
        const box = (k) => { const b = k.getBoundingClientRect(), c = getComputedStyle(k); return b.width >= 12 && b.width <= 24 && Math.abs(b.width - b.height) <= 2 && parseFloat(c.borderTopWidth) >= 1 && parseFloat(c.borderTopLeftRadius) < b.width / 2 - 1 && !(k.innerText || '').trim() }
        const isCk = (k) => k.firstElementChild && box(k.firstElementChild) && (k.innerText || '').trim()
        const isRange = (k) => { const ks = [...k.querySelectorAll('*')]; const knobs = ks.filter((x) => { const b = x.getBoundingClientRect(); return b.width >= 12 && b.width <= 30 && parseFloat(getComputedStyle(x).borderTopLeftRadius) >= b.width / 2 - 1 }); return !(k.innerText || '').trim() && knobs.length === 2 && ks.length >= 3 ? knobs : null }
        if (kids.filter(isCk).length < 3) return null
        const o = el.getBoundingClientRect(), r = (k) => k.getBoundingClientRect()
        const secs = []
        for (const k of kids) {
          const c = getComputedStyle(k), t = (k.innerText || '').replace(/\s+/g, ' ').trim()
          if (/^h\d$/i.test(k.tagName) || (t && !k.children.length && Number(c.fontWeight) >= 600)) { secs.push({ head: t, px: Math.round(parseFloat(c.fontSize)), y: Math.round(r(k).top - o.top), items: [] }); continue }
          const s = secs[secs.length - 1]; if (!s) continue
          if (isCk(k)) { const bx = k.firstElementChild, bc = getComputedStyle(bx); const right = [...k.children].find((x, i) => i > 0 && getComputedStyle(x).marginLeft === 'auto' || (i > 0 && r(x).right >= r(k).right - 2 && r(x).left > r(k).left + r(k).width / 2)); const lab = [...k.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim() || (k.innerText || '').trim()
            s.items.push({ ck: true, on: rgba(bc.backgroundColor)?.a > 0.5, px: Math.round(r(bx).width), rad: Math.round(parseFloat(bc.borderTopLeftRadius) || 0), border: rgba(bc.borderTopColor), bw: parseFloat(bc.borderTopWidth), fill: rgba(bc.backgroundColor), label: lab, right: right ? { t: (right.innerText || '').trim(), ink: rgba(getComputedStyle(right).color) } : null, h: Math.round(r(k).height) }); continue }
          const knobs = isRange(k)
          if (knobs) { const ks = [...k.querySelectorAll('*')].filter((x) => !knobs.includes(x)); const tr = ks.sort((a, b) => r(b).width - r(a).width)[0], fl = ks.find((x) => x !== tr && rgba(getComputedStyle(x).backgroundColor)?.a > 0.05)
            s.items.push({ range: true, x: Math.round(r(tr).left - o.left), w: Math.round(r(tr).width), th: Math.round(r(tr).height), track: rgba(getComputedStyle(tr).backgroundColor), fill: fl ? rgba(getComputedStyle(fl).backgroundColor) : null, from: fl ? Math.round(r(fl).left - r(tr).left) : null, to: fl ? Math.round(r(fl).right - r(tr).left) : null, knobs: knobs.map((x) => Math.round(r(x).left + r(x).width / 2 - r(tr).left)), kpx: Math.round(r(knobs[0]).width), kfill: rgba(getComputedStyle(knobs[0]).backgroundColor), kborder: rgba(getComputedStyle(knobs[0]).borderTopColor), kbw: parseFloat(getComputedStyle(knobs[0]).borderTopWidth) || 0 }); continue }
          if (t && k.children.length >= 2) s.items.push({ ends: [...k.children].map((x) => (x.innerText || '').trim()), px: Math.round(parseFloat(c.fontSize)), ink: rgba(c.color), spread: c.justifyContent === 'space-between' })
        }
        return { box: { x: Math.round(o.left), y: Math.round(o.top), w: Math.round(o.width), h: Math.round(o.height) }, fill: rgba(cs.backgroundColor), radius: Math.round(parseFloat(cs.borderTopLeftRadius) || 0), pad: Math.round(parseFloat(cs.paddingLeft) || 0), secs }
      })(),
      // n131: stacked result cards (flight rows): each card's parts left to right: a solid square, time blocks with a small
      // line under, a route line with stop dots, a big price over a filled button, a tag over the top edge (round 9 e4:
      // the whole list one card of run-together text lines)
      resultCards: (() => {
        if (kids.length < 3 || el.querySelector('[data-r]')) return null
        const o = el.getBoundingClientRect()
        const cardish = (k) => { const c = getComputedStyle(k), b = k.getBoundingClientRect(); return (rgba(c.backgroundColor)?.a > 0.5 || parseFloat(c.borderTopWidth) >= 1) && b.height >= 60 && (b.width >= o.width * 0.8 || (b.width >= o.width * 0.25 && c.position === 'absolute')) && k.querySelectorAll('*').length >= 6 }
        if (!kids.every(cardish)) return null
        const leafs = (k) => [...k.querySelectorAll('*')].filter((x) => { const b = x.getBoundingClientRect(); if (b.width < 2) return false; const own = [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); const solid = !x.children.length && (rgba(getComputedStyle(x).backgroundColor)?.a > 0.5 || (/gradient/.test(getComputedStyle(x).backgroundImage) && b.height >= 40)); return own || solid })
        const desc = (k) => { const kb = k.getBoundingClientRect()
          const parts = leafs(k).map((x) => { const c = getComputedStyle(x), b = x.getBoundingClientRect(); const own = [...x.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(' / ')
            const bf = getComputedStyle(x, '::before'); const rule = bf.content && bf.content !== 'none' && parseFloat(bf.borderTopWidth) >= 1 ? { px: parseFloat(bf.borderTopWidth), c: rgba(bf.borderTopColor), top: Math.round(parseFloat(bf.top) || 0) } : null
            return { t: own || null, x: Math.round(b.left - kb.left), y: Math.round(b.top - kb.top), w: Math.round(b.width), h: Math.round(b.height), px: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 600, ink: rgba(c.color), fill: rgba(c.backgroundColor)?.a > 0.5 ? rgba(c.backgroundColor) : null, img: !own && /gradient/.test(c.backgroundImage) ? c.backgroundImage : null, outline: parseFloat(c.borderTopWidth) >= 1 && own ? rgba(c.borderTopColor) : null, round: parseFloat(c.borderTopLeftRadius) >= b.width / 2 - 1, rad: Math.round(parseFloat(c.borderTopLeftRadius) || 0), rule } })
          const kc = getComputedStyle(k); return { y: Math.round(kb.top), x: Math.round(kb.left), w: Math.round(kb.width), h: Math.round(kb.height), border: parseFloat(kc.borderTopWidth) >= 1 ? { px: parseFloat(kc.borderTopWidth), c: rgba(kc.borderTopColor) } : null, fill: rgba(getComputedStyle(k).backgroundColor), radius: Math.round(parseFloat(getComputedStyle(k).borderTopLeftRadius) || 0), parts } }
        return { cards: kids.map(desc) }
      })(),
      // n132: a bar across the top said part by part (round 9 e1 title bar, e2 top bar, e4 search chips: no note, or
      // 'white text list'; built as invented headings or bare text)
      topBar: (() => {
        if (r.top > 4 || r.width < 1000 || r.height < 40 || r.height > 110 || el.querySelector('[data-r]')) return null
        const parts = []
        const filled = (x) => { const c = rgba(getComputedStyle(x).backgroundColor); return c && c.a > 0.05 ? c : null }
        const walk = (x) => {
          for (const k of [...x.children]) {
            const kc = getComputedStyle(k); if (kc.display === 'none') continue
            const t = (k.innerText || '').replace(/\s+/g, ' ').trim(), b = k.getBoundingClientRect()
            const textKids = [...k.children].filter((y) => (y.innerText || '').trim())
            if (!t) { if (filled(k) && b.width >= 12 && b.height >= 12) parts.push({ t: '', x: Math.round(b.left - r.left), y: Math.round(b.top - r.top), w: Math.round(b.width), h: Math.round(b.height), fill: filled(k), rad: Math.round(parseFloat(kc.borderTopLeftRadius) || 0) }); continue }
            if (textKids.length >= 2 && !filled(k) && !(parseFloat(kc.borderTopWidth) >= 1)) { walk(k); continue }
            parts.push({ t, x: Math.round(b.left - r.left), y: Math.round(b.top - r.top), w: Math.round(b.width), h: Math.round(b.height), px: Math.round(parseFloat(kc.fontSize)), bold: Number(kc.fontWeight) >= 600, it: kc.fontStyle === 'italic', ink: rgba(kc.color), fill: filled(k), rad: Math.round(parseFloat(kc.borderTopLeftRadius) || 0), border: parseFloat(kc.borderTopWidth) >= 1 ? { px: Math.round(parseFloat(kc.borderTopWidth)), c: rgba(kc.borderTopColor) } : null, inner: textKids.length >= 2 ? textKids.map((y) => (y.innerText || '').replace(/\s+/g, ' ').trim()) : null,
              // n169: a few words inside the part in their own colour (round 16 e3 title's grey "#4182": built dark)
              accent: textKids.length === 1 ? (() => { const y = textKids[0], yc = getComputedStyle(y), a = rgba(yc.color), o = rgba(kc.color); return a && o && (Math.abs(a.r - o.r) + Math.abs(a.g - o.g) + Math.abs(a.b - o.b)) > 40 ? { t: (y.innerText || '').replace(/\s+/g, ' ').trim(), ink: a } : null })() : null })
          }
        }
        walk(el)
        // n155: a bare text run straight in the bar (round 14 e4 logo '◉ Lumen', no element of its own: lost)
        for (const n of [...el.childNodes]) {
          if (n.nodeType !== 3 || !n.textContent.trim()) continue
          const rg = document.createRange(); rg.selectNodeContents(n); const b = rg.getBoundingClientRect()
          if (b.width < 4) continue
          parts.push({ t: n.textContent.replace(/\s+/g, ' ').trim(), x: Math.round(b.left - r.left), y: Math.round(b.top - r.top), w: Math.round(b.width), h: Math.round(b.height), px: Math.round(parseFloat(cs.fontSize)), bold: Number(cs.fontWeight) >= 600, it: cs.fontStyle === 'italic', ink: rgba(cs.color), fill: null, rad: 0, border: null })
        }
        parts.sort((a, b) => a.x - b.x)
        if (parts.length < 2 || parts.length > 10 || !parts.some((p) => p.t)) return null
        return { h: Math.round(r.height), fill: filled(el), rule: parseFloat(cs.borderBottomWidth) >= 1 ? { px: Math.round(parseFloat(cs.borderBottomWidth)), c: rgba(cs.borderBottomColor) } : null, parts }
      })(),
      // n132: a plain table of rows, each row the same columns (round 9 e5 invoices: said as a two-column list; amount,
      // status pills and PDF links lost)
      rowTable: (() => {
        if (kids.length < 3 || el.querySelector('[data-r]')) return null
        const n = kids[0].children.length
        if (n < 3 || !kids.every((k) => k.children.length === n && /grid|flex/.test(getComputedStyle(k).display))) return null
        const lefts = kids.map((k) => [...k.children].map((c) => Math.round(c.getBoundingClientRect().left)))
        if (!lefts.every((l) => l.every((x, j) => Math.abs(x - lefts[0][j]) <= 3))) return null
        const o = el.getBoundingClientRect()
        const cell = (c) => { const pill = [...c.querySelectorAll('*')].find((y) => (y.innerText || '').trim() && (rgba(getComputedStyle(y).backgroundColor)?.a ?? 0) > 0.05); const cc = getComputedStyle(pill ?? c); return { t: (c.innerText || '').replace(/\s+/g, ' ').trim(), px: Math.round(parseFloat(cc.fontSize)), bold: Number(cc.fontWeight) >= 600, ink: rgba(cc.color), pill: pill ? { fill: rgba(cc.backgroundColor), rad: Math.round(parseFloat(cc.borderTopLeftRadius) || 0) } : null } }
        const rows = kids.map((k) => { const kc = getComputedStyle(k), b = k.getBoundingClientRect(); return { h: Math.round(b.height), fill: (rgba(kc.backgroundColor)?.a ?? 0) > 0.05 ? rgba(kc.backgroundColor) : null, rule: parseFloat(kc.borderTopWidth) >= 1 ? rgba(kc.borderTopColor) : null, spaced: parseFloat(kc.letterSpacing) >= 0.5, cells: [...k.children].map(cell) } })
        return { x: Math.round(o.left), y: Math.round(o.top), w: Math.round(o.width), cols: lefts[0].map((x) => Math.round(x - o.left)), pad: Math.round(parseFloat(getComputedStyle(kids[0]).paddingLeft) || 0), rows }
      })(),
      // n132: a flat full-height side panel (round 9 e5: built as an inset grey card with a heavy shadow)
      edgePanel: r.left <= 2 && r.top <= 2 && r.height >= window.innerHeight - 4 && r.width <= 360 && (rgba(cs.backgroundColor)?.a ?? 0) > 0.05 ? { w: Math.round(r.width), rule: parseFloat(cs.borderRightWidth) >= 1 ? rgba(cs.borderRightColor) : null, shadow: cs.boxShadow !== 'none', rad: Math.round(parseFloat(cs.borderTopRightRadius) || 0) } : null,
      // n131: usage meters: each a label, a big value with a small grey 'of N', and a thin track with a filled share
      // (round 9 e5: said as 'list: Seats 8 of 10', built as thin lines)
      meters: (() => {
        if (kids.length < 2 || el.querySelector('[data-r]')) return null
        const m = kids.map((k) => { const tr = [...k.querySelectorAll('*')].find((x) => { const b = x.getBoundingClientRect(); return !(x.innerText || '').trim() && b.height <= 14 && b.height >= 3 && x.children.length === 1 && rgba(getComputedStyle(x).backgroundColor)?.a > 0.05 }); if (!tr) return null
          const fl = tr.firstElementChild, tb = tr.getBoundingClientRect(); const texts = [...k.children].filter((x) => x !== tr && (x.innerText || '').trim())
          if (!texts.length) return null // a bar with no label beside it (a player's progress bar under icon buttons) is not a meter
          return { lines: texts.map((x) => { const c = getComputedStyle(x), sm = x.querySelector('small'); return { t: (x.innerText || '').replace(/\s+/g, ' ').trim(), px: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 600, ink: rgba(c.color), small: sm ? { t: (sm.innerText || '').trim(), px: Math.round(parseFloat(getComputedStyle(sm).fontSize)), ink: rgba(getComputedStyle(sm).color) } : null } }), w: Math.round(tb.width), h: Math.round(tb.height), track: rgba(getComputedStyle(tr).backgroundColor), fill: rgba(getComputedStyle(fl).backgroundColor), pct: Math.round(fl.getBoundingClientRect().width / tb.width * 100), gap: Math.round(tb.top - texts[texts.length - 1].getBoundingClientRect().bottom) } })
        if (m.some((x) => !x)) return null
        const g = getComputedStyle(el), o = el.getBoundingClientRect()
        return { m, cols: g.display === 'grid' ? g.gridTemplateColumns.split(' ').length : m.length, gap: Math.round(parseFloat(g.columnGap) || 0), box: { x: Math.round(o.left), y: Math.round(o.top), w: Math.round(o.width), h: Math.round(o.height) }, border: parseFloat(cs.borderTopWidth) >= 1 ? rgba(cs.borderTopColor) : null, radius: Math.round(parseFloat(cs.borderTopLeftRadius) || 0), pad: Math.round(parseFloat(cs.paddingLeft) || 0) }
      })(),
      // n131: a spreadsheet cell grid: columns, row height, header row fill, right-aligned numbers, coloured cells, a selected
      // cell outline, a total row rule (round 9 e1: one long run of words; header fill, growth colour, selection, rule lost)
      cellGrid: (() => {
        const g = getComputedStyle(el)
        if (g.display !== 'grid' || kids.length < 24 || el.querySelector('[data-r]')) return null
        const ncol = g.gridTemplateColumns.split(' ').length
        if (ncol < 4 || kids.length % ncol) return null
        const o = el.getBoundingClientRect(), base = getComputedStyle(kids[ncol])
        const cell = (k) => { const c = getComputedStyle(k); return { t: (k.innerText || '').trim(), bold: Number(c.fontWeight) >= 600, right: c.textAlign === 'right', ink: rgba(c.color), fill: rgba(c.backgroundColor), outline: parseFloat(c.outlineWidth) >= 1 && c.outlineStyle !== 'none' ? { px: parseFloat(c.outlineWidth), c: rgba(c.outlineColor) } : null, top: parseFloat(c.borderTopWidth) >= 2 ? { px: parseFloat(c.borderTopWidth), c: rgba(c.borderTopColor) } : null } }
        const cells = kids.map(cell), rows = []
        for (let i = 0; i < cells.length; i += ncol) rows.push(cells.slice(i, i + ncol))
        const b0 = kids[0].getBoundingClientRect()
        return { x: Math.round(o.left), y: Math.round(o.top), ncol, colW: Math.round(b0.width), rowH: Math.round(b0.height), line: rgba(base.borderRightColor), lineW: parseFloat(base.borderRightWidth) || 0, pad: Math.round(parseFloat(base.paddingLeft) || 0), ink: rgba(base.color), rows }
      })(),
      // n160: one giant word running across side-by-side panels each turned in 3D (rotateY) with its own shading,
      // each panel a window (overflow hidden) onto its slice of the word (round 15 c3: read as sliced 16px bands)
      foldPanels: (() => {
        if (kids.length < 3 || cs.perspective === 'none') return null
        const t0 = (kids[0].innerText || '').trim()
        if (!t0 || t0.length > 16) return null
        const ok = kids.every((k) => { const s = getComputedStyle(k); return s.overflow === 'hidden' && (k.innerText || '').trim() === t0 && /matrix3d/.test(s.transform) })
        if (!ok) return null
        const o = el.getBoundingClientRect()
        const turn = (k) => { const v = (getComputedStyle(k).transform.match(/matrix3d\(([^)]*)\)/) || [])[1]?.split(',').map(Number); return v ? Math.round(Math.atan2(-v[2], v[0]) * 180 / Math.PI) : 0 }
        const panels = kids.map((k) => { const s = getComputedStyle(k), w = k.firstElementChild ?? k, ws = getComputedStyle(w); return { w: k.offsetWidth, h: k.offsetHeight, turn: turn(k), bg: s.backgroundImage !== 'none' ? s.backgroundImage : null, fill: rgba(s.backgroundColor), left: Math.round(parseFloat(ws.left) || 0), top: Math.round(parseFloat(ws.top) || 0) } })
        const w0 = kids[0].firstElementChild ?? kids[0], ws = getComputedStyle(w0)
        return { t: t0, px: Math.round(parseFloat(ws.fontSize)), weight: Number(ws.fontWeight) || 400, ink: rgba(ws.color), lh: ws.lineHeight, persp: Math.round(parseFloat(cs.perspective)), box: { x: Math.round(o.left), y: Math.round(o.top), w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) }, panels }
      })(),
      // one giant word cut into stacked horizontal bands, each band clipping a different slice of the word at its own
      // x offset (round 9 c1: built as three whole stacked words)
      slicedWord: (() => {
        if (kids.length < 2) return null
        const t0 = (kids[0].innerText || '').trim()
        if (!t0 || t0.length > 16 || !kids.every((k) => getComputedStyle(k).overflow === 'hidden' && (k.innerText || '').trim() === t0)) return null
        const o = el.getBoundingClientRect()
        const bands = kids.map((k) => { const b = k.getBoundingClientRect(), ks = getComputedStyle(k), inner = k.firstElementChild ?? k, ib = inner.getBoundingClientRect(); return { y: Math.round(b.top - o.top), h: Math.round(b.height), w: Math.round(b.width), x: Math.round(b.left - o.left), fill: rgba(ks.backgroundColor), ink: rgba(ks.color), textX: getComputedStyle(inner).position === 'relative' ? Math.round(parseFloat(getComputedStyle(inner).left) || 0) : Math.round(ib.left - b.left), textY: getComputedStyle(inner).position === 'relative' ? Math.round(parseFloat(getComputedStyle(inner).top) || 0) : Math.round(ib.top - b.top) } })
        const ks = getComputedStyle(kids[0])
        return { t: t0, px: Math.round(parseFloat(ks.fontSize)), weight: Number(ks.fontWeight) || 400, spacing: parseFloat(ks.letterSpacing) || 0, lineH: Math.round(parseFloat(ks.lineHeight) || 0), box: { x: Math.round(o.left), y: Math.round(o.top), w: Math.round(o.width), h: Math.round(o.height) }, bands }
      })(),
      // a ruled index: rows each with a top rule, a label at the left and a year/number at the far right (round 9 c1
      // mono index list: no note, built as an invented paragraph)
      ruledIndex: (() => {
        if (kids.length < 3 || el.querySelector('[data-r]')) return null
        const rows = kids.map((k) => { const ks = getComputedStyle(k); const cs2 = [...k.children]; return cs2.length === 2 && ks.display === 'flex' && parseFloat(ks.borderTopWidth) >= 1 ? { l: (cs2[0].innerText || '').trim(), r: (cs2[1].innerText || '').trim(), h: Math.round(k.getBoundingClientRect().height), rule: rgba(ks.borderTopColor), last: parseFloat(ks.borderBottomWidth) >= 1 } : null })
        if (rows.some((r) => !r || !r.l || !r.r)) return null
        return { rows, mono: /mono|courier|consolas/i.test(cs.fontFamily), px: Math.round(parseFloat(cs.fontSize)), w: Math.round(el.getBoundingClientRect().width) }
      })(),
      // a halftone dot-grid disc with solid shapes over it (round 9 c4: no note at all, built nothing)
      halftone: (() => {
        if (!kids.length || kids.some((k) => getComputedStyle(k).position !== 'absolute')) return null
        const dots = kids.find((k) => /radial-gradient/.test(getComputedStyle(k).backgroundImage) && getComputedStyle(k).backgroundSize !== 'auto')
        if (!dots) return null
        const o = el.getBoundingClientRect(), at = (k) => { const b = k.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), round: (() => { const r = getComputedStyle(k).borderTopLeftRadius; return r.includes('%') ? parseFloat(r) >= 40 : parseFloat(r) >= b.width * 0.4 })() } }
        const ds = getComputedStyle(dots)
        return { box: { x: Math.round(o.left), y: Math.round(o.top), w: Math.round(o.width), h: Math.round(o.height) }, dots: { ...at(dots), cell: Math.round(parseFloat(ds.backgroundSize)), c: rgba(ds.backgroundImage), dotPct: Math.round(parseFloat((ds.backgroundImage.match(/\)\s*([\d.]+)%/) || [])[1]) || 40) }, solids: kids.filter((k) => k !== dots && rgba(getComputedStyle(k).backgroundColor)?.a > 0.05).map((k) => ({ ...at(k), c: rgba(getComputedStyle(k).backgroundColor) })) }
      })(),
      // a run of words in outline with some filled (round 9 c5 marquee: said '"FIRE" left, "FIRE" right')
      outlineRun: (() => {
        if (!(parseFloat(cs.webkitTextStrokeWidth) > 0) || (rgba(cs.color)?.a ?? 1) >= 0.05) return null
        const words = []
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (let n; (n = tw.nextNode());) { const s = getComputedStyle(n.parentElement); const solid = (rgba(s.color)?.a ?? 1) >= 0.05; for (const w of n.textContent.split(/\s+/).filter(Boolean)) words.push({ w, solid, ink: solid ? rgba(s.color) : null }) }
        return words.length >= 2 && words.some((x) => x.solid) ? { words, stroke: parseFloat(cs.webkitTextStrokeWidth), c: rgba(cs.webkitTextStrokeColor) } : null
      })(),
      // a stack of same-size cards turned in 3D inside a perspective box (round 8 c1: read as one flat picture)
      cards3d: (() => {
        const ks = kids.filter((k) => getComputedStyle(k).position === 'absolute' && /matrix3d|rotate[XY]/.test(getComputedStyle(k).transform + (k.style.transform || '')))
        if (ks.length < 2 || ks.length !== kids.length || cs.perspective === 'none') return null
        const o = el.getBoundingClientRect()
        const tf = (k) => { const m = (document.styleSheets.length ? [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules] } catch { return [] } }).filter((r) => r.selectorText && k.matches(r.selectorText) && r.style.transform).map((r) => r.style.transform).pop() : null); return m ?? getComputedStyle(k).transform }
        return { perspective: Math.round(parseFloat(cs.perspective)), box: { x: Math.round(o.left), y: Math.round(o.top), w: Math.round(o.width), h: Math.round(o.height) },
          cards: ks.map((k) => { const s = getComputedStyle(k); return { left: Math.round(k.offsetLeft), top: Math.round(k.offsetTop), w: k.offsetWidth, h: k.offsetHeight, radius: Math.round(parseFloat(s.borderTopLeftRadius) || 0), bg: s.backgroundImage !== 'none' ? s.backgroundImage : null, fill: rgba(s.backgroundColor), op: Math.round(parseFloat(s.opacity) * 100), transform: tf(k), border: parseFloat(s.borderTopWidth) ? { px: parseFloat(s.borderTopWidth), c: rgba(s.borderTopColor) } : null, shadow: s.boxShadow !== 'none' ? s.boxShadow : null,
            parts: [...k.children].map((g) => { const gs = getComputedStyle(g); return { t: (g.innerText || '').trim(), x: g.offsetLeft, y: g.offsetTop, w: g.offsetWidth, h: g.offsetHeight, px: Math.round(parseFloat(gs.fontSize)), weight: Number(gs.fontWeight), fill: rgba(gs.backgroundColor), round: parseFloat(gs.borderTopLeftRadius) >= g.offsetWidth * 0.4, ink: rgba(gs.color) } }) } }) }
      })(),
      shown: (() => {
        const t = (el.innerText || '').trim(); if (!t || t.length > 120 || cs.writingMode !== 'horizontal-tb') return null
        const out = []; let lastTop = null, lo = Infinity, hi = -Infinity, glued = false
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (let n; (n = tw.nextNode());) {
          const s = n.textContent, re = /\S+/g; let m
          while ((m = re.exec(s))) {
            const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length)
            const rr = rg.getBoundingClientRect(); if (!rr.width) continue
            const newLine = lastTop === null || rr.top > lastTop + rr.height * 0.5
            if (newLine) { out.push([]); lastTop = rr.top }
            // a word split across elements with no space between ('<em>depth</em>, not': round 8 c1 said 'depth , not')
            const line = out[out.length - 1]
            if (!newLine && glued && m.index === 0 && line.length) line[line.length - 1] += m[0]; else line.push(m[0])
            lo = Math.min(lo, rr.left); hi = Math.max(hi, rr.right)
          }
          glued = !!s && !/\s$/.test(s)
        }
        return out.length ? { lines: out.map((l) => l.join(' ')), w: Math.round(hi - lo), x: Math.round(lo) } : null
      })(),
      // the untransformed box (a tilted floor shows shorter than it is built: round 6 c1)
      layoutBox: { w: el.offsetWidth, h: el.offsetHeight },
      el: el.offsetParent === document.body || el.offsetParent === null ? { x: el.offsetLeft, y: el.offsetTop } : null,
      tokenInks: [...el.querySelectorAll('b,em,span,i,strong')].filter((k) => !k.children.length && txt(k)).map((k) => ({ t: txt(k), c: rgba(getComputedStyle(k).color) })),
      // a small textless pill: a toggle switch
      toggle: [...el.querySelectorAll('*')].map((k) => { const c = getComputedStyle(k); const b = k.getBoundingClientRect(); return !(k.innerText || '').trim() && b.width >= 30 && b.width <= 70 && b.height >= 16 && b.height <= 40 && b.width > b.height * 1.3 && parseFloat(c.borderTopLeftRadius) >= b.height / 2 - 1 ? rgba(c.backgroundColor) : null }).find(Boolean) || null,
      dense: dense(el),
      // n138: every painted or worded part inside the region (not inside a nested region), in page px, so a region the
      // rules leave weak (round 10 e1 control bar 'picture with Leave', e2 diff unsaid, e5 form fields never drawn) can
      // be said part by part
      parts: (() => {
        const out = []
        const pbg = (k) => { for (let p = k.parentElement; p; p = p.parentElement) { const c = rgba(getComputedStyle(p).backgroundColor); if (c && c.a > 0.05) return c } return { r: 255, g: 255, b: 255, a: 1 } }
        // the region's own loose text lines (round 10 e3 side nav: '<b>Home</b><br>Search<hr>...<br>Gym Hits')
        const es = getComputedStyle(el)
        for (const n of el.childNodes) {
          const t = n.nodeType === 3 ? n.textContent.replace(/\s+/g, ' ').trim() : ''
          if (!t) continue
          const rg = document.createRange(); rg.selectNodeContents(n); const b = rg.getBoundingClientRect()
          if (b.width < 2) continue
          out.push({ x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), t: t.slice(0, 70), px: Math.round(parseFloat(es.fontSize)), bold: Number(es.fontWeight) >= 600, ink: rgba(es.color), mono: /mono|courier|consolas/i.test(es.fontFamily), fill: null, img: null, radius: 0, border: null, ring: null, inset: null, op: 100 })
        }
        const all = [...el.querySelectorAll('*')].filter((k) => { const reg = k.closest('[data-r]'); return reg === el || (!reg && el === document.body) })
        const preDone = [], inlDone = new Set()
        const gen = (fam) => (/mono|courier|consolas/i.test(fam) ? 'mono' : /georgia|times|garamond|playfair|didot|bodoni/i.test(fam) || (/serif/i.test(fam) && !/sans-serif/i.test(fam)) ? 'serif' : 'sans')
        const bodyGen = gen(getComputedStyle(document.body).fontFamily)
        for (const k of all) {
          if (inlDone.has(k)) continue
          const s = getComputedStyle(k), b = k.getBoundingClientRect()
          if (s.display === 'none' || s.visibility === 'hidden' || b.width < 2 || b.height < 2 || parseFloat(s.opacity) < 0.05) continue
          if (preDone.some((q) => q.contains(k))) continue
          // n145: a pre block of several lines (round 11 e1 terminal: its lines collapsed into one run and its coloured
          // marks placed apart at their own x,y, so the output came out scrambled) is ONE part said line by line
          if (/^pre/.test(s.whiteSpace) && (k.textContent || '').trim().includes('\n')) {
            preDone.push(k)
            const base = rgba(s.color), lines = [{ text: '', runs: [] }]
            const walk = (n) => {
              if (n.nodeType === 3) { const segs = n.textContent.split('\n'); segs.forEach((g, i) => { if (i) lines.push({ text: '', runs: [] }); lines[lines.length - 1].text += g }); return }
              if (n.nodeType !== 1) return
              const c = rgba(getComputedStyle(n).color), t = (n.textContent || '').trim()
              if (n !== k && t && !t.includes('\n') && c && base && Math.hypot(c.r - base.r, c.g - base.g, c.b - base.b) > 12) { lines[lines.length - 1].runs.push({ t, c }); lines[lines.length - 1].text += n.textContent; return }
              n.childNodes.forEach(walk)
            }
            k.childNodes.forEach(walk)
            while (lines.length && !lines[0].text.trim()) lines.shift()
            while (lines.length && !lines[lines.length - 1].text.trim()) lines.pop()
            const fill = rgba(s.backgroundColor), pf = pbg(k)
            out.push({ x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), t: null, pre: { lines: lines.map((l) => ({ text: l.text.replace(/\s+$/, ''), runs: l.runs })), lh: Math.round(parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2), padT: Math.round(parseFloat(s.paddingTop) || 0), padL: Math.round(parseFloat(s.paddingLeft) || 0) },
              px: Math.round(parseFloat(s.fontSize)), bold: false, wt: Number(s.fontWeight), it: false, ink: base, mono: /mono|courier|consolas/i.test(s.fontFamily),
              fill: fill && fill.a > 0.05 && Math.hypot(fill.r - pf.r, fill.g - pf.g, fill.b - pf.b) > 6 ? fill : null, img: null, radius: 0, border: null, ring: null, inset: null, op: 100 })
            continue
          }
          let own = [...k.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim()
          // n176: a line with a word styled inline (round 17 c4 'Gardens that <i>remember</i> the rain': said as 'Gardens that
          // the rain' plus a separate 'remember' placed apart) keeps its whole text, the styled words said in place
          let runs = null
          if (own) {
            const inl = [...k.children].filter((c) => { const cs2 = getComputedStyle(c); const f2 = rgba(cs2.backgroundColor); return cs2.display === 'inline' && !c.children.length && (c.textContent || '').trim() && !(f2 && f2.a > 0.05) && !(parseFloat(cs2.borderBottomWidth) >= 1) && !c.dataset.r })
            // only a plain run of words: every child such a span, same size (round 17 e5 timeline rows hold a block <p> and
            // a filled icon: left part by part)
            if (inl.length && inl.length === k.children.length && inl.every((c) => getComputedStyle(c).fontSize === s.fontSize) && !inl.some((c) => { const nx = c.nextSibling?.nodeType === 3 ? c.nextSibling.textContent : '', pv = c.previousSibling?.nodeType === 3 ? c.previousSibling.textContent : ''; return (/^[\w(]/.test(nx) && /\w$/.test(c.textContent)) || (/\w$/.test(pv) && /^\w/.test(c.textContent)) })) {
              inl.forEach((c) => inlDone.add(c))
              own = (k.textContent || '').replace(/\s+/g, ' ').trim()
              runs = inl.map((c) => { const cs2 = getComputedStyle(c); return { t: c.textContent.replace(/\s+/g, ' ').trim(), it: cs2.fontStyle === 'italic' && s.fontStyle !== 'italic', bold: Number(cs2.fontWeight) >= 600 && Number(s.fontWeight) < 600, mono: gen(cs2.fontFamily) === 'mono' && gen(s.fontFamily) !== 'mono', ink: rgba(cs2.color) } })
            }
          }
          // n176: a paragraph opening on a drop cap, and one with a block floated inside it that its lines wrap round
          const flc = own ? getComputedStyle(k, '::first-letter') : null
          const cap = flc && flc.float === 'left' && parseFloat(flc.fontSize) >= 2 * parseFloat(s.fontSize) ? { px: Math.round(parseFloat(flc.fontSize)), ink: rgba(flc.color), letter: own[0] } : null
          const flo = own ? [...k.children].find((c) => getComputedStyle(c).float !== 'none' && c.getBoundingClientRect().width >= 80 && c.getBoundingClientRect().height >= 80) : null
          const wrap = flo ? (() => { const fs2 = getComputedStyle(flo), fb = flo.getBoundingClientRect(); return { side: fs2.float, w: Math.round(fb.width), h: Math.round(fb.height), round: fs2.shapeOutside !== 'none' || parseFloat(fs2.borderTopLeftRadius) >= fb.width * 0.4, name: flo.dataset.r || null } })() : null
          const fill = rgba(s.backgroundColor), pf = pbg(k)
          const hasFill = fill && fill.a > 0.05 && Math.hypot(fill.r - pf.r, fill.g - pf.g, fill.b - pf.b) > 6
          const img = s.backgroundImage !== 'none' ? s.backgroundImage : null
          const bw = ['Top', 'Right', 'Bottom', 'Left'].map((d) => parseFloat(s[`border${d}Width`]) || 0)
          // n148: the colour of the widest drawn side (round 12 e5: bottom-only #f1f5f9 row lines read from the unset top
          // side, which is the text colour, and built dark)
          const bi = bw.indexOf(Math.max(...bw))
          const bc = rgba(s[`border${['Top', 'Right', 'Bottom', 'Left'][bi]}Color`]) || rgba(s.borderTopColor)
          const ring = parseFloat(s.outlineWidth) >= 1 && s.outlineStyle !== 'none' ? { px: parseFloat(s.outlineWidth), c: rgba(s.outlineColor) } : null
          const inset = /inset/.test(s.boxShadow) ? s.boxShadow : null
          // n168: a line number (or other short label) written by ::before from an attribute (round 16 e3 split diff:
          // content: attr(data-n), the gutter numbers lost) is its own part at its own place
          {
            const pb = getComputedStyle(k, '::before'), cv = pb.content || ''
            const am = cv.match(/^attr\(([\w-]+)\)$/), lab = am ? (k.getAttribute(am[1]) || '') : /^["']/.test(cv) ? cv.slice(1, -1) : ''
            if (lab.trim() && lab.length <= 12 && pb.position === 'absolute') {
              const pw = parseFloat(pb.width) || 0
              out.push({ x: Math.round(b.left + (parseFloat(pb.left) || 0)), y: Math.round(b.top + (parseFloat(pb.top) || 0)), w: Math.round(pw || 20), h: Math.round(b.height), t: lab.trim(), px: Math.round(parseFloat(pb.fontSize)), bold: Number(pb.fontWeight) >= 600, wt: Number(pb.fontWeight), it: false, ink: rgba(pb.color), mono: /mono|courier|consolas/i.test(pb.fontFamily), fill: null, img: null, radius: 0, border: null, ring: null, inset: null, op: 100, ra: pb.textAlign === 'right' || pb.textAlign === 'end' })
            }
          }
          if (!own && !hasFill && !img && !bw.some((x) => x >= 1) && !ring && !inset) continue
          // n143: a paragraph block three lines or taller keeps its whole copy (round 11 e3 mail body: cut at 70 letters, the
          // rest lost)
          out.push({ x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), t: own.slice(0, b.height >= 3 * parseFloat(s.fontSize) * 1.2 && own.length > 70 ? 1200 : runs ? 140 : 70), lh: Math.round(parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2), nl: own && !/^vertical/.test(s.writingMode) ? (() => { const rg = document.createRange(); rg.selectNodeContents(k); const tops = [...rg.getClientRects()].filter((q) => q.width > 1).map((q) => q.top).sort((x, y) => x - y); const lh0 = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2; return tops.reduce((n, t, i) => (i === 0 || t - tops[i - 1] > lh0 * 0.6 ? n + 1 : n), 0) })() : 0, runs, cap, wrap, face: own && gen(s.fontFamily) !== bodyGen && gen(s.fontFamily) !== 'mono' ? gen(s.fontFamily) : null,
            px: Math.round(parseFloat(s.fontSize)), bold: Number(s.fontWeight) >= 600, wt: Number(s.fontWeight), it: s.fontStyle === 'italic', ink: rgba(s.color), mono: /mono|courier|consolas/i.test(s.fontFamily),
            fill: hasFill ? fill : null, img: img && img.length < 220 ? img : img ? img.slice(0, 220) : null,
            radius: s.borderTopLeftRadius.includes('%') ? (parseFloat(s.borderTopLeftRadius) >= 40 ? 999 : 0) : Math.round(parseFloat(s.borderTopLeftRadius) || 0),
            border: bw.some((x) => x >= 1) ? { w: bw, c: bc, style: s.borderTopStyle !== 'none' ? s.borderTopStyle : s.borderBottomStyle } : null, ring, inset, op: Math.round(parseFloat(s.opacity) * 100) , padL: own ? Math.round(parseFloat(s.paddingLeft) || 0) : 0,
            // n175: vertical type (round 17 c5 '99.99%' set vertical-rl turned 180deg, built horizontal), a line wider than the
            // tile that clips it (the logo strip built spilling out of its tile), and its CSS animation
            vert: own && /^vertical/.test(s.writingMode) ? (/^matrix\(-1,/.test(s.transform) ? 'up' : 'down') : null,
            clip: own ? (() => { for (let q = k.parentElement; q && q !== document.body; q = q.parentElement) { const qs = getComputedStyle(q); if (/hidden|clip/.test(qs.overflowX)) { const qb = q.getBoundingClientRect(); return b.width > qb.width + 4 ? { w: Math.round(qb.width), x: Math.round(qb.left), shown: Math.round(Math.min(b.right, qb.right) - Math.max(b.left, qb.left)) } : null } } return null })() : null,
            anim: s.animationName && s.animationName !== 'none' ? (() => { const kf = [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules] } catch { return [] } }).find((r) => r.type === 7 && r.name === s.animationName.split(',')[0].trim()); return { name: s.animationName, dur: s.animationDuration, timing: s.animationTimingFunction, iter: s.animationIterationCount, delay: s.animationDelay, origin: (() => { const o = s.transformOrigin.split(' ').map(parseFloat); return o[1] >= k.offsetHeight - 1 ? 'bottom' : o[1] <= 1 ? 'top' : 'center' })(), kf: kf ? kf.cssText.replace(/\s+/g, ' ').slice(0, 240) : null } })() : null })
          if (out.length > 120) break
        }
        return out
      })(),
      // each corner's radius (a dropdown hangs square-topped from its bar, round 6 e1)
      corners: ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((c) => parseFloat(cs[`border${c}Radius`]) || 0),
      // a picture block painted by ::before/::after (round 6 e1 featured card's gradient square: unsaid)
      pseudoPic: (() => { for (const w of ['::before', '::after']) { const c = getComputedStyle(el, w); const pw = parseFloat(c.width), ph = parseFloat(c.height); if (!c.content || c.content === 'none' || !(pw >= 40 && ph >= 40) || pw > 200 || ph > 200 || pw >= r.width * 0.6) continue; const g = [...c.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0])).filter(Boolean); const fl = rgba(c.backgroundColor); if (!g.length && !(fl?.a > 0.05)) continue; return { w: Math.round(pw), h: Math.round(ph), grad: g.length >= 2 ? g : null, fill: fl?.a > 0.05 ? fl : null, radius: Math.round(parseFloat(c.borderTopLeftRadius) || 0), x: Math.round(parseFloat(c.left) || 0), y: Math.round(parseFloat(c.top) || 0) } } return null })(),
      // a big solid shape painted by ::before/::after over a photo backdrop (round 7 e4 jacket: over 200px, unsaid)
      pseudoShape: (() => { for (const w of ['::before', '::after']) { const c = getComputedStyle(el, w); const pw = parseFloat(c.width), ph = parseFloat(c.height); if (!c.content || c.content === 'none' || !(pw > 120 && ph > 120) || pw >= r.width * 0.9) continue; const fl = rgba(c.backgroundColor); if (!(fl?.a > 0.3)) continue; return { w: Math.round(pw), h: Math.round(ph), fill: fl, radius: c.borderRadius, x: Math.round(parseFloat(c.left) || 0), y: Math.round(parseFloat(c.top) || 0) } } return null })(),
      // a 2px+ outline ring round the block (a selected thumbnail, round 7 e4)
      ring: (() => { const ow = parseFloat(cs.outlineWidth) || 0; return ow >= 2 && cs.outlineStyle !== 'none' ? { w: Math.round(ow), off: Math.round(parseFloat(cs.outlineOffset) || 0), colour: rgba(cs.outlineColor) } : null })(),
      // small square handles sitting on the block's corners (a selected layer in a design tool, round 8 e3: lost)
      // n127: top corners arched, bottom flat (a curved cinema screen, round 8 e4: built a flat bar)
      arch: (() => { const v = (x) => { const p = x.trim().split(/\s+/); return parseFloat(p[1] ?? p[0]) || 0 }; return v(cs.borderTopLeftRadius) > 0 && v(cs.borderTopRightRadius) > 0 && v(cs.borderBottomLeftRadius) === 0 && v(cs.borderBottomRightRadius) === 0 && r.width >= r.height * 8 ? true : null })(),
      // n127: each child's own box (an app toolbar's filled active tool and Share button, round 8 e3: both built plain)
      kidCells: kids.length >= 4 && kids.length <= 14 ? kids.map((k) => { const kc = getComputedStyle(k), kb = k.getBoundingClientRect(), f2 = rgba(kc.backgroundColor); return { t: (k.innerText || '').replace(/\s+/g, ' ').trim(), fill: f2 && f2.a > 0.05 ? f2 : null, w: Math.round(kb.width), h: Math.round(kb.height), x: Math.round(kb.left - r.left), rad: Math.round(parseFloat(kc.borderTopLeftRadius) || 0), bold: Number(kc.fontWeight) >= 600, ink: rgba(kc.color) } }) : null,
      // n127: a legend: each item led by a small ::before swatch square (round 8 e4: said as plain links, swatches lost)
      swatchKids: kids.length >= 2 && kids.length <= 8 && kids.every((k) => { const b = getComputedStyle(k, '::before'); return b.content !== 'none' && parseFloat(b.width) >= 8 && parseFloat(b.width) <= 24 }) ? kids.map((k) => { const b = getComputedStyle(k, '::before'); const bf = rgba(b.backgroundColor); return { t: (k.innerText || '').trim(), px: Math.round(parseFloat(b.width)), rad: Math.round(parseFloat(b.borderTopLeftRadius) || 0), fill: bf && bf.a > 0.05 ? bf : null, border: parseFloat(b.borderTopWidth) >= 1 ? rgba(b.borderTopColor) : null } }) : null,
      handles: (() => { const cs4 = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]]; const hs = [...document.body.querySelectorAll('*')].filter((k) => { if (el.contains(k) || k.contains(el)) return false; const b = k.getBoundingClientRect(); if (b.width < 5 || b.width > 14 || Math.abs(b.width - b.height) > 1.5) return false; const cx = b.left + b.width / 2, cy = b.top + b.height / 2; return cs4.some(([x, y]) => Math.abs(cx - x) <= 6 && Math.abs(cy - y) <= 6) }); if (hs.length < 2) return null; const c = getComputedStyle(hs[0]); return { n: hs.length, px: Math.round(hs[0].getBoundingClientRect().width), fill: rgba(c.backgroundColor), border: parseFloat(c.borderTopWidth) >= 1 ? rgba(c.borderTopColor) : null } })(),
      // an inspector panel: small caps section headings, each over rows of filled field boxes (round 8 e3: fields built bare)
      fieldSecs: (() => { const kids = [...el.children]; const head = (k) => /^H[4-6]$/.test(k.tagName) && txt(k) && txt(k).length <= 24; if (kids.filter(head).length < 3) return null; const bgEl = rgba(cs.backgroundColor); const secs = []; let cur = null
        for (const k of kids) { if (head(k)) { cur = { h: txt(k), rows: [] }; secs.push(cur); continue } if (!cur) continue
          const boxes = (k.children.length ? [...k.children] : [k]).filter((b) => { const c = rgba(getComputedStyle(b).backgroundColor); return c && c.a > 0.05 && (!bgEl || Math.abs(c.r - bgEl.r) + Math.abs(c.g - bgEl.g) + Math.abs(c.b - bgEl.b) > 6) })
          const own = rgba(getComputedStyle(k).backgroundColor); const kFilled = own && own.a > 0.05 && (!bgEl || Math.abs(own.r - bgEl.r) + Math.abs(own.g - bgEl.g) + Math.abs(own.b - bgEl.b) > 6)
          if (kFilled) { const sw = [...k.querySelectorAll('i,span')].find((x) => !txt(x) && x.getBoundingClientRect().width <= 24 && rgba(getComputedStyle(x).backgroundColor)?.a > 0.05); cur.rows.push([{ t: (k.innerText || '').replace(/\s+/g, ' ').trim(), fill: own, rad: Math.round(parseFloat(getComputedStyle(k).borderTopLeftRadius) || 0), sw: sw ? { fill: rgba(getComputedStyle(sw).backgroundColor), px: Math.round(sw.getBoundingClientRect().width) } : null }]) }
          else if (boxes.length) cur.rows.push(boxes.map((b) => ({ t: txt(b) || (b.innerText || '').trim(), fill: rgba(getComputedStyle(b).backgroundColor), rad: Math.round(parseFloat(getComputedStyle(b).borderTopLeftRadius) || 0), sw: null }))) }
        const nf = secs.reduce((a, x) => a + x.rows.flat().length, 0); return nf >= 3 ? secs : null })(),
      // a round dot hung on the element by ::before/::after (a calendar now-line's knob, round 6 e5)
      pseudoDot: (() => { for (const w of ['::before', '::after']) { const c = getComputedStyle(el, w); const pw = parseFloat(c.width), ph = parseFloat(c.height); if (c.content && c.content !== 'none' && pw >= 4 && pw <= 20 && Math.abs(pw - ph) <= 1 && parseFloat(c.borderTopLeftRadius) >= pw * 0.4 && rgba(c.backgroundColor)?.a > 0.05) return { px: Math.round(pw), at: (parseFloat(c.left) || 0) < r.width / 2 ? 'left' : 'right' } } return null })(),
      // small bordered or filled leaf labels anywhere inside (a toolbar's buttons in nested groups)
      leafButtons: [...el.querySelectorAll('*')].filter((k) => { const c = getComputedStyle(k); const t = txt(k); const b = k.getBoundingClientRect(); return t && t.length <= 24 && !k.children.length && b.height >= 26 && b.height <= 56 && (rgba(c.backgroundColor)?.a > 0.05 || parseFloat(c.borderTopWidth) >= 1) }).map((k) => ({ t: txt(k), fill: rgba(getComputedStyle(k).backgroundColor), border: rgba(getComputedStyle(k).borderTopColor), x: k.getBoundingClientRect().left })),
      // a progress bar: a thin filled bar inside a thin track (round 4 e4 storage meter)
      progress: (() => {
        for (const t of [el, ...el.querySelectorAll('*')]) {
          const u = t.firstElementChild; if (!u || txt(t)) continue
          const a = t.getBoundingClientRect(), b = u.getBoundingClientRect()
          if (a.height <= 14 && a.width >= 60 && b.height >= a.height - 2 && b.width < a.width * 0.98 && rgba(getComputedStyle(t).backgroundColor)?.a > 0.05 && rgba(getComputedStyle(u).backgroundColor)?.a > 0.05) return { pct: Math.round(b.width / a.width * 100), fill: rgba(getComputedStyle(u).backgroundColor), track: rgba(getComputedStyle(t).backgroundColor), lines: (el.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean) }
        }
        return null
      })(),
      // a column or row of bare small round dots (round 4 c5 story step dots: unsaid, so dropped)
      dotKids: (() => {
        if (kids.length < 3 || txt(el)) return null
        const bs = kids.map((k) => k.getBoundingClientRect())
        const ok = kids.every((k, i) => !k.children.length && bs[i].width >= 4 && bs[i].width <= 24 && Math.abs(bs[i].width - bs[i].height) <= 2 && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= bs[i].width * 0.4 && rgba(getComputedStyle(k).backgroundColor)?.a > 0.05)
        // a row of short flat dashes (a slide indicator, round 8 c1: no note, dropped): each dash's width, one active
        const dash = !ok && kids.every((k, i) => !k.children.length && bs[i].height >= 2 && bs[i].height <= 8 && bs[i].width >= 16 && bs[i].width <= 120 && Math.abs(bs[i].top - bs[0].top) <= 2 && rgba(getComputedStyle(k).backgroundColor)?.a > 0.05)
        if (dash) return { dashes: kids.map((k, i) => ({ w: Math.round(bs[i].width), fill: rgba(getComputedStyle(k).backgroundColor) })), h: Math.round(bs[0].height), gap: Math.round(bs[1].left - bs[0].right), radius: Math.round(parseFloat(getComputedStyle(kids[0]).borderTopLeftRadius) || 0), fills: [] }
        if (!ok) return null
        const vert = bs[1].top - bs[0].top > Math.abs(bs[1].left - bs[0].left)
        return { px: Math.round(bs[0].width), vert, gap: Math.round(vert ? bs[1].top - bs[0].bottom : bs[1].left - bs[0].right), fills: kids.map((k) => rgba(getComputedStyle(k).backgroundColor)) }
      })(),
      // a row of empty cards (round 6 e1: 4 white bordered cards under the menu, unsaid, built as one box)
      emptyCards: (() => {
        if (kids.length < 2 || kids.length > 8 || txt(el)) return null
        const bs = kids.map((k) => k.getBoundingClientRect()), cs0 = getComputedStyle(kids[0])
        const ok = kids.every((k, i) => !k.children.length && bs[i].width >= 80 && bs[i].height >= 80 && Math.abs(bs[i].width - bs[0].width) <= 4 && Math.abs(bs[i].height - bs[0].height) <= 4 && (rgba(getComputedStyle(k).backgroundColor)?.a > 0.05 || parseFloat(getComputedStyle(k).borderTopWidth) >= 1))
        if (!ok) return null
        const vert = bs[1].top - bs[0].top > Math.abs(bs[1].left - bs[0].left)
        return { n: kids.length, w: Math.round(bs[0].width), h: Math.round(bs[0].height), vert, gap: Math.round(vert ? bs[1].top - bs[0].bottom : bs[1].left - bs[0].right), fill: rgba(cs0.backgroundColor), bw: parseFloat(cs0.borderTopWidth) || 0, border: rgba(cs0.borderTopColor), radius: Math.round(parseFloat(cs0.borderTopLeftRadius) || 0) }
      })(),
      // a filled block holding only small textless icon tiles (round 5 e3 workspace rail: drawn as a
      // picture placeholder, built as a crossed-out X)
      iconKids: (() => {
        if (kids.length < 2 || kids.length > 8 || txt(el)) return null
        const bs = kids.map((k) => k.getBoundingClientRect())
        const ok = kids.every((k, i) => !k.children.length && bs[i].width >= 12 && bs[i].width <= 64 && Math.abs(bs[i].width - bs[i].height) <= 3 && rgba(getComputedStyle(k).backgroundColor)?.a > 0.05)
        if (!ok) return null
        const vert = bs[1].top - bs[0].top > Math.abs(bs[1].left - bs[0].left)
        const r = parseFloat(getComputedStyle(kids[0]).borderTopLeftRadius)
        return { px: Math.round(bs[0].width), vert, round: r >= bs[0].width * 0.4, radius: Math.round(r), gap: Math.round(vert ? bs[1].top - bs[0].bottom : bs[1].left - bs[0].right),
          fills: kids.map((k) => rgba(getComputedStyle(k).backgroundColor)), faint: kids.map((k) => Number(getComputedStyle(k).opacity) < 0.6 || rgba(getComputedStyle(k).backgroundColor).a < 0.6) }
      })(),
      // a stepper: each item leads with a small round numbered circle (round 4 e3 said 'links: 1Cart, 2Shipping')
      stepper: (() => {
        if (kids.length < 3) return null
        const st = kids.map((k) => {
          const c = k.firstElementChild; if (!c) return null
          const b = c.getBoundingClientRect(); const t = txt(c)
          if (!/^\d{1,2}$/.test(t) || b.width > 44 || b.width < 14 || Math.abs(b.width - b.height) > 3 || parseFloat(getComputedStyle(c).borderTopLeftRadius) < b.width * 0.4) return null
          return { n: t, label: txt(k).replace(t, '').trim(), fill: rgba(getComputedStyle(c).backgroundColor), ink: rgba(getComputedStyle(k).color), px: Math.round(b.width) }
        })
        return st.every(Boolean) ? st : null
      })(),
      // radio options: each item holds a small round hollow ring (round 4 e3 delivery choices said as 'buttons')
      radios: (() => {
        if (kids.length < 2) return null
        const rs = kids.map((k) => {
          const ring = [...k.querySelectorAll('*')].find((g) => { const b = g.getBoundingClientRect(); const c = getComputedStyle(g); return !txt(g) && !g.children.length && b.width >= 10 && b.width <= 28 && Math.abs(b.width - b.height) <= 2 && parseFloat(c.borderTopLeftRadius) >= b.width * 0.4 && parseFloat(c.borderTopWidth) >= 1 })
          if (!ring) return null
          const leaves = [...k.children].map(txt).filter(Boolean)
          return { parts: leaves, ring: parseFloat(getComputedStyle(ring).borderTopWidth), border: parseFloat(getComputedStyle(k).borderTopWidth) || 0, ink: rgba(getComputedStyle(ring).borderTopColor) }
        })
        if (!rs.every(Boolean)) return null
        const maxR = Math.max(...rs.map((r) => r.ring))
        const stacked = kids.every((k, i) => i === 0 || k.getBoundingClientRect().top >= kids[i - 1].getBoundingClientRect().bottom - 2)
        return { stacked, items: rs.map((r) => ({ parts: r.parts, sel: r.ring === maxR && rs.filter((x) => x.ring === maxR).length === 1, thick: r.border >= 2 })) }
      })(),
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
      // ...nor does a short modifier class ('m u sel': an unread, selected mail row is still a row; round 4 e2)
      for (const k of p.children) { const key = `${k.tagName}.${(k.getAttribute("class") ?? "").replace(/\b(on|active|selected|sel|current|today|open|unread|read|old|u)\b/g, '').trim()}`; groups.set(key, [...(groups.get(key) ?? []), k]) }
      // marked regions are drawn on their own: they aren't a list's items
      for (const g of groups.values()) if (g.length >= 3 && g.length > best.length && g.every((k) => txt(k) && !k.dataset?.r && !k.querySelector('[data-r]'))) best = g
    }
    return best
  }
  // a table row's cells say their parts: checkbox, round letter avatar, status pill, usage bar, bold or grey copy
  // (round 7 e5: rows unsaid beyond the columns; avatars read as status pills 'A', 'B'; checkboxes and bars lost)
  const cellParts = (c, ink0) => {
    const out = [], used = new Set()
    const cd = (x, y) => (x && y ? Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b) : 999)
    for (const k of c.querySelectorAll('*')) {
      if ([...used].some((u) => u.contains(k))) continue
      const s = getComputedStyle(k), b = k.getBoundingClientRect(), t = txt(k), fl = filled(k), rad = parseFloat(s.borderTopLeftRadius) || 0
      if (b.width >= 11 && b.width <= 22 && Math.abs(b.width - b.height) <= 2 && parseFloat(s.borderTopWidth) >= 1 && rad <= 6 && t.length <= 1) { out.push({ k: 'cb', fill: fl }); used.add(k); continue }
      if (fl && b.width >= 18 && b.width <= 48 && Math.abs(b.width - b.height) <= 2 && rad >= b.width / 2 - 1 && t.length <= 2) { out.push({ k: 'av', fill: fl, px: Math.round(b.width), t }); used.add(k); continue }
      if (b.height <= 10 && b.width >= 30 && fl && k.children.length === 1 && !t) {
        const i = k.children[0], ib = i.getBoundingClientRect(), f2 = filled(i)
        if (f2) { out.push({ k: 'bar', px: Math.round(b.width), fill: f2, track: fl, pct: Math.round(ib.width / b.width * 100) }); used.add(k); continue }
      }
      if (fl && t && t.length <= 18 && !k.children.length && b.height <= 30 && rad >= 3) { out.push({ k: 'pill', ink: rgba(s.color), fill: fl, t }); used.add(k); continue }
    }
    // the copy left once the parts are taken out
    const rest = !used.size ? txt(c) : [...c.childNodes].map((n) => n.nodeType === 3 ? n.textContent : used.has(n) ? '' : (n.innerText ?? '')).join(' ').replace(/\s+/g, ' ').trim()
    if (rest) {
      const el = [...c.querySelectorAll('b,strong')].find((x) => !used.has(x)) ?? c
      out.push({ k: 'txt', t: rest, bold: Number(getComputedStyle(el).fontWeight) >= 600, dim: cd(rgba(getComputedStyle(c).color), ink0) > 60 })
    }
    return out
  }
  const richTable = (tb, box = null) => {
    const rows = [...tb.querySelectorAll('tr')]
    if (rows.length < 4 || rows.length > 13 || !rows[0].querySelector('th')) return null
    const body = rows.slice(1), ink0 = rgba(getComputedStyle(tb).color)
    const cells = body.map((r) => [...r.children].map((c) => cellParts(c, ink0)))
    // pills alone are said well enough by the plain table line (rounds 3, 4); checkboxes, avatars and bars are not
    if (!cells.flat(2).some((x) => /^(cb|av|bar)$/.test(x.k))) return null
    const bgOf = (r) => { const c = r.children[0]; return filled(c) ?? filled(r) }
    const tints = body.map(bgOf)
    const sel = body.map((r, i) => tints[i] ? i + 1 : 0).filter(Boolean)
    const th = rows[0].children[0], ths = getComputedStyle(th)
    const td = body[0].children[0]
    return {
      head: [...rows[0].children].map((c) => cellParts(c, ink0)), headFill: filled(th) ?? filled(rows[0]), headPx: Math.round(parseFloat(ths.fontSize)),
      rowPx: Math.round(body[0].getBoundingClientRect().height), ruled: parseFloat(getComputedStyle(td).borderTopWidth) >= 1 ? rgba(getComputedStyle(td).borderTopColor) : null,
      cells, sel: sel.length && sel.length < body.length ? { rows: sel, fill: tints[sel[0] - 1] } : null,
      // each column's left edge from the table's left (round 7 e5: columns built unevenly spaced, Email wide)
      colLefts: [...rows[0].children].map((c) => Math.round(c.getBoundingClientRect().left - tb.getBoundingClientRect().left)),
      tableW: Math.round(tb.getBoundingClientRect().width),
      // the filled, bordered, rounded box the table sits in (round 7 e5: built bare on the page, card lost)
      card: (() => {
        if (!box || box === tb) return null
        const bs = getComputedStyle(box), fl = filled(box), bw = parseFloat(bs.borderTopWidth) || 0, rad = parseFloat(bs.borderTopLeftRadius) || 0
        if (!fl || (!bw && !rad)) return null
        return { fill: fl, w: Math.round(box.getBoundingClientRect().width), border: bw ? { px: Math.round(bw), c: rgba(bs.borderTopColor) } : null, rad: Math.round(rad), clip: bs.overflow === 'hidden' }
      })(),
    }
  }
  function dense(el) {
    const cs = getComputedStyle(el)
    // round 8 e1: a compose window floating over the page (dark title bar, field rows, body, a send pill) was said as a run of
    // lines, its bar, shadow and float lost
    {
      const hd = el.firstElementChild, hs = hd && getComputedStyle(hd), hf = hd && filled(hd)
      const lumH = hf ? 0.299 * hf.r + 0.587 * hf.g + 0.114 * hf.b : 255
      if (cs.boxShadow !== 'none' && /absolute|fixed/.test(cs.position) && hf && lumH < 90 && txt(hd) && hd.getBoundingClientRect().height <= 60 && el.children.length >= 3) {
        const own = el.getBoundingClientRect(), hb = hd.getBoundingClientRect()
        const rest = [...el.children].slice(1).filter((k) => txt(k))
        const btn = rest.find((k) => filled(k) && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= 8 && txt(k).length <= 14)
        const rows = rest.filter((k) => k !== btn).map((k) => {
          const val = [...k.children].find((c) => txt(c)), ks = getComputedStyle(k)
          return { label: val ? txt(k).replace(txt(val), '').trim() : null, value: val ? txt(val) : txt(k), ruled: parseFloat(ks.borderBottomWidth) >= 1, h: Math.round(k.getBoundingClientRect().height), labelInk: rgba(ks.color) }
        })
        const icons = [...hd.children].map(txt).filter(Boolean)
        return { type: 'window', w: Math.round(own.width), h: Math.round(own.height), right: Math.round(1280 - own.right), bottom: Math.round(900 - own.bottom), radius: cs.borderTopLeftRadius === cs.borderBottomLeftRadius ? Math.round(parseFloat(cs.borderTopLeftRadius)) : `${Math.round(parseFloat(cs.borderTopLeftRadius))}px top corners only`, bar: { fill: hf, ink: rgba(hs.color), h: Math.round(hb.height), t: txt(hd).replace(icons.join(' '), '').trim(), icons: icons.join(' ') }, rows, btn: btn ? { t: txt(btn), fill: filled(btn), ink: rgba(getComputedStyle(btn).color), pill: parseFloat(getComputedStyle(btn).borderTopLeftRadius) >= 99 } : null, fill: filled(el) }
      }
    }
    // round 8 e5: a docs article (breadcrumb, title, copy with inline code, a dark code block, a callout, a table) was said
    // as only its table, with the inline code read as status pills: say it block by block, top to bottom
    {
      const pre = el.querySelector('pre')
      const blocks = [...el.children].filter((k) => txt(k))
      if (pre && blocks.length >= 4 && blocks.includes(pre)) {
        const px = (k) => Math.round(parseFloat(getComputedStyle(k).fontSize))
        const parts = blocks.map((k) => {
          const s = getComputedStyle(k), t = txt(k)
          if (k === pre) {
            const toks = [...new Map([...k.querySelectorAll('span')].map((x) => [getComputedStyle(x).color, rgba(getComputedStyle(x).color)])).values()]
            return { kind: 'code', lines: (k.innerText || '').split('\n').map((l) => l.trimEnd()).filter(Boolean), fill: filled(k), ink: rgba(s.color), radius: Math.round(parseFloat(s.borderTopLeftRadius)), px: px(k), toks }
          }
          if (/^H[1-6]$/.test(k.tagName)) return { kind: 'title', t, px: px(k) }
          if (k.tagName === 'TABLE') { const rs = [...k.querySelectorAll('tr')].map((r) => [...r.children].map(txt)); return { kind: 'table', rows: rs, head: filled(k.querySelector('th')), ruled: parseFloat(getComputedStyle(k.querySelector('td,th')).borderLeftWidth) >= 1 } }
          if (parseFloat(s.borderLeftWidth) >= 3 && filled(k)) return { kind: 'callout', t, edge: { px: Math.round(parseFloat(s.borderLeftWidth)), c: rgba(s.borderLeftColor) }, fill: filled(k), lead: txt(k.querySelector('b,strong') ?? k) }
          const code = [...k.querySelectorAll('code')].map((c) => ({ t: txt(c), ink: rgba(getComputedStyle(c).color), fill: filled(c) }))
          return { kind: 'text', t, px: px(k), ink: rgba(s.color), code }
        })
        // where each block's top sits below the article's top (round 8 e5: everything built ~12px low, gaps roomier)
        const top0 = el.getBoundingClientRect().top
        blocks.forEach((k, i) => { parts[i].y = Math.round(k.getBoundingClientRect().top - top0) })
        return { type: 'docArticle', parts }
      }
    }
    // a cell map (round 8 e4: a 12x11 cinema seat grid had NO note and was built as an empty grey panel): 24+ textless,
    // childless, same-size small cells on a grid; hidden ones are gaps (an aisle); each fill+border look is one kind
    {
      const ks = [...el.children]
      const vis = ks.filter((k) => getComputedStyle(k).visibility !== 'hidden' && getComputedStyle(k).display !== 'none')
      const b0 = vis[0]?.getBoundingClientRect()
      if (ks.length >= 24 && vis.length >= 20 && ks.every((k) => !k.children.length && !txt(k)) && b0 && b0.width <= 60 && b0.height <= 60 &&
        vis.every((k) => { const b = k.getBoundingClientRect(); return Math.abs(b.width - b0.width) <= 1 && Math.abs(b.height - b0.height) <= 1 })) {
        const rb = ks.map((k) => k.getBoundingClientRect())
        const lefts = [...new Set(rb.map((b) => Math.round(b.left)))].sort((a, b) => a - b), tops = [...new Set(rb.map((b) => Math.round(b.top)))].sort((a, b) => a - b)
        if (lefts.length >= 4 && tops.length >= 3 && lefts.length * tops.length === ks.length) {
          const look = (k) => { const s = getComputedStyle(k); return `${s.backgroundColor}|${parseFloat(s.borderTopWidth) ? s.borderTopColor : 'none'}` }
          const kinds = []
          const grid = tops.map(() => lefts.map(() => '_'))
          ks.forEach((k, i) => {
            const r = tops.indexOf(Math.round(rb[i].top)), c = lefts.indexOf(Math.round(rb[i].left))
            if (getComputedStyle(k).visibility === 'hidden') return
            const L = look(k); let n = kinds.findIndex((x) => x.L === L)
            if (n < 0) { const s = getComputedStyle(k); kinds.push({ L, fill: filled(k), border: parseFloat(s.borderTopWidth) ? { px: parseFloat(s.borderTopWidth), c: rgba(s.borderTopColor) } : null, cls: k.getAttribute('class') ?? '', n: 0 }); n = kinds.length - 1 }
            kinds[n].n++; grid[r][c] = String(n + 1)
          })
          if (kinds.length <= 6) {
            const s0 = getComputedStyle(vis[0])
            const gapCols = lefts.map((_, c) => grid.every((row) => row[c] === '_') ? c + 1 : 0).filter(Boolean)
            // the side labels: a sibling whose text is one short token per line, its line count = rows (row letters)
            const lab = [...(el.parentElement?.children ?? [])].find((p) => p !== el && (p.innerText || '').trim().split(/\n+/).length === tops.length && (p.innerText || '').trim().split(/\n+/).every((t) => t.trim().length <= 2))
            const own = el.getBoundingClientRect()
            return { type: 'cellMap', cols: lefts.length, rows: tops.length, px: { w: Math.round(b0.width), h: Math.round(b0.height) }, gapX: Math.round(lefts[1] - lefts[0] - b0.width), gapY: Math.round(tops[1] - tops[0] - b0.height),
              radius: s0.borderRadius.replace(/ \/.*/, ''), kinds: kinds.map((k) => ({ fill: k.fill, border: k.border, n: k.n })), gapCols, grid: grid.map((r) => r.join('')),
              at: { x: Math.round(own.left), y: Math.round(own.top), w: Math.round(own.width), h: Math.round(own.height) }, labels: lab ? (lab.innerText || '').trim().split(/\n+/).map((t) => t.trim()) : null }
          }
        }
      }
    }
    // table: header cells and body rows
    const trs = el.tagName === 'TABLE' ? [...el.querySelectorAll('tr')] : []
    if (trs.length >= 3) {
      const head = [...trs[0].children].map(txt)
      const rich = richTable(el)
      if (rich) return { type: 'rtable', title: null, ...rich }
      return { type: 'table', columns: head, rows: trs.length - 1, all: trs.length <= 9 ? trs.slice(1).map((r) => [...r.children].map(txt)) : null, chips: chips(el) }
    }
    // week grid (round 6 e5): events absolutely placed over day columns and hour lines; the day heads (a 7-kid row
    // spanning the grid) and the hour rail (6+ 'N AM' labels left of it) live outside, so read them off the page
    const evk = [...el.querySelectorAll('*')].filter((k) => getComputedStyle(k).position === 'absolute' && filled(k) && txt(k) && txt(k).length <= 60 && k.getBoundingClientRect().height >= 30)
    if (evk.length >= 4) {
      const g = el.getBoundingClientRect()
      const headRow = [...document.querySelectorAll('*')].find((p) => p.children.length === 7 && Math.abs(p.getBoundingClientRect().left - g.left) <= 8 && Math.abs(p.getBoundingClientRect().right - g.right) <= 8 && p.getBoundingClientRect().bottom <= g.top + 4)
      const HOUR = /^(\d{1,2})(?::00)? ?([AP]M)?$/i
      const rail = [...document.querySelectorAll('*')].find((p) => p.children.length >= 6 && [...p.children].every((k) => HOUR.test(txt(k))) && p.getBoundingClientRect().right <= g.left + 4)
      if (headRow && rail) {
        const heads = [...headRow.children].map((k) => txt(k))
        const rk = [...rail.children], r0 = rk[0].getBoundingClientRect()
        const pitch = rk[1].getBoundingClientRect().top - r0.top
        const m0 = txt(rk[0]).match(HOUR); let h0 = Number(m0[1]) % 12; if (/pm/i.test(m0[2] ?? '')) h0 += 12
        const clock = (y) => { const q = Math.round(((y - r0.top) / pitch) * 4) / 4 + h0; const h = Math.floor(q), mm = Math.round((q - h) * 60); return `${((h + 11) % 12) + 1}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}` }
        const cw = g.width / 7
        const day = (x) => heads[Math.max(0, Math.min(6, Math.floor((x - g.left) / cw)))].split(' ')[0]
        const evs = evk.filter((k) => !k.dataset?.r).map((k) => {
          const b = k.getBoundingClientRect(), c = getComputedStyle(k)
          const d0 = day(b.left + 2), d1 = day(b.right - 2)
          const narrow = b.width < cw * 0.6 ? ((b.left + b.width / 2 - g.left) % cw < cw / 2 ? 'left half of ' : 'right half of ') : ''
          return { title: txt(k.querySelector('b,strong') ?? k), text: txt(k), fill: filled(k), edge: parseFloat(c.borderLeftWidth) >= 3 ? rgba(c.borderLeftColor) : null, days: d0 === d1 ? `${narrow}${d0}` : `${d0} to ${d1}`, from: clock(b.top), to: clock(b.bottom) }
        })
        return { type: 'week', heads, hours: [txt(rk[0]), txt(rk[rk.length - 1])], hourPx: Math.round(pitch), events: evs, edge: evs.length && evs.every((e) => e.edge) }
      }
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
        .map((k) => ({ text: txt(k), ink: filled(k), fill: filled(k), color: rgba(getComputedStyle(k).color), day: dayOf(k) }))
      // where the month sits: the first row's day numbers (lead-in days from the month before) and the last day shown
      const nums = days.slice(heads.length).map((d) => txt(d).split(' ')[0])
      const first = nums.slice(0, 7), one = first.indexOf('1')
      const lead = one > 0 ? first.slice(0, one) : []
      return { type: 'month', heads, weeks: Math.round(cells / 7), events: evs, marked, firstCol: one >= 0 && heads[one] ? heads[one] : null, lead, last: nums[nums.length - 1] }
    }
    // spreadsheet: a grid of many small cells, letters across the top, row numbers down the left (round 5 e5:
    // every cell was quoted in one run and the headers read as 'pale grey button's)
    if (cols >= 5 && el.children.length >= cols * 8) {
      const cells = [...el.children]
      const rowsT = []; for (let i = 0; i < cells.length; i += cols) rowsT.push(cells.slice(i, i + cols))
      const top = rowsT[0].slice(1).map(txt)
      const left = rowsT.slice(1).map((r) => txt(r[0]))
      if (top.every((t) => /^[A-Z]{1,2}$/.test(t)) && left.every((t) => /^\d+$/.test(t))) {
        const body = rowsT.slice(1).map((r) => r.slice(1))
        const used = body.map((r) => r.map(txt)).filter((r) => r.some(Boolean))
        const page = rgba(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255 }
        const tint = (k) => { const c = filled(k); return c && Math.hypot(c.r - page.r, c.g - page.g, c.b - page.b) > 6 ? c : null }
        const rowLook = body.map((r) => ({ bold: r.filter(txt).length && r.filter(txt).every((k) => parseFloat(getComputedStyle(k).fontWeight) >= 600), fill: r.every((k) => tint(k)) ? tint(r[0]) : null }))
        let sel = null
        body.forEach((r, i) => r.forEach((k, j) => { const c = getComputedStyle(k); const ow = parseFloat(c.outlineWidth) || 0; if ((ow >= 2 && c.outlineStyle !== 'none') || parseFloat(c.borderTopWidth) >= 2) sel = { at: `${top[j]}${left[i]}`, colour: rgba(ow >= 2 ? c.outlineColor : c.borderTopColor) } }))
        const ch = Math.round(cells[cols + 1].getBoundingClientRect().height)
        const cw = Math.round(cells[cols + 1].getBoundingClientRect().width)
        return { type: 'sheet', top, rows: left.length, used, rowLook, sel, headFill: tint(rowsT[0][1]), rowPx: ch, colPx: cw, firstPx: Math.round(cells[0].getBoundingClientRect().width) }
      }
    }
    // heatmap: a grid of 20+ textless filled cells in one hue at different strengths, with row labels
    // (round 5 e2: only the day labels were said)
    const hg = [el, ...el.querySelectorAll('*')].find((p) => getComputedStyle(p).display === 'grid' && [...p.children].filter((k) => !txt(k) && filled(k)).length >= 20)
    if (hg) {
      const ch = [...hg.children]
      const ncol = getComputedStyle(hg).gridTemplateColumns.split(' ').length
      const cells = ch.filter((k) => !txt(k) && filled(k))
      const hues = new Set(cells.map((k) => { const c = filled(k); return `${c.r},${c.g},${c.b}` }))
      if (hues.size === 1 && ch.length % ncol === 0) {
        const rowsH = []; for (let i = 0; i < ch.length; i += ncol) rowsH.push(ch.slice(i, i + ncol))
        const c0 = filled(cells[0])
        const b = cells[0].getBoundingClientRect()
        return { type: 'heat', title: [...el.querySelectorAll('h1,h2,h3,h4')].map(txt).find((t) => t && t.length <= 60) ?? null, fill: { ...c0, a: 1 }, px: Math.round(b.height), round: parseFloat(getComputedStyle(cells[0]).borderTopLeftRadius) >= 3,
          rows: rowsH.map((r) => ({ label: r.map(txt).find(Boolean) ?? '', levels: r.filter((k) => !txt(k)).map((k) => Math.min(9, Math.round((filled(k)?.a ?? 0) * 9))).join('') })) }
      }
    }
    // round 8 e2: a heat grid painted in several shades of one hue (not one fill at opacities), no row labels:
    // said as the grid size and every row as shade numbers (it was said as just its card title)
    if (hg) {
      const ch = [...hg.children], ncol = getComputedStyle(hg).gridTemplateColumns.split(' ').length
      const key = (c) => `${c.r},${c.g},${c.b}`
      if (ch.length >= 20 && ch.every((k) => !txt(k) && filled(k)) && ch.length % ncol === 0) {
        const lum = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
        const shades = [...new Map(ch.map((k) => [key(filled(k)), filled(k)])).values()].sort((a, b) => lum(b) - lum(a))
        if (shades.length >= 3 && shades.length <= 9) {
          const b = ch[0].getBoundingClientRect(), gs = getComputedStyle(hg)
          const rowsH = []; for (let i = 0; i < ch.length; i += ncol) rowsH.push(ch.slice(i, i + ncol).map((k) => shades.findIndex((c) => key(c) === key(filled(k))) + 1).join(''))
          return { type: 'heatShades', title: [...el.querySelectorAll('h1,h2,h3,h4,b,strong')].map(txt).find((t) => t && t.length <= 60) ?? null, cols: ncol, rows: rowsH, shades: shades.map((c) => ({ ...c, a: 1 })), px: { w: Math.round(b.width), h: Math.round(b.height) }, gap: parseFloat(gs.columnGap) || 0, radius: Math.round(parseFloat(getComputedStyle(ch[0]).borderTopLeftRadius)) }
        }
      }
    }
    // round 8 e2: an open date-range picker (preset list + a month's day grid with a highlighted range) floating over
    // the page; it was said as "page numbers" with its presets, range and shadow lost
    const dg = [el, ...el.querySelectorAll('*')].find((p) => getComputedStyle(p).display === 'grid' && getComputedStyle(p).gridTemplateColumns.split(' ').length === 7 && [...p.children].filter((k) => /^\d{1,2}$/.test(txt(k))).length >= 20)
    if (dg) {
      const days = [...dg.children]
      const lead = days.findIndex((k) => txt(k) === '1')
      const ends = days.filter((k) => /^\d+$/.test(txt(k)) && filled(k) && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= 3 && rgba(getComputedStyle(k).color).r > 200)
      const mids = days.filter((k) => /^\d+$/.test(txt(k)) && filled(k) && !ends.includes(k))
      const cb = days[lead >= 0 ? lead : 0].getBoundingClientRect()
      const month = [...el.querySelectorAll('h1,h2,h3,h4,h5,b,strong')].map(txt).find((t) => /[A-Za-z]+ \d{4}/.test(t)) ?? null
      const presetBox = [...el.querySelectorAll('ul,ol,nav')].find((u) => !u.contains(dg) && u.children.length >= 3)
      const presets = presetBox ? [...presetBox.children].map((k) => ({ t: txt(k), on: Number(getComputedStyle(k).fontWeight) >= 600 || rgba(getComputedStyle(k).color).b > 180 && rgba(getComputedStyle(k).color).r < 120, ink: rgba(getComputedStyle(k).color) })) : []
      const btns = [...el.querySelectorAll('button,span,a')].filter((k) => !dg.contains(k) && !k.children.length && txt(k) && txt(k).length <= 14 && (filled(k) || parseFloat(getComputedStyle(k).borderTopWidth) >= 1)).map((k) => ({ t: txt(k), fill: filled(k), ink: rgba(getComputedStyle(k).color) }))
      const cs = getComputedStyle(el)
      return { type: 'datePicker', month, lead, last: txt(days[days.length - 1]), cell: Math.round(cb.width), presets, presetW: presetBox ? Math.round(presetBox.getBoundingClientRect().width) : 0, ends: ends.map(txt), endFill: ends[0] ? filled(ends[0]) : null, mid: mids.length ? { from: txt(mids[0]), to: txt(mids[mids.length - 1]), fill: filled(mids[0]) } : null, btns, shadow: cs.boxShadow !== 'none', radius: Math.round(parseFloat(cs.borderTopLeftRadius)), fill: filled(el) }
    }
    // round 8 e2: one KPI card whose label is the card's own bare text before a big number (the label was dropped,
    // and the delta's colour unsaid): small grey label, big bold number, a coloured delta line under it
    {
      const own = el.getBoundingClientRect()
      const bare = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean)
      const bigK = [...el.children].find((g) => parseFloat(getComputedStyle(g).fontSize) >= 22 && /\d/.test(txt(g)) && !g.children.length)
      const firstBare = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
      const labelFirst = firstBare && bigK && !!(bigK.compareDocumentPosition(firstBare) & Node.DOCUMENT_POSITION_PRECEDING)
      if (labelFirst && bare.length === 1 && bare[0].length <= 24 && bigK && el.children.length <= 3 && own.height <= 160 && !el.querySelector('svg,img')) {
        const rest = [...el.children].filter((k) => k !== bigK && txt(k))
        return { type: 'kpi1', label: bare[0], labelInk: rgba(getComputedStyle(el).color), labelPx: Math.round(parseFloat(getComputedStyle(el).fontSize)), value: txt(bigK), valuePx: Math.round(parseFloat(getComputedStyle(bigK).fontSize)), extra: rest.map((k) => ({ t: txt(k), ink: rgba(getComputedStyle(k).color), bold: Number(getComputedStyle(k).fontWeight) >= 600 })) }
      }
    }
    // a table built from div rows on one column grid, the first row its header (round 5 e2: said as a list)
    const gk = [...el.children]
    if (gk.length >= 3 && gk.every((k) => getComputedStyle(k).display === 'grid' && k.children.length >= 3 && getComputedStyle(k).gridTemplateColumns === getComputedStyle(gk[0]).gridTemplateColumns && [...k.children].every((c) => !c.children.length))) {
      const hc = getComputedStyle(gk[0])
      return { type: 'table', title: null, columns: [...gk[0].children].map(txt), rows: gk.length - 1, first: [...gk[1].children].map(txt), all: gk.length <= 8 ? gk.slice(1).map((k) => [...k.children].map(txt)) : null, headLook: Number(hc.fontWeight) >= 600 ? 'bold grey header' : null, chips: chips(el) }
    }
    const kids = [...el.children].filter((k) => getComputedStyle(k).display !== 'none')
    const own = el.getBoundingClientRect()
    const title = () => { const t = [...el.querySelectorAll('h1,h2,h3,h4')].map(txt).find((s) => s && s.length <= 40); return t ?? null }
    // round 7 e2: a cohort table whose cells are shades of one hue (said as status pills with invented numbers)
    const ht = el.tagName === 'TABLE' ? el : el.querySelectorAll('table').length === 1 ? el.querySelector('table') : null
    if (ht && ht.querySelectorAll('tr').length >= 4) {
      const rows = [...ht.querySelectorAll('tr')]
      const body = rows.slice(rows[0].querySelector('th') ? 1 : 0)
      const tds = body.flatMap((r) => [...r.children].slice(1))
      const fl = tds.filter(filled)
      const hue = (c) => { const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b); if (mx - mn < 20) return null; let h = mx === c.r ? (c.g - c.b) / (mx - mn) : mx === c.g ? 2 + (c.b - c.r) / (mx - mn) : 4 + (c.r - c.g) / (mx - mn); return (h * 60 + 360) % 360 }
      const hs = fl.map((k) => hue(filled(k)))
      if (fl.length >= 10 && fl.length >= tds.length * 0.4 && hs.every((h) => h !== null && Math.abs(h - hs[0]) <= 25)) {
        const key = (c) => `${c.r},${c.g},${c.b}`
        const shades = [...new Map(fl.map((k) => [key(filled(k)), filled(k)])).values()].sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b))
        const cb = fl[0].getBoundingClientRect()
        return { type: 'heatTable', title: title(), columns: rows[0].querySelector('th') ? [...rows[0].children].map(txt) : null, shades, cellPx: { w: Math.round(cb.width), h: Math.round(cb.height) }, gap: parseFloat(getComputedStyle(ht).borderSpacing) || 0,
          rows: body.map((r) => ({ label: txt(r.children[0]), cells: [...r.children].slice(1).map((k) => { const c = filled(k); return c ? { t: txt(k), s: shades.findIndex((x) => key(x) === key(c)), white: rgba(getComputedStyle(k).color).r > 200 } : null }) })) }
      }
    }
    // round 7 e2: a funnel, filled labelled bars stacked down one left edge, each narrower, a value at the right
    const fbars = kids.filter((k) => { const b = k.getBoundingClientRect(); return filled(k) && txt(k) && txt(k).length <= 24 && b.height >= 24 && b.height <= 70 && b.width >= 60 })
    if (fbars.length >= 3) {
      const bs = fbars.map((k) => k.getBoundingClientRect())
      const sameLeft = bs.every((b) => Math.abs(b.left - bs[0].left) <= 3), down = bs.every((b, i) => !i || b.top >= bs[i - 1].bottom), shrink = bs.every((b, i) => !i || b.width < bs[i - 1].width)
      if (sameLeft && down && shrink) {
        const vals = kids.filter((k) => !fbars.includes(k) && txt(k) && txt(k).length <= 10)
        const valOf = (b) => vals.find((v) => { const vb = v.getBoundingClientRect(); return Math.abs(vb.top + vb.height / 2 - (b.top + b.height / 2)) <= 12 })
        const c0 = filled(fbars[0])
        return { type: 'funnel', title: title(), fill: { ...c0, a: 1 }, ink: rgba(getComputedStyle(fbars[0]).color), h: Math.round(bs[0].height), pitch: Math.round(bs[1].top - bs[0].top), left: Math.round(bs[0].left - own.left), top: Math.round(bs[0].top - own.top), radius: Math.round(parseFloat(getComputedStyle(fbars[0]).borderTopLeftRadius)),
          items: fbars.map((k, i) => ({ t: txt(k), w: Math.round(bs[i].width), op: Math.round(parseFloat(getComputedStyle(k).opacity) * 100), v: valOf(bs[i]) ? txt(valOf(bs[i])) : null })), valRight: vals.length ? Math.round(own.right - vals[0].getBoundingClientRect().right) : null }
      }
    }
    // round 7 e2: an SVG stacked bar chart (rect groups, one colour each, bars at the same x) said as just its title
    const sv = [...el.querySelectorAll('svg')].find((g) => g.querySelectorAll('rect').length >= 6)
    if (sv) {
      const groups = [...sv.querySelectorAll('g')].filter((g) => g.querySelectorAll('rect').length >= 3)
      if (groups.length >= 2 && groups.every((g) => g.querySelectorAll('rect').length === groups[0].querySelectorAll('rect').length)) {
        const R = (r) => r.getBoundingClientRect()
        const n = groups[0].querySelectorAll('rect').length
        const segs = groups.map((g) => [...g.querySelectorAll('rect')].map(R))
        if (segs.every((sg) => sg.every((b, i) => Math.abs(b.left - segs[0][i].left) <= 2))) {
          const sb = sv.getBoundingClientRect()
          const order = groups.map((g, i) => ({ fill: rgba(getComputedStyle(g.querySelector('rect')).fill), bottom: segs[i][0].bottom })).sort((a, b) => b.bottom - a.bottom)
          const bottomG = groups.findIndex((_, i) => segs[i][0].bottom === order[0].bottom)
          return { type: 'stackedBars', title: title(), n, w: Math.round(segs[0][0].width), gap: Math.round(segs[0][1].left - segs[0][0].right), plotH: Math.round(sb.height), left: Math.round(sb.left - own.left), top: Math.round(sb.top - own.top),
            colours: order.map((o) => o.fill), totals: segs[0].map((_, i) => Math.round(Math.max(...segs.map((sg) => sg[i].bottom)) - Math.min(...segs.map((sg) => sg[i].top)))),
            bottomH: segs[bottomG].map((b) => Math.round(b.height)) }
        }
      }
    }
    // round 7 e2: one stat card with a little line chart in its corner (the row-of-cards 'stats' type needs the row)
    const pl = el.querySelectorAll('svg polyline')
    if (pl.length === 1 && own.height <= 200 && own.width <= 420 && kids.length <= 4) {
      const p = pl[0], pts = p.getAttribute('points').trim().split(/\s+/).map((q) => q.split(',').map(Number)), pb = p.ownerSVGElement.getBoundingClientRect()
      const big = [...el.querySelectorAll('*')].filter((k) => !k.children.length && txt(k)).sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0]
      const lab = [...el.querySelectorAll('*')].find((k) => !k.children.length && txt(k) && k !== big)
      if (big && lab) return { type: 'kpi', label: txt(lab), labelInk: rgba(getComputedStyle(lab).color), value: txt(big), valuePx: Math.round(parseFloat(getComputedStyle(big).fontSize)), spark: { c: rgba(getComputedStyle(p).stroke), w: Math.round(pb.width), h: Math.round(pb.height), rising: pts[pts.length - 1][1] < pts[0][1], right: Math.round(own.right - pb.right), bottom: Math.round(own.bottom - pb.bottom), pts: pts.length } }
    }
    // a table inside a card (round 4 e1 "Recent deals" panel: the table was read as a list)
    const inner = el.tagName !== 'TABLE' && el.querySelectorAll('table').length === 1 ? el.querySelector('table') : null
    if (inner && inner.querySelectorAll('tr').length >= 3) {
      const rows = [...inner.querySelectorAll('tr')]
      // no header row: the first row is styled like the rest (round 6 e2 'Top accounts': 'Acme Corp' read as a column name)
      const look = (c) => { const s = getComputedStyle(c); return `${s.fontWeight}|${s.color}|${s.backgroundColor}|${s.textTransform}|${s.fontSize}` }
      const cellsOf = (r) => [...r.children]
      if (rows.length <= 10 && !rows[0].querySelector('th') && cellsOf(rows[0]).length === cellsOf(rows[1]).length && cellsOf(rows[0]).every((c, i) => look(c) === look(cellsOf(rows[1])[i]))) {
        const cols = cellsOf(rows[0]).map((c) => { const s = getComputedStyle(c); return { bold: Number(s.fontWeight) >= 600, right: s.textAlign === 'right' || s.textAlign === 'end' } })
        return { type: 'table', headless: true, title: title(), cols, all: rows.map((r) => cellsOf(r).map(txt)), ruled: parseFloat(getComputedStyle(cellsOf(rows[0])[0]).borderBottomWidth) >= 1, chips: chips(inner) }
      }
      const rich = richTable(inner, el)
      if (rich) return { type: 'rtable', title: title(), ...rich }
      // every body row said (round 8 e2 'Top pages': '4 rows, first row ...' was built with invented rows), and a bold
      // caption above the table is its title
      const cap = title() ?? [...el.children].filter((k) => k !== inner && !k.contains(inner) && /^(B|STRONG)$/.test(k.tagName)).map(txt).find((t) => t && t.length <= 40) ?? null
      return { type: 'table', title: cap, columns: [...rows[0].children].map(txt), rows: rows.length - 1, first: [...rows[1].children].map(txt), all: rows.length <= 9 ? rows.slice(1).map((r) => [...r.children].map(txt)) : null, chips: chips(inner) }
    }
    // gantt: a row of 4+ date column heads over filled task bars placed on their own rows
    const DATE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}$|^w(ee)?k? ?\d{1,2}$|^\d{1,2}\/\d{1,2}$/i
    // n173: a week number over its date ('W10 Mar 2', round 17 e1) is a date head too (the gantt went unseen, said as a line chart)
    const isDate = (t) => DATE.test(t) || (/^w(ee)?k? ?\d{1,2} \S/i.test(t) && DATE.test(t.replace(/^\S+ /, ''))) || (/ w(ee)?k? ?\d{1,2}$/i.test(t) && DATE.test(t.replace(/ \S+$/, '')))
    const headRow = [el, ...el.querySelectorAll('*')].find((p) => p.children.length >= 4 && [...p.children].every((k) => isDate(txt(k))))
    if (headRow) {
      const hs = [...headRow.children].map((k) => ({ t: txt(k), b: k.getBoundingClientRect() }))
      const x0 = hs[0].b.left, cw = (hs[hs.length - 1].b.right - x0) / hs.length
      const at = (x) => { const c = Math.max(0, Math.min(hs.length - 1, Math.floor((x - x0) / cw))); const fr = (x - x0) / cw - c; return { c, fr } }
      const line = [...el.querySelectorAll('*')].find((k) => { const b = k.getBoundingClientRect(); return filled(k) && b.width <= 4 && b.height >= own.height * 0.5 })
      // the today line's tag is not a task
      const bars = [...el.querySelectorAll('*')].filter((k) => { const b = k.getBoundingClientRect(); return !(line && line.contains(k)) && filled(k) && txt(k) && ![...k.children].some((c) => txt(c)) && b.height <= 44 && b.width >= 24 && b.top > hs[0].b.bottom && getComputedStyle(k).position === 'absolute' })
      if (bars.length >= 3 && new Set(bars.map((k) => Math.round(k.getBoundingClientRect().top / 8))).size === bars.length) {
        // n177: thirds of a week ('mid W14') let the build snap bars to week lines (round 17 e1: bars ~10px off, colour
        // lift 68 on a near-identical page). Say the day inside the week and the exact px from the timeline's left edge.
        const where = (x, edge) => {
          const { c, fr } = at(x), d = Math.round(fr * 7), px = Math.round(x - x0 + (edge === 'start' ? -1 : edge === 'end' ? 1 : 0))
          const w = d <= 0 ? `start of ${hs[c].t}` : d >= 7 ? (c + 1 < hs.length ? `start of ${hs[c + 1].t}` : `end of ${hs[c].t}`) : `${d}/7 into ${hs[c].t}`
          return `${w} (${px}px in)`
        }
        // row pitch and how far down the rows reach: without them a tall box got its rows spread to fill it (round 4 e5 built 2x tall)
        const tops = bars.map((k) => k.getBoundingClientRect().top).sort((a, b) => a - b)
        const gaps = tops.slice(1).map((t, i) => t - tops[i]).sort((a, b) => a - b)
        const pitch = Math.round(gaps[Math.floor(gaps.length / 2)])
        const lastB = Math.max(...bars.map((k) => k.getBoundingClientRect().bottom))
        const reach = Math.round(((lastB + pitch / 2 - own.top) / own.height) * 10) * 10
        // n147: each bar's row counted under the week head (round 12 e2: bars were stacked one per row from the top, the
        // group rows' gaps lost), a textless track behind a bar (progress), a small turned square (milestone) with its
        // label, a bordered elbow (dependency), and the today line's tag drawn in ::before (lost)
        const hb = hs[0].b.bottom
        const rowOf = (b) => Math.round((b.top - hb - (pitch - b.height) / 2) / pitch) + 1
        const all = [...el.querySelectorAll('*')]
        const tracks = all.filter((k) => !txt(k) && !k.children.length && filled(k) && getComputedStyle(k).position === 'absolute' && bars.some((x) => Math.abs(x.getBoundingClientRect().top - k.getBoundingClientRect().top) <= 2 && k.getBoundingClientRect().width > x.getBoundingClientRect().width + 8))
        const ms = all.filter((k) => !txt(k) && !k.children.length && filled(k) && /matrix|rotate/.test(getComputedStyle(k).transform) && k.getBoundingClientRect().width <= 32).map((k) => {
          const b = k.getBoundingClientRect(), lab = all.find((g) => txt(g) && !g.children.length && !filled(g) && Math.abs(g.getBoundingClientRect().top + g.getBoundingClientRect().height / 2 - (b.top + b.height / 2)) <= 8 && g.getBoundingClientRect().left >= b.right - 4 && g.getBoundingClientRect().left <= b.right + 30)
          return { fill: filled(k), px: Math.round(k.offsetWidth), at: where(b.left + b.width / 2, 'start'), row: rowOf(b), label: lab ? txt(lab) : null, top: Math.round(b.top - own.top) }
        })
        const deps = all.filter((k) => !txt(k) && !k.children.length && !filled(k) && parseFloat(getComputedStyle(k).borderTopWidth) >= 1 && parseFloat(getComputedStyle(k).borderLeftWidth) < 1 && parseFloat(getComputedStyle(k).borderRightWidth) >= 1).map((k) => {
          const b = k.getBoundingClientRect()
          const from = bars.find((x) => Math.abs(x.getBoundingClientRect().right - b.left) <= 12 && Math.abs(x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2 - b.top) <= 16)
          const to = bars.find((x) => Math.abs(x.getBoundingClientRect().top - b.bottom) <= 16 && x.getBoundingClientRect().left <= b.right + 4 && x.getBoundingClientRect().right >= b.left)
          return { c: rgba(getComputedStyle(k).borderTopColor), w: Math.round(parseFloat(getComputedStyle(k).borderTopWidth)), from: from ? txt(from) : null, to: to ? txt(to) : null }
        }).filter((x) => x.from && x.to)
        // n173: a progress fill INSIDE the bar (a textless see-through child over its first part, round 17 e1)
        const progOf = (k) => { const c = [...k.children].find((x) => !txt(x) && filled(x)); if (!c) return null; const f = Math.round(c.getBoundingClientRect().width / k.getBoundingClientRect().width * 100); return f >= 5 ? { pct: f, fill: filled(c) } : null }
        // n173: dependency elbows drawn as SVG paths (round 17 e1: four grey elbows, said as a 'line chart')
        const sdeps = [...el.querySelectorAll('svg path, svg polyline')].filter((p) => getComputedStyle(p).fill === 'none' && rgba(getComputedStyle(p).stroke)).map((p) => {
          const sv = p.ownerSVGElement.getBoundingClientRect()
          const pts = [...(p.getAttribute('d') ?? '').matchAll(/([MLHV])\s*(-?[\d.]+)(?:[ ,](-?[\d.]+))?/g)].reduce((a, m) => { const l = a[a.length - 1] ?? [0, 0]; a.push(m[1] === 'H' ? [Number(m[2]), l[1]] : m[1] === 'V' ? [l[0], Number(m[2])] : [Number(m[2]), Number(m[3])]); return a }, [])
          if (pts.length < 2) return null
          const [sx, sy] = [pts[0][0] + sv.left, pts[0][1] + sv.top], [ex, ey] = [pts[pts.length - 1][0] + sv.left, pts[pts.length - 1][1] + sv.top]
          const near = (x, y) => bars.find((k) => { const b = k.getBoundingClientRect(); return x >= b.left - 14 && x <= b.right + 14 && y >= b.top - 14 && y <= b.bottom + 14 })
          const from = near(sx, sy), to = [...bars].filter((k) => k !== from).find((k) => { const b = k.getBoundingClientRect(); return ex >= b.left - 14 && ex <= b.right + 14 && ey >= b.top - 14 && ey <= b.bottom + 14 })
          return from && to ? { c: rgba(getComputedStyle(p).stroke), w: Math.max(1, Math.round(parseFloat(getComputedStyle(p).strokeWidth))), from: txt(from), to: txt(to) } : null
        }).filter(Boolean)
        deps.push(...sdeps)
        const tag = line ? (() => { const pc = getComputedStyle(line, '::before'); const t = (pc.content || '').replace(/^["']|["']$/g, ''); return t && t !== 'none' && t !== 'normal' ? { t, fill: rgba(pc.backgroundColor) } : null })() : null
        return { type: 'gantt', pitch, reach, colW: Math.round(cw * 10) / 10, heads: hs.map((h) => h.t), headH: Math.round(hb - own.top), bars: bars.map((k) => { const b = k.getBoundingClientRect(); const tr = tracks.find((x) => Math.abs(x.getBoundingClientRect().top - b.top) <= 2); return { text: txt(k), fill: filled(k), from: where(b.left + 1, 'start'), to: where(b.right - 1, 'end'), h: Math.round(b.height), row: rowOf(b), top: Math.round(b.top - own.top), prog: progOf(k), track: tr ? { fill: filled(tr), to: where(tr.getBoundingClientRect().right - 1, 'end') } : null } }), ms, deps, line: line ? { fill: filled(line), at: where(line.getBoundingClientRect().left, 'start'), label: txt(line) || (tag ? tag.t : ''), tag } : null }
      }
    }
    // a chart drawn in SVG: lines (polyline/path strokes) or a donut (dashed circle strokes)
    const svg = [...el.querySelectorAll('svg')].find((s) => { const b = s.getBoundingClientRect(); return b.width >= 120 && b.height >= 80 })
    if (svg) {
      const stroke = (k) => rgba(getComputedStyle(k).stroke)
      const ring = [...svg.querySelectorAll('circle')].filter((c) => getComputedStyle(c).fill === 'none' && stroke(c))
      if (ring.length >= 2) {
        const r = parseFloat(ring[0].getAttribute('r')), circ = 2 * Math.PI * r
        const segs = ring.filter((c) => (c.getAttribute('stroke-dasharray') ?? '').trim()).map((c) => ({ fill: stroke(c), pct: Math.round(parseFloat(c.getAttribute('stroke-dasharray')) / circ * 100) }))
        const track = ring.find((c) => !(c.getAttribute('stroke-dasharray') ?? '').trim())
        if (segs.length) return { type: 'donut', title: title(), segs, track: track ? stroke(track) : null }
      }
      const lines = [...svg.querySelectorAll('polyline, path')].filter((p) => stroke(p) && (p.tagName === 'polyline' || getComputedStyle(p).fill === 'none')).map((p) => {
        // a path's M/L points count too (round 8 e2: its direction was unsaid)
        const pts = p.getAttribute('points') ? p.getAttribute('points').trim().split(/\s+/).map((s) => s.split(',').map(Number)).filter((q) => q.length === 2) : [...(p.getAttribute('d') ?? '').matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])])
        return { fill: stroke(p), dashed: !!(p.getAttribute('stroke-dasharray') ?? '').trim() && p.getAttribute('stroke-dasharray') !== 'none', points: pts.length, rising: pts.length >= 2 ? pts[pts.length - 1][1] < pts[0][1] : null,
          // its heights point by point and whether it turns up and down (round 8 e2: a jagged 14-point line built as a smooth curve)
          hs: (() => { const vb = svg.viewBox?.baseVal; const H = vb && vb.height ? vb.height : svg.getBoundingClientRect().height; return pts.length >= 3 && pts.length <= 16 && !/[CQSA]/i.test(p.getAttribute('d') ?? '') ? pts.map((q) => Math.round((1 - q[1] / H) * 100)) : null })(),
          turns: pts.slice(1, -1).filter((q, i) => (q[1] - pts[i][1]) * (pts[i + 2][1] - q[1]) < 0).length, thick: parseFloat(getComputedStyle(p).strokeWidth) >= 3 }
      })
      // round 8 e2: a closed path filled under the line (an area chart): its fill was unsaid
      const area = [...svg.querySelectorAll('path, polygon')].find((p) => getComputedStyle(p).fill !== 'none' && !stroke(p))
      const areaFill = area ? (() => { const f = getComputedStyle(area).fill; const m = f.match(/url\("?#([^")]+)/); if (!m) return { c: rgba(f), fade: false }; const st = svg.querySelector(`#${m[1]} stop`); return st ? { c: rgba(getComputedStyle(st).stopColor), fade: true } : null })() : null
      const ttl = title() ?? [...el.querySelectorAll('b,strong')].map(txt).find((t) => t && t.length <= 40) ?? null
      if (lines.length) return { type: 'lines', title: ttl, lines, area: areaFill, grid: [...svg.querySelectorAll('line')].filter((l) => l.getAttribute('y1') === l.getAttribute('y2')).length }
    }
    // an opened message (round 6 e3 reader): title, a round avatar beside the sender, a body of copy, an attachment
    // box, a row of tool buttons. Said as a list of the buttons it dropped the body and the avatar.
    const hd = el.querySelector('h1,h2,h3')
    const av = [...el.querySelectorAll('*')].find((k) => { const b = k.getBoundingClientRect(); return !txt(k) && !k.children.length && filled(k) && b.width >= 24 && b.width <= 64 && Math.abs(b.width - b.height) <= 2 && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= b.width * 0.4 })
    const bodyEl = [...el.querySelectorAll('*')].find((k) => k !== hd && !k.contains(hd) && ![...k.children].some((c) => c.tagName !== 'BR') && (k.innerText || '').trim().length >= 80)
    if (hd && av && bodyEl) {
      const sender = av.nextElementSibling ? (av.nextElementSibling.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean) : []
      const tools = [...el.querySelectorAll('*')].find((p) => p.children.length >= 3 && [...p.children].every((k) => !k.children.length && txt(k) && txt(k).length <= 14))
      // every attachment chip, not only a tall box (round 8 e1: two 38px chips were dropped)
      const atts = [...el.querySelectorAll('*')].filter((k) => k !== bodyEl && !(tools && tools.contains(k)) && !k.children.length && txt(k) && txt(k).length <= 40 && parseFloat(getComputedStyle(k).borderTopWidth) >= 1 && k.getBoundingClientRect().height >= 30)
      const att = atts.length ? atts.map(txt).join('" and "') : null
      // every paragraph of the body (round 8 e1: the second paragraph was dropped)
      const paras = [...bodyEl.parentElement.children].filter((c) => c.tagName === 'P' && (c.innerText || '').trim())
      const bs = getComputedStyle(bodyEl)
      return { type: 'reader', title: txt(hd), titlePx: Math.round(parseFloat(getComputedStyle(hd).fontSize)), av: { px: Math.round(av.getBoundingClientRect().width), fill: filled(av) }, sender, body: (bodyEl.tagName === 'P' && paras.length >= 2 ? paras.map((c) => c.innerText || '').join('\n') : [...bodyEl.parentElement.children].every((c) => c.tagName === 'P') ? [...bodyEl.parentElement.children].map((c) => c.innerText || '').join('\n') : (bodyEl.innerText || '')).split('\n').map((x) => x.trim()).filter(Boolean), bodyPx: Math.round(parseFloat(bs.fontSize)), tools: tools ? [...tools.children].map(txt) : [], toolsBordered: tools ? parseFloat(getComputedStyle(tools.children[0]).borderTopWidth) >= 1 || !!filled(tools.children[0]) : false, att }
    }
    // a form: 3+ fields (a label over an empty bordered box), laid out in rows
    const fields = [...el.querySelectorAll('*')].filter((k) => k.closest('[data-r]') === el && k.children.length >= 2 && k.children.length <= 3 && [...k.children].some((g) => !txt(g) && parseFloat(getComputedStyle(g).borderTopWidth) >= 1 && g.getBoundingClientRect().height >= 30) && txt(k) && txt(k).length <= 32)
    if (fields.length >= 3) {
      const rows = new Map()
      for (const k of fields) { const y = Math.round(k.getBoundingClientRect().top / 10); rows.set(y, [...(rows.get(y) ?? []), k]) }
      const width = Math.max(...fields.map((k) => k.getBoundingClientRect().width))
      return { type: 'form', title: title(), rows: [...rows.values()].map((r) => r.map((k) => ({ label: txt(k), wide: r.length === 1 && k.getBoundingClientRect().width >= width * 0.95 && fields.some((j) => j.getBoundingClientRect().width < width * 0.7) }))) }
    }
    // a filled-in form (a modal: round 5 e1): each field a bordered leaf box >=30px tall with its label right above it
    // (the label is the previous sibling, not a wrapper), maybe holding a value; buttons along the bottom said by look
    const lab = (g) => { const p = g.previousElementSibling; if (!p || p.children.length || !txt(p) || txt(p).length > 32 || parseFloat(getComputedStyle(p).borderTopWidth) >= 1) return null; const a = p.getBoundingClientRect(), b = g.getBoundingClientRect(); return b.top - a.bottom >= -2 && b.top - a.bottom <= 16 && a.left - b.left < 8 ? txt(p) : null }
    // a white input on an off-white page is still an empty-looking field (round 6 e4 checkout: #fff boxes on #fafaf9)
    const inputWhite = (g) => { const c = rgba(getComputedStyle(g).backgroundColor); const pb = rgba(getComputedStyle(document.body).backgroundColor); return c && c.r >= 250 && c.g >= 250 && c.b >= 250 && pb && pb.a > 0.05 && (pb.r < 252 || pb.g < 252 || pb.b < 252) }
    const flds = [...el.querySelectorAll('*')].filter((g) => g.closest('[data-r]') === el && !g.children.length && parseFloat(getComputedStyle(g).borderTopWidth) >= 1 && g.getBoundingClientRect().height >= 30 && txt(g).length <= 40 && (!(rgba(getComputedStyle(g).backgroundColor)?.a > 0.05) || inputWhite(g)) && lab(g))
    if (flds.length >= 3) {
      const rows = new Map()
      for (const g of flds) { const y = Math.round(g.getBoundingClientRect().top / 10); rows.set(y, [...(rows.get(y) ?? []), g]) }
      const said = new Set(flds.flatMap((g) => [g, g.previousElementSibling]))
      const eb = el.getBoundingClientRect()
      const btns = [...el.querySelectorAll('*')].filter((k) => k.closest('[data-r]') === el && !said.has(k) && !k.children.length && txt(k) && txt(k).length <= 24 && (() => { const c = getComputedStyle(k), b = k.getBoundingClientRect(); return b.height >= 26 && b.height <= 56 && (rgba(c.backgroundColor)?.a > 0.05 || parseFloat(c.borderTopWidth) >= 1) })())
        .map((k) => { const c = getComputedStyle(k), b = k.getBoundingClientRect(); return { t: txt(k), fill: rgba(c.backgroundColor)?.a > 0.05 ? rgba(c.backgroundColor) : null, ink: rgba(c.color), bold: Number(c.fontWeight) >= 600, low: b.top - eb.top > eb.height * 0.75, right: b.left - eb.left > eb.width * 0.5, top: b.top } })
      const close = [...el.querySelectorAll('*')].find((k) => k.closest('[data-r]') === el && !k.children.length && /^[×✕xX]$/.test(txt(k)))
      // buttons pinned low with a big empty gap above them: the card keeps its drawn height (round 5 e1 modal built content-high)
      const lastField = Math.max(...flds.map((g) => g.getBoundingClientRect().bottom))
      const gap = btns.length ? Math.min(...btns.map((b) => b.top)) - lastField : 0
      // section headings between the fields (round 6 e4: 'Contact', 'Shipping address', 'Delivery' were a list)
      const secs = [...el.querySelectorAll('h1,h2,h3,h4')].filter((h) => h.closest('[data-r]') === el && txt(h) && txt(h).length <= 40).map((h) => ({ t: txt(h), y: h.getBoundingClientRect().top }))
      // a row of 2-4 bordered choice cards, two lines each, one picked by a thicker border (round 6 e4 delivery)
      const bwOf = (k) => parseFloat(getComputedStyle(k).borderTopWidth) || 0
      const chooser = [...el.querySelectorAll('*')].find((p) => p.closest('[data-r]') === el && p.children.length >= 2 && p.children.length <= 4 && [...p.children].every((k) => { const b = k.getBoundingClientRect(); return bwOf(k) >= 1 && k.children.length && b.height >= 48 && b.height <= 140 && (k.innerText || '').split('\n').filter((x) => x.trim()).length === 2 && Math.abs(b.top - p.children[0].getBoundingClientRect().top) <= 2 }) && new Set([...p.children].map(bwOf)).size === 2 && [...p.children].filter((k) => bwOf(k) === Math.max(...[...p.children].map(bwOf))).length === 1)
      const choice = chooser ? { y: chooser.getBoundingClientRect().top, items: [...chooser.children].map((k) => ({ lines: (k.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean), sel: bwOf(k) === Math.max(...[...chooser.children].map(bwOf)) ? { w: bwOf(k), c: rgba(getComputedStyle(k).borderTopColor) } : null })) } : null
      // no fill, border or shadow of its own: the fields sit straight on the page (round 6 e4 was built inside an invented card)
      const ec = getComputedStyle(el), bare = !(rgba(ec.backgroundColor)?.a > 0.05) && !(parseFloat(ec.borderTopWidth) >= 1) && !(parseFloat(ec.borderLeftWidth) >= 1) && ec.boxShadow === 'none' && ec.backgroundImage === 'none'
      // the form's rhythm: field height, label-to-field and field-to-next-label gaps, heading size, whole height
      // (round 6 e4 was built ~10% taller, so the button and everything below drifted)
      const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
      const fr = flds.map((g) => g.getBoundingClientRect()), lr = flds.map((g) => g.previousElementSibling.getBoundingClientRect())
      const below = fr.map((f) => lr.map((l) => l.top - f.bottom).filter((d) => d >= 4 && d <= 40)).flatMap((d) => d.length ? [Math.min(...d)] : [])
      const rhythm = { fieldH: Math.round(med(fr.map((f) => f.height))), labelGap: Math.round(med(fr.map((f, i) => f.top - lr[i].bottom))), rowGap: below.length ? Math.round(med(below)) : null, headPx: secs.length ? Math.round(parseFloat(getComputedStyle(el.querySelector('h1,h2,h3,h4')).fontSize)) : null, choiceH: chooser ? Math.round(chooser.children[0].getBoundingClientRect().height) : null, h: Math.round(eb.height) }
      return { type: 'form', bare, rhythm, title: title(), close: close ? txt(close) : null, buttons: btns, secs: secs.length >= 2 ? secs : null, choice, white: flds.some(inputWhite), rowY: [...rows.values()].map((r) => r[0].getBoundingClientRect().top), gap: gap >= eb.height * 0.15 ? { px: Math.round(gap), h: Math.round(eb.height) } : null, rows: [...rows.values()].map((r) => r.map((g) => ({ label: lab(g), value: txt(g), tall: g.getBoundingClientRect().height >= 70 ? Math.round(g.getBoundingClientRect().height) : 0 }))) }
    }
    // stat cards: 3+ same-size cards in a row, each with one big number
    const big = (k) => [...k.querySelectorAll('*')].find((g) => parseFloat(getComputedStyle(g).fontSize) >= 22 && /\d/.test(txt(g)) && !g.children.length)
    if (kids.length >= 3 && kids.every((k) => big(k) && txt(k).length <= 48)) {
      const ys = kids.map((k) => Math.round(k.getBoundingClientRect().y))
      // a tiny chart in a card (a sparkline): its colour and which way it runs
      const spark = (k) => { const p = k.querySelector('svg polyline'); if (!p) return null; const pts = p.getAttribute('points').trim().split(/\s+/).map((s) => s.split(',').map(Number)); return { fill: rgba(getComputedStyle(p).stroke), rising: pts[pts.length - 1][1] < pts[0][1] } }
      if (Math.max(...ys) - Math.min(...ys) <= 8) return { type: 'stats', cards: kids.map((k) => ({ label: txt(k).replace(txt(big(k)), '|').split('|')[0].trim(), value: txt(big(k)), rest: txt(k).split(txt(big(k)))[1]?.trim() ?? '', spark: spark(k) })) }
    }
    // bar chart: 4+ textless filled blocks side by side on one baseline, different heights
    const bars = [...el.querySelectorAll('*')].filter((k) => !txt(k) && !k.children.length && filled(k) && k.getBoundingClientRect().height >= 8)
    if (bars.length >= 4) {
      const box0 = el.getBoundingClientRect()
      const r = bars.map((k) => k.getBoundingClientRect())
      const base = r.map((b) => Math.round(b.bottom)), hs = r.map((b) => Math.round(b.height))
      if (Math.max(...base) - Math.min(...base) <= 2 && new Set(hs).size >= 3 && r.every((b) => b.width < b.height * 2.5)) {
        const title = kids.map(txt).find((t) => t && t.length <= 40)
        return { type: 'bars', count: bars.length, colour: filled(bars[0]), odd: (() => { const cs = bars.map((k) => filled(k)); const key = (c) => `${c.r},${c.g},${c.b}`; const n = new Map(); cs.forEach((c) => n.set(key(c), (n.get(key(c)) ?? 0) + 1)); const main = [...n.entries()].sort((a, b) => b[1] - a[1])[0][0]; const o = cs.map((c, i) => [i, c]).filter(([, c]) => key(c) !== main); return o.length && (o.length <= 2 || (o.length <= 8 && o.length * 4 <= cs.length)) ? { main: cs.find((c) => key(c) === main), o } : null })(), title, rising: hs[hs.length - 1] > hs[0], heights: hs.map((h) => Math.round(h / Math.max(...hs) * 100)),
          // n167: the card the chart sits on (round 16 e1: a white bordered shadowed card built as a pale blue panel) and the bars' own size
          card: (() => { const cs = getComputedStyle(el); const bg = rgba(cs.backgroundColor); return { w: Math.round(box0.width), h: Math.round(box0.height), x: Math.round(box0.left + scrollX), y: Math.round(box0.top + scrollY), abs: /absolute|fixed/.test(cs.position), bg: bg.a > 0.05 ? bg : null, bw: parseFloat(cs.borderTopWidth) || 0, bc: rgba(cs.borderTopColor), shadow: cs.boxShadow !== 'none', radius: Math.round(parseFloat(cs.borderTopLeftRadius) || 0) } })(),
          barW: Math.round(r[0].width), barGap: r.length > 1 ? Math.round(r[1].left - r[0].right) : 0, tallest: Math.max(...hs) }
      }
    }
    // chat bubbles: rounded filled boxes, some hugging the left, some the right
    const box = el.getBoundingClientRect()
    const bubbles = kids.filter((k) => txt(k) && (filled(k) || parseFloat(getComputedStyle(k).borderTopWidth) >= 1) && parseFloat(getComputedStyle(k).borderTopLeftRadius) >= 10)
    if (bubbles.length >= 3 && bubbles.length === kids.length) {
      const side = (k) => { const b = k.getBoundingClientRect(); return b.left - box.left < box.right - b.right ? 'left' : 'right' }
      const sides = bubbles.map(side)
      const rows = new Set(bubbles.map((k) => Math.round(k.getBoundingClientRect().top / 4)))
      if (rows.size === bubbles.length && sides.includes('left') && sides.includes('right') && bubbles.every((k) => k.getBoundingClientRect().width < box.width * 0.8)) {
        return { type: 'bubbles', items: bubbles.map((k) => ({ side: side(k), text: txt(k), fill: filled(k), ink: rgba(getComputedStyle(k).color) })) }
      }
    }
    // cards or a list: repeated items, with a heading above them and tags inside
    const rep = repeats(el)
    const cardKids = kids.filter((k) => filled(k) && txt(k))
    const headKid = kids.find((k) => !filled(k) && /^H\d$/.test(k.tagName))
    if (headKid && cardKids.length >= 1 && cardKids.length === kids.length - 1 && (cardKids.length >= 2 || cardKids[0].getBoundingClientRect().height > 64)) {
      return { type: 'cards', head: txt(headKid), items: cardKids.map((k) => ({ text: txt(k), tags: chips(k) })) }
    }
    // an item's parts: its child texts, with a row of leaf spans split (a mail row's sender | time glued
    // as 'Tom BeckerYesterday', round 4 e2)
    // ...and a name with a small line set under it split in two (an order item's 'Linen overshirt' over
    // 'Sand · M' was glued as 'Linen overshirtSand', round 4 e3)
    const underLine = (n) => { const ls = (n.innerText || '').split('\n').map((t) => t.trim()).filter(Boolean); const sm = n.lastElementChild; return ls.length === 2 && sm && !sm.children.length && /block|flex/.test(getComputedStyle(sm).display) && parseFloat(getComputedStyle(sm).fontSize) < parseFloat(getComputedStyle(n).fontSize) ? ls : null }
    const parts = (k) => [...k.childNodes].flatMap((n) => n.nodeType === 1 && n.children.length >= 2 && [...n.children].every((g) => !g.children.length && txt(g)) && n.children.length === n.childNodes.length ? [...n.children].map(txt) : n.nodeType === 1 && underLine(n) ? underLine(n) : [(n.textContent || '').trim()]).filter(Boolean)
    const boldFirst = (k) => { const w = [...k.querySelectorAll('*')].find((g) => !g.children.length && txt(g)); return w ? parseFloat(getComputedStyle(w).fontWeight) >= 600 : false }
    // chat messages: each item a small filled square/round avatar left, a bold name, a small time, then the
    // message (round 5 e3: the pane was dropped; the thread's rows were glued 'Tom Becker10:05 Dark one...')
    const msgOf = (k) => {
      const leaves = [...k.querySelectorAll('*')].filter((g) => !g.children.length)
      const av = leaves.find((g) => !txt(g)); if (!av) return null
      const ab = av.getBoundingClientRect()
      if (!(filled(av) && ab.width >= 24 && ab.width <= 56 && Math.abs(ab.width - ab.height) <= 2 && ab.left < k.getBoundingClientRect().left + 40)) return null
      const name = leaves.find((g) => txt(g) && parseFloat(getComputedStyle(g).fontWeight) >= 600)
      const time = leaves.find((g) => g !== name && /^\d{1,2}[:.]\d{2}( ?[ap]m)?$|^(yesterday|today|now|\d+ ?[mhd])$/i.test(txt(g)))
      if (!name || !time) return null
      const extra = leaves.filter((g) => g !== name && g !== time && txt(g) && txt(g).length <= 24 && (filled(g) || parseFloat(getComputedStyle(g).fontWeight) >= 600 || parseFloat(getComputedStyle(g).borderTopWidth) >= 1))
      let body = txt(k)
      for (const g of [name, time, ...extra]) body = body.replace(txt(g), '')
      // n147: the message's own blocks in order (round 12 e3: an inline @mention said as a chip under the line, a code
      // block dropped, the reactions and the replies link said as loose chips)
      const col = name.parentElement
      const blocks = col && col !== k ? [...col.children].filter((g) => g !== name && g !== time && txt(g)).map((g) => {
        const gc = getComputedStyle(g)
        if (/pre/.test(gc.whiteSpace) && (g.innerText || '').includes('\n')) return { pre: (g.innerText || '').split('\n').map((x) => x.replace(/\s+$/, '')), fill: filled(g), border: parseFloat(gc.borderTopWidth) >= 1 ? rgba(gc.borderTopColor) : null, ink: rgba(gc.color), px: Math.round(parseFloat(gc.fontSize)), rad: Math.round(parseFloat(gc.borderTopLeftRadius) || 0) }
        if (g.children.length >= 1 && [...g.children].every((x) => !x.children.length && txt(x) && txt(x).length <= 12 && (filled(x) || parseFloat(getComputedStyle(x).borderTopWidth) >= 1)) && g.children.length === [...g.childNodes].filter((n) => n.nodeType === 1 || (n.textContent || '').trim()).length) return { pills: [...g.children].map((x) => { const xc = getComputedStyle(x); return { t: txt(x), fill: filled(x), border: parseFloat(xc.borderTopWidth) >= 1 ? rgba(xc.borderTopColor) : null, rad: Math.round(parseFloat(xc.borderTopLeftRadius) || 0) } }) }
        const inl = [...g.children].filter((x) => !x.children.length && txt(x) && filled(x) && getComputedStyle(x).display === 'inline')
        return { t: txt(g), inl: inl.map((x) => ({ t: txt(x), fill: filled(x), ink: rgba(getComputedStyle(x).color) })), ink: rgba(gc.color), bold: Number(gc.fontWeight) >= 600, px: Math.round(parseFloat(gc.fontSize)) }
      }) : null
      return { av: filled(av), round: parseFloat(getComputedStyle(av).borderTopLeftRadius) >= ab.width * 0.4, px: Math.round(ab.width), name: txt(name), time: txt(time), body: body.replace(/\s+/g, ' ').trim(), extra: extra.map((g) => ({ t: txt(g), chip: !!filled(g), ink: rgba(getComputedStyle(g).color) })), blocks }
    }
    // (2+ is enough: a thread pane holds two replies under its title)
    const mk = kids.filter((k) => !k.dataset?.r && !k.querySelector('[data-r]') && msgOf(k))
    if (mk.length >= 2 && mk.length >= kids.length - 2) {
      const head = kids.find((k) => !mk.includes(k) && !k.dataset?.r && !k.querySelector('[data-r]') && txt(k) && txt(k).length <= 40)
      // n147: a header above the first message and a composer pinned under the last (round 12 e3: the composer was taken
      // as the header and built at the top; the channel header was lost)
      const lastB = mk[mk.length - 1].getBoundingClientRect().bottom, firstT = mk[0].getBoundingClientRect().top
      const comp = kids.find((k) => !mk.includes(k) && !k.dataset?.r && k.getBoundingClientRect().top >= lastB - 2 && getComputedStyle(k).position === 'absolute' && parseFloat(getComputedStyle(k).borderTopWidth) >= 1)
      const richMsg = mk.map(msgOf).some((m) => (m.blocks ?? []).some((b) => b.pre || b.pills || (b.inl && b.inl.length)))
      if (comp || richMsg) {
        const top = kids.find((k) => !mk.includes(k) && k !== comp && txt(k) && k.getBoundingClientRect().bottom <= firstT + 2)
        const o = el.getBoundingClientRect(), cb = comp?.getBoundingClientRect(), cc = comp ? getComputedStyle(comp) : null
        // a small grey divider line between messages ('4 replies' in a thread)
        const seps = kids.filter((k) => !mk.includes(k) && k !== top && k !== comp && txt(k) && txt(k).length <= 30 && k.getBoundingClientRect().top > firstT).map((k) => ({ t: txt(k), after: mk.filter((m) => m.getBoundingClientRect().top < k.getBoundingClientRect().top).length, rule: parseFloat(getComputedStyle(k).borderTopWidth) >= 1 }))
        const bar = comp && [...comp.children].find((g) => g.children.length >= 3 && [...g.children].every((x) => txt(x) && txt(x).length <= 4))
        const ph = comp && [...comp.children].find((g) => g !== bar && txt(g) && !g.children.length)
        const send = comp && [...comp.children].find((g) => !txt(g) && filled(g))
        const hp = top ? [...top.children].filter((g) => txt(g)).map((g) => { const gc = getComputedStyle(g); return { t: txt(g), px: Math.round(parseFloat(gc.fontSize)), bold: Number(gc.fontWeight) >= 600, ink: rgba(gc.color) } }) : []
        return { type: 'messages', head: top ? txt(top) : null, headParts: hp.length >= 2 ? hp : null, headH: top ? Math.round(top.getBoundingClientRect().height) : null, headRule: top ? parseFloat(getComputedStyle(top).borderBottomWidth) >= 1 : false, items: mk.map(msgOf), seps,
          composer: comp && { x: Math.round(cb.left - o.left), y: Math.round(cb.top - o.top), w: Math.round(cb.width), h: Math.round(cb.height), border: rgba(cc.borderTopColor), rad: Math.round(parseFloat(cc.borderTopLeftRadius) || 0), bar: bar ? { items: [...bar.children].map(txt), h: Math.round(bar.getBoundingClientRect().height), fill: filled(bar) } : null, ph: ph ? txt(ph) : null, send: send ? { fill: filled(send), w: Math.round(send.getBoundingClientRect().width), h: Math.round(send.getBoundingClientRect().height) } : null } }
      }
      return { type: 'messages', head: head ? txt(head) : null, headRule: head ? parseFloat(getComputedStyle(head).borderBottomWidth) >= 1 : false, items: mk.map(msgOf) }
    }
    if (rep.length >= 3) {
      // the highlighted item: the one whose fill differs from all the others
      const key = (k) => { const c = filled(k); return c ? `${c.r},${c.g},${c.b}` : 'none' }
      const odd = rep.filter((k) => rep.filter((j) => key(j) === key(k)).length === 1)
      const on = odd.length === 1 && rep.length >= 3 ? parts(odd[0])[0] ?? null : null
      // a heading or a lead line beside the list ('Showing 1-7 of 48')
      const head = kids.find((k) => !rep.includes(k) && !rep.some((r) => k.contains(r)) && txt(k) && txt(k).length <= 40)
      // the block's other short lines (a tier's price, its button): a list note alone drops them (round 1 e2)
      const multi = (k) => { const ls = (k.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean); return ls.length >= 2 && ls.length <= 4 && ls.every((x) => x.length <= 32) }
      const extra = kids.filter((k) => k !== head && !rep.includes(k) && !rep.some((r) => k.contains(r)) && txt(k) && (txt(k).length <= 32 || multi(k))).map((k) => {
        const c = getComputedStyle(k); const b = k.getBoundingClientRect()
        // n127: an item pinned to the card's bottom (a held-seat timer over a pay button, round 8 e4: both built right under the list)
        const ob = el.getBoundingClientRect()
        const pin = c.position === 'absolute' && ob.bottom - b.bottom <= 140 && ob.height >= 300 ? { up: Math.round(ob.bottom - b.bottom), w: Math.round(b.width) } : null
        const ink = rgba(c.color), bold = Number(c.fontWeight) >= 600
        const btn = b.height >= 28 && b.height <= 64 && (filled(k) || parseFloat(c.borderTopWidth) >= 1) && (/center/.test(c.textAlign) || (/flex/.test(c.display) && /center/.test(c.justifyContent)))
        // a row of filled chips (seat labels E4 E5, round 8 e4: run together as 'E4E5')
        const cs2 = [...k.children]
        if (cs2.length >= 2 && cs2.every((g) => filled(g) && txt(g) && txt(g).length <= 8 && !g.children.length)) return { t: cs2.map(txt).join(' '), chips: cs2.map((g) => ({ t: txt(g), fill: filled(g), ink: rgba(getComputedStyle(g).color) })), btn: false, fill: null, big: false }
        // n143: an extra that comes after the list in the page is said after it (round 11 e3: the LABELS group was said
        // before the folders and built above them)
        const after = !!(rep[rep.length - 1].compareDocumentPosition(k) & 4)
        // n143: a row of short tabs side by side, one selected (round 11 e3 Primary / Promotions / Updates: dropped)
        const tb = [...k.children].map((g) => g.getBoundingClientRect())
        if (!pin && cs2.length >= 2 && cs2.length <= 6 && cs2.every((g) => txt(g) && txt(g).length <= 20 && !filled(g) && parseFloat(getComputedStyle(g).borderTopWidth) < 1) && tb.every((r) => Math.abs(r.top - tb[0].top) <= 4)) {
          const look = (g) => { const gc = getComputedStyle(g); return `${gc.color}|${gc.borderBottomColor}|${gc.borderBottomWidth}|${gc.fontWeight}` }
          const odd = cs2.filter((g) => cs2.filter((j) => look(j) === look(g)).length === 1)
          const sel = odd.length === 1 ? odd[0] : null
          const sc = sel ? getComputedStyle(sel) : null
          return { t: cs2.map(txt).join(' '), tabs: cs2.map(txt), sel: sel ? txt(sel) : null, selInk: sc ? rgba(sc.color) : null, selLine: sc && parseFloat(sc.borderBottomWidth) >= 2 ? { w: Math.round(parseFloat(sc.borderBottomWidth)), c: rgba(sc.borderBottomColor) } : null, h: Math.round(b.height), btn: false, fill: null, big: false, after }
        }
        // grey copy lines under a title (date, hall: round 8 e4 dropped) say their line breaks
        const lines = (k.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean)
        // n143: a small round colour dot before the words (round 11 e3 label dots: lost)
        const dg = [...k.querySelectorAll('*')].find((g) => !txt(g) && !g.children.length && filled(g) && g.getBoundingClientRect().width >= 6 && g.getBoundingClientRect().width <= 20)
        return { t: txt(k), dot: dg ? filled(dg) : null, btn, fill: btn ? filled(k) : null, big: parseFloat(c.fontSize) >= 24, lines: lines.length >= 2 && lines.length <= 4 ? lines : null, pin, ink, bold, after, caps: /^[A-Z0-9 &/-]+$/.test(txt(k)) && txt(k).length <= 24 && parseFloat(c.fontSize) <= 13 }
      })
      // a picture leading the block, its copy beside it (a film poster in an order summary, round 8 e4: dropped)
      const pic = (() => { const g = kids.find((k) => !txt(k) && !k.children.length && (filled(k) || /gradient/.test(getComputedStyle(k).backgroundImage))); if (!g) return null; const b = g.getBoundingClientRect(), o = el.getBoundingClientRect(); return b.width >= 50 && b.height >= 50 ? { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.left - o.left), y: Math.round(b.top - o.top), bg: getComputedStyle(g).backgroundImage, fill: filled(g), rad: Math.round(parseFloat(getComputedStyle(g).borderTopLeftRadius) || 0), float: getComputedStyle(g).float } : null })()
      // a coloured dot leading each item (round 4 e5 task names: the dots were dropped)
      const dotOf = (k) => { const d = [...k.querySelectorAll('*')].find((g) => !txt(g) && !g.children.length); if (!d) return null; const b = d.getBoundingClientRect(); const r = parseFloat(getComputedStyle(d).borderTopLeftRadius); return filled(d) && b.width >= 6 && b.width <= 32 && Math.abs(b.width - b.height) <= 2 && r >= b.width * 0.4 && b.left < k.getBoundingClientRect().left + 40 ? filled(d) : null }
      const dots = rep.map(dotOf)
      // a square picture leading each item (an order line's product thumbnail, round 4 e3: dropped)
      const thumbOf = (k) => { const d = [...k.querySelectorAll('*')].find((g) => !txt(g) && !g.children.length); if (!d) return null; const b = d.getBoundingClientRect(); return (filled(d) || /gradient|url/.test(getComputedStyle(d).backgroundImage)) && b.width >= 36 && b.width <= 120 && Math.abs(b.width - b.height) <= b.width * 0.2 && b.left < k.getBoundingClientRect().left + 24 ? { fill: filled(d), px: Math.round(b.width), round: parseFloat(getComputedStyle(d).borderTopLeftRadius) >= b.width * 0.4 } : null }
      // a toggle switch on the right of each row (round 5 e4: on/off states unsaid)
      const switchOf = (k) => { const d = [...k.querySelectorAll('*')].find((g) => { const b = g.getBoundingClientRect(); return !txt(g) && b.width >= 30 && b.width <= 70 && b.height >= 16 && b.height <= 40 && b.width > b.height * 1.3 && parseFloat(getComputedStyle(g).borderTopLeftRadius) >= b.height / 2 - 1 }); return d ? filled(d) : null }
      const switches = rep.map(switchOf)
      const thumbs = rep.map(thumbOf)
      // a grid of tiles, each a picture block on top (round 4 e4 file tiles were said as a list and built as rows)
      const grid = rep[0].parentElement; const gcs = getComputedStyle(grid)
      const gcols = gcs.display === 'grid' ? gcs.gridTemplateColumns.split(' ').length : 0
      const topPic = (k) => { const d = k.firstElementChild; if (!d || txt(d)) return null; const b = d.getBoundingClientRect(); const kb = k.getBoundingClientRect(); return b.width >= kb.width * 0.6 && b.height >= 40 && b.top <= kb.top + 24 ? (filled(d) ?? (/gradient/.test(getComputedStyle(d).backgroundImage) ? 'gradient' : null)) : null }
      if (gcols >= 2 && rep.length >= 4 && rep.every(topPic)) {
        const bw = (k) => parseFloat(getComputedStyle(k).borderTopWidth) || 0
        const sel = rep.filter((k) => bw(k) > Math.min(...rep.map(bw)))
        return { type: 'tiles', cols: gcols, items: rep.map((k) => ({ parts: parts(k), pic: topPic(k), grad: topPic(k) === 'gradient' ? [...getComputedStyle(k.firstElementChild).backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0])) : null })), bordered: rep.every((k) => bw(k) >= 1), sel: sel.length === 1 ? { t: parts(sel[0])[0], c: rgba(getComputedStyle(sel[0]).borderTopColor), w: bw(sel[0]) } : null }
      }
      // order lines (round 6 e4 summary): a square picture with a small round quantity badge on its corner, a name
      // over a small line, a price right. Said as 'list: 1, 2, 1' (the badges) it lost names, prices and pictures.
      const badgeOf = (k) => {
        const t = k.firstElementChild; if (!t || t.children.length !== 1) return null
        const e = t.firstElementChild, b = t.getBoundingClientRect(), eb = e.getBoundingClientRect()
        return !e.children.length && /^\d+$/.test(txt(e)) && b.width >= 36 && b.width <= 120 && Math.abs(b.width - b.height) <= b.width * 0.2 && eb.width <= 32 && parseFloat(getComputedStyle(e).borderTopLeftRadius) >= eb.width * 0.4 && eb.right >= b.right - 4 && eb.top <= b.top + 4
          ? { qty: txt(e), px: Math.round(b.width), fill: filled(t), radius: Math.round(parseFloat(getComputedStyle(t).borderTopLeftRadius)), badge: filled(e) } : null
      }
      const badges = rep.map(badgeOf)
      if (badges.every(Boolean)) {
        const lines = (k) => [...k.children].slice(1).flatMap((n) => (n.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean))
        const after = kids.filter((k) => !rep.includes(k) && txt(k) && k.getBoundingClientRect().top > rep[rep.length - 1].getBoundingClientRect().top).map((k) => {
          const c = getComputedStyle(k), leaves = [...k.querySelectorAll('*')].filter((g) => !g.children.length && txt(g))
          const field = leaves.find((g) => parseFloat(getComputedStyle(g).borderTopWidth) >= 1 && g.getBoundingClientRect().height >= 30)
          const button = leaves.find((g) => g !== field && filled(g) && g.getBoundingClientRect().height >= 26)
          return { t: txt(k), field: field ? txt(field) : null, button: button ? { t: txt(button), fill: filled(button) } : null, ruled: parseFloat(c.borderTopWidth) >= 1, px: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 700 }
        })
        // where the first row starts, and that nothing sits above it (round 6 e4: a heading was invented and rows began at the top)
        const top = Math.round(rep[0].getBoundingClientRect().top - el.getBoundingClientRect().top)
        const above = kids.some((k) => !rep.includes(k) && txt(k) && k.getBoundingClientRect().top < rep[0].getBoundingClientRect().top)
        return { type: 'order', items: rep.map((k, i) => { const ls = lines(k); return { qty: badges[i].qty, fill: badges[i].fill, name: ls[0], sub: ls.length >= 3 ? ls.slice(1, -1).join(' ') : null, price: ls.length >= 2 ? ls[ls.length - 1] : null } }), thumb: badges[0], after, top: !above && top >= 60 ? top : null }
      }
      // the highlighted item's coloured left edge (round 6 e3 selected mail row)
      const onEdge = odd.length === 1 && parseFloat(getComputedStyle(odd[0]).borderLeftWidth) >= 3 ? rgba(getComputedStyle(odd[0]).borderLeftColor) : null
      // a filled lead button over the list (round 8 e1 '✎ Compose', lavender, was built white)
      const headLook = head && filled(head) ? (() => { const c = getComputedStyle(head); return { fill: filled(head), ink: rgba(c.color), rad: Math.round(parseFloat(c.borderTopLeftRadius) || 0), w: Math.round(head.getBoundingClientRect().width), h: Math.round(head.getBoundingClientRect().height), bold: Number(c.fontWeight) >= 600 } })() : null
      const onInk = odd.length === 1 ? rgba(getComputedStyle(odd[0]).color) : null
      const onRad = odd.length === 1 ? Math.round(parseFloat(getComputedStyle(odd[0]).borderTopLeftRadius) || 0) : 0
      // n144: extras that sit BETWEEN the list's items (a file tree: retry.ts under '▾ src'; round 11 e1 built the files
      // above the folders) make the whole list said in page order with each line's indent
      const inside = extra.length && kids.some((k) => !rep.includes(k) && txt(k) && (rep[0].compareDocumentPosition(k) & 4) && (k.compareDocumentPosition(rep[rep.length - 1]) & 4))
      const ox = el.getBoundingClientRect().left
      const order = inside && kids.filter((k) => k !== head && txt(k)).every((k) => !k.children.length) ? kids.filter((k) => k !== head && txt(k) && txt(k).length <= 40 && !k.children.length).map((k) => ({ t: txt(k), ind: Math.round(k.getBoundingClientRect().left - ox + parseFloat(getComputedStyle(k).paddingLeft)), fill: filled(k), ink: rgba(getComputedStyle(k).color) })) : null
      // n147: a grouped list (round 12 e2 Gantt task list): group rows (bold, own fill) sit BETWEEN task rows that carry
      // an owner dot, under a column-head row. Said as a head button plus a list, the groups were built above all the
      // tasks. Every row said in page order, each with its look, when the rows share one height.
      const rowKids = kids.filter((k) => txt(k))
      const rh = rowKids.map((k) => Math.round(k.getBoundingClientRect().height))
      const ownT = (k) => [...k.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim()
      const grouped = !order && inside && rowKids.length >= 6 && rowKids.length <= 24 && rh.every((h) => Math.abs(h - rh[0]) <= 2) && rowKids.some((k) => filled(k)) && rowKids.some((k) => !filled(k)) && rowKids.every((k) => ownT(k) && ownT(k).length <= 40 && k.children.length <= 2)
        ? rowKids.map((k) => {
          const c = getComputedStyle(k)
          const sm = [...k.children].find((g) => txt(g) && !g.children.length)
          const dt = [...k.children].find((g) => !txt(g) && !g.children.length && filled(g) && g.getBoundingClientRect().width <= 32)
          return { t: ownT(k), fill: filled(k), bold: Number(c.fontWeight) >= 600, ink: rgba(c.color), px: Math.round(parseFloat(c.fontSize)), right: sm ? txt(sm) : null, dot: dt ? { c: filled(dt), px: Math.round(dt.getBoundingClientRect().width), round: parseFloat(getComputedStyle(dt).borderTopLeftRadius) >= dt.getBoundingClientRect().width * 0.4 } : null, rule: parseFloat(c.borderBottomWidth) >= 1 ? rgba(c.borderBottomColor) : null }
        }) : null
      const groupedH = grouped ? rh[0] : null
      // n173: the same grouped task list built of cell spans under a taller column-head row (round 17 e1: said as a
      // 'filled button' head and group rows as 'tabs side by side'; built as tabs)
      const cellRow = (k) => k.children.length >= 2 && k.children.length <= 5 && [...k.children].every((g) => !g.children.length) && !ownT(k)
      const gtable = !grouped && rowKids.length >= 6 && rowKids.length <= 24 && rowKids.every(cellRow) && rh.slice(1).every((h) => Math.abs(h - rh[1]) <= 2) && rowKids.slice(1).some((k) => filled(k)) && rowKids.slice(1).some((k) => !filled(k))
        ? (() => {
          const hd = rh[0] !== rh[1] || getComputedStyle(rowKids[0]).textTransform === 'uppercase' || Number(getComputedStyle(rowKids[0]).letterSpacing.replace('px', '')) >= 0.5 || Math.abs(parseFloat(getComputedStyle(rowKids[0]).fontSize) - parseFloat(getComputedStyle(rowKids[1]).fontSize)) >= 1
          // n175: each cell's own colour and column width, the row's inset stripe, the table's mono face (round 17 e2 log
          // table: levels' red/yellow, the message column and the selected row's orange stripe were never said)
          const cell = (g) => { const b = g.getBoundingClientRect(), f = filled(g); return f && b.width <= 32 && Math.abs(b.width - b.height) <= 2 ? { t: txt(g), badge: { c: f, px: Math.round(b.width), round: parseFloat(getComputedStyle(g).borderTopLeftRadius) >= b.width * 0.4 } } : { t: txt(g), right: ['right', 'end'].includes(getComputedStyle(g).textAlign), ink: rgba(getComputedStyle(g).color), w: Math.round(b.width) } }
          const row = (k) => { const c = getComputedStyle(k); const st = c.boxShadow.match(/(rgba?\([^)]+\)) (-?\d+)px 0px 0px 0px inset/) || c.boxShadow.match(/(rgba?\([^)]+\)) (-?\d+)px 0px inset/); return { cells: [...k.children].map(cell), fill: filled(k), bold: Number(c.fontWeight) >= 600, ink: rgba(c.color), stripe: st && Math.abs(+st[2]) >= 2 ? { c: rgba(st[1]), px: Math.abs(+st[2]), side: +st[2] > 0 ? 'left' : 'right' } : null } }
          const h0 = getComputedStyle(rowKids[0]), r1 = getComputedStyle(rowKids[1])
          return { mono: /mono|courier|consolas|menlo/i.test(r1.fontFamily) ? { px: Math.round(parseFloat(r1.fontSize)) } : null, cols: (() => { const wide = rowKids.slice(1).reduce((a, k) => (k.children.length > a.children.length ? k : a), rowKids[1]); return [...wide.children].map((g) => Math.round(g.getBoundingClientRect().left - wide.getBoundingClientRect().left)) })(), head: hd ? { cells: [...rowKids[0].children].map(txt), h: rh[0], fill: filled(rowKids[0]), ink: rgba(h0.color), px: Math.round(parseFloat(h0.fontSize)), bold: Number(h0.fontWeight) >= 600 } : null, rows: (hd ? rowKids.slice(1) : rowKids).map(row), h: rh[1], rule: parseFloat(getComputedStyle(rowKids[1]).borderBottomWidth) >= 1 ? rgba(getComputedStyle(rowKids[1]).borderBottomColor) : null }
        })() : null
      // n150: a big-title header block above the list (round 13 e2: the album cover, kicker, 48px title and meta line
      // were dropped; only the play row was said)
      const heroEl = kids.find((k) => !rep.includes(k) && !rep.some((r) => k.contains(r)) && (rep[0].compareDocumentPosition(k) & 2) && k.querySelector('h1,h2'))
      const hero = heroEl ? (() => {
        const h = heroEl.querySelector('h1,h2'), hc = getComputedStyle(h), hb = heroEl.getBoundingClientRect(), ob = el.getBoundingClientRect()
        const cov = [...heroEl.querySelectorAll('*')].find((g) => !txt(g) && g.getBoundingClientRect().width >= 60 && (filled(g) || getComputedStyle(g).backgroundImage !== 'none'))
        const cb = cov?.getBoundingClientRect(), cc = cov ? getComputedStyle(cov) : null
        const sm = [...heroEl.querySelectorAll('small,p,span')].filter((g) => txt(g) && !g.contains(h)).map((g) => ({ t: txt(g), px: Math.round(parseFloat(getComputedStyle(g).fontSize)), ink: rgba(getComputedStyle(g).color), bold: Number(getComputedStyle(g).fontWeight) >= 600, above: g.getBoundingClientRect().top < h.getBoundingClientRect().top }))
        return { h: txt(h), px: Math.round(parseFloat(hc.fontSize)), weight: Number(hc.fontWeight), ink: rgba(hc.color), x: Math.round(h.getBoundingClientRect().left - ob.left), y: Math.round(hb.top - ob.top), hH: Math.round(hb.height), cover: cb ? { w: Math.round(cb.width), h: Math.round(cb.height), x: Math.round(cb.left - ob.left), y: Math.round(cb.top - ob.top), bg: cc.backgroundImage !== 'none' ? cc.backgroundImage : cc.backgroundColor, rad: cc.borderTopLeftRadius } : null, small: sm }
      })() : null
      return { type: 'list', order, grouped, gtable, hero, groupedH, pic, head: head ? txt(head) : null, headLook, onInk, onRad, items: rep.map(parts), bold: rep.map(boldFirst), bold2: rep.map((k) => { const w = [...k.querySelectorAll('*')].filter((g) => !g.children.length && txt(g))[1]; return w ? parseFloat(getComputedStyle(w).fontWeight) >= 600 : false }), on, onFill: odd.length === 1 ? filled(odd[0]) : null, onEdge, extra, dots: dots.every(Boolean) ? dots : null, stacked: rep.every((k, i) => i === 0 || k.getBoundingClientRect().top >= rep[i - 1].getBoundingClientRect().bottom - 2), thumbs: thumbs.every(Boolean) ? thumbs : null, switches: switches.every(Boolean) ? switches : null, smalls: rep.map((k) => { const sm = [...k.querySelectorAll('small')].map(txt); return sm.length === 1 ? sm[0] : null }), inks: rep.map((k) => rgba(getComputedStyle(k).color)), weights: rep.map((k) => Number(getComputedStyle(k).fontWeight)), px: Math.round(parseFloat(getComputedStyle(rep[0]).fontSize)),
        // items under their own small headings, in page order (round 8 e5 docs nav: 'GETTING STARTED ... 5 more' became
        // invented items under the wrong headings)
        groups: (() => { const par = rep[0].parentElement; if (!rep.every((k) => k.parentElement === par)) return null; const gs = []; for (const k of par.children) { if (rep.includes(k)) { if (!gs.length) return null; gs[gs.length - 1].items.push(rep.indexOf(k)) } else if (txt(k) && !k.dataset?.r && !k.querySelector('[data-r]') && txt(k).length <= 32) gs.push({ h: txt(k), items: [] }) } return gs.length >= 2 && gs.every((g) => g.items.length) ? gs : null })(),
        // a side nav's row pitch, where its first line starts and its edge rule (round 8 e5: rows built ~34px apart for
        // 30, the nav started ~40px high, its right-hand rule was lost)
        navLook: (() => { const tops = rep.map((k) => k.getBoundingClientRect().top); const st = tops.slice(1).map((t, i) => t - tops[i]).filter((x) => x > 0 && x < 60).sort((a, b) => a - b); const eb = el.getBoundingClientRect(); const first = [...rep[0].parentElement.children].find((k) => txt(k)); const cs = getComputedStyle(el); const rw = parseFloat(cs.borderRightWidth) || 0; return { pitch: st.length ? Math.round(st[Math.floor(st.length / 2)]) : null, rowH: Math.round(rep[0].getBoundingClientRect().height), first: first ? Math.round(first.getBoundingClientRect().top - eb.top) : null, w: Math.round(eb.width), rule: rw >= 1 ? rgba(cs.borderRightColor) : null, onEdge: odd.length === 1 && parseFloat(getComputedStyle(odd[0]).borderLeftWidth) >= 1 ? { w: Math.round(parseFloat(getComputedStyle(odd[0]).borderLeftWidth)), c: rgba(getComputedStyle(odd[0]).borderLeftColor) } : null } })() }
    }
    return null
  }
  // a fine grain laid over the whole page by an unmarked layer (round 5 c4: unsaid)
  const grain = [...document.querySelectorAll('body *')].some((k) => { const b = k.getBoundingClientRect(); return !k.closest('[data-r]') && /repeating-(radial|linear)-gradient/.test(getComputedStyle(k).backgroundImage) && b.width >= innerWidth * 0.9 && b.height >= innerHeight * 0.9 })
  // n141: round 11 facts. A stylesheet value as written (a computed 3D transform is an unreadable matrix3d)
  const ruleOf = (el, prop) => {
    let v = null
    for (const sh of document.styleSheets) for (const ru of sh.cssRules ?? []) { try { if (ru.selectorText && el.matches(ru.selectorText) && ru.style.getPropertyValue(prop)) v = ru.style.getPropertyValue(prop) } catch {} }
    return v
  }
  const keyTo = (name) => { for (const sh of document.styleSheets) for (const ru of sh.cssRules ?? []) if (ru.type === 7 && ru.name === name) return [...ru.cssRules].map((k) => `${k.keyText} { ${k.style.cssText} }`).join(' '); return null }
  const anim = (el) => { const c = getComputedStyle(el); if (!c.animationName || c.animationName === 'none') return null; return { name: c.animationName, dur: c.animationDuration, fn: c.animationTimingFunction, frames: keyTo(c.animationName) } }
  const r11 = (el) => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect(), o = {}
    // a preserve-3d object: its faces, each face's own written transform, the group's turn and spin (round 11 c4 cube)
    const g = [el, ...el.querySelectorAll('*')].find((k) => getComputedStyle(k).transformStyle === 'preserve-3d' && k.children.length >= 4)
    if (g) {
      const persp = [el, ...el.querySelectorAll('*')].map((k) => getComputedStyle(k).perspective).find((v) => v && v !== 'none')
      // n155: the group's own box when it is not the whole scene (round 14 c3 ring at 540,40 in a 1280px scene: said
      // inset 0, built at the scene's left edge and turned to the wrong front face), each face's rounding, padding,
      // text alignment, sub-line and mask (ticket notches lost)
      const gInset = g !== el && (g.offsetLeft !== 0 || g.offsetTop !== 0 || Math.abs(g.offsetWidth - r.width) > 2 || Math.abs(g.offsetHeight - r.height) > 2)
      const maskOf = (c) => { const m = c.webkitMaskImage && c.webkitMaskImage !== 'none' ? c.webkitMaskImage : (c.maskImage && c.maskImage !== 'none' ? c.maskImage : null); return m ? { img: m, pos: c.webkitMaskPosition || c.maskPosition, size: c.webkitMaskSize || c.maskSize, rep: c.webkitMaskRepeat || c.maskRepeat } : null }
      o.cube = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), persp, turn: ruleOf(g, 'transform'), anim: anim(g),
        group: gInset ? { x: g.offsetLeft, y: g.offsetTop, w: g.offsetWidth, h: g.offsetHeight } : null,
        faces: [...g.children].map((k) => { const c = getComputedStyle(k), b = k.getBoundingClientRect(); const sub = [...k.children].find((q) => q.innerText && Math.abs(parseFloat(getComputedStyle(q).fontSize) - parseFloat(c.fontSize)) >= 2); const sc = sub && getComputedStyle(sub)
          return { w: Math.round(k.offsetWidth), h: Math.round(k.offsetHeight), fill: rgba(c.backgroundColor), t: (k.innerText || '').trim(), px: Math.round(parseFloat(c.fontSize)), weight: Number(c.fontWeight), ink: rgba(c.color), bw: Math.round(parseFloat(c.borderTopWidth) || 0), bc: rgba(c.borderTopColor), tf: ruleOf(k, 'transform'),
            rad: Math.round(parseFloat(c.borderTopLeftRadius) || 0), pad: Math.round(parseFloat(c.paddingTop) || 0), align: c.textAlign, centred: c.display.includes('flex') && c.alignItems === 'center' || c.textAlign === 'center',
            sub: sub ? { t: sub.innerText.trim(), px: Math.round(parseFloat(sc.fontSize)), weight: Number(sc.fontWeight), op: +sc.opacity } : null, mask: maskOf(c) } }) }
    }
    // n146: an isometric plane: a preserve-3d block with its own fill/grid whose children each lift a coloured
    // child by translateZ (round 12 c1: said as a 3D cube of four #000000 faces; the plane, grid and colours unsaid)
    const liftOf = (k) => { const m = getComputedStyle(k).transform.match(/^matrix3d\(([^)]+)\)/); return m ? Math.round(+m[1].split(',')[14]) : 0 }
    if (g && [...g.children].every((k) => k.children.length === 1 && liftOf(k.children[0]) > 0)) {
      const gs = getComputedStyle(g)
      o.iso = { x: Math.round(g.offsetLeft), y: Math.round(g.offsetTop), w: g.offsetWidth, h: g.offsetHeight, turn: ruleOf(g, 'transform'), fill: rgba(gs.backgroundColor), img: gs.backgroundImage, size: gs.backgroundSize,
        outline: parseFloat(gs.outlineWidth) > 0 && gs.outlineStyle !== 'none' ? { w: Math.round(parseFloat(gs.outlineWidth)), c: rgba(gs.outlineColor) } : null,
        persp: [el, ...el.querySelectorAll('*')].map((k) => getComputedStyle(k).perspective).find((v) => v && v !== 'none') ?? null,
        towers: [...g.children].map((k) => ({ x: k.offsetLeft, y: k.offsetTop, w: k.offsetWidth, h: k.offsetHeight, lift: liftOf(k.children[0]), fill: rgba(getComputedStyle(k.children[0]).backgroundColor) })) }
      delete o.cube
    }
    // n178: an isometric scene of extruded blocks, each a preserve-3d div holding 2-3 faces lifted or folded up by
    // translateZ/rotateX/rotateY (round 18 c3: said as "a 3D cube" of seven #000000 faces all at 0,0, the faces'
    // own colours, places, heights and folds unsaid, the plane's grid and rim lost; built a bare tilted plane)
    const resolveVar = (k, v) => v && v.replace(/var\((--[\w-]+)\)/g, (_, n) => getComputedStyle(k).getPropertyValue(n).trim())
    const tfOf = (k) => resolveVar(k, k.style.transform || ruleOf(k, 'transform'))
    if (g && !o.iso) {
      const kids = [...g.children]
      const blocks = kids.filter((k) => getComputedStyle(k).transformStyle === 'preserve-3d' && k.children.length >= 2 && [...k.children].some((q) => /translateZ|rotate[XY]/.test(tfOf(q) ?? '')))
      if (blocks.length >= 2) {
        const box = (k) => ({ x: k.offsetLeft, y: k.offsetTop, w: k.offsetWidth, h: k.offsetHeight })
        const gs = getComputedStyle(g)
        o.isoBlocks = { ...box(g), turn: tfOf(g), fill: rgba(gs.backgroundColor), persp: [el, ...el.querySelectorAll('*')].map((k) => getComputedStyle(k).perspective).find((v) => v && v !== 'none') ?? null,
          flat: kids.filter((k) => !blocks.includes(k)).map((k) => { const c = getComputedStyle(k); return { ...box(k), fill: rgba(c.backgroundColor), img: c.backgroundImage, size: c.backgroundSize, shadow: c.boxShadow } }),
          blocks: blocks.map((k) => ({ ...box(k), faces: [...k.children].map((q) => { const c = getComputedStyle(q); return { ...box(q), fill: rgba(c.backgroundColor), tf: tfOf(q), origin: ruleOf(q, 'transform-origin') ?? c.transformOrigin } }) })) }
        delete o.cube
      }
    }
    // n146: a blurred conic-gradient glow (round 12 c3 aurora: said as a 900px donut chart, built a teal box)
    const au = [el, ...el.querySelectorAll('*')].find((k) => { const c = getComputedStyle(k); return /conic-gradient/.test(c.backgroundImage) && +(c.filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0) >= 20 })
    if (au) {
      const c = getComputedStyle(au)
      o.aurora = { x: Math.round(au.offsetLeft), y: Math.round(au.offsetTop), w: au.offsetWidth, h: au.offsetHeight, img: c.backgroundImage, blur: Math.round(+c.filter.match(/blur\(([\d.]+)px\)/)[1]), op: +c.opacity, round: c.borderTopLeftRadius.includes('%') || parseFloat(c.borderTopLeftRadius) >= au.offsetWidth * 0.4, anim: anim(au) }
    }
    // a block tilted in 3D with a layered background (round 11 c4 floor: the second grid layer was dropped)
    const tf = ruleOf(el, 'transform')
    if (!g && tf && /perspective|rotate[XY]|translateZ/.test(tf)) o.tilt3d = { tf, origin: ruleOf(el, 'transform-origin'), x: Math.round(el.offsetLeft), y: Math.round(el.offsetTop), w: el.offsetWidth, h: el.offsetHeight, bg: cs.backgroundImage, size: cs.backgroundSize, anim: anim(el) }
    // a masked block that is not text (round 11 c2 arch photo under a radial fade: said as a plain circle)
    const mk = cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : (cs.webkitMaskImage && cs.webkitMaskImage !== 'none' ? cs.webkitMaskImage : null)
    if (mk) o.mask = { img: mk, radius: cs.borderRadius }
    // words in a heading set in their own colour (round 11 c4 pink 'not')
    const base = rgba(cs.color)
    // n146: or in their own face or italic (round 12 c3 'listens' italic Georgia inside a thin sans heading: built upright)
    const ownFace = (k) => { const c = getComputedStyle(k); return c.fontStyle !== cs.fontStyle || c.fontFamily !== cs.fontFamily }
    const odd = [...el.querySelectorAll('span,em,b,strong,i')].filter((k) => !k.dataset?.r && (k.innerText || '').trim() && (() => { const c = rgba(getComputedStyle(k).color); return (c && base && c.a > 0.3 && Math.hypot(c.r - base.r, c.g - base.g, c.b - base.b) > 60) || ownFace(k) })())
    if (odd.length && odd.length <= 4 && parseFloat(cs.fontSize) >= 28) o.oddWords = odd.map((k) => { const c = getComputedStyle(k); return { t: (k.innerText || '').trim(), c: rgba(c.color), face: ownFace(k) ? { family: c.fontFamily, italic: c.fontStyle === 'italic', weight: Number(c.fontWeight) } : null } })
    // stat cells: a big number over a small label (round 11 c4 stats: labels said empty)
    const cells = [...el.children].filter((k) => k.children.length === 2 && !k.dataset?.r)
    if (cells.length >= 2 && cells.every((k) => parseFloat(getComputedStyle(k.children[0]).fontSize) >= 1.6 * parseFloat(getComputedStyle(k.children[1]).fontSize))) {
      // n146: stat cells that are frosted glass cards (round 12 c3: said as plain stats, glass and the lifted middle lost)
      const bf = (k) => { const c = getComputedStyle(k); return c.backdropFilter && c.backdropFilter !== 'none' ? c.backdropFilter : (c.webkitBackdropFilter && c.webkitBackdropFilter !== 'none' ? c.webkitBackdropFilter : null) }
      if (cells.every(bf)) o.glass = cells.map((k) => { const c = getComputedStyle(k), b = k.getBoundingClientRect(), [a, l] = k.children, ca = getComputedStyle(a), cl = getComputedStyle(l)
        const ty = (() => { const m = c.transform.match(/^matrix\(([^)]+)\)/); return m ? +m[1].split(',')[5] : 0 })()
        return { x: Math.round(b.x), y: Math.round(b.y - ty), lift: Math.round(-ty), w: Math.round(b.width), h: Math.round(b.height), fill: rgba(c.backgroundColor), bw: Math.round(parseFloat(c.borderTopWidth) || 0), bc: rgba(c.borderTopColor), rad: Math.round(parseFloat(c.borderTopLeftRadius) || 0), pad: Math.round(parseFloat(c.paddingTop) || 0), blur: bf(k), tf: ruleOf(k, 'transform'),
          n: a.innerText.trim(), npx: Math.round(parseFloat(ca.fontSize)), nw: Number(ca.fontWeight), nc: rgba(ca.color), l: l.innerText.trim(), lpx: Math.round(parseFloat(cl.fontSize)), lc: rgba(cl.color) } })
      o.stats = cells.map((k) => { const [a, b] = k.children, ca = getComputedStyle(a), cb = getComputedStyle(b); return { n: a.innerText.trim(), npx: Math.round(parseFloat(ca.fontSize)), nw: Number(ca.fontWeight), nc: rgba(ca.color), l: b.innerText.trim(), lpx: Math.round(parseFloat(cb.fontSize)), lc: rgba(cb.color) } })
    }
    // a paragraph with a button at its end (round 11 c2 copy: no note, the copy invented and the button lost)
    const btn = [...el.children].find((k) => (k.innerText || '').trim() && rgba(getComputedStyle(k).backgroundColor)?.a > 0.5 && (k.innerText || '').trim().length <= 30)
    // n154: an inline highlighted phrase inside its sentence (round 14 c2: said as a button under the copy, built
    // overlapping the line with a gap left in the sentence)
    const midText = btn && getComputedStyle(btn).display === 'inline' && btn.previousSibling?.nodeType === 3 && btn.previousSibling.textContent.trim() && btn.nextSibling?.nodeType === 3 && btn.nextSibling.textContent.trim()
    if (btn && midText && !el.querySelector('[data-r]')) {
      const c = getComputedStyle(btn)
      o.inlineMark = { full: (el.innerText || '').replace(/\s+/g, ' ').trim(), t: btn.innerText.trim(), fill: rgba(c.backgroundColor), ink: rgba(c.color), pad: Math.round(parseFloat(c.paddingLeft) || 0), px: Math.round(parseFloat(cs.fontSize)), lh: Math.round(parseFloat(cs.lineHeight) || 0), family: cs.fontFamily, w: Math.round(r.width), x: Math.round(r.x), y: Math.round(r.y) }
    } else if (btn && !el.querySelector('[data-r]') && el.querySelectorAll(':scope > br').length >= 3 && getComputedStyle(btn).display === 'block') {
      // n166: a column of lines broken by <br>, indented with spaces, one line a highlighted block (round 16 e3 file tree:
      // said as one line of text plus a button under it, built as one run-on line)
      const c = getComputedStyle(btn), lines = []
      let cur = ''
      const flush = (sel) => { if (cur.replace(/\u00a0/g, ' ').trim() || sel) lines.push({ t: cur.replace(/\u00a0/g, ' ').trimEnd(), sel: !!sel }); cur = '' }
      for (const n of el.childNodes) {
        if (n.nodeName === 'BR') flush()
        else if (n === btn) { flush(); cur = btn.textContent; flush(true) }
        else if (n.nodeType === 1 && /^(B|STRONG)$/.test(n.nodeName)) cur += `**${n.textContent}**`
        else cur += n.textContent
      }
      flush()
      o.lineList = { lines: lines.map((l) => ({ ...l, indent: (l.t.match(/^ */) || [''])[0].length, t: l.t.trim() })), px: Math.round(parseFloat(cs.fontSize)), lh: Math.round(parseFloat(cs.lineHeight) || 0), pad: Math.round(parseFloat(cs.paddingLeft) || 0), br: parseFloat(cs.borderRightWidth) >= 1 ? rgba(cs.borderRightColor) : null, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), fill: rgba(c.backgroundColor), rad: Math.round(parseFloat(c.borderTopLeftRadius) || 0), bold: Number(c.fontWeight) >= 600 }
    } else if (btn && !el.querySelector('[data-r]')) {
      const c = getComputedStyle(btn), b = btn.getBoundingClientRect()
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim()
      if (txt.length >= 12) o.copyBtn = { txt, px: Math.round(parseFloat(cs.fontSize)), lh: Math.round(parseFloat(cs.lineHeight) || 0), t: btn.innerText.trim(), fill: rgba(c.backgroundColor), ink: rgba(c.color), rad: Math.round(parseFloat(c.borderTopLeftRadius) || 0), w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y), bold: Number(c.fontWeight) >= 600, bpx: Math.round(parseFloat(c.fontSize)) }
    }
    // n163: a device body turned in 3D inside a perspective box (round 16 c5 phone: built flat and upright). Its parts
    // are read with the turn switched off, so they can be said in the body's own flat layout
    const dev = el.children.length === 1 && cs.perspective !== 'none' ? el.children[0] : null
    const dtf = dev ? ruleOf(dev, 'transform') : null
    if (dev && dtf && /rotate[XY]/.test(dtf) && dev.offsetWidth >= 150 && dev.offsetHeight >= 250 && getComputedStyle(dev).transformStyle !== 'preserve-3d' && rgba(getComputedStyle(dev).backgroundColor)?.a > 0.5 && (dev.innerText || '').trim()) {
      const dc = getComputedStyle(dev), keep = dev.style.transform
      dev.style.transform = 'none'
      const db = dev.getBoundingClientRect()
      const parts = [...dev.querySelectorAll('*')].map((x) => { const c = getComputedStyle(x), b = x.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return null
        const own = [...x.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(' ')
        const fill = rgba(c.backgroundColor)?.a > 0.5 ? rgba(c.backgroundColor) : null, img = /gradient/.test(c.backgroundImage) ? c.backgroundImage : null
        if (!own && !fill && !img) return null
        return { t: own || null, x: Math.round(b.left - db.left), y: Math.round(b.top - db.top), w: Math.round(b.width), h: Math.round(b.height), px: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 600, ink: rgba(c.color), op: +c.opacity, fill, img, rad: Math.round(parseFloat(c.borderTopLeftRadius) || 0), right: c.cssFloat === 'right' } }).filter(Boolean)
      dev.style.transform = keep
      o.device3d = { persp: cs.perspective, tf: dtf, x: Math.round(r.left), y: Math.round(r.top), w: dev.offsetWidth, h: dev.offsetHeight, fill: rgba(dc.backgroundColor), bw: parseFloat(dc.borderTopWidth) || 0, bc: rgba(dc.borderTopColor), rad: Math.round(parseFloat(dc.borderTopLeftRadius) || 0), shadow: dc.boxShadow, parts }
    }
    // n163: a wrapper whose children are each placed on their own (position absolute) around the page (round 16 c5 floating
    // chips: said as 'buttons', built as pills inside the nav)
    const ak = [...el.children]
    if (ak.length >= 2 && r.height < 10 && !el.querySelector('[data-r]') && ak.every((k) => getComputedStyle(k).position === 'absolute' && (k.innerText || '').trim() && [...k.children].every((q) => q.tagName === 'BR'))) {
      const spread = Math.max(...ak.map((k) => k.getBoundingClientRect().top)) - Math.min(...ak.map((k) => k.getBoundingClientRect().top))
      const same = ak.every((k) => k.offsetLeft === ak[0].offsetLeft && k.offsetTop === ak[0].offsetTop)
      const rots = ak.map((k) => (k.style.transform.match(/rotate\(([-\d.]+)deg\)/) || [])[1])
      // n163: letters stacked on one spot, each turned about a far origin, are a title set on an ARC (round 16 c3: said as links)
      if (same && rots.every((q) => q != null)) { const c = getComputedStyle(ak[0]); o.arcText = { letters: ak.map((k) => k.innerText.trim()), rots: rots.map(Number), cx: Math.round(r.left), cy: Math.round(r.top), radius: ak[0].offsetHeight, w: ak[0].offsetWidth, origin: c.transformOrigin, px: Math.round(parseFloat(c.fontSize)), weight: Number(c.fontWeight) || 400, ink: rgba(c.color), family: c.fontFamily } }
      else if (spread >= 80) o.absKids = ak.map((k) => { const c = getComputedStyle(k); return { t: k.innerText.trim(), x: Math.round(k.offsetLeft), y: Math.round(k.offsetTop), w: k.offsetWidth, h: k.offsetHeight, fill: rgba(c.backgroundColor), ink: rgba(c.color), px: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 600, rad: Math.round(parseFloat(c.borderTopLeftRadius) || 0), shadow: c.boxShadow, rot: (k.style.transform.match(/rotate\(([-\d.]+)deg\)/) || [])[1] ?? null, pad: `${Math.round(parseFloat(c.paddingTop) || 0)}px ${Math.round(parseFloat(c.paddingLeft) || 0)}px`, lh: c.lineHeight } })
    }
    // n165: a zero-size wrapper of blurred, textless, absolutely placed blobs is a field of soft glows (round 16 c2: three
    // glow blobs measured 0x0, got no note, built as nothing)
    if (ak.length >= 2 && r.height < 10 && !el.querySelector('[data-r]') && ak.every((k) => getComputedStyle(k).position === 'absolute' && !(k.innerText || '').trim() && /blur\(/.test(getComputedStyle(k).filter))) {
      o.blobField = ak.map((k) => { const c = getComputedStyle(k), b = k.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: k.offsetWidth, h: k.offsetHeight, c: rgba(c.backgroundColor), img: c.backgroundImage !== 'none' ? c.backgroundImage : null, blur: Math.round(parseFloat((c.filter.match(/blur\(([\d.]+)px/) || [])[1]) || 0), round: parseFloat(c.borderTopLeftRadius) >= k.offsetWidth * 0.4 || /50%/.test(c.borderTopLeftRadius), op: Math.round(parseFloat(c.opacity) * 100) } })
    }
    return o
  }
  // unmarked blurred colour blobs and soft shadows lying on the page (round 11 c2: three 60px blobs had no words)
  const blobs = [...document.querySelectorAll('body *')].filter((k) => !k.closest('[data-r]') && !k.querySelector('[data-r]')).map((k) => {
    const c = getComputedStyle(k), m = c.filter.match(/blur\(([\d.]+)px\)/)
    if (!m || +m[1] < 8 || !(rgba(c.backgroundColor)?.a > 0.05)) return null
    return { x: Math.round(k.offsetLeft), y: Math.round(k.offsetTop), w: k.offsetWidth, h: k.offsetHeight, c: rgba(c.backgroundColor), blur: Math.round(+m[1]), round: parseFloat(c.borderTopLeftRadius) > 0 || c.borderTopLeftRadius.includes('%') }
  }).filter(Boolean)
  // n148: an unmarked flat panel filling one side of the page top to bottom (round 12 e4 checkout: the grey summary side
  // was built as a floating card, and the form on white as another card)
  const sides = [...document.body.children].filter((k) => !k.closest('[data-r]') && !k.querySelector('[data-r]')).map((k) => {
    const c = getComputedStyle(k), b = k.getBoundingClientRect(), f = rgba(c.backgroundColor)
    if (!(f?.a > 0.5) || b.top > 2 || b.height < window.innerHeight - 4 || b.width < 160 || b.width > window.innerWidth * 0.7) return null
    if (!(b.left <= 2 || b.right >= window.innerWidth - 2)) return null
    const lw = parseFloat(c.borderLeftWidth) || 0, rw = parseFloat(c.borderRightWidth) || 0
    return { x: Math.round(b.left), w: Math.round(b.width), fill: f, edge: b.left <= 2 ? 'left' : 'right', rule: lw >= 1 ? { side: 'left', c: rgba(c.borderLeftColor) } : rw >= 1 ? { side: 'right', c: rgba(c.borderRightColor) } : null, shadow: c.boxShadow !== 'none', rad: parseFloat(c.borderTopLeftRadius) || 0 }
  }).filter((q) => q && !q.shadow && !q.rad)
  // n173: a dot grain painted by body::after over everything (round 17 c2 riso: lost, built plain cream)
  const grainDots = (() => { for (const w of ['::after', '::before']) { const c = getComputedStyle(document.body, w); if (!c.content || c.content === 'none' || c.position !== 'absolute' && c.position !== 'fixed') continue; if (!/radial-gradient/.test(c.backgroundImage) || !/^[\d.]+px/.test(c.backgroundSize)) continue; return { img: c.backgroundImage, size: c.backgroundSize } } return null })()
  return { body: { ...fact(document.body), grain, grainDots, blobs, sides }, regions: [...document.querySelectorAll('[data-r]')].map((el) => ({ ...fact(el), ...r11(el) })) }
}

// ---------------------------------------------------------------- naming

const NAMED = [
  ['black', 10, 10, 10], ['near-black', 22, 18, 34], ['dark navy', 18, 26, 54], ['white', 255, 255, 255],
  ['cream', 245, 238, 220], ['warm paper', 236, 226, 205], ['light grey', 225, 228, 232], ['grey', 128, 132, 140],
  ['dark grey', 55, 60, 68], ['yellow', 250, 220, 30], ['orange', 249, 115, 22], ['coral', 255, 127, 100],
  ['red', 220, 38, 38], ['pink', 236, 72, 153], ['purple', 147, 51, 234], ['lavender', 196, 181, 253],
  ['blue', 37, 99, 235], ['sky blue', 125, 190, 245], ['cyan', 34, 211, 238], ['teal', 20, 150, 140],
  ['green', 34, 160, 80], ['deep green', 22, 70, 50], ['brown', 120, 72, 40],
  ['lime', 132, 204, 22], ['deep indigo', 30, 22, 80], ['deep purple', 59, 7, 100], ['dark plum', 63, 14, 64], ['dark brown', 67, 20, 7], ['dark teal', 15, 60, 60], ['pale yellow', 254, 249, 215], ['indigo', 79, 70, 229], ['off-white', 244, 244, 245],
  // between the primaries (never a CSS keyword: 'crimson'/'deeppink' would build bright): round 3 c1's raspberry ridge was called 'red' and built bright red
  ['deep raspberry', 157, 23, 77], ['dark pink', 190, 24, 93], ['soft yellow', 253, 230, 138], ['bright orange', 251, 146, 60],
  ['peach', 253, 186, 116], ['pale lilac', 245, 208, 254],
  // round 3 c2's #ff3d00 band was called 'red' and built red; kept to orange-red hues (see colourName)
  ['red-orange', 255, 61, 0],
  // a dark page with a blue-violet cast (round 3 c3 #05010f was 'black' and built #000)
  ['near-black indigo', 8, 3, 24],
  // a cool near-white (#f3f4f6, #f8fafc): 'off-white' read as white and built #fff (round 1 e1 lost its grey page)
  ['pale grey', 244, 245, 248],
  // round 4 c5 #bbf7d0 card was called 'light grey'
  ['mint green', 187, 247, 208],
  // round 5 c5 #4ade80 code strings were called 'cyan'
  ['bright green', 74, 222, 128],
  // round 5 c5 #f472b6 code keywords were called 'coral'
  ['light pink', 244, 114, 182],
  // round 4 e4 #0ea5e9 was called 'teal' and #fecaca 'pale lilac' (weighted distance underrates blue and violet)
  ['bright sky blue', 14, 165, 233], ['pale pink', 254, 205, 205],
  // round 5 c4 #1e3a8a photo end was called 'dark grey' and built grey-blue (weighted distance underrates blue)
  ['dark blue', 30, 58, 138],
  // round 5 c4 #9a3412 photo end was called 'brown' and built near-black brown (target a deep orange-red)
  ['deep rust orange', 154, 52, 18],
  // round 6 e2 #f59e0b donut segment was 'bright orange' and built #f97316
  ['amber', 245, 158, 11],
  // round 6 e2 #f1f5f9 page was 'off-white' and built a warm cream
  ['pale blue-grey', 241, 245, 249],
  // round 6 c2 #e11d48 half-word and dot were 'red' and built pure red
  ['rose red', 225, 29, 72],
]
const hue = (c) => {
  const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b), d = mx - mn
  if (!d) return 0
  const h = mx === c.r ? ((c.g - c.b) / d) % 6 : mx === c.g ? (c.b - c.r) / d + 2 : (c.r - c.g) / d + 4
  return (h * 60 + 360) % 360
}
const NEUTRAL = new Set(['black', 'near-black', 'white', 'off-white', 'pale grey', 'light grey', 'grey', 'dark grey'])
const parse = (s) => {
  if (typeof s !== 'string') return s
  if (s.startsWith('#')) {
    let h = s.slice(1); if (h.length <= 4) h = [...h].map((c) => c + c).join('')
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length > 6 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null
  const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }
}
/** '#rrggbb' of a colour (a picture's exact fill, when its name alone reads like the panel under it) */
export function hexOf(c) {
  c = parse(c); if (!c) return null
  return '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}
export function colourName(c) {
  c = parse(c); if (!c || c.a <= 0.05) return null
  // a grey is named among greys: weighted distance alone calls light grey "cream"
  const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
  let best = null, bd = Infinity
  for (const [n, r, g, b] of NAMED) {
    if (chroma <= 6 && !NEUTRAL.has(n)) continue
    if (n === 'red-orange' && !(hue(c) >= 9 && hue(c) <= 22 && chroma >= 150)) continue
    if (n === 'dark blue' && !(hue(c) >= 215 && hue(c) <= 235 && chroma >= 80 && Math.max(c.r, c.g, c.b) <= 170)) continue
    if (n === 'deep rust orange' && !(hue(c) >= 10 && hue(c) <= 25 && chroma >= 110 && Math.max(c.r, c.g, c.b) <= 190)) continue
    if (n === 'rose red' && !(hue(c) >= 338 && hue(c) <= 356 && chroma >= 150 && Math.max(c.r, c.g, c.b) >= 200)) continue
    if (n === 'amber' && !(hue(c) >= 34 && hue(c) <= 46 && chroma >= 170)) continue
    if (n === 'pale blue-grey' && !(chroma >= 7 && chroma <= 14 && c.b - c.r >= 7 && Math.min(c.r, c.g, c.b) >= 232)) continue
    if (n === 'bright sky blue' && !(hue(c) >= 193 && hue(c) <= 215 && chroma >= 120)) continue
    if (n === 'pale grey' && !(chroma <= 6 && c.b > c.r && Math.max(c.r, c.g, c.b) <= 251 && Math.min(c.r, c.g, c.b) >= 236)) continue
    if (n === 'off-white' && chroma <= 6 && c.b > c.r && Math.max(c.r, c.g, c.b) <= 251 && Math.min(c.r, c.g, c.b) >= 236) continue
    if (n === 'near-black indigo' && !(hue(c) >= 225 && hue(c) <= 285 && chroma >= 8 && Math.max(c.r, c.g, c.b) <= 40)) continue
    const d = (c.r - r) ** 2 * 0.3 + (c.g - g) ** 2 * 0.59 + (c.b - b) ** 2 * 0.11
    if (d < bd) { bd = d; best = n }
  }
  return best
}
const dist = (a, b) => (a && b ? Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) : 999)
const visible = (c) => c && c.a > 0.05
const isSerif = (fam) => /serif/i.test(fam) && !/sans-serif/i.test(fam) || /georgia|times|garamond|playfair|didot|bodoni/i.test(fam)
const isMono = (fam) => /mono|courier|consolas/i.test(fam)
/**
 * The named face a designer would say (Helvetica, Georgia), or null for generic stacks.
 * Builds fall back to the app's default sans (Inter here), visibly wider than Helvetica
 * at display sizes (round 2 c2 NOISE ran ~40px wider).
 */
const FACES = ['Helvetica', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Futura', 'Garamond', 'Didot', 'Bodoni', 'Playfair Display', 'Inter', 'Roboto']
export const faceName = (fam) => {
  const first = (fam || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase()
  return FACES.find((n) => n.toLowerCase() === first) ?? null
}
// cut-short copy puts its ellipsis OUTSIDE the quotes ("Looks great. Can we"…), so it
// never reads as a literal placeholder ellipsis ("Write a message…")
// n143: a tab row said in full, its selected tab and underline (round 11 e3: tabs dropped, list built ~22px high)
const tabsSay = (d) => (d.extra ?? []).filter((x) => x.tabs).map((x) => `a ${x.h}px row of tabs side by side: ${x.tabs.map((t) => `${quote(t, 20)}${t === x.sel ? ` (selected${x.selInk ? `, ${hexOf(x.selInk)} text` : ''}${x.selLine ? `, a ${x.selLine.w}px ${hexOf(x.selLine.c)} underline` : ''})` : ''}`).join(', ')}, then `).join('')
// a whole text ring said as its exact SVG, so it is never cut to a short arc or clipped by its box
// (round 13 c1: the words built as a short arc clipped at the right, twice)
const ringSvg = (ct, t, fill) => {
  const c = Math.round(ct.px / 2), r = ct.rad
  if (!r || !ct.px || t.length > 140) return ''
  return `; build it as exactly this SVG, the text whole, never shortened, the box ${ct.px}x${ct.px}px with overflow visible on it and every parent (no overflow hidden, no clip): <svg viewBox="0 0 ${ct.px} ${ct.px}" width="${ct.px}" height="${ct.px}" style="overflow:visible"><defs><path id="ring" d="M${c},${c} m-${r},0 a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 -${2 * r},0"/></defs><text font-size="${ct.size}" font-weight="${ct.weight}"${ct.spacing ? ` letter-spacing="${ct.spacing}"` : ''}${fill ? ` fill="${fill}"` : ''}><textPath href="#ring">${t}</textPath></text></svg>`
}
const quote = (s, n = 48) => (s.length > n ? `"${s.slice(0, n).replace(/\s+\S*$/, '')}"…` : `"${s}"`)
const uniq = (xs) => [...new Set(xs.filter(Boolean))]

function gradientWords(f) {
  if (!/gradient/.test(f.bgImage)) return null
  const names = uniq(f.bgImageColours.map((c) => (parse(c)?.a ?? 1) < 0.3 ? null : colourName(c)))
  // repeating stripes (round 9 c5 picture said 'near-black to red gradient', built a smooth blend)
  const rp = f.bgImage.match(/^repeating-linear-gradient\(\s*([\d.]+deg)?/)
  // n130: faint stripes (alpha < 0.3: a grain or scanline overlay, round 8 c1) are texture, not a picture of stripes
  if (rp && f.bgImageColours.some((c) => (parse(c)?.a ?? 1) >= 0.3)) {
    // stops as computed: 'c 0px, c 3px, d 3px, d 9px' (double positions expanded); merge runs of one colour into bands
    const st = [...f.bgImage.matchAll(/(rgba?\([^)]+\))((?:\s+[\d.]+px)+)/g)].flatMap((m) => m[2].trim().split(/\s+/).map((q) => ({ c: parse(m[1]), k: m[1], at: parseFloat(q) })))
    const xs = []
    for (let i = 0; i < st.length; i++) { const last = xs[xs.length - 1]; if (last && last.k === st[i].k) last.end = st[i].at; else xs.push({ c: st[i].c, k: st[i].k, start: xs.length ? xs[xs.length - 1].end : st[i].at, end: st[i].at }) }
    xs.forEach((x) => { x.w = Math.round(x.end - x.start) })
    const deg = rp[1] ? Math.round(parseFloat(rp[1])) % 180 : 0
    const dir = deg === 0 ? 'horizontal' : deg === 90 ? 'vertical' : `diagonal (${deg}deg)`
    const over = f.beforeImage && !f.isBefore ? gradientWords({ bgImage: f.beforeImage, bgImageColours: (f.beforeImage.match(/rgba?\([^)]+\)/g) || []), isBefore: true }) : null
    if (xs.length >= 2) return `${dir} repeating stripes, NOT a smooth gradient (repeating-linear-gradient(${deg}deg, ${xs.map((x, i) => `${x.c && x.c.a < 0.05 ? 'transparent' : hexOf(x.c)} ${xs.slice(0, i).reduce((s2, y) => s2 + y.w, 0)}px ${xs.slice(0, i + 1).reduce((s2, y) => s2 + y.w, 0)}px`).join(', ')})): ${xs.map((x) => `${x.w}px ${x.c && x.c.a < 0.05 ? 'clear (see-through)' : colourName(x.c)}`).join(' then ')}, over and over${over ? `; AND laid over them (a second background layer on the same box, both showing): ${over}` : ''}`
  }
  if (/linear-gradient\([^)]*1px/.test(f.bgImage) || /background-size/.test(f.bgImage)) return null
  if (names.length < 2) {
    // one hue, two shades (round 5 c5 CTA indigo #6366f1 to #4338ca): still a gradient fill, or the build drops it
    const cs = f.bgImageColours.map(parse).filter((c) => c && (c.a ?? 1) >= 0.3)
    if (names.length === 1 && cs.length >= 2 && dist(cs[0], cs[cs.length - 1]) >= 40) {
      const lum = (c) => c.r + c.g + c.b
      return `${names[0]} to ${lum(cs[cs.length - 1]) < lum(cs[0]) ? 'darker' : 'lighter'} ${names[0]} gradient`
    }
    return null
  }
  // hard colour stops (a b 20%, b 20% 40%) are stripes, not a blend
  // n149: only stops that meet at the SAME place are hard (round 13 c2 chrome 0/30/50/70/100% blend said as stripes)
  const hardPairs = [...f.bgImage.matchAll(/([\d.]+)%\s*,\s*rgba?\([^)]+\)\s+([\d.]+)%/g)].filter((m) => m[1] === m[2]).length
  const hard = hardPairs >= 2 || /\)\s+\d+%\s+\d+%/.test(f.bgImage)
  // n149: a light-dark-light blend of greys is polished chrome; say the exact blend (round 13 c2 blob and headline)
  const lsC = linearStops(f.bgImage)
  if (!hard && lsC && lsC.length >= 4) {
    const L = lsC.map((x) => (x.c.r + x.c.g + x.c.b) / 3), grey = lsC.every((x) => Math.max(x.c.r, x.c.g, x.c.b) - Math.min(x.c.r, x.c.g, x.c.b) <= 40)
    const turns = L.slice(1, -1).filter((v, i) => (v - L[i]) * (L[i + 2] - v) < 0 && Math.abs(v - L[i]) > 60).length
    const deg = f.bgImage.match(/^linear-gradient\(\s*([\d.]+deg)/)?.[1] ?? '180deg'
    if (grey && turns >= 1) return `polished liquid-CHROME gradient, smooth bands of light and dark that blend into each other (NOT stripes, no hard edges; exactly: linear-gradient(${deg}, ${lsC.map((x) => `${hexOf(x.c)} ${x.at}%`).join(', ')}))`
  }
  // n163: ONE hard stop between two colours is a split page, not a blend (round 16 c1: black/cream halves built as a fade)
  const split = !hard && hardPairs === 1 && /^linear-gradient/.test(f.bgImage.trim()) && f.bgImageColours.length === 2
  if (split) {
    const deg = Math.round(parseFloat(f.bgImage.match(/^linear-gradient\(\s*([\d.]+)deg/)?.[1] ?? '180')) % 360
    const at = f.bgImage.match(/([\d.]+)%\s*,/)?.[1] ?? '50'
    const [a1, a2] = f.bgImageColours.map((c) => `${colourName(c)} ${hexOf(parse(c))}`)
    const sides = deg === 90 ? ['left', 'right'] : deg === 270 ? ['right', 'left'] : deg === 0 ? ['bottom', 'top'] : ['top', 'bottom']
    return `HARD-SPLIT (two flat halves meeting in one sharp straight line at ${at}%, NO fade, NO blend: ${sides[0]} ${a1}, ${sides[1]} ${a2}; exactly background: ${cssHex(f.bgImage)})`
  }
  if (hard) return `${names.join(', ')} stripes`
  // which end is which (round 4 c1 blue photo built flat navy, round 5 c4 dark end on the
  // wrong side): a two-colour linear blend says where each colour sits and whether it is vivid
  const ends = linearEnds(f.bgImage)
  if (ends && names.length === 2 && /^linear-gradient/.test(f.bgImage.trim())) {
    const cs = f.bgImageColours.filter((c) => (parse(c)?.a ?? 1) >= 0.3)
    const say = (c) => `${vivid(c) ? 'vivid ' : ''}${colourName(c)} ${hexOf(parse(c))}`
    return `${say(cs[0])} (${ends[0]}) to ${say(cs[cs.length - 1])} (${ends[1]}) gradient`
  }
  // three or more stops in a straight blend: each stop's hex and where it sits, or the middle one is lost
  // (round 7 c3 sky #0f172a → #312e81 55% → #be185d said 'dark navy to dark grey to dark pink', built dark grey)
  const stops = linearStops(f.bgImage)
  // n141: two stops at the same place are a hard edge (round 11 c4 horizon: cream sky, dark ground from 55% down)
  const cut = stops && stops.findIndex((x, i) => i && x.at === stops[i - 1].at && dist(x.c, stops[i - 1].c) > 60)
  if (ends && stops && cut > 0) return `${stops.slice(0, cut).map((x) => `${colourName(x.c)} (${hexOf(x.c)})`).join(' to ')} gradient down to ${stops[cut].at}% (the edge at y ${Math.round(stops[cut].at / 100 * (f.rect?.h || 900))}px: the page is exactly ${Math.round(f.rect?.h || 900)}px tall, height 100vh, NOT stretched by its content), then a HARD straight edge (no blend) and solid ${colourName(stops[cut].c)} (${hexOf(stops[cut].c)}) below it to the ${ends[1]} (linear-gradient(${stops.map((x) => `${hexOf(x.c)} ${x.at}%`).join(', ')}))`
  if (ends && stops && stops.length >= 3) return `${stops.map((x, i) => `${colourName(x.c)} (${hexOf(x.c)}${i && i < stops.length - 1 ? `, its stop at ${x.at}% of the way along, fully opaque` : ''})`).join(' to ')} gradient, ${ends[0]} to ${ends[1]}`
  return `${names.join(' to ')} gradient`
}
/** Colour stops of a single linear-gradient: [{c, at%}], null when there is more than one layer or a stop is see-through. */
function linearStops(bgImage) {
  if (!/^linear-gradient/.test(bgImage.trim()) || (bgImage.match(/gradient\(/g) || []).length !== 1) return null
  const xs = [...bgImage.matchAll(/(rgba?\([^)]+\))\s*([\d.]+(?:%|px))?/g)].map((m) => ({ c: parse(m[1]), at: m[2] }))
  if (xs.length < 3 || xs.some((x) => !x.c || x.c.a < 0.3)) return null
  return xs.map((x, i) => ({ c: x.c, at: x.at && /%$/.test(x.at) ? Math.round(parseFloat(x.at)) : Math.round((100 * i) / (xs.length - 1)) }))
}
/** Start and end sides of a linear-gradient: 160deg -> ['top', 'bottom'], 135deg -> ['top left', 'bottom right']. */
function linearEnds(bgImage) {
  const m = bgImage.match(/linear-gradient\(\s*([^,(]+),/)
  let deg = 180
  if (m && /deg|turn|to /.test(m[1])) {
    const a = m[1].trim()
    if (/deg$/.test(a)) deg = parseFloat(a)
    else if (/turn$/.test(a)) deg = parseFloat(a) * 360
    else {
      const v = (/top/.test(a) ? -1 : /bottom/.test(a) ? 1 : 0), h = (/left/.test(a) ? -1 : /right/.test(a) ? 1 : 0)
      deg = (Math.atan2(h, -v) * 180) / Math.PI
    }
  }
  const sides = ['top', 'top right', 'right', 'bottom right', 'bottom', 'bottom left', 'left', 'top left']
  const to = Math.round((((deg % 360) + 360) % 360) / 45) % 8
  return [sides[(to + 4) % 8], sides[to]]
}
/** Look words any block can carry: tilt, blur, glass, bleeding off the page. */
function effectWords(f) {
  const w = []
  const turn = Math.abs(f.rotate)
  // a vertical label is often flipped 180deg to read bottom-up: that's not a tilt
  // a small vertical label says its type size: 'vertical' alone was built ~9px on a 15px target (round 6 c2)
  if (f.vertical) w.push(f.font.size <= 24 && f.rect.h >= 120 && !visible(f.bg) ? `vertical (writing-mode: vertical-rl), ${Math.round(f.font.size)}px letters, the line about ${Math.round(f.rect.h)}px long`
    // n133: a giant vertical title says its size, its turn and where its words run (round 9 c5 built short and low)
    : f.font.size >= 60 && f.vSpan ? `vertical (writing-mode: vertical-rl${Math.abs(f.rotate) === 180 ? ', turned 180deg so it reads bottom to top' : ''}), ${Math.round(f.font.size)}px letters on ONE line (white-space: nowrap; one single column, NEVER wrapped onto a second column), its column ${Math.round(f.rect.w)}px wide at x ${Math.round(f.rect.x)}, ${Math.round(f.rect.h)}px tall from top ${Math.round(f.rect.y)}; the letters run from y ${f.vSpan.top} down to y ${f.vSpan.bottom} (${f.vSpan.bottom - f.vSpan.top}px long, no shorter)`
    : 'vertical')
  // with its angles: a bare 'tilted back' built three cards at one made-up angle (round 6 c1)
  else if (f.tilt3d) w.push(`tilted back in 3D perspective${f.rot3d ? ` (${[f.rot3d.y ? `rotateY(${f.rot3d.y}deg)` : '', f.rot3d.x ? `rotateX(${f.rot3d.x}deg)` : ''].filter(Boolean).join(' ')})` : ''}`)
  // which way and how far: a bare 'tilted' was built flat (round 4 c1 blue block, sticker)
  else if (turn >= 1.5 && turn <= 60) w.push(`tilted ${turn < 3 ? 'slightly ' : ''}${turn}° ${f.rotate > 0 ? 'clockwise' : 'anticlockwise'}`)
  else if (turn > 60 && turn < 170) w.push('diagonal')
  if (f.motion) w.push(f.motion === 'scrolling' && f.bleeds ? 'scrolling marquee' : f.motion)
  // a slant (skewX) is not a turn: round 6 c2 'Tickets →' leaned like italics, unsaid
  if (Math.abs(f.skewX) >= 4) w.push(`slanted ${Math.abs(f.skewX)}° (skewX(${f.skewX}deg), leaning ${f.skewX < 0 ? 'right' : 'left'} like italics)`)
  // a clip that keeps one half: a word sliced across its middle (round 6 c2: said as two stacked lines)
  const ci = f.clipInset
  if (ci && ci.b >= 0.3 && ci.t < 0.05) w.push(`only the top ${Math.round((1 - ci.b) * 100)}% of the letters shows (clip-path cuts them flat across the middle)`)
  else if (ci && ci.t >= 0.3 && ci.b < 0.05) w.push(`only the bottom ${Math.round((1 - ci.t) * 100)}% of the letters shows (clip-path cuts them flat across the middle)${Math.abs(f.shiftX) >= 8 ? `, shifted ${Math.abs(f.shiftX)}px ${f.shiftX > 0 ? 'right' : 'left'} of where the top half sits` : ''}; its cut edge sits right on the top half's cut edge, no gap, so the two halves join into one word sliced across`)
  // the mode decides the look: only difference/exclusion invert (round 4 c1's multiply headline was said as inverting)
  if (f.blend) w.push(/difference|exclusion/.test(f.blend) ? 'colour-inverting where it crosses what is under it'
    : /multiply|darken|color-burn/.test(f.blend) ? 'ink-like (multiply blend: darkens what it overlaps, never covers it)'
    : /screen|lighten|color-dodge/.test(f.blend) ? 'light-like (screen blend: brightens what it overlaps)' : `${f.blend} blend over what is under it`)
  if (f.blur >= 10) w.push('soft blurred')
  // a dashed outline (round 9 c4 stamp: said 'outline circle', dashes lost)
  if (f.border.topStyle === 'dashed' && f.border.w >= 1 && visible(f.border.colour)) w.push(`${f.border.w}px dashed ${hexOf(f.border.colour)} outline (dashes, not a solid line)${f.text && f.colour && hexOf(f.colour) === hexOf(f.border.colour) ? `, its words in the SAME ${hexOf(f.colour)} as the outline (NOT the page's text colour)` : ''}`)
  // a faded block: built solid otherwise (round 5 c3 cards at 75/45/20%)
  if (f.opacity < 0.6 || (f.opacity < 0.9 && ((f.bg && f.bg.a > 0.05) || /gradient/.test(f.bgImage)))) w.push(`faded to ${Math.round(f.opacity * 100)}% opacity (see-through)`)
  if (f.maskFade?.bands) w.push(`cut into ${f.maskFade.n} hard horizontal STRIPES across its lower half by a banded mask (gaps of the page showing through between the bands, NOT a fade): mask-image: ${cssHex(f.maskFade.img)}; -webkit-mask-image the same, exactly;`)
  else if (f.maskFade) w.push(`fading out into the page toward the ${f.maskFade.toward} (solid until ${f.maskFade.fromPct}%, gone at the ${f.maskFade.toward} edge)`)
  if (f.backdrop || (f.bg && f.bg.a > 0.03 && f.bg.a < 0.4)) w.push('frosted glass')
  // one edge: say how far past it the block starts ('off the left edge' alone built at x=0, round 2 c2)
  const past = f.bleeds !== 'left and right' && f.bleedPx >= 16 ? ` (${f.bleeds === 'right' ? 'runs' : 'starts'} ${f.bleedPx}px past it)` : ''
  const B0 = f.box0
  const both = f.bleeds === 'left and right' && B0?.abs && B0.x < -4 && B0.x + B0.w > 1284 ? ` (one ${B0.w}px-wide line, position absolute, left ${B0.x}px, top ${B0.y}px BEFORE the tilt, so it starts ${-B0.x}px off the LEFT edge and ends ${B0.x + B0.w - 1280}px past the right; no letter starts at x 0)` : ''
  if (f.bleeds) w.push(`bleeding off the ${f.bleeds} page edge${f.bleeds === 'left and right' ? 's' : ''}${past}${both}`)
  return w
}
// computed style writes 'transparent' as rgba(0, 0, 0, 0) (round 6 c1 floor: grid never recognised)
const gridLines = (f) => /gradient\([^,]*,?\s*rgba?\([^)]+\)\s*1px/.test(f.bgImage) || /1px,\s*(?:transparent|rgba\(0, 0, 0, 0\)) 1px/.test(f.bgImage)

function typeWords(f, page) {
  const w = []
  if (f.font.size >= 80) w.push('giant'); else if (f.font.size >= 52) w.push('huge'); else if (f.font.size >= 32) w.push('big')
  // display type: the face sets the word's width, so name it (said once on the page note otherwise)
  if (f.font.size >= 52 && faceName(f.font.family) && !isMono(f.font.family)) w.push(faceName(f.font.family))
  // a poster-size glyph: its exact face and weight, or the build picks a squared display face (round 8 c5 '8' at 640px)
  if (f.font.size >= 200 && !isMono(f.font.family) && !isSerif(f.font.family)) w.push(`(font-family ${f.font.family.replace(/"/g, '')}; font-weight ${f.font.weight}; round-bowled, NOT a squared, condensed or display face; live text: a real character in a text element, never an SVG path, outline or drawn shape)`)
  if (f.font.style === 'italic') w.push('italic')
  if (isSerif(f.font.family) && !isSerif(page.font.family)) w.push('serif')
  else if (isSerif(f.font.family) && f.font.size >= 32) w.push('serif')
  if (isMono(f.font.family)) w.push('mono')
  if (f.font.weight >= 800 && f.font.size >= 32) w.push('heavy')
  // a hairline display weight is the point of the word (round 5 c2 'Weight' at 100)
  else if (f.font.weight <= 300 && f.font.size >= 32) w.push('thin hairline-weight')
  // display type at a regular weight is built bold unless said (round 6 c3 italic serif, round 1 c5 editorial)
  else if (f.font.weight <= 500 && f.font.size >= 52) w.push('regular weight (not bold)')
  if (f.font.transform === 'uppercase') w.push('uppercase')
  // tracking that changes the word's shape: tight display type (-10px at 300px) or spaced-out caps
  const em = f.font.spacing / f.font.size
  if (f.font.size >= 32 && em <= -0.02) w.push('tight-set letters')
  // display type spaced 0.1em is plainly spaced out (round 5 c2 'Slant' at 24px on 180px)
  else if (em >= 0.15 || (f.font.size >= 32 && em >= 0.1)) w.push('wide-spaced letters')
  // stacked display lines set closer than the type is tall: the drawn pitch alone reads ~1.1 leading,
  // so a 150px headline at 0.9 was built 123px (round 4 c1)
  const lh = f.font.lineHeight / f.font.size
  if (f.font.size >= 32 && f.textLines >= 2 && lh > 0 && lh <= 1.0) w.push(`lines set tight (line-height ${+lh.toFixed(2)})`)
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
/** A strong, fully opaque colour (a hot-pink blob) is said 'vivid', or builds soften it to a faint tint. */
/** A see-through outline (alpha under 0.5) is said 'faint', or builds draw it bright (round 3 c3 rings at 35%). */
const lineCol = (c) => { const n = colourName(c); const p = parse(c); return n && p && p.a < 0.5 ? `faint ${n}` : n }
const vivid = (c) => { c = parse(c); return !!c && c.a >= 0.9 && Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) >= 150 }

/**
 * Every distinct event with its days (a calendar's events are its content: round 3 e3
 * lost "Retro" to a 6-item cap). An event on several days is one chip per day, said so,
 * or it is built as a single bar spanning them.
 */
function monthEvents(list, cap = 10) {
  const said = list.slice(0, cap).map(({ e, days }) => {
    const col = chipColour(e) ? chipColour(e) + ' ' : ''
    const on = days.length > 1 ? ` on ${days.join(', ')} (a chip on each day)` : days.length ? ` on ${days[0]}` : ''
    return `${col}${quote(e.text, 18)}${on}`
  })
  return said.join(', ') + (list.length > cap ? `, ${list.length - cap} more` : '')
}

// a header row's tint: #e8f0fe is 'off-white' to the palette but reads pale blue (round 5 e5)
const sheetFill = (c) => (c.b - c.r >= 12 && c.r >= 220 ? 'pale blue' : colourName(c))

// n167: a bar chart's card (fill, border, shadow, size) and its bars' own size (round 16 e1: a white bordered shadowed
// card built as a pale blue tinted panel, bars wider)
const barCard = (d) => {
  const c = d.card
  if (!c || !(c.bg || c.bw >= 1 || c.shadow)) return ''
  return `a ${c.w}x${c.h}px chart card, ${c.bg ? `${colourName(c.bg)} (${hexOf(c.bg)}) fill (NOT tinted, NOT pale blue)` : 'no fill'}${c.bw >= 1 ? `, ${Math.round(c.bw)}px ${hexOf(c.bc)} border` : ''}${c.shadow ? ', a soft drop shadow' : ''}${c.radius >= 2 ? `, ${c.radius}px rounded` : ', square corners'}${c.abs ? ` (absolutely placed, its top-left EXACTLY at ${c.x},${c.y} page px, floating over what is under it, NOT further right or higher)` : ''}, holding: `
}
const barSize = (d) => d.barW ? `; each bar ${d.barW}px wide, ${d.barGap}px apart, the tallest ${d.tallest}px, no labels under the bars` : ''

/** Dense app UI -> words that carry its structure (columns, rows, weeks, bars, sides). */
function denseNote(d) {
  if (!d) return null
  switch (d.type) {
    case 'cellMap': {
      // the commonest kind is the plain one; a kind name comes from the legend words when the page has one
      const kd = d.kinds.map((k, i) => `${i + 1} = ${k.fill ? `${hexOf(k.fill)} fill` : 'no fill'}${k.border ? ` with a ${k.border.px}px ${hexOf(k.border.c)} border` : ''} (${k.n} cells)`).join('; ')
      return `a seat/cell map, ${d.cols} columns x ${d.rows} rows of small separate cells (NOT a picture, NOT an empty panel: every cell is built, e.g. a CSS grid of ${d.cols} columns): each cell ${d.px.w}x${d.px.h}px, ${d.gapX}px apart across and ${d.gapY}px apart down, rounded ${d.radius}; the grid's top-left at ${d.at.x},${d.at.y} (${d.at.w}x${d.at.h}px)${d.gapCols.length ? `; column${d.gapCols.length > 1 ? 's' : ''} ${d.gapCols.join(' and ')} left empty for an aisle (keep the space, draw nothing there)` : ''}; cell kinds: ${kd}; rows top to bottom, one digit per cell (its kind; _ = empty aisle gap)${d.labels ? `, each row labelled at its left by its letter` : ''}: ${d.grid.map((r, i) => `${d.labels ? `${d.labels[i]} ` : ''}${r}`).join(', ')}`
    }
    case 'heatTable': {
      const sh = d.shades.map((c, i) => `${i + 1} ${hexOf(c)}`).join(', ')
      const rows = d.rows.map((r) => `${quote(r.label, 12)}: ${r.cells.map((c) => c ? `${c.t}@${c.s + 1}` : '-').join(' ')}`).join('; ')
      return `${d.title ? `${quote(d.title, 48)}, ` : ''}a cohort heat table (NOT pills, NOT a plain table): ${d.columns ? `column heads ${d.columns.filter(Boolean).map((t) => quote(t, 8)).join(' ')} over the cells, ` : ''}each row a grey date label at the left then filled square-ish ${d.cellPx.w}x${d.cellPx.h}px cells${d.gap ? ` ${d.gap}px apart` : ''}, each cell's number centred in it; the cells are shades of ONE colour, darkest 1 to lightest ${d.shades.length}: ${sh}; dark shades 1-2 carry white numbers, the rest dark; an empty cell (-) is left blank (no fill, no number), so the filled cells form a staircase triangle; rows (number@shade): ${rows}`
    }
    case 'funnel': return `${d.title ? `${quote(d.title, 48)}, ` : ''}a funnel (NOT progress rows, NOT a list): ${d.items.length} solid ${colourName(d.fill)} bars ${d.h}px tall, ${d.radius}px rounded, stacked ${d.pitch}px apart down one left edge (${d.left}px in, first ${d.top}px from the card top), each NARROWER than the one above, its label in bold ${colourName(d.ink)} inside at the left: ${d.items.map((x) => `${quote(x.t, 20)} ${x.w}px wide${x.op < 100 ? ` at ${x.op}% opacity` : ''}${x.v ? ` (${quote(x.v, 8)} bold at the far right of the card on that row)` : ''}`).join(', ')}`
    case 'stackedBars': return `${d.title ? `${quote(d.title, 48)}, ` : ''}a stacked bar chart (NOT a list): ${d.n} bars ${d.w}px wide, ${d.gap}px apart, standing on one baseline across a ${d.plotH}px tall plot (${d.left}px in, ${d.top}px from the card top), no axes, no labels; each bar is ${d.colours.length} solid segments, ${d.colours.map((c, i) => `${['bottom', 'top', 'third'][i] ?? `${i + 1}th`} ${colourName(c)} ${hexOf(c)}`).join(', ')}; bar total heights left to right: ${d.totals.join(', ')}px; bottom segment heights: ${d.bottomH.join(', ')}px`
    case 'kpi': return `white stat card: small ${colourName(d.labelInk)} label ${quote(d.label, 20)}, under it big ${d.valuePx}px bold ${quote(d.value, 12)}; a small ${d.spark.w}x${d.spark.h}px ${colourName(d.spark.c)} sparkline (a thin ${d.spark.pts}-point line, no fill, no axes) ${d.spark.rising ? 'rising left to right' : 'falling left to right'}, in the bottom-right corner ${d.spark.right}px from the right edge and ${d.spark.bottom}px from the bottom`
    case 'heatShades': return `${d.title ? `${quote(d.title, 48)} as a small bold heading, under it ` : ''}a heat grid (NOT a picture, NOT pills, no text in the cells): ${d.rows.length} rows of ${d.cols} textless ${d.px.w}x${d.px.h}px cells${d.radius ? ` with ${d.radius}px rounded corners` : ''}${d.gap ? `, ${d.gap}px apart` : ''}, each cell filled with one of ${d.shades.length} shades of the same colour, lightest 1 to darkest ${d.shades.length}: ${d.shades.map((c, i) => `${i + 1} ${hexOf(c)}`).join(', ')}; rows top to bottom (shade per cell): ${d.rows.join(' ')}`
    case 'datePicker': {
      const on = d.presets.find((p) => p.on)
      return `an OPEN date-range picker floating over the page (a ${d.fill ? hexOf(d.fill) : 'white'} panel${d.radius ? `, ${d.radius}px rounded corners` : ''}${d.shadow ? ', a big soft drop shadow so it sits above the cards under it' : ''}; NOT page numbers): ${d.presets.length ? `on the left a ${d.presetW}px column of preset lines ${d.presets.map((p) => quote(p.t, 16)).join(', ')}${on ? `, ${quote(on.t)} the chosen one in bold ${hexOf(on.ink)}, the rest grey` : ''}; ` : ''}beside it a month calendar${d.month ? ` headed ${quote(d.month)} (centred)` : ''}: 7 columns of ${d.cell}px day cells, ${d.lead > 0 ? `${d.lead} empty cells then ` : ''}days 1 to ${d.last}${d.ends.length ? `; the range ends ${d.ends.map((t) => quote(t)).join(' and ')} are filled ${hexOf(d.endFill)} rounded cells with white numbers` : ''}${d.mid ? `, the days between (${d.mid.from} to ${d.mid.to}) a pale ${hexOf(d.mid.fill)} band with dark numbers` : ''}${d.btns.length ? `; bottom right the buttons ${d.btns.map((b) => `${quote(b.t)} (${b.fill ? `filled ${hexOf(b.fill)}, ${colourName(b.ink)} text` : 'outlined'})`).join(' and ')}` : ''}`
    }
    case 'kpi1': return `stat card: ${d.labelPx}px ${colourName(d.labelInk)} label ${quote(d.label, 24)} on top, under it big ${d.valuePx}px bold ${quote(d.value, 14)}${d.extra.map((x) => `, under that ${x.bold ? 'bold ' : ''}${hexOf(x.ink)} ${quote(x.t, 20)}`).join('')}`
    case 'docArticle': return `a docs article, NOT a card, NOT a table alone; top to bottom: ${d.parts.map((p) => {
      if (p.kind === 'title') return `${p.px}px bold title ${quote(p.t, 40)}`
      if (p.kind === 'code') return `a ${p.fill && (0.299 * parse(p.fill).r + 0.587 * parse(p.fill).g + 0.114 * parse(p.fill).b) > 160 ? 'PALE (light, NOT dark)' : 'dark'} code block (${p.fill ? hexOf(p.fill) : 'near-black'} fill, ${p.radius}px rounded, ${p.px}px monospace ${colourName(p.ink)} text${p.toks.length > 1 ? `, syntax colours ${p.toks.map(hexOf).join(' ')}` : ''}) with ${p.lines.length} lines: ${p.lines.map((l) => quote(l, 70)).join(' / ')}`
      if (p.kind === 'callout') return `a callout box (${hexOf(p.fill)} fill, a ${p.edge.px}px ${hexOf(p.edge.c)} left edge, rounded right corners) with bold ${quote(p.lead, 12)} then ${quote(p.t.replace(p.lead, '').trim(), 60)}`
      if (p.kind === 'table') return `a ${p.ruled ? 'fully ruled ' : ''}table${p.head ? ` with a ${hexOf(p.head)} header row` : ''}: ${p.rows.map((r) => r.map((c) => quote(c, 18)).join(' | ')).join(' / ')}`
      if (p.px <= 13) return `small ${p.px}px ${colourName(p.ink)} line ${quote(p.t, 60)}${/›|>|\//.test(p.t) ? ' (a breadcrumb)' : ''}`
      return `${p.px}px ${colourName(p.ink)} paragraph ${quote(p.t, 220)}${p.code.length ? ` with inline code ${p.code.map((c) => `${quote(c.t, 16)} (${hexOf(c.ink)} monospace on a ${c.fill ? hexOf(c.fill) : 'grey'} rounded chip)`).join(', ')}` : ''}`
    }).join('; then ')}${d.parts.some((p) => p.kind === 'table' && p.rows.flat().length) ? '; code words in the table are monospace, not status pills' : ''}${d.parts.every((p) => p.y != null) ? `; the first line sits flush at the article's top (no padding above), and each block's top is exactly this far down from it: ${d.parts.map((p) => `${p.kind === 'text' ? (p.px <= 13 ? 'breadcrumb' : 'paragraph') : p.kind} ${p.y}px`).join(', ')}` : ''}`
    case 'window': return `a ${d.w}x${d.h}px ${d.fill ? hexOf(d.fill) : 'white'} window FLOATING over the page (on top of the reader, ${d.bottom <= 2 ? 'flush to the page bottom' : `${d.bottom}px above the page bottom`}, ${d.right}px from the right edge; ${typeof d.radius === 'string' ? d.radius : `${d.radius}px rounded`}; a big soft shadow): a ${d.bar.h}px ${hexOf(d.bar.fill)} title bar across its top with bold ${colourName(d.bar.ink)} ${quote(d.bar.t, 24)} at the left${d.bar.icons ? ` and ${quote(d.bar.icons, 12)} at the right` : ''}; under it ${d.rows.map((r) => r.label ? `a ${r.ruled ? 'ruled ' : ''}field row: ${colourName(r.labelInk)} ${quote(r.label, 12)} then dark ${quote(r.value, 40)}` : `the message body ${quote(r.value, 80)} (a tall empty area under it)`).join('; ')}${d.btn ? `; a ${d.btn.pill ? 'pill' : 'rounded'} ${hexOf(d.btn.fill)} ${quote(d.btn.t)} button with ${colourName(d.btn.ink)} bold text at the bottom left` : ''}`
    case 'heat': return `${d.title ? `${quote(d.title, 48)}, ` : ''}heatmap: ${d.rows.length} rows of ${d.rows[0].levels.length} ${d.round ? 'rounded ' : ''}${d.px}px cells, label left of each row, every cell ${colourName(d.fill)} at a strength 0-9 (opacity): ${d.rows.map((r) => `${r.label} ${r.levels}`).join(', ')}`
    case 'rtable': {
      const ord = (n) => ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`
      const part = (x) => x.k === 'cb' ? (x.fill ? `ticked ${colourName(x.fill)} checkbox` : 'empty checkbox')
        : x.k === 'av' ? `${colourName(x.fill)} round ${x.px}px avatar${x.t ? ` ${quote(x.t)}` : ''}`
        : x.k === 'bar' ? `${x.px}px ${colourName(x.fill)} bar ${x.pct}% full`
        : x.k === 'pill' ? `${chipColour(x)} pill ${quote(x.t)}`
        : `${x.bold ? 'bold ' : ''}${x.dim ? 'grey ' : ''}${quote(x.t, 24)}`
      const cell = (ps) => ps.length ? ps.map(part).join(' + ') : '(empty)'
      const card = d.card ? `inside a ${colourName(d.card.fill)} (${hexOf(d.card.fill)}) card ${d.card.w}px wide${d.card.border ? `, ${d.card.border.px}px ${colourName(d.card.border.c)} (${hexOf(d.card.border.c)}) border` : ''}${d.card.rad ? `, ${d.card.rad}px rounded corners${d.card.clip ? ' (overflow hidden, so the header fill follows the corners)' : ''}` : ''}, the table filling the card edge to edge; ` : ''
      const lefts = d.colLefts && d.colLefts.length >= 4 ? `; fixed column widths (table-layout: fixed, ${d.tableW}px): each column starts this far from the table's left edge: ${d.colLefts.map((x, i) => `${i + 1} ${x}px`).join(', ')}` : ''
      return `${d.title ? `${quote(d.title, 32)}, ` : ''}${card}table (a real <table>, every row built, none left out): ${d.headFill ? `${colourName(d.headFill)} (${hexOf(d.headFill)}) ` : ''}header row${d.headFill ? ` (bg-[${hexOf(d.headFill)}] on every header cell, visibly tinted against the card, not white)` : ''}, ${d.headPx}px grey semibold: ${d.head.map((ps, i) => i === 0 && ps.length === 1 && ps[0].k === 'cb' && !ps[0].fill ? 'an empty select-all checkbox (the same box as the rows\' checkboxes, drawn in the header cell, not left out)' : cell(ps)).join(' | ')}; then ${d.cells.length} body rows each ${d.rowPx}px tall${d.ruled ? `, a thin ${colourName(d.ruled)} line between rows` : ''}, cells in column order: ${d.cells.map((r, i) => `row ${i + 1}: ${r.map(cell).join(' | ')}`).join('; ')}${d.sel ? `; the ${d.sel.rows.map(ord).join(', ')} rows are selected: whole row tinted ${colourName(d.sel.fill)} (${hexOf(d.sel.fill)})` : ''}${lefts}`
    }
    case 'table': if (d.headless) return `${d.title ? `${quote(d.title, 32)}, ` : ''}${d.all.length} rows, no header row${d.ruled ? ', thin lines between' : ''}${d.cols.map((c, i) => c.bold || c.right ? `, ${['first', 'second', 'third', 'fourth'][i] ?? `${i + 1}th`} column${c.bold ? ' bold' : ''}${c.right ? ' right-aligned' : ''}` : '').join('')}: ${d.all.map((r) => r.map((t) => quote(t, 20)).join(' | ')).join('; ')}`
      if (d.all) return `${d.title ? `${quote(d.title, 32)} as a small bold heading, then a ` : ''}table, every body row built and none invented, ${d.headLook ? `${d.headLook} row ` : ''}columns ${d.columns.map((t) => quote(t, 16)).join(', ')}, ${d.rows} rows: ${d.all.map((r) => r.map((t) => quote(t, 28)).join(' | ')).join('; ')}`
    case 'table': if (d.title) return `${quote(d.title, 32)}, table, columns ${d.columns.map((t) => quote(t, 16)).join(', ')}, ${d.rows} rows, first row ${d.first.map((t) => quote(t, 20)).join(' | ')}${d.chips.length ? `; status pills ${chipList(d.chips)}` : ''}`
      return `table, columns ${d.columns.map((t) => quote(t, 16)).join(', ')}, ${d.rows} rows${d.chips.length ? `; status pills ${chipList(d.chips)}` : ''}`
    case 'order': {
      const t = d.thumb
      const aft = d.after.map((x) => x.field ? `a bordered field ${quote(x.field, 24)}${x.button ? ` with a ${colourName(x.button.fill)} button ${quote(x.button.t)} right of it` : ''}` : `${x.ruled ? 'a thin line, then ' : ''}${x.px >= 20 ? `big ${x.bold ? 'bold ' : ''}` : 'grey '}row ${quote(x.t, 40)} (label left, amount right)`)
      // n148: pictures of different colours say each one (round 12 e4: green, sand, lilac all built green)
      const mixed = d.items.some((x) => x.fill && t.fill && dist(x.fill, t.fill) > 20)
      return `order summary${d.top ? `, no heading, first row starts ${d.top}px below the panel top` : ''}: ${d.items.length} item rows, each a ${t.px}px ${t.fill ? mixed ? 'solid colour (each its own, given per row, plainly darker than the panel) ' : `solid ${colourName(t.fill)} (${hexOf(t.fill)}, plainly darker than the panel) ` : ''}rounded square picture with a small round ${t.badge ? `${colourName(t.badge)} ` : ''}quantity badge (white number) on its top-right corner, then bold name with a small grey line under it, bold price at the right: ${d.items.map((x) => `${quote(x.name, 28)}${x.sub ? ` / ${quote(x.sub, 24)}` : ''} badge ${x.qty}${x.price ? `, ${x.price}` : ''}${mixed && x.fill ? `, picture ${hexOf(x.fill)}` : ''}`).join('; ')}${aft.length ? `; then ${aft.join('; ')}` : ''}`
    }
    case 'reader': return `opened message${d.tools.length ? `: a row of ${d.toolsBordered ? 'small outlined ' : ''}buttons ${d.tools.map((t) => quote(t)).join(', ')} at the top` : ''}; big bold ${d.titlePx}px title ${quote(d.title, 48)}; a ${d.av.px}px round ${colourName(d.av.fill)} avatar left of ${d.sender.length ? `bold ${quote(d.sender[0], 24)}${d.sender[1] ? ` with grey ${quote(d.sender[1], 32)} under it` : ''}` : 'the sender'}; then ${d.bodyPx}px body text, lines: ${d.body.map((t) => quote(t, 160)).join(' / ')}${d.att ? `; then ${/" and "/.test(d.att) ? 'side by side small bordered rounded attachment chips' : 'a bordered rounded attachment box'} ${quote(d.att, 80)}` : ''}`
    case 'week': return `week grid, 7 day columns under the day heads, thin hour lines ${d.hours[0]} to ${d.hours[1]} down the left${d.hourPx ? `, each hour row exactly ${d.hourPx}px tall` : ''}; event cards placed by day and time${d.edge ? ' (pale fill, darker left edge, bold title then time)' : ''}: ${d.events.map((e) => `${e.edge ? `pale ${colourName(e.edge).replace(/^(dark|deep) /, "")}` : colourName(e.fill)} ${quote(e.text, 40)} on ${e.days}, ${e.from} to ${e.to}`).join('; ')}`
    case 'month': {
      // with days when known: blue "Standup" on 2, 9, 16, 23 (where events sit is the calendar's content)
      const byText = new Map()
      for (const e of d.events) { if (!byText.has(e.text)) byText.set(e.text, { e, days: [] }); if (e.day) byText.get(e.text).days.push(e.day) }
      const ev = d.events.some((e) => e.day)
        ? monthEvents([...byText.values()])
        : chipList(d.events, 5)
      // the grid's first row and the chips' fill are what a model gets wrong by default (round 3 e3: 1 under Mon, pale tinted chips)
      const start = d.firstCol ? `; day 1 under ${d.firstCol}${d.lead.length ? `, first row starts with last month's ${d.lead.join(', ')}` : ''}${d.last ? `, last box is ${d.last}` : ''}` : ''
      const solid = d.events.length && d.events.every((e) => e.fill && e.fill.r + e.fill.g + e.fill.b < 600 && e.fill.a > 0.9) ? ` (solid colour${d.events.every((e) => e.color && e.color.r + e.color.g + e.color.b > 690) ? ', white text' : ''})` : ''
      return `month calendar grid, ${d.heads.length ? `${d.heads[0]} to ${d.heads[d.heads.length - 1]} across, ` : ''}${d.weeks} weeks of day boxes${start}${ev ? `; event chips${solid} ${ev}` : ''}${d.marked.length === 1 ? `; day ${d.marked[0]} highlighted` : ''}`
    }
    case 'stats': return `${d.cards.length} stat cards in a row: ${d.cards.map((c) => `${quote(c.label, 16)} ${c.value}${c.rest ? ` ${c.rest}` : ''}${c.spark ? ` (${colourName(c.spark.fill)} sparkline ${c.spark.rising ? 'rising' : 'falling'}, bottom right)` : ''}`).join(', ')}`
    case 'gantt': {
      // n147: with row numbers, some rows are empty (group rows): say each bar's row and top so the gaps stay
      const rowed = d.bars.every((b) => b.row) && Math.max(...d.bars.map((b) => b.row)) > d.bars.length
      if (rowed) {
        const bar = (b) => `row ${b.row} (top ${b.top}px down): ${hexOf(b.fill)} ${quote(b.text, 24)} ${b.from} to ${b.to}${b.track ? ` over a ${b.track.fill.a < 0.95 ? `rgba(${b.track.fill.r}, ${b.track.fill.g}, ${b.track.fill.b}, ${Math.round(b.track.fill.a * 100) / 100}) (a see-through grey)` : hexOf(b.track.fill)} track (same height, rounded) running on to ${b.track.to}` : ''}${b.prog && b.prog.pct < 100 ? ` (its first ${b.prog.pct}% overlaid by a see-through lighter fill: the progress done)` : b.prog ? ' (fully overlaid by a see-through lighter fill: done)' : ''}`
        return `timeline, a ${d.headH}px week-head row of ${d.heads.length} equal columns${d.colW ? ` each ${d.colW}px wide` : ''} ${d.heads.map((t) => quote(t)).join(', ')} with thin vertical column lines all the way down; rows ${d.pitch}px apart counted under the head (row 1 is the first ${d.pitch}px under it), rows with no bar stay EMPTY (they match the group rows of the task list); bars ${d.bars[0].h}px tall, 6px rounded, bold white label inside${d.colW ? ', each placed by its exact px from the timeline\'s left edge (the first column\'s left line; "Npx in"), absolutely positioned, not snapped to week lines' : ''}: ${d.bars.map(bar).join('; ')}${(d.ms ?? []).map((m) => `; row ${m.row} (top ${m.top}px down): a ${m.px}px ${hexOf(m.fill)} square turned 45deg (a diamond milestone) at ${m.at}${m.label ? `, bold ${quote(m.label, 24)} just right of it` : ''}`).join('')}${(d.deps ?? []).map((x) => `; a thin ${x.w}px ${hexOf(x.c)} elbow line from the end of ${quote(x.from, 20)} across then down into the start of ${quote(x.to, 20)} (rounded corner)`).join('')}${d.line ? `; a 2px ${hexOf(d.line.fill)} vertical today line from under the week head to the bottom at ${d.line.at}${d.line.tag ? `, a small ${hexOf(d.line.tag.fill)} filled tag ${quote(d.line.tag.t)} (white bold 11px) on its top end` : d.line.label ? `, tag ${quote(d.line.label)}` : ''}` : ''}`
      }
      return `timeline, ${d.heads.length} week columns ${d.heads.map((t) => quote(t)).join(', ')} across the top; one task bar per row (label inside, white text)${d.pitch ? `, rows ${d.pitch}px apart, bars ${d.bars[0].h}px tall${d.reach && d.reach <= 80 ? `, rows end ${d.reach}% down, empty below` : ''}` : ''}: ${d.bars.map((b) => `${colourName(b.fill)} ${quote(b.text, 20)} ${b.from} to ${b.to}`).join(', ')}${d.line ? `; thin ${colourName(d.line.fill)} vertical today line top to bottom at ${d.line.at}${d.line.label ? `, tag ${quote(d.line.label)}` : ''}` : ''}`
    }
    case 'donut': return `${d.title ? `${quote(d.title, 32)}, ` : ''}donut chart (thick ring, hollow middle)${d.track ? ` on a ${colourName(d.track)} track` : ''}: ${d.segs.map((g) => `${colourName(g.fill)} ${g.pct}%`).join(', ')}`
    case 'lines': return `${d.title ? `${quote(d.title, 32)}, ` : ''}line chart drawn as SVG lines: ${d.lines.map((l) => `${l.thick ? 'thick ' : ''}${l.dashed ? 'dashed ' : 'solid '}${colourName(l.fill)} line${l.rising === null ? '' : l.rising ? ' rising left to right' : ' falling left to right'}${l.points >= 3 ? ` (${l.points} points)` : ''}${l.hs && l.turns >= 4 ? `, straight segments with sharp corners, a jagged zigzag that dips and climbs (NOT a smooth curve), its points' heights left to right as % of the plot height: ${l.hs.join(', ')}` : l.hs ? `, straight segments, points' heights left to right as % of the plot height: ${l.hs.join(', ')}` : ''}`).join(', ')}${d.area?.c ? `; under the solid line a ${d.area.fade ? `soft ${hexOf(d.area.c)} area fill fading to transparent at the bottom` : `${hexOf(d.area.c)} area fill`}` : ''}${d.grid >= 2 ? `; ${d.grid} thin pale horizontal grid lines behind` : ''}; no axis labels`
    case 'form': if (d.buttons) {
      // filled-in form: label, then what the field holds (or empty, tall); buttons by look and place
      const fld = (x) => `${quote(x.label)} ${x.value ? `field holding ${quote(x.value, 40)}` : `${x.tall ? `tall ${x.tall}px ` : ''}empty field`}`
      const low = d.buttons.length && d.buttons.every((b) => b.low)
      const side = low && d.buttons.every((b) => b.right) ? ' at the bottom right' : low ? ' along the bottom' : ''
      const btn = (b) => b.fill ? `${colourName(b.fill)} ${b.bold ? 'bold ' : ''}${colourName(b.ink)} text ${quote(b.t)}` : `outlined ${quote(b.t)}`
      // with section headings or a choice row: everything in reading order (round 6 e4 checkout)
      if (d.secs || d.choice) {
        const seq = [
          ...(d.secs ?? []).map((x) => ({ y: x.y, say: `bold heading ${quote(x.t, 40)}` })),
          ...d.rows.map((r, i) => ({ y: d.rowY[i], say: r.map(fld).join(' | ') })),
          ...(d.choice ? [{ y: d.choice.y, say: `${d.choice.items.length} bordered rounded choice cards side by side, bold first line, small line under: ${d.choice.items.map((c) => `${quote(c.lines[0], 24)} / ${quote(c.lines.slice(1).join(' '), 32)}${c.sel ? ` (chosen: ${c.sel.w}px ${colourName(c.sel.c)} border)` : ''}`).join(', ')}` }] : []),
        ].sort((a, b) => a.y - b.y)
        return `${!d.secs && d.title ? `${quote(d.title, 32)}, ` : ''}form, labels above ${d.white ? 'white ' : ''}bordered rounded fields${d.bare ? ' straight on the page (no card, panel or border around the form)' : ''}, in order: ${seq.map((x) => x.say).join('; ')}${d.buttons.length ? `; buttons${side}: ${d.buttons.map(btn).join(', ')}` : ''}${rhythmWords(d.rhythm)}`
      }
      return `${d.title ? `${quote(d.title, 32)}${d.close ? `, ${quote(d.close)} close top right` : ''}, ` : ''}form, labels above fields: ${d.rows.map((r) => r.map(fld).join(' | ')).join('; ')}${d.buttons.length ? `; buttons${side}: ${d.buttons.map(btn).join(', ')}` : ''}${d.gap ? `, pinned to the bottom of the ${d.gap.h}px tall card with ${d.gap.px}px of empty space above them` : ''}`
    }
      return `${d.title ? `${quote(d.title, 32)}, ` : ''}form, labels above empty fields: ${d.rows.map((r) => r.length === 1 ? `${quote(r[0].label)}${r[0].wide ? ' full width' : ''}` : r.map((x) => quote(x.label)).join(' | ')).join('; ')}`
    case 'bars': if (d.odd) return `${barCard(d)}bar chart${d.title ? ` ${quote(d.title, 32)}` : ''}, ${d.count} bars, all ${colourName(d.odd.main)} (${hexOf(d.odd.main)}) except ${oddRuns(d.odd.o).map(([a, b, c]) => `${a === b ? `bar ${a + 1}` : `bars ${a + 1} to ${b + 1} (counting from the left)`} ${vivid(c) ? 'vivid ' : ''}${colourName(c)} (${hexOf(c)})`).join(' and ')}${d.heights ? `, heights ${d.heights.join('/')}% of the tallest` : ''}${barSize(d)}`
      return `${barCard(d)}bar chart${d.title ? ` ${quote(d.title, 32)}` : ''}, ${d.count} ${colourName(d.colour) ?? ''} bars${d.heights ? `, heights ${d.heights.join('/')}% of the tallest` : ''}${barSize(d)}`.replace(/\s+/g, ' ')
    case 'bubbles': return `chat bubbles: ${d.items.slice(0, 4).map((b) => `${b.side} ${colourName(b.fill) ?? ''} ${short(b.text, 40)}`.replace(/\s+/g, ' ')).join(', ')}${d.items.length > 4 ? `, ${d.items.length - 4} more` : ''}`
    case 'cards': return `column ${quote(d.head, 20)}, cards: ${d.items.slice(0, 3).map((c) => `${short(c.text.replace(c.tags.map((t) => t.text).join(' '), '').trim(), 26)}${c.tags.length ? ` tag ${chipList(c.tags, 1)}` : ''}`).join(', ')}${d.items.length > 3 ? `, ${d.items.length - 3} more` : ''}`
    case 'tiles': return `grid of ${d.items.length} ${d.bordered ? 'bordered rounded ' : ''}tiles, ${d.cols} per row, each a coloured picture block on top, then name, then small grey line: ${d.items.map((x) => `${x.grad ? `${colourName(x.grad[0])} to ${colourName(x.grad[x.grad.length - 1])} gradient` : colourName(x.pic)} ${quote(x.parts[0], 24)}${x.parts[1] ? ` ${x.parts[1]}` : ''}`).join(', ')}${d.sel ? `; ${quote(d.sel.t, 24)} selected (${colourName(d.sel.c)} ${d.sel.w}px border)` : ''}`
    case 'sheet': {
      const r = (row, i) => `row ${i + 1}: ${row.map((t) => (t ? quote(t, 16) : '(empty)')).join(' | ').replace(/( \| \(empty\))+$/, '')}${d.rowLook[i].bold ? ' (bold' + (d.rowLook[i].fill ? `, ${sheetFill(d.rowLook[i].fill)} row)` : ')') : d.rowLook[i].fill ? ` (${sheetFill(d.rowLook[i].fill)} row)` : ''}`
      return `spreadsheet grid with thin grey cell lines: ${d.headFill ? `${colourName(d.headFill)} ` : ''}header row of column letters ${d.top[0]} to ${d.top[d.top.length - 1]}, row numbers 1 to ${d.rows} down a narrow ${d.firstPx}px left column, cells ${d.colPx}px wide and ${d.rowPx}px tall; ${d.used.map(r).join('; ')}; rows ${d.used.length + 1} to ${d.rows} empty${d.sel ? `; cell ${d.sel.at} selected (${colourName(d.sel.colour)} 2px outline)` : ''}`
    }
    case 'messages': {
      const m0 = d.items[0]
      const row = (m) => `${colourName(m.av)} avatar, ${quote(m.name, 24)} ${m.time}: ${quote(m.body, 70)}${m.extra.map((x) => x.chip ? `, small chip ${quote(x.t)} under it` : `, small ${colourName(x.ink)} bold ${quote(x.t)} under it`).join('')}`
      if (d.composer || d.seps) {
        const blk = (b) => b.pre ? `then a code block (a <pre>, ${b.px}px monospace ${hexOf(b.ink)} text${b.fill ? `, ${hexOf(b.fill)} fill` : ''}${b.border ? `, 1px ${hexOf(b.border)} border` : ''}${b.rad ? `, ${b.rad}px rounded` : ''}), these ${b.pre.length} lines exactly: ${b.pre.map((l) => quote(l, 60)).join(' / ')}`
          : b.pills ? `then a row of ${b.pills.length} small reaction pills side by side under it: ${b.pills.map((x) => `${quote(x.t)} (${x.fill ? `${hexOf(x.fill)} fill` : 'no fill'}${x.border ? `, 1px ${hexOf(x.border)} border` : ''}${x.rad ? `, ${x.rad}px rounded` : ''})`).join(', ')}`
          : b.inl.length ? `${quote(b.t, 110)} with ${b.inl.map((x) => `${quote(x.t)} INSIDE the sentence as an inline highlighted mention (${hexOf(x.fill)} fill, ${hexOf(x.ink)} text, on the same line, in place)`).join(', ')}`
          : b.bold || !/black|grey|gray|white/.test(colourName(b.ink) ?? '') ? `then a ${b.px}px ${b.bold ? 'bold ' : ''}${hexOf(b.ink)} link line ${quote(b.t, 60)}` : quote(b.t, 110)
        const row = (m) => `${hexOf(m.av)} avatar, bold ${quote(m.name, 24)}, grey ${m.time}: ${m.blocks && m.blocks.length ? m.blocks.map(blk).join('; ') : quote(m.body, 110)}`
        const C = d.composer
        const hs = d.headParts ? d.headParts.map((x) => `${x.px}px ${x.bold ? 'bold ' : ''}${hexOf(x.ink)} ${quote(x.t, 40)}`).join(' then ') : d.head ? quote(d.head, 40) : null
        return `${hs ? `a ${d.headH}px header row at the very top: ${hs}${d.headRule ? ', a thin line under it' : ''}; then ` : ''}${d.items.length} chat messages stacked top-down under it (no bubbles), each a ${m0.px}px ${m0.round ? 'round' : 'rounded square'} avatar left, name and time on one line, then its blocks in order: ${d.items.map((m, i) => `message ${i + 1}: ${row(m)}${(d.seps ?? []).filter((x) => x.after === i + 1).map((x) => `. Then a small grey divider ${quote(x.t, 30)}${x.rule ? ' with a thin line above it' : ''}`).join('')}`).join('. ')}${C ? `. At the BOTTOM of the panel (absolutely placed, NOT at the top): a message composer ${C.w}x${C.h}px at ${C.x},${C.y} in the panel, 1px ${hexOf(C.border)} border, ${C.rad}px rounded${C.bar ? `, a ${C.bar.h}px ${C.bar.fill ? `${hexOf(C.bar.fill)} ` : ''}format bar along its top with bold grey ${C.bar.items.map((t) => quote(t)).join(' ')}` : ''}${C.ph ? `, grey placeholder ${quote(C.ph, 40)} under it` : ''}${C.send ? `, a ${C.send.w}x${C.send.h}px ${hexOf(C.send.fill)} send button in its bottom-right corner` : ''}` : ''}`
      }
      return `${d.head ? `header ${quote(d.head, 30)}${d.headRule ? ' with a thin line under it' : ''}, then ` : ''}${d.items.length} chat messages stacked top-down (no bubbles), each a ${m0.px}px ${m0.round ? 'round' : 'rounded square'} avatar left, bold name then small grey time on one line, message text under: ${d.items.map(row).join('; ')}`
    }
    case 'list': if (d.items.every((p) => p.length === 1 && p[0].length <= 6) && d.items.filter((p) => /^\d+$/.test(p[0])).length >= 2) return `${d.head ? `${quote(d.head, 24)}, ` : ''}page numbers ${d.items.map((p) => quote(p[0])).join(', ')}${d.on ? `, ${quote(d.on)} highlighted` : ''}`
      // grouped nav: small headings each over its own links, every link said (round 8 e5 docs nav: '5 more' after the
      // first four became invented links under the wrong headings)
      if (d.groups && d.stacked && d.items.every((p) => p.length === 1 && p[0].length <= 28)) {
        const caps = d.groups.every((g) => /^[A-Z0-9 &/-]+$/.test(g.h))
        return `side nav, no box: ${d.groups.length} groups, each a ${caps ? 'small grey spaced-capitals ' : 'small bold '}heading over its own links, one link per line (every link said, none invented, none moved to another group): ${d.groups.map((g) => `${quote(g.h, 28)}: ${g.items.map((i) => quote(d.items[i][0], 28)).join(', ')}`).join('; ')}${d.on ? `; ${quote(d.on, 28)} highlighted${d.onFill ? ` (${sheetFill(d.onFill)} row${d.navLook?.onEdge ? `, a ${d.navLook.onEdge.w}px ${hexOf(d.navLook.onEdge.c)} left edge` : ''}${d.onInk ? `, bold ${hexOf(d.onInk)} text` : ''})` : ''}` : ''}${navWords(d.navLook)}`
      }
      // mail rows that open on the sender: sender, time, subject, preview (round 8 e1: 'Ravi, me (3)' is longer than a
      // time, so the rows fell to a bare sender list and the build lost every subject and preview)
      const timeish = (t) => /^(\d{1,2}:\d{2}( ?[ap]m)?|yesterday|today|(mon|tue|wed|thu|fri|sat|sun)\w*|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w* \d{1,2})$/i.test(t)
      // n149: a music track table (round 13 e2: '#, title+artist, plays, 3:41' said as mail rows)
      const dur = (t) => /^\d{1,2}:\d{2}$/.test(t), num = (t) => /^[\d,.]+[kKmM]?$/.test(t)
      if (d.items.length >= 4 && d.items.every((p) => p.length === 4 && dur(p[3]) && num(p[2]) && p[0].length <= 3)) {
        const head = (d.extra ?? []).find((x) => x.tabs)?.tabs
        const split = (t) => { const m = t.match(/^(.*?[a-z0-9)])([A-Z].*)$/); return m ? [m[1], m[2]] : [t, ''] }
        const onRow = d.on ? d.items.findIndex((p) => p.includes(d.on) || p[1].startsWith(d.on) || d.on.startsWith(split(p[1])[0])) : -1
        const H = d.hero, hx = (c) => hexOf(c)
        const heroW = H ? `holding, first, a ${H.hH}px tall header at the top of the block (block px from its top-left): ${H.cover ? `a ${H.cover.w}x${H.cover.h}px cover square at ${H.cover.x},${H.cover.y} painted ${cssHex(H.cover.bg)}${parseFloat(H.cover.rad) ? `, ${H.cover.rad} rounded` : ''}, a soft shadow; to its right, bottom-aligned with it: ` : ''}${H.small.filter((m) => m.above).map((m) => `${m.px}px ${m.bold ? 'bold ' : ''}${hx(m.ink)} ${quote(m.t, 30)} over `).join('')}the title ${quote(H.h, 40)} ${H.px}px font-weight ${H.weight} ${hx(H.ink)} starting at x ${H.x}${H.small.filter((m) => !m.above).map((m) => `, then under it ${m.px}px ${hx(m.ink)} ${quote(m.t, 60)}`).join('')}; then ` : ''
        return `${heroW}${d.head ? `${quote(d.head, 20)} box, then ` : ''}a TRACK TABLE (NOT mail rows, NOT cards): ${head ? `a small grey header row ${head.map((t) => quote(t, 12)).join(' | ')} with a thin line under it, then ` : ''}${d.items.length} track rows, each one line ~56px tall in 4 columns: the track number (narrow, grey) | the song title (white) with the artist in small grey UNDER it | the play count (grey) | the length at the far right (grey): ${d.items.map((p, i) => { const [t, a] = split(p[1]); return `${p[0]} | ${quote(t, 30)} / ${quote(a, 30)} | ${p[2]} | ${p[3]}${i === onRow ? ' (the PLAYING row: faint highlight fill, rounded, its title in the accent colour, a ▶ in place of its number)' : ''}` }).join('; ')}`
      }
      if (d.items.length >= 4 && d.items.every((p) => p.length === 4 && timeish(p[1]) && !timeish(p[0]))) d = { ...d, items: d.items.map((p) => [p[1], p[0], p[2], p[3]]), on: d.on && d.items.find((p) => p[0] === d.on)?.[1] }
      if (d.items.length >= 4 && d.items.every((p) => p.length === 4 && p[0].length <= 10)) {
        const bold = d.bold2 ?? []
        const mixed = bold.some(Boolean) && !bold.every(Boolean)
        const sel = d.on ? `; the ${quote(d.on.length <= 10 ? d.items.find((p) => p[0] === d.on)?.[1] ?? d.on : d.on, 20)} row selected${d.onFill ? ` (${sheetFill(d.onFill)}${d.onEdge ? `, ${colourName(d.onEdge)} left edge` : ''})` : ''}` : ''
        return `${d.head ? `${quote(d.head, 20)} box, then ` : ''}${tabsSay(d)}${d.items.length} mail rows with thin lines between, each: sender left and time right on one line, bold subject under, one grey preview line under that${mixed ? '; unread rows have a bold sender, read rows a normal one' : ''}: ${d.items.map((p, i) => `${quote(p[1], 20)} ${p[0]} ${quote(p[2], 36)} / ${quote(p[3], 64)}${mixed && bold[i] ? ' (unread)' : ''}`).join('; ')}${sel}`
      }
      // mail-like rows: a name and a time on one line, a line of text under them (round 4 e2)
      if (d.items.length >= 4 && d.items.every((p) => p.length === 3 && p[1].length <= 10 && p[2].length >= 12)) {
        const bold = d.bold ?? []
        const mixed = bold.some(Boolean) && !bold.every(Boolean)
        return `${d.head ? `${quote(d.head, 20)} ` : ''}list of ${d.items.length} rows, name left and time right on one line, grey line under${mixed ? ', unread rows bold' : ''}: ${d.items.slice(0, 5).map((p, i) => `${quote(p[0], 20)} ${p[1]} ${quote(p[2], 28)}${mixed && bold[i] ? ' bold' : ''}`).join(', ')}${d.items.length > 5 ? `, then ${d.items.slice(5).map((p) => `${quote(p[0], 20)} ${p[1]}`).join(', ')}` : ''}${d.on ? `; ${quote(d.on.split(' ').slice(0, 3).join(' '), 20)} highlighted` : ''}`
      }
      if (d.switches && d.items.length <= 8) {
        const grey = (c) => /grey|white/.test(colourName(c) ?? '')
        return `${d.head ? `${quote(d.head, 20)} ` : ''}${d.items.length} rows with thin lines between, each: bold name, small grey line under it, toggle switch on the right: ${d.items.map((p, i) => `${quote(p[0], 28)}${p[1] ? ` / ${quote(p[1], 44)}` : ''} ${grey(d.switches[i]) ? 'off (grey)' : `on (${colourName(d.switches[i])})`}`).join('; ')}`
      }
      if (d.dots && d.items.length <= 10 && d.items.every((p) => p.length === 1 && p[0].length <= 24)) {
        return `${d.head ? `${quote(d.head, 20)} ` : ''}list, a round colour dot before each: ${d.items.map((p, i) => `${colourName(d.dots[i])} dot ${quote(p[0], 24)}`).join(', ')}${d.on ? `; ${quote(d.on, 20)} highlighted` : ''}`
      }
      if (d.thumbs && d.items.length <= 6 && d.items.every((p) => p.length >= 1 && p.length <= 3)) {
        const t = d.thumbs[0]
        const item = (p, i) => `${quote(p[0], 28)}${p.length >= 2 && p[1] === d.smalls?.[i] ? ` small grey ${quote(p[1], 20)} under it` : ''}${p.length >= 2 && p[p.length - 1] !== d.smalls?.[i] ? `, ${p[p.length - 1]} right` : ''}`
        return `${d.head ? `${quote(d.head, 20)} ` : ''}list of ${d.items.length} items, each with a ${t.px}px ${t.fill ? `${colourName(t.fill)} ` : ''}${t.round ? 'round' : 'square'} thumbnail left: ${d.items.map(item).join('; ')}; then ${(d.extra ?? []).filter((x) => !x.btn).map((x) => `${x.big ? 'big ' : ''}${quote(x.t)}`).join(', ')}${(d.extra ?? []).filter((x) => x.btn).map((x) => `, ${x.fill ? `${colourName(x.fill)} ` : 'outline '}button ${quote(x.t)}`).join('')}`.replace(/; then $/, '')
      }
      // links each with a small grey line under (round 6 e1 mega-menu columns: sublines said for one item only)
      if (d.stacked && d.items.length >= 2 && d.items.length <= 8 && d.items.every((p, i) => p.length === 2 && d.smalls?.[i] === p[1])) {
        const caps = d.head && /^[A-Z0-9 &/-]+$/.test(d.head)
        return `${d.head ? `${caps ? 'small grey spaced capitals ' : ''}${quote(d.head, 24)}, then ` : ''}${d.items.length} links stacked, each a name with a small grey line under it: ${d.items.map((p) => `${quote(p[0], 24)} / ${quote(p[1], 40)}${p[0] === d.on ? ' (highlighted)' : ''}`).join('; ')}`
      }
      // short items are all said up to 8 (round 5 e3 channels: '3 more' became invented channels)
      // ...and a stacked list of short items up to 12 (round 8 e5: items past the first four were invented)
      const cap = d.items.length <= 8 && d.items.every((p) => p[0].length <= 20) ? 8 : d.stacked && d.items.length <= 12 && d.items.every((p) => p[0].length <= 28) ? 12 : 4
      const pic = d.pic ? `a ${d.pic.w}x${d.pic.h}px ${/gradient/.test(d.pic.bg) ? `gradient (${[...d.pic.bg.matchAll(/rgba?\([^)]+\)/g)].map((m) => hexOf(parse(m[0]))).join(' to ')}) ` : d.pic.fill ? `${hexOf(d.pic.fill)} ` : ''}poster picture${d.pic.rad ? ` ${d.pic.rad}px rounded` : ''} at its top left (${d.pic.x}px in, ${d.pic.y}px down)${d.pic.float === 'left' ? ', the title and lines just right of it' : ''}; ` : ''
      const pinSay = (x) => x.pin ? ` (pinned to the card's bottom: its bottom edge ${x.pin.up}px above the card's bottom edge, ${x.pin.w}px wide, centred; empty space above it)` : ''
      const exPin = (x) => `, ${x.bold ? 'bold ' : ''}${x.ink && colourName(x.ink) !== 'near-black' ? `${colourName(x.ink)} (${hexOf(x.ink)}) ` : ''}${quote(x.t)}${pinSay(x)}`
      const ex = (x) => x.pin ? '' : x.tabs ? tabsSay({ extra: [x] }).replace(/, then $/, ' ') : x.caps ? `small grey spaced capitals ${quote(x.t)} ` : x.chips ? `small filled chips side by side, separate: ${x.chips.map((c) => `${quote(c.t)} (${hexOf(c.fill)} fill, bold ${hexOf(c.ink)} text)`).join(', ')} ` : x.lines ? `grey lines ${x.lines.map((l) => quote(l)).join(' / ')} ` : `${x.dot ? `${hexOf(x.dot)} round dot then ` : ''}${x.big ? 'big ' : ''}${quote(x.t)} `
      const hl = d.headLook
      const headSay = d.head ? hl ? `a ${hl.w}x${hl.h}px ${hexOf(hl.fill)} filled button ${quote(d.head, 20)}${hl.rad ? ` (${hl.rad}px rounded` : ' ('}${hl.bold ? ', bold' : ''} ${hexOf(hl.ink)} text; its fill clearly visible, not white), then ` : `${quote(d.head, 20)} ` : ''
      const onSay = d.on && d.onFill ? ` (${hexOf(d.onFill)} ${d.onRad ? 'rounded ' : 'square '}fill${d.onInk ? `, ${hexOf(d.onInk)} text` : ''})` : ''
      if (d.gtable) {
        const t = d.gtable
        const fills = t.rows.filter((r) => r.fill)
        const sel = fills.length === 1 && !fills[0].bold
        const cs = (c, r) => c.badge ? `${quote(c.t, 6)} in a ${c.badge.px}px ${c.badge.round ? 'round' : 'square'} ${hexOf(c.badge.c)} badge (white text)` : `${quote(c.t, 40)}${c.ink && r?.ink && hexOf(c.ink) !== hexOf(r.ink) ? ` ${hexOf(c.ink)}` : ''}${c.right ? ' (right-aligned)' : ''}`
        const ncol = Math.max(...t.rows.map((r) => r.cells.length))
        const colSay = t.cols?.length >= 2 ? `; ${ncol} columns, each cell starting at these x offsets from the row's left: ${t.cols.join(', ')}px${sel ? ' (every column filled in every row, the last one included)' : ''}` : ''
        const rowFill = (r) => r.fill ? sel ? ` (the SELECTED row: ${hexOf(r.fill)} fill across the whole row${r.stripe ? `, a ${r.stripe.px}px ${hexOf(r.stripe.c)} stripe down its ${r.stripe.side} edge` : ''})` : ` (group row: ${r.bold ? 'bold, ' : ''}${hexOf(r.fill)} fill across the whole row)` : ''
        const hs = t.head ? `a ${t.head.h}px column-head row${t.head.fill ? ` with a ${hexOf(t.head.fill)} fill` : ''} (NOT a button: a table header across the full width), ${t.head.px}px${t.head.bold ? ' bold' : ''} ${hexOf(t.head.ink)} spaced capitals ${t.head.cells.map((c) => quote(c, 16)).join(' | ')}, then ` : ''
        const ink0 = t.rows.find((r) => !r.fill)?.ink
        return `${pic}${sel ? 'a data table' : 'a task table'} (rows, NOT tabs): ${hs}exactly ${t.rows.length} rows, each ${t.h}px tall${t.mono ? `, ${t.mono.px}px monospace ${ink0 ? `${hexOf(ink0)} ` : ''}text` : ''}${colSay}, in EXACTLY this order top to bottom${sel ? ' (every row its own real data, never invented or repeated; a word followed by a colour is set in that colour)' : ' (group rows sit between their task rows; never gather the groups together)'}, cells left to right: ${t.rows.map((r) => `${r.cells.map((c) => cs(c, r)).join(' | ')}${rowFill(r)}`).join('; ')}${t.rule ? `; a thin ${hexOf(t.rule)} line under every row` : ''}; empty below the last row`
      }
      if (d.grouped) {
        const g = d.grouped
        const say = (o) => `${quote(o.t, 40)}${o.fill ? ` (group row: ${o.bold ? 'bold, ' : ''}${hexOf(o.fill)} fill across the whole row)` : o.right ? ` (${o.px}px ${hexOf(o.ink)}${o.bold ? ' bold' : ''}, ${quote(o.right, 16)} at the row's right end: a column head row)` : ''}${o.dot ? ` with a ${o.dot.px}px ${hexOf(o.dot.c)} ${o.dot.round ? 'round' : 'square'} dot at the right end` : ''}`
        const rule = g.find((o) => o.rule)?.rule
        return `${pic}a grouped list of exactly ${g.length} rows, each ${d.groupedH}px tall, starting at the panel's very top, in EXACTLY this order top to bottom (group rows sit between their task rows; never gather the groups together): ${g.map(say).join('; ')}${rule ? `; a thin ${hexOf(rule)} line under every row` : ''}; empty below the last row`
      }
      if (d.order && d.order.length >= 5 && d.order.length <= 30) {
        const i0 = Math.min(...d.order.map((o) => o.ind))
        return `${pic}${headSay}a tree list, these ${d.order.length} lines in EXACTLY this order top to bottom (one per row, nothing moved up or grouped): ${d.order.map((o) => `${quote(o.t, 30)}${o.ind - i0 >= 4 ? ` indented ${o.ind - i0}px` : ''}${o.fill ? ` (row highlighted ${hexOf(o.fill)})` : ''}`).join(', ')}${d.navLook?.pitch && d.stacked && d.navLook.pitch <= d.navLook.rowH + 6 ? `; rows exactly ${d.navLook.pitch}px apart (${d.navLook.rowH}px tall, ${d.px}px type: tight, not roomier)${d.navLook.first != null ? `, first line ${d.navLook.first}px below the panel's top` : ''}` : ''}`
      }
      return `${pic}${headSay}${(d.extra ?? []).filter((x) => !x.btn && !x.after).map(ex).join('')}list: ${d.items.slice(0, cap).map((parts) => parts.length >= 2 && parts[1].length <= 14 ? `${quote(parts[0], 20)} ${parts[1]}` : quote(parts[0], 20)).join(', ')}${d.items.length > cap ? `, ${d.items.length - cap} more` : ''}${d.on ? `; ${quote(d.on.split(' ').slice(0, 3).join(' '), 20)} highlighted${onSay}` : ''}${(d.extra ?? []).some((x) => !x.btn && !x.pin && x.after) ? `; then under the list, in this order: ${(d.extra ?? []).filter((x) => !x.btn && !x.pin && x.after).map((x) => ex(x).trim()).join(', ')}` : ''}${(d.extra ?? []).filter((x) => x.pin && !x.btn).map(exPin).join('')}${(d.extra ?? []).filter((x) => x.btn).map((x) => `, ${x.fill ? `${colourName(x.fill)} ` : 'outline '}button ${quote(x.t)}${pinSay(x)}`).join('')}${d.navLook?.pitch && d.stacked && d.items.length >= 4 && !d.pic ? `; list rows exactly ${d.navLook.pitch}px apart (${d.navLook.rowH}px tall, ${d.px}px type: tight, not roomier)${d.navLook.first != null ? `, first line ${d.navLook.first}px below the panel's top` : ''}` : ''}`
  }
  return null
}

/** One region -> {kind, note} (kind null = don't draw). */
// ---- round 5 creative helpers (n61)
/** Soft glows over a fill: 'near-black block with soft glows: indigo top left, pink bottom right' (was 'indigo to pink gradient'). */
function glowWords(f) {
  if (!f.glows || !f.glows.length) return null
  const base = visible(f.bg) ? colourName(f.bg) : null
  const inside = f.glows.filter((g) => g.inside)
  const one = inside.length === 1 && inside[0].big
  const say = (g) => g.inside ? g.big ? `one big ${colourName(g.c)} glow centred ${g.fx}% across and ${g.fy}% down (about ${g.px * 2}px across, filling most of the block)` : `${colourName(g.c)} glow ${g.at}` : `${colourName(g.c)} ${g.at}`
  if (one) return `${base ? `${base} block` : 'block'} lit by ${f.glows.map(say).join(', a little ')}`
  // each glow says its hex, centre and reach, solid at its centre (round 6 c4: 'cyan top left' was built as faint
  // haze; the target's glows are full-strength colour at the centre, fading out over 450-650px)
  const exact = (g) => g.inside ? `${colourName(g.c)} (${hexOf(g.c)}) ${g.at}, centred ${g.fx}% across and ${g.fy}% down, full-strength ${colourName(g.c)} at its centre fading to nothing about ${g.px}px out (radial-gradient(circle at ${g.fx}% ${g.fy}%, ${hexOf(g.c)} 0, transparent ${g.px}px))` : `${colourName(g.c)} (${hexOf(g.c)}) ${g.at}`
  return `${base ? `${base} block` : 'block'} with soft colour glows: ${f.glows.map(exact).join('; ')}`
}
/** A hard offset shadow with its offset and colour (round 5 c4 photo's 24px brown shadow: unsaid). */
function shadowWords(f) {
  const s = f.shadows.find((x) => !x.clear && x.blur <= 1 && (Math.abs(x.x) >= 2 || Math.abs(x.y) >= 2))
  if (!s) return null
  const side = `${s.y > 0 ? 'down' : 'up'} ${s.x > 0 ? 'right' : 'left'}`
  // a see-through shadow says its strength (round 4 c1: 18% near-black over cream was said 'near-black',
  // so a solid black slab was asked for; the real one reads as a faint grey-beige)
  const ink = s.c ? `${colourName({ ...s.c, a: 1 })}${s.c.a < 0.6 ? ` at ${Math.round(s.c.a * 100)}% opacity` : ''} ` : ''
  // an opaque one says so (round 5 c4: 'hard dark brown shadow' built see-through, the outline type showing through)
  const solid = s.c && s.c.a >= 0.95 ? 'solid opaque ' : ''
  return `hard ${solid}${ink}shadow offset ${Math.abs(Math.round(s.x))}px ${side}, no blur`
}
/** The repeated unit of a marquee's copy ('Flex Grotesk — now variable ✦' x4). */
function repeatUnit(t0) {
  // n146: the copy is trimmed, so a unit ending in a space repeated exactly twice is one letter short of two units
  // (round 12 c1 ticker: unquoted, its words invented)
  const t = `${t0} `
  for (let L = 6; L <= t.length / 2; L++) {
    const u = t.slice(0, L)
    if (t.slice(L, 2 * L) === u && t.startsWith(u.repeat(Math.floor(t.length / L)).slice(0, t.length - (t.length % L)))) return u.trim()
  }
  return null
}
/** Code in a card: its lines as set, and which tokens are coloured (round 5 c5: only the tokens were said). */
function codeNote(f) {
  if (!isMono(f.font.family) || f.setLines.filter((l) => l.trim()).length < 3 || f.setLines.length > 12) return null
  const lines = f.setLines.map((l) => (l.trim() ? `"${l}"` : 'blank line')).join(', ')
  const by = new Map()
  for (const k of f.tokenInks) { const n = colourName(k.c); if (n && dist(k.c, f.colour) > 40) by.set(n, uniq([...(by.get(n) ?? []), k.t])) }
  const inks = [...by].map(([n, ts]) => `${n} ${ts.map((t) => `"${t}"`).join(', ')}`).join('; ')
  return `mono ${Math.round(f.font.size)}px code lines: ${lines}${f.colour ? `; ${colourName(f.colour)} code` : ''}${inks ? `, coloured: ${inks}` : ''}`
}

/** n136 (round 10): tile grids, checker floors, glowing mono lines with a cursor, chip log lines, box-drawing text. */
function round10Note(f) {
  const T = f.tileGrid
  if (T) {
    const say = (t) => {
      const c = t.c ? `${colourName(t.c)} ${hexOf(t.c)}` : ''
      const inset = t.w < T.cellW - 2 || t.h < T.cellH - 2 ? ` ${t.w}x${t.h}px, ${t.x % T.cellW}px in from the cell's left and ${t.y % T.cellH}px down` : ''
      if (t.kind === 'empty') return 'empty (page shows)'
      if (t.kind === 'quarter') { const sq = { 'bottom-right': 'top-left', 'bottom-left': 'top-right', 'top-left': 'bottom-right', 'top-right': 'bottom-left' }[t.corner]; return `${c} quarter circle (square corner ${sq}, curve at ${t.corner}: border-radius 100% on the ${t.corner} corner only)` }
      if (t.kind === 'half') return `${c} half disc dome${inset} (flat bottom, rounded top: border-radius ${Math.round(t.w / 2)}px ${Math.round(t.w / 2)}px 0 0)`
      if (t.kind === 'circle') return `${c} circle${inset}`
      if (t.kind === 'triangle') return `${c} triangle pointing up (clip-path polygon(0 100%, 50% 0, 100% 100%))`
      if (t.kind === 'stripes') return `${c} vertical stripes (${t.stripe?.band ?? 12}px bars every ${t.stripe?.pitch ?? 24}px, gaps show the page)`
      return `${c} solid square`
    }
    const rows = []
    for (let r = 0; r < T.rows; r++) rows.push(`row ${r + 1}: ${T.tiles.slice(r * T.cols, r * T.cols + T.cols).map(say).join(' | ')}`)
    return { kind: 'box', note: `a full-page grid of ${T.cols} columns x ${T.rows} rows of flat shape tiles (display grid, ${T.cellW}x${T.cellH}px cells, no gaps, no borders), ${T.w}x${T.h}px at ${T.x},${T.y}, behind everything else; each cell holds ONE flat-colour geometric shape (NOT one box, NOT a picture, NOT an SVG: ${T.tiles.length} real divs, each overflow hidden); every tile left to right, row by row: ${rows.join('; ')}` }
  }
  // n164: a repeating conic gradient in degrees with no tile size is a SUNBURST of rays from one centre (round 16 c3:
  // said as a checkerboard floor, built as chess squares)
  if (f.checker && f.checker.cols.length >= 2 && /deg/.test(f.checker.img ?? '') && !/\d+px/.test(f.checker.size ?? '')) {
    const [a, b] = f.checker.cols, stops = [...(f.checker.img ?? '').matchAll(/([\d.]+)deg/g)].map((m) => +m[1]).filter((v) => v > 0)
    const step = stops.length ? Math.min(...stops) : 7.5, rays = Math.round(360 / (2 * step))
    const css = f.checker.img.replace(/rgba?\([^)]+\)/g, (m) => hexOf(parse(m))).replace(/\s+/g, ' ')
    return { kind: 'circle', note: `a SUNBURST: ${rays} sharp straight rays fanning out from one centre, alternating ${colourName(a)} ${hexOf(a)} and ${colourName(b)} ${hexOf(b)}, each ray ${step}deg wide (like a starburst / pinwheel of thin pie slices), on ONE ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px block at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}${f.radius >= f.rect.w / 2 - 2 || f.radiusPct >= 49 ? ', border-radius 50% (a round disc of rays)' : ''}, painted with exactly background: ${css} (no background-size: it does NOT repeat as tiles); NOT a checkerboard, NOT squares, NOT stripes, no blur` }
  }
  if (f.checker && f.checker.cols.length >= 2) {
    const sq = parseFloat(f.checker.size) / 2 || 40, [a, b] = f.checker.cols
    return { kind: 'box', note: `a checkerboard floor ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}: sharp ${Math.round(sq)}px squares alternating ${colourName(a)} ${hexOf(a)} and ${colourName(b)} ${hexOf(b)} like a chess board (background: repeating-conic-gradient(${hexOf(a)} 0 25%, ${hexOf(b)} 0 50%) 0 0/${Math.round(sq * 2)}px ${Math.round(sq * 2)}px), NOT a gradient, NOT stripes, no blur` }
  }
  const glowT = f.textShadows.filter((s) => s.blur >= 6)
  if (f.cursorKid && f.text && f.text.length <= 24 && f.font.size >= 48) {
    const K = f.cursorKid
    return { kind: 'heading', note: `${Math.round(f.font.size)}px ${f.font.weight >= 600 ? 'bold ' : ''}${faceName(f.font.family) || 'monospace'} (font-family ${f.font.family.split(',')[0].replace(/"/g, '')}, monospace) ${hexOf(f.colour)} ${quote(f.text, 24)} as LIVE TEXT on one line at ${Math.round(f.rect.x)},${Math.round(f.rect.y)} (NOT a picture, NOT a box)${glowT.length ? `, glowing (text-shadow: ${glowT.map((s) => `0 0 ${Math.round(s.blur)}px ${hexOf(s.c)}${s.c?.a < 1 ? ` at ${Math.round(s.c.a * 100)}%` : ''}`).join(', ')})` : ''}; right after the last letter on the same line a solid ${hexOf(K.c)} block cursor ${K.w}x${K.h}px${K.blink ? ' that blinks (keyframes: opacity 0 at 50%, 1s steps(1) infinite)' : ''}` }
  }
  if (f.preText && !f.regionKids.length) {
    return { kind: 'text', note: `a box-drawing frame as live ${Math.round(f.font.size)}px ${faceName(f.font.family) || 'mono'} ${hexOf(f.colour)} text in a <pre> (white-space: pre, line-height ${Math.round(f.font.lineHeight)}px) at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, NOT a bordered div, NOT a picture; exactly these lines: ${f.preText.split('\n').map((l) => `"${l}"`).join(' / ')}` }
  }
  const C = f.chipLines
  if (C && C.lines.length >= 3 && C.lines.some((l) => l.chip) && C.chipFill?.a > 0.5) {
    return { kind: 'text', note: `exactly ${C.lines.length} ${C.px}px ${faceName(f.font.family) || 'mono'} ${hexOf(f.colour)} lines (line-height ${C.lh}px) at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, nothing else invented: ${C.lines.map((l) => l.chip ? `"${l.t.replace(new RegExp(`\\s*${l.chip}$`), '')}" then a "${l.chip}" chip` : `"${l.t}"`).join(' / ')}; each chip a solid ${hexOf(C.chipFill)} label with ${hexOf(C.chipInk)} text, 6px side padding, square corners` }
  }
  return null
}
/** n136: extra words a note gains: an extruded letter stack, a text glow, a window title bar. */
function round10Extra(f, d) {
  if (!d?.note) return d
  let note = d.note
  const hard = f.textShadows.filter((s) => s.blur <= 1 && (s.x || s.y))
  if (hard.length >= 3) {
    const s0 = hard[0], sN = hard[hard.length - 1]
    note += `; EXTRUDED in 3D: ${hard.length} stacked hard text-shadows (no blur) of solid ${hexOf(s0.c)}, stepping ${Math.round(s0.x)}px right and ${Math.round(s0.y)}px down each, out to ${Math.round(sN.x)}px ${Math.round(sN.y)}px (text-shadow: ${hard.map((s) => `${Math.round(s.x)}px ${Math.round(s.y)}px 0 ${hexOf(s.c)}`).join(', ')}), so each letter sits on a deep dark block side; NOT flat letters`
  }
  if (f.textStroke && f.colour?.a > 0.05 && !/hollow|text-stroke|outline round every letter|outlined letters/i.test(note)) note += `; a ${f.textStroke.px}px ${hexOf(f.textStroke.c)} outline round every letter (-webkit-text-stroke: ${f.textStroke.px}px ${hexOf(f.textStroke.c)}) over the ${hexOf(f.colour)} fill`
  // n166: a hollow letter's outline said with its width and see-through alpha (round 16 c2 '3': 2px white at 25% said only
  // 'hollow outlined white', built as a bright full-white outline)
  if (f.textStroke && (!f.colour || f.colour.a <= 0.05) && f.textStroke.c && f.textStroke.c.a < 0.9 && !/text-stroke:/.test(note)) note += `; the outline is FAINT: -webkit-text-stroke: ${f.textStroke.px}px rgba(${f.textStroke.c.r}, ${f.textStroke.c.g}, ${f.textStroke.c.b}, ${Math.round(f.textStroke.c.a * 100) / 100}) (only ${Math.round(f.textStroke.c.a * 100)}% opaque, a ghostly thin line, NOT bright), color: transparent`
  // n139: a vertical stepper said step by step (round 10 e5: checks, colours and connectors lost)
  const S = f.stepRail?.steps
  if (S && f.stepRail.radio) {
    const hx = (c) => (c && c.a > 0.05 ? hexOf(c) : 'no fill')
    note += `; each option card has its own ${S[0].d}px radio circle (border-radius 50%) in its top-right corner, ${S[0].kr}px in from the right and ${S[0].kt}px down: ${S.map((q) => `${quote(q.rest[0].t, 20)} ${hx(q.fill)} with a ${q.bw}px ${hexOf(q.bc)} ring`).join(', ')} (the thick ring is the chosen one)`
  } else if (S) {
    const hx = (c) => (c && c.a > 0.05 ? hexOf(c) : null)
    const lead = f.kidTexts.filter((t) => !S.some((q) => q.rest.some((r) => r.t === t) || t.includes(q.rest[0].t)))[0]
    const gap = S.length >= 2 ? S[1].top - S[0].top : null
    note = `${d.note.split(/ (?:grey |light grey |white )?(?:lines|list|text) /)[0].replace(/[,;\s]+$/, '')} ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}${lead ? `; at its top ${quote(lead, 30)}` : ''}; under it a VERTICAL STEPPER of ${S.length} steps${gap ? ` exactly ${gap}px apart` : ''}, each step a ${S[0].d}px round marker (border-radius 50%) at the left with its title and grey sub-line to its right, built as real elements (NOT a plain list, NOT grey dots): ` +
      S.map((q, i) => `step ${i + 1} marker at ${q.x},${q.y} ${hx(q.fill) ? `filled ${hx(q.fill)}` : 'no fill'}${q.bw ? ` with a ${q.bw}px ${hx(q.bc)} ring` : ''} holding ${hx(q.ink)} ${quote(q.t || ' ')}, then ${q.rest.map((r) => `${r.px}px${r.w >= 600 ? ' bold' : ''} ${hexOf(r.c)} ${quote(r.t, 40)}`).join(' over ')}${q.con ? `; under its marker a ${q.con.w}x${q.con.h}px ${hexOf(q.con.c)} connector line down to the next marker` : ''}`).join('; ')
  }
  // n139: loose words laid over a textless shape (round 10 c1 star: 'JUN 12' dropped)
  const O = f.textOver
  if (O && !note.includes(O.t)) note += `; centred on top of it ${O.px}px ${O.weight >= 700 ? 'bold ' : ''}${colourName(O.c)} (${hexOf(O.c)}) live text ${quote(O.t)}${O.spins ? '' : ' that stays upright (the text does NOT spin with the shape: a separate element over it)'}`
  const B = f.svgSrc ? null : f.titleBar
  if (B && d.kind === 'box') note += `; along its top edge a ${B.h}px title bar${B.rule ? ` with a ${B.rule}px ${hexOf(B.ruleC)} rule under it` : ''}: ${B.dots} ${B.ring ? `ring dots (${B.dot}px, 2px ${hexOf(B.dotC)} border, no fill)` : `${B.dot}px dots`} at its left${B.t ? ` and ${B.tpx}px widely spaced ${quote(B.t, 30)} at its right end` : ''}`
  // n137: a window inset from the page edges says its size and place (round 10 c3 built it full-page)
  if (B && d.kind === 'box' && f.rect.x >= 24 && f.rect.y >= 24 && f.rect.x + f.rect.w <= 1256) note += `; the window is ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px with its top-left at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}${f.radius >= 2 ? `, ${Math.round(f.radius)}px rounded corners` : ''}${f.border?.w ? `, a ${Math.round(f.border.w)}px ${hexOf(f.border.colour)} border` : ''}: INSET, the page shows round it on every side (NOT full-page, NOT edge to edge); the parts drawn inside it sit inside it`
  return note === d.note ? d : { ...d, note }
}
/** n138: a region said part by part, each part's page-px box, paint and text (nothing invented, nothing left out). */
function partsNote(P, f) {
  const hx = (c) => (c ? `${hexOf(c)}${c.a < 0.95 ? ` at ${Math.round(c.a * 100)}%` : ''}` : '')
  // n175: a clear stop said 'transparent' (round 17 c5 hero: '#000000 at 0%' built as black, the cyan glow under it lost);
  // the 'none' layer that the fill colour leaves in a layered background list dropped
  const imgW = (s) => s.replace(/rgba?\([^)]+\)/g, (m) => { const c = parse(m); return c && c.a < 0.05 ? 'transparent' : hx(c) }).replace(/(?:,\s*none)+$/, '')
  const one = (p) => {
    const paint = []
    if (p.fill) paint.push(`${hx(p.fill)} fill`)
    if (p.img) paint.push(/gradient/.test(p.img) ? imgW(p.img) : 'a picture')
    if (p.border) {
      const [t, r, b, l] = p.border.w, all = t >= 1 && r >= 1 && b >= 1 && l >= 1
      const sides = all ? '' : ` on the ${[['top', t], ['right', r], ['bottom', b], ['left', l]].filter(([, v]) => v >= 1).map(([n]) => n).join('+')} only`
      paint.push(`${Math.max(t, r, b, l)}px ${p.border.style === 'dashed' ? 'DASHED ' : p.border.style === 'dotted' ? 'dotted ' : ''}${hx(p.border.c)} border${sides}`)
    }
    if (p.ring) paint.push(`${p.ring.px}px ${hx(p.ring.c)} outline ring`)
    if (p.inset) paint.push(`inset ring (box-shadow: ${imgW(p.inset)})`)
    if (p.radius) paint.push(p.radius >= Math.min(p.w, p.h) / 2 - 1 ? (Math.abs(p.w - p.h) <= 2 ? 'a circle' : 'pill ends') : `${p.radius}px rounded`)
    // n143: a weight other than 400 / 700 is said as its number, italic said (round 11 c3 weight ladder: Thin 100 built
    // regular, Black 900 built upright bold)
    const wtSay = p.wt && ![400, 700].includes(p.wt) && (p.wt <= 300 || p.wt >= 800 || p.px >= 20) ? `font-weight ${p.wt} ` : p.bold ? 'bold ' : p.px >= 20 ? 'regular (NOT bold) ' : ''
    // n145: a pre block said line by line, coloured words in place (round 11 e1 terminal output scrambled)
    if (p.pre) return `${p.w}x${p.h} at ${p.x},${p.y}${p.fill ? ` ${hx(p.fill)} fill` : ''}: ONE pre block (white-space: pre, ${p.px}px ${p.mono ? 'monospace' : ''} ${hx(p.ink)} text, line-height ${p.pre.lh}px, padding ${p.pre.padT}px ${p.pre.padL}px) of ${p.pre.lines.length} lines in EXACTLY this order, each line ONE row written as one run of text, leading spaces kept, the listed words wrapped in spans of their own colour IN PLACE inside the line (NOT placed separately, NOT absolutely positioned): ${p.pre.lines.map((l, i) => `${i + 1} \`${l.text}\`${l.runs.length ? ` [${l.runs.map((r) => `${JSON.stringify(r.t)} ${hexOf(r.c)}`).join(', ')}]` : ''}`).join('; ')}`
    // n156: a row whose text wraps a bar laid inside it (round 14 e3 ratings '5★ [bar] 72%': built with the text printed
    // over the bars)
    const bar = p.t && p.h <= 2 * p.px && P.filter((q) => !q.t && q.fill && q.h <= 14 && q.w >= 0.3 * p.w && q.x > p.x + 4 && q.x + q.w <= p.x + p.w + 1 && q.y >= p.y - 2 && q.y + q.h <= p.y + p.h + 2).sort((a, b) => b.w - a.w)[0]
    const tk = p.t ? p.t.split(/\s+/) : []
    const text = p.t ? (bar && tk.length === 2 ? `a row: ${p.px}px ${hx(p.ink)} "${tk[0]}" at the left (x ${p.x}), then the bar(s) from x ${bar.x} to ${bar.x + bar.w}, then "${tk[1]}" right after the bar ends; the text is NEVER printed over the bar` : `${p.px}px ${wtSay}${p.it ? 'italic ' : ''}${p.mono ? 'mono ' : ''}${p.face ? `${p.face === 'sans' ? 'Helvetica/Arial sans-serif (NOT the page serif)' : 'serif (NOT the page sans)'} ` : ''}${hx(p.ink)} "${p.t}"${p.px >= 20 && p.nl >= 2 && p.nl <= 4 ? ` set on exactly ${p.nl} lines (line-height ${p.lh}px; it WRAPS, never forced onto one line)` : ''}${p.runs?.length ? ` (ONE element, its words in this order; inside it ${p.runs.map((r) => `"${r.t}" in an inline span ${[r.it ? 'italic' : '', r.bold ? 'bold' : '', r.mono ? 'monospace' : '', r.ink && p.ink && dist(r.ink, p.ink) > 20 ? hx(r.ink) : ''].filter(Boolean).join(' ') || 'styled'}`).join(', ')}, IN PLACE in the line, NOT placed apart)` : ''}${p.cap ? `; opening on a DROP CAP: its first letter "${p.cap.letter}" ${p.cap.px}px ${hx(p.cap.ink)}, floated left and sinking about ${Math.max(2, Math.round(p.cap.px * 0.8 / (p.px * 1.6)) + 1)} lines into the text (::first-letter, float: left)` : ''}${p.wrap ? `; ${p.wrap.name ? `the ${p.wrap.name} (${p.wrap.w}x${p.wrap.h})` : `a ${p.wrap.w}x${p.wrap.h} block`} sits INSIDE this text at its top ${p.wrap.side}, float: ${p.wrap.side}${p.wrap.round ? ', shape-outside: circle(50%)' : ''}, and the lines WRAP round it (shorter beside it), never running under or over it` : ''}`) : ''
    if (p.op < 98) paint.push(`${p.op}% opacity`)
    if (p.ra) paint.push('text right-aligned in its box (a line number in the gutter)')
    // n170: a text part padded in from its left (round 16 e3 diff rows: padding-left 52px past the gutter numbers, built
    // with the code starting over the numbers)
    if (p.t && p.padL >= 8 && !p.ra) {
      const gut = P.some((q) => q.ra && q.t && q.x >= p.x - 1 && q.x < p.x + p.padL && Math.abs(q.y - p.y) <= 2)
      paint.push(`padding-left ${p.padL}px (its text starts at x ${p.x + p.padL}${gut ? ', AFTER the gutter number, never over it' : ''})`)
    }
    if (p.vert) paint.push(`VERTICAL text (writing-mode: vertical-rl${p.vert === 'up' ? '; transform: rotate(180deg), so it reads bottom to top' : ', reading top to bottom'}; NOT horizontal, the box is tall and narrow)`)
    if (p.clip) paint.push(`a line ${p.w}px long inside a ${p.clip.w}px tile that CLIPS it (the tile has overflow: hidden and white-space: nowrap): only its first ${p.clip.shown}px show, cut off at the tile's edge, never spilling past the tile`)
    if (p.anim) { kfs.add(p.anim.kf); paint.push(`animated: animation ${p.anim.name} ${p.anim.dur} ${p.anim.timing}${p.anim.iter === 'infinite' ? ' infinite' : ''}${p.anim.delay && p.anim.delay !== '0s' ? ` delay ${p.anim.delay}` : ''}${/scale|rotate/.test(p.anim.kf ?? '') && p.anim.origin ? `, transform-origin ${p.anim.origin}` : ''}`) }
    return `${p.w}x${p.h} at ${p.x},${p.y}${paint.length ? ` ${paint.join(', ')}` : ''}${text ? `${paint.length ? ':' : ''} ${text}` : ''}`
  }
  const kfs = new Set()
  const listed = [...P].sort((a, b) => a.y - b.y || a.x - b.x).map(one).join('; ')
  const keys = [...kfs].filter(Boolean)
  return `part by part (page px: size, then top-left x,y; each part its own real element with live text, all ${P.length} of them, nothing invented, nothing left out${P.some((p) => p.t && p.px && p.h < p.px * 2.2 && !(p.px >= 20 && p.nl >= 2)) ? '; every one-line text part stays on ONE line (white-space nowrap): a word and the count after it never wrap apart, and its width is a minimum (min-width, NOT a fixed width that would push the count onto a second line)' : ''}): ${listed}${keys.length ? `; the animations, defined exactly as: ${keys.join(' ')}` : ''}`
}
// n149: a spreadsheet grid said cell by cell
function sheetNote(G) {
  const base = G.ink
  const one = (c, j) => {
    const L = G.letters[j]
    if (!c.t && !c.fill && !c.ol) return null
    const bits = []
    if (c.bold) bits.push('bold')
    if (c.ink && base && dist(c.ink, base) > 30) bits.push(hexOf(c.ink))
    if (c.right) bits.push('right-aligned')
    if (c.fill) bits.push(`${hexOf(c.fill)} fill`)
    if (c.ol) bits.push(`ACTIVE CELL: ${c.ol.w}px ${hexOf(c.ol.c)} outline drawn inside the cell`)
    return `${L} ${c.t ? quote(c.t, 24) : '(no words)'}${bits.length ? ` (${bits.join(', ')})` : ''}`
  }
  const rows = G.body.map((r, i) => { const cs = r.map(one).filter(Boolean); return cs.length ? `row ${i + 1}: ${cs.join(' | ')}` : null })
  const empty = G.body.map((r, i) => r.every((c) => !c.t && !c.fill && !c.ol) ? i + 1 : null).filter(Boolean)
  const litW = G.lit.map((l) => `"${G.letters[l.i]}" is the active column: its header cell ${hexOf(l.fill)} fill${l.ink ? `, ${hexOf(l.ink)}` : ''}${l.bold ? ' bold' : ''} letter`).join('; ')
  return `a SPREADSHEET GRID (NOT a plain table, NOT a list: a real <table> with every cell built and visible grid lines) ${G.w}x${G.h}px at ${G.x},${G.y}: border-collapse, every cell bordered 1px ${hexOf(G.line)}, every row exactly ${G.rowH}px tall; a ${G.gutter}px row-number column on the left, then ${G.letters.length} equal columns about ${G.colW}px wide; the top header row has the column letters ${G.letters.map((t) => quote(t, 2)).join(' ')} centred, ${G.headPx}px ${hexOf(G.headInk)} regular on ${hexOf(G.headFill)}${litW ? `; ${litW}` : ''}; the header row's left cell is EMPTY (no number); the left column has the row numbers 1 to ${G.body.length} centred, number 1 on the FIRST row UNDER the header row (the header row of letters + ${G.body.length} numbered rows = ${G.body.length + 1} rows in all), ${G.headPx}px ${hexOf(G.headInk)} on ${hexOf(G.numFill ?? G.headFill)}; cell text ${G.px}px ${hexOf(base)} with 8px padding, numbers right-aligned. Filled cells by row (column letter, words, look; any cell not listed is empty white): ${rows.filter(Boolean).join('; ')}${empty.length ? `; rows ${empty.join(', ')} are empty (cells drawn, nothing in them)` : ''}`
}
function decide(f, page, marked, said = new Set()) {
  const SG = f.sheetGrid
  if (SG) return { kind: 'box', note: sheetNote(SG) }
  // n152: a grid of call tiles said tile by tile (round 13 e4: one filled button and a list were built)
  const VT = f.callTiles
  if (VT) {
    const where = (p) => p.round ? (p.r <= p.x ? `top-right corner (${p.r}px from the right, ${p.y}px from the top)` : `top-left corner (${p.x}px in, ${p.y}px down)`) : p.bt <= p.y ? `bottom-left corner (${p.x}px in, ${p.bt}px up from the bottom)` : `top-left corner (${p.x}px in, ${p.y}px down)`
    const part = (p) => p.round ? `a ${p.w}px round ${hexOf(p.fill)} badge "${p.t}" in its ${where(p)}` : `a name tag ${quote(p.t, 24)} in its ${where(p)}${p.fill.a > 0.05 ? ` (${p.fill.a < 0.95 ? `translucent black ${Math.round(p.fill.a * 100)}%` : hexOf(p.fill)} fill, ${p.rad}px rounded, small padding)` : ''}`
    const one = (t, i) => `tile ${i + 1} (row ${Math.floor(i / VT.cols) + 1}, column ${(i % VT.cols) + 1}): ${hexOf(t.fill)} fill, a ${t.disc.px}px ${hexOf(t.disc.fill)} circle centred in it with ${t.disc.bold ? 'bold ' : ''}${t.disc.size}px ${hexOf(t.disc.ink)} "${t.disc.t}"${t.parts.map((p) => `, ${part(p)}`).join('')}${t.ring ? `, a ${t.ring.w}px ${hexOf(t.ring.c)} outline drawn INSIDE its edge (the speaker)` : ''}`
    return { kind: 'box', note: `a ${VT.cols}x${VT.rows} GRID of ${VT.tiles.length} big video tiles (display grid, ${VT.cols} equal columns, ${VT.rows} equal rows, ${VT.gap}px gaps; NOT a button, NOT a list), filling ${VT.w}x${VT.h}px at ${VT.x},${VT.y}; each tile ${VT.tw}x${VT.th}px, ${VT.radius}px rounded, its own fill, nothing else in it; tile by tile: ${VT.tiles.map(one).join('; ')}` }
  }
  // n144: a code view said line by line (round 11 e1: tokens placed one by one at their own x,y collided)
  const CL = f.codeLines
  if (CL) {
    const fillW = visible(f.bg) ? `${hexOf(f.bg)} fill` : 'no fill of its own'
    const one = (l) => `${l.n} \`${l.text}\`${l.runs.length ? ` [${l.runs.map((r) => `${JSON.stringify(r.t)} ${hexOf(r.c)}`).join(', ')}]` : ''}${l.fill ? ` (this whole row has a ${hexOf(l.fill)} highlight fill, edge to edge)` : ''}`
    return { kind: 'box', note: `a CODE VIEW ${CL.w}x${CL.h}px at ${CL.x},${CL.y}, ${fillW}: ${CL.lines.length} lines of code, the first ${CL.top}px below its top, each line ONE row exactly ${CL.rowH}px tall (rows stacked, never overlapping), ${CL.px}px monospace, ${hexOf(CL.base)} text; each row starts with its line number in a ${CL.gutter}px gutter (${hexOf(CL.numInk)}${CL.numAlign === 'right' || CL.numAlign === 'end' ? ', right-aligned' : ''}), then the line's code written as ONE run of text in order, leading spaces kept as indentation (white-space: pre), with the listed words wrapped in spans of their own colour IN PLACE inside the line (NOT placed separately, NOT absolutely positioned). Lines (number, the code between backticks, [coloured words]): ${CL.lines.map(one).join('; ')}` }
  }
  const r15 = round15Note(f)
  if (r15) return r15
  const r11 = round11Note(f)
  if (r11) return round11Extra(f, r11)
  const r10 = round10Note(f)
  if (r10) return round11Extra(f, r10)
  const rest = decideRest(f, page, marked, said)
  if (rest?.kind === 'image') { const tb = tiltBlock(f); if (tb) return tb }
  return boxedLine(f, round11Extra(f, round10Extra(f, rest)))
}
// n158: a line of text set inside its own bordered box (round 15 c2 caption: said as 'serif "..."', built borderless)
function boxedLine(f, d) {
  if (!d || !/^(heading|text)$/.test(d.kind ?? '') || /border|outline|boxed|box around|band|block filled/i.test(d.note ?? '')) return d
  const B = f.border
  if (!(B.w >= 1 && B.bottom >= 1 && B.left >= 1 && visible(B.colour)) || f.text.length < 12 || f.rect.w < 120 || f.kidCount > 1) return d
  const px = !/\d+px type|\d+px "/.test(d.note ?? '') && f.font?.size ? `, ${Math.round(f.font.size)}px type${f.font.size >= 24 ? ' (large, not body size)' : ''}` : ''
  return { ...d, note: `${d.note ?? ''}${px}; set INSIDE its own ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px box at ${Math.round(f.rect.x)},${Math.round(f.rect.y)} with a ${Math.round(B.w)}px ${hexOf(B.colour)} border on all four sides${visible(f.bg) ? `, ${hexOf(f.bg)} fill` : ''} (keep the border)`.replace(/^; /, '') }
}
// n158: round 15 creative parts said as what they are
function round15Note(f) {
  const D = f.discs
  if (D) {
    const bl = D.find((q) => q.blend && q.blend !== 'normal')?.blend
    return { kind: 'box', note: `${D.length} big FILLED CIRCLES overlapping (NOT outlines, NOT a box, NOT a picture), each its own absolutely placed div with border-radius 50%${bl ? ` and mix-blend-mode: ${bl} (where they overlap the colours mix darker, like overprinted inks)` : ''}, crisp hard edges (no shadow, no blur, no glow round them), behind the words: ${D.map((q, i) => `circle ${i + 1}: ${q.d}px across, ${hexOf(q.fill)} solid fill, its box's top-left at ${q.x},${q.y}${q.op < 0.95 ? `, ${Math.round(q.op * 100)}% opacity` : ''}`).join('; ')}` }
  }
  const O = f.overprint
  if (O) {
    const lay = O.layers.map((l, i) => `copy ${i + 1}: ${hexOf(l.c)} text, its box's top-left at ${l.x},${l.y} (position absolute; the glyphs' ink spans ${l.ink.x}-${l.ink.x + l.ink.w} across)`).join('; ')
    return { kind: 'heading', note: `${O.t.includes('\n') ? `ONE GIANT ${O.t.split('\n').length}-LINE WORDMARK, ${O.t.split('\n').map((x) => `"${x}"`).join(' STACKED OVER ')} (${O.t.split('\n').length} lines, never one line),` : `ONE GIANT WORD ${quote(O.t)}`} PRINTED ${O.layers.length} TIMES, overlapping and slightly offset like a misregistered print (NOT links, NOT nav, NOT small): ${O.layers.length} separate absolutely placed divs, each the same ${O.px}px ${O.weight >= 800 ? 'heavy (font-weight 900)' : O.weight >= 600 ? 'bold' : 'regular'} ${O.t.includes('\n') ? 'wordmark' : quote(O.t)}${O.t.includes('\n') ? ` set as ${O.t.split('\n').length} stacked lines (${O.t.split('\n').map((x) => `"${x}"`).join(' over ')}, a <br> between them, in EVERY copy; the lines sit tight together, never spread apart down the page; each copy's box exactly width: ${Math.round(Math.max(...O.layers.map((l) => l.ink.w)) * 1.1)}px, just wider than its widest line, so "${O.t.split('\n')[0]}" and "${O.t.split('\n')[1]}" can NEVER sit side by side on one line; ${O.t.split('\n').length} lines tall, about ${Math.max(...O.layers.map((l) => l.ink.h))}px top to bottom)` : ''} (line-height ${/px/.test(O.lh) ? `${Math.round(parseFloat(O.lh))}px, i.e. ${Math.round(parseFloat(O.lh) / O.px * 100) / 100}` : '1'}${O.ls ? `, letter-spacing ${Math.round(O.ls)}px` : ''}), each with mix-blend-mode: ${O.blend} so where they overlap the inks darken into each other; ${lay}; together they fill about ${Math.max(...O.layers.map((l) => l.ink.x + l.ink.w)) - Math.min(...O.layers.map((l) => l.ink.x))}x${Math.max(...O.layers.map((l) => l.ink.y + l.ink.h)) - Math.min(...O.layers.map((l) => l.ink.y))}px of the page's left side` }
  }
  const T = f.textRings
  if (T && T.rings.length >= 2) {
    const one = (g, i) => `ring ${i + 1}: an SVG <text> on a <textPath> following a circle path of radius ${g.radius}px centred at page ${g.cx},${g.cy} (path d="M cx,cy-${g.radius} a ${g.radius},${g.radius} 0 1,1 -0.1,0"), starting at the ${g.start} and running ${g.clockwise ? 'clockwise' : 'anticlockwise'}, ${g.px}px ${g.weight >= 600 ? 'bold ' : ''}${hexOf(g.fill)}${g.op < 0.95 ? ` at ${Math.round(g.op * 100)}% opacity` : ''}${g.ls ? ` letter-spacing ${Math.round(g.ls)}px` : ''} capitals: ${quote(g.text, 90)}`
    return { kind: 'box', note: `${T.rings.length} RINGS OF TEXT running round in circles (words set along circular paths, NOT shapes, NOT a box, no fill, no border): one ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px <svg> at ${Math.round(f.rect.x)},${Math.round(f.rect.y)} (viewBox 0 0 ${Math.round(f.rect.w)} ${Math.round(f.rect.h)}), transparent, on top of what is under it${T.spin ? `, the whole svg slowly spinning (CSS animation: rotate 0 to 360deg, ${T.spin.dur} ${T.spin.timing}, infinite)` : ''}; ${T.rings.map(one).join('; ')}` }
  }
  // repeating radial rings (round 15 c5 contour map: said as 'a soft #000 to #9fd356 gradient product backdrop')
  if (/^repeating-radial-gradient/.test(f.bgImage ?? '') && !(f.text ?? '').trim() && f.rect.w >= 120 && f.rect.h >= 120) {
    const R = f.rect
    return { kind: 'box', note: `a ${Math.round(R.w)}x${Math.round(R.h)}px block at ${Math.round(R.x)},${Math.round(R.y)} drawn as a CONTOUR MAP: many thin concentric ${colourName(parse((f.bgImage.match(/rgba?\([^)]+\)/g) || []).map(parse).find((c) => c && c.a > 0.3) ? f.bgImage.match(/rgba?\([^)]+\)/g).find((m) => parse(m).a > 0.3) : 'rgb(0,0,0)'))} ring lines on a see-through ground, rings spreading out to the edges and cut off by them (NOT a smooth gradient, NOT a photo, NOT a backdrop, no picture); exactly: background: ${cssHex(f.bgImage)}${f.opacity < 0.95 ? `; opacity ${f.opacity}` : ''}${f.radius >= 2 ? `; border-radius ${Math.round(f.radius)}px` : ''}; nothing else in it` }
  }
  const X = f.crosshair
  if (X) return { kind: 'circle', note: `a ${X.w}px printer's REGISTRATION MARK at ${Math.round(f.rect.x)},${Math.round(f.rect.y)} (NOT an input, NOT a button, no text): an empty circle with a ${X.bw}px ${hexOf(X.bc)} outline, crossed by a ${X.line}px ${hexOf(X.bc)} vertical and a ${X.line}px horizontal line through its centre (a crosshair in a ring)` }
  return null
}
// n141: rgba() written out as hex (or transparent) in CSS said verbatim
const cssHex = (s) => (s ?? '').replace(/rgba?\([^)]+\)/g, (m) => { const c = parse(m); return !c || c.a < 0.05 ? 'transparent' : `${hexOf(c)}${c.a < 0.95 ? ` at ${Math.round(c.a * 100)}%` : ''}` }).replace(/(#[0-9a-f]{6}) at (\d+)%/g, (m, h, a) => `${h}${Math.round(+a * 2.55).toString(16).padStart(2, '0')}`)
  // n146: a wordless solid block tilted on the page (round 12 c2 blue bar: said as a picture, built see-through, too
  // thick and with invented words on it)
function tiltBlock(f) {
  if (!f.text && !f.kidCount && !f.regionKids.length && visible(f.bg) && f.bg.a > 0.95 && !/gradient|url/.test(f.bgImage ?? '') && Math.abs(f.rotate) >= 2 && Math.abs(f.rotate) <= 45 && f.layoutBox?.w && f.el?.x != null) {
    const L = f.layoutBox, E = f.el
    return { kind: 'box', note: `ONE plain solid block, NOT a picture: ${L.w}x${L.h}px (only ${L.h}px thick) with its top-left at ${E.x},${E.y} before the turn${E.x < 0 ? ` (it starts ${-E.x}px past the left page edge)` : ''}, filled flat ${colourName(f.bg)} ${hexOf(f.bg)}, fully opaque, then turned by transform: rotate(${f.rotate}deg) round its centre; no text on it, no border, no shadow` }
  }
  return null
}
/** n141: round 11 objects said as the CSS that makes them: a preserve-3d cube, a 3D-tilted layered floor, a masked block. */
// n172: odd-coloured bars grouped into runs of neighbours in one colour ([first, last, colour])
function oddRuns(o) {
  const out = []
  for (const [i, c] of o) { const L = out[out.length - 1]; if (L && L[1] === i - 1 && hexOf(L[2]) === hexOf(c)) L[1] = i; else out.push([i, i, c]) }
  return out
}
function round11Note(f) {
  const I = f.iso
  if (I) {
    const grid = /gradient/.test(I.img) ? `; its background is exactly: background: ${cssHex(I.img)}; background-size: ${I.size} (a grid of lines both ways)` : ''
    return { kind: 'box', note: `an ISOMETRIC CITY in real CSS 3D, NOT a flat polygon, NOT a drawing or SVG: ONE ${I.w}x${I.h}px plane div with its top-left at ${I.x},${I.y} (position absolute), filled ${hexOf(I.fill)}${I.outline ? `, outline ${I.outline.w}px solid ${hexOf(I.outline.c)}` : ''}${grid}; transform: ${I.turn}; transform-style: preserve-3d${I.persp ? `; perspective ${I.persp} on its parent` : '; no perspective'}. Inside the plane exactly ${I.towers.length} towers, each a div absolutely placed in plane px (left, top, width, height) with transform-style: preserve-3d, holding ONE child div (position absolute, inset 0) lifted off the plane by transform: translateZ(lift) and painted its own colour: ${I.towers.map((t) => `${t.w}x${t.h} at ${t.x},${t.y} lifted ${t.lift}px ${colourName(t.fill)} ${hexOf(t.fill)}`).join('; ')}` }
  }
  const AU = f.aurora
  if (AU) {
    const A = AU.anim
    return { kind: 'box', note: `a soft blurred colour glow, NOT a chart, NOT a ring, NOT a box: ONE ${AU.w}x${AU.h}px ${AU.round ? 'circle (border-radius 50%) ' : ''}div with its top-left at ${AU.x},${AU.y}${AU.y < 0 || AU.x < 0 ? ' (it runs off the page edge, cut by the page)' : ''}, behind everything, background: ${cssHex(AU.img)} exactly, filter: blur(${AU.blur}px)${AU.op < 0.98 ? `, opacity ${AU.op}` : ''}${A ? `, turning forever: animation ${A.dur} ${A.fn} infinite with @keyframes ${A.frames}` : ''}; it reads as a wide soft multicolour haze` }
  }
  const G = f.glass
  if (G) {
    const one = (q, i) => `card ${i + 1}: ${q.w}x${q.h}px at ${q.x},${q.y}${q.tf ? ` in the same row as the others, then raised ${q.lift}px by transform: ${q.tf} (so its top ends at ${q.y - q.lift}; raise it once only)` : ''}, holding a ${q.npx}px ${q.nw <= 300 ? 'thin ' : q.nw >= 700 ? 'heavy ' : ''}${hexOf(q.nc)} "${q.n}" over ${q.lpx}px ${hexOf(q.lc)} "${q.l}"`
    const q = G[0]
    return { kind: 'box', note: `${G.length} SEPARATE frosted glass cards side by side (NOT plain stats on the page): each ${q.rad}px rounded, ${q.pad}px padding, see-through fill ${cssHex(`rgba(${q.fill.r}, ${q.fill.g}, ${q.fill.b}, ${q.fill.a})`)}, a ${q.bw}px ${cssHex(`rgba(${q.bc.r}, ${q.bc.g}, ${q.bc.b}, ${q.bc.a})`)} border, backdrop-filter: ${q.blur}; ${G.map(one).join('; ')}` }
  }
  const IB = f.isoBlocks
  if (IB) {
    const flat = (q) => `${q.w}x${q.h}px at ${q.x},${q.y} filled ${hexOf(q.fill)}${/gradient/.test(q.img ?? '') ? ` with background-image: ${cssHex(q.img)}; background-size: ${q.size} (thin grid lines both ways)` : ''}${q.shadow && q.shadow !== 'none' ? `, box-shadow: ${cssHex(q.shadow)} (a solid rim round it)` : ''}`
    const lift = (b) => Math.max(0, ...b.faces.map((q) => +((q.tf ?? '').match(/translateZ\((-?[\d.]+)px\)/)?.[1] ?? 0)))
    const face = (q, b) => `${q.w}x${q.h}px at ${q.x},${q.y} in the block, ${hexOf(q.fill)}, transform-origin: ${q.origin}, transform: ${q.tf ?? 'none'}`
    return { kind: 'box', note: `an ISOMETRIC CITY of solid 3D blocks in real CSS 3D (each block shows a lit top and two darker sides), NOT a flat drawing, NOT an SVG, NOT empty: ONE ${IB.w}x${IB.h}px plane div with its top-left at ${IB.x},${IB.y} (position absolute), transform: ${IB.turn}; transform-style: preserve-3d${IB.persp ? `; perspective ${IB.persp} on its parent` : '; NO perspective anywhere (flat isometric, parallel edges)'}. Inside the plane, all absolutely placed in plane px (left, top, width, height): first the flat ground layers in this order: ${IB.flat.map(flat).join('; ')}. Then exactly ${IB.blocks.length} blocks, each a div at its own left/top in the plane with transform-style: preserve-3d and NO fill of its own, holding ${IB.blocks[0].faces.length} absolutely placed face divs (backface visible) that build the box: ${IB.blocks.map((b, i) => `block ${i + 1} (${b.w}x${b.h}px footprint at ${b.x},${b.y}, standing ${lift(b)}px tall): ${b.faces.map((q) => face(q, b)).join('; ')}`).join('. ')}` }
  }
  const C = f.cube
  if (C) {
    const A = C.anim
    // n155: a ring of cards (5+ faces turned round Y, all pushed out by one translateZ) is said as a ring, its front
    // face named, the group's own box and place, each face's rounding/padding/sub-line, and the faces' mask verbatim
    const ringZ = C.faces.length >= 5 && C.faces.every((q) => /rotateY\(/.test(q.tf ?? '') && /translateZ\(/.test(q.tf ?? ''))
    const front = ringZ ? C.faces.find((q) => /rotateY\((0|0deg)\)/.test(q.tf)) : null
    const lines = (q) => q.sub ? `two live text lines: ${q.px}px ${q.weight >= 700 ? 'heavy ' : ''}"${q.t.split('\n')[0]}" then below it ${q.sub.px}px ${q.sub.weight >= 700 ? 'bold' : 'regular'}${q.sub.op < 0.98 ? ` ${q.sub.op} opacity` : ''} "${q.sub.t}"` : `${q.px}px ${q.weight >= 700 ? 'heavy ' : ''}live text "${q.t}"`
    const face = (q) => `${q.w}x${q.h}px ${hexOf(q.fill)} face, transform: ${q.tf ?? 'none'}${q.t ? `, holding ${q.centred ? 'centred' : `top-left (${q.pad}px padding, left-aligned)`} ${hexOf(q.ink)} ${lines(q)}` : ''}`
    const G = C.group
    const grp = G ? `ONE ${G.w}x${G.h}px group div at ${G.x},${G.y} inside the scene (position absolute, left ${G.x}px, top ${G.y}px, i.e. page ${C.x + G.x},${C.y + G.y}; NOT inset 0, NOT at the scene's left edge), transform-style: preserve-3d, transform: ${C.turn ?? 'none'}` : `ONE group div (position absolute, inset 0, transform-style: preserve-3d, transform: ${C.turn ?? 'none'}`
    const q0 = C.faces[0]
    const look = [q0.bw ? `a ${q0.bw}px ${hexOf(q0.bc)} border` : 'no border', q0.rad ? `${q0.rad}px rounded corners` : null, 'backface visible'].filter(Boolean).join(', ')
    const mk = q0.mask && C.faces.every((q) => q.mask && q.mask.img === q0.mask.img) ? `; EVERY face is cut by the same mask (notches bitten out of both side edges, like a ticket stub), written exactly: -webkit-mask: ${cssHex(q0.mask.img).split(/,\s*(?=radial|linear|conic|repeating)/).map((l, i) => `${l} ${(q0.mask.pos ?? '').split(',')[i]?.trim() ?? ''}/${(q0.mask.size ?? '').split(',')[i]?.trim() ?? ''} ${(q0.mask.rep ?? '').split(',')[i]?.trim() ?? ''}`.replace(/\s+/g, ' ').trim()).join(', ')}` : ''
    const what = ringZ ? `a REAL CSS 3D RING (carousel) of ${C.faces.length} cards, NOT flat or projected rectangles, NOT a drawing or SVG` : 'a REAL CSS 3D cube, NOT flat or projected rectangles, NOT a drawing or SVG'
    const fr = front ? `; the ${hexOf(front.fill)} "${front.t.split('\n')[0]}" card (rotateY(0)) faces the viewer, centred in front at the middle of the scene, the others turned away round it (do NOT turn the group to another card)` : ''
    return { kind: 'box', note: `${what}: a ${C.w}x${C.h}px scene at ${C.x},${C.y} with perspective: ${C.persp ?? '900px'}; inside it ${grp}${A ? `, turning forever: animation ${A.dur} ${A.fn} infinite with @keyframes ${A.frames}` : ''}${G ? '' : ')'} holding exactly ${C.faces.length} face divs, each absolutely placed at the group's top-left (left 0, top 0, the group's own size) with ${look}${mk}: ${C.faces.map(face).join('; ')}${fr}` }
  }
  const T = f.tilt3d
  // n172: or a grid tiled by background-size (round 17 c3 synth floor: linear-gradient lines at 80px tiles, said as a
  // 20061x2264px product-photo backdrop from its projected box, built as a plain dark floor)
  const tiled = T && /linear-gradient/.test(T.bg) && /\d+px/.test(T.size ?? '') && !/repeating/.test(T.bg)
  if (T && /perspective\(/.test(T.tf) && (/repeating-linear-gradient/.test(T.bg) || tiled)) {
    const layers = (T.bg.match(/gradient\(/g) || []).length
    const A = T.anim
    return { kind: 'box', note: `a PERSPECTIVE GRID FLOOR: one ${T.w}x${T.h}px div (its UNTRANSFORMED size) with its top-left at ${T.x},${T.y}${T.x < 0 || T.x + T.w > 1280 ? ' (it runs off both page edges)' : ''}, tilted back in 3D (transform: ${T.tf}${T.origin ? `; transform-origin: ${T.origin}` : ''}), so its lines run off toward a far horizon, behind the other parts; its background is exactly these ${layers} layer${layers > 1 ? 's, ALL of them (a grid of lines both ways, NOT stripes one way)' : ''}: background-image: ${cssHex(T.bg)}${tiled ? `; background-size: ${T.size} (each layer TILES, repeating: thin lines every tile)` : ''}; no fill of its own (the page shows between the lines)${A ? `; it scrolls toward the viewer forever: animation ${A.dur} ${A.fn} infinite with @keyframes ${A.frames}` : ''}; NOT a plain dark floor, NOT a picture` }
  }
  const M = f.mask
  if (M && !f.clipText && !f.text && /radial-gradient/.test(M.img) && f.rect.w * f.rect.h < 0.3 * 1280 * 900) {
    // n163: a small background tile is a dot screen (round 16 c1 halftone: built as one solid disc)
    const tileM = (f.bgSize ?? '').match(/^([\d.]+)px/)
    const fillW = /gradient/.test(f.bgImage) ? `filled with background: ${cssHex(f.bgImage)}${tileM && +tileM[1] <= 60 ? `; background-size: ${f.bgSize} (it REPEATS: a fine HALFTONE grid of small dots every ${Math.round(+tileM[1])}px, NOT one solid disc)` : ''}` : visible(f.bg) ? `filled ${hexOf(f.bg)}` : 'no fill'
    const arch = f.radius > 0 && f.radiusBottom < f.radius / 2
    return { kind: 'box', note: `a ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px block at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}${arch ? `, an ARCH: border-radius ${M.radius} (round top, nearly square bottom; NOT a circle)` : f.radius ? `, border-radius ${M.radius}` : ''}, ${fillW}; its edges fade out softly under a mask (mask-image: ${cssHex(M.img)}; -webkit-mask-image the same), NOT a picture placeholder` }
  }
  return null
}
/** n141: words a note gains: heading words in their own colour, stat cells, a paragraph with its button. */
function round11Extra(f, d) {
  if (!d) return d
  let note = d.note ?? ''
  const O = f.oddWords
  const faceSay = (w) => w.face ? `${w.face.italic ? 'italic ' : ''}${/georgia|serif/i.test(w.face.family) && !/sans-serif/i.test(w.face.family) ? `serif (font-family ${w.face.family.replace(/"/g, '')}) ` : ''}${w.face.weight <= 300 ? 'thin ' : w.face.weight >= 700 ? 'bold ' : 'regular-weight '}` : ''
  const OC = O?.filter((w) => !w.face || Math.hypot(w.c.r - f.colour.r, w.c.g - f.colour.g, w.c.b - f.colour.b) > 60)
  const OF = O?.filter((w) => w.face)
  if (OC?.length && d.kind === 'heading' && !OC.every((w) => note.includes(hexOf(w.c)))) note += `${note ? '; ' : ''}${OC.map((w) => `the word "${w.t}" is ${faceSay(w)}${colourName(w.c)} ${hexOf(w.c)}`).join(', ')} (its own colour; the other words stay ${hexOf(f.colour)})`
  if (OF?.length && d.kind === 'heading' && !OC?.some((w) => w.face)) note += `${note ? '; ' : ''}${OF.map((w) => `the word "${w.t}" is set in its own face, a span in place inside the line: ${faceSay(w).trim()}`).join(', ')} (the other words keep the heading's face)`
  const S = f.stats
  if (S && (!note || /stat cards|""/.test(note))) {
    const card = visible(f.bg) ? `a ${hexOf(f.bg)} card ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}${f.radius ? `, ${Math.round(f.radius)}px rounded` : ''}${f.shadow && f.shadow !== 'none' ? ', a big soft shadow' : ''}, ` : ''
    note = `${card}${S.length} stats side by side in it (NOT separate cards), each a big number over a small label: ${S.map((q) => `${q.npx}px ${q.nw >= 700 ? 'heavy ' : ''}${hexOf(q.nc)} "${q.n}" over ${q.lpx}px ${hexOf(q.lc)} "${q.l}"`).join('; ')}`
  }
  // n146: a button whose ring is a gradient (padding-box fill over a border-box gradient; round 12 c3 CTA built as a
  // gradient fill)
  const GR = [...(f.bgImage ?? '').matchAll(/(?:linear|radial|conic)-gradient\((?:[^()]|\([^)]*\))*\)/g)].map((m) => m[0])
  if (d.kind === 'button' && GR.length === 2 && f.border?.w >= 1 && !visible(f.border.colour)) {
    note = `${quote(f.text)} ${f.radius >= f.rect.h / 2 - 2 ? 'pill ' : ''}button ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px whose ${Math.round(f.border.w)}px BORDER is a gradient and whose inside is plain (NOT a gradient fill): border: ${Math.round(f.border.w)}px solid transparent; background: ${cssHex(GR[0])} padding-box, ${cssHex(GR[1])} border-box; ${hexOf(f.colour)} ${f.font.weight >= 600 ? 'bold ' : ''}text`
  }
  const IM = f.inlineMark
  if (IM && !note) { const face = faceName(IM.family); note = `${IM.w}px wide at ${IM.x},${IM.y}: ONE paragraph of ${IM.px}px ${face ? `${face} ` : ''}text${IM.lh ? `, line-height ${IM.lh}px` : ''}, exactly "${IM.full}" (this copy only, nothing invented, no gap in the sentence); the words "${IM.t}" are HIGHLIGHTED IN PLACE inside the sentence, where they fall in the line: an inline <span> with a ${hexOf(IM.fill)} background${IM.pad ? `, padding 0 ${IM.pad}px` : ''}, same size, weight and face as the rest (NOT a button, NOT a separate block, NOT on its own line, nothing laid over the text)` }
  const LL = f.lineList
  if (LL && !note) note = `a ${LL.w}x${LL.h}px column at ${LL.x},${LL.y}${LL.br ? `, a 1px ${hexOf(LL.br)} rule down its right edge` : ''}, ${LL.pad}px padding: ${LL.lines.length} SEPARATE lines stacked top to bottom (one per line, NOT run together on one line), ${LL.px}px text, line-height ${LL.lh}px, each line indented as shown: ${LL.lines.map((l) => `${l.indent ? `[indent ${l.indent * Math.round(LL.px * 0.3)}px] ` : ''}${l.t.startsWith('**') ? `bold "${l.t.replace(/\*\*/g, '')}"` : `"${l.t}"`}${l.sel ? ` (this line ${LL.bold ? 'bold, ' : ''}on a ${hexOf(LL.fill)} ${LL.rad}px rounded highlight spanning the column width: the selected item)` : ''}`).join(', ')}`
  const B = f.copyBtn
  if (B && !note) note += `${note ? '; ' : ''}${Math.round(f.rect.w)}px wide at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}: ${B.px}px text exactly "${B.txt}" (this copy only, nothing invented), then under it a ${hexOf(B.fill)} ${B.rad >= B.h / 2 - 1 ? 'pill' : `${B.rad}px rounded`} button ${B.w}x${B.h}px at ${B.x},${B.y} with ${B.bpx}px ${B.bold ? 'bold ' : ''}${hexOf(B.ink)} "${B.t}"`
  return note === (d.note ?? '') ? d : { ...d, kind: d.kind ?? 'text', note }
}
function decideRest(f, page, marked, said) {
  // n133: a two-ended row under a top rule only, said as itself (round 9 c5 byline built as a bordered box)
  if (f.topRule && f.spreadEnds && (f.kidTexts.length === 2 || f.kidTexts.length === 3) && f.kidTexts.length === f.kidCount && !(f.kidTexts.length === 3 && f.kidButtons) && f.rect.h <= 80 && !f.regionKids.length) {
    const k = f.kidBoxes?.[0], T = f.topRule
    const ST = (f.kidBoxes ?? []).filter((k) => k.stack)
    const stackNote = ST.length === f.kidTexts.length ? `; each item is stacked lines, not one line: ${ST.map((k) => k.stack.map((l) => `${l.px}px ${l.bold ? 'bold ' : ''}${l.sp ? 'widely spaced ' : ''}${hexOf(l.ink)} ${quote(l.t, 24)}`).join(' over ')).join('; ')}` : ''
    return { kind: 'box', note: `a row ${Math.round(f.rect.w)}px wide at ${Math.round(f.rect.x)},${Math.round(f.rect.y)} with ONLY a ${T.px}px ${hexOf(T.c)} rule along its TOP edge (NOT a box: no border on the other sides, no fill), the text ${T.pad}px under the rule; ${f.kidTexts.length === 3 ? 'three' : 'two'} separate items on one line pushed apart (justify-content: space-between, never run together as one line of text): ${Math.round(f.font.size)}px ${faceName(f.font.family)}${f.font.spacing >= 1.5 ? ' widely spaced' : ''} ${hexOf(f.colour)} ${quote(f.kidTexts[0], 30)} at the far left, ${f.kidTexts.length === 3 ? `${quote(f.kidTexts[1], 30)} in the middle, ` : ''}${quote(f.kidTexts[f.kidTexts.length - 1], 30)} at the far right${stackNote}` }
  }
  const d0 = decideOne(f, page, marked, said)
  const w0 = f.rect.w, h0 = f.rect.h
  const C = f.innerChip
  const d = C && d0?.note && !/chip/.test(d0.note) ? { ...d0, note: `${d0.note.replace(new RegExp(`\\s*["“]${C.t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["”]\\s*$`), '')}; ON it (inside the block, not under it) a small caption chip at ${C.x},${C.y} in the block: ${C.px}px ${C.sans ? 'sans-serif ' : ''}${C.spaced ? 'widely spaced ' : ''}${hexOf(C.ink)} ${quote(C.t, 40)} on a solid ${hexOf(C.fill)} ${C.w}x${C.h}px label` } : d0
  // n147: its own ink when it is far from the page's (round 12 c4: the page note says white text; the subcopy and the
  // nav's left word are near-black on the yellow panel and were built white), each word's when the row mixes inks
  if (d?.note && f.text && f.colour?.a > 0.5 && page.colour && !/part by part/.test(d.note)) {
    const kinks = (f.kidBoxes ?? []).filter((k) => k.ink?.a > 0.5)
    const mixed = kinks.length >= 2 && kinks.length <= 6 && kinks.every((k) => k.t.length <= 30) && kinks.some((k) => dist(k.ink, kinks[0].ink) > 60)
    if (mixed) d.note += `; each word in its own colour: ${kinks.map((k) => `${quote(k.t, 30)} ${hexOf(k.ink)}`).join(', ')}`
    else if (dist(f.colour, page.colour) > 60 && !d.note.includes(hexOf(f.colour)) && !['heading'].includes(d.kind)) d.note += `; its text ${hexOf(f.colour)} (${colourName(f.colour)}, NOT the page's ${colourName(page.colour)} text)`
  }
  // n177: a one-line lead text of 18px+ says its size in words (round 17 c5: the 22px intro built 12px twice; the drawn
  // squiggle height alone did not carry it)
  if (d?.note && d.kind === 'text' && f.textLines === 1 && f.font?.size >= 18 && !/\d+px/.test(d.note)) d.note += `; set at ${Math.round(f.font.size)}px (a large lead line, NOT small body text), about ${Math.round(w0)}px wide on one line`
  // n152: a bare table on the page says it has no card (round 13 e5 comparison table built inside a white card)
  if (d?.note && /^(?:".*" as a small bold heading, then a )?table, every body row/.test(d.note) && !visible(f.bg) && !(f.border.w >= 1 && visible(f.border.colour)) && !f.radius && w0 >= 600) {
    d.note += `; the table sits straight on the page, NOT in a card: no fill, no outer border, no rounded corners, no shadow, no padding around it; ${Math.round(w0)}px wide at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}`
  }
  // n147: a solid filled button says its exact fill, ink, size and corners (round 12 c4: a near-black square CTA on the
  // yellow panel, said 'button', was built as a pill in the page's colours)
  if (d?.kind === 'button' && d.note && f.bg?.a > 0.9 && !d.note.includes(hexOf(f.bg)) && f.text && f.text.length <= 32) {
    d.note += ` (exactly: ${hexOf(f.bg)} fill, ${hexOf(f.colour)} text, ${Math.round(w0)}x${Math.round(h0)}px, ${f.radius <= 1 ? 'square corners: border-radius 0, NOT a pill' : f.radius >= h0 / 2 - 2 ? 'pill ends' : `${Math.round(f.radius)}px rounded`})`
  }
  // n147: words inside a round sticker keep their line breaks (round 12 c4 'FREE COFFEE AFTER' built on one line)
  if (d?.kind === 'circle' && d.note && f.text && f.textLines >= 2 && !/lines/.test(d.note) && !f.circleText) {
    d.note += `, ${Math.round(f.layoutBox?.w ?? w0)}px across, the words centred in ${f.textLines} lines (wrapping inside the circle, ${Math.round(f.font.size)}px type)`
  }
  // n165: a worded circle filled with the page colour is a sticker that covers what is under it, not a hollow ring
  // (round 16 c3 'Est. 1962' badge: said 'outline circle', built hollow over the dark disc, its words lost)
  if (d?.kind === 'circle' && d.note && f.text && f.text.length <= 40 && visible(f.bg) && f.bg.a > 0.9 && !d.note.includes(`${hexOf(f.bg)} fill`) && page.bg && dist(f.bg, page.bg) < 12) {
    d.note += `; the circle is FILLED solid ${hexOf(f.bg)} (opaque, it covers whatever is under it, NOT hollow), its words ${f.font.style === 'italic' ? 'italic ' : ''}${f.font.weight >= 600 ? 'bold ' : ''}${Math.round(f.font.size)}px ${hexOf(f.colour)} in ${f.font.family.split(',')[0].replace(/["']/g, '')}, clearly readable, centred`
  }
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
  // n156: a radial gradient with a hard stop is a flat disc on a flat block (round 14 e3: 'warm paper to cream gradient',
  // the product disc lost)
  if (/^radial-gradient/.test(f.bgImage) && !f.clipText && (f.text ?? '').length <= 12 && !f.regionKids.length && w >= 120 && h >= 120) {
    const ps = [...f.bgImage.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => +m[1])
    if (ps.some((v, i) => i && v > ps[i - 1] && v - ps[i - 1] <= 2)) return { kind: 'box', note: `a ${Math.round(w)}x${Math.round(h)}px block${f.radius >= 2 ? `, ${Math.round(f.radius)}px rounded` : ''}, NOT a picture or photo: its background is exactly ${f.bgImage.replace(/rgb\((\d+), (\d+), (\d+)\)/g, (_, r, g, b) => hexOf({ r: +r, g: +g, b: +b, a: 1 }))} (a flat disc with a HARD edge on a flat field, not a soft fade)` }
  }
  // n168: a selection outline over grid cells, said with its exact box and the rows/columns it covers
  if (f.selBox) {
    const S = f.selBox
    return { kind: 'box', note: `a SELECTION OUTLINE over the grid (an empty absolutely-placed box drawn ON TOP of the cells, pointer-events none, NOT a cell border, NOT a table row): exactly ${S.w}x${S.h}px with its top-left at ${S.x},${S.y} (page px), a ${S.bw}px ${hexOf(S.bc)} border, no fill; it covers columns ${S.cols.join(' to ')} of rows ${S.rows[0]} to ${S.rows[1]} only (${S.nRows} rows, its bottom edge at y ${S.y + S.h}, NOT running further down)${S.handle ? `; a ${S.handle.px}x${S.handle.px}px ${hexOf(S.handle.fill)} square handle on its bottom-right corner, 1px white border` : ''}` }
  }
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
  // a 3D card stack: say every card, its turn, gradient, fade and what the front one holds
  if (f.cards3d) {
    const d = f.cards3d
    const grad = (c) => c.bg && /linear-gradient/.test(c.bg) ? `${c.bg.match(/linear-gradient\(\s*([\d.]+deg)/)?.[1] ?? ''} gradient ${[...c.bg.matchAll(/rgba?\([^)]+\)/g)].map((m) => hexOf(parse(m[0]))).join(' to ')}` : c.fill?.a > 0.05 ? `${hexOf(c.fill)} fill` : 'no fill'
    const part = (g) => g.t ? `bold ${g.px}px ${hexOf(g.ink)} ${quote(g.t, 24)} at ${g.x},${g.y} inside it` : g.fill?.a > 0.05 ? `a ${g.w}x${g.h}px ${g.round ? 'round ' : ''}${hexOf(g.fill)} ${g.round ? 'dot' : 'block'} at ${g.x},${g.y} inside it` : null
    const cards = d.cards.map((c, i) => `card ${i + 1}${i === 0 ? ' (back)' : i === d.cards.length - 1 ? ' (front)' : ''} at ${c.left},${c.top} in the box, ${grad(c)}${c.op < 100 ? `, ${c.op}% opacity` : ', fully opaque'}${c.border ? `, ${c.border.px}px ${hexOf(c.border.c)}${c.border.c.a < 1 ? ` at ${Math.round(c.border.c.a * 100)}%` : ''} border` : ''}${c.parts.map(part).filter(Boolean).map((x) => `, ${x}`).join('')}`).join('; ')
    const c0 = d.cards[0]
    return { kind: 'box', note: `a stack of ${d.cards.length} separate cards turned in 3D (NOT one picture, NOT flat): a ${d.box.w}x${d.box.h}px box at ${d.box.x},${d.box.y} with perspective: ${d.perspective}px, holding ${d.cards.length} absolutely placed cards each ${c0.w}x${c0.h}px, ${c0.radius}px rounded, each with transform: ${c0.transform} (turned away to the left, all the same turn)${c0.shadow ? `, a big soft dark drop shadow` : ''}; each card overlaps the one behind it, painted back to front: ${cards}` }
  }
  const withFx = (note) => { const t = uniq([...fx, note]).join(' ').trim(); return t || null }
  // n147: a leaf / teardrop: three corners fully round, one square (round 12 c5 said 'perfectly round disc')
  const rv = (f.radii ?? []).map((x) => parseFloat(x) || 0)
  if (!f.text && rv.length === 4 && rv.filter((x) => x === 0).length === 1 && rv.filter((x) => x > 0).every((x, i, a) => x === a[0]) && (f.radii.find((x) => parseFloat(x) > 0).includes('%') ? rv.find((x) => x > 0) >= 40 : rv.find((x) => x > 0) >= Math.min(w, h) * 0.4) && (fill || grad)) {
    const names = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
    return { kind: 'box', note: withFx(`a LEAF shape (NOT a circle): a ${Math.round(w)}x${Math.round(h)}px block at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, ${fill ? `flat ${hexOf(f.bg)} fill` : grad}, border-radius: ${f.radii.join(' ')} (three corners fully round, the ${names[rv.indexOf(0)]} corner a sharp square point), no border, no shadow`) }
  }
  // n147: a halftone screen: a tiny repeating dot layer over a gradient (round 12 c5 built a plain gradient)
  const tile = (f.bgSize ?? '').split(',')[0].trim().match(/^([\d.]+)px(?:\s+([\d.]+)px)?$/)
  if (!f.text && tile && +tile[1] <= 24 && /radial-gradient/.test(f.bgImage) && (f.bgImage.match(/gradient\(/g) ?? []).length >= 2 && w >= 120 && h >= 120) {
    const bg = f.bgImage.replace(/\s+/g, ' ')
    return { kind: 'box', note: withFx(`a HALFTONE print block (NOT a photo placeholder, NOT a plain gradient): a ${Math.round(w)}x${Math.round(h)}px block at ${Math.round(f.rect.x)},${Math.round(f.rect.y)} painted with exactly these background layers: background-image: ${bg}; background-size: ${f.bgSize}; (a fine grid of dark dots every ${tile[1]}px over the gradient)${f.radius ? `, ${Math.round(f.radius)}px rounded` : ', square corners'}`) }
  }
  if (f.bentoTile && !f.regionKids.length) {
    const B = f.bentoTile
    const txt = (k) => `${k.px}px ${k.bold ? 'bold ' : ''}${hexOf(k.ink)} ${quote(k.t, 60)} at ${k.x},${k.y} inside it`
    const parts = [
      `a ${B.w}x${B.h}px tile at ${B.x},${B.y} (absolutely placed), ${B.fill ? `${hexOf(B.fill)} fill` : 'no fill'}${B.border ? `, 1px ${hexOf(B.border)} border` : ''}${B.radius ? `, ${B.radius}px rounded corners` : ''}, overflow hidden; NOT a picture, NOT a photo placeholder`,
      B.poly ? `ONE corner cut off by clip-path: ${B.poly.replace(/\s+/g, ' ')} (only the corner where the polygon steps in is notched; the other corners stay as they are)` : null,
      B.big ? `a giant ${B.big.px}px ${B.big.bold ? 'black-weight ' : ''}word ${quote(B.big.t, 16)} at ${B.big.x},${B.big.y} inside it, its letters filled with a gradient (background: ${B.big.grad}; -webkit-background-clip: text; color: transparent)${B.big.spacing ? `, letter-spacing ${B.big.spacing}px` : ''}, left-aligned, NOT centred` : null,
      B.head ? `heading ${txt(B.head)}` : null,
      B.hole ? `a punched round HOLE through the tile: a ${B.hole.w}px circle at ${B.hole.x},${B.hole.y} inside it filled with the page colour ${hexOf(B.pageBg)} so the page shows through (no picture, no ring, nothing inside)` : null,
      B.rows ? `${B.rows.length} task rows ${B.rows.length >= 2 ? `${B.rows[1].y - B.rows[0].y}px apart, the first at ${B.rows[0].y}px from the tile top` : ''}, each a ${B.rows[0].px}x${B.rows[0].px}px ${B.rows[0].rad ? `${B.rows[0].rad}px rounded-square` : 'square'} solid coloured icon block (no picture, no glyph) at the left, the label beside it, ${B.rows[0].right?.bold ? 'a bold ' : 'a '}count at the far right: ${B.rows.map((r) => `${hexOf(r.icon)} icon ${quote(r.label, 30)}${r.right ? ` … ${quote(r.right.t, 14)}` : ''}`).join('; ')}` : null,
      ...B.others.map((k) => `${txt(k)}`),
    ].filter(Boolean)
    return { kind: 'box', note: withFx(parts.join('; ')) }
  }
  // frosted glass cards over blurred colour blobs: every blob and card with its place, then what each card holds
  if (f.glassStack) {
    const G = f.glassStack
    const a = (c) => (c.a < 1 ? `${hexOf(c)} at ${Math.round(c.a * 100)}%` : hexOf(c))
    const part = (p) => p.bars ? `a row of ${p.bars.length} ${p.w}px-wide ${a(p.fill)} bars (rounded tops) rising from one baseline, ${p.h}px tall area, heights ${p.bars.join('/')}% left to right`
      : p.track ? `a ${p.h}px rounded track ${a(p.track)} with a ${hexOf(p.fill)} fill ${p.pct}% across`
      : p.avatars ? `${p.avatars.length} overlapping ${p.px}px round avatars (${p.avatars.map(hexOf).join(', ')})${p.ring?.a > 0.5 ? ` with ${hexOf(p.ring)} rings` : ''}`
      : `${p.weight >= 600 ? 'bold ' : ''}${p.px}px ${hexOf(p.ink)} ${quote(p.t, 28)}`
    const blobs = G.blobs.map((b) => `a ${b.w}x${b.h}px round ${hexOf(b.c)} blob at ${b.x},${b.y}${b.op < 100 ? ` (${b.op}% opacity)` : ''}`).join('; ')
    const cards = G.cards.map((c, i) => `card ${i + 1} ${c.w}x${c.h}px at ${c.x},${c.y}${c.rot ? ` (left/top before its turn), transform: rotate(${c.rot}deg) (TILTED ${Math.abs(c.rot)}deg ${c.rot < 0 ? 'anticlockwise' : 'clockwise'}, NOT straight)` : ''}: ${c.parts.map(part).join(', then ')}`).join('; ')
    const c0 = G.cards[0]
    return { kind: 'box', note: `a layered glass stack, ${G.box.w}x${G.box.h}px at ${G.box.x},${G.box.y} (all absolutely placed, page px; NOT a list, NOT empty): ${G.blobs.length ? `first ${G.blobs.length} soft colour blobs behind everything, each blurred hard (filter: blur(${G.blobs[0].blur}px)): ${blobs}; then ` : ''}${G.cards.length} overlapping frosted glass cards over them, each ${c0.radius}px rounded, see-through fill ${a(c0.fill)}, ${c0.bw}px ${a(c0.border)} border, backdrop-filter: blur(${c0.blur}px)${c0.shadow ? ', a big soft dark drop shadow' : ''}, ${c0.pad}px padding, later cards painted over earlier ones: ${cards}` }
  }
  // n132: a bar across the top, every part with its own x (round 9 e1/e2: no note, built as an invented heading)
  if (f.topBar && !f.regionKids.length && f.weakNote) {
    const T = f.topBar
    const shape = (p) => (p.rad >= p.h / 2 - 1 ? 'pill' : p.rad ? `${p.rad}px-rounded box` : 'square box')
    const last = T.parts[T.parts.length - 1]
    const one = (p) => !p.t ? `a ${p.w}x${p.h}px ${p.rad ? `${p.rad}px-rounded ` : ''}solid ${hexOf(p.fill)} square icon (a plain block, no glyph, no picture) at x ${p.x}`
      : `${p.bold ? 'bold ' : p.px >= 18 ? 'regular-weight (NOT bold) ' : ''}${p.px}px ${hexOf(p.ink)} ${quote(p.t, 40)}${p.accent ? ` (its words ${quote(p.accent.t, 20)} in ${hexOf(p.accent.ink)}, the rest ${hexOf(p.ink)})` : ''}${p.fill ? ` on a ${hexOf(p.fill)} ${p.w}x${p.h}px ${shape(p)}` : p.border ? ` in a ${p.w}x${p.h}px ${shape(p)} with a ${p.border.px}px ${hexOf(p.border.c)} border, no fill` : ''}${p.inner ? ` (its parts spread inside it: ${p.inner.map((t) => quote(t, 20)).join(', ')})` : ''} ${stacked ? `at ${p.x},${p.y} (its top-left inside the bar)` : `at x ${p.x}`}${p === last && p.x + p.w >= f.rect.w - 60 && T.parts.length > 1 ? ' (pushed to the far right)' : ''}`
    // n169: parts on more than one line of the bar are placed by their own top too (round 16 e3: the pill and sub-line
    // built centred, over the tabs below the title)
    const stacked = T.parts.some((p) => T.parts.some((q) => q.y >= p.y + p.h - 2))
    const parts = stacked ? [...T.parts].sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x)) : T.parts
    return { kind: 'box', note: `a top bar ${T.h}px tall across the whole page at the very top, ${T.fill ? `${hexOf(T.fill)} fill` : 'no fill (page colour)'}${T.rule ? `, a ${T.rule.px}px ${hexOf(T.rule.c)} line under it` : ''}; only these parts in it, NO other heading or title invented: ${stacked ? 'on more than one line, each absolutely placed at its own top-left x,y inside the bar (NOT all centred on one line, NOT pushed down): ' : 'left to right, each at its own x from the bar\'s left, all vertically centred in the bar: '}${parts.map(one).join('; ')}` }
  }
  // n132: a plain table of same-column rows (round 9 e5 invoices: said as a 2-column list)
  if (f.rowTable && !f.regionKids.length && f.weakNote) {
    const R = f.rowTable, H = R.rows[0], base = R.rows[1].cells[0]
    const head = H.fill || H.cells.every((c) => c.t === c.t.toUpperCase()) ? H : null
    const cell = (c) => !c.t ? '·' : c.pill ? `${quote(c.t, 20)} as a small ${hexOf(c.pill.fill)} ${c.pill.rad >= 8 ? 'pill' : 'tag'} with ${c.bold ? 'bold ' : ''}${c.px}px ${hexOf(c.ink)} text` : `${quote(c.t, 24)}${dist(c.ink, base.ink) > 30 ? ` (${hexOf(c.ink)})` : ''}${c.bold && !base.bold ? ' bold' : ''}`
    const body = R.rows.slice(head ? 1 : 0)
    return { kind: 'box', note: `a plain table ${R.w}px wide at ${R.x},${R.y} (a real table, ${R.cols.length} columns, every column kept; NOT a list, NOT cards): columns start ${R.cols.join(', ')}px from its left; ${head ? `the header row ${head.h}px tall${head.fill ? `, ${hexOf(head.fill)} fill` : ''}, ${head.cells[0].px}px ${hexOf(head.cells[0].ink)} capitals${head.spaced ? ' with wide letter spacing' : ''}: ${head.cells.map((c) => (c.t ? quote(c.t, 16) : '·')).join(' | ')}; then ` : ''}${body.length} rows each ${body[0].h}px tall, ${base.px}px ${hexOf(base.ink)} text${body[0].rule ? `, a 1px ${hexOf(body[0].rule)} line across the top of each` : ''}; rows (| between cells): ${body.map((r) => r.cells.map(cell).join(' | ')).join(' / ')}` }
  }
  // n131: a spreadsheet grid cell by cell
  const rightColsOf = (G) => G.rows[0].map((_, j) => G.rows.slice(1).every((r) => r[j].right || !r[j].t) && G.rows.slice(1).some((r) => r[j].t)).map((v, j) => (v ? j : -1)).filter((j) => j >= 0)
  if (f.cellGrid && f.cellGrid.rows[0].every((c) => c.bold && c.t) && rightColsOf(f.cellGrid).length >= 2) {
    const G = f.cellGrid, H = G.rows[0][0]
    const plain = (c) => dist(c.ink, G.ink) < 30
    const rightCols = rightColsOf(G)
    const hdr = G.rows[0].every((c) => c.bold) ? `the first row is the header: bold${H.fill?.a > 0.05 ? `, every header cell filled ${hexOf(H.fill)}` : ''}` : ''
    const special = []
    const inkCols = G.rows[0].map((_, j) => { const cs = G.rows.slice(1).filter((r) => !r.some((c) => c.top)).map((r) => r[j]).filter((c) => c.t); const col = cs.filter((c) => !plain(c)); const h = col[0] && hexOf(col[0].ink); return col.length >= 3 && col.every((c) => hexOf(c.ink) === h) && col.length >= cs.length - 2 ? { h, but: cs.filter((c) => plain(c)).map((c) => c.t) } : null })
    inkCols.forEach((k, j) => { if (k) special.push(`every value in the ${quote(G.rows[0][j].t, 12)} column (header aside) is ${k.h} text${k.but.length ? `, except ${k.but.map((t) => quote(t, 10)).join(', ')} in the plain ink` : ''}`) })
    G.rows.forEach((r, i) => r.forEach((c, j) => { if (i && !plain(c) && c.t && !(inkCols[j] && hexOf(c.ink) === inkCols[j].h)) special.push(`${quote(c.t, 10)} in ${hexOf(c.ink)}`); if (c.outline) special.push(`the cell ${quote(c.t, 10)} (row ${i + 1}, column ${j + 1}) is the selected cell: a ${c.outline.px}px ${hexOf(c.outline.c)} outline drawn inside it`) }))
    const tot = G.rows.findIndex((r) => r[0].top)
    let last = G.rows.length; while (last > 1 && G.rows[last - 1].every((c) => !c.t)) last--
    const rows = G.rows.slice(0, last).map((r) => r.map((c) => c.t || '·').join(' | ')).join(' / ') + (last < G.rows.length ? ` / then ${G.rows.length - last} empty rows of blank cells to the bottom` : '')
    return { kind: 'box', note: `a spreadsheet grid at ${G.x},${G.y}: ${G.rows.length} rows x ${G.ncol} columns of cells, every cell ${G.colW}x${G.rowH}px with a ${G.lineW}px ${hexOf(G.line)} right and bottom line (a real cell grid, NOT a paragraph, NOT a list), ${G.pad}px side padding, 13px text; ${hdr}; columns ${rightCols.map((j) => j + 1).join(', ')} right-aligned (numbers)${rightCols.every((j) => !G.rows[0][j].right) ? ' (their header cells stay LEFT-aligned like the rest of the header row)' : ''}${special.length ? `; ${uniq(special).join('; ')}` : ''}${tot > 0 ? `; a ${G.rows[tot][0].top.px}px ${hexOf(G.rows[tot][0].top.c)} rule across the top of row ${tot + 1}${G.rows[tot].some((c) => c.t) ? ` (the bold total row)` : ''}` : ''}; cells row by row (| between cells, / between rows, · an empty cell): ${rows}` }
  }
  // n131: a drawn street map: every area and strip, then every price pin, each at its place in the panel
  if (f.mapPanel) {
    const M = f.mapPanel
    const area = (a) => `${hexOf(a.c)} ${a.w >= M.w - 2 || a.h >= M.h - 200 ? (a.w > a.h ? 'horizontal' : 'vertical') + ' ' : ''}${Math.min(a.w, a.h) <= 20 ? 'strip' : 'area'} ${a.w}x${a.h}px at ${a.x},${a.y}${a.r ? ` (${a.r}px rounded)` : ''}`
    const pin = (p) => `${quote(p.t, 8)} at ${p.x},${p.y}${p.fill && dist(p.fill, { r: 255, g: 255, b: 255 }) > 60 ? ` (the picked one: ${hexOf(p.fill)} fill, ${hexOf(p.ink)} text${p.scale > 1 ? `, scaled ${p.scale}` : ''})` : ''}`
    const p0 = M.pins.find((p) => !(p.fill && dist(p.fill, { r: 255, g: 255, b: 255 }) > 60)) ?? M.pins[0]
    return { kind: 'box', note: `a drawn street map, ${M.w}x${M.h}px, ${hexOf(M.bg)} ground, overflow hidden (NOT empty, NOT a picture, NOT an iframe); inside it, absolutely placed in panel px, first ${M.areas.length} flat shapes: ${M.areas.map(area).join('; ')}; then ${M.pins.length} price pins over them, each a ${p0.bold ? 'bold ' : ''}text pill (${hexOf(p0.fill)} fill, ${hexOf(p0.ink)} text, fully rounded, about ${p0.h}px tall${p0.shadow ? ', soft drop shadow' : ''}): ${M.pins.map(pin).join(', ')}` }
  }
  // n131: listing cards: grid, then each card's gradient photo, badge and lines
  if (f.photoCards) {
    const P = f.photoCards, c0 = P.cards[0]
    const g = (c) => c.grad ? (() => { const cs = [...c.grad.matchAll(/rgba?\([^)]+\)/g)].map((m) => hexOf(parse(m[0]))); const d = c.grad.match(/([\d.]+)deg/)?.[1]; return `a ${d ?? 180}deg gradient ${cs.join(' to ')}` })() : `${hexOf(c.fill)} fill`
    const ln = (l, i) => `${i === 0 ? ` ${l.gap}px under the photo` : ` top ${l.gap}px below the line above`}: ${l.px}px ${l.bold ? 'bold ' : ''}${hexOf(l.ink)} ${l.split ? `${quote(l.t.replace(l.split, '').trim(), 30)} at the left and ${quote(l.split, 12)} at the far right` : l.boldPart ? `${quote(l.t, 30)} with ${quote(l.boldPart, 10)} bold` : quote(l.t, 40)}`
    const shape = c0.lines.map((l) => `${l.px}px${l.bold ? ' bold' : ''} ${hexOf(l.ink)}${l.split ? ' row with a right part' : ''}`).join(', ')
    const cards = P.cards.map((c, i) => `card ${i + 1}: photo ${g(c)}${c.badge ? `, badge ${quote(c.badge.t, 20)}` : ', no badge'}; ${c.lines.map((l) => l.split ? `${quote(l.t.replace(l.split, '').trim(), 30)} … ${quote(l.split, 10)}` : quote(l.t, 36)).join(' / ')}`).join('; ')
    return { kind: 'box', note: `${P.cards.length} listing cards in a ${P.cols}-column grid, ${P.w}px wide at ${P.x},${P.y}, ${P.gap}px column gap, ${P.rowGap}px row gap (cards, NOT a text list); each card is a ${c0.w}px-wide ${c0.photoH}px-tall photo block ${c0.radius}px rounded filled with a diagonal gradient (no image)${c0.badge ? `, some with a ${c0.badge.bold ? 'bold ' : ''}${c0.badge.px}px badge in a ${hexOf(c0.badge.fill)} ${c0.badge.r}px-rounded chip ${c0.badge.x}px in from its top-left corner` : ''}, then under the photo with no box: ${c0.lines.map(ln).join(';')}; lines are ${shape}; ${cards}` }
  }
  // n131: a filter panel section by section: checkbox rows, range sliders, end labels
  // n145: a "panel" with no checkbox row at all (round 12 e5 filter chips) is not a filter panel (crashed on it0)
  if (f.checkPanel && f.checkPanel.secs.some((s) => s.items.some((i) => i.ck))) {
    const C = f.checkPanel
    const ck = (it) => `[${it.on ? 'x' : ' '}] ${quote(it.label, 24)}${it.right ? ` … ${quote(it.right.t, 8)}` : ''}`
    const it0 = C.secs.flatMap((s) => s.items).find((i) => i.ck && !i.on) ?? C.secs.flatMap((s) => s.items).find((i) => i.ck)
    const on = C.secs.flatMap((s) => s.items).find((i) => i.ck && i.on)
    const sec = (s) => `${quote(s.head, 24)} (bold ${s.px}px heading${s.y ? `, ${s.y}px from the panel top` : ''}): ${s.items.map((it) => it.ck ? ck(it) : it.range ? `a range slider: a ${it.w}px-wide ${it.th}px ${hexOf(it.track)} rounded track, the span from ${it.from}px to ${it.to}px filled ${hexOf(it.fill)}, two ${it.kpx}px round knobs (${hexOf(it.kfill)} with a ${it.kbw}px ${hexOf(it.kborder)} ring) centred at ${it.knobs.join('px and ')}px along it` : it.ends ? `small ${it.px}px ${hexOf(it.ink)} ${it.ends.map((e) => quote(e, 10)).join(it.spread ? ' at the left and ' : ' ')}${it.spread ? ' at the right, under the slider' : ''}` : '').filter(Boolean).join(', ')}`
    return { kind: 'box', note: `a ${C.fill ? hexOf(C.fill) : 'white'} filter panel ${C.box.w}x${C.box.h}px at ${C.box.x},${C.box.y}, ${C.radius}px rounded, ${C.pad}px padding (NOT an inspector, NOT filled field boxes, NOT text inputs); ${C.secs.length} sections top to bottom. Every [ ] is a real checkbox row: a ${it0.px}x${it0.px}px ${it0.rad}px-rounded empty square with a ${it0.bw}px ${hexOf(it0.border)} border${on ? `, [x] the same square filled solid ${hexOf(on.fill)} (no tick needed)` : ''}, then the label 10px right of it in regular dark text, any … value pushed to the far right in grey, rows about ${it0.h}px tall: ${C.secs.map(sec).join('; ')}` }
  }
  // n131: result cards part by part (flight rows)
  if (f.resultCards) {
    const R = f.resultCards, c0 = R.cards[0]
    const part = (p) => p.t ? `${p.bold ? 'bold ' : ''}${p.px}px ${hexOf(p.ink)} ${quote(p.t, 20)}${p.fill ? ` on a ${hexOf(p.fill)} ${p.rad}px-rounded ${p.w}x${p.h}px fill` : p.outline ? ` in a ${p.w}x${p.h}px ${p.rad}px-rounded box with a 1px ${hexOf(p.outline)} border` : ''} at ${p.x},${p.y}${p.rule ? ` (the route line: a ${p.rule.px}px ${hexOf(p.rule.c)} line ${p.w}px wide at y ${p.y + p.rule.top}, ${/ \/ /.test(p.t) ? `${quote(p.t.split(' / ')[0], 12)} centred just above it and ${quote(p.t.split(' / ').slice(1).join(' '), 14)} centred just below it` : 'the text centred over it'})` : ''}`
      // n161: a gradient photo stand-in inside a card (round 15 e3 hotel photos: lost)
      : p.img ? `a ${p.w}x${p.h}px photo area${p.rad ? ` (${p.rad}px rounded)` : ''} painted ${p.img.replace(/rgba?\([^)]+\)/g, (m) => hexOf(parse(m)))} (plain CSS, no picture, no X) at ${p.x},${p.y}`
      : `a ${p.w}x${p.h}px ${p.round ? 'round dot' : `${p.rad}px-rounded solid square`} ${hexOf(p.fill)} at ${p.x},${p.y}`
    const cards = R.cards.map((c, i) => `card ${i + 1} at page y ${c.y}: ${c.parts.map(part).join('; ')}`).join('. ')
    const side = R.cards.length >= 2 && Math.abs(R.cards[1].y - R.cards[0].y) <= 4
    const look = (c) => `${c.fill?.a > 0.05 ? hexOf(c.fill) : 'no fill'}${c.border ? `, ${c.border.px}px ${hexOf(c.border.c)} border` : ''}`
    const cards2 = R.cards.map((c, i) => `card ${i + 1} at page ${side ? `x ${c.x}` : `y ${c.y}`}${look(c) !== look(c0) ? ` (${look(c)}, unlike the others)` : ''}: ${c.parts.map(part).join('; ')}`).join('. ')
    return { kind: 'box', note: `${R.cards.length} separate ${side ? 'cards side by side' : 'result cards stacked down the column'}, each ${c0.w}x${c0.h}px, ${look(c0)}, ${c0.radius}px rounded, ${R.cards.length >= 2 ? `${side ? R.cards[1].x - R.cards[0].x - c0.w : R.cards[1].y - R.cards[0].y - c0.h}px apart` : ''} (cards, NOT text lines; parts at card px, a negative y sits over the card's top edge): ${cards2}` }
  }
  if (f.meters) {
    const M = f.meters
    const one = (m) => `${m.lines.map((l) => l.small ? `${l.bold ? 'bold ' : ''}${l.px}px ${quote(l.t.replace(l.small.t, '').trim(), 16)} with a small ${l.small.px}px ${hexOf(l.small.ink)} ${quote(l.small.t, 12)} after it` : `${l.bold ? 'bold ' : ''}${l.px}px ${hexOf(l.ink)} ${quote(l.t, 20)}`).join(', then ')}, then ${m.gap}px below a ${m.w}px-wide ${m.h}px ${hexOf(m.track)} rounded track filled ${m.pct}% from the left in ${hexOf(m.fill)}`
    return { kind: 'box', note: `usage meters in a ${M.box.w}x${M.box.h}px card${M.border ? ` (1px ${hexOf(M.border)} border` : ' ('}, ${M.radius}px rounded, ${M.pad}px padding), ${M.cols} columns ${M.gap}px apart (each a real meter bar, NOT a thin line): ${M.m.map(one).join('; ')}` }
  }
  // n160: a word across 3D-turned shaded panels, every panel said with its turn, shading and the word's offset
  if (f.foldPanels) {
    const F = f.foldPanels
    const one = (p, i) => `panel ${i + 1}: ${p.w}x${p.h}px, transform: rotateY(${p.turn}deg), background ${p.bg ? p.bg.replace(/rgba?\([^)]*\)/g, (m) => hexOf(parse(m))) : hexOf(p.fill)}, the word at left ${p.left}px, top ${p.top}px`
    return { kind: 'box', note: `ONE giant ${F.px}px ${F.weight >= 800 ? 'black-weight ' : F.weight >= 600 ? 'bold ' : ''}${hexOf(F.ink)} word ${quote(F.t)} printed ACROSS ${F.panels.length} paper panels folded like a zig-zag screen (real CSS 3D, NOT flat bands, NOT a picture, NOT ${F.panels.length} separate words): a ${F.box.w}x${F.box.h}px flex row at ${F.box.x},${F.box.y} (position absolute) with perspective: ${F.persp}px, holding ${F.panels.length} panels side by side, no gaps, each flex: 1, overflow: hidden, position: relative; inside EVERY panel the same word ${quote(F.t)} as a span, position: absolute, ${F.px}px, line-height ${F.lh === 'normal' ? 'normal' : F.lh}, white-space: nowrap, its left shifted so the panels together read as one continuous word, each panel showing its own slice: ${F.panels.map(one).join('; ')}` }
  }
  // a giant word cut into stacked bands, each band showing a different slice at its own x offset
  if (f.slicedWord) {
    const S = f.slicedWord
    const b = S.bands.map((x, i) => `band ${i + 1}: ${x.w}x${x.h}px at ${S.box.x + x.x},${S.box.y + x.y}, ${x.fill?.a > 0.05 ? `${hexOf(x.fill)} filled` : 'no fill (page shows)'}, letters ${hexOf(x.ink)}, the word in a span with position: relative; left: ${x.textX}px; top: ${x.textY}px${x.textY < 0 ? ` (pulled up, so the band shows the slice of the 300px line from ${-x.textY}px to ${-x.textY + x.h}px)` : ' (the top slice of the line shows)'}`).join('; ')
    return { kind: 'box', note: `ONE giant word ${quote(S.t)} SLICED into ${S.bands.length} stacked horizontal bands (NOT ${S.bands.length} whole words, NOT outlines): each band is a full-width strip with overflow: hidden holding the same ${S.px}px ${S.weight >= 800 ? 'black-weight ' : S.weight >= 600 ? 'bold ' : ''}${quote(S.t)} (line-height ${S.lineH}px, so the word's line is ${S.lineH}px tall and each ${S.bands[0].h}px band is a window onto one slice of it${S.spacing ? `, letter-spacing ${Math.round(S.spacing)}px` : ''}, one line, nowrap), shifted up so each band shows the next third of the letters, and shifted sideways so the slices do not line up: ${b}; the bands touch, no gaps, together ${S.box.w}x${S.box.h}px` }
  }
  // a ruled index list: label left, number right, a thin rule over every row
  if (f.ruledIndex) {
    const I = f.ruledIndex
    return { kind: 'text', note: `a ruled index list ${I.w}px wide at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, ${I.mono ? 'monospace (Courier New) ' : ''}${I.px}px ${colourName(f.colour)}, ${I.rows.length} rows each ${I.rows[0].h}px tall with a 1px ${hexOf(I.rows[0].rule)} rule across its top${I.rows[I.rows.length - 1].last ? ' and one under the last row' : ''}, the label at the left and its date or number at the far right of the row (NOT a paragraph, NOT a table with heads): ${I.rows.map((r) => `${quote(r.l, 28)} … ${quote(r.r, 24)}`).join(', ')}; the right parts whole, exactly as written, never cut` }
  }
  // a halftone dot disc: a round field of a dot grid, solid shapes over it
  if (f.halftone) {
    const H = f.halftone, D = H.dots
    return { kind: 'box', note: `a halftone picture made of plain CSS (no image), ${H.box.w}x${H.box.h}px at ${H.box.x},${H.box.y}: a ${D.w}x${D.h}px ${D.round ? 'round ' : ''}disc at ${D.x},${D.y} filled with a grid of small ${hexOf(D.c)} dots (background-image: radial-gradient(${hexOf(D.c)} ${D.dotPct}%, transparent ${D.dotPct + 2}%); background-size: ${D.cell}px ${D.cell}px; border-radius: 50%), the page colour showing between the dots${H.solids.map((x) => `; over it a solid ${x.w}x${x.h}px ${x.round ? 'round ' : ''}${hexOf(x.c)} ${x.round ? 'disc' : 'block'} at ${x.x},${x.y}`).join('')}` }
  }
  // a run of outlined words with some filled solid
  if (f.outlineRun) {
    const R = f.outlineRun
    return { kind: 'text', note: withFx(`one line of ${Math.round(f.font.size)}px ${f.font.weight >= 800 ? 'black-weight ' : 'bold '}${/sans|helvetica|arial/i.test(f.font.family) ? 'Helvetica/Arial sans-serif (NOT the page serif) ' : ''}words, ${Math.round(w)}px wide, nowrap, at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}: outlined words are HOLLOW (color: transparent; -webkit-text-stroke: ${R.stroke}px ${hexOf(R.c)}), filled words solid ${hexOf(R.words.find((x) => x.solid).ink)}, in order: ${R.words.map((x) => `${quote(x.w, 16)} ${x.solid ? 'filled' : 'outlined'}`).join(', ')}`) }
  }
  // a contents list with no box: a heading over short links one per line, the current one in its own ink (round 8 e5
  // 'On this page': no note, so the build drew big dark text with invented items)
  if (!fill && !bordered && !f.regionKids.length && f.dense?.type === 'list' && f.dense.stacked && f.dense.head && !f.dense.groups && f.dense.inks && f.dense.items.length >= 3 && f.dense.items.length <= 12 && f.dense.items.every((p) => p.length === 1 && p[0].length <= 28)
    // n143: only when the list is the region's words (round 11 c3 spec panel: its paragraph, keys and button were lost)
    && (f.dense.head.length + f.dense.items.reduce((n, p) => n + p[0].length, 0)) >= 0.6 * (f.text || '').replace(/\s+/g, '').length) {
    const d = f.dense, key = (c, i) => `${hexOf(c)}|${d.weights[i] >= 600}`
    const odd = d.inks.map(key).filter((k, i, a) => a.filter((x) => x === k).length === 1)
    const oi = odd.length === 1 && d.items.length >= 3 ? d.inks.map(key).indexOf(odd[0]) : -1
    const base = d.inks.find((c, i) => i !== oi)
    return { kind: 'text', note: `a contents list, no box, no card: bold dark ${quote(d.head, 28)} heading, then ${d.items.length} small ${d.px}px ${colourName(base)} (${hexOf(base)}) links, one per line, plain text (not buttons): ${d.items.map((p) => quote(p[0], 28)).join(', ')}${oi >= 0 ? `; ${quote(d.items[oi][0], 28)} in ${d.weights[oi] >= 600 ? 'bold ' : ''}${colourName(d.inks[oi])} (${hexOf(d.inks[oi])})` : ''}` }
  }
  const frosted = fx.includes('frosted glass')
  // an inspector panel: section headings over filled field boxes, each field said as a box with its value
  if (f.fieldSecs && fill) {
    const fs = f.fieldSecs, f0 = fs.flatMap((x) => x.rows.flat())[0]
    const field = (b) => `[${b.sw ? `${b.sw.px}px ${hexOf(b.sw.fill)} swatch square, then ` : ''}${quote(b.t, 24)}]`
    const secs = fs.map((x) => `${quote(x.h, 20)}: ${x.rows.map((r) => r.length > 1 ? `${r.map(field).join(' ')} side by side, equal widths` : `${field(r[0])} full width`).join(', then ')}`)
    return { kind: 'box', note: withFx(`${colourName(f.bg)} panel ${Math.round(w)}x${Math.round(h)}px${bordered ? `, thin ${colourName(f.border.colour)} border` : ''}: an inspector, ${fs.length} sections top to bottom, each a small bold caps heading then its fields; every [field] is a filled ${hexOf(f0.fill)} box ${f0.rad}px rounded, about 28px tall, its value in small dark text inside at the left (NOT bare text, NOT outlined inputs): ${secs.join('; ')}`) }
  }
  // n127: a curved screen strip: top edge arched, bottom flat (round 8 e4 built a flat rounded bar)
  if (f.arch && !f.text && visible(f.bg) && !grad && !f.regionKids.length) return { kind: 'box', note: withFx(`a curved screen strip ${Math.round(w)}x${Math.round(h)}px at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, ${hexOf(f.bg)}: its top edge arches up in one smooth curve, bottom edge flat (border-radius: 50% / 100% 100% 0 0, thin at both ends, thickest in the middle); NOT a flat rounded bar, NO words`) }
  // n127: a legend: small swatch squares, each before its word (round 8 e4: said as links, built as tiny round dots)
  if (f.swatchKids && !f.regionKids.length && h <= 40) {
    const sw = (k) => `${k.px}px ${k.rad >= k.px / 2 - 1 ? 'round' : `square (${k.rad}px rounded)`} swatch ${k.fill ? hexOf(k.fill) : 'white'}${k.border && (!k.fill || dist(k.border, k.fill) > 20) ? ` with a ${hexOf(k.border)} border` : ''} then ${quote(k.t, 20)}`
    return { kind: 'text', note: `a legend in one row at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, ${Math.round(f.font.size)}px ${hexOf(f.colour)} words, not links: ${f.swatchKids.map(sw).join('; ')}` }
  }
  // n127: a column of single letters, one per row (seat-row letters, round 8 e4: no note, built tight to the grid)
  if (!fill && !f.regionKids.length && f.text && /^([A-Z0-9]{1,2} ){4,}[A-Z0-9]{1,2}$/.test(f.text) && h > w * 3 && f.font.lineHeight) {
    const ls = f.text.split(' ')
    return { kind: 'text', note: `a narrow column of ${ls.length} ${f.font.weight >= 600 ? 'bold ' : ''}${Math.round(f.font.size)}px ${isSerif(f.font.family) !== isSerif(page.font.family) ? (isSerif(f.font.family) ? 'serif ' : 'Helvetica/Arial sans-serif (NOT the page serif) ') : ''}${hexOf(f.colour)}${f.colour.a < 0.95 ? ` at ${Math.round(f.colour.a * 100)}% (FAINT, see-through: color rgba with that alpha, NOT solid)` : ''} letters, one per line, ${ls.join(' ')}, line-height exactly ${Math.round(f.font.lineHeight)}px; its left edge at x ${Math.round(f.rect.x)}, first letter's line top at y ${Math.round(f.rect.y)} (absolutely placed there, NOT tight against the grid)` }
  }
  // n127: an app toolbar: a dark bar of tool squares, one filled (the active tool), a title, a filled button far right
  if (fill && (f.bg.r + f.bg.g + f.bg.b) / 3 < 90 && w >= 600 && h <= 64 && f.kidCells && f.kidCells.some((k) => k.fill && k.t) && f.kidCells.filter((k) => k.fill).length <= 3 && !f.regionKids.length) {
    const kb = f.kidCells.filter((k) => k.t)
    const one = (k) => `${quote(k.t, 28)}${k.fill ? ` (a ${k.w}x${k.h}px ${hexOf(k.fill)} filled ${k.rad}px rounded box${k.bold ? ', bold' : ''} ${hexOf(k.ink)} text)` : k.ink && dist(k.ink, f.colour ?? k.ink) > 30 ? ` (${hexOf(k.ink)} text)` : ''} at x ${k.x}`
    return { kind: 'box', note: `${colourName(f.bg)} (${hexOf(f.bg)}) bar ${Math.round(h)}px tall across the page, ${hexOf(f.colour)} text; left to right, each item at its own x from the bar's left: ${kb.map(one).join('; ')}` }
  }
  // a textless filled pill, outlined and with corner handles: a selected layer on a design canvas
  if (!f.text && !f.kidCount && fill && !grad && !f.regionKids.length && h >= 24 && h <= 90 && w >= h * 2 && f.radius >= h / 2 - 2 && (f.ring || f.handles)) {
    const hd = f.handles
    return { kind: 'box', note: withFx(`an empty solid ${hexOf(f.bg)} pill exactly ${Math.round(w)}x${Math.round(h)}px (border-radius 999px: fully round ends, a capsule, NOT square or slightly rounded corners; the selection outline follows the round ends), NO text, NO label, NOT a button with words, NOT blue${f.ring ? `; a ${f.ring.w}px ${colourName(f.ring.colour)} (${hexOf(f.ring.colour)}) selection outline round it (outline: ${f.ring.w}px solid; outline-offset ${f.ring.off}px)` : ''}${hd ? `; ${hd.n} small ${hd.px}x${hd.px}px square ${hexOf(hd.fill)} handles${hd.border ? ` with a ${hexOf(hd.border)} border` : ''}, one centred on each corner of its bounding box (absolutely placed)` : ''}`) }
  }

  // n154: a card holding a stacked area chart, said as its exact SVG paths (round 14 e4 built bars)
  if (f.areaSvg && !f.regionKids.length) {
    const A = f.areaSvg
    const head = f.kidTexts[0] ?? ''
    const lg = A.legend.length ? `; a legend at its top right, a small square colour swatch before each word: ${A.legend.map((l) => `${hexOf(l.c)} ${quote(l.t, 12)}`).join(', ')}` : ''
    const path = (p) => `<path d="${p.d}" fill="${hexOf(p.fill)}"${p.op < 0.99 ? ` opacity="${+p.op.toFixed(2)}"` : ''}/>`
    const line = (l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${hexOf(l.c)}"/>`
    return { kind: 'box', note: withFx(`${colourName(f.bg)} (${hexOf(f.bg)}) chart card ${Math.round(w)}x${Math.round(h)}px, ${Math.round(f.radius)}px rounded${bordered ? `, 1px ${hexOf(f.border.colour)} border` : ''}; small bold title ${quote(head, 40)} top left${lg}; the chart is a STACKED AREA chart (overlapping filled hills, NOT bars, NOT a bar chart, NOT lines only): an inline <svg width="${A.w}" height="${A.h}"> placed ${A.x}px from the card's left and ${A.y}px from its top, holding exactly these shapes, back to front: ${A.paths.map(path).join(' ')}${A.lines.length ? ` ${A.lines.map(line).join(' ')}` : ''}`) }
  }
  // n154: a glyph tile grid, said tile by tile (round 14 c5 built it as one white word)
  if (f.glyphTiles && !f.regionKids.length) {
    const g = f.glyphTiles, t0 = g.tiles[0]
    const one = (x, i) => {
      const parts = [`${i + 1}. ${quote(x.t)} weight ${x.w}${x.italic ? ' italic' : ''}`]
      if (x.fill?.a > 0.05) parts.push(`tile FILLED solid ${hexOf(x.fill)}`)
      if (x.stroke && !(x.ink?.a > 0.05)) parts.push(`HOLLOW letter: outline only (color: transparent; -webkit-text-stroke: ${x.stroke.w}px ${hexOf(x.stroke.c)})`)
      else parts.push(`letter ${hexOf(x.ink)}`)
      parts.push(x.glow ? `glowing (text-shadow 0 0 ${x.glow.blur}px ${hexOf(x.glow.c)})` : 'no glow')
      return parts.join(', ')
    }
    return { kind: 'box', note: withFx(`a ${g.cols}x${g.rows} grid of ${g.tiles.length} square glyph TILES (display: grid; ${g.cols} columns; gap ${g.gap}px), ${g.w}x${g.h}px with its top-left at ${g.x},${g.y}; every tile is its own ${t0.bw2}x${t0.bh}px box${t0.border ? ` with a ${t0.bw}px ${hexOf(t0.border)} border` : ''}, ${t0.rad}px rounded, holding ONE centred ${t0.px}px Helvetica letter (NOT one word on a line, NOT letters without boxes); left to right, top to bottom: ${g.tiles.map(one).join('; ')}`) }
  }
  // ---- round 7 creative (n94)
  // a word set letter by letter, each letter its own size and weight on one baseline
  if (f.letterWave && !f.regionKids.length) {
    const lw = f.letterWave
    const word = lw.letters.map((l) => l.t).join('')
    const face = faceName(f.font.family)
    return { kind: 'heading', note: withFx(`the one word "${word}" in giant ${face ? `${face} ` : ''}${colourName(lw.colour) ?? ''} letters on ONE line, every letter its own <span> with its own font-size and font-weight, all on one shared baseline (letters bottom-aligned${lw.spread ? '' : ', no gaps added'}): ${lw.letters.map((l, i) => `${l.t} ${l.px}px weight ${l.w}${lw.spread ? ` (left edge at x ${lw.spread.xs[i]})` : ''}`).join(', ')}; ${lw.spread ? `the letters are SPREAD across the whole ${lw.width}px-wide row from x ${lw.left} to x ${lw.left + lw.width} (display: flex; justify-content: space-between; width ${lw.width}px), wide even gaps between letters, NOT packed together in the middle` : `about ${lw.width}px wide`}, white-space: nowrap; no other copy here (not a paragraph)`) }
  }
  if (f.barStack && fill && !f.regionKids.length && h >= 100) {
    const bs = f.barStack, main = bs.bars[1] ?? bs.bars[0]
    return { kind: 'box', note: withFx(`${colourName(f.bg)} (${hexOf(f.bg)}) tile, ${Math.round(w)}x${Math.round(h)}px, ${Math.round(f.radius)}px rounded${bordered ? `, 1px ${colourName(f.border.colour)} (${hexOf(f.border.colour)}) border` : ''}${f.text ? `, small wide-spaced label ${quote(f.text, 24)} top left` : ''}; under it a stack of ${bs.bars.length} empty ${bs.h}px bars (${bs.radius}px rounded) ${bs.gap}px apart, first one ${bs.top}px from the top: ${bs.bars.map((b) => `${colourName(b.c)} ${b.pct}% wide`).join(', ')}`) }
  }
  // ---- round 7 c5 (n102)
  // a hand-drawn ring: one unfilled stroked ellipse in an SVG, drawn as its own outline (was a bare box)
  if (f.ringSvg && !f.regionKids.length) {
    const g = f.ringSvg
    const t = (g.rot * Math.PI) / 180, cx = w / 2, cy = h / 2
    const poly = Array.from({ length: 16 }, (_, i) => {
      const a = (2 * Math.PI * i) / 16, ex = g.rx * Math.cos(a), ey = g.ry * Math.sin(a)
      return [+((cx + ex * Math.cos(t) - ey * Math.sin(t)) / w).toFixed(3), +((cy + ex * Math.sin(t) + ey * Math.cos(t)) / h).toFixed(3)]
    })
    const turn = Math.abs(g.rot) >= 2 ? `, tilted ${Math.abs(g.rot)}° ${g.rot > 0 ? 'clockwise' : 'anticlockwise'}` : ''
    return { kind: 'shape', poly, note: `an outline-only ${colourName(g.c)} (${hexOf(g.c)}) ellipse ring, ${g.w}px line, ${2 * g.rx}x${2 * g.ry}px${turn}, no fill (an SVG <ellipse fill="none">, like a pen circle round a note): whatever is inside it shows through` }
  }
  // a paragraph opening on a drop cap (round 7 c5 column: no note, built as plain text)
  if (f.dropCap && !f.regionKids.length && f.text.length > 40) {
    const d = f.dropCap
    const lines = Math.max(2, Math.round((d.px * 0.8) / d.lh) + 1)
    return { kind: 'text', note: `paragraph ${Math.round(w)}px wide, ${d.base}px text, line-height ${Math.round(d.lh)}px, opening on a drop cap: its first letter ${quote(d.letter)} ${d.px}px ${d.weight >= 600 ? 'bold ' : ''}${colourName(d.colour)} (${hexOf(d.colour)}), floated left about ${lines} lines tall (::first-letter), the text wrapping beside it: ${quote(f.text, 400)}` }
  }
  // a strip of see-through tape laid over a photo's corner (round 7 c5: read as a picture, built as an X box)
  if (!f.text && !f.kidCount && fill && !grad && f.bg.a >= 0.3 && f.bg.a <= 0.9) {
    const lw = f.layoutBox?.w ?? w, lh = f.layoutBox?.h ?? h
    if (lw <= 260 && lh <= 80 && lw >= 2.5 * lh) {
      const pale = { r: f.bg.r, g: f.bg.g, b: f.bg.b, a: 1 }
      // n155: its place before the turn and the turn itself, and dashed torn ends (round 14 c2 tapes built square, untilted)
      const E = f.el, rot = Math.abs(f.rotate) >= 2 ? f.rotate : 0
      const ends = !bordered && f.border.left >= 1 && f.border.leftStyle === 'dashed' ? `, ${f.border.left}px dashed ${hexOf(f.border.leftColour)}${f.border.leftColour.a < 0.9 ? ` at ${Math.round(f.border.leftColour.a * 100)}% opacity` : ''} left and right ends only (torn tape ends)` : ''
      const at = E ? `, its top-left at ${E.x},${E.y} before the turn${rot ? `, then turned by transform: rotate(${rot}deg) round its centre (it lies on a slant, NOT level)` : ''}` : ''
      return { kind: 'box', note: rot && E ? `see-through ${colourName(pale)} (${hexOf(pale)} at ${Math.round(f.bg.a * 100)}% opacity) strip of sticky tape ${lw}x${lh}px${at}${bordered ? `, hairline ${lineCol(f.border.colour)} edge` : ''}${ends}, square corners, laid ON TOP of everything it crosses (above the cut-outs and discs, highest z-index; no picture, no X, nothing inside)` : withFx(`see-through ${colourName(pale)} (${hexOf(pale)} at ${Math.round(f.bg.a * 100)}% opacity) strip of sticky tape ${lw}x${lh}px${at}${bordered ? `, hairline ${lineCol(f.border.colour)} edge` : ''}${ends}, square corners, laid ON TOP of the photo edge it crosses (no picture, no X, nothing inside)`) }
    }
  }
  // ---- round 6 creative (n79)
  // n160: an svg whose look is in its defs or that stretches to its box, said as its own markup
  if (f.svgSrc && !f.regionKids.length) {
    const V = f.svgSrc
    return { kind: 'box', note: `drawn as exactly this inline SVG (no picture, no box, no window, nothing else inside), ${V.w}x${V.h}px with its top-left at page ${V.x},${V.y} (position absolute), copied verbatim: ${V.src.replace(/<svg /, `<svg width="${V.w}" height="${V.h}" `)}` }
  }
  // SVG art: filled hills back to front and stroked paths (round 6 c3: one bare box)
  if (f.svgArt && !f.regionKids.length) {
    const { fills, strokes } = f.svgArt
    const wide = fills.filter((x) => x.right - x.left >= w * 0.8)
    const hills = wide.length >= 2 && wide.every((x) => x.curvy && x.bottom >= f.rect.y + h - 4)
    const sh = hills
      ? `${wide.length} layered wavy hills (filled shapes with smooth rolling S-curve tops, each running the full width down to the bottom edge), back to front: ${wide.map((x) => `${vivid(x.c) ? 'vivid ' : ''}${colourName(x.c)} (${hexOf(x.c)}) cresting about ${x.top}px down${x.edge && x.edge.every(Boolean) ? ` (its top edge about ${x.edge.map(([, y]) => y).join(', ')}px down at the left edge, quarter, middle, three-quarters and right edge)` : ''}`).join(', ')}`
      : polyWords(fills) ?? `${fills.length} filled shapes: ${fills.map((x) => `${colourName(x.c)} ${x.right - x.left}x${x.bottom - x.top}px at ${x.left},${x.top}`).join(', ')}`
    const crosses = (v) => { const X = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0 }; for (let i = 0; i < v.length - 1; i++) for (let j = i + 2; j < v.length - 1; j++) if (X(v[i], v[i + 1], v[j], v[j + 1])) return true; return false }
    // a curving trail says the points it passes through in order: 'from about x,y up and across to x,y'
    // (its box corners) was built as a loop-de-loop elsewhere (round 6 c3, n88)
    // straight leader lines alone (round 7 c4: dashed pointers to labels, unsaid)
    if (!fills.length && strokes.every((x) => x.straight && x.via)) return { kind: 'box', note: withFx(`${strokes.length} separate thin straight ${strokes[0].dash ? `dashed (${strokes[0].dash}px dashes) ` : ''}${strokes[0].w}px ${colourName(strokes[0].c)} lines in one <svg> laid over the page (no box, no fill), page px: ${strokes.map((x) => `from ${x.via[0].join(',')} to ${x.via[6].join(',')}`).join('; ')}`) }
    const tr = strokes.map((x) => x.curvy && x.via ? `a ${x.dash ? 'dashed ' : ''}${x.w}px ${colourName(x.c)} smooth curving line (no fill${crosses(x.via) ? ', it loops over itself' : ', no loops, never crossing itself'}) passing in order through about ${x.via.map(([a, b]) => `${a},${b}`).join(' → ')} (page px)` : `a ${x.dash ? 'dashed ' : ''}${x.w}px ${colourName(x.c)} ${x.curvy ? 'curving, looping ' : ''}line (no fill) from about ${x.x},${x.bottom} up and across to ${x.right},${x.y}`)
    return { kind: 'box', note: withFx(`drawn shapes, no picture, no box: ${sh}${tr.length ? `; plus ${tr.join(', ')}` : ''}`) }
  }
  // a grid of thin lines laid flat as a floor going back (round 6 c1: a bare box)
  if (gridLines(f) && f.rot3d && Math.abs(f.rot3d.x) >= 40 && !f.text) {
    const lc = f.bgImageColours.map(parse).find((c) => c && c.a > 0.05)
    const step = (f.bgImage.match(/(?:transparent|rgba\(0, 0, 0, 0\)) 1px,?\s*(?:(?:transparent|rgba\(0, 0, 0, 0\))\s+)?(\d+)px/) || f.bgImage.match(/1px,?\s*(?:transparent|rgba\(0, 0, 0, 0\))\s+1px\s+(\d+)px/) || [])[1]
    return { kind: 'box', note: `faint ${lc ? colourName({ ...lc, a: 1 }) : ''} grid of thin lines${step ? ` every ${step}px` : ''} laid flat as a floor going back into the distance (perspective, rotateX(${f.rot3d.x}deg)), from ${Math.round(f.rect.y)}px down to the bottom edge across the full width${f.layoutBox?.h ? ` (tilting shortens it: build the grid ${f.layoutBox.h}px tall and ${f.layoutBox.w}px wide before the tilt, hinged at its top edge, so its lines still reach the bottom edge)` : ''}, a backdrop behind everything that holds nothing (things over it are not inside it), lines ${lc ? `${Math.round(lc.a * 100)}% opaque` : 'faint'}, no fill` }
  }
  // n154: a giant word filled with layered gradients through clip-text (round 14 c2 'CUT': said as a striped card
  // holding null type, built as black letters on a striped box). Say the word and its exact layers on the letters.
  if (f.clipText && (f.bgImage.match(/gradient\(/g) || []).length >= 2 && f.text && f.text.length <= 16 && f.font.size >= 100 && !f.regionKids.length) {
    const face = faceName(f.font.family)
    return { kind: 'heading', note: withFx(`the word ${quote(f.text)} in giant ${face ? `${face} ` : ''}${f.font.weight >= 700 ? 'heavy ' : ''}letters, ${Math.round(f.font.size)}px, weight ${f.font.weight}${f.font.spacing ? `, letter-spacing ${Math.round(f.font.spacing)}px` : ''}, line-height 1, on ONE line, its top-left at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}; the LETTERS THEMSELVES are filled with colour (gradient text: background-clip: text; color: transparent), exactly this background on the word: ${cssHex(f.bgImage)}; NOT a card, NOT a box or block behind the word, no stripes outside the letters, the page shows round them`) }
  }
  // a gradient card holding a short bold line (round 6 c1 front card: said 'near-black "$4,280.00"' as a heading)
  if (grad && !f.clipText && f.text && f.text.length <= 24 && f.kidCount === 0 && h >= 100 && w >= 150 && !f.regionKids.length) {
    return { kind: 'box', note: withFx(`${grad} card (${Math.round(w)}x${Math.round(h)}px as drawn, ${Math.round(f.radius)}px rounded) holding ${f.font.weight >= 700 ? 'bold ' : ''}${Math.round(f.font.size)}px ${textCol ?? colourName(f.colour)} ${quote(f.text)} at its top left`) }
  }
  // a frosted panel with parts in it (round 6 c4 laptop and phone: 'frosted glass' only)
  if (f.glassParts && !f.regionKids.length && fx.includes('frosted glass') && f.glassParts.some((p) => p.type !== 'strip')) {
    const say = (p) => p.type === 'bars' ? `a bar chart of ${p.n} ${colourName(p.fill)} bars rising from ${p.at.bottom}px above its bottom, ${p.at.x}px in from the left, each ${p.w}px wide with ${p.gap}px gaps, heights ${p.hs.join(', ')}px, rounded tops, no axes`
      : p.type === 'ring' ? `a ${p.px}px ${colourName(p.c)} ring ${p.thick}px thick${p.open.length ? `, open on its ${p.open.join(' and ')} quarter (that part of the ring missing)` : ''}, ${p.at.y}px from the top, centred`
        : `${/^[aeiou]/.test(colourName(p.fill)) ? 'an' : 'a'} ${colourName(p.fill)} rounded strip ${p.h}px tall across the top (${p.at.y}px in from the top and sides)`
    return { kind: 'box', note: withFx(`${Math.round(w)}x${Math.round(h)}px panel, ${Math.round(f.radius)}px rounded${bordered ? `, thin ${colourName({ ...f.border.colour, a: 1 })} border` : ''}; inside: ${f.glassParts.map(say).join('; ')}`) }
  }
  // round spots painted over a tile by a pseudo-element (round 6 c5 duotone: yellow shapes on blue, unsaid)
  if (f.pseudoSpots && !f.text && !f.regionKids.length) {
    const base = fill ? f.bg : parse(f.bgImageColours[0] ?? '')
    const sp = f.pseudoSpots.spots
    return { kind: 'box', note: withFx(`${base ? `vivid ${colourName(base)} (${hexOf(base)}) ` : ''}flat duotone tile${bordered && f.border.w >= 3 ? ` with a thick ${colourName(f.border.colour)} border` : ''}, no picture: ${sp.length} hard-edged round ${colourName(sp[0].c)} (${hexOf(sp[0].c)}) shapes on it${sp.map((x) => `${x.d ? ` ${x.d}px` : ''} centred ${x.x}% across, ${x.y}% down`).join(',')}${f.pseudoSpots.inset ? ` (inside a ${f.pseudoSpots.inset}px margin)` : ''}`) }
  }
  // n150: a fanned deck said card by card as its CSS (round 13 c3: built as a paragraph, no cards)
  if (f.fan) {
    const F = f.fan, hx = (c) => { const p = parse(c ?? ''); return p ? hexOf(p) : c }
    const cards = F.cards.map((c, i) => `card ${i + 1}: background ${hx(c.bg)} (${colourName(parse(c.bg))}), ${hx(c.c)} ${JSON.stringify(c.t)} in its top-left corner, transform: rotate(${c.deg}deg)${c.dy ? ` translateY(${c.dy}px)` : ''}`).join('; ')
    return { kind: 'box', note: `a FAN of ${F.cards.length} playing cards (real card shapes, NOT text, NOT a paragraph, no other words): each card ${F.w}x${F.h}px, all stacked at the same top-left ${F.x},${F.y} (position absolute) and each turned round transform-origin ${F.origin} so they spread like a hand of cards, later cards on top; ${new Set(F.cards.map((c) => hx(c.bg))).size >= 3 ? `each card has its OWN background colour (${F.cards.map((c) => colourName(parse(c.bg))).join(', ')}, in that order; NOT all the same colour, each card a separate element with its own inline background); ` : ''}every card ${F.radius} rounded${F.border ? `, ${F.border.replace(/rgb\([^)]*\)/, (m) => hx(m))} border` : ''}${F.shadow ? `, box-shadow ${F.shadow}` : ''}, ${F.size}px ${F.font} corner letters, padding ${F.pad}; ${cards}` }
  }
  // ---- round 5 creative (n61)
  // text set round a circle: a spinning badge (round 5 c2: unsaid)
  if (f.circleText && !f.regionKids.length) {
    const t = f.circleText.text
    const ct = f.circleText
    // big ring letters say their size and that they go all the way round, and a dashed ring says itself
    // (round 8 c2: letters built tiny, only part way round, the dashed circle lost)
    if (ct.size >= 24) {
      const ink = parse(ct.ink ?? '')
      const dr = ct.dashed ? `; a separate thin dashed ${ct.dashed.w}px ${hexOf(parse(ct.dashed.c) ?? { r: 17, g: 17, b: 17, a: 1 })} circle (stroke-dasharray ${ct.dashed.dash.replace(/px/g, '')}, no fill) of radius ${ct.dashed.r}px round the same centre, just outside the letters` : '; no ring outline, no disc behind the letters'
      return { kind: 'circle', note: withFx(`ring of big ${ct.weight >= 800 ? 'heavy ' : ct.weight >= 600 ? 'bold ' : ''}${/[a-z]/.test(t) ? '' : 'capital '}letters ${quote(t, 140)}, ${ct.size}px type${ct.spacing ? `, letter-spacing ${ct.spacing}px` : ''}${ink ? `, ${hexOf(ink)}` : ''}, set on a circle (SVG textPath) of radius ${ct.rad}px centred in a ${ct.px}x${ct.px}px box at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}: the words run ALL the way round the circle, end meeting start, never a partial arc${ringSvg(ct, t, ink ? hexOf(ink) : '')}${dr}`) }
    }
    return { kind: 'circle', note: withFx(`ring of small ${/[a-z]/.test(t) ? '' : 'spaced capital '}letters ${quote(t, 60)} running round a ${ct.px}px circle${ct.disc ? `${ct.ink && parse(ct.ink) ? `, the letters ${hexOf(parse(ct.ink))}` : ''}; they sit ON a SOLID ${hexOf(parse(ct.disc.fill))} filled disc of radius ${ct.disc.r}px (a ${2 * ct.disc.r}px round badge, an SVG <circle> with that fill under the text), no outline` : ', no outline, no fill'}`) }
  }
  // a progress ring made of a conic gradient (round 5 c5: said as a 'near-black block')
  if (f.conicRing && f.conicRing.round && f.conicRing.stops.length >= 2 && !f.regionKids.length) {
    const cr = f.conicRing, arc = cr.stops[0], track = cr.stops[cr.stops.length - 1]
    // several coloured segments: a donut chart, not one progress arc (round 6 e2: 3 segments said as 'indigo arc 46%')
    if (cr.smooth && cr.hole) {
      return { kind: 'box', note: withFx(`a ${cr.px}px ring painted with ONE smooth conic gradient that blends round the circle (exactly: background: ${cr.css}; border-radius 50%), ring ${cr.hole.ring}px thick with a hollow ${colourName(cr.hole.fill)} (${hexOf(cr.hole.fill)}) middle cut by a round inner disc (inset ${cr.hole.ring}px); NOT a donut chart, no segments, no labels, no legend`) }
    }
    if (cr.stops.length >= 3) {
      const segs = cr.stops.slice(0, -1).map((g, i) => `${i ? 'then ' : ''}${colourName(g.c)} ${Math.round(g.to - g.from)}%`)
      const host = fill ? `${colourName(f.bg)} card, ` : ''
      return { kind: 'box', note: withFx(`${host}${cr.title ? `small grey title ${quote(cr.title, 32)} top left, ` : ''}a ${cr.px}px donut chart${cr.hole ? ` (ring ${cr.hole.ring}px thick, hollow ${colourName(cr.hole.fill)} middle)` : ''} centred, segments clockwise from the top: ${segs.join(', ')}, the rest a ${colourName(track.c)} track ${Math.round(100 - track.from)}%${cr.legend ? `; ${cr.legendBelow ? 'a legend row along the bottom' : 'a legend'}, small grey: ${cr.legend.map((t) => quote(t, 24)).join(', ')}` : ''}`) }
    }
    const host = fill ? `${colourName(f.bg)} block, centred in it ` : ''
    return { kind: 'box', note: withFx(`${host}a ${cr.px}px progress ring (not a picture): ${colourName(arc.c)} arc ${Math.round(arc.to - arc.from)}% of the way round from the top, the rest a ${colourName(track.c)} track${cr.label ? `, bold ${quote(cr.label)} in the middle` : ''}`) }
  }
  // a swimlane label: one rule along its top only (round 7 e1 lanes said 'input "▾ WEB APP"')
  if (f.text && f.text.length <= 40 && f.border.w >= 1 && f.border.bottom < 1 && f.border.left < 1 && visible(f.border.colour) && w >= 600 && h <= 60 && !f.kidCount && !f.regionKids.length) {
    return { kind: 'text', note: `a full-width ${f.border.topStyle === 'dashed' ? 'dashed' : 'thin'} ${Math.round(f.border.w)}px ${colourName(f.border.colour)} line across the page (a section divider, not a box or input), and ${Math.round(f.rect.y + h > 0 ? h - f.font.size * 1.2 : 8)}px under it ${f.font.weight >= 600 ? 'bold ' : ''}${Math.round(f.font.size)}px ${colourName(f.colour)} ${f.font.transform === 'uppercase' || f.text === f.text.toUpperCase() ? 'capitals, wide letter-spacing ' : ''}label ${quote(f.text)} at the left` }
  }
  // a head with its count pushed right (round 7 e1 column heads)
  if (f.endKid && !f.pager && !f.regionKids.length && h <= 50) {
    const E = f.endKid
    // a ruled row (accordion header): its rule and its height, or rows build 20-30px taller than drawn (round 7 e4, n107)
    const ruled = f.border.w >= 1 && f.border.bottom < 1 && f.border.left < 1 && visible(f.border.colour)
    const rule = ruled ? `, a thin ${Math.round(f.border.w)}px ${colourName(f.border.colour)} (${hexOf(f.border.colour)}) line along its top; the row is exactly ${Math.round(h)}px tall from that line (h-[${Math.round(h)}px], text centred in it, no extra padding or margin on top of that)` : ''
    return { kind: 'text', note: `one line ${Math.round(w)}px wide: ${f.font.weight >= 600 ? 'bold ' : ''}${Math.round(f.font.size)}px ${quote(f.ownText)} at the left, ${E.bold ? 'bold ' : ''}${colourName(E.ink)} ${quote(E.t)} at the far right end of the same line${rule}` }
  }
  // one line of differently styled runs: a price with its old price struck and a discount tag (round 7 e4)
  if (f.runs && !f.regionKids.length && f.text && f.text.length <= 40 && f.runs.some((x) => x.struck)) {
    const say = f.runs.map((x, i) => `${i ? 'then ' : ''}${x.fill ? `a small ${colourName(x.fill)} tag (${hexOf(x.fill)}, ${colourName(x.ink)} text, 4px rounded) ${quote(x.t, 20)}` : `${x.bold ? 'bold ' : ''}${x.px}px ${colourName(x.ink)} ${quote(x.t, 24)}${x.struck ? ' struck through (line-through)' : ''}`}`)
    return { kind: 'text', note: `one line, left to right, each part a little apart: ${say.join(', ')}` }
  }
  // a task card (kanban): tag, title, bar, avatar, edge, faded and struck when done
  if (f.taskCard && !f.regionKids.length && w <= 420 && h >= 48) {
    const T = f.taskCard
    const parts = [
      T.tag ? `small ${T.tag.px}px bold tag ${quote(T.tag.t)} (${colourName(T.tag.ink)} text on a ${T.tag.fill.r + T.tag.fill.g + T.tag.fill.b > 600 ? `pale ${colourName(T.tag.ink)} tint` : colourName(T.tag.fill)} ${hexOf(T.tag.fill)}, 4px rounded) at the top left` : null,
      `${T.title.bold ? 'semibold ' : ''}title ${quote(T.title.t, 60)}${T.tag ? ' under it' : ''}${T.strike ? ', struck through (line-through)' : ''}`,
      T.bar ? `a thin ${T.bar.h}px ${colourName(T.bar.fill)} (${hexOf(T.bar.fill)}) progress bar ${T.bar.pct}% full on a ${colourName(T.bar.track)} (${hexOf(T.bar.track)}) track under the title${T.bar.w && T.bar.inner && T.bar.w < T.bar.inner - 16 ? ` (the track is a ${T.bar.w}px wide (w-[${T.bar.w}px]), ${T.bar.h}px tall rounded strip at the card's left, ${Math.max(0, T.bar.gap)}px under the title, NOT the card's full width and not at its foot; the grey track shows past the ${T.bar.pct}% green fill)` : ''}` : null,
      T.av ? `a ${T.av.px}px round ${colourName(T.av.fill)} avatar dot (no letter; a full circle ${T.av.px}x${T.av.px}px, never squashed into a bar) in the ${T.av.corner} corner` : null,
    ].filter(Boolean)
    const edge = f.border.left >= 3 && visible(f.border.leftColour) ? `, a ${Math.round(f.border.left)}px ${colourName(f.border.leftColour)} left edge` : ''
    const faded = T.opacity < 0.95 ? `, the whole card faded to ${Math.round(T.opacity * 100)}% opacity (done)` : ''
    return { kind: 'box', note: `${fill ? colourName(f.bg) : 'white'} task card ${Math.round(w)}x${Math.round(h)}px${f.radius >= 4 ? `, ${Math.round(f.radius)}px rounded` : ''}${bordered ? `, thin ${colourName(f.border.colour)} border` : ''}${edge}${faded}: ${parts.join('; ')}` }
  }
  // a short pill label (not a link or button): its fill, border and bold copy (round 5 c4: 'pill input')
  if (f.radius >= h / 2 - 2 && f.kidCount === 0 && f.text && f.text.length <= 24 && h <= 84 && w <= 300 && !/^(a|button|input)$/.test(f.tag) && !f.centred && (bordered || fill) && !/…$|\.\.\.$|^search\b/i.test(f.text) && !f.regionKids.length) {
    const ink = textCol && fill && dist(f.colour, f.bg) > 150 ? `${textCol} ` : ''
    return { kind: 'box', note: withFx(`${fill ? `${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)} ` : ''}pill label${bordered ? ` with a ${Math.round(f.border.w)}px ${colourName(f.border.colour)} border` : ''}, ${f.font.weight >= 600 ? 'bold ' : ''}${ink}${quote(f.text)}`) }
  }

  // a filled card with a thick coloured left edge (a calendar event, round 6 e5 'Launch sync' said as an 'off-white card')
  if (f.text && fill && f.border.left >= 3 && f.border.w < 1 && visible(f.border.leftColour) && !f.regionKids.length && f.kidCount <= 3) {
    const edge = colourName(f.border.leftColour).replace(/^(dark|deep) /, '')
    return { kind: 'box', note: withFx(`pale ${edge} card (${Math.round(w)}x${Math.round(h)}px) with a ${Math.round(f.border.left)}px ${edge} left edge, ${Math.round(f.radius)}px rounded, bold ${quote(f.kidTexts?.[0] ?? f.text, 40)} then ${quote(f.text.replace(f.kidTexts?.[0] ?? '', '').trim(), 40)} under it`) }
  }
  if (f.hasImg && f.text.length < 4) return { kind: 'image', note: withFx(null) }
  // dense app UI: say the structure (columns and rows, weeks, bars, sides) since a box shows none of it
  // (a plain list is only said when nothing else names the block: see the box branch)
  // and only when its parts aren't drawn as marks of their own (stat cards each marked)
  // a gantt's bars and a form's fields aren't marks of their own, so it is said even with its name column and today line drawn
  const dn = f.dense?.type === 'list' || (!/^(gantt|form|messages|week)$/.test(f.dense?.type) && f.regionKids.some((r) => marked.has(r))) ? null : denseNote(f.dense)
  if (dn) {
    const bgName = fill ? colourName(f.bg) : null
    // a titled chart/table/form panel on a near-page card keeps 'card' (it was 'white card "Revenue by month"' before)
    const card = fill && (bordered || f.radius >= 8) && /^(r?table|donut|lines|form)$/.test(f.dense.type) && f.dense.title && bgName && /light grey|white/.test(bgName) && dist(f.bg, page.bg) < 30 ? `${bgName} card` : null
    // an order summary on a faint tint keeps it: a full-height side panel, or a card (round 6 e4: said with no fill)
    const side = !card && fill && f.dense.type === 'order' ? `${bgName} ${f.rect.y <= 2 && f.rect.h >= 860 ? `full-height side panel (${Math.round(f.rect.w)}px wide, flush to the ${f.rect.x + f.rect.w >= 1270 ? 'right' : 'left'} edge, one flat colour, no gradient${f.border.left >= 1 && f.rect.x > 2 ? `, a thin ${colourName(f.border.leftColour)} line down its left edge` : ''})` : 'card'}` : null
    const col = card ?? side ?? (bgName && !(/light grey|white/.test(bgName) && dist(f.bg, page.bg) < 30) ? bgName : null)
    const what = f.tag === 'aside' ? 'sidebar' : null
    return { kind: 'box', note: withFx(`${uniq([col, what]).join(' ')}${col || what ? ', ' : ''}${dn}`) }
  }
  // a row of empty cards: say each card, or a build makes one big box
  if (!f.text && f.emptyCards && !f.regionKids.length) {
    const e = f.emptyCards
    const look = `${e.fill?.a > 0.05 ? `${colourName(e.fill)} ` : ''}cards`
    return { kind: 'box', note: withFx(`${e.vert ? 'a column' : 'a row'} of ${e.n} separate empty ${look}, each ${e.w}x${e.h}px, ${e.gap}px apart${e.bw >= 1 && visible(e.border) ? `, thin ${colourName(e.border)} border` : ''}${e.radius ? `, ${e.radius}px rounded` : ''}, nothing inside them`) }
  }
  // a filled block holding only icon tiles is a block with icons, not a picture
  if (!f.text && fill && f.iconKids && !f.regionKids.length && w >= 30 && h >= 50) {
    const d = f.iconKids, names = d.fills.map((c, i) => `${d.faint[i] ? 'faint ' : ''}${colourName(c)} ${hexOf(c)}`)
    const cols = names.every((n) => n === names[0]) ? `all ${names[0]}` : names.slice(1).every((n) => n === names[1]) ? `first ${names[0]}, the rest ${names[1]}` : names.join(', ')
    const tile = d.round ? 'round dots' : d.radius >= 4 ? 'rounded squares' : 'squares'
    return { kind: 'box', note: withFx(`${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)} (${hexOf(f.bg)}) block (no picture), ${d.fills.length} small ${tile} (${d.px}px) ${d.vert ? 'stacked down from its top' : 'in a row'} ${d.gap}px apart: ${cols}`) }
  }
  // a thin textless filled bar is a placeholder line, not copy (round 8 e3: a grey 420x12 bar built as a sentence)
  if (!f.text && visible(f.bg) && !grad && !f.regionKids.length && w >= 60 && h >= 8 && h <= 20 && f.radius >= 2 && w >= h * 8 && !f.kidCount) return { kind: 'box', note: withFx(`a plain ${hexOf(f.bg)} bar exactly ${Math.round(w)}x${Math.round(h)}px${f.radius >= 2 ? `, ${Math.round(f.radius)}px rounded` : ''} at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}: a skeleton placeholder line, NO words, NOT text, nothing inside`) }
  // n159: a see-through dim the same colour as the page (round 15 e5: a 60% white layer over a white page was
  // not 'filled' against the page, so it got no note and was never built)
  if (!f.text && !fill && !grad && visible(f.bg) && f.bg.a >= 0.3 && f.bg.a <= 0.8 && !f.regionKids.length && w * h >= 0.3 * 1280 * 900) return { kind: 'image', note: withFx(`see-through ${colourName({ ...f.bg, a: 1 })} layer (${hexOf({ ...f.bg, a: 1 })} at ${Math.round(f.bg.a * 100)}% opacity, rgba(${f.bg.r}, ${f.bg.g}, ${f.bg.b}, ${Math.round(f.bg.a * 100) / 100})) laid over the whole page, ${Math.round(w)}x${Math.round(h)}px at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, above everything except the panel on top of it: the page under it still shows but washed out and pale, never left at full strength, nothing inside it`) }
  // a textless filled block with no parts inside is a picture placeholder
  if (!f.text && (fill || grad) && !f.regionKids.length && !round && w >= 60 && h >= 50) {
    // a see-through dim laid over the page (round 5 e1 backdrop said as a solid 'dark navy block')
    if (fill && !grad && f.bg.a >= 0.3 && f.bg.a <= 0.8 && w * h >= 0.3 * 1280 * 900) return { kind: 'image', note: withFx(`see-through ${colourName(f.bg)} layer (${Math.round(f.bg.a * 100)}% opaque) over what is under it: everything under it still shows, dimmed, not hidden`) }
    const glowy = glowWords(f)
    // a rounded tile lit by one glow keeps its base hex, the glow's hex, size and rounding (round 8 c3 violet tile)
    const lone = f.glows && f.glows.length === 1 && f.glows[0].inside && f.radius >= 10 && w <= 700 && h <= 700 && fill ? f.glows[0] : null
    if (glowy && lone) return { kind: 'image', note: [`${glowy} (base ${hexOf(f.bg)}, glow ${hexOf(lone.c)} at full strength fading out: radial-gradient(circle at ${lone.fx}% ${lone.fy}%, ${hexOf(lone.c)}, transparent 60%) over ${hexOf(f.bg)}), a ${Math.round(w)}x${Math.round(h)}px tile with ${Math.round(f.radius)}px rounded corners, plain paint only: no picture, no X, no text`, ...fx].join(', ') }
    if (glowy) return { kind: 'image', note: [glowy, ...fx].join(', ') }
    const stripes = grad && /stripes/.test(grad) ? grad : null
    // a coloured block is part of the look (a dark half, a gradient photo, a mountain cut-out); a pale one is just a picture
    const col = grad ?? (fill && !/light grey|off-white|white/.test(colourName(f.bg)) ? colourName(f.bg) : null)
    const shape = f.clipPoints >= 6 ? 'jagged cut-out shape' : f.clipPoints >= 3 ? 'angled cut-out shape' : null
    const strong = !grad && fill && vivid(f.bg) ? 'vivid ' : ''
    const note = stripes ? `big ${stripes} block` : shape ? `${strong}${col ?? ''} ${shape}`.trim() : col ? `${strong}${col} block` : null
    // n151: a big flat coloured field says its exact size, place and hex (round 13 c5: 'vivid red block' for the red
    // right half was built as a small red square round the ring)
    if (note && !stripes && !shape && fill && !grad && f.bg.a >= 0.9 && w * h >= 0.2 * 1280 * 900 && !fx.length) {
      const X = Math.round(f.rect.x), Y = Math.round(f.rect.y), W = Math.round(w), H = Math.round(h)
      const half = Y <= 2 && H >= 880 && W >= 600 && W <= 680 ? (X <= 2 ? ' (the left half)' : X + W >= 1278 ? ' (the right half)' : '') : ''
      return { kind: 'image', note: `flat ${strong}${col} (${hexOf(f.bg)}) block ${W}x${H}px at ${X},${Y}${half}, behind what sits on it, no border` }
    }
    // a cut-out is drawn as its own outline (a ridge line), not as a picture placeholder:
    // round-3 c1 drew the ridges as X'd boxes and got two rectangles with crossed lines
    // a gradient cut-out photo says its hexes, unrotated size and that it lies flat: round 7 c5's photos were built
    // ~60px off, taller, more saturated (bright teal, near-black brown) and with drop shadows added (n103)
    if (shape && f.clipPoly) {
      const hx = grad && /^linear-gradient/.test(f.bgImage.trim()) && (f.bgImage.match(/gradient\(/g) || []).length === 1 ? [...f.bgImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter((c) => c && c.a >= 0.3) : null
      const dir = f.bgImage.match(/linear-gradient\(\s*(\d+deg)/)?.[1]
      const exact = hx && hx.length === 2 ? `, painted linear-gradient(${dir ? `${dir}, ` : ''}${hexOf(hx[0])}, ${hexOf(hx[1])}) exactly (these hexes, no brighter or darker)` : ''
      const size = Math.abs(f.rotate) >= 2 && f.layoutBox?.w ? `, the shape itself ${f.layoutBox.w}x${f.layoutBox.h}px before the tilt, its top-left at ${Math.round(f.rect.x + (w - f.layoutBox.w) / 2)},${Math.round(f.rect.y + (h - f.layoutBox.h) / 2)} before the tilt` : ''
      const flat = exact && !shadowWords(f) ? ', lying flat on the page: no drop shadow, no border' : ''
      // n137: a gradient cut-out says its corners and place too (round 10 c2: three full-height slanted gradient
      // panels said only by colour never showed; the page stayed near-black)
      const where = grad && !Math.abs(f.rotate || 0) ? `; ${clipWords(f.clipPoly, f.rect, w, h)}; position it absolute at those points${h >= 0.9 * 900 ? ', running the FULL page height from the very top to the very bottom' : ''}, layered BEHIND the words and buttons (they sit on top of it), visible: it must be the painted colour the page shows there, never hidden under the page background` : ''
      // a flat-filled cut-out (round 8 c5's yellow half was built as a yellow-to-orange gradient with the pen's
      // scribble strokes left on top): say its one hex, no gradient, and that the pen lines are only its edge
      const solid = !grad && fill ? `, ONE flat ${hexOf(f.bg)} fill (clip-path polygon, no gradient, no shading, no texture of its own); the drawn strokes are only its outline, never kept as visible lines${f.clipPoly ? `; ${clipWords(f.clipPoly, f.rect, w, h)}, so it covers the ${(() => { const cx = f.clipPoly.reduce((a, q) => a + q[0], 0) / f.clipPoly.length; return cx < 0.42 ? 'LEFT' : cx > 0.58 ? 'RIGHT' : 'middle' })()} part and the rest shows what is under it (do not mirror it)` : ''}` : ''
      return { kind: 'shape', note: withFx(`${note}${exact}${solid}${size}${flat}${where}`), poly: f.clipPoly }
    }
    const sh = shadowWords(f)
    // a rounded flat colour/gradient tile is a plain tile, not a picture (round 8 c3: six masonry tiles read as
    // pictures, rounding unsaid): say its size and rounding and that nothing is inside
    if (note && !shape && !sh && !f.tilt3d && f.radius >= 10 && !stripes && w <= 700 && h <= 700) return { kind: 'box', note: withFx(`${note.replace(/ block$/, '')}${fill && !grad ? ` (${hexOf(f.bg)})` : ''} tile, ${Math.round(w)}x${Math.round(h)}px, ${Math.round(f.radius)}px rounded corners, plain paint only: no picture, no X, no icon, no text`) }
    // a pale tinted thumbnail says its tint, and a selected one its ring (round 7 e4: thumbs built white, ring lost)
    const pale = !note && fill && !grad && hexOf(f.bg) !== '#ffffff' && w <= 200 && h <= 200 ? `pale ${hexOf(f.bg)} filled ${Math.round(w)}x${Math.round(h)}px${f.radius >= 4 ? ` ${Math.round(f.radius)}px rounded` : ''} block (no picture, no X)` : null
    const ringed = f.ring ? `${f.ring.w}px ${colourName(f.ring.colour)} outline ring ${f.ring.off}px out from its edge (the selected one)` : null
    const base = [note ?? pale, ringed].filter(Boolean).join(', with a ') || null
    return { kind: 'image', note: withFx(sh ? `${base ? `${base}, with a ` : ''}${sh}` : base) }
  }
  // a toggle row: a label and a switch
  if (f.toggle && f.text && f.text.length <= 90 && h <= 110 && !f.regionKids.length) {
    const on = f.toggle && dist(f.toggle, { r: 203, g: 213, b: 225 }) > 40 && colourName(f.toggle) !== 'light grey'
    return { kind: 'text', note: `toggle ${on ? 'on' : 'off'} ${quote(f.kidTexts[0] ?? f.text, 40)}` }
  }
  // copy left, one filled button right (a danger zone card)
  if (f.sideButton && !f.regionKids.length && h <= 160) {
    const sb = f.sideButton
    const bc = bordered ? colourName(f.border.colour) : null
    const box = `${fill && dist(f.bg, page.bg) >= 3 ? `${colourName(f.bg)} ` : ''}card${bc && !/light grey|white/.test(bc) ? ` with a ${bc} border` : ''}`
    const ink = sb.firstInk && dist(sb.firstInk, page.colour) > 60 ? `${colourName(sb.firstInk)} ` : ''
    return { kind: 'box', note: `${box}: ${sb.firstBold ? 'bold ' : ''}${ink}${quote(sb.lines[0], 40)}${sb.lines.slice(1).map((t) => `, small grey ${quote(t, 60)} under it`).join('')}; ${colourName(sb.fill)}${sb.ink && dist(sb.ink, sb.fill) > 150 ? ` ${colourName(sb.ink)} text` : ''} button ${quote(sb.t)} on the right` }
  }
  // a spreadsheet formula bar: a cell name box then the formula (round 5 e5: unsaid)
  if (f.kidCount === 2 && /^[A-Z]{1,3}\d{1,5}$/.test(f.kidTexts[0] ?? '') && /^=/.test(f.kidTexts[1] ?? '') && !f.regionKids.length) {
    return { kind: 'box', note: `formula bar ${Math.round(h)}px tall across the page, thin line under: small cell name box ${quote(f.kidTexts[0])} left with a divider, then grey formula ${quote(f.kidTexts[1], 60)}` }
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
    // n137: a bordered square-cornered button says so (round 10 c3 '[ RUN DEMO ]' built as pills)
    const sq = f.radius <= 1 ? ` (${Math.round(w)}x${Math.round(h)}px, square corners: border-radius 0, NOT a pill)` : ''
    if (fill && dist(f.bg, page.bg) >= 12 && f.radius < h / 2 - 2) return { kind: 'button', note: `${colourName(f.bg)}${textCol ? ` ${textCol} text` : ''} button ${quote(f.text)}${sq}` }
    // a one-glyph icon button names its icon and size (round 7 e4 '♡' wishlist: built as a refresh icon)
    const ICON = { '♡': 'an empty heart (wishlist) outline icon', '♥': 'a filled heart icon', '☆': 'an empty star icon', '★': 'a filled star icon', '✕': 'a close X icon', '×': 'a close X icon', '⋯': 'a three-dots icon', '☰': 'a three-line menu icon' }
    const icon = ICON[f.text.trim()]
    if (icon && (!fill || dist(f.bg, page.bg) < 12)) return { kind: 'button', note: `square ${Math.round(w)}x${Math.round(h)}px ${f.radius >= 4 ? `${Math.round(f.radius)}px rounded ` : ''}outline button holding only ${icon} ${quote(f.text.trim())}, centred` }
    if (!fill || dist(f.bg, page.bg) < 12) return { kind: 'button', note: `${colourName(f.border.colour) === 'light grey' ? '' : `${colourName(f.border.colour)} `}outline ${f.radius >= h / 2 - 2 ? 'pill ' : ''}button ${quote(f.text)}${sq}`.trim() }
  }
  if (bordered && (!fill || placeholder) && f.text.length <= 40 && !f.centred && h <= 70 && f.kidCount === 0 && f.tag !== 'a' && f.tag !== 'button') {
    const label = f.labelAbove ? (said.add(f.labelAbove), `label ${quote(f.labelAbove)} above, `) : ''
    return { kind: 'box', note: `${label}${f.radius >= h / 2 - 2 ? 'pill ' : ''}${/^search|search/i.test(f.text) ? 'search ' : ''}input ${quote(f.text)}` }
  }
  // an arch: a filled textless block with a round top and a flat bottom, drawn as its outline
  if (round && !f.text && (fill || grad) && f.radiusBottom <= 2 && !f.regionKids.length && w >= 60 && h >= 60) {
    const ry = f.radiusPct != null ? Math.min(0.5, f.radiusPct / 100) : Math.min(0.5, f.radius / h)
    const poly = [[0, 1], ...Array.from({ length: 9 }, (_, i) => { const a = Math.PI * (1 - i / 8); return [+(0.5 + 0.5 * Math.cos(a)).toFixed(3), +(ry - ry * Math.sin(a)).toFixed(3)] }), [1, 1]]
    const paint = grad ?? `${fill && vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)}`
    // n139: an arch says its exact box and corners (round 10 c5: built as a wobbly SVG traced from the ink with a faded,
    // washed-out middle)
    const rTop = Math.round(Math.min(w / 2, ry * h))
    const css = grad && /^linear-gradient/.test(f.bgImage.trim()) ? `, painted with background: ${f.bgImage.trim().replace(/\s+/g, ' ')} at full opacity (no fade, no overlay)` : ''
    return { kind: 'shape', note: withFx(`${paint} arch (round top, flat bottom): one plain CSS block ${Math.round(w)}x${Math.round(h)}px, top-left at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, border-radius ${rTop}px ${rTop}px 0 0 so the top is a perfect half circle and the sides are straight (not an SVG traced from the ink)${css}`), poly }
  }
  // a lit sphere: a textless round radial blend with an off-centre highlight and a coloured glow (round 7 c1 orb:
  // 'big glowing ... circle' built as a faint glow behind the tiles)
  if (round && square && !f.text && /^radial-gradient/.test(f.bgImage.trim()) && w >= 100) {
    const at = f.bgImage.match(/at\s+([\d.]+)%\s+([\d.]+)%/)
    // n176: a stop with no position kept (round 17 c4 orb: the #fde68a highlight dropped); first 0%, last 100%
    const st0 = [...f.bgImage.matchAll(/(rgba?\([^)]+\))(?:\s*([\d.]+)(%|px))?/g)]
    const st = st0.map((m, i) => ({ c: parse(m[1]), at: m[2] != null ? (m[3] === '%' ? Math.round(+m[2]) : 0) : i === 0 ? 0 : i === st0.length - 1 ? 100 : Math.round(100 * i / (st0.length - 1)) }))
    const sg = f.shadows.find((x) => !x.clear && x.blur >= 10)
    return { kind: 'circle', note: withFx(`a ${Math.round(w)}px solid sphere (border-radius 50%), fully opaque, painted with a radial-gradient(circle at ${at ? `${at[1]}% ${at[2]}%` : 'center'}, ${st.map((x) => `${hexOf(x.c)} ${x.at}%`).join(', ')}) so it looks lit from ${at && +at[1] < 50 ? 'the top left' : 'above'}${sg ? `, with a big soft ${colourName({ ...sg.c, a: 1 })} glow under it (box-shadow ${sg.x}px ${sg.y}px ${sg.blur}px, ${Math.round(sg.c.a * 100)}% opacity)` : ''}${f.floatIn ? `; NOT absolutely placed: it sits INSIDE the running paragraph as its first child, float: ${f.floatIn.side}${f.floatIn.shape ? `, shape-outside: ${f.floatIn.shape}` : ''}, margin ${f.floatIn.m.map((v) => `${v}px`).join(' ')}, so the paragraph's lines wrap round its curve (its top-left lands at ${Math.round(f.rect.x)},${Math.round(f.rect.y)})` : `; absolutely placed, top-left at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, ON TOP of every tile it overlaps (highest z-index, nothing covers it)`}`) }
  }
  if (round && square && f.text.length <= 24 && (fill || grad || bordered)) {
    const glowy = glow || /radial/.test(f.bgImage)
    const words = f.text ? ` with ${quote(f.text)}` : ''
    const paint = grad ? grad.replace(' gradient', '') : fill ? `${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)}` : `${/dotted|double/.test(f.border.topStyle) ? `${Math.round(f.border.w)}px ${f.border.topStyle.toUpperCase()} (border-style ${f.border.topStyle}: ${f.border.topStyle === 'dotted' ? 'a ring of round dots' : f.border.topStyle === 'dashed' ? 'a ring of dashes' : 'two thin rings'}, NOT a solid line) ${hexOf(f.border.colour)} ` : ''}${lineCol(f.border.colour)} outline`
    // size word: a small textless dot (round 5 c2: a 28px red dot said 'big' was built as a 190px red disc)
    const size = f.text ? '' : w >= 120 ? 'big ' : w < 60 ? `small ${Math.round(w)}px ` : ''
    // a flat textless disc >= 60px says its exact size and hex (round 6 c2: a 110px rose dot said 'vivid rose red
    // circle' was built ~100px, a little squashed)
    // a big flat textless disc (round 6 c3 sun: 'big vivid bright orange circle' built as two pale blobs traced from the ink)
    // n151: a big textless outline ring says its size, place and stroke (round 13 c5: 'big white outline circle' built
    // ~100px with a hairline stroke)
    if (!f.text && !fill && !grad && !glowy && bordered && w >= 120 && f.border.w >= 2 && !fx.length) return { kind: 'circle', note: `outline ring ${Math.round(w)}px across at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, a ${Math.round(f.border.w)}px solid ${hexOf(f.border.colour)} border, no fill (see-through middle)` }
    if (!f.text && fill && !grad && !glowy && w >= 60 && !fx.some((x) => /blur|opacity|fade/.test(x))) return { kind: 'circle', note: withFx(`perfectly round solid disc (border-radius 50%, not traced from the ink), ${Math.round(w)}px across, flat fully opaque ${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)} (${hexOf(f.bg)}) fill, hard edge, no blur`) }
    // a filled sticker with a bold outline says the outline and that it casts no shadow: on a brutalist page the
    // build gave it a hard offset shadow and no outline (round 6 c5 'SOLD OUT SOON')
    // a hard offset shadow is said with it (round 8 c3 stickers: 4px 4px solid near-black, unsaid)
    const hardSh = shadowWords(f)
    const rim = f.text && fill && bordered && f.border.w >= 2 ? `, ${Math.round(f.border.w)}px solid ${lineCol(f.border.colour)} outline${hardSh ? `, ${hardSh}` : f.shadows.some((x) => !x.clear) ? '' : ', flat, no shadow'}` : ''
    // a small textless dot says its exact box (round 7 c2: a 22px slider knob said 'small 22px dot' was built ~8px)
    const exactDot = !f.text && fill && w >= 12 && w < 60 ? ` (exactly ${Math.round(w)}x${Math.round(w)}px: w-[${Math.round(w)}px] h-[${Math.round(w)}px], border-radius 50%, not smaller)` : ''
    // a selected swatch says its ring (round 7 e4: the 2px outline 3px out round the picked colour was lost)
    const dotRing = f.ring ? (f.ring.off > 0 ? `, with a ${f.ring.w}px ${lineCol(f.ring.colour)} outline ring ${f.ring.off}px out from its edge, a white gap between (outline + outline-offset, the selected one)` : `, with a ${f.ring.w}px ${hexOf(f.ring.colour)} outline right against its edge (outline, no offset, no gap)`) : ''
    // a big flat disc holding a short word says its size, hex and the word's type (round 8 c2: built as a shaded
    // 3D ball with a small 'FM26')
    const kt = f.kidStyles?.[0]
    if (f.text && fill && !grad && !glowy && !bordered && w >= 120 && !fx.some((x) => /blur|opacity|fade|tilt/.test(x))) return { kind: 'circle', note: withFx(`perfectly round FLAT disc ${Math.round(w)}px across (border-radius 50%), one solid ${hexOf(f.bg)} fill: no gradient, no shading, no highlight, no 3D, no shadow; centred in it ${kt ? `${kt.s}px ${kt.b ? 'heavy ' : ''}${hexOf(kt.c)} ` : ''}${quote(f.text)}`) }
    return { kind: 'circle', note: withFx(`${size}${glowy ? 'glowing ' : ''}${paint} ${!f.text && w < 60 ? 'dot' : 'circle'}${exactDot}${dotRing}${words}${rim}`) }
  }
  // bare dots in a column or row: say how many, size, spacing and each colour
  if (f.dotKids && !f.regionKids.length) {
    if (f.dotKids.dashes) { const d = f.dotKids; return { kind: 'box', note: `${d.dashes.length} short flat dashes in a row (a slide indicator, NOT dots, NOT a progress bar), each ${d.h}px tall${d.radius ? ` ${d.radius}px rounded` : ''}, ${d.gap}px apart, no box around them, left to right: ${d.dashes.map((x) => `${x.w}px ${hexOf(x.fill)}`).join(', ')}` } }
    const d = f.dotKids, names = d.fills.map(colourName)
    const cols = names.every((n) => n === names[0]) ? `all ${names[0]}` : names.slice(1).every((n) => n === names[1]) ? `first ${names[0]}, the rest ${names[1]}` : names.join(', ')
    return { kind: 'box', note: `${d.fills.length} small round dots (${d.px}px) ${d.vert ? 'stacked in a column' : 'in a row'} ${d.gap}px apart, no box around them: ${cols}` }
  }
  // a thin textless filled strip (a reading-progress bar along the top edge): said as a strip, or it
  // reads as a heading line (round 4 c5: built a site title)
  if (fill && !f.text && !f.kidCount && h <= 10 && w >= h * 8) {
    // with a round knob at one end it is a calendar's current-time line (round 6 e5: said 'a progress bar')
    if (f.pseudoDot && h <= 4) return { kind: 'box', note: `thin solid ${colourName(f.bg)} line only ${Math.round(h)}px tall, ${Math.round(w)}px wide, with a ${f.pseudoDot.px}px round ${colourName(f.bg)} dot on its ${f.pseudoDot.at} end (the current-time line), no text` }
    // round top corners and square bottom ones on a wide thin strip: a curved arc, a cinema screen (round 8 e4: 'a progress bar')
    if (f.radius >= h * 0.8 && (f.radiusBottom < 1 || f.radiusBottomFlat)) return { kind: 'box', note: `a thin solid ${hexOf(f.bg)} curved screen arc ${Math.round(w)}px wide, ${Math.round(h)}px tall at its middle, its top edge bowed up and its ends tapering (border-radius: 50% / 100% 100% 0 0), no text (NOT a progress bar)` }
    // a divider says its exact thickness and that the pen line is thicker than it: 'only 2px tall' alone
    // was built ~5px from the drawn stroke (round 6 c2 row rule)
    const divider = f.rect.y > 4 && w >= 400 && h <= 4
    return { kind: 'box', note: `solid ${colourName(f.bg)} strip only ${Math.round(h)}px tall, ${Math.round(w)}px wide, no text (${divider ? `a divider rule, not a bar or button; exactly ${Math.round(h)}px thick (height: ${Math.round(h)}px, Tailwind h-[${Math.round(h)}px], never h-${Math.round(h)} which is ${Math.round(h)*4}px), thinner than the drawn pen line` : 'a progress bar'})${f.rect.y <= 4 ? ' along the top edge' : ''}` }
  }
  // a progress meter with its label lines
  if (f.progress && !f.regionKids.length && f.progress.lines.length <= 3) {
    const p = f.progress
    return { kind: 'box', note: `${p.lines.length ? `${quote(p.lines[0], 30)}, ` : ''}thin progress bar ${p.pct}% filled ${colourName(p.fill)} on a ${colourName(p.track)} track${p.lines[1] ? `, small grey ${quote(p.lines[1], 40)} under` : ''}` }
  }
  // a breadcrumb trail: said, or the build drops it (round 4 e4)
  if ((f.text.match(/ [/›>] /g) ?? []).length >= 2 && f.text.length <= 60 && f.kidCount <= 3 && !f.regionKids.length && h <= 40) {
    return { kind: 'text', note: `small grey breadcrumb ${quote(f.text, 60)}${f.kidCount ? ', last part dark bold' : ''}` }
  }
  // a toolbar: buttons in nested groups, some left and some right (round 4 e4: unsaid)
  if (f.leafButtons.length >= 2 && f.leafButtons.length <= 6 && h <= 70 && f.kidButtons < f.leafButtons.length && !f.regionKids.length && f.leafButtons.map((b) => b.t).join(' ').length >= f.text.length - 4) {
    const mid = f.rect.x + w / 2
    const say = (b) => `${visible(b.fill) && dist(b.fill, page.bg ?? { r: 255, g: 255, b: 255 }) > 6 ? colourName(b.fill) : 'outline'} button ${quote(b.t)}`
    const L = f.leafButtons.filter((b) => b.x < mid), R = f.leafButtons.filter((b) => b.x >= mid)
    return { kind: 'box', note: `toolbar (no box around it): ${L.map(say).join(', ')}${L.length && R.length ? ' on the left; ' : ''}${R.map(say).join(', ')}${R.length && L.length ? ' on the right' : ''}` }
  }
  // a stepper: numbered circles with labels, the done ones filled dark (said as plain links before)
  if (f.stepper && !f.regionKids.length) {
    const st = f.stepper
    const dark = (c) => c && c.a > 0.05 && c.r + c.g + c.b < 200
    return { kind: 'box', note: `step indicator in a row (no box around it): ${st.map((x) => `${st[0].px}px ${dark(x.fill) ? `${colourName(x.fill)} filled circle with white ${x.n}` : `${colourName(x.fill) ?? 'outline'} circle with grey ${x.n}`} then ${dark(x.fill) ? '' : 'grey '}${quote(x.label, 20)}`).join(', ')}` }
  }
  // radio choices: a ring and a label per option, one selected (said as 'buttons' before)
  if (f.radios && !f.regionKids.length) {
    const r = f.radios
    return { kind: 'box', note: `radio options${r.stacked ? ', stacked full width, each a white rounded box' : ' in a row'}: ${r.items.map((x) => `${quote(x.parts[0], 32)}${x.parts.length > 1 ? ` with ${x.parts.slice(1).join(' ')} right` : ''}${x.sel ? ' (selected: filled dark ring' + (x.thick ? ', dark 2px border' : '') + ')' : ''}`).join(', ')}` }
  }
  // a floating menu: short options stacked one per line in a white card with a big soft shadow, one picked out
  // (round 7 e5 status filter: said 'white card "Any status Active ✓ ..."' as run-on text)
  const softSh = f.shadows.find((x) => !x.clear && x.blur >= 16)
  const kbs = f.kidBoxes
  if (softSh && kbs.length >= 3 && kbs.length === f.kidCount && kbs.every((k) => k.t.length <= 24) && kbs.every((k, i) => i === 0 || k.top >= kbs[i - 1].bottom - 2) && !f.regionKids.length && w <= 360) {
    const pitch = Math.round(kbs[1].top - kbs[0].top)
    const on = f.kidOn && kbs.some((k) => k.t === f.kidOn.t) ? `; ${quote(f.kidOn.t)} highlighted (${[f.kidOn.fill ? `${colourName(f.kidOn.fill)} (${hexOf(f.kidOn.fill)}) rounded fill across the menu` : null, f.kidOn.ink ? `${colourName(f.kidOn.ink)} text` : null, f.kidOn.bold ? 'semibold' : null].filter(Boolean).join(', ')})` : ''
    const a = softSh.c ? Math.round(softSh.c.a * 100) : null
    return { kind: 'box', note: `open dropdown menu, ${Math.round(w)}x${Math.round(h)}px ${colourName(f.bg) ?? 'white'} card${f.radius >= 4 ? `, ${Math.round(f.radius)}px rounded` : ''}${bordered ? `, thin ${colourName(f.border.colour)} border` : ''}, big soft shadow ${Math.round(softSh.y)}px down ${Math.round(softSh.blur)}px blur${a !== null && a < 60 ? ` ${a}% opacity` : ''}; absolutely placed, floating ON TOP of whatever is under it (covers it, pushes nothing down); ${kbs.length} options stacked one per line, ${pitch}px apart: ${kbs.map((k) => quote(k.t)).join(', ')}${on}` }
  }
  // a row of buttons
  if (f.kidButtons >= 2 && f.kidButtons === f.kidCount && h <= 120 && !f.regionKids.length) {
    // a row of controls: a placeholder is an input, 'Role: All' or '▾' is a dropdown, the rest are buttons
    const ctl = (t) => /…$|\.\.\.$|^search\b/i.test(t) ? `input ${quote(t)}` : /▾|▼|:\s*\S/.test(t) ? `dropdown ${quote(t.replace(/\s*[▾▼]$/, ''))}` : `button ${quote(t)}`
    const items = f.kidTexts.map(ctl)
    const on = f.kidOn?.fill && f.kidTexts.includes(f.kidOn.t) ? `; ${quote(f.kidOn.t)} selected (${colourName(f.kidOn.fill)} fill)` : ''
    // a filled bar with its own lead copy before the buttons (round 7 e5 bulk bar: '3 selected' and the navy fill unsaid)
    const lead = f.ownText && f.ownText.length <= 32 && fill ? `${colourName(f.bg)} (${hexOf(f.bg)}) bar ${Math.round(w)}x${Math.round(h)}px${f.radius >= 4 ? `, ${Math.round(f.radius)}px rounded` : ''}: ${textCol ? `${textCol} ` : ''}bold ${quote(f.ownText)} at the left, then right beside it (packed at the left after the label, never pushed to the right end) ` : ''
    const ghost = lead && f.kidBoxes.every((k) => !(k.fill?.a > 0.05)) ? 'small outlined buttons (thin see-through white border, no fill, regular weight): ' : 'buttons: '
    // option states in a row of choices (round 7 e4 sizes: M picked by a 2px dark border, XS and XL struck grey; all lost)
    const kb = f.kidBoxes, picked = kb.filter((k) => k.bw >= 2 && kb.filter((j) => j.bw >= 2).length === 1), gone = kb.filter((k) => k.struck)
    const states = kb.length >= 3 && (picked.length || gone.length) && gone.length < kb.length ? `; ${kb.length} equal ${Math.round(kb[0].w)}x${Math.round(kb[0].h)}px ${kb[0].radius >= 4 ? 'rounded ' : ''}outlined boxes in one row${picked.length ? `; ${quote(picked[0].t)} is the picked one (${Math.round(picked[0].bw)}px ${colourName(picked[0].bc)} border${picked[0].bold ? ', bold' : ''}, the others a thin ${colourName(kb.find((k) => k !== picked[0]).bc)} border)` : ''}${gone.length ? `; ${gone.map((k) => quote(k.t)).join(' and ')} unavailable (${colourName(gone[0].ink)} text struck through, ${gone[0].fill?.a > 0.05 ? `${colourName(gone[0].fill)} fill` : 'no fill'})` : ''}` : ''
    // a toolbar of mixed controls packed at the left of a wide row (round 7 e5: 'Columns' was pushed to the far
    // right and the Role / Status carets were lost): say each control's width, the gap, the look, and keep the ▾
    const mixed = !items.every((t) => t.startsWith('button'))
    const kl = f.kidBoxes
    const packed = mixed && !lead && kl.length === f.kidCount && kl.length >= 3 && w >= 500 && kl.every((k) => k.left != null) && kl.every((k, i) => i === 0 || k.left >= kl[i - 1].right - 1) && kl[kl.length - 1].right < w * 0.8
    if (packed) {
      const gaps = kl.slice(1).map((k, i) => Math.round(k.left - kl[i].right)), gap = gaps.every((g) => Math.abs(g - gaps[0]) <= 2) ? gaps[0] : null
      const k0 = kl[0], same = kl.every((k) => Math.abs(k.h - k0.h) <= 2 && k.bw === k0.bw && Math.abs(k.radius - k0.radius) <= 1)
      const look = same ? `each ${Math.round(k0.h)}px tall${k0.fill?.a > 0.05 ? `, ${colourName(k0.fill)} (${hexOf(k0.fill)})` : ''}${k0.bw >= 1 ? `, ${Math.round(k0.bw)}px ${colourName(k0.bc)} (${hexOf(k0.bc)}) border` : ''}${k0.radius >= 4 ? `, ${Math.round(k0.radius)}px rounded` : ''}` : null
      const said = kl.map((k) => { const c = ctl(k.t); const caret = /[▾▼]$/.test(k.t) ? ` with its ▾ caret written after the text, ${quote(k.t)}` : ''; return `${c}${caret} ${Math.round(k.w)}px wide` })
      return { kind: 'box', note: `toolbar row of controls packed at the LEFT, side by side${gap != null ? ` ${gap}px apart` : ''} in this order (shrink-0, each its own width, nothing stretched or pushed to the right end; the row's right part stays empty)${look ? `, ${look}` : ''}, every label on ONE line (whitespace-nowrap; a control grows rather than wrapping, so "Role ▾" never breaks onto two lines): ${said.join(', ')}${on}` }
    }
    // a stepper: filled pills in different states with a separator between (round 8 e4: fills lost, all built plain)
    const fills = new Set(kl.map((k) => (k.fill?.a > 0.05 ? hexOf(k.fill) : 'none')))
    if (!mixed && !lead && kl.length === f.kidCount && kl.length >= 3 && kl.every((k) => k.fill?.a > 0.05 && k.radius >= k.h / 2 - 2) && fills.size >= 2) {
      const sep = (f.ownText ?? '').replace(/\s+/g, '')[0]
      return { kind: 'box', note: `a stepper: ${kl.length} filled pills in one row${sep ? `, a small grey "${sep}" between each pair` : ''}, each ${Math.round(kl[0].h)}px tall (border-radius 999px), left to right: ${kl.map((k) => `${quote(k.t)} ${hexOf(k.fill)} fill, ${k.bold ? 'bold ' : ''}${hexOf(k.ink)} text`).join('; ')}` }
    }
        return { kind: 'box', note: (mixed ? items.join(', ') : `${lead}${lead ? ghost : 'buttons: '}${f.kidTexts.map((t) => quote(t)).join(', ')}`) + on + states }
  }
  // a bar with one item at each end (a logo left, links right): round 5 c1 nav and c3 frosted header were unsaid
  const kb = f.kidBoxes
  if (!f.regionKids.length && !f.pager && f.kidCount === 2 && kb.length === 2 && h <= 100 && w >= 600 && kb.every((k) => k.t.length <= 48) && Math.abs(kb[0].top - kb[1].top) < 30 && kb[0].w + kb[1].w < w * 0.8) {
    const lk = [kb[0].bold && !kb[1].bold ? 'bold' : null, kb[0].s >= kb[1].s + 2 ? `${kb[0].s}px` : null, kb[0].spacing >= 0.1 ? 'wide-spaced' : null].filter(Boolean).join(' ')
    const line = f.border.bottom >= 1 && !bordered ? `, ${f.border.bottom >= 2 ? 'thick' : 'thin'} line under` : ''
    const isBar = fill || frosted || line || /^(nav|header)$/.test(f.tag)
    const barLook = uniq([...fx, fill && !frosted ? colourName(f.bg) : null, f.tag === 'nav' ? 'nav' : null]).join(' ')
    const drawnBar = fill || frosted || line
    return { kind: isBar ? 'box' : 'text', note: `${!drawnBar && isBar ? 'nav, no box around it: ' : ''}${drawnBar ? `${barLook ? `${barLook} ` : ''}bar ${Math.round(h)}px tall${f.rect.y <= 60 ? ' across the top' : ''}${line}: ` : ''}${lk ? `${lk} ` : ''}${kb[1].left != null && kb[0].right != null && kb[1].left - kb[0].right <= w * 0.25 ? `${quote(kb[0].t)} at the left, then ${quote(kb[1].t, 48)} right after it (its left edge ${Math.round(kb[1].left - kb[0].right)}px after the first; NOT pushed to the bar's far right end, the rest of the bar stays empty)` : `${quote(kb[0].t)} left, ${quote(kb[1].t, 48)} right`}` }
  }
  // a plain link underlined by a bottom rule (round 5 c4 'Shop summer →' was built as a dark pill button)
  if (f.tag === 'a' && ruled && !fill && !grad && !bordered && f.kidCount === 0 && short && h <= 60) {
    return { kind: 'text', note: `${f.font.weight >= 600 ? 'bold ' : ''}link ${quote(f.text)} with a ${Math.round(f.border.bottom)}px underline (no box, not a button)` }
  }
  // wide is fine for a filled, centred one-line label (a full-width pay button)
  const buttonish = (/^(a|button)$/.test(f.tag) || ((fill || bordered || grad) && f.centred)) && short && h <= 90 && f.kidCount <= 1 && (w <= 420 || (fill && f.centred && h <= 70))
  if (buttonish) {
    if (grad) look.push(grad)
    else if (fill) look.push(colourName(f.bg))
    else if (bordered) look.push(`${colourName(f.border.colour)} outline`)
    // a near-black fill says its hex: round 7 e4 'dark navy' #111827 'Add to bag' was built a clear navy blue
    const inky = !grad && fill && Math.max(f.bg.r, f.bg.g, f.bg.b) <= 50 && Math.max(f.bg.r, f.bg.g, f.bg.b) - Math.min(f.bg.r, f.bg.g, f.bg.b) <= 30 && f.bg.a >= 0.9
    if (inky && colourName(f.bg) !== 'black') look.push(`(${hexOf(f.bg)}, near-black, not a blue)`)
    if (f.radius >= h / 2 - 2) look.push('pill')
    // n130: a square-cornered button says so (round 9 c1, c4: radius 0 CTAs built as pills)
    const squareBtn = (fill || bordered || grad) && f.radius <= 8 ? (f.radius <= 1 ? 'square corners: border-radius 0' : `barely rounded: border-radius ${Math.round(f.radius)}px`) : null
    if (glow) look.push('glowing'); if (hardShadow && !shadowWords(f)) look.push('hard offset shadow')
    if (w > 420) look.push('full-width')
    if (textCol && fill) look.push(`${textCol} text`)
    const kind = f.kidCount === 0 || f.tag === 'a' || f.tag === 'button' || fill || bordered ? 'button' : 'text'
    return { kind, note: `${uniq(look).join(' ')} button ${quote(f.text)}${squareBtn ? ` (${Math.round(w)}x${Math.round(h)}px, ${squareBtn}, NOT a pill)` : ''}${hardShadow && shadowWords(f) ? `, with a ${shadowWords(f)}` : ''}`.replace(/\s+/g, ' ').trim() }
  }
  if (f.regionKids.length && f.regionKids.every((r) => marked.has(r)) && !fill && !bordered && !grad && !frosted) {
    // its parts are drawn, but text of its own (a card title, a caption) still needs saying
    // (text already said by a part's note, a field label or a heading's sub-line, isn't said twice)
    const loose = f.looseTexts.filter((t) => !said.has(t))
    if (f.looseBeside && !loose.some((t) => said.has(t))) {
      const { side, lines, small } = f.looseBeside
      const big = small[0]
      const said1 = lines.map((t, i) => i === 0 ? quote(t, 60) : small[i] < big * 0.8 && t.length <= 30 ? `small ${quote(t)}` : `text ${quote(t, 110)}`)
      return { kind: null, note: `${side} the picture: ${said1.join(', ')}` }
    }
    // a sidebar's title and nav items: said as stacked links, or the build invents its own (round 4 e4)
    if (f.dense?.type === 'list' && f.dense.stacked && f.dense.items.every((p) => p.length === 1 && p[0].length <= 24) && f.dense.items.length <= 8) {
      const d = f.dense
      return { kind: null, note: `${d.head ? `${quote(d.head, 24)}, then ` : ''}stacked links: ${d.items.map((p) => quote(p[0]) + (p[0] === d.on ? ' (highlighted)' : '')).join(', ')}` }
    }
    const own = loose.find((t) => t.length >= 4)
    return { kind: null, note: own && loose.join(' ').length <= 140 ? `${quote(own, 40)}${loose.length > 1 ? ' and text' : ''}` : null }
  }
  // a rounded filled tile holding only copy (said below as tile + ink): checked before the heading branch, as a
  // 30px tile line went to it and lost its fill (round 8 c3 near-black '2.4M' tile built as bare text)
  const textTile = fill && !grad && !f.regionKids.length && f.kidCount === 0 && f.radius >= 10 && w >= 150 && h >= 150 && f.text.length <= 140 && !f.motion
  if (!textTile && (/^h[1-3]$/.test(f.tag) || f.font.size >= 30)) {
    const tw = typeWords(f, page)
    if (f.clipText && grad) tw.push(`${grad} text`); else if (textCol) tw.push(textCol)
    // gradient-filled words inside (round 6 c1 'three dimensions' cyan to pink, unsaid)
    const ck = !f.clipText && f.clipKid && f.clipKid.t && f.clipKid.t !== f.text ? gradientWords(f.clipKid) : null
    const ckSay = ck ? `, the words ${quote(f.clipKid.t)} filled with a ${ck} (gradient text), the rest plain` : ''
    // on a band, the type's colour is said even when it is the page's: round 3 c2's near-black words on the
    // orange band were built white like the black band's
    // the band is the whole block, filled edge to edge, and left-set type says so: 'on a yellow band' was
    // built as a yellow strip behind the letters only, and the masthead centred (round 6 c5, n89)
    if (fill && !f.clipText && w > 300) tw.push(`${textCol ? '' : `${colourName(f.colour)} letters `}on a ${colourName(f.bg)} (${hexOf(f.bg)}) band (${Math.abs(f.rotate) >= 2 && Math.abs(f.rotate) <= 45 && f.layoutBox?.h ? `the band itself ${f.layoutBox.w}x${f.layoutBox.h}px before the tilt (height: ${f.layoutBox.h}px, only ${f.layoutBox.h}px thick; the tilt alone makes its outline ${Math.round(h)}px tall), filled ${colourName(f.bg)} edge to edge` : `the whole ${Math.round(w)}x${Math.round(h)}px block filled ${colourName(f.bg)} edge to edge`}${!f.centred && !f.motion && f.inset ? `, type left-aligned ${Math.round(f.inset.l)}px in from its left, not centred` : ''})`)
    const under = f.lineUnder ? (said.add(f.lineUnder), `, line under: ${quote(f.lineUnder, 60)}`) : ''
    const sk = f.subKid && f.text.endsWith(f.subKid.t) && f.text.length > f.subKid.t.length ? f.subKid : null
    if (sk) {
      const head = f.text.slice(0, f.text.length - sk.t.length).trim()
      const small = sk.corner && sk.lines ? `and a small ${sk.px}px ${sk.mono ? 'mono ' : ''}${sk.bold ? 'bold' : 'regular'} block set absolutely in the block's TOP-RIGHT corner (${sk.corner.y}px down, flush right${sk.corner.right ? ', right-aligned' : ''}${sk.corner.spacing ? `, letter-spacing ${sk.corner.spacing}px` : ''}), ${sk.lines.length} lines: ${sk.lines.map((l) => quote(l, 30)).join(' / ')} (small, not part of the big type, not under it)${f.border.bottom >= 3 && !bordered ? `; a ${f.border.bottom}px solid ${hexOf(f.border.bottomColour ?? f.colour)} rule along the block's bottom edge, the whole ${Math.round(w)}px width (border-bottom), ${Math.round(h)}px below its top` : ''}` : `then on its own line under it a small ${sk.px}px ${sk.mono ? 'mono ' : ''}${sk.bold ? 'bold' : 'regular'} line ${quote(sk.t, 60)} (small, not part of the big type)`
      // a tall filled cell with the type in its top-left corner: say where, or the build centres it
      // (round 6 c5 '£4' price block built centred in its yellow cell)
      const corner = fill && !f.centred && h >= 120 && f.inset ? `; both lines sit in the top-left corner of the block, ${Math.round(f.inset.l)}px in from its left and ${Math.round(f.inset.t)}px down from its top, left-aligned (not centred), the rest of the block empty` : ''
      return { kind: 'heading', note: withFx(`${tw.join(' ')} ${Math.round(f.font.size)}px ${quote(head, 60)}${ckSay}, ${small}${corner}`.trim()) }
    }
    // a display line's own breaks and a giant word's width: builds rewrapped a 2-line headline into 3
    // (round 6 c3) and set a 260px word ~1.1x too wide (round 6 c2)
    const sl = f.shown && f.font.size >= 40 && !f.motion ? f.shown.lines.map((t) => (f.font.transform === 'uppercase' ? t.toUpperCase() : t)) : null
    const brk = sl && sl.length >= 2 && sl.length <= 4 ? `, set in exactly ${sl.length} lines: ${sl.map((t) => quote(t, 40)).join(' / ')} (keep these breaks; each line stays whole on one line, never wrapped again, white-space: nowrap, no max-width narrower than the longest line, about ${f.shown.w}px wide)` : ''
    // a word repeated line by line, each line fainter (round 8 c2: the four SOUNDs built all solid)
    const ks = f.kidStyles?.length === sl?.length ? f.kidStyles : null
    const fadeSay = brk && ks && ks.some((k) => k.o < 0.95) ? `; each line its own block with its own opacity, top to bottom: ${ks.map((k) => `${Math.round(k.o * 100)}%`).join(', ')} (the lower lines fade out; never all solid)` : ''
    // a giant one-line word also says its type size: a width alone let the build take the drawn line
    // height (round 6 c2 'Tickets →' 110px type built ~127px, ~1.15x large)
    const wide = sl && sl.length === 1 && f.font.size >= 100 ? `, ${Math.round(f.font.size)}px type, about ${f.shown.w}px wide (no larger)${f.font.size >= 300 ? `, absolutely placed: its box's top-left at ${Math.round(f.rect.x)},${Math.round(f.rect.y)} and its first letter's ink starting at x=${f.shown.x} (not further right)` : ''}` : ''
    // n146: a giant multi-line block says its type size and where its box starts (round 12 c2 'LOUD/ROOM' 330px built ~100px low)
    const bigAt = brk && f.font.size >= 160 ? `, ${Math.round(f.font.size)}px type, the text box's top-left at ${Math.round(f.rect.x)},${Math.round(f.rect.y)} (top-[${Math.round(f.rect.y)}px]; the first line starts there, not lower)` : ''
    // a display line of several words that fits on one line says so: the build wrapped it at the drawn width
    // (round 6 c4 'Every screen, one glance.' 56px, one line, built on 2 lines over the subline)
    // a 20-39px multi-word line set on one line says its size and the one line: round 7 c5's 30px 'read this
    // first!' hand note was built on 2 lines (n103)
    const mid = !f.motion && f.shown && f.shown.lines.length === 1 && f.font.size >= 20 && f.font.size < 40 && /\s/.test(f.text.trim()) && f.text.length <= 40 ? `, ${Math.round(f.font.size)}px type on ONE line (white-space: nowrap, never wrapped), about ${f.shown.w}px wide` : ''
    // a one-word page title near the top says its size and top: 'Overview' (26px bold, top 28) was said as the
    // word alone and built ~10px high with everything under it drifting (round 6 e2)
    const ttl = !mid && !f.motion && !fill && f.shown && f.shown.lines.length === 1 && f.font.size >= 20 && f.font.size < 40 && !/\s/.test(f.text.trim()) && f.text.length <= 24 && f.rect.y <= 120 ? `, ${Math.round(f.font.size)}px ${f.font.weight >= 600 ? 'bold ' : ''}type on one line, its box top ${Math.round(f.rect.y)}px from the page top and ${Math.round(f.rect.h)}px tall (top-[${Math.round(f.rect.y)}px] or the same margin, line-height ${Math.round(f.rect.h)}px; not higher)` : ''
    const one = sl && sl.length === 1 && f.font.size >= 40 && f.font.size < 100 && /\s/.test(f.text.trim()) ? `, on ONE line (white-space: nowrap, never wrapped), about ${f.shown.w}px wide` :''
    // n152: a one-line headline centred on the page says so (round 13 e5 pricing headline built left-aligned)
    const midX = f.shown ? f.shown.x + f.shown.w / 2 : 0
    const centreSay = one && f.centred && f.rect.w >= 900 && Math.abs(midX - 640) <= 12 && f.shown.x >= 120 ? `, CENTRED on the page (text-align center; its text runs from x=${f.shown.x} to x=${f.shown.x + f.shown.w}, centre at x=640; NOT left-aligned)` : ''
    // n137: a small label just above a giant word (round 10 c2 '01 /' mono numbers): no mark carries it
    const LA = f.labelAboveStyle && f.font.size >= 40 && f.labelAbove ? f.labelAboveStyle : null
    const lab = LA ? (said.add(f.labelAbove), `; plus a small separate ${LA.px}px ${isMono(LA.family) ? 'monospace (font-family Courier New, monospace) ' : ''}${hexOf(LA.colour)} label ${quote(f.labelAbove, 32)}${LA.ls >= 1 ? ` with ${Math.round(LA.ls)}px letter-spacing` : ''} at ${LA.x},${LA.y}, ${LA.gap}px above it and left-aligned with it (keep it, it is part of this heading)`) : ''
    return { kind: 'heading', note: withFx(`${tw.join(' ')} ${quote(f.text, 60)}${ckSay}${brk}${bigAt}${fadeSay}${wide}${one}${centreSay}${mid}${ttl}${under}${lab}`.trim()) }
  }
  // a row of short items (nav links, tabs)
  if (f.kidCount >= 3 && f.kidTexts.length >= 3 && f.kidTexts.every((t) => t.length <= 16) && h <= 80 && !f.regionKids.length) {
    const on = f.kidOn && f.kidTexts.includes(f.kidOn.t) ? `; ${quote(f.kidOn.t)} selected (${[f.kidOn.bold ? 'bold' : null, f.kidOn.ink ? `${colourName(f.kidOn.ink)} text` : null, f.kidOn.under ? `${colourName(f.kidOn.under)} underline` : null, f.kidOn.fill ? `${colourName(f.kidOn.fill)} fill` : null].filter(Boolean).join(', ')})` : ''
    const L = f.kidLead && f.kidLead.t === f.kidTexts[0] && f.kidLead.t !== f.kidOn?.t && f.kidLead.t.length <= 24 ? f.kidLead : null
    const lead = L ? `${[L.bold ? 'bold' : null, L.px ? `${L.px}px` : null, L.ink ? colourName(L.ink) : null].filter(Boolean).join(' ')} ${quote(L.t)} first, then ` : ''
    const items = L ? f.kidTexts.slice(1, 9) : f.kidTexts.slice(0, 8)
    const P = f.kidPicks, picks = P ? [
      P.outl ? (P.pill ? `; ${P.outl.map((x) => quote(x, 16)).join(', ')} are each a small outlined pill chip (${P.pill.h}px tall, fully rounded, 1px ${colourName(P.pill.ink)} border, white inside), never bare words` : `; ${P.outl.join(', ')} are small outlined buttons`) : '',
      P.seg && !on ? `; ${P.seg.items.join(' / ')} is one ${P.seg.bordered ? 'outlined ' : ''}switch with ${quote(P.seg.t)} selected (${colourName(P.seg.fill)} fill, ${colourName(P.seg.ink)} text)` : '',
      P.dot ? `; ${quote(P.dot.t)} sits in a ${P.dot.px}px round ${colourName(P.dot.fill)} circle, ${colourName(P.dot.ink)} number` : '',
    ].join('') : ''
    const Sp = f.kidSplit, split = Sp && Sp.right.length <= 3 ? `; ${Sp.left.map((x) => quote(x, 20)).join(', ')} sit together at the left, ${Sp.right.map((x) => quote(x, 24)).join(', ')} pushed to the far right (${Sp.gap}px gap)` : ''
    if (f.kidSteps) {
      const S = f.kidSteps, cur = S.items.findIndex((x) => x.bold)
      const said = S.items.map((x, i) => `${quote(x.t)} (${[[x.bold ? 'bold' : null, colourName(x.ink)].filter(Boolean).join(' '), i === cur ? 'current step' : null].filter(Boolean).join(', ')})`)
      return { kind: fill || bordered ? 'box' : 'text', note: `progress steps in one row, each pair joined by a short ${S.line.w}px ${S.line.h}px-thin ${colourName(S.line.fill)} line: ${said.join(' — ')}` }
    }
    const K = !Sp && f.kidPack, pack = K ? `; all of these sit together at the LEFT, one after another, ending ${K.end}px in (the right ${Math.round(100 - 100 * K.end / K.w)}% of the bar is empty, nothing pushed right)${K.field ? `; ${quote(K.field.t, 24)} is an outlined search field ${K.field.w}px wide, grey placeholder` : ''}` : ''
    // n133: a filled bar's own shape and place: round 9 e1's toolbar (a 20px-round pale pill inset 12px) was
    // built as a square full-width strip, and its sheet tabs (pinned to the page bottom) built right under the grid
    const R = f.rect, pill = fill && w >= 600 && f.radius >= Math.min(12, h / 2 - 2)
    const shape = pill ? `a ${f.radius >= h / 2 - 1 ? 'fully rounded' : `${Math.round(f.radius)}px-rounded`} ${hexOf(f.bg)} pill ${Math.round(w)}x${Math.round(h)}px at x ${Math.round(R.x)}, top ${Math.round(R.y)} (inset from the page sides, NOT a square full-width strip), ` : ''
    const foot = fill && w >= 600 && R.y + h >= 896 ? `; this bar is pinned to the very BOTTOM of the page (top ${Math.round(R.y)}, its bottom edge on the page's bottom edge, position absolute/fixed bottom 0), never placed right under the content above` : ''
    return { kind: fill || bordered ? 'box' : 'text', note: `${shape || (fill && w >= 600 ? `${colourName(f.bg)} bar ${Math.round(h)}px tall across the page, ` : '')}${lead}links: ${items.join(', ')}${on}${picks}${split}${pack}${foot}` }
  }
  // a big pane with parts (a message list, a reading pane, a form column) is a box even unfilled:
  // as plain text it was left unsaid (round 4 e2 message list and reading pane, e4 sidebar)
  const pane = w >= 260 && h >= 300 && f.kidCount >= 2
  if (fill || grad || bordered || ruled || pane || /^(nav|header|aside|table|input|textarea|form)$/.test(f.tag) || f.regionKids.length) {
    look.push(...fx)
    // a strong opaque fill says 'vivid', or the build softens it (round 4 c5 #fde047 card built pale cream)
    if (glowWords(f)) look.push(glowWords(f)); else if (grad) look.push(grad); else if (fill && !frosted) look.push(`${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)}${textCol && dist(f.colour, f.bg) > 150 && f.bg.r + f.bg.g + f.bg.b < 120 ? ` (exactly ${hexOf(f.bg)})` : ''}`)
    // light text on a dark filled block says so, or the block's colour reads as the text's
    // (round 3 c4: 'vertical near-black "INDEX OF THINGS"' built black text, no rail)
    const lightText = fill && !frosted && textCol && dist(f.colour, f.bg) > 150 ? `, ${textCol} text` : ''
    const bc = bordered ? colourName(f.border.colour) : null
    // a card the same as the page: the box shows it. A tint the eye still sees is said, or the build picks
    // its own fill (round 1 e4's pale grey office card was built dark navy)
    if (fill && /light grey|white|pale grey/.test(colourName(f.bg)) && dist(f.bg, page.bg) < 6) look.pop()
    else if (fill && /light grey|white|pale grey/.test(colourName(f.bg)) && dist(f.bg, page.bg) < 30 && !/card/.test(look.join(' '))) look.push('card')
    if (bordered && f.border.w >= 3) look.push(`thick ${bc} border`)
    else if (bordered && !fill && !/grey|white/.test(bc)) look.push(`${bc} border`)
    if (hardShadow && !shadowWords(f)) look.push('hard offset shadow')
    if (ruled) look.push('thick rule under')
    const what = f.tag === 'table' ? 'table' : f.tag === 'nav' ? 'nav bar' : f.tag === 'aside' ? 'sidebar' : null
    // only say it when there is something a box can't show
    // ...and names the filled thing, so the colour can't be read as the text's (a reading turned
    // 'vertical near-black, light grey text' into near-black text on the page)
    // a filled card with a title and copy names the block too: 'mint green "Wait", text ...' coloured the
    // title and left the card dark like its neighbour (round 4 c5)
    const filledCard = (fill || grad) && !frosted && !f.regionKids.length && f.kidTexts.length >= 2 && !look.includes('card')
    const noun = (lightText || filledCard) && !what && !look.some((x) => / block\b/.test(x)) ? (Math.max(w, h) >= 4 * Math.min(w, h) ? 'bar' : 'block') : null
    // a rounded filled tile holding only copy says the tile and the ink apart (round 8 c3: a near-black text tile
    // said 'off-white "2.4M ..."' was built with no tile; 'pale pink 24px text' turned the quote's ink pink)
    if (textTile) {
      const tt = `${f.font.size >= 20 ? `${Math.round(f.font.size)}px ` : ''}${f.font.weight >= 700 ? 'heavy ' : f.font.weight >= 600 ? 'bold ' : ''}${/georgia|serif/i.test(f.font.family) && !/sans/i.test(f.font.family) ? 'serif ' : ''}${f.font.style === 'italic' ? 'italic ' : ''}`
      const corner = f.inset ? `, in its top-left corner (${Math.round(f.inset.l)}px in, ${Math.round(f.inset.t)}px down), the rest of the tile empty` : ''
      return { kind: 'box', note: withFx(`${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)} (${hexOf(f.bg)}) filled tile ${Math.round(w)}x${Math.round(h)}px, ${Math.round(f.radius)}px rounded corners, flat (no shadow); on it ${tt}${hexOf(f.colour)} text ${quote(f.text, 140)}${corner}`.replace(/ {2,}/g, ' ')) }
    }
    const say = uniq([...look, noun, what]).join(' ') + lightText
    const head = f.kidTexts[0] && f.kidTexts[0].length <= 40 ? f.kidTexts[0] : null
    const list = f.dense?.type === 'list' && !f.regionKids.length ? denseNote(f.dense) : null
    // a titled card: its title and one short line are copy a person types, or the build invents its own
    // (round 3 c4 cards built with made-up body copy from '"Manifesto" and text')
    const titled = !f.regionKids.length && !list && head && f.kidTexts.length === 2 && f.kidTexts[1].length <= 110
      ? `${titleWords(kb, h)}${quote(head)}, text ${quote(f.kidTexts[1], 110)}`
      // a short info card (an address, hours, an email): every line is copy, or the build invents an address
      : !f.regionKids.length && !list && head && f.kidTexts.length >= 3 && f.kidTexts.length <= 7 && f.kidTexts.join(' ').length <= 160
        ? `${quote(head)}, lines ${f.kidTexts.slice(1).map((t, i) => lineWords(f, i + 1) + quote(t, 110)).join(', ')}${f.kidReach && f.kidReach < 0.55 && h >= 200 ? ', all at the top of the card, empty below' : ''}` : null
    // a card's heading over one filled button, maybe set at the bottom (round 5 c5 CTA said as 'cards')
    const lastK = kb[kb.length - 1], under = visible(f.bg) ? f.bg : page.bg
    const btn = !f.regionKids.length && kb.length === 2 && lastK.t.length <= 24 && lastK.h >= 26 && lastK.h <= 64 && visible(lastK.fill) && dist(lastK.fill, under) > 40 ? lastK : null
    const ctaCard = btn ? `${kb[0].s >= 24 ? `big ${kb[0].s}px${kb[0].bold ? ' bold' : ''} ` : ''}${quote(kb[0].t, 60)}, then ${btn.w >= w * 0.75 ? 'full-width ' : ''}${colourName(btn.fill)}${btn.ink && dist(btn.ink, btn.fill) > 150 ? ` ${colourName(btn.ink)} text` : ''} button ${quote(btn.t)}${kb[0].top >= h * 0.45 ? ', both at the bottom of the card, empty above' : ''}` : null
    const code = !f.regionKids.length ? codeNote(f) : null
    // a marquee says its repeated copy (round 5 c2: unquoted)
    const unit = f.motion && f.text.length > 40 ? repeatUnit(f.text) : null
    const unitSay = unit ? `${kb[0]?.bold ? 'bold ' : ''}${kb[0]?.s ?? Math.round(f.font.size)}px ${quote(unit, 60)} repeated along it` : null
    // one block of copy with no parts (a pull quote on a yellow tile: round 5 c5, said with no copy)
    // ...in the top-left corner of a tall box when it sits there, or the build drops it low (round 6 c5 quote)
    const loneCorner = !f.centred && h >= 160 && f.inset && f.textTop != null && f.textTop - f.rect.y <= f.inset.t + 12 ? `, in the top-left corner (${Math.round(f.inset.l)}px in, ${Math.round(f.inset.t)}px down), the rest of the box empty` : ''
    const lone = !f.regionKids.length && f.kidCount === 0 && (f.text.length > 40 || (f.text.length > 24 && !f.vertical && f.font.size >= 20 && f.font.weight >= 600)) && f.text.length <= 140 ? `${f.font.weight >= 600 ? 'bold ' : ''}${Math.round(f.font.size)}px text ${quote(f.text, 140)}${loneCorner}` : null
    // a picture painted by ::before over a card's copy (round 6 e1 featured card: square and body line unsaid)
    const pp = f.pseudoPic && !f.regionKids.length ? f.pseudoPic : null
    const ppLines = pp ? f.setLines.map((t) => t.trim()).filter(Boolean).map((t) => { const k = kb.find((x) => x.t === t); return k ? `${k.s >= 20 ? `big ${k.s}px ` : ''}${k.bold ? 'bold ' : ''}${k.ink && f.colour && dist(k.ink, f.colour) > 60 ? `${colourName(k.ink)} ` : ''}${quote(t, 60)}` : `text ${quote(t, 110)}` }) : []
    const picSay = pp ? `a ${pp.w}x${pp.h}px ${pp.radius >= 6 ? 'rounded ' : ''}${pp.grad ? `${colourName(pp.grad[0])} to ${colourName(pp.grad[pp.grad.length - 1])} gradient` : colourName(pp.fill)} ${Math.abs(pp.w - pp.h) <= 4 ? 'square' : 'block'} in its top left (${pp.x}px in), then under it, lines: ${ppLines.join(', ')}` : null
    // a word turned on its side beside the copy (round 6 c5 'LOUD': said as '"LOUD" and text')
    const tk = f.turnedKid && !f.regionKids.length ? f.turnedKid : null
    // the turned word comes first and is counted as one of two parts: said after the copy as 'and a ...',
    // the build dropped it (round 6 c5 'LOUD', n88)
    const turned = tk ? `two parts: (1) a ${tk.px}px ${tk.bold ? 'heavy ' : ''}${quote(tk.t)} turned on its side (rotate(${tk.deg}deg), reading ${tk.deg < 0 ? 'bottom to top' : 'top to bottom'}) along the left edge (${Math.max(0, tk.at.x)}px in from it), its end ${tk.at.bottom}px above the bottom, the whole turned word inside the box, none of it cut off; (2) text ${quote(f.text.replace(tk.t, '').trim(), 140)} at the top` : null
    // a big bold figure over a small line (round 6 c4 badge: said as one run of text)
    const fig = !f.regionKids.length && kb.length === 1 && kb[0].bold && kb[0].s >= f.font.size * 1.5 && f.ownText && f.ownText.length <= 40 ? `big ${kb[0].s}px bold ${quote(kb[0].t)} over ${Math.round(f.font.size)}px ${quote(f.ownText)}` : null
    const copy = turned ?? fig ?? picSay ?? code ?? unitSay ?? ctaCard ?? lone ?? (titled ? titled : f.text && f.text.length <= 40 && !f.regionKids.length ? quote(f.text) : list ? list : head && !f.regionKids.length ? (f.ownText && f.ownText.length <= 24 ? `${f.font.weight >= 600 ? 'bold ' : ''}${Math.round(f.font.size)}px ${quote(f.ownText)} logo text at the left (n156), then ${quote(head)}` : `${quote(head)} and text`) : '')
    const shadowTail = hardShadow && shadowWords(f) ? `, with a ${shadowWords(f)}` : ''
    return { kind: 'box', note: say || copy ? `${say}${say && /^huge \d|^a \d+x\d+px /.test(copy) ? ';' : ''} ${copy}`.trim() + shadowTail : shadowTail ? shadowTail.slice(2) : null }
  }
  // columns of copy, each a small bold head over a line (round 6 c2: unsaid, so the build wrote its own)
  if (f.colKids && !f.regionKids.length && !fill && !bordered) {
    const c = f.colKids
    return { kind: 'text', note: `${c.cols.length} columns side by side, ${c.gap}px apart, each ${c.cols[0].head ? `a small bold ${c.cols[0].spaced ? 'wide-spaced ' : ''}${c.cols[0].headPx}px head over ` : ''}${c.px}px text${c.cols.every((x) => x.bodyLines === 1) ? ` (each column ${c.cols[0].w}px wide, its text on ONE line, no wrap)` : ''}: ${c.cols.map((x) => `${x.head ? `${quote(x.head)} over ` : ''}${quote(x.body, 120)}`).join('; ')}` }
  }
  if (f.pager && !f.regionKids.length) {
    const p = f.pager
    const items = p.items.map((t) => quote(t) + (t === p.current ? ' current' : '')).join(', ')
    // a wide pager says its caption left, the buttons' look, the current one's fill and where the line sits
    // (round 7 e5: built below the page bottom, caption dropped)
    if (p.px && w >= 600) return { kind: 'text', note: `pager, one line ${Math.round(w)}px wide, its middle ${Math.round(f.rect.y + h / 2)}px from the page top (inside the page, not below it): ${p.caption ? `${Math.round(f.font.size)}px ${colourName(f.colour) ?? ''} ${quote(p.caption, 40)} at the left, ` : ''}at the far right a row of ${p.px}x${p.px}px ${p.bordered ? 'outlined ' : ''}page buttons ${p.items.map((t) => quote(t)).join(', ')}${p.current ? `, ${quote(p.current)} filled ${p.curFill ? colourName(p.curFill) : ''} with white text (current)` : ''}`.replace(/ {2,}/g, ' ') }
    return { kind: 'text', note: `pager${p.caption ? ` ${quote(p.caption, 40)} left,` : ''} page buttons ${items}` }
  }
  if (f.textCols && !f.regionKids.length && !fill && !bordered) {
    const C = f.textCols
    return { kind: 'text', note: `${C.n} columns of running body text side by side (a magazine spread, NOT one paragraph, NOT cards), each ${C.w}px wide, ${C.gap}px apart, ${C.px}px ${hexOf(C.ink)} type${C.lh ? `, ${C.lh}px line height` : ''}, at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}${C.cap ? `; the first column opens with a DROP CAP: its first letter ${C.cap.px}px ${hexOf(C.cap.ink)}, floated left, sinking ${C.cap.lines} lines into the text (::first-letter, float: left)` : ''}: ${C.texts.map((t, i) => `column ${i + 1} ${quote(t, 200)}`).join('; ')}` }
  }
  // a heading over a line or an outlined button, no box (round 8 c5: the left heading and copy had no note, the
  // right copy's outlined 'Get notified' button was run into one line)
  {
    const k2 = f.kidBoxes
    if (f.text && !fill && !grad && !bordered && !f.regionKids.length && f.kidCount === 2 && k2.length === 2 && k2[0].s >= 20 && k2[0].s >= k2[1].s && k2[1].top >= k2[0].bottom - 2 && k2[1].t.length <= 160) {
      const part = (k, i) => {
        const look = `${k.s}px ${k.bold ? 'bold ' : ''}${k.it ? 'italic (font-style: italic) ' : ''}${hexOf(k.ink)}`
        return k.bw >= 1 && visible(k.bc) ? `an outlined button ${quote(k.t)} (${Math.round(k.w)}x${Math.round(k.h)}px, ${Math.round(k.bw)}px solid ${hexOf(k.bc)} border, no fill, ${look} text)` : `${i ? '' : 'heading '}${look} ${i ? 'text ' : ''}${quote(k.t, 160)}`
      }
      return { kind: 'text', note: withFx(`${part(k2[0], 0)}, then ${Math.round(k2[1].top - k2[0].bottom)}px under it ${part(k2[1], 1)}; the block ${Math.round(w)}px wide, its top-left at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}`) }
    }
  }
  if (f.text) {
    // short text says its copy when it is display-sized or styled apart (a coloured mono date, a brown logo)
    const styled = uniq([...typeWords(f, page), NEUTRAL.has(textCol) ? null : textCol, ...fx])
    // ...or when it is a bold standalone label (a thread title, a panel header): copy no mark can carry
    const say = f.text.length <= 40 && (f.font.size >= 18 || styled.length || (f.font.weight >= 600 && f.kidCount === 0))
    // one short paragraph (a hero's lead line) is copy a person types, or the build writes its own
    const lead = !say && f.kidCount === 0 && f.text.length <= 110 && /^(p|span|div)$/.test(f.tag)
    // a lead line in a softer grey than the page's text (grey blurb on a white-text poster) says so,
    // or builds set it in the page's full text colour (round 2 c2)
    if (lead && /grey/.test(textCol ?? '') && !styled.includes(textCol)) styled.push(textCol)
    // a small one-line label says its type size: drawn as a short scribble it was built ~half size (round 6 c2
    // 'KINETIK' 16px and the date 15px came out ~8px)
    const px = (say || (lead && f.text.length <= 40)) && f.font.size >= 13 && f.font.size < 18 && f.textLines <= 1 && !f.vertical ? `${Math.round(f.font.size)}px` : null
    // a lone small label up at the very top (no bar or nav around it) says it stands alone: round 7 c5's issue line
    // 'No. 12 · Winter' was built with an invented 'VOL. IV' beside it (n103)
    const alone = px && f.rect.y >= 16 && f.rect.y < 80 && f.kidCount === 0 && !fill && !bordered ? `, one line on its own (top ${Math.round(f.rect.y)}px, left edge ${Math.round(f.rect.x)}px), nothing else written beside it` : ''
    return { kind: 'text', note: say ? `${uniq([px, ...styled]).join(' ')} ${quote(f.text)}${alone}`.trim() : lead ? `${px ? `${px} ` : ''}${styled.length ? `${styled.join(' ')} ` : ''}text ${quote(f.text, 110)}${alone}` : null }
  }
  return { kind: 'box', note: null }
}

// a display title over a smaller line (round 5 c5 hero: 76px 'Prism 2' over 18px copy was built swapped)
/**
 * Flat SVG polygons said as shapes (round 7: c3 skylines and c4 cube faces were bare boxes, built as nothing).
 * A stepped silhouette says its rooftops; a few small polygons say their fill and corners in page px.
 */
function polyWords(fills) {
  if (!fills.length || !fills.every((x) => x.pts?.length >= 3)) return null
  const P = (pts) => pts.map(([a, b]) => `${a},${b}`).join(' ')
  const ink = (x) => `${colourName(x.c)} (${hexOf(x.c)})`
  // a skyline: one wide polygon whose edges all run straight across or straight up
  if (fills.length === 1) {
    const x = fills[0], pts = x.pts
    const square = pts.every(([a, b], i) => { const [c, d] = pts[(i + 1) % pts.length]; return a === c || b === d })
    if (square && pts.length >= 8 && x.right - x.left >= 600) {
      const roofs = []
      for (let i = 0; i < pts.length; i++) { const [a, b] = pts[i], [c, d] = pts[(i + 1) % pts.length]; if (b === d && b < x.bottom - 2 && c !== a) roofs.push([Math.min(a, c), Math.max(a, c), b]) }
      roofs.sort((p, q) => p[0] - q[0])
      return `flat ${ink(x)} city-skyline silhouette: ONE filled SVG polygon of flat-topped blocks standing on the bottom edge, ${x.right - x.left}px wide, no outlines, no windows, no gradient; ${roofs.length} rooftops left to right (page px, x from-to at y px down): ${roofs.map(([a, c, b]) => `${a}-${c} at ${b}`).join(', ')}; the shape is filled solid from each rooftop down to ${x.bottom}px (exact polygon points: ${P(pts)})`
    }
  }
  if (fills.length > 4 || fills.some((x) => x.pts.length > 6)) return null
  const lum = (c) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b
  // three four-cornered faces sharing corners: an isometric cube (top lightest, sides darker)
  const shared = (a, b) => a.pts.filter(([p, q]) => b.pts.some(([r, t]) => Math.abs(p - r) <= 1 && Math.abs(q - t) <= 1)).length
  const cube = fills.length === 3 && fills.every((x) => x.pts.length === 4) && shared(fills[0], fills[1]) >= 2 && shared(fills[0], fills[2]) >= 2 && shared(fills[1], fills[2]) >= 2
  const xs = fills.map((x) => x.left), ys = fills.map((x) => x.top)
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...fills.map((x) => x.right)), Math.max(...fills.map((x) => x.bottom))]
  const faces = fills.map((x, i) => `${cube ? ['top face', 'left face', 'right face'][i] ?? 'face' : `shape ${i + 1}`} ${ink(x)} corners ${P(x.pts)}`)
  return `${cube ? `an isometric cube (${box[2] - box[0]}x${box[3] - box[1]}px, top left at ${box[0]},${box[1]}) drawn as 3 flat filled SVG polygons, top face lightest, ${lum(fills[1].c) > lum(fills[2].c) ? 'left face mid, right face darkest' : 'right face mid, left face darkest'}` : `${fills.length} flat filled SVG polygons`}, no outlines, no gradient, no shadow, in one <svg> laid over the page at 0,0 (page px): ${faces.join('; ')}`
}
function titleWords(kb, h) {
  if (kb.length !== 2 || kb[0].s < 40 || kb[0].s < kb[1].s * 2) return ''
  const down = kb[0].top >= h * 0.25 ? `, starting ${Math.round((kb[0].top / h) * 100)}% down` : ''
  return `huge ${kb[0].s}px${kb[0].bold ? ' bold' : ''} title${down}: `
}

// a card line's own look when it stands apart from the card's title: a big figure, a coloured delta
function lineWords(f, i) {
  const st = f.kidStyles?.length === f.kidTexts.length ? f.kidStyles : null
  if (!st) return ''
  const k = st[i], h = st[0]
  // n137: a short line that is itself a filled button (round 10 c1 pink 'Get tickets →' built as a plain link)
  const B = f.kidBoxes?.length === f.kidTexts.length ? f.kidBoxes[i] : null
  const under = f.bg && f.bg.a > 0.05 ? f.bg : { r: 255, g: 255, b: 255, a: 1 }
  if (B && B.t.length <= 28 && B.fill && B.fill.a > 0.5 && dist(B.fill, under) > 40 && B.h >= 26 && B.h <= 70) return `a ${hexOf(B.fill)} filled ${Math.round(B.w)}x${Math.round(B.h)}px button${B.radius >= 12 ? ' (pill)' : B.radius >= 2 ? ` (${Math.round(B.radius)}px rounded)` : ' (square corners)'}${B.bw >= 1 ? ` with a ${Math.round(B.bw)}px ${hexOf(B.bc)} border` : ''}, ${B.bold ? 'bold ' : ''}${hexOf(B.ink)} text `
  const big = k.s >= Math.max(28, h.s * 1.6) ? `big ${k.s}px${k.b ? ' bold' : ''} ` : ''
  const name = colourName(k.c)
  const ink = name && name !== colourName(h.c) && !/black|grey|white|navy/.test(name) ? `${name} ` : ''
  return big + ink
}

// a form's spacing in pixels, so it is built to its drawn height (round 6 e4 came out ~10% taller)
// a side nav's spacing: row pitch, where its first heading starts, its width and right-hand rule (round 8 e5)
function navWords(n) {
  if (!n?.pitch) return ''
  return `; rows exactly ${n.pitch}px apart (${n.rowH}px tall, tight; not roomier)${n.first != null ? `, first heading ${n.first}px below the nav's top` : ''}; the nav column is ${n.w}px wide${n.rule ? ` with a thin ${hexOf(n.rule)} line down its full right edge` : ''}`
}

function rhythmWords(r) {
  if (!r) return ''
  const w = [`every field ${r.fieldH}px tall`, `label ${r.labelGap}px above its field`]
  if (r.rowGap) w.push(`${r.rowGap}px from a field to the next label`)
  if (r.headPx) w.push(`headings ${r.headPx}px`)
  if (r.choiceH) w.push(`choice cards ${r.choiceH}px tall`)
  return `; tight spacing: ${w.join(', ')}; the whole form is ${r.h}px tall top to bottom`
}

function pageNote(b) {
  const w = []
  // a cool pale grey (#f9fafb) is close to white yet a build on white loses it (round 4 e3)
  // a neutral near-white (#fafafa) under white cards is lost too: built on white, the cards vanish into it
  // (round 5 e4); it is said as off-white
  const nearWhite = visible(b.bg) && dist(b.bg, { r: 255, g: 255, b: 255 }) >= 6 && dist(b.bg, { r: 255, g: 255, b: 255 }) < 12
  const plain = (!visible(b.bg) || (dist(b.bg, { r: 255, g: 255, b: 255 }) < 12 && !nearWhite)) && !/gradient|url/.test(b.bgImage) && !isSerif(b.font.family) && !isMono(b.font.family)
  if (plain && !b.grain && !b.grainDots && !b.blobs?.length) return null
  const grad = gradientWords(b)
  // soft glows over a dark page (a mesh: round 6 c4 said as a 3-stop page gradient, base colour lost)
  const gl = b.glows && b.glows.length >= 2 && visible(b.bg) ? glowWords(b) : null
  if (gl) w.push(`${gl.replace(/ block\b/, ` (${hexOf(b.bg)}) page`)} (big soft radial glows fading into the base colour)`)
  // n163: a radial glow page said exactly (round 16 c5: the blue glow behind the phone lost)
  else if (grad && /^radial-gradient/.test(b.bgImage ?? '') && !/^\d/.test(b.bgSize ?? '')) w.push(`${grad} page (a soft radial GLOW; exactly background: ${cssHex(b.bgImage)})`)
  else if (grad) w.push(`${grad} page`)
  // a warm off-white (#f4f1ea) said bare was built plain white (round 6 c2): its hex goes with it
  else if (visible(b.bg)) w.push(`${nearWhite && colourName(b.bg) === 'white' ? `off-white (${hexOf(b.bg)}, plainly not white)` : colourName(b.bg) === 'off-white' ? `off-white (${hexOf(b.bg)}, plainly not white)` : hexOf(b.bg) === '#ffffff' ? colourName(b.bg) : Math.min(parse(b.bg).r, parse(b.bg).g, parse(b.bg).b) >= 225 ? `${colourName(b.bg)} (${hexOf(b.bg)}, plainly not white)` : `${colourName(b.bg)} (${hexOf(b.bg)})`} page`)
  // n158: a dot grid printed over the page colour (round 15 c2: the 24px dot paper lost, built plain cream)
  const dotTile = /^radial-gradient/.test(b.bgImage ?? '') && (b.bgSize ?? '').match(/^([\d.]+)px/)
  if (dotTile && +dotTile[1] <= 60) w.push(`a fine DOT GRID over the whole page (small ${hexOf(parse((b.bgImage.match(/rgba?\([^)]+\)/) || ['rgb(0,0,0)'])[0]))} dots every ${Math.round(+dotTile[1])}px; exactly: background-image: ${cssHex(b.bgImage)}; background-size: ${b.bgSize}; on top of the page colour)`)
  if (gridLines(b)) w.push('faint grid lines')
  if (isSerif(b.font.family)) w.push(`${faceName(b.font.family) ?? 'serif'} type`); else if (isMono(b.font.family)) w.push('mono type')
  else if (faceName(b.font.family)) w.push(`${faceName(b.font.family)} type`)
  if (b.colour) w.push(`${colourName(b.colour)} text`)
  if (b.grain) w.push('fine grain texture over everything')
  if (b.grainDots) w.push(`a fine printed DOT GRAIN over EVERYTHING, type and circles included: one overlay div (position absolute, inset 0, pointer-events none, LAST in the page so it sits on top) painted exactly background-image: ${cssHex(b.grainDots.img)}; background-size: ${b.grainDots.size}`)
  // n141: blurred blobs and soft shadows on the page, one by one (round 11 c2: three 60px blobs unsaid, page bare)
  if (b.blobs?.length) w.push(`behind everything (under all content, position absolute) ${b.blobs.length} soft blurred shape${b.blobs.length > 1 ? 's' : ''}, each its own div: ${b.blobs.map((q) => `${q.w}x${q.h}px at ${q.x},${q.y} ${colourName({ ...q.c, a: 1 })} ${hexOf(q.c)}${q.c.a < 0.95 ? ` at ${Math.round(q.c.a * 100)}%` : ''}${q.round ? ' circle/ellipse (border-radius 50%)' : ''} blurred (filter: blur(${q.blur}px))`).join('; ')}`)
  return `whole page: ${w.join(', ')}`
}

/**
 * Plan a page: [[role, kind]...] in reading order and [[role|'*', note]...].
 * Same shape as the hand plans in <round>/sketches.mjs.
 */
// a cut-out's clip said against the box its drawn outline spans (round 8 c5: the polygon was said as % of the full
// 1280px block, but the drawing's box is only the outline's bounds, 794px wide, so 62% landed at 38% of the page)
function clipWords(poly, rect, w, h) {
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const bw = Math.round((x1 - x0) * w), bh = Math.round((y1 - y0) * h), bx = Math.round(rect.x + x0 * w), by = Math.round(rect.y + y0 * h)
  const pct = (v, a, b) => Math.round(((v - a) / ((b - a) || 1)) * 100)
  const rel = poly.map(([x, y]) => `${pct(x, x0, x1)}% ${pct(y, y0, y1)}%`).join(', ')
  const px = poly.map(([x, y]) => `${Math.round(rect.x + x * w)},${Math.round(rect.y + y * h)}`).join(' ; ')
  return `its corners at exactly these page points (px, left to right from the page's top-left): ${px}; the shape's box is the outline's bounds, ${bw}x${bh}px with its top-left at ${bx},${by}, so on that box clip-path: polygon(${rel}) (percentages of THAT box, not of the page)`
}

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
  // n176: a cut-out shape crossed by big words painted after it names them (round 17 c1: the skewed photo built on top of
  // the black band and the hollow MORE line; the target paints all three tilted lines over it)
  regions.forEach((f, i) => {
    const d = out.get(f.role)
    if (d.kind !== 'shape' || !f.clipPoly || !d.note || f.text) return
    const A = f.rect
    const over = regions.slice(i + 1).filter((g) => {
      if (!g.text || g.regionKids.includes(f.role) || f.regionKids.includes(g.role) || (g.font?.size ?? 0) < 40) return false
      const B = g.rect, ow = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oh = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)
      return ow > 40 && oh > 40
    })
    if (over.length) d.note += `; the big ${over.length > 1 ? 'lines' : 'line'} ${over.map((g) => `${quote(g.text, 20)}${visible(g.bg) ? ` (with its ${hexOf(g.bg)} band)` : ''}`).join(', ')} ${over.length > 1 ? 'paint' : 'paints'} OVER this shape where ${over.length > 1 ? 'they cross' : 'it crosses'} it (the shape's z-index is BELOW ${over.length > 1 ? 'all of them' : 'it'}; it never covers ${over.length > 1 ? 'them' : 'it'})`
  })
  // n151: a fill-less text standing on a big flat field painted under it says so (round 13 c5: the white vertical label
  // on the red half was built on its own black bar, the caption on a red square)
  regions.forEach((f, i) => {
    const d = out.get(f.role)
    if (!d.kind || !d.note || !f.text || visible(f.bg) || /gradient/.test(f.bgImage || '') || f.regionKids.length) return
    const A = f.rect
    const field = regions.slice(0, i).reverse().find((g) => {
      if (f.regionKids.includes(g.role) || !visible(g.bg) || g.bg.a < 0.9 || g.text || g.rect.w * g.rect.h < 0.2 * 1280 * 900) return false
      if (dist(g.bg, body.bg) < 60 || (f.colour && dist(g.bg, f.colour) < 60)) return false
      const B = g.rect
      return A.x >= B.x - 2 && A.y >= B.y - 2 && A.x + A.w <= B.x + B.w + 2 && A.y + A.h <= B.y + B.h + 2
    })
    if (field) d.note += `; on the ${hexOf(field.bg)} block, no fill or bar of its own`
  })
  // n132: a top bar or a plain row table the rules above left unsaid or said only as a word list gets said part by
  // part (round 9 e1/e2 top bars: no note; e4 search chips: 'white text list'; e5 invoices: a 2-column list). Bars and
  // tables already said another way keep their tuned notes.
  regions.forEach((f) => {
    const d = out.get(f.role)
    // n155: a bar note that runs its boxed chips together as words is weak too (round 14 e4 filter chips unboxed, logo lost)
    const chipBar = f.topBar && /^bar \d+px tall/.test(d.note ?? '') && f.topBar.parts.filter((p) => p.t && (p.border || p.fill)).length >= 2
    if (!(f.topBar || f.rowTable) || (d.note && !chipBar && !/^(list:|[a-z ,-]*text list:)/.test(d.note))) return
    const e = decideOne({ ...f, weakNote: true }, body, marked, said)
    if (e?.note) { out.set(f.role, e); marked.add(f.role) }
  })
  // n132: a flat full-height side panel is not a card (round 9 e5: built as an inset grey card with a heavy shadow)
  regions.forEach((f) => {
    const d = out.get(f.role), E = f.edgePanel
    if (!E || !d.kind || E.shadow || E.rad || !/\bcard\b/.test(d.note ?? '')) return
    d.note = `${d.note ? `${d.note.replace(/\bcard\b/, 'panel')}; ` : ''}this panel is FLAT: ${hexOf(f.bg)} fill from the very top to the very bottom of the page at the left edge, ${E.w}px wide, square corners, no shadow, no margin round it (NOT an inset or floating card)${E.rule ? `, a 1px ${hexOf(E.rule)} line down its right side` : ''}`
  })
  // n137: a card heading whose lines differ in colour says each line and its colour (round 10 c4 red 'fun.')
  regions.forEach((f) => {
    const d = out.get(f.role), H = f.headLines
    if (!d.kind || !H || !H.lines.some((l) => dist(l.c, H.base) > 60)) return
    d.note = `${d.note ? `${d.note}; ` : ''}its heading is ${H.px}px${H.w >= 700 ? ' heavy' : ''} on ${H.lines.length} lines, ${H.lines.map((l) => `${quote(l.t, 40)} in ${hexOf(l.c)}`).join(' / ')} (each line its own colour, keep the break)`
  })
  // n132: a highlighted item that also carries an underline (round 9 e4 sort tabs: the underline was lost)
  regions.forEach((f) => {
    const d = out.get(f.role), U = f.kidOn?.under
    if (!d.kind || !U || !d.note || !/highlighted \(/.test(d.note) || /underline|line along its bottom/.test(d.note)) return
    d.note = `${d.note}; the highlighted one also has a thick 4px ${hexOf(U)} line along its bottom edge`
  })
  // a paragraph tucked under a one-line row it sits right below (an accordion's open body): say where it starts
  // (round 7 e4: the 'Details' body text was built on the header line, over the word 'Details')
  regions.forEach((f) => {
    const d = out.get(f.role)
    if (d.kind !== 'text' || !f.text || f.text.length < 40 || f.regionKids.length || /^toggle /.test(d.note ?? '')) return
    const row = regions.find((g) => g !== f && out.get(g.role).kind && !g.regionKids.length && !f.regionKids.includes(g.role) && g.text && g.text.length <= 40 && g.rect.h <= 70 &&
      Math.abs(g.rect.x - f.rect.x) <= 6 && g.rect.y < f.rect.y && f.rect.y - (g.rect.y + g.rect.h) <= 12 && f.rect.y - (g.rect.y + g.rect.h) >= -16)
    if (!row) return
    d.note = `${d.note ? `${d.note}, ` : ''}its top ${Math.round(f.rect.y)}px from the page top, ${Math.round(f.rect.y - row.rect.y)}px below the top of the ${quote(row.text.replace(/\s+/g, ' ').trim(), 30)} line above it (that line's text sits above this text, never on the same line or over it)`
  })
  // a plain pale panel with other drawn parts lying inside it is a card behind them, not a picture (round 8 e4: the
  // white seat-map hall was read as a picture placeholder)
  regions.forEach((f, i) => {
    const d = out.get(f.role)
    if (d.kind !== 'image' || f.text || f.regionKids.length || !visible(f.bg) || f.bgImageColours?.length || !/white|light grey|off-white/.test(colourName(f.bg))) return
    const inside = regions.filter((g, j) => j > i && out.get(g.role).kind && g.rect.x >= f.rect.x - 2 && g.rect.y >= f.rect.y - 2 && g.rect.x + g.rect.w <= f.rect.x + f.rect.w + 2 && g.rect.y + g.rect.h <= f.rect.y + f.rect.h + 2)
    if (inside.length < 2) return
    d.kind = 'box'
    d.note = `plain ${hexOf(f.bg)} panel ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}${f.radius ? `, ${Math.round(f.radius)}px rounded` : ''}${f.border.w >= 1 && visible(f.border.colour) ? `, thin ${hexOf(f.border.colour)} border` : ''} (NOT a picture, no X, nothing of its own inside): the ${inside.slice(0, 4).map((g) => g.role.replace(/-/g, ' ')).join(', ')} sit on top of it`
  })
  // a hollow word inside a solid heading: say which word and its stroke
  regions.forEach((f) => {
    const d = out.get(f.role)
    if (!f.hollow?.length || !d.kind) return
    d.note = `${d.note ? `${d.note}; ` : ''}${f.hollow.map((h) => `the word ${quote(h.t, 24)} is HOLLOW: outline only, transparent fill (color: transparent; -webkit-text-stroke: ${h.px}px ${hexOf(h.c)}), same size and weight as the rest`).join('; ')}`
  })
  // two pictures that overlap: the later-painted one is on top (round 5 c4: the blue photo was built under
  // the orange one, hidden behind its shadow)
  regions.forEach((f, i) => {
    const d = out.get(f.role)
    if (d.kind !== 'image') return
    const under = regions.slice(0, i).find((g) => {
      if (out.get(g.role).kind !== 'image' || g.regionKids.includes(f.role) || f.regionKids.includes(g.role)) return false
      const A = f.rect, B = g.rect
      const ow = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oh = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)
      return ow > 0 && oh > 0 && ow * oh > 0.05 * Math.min(A.w * A.h, B.w * B.h)
    })
    if (!under) return
    const what = (out.get(under.role).note ?? '').match(/^(?:tilted (?:back in 3D perspective(?: \((?:[^()]|\([^()]*\))*\))? |(?:slightly )?(?:\d+° (?:anti)?clockwise )?))?(.*?\bblock)\b/)?.[1] ?? 'other picture'
    const A = f.rect, B = under.rect
    const side = `${A.y + A.h / 2 > B.y + B.h / 2 ? 'lower' : 'upper'} ${A.x + A.w / 2 > B.x + B.w / 2 ? 'right' : 'left'}`
    d.note = `${d.note ? `${d.note}, ` : ''}overlapping the ${side} of the ${what} and on top of it`
  })
  // n155: two cut-outs that overlap: the later-painted one lies on top (round 14 c2: the green cut-out was built over
  // the orange one)
  regions.forEach((f, i) => {
    const d = out.get(f.role)
    if (!d.kind || !/cut-out shape/.test(d.note ?? '') || /ON TOP of the .* cut-out/.test(d.note)) return
    const under = regions.slice(0, i).reverse().find((g) => {
      if (!out.get(g.role).kind || !/cut-out shape/.test(out.get(g.role).note ?? '') || g.regionKids.includes(f.role) || f.regionKids.includes(g.role)) return false
      const A = f.rect, B = g.rect
      const ow = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oh = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)
      return ow > 0 && oh > 0 && ow * oh > 0.05 * Math.min(A.w * A.h, B.w * B.h)
    })
    if (!under) return
    const cn = (out.get(under.role).note.match(/(#[0-9a-f]{6})/) ?? [])[1]
    d.note = `${d.note}; it lies ON TOP of the ${cn ? `${cn} ` : ''}cut-out it overlaps (painted after it, higher z-index: where they overlap this one hides that one)`
    const u = out.get(under.role)
    if (!/UNDER the/.test(u.note)) u.note = `${u.note}; it lies UNDER the cut-out painted after it (lower z-index)`
  })
  // n155: a ruleless row of 3-4 short items pushed apart (round 14 c2 footer said as one run of wide-spaced words,
  // built run together)
  regions.forEach((f) => {
    const d = out.get(f.role), K = f.kidTexts ?? []
    if (!d.kind || !d.note || !f.spreadEnds || f.topRule || K.length < 3 || K.length > 4 || K.length !== f.kidCount || f.kidButtons || f.rect.h > 60 || f.regionKids.length) return
    if (/space-between|far left|part by part|\bleft\b.*\bright\b/.test(d.note)) return
    const at = K.map((t, i) => `${quote(t, 30)} ${i === 0 ? 'at the far left' : i === K.length - 1 ? 'at the far right' : K.length === 3 ? 'in the middle' : `${i === 1 ? 'second' : 'third'}, evenly spaced`}`)
    d.note = `${d.note}; these are ${K.length} SEPARATE items on one line ${Math.round(f.rect.w)}px wide at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, pushed apart (display flex, justify-content: space-between; never run together as one line of text): ${at.join(', ')}`
  })
  // a dropdown panel: square top corners flush under a bar, rounded bottom, a big soft shadow, lying over the page
  // below (round 6 e1 mega-menu said 'white card': built as a card in the flow, no shadow, hero pushed down)
  regions.forEach((f) => {
    const d = out.get(f.role)
    if (d.kind !== 'box' || !f.corners) return
    const [tl, tr, br, bl] = f.corners
    const soft = f.shadows.find((x) => !x.clear && x.blur >= 16 && x.y >= 8)
    const bar = regions.find((g) => g !== f && out.get(g.role).kind && !f.regionKids.includes(g.role) && !g.regionKids.includes(f.role) && Math.abs(g.rect.y + g.rect.h - f.rect.y) <= 2 && g.rect.x <= f.rect.x + 2 && g.rect.x + g.rect.w >= f.rect.x + f.rect.w - 2)
    if (!soft || !bar || tl > 1 || tr > 1 || br < 6 || bl < 6) return
    const over = regions.filter((g) => g !== bar && g !== f && out.get(g.role).kind && !f.regionKids.includes(g.role) && !g.regionKids.includes(f.role) && g.rect.y < f.rect.y + f.rect.h && g.rect.y + g.rect.h > f.rect.y && g.rect.x < f.rect.x + f.rect.w && g.rect.x + g.rect.w > f.rect.x)
    const a = soft.c ? Math.round(soft.c.a * 100) : null
    d.note = `${d.note ? `${d.note}, ` : ''}an open dropdown panel hanging straight down from the bottom of the top bar (square top corners, ${Math.round(br)}px rounded bottom corners), with a big soft ${soft.c ? `${colourName({ ...soft.c, a: 1 })} ` : ''}shadow ${Math.round(soft.y)}px down, ${Math.round(soft.blur)}px blur${a !== null && a < 60 ? `, ${a}% opacity` : ''}${over.length ? `; it lies on top of the page below it, covering ${over.filter((g) => g.rect.y >= f.rect.y - 2 && g.rect.y + g.rect.h <= f.rect.y + f.rect.h + 2 && g.rect.x >= f.rect.x - 2 && g.rect.x + g.rect.w <= f.rect.x + f.rect.w + 2).length ? 'all' : 'part'} of what is drawn under it (absolutely placed over it, not pushing it down)` : ''}; the panel is a fixed ${Math.round(f.rect.h)}px tall as drawn${over.filter((g) => g.rect.y >= f.rect.y - 2 && g.rect.y + g.rect.h <= f.rect.y + f.rect.h + 2 && g.rect.x >= f.rect.x - 2 && g.rect.x + g.rect.w <= f.rect.x + f.rect.w + 2).length ? ', so nothing under it peeks out round its edges' : ''}`
  })
  // cards stacked in a column with open space between them, and a full-width divider far below the marks above
  // it: say the gap (round 7 e1: cards packed 10px apart in flow, target 32-40px; the MOBILE lane built ~240px
  // high, right under the web cards, target leaves the lane above 140px of empty space)
  const boxes = regions.filter((f) => out.get(f.role).kind === 'box' && f.rect.w <= 400 && !f.regionKids.length)
  const colOf = (f) => boxes.filter((g) => Math.abs(g.rect.x - f.rect.x) <= 4 && Math.abs(g.rect.w - f.rect.w) <= 4)
  if (boxes.filter((f) => colOf(f).length >= 2).length >= 4) {
    for (const f of boxes) {
      const above = colOf(f).filter((g) => g !== f && g.rect.y + g.rect.h <= f.rect.y + 2).sort((a, b) => b.rect.y - a.rect.y)[0]
      if (!above) continue
      const between = regions.some((g) => g !== f && g !== above && out.get(g.role).kind && g.rect.y >= above.rect.y + above.rect.h - 2 && g.rect.y + g.rect.h <= f.rect.y + 2 && g.rect.x < f.rect.x + f.rect.w && g.rect.x + g.rect.w > f.rect.x)
      const gap = Math.round(f.rect.y - above.rect.y - above.rect.h)
      if (between || gap < 20) continue
      const d = out.get(f.role)
      d.note = `${d.note ? `${d.note}; ` : ''}its top ${Math.round(f.rect.y)}px from the page top, ${gap}px of empty space above it (below the card above; the cards in this column are NOT packed tight, keep the gap)`
    }
  }
  regions.forEach((f) => {
    const d = out.get(f.role)
    if (!d.kind || !/section divider/.test(d.note ?? '')) return
    const over = regions.filter((g) => g !== f && out.get(g.role).kind && g.rect.y + g.rect.h <= f.rect.y + 2 && g.rect.y > 0 && g.rect.h < 300)
    const low = Math.max(...over.map((g) => g.rect.y + g.rect.h))
    if (!over.length || f.rect.y - low < 60) return
    d.note = `${d.note}; the line sits ${Math.round(f.rect.y)}px from the page top, ${Math.round(f.rect.y - low)}px below the lowest card above it (the lane above keeps that empty space; do not pull this lane up)`
  })
  // a seat map says its top as a gap under what is right above it and inside its panel (round 8 e4: page
  // coordinates alone, the grid was built ~45px low)
  regions.forEach((f) => {
    const d = out.get(f.role)
    if (!d.kind || !/^a seat\/cell map/.test(d.note ?? '')) return
    const at = d.note.match(/top-left at (\d+),(\d+)/)
    if (!at) return
    const gy = +at[2], gx = +at[1]
    const above = regions.filter((g) => g !== f && out.get(g.role).kind && g.rect.y + g.rect.h <= gy + 2 && g.rect.x < gx + 600 && g.rect.x + g.rect.w > gx && g.rect.h < 120)
      .sort((a, b) => (b.rect.y + b.rect.h) - (a.rect.y + a.rect.h))[0]
    const box = regions.filter((g) => g !== f && out.get(g.role).kind && g.rect.y < gy && g.rect.x <= gx && g.rect.x + g.rect.w >= gx + 100 && g.rect.y + g.rect.h > gy && g.rect.h >= 300)
      .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0]
    const bits = []
    if (above) bits.push(`exactly ${Math.round(gy - above.rect.y - above.rect.h)}px below the bottom of the ${above.role.replace(/-/g, ' ')} (top ${gy}px from the page top)`)
    if (box) bits.push(`${Math.round(gy - box.rect.y)}px below the top edge of the ${box.role.replace(/-/g, ' ')} panel and ${Math.round(gx - box.rect.x)}px in from its left edge`)
    if (bits.length) d.note = `${d.note}; place the grid's first row ${bits.join(', ')}: not lower, the rows start right there`
  })
  // a big textless gradient block given no words (round 7 e4 product photo: built as a blank crossed placeholder)
  regions.forEach((f) => {
    const d = out.get(f.role)
    if (!d.kind || d.note || f.text || f.rect.w < 200 || f.rect.h < 200) return
    const cs = (f.bgImageColours || []).map(parse).filter(Boolean)
    // faint repeating stripes over the page are a grain texture, not a photo (round 8 c5: said as an empty
    // 'product-photo backdrop' with a black-to-black gradient)
    const rep = (f.bgImage || '').match(/repeating-linear-gradient\(\s*(-?\d+deg)?/)
    if (rep && cs.length && cs.every((c) => c.a <= 0.2)) {
      const ink = cs.find((c) => c.a > 0)
      const stops = [...f.bgImage.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => +m[1])
      const period = stops.length ? Math.max(...stops) : null
      d.kind = 'box'
      d.note = `a fine grain texture over everything under it (${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px, no fill of its own, pointer-events none, on top of the colour fields but under the type): thin ${hexOf({ ...ink, a: 1 })} lines at ${Math.round(ink.a * 100)}% opacity, background: ${f.bgImage.replace(/\s+/g, ' ').trim()}${period ? ` (one thin line every ${period}px${rep[1] ? `, ${rep[1]}` : ''})` : ''}; barely visible: never a picture, never a gradient, never a solid layer; its drawn outline (a frame round the area) is only where it lies: build no shape, tint, shadow or darkening overlay from it, so the colours under it stay exactly their hex`
      return
    }
    const g = gradientWords(f) ?? (cs.length >= 2 ? `pale tinted ${hexOf(cs[0])} to ${hexOf(cs[cs.length - 1])}${linearEnds(f.bgImage) ? ` (${linearEnds(f.bgImage).join(' to ')})` : ''}` : null)
    if (!g) return
    d.kind = 'box'
    const ps = f.pseudoShape
    // a big solid shape painted over the backdrop (round 7 e4 indigo jacket: missing) is said as the one thing inside
    const shapeSay = ps ? `; inside it one big solid ${colourName(ps.fill)} (${hexOf(ps.fill)}) ${ps.w}x${ps.h}px shape, ${ps.x}px in from its left and ${ps.y}px down from its top, ${/%/.test(ps.radius) ? 'top corners very round, bottom corners a little round (a garment silhouette)' : 'rounded'}: no other picture, no X, no icon` : ''
    d.note = `a big ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px block filled with a soft ${g} gradient${f.radius >= 4 ? `, ${Math.round(f.radius)}px rounded` : ''}: ${ps ? `a product-photo backdrop${shapeSay}` : 'an empty product-photo backdrop (no picture placeholder, no X, no icon, nothing inside)'}`
  })
  // the same heading word on two separate marks: say it repeats, or a reading folds them into one line
  // (round 5 c4: two stacked 'SUMMER' lines built as one)
  const heads = regions.filter((f) => out.get(f.role).kind === 'heading' && f.text)
  const unionOf = new Map()
  for (const f of heads) {
    const same = heads.filter((g) => g.text === f.text).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
    if (same.length < 2) continue
    // two clipped halves of one word are one word, sliced (round 6 c2), not two lines: one mark over the
    // whole word, one note for both copies (said as two headings, the build set the halves far apart, 22%)
    if (same.some((g) => g.clipInset)) {
      const top = same.find((g) => g.clipInset && g.clipInset.b >= 0.3 && g.clipInset.t < 0.05)
      const bot = same.find((g) => g.clipInset && g.clipInset.t >= 0.3 && g.clipInset.b < 0.05)
      if (top && bot && f === top && out.get(bot.role).kind) {
        const dt = out.get(top.role), db = out.get(bot.role)
        const look = (dt.note ?? '').replace(/^.*?cuts them flat across the middle\)\s*/, '').replace(/(, \d+px type)?, about \d+px wide( \(no larger\))?$/, '').replace(/\s*"[^"]*"\s*$/, '')
        const wpx = top.shown?.w ? `, ${Math.round(top.font.size)}px type, the whole word about ${top.shown.w}px wide (no wider)` : ''
        const cut = Math.round((1 - top.clipInset.b) * 100)
        const sh = bot.shiftX - top.shiftX
        dt.note = `ONE ${look} word ${quote(f.text)}${wpx}, sliced flat across at ${cut}% of its height, built as two copies of the word stacked exactly on the same spot: the top copy shows only its top part (clip-path: inset(0 0 ${100 - cut}% 0)) in ${colourName(top.colour)}, the bottom copy shows only its bottom part (clip-path: inset(${cut}% 0 0 0)) in ${colourName(bot.colour)}${Math.abs(sh) >= 8 ? `, slid ${Math.abs(sh)}px ${sh > 0 ? 'right' : 'left'} (translateX(${sh}px)), the slid copy whole to its last letter, sticking out ${Math.abs(sh)}px past the other copy's ${sh > 0 ? 'right' : 'left'} end (no overflow-hidden wrapper, no width cap cutting it)` : ''}; the two parts touch at the cut, no gap, one line of type`
        // a thin rule drawn along the cut: say the cut sits on it (round 6 c2 built the word ~45px high,
        // its cut floating above the rule the target slices it on)
        const cutY = top.rect.y + top.rect.h * cut / 100
        const rule = regions.find((g) => g !== top && g !== bot && out.get(g.role).kind && g.rect.h <= 6 && g.rect.w >= 200 &&
          Math.abs(g.rect.y + g.rect.h / 2 - cutY) <= 10 && g.rect.x < top.rect.x + top.rect.w && g.rect.x + g.rect.w > top.rect.x)
        if (rule) dt.note += `; the cut lies exactly on the thin rule drawn across it (${Math.round(cutY)}px from the page top), its line box starting ${Math.round(top.rect.y)}px down`
        db.kind = null; db.note = null
        unionOf.set(top.role, bot.role)
      }
      continue
    }
    const i = same.indexOf(f), d = out.get(f.role)
    const nth = ['first', 'second', 'third', 'fourth'][i] ?? `${i + 1}th`
    d.note = `${d.note}, the ${nth} of ${same.length} separate stacked lines of the same word (it repeats; build each line)`
  }
  // a picture placeholder with another mark drawn on top of it (a dark reel card with a play
  // circle) is a backdrop: drawn as a filled box, since an X'd picture box crosses out what sits
  // on it and the build drew the X (round 3 c2 reel built as a crossed placeholder)
  regions.forEach((f) => {
    const d = out.get(f.role)
    if (d.kind !== 'image' || !d.note) return
    const A = f.rect
    const onTop = regions.some((g) => g !== f && out.get(g.role).kind && !f.regionKids.includes(g.role) && !g.regionKids.includes(f.role) &&
      g.rect.x >= A.x - 2 && g.rect.y >= A.y - 2 && g.rect.x + g.rect.w <= A.x + A.w + 2 && g.rect.y + g.rect.h <= A.y + A.h + 2 &&
      g.rect.w * g.rect.h <= 0.5 * A.w * A.h)
    if (onTop) d.kind = 'box'
  })
  // n156: a thin track bar with a lit segment, said as a progress rail (round 14 c4: 'deep green', segment lost); lines
  // broken by <br> and set far apart, said line by line (c4 chapter list built as turned vertical letters); a noteless
  // paragraph keeps its whole copy (c4 lede: no note, copy invented)
  regions.forEach((f) => {
    const d = out.get(f.role); if (!d.kind) return
    const R = f.rect, px = Math.round(f.font.size)
    if (f.litTrack && !f.regionKids.length && (!d.note || d.note.length < 40)) {
      const t = f.litTrack
      out.set(f.role, { kind: 'box', note: `a thin ${t.vertical ? 'VERTICAL' : 'horizontal'} progress rail, NOT text: a ${Math.round(R.w)}x${Math.round(R.h)}px ${hexOf(t.track)} track bar with its top-left at ${Math.round(R.x)},${Math.round(R.y)}; inside it one lit ${hexOf(t.lit)} segment ${t.w}x${t.h}px at ${t.x},${t.y} from the track's top-left (the rest of the track unlit)` })
      return
    }
    if (f.brStack && !f.regionKids.length && f.font.lineHeight >= 2.5 * f.font.size && (!d.note || !d.note.includes(' y '))) {
      const L = f.brStack, pitch = Math.round(f.font.lineHeight)
      out.set(f.role, { kind: d.kind, note: `${L.length} short ${px}px ${faceName(f.font.family) ?? (isMono(f.font.family) ? 'mono' : 'plain')} labels stacked straight down, each label ONE ordinary horizontal line of upright text (NOT vertical writing, NOT rotated, NOT turned), ${pitch}px apart (line-height ${pitch}px), all left-aligned at x ${L[0].x}: ${L.map((l) => `${quote(l.t, 30)} at y ${l.y} ${hexOf(l.c)}${l.w >= 600 ? ' bold' : ''}`).join('; ')}` })
      return
    }
    // n156: a bordered box of placeholder words with one filled button inside (round 14 e5 composer: built as a grey band
    // with a purple Send)
    const btn = (f.parts ?? []).filter((p) => p.t && p.fill?.a > 0.5 && p.t.length <= 16)
    if (!f.regionKids.length && f.ownText && btn.length === 1 && f.border?.w >= 1 && f.border.left >= 1 && f.border.bottom >= 1 && visible(f.border.colour) && R.h >= 60 && R.w >= 200 && (!d.note || !/#[0-9a-f]{6} fill/i.test(d.note))) {
      const B = btn[0]
      out.set(f.role, { kind: 'box', note: `a ${Math.round(R.w)}x${Math.round(R.h)}px message box at ${Math.round(R.x)},${Math.round(R.y)} (NOT a filled bar): ${visible(f.bg) && f.bg.a > 0.5 ? `${hexOf(f.bg)}` : 'white / no'} fill, a ${Math.round(f.border.w)}px ${hexOf(f.border.colour)} border all round, ${Math.round(f.radius)}px rounded; placeholder ${px}px ${hexOf(f.colour)} ${quote(f.ownText, 40)} at its top-left (${Math.round(f.inset.l)}px padding); ONE solid ${hexOf(B.fill)} button ${B.w}x${B.h}px${B.radius ? `, ${B.radius}px rounded` : ''}, ${B.px}px ${hexOf(B.ink)} text "${B.t}", in its bottom-right corner at ${B.x},${B.y}` })
      return
    }
    if (!d.note && d.kind === 'text' && f.text.length >= 40 && f.textLines >= 2 && f.textLines <= 8 && !f.kidCount) {
      out.set(f.role, { kind: d.kind, note: `${px}px ${faceName(f.font.family) ?? ''} ${colourName(f.colour) ?? ''} (${hexOf(f.colour)}) copy in ${f.textLines} lines, ${Math.round(R.w)}px wide, top-left at ${Math.round(R.x)},${Math.round(R.y)}, quoted whole (these exact words, nothing invented): ${quote(f.text, 400)}` })
    }
  })
  // n138: a region the rules still leave weak (no note, a 'picture with' one word, a bare word list, a field name, a
  // chart said only as stripes) or a frame whose own fields are drawn nowhere (round 10 e5 form) is said part by part:
  // every painted or worded part with its page-px box, fill, edge and text, the way the target's own boxes give them
  regions.forEach((f) => {
    const d = out.get(f.role), P = (f.parts ?? []).filter((p) => p.w * p.h < 0.97 * f.rect.w * f.rect.h)
    if (f.codeLines) return
    if (P.length < 3 || P.length > 100) return
    const weak = !d.note || /^(picture with|list:|links:|field ")/.test(d.note) || /^[a-z ,-]*text list:/.test(d.note)
    const stripesOnly = /repeating stripes/.test(d.note ?? '') && P.length >= 10
    const frame = !d.kind && f.regionKids.length && P.filter((p) => p.t).length >= 3
    // a note that quotes under 60% of the region's own words leaves the rest to be invented or dropped (round 10 e3
    // track table: header and the playing row said, the other four tracks lost; side nav: 2 of 7 items)
    const T = uniq(P.map((p) => p.t).filter((t) => t && t.length >= 2))
    // ...or under half its letters (round 11 c3 spec panel: the values said, its 90-letter paragraph and keys lost)
    const chars = (a) => a.reduce((n, t) => n + t.length, 0)
    const thin = d.kind && d.note && !f.regionKids.length && T.length >= 4 && (T.filter((t) => d.note.includes(t)).length < 0.6 * T.length || chars(T.filter((t) => d.note.includes(t.slice(0, 40)))) < 0.5 * chars(T))
    // n146: a note of words only over a region of painted parts (round 12 e1 canvas: a white frame, a gradient hero, a
    // dark outlined button and handles said as bare lines, all built as loose text)
    const bare = d.kind && d.note && !f.regionKids.length && P.filter((p) => p.fill || p.img || p.ring).length >= 3 && /^("[^"]*",? )?lines "/.test(d.note)
    // n147: a note with no sizes or colours of its own over a region of several painted parts and many words (round 12
    // e1 toolbar 'dark grey bar, white text "◆ ↖ # □ ..."': the active tool, avatars and Share pill lost; properties
    // 'white block list': the boxed X/Y/W/H fields lost)
    const own = (d.note ?? '').replace(/; (its text|each word in its own colour).*$/, '')
    const vague = d.kind && d.note && !f.regionKids.length && P.filter((p) => p.fill || p.ring || p.img).length >= 2 && P.filter((p) => p.t).length >= 5 && !/\d+px|#[0-9a-f]{6}/i.test(own)
    // n156: a note with no colour of its own over a region of 3+ painted parts (round 14 e1 drawer: status pills,
    // description box, progress bar lost; e5 composer said as bare words, its box and dark Send button lost)
    const unpainted = d.kind && d.note && !f.regionKids.length && /\blist: /.test(own) && P.filter((p) => p.t && p.fill?.a > 0.05).length >= 2 && P.filter((p) => p.border && p.border.w?.some?.((v) => v >= 1)).length >= 1 && !/#[0-9a-f]{6}/i.test(own.replace(/; its text #[0-9a-f]{6}.*$/i, ''))
    // n148: a form of boxed fields said as bare grey lines (round 12 e4 checkout: floating labels inside bordered fields,
    // the 2-up / 1-up / 3-up rows, the focused email ring and the City/State/ZIP row all lost)
    const fieldBox = (p) => p.t && p.border && p.border.w.every((v) => v >= 1) && p.h >= 34 && p.h <= 64 && p.w >= 60
    const fields = d.kind && d.note && !f.regionKids.length && P.filter(fieldBox).length >= 4 && !/bordered field \d|\d+x\d+ at \d+,\d+/.test(own)
    // n159: a contents list holding 2+ big numbers is a stack of stats (round 15 c5: three 44px lime figures said as
    // one bold heading and small links, built as a heading over a link list)
    const stats = /^a contents list/.test(d.note ?? '') && P.filter((p) => p.t && p.px >= 2.5 * Math.min(...P.filter((q) => q.t).map((q) => q.px))).length >= 2
    // n159: a shadowed panel floating over a page-wide see-through dim (round 15 e5 command palette: built narrow, in
    // the wrong place, under the dim, its query row lost) is said part by part, on top of the dim
    const dimUnder = regions.some((g) => g !== f && !g.text && visible(g.bg) && g.bg.a >= 0.3 && g.bg.a <= 0.8 && g.rect.w * g.rect.h >= 0.3 * 1280 * 900)
    const floating = dimUnder && d.kind && !f.regionKids.length && f.shadow && f.shadow !== 'none' && !/inset/.test(f.shadow) && visible(f.bg) && f.bg.a > 0.9 && f.rect.w * f.rect.h >= 40000 && f.rect.w * f.rect.h < 0.3 * 1280 * 900
    // n161: a table note over a region that also holds code cells, prompts or a bar chart (round 15 e1 notebook: built
    // as one big table, the code, prompts and chart lost)
    const mixed = /table, every body row/.test(d.note ?? '') && !f.regionKids.length && P.some((p) => p.pre)
    // n161: a note that leaves out the region's gradient fills, outline rings or dashed boxes (round 15 e2 email canvas:
    // gradient hero, selected block's outline, dashed column placeholders lost)
    const unsaidPaint = d.kind && d.note && !f.regionKids.length && P.filter((p) => p.w * p.h >= 10000 && ((p.img && /^linear-gradient/.test(p.img) && !/gradient/.test(own)) || (p.ring && !/outline|ring/.test(own)) || (p.border?.style === 'dashed' && !/dashed/i.test(own)))).length >= 2
    // n161: a panel whose own background paints a picture with a gradient (round 15 e3 map: the road and its pins lost)
    const bgPic = d.kind && !f.regionKids.length && /^linear-gradient/.test(f.bgImage ?? '') && !/gradient/.test(d.note ?? '') && P.filter((p) => p.t).length >= 3 && f.rect.w * f.rect.h >= 40000
    if (!(weak && (d.kind || !f.regionKids.length)) && !stripesOnly && !frame && !thin && !bare && !vague && !fields && !unpainted && !stats && !floating && !mixed && !unsaidPaint && !bgPic) return
    const note = partsNote(P, f)
    if (frame) { out.set(f.role, { kind: 'box', note: `an invisible frame ${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px at ${Math.round(f.rect.x)},${Math.round(f.rect.y)} (no fill, no border, no shadow) whose own parts, beside the parts drawn on their own, are built ${note}` }); marked.add(f.role); return }
    // n155: the region's own panel (its fill, edge and rounding) said before its parts (round 14 e4 alerts column: the
    // parts built loose on the page, the #121722 bordered panel behind them lost)
    const R = f.rect, edge = f.border?.w >= 1 && visible(f.border.colour)
    // n156: a wide row under a top rule only says its rule whatever its area (round 14 c1 axes row: 1160x29, rule lost)
    const topRule = edge && !(f.border.bottom >= 1) && !(f.border.left >= 1) && R.w >= 300
    const panelPaint = !frame && ((R.w * R.h >= 40000 && ((visible(f.bg) && f.bg.a > 0.9 && dist(f.bg, body.bg) >= 8) || edge)) || topRule || bgPic)
    const panel = panelPaint && !(d.note ?? '').includes(`${Math.round(R.w)}x${Math.round(R.h)}`) ? `the region itself is ONE ${Math.round(R.w)}x${Math.round(R.h)}px panel at ${Math.round(R.x)},${Math.round(R.y)}${visible(f.bg) && f.bg.a > 0.9 ? `, ${hexOf(f.bg)} fill` : ', no fill'}${bgPic ? ` with over it background-image: ${f.bgImage.replace(/rgba?\([^)]+\)/g, (m) => { const c = parse(m); return c && c.a < 0.05 ? 'transparent' : hexOf(c) })} exactly (hard stops: a thin straight line across the panel)` : ''}${f.border?.w >= 1 && visible(f.border.colour) ? (f.border.bottom >= 1 && f.border.left >= 1 ? `, a ${Math.round(f.border.w)}px ${hexOf(f.border.colour)} border` : `, a ${Math.round(f.border.w)}px ${hexOf(f.border.colour)} rule along its TOP edge only (no other border)`) : ''}${f.radius >= 2 ? `, ${Math.round(f.radius)}px rounded` : ''}${f.shadow && f.shadow !== 'none' && !floating ? `, box-shadow: ${f.shadow.replace(/rgba?\([^)]+\)/g, (m) => { const c = parse(m); return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.round(c.a * 100) / 100})` : m })} (it floats over what is under it)` : ''}, with its parts inside it${P.some((p) => p.t && p.px && p.h < p.px * 2.2 && !(p.px >= 20 && p.nl >= 2)) ? ' (every one-line text part stays on ONE line: white-space nowrap, never wrapping)' : ''}; ` : ''
    // n159: a list with a coloured rule down its left edge only says that rule (round 15 c1 index: orange rule lost)
    const leftRule = !panel && !(f.border?.w >= 1) && f.border?.left >= 1 && visible(f.border.leftColour) && !(d.note ?? '').includes('LEFT edge') ? `the region has a ${Math.round(f.border.left)}px ${hexOf(f.border.leftColour)} rule down its LEFT edge only (border-left, no other border${visible(f.bg) ? '' : ', no fill'}), ${Math.round(R.h)}px tall at x ${Math.round(R.x)} from y ${Math.round(R.y)}, its parts to the right of that rule; ` : ''
    // n164: a wide row ruled above AND below says both rules and their style (round 16 c3 menu row: double rules lost)
    const twoRules = !panel && !leftRule && edge && f.border.bottom >= 1 && !(f.border.left >= 1) && R.w >= 300 ? `the region is a ${Math.round(R.w)}x${Math.round(R.h)}px row at ${Math.round(R.x)},${Math.round(R.y)}, ruled above AND below (border-top and border-bottom ${Math.round(f.border.w)}px ${f.border.topStyle}${f.border.topStyle === 'double' ? ' (two thin parallel lines each)' : ''} ${hexOf(f.border.colour)}, no side borders${visible(f.bg) ? '' : ', no fill'}); in it ` : ''
    const lift = floating ? `it FLOATS on top of the see-through dim (z-index above the dim, never dimmed or washed out itself, its own colours at full strength), ${Math.round(R.w)}x${Math.round(R.h)}px with its top-left at ${Math.round(R.x)},${Math.round(R.y)}, box-shadow: ${f.shadow.replace(/rgba?\([^)]+\)/g, (m) => { const c = parse(m); return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.round(c.a * 100) / 100})` : m })}; ` : ''
    const note1 = /nowrap/.test(panel) ? note.replace('; every one-line text part stays on ONE line (white-space nowrap): a word and the count after it never wrap apart', '') : note
    const keep = `${panel}${leftRule}${twoRules}${lift}${d.note && !weak && !fields && !unpainted && !stats && !floating && !mixed && !unsaidPaint && !bgPic ? `${d.note}; ` : ''}`
    // n148: a small grey label lying inside a field's box is a floating label (round 12 e4: built above the field)
    const inside = fields && P.some((p) => p.t && !p.border && P.some((b) => fieldBox(b) && p.x >= b.x && p.y >= b.y && p.y + p.h <= b.y + b.h))
    const fl = inside ? '; each small grey field label lies INSIDE its bordered field box at its top-left, the value under it in the same box (floating labels, NOT above the field); fields sharing a top sit side by side in one row' : ''
    out.set(f.role, { kind: !d.kind || d.kind === 'image' ? 'box' : d.kind, note: `${keep}${note1}${fl}` })
    marked.add(f.role)
  })
  // n161: a short word on a many-pointed clip-path cut-out is a star badge, its polygon said verbatim (round 15 c4
  // 'vivid yellow "NEW!"': built as a yellow circle)
  regions.forEach((f) => {
    const d = out.get(f.role)
    if (!d?.kind || !f.clipCss || f.clipPoints < 8 || !f.text || f.text.length > 16 || f.regionKids.length || !visible(f.bg)) return
    const R = f.rect
    out.set(f.role, { kind: 'box', note: `a ${Math.round(R.w)}x${Math.round(R.h)}px STAR badge at ${Math.round(R.x)},${Math.round(R.y)} (position absolute): one ${hexOf(f.bg)} fill cut by clip-path: ${f.clipCss} exactly (a ${Math.round(f.clipPoints / 2)}-pointed star, NOT a circle, NOT a rounded box, no border), ${Math.round(f.font.size)}px ${f.font.weight >= 800 ? 'black-weight ' : f.font.weight >= 600 ? 'bold ' : ''}${hexOf(f.colour)} ${quote(f.text, 16)} centred in it` })
  })
  // n163: a device turned in 3D (round 16 c5 phone: built flat and upright, the turn, tilt and floor shadow lost) is said
  // as its body with the exact turn, its screen parts in the body's own flat layout
  regions.forEach((f) => {
    const D = f.device3d
    if (!D || !out.get(f.role)?.kind) return
    const part = (p) => p.t ? `${p.bold ? 'bold ' : ''}${p.px}px ${hexOf(p.ink)}${p.op < 0.98 ? ` ${Math.round(p.op * 100)}% opacity` : ''} ${quote(p.t, 28)}${p.fill ? ` on a ${p.w}x${p.h}px ${hexOf(p.fill)} ${p.rad}px-rounded tile` : ''}${p.right ? ' (right-aligned in its row)' : ''} at ${p.x},${p.y}`
      : p.img ? `a ${p.w}x${p.h}px bar painted ${cssHex(p.img)}${p.rad ? `, ${p.rad}px rounded` : ''} at ${p.x},${p.y}` : `a ${p.w}x${p.h}px ${hexOf(p.fill)} ${p.rad}px-rounded block at ${p.x},${p.y}`
    out.set(f.role, { kind: 'box', note: `a phone/device mockup TURNED IN 3D (NOT flat, NOT upright): ONE ${D.w}x${D.h}px stage div at ${D.x},${D.y} (position absolute) with perspective: ${D.persp}; inside it ONE ${D.w}x${D.h}px device body, ${hexOf(D.fill)} fill${D.bw ? `, a ${Math.round(D.bw)}px ${hexOf(D.bc)} border` : ''}, ${D.rad}px rounded, overflow hidden, box-shadow: ${cssHex(D.shadow)}, transform: ${D.tf} exactly (so it leans and turns away; keep the transform on the body); its screen parts are children of the body and turn with it, placed in the body's own unturned layout (px from the body's top-left, size, then x,y): ${D.parts.map(part).join('; ')}` })
  })
  // n163: a title set on an arc, one turned letter at a time (round 16 c3 'SUNDOWNER': said as links)
  regions.forEach((f) => {
    const A = f.arcText
    if (!A || !out.get(f.role)) return
    out.set(f.role, { kind: 'heading', note: `the word ${quote(A.letters.join(''), 30)} set on an ARC (a curved title bending over a centre point, NOT a straight line, NOT links): a zero-size anchor div at page ${A.cx},${A.cy} (position absolute) holding ${A.letters.length} letter spans, each position absolute at left ${-A.w / 2}px, top ${-A.radius}px, ${A.w}x${A.radius}px, text-align center, ${A.px}px ${A.weight >= 700 ? 'bold ' : ''}${hexOf(A.ink)}, transform-origin ${A.origin} (the anchor point, ${A.radius}px below the letter), each turned by its own transform: ${A.letters.map((l, i) => `"${l}" rotate(${A.rots[i]}deg)`).join(', ')}` })
  })
  // n165: a field of blurred glow blobs in a zero-size wrapper (round 16 c2: no note, built as nothing)
  regions.forEach((f) => {
    const B = f.blobField
    if (!B || !out.has(f.role)) return
    out.set(f.role, { kind: 'box', note: `${B.length} soft blurred colour GLOWS behind everything (NOT boxes, NOT circles with edges, NOT empty): each its own div, position absolute, z-index 0 under all content, no border, no text: ${B.map((q) => `${q.w}x${q.h}px at ${q.x},${q.y}${q.round ? ' circle (border-radius 50%)' : ''} ${q.img ? `background: ${cssHex(q.img)}` : `${hexOf(q.c)} fill`}${q.op < 98 ? `, opacity ${q.op / 100}` : ''}, filter: blur(${q.blur}px)`).join('; ')}; they melt into big glowing haze patches` })
  })
  // n163: a wrapper of separately placed floating cards (round 16 c5 chips: said as buttons, built inside the nav)
  regions.forEach((f) => {
    const K = f.absKids
    if (!K || !out.get(f.role)?.kind) return
    // n166: textual blocks with visible fills, unturned and unshadowed, many of them, are placed blocks on a grid (round 16 e2
    // calendar events: said as floating cards / buttons, built in the wrong day columns and hours with pale fills)
    if (K.length >= 4 && K.every((k) => !k.rot && (!k.shadow || k.shadow === 'none') && visible(k.fill) && k.fill.a > 0.8)) {
      out.set(f.role, { kind: 'box', note: `${K.length} solid coloured blocks each placed at its exact spot (like calendar events on a time grid: NOT a list, NOT a row, NOT buttons, NOT pale): each its own div, position absolute in page px, z-index 2 over the grid, opaque fill, padding ${K[0].pad}, ${K[0].bold ? 'bold ' : ''}${K[0].px}px text, line-height ${K[0].lh}, ${K[0].rad}px rounded, text top-left (not centred), wrapping inside its block: ${K.map((k) => `${k.t.includes('\n') ? `${k.t.split('\n').length} lines ${k.t.split('\n').map((l) => quote(l, 24)).join(' / ')}` : quote(k.t, 24)}: left ${k.x}, top ${k.y}, ${k.w}x${k.h}px, ${hexOf(k.fill)} fill, ${hexOf(k.ink)} text`).join('; ')}` })
      return
    }
    out.set(f.role, { kind: 'box', note: `${K.length} separate FLOATING cards scattered over the page (NOT in the nav, NOT in a row, NOT buttons in a group), each its own div, position absolute, above the other parts (z-index 2): ${K.map((k) => `${quote(k.t, 24)} at ${k.x},${k.y} (${k.w}x${k.h}px, ${visible(k.fill) ? `${hexOf(k.fill)} fill, ` : 'no fill, '}${k.rad}px rounded, ${k.bold ? 'bold ' : ''}${k.px}px ${hexOf(k.ink)} text${k.shadow && k.shadow !== 'none' ? `, box-shadow: ${cssHex(k.shadow)}` : ''}${k.rot ? `, transform: rotate(${k.rot}deg)` : ''})`).join('; ')}` })
  })
  // a heading carries its set size and line count, so the bench draws it as tall as it is
  const plan = regions.filter((f) => out.get(f.role).kind).map((f) => {
    const k = out.get(f.role).kind
    if (k === 'shape') return [f.role, k, { poly: out.get(f.role).poly }]
    // a letter-by-letter word is drawn as one line of its biggest letters, not a paragraph (round 7 c2: 16px x 7 lines)
    // n172: an overprinted word is sized by its copies, not the wrapper's 16px (round 17 c2: fontPx 16 lines 6)
    if (k === 'heading' && f.overprint) return [f.role, k, { fontPx: f.overprint.px, lines: f.overprint.t.split('\n').length }]
    if (k === 'heading' && f.letterWave) return [f.role, k, { fontPx: Math.max(...f.letterWave.letters.map((l) => l.px)), lines: 1 }]
    if (k === 'heading' && f.textLines >= 1) return [f.role, k, { fontPx: Math.round(f.font.size), lines: f.textLines, ...(unionOf.has(f.role) ? { union: unionOf.get(f.role) } : {}) }]
    // a paragraph of 2+ lines is drawn line by line at its real spacing (round 3 c3: 2 lines at 28px
    // were drawn 24px apart, read as 16px type, built as one small line)
    if (k === 'text' && f.textLines >= 2 && f.textLines <= 8) return [f.role, k, { fontPx: Math.round(f.font.size), lines: f.textLines }]
    // n175: a one-line intro of 20px or more keeps its size (round 17 c5: 22px intro built 12px, pushing the bento down)
    if (k === 'text' && f.textLines === 1 && f.font?.size >= 20) return [f.role, k, { fontPx: Math.round(f.font.size), lines: 1 }]
    return [f.role, k]
  })
  // thick-bordered boxes laid edge to edge are one ruled grid (round 6 c5: built as separate boxes with gaps)
  const ruled = regions.filter((f) => f.border.w >= 2 && visible(f.border.colour) && !f.regionKids.length)
  const touch = (A, B, t) => {
    const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)
    return (ox > 20 && Math.abs(oy) <= t) || (oy > 20 && Math.abs(ox) <= t)
  }
  const pairs = ruled.flatMap((A, i) => ruled.slice(i + 1).filter((B) => touch(A.rect, B.rect, Math.max(A.border.w, B.border.w) + 1)))
  // a dense app page (6+ top-level cards): each card says its exact size and place, or the detail said inside one
  // grows it and pushes every card below it down (round 8 e2: KPI cards built tall, chart and table ~100px low)
  const cards = regions.filter((f) => out.get(f.role).kind === 'box' && out.get(f.role).note && !regions.some((g) => g.regionKids.includes(f.role)) && f.rect.w >= 150 && f.rect.h >= 60 && f.rect.w * f.rect.h < 0.6 * 1280 * 900)
  // n126: the floating one (overlapping another card) takes no room, and each card's top is also said against the card
  // right above it (round 8 e2: popover ~30px low, table card ~190px low under the chart, gap left)
  const over = (a, b) => a.x < b.x + b.w - 4 && b.x < a.x + a.w - 4 && a.y < b.y + b.h - 4 && b.y < a.y + a.h - 4
  if (cards.length >= 6) cards.forEach((f) => {
    const d = out.get(f.role), r = f.rect
    // the floating panel overlaps two or more cards (a popover over a stat card, the chart and the heat card)
    const floating = cards.filter((g) => g !== f && over(r, g.rect)).length >= 2
    const above = cards.filter((g) => g !== f && !over(r, g.rect) && cards.filter((k) => k !== g && over(g.rect, k.rect)).length < 2 && g.rect.y + g.rect.h <= r.y + 2 && g.rect.x < r.x + r.w && r.x < g.rect.x + g.rect.w).sort((a, b) => (b.rect.y + b.rect.h) - (a.rect.y + a.rect.h))[0]
    const gap = above ? Math.round(r.y - above.rect.y - above.rect.h) : null
    const under = above && gap >= 0 && gap <= 60 ? `, its top ${gap}px under the bottom of the card right above it (that card ends at y ${Math.round(above.rect.y + above.rect.h)}: no wider gap)` : ''
    const place = floating
      ? `position: absolute at left ${Math.round(r.x)}px, top ${Math.round(r.y)}px of the page, floating ABOVE the cards it overlaps (z-index on top): it takes NO room in the layout, nothing else moves for it`
      : `its top-left at ${Math.round(r.x)},${Math.round(r.y)}${under} (fixed size and place: fit what is inside it, never grow it or push the cards below down; every floating panel takes no room)`
    d.note = `${d.note}; the card exactly ${Math.round(r.w)}x${Math.round(r.h)}px, ${place}`
  })
  // n139: words laid over a shape are kept only when no other note says them (round 10 c2 '02 /' is the RIDE label)
  regions.filter((f) => f.textOver).forEach((f) => {
    const d = out.get(f.role), q = `"${f.textOver.t}"`
    if (d?.note && regions.some((g) => g !== f && (out.get(g.role)?.note ?? '').includes(q))) d.note = d.note.replace(/; centred on top of it [^;]*/, '')
  })
  // n148: a heading or line of copy set bold whose note never says its weight (round 12 c5: the bold italic serif
  // headline and the bold dek were both built regular)
  regions.forEach((f) => {
    const d = out.get(f.role)
    if (!d?.kind || !['heading', 'text'].includes(d.kind) || f.regionKids.length || (f.font?.weight ?? 400) < 600) return
    if (/\bbold\b|heavy|font-weight|\bblack\b|semibold|part by part/i.test(d.note ?? '')) return
    d.note = `${d.note ? `${d.note}; ` : ''}set BOLD (font-weight ${f.font.weight})${f.font.style === 'italic' ? ' and italic' : ''}, NOT regular`
  })
  let pn = pageNote(body)
  // n144: a 3D-tilted floor that spans the page is said in the page note and drawn as no mark (round 11 c4: its drawn
  // box was read as the PAGE background and its note pinned on the stats card, so the floor was built inside the card)
  regions.filter((f) => f.rect.w >= 1000 && /^a \d+x\d+px block with its top-left at .*tilted back in 3D/.test(out.get(f.role)?.note ?? '')).forEach((f) => {
    const i = plan.findIndex(([r]) => r === f.role)
    if (i < 0) return
    plan.splice(i, 1)
    pn = `${pn ?? 'whole page:'}; ALSO a FLOOR that is part of the page itself (no mark is drawn for it): ONE div, position absolute, z-index 0, directly in the page body under all content (NOT the page background, NOT inside any card or other part; the other parts sit above it, z-index 1): ${out.get(f.role).note}`
    out.get(f.role).note = null
  })
  if (pairs.length >= 4) {
    const bw = Math.round(ruled[0].border.w)
    pn = `${pn ?? 'whole page:'}${pn ? ';' : ''} the ${ruled.length} ${colourName(ruled[0].border.colour)}-bordered boxes are ONE ruled grid filling the page edge to edge: neighbouring boxes share a single ${bw}px ${colourName(ruled[0].border.colour)} line, no gaps between boxes, no doubled lines`
  }
  // n148: a flat side panel under some parts: said in the page note (no mark), and each part on it or beside it is
  // said as sitting straight on its ground, not in a card of its own
  for (const q of body.sides ?? []) {
    pn = `${pn ?? 'whole page:'}${pn ? ';' : ''} ALSO a FLAT ${hexOf(q.fill)} side panel that is part of the page itself (no mark is drawn for it): ONE div, position absolute, z-index 0, ${q.w}px wide at x ${q.x}, from the very top to the very bottom of the page at its ${q.edge} edge, square corners, no shadow${q.rule ? `, a 1px ${hexOf(q.rule.c)} line down its ${q.rule.side} side` : ''}; the rest of the page stays ${visible(body.bg) ? hexOf(body.bg) : '#ffffff'}`
    regions.forEach((f) => {
      const d = out.get(f.role)
      if (!d?.kind || d.kind === 'heading' || visible(f.bg) || f.rect.w < 200 || f.rect.h < 120) return
      const on = f.rect.x >= q.x - 2 && f.rect.x + f.rect.w <= q.x + q.w + 2
      d.note = `${d.note ? `${d.note}; ` : ''}${on ? `it sits straight on the page's ${hexOf(q.fill)} side panel` : `it sits straight on the ${visible(body.bg) ? hexOf(body.bg) : 'white'} page`}: NOT a card (no fill, no border, no shadow, no padding box of its own)${/ at \d+,\d+/.test(d.note ?? '') ? ', its parts at the page px given' : ''}`
    })
  }
  // n176: a filled pill holding words inside a region whose note never says it (round 17 c5 nav 'Book a demo' on a
  // #f4f4f5 pill, said only as a line: built outlined)
  regions.forEach((f) => {
    const d = out.get(f.role)
    if (!d.kind || !d.note || /part by part|pill|button|\btag\b|label|chip|badge/i.test(d.note)) return
    const pills = (f.parts ?? []).filter((q) => q.t && q.fill && q.radius >= q.h / 2 - 1 && q.h >= 28 && q.w >= 2.5 * q.h && q.h <= 60 && q.w <= 300 && q.t.length <= 30 && d.note.includes(q.t.slice(0, 12)))
    if (pills.length && pills.length <= 3) d.note += `; ${pills.map((q) => `"${q.t}" is a FILLED pill button (${hexOf(q.fill)} fill, no border, ${q.w}x${q.h}px, ${q.bold ? 'bold ' : ''}${hexOf(q.ink)} text), NOT outlined, NOT plain text`).join('; ')}`
  })
  const notes = [...(pn ? [['*', pn]] : []), ...regions.filter((f) => out.get(f.role).note).map((f) => [f.role, out.get(f.role).note])]
  return { plan, notes }
}

export const wordCount = (notes) => notes.reduce((s, [, t]) => s + t.split(/\s+/).filter(Boolean).length, 0)
