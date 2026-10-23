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
      bg: rgba(cs.backgroundColor),
      bgImage: cs.backgroundImage,
      bgImageColours: colours(cs.backgroundImage),
      clipText: (cs.webkitBackgroundClip || cs.backgroundClip) === 'text',
      border: { w: parseFloat(cs.borderTopWidth) || 0, colour: rgba(cs.borderTopColor), bottom: parseFloat(cs.borderBottomWidth) || 0, left: parseFloat(cs.borderLeftWidth) || 0, leftColour: rgba(cs.borderLeftColor), topStyle: cs.borderTopStyle },
      radius: parseFloat(cs.borderTopLeftRadius) || 0,
      radiusPct: cs.borderTopLeftRadius.includes('%') ? parseFloat(cs.borderTopLeftRadius) : null,
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
        return { t: k.innerText.replace(/\s+/g, ' ').trim(), px: Math.round(parseFloat(s.fontSize)), mono: /mono|courier/i.test(s.fontFamily), bold: +s.fontWeight >= 600 }
      })(),
      // gradient-filled words inside a heading ('three dimensions' in cyan to pink: round 6 c1, unsaid)
      clipKid: (() => {
        const k = [...el.querySelectorAll('*')].find((x) => (getComputedStyle(x).webkitBackgroundClip || getComputedStyle(x).backgroundClip) === 'text' && /gradient/.test(getComputedStyle(x).backgroundImage))
        return k ? { t: (k.innerText || '').replace(/\s+/g, ' ').trim(), bgImage: getComputedStyle(k).backgroundImage, bgImageColours: colours(getComputedStyle(k).backgroundImage) } : null
      })(),
      // one word whose letters each carry their own size and weight (round 7 c2 'VARIABLE' wave: no note, invented copy)
      letterWave: (() => {
        if (kids.length < 3 || kids.length > 24) return null
        const ls = kids.map((k) => { const s = getComputedStyle(k); return { t: (k.innerText || '').trim(), px: Math.round(parseFloat(s.fontSize)), w: +s.fontWeight } })
        if (ls.some((l) => !l.t || l.t.length > 2)) return null
        const pxs = ls.map((l) => l.px), ws = ls.map((l) => l.w)
        if (Math.max(...pxs) - Math.min(...pxs) < 12 && Math.max(...ws) - Math.min(...ws) < 300) return null
        if (Math.max(...pxs) < 40) return null
        return { letters: ls, width: Math.round(r.width), top: Math.round(r.top), left: Math.round(r.left), colour: rgba(getComputedStyle(el).color) }
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
        const toEnd = clear(args[args.length - 1])
        const ax = /180deg|to bottom/.test(dir) ? ['top', 'bottom'] : /0deg|to top/.test(dir) ? ['bottom', 'top'] : /90deg|to right/.test(dir) ? ['left', 'right'] : /270deg|to left/.test(dir) ? ['right', 'left'] : ['top', 'bottom']
        const at = parseFloat(m.match(/(\d+)%/)?.[1] ?? '50')
        return { toward: toEnd ? ax[1] : ax[0], fromPct: Math.round(at) }
      })(),
      // soft colour glows (radial gradients fading to transparent) over a fill: a reel or a hero lit by blobs
      glows: (() => {
        const rs = [...cs.backgroundImage.matchAll(/radial-gradient\((?:[^()]|\([^()]*\))*\)/g)].map((m) => m[0])
        if (rs.length < 2) return null
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
        return { ...extra, px: Math.round(b.width), round: gs.borderTopLeftRadius.includes('%') ? parseFloat(gs.borderTopLeftRadius) >= 40 : parseFloat(gs.borderTopLeftRadius) >= b.width * 0.4, stops, label }
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
        return { text: (t.textContent || '').trim(), px: Math.round(r.width), size: cs ? Math.round(parseFloat(cs.fontSize) * sc) : 0, weight: cs ? Number(cs.fontWeight) : 400, spacing: cs ? Math.round((parseFloat(cs.letterSpacing) || 0) * sc) : 0, rad: Math.round(rad * sc), ink,
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
      kidBoxes: kids.filter((k) => (k.innerText || '').trim()).map((k) => { const c = getComputedStyle(k); const b = k.getBoundingClientRect(); return { t: (k.innerText || '').replace(/\s+/g, ' ').trim(), fill: rgba(c.backgroundColor), ink: rgba(c.color), h: b.height, w: b.width, top: b.top - r.top, bottom: b.bottom - r.top, left: b.left - r.left, right: b.right - r.left, radius: parseFloat(c.borderTopLeftRadius) || 0, s: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 600, spacing: (parseFloat(c.letterSpacing) || 0) / (parseFloat(c.fontSize) || 16), struck: /line-through/.test(c.textDecorationLine), bw: parseFloat(c.borderTopWidth) || 0, bc: rgba(c.borderTopColor) } }),
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
        return out.length ? { lines: out.map((l) => l.join(' ')), w: Math.round(hi - lo) } : null
      })(),
      // the untransformed box (a tilted floor shows shorter than it is built: round 6 c1)
      layoutBox: { w: el.offsetWidth, h: el.offsetHeight },
      tokenInks: [...el.querySelectorAll('b,em,span,i,strong')].filter((k) => !k.children.length && txt(k)).map((k) => ({ t: txt(k), c: rgba(getComputedStyle(k).color) })),
      // a small textless pill: a toggle switch
      toggle: [...el.querySelectorAll('*')].map((k) => { const c = getComputedStyle(k); const b = k.getBoundingClientRect(); return !(k.innerText || '').trim() && b.width >= 30 && b.width <= 70 && b.height >= 16 && b.height <= 40 && b.width > b.height * 1.3 && parseFloat(c.borderTopLeftRadius) >= b.height / 2 - 1 ? rgba(c.backgroundColor) : null }).find(Boolean) || null,
      dense: dense(el),
      // each corner's radius (a dropdown hangs square-topped from its bar, round 6 e1)
      corners: ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((c) => parseFloat(cs[`border${c}Radius`]) || 0),
      // a picture block painted by ::before/::after (round 6 e1 featured card's gradient square: unsaid)
      pseudoPic: (() => { for (const w of ['::before', '::after']) { const c = getComputedStyle(el, w); const pw = parseFloat(c.width), ph = parseFloat(c.height); if (!c.content || c.content === 'none' || !(pw >= 40 && ph >= 40) || pw > 200 || ph > 200 || pw >= r.width * 0.6) continue; const g = [...c.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0])).filter(Boolean); const fl = rgba(c.backgroundColor); if (!g.length && !(fl?.a > 0.05)) continue; return { w: Math.round(pw), h: Math.round(ph), grad: g.length >= 2 ? g : null, fill: fl?.a > 0.05 ? fl : null, radius: Math.round(parseFloat(c.borderTopLeftRadius) || 0), x: Math.round(parseFloat(c.left) || 0), y: Math.round(parseFloat(c.top) || 0) } } return null })(),
      // a big solid shape painted by ::before/::after over a photo backdrop (round 7 e4 jacket: over 200px, unsaid)
      pseudoShape: (() => { for (const w of ['::before', '::after']) { const c = getComputedStyle(el, w); const pw = parseFloat(c.width), ph = parseFloat(c.height); if (!c.content || c.content === 'none' || !(pw > 120 && ph > 120) || pw >= r.width * 0.9) continue; const fl = rgba(c.backgroundColor); if (!(fl?.a > 0.3)) continue; return { w: Math.round(pw), h: Math.round(ph), fill: fl, radius: c.borderRadius, x: Math.round(parseFloat(c.left) || 0), y: Math.round(parseFloat(c.top) || 0) } } return null })(),
      // a 2px+ outline ring round the block (a selected thumbnail, round 7 e4)
      ring: (() => { const ow = parseFloat(cs.outlineWidth) || 0; return ow >= 2 && cs.outlineStyle !== 'none' ? { w: Math.round(ow), off: Math.round(parseFloat(cs.outlineOffset) || 0), colour: rgba(cs.outlineColor) } : null })(),
      // small square handles sitting on the block's corners (a selected layer in a design tool, round 8 e3: lost)
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
    const headRow = [el, ...el.querySelectorAll('*')].find((p) => p.children.length >= 4 && [...p.children].every((k) => DATE.test(txt(k))))
    if (headRow) {
      const hs = [...headRow.children].map((k) => ({ t: txt(k), b: k.getBoundingClientRect() }))
      const x0 = hs[0].b.left, cw = (hs[hs.length - 1].b.right - x0) / hs.length
      const at = (x) => { const c = Math.max(0, Math.min(hs.length - 1, Math.floor((x - x0) / cw))); const fr = (x - x0) / cw - c; return { c, fr } }
      const line = [...el.querySelectorAll('*')].find((k) => { const b = k.getBoundingClientRect(); return filled(k) && b.width <= 4 && b.height >= own.height * 0.5 })
      // the today line's tag is not a task
      const bars = [...el.querySelectorAll('*')].filter((k) => { const b = k.getBoundingClientRect(); return !(line && line.contains(k)) && filled(k) && txt(k) && !k.children.length && b.height <= 44 && b.width >= 24 && b.top > hs[0].b.bottom && getComputedStyle(k).position === 'absolute' })
      if (bars.length >= 3 && new Set(bars.map((k) => Math.round(k.getBoundingClientRect().top / 8))).size === bars.length) {
        const where = (x, edge) => { const { c, fr } = at(x); return `${edge === 'start' ? (fr < 0.25 ? 'start of' : fr < 0.75 ? 'mid' : 'end of') : (fr > 0.75 ? 'end of' : fr > 0.25 ? 'mid' : 'start of')} ${hs[c].t}` }
        // row pitch and how far down the rows reach: without them a tall box got its rows spread to fill it (round 4 e5 built 2x tall)
        const tops = bars.map((k) => k.getBoundingClientRect().top).sort((a, b) => a - b)
        const gaps = tops.slice(1).map((t, i) => t - tops[i]).sort((a, b) => a - b)
        const pitch = Math.round(gaps[Math.floor(gaps.length / 2)])
        const lastB = Math.max(...bars.map((k) => k.getBoundingClientRect().bottom))
        const reach = Math.round(((lastB + pitch / 2 - own.top) / own.height) * 10) * 10
        return { type: 'gantt', pitch, reach, heads: hs.map((h) => h.t), bars: bars.map((k) => { const b = k.getBoundingClientRect(); return { text: txt(k), fill: filled(k), from: where(b.left + 1, 'start'), to: where(b.right - 1, 'end'), h: Math.round(b.height) } }), line: line ? { fill: filled(line), at: where(line.getBoundingClientRect().left, 'start'), label: txt(line) } : null }
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
        return { fill: stroke(p), dashed: !!(p.getAttribute('stroke-dasharray') ?? '').trim() && p.getAttribute('stroke-dasharray') !== 'none', points: pts.length, rising: pts.length >= 2 ? pts[pts.length - 1][1] < pts[0][1] : null, thick: parseFloat(getComputedStyle(p).strokeWidth) >= 3 }
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
      const r = bars.map((k) => k.getBoundingClientRect())
      const base = r.map((b) => Math.round(b.bottom)), hs = r.map((b) => Math.round(b.height))
      if (Math.max(...base) - Math.min(...base) <= 2 && new Set(hs).size >= 3 && r.every((b) => b.width < b.height * 2.5)) {
        const title = kids.map(txt).find((t) => t && t.length <= 40)
        return { type: 'bars', count: bars.length, colour: filled(bars[0]), odd: (() => { const cs = bars.map((k) => filled(k)); const key = (c) => `${c.r},${c.g},${c.b}`; const n = new Map(); cs.forEach((c) => n.set(key(c), (n.get(key(c)) ?? 0) + 1)); const main = [...n.entries()].sort((a, b) => b[1] - a[1])[0][0]; const o = cs.map((c, i) => [i, c]).filter(([, c]) => key(c) !== main); return o.length && o.length <= 2 ? { main: cs.find((c) => key(c) === main), o } : null })(), title, rising: hs[hs.length - 1] > hs[0], heights: hs.map((h) => Math.round(h / Math.max(...hs) * 100)) }
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
      return { av: filled(av), round: parseFloat(getComputedStyle(av).borderTopLeftRadius) >= ab.width * 0.4, px: Math.round(ab.width), name: txt(name), time: txt(time), body: body.replace(/\s+/g, ' ').trim(), extra: extra.map((g) => ({ t: txt(g), chip: !!filled(g), ink: rgba(getComputedStyle(g).color) })) }
    }
    // (2+ is enough: a thread pane holds two replies under its title)
    const mk = kids.filter((k) => !k.dataset?.r && !k.querySelector('[data-r]') && msgOf(k))
    if (mk.length >= 2 && mk.length >= kids.length - 2) {
      const head = kids.find((k) => !mk.includes(k) && !k.dataset?.r && !k.querySelector('[data-r]') && txt(k) && txt(k).length <= 40)
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
      const extra = kids.filter((k) => k !== head && !rep.includes(k) && !rep.some((r) => k.contains(r)) && txt(k) && txt(k).length <= 32).map((k) => {
        const c = getComputedStyle(k); const b = k.getBoundingClientRect()
        const btn = b.height >= 28 && b.height <= 64 && (filled(k) || parseFloat(c.borderTopWidth) >= 1) && (/center/.test(c.textAlign) || (/flex/.test(c.display) && /center/.test(c.justifyContent)))
        // a row of filled chips (seat labels E4 E5, round 8 e4: run together as 'E4E5')
        const cs2 = [...k.children]
        if (cs2.length >= 2 && cs2.every((g) => filled(g) && txt(g) && txt(g).length <= 8 && !g.children.length)) return { t: cs2.map(txt).join(' '), chips: cs2.map((g) => ({ t: txt(g), fill: filled(g), ink: rgba(getComputedStyle(g).color) })), btn: false, fill: null, big: false }
        // grey copy lines under a title (date, hall: round 8 e4 dropped) say their line breaks
        const lines = (k.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean)
        return { t: txt(k), btn, fill: btn ? filled(k) : null, big: parseFloat(c.fontSize) >= 24, lines: lines.length >= 2 && lines.length <= 4 ? lines : null }
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
        return { type: 'order', items: rep.map((k, i) => { const ls = lines(k); return { qty: badges[i].qty, name: ls[0], sub: ls.length >= 3 ? ls.slice(1, -1).join(' ') : null, price: ls.length >= 2 ? ls[ls.length - 1] : null } }), thumb: badges[0], after, top: !above && top >= 60 ? top : null }
      }
      // the highlighted item's coloured left edge (round 6 e3 selected mail row)
      const onEdge = odd.length === 1 && parseFloat(getComputedStyle(odd[0]).borderLeftWidth) >= 3 ? rgba(getComputedStyle(odd[0]).borderLeftColor) : null
      return { type: 'list', pic, head: head ? txt(head) : null, items: rep.map(parts), bold: rep.map(boldFirst), bold2: rep.map((k) => { const w = [...k.querySelectorAll('*')].filter((g) => !g.children.length && txt(g))[1]; return w ? parseFloat(getComputedStyle(w).fontWeight) >= 600 : false }), on, onFill: odd.length === 1 ? filled(odd[0]) : null, onEdge, extra, dots: dots.every(Boolean) ? dots : null, stacked: rep.every((k, i) => i === 0 || k.getBoundingClientRect().top >= rep[i - 1].getBoundingClientRect().bottom - 2), thumbs: thumbs.every(Boolean) ? thumbs : null, switches: switches.every(Boolean) ? switches : null, smalls: rep.map((k) => { const sm = [...k.querySelectorAll('small')].map(txt); return sm.length === 1 ? sm[0] : null }), inks: rep.map((k) => rgba(getComputedStyle(k).color)), weights: rep.map((k) => Number(getComputedStyle(k).fontWeight)), px: Math.round(parseFloat(getComputedStyle(rep[0]).fontSize)),
        // items under their own small headings, in page order (round 8 e5 docs nav: 'GETTING STARTED ... 5 more' became
        // invented items under the wrong headings)
        groups: (() => { const par = rep[0].parentElement; if (!rep.every((k) => k.parentElement === par)) return null; const gs = []; for (const k of par.children) { if (rep.includes(k)) { if (!gs.length) return null; gs[gs.length - 1].items.push(rep.indexOf(k)) } else if (txt(k) && !k.dataset?.r && !k.querySelector('[data-r]') && txt(k).length <= 32) gs.push({ h: txt(k), items: [] }) } return gs.length >= 2 && gs.every((g) => g.items.length) ? gs : null })() }
    }
    return null
  }
  // a fine grain laid over the whole page by an unmarked layer (round 5 c4: unsaid)
  const grain = [...document.querySelectorAll('body *')].some((k) => { const b = k.getBoundingClientRect(); return !k.closest('[data-r]') && /repeating-(radial|linear)-gradient/.test(getComputedStyle(k).backgroundImage) && b.width >= innerWidth * 0.9 && b.height >= innerHeight * 0.9 })
  return { body: { ...fact(document.body), grain }, regions: [...document.querySelectorAll('[data-r]')].map(fact) }
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
const quote = (s, n = 48) => (s.length > n ? `"${s.slice(0, n).replace(/\s+\S*$/, '')}"…` : `"${s}"`)
const uniq = (xs) => [...new Set(xs.filter(Boolean))]

function gradientWords(f) {
  if (!/gradient/.test(f.bgImage)) return null
  const names = uniq(f.bgImageColours.map((c) => (parse(c)?.a ?? 1) < 0.3 ? null : colourName(c)))
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
  const hard = (f.bgImage.match(/\d+%\s*,\s*rgb[^)]+\)\s+\d+%/g) || []).length >= 2 || /\)\s+\d+%\s+\d+%/.test(f.bgImage)
  if (hard) return `${names.join(', ')} stripes`
  // which end is which (round 4 c1 blue photo built flat navy, round 5 c4 dark end on the
  // wrong side): a two-colour linear blend says where each colour sits and whether it is vivid
  const ends = linearEnds(f.bgImage)
  if (ends && names.length === 2 && /^linear-gradient/.test(f.bgImage.trim())) {
    const cs = f.bgImageColours.filter((c) => (parse(c)?.a ?? 1) >= 0.3)
    const say = (c) => `${vivid(c) ? 'vivid ' : ''}${colourName(c)}`
    return `${say(cs[0])} (${ends[0]}) to ${say(cs[cs.length - 1])} (${ends[1]}) gradient`
  }
  // three or more stops in a straight blend: each stop's hex and where it sits, or the middle one is lost
  // (round 7 c3 sky #0f172a → #312e81 55% → #be185d said 'dark navy to dark grey to dark pink', built dark grey)
  const stops = linearStops(f.bgImage)
  if (ends && stops && stops.length >= 3) return `${stops.map((x, i) => `${colourName(x.c)} (${hexOf(x.c)}${i && i < stops.length - 1 ? ` at ${x.at}%` : ''})`).join(' to ')} gradient, ${ends[0]} to ${ends[1]}`
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
  if (f.vertical) w.push(f.font.size <= 24 && f.rect.h >= 120 && !visible(f.bg) ? `vertical (writing-mode: vertical-rl), ${Math.round(f.font.size)}px letters, the line about ${Math.round(f.rect.h)}px long` : 'vertical')
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
  // a faded block: built solid otherwise (round 5 c3 cards at 75/45/20%)
  if (f.opacity < 0.6 || (f.opacity < 0.9 && ((f.bg && f.bg.a > 0.05) || /gradient/.test(f.bgImage)))) w.push(`faded to ${Math.round(f.opacity * 100)}% opacity (see-through)`)
  if (f.maskFade) w.push(`fading out into the page toward the ${f.maskFade.toward} (solid until ${f.maskFade.fromPct}%, gone at the ${f.maskFade.toward} edge)`)
  if (f.backdrop || (f.bg && f.bg.a > 0.03 && f.bg.a < 0.4)) w.push('frosted glass')
  // one edge: say how far past it the block starts ('off the left edge' alone built at x=0, round 2 c2)
  const past = f.bleeds !== 'left and right' && f.bleedPx >= 16 ? ` (${f.bleeds === 'right' ? 'runs' : 'starts'} ${f.bleedPx}px past it)` : ''
  if (f.bleeds) w.push(`bleeding off the ${f.bleeds} page edge${f.bleeds === 'left and right' ? 's' : ''}${past}`)
  return w
}
// computed style writes 'transparent' as rgba(0, 0, 0, 0) (round 6 c1 floor: grid never recognised)
const gridLines = (f) => /gradient\([^,]*,?\s*rgba?\([^)]+\)\s*1px/.test(f.bgImage) || /1px,\s*(?:transparent|rgba\(0, 0, 0, 0\)) 1px/.test(f.bgImage)

