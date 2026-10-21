/**
 * Which creative techniques does a page use? Read off the live DOM's computed
 * style, with no knowledge of how the page was made, so it can grade a build
 * against its target the same way the picture likeness does.
 *
 * Why: the picture likeness is a blur-level measure. A glass card, a 6° tilt,
 * hollow outlined type or a bleeding headline barely moves it, yet they are the
 * point of a creative page. This says, technique by technique, which ones the
 * build kept and which it dropped (recall against the target's own set).
 *
 *   effectsOf(page)            -> { found: {name: count}, names: [..] }
 *   effectRecall(target, built) -> { recall 0..1|null, kept: [..], missing: [..], extra: [..] }
 *
 * Zero tokens.
 */

/** Runs in the page. Visible elements only, first screen and anything bleeding off it. */
function scan() {
  const vw = innerWidth, vh = innerHeight
  const found = {}
  const hit = (k) => { found[k] = (found[k] ?? 0) + 1 }
  const SERIF = /\b(serif|georgia|times|garamond|playfair|didot|bodoni|baskerville|merriweather|lora|fraunces|caslon|cormorant|dm serif|instrument serif)\b/i
  const MONO = /\b(mono|monospace|courier|consolas|menlo)\b/i
  const els = [...document.body.querySelectorAll('*')].filter((el) => {
    if (el.closest('[id^="s2c"], [data-s2c-overlay]')) return false
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    if (r.bottom < 0 || r.top > vh * 1.2) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
  })
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)
  const angle = (t) => {
    if (!t || t === 'none') return 0
    const m = t.match(/matrix\(([^)]+)\)/)
    if (!m) return 0
    const [a, b] = m[1].split(',').map(Number)
    return Math.abs(Math.atan2(b, a) * 180 / Math.PI)
  }
  const shadowParts = (v) => (v && v !== 'none' ? v.split(/,(?![^(]*\))/) : []).map((p) => {
    const nums = (p.replace(/rgba?\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat)
    const transparent = /rgba\([^)]*,\s*0\)/.test(p)
    return { x: nums[0] ?? 0, y: nums[1] ?? 0, blur: nums[2] ?? 0, transparent }
  })
  // stripes: two stops at the same place (a 20%, b 20%) or one colour given a band (a 0% 20%); a 0/45/100% sky is a blend
  const hardStops = (bg) => {
    if (/\)\s+[\d.]+%\s+[\d.]+%/.test(bg)) return true
    const at = [...bg.matchAll(/\)\s+([\d.]+)%/g)].map((m) => +m[1])
    return at.some((v, i) => i > 0 && v === at[i - 1])
  }
  const leaves = []
  for (const el of els) {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const text = ownText(el)
    const size = parseFloat(s.fontSize)
    if (s.backdropFilter && s.backdropFilter !== 'none' || s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none') hit('glass')
    const a = angle(s.transform)
    if (a > 1 && a < 179) hit('tilt')
    if (s.rotate && s.rotate !== 'none' && Math.abs(parseFloat(s.rotate)) > 1) hit('tilt')
    if (/blur\(/.test(s.filter)) hit('blur')
    if (s.mixBlendMode && s.mixBlendMode !== 'normal') hit('blend')
    if (s.animationName && s.animationName !== 'none') hit('motion')
    if (/^polygon|^path|^circle|^ellipse/.test(s.clipPath) && !/^circle\(50%/.test(s.clipPath)) hit('clip-shape')
    if (/^vertical/.test(s.writingMode) && ownText(el)) hit('vertical-type')
    const bg = s.backgroundImage
    if (/gradient\(/.test(bg)) {
      if (/text/.test(s.backgroundClip || s.webkitBackgroundClip)) hit('gradient-text')
      else if (/repeating-/.test(bg) || (bg.match(/gradient\(/g) ?? []).length > 1 || hardStops(bg)) hit('stripes-or-layers')
      else hit('gradient')
    }
    for (const sh of shadowParts(s.boxShadow)) {
      if (sh.transparent) continue
      if (Math.abs(sh.x) >= 2 || Math.abs(sh.y) >= 2) hit(sh.blur <= 1 ? 'hard-shadow' : 'soft-shadow')
      else if (sh.blur >= 16) hit('glow') // no offset, wide blur: a halo
    }
    for (const sh of shadowParts(s.textShadow)) if (!sh.transparent && sh.blur <= 1 && (Math.abs(sh.x) >= 2 || Math.abs(sh.y) >= 2)) hit('hard-shadow')
    if (text) {
      const stroke = parseFloat(s.webkitTextStrokeWidth || '0')
      const fill = s.webkitTextFillColor || s.color
      if (stroke > 0 && /rgba\([^)]*,\s*0\)|transparent/.test(fill)) hit('hollow-type')
      if (size >= 96) hit('huge-type')
      const primary = s.fontFamily.split(',')[0].replace(/["']/g, '').trim()
      if (SERIF.test(primary) && !/sans/i.test(primary)) hit('serif')
      if (MONO.test(primary)) hit('mono')
      if (s.fontStyle === 'italic') hit('italic')
      if (s.textTransform === 'uppercase' && size >= 40) hit('uppercase-display')
    }
    // bleeding off the side: a visible thing (text or painted box) past the viewport edge
    const painted = text || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && r.width * r.height < vw * vh * 0.9) || /gradient|url\(/.test(bg) || el.tagName === 'IMG' || el.tagName === 'svg'
    if (painted && r.width < vw * 1.6 && (r.left < -8 || r.right > vw + 8)) hit('bleed')
    if (painted && el !== document.body && r.width * r.height < vw * vh * 0.6) leaves.push({ el, r })
  }
  // overlap: two painted things, neither inside the other, sharing >15% of the smaller one
  let overlaps = 0
  const L = leaves.slice(0, 250)
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const A = L[i], B = L[j]
    if (A.el.contains(B.el) || B.el.contains(A.el)) continue
    const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left)
    const h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top)
    if (w <= 0 || h <= 0) continue
    const small = Math.min(A.r.width * A.r.height, B.r.width * B.r.height)
    if (w * h > 0.15 * small) overlaps++
  }
  if (overlaps) found.overlap = overlaps
  return found
}

export async function effectsOf(page) {
  // read moving pages at their first frame (a spinning ring is not a tilt), as their pictures are shot
  await page.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0 }))
  const found = await page.evaluate(scan)
  return { found, names: Object.keys(found).sort() }
}

/** Recall of the target's techniques in the build. Typography traits count as techniques too. */
export function effectRecall(target, built) {
  const t = new Set(target.names ?? target), b = new Set(built.names ?? built)
  const kept = [...t].filter((n) => b.has(n)), missing = [...t].filter((n) => !b.has(n)), extra = [...b].filter((n) => !t.has(n))
  return { recall: t.size ? kept.length / t.size : null, kept, missing, extra }
}
