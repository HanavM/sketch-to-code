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
      border: { w: parseFloat(cs.borderTopWidth) || 0, colour: rgba(cs.borderTopColor), bottom: parseFloat(cs.borderBottomWidth) || 0 },
      radius: parseFloat(cs.borderTopLeftRadius) || 0,
      radiusPct: cs.borderTopLeftRadius.includes('%') ? parseFloat(cs.borderTopLeftRadius) : null,
      // an arch: round top corners, square bottom ones (round 4 c1 arch said as a circle, built as a ball)
      radiusBottom: parseFloat(cs.borderBottomLeftRadius) || 0,
      shadow: cs.boxShadow,
      centred: cs.textAlign === 'center' || cs.justifyContent === 'center',
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
        return { items: items.filter((i) => i.t.length <= 8).map((i) => i.t), current: items.find((i) => i.on && /^\d+$/.test(i.t))?.t ?? null, caption: items.find((i) => i.t.length > 8)?.t ?? null }
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
      // a lead item set apart from a uniform row: bold, bigger or another colour (round 5 e5 green bold
      // 'Budget 2027' title said as one more menu link, built black)
      kidLead: (() => {
        if (kids.length < 4) return null
        const st = kids.map((k) => { const c = getComputedStyle(k); return { c: c.color, w: Number(c.fontWeight) >= 600, s: parseFloat(c.fontSize) } })
        const rest = st.slice(1)
        if (!rest.every((x) => x.c === rest[0].c && x.w === rest[0].w && Math.abs(x.s - rest[0].s) < 1)) return null
        const a = st[0], r0 = rest[0]
        const bold = a.w && !r0.w, big = a.s >= r0.s + 2, ink = a.c !== r0.c ? rgba(a.c) : null
        if (!bold && !big && !ink) return null
        return { t: (kids[0].innerText || '').replace(/\s+/g, ' ').trim(), bold, px: big ? Math.round(a.s) : null, ink }
      })(),
      // each text child's size, weight and colour, and how far down the card its content reaches: a stat
      // card's big figure and green delta were said as plain lines and built small, centred down the card
      // (round 5 e2 'Peak hour')
      kidStyles: kids.filter((k) => (k.innerText || '').trim()).map((k) => { const c = getComputedStyle(k); return { s: Math.round(parseFloat(c.fontSize)), b: Number(c.fontWeight) >= 600, c: rgba(c.color) } }),
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
        return { px: Math.round(b.width), round: gs.borderTopLeftRadius.includes('%') ? parseFloat(gs.borderTopLeftRadius) >= 40 : parseFloat(gs.borderTopLeftRadius) >= b.width * 0.4, stops, label }
      })(),
      // text set round a circle (an SVG textPath badge)
      circleText: (() => { const t = el.querySelector('textPath'); return t ? { text: (t.textContent || '').trim(), px: Math.round(r.width) } : null })(),
      // the text kids' boxes: a card's button, a bottom-set block of copy (round 5 c5 CTA said as 'cards')
      kidBoxes: kids.filter((k) => (k.innerText || '').trim()).map((k) => { const c = getComputedStyle(k); const b = k.getBoundingClientRect(); return { t: (k.innerText || '').replace(/\s+/g, ' ').trim(), fill: rgba(c.backgroundColor), ink: rgba(c.color), h: b.height, w: b.width, top: b.top - r.top, bottom: b.bottom - r.top, radius: parseFloat(c.borderTopLeftRadius) || 0, s: Math.round(parseFloat(c.fontSize)), bold: Number(c.fontWeight) >= 600, spacing: (parseFloat(c.letterSpacing) || 0) / (parseFloat(c.fontSize) || 16) } }),
      // its text as set, line by line (code in a card: the kids are only the coloured tokens)
      setLines: (el.innerText || '').split('\n').map((x) => x.replace(/ /g, ' ').replace(/\s+$/, '')),
      tokenInks: [...el.querySelectorAll('b,em,span,i,strong')].filter((k) => !k.children.length && txt(k)).map((k) => ({ t: txt(k), c: rgba(getComputedStyle(k).color) })),
      // a small textless pill: a toggle switch
      toggle: [...el.querySelectorAll('*')].map((k) => { const c = getComputedStyle(k); const b = k.getBoundingClientRect(); return !(k.innerText || '').trim() && b.width >= 30 && b.width <= 70 && b.height >= 16 && b.height <= 40 && b.width > b.height * 1.3 && parseFloat(c.borderTopLeftRadius) >= b.height / 2 - 1 ? rgba(c.backgroundColor) : null }).find(Boolean) || null,
      dense: dense(el),
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
        if (!ok) return null
        const vert = bs[1].top - bs[0].top > Math.abs(bs[1].left - bs[0].left)
        return { px: Math.round(bs[0].width), vert, gap: Math.round(vert ? bs[1].top - bs[0].bottom : bs[1].left - bs[0].right), fills: kids.map((k) => rgba(getComputedStyle(k).backgroundColor)) }
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
      for (const k of p.children) { const key = `${k.tagName}.${(k.getAttribute("class") ?? "").replace(/\b(on|active|selected|sel|current|today|open|unread|read|u)\b/g, '').trim()}`; groups.set(key, [...(groups.get(key) ?? []), k]) }
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
    // a table built from div rows on one column grid, the first row its header (round 5 e2: said as a list)
    const gk = [...el.children]
    if (gk.length >= 3 && gk.every((k) => getComputedStyle(k).display === 'grid' && k.children.length >= 3 && getComputedStyle(k).gridTemplateColumns === getComputedStyle(gk[0]).gridTemplateColumns && [...k.children].every((c) => !c.children.length))) {
      const hc = getComputedStyle(gk[0])
      return { type: 'table', title: null, columns: [...gk[0].children].map(txt), rows: gk.length - 1, first: [...gk[1].children].map(txt), all: gk.length <= 8 ? gk.slice(1).map((k) => [...k.children].map(txt)) : null, headLook: Number(hc.fontWeight) >= 600 ? 'bold grey header' : null, chips: chips(el) }
    }
    const kids = [...el.children].filter((k) => getComputedStyle(k).display !== 'none')
    const own = el.getBoundingClientRect()
    const title = () => { const t = [...el.querySelectorAll('h1,h2,h3,h4')].map(txt).find((s) => s && s.length <= 40); return t ?? null }
    // a table inside a card (round 4 e1 "Recent deals" panel: the table was read as a list)
    const inner = el.tagName !== 'TABLE' && el.querySelectorAll('table').length === 1 ? el.querySelector('table') : null
    if (inner && inner.querySelectorAll('tr').length >= 3) {
      const rows = [...inner.querySelectorAll('tr')]
      return { type: 'table', title: title(), columns: [...rows[0].children].map(txt), rows: rows.length - 1, first: [...rows[1].children].map(txt), chips: chips(inner) }
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
        const pts = (p.getAttribute('points') ?? '').trim().split(/\s+/).map((s) => s.split(',').map(Number)).filter((q) => q.length === 2)
        return { fill: stroke(p), dashed: !!(p.getAttribute('stroke-dasharray') ?? '').trim() && p.getAttribute('stroke-dasharray') !== 'none', points: pts.length, rising: pts.length >= 2 ? pts[pts.length - 1][1] < pts[0][1] : null, thick: parseFloat(getComputedStyle(p).strokeWidth) >= 3 }
      })
      if (lines.length) return { type: 'lines', title: title(), lines }
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
    const flds = [...el.querySelectorAll('*')].filter((g) => g.closest('[data-r]') === el && !g.children.length && parseFloat(getComputedStyle(g).borderTopWidth) >= 1 && g.getBoundingClientRect().height >= 30 && txt(g).length <= 40 && !(rgba(getComputedStyle(g).backgroundColor)?.a > 0.05) && lab(g))
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
      return { type: 'form', title: title(), close: close ? txt(close) : null, buttons: btns, gap: gap >= eb.height * 0.15 ? { px: Math.round(gap), h: Math.round(eb.height) } : null, rows: [...rows.values()].map((r) => r.map((g) => ({ label: lab(g), value: txt(g), tall: g.getBoundingClientRect().height >= 70 ? Math.round(g.getBoundingClientRect().height) : 0 }))) }
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
        return { type: 'bars', count: bars.length, colour: filled(bars[0]), title, rising: hs[hs.length - 1] > hs[0], heights: hs.map((h) => Math.round(h / Math.max(...hs) * 100)) }
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
        return { t: txt(k), btn, fill: btn ? filled(k) : null, big: parseFloat(c.fontSize) >= 24 }
      })
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
      return { type: 'list', head: head ? txt(head) : null, items: rep.map(parts), bold: rep.map(boldFirst), on, extra, dots: dots.every(Boolean) ? dots : null, stacked: rep.every((k, i) => i === 0 || k.getBoundingClientRect().top >= rep[i - 1].getBoundingClientRect().bottom - 2), thumbs: thumbs.every(Boolean) ? thumbs : null, switches: switches.every(Boolean) ? switches : null, smalls: rep.map((k) => { const sm = [...k.querySelectorAll('small')].map(txt); return sm.length === 1 ? sm[0] : null }) }
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
export function colourName(c) {
  c = parse(c); if (!c || c.a <= 0.05) return null
  // a grey is named among greys: weighted distance alone calls light grey "cream"
  const chroma = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
  let best = null, bd = Infinity
  for (const [n, r, g, b] of NAMED) {
    if (chroma <= 6 && !NEUTRAL.has(n)) continue
    if (n === 'red-orange' && !(hue(c) >= 9 && hue(c) <= 22 && chroma >= 150)) continue
    if (n === 'dark blue' && !(hue(c) >= 215 && hue(c) <= 235 && chroma >= 80 && Math.max(c.r, c.g, c.b) <= 170)) continue
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
  return hard ? `${names.join(', ')} stripes` : `${names.join(' to ')} gradient`
}
/** Look words any block can carry: tilt, blur, glass, bleeding off the page. */
function effectWords(f) {
  const w = []
  const turn = Math.abs(f.rotate)
  // a vertical label is often flipped 180deg to read bottom-up: that's not a tilt
  if (f.vertical) w.push('vertical')
  else if (f.tilt3d) w.push('tilted back in 3D perspective')
  // which way and how far: a bare 'tilted' was built flat (round 4 c1 blue block, sticker)
  else if (turn >= 1.5 && turn <= 60) w.push(`tilted ${turn < 3 ? 'slightly ' : ''}${turn}° ${f.rotate > 0 ? 'clockwise' : 'anticlockwise'}`)
  else if (turn > 60 && turn < 170) w.push('diagonal')
  if (f.motion) w.push(f.motion === 'scrolling' && f.bleeds ? 'scrolling marquee' : f.motion)
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
const gridLines = (f) => /gradient\([^,]*,?\s*rgba?\([^)]+\)\s*1px/.test(f.bgImage) || /1px,\s*transparent 1px/.test(f.bgImage)

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
    case 'heat': return `${d.title ? `${quote(d.title, 48)}, ` : ''}heatmap: ${d.rows.length} rows of ${d.rows[0].levels.length} ${d.round ? 'rounded ' : ''}${d.px}px cells, label left of each row, every cell ${colourName(d.fill)} at a strength 0-9 (opacity): ${d.rows.map((r) => `${r.label} ${r.levels}`).join(', ')}`
    case 'table': if (d.all) return `table, ${d.headLook ? `${d.headLook} row ` : ''}columns ${d.columns.map((t) => quote(t, 16)).join(', ')}, ${d.rows} rows: ${d.all.map((r) => r.map((t) => quote(t, 20)).join(' | ')).join('; ')}`
    case 'table': if (d.title) return `${quote(d.title, 32)}, table, columns ${d.columns.map((t) => quote(t, 16)).join(', ')}, ${d.rows} rows, first row ${d.first.map((t) => quote(t, 20)).join(' | ')}${d.chips.length ? `; status pills ${chipList(d.chips)}` : ''}`
      return `table, columns ${d.columns.map((t) => quote(t, 16)).join(', ')}, ${d.rows} rows${d.chips.length ? `; status pills ${chipList(d.chips)}` : ''}`
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
    case 'lines': return `${d.title ? `${quote(d.title, 32)}, ` : ''}line chart drawn as SVG lines: ${d.lines.map((l) => `${l.thick ? 'thick ' : ''}${l.dashed ? 'dashed ' : 'solid '}${colourName(l.fill)} line${l.rising === null ? '' : l.rising ? ' rising left to right' : ' falling left to right'}${l.points >= 3 ? ` (${l.points} points)` : ''}`).join(', ')}; no axis labels`
    case 'form': if (d.buttons) {
      // filled-in form: label, then what the field holds (or empty, tall); buttons by look and place
      const fld = (x) => `${quote(x.label)} ${x.value ? `field holding ${quote(x.value, 40)}` : `${x.tall ? `tall ${x.tall}px ` : ''}empty field`}`
      const low = d.buttons.length && d.buttons.every((b) => b.low)
      const side = low && d.buttons.every((b) => b.right) ? ' at the bottom right' : low ? ' along the bottom' : ''
      const btn = (b) => b.fill ? `${colourName(b.fill)} ${b.bold ? 'bold ' : ''}${colourName(b.ink)} text ${quote(b.t)}` : `outlined ${quote(b.t)}`
      return `${d.title ? `${quote(d.title, 32)}${d.close ? `, ${quote(d.close)} close top right` : ''}, ` : ''}form, labels above fields: ${d.rows.map((r) => r.map(fld).join(' | ')).join('; ')}${d.buttons.length ? `; buttons${side}: ${d.buttons.map(btn).join(', ')}` : ''}${d.gap ? `, pinned to the bottom of the ${d.gap.h}px tall card with ${d.gap.px}px of empty space above them` : ''}`
    }
      return `${d.title ? `${quote(d.title, 32)}, ` : ''}form, labels above empty fields: ${d.rows.map((r) => r.length === 1 ? `${quote(r[0].label)}${r[0].wide ? ' full width' : ''}` : r.map((x) => quote(x.label)).join(' | ')).join('; ')}`
    case 'bars': return `bar chart${d.title ? ` ${quote(d.title, 32)}` : ''}, ${d.count} ${colourName(d.colour) ?? ''} bars${d.heights ? `, heights ${d.heights.join('/')}% of the tallest` : ''}`.replace(/\s+/g, ' ')
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
      // short items are all said up to 8 (round 5 e3 channels: '3 more' became invented channels)
      const cap = d.items.length <= 8 && d.items.every((p) => p[0].length <= 20) ? 8 : 4
      return `${d.head ? `${quote(d.head, 20)} ` : ''}${(d.extra ?? []).filter((x) => !x.btn).map((x) => `${x.big ? 'big ' : ''}${quote(x.t)} `).join('')}list: ${d.items.slice(0, cap).map((parts) => parts.length >= 2 && parts[1].length <= 14 ? `${quote(parts[0], 20)} ${parts[1]}` : quote(parts[0], 20)).join(', ')}${d.items.length > cap ? `, ${d.items.length - cap} more` : ''}${d.on ? `; ${quote(d.on.split(' ').slice(0, 3).join(' '), 20)} highlighted` : ''}${(d.extra ?? []).filter((x) => x.btn).map((x) => `, ${x.fill ? `${colourName(x.fill)} ` : 'outline '}button ${quote(x.t)}`).join('')}`
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
  return `${base ? `${base} block` : 'block'} with soft colour glows: ${f.glows.map((g) => `${colourName(g.c)} ${g.at}`).join(', ')}`
}
/** A hard offset shadow with its offset and colour (round 5 c4 photo's 24px brown shadow: unsaid). */
function shadowWords(f) {
  const s = f.shadows.find((x) => !x.clear && x.blur <= 1 && (Math.abs(x.x) >= 2 || Math.abs(x.y) >= 2))
  if (!s) return null
  const side = `${s.y > 0 ? 'down' : 'up'} ${s.x > 0 ? 'right' : 'left'}`
  // a see-through shadow says its strength (round 4 c1: 18% near-black over cream was said 'near-black',
  // so a solid black slab was asked for; the real one reads as a faint grey-beige)
  const ink = s.c ? `${colourName({ ...s.c, a: 1 })}${s.c.a < 0.6 ? ` at ${Math.round(s.c.a * 100)}% opacity` : ''} ` : ''
  return `hard ${ink}shadow offset ${Math.abs(Math.round(s.x))}px ${side}, no blur`
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
  const withFx = (note) => { const t = uniq([...fx, note]).join(' ').trim(); return t || null }
  const frosted = fx.includes('frosted glass')

  // ---- round 5 creative (n61)
  // text set round a circle: a spinning badge (round 5 c2: unsaid)
  if (f.circleText && !f.regionKids.length) {
    const t = f.circleText.text
    return { kind: 'circle', note: withFx(`ring of small ${/[a-z]/.test(t) ? '' : 'spaced capital '}letters ${quote(t, 60)} running round a ${f.circleText.px}px circle, no outline, no fill`) }
  }
  // a progress ring made of a conic gradient (round 5 c5: said as a 'near-black block')
  if (f.conicRing && f.conicRing.round && f.conicRing.stops.length >= 2 && !f.regionKids.length) {
    const cr = f.conicRing, arc = cr.stops[0], track = cr.stops[cr.stops.length - 1]
    const host = fill ? `${colourName(f.bg)} block, centred in it ` : ''
    return { kind: 'box', note: withFx(`${host}a ${cr.px}px progress ring (not a picture): ${colourName(arc.c)} arc ${Math.round(arc.to - arc.from)}% of the way round from the top, the rest a ${colourName(track.c)} track${cr.label ? `, bold ${quote(cr.label)} in the middle` : ''}`) }
  }
  // a short pill label (not a link or button): its fill, border and bold copy (round 5 c4: 'pill input')
  if (f.radius >= h / 2 - 2 && f.kidCount === 0 && f.text && f.text.length <= 24 && h <= 84 && w <= 300 && !/^(a|button|input)$/.test(f.tag) && !f.centred && (bordered || fill) && !/…$|\.\.\.$|^search\b/i.test(f.text) && !f.regionKids.length) {
    const ink = textCol && fill && dist(f.colour, f.bg) > 150 ? `${textCol} ` : ''
    return { kind: 'box', note: withFx(`${fill ? `${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)} ` : ''}pill label${bordered ? ` with a ${Math.round(f.border.w)}px ${colourName(f.border.colour)} border` : ''}, ${f.font.weight >= 600 ? 'bold ' : ''}${ink}${quote(f.text)}`) }
  }

  if (f.hasImg && f.text.length < 4) return { kind: 'image', note: withFx(null) }
  // dense app UI: say the structure (columns and rows, weeks, bars, sides) since a box shows none of it
  // (a plain list is only said when nothing else names the block: see the box branch)
  // and only when its parts aren't drawn as marks of their own (stat cards each marked)
  // a gantt's bars and a form's fields aren't marks of their own, so it is said even with its name column and today line drawn
  const dn = f.dense?.type === 'list' || (!/^(gantt|form|messages)$/.test(f.dense?.type) && f.regionKids.some((r) => marked.has(r))) ? null : denseNote(f.dense)
  if (dn) {
    const bgName = fill ? colourName(f.bg) : null
    // a titled chart/table/form panel on a near-page card keeps 'card' (it was 'white card "Revenue by month"' before)
    const card = fill && (bordered || f.radius >= 8) && /^(table|donut|lines|form)$/.test(f.dense.type) && f.dense.title && bgName && /light grey|white/.test(bgName) && dist(f.bg, page.bg) < 30 ? `${bgName} card` : null
    const col = card ?? (bgName && !(/light grey|white/.test(bgName) && dist(f.bg, page.bg) < 30) ? bgName : null)
    const what = f.tag === 'aside' ? 'sidebar' : null
    return { kind: 'box', note: withFx(`${uniq([col, what]).join(' ')}${col || what ? ', ' : ''}${dn}`) }
  }
  // a filled block holding only icon tiles is a block with icons, not a picture
  if (!f.text && fill && f.iconKids && !f.regionKids.length && w >= 30 && h >= 50) {
    const d = f.iconKids, names = d.fills.map((c, i) => `${d.faint[i] ? 'faint ' : ''}${colourName(c)}`)
    const cols = names.every((n) => n === names[0]) ? `all ${names[0]}` : names.slice(1).every((n) => n === names[1]) ? `first ${names[0]}, the rest ${names[1]}` : names.join(', ')
    const tile = d.round ? 'round dots' : d.radius >= 4 ? 'rounded squares' : 'squares'
    return { kind: 'box', note: withFx(`${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)} block (no picture), ${d.fills.length} small ${tile} (${d.px}px) ${d.vert ? 'stacked down from its top' : 'in a row'} ${d.gap}px apart: ${cols}`) }
  }
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
    if (shape && f.clipPoly) return { kind: 'shape', note: withFx(note), poly: f.clipPoly }
    const sh = shadowWords(f)
    return { kind: 'image', note: withFx(sh ? `${note ? `${note}, with a ` : ''}${sh}` : note) }
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
  if (round && square && f.text.length <= 24 && (fill || grad || bordered)) {
    const glowy = glow || /radial/.test(f.bgImage)
    const words = f.text ? ` with ${quote(f.text)}` : ''
    const paint = grad ? grad.replace(' gradient', '') : fill ? `${vivid(f.bg) ? 'vivid ' : ''}${colourName(f.bg)}` : `${lineCol(f.border.colour)} outline`
    // size word: a small textless dot (round 5 c2: a 28px red dot said 'big' was built as a 190px red disc)
    const size = f.text ? '' : w >= 120 ? 'big ' : w < 60 ? `small ${Math.round(w)}px ` : ''
    return { kind: 'circle', note: withFx(`${size}${glowy ? 'glowing ' : ''}${paint} ${!f.text && w < 60 ? 'dot' : 'circle'}${words}`) }
  }
  // bare dots in a column or row: say how many, size, spacing and each colour
  if (f.dotKids && !f.regionKids.length) {
    const d = f.dotKids, names = d.fills.map(colourName)
    const cols = names.every((n) => n === names[0]) ? `all ${names[0]}` : names.slice(1).every((n) => n === names[1]) ? `first ${names[0]}, the rest ${names[1]}` : names.join(', ')
    return { kind: 'box', note: `${d.fills.length} small round dots (${d.px}px) ${d.vert ? 'stacked in a column' : 'in a row'} ${d.gap}px apart, no box around them: ${cols}` }
  }
  // a thin textless filled strip (a reading-progress bar along the top edge): said as a strip, or it
  // reads as a heading line (round 4 c5: built a site title)
  if (fill && !f.text && !f.kidCount && h <= 10 && w >= h * 8) {
    return { kind: 'box', note: `solid ${colourName(f.bg)} strip only ${Math.round(h)}px tall, ${Math.round(w)}px wide, no text (a progress bar)${f.rect.y <= 4 ? ' along the top edge' : ''}` }
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
  // a row of buttons
  if (f.kidButtons >= 2 && f.kidButtons === f.kidCount && h <= 120 && !f.regionKids.length) {
    // a row of controls: a placeholder is an input, 'Role: All' or '▾' is a dropdown, the rest are buttons
    const ctl = (t) => /…$|\.\.\.$|^search\b/i.test(t) ? `input ${quote(t)}` : /▾|▼|:\s*\S/.test(t) ? `dropdown ${quote(t.replace(/\s*[▾▼]$/, ''))}` : `button ${quote(t)}`
    const items = f.kidTexts.map(ctl)
    const on = f.kidOn?.fill && f.kidTexts.includes(f.kidOn.t) ? `; ${quote(f.kidOn.t)} selected (${colourName(f.kidOn.fill)} fill)` : ''
    return { kind: 'box', note: (items.every((t) => t.startsWith('button')) ? `buttons: ${f.kidTexts.map((t) => quote(t)).join(', ')}` : items.join(', ')) + on }
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
    // on a band, the type's colour is said even when it is the page's: round 3 c2's near-black words on the
    // orange band were built white like the black band's
    if (fill && !f.clipText && w > 300) tw.push(`${textCol ? '' : `${colourName(f.colour)} letters `}on a ${colourName(f.bg)} band`)
    const under = f.lineUnder ? (said.add(f.lineUnder), `, line under: ${quote(f.lineUnder, 60)}`) : ''
    return { kind: 'heading', note: withFx(`${tw.join(' ')} ${quote(f.text, 60)}${under}`.trim()) }
  }
  // a row of short items (nav links, tabs)
  if (f.kidCount >= 3 && f.kidTexts.length >= 3 && f.kidTexts.every((t) => t.length <= 16) && h <= 80 && !f.regionKids.length) {
    const on = f.kidOn && f.kidTexts.includes(f.kidOn.t) ? `; ${quote(f.kidOn.t)} selected (${[f.kidOn.bold ? 'bold' : null, f.kidOn.ink ? `${colourName(f.kidOn.ink)} text` : null, f.kidOn.under ? `${colourName(f.kidOn.under)} underline` : null, f.kidOn.fill ? `${colourName(f.kidOn.fill)} fill` : null].filter(Boolean).join(', ')})` : ''
    const L = f.kidLead && f.kidLead.t === f.kidTexts[0] && f.kidLead.t !== f.kidOn?.t && f.kidLead.t.length <= 24 ? f.kidLead : null
    const lead = L ? `${[L.bold ? 'bold' : null, L.px ? `${L.px}px` : null, L.ink ? colourName(L.ink) : null].filter(Boolean).join(' ')} ${quote(L.t)} first, then ` : ''
    const items = L ? f.kidTexts.slice(1, 7) : f.kidTexts.slice(0, 6)
    return { kind: fill || bordered ? 'box' : 'text', note: `${fill && w >= 600 ? `${colourName(f.bg)} bar ${Math.round(h)}px tall across the page, ` : ''}${lead}links: ${items.join(', ')}${on}` }
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
    const lone = !f.regionKids.length && f.kidCount === 0 && f.text.length > 40 && f.text.length <= 140 ? `${f.font.weight >= 600 ? 'bold ' : ''}${Math.round(f.font.size)}px text ${quote(f.text, 140)}` : null
    const copy = code ?? unitSay ?? ctaCard ?? lone ?? (titled ? titled : f.text && f.text.length <= 40 && !f.regionKids.length ? quote(f.text) : list ? list : head && !f.regionKids.length ? `${quote(head)} and text` : '')
    const shadowTail = hardShadow && shadowWords(f) ? `, with a ${shadowWords(f)}` : ''
    return { kind: 'box', note: say || copy ? `${say}${say && /^huge \d/.test(copy) ? ';' : ''} ${copy}`.trim() + shadowTail : shadowTail ? shadowTail.slice(2) : null }
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
    // one short paragraph (a hero's lead line) is copy a person types, or the build writes its own
    const lead = !say && f.kidCount === 0 && f.text.length <= 110 && /^(p|span|div)$/.test(f.tag)
    // a lead line in a softer grey than the page's text (grey blurb on a white-text poster) says so,
    // or builds set it in the page's full text colour (round 2 c2)
    if (lead && /grey/.test(textCol ?? '') && !styled.includes(textCol)) styled.push(textCol)
    return { kind: 'text', note: say ? `${styled.join(' ')} ${quote(f.text)}`.trim() : lead ? `${styled.length ? `${styled.join(' ')} ` : ''}text ${quote(f.text, 110)}` : null }
  }
  return { kind: 'box', note: null }
}

// a display title over a smaller line (round 5 c5 hero: 76px 'Prism 2' over 18px copy was built swapped)
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

function pageNote(b) {
  const w = []
  // a cool pale grey (#f9fafb) is close to white yet a build on white loses it (round 4 e3)
  // a neutral near-white (#fafafa) under white cards is lost too: built on white, the cards vanish into it
  // (round 5 e4); it is said as off-white
  const nearWhite = visible(b.bg) && dist(b.bg, { r: 255, g: 255, b: 255 }) >= 6 && dist(b.bg, { r: 255, g: 255, b: 255 }) < 12
  const plain = (!visible(b.bg) || (dist(b.bg, { r: 255, g: 255, b: 255 }) < 12 && !nearWhite)) && !/gradient|url/.test(b.bgImage) && !isSerif(b.font.family) && !isMono(b.font.family)
  if (plain && !b.grain) return null
  const grad = gradientWords(b)
  if (grad) w.push(`${grad} page`)
  else if (visible(b.bg)) w.push(`${nearWhite && colourName(b.bg) === 'white' ? 'off-white' : colourName(b.bg)} page`)
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
    const what = (out.get(under.role).note ?? '').match(/^(?:tilted (?:slightly )?(?:\d+° (?:anti)?clockwise )?)?(.*?\bblock)\b/)?.[1] ?? 'other picture'
    const A = f.rect, B = under.rect
    const side = `${A.y + A.h / 2 > B.y + B.h / 2 ? 'lower' : 'upper'} ${A.x + A.w / 2 > B.x + B.w / 2 ? 'right' : 'left'}`
    d.note = `${d.note ? `${d.note}, ` : ''}overlapping the ${side} of the ${what} and on top of it`
  })
  // the same heading word on two separate marks: say it repeats, or a reading folds them into one line
  // (round 5 c4: two stacked 'SUMMER' lines built as one)
  const heads = regions.filter((f) => out.get(f.role).kind === 'heading' && f.text)
  for (const f of heads) {
    const same = heads.filter((g) => g.text === f.text).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
    if (same.length < 2) continue
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
    if (k === 'heading' && f.textLines >= 1) return [f.role, k, { fontPx: Math.round(f.font.size), lines: f.textLines }]
    // a paragraph of 2+ lines is drawn line by line at its real spacing (round 3 c3: 2 lines at 28px
    // were drawn 24px apart, read as 16px type, built as one small line)
    if (k === 'text' && f.textLines >= 2 && f.textLines <= 8) return [f.role, k, { fontPx: Math.round(f.font.size), lines: f.textLines }]
    return [f.role, k]
  })
  const notes = [...(pageNote(body) ? [['*', pageNote(body)]] : []), ...regions.filter((f) => out.get(f.role).note).map((f) => [f.role, out.get(f.role).note])]
  return { plan, notes }
}

export const wordCount = (notes) => notes.reduce((s, [, t]) => s + t.split(/\s+/).filter(Boolean).length, 0)