function typeWords(f, page) {
  const w = []
  if (f.font.size >= 80) w.push('giant'); else if (f.font.size >= 52) w.push('huge'); else if (f.font.size >= 32) w.push('big')
  // display type: the face sets the word's width, so name it (said once on the page note otherwise)
  if (f.font.size >= 52 && faceName(f.font.family) && !isMono(f.font.family)) w.push(faceName(f.font.family))
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
      if (p.kind === 'code') return `a dark code block (${p.fill ? hexOf(p.fill) : 'near-black'} fill, ${p.radius}px rounded, ${p.px}px monospace ${colourName(p.ink)} text${p.toks.length > 1 ? `, syntax colours ${p.toks.map(hexOf).join(' ')}` : ''}) with ${p.lines.length} lines: ${p.lines.map((l) => quote(l, 70)).join(' / ')}`
      if (p.kind === 'callout') return `a callout box (${hexOf(p.fill)} fill, a ${p.edge.px}px ${hexOf(p.edge.c)} left edge, rounded right corners) with bold ${quote(p.lead, 12)} then ${quote(p.t.replace(p.lead, '').trim(), 60)}`
      if (p.kind === 'table') return `a ${p.ruled ? 'fully ruled ' : ''}table${p.head ? ` with a ${hexOf(p.head)} header row` : ''}: ${p.rows.map((r) => r.map((c) => quote(c, 18)).join(' | ')).join(' / ')}`
      if (p.px <= 13) return `small ${p.px}px ${colourName(p.ink)} line ${quote(p.t, 60)}${/›|>|\//.test(p.t) ? ' (a breadcrumb)' : ''}`
      return `${p.px}px ${colourName(p.ink)} paragraph ${quote(p.t, 220)}${p.code.length ? ` with inline code ${p.code.map((c) => `${quote(c.t, 16)} (${hexOf(c.ink)} monospace on a ${c.fill ? hexOf(c.fill) : 'grey'} rounded chip)`).join(', ')}` : ''}`
    }).join('; then ')}${d.parts.some((p) => p.kind === 'table' && p.rows.flat().length) ? '; code words in the table are monospace, not status pills' : ''}`
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
      return `order summary${d.top ? `, no heading, first row starts ${d.top}px below the panel top` : ''}: ${d.items.length} item rows, each a ${t.px}px ${t.fill ? `solid ${colourName(t.fill)} (${hexOf(t.fill)}, plainly darker than the panel) ` : ''}rounded square picture with a small round ${t.badge ? `${colourName(t.badge)} ` : ''}quantity badge (white number) on its top-right corner, then bold name with a small grey line under it, bold price at the right: ${d.items.map((x) => `${quote(x.name, 28)}${x.sub ? ` / ${quote(x.sub, 24)}` : ''} badge ${x.qty}${x.price ? `, ${x.price}` : ''}`).join('; ')}${aft.length ? `; then ${aft.join('; ')}` : ''}`
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
    case 'gantt': return `timeline, ${d.heads.length} week columns ${d.heads.map((t) => quote(t)).join(', ')} across the top; one task bar per row (label inside, white text)${d.pitch ? `, rows ${d.pitch}px apart, bars ${d.bars[0].h}px tall${d.reach && d.reach <= 80 ? `, rows end ${d.reach}% down, empty below` : ''}` : ''}: ${d.bars.map((b) => `${colourName(b.fill)} ${quote(b.text, 20)} ${b.from} to ${b.to}`).join(', ')}${d.line ? `; thin ${colourName(d.line.fill)} vertical today line top to bottom at ${d.line.at}${d.line.label ? `, tag ${quote(d.line.label)}` : ''}` : ''}`
    case 'donut': return `${d.title ? `${quote(d.title, 32)}, ` : ''}donut chart (thick ring, hollow middle)${d.track ? ` on a ${colourName(d.track)} track` : ''}: ${d.segs.map((g) => `${colourName(g.fill)} ${g.pct}%`).join(', ')}`
    case 'lines': return `${d.title ? `${quote(d.title, 32)}, ` : ''}line chart drawn as SVG lines: ${d.lines.map((l) => `${l.thick ? 'thick ' : ''}${l.dashed ? 'dashed ' : 'solid '}${colourName(l.fill)} line${l.rising === null ? '' : l.rising ? ' rising left to right' : ' falling left to right'}${l.points >= 3 ? ` (${l.points} points)` : ''}`).join(', ')}${d.area?.c ? `; under the solid line a ${d.area.fade ? `soft ${hexOf(d.area.c)} area fill fading to transparent at the bottom` : `${hexOf(d.area.c)} area fill`}` : ''}${d.grid >= 2 ? `; ${d.grid} thin pale horizontal grid lines behind` : ''}; no axis labels`
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
    case 'bars': if (d.odd) return `bar chart${d.title ? ` ${quote(d.title, 32)}` : ''}, ${d.count} bars, all ${colourName(d.odd.main)} (${hexOf(d.odd.main)}) except ${d.odd.o.map(([i, c]) => `bar ${i + 1} ${vivid(c) ? 'vivid ' : ''}${colourName(c)} (${hexOf(c)})`).join(' and ')}${d.heights ? `, heights ${d.heights.join('/')}% of the tallest` : ''}`
      return `bar chart${d.title ? ` ${quote(d.title, 32)}` : ''}, ${d.count} ${colourName(d.colour) ?? ''} bars${d.heights ? `, heights ${d.heights.join('/')}% of the tallest` : ''}`.replace(/\s+/g, ' ')
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
      return `${d.head ? `header ${quote(d.head, 30)}${d.headRule ? ' with a thin line under it' : ''}, then ` : ''}${d.items.length} chat messages stacked top-down (no bubbles), each a ${m0.px}px ${m0.round ? 'round' : 'rounded square'} avatar left, bold name then small grey time on one line, message text under: ${d.items.map(row).join('; ')}`
    }
    case 'list': if (d.items.every((p) => p.length === 1 && p[0].length <= 6) && d.items.filter((p) => /^\d+$/.test(p[0])).length >= 2) return `${d.head ? `${quote(d.head, 24)}, ` : ''}page numbers ${d.items.map((p) => quote(p[0])).join(', ')}${d.on ? `, ${quote(d.on)} highlighted` : ''}`
      // grouped nav: small headings each over its own links, every link said (round 8 e5 docs nav: '5 more' after the
      // first four became invented links under the wrong headings)
      if (d.groups && d.stacked && d.items.every((p) => p.length === 1 && p[0].length <= 28)) {
        const caps = d.groups.every((g) => /^[A-Z0-9 &/-]+$/.test(g.h))
        return `side nav, no box: ${d.groups.length} groups, each a ${caps ? 'small grey spaced-capitals ' : 'small bold '}heading over its own links, one link per line (every link said, none invented, none moved to another group): ${d.groups.map((g) => `${quote(g.h, 28)}: ${g.items.map((i) => quote(d.items[i][0], 28)).join(', ')}`).join('; ')}${d.on ? `; ${quote(d.on, 28)} highlighted${d.onFill ? ` (${sheetFill(d.onFill)} row)` : ''}` : ''}`
      }
      // mail rows that open on the sender: sender, time, subject, preview (round 8 e1: 'Ravi, me (3)' is longer than a
      // time, so the rows fell to a bare sender list and the build lost every subject and preview)
      const timeish = (t) => /^(\d{1,2}:\d{2}( ?[ap]m)?|yesterday|today|(mon|tue|wed|thu|fri|sat|sun)\w*|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w* \d{1,2})$/i.test(t)
      if (d.items.length >= 4 && d.items.every((p) => p.length === 4 && timeish(p[1]) && !timeish(p[0]))) d = { ...d, items: d.items.map((p) => [p[1], p[0], p[2], p[3]]), on: d.on && d.items.find((p) => p[0] === d.on)?.[1] }
      if (d.items.length >= 4 && d.items.every((p) => p.length === 4 && p[0].length <= 10)) {
        const bold = d.bold2 ?? []
        const mixed = bold.some(Boolean) && !bold.every(Boolean)
        const sel = d.on ? `; the ${quote(d.on.length <= 10 ? d.items.find((p) => p[0] === d.on)?.[1] ?? d.on : d.on, 20)} row selected${d.onFill ? ` (${sheetFill(d.onFill)}${d.onEdge ? `, ${colourName(d.onEdge)} left edge` : ''})` : ''}` : ''
        return `${d.head ? `${quote(d.head, 20)} box, then ` : ''}${d.items.length} mail rows with thin lines between, each: sender left and time right on one line, bold subject under, one grey preview line under that${mixed ? '; unread rows have a bold sender, read rows a normal one' : ''}: ${d.items.map((p, i) => `${quote(p[1], 20)} ${p[0]} ${quote(p[2], 36)} / ${quote(p[3], 64)}${mixed && bold[i] ? ' (unread)' : ''}`).join('; ')}${sel}`
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
      const ex = (x) => x.chips ? `small filled chips side by side, separate: ${x.chips.map((c) => `${quote(c.t)} (${hexOf(c.fill)} fill, bold ${hexOf(c.ink)} text)`).join(', ')} ` : x.lines ? `grey lines ${x.lines.map((l) => quote(l)).join(' / ')} ` : `${x.big ? 'big ' : ''}${quote(x.t)} `
      return `${pic}${d.head ? `${quote(d.head, 20)} ` : ''}${(d.extra ?? []).filter((x) => !x.btn).map(ex).join('')}list: ${d.items.slice(0, cap).map((parts) => parts.length >= 2 && parts[1].length <= 14 ? `${quote(parts[0], 20)} ${parts[1]}` : quote(parts[0], 20)).join(', ')}${d.items.length > cap ? `, ${d.items.length - cap} more` : ''}${d.on ? `; ${quote(d.on.split(' ').slice(0, 3).join(' '), 20)} highlighted` : ''}${(d.extra ?? []).filter((x) => x.btn).map((x) => `, ${x.fill ? `${colourName(x.fill)} ` : 'outline '}button ${quote(x.t)}`).join('')}`
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
function repeatUnit(t) {
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
  // a contents list with no box: a heading over short links one per line, the current one in its own ink (round 8 e5
  // 'On this page': no note, so the build drew big dark text with invented items)
  if (!fill && !bordered && !f.regionKids.length && f.dense?.type === 'list' && f.dense.stacked && f.dense.head && !f.dense.groups && f.dense.inks && f.dense.items.length >= 3 && f.dense.items.length <= 12 && f.dense.items.every((p) => p.length === 1 && p[0].length <= 28)) {
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
  // a textless filled pill, outlined and with corner handles: a selected layer on a design canvas
  if (!f.text && !f.kidCount && fill && !grad && !f.regionKids.length && h >= 24 && h <= 90 && w >= h * 2 && f.radius >= h / 2 - 2 && (f.ring || f.handles)) {
    const hd = f.handles
    return { kind: 'box', note: withFx(`an empty solid ${hexOf(f.bg)} pill exactly ${Math.round(w)}x${Math.round(h)}px (border-radius 999px: fully round ends, a capsule, NOT square or slightly rounded corners; the selection outline follows the round ends), NO text, NO label, NOT a button with words, NOT blue${f.ring ? `; a ${f.ring.w}px ${colourName(f.ring.colour)} (${hexOf(f.ring.colour)}) selection outline round it (outline: ${f.ring.w}px solid; outline-offset ${f.ring.off}px)` : ''}${hd ? `; ${hd.n} small ${hd.px}x${hd.px}px square ${hexOf(hd.fill)} handles${hd.border ? ` with a ${hexOf(hd.border)} border` : ''}, one centred on each corner of its bounding box (absolutely placed)` : ''}`) }
  }

  // ---- round 7 creative (n94)
  // a word set letter by letter, each letter its own size and weight on one baseline
  if (f.letterWave && !f.regionKids.length) {
    const lw = f.letterWave
    const word = lw.letters.map((l) => l.t).join('')
    const face = faceName(f.font.family)
    return { kind: 'heading', note: withFx(`the one word "${word}" in giant ${face ? `${face} ` : ''}${colourName(lw.colour) ?? ''} letters on ONE line, every letter its own <span> with its own font-size and font-weight, all on one shared baseline (letters bottom-aligned, no gaps added): ${lw.letters.map((l) => `${l.t} ${l.px}px weight ${l.w}`).join(', ')}; about ${lw.width}px wide, white-space: nowrap; no other copy here (not a paragraph)`) }
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
      return { kind: 'box', note: withFx(`see-through ${colourName(pale)} (${hexOf(pale)} at ${Math.round(f.bg.a * 100)}% opacity) strip of sticky tape ${lw}x${lh}px${bordered ? `, hairline ${lineCol(f.border.colour)} edge` : ''}, square corners, laid ON TOP of the photo edge it crosses (no picture, no X, nothing inside)`) }
    }
  }
  // ---- round 6 creative (n79)
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
  // ---- round 5 creative (n61)
  // text set round a circle: a spinning badge (round 5 c2: unsaid)
  if (f.circleText && !f.regionKids.length) {
    const t = f.circleText.text
    const ct = f.circleText
    // big ring letters say their size and that they go all the way round, and a dashed ring says itself
    // (round 8 c2: letters built tiny, only part way round, the dashed circle lost)
    if (ct.size >= 24) {
      const ink = parse(ct.ink ?? '')
      const dr = ct.dashed ? `; a separate thin dashed ${ct.dashed.w}px ${hexOf(parse(ct.dashed.c) ?? { r: 17, g: 17, b: 17, a: 1 })} circle (stroke-dasharray ${ct.dashed.dash.replace(/px/g, '')}, no fill) of radius ${ct.dashed.r}px round the same centre, just outside the letters` : '; no outline, no fill'
      return { kind: 'circle', note: withFx(`ring of big ${ct.weight >= 800 ? 'heavy ' : ct.weight >= 600 ? 'bold ' : ''}${/[a-z]/.test(t) ? '' : 'capital '}letters ${quote(t, 60)}, ${ct.size}px type${ct.spacing ? `, letter-spacing ${ct.spacing}px` : ''}${ink ? `, ${hexOf(ink)}` : ''}, set on a circle (SVG textPath) of radius ${ct.rad}px centred in a ${ct.px}x${ct.px}px box at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}: the words run ALL the way round the circle, end meeting start, never a partial arc${dr}`) }
    }
    return { kind: 'circle', note: withFx(`ring of small ${/[a-z]/.test(t) ? '' : 'spaced capital '}letters ${quote(t, 60)} running round a ${ct.px}px circle, no outline, no fill`) }
  }
  // a progress ring made of a conic gradient (round 5 c5: said as a 'near-black block')
  if (f.conicRing && f.conicRing.round && f.conicRing.stops.length >= 2 && !f.regionKids.length) {
    const cr = f.conicRing, arc = cr.stops[0], track = cr.stops[cr.stops.length - 1]
    // several coloured segments: a donut chart, not one progress arc (round 6 e2: 3 segments said as 'indigo arc 46%')
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
    const d = f.iconKids, names = d.fills.map((c, i) => `${d.faint[i] ? 'faint ' : ''}${colourName(c)}`)
    const cols = names.every((n) => n === names[0]) ? `all ${names[0]}` : names.slice(1).every((n) => n === names[1]) ? `first ${names[0]}, the rest ${names[1]}` : names.join(', ')
    const tile = d.round ? 'round dots' : d.radius >= 4 ? 'rounded squares' : 'squares'
    return { kind: 'box', note: withFx(`${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)} block (no picture), ${d.fills.length} small ${tile} (${d.px}px) ${d.vert ? 'stacked down from its top' : 'in a row'} ${d.gap}px apart: ${cols}`) }
  }
  // a thin textless filled bar is a placeholder line, not copy (round 8 e3: a grey 420x12 bar built as a sentence)
  if (!f.text && visible(f.bg) && !grad && !f.regionKids.length && w >= 60 && h >= 8 && h <= 20 && f.radius >= 2 && w >= h * 8 && !f.kidCount) return { kind: 'box', note: withFx(`a plain ${hexOf(f.bg)} bar exactly ${Math.round(w)}x${Math.round(h)}px${f.radius >= 2 ? `, ${Math.round(f.radius)}px rounded` : ''} at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}: a skeleton placeholder line, NO words, NOT text, nothing inside`) }
  // a textless filled block with no parts inside is a picture placeholder
  if (!f.text && (fill || grad) && !f.regionKids.length && !round && w >= 60 && h >= 50) {
    // a see-through dim laid over the page (round 5 e1 backdrop said as a solid 'dark navy block')
    if (fill && !grad && f.bg.a >= 0.3 && f.bg.a <= 0.8 && w * h >= 0.3 * 1280 * 900) return { kind: 'image', note: withFx(`see-through ${colourName(f.bg)} layer (${Math.round(f.bg.a * 100)}% opaque) over what is under it: everything under it still shows, dimmed, not hidden`) }
    const glowy = glowWords(f)
    if (glowy) return { kind: 'image', note: [glowy, ...fx].join(', ') }
    const stripes = grad && /stripes/.test(grad) ? grad : null
    // a coloured block is part of the look (a dark half, a gradient photo, a mountain cut-out); a pale one is just a picture
    const col = grad ?? (fill && !/light grey|off-white|white/.test(colourName(f.bg)) ? colourName(f.bg) : null)
    const shape = f.clipPoints >= 6 ? 'jagged cut-out shape' : f.clipPoints >= 3 ? 'angled cut-out shape' : null
    const strong = !grad && fill && vivid(f.bg) ? 'vivid ' : ''
    const note = stripes ? `big ${stripes} block` : shape ? `${strong}${col ?? ''} ${shape}`.trim() : col ? `${strong}${col} block` : null
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
      return { kind: 'shape', note: withFx(`${note}${exact}${size}${flat}`), poly: f.clipPoly }
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
    if (fill && dist(f.bg, page.bg) >= 12 && f.radius < h / 2 - 2) return { kind: 'button', note: `${colourName(f.bg)}${textCol ? ` ${textCol} text` : ''} button ${quote(f.text)}` }
    // a one-glyph icon button names its icon and size (round 7 e4 '♡' wishlist: built as a refresh icon)
    const ICON = { '♡': 'an empty heart (wishlist) outline icon', '♥': 'a filled heart icon', '☆': 'an empty star icon', '★': 'a filled star icon', '✕': 'a close X icon', '×': 'a close X icon', '⋯': 'a three-dots icon', '☰': 'a three-line menu icon' }
    const icon = ICON[f.text.trim()]
    if (icon && (!fill || dist(f.bg, page.bg) < 12)) return { kind: 'button', note: `square ${Math.round(w)}x${Math.round(h)}px ${f.radius >= 4 ? `${Math.round(f.radius)}px rounded ` : ''}outline button holding only ${icon} ${quote(f.text.trim())}, centred` }
    if (!fill || dist(f.bg, page.bg) < 12) return { kind: 'button', note: `${colourName(f.border.colour) === 'light grey' ? '' : `${colourName(f.border.colour)} `}outline ${f.radius >= h / 2 - 2 ? 'pill ' : ''}button ${quote(f.text)}`.trim() }
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
    return { kind: 'shape', note: withFx(`${paint} arch (round top, flat bottom)`), poly }
  }
  // a lit sphere: a textless round radial blend with an off-centre highlight and a coloured glow (round 7 c1 orb:
  // 'big glowing ... circle' built as a faint glow behind the tiles)
  if (round && square && !f.text && /^radial-gradient/.test(f.bgImage.trim()) && w >= 100) {
    const at = f.bgImage.match(/at\s+([\d.]+)%\s+([\d.]+)%/)
    const st = [...f.bgImage.matchAll(/(rgba?\([^)]+\))\s*([\d.]+)(%|px)?/g)].map((m) => ({ c: parse(m[1]), at: m[3] === '%' ? Math.round(+m[2]) : 0 }))
    const sg = f.shadows.find((x) => !x.clear && x.blur >= 10)
    return { kind: 'circle', note: withFx(`a ${Math.round(w)}px solid sphere (border-radius 50%), fully opaque, painted with a radial-gradient(circle at ${at ? `${at[1]}% ${at[2]}%` : 'center'}, ${st.map((x) => `${hexOf(x.c)} ${x.at}%`).join(', ')}) so it looks lit from ${at && +at[1] < 50 ? 'the top left' : 'above'}${sg ? `, with a big soft ${colourName({ ...sg.c, a: 1 })} glow under it (box-shadow ${sg.x}px ${sg.y}px ${sg.blur}px, ${Math.round(sg.c.a * 100)}% opacity)` : ''}; absolutely placed, top-left at ${Math.round(f.rect.x)},${Math.round(f.rect.y)}, ON TOP of every tile it overlaps (highest z-index, nothing covers it)`) }
  }
  if (round && square && f.text.length <= 24 && (fill || grad || bordered)) {
    const glowy = glow || /radial/.test(f.bgImage)
    const words = f.text ? ` with ${quote(f.text)}` : ''
    const paint = grad ? grad.replace(' gradient', '') : fill ? `${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)}` : `${lineCol(f.border.colour)} outline`
    // size word: a small textless dot (round 5 c2: a 28px red dot said 'big' was built as a 190px red disc)
    const size = f.text ? '' : w >= 120 ? 'big ' : w < 60 ? `small ${Math.round(w)}px ` : ''
    // a flat textless disc >= 60px says its exact size and hex (round 6 c2: a 110px rose dot said 'vivid rose red
    // circle' was built ~100px, a little squashed)
    // a big flat textless disc (round 6 c3 sun: 'big vivid bright orange circle' built as two pale blobs traced from the ink)
    if (!f.text && fill && !grad && !glowy && w >= 60 && !fx.some((x) => /blur|opacity|fade/.test(x))) return { kind: 'circle', note: withFx(`perfectly round solid disc (border-radius 50%, not traced from the ink), ${Math.round(w)}px across, flat fully opaque ${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)} (${hexOf(f.bg)}) fill, hard edge, no blur`) }
    // a filled sticker with a bold outline says the outline and that it casts no shadow: on a brutalist page the
    // build gave it a hard offset shadow and no outline (round 6 c5 'SOLD OUT SOON')
    // a hard offset shadow is said with it (round 8 c3 stickers: 4px 4px solid near-black, unsaid)
    const hardSh = shadowWords(f)
    const rim = f.text && fill && bordered && f.border.w >= 2 ? `, ${Math.round(f.border.w)}px solid ${lineCol(f.border.colour)} outline${hardSh ? `, ${hardSh}` : f.shadows.some((x) => !x.clear) ? '' : ', flat, no shadow'}` : ''
    // a small textless dot says its exact box (round 7 c2: a 22px slider knob said 'small 22px dot' was built ~8px)
    const exactDot = !f.text && fill && w >= 12 && w < 60 ? ` (exactly ${Math.round(w)}x${Math.round(w)}px: w-[${Math.round(w)}px] h-[${Math.round(w)}px], border-radius 50%, not smaller)` : ''
    // a selected swatch says its ring (round 7 e4: the 2px outline 3px out round the picked colour was lost)
    const dotRing = f.ring ? `, with a ${f.ring.w}px ${lineCol(f.ring.colour)} outline ring ${f.ring.off}px out from its edge, a white gap between (outline + outline-offset, the selected one)` : ''
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
    return { kind: isBar ? 'box' : 'text', note: `${!drawnBar && isBar ? 'nav, no box around it: ' : ''}${drawnBar ? `${barLook ? `${barLook} ` : ''}bar ${Math.round(h)}px tall${f.rect.y <= 60 ? ' across the top' : ''}${line}: ` : ''}${lk ? `${lk} ` : ''}${quote(kb[0].t)} left, ${quote(kb[1].t, 48)} right` }
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
    if (glow) look.push('glowing'); if (hardShadow && !shadowWords(f)) look.push('hard offset shadow')
    if (w > 420) look.push('full-width')
    if (textCol && fill) look.push(`${textCol} text`)
    const kind = f.kidCount === 0 || f.tag === 'a' || f.tag === 'button' || fill || bordered ? 'button' : 'text'
    return { kind, note: `${uniq(look).join(' ')} button ${quote(f.text)}${hardShadow && shadowWords(f) ? `, with a ${shadowWords(f)}` : ''}`.replace(/\s+/g, ' ').trim() }
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
  if (/^h[1-3]$/.test(f.tag) || f.font.size >= 30) {
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
      const small = `then on its own line under it a small ${sk.px}px ${sk.mono ? 'mono ' : ''}${sk.bold ? 'bold' : 'regular'} line ${quote(sk.t, 60)} (small, not part of the big type)`
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
    const wide = sl && sl.length === 1 && f.font.size >= 100 ? `, ${Math.round(f.font.size)}px type, about ${f.shown.w}px wide (no larger)` : ''
    // a display line of several words that fits on one line says so: the build wrapped it at the drawn width
    // (round 6 c4 'Every screen, one glance.' 56px, one line, built on 2 lines over the subline)
    // a 20-39px multi-word line set on one line says its size and the one line: round 7 c5's 30px 'read this
    // first!' hand note was built on 2 lines (n103)
    const mid = !f.motion && f.shown && f.shown.lines.length === 1 && f.font.size >= 20 && f.font.size < 40 && /\s/.test(f.text.trim()) && f.text.length <= 40 ? `, ${Math.round(f.font.size)}px type on ONE line (white-space: nowrap, never wrapped), about ${f.shown.w}px wide` : ''
    // a one-word page title near the top says its size and top: 'Overview' (26px bold, top 28) was said as the
    // word alone and built ~10px high with everything under it drifting (round 6 e2)
    const ttl = !mid && !f.motion && !fill && f.shown && f.shown.lines.length === 1 && f.font.size >= 20 && f.font.size < 40 && !/\s/.test(f.text.trim()) && f.text.length <= 24 && f.rect.y <= 120 ? `, ${Math.round(f.font.size)}px ${f.font.weight >= 600 ? 'bold ' : ''}type on one line, its box top ${Math.round(f.rect.y)}px from the page top and ${Math.round(f.rect.h)}px tall (top-[${Math.round(f.rect.y)}px] or the same margin, line-height ${Math.round(f.rect.h)}px; not higher)` : ''
    const one = sl && sl.length === 1 && f.font.size >= 40 && f.font.size < 100 && /\s/.test(f.text.trim()) ? `, on ONE line (white-space: nowrap, never wrapped), about ${f.shown.w}px wide` : ''
    return { kind: 'heading', note: withFx(`${tw.join(' ')} ${quote(f.text, 60)}${ckSay}${brk}${fadeSay}${wide}${one}${mid}${ttl}${under}`.trim()) }
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
    return { kind: fill || bordered ? 'box' : 'text', note: `${fill && w >= 600 ? `${colourName(f.bg)} bar ${Math.round(h)}px tall across the page, ` : ''}${lead}links: ${items.join(', ')}${on}${picks}${split}${pack}` }
  }
  // a big pane with parts (a message list, a reading pane, a form column) is a box even unfilled:
  // as plain text it was left unsaid (round 4 e2 message list and reading pane, e4 sidebar)
  const pane = w >= 260 && h >= 300 && f.kidCount >= 2
  if (fill || grad || bordered || ruled || pane || /^(nav|header|aside|table|input|textarea|form)$/.test(f.tag) || f.regionKids.length) {
    look.push(...fx)
    // a strong opaque fill says 'vivid', or the build softens it (round 4 c5 #fde047 card built pale cream)
    if (glowWords(f)) look.push(glowWords(f)); else if (grad) look.push(grad); else if (fill && !frosted) look.push(`${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)}`)
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
    if (fill && !grad && !f.regionKids.length && f.kidCount === 0 && f.radius >= 10 && w >= 150 && h >= 150 && f.text.length <= 140 && !f.motion) {
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
        ? `${quote(head)}, lines ${f.kidTexts.slice(1).map((t, i) => lineWords(f, i + 1) + quote(t, 60)).join(', ')}${f.kidReach && f.kidReach < 0.55 && h >= 200 ? ', all at the top of the card, empty below' : ''}` : null
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
    const copy = turned ?? fig ?? picSay ?? code ?? unitSay ?? ctaCard ?? lone ?? (titled ? titled : f.text && f.text.length <= 40 && !f.regionKids.length ? quote(f.text) : list ? list : head && !f.regionKids.length ? `${quote(head)} and text` : '')
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
  // a heading over a line or an outlined button, no box (round 8 c5: the left heading and copy had no note, the
  // right copy's outlined 'Get notified' button was run into one line)
  {
    const k2 = f.kidBoxes
    if (f.text && !fill && !grad && !bordered && !f.regionKids.length && f.kidCount === 2 && k2.length === 2 && k2[0].s >= 20 && k2[0].s >= k2[1].s && k2[1].top >= k2[0].bottom - 2 && k2[1].t.length <= 160) {
      const part = (k, i) => {
        const look = `${k.s}px ${k.bold ? 'bold ' : ''}${hexOf(k.ink)}`
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
  const big = k.s >= Math.max(28, h.s * 1.6) ? `big ${k.s}px${k.b ? ' bold' : ''} ` : ''
  const name = colourName(k.c)
  const ink = name && name !== colourName(h.c) && !/black|grey|white|navy/.test(name) ? `${name} ` : ''
  return big + ink
}

// a form's spacing in pixels, so it is built to its drawn height (round 6 e4 came out ~10% taller)
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
  if (plain && !b.grain) return null
  const grad = gradientWords(b)
  // soft glows over a dark page (a mesh: round 6 c4 said as a 3-stop page gradient, base colour lost)
  const gl = b.glows && b.glows.length >= 2 && visible(b.bg) ? glowWords(b) : null
  if (gl) w.push(`${gl.replace(/ block\b/, ` (${hexOf(b.bg)}) page`)} (big soft radial glows fading into the base colour)`)
  else if (grad) w.push(`${grad} page`)
  // a warm off-white (#f4f1ea) said bare was built plain white (round 6 c2): its hex goes with it
  else if (visible(b.bg)) w.push(`${nearWhite && colourName(b.bg) === 'white' ? `off-white (${hexOf(b.bg)}, plainly not white)` : colourName(b.bg) === 'off-white' ? `off-white (${hexOf(b.bg)}, plainly not white)` : hexOf(b.bg) === '#ffffff' ? colourName(b.bg) : Math.min(parse(b.bg).r, parse(b.bg).g, parse(b.bg).b) >= 225 ? `${colourName(b.bg)} (${hexOf(b.bg)}, plainly not white)` : `${colourName(b.bg)} (${hexOf(b.bg)})`} page`)
  if (gridLines(b)) w.push('faint grid lines')
  if (isSerif(b.font.family)) w.push(`${faceName(b.font.family) ?? 'serif'} type`); else if (isMono(b.font.family)) w.push('mono type')
  else if (faceName(b.font.family)) w.push(`${faceName(b.font.family)} type`)
  if (b.colour) w.push(`${colourName(b.colour)} text`)
  if (b.grain) w.push('fine grain texture over everything')
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
      d.note = `a fine grain texture over everything under it (${Math.round(f.rect.w)}x${Math.round(f.rect.h)}px, no fill of its own, pointer-events none, on top of the colour fields but under the type): thin ${hexOf({ ...ink, a: 1 })} lines at ${Math.round(ink.a * 100)}% opacity, background: ${f.bgImage.replace(/\s+/g, ' ').trim()}${period ? ` (one thin line every ${period}px${rep[1] ? `, ${rep[1]}` : ''})` : ''}; barely visible: never a picture, never a gradient, never a solid layer`
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
  // a heading carries its set size and line count, so the bench draws it as tall as it is
  const plan = regions.filter((f) => out.get(f.role).kind).map((f) => {
    const k = out.get(f.role).kind
    if (k === 'shape') return [f.role, k, { poly: out.get(f.role).poly }]
    // a letter-by-letter word is drawn as one line of its biggest letters, not a paragraph (round 7 c2: 16px x 7 lines)
    if (k === 'heading' && f.letterWave) return [f.role, k, { fontPx: Math.max(...f.letterWave.letters.map((l) => l.px)), lines: 1 }]
    if (k === 'heading' && f.textLines >= 1) return [f.role, k, { fontPx: Math.round(f.font.size), lines: f.textLines, ...(unionOf.has(f.role) ? { union: unionOf.get(f.role) } : {}) }]
    // a paragraph of 2+ lines is drawn line by line at its real spacing (round 3 c3: 2 lines at 28px
    // were drawn 24px apart, read as 16px type, built as one small line)
    if (k === 'text' && f.textLines >= 2 && f.textLines <= 8) return [f.role, k, { fontPx: Math.round(f.font.size), lines: f.textLines }]
    return [f.role, k]
  })
  // thick-bordered boxes laid edge to edge are one ruled grid (round 6 c5: built as separate boxes with gaps)
  const ruled = regions.filter((f) => f.border.w >= 2 && visible(f.border.colour) && !f.regionKids.length)
  const touch = (A, B, t) => {
    const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)
    return (ox > 20 && Math.abs(oy) <= t) || (oy > 20 && Math.abs(ox) <= t)
  }
  const pairs = ruled.flatMap((A, i) => ruled.slice(i + 1).filter((B) => touch(A.rect, B.rect, Math.max(A.border.w, B.border.w) + 1)))
  let pn = pageNote(body)
  if (pairs.length >= 4) {
    const bw = Math.round(ruled[0].border.w)
    pn = `${pn ?? 'whole page:'}${pn ? ';' : ''} the ${ruled.length} ${colourName(ruled[0].border.colour)}-bordered boxes are ONE ruled grid filling the page edge to edge: neighbouring boxes share a single ${bw}px ${colourName(ruled[0].border.colour)} line, no gaps between boxes, no doubled lines`
  }
  const notes = [...(pn ? [['*', pn]] : []), ...regions.filter((f) => out.get(f.role).note).map((f) => [f.role, out.get(f.role).note])]
  return { plan, notes }
}

export const wordCount = (notes) => notes.reduce((s, [, t]) => s + t.split(/\s+/).filter(Boolean).length, 0)
