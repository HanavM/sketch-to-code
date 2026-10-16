/**
 * The PRIMARY accuracy score: was the sketch's intent realized?
 *
 * docs/findings.md showed the IoU score (score.mjs) answers the wrong question.
 * Page 12 scored 0% and was correct; page 05 went from unusable to shippable
 * and moved 18% -> 23%. A sketch is a statement of structure and intent, not a
 * mock-up, and the model is right to re-lay-out a shaky drawing. So this score
 * ignores WHERE things landed and asks three things a person would ask:
 *
 *   structure — is every block the sketch asked for there, as the right KIND of
 *               thing? A headline is text, a CTA is a clickable control, an
 *               email field is an input, "tier-1..3" is three repeated siblings.
 *   content   — do the blocks that stand for words carry real words, rather than
 *               a placeholder or the squiggle drawn back as an SVG path (page 05)?
 *   order     — did the blocks the sketch stacked come out in that order,
 *               judged on the elements chosen above, not on box overlap?
 *
 * `intent` is the mean of the three (order skipped when not measurable), and a
 * page is `realized` when intent ≥ REALIZED_MIN and every `must` region is
 * structurally present. That boolean is what SEED.md's definition of done counts
 * ("the intended change is realized on ≥ 80% of pages").
 *
 * Position is used nowhere except to read vertical order. IoU stays in
 * score.mjs as a secondary, positional signal.
 *
 * Everything here is pure over a list of element records, so it is unit-tested
 * without a browser (tests/bench/intent.test.ts). Each region's kind is inferred
 * from its role name; a spec can override it with `kind` (and `minWords`).
 */
import { identifyScore, orderScore } from './score.mjs'

export const REALIZED_MIN = 0.8

// ── kinds ───────────────────────────────────────────────────────────────────

/** First matching rule wins; tokens are the role's words, e.g. 'cta-primary' -> ['cta','primary']. */
const KIND_RULES = [
  { kind: 'container', any: ['wall', 'band', 'list', 'grid', 'row', 'gallery', 'section', 'footer', 'nav', 'hero', 'table', 'timeline', 'card', 'sidebar', 'topbar', 'header', 'bar', 'strip', 'form'] },
  { kind: 'input', any: ['input', 'email', 'field', 'search'] },
  { kind: 'consent', any: ['consent', 'checkbox', 'agree'] },
  { kind: 'control', any: ['cta', 'submit', 'button', 'download', 'btn', 'link'] },
  { kind: 'code', any: ['code'] },
  { kind: 'decor', any: ['wave', 'divider', 'decor', 'ornament'] },
  { kind: 'media', any: ['avatar', 'logo', 'media', 'screenshot', 'image', 'img', 'photo', 'mockup', 'device', 'icon', 'tile', 'video'] },
  { kind: 'text', minWords: 6, any: ['quote', 'testimonial'] },
  { kind: 'text', minWords: 2, any: ['heading', 'headline', 'title', 'eyebrow', 'attribution', 'legal', 'label', 'caption', 'name'] },
  { kind: 'text', minWords: 4, any: ['subhead', 'body', 'copy', 'paragraph', 'description', 'text', 'answer'] },
]

const tokens = (role) => String(role ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/**
 * 'tier-2' -> { base: 'tier', n: 2 }. A numbered role is a member of a repeat
 * group; the group as a whole is what the sketch meant ("three tiers").
 */
export function memberOf(role) {
  const m = /^(.*?)[-_ ]?(\d+)$/.exec(String(role ?? '').toLowerCase())
  return m && m[1] ? { base: m[1].replace(/[-_ ]+$/, ''), n: Number(m[2]) } : null
}

/** The kind of thing a region asks for. `spec.kind` wins over the role name. */
export function kindOf(region) {
  if (region.kind) return { kind: region.kind, minWords: region.minWords ?? 2 }
  const toks = tokens(region.role)
  // the head noun decides first: 'hero-headline' is a headline, 'logo-wall' a
  // wall of logos. Only if the last word says nothing do the others get a say
  // ('cta-primary' is a cta).
  const hit = (pool) => KIND_RULES.find((rule) => pool.some((t) => rule.any.includes(t)))
  const rule = hit(toks.slice(-1)) ?? hit(toks)
  if (rule) return { kind: rule.kind, minWords: region.minWords ?? rule.minWords ?? 1 }
  return { kind: 'container', minWords: 1 }
}

// ── element predicates ──────────────────────────────────────────────────────

const words = (s) => String(s ?? '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
const MEDIA_TAGS = new Set(['img', 'svg', 'picture', 'video', 'canvas', 'iframe'])
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote', 'q', 'figcaption', 'span', 'label', 'small', 'strong', 'em', 'li', 'dt', 'dd', 'td', 'th', 'cite', 'a'])
const SVG_PARTS = new Set(['path', 'polyline', 'line', 'circle', 'rect', 'ellipse', 'g', 'polygon'])
/** Text that a person would read as "the model never filled this in". */
const PLACEHOLDER = /^(lorem|ipsum|text|heading|title|subtitle|label|placeholder|todo|xxx+|\.\.\.|—|-)\b/i

const allText = (el) => el.allText ?? el.text ?? ''
const isSvgPart = (el) => SVG_PARTS.has(el.tag) || el.inSvg === true

export function isText(el, minWords = 1) {
  if (isSvgPart(el) || MEDIA_TAGS.has(el.tag)) return false
  // the element must itself hold words (or be a text tag whose words sit in
  // inline children) — a wrapper div with words three levels down is a container
  const own = words(el.text)
  const txt = own >= 1 ? el.text : TEXT_TAGS.has(el.tag) ? allText(el) : ''
  return words(txt) >= minWords
}

/** Real words: enough of them, and not a placeholder. Content, not just presence. */
export function isRealText(el, minWords) {
  if (!isText(el, minWords)) return false
  const txt = words(el.text) ? el.text : allText(el)
  return !PLACEHOLDER.test(txt.trim())
}

export function isControl(el) {
  const t = el.tag
  if (t === 'button' || el.ariaRole === 'button') return words(allText(el)) >= 1 || !!el.value
  if (t === 'input') return ['submit', 'button'].includes(el.type) && !!(el.value || allText(el))
  if (t === 'a') return words(allText(el)) >= 1
  return false
}

export function isInput(el) {
  if (el.tag === 'textarea' || el.tag === 'select') return true
  return el.tag === 'input' && !['submit', 'button', 'checkbox', 'radio', 'hidden'].includes(el.type)
}

export function isMedia(el) {
  if (MEDIA_TAGS.has(el.tag) || el.bgImage) return true
  // an avatar or logo placeholder is often a filled box with initials
  return !!el.filled && words(allText(el)) <= 2 && el.rect.w <= 320 && el.rect.h <= 320 && (el.children ?? 0) <= 1
}

const PREDICATES = {
  text: (el, k) => isText(el, 1),
  control: isControl,
  input: isInput,
  consent: (el) => (el.tag === 'input' && ['checkbox', 'radio'].includes(el.type)) || (el.tag === 'label' && words(allText(el)) >= 2),
  media: isMedia,
  code: (el) => el.tag === 'pre' || el.tag === 'code',
  decor: (el) => el.tag === 'svg' || el.tag === 'canvas' || !!el.bgImage || (!!el.filled && words(allText(el)) === 0),
  container: (el) => (el.children ?? 0) >= 2 && !isSvgPart(el) && el.tag !== 'svg',
}

/** Tags that name a role outright: a <footer> is a footer whatever its class list. */
const TAG_HINT = {
  nav: ['nav'], topbar: ['nav', 'header'], header: ['header'], footer: ['footer'], sidebar: ['aside', 'nav'],
  table: ['table'], hero: ['section', 'header'], heading: ['h1', 'h2', 'h3'], headline: ['h1', 'h2'],
  subhead: ['p', 'h2', 'h3'], quote: ['blockquote', 'q', 'p', 'figure'], faq: ['dl', 'details', 'ul'],
  list: ['ul', 'ol'], avatar: ['img'], logo: ['img', 'svg'], screenshot: ['img', 'video'], image: ['img', 'picture'],
  photo: ['img', 'picture'], mockup: ['img'], eyebrow: ['p', 'span', 'small'], attribution: ['cite', 'figcaption', 'span', 'p'], gallery: ['ul', 'section', 'div'], timeline: ['ol', 'ul'], form: ['form'],
}
const tagHint = (role, el) => (tokens(role).some((t) => (TAG_HINT[t] ?? []).includes(el.tag)) ? 1 : 0)

// ── assignment ──────────────────────────────────────────────────────────────

/**
 * The repeated siblings that realize a group of n numbered regions: the parent
 * with the most same-tag children that each hold something. Best is the largest
 * run (capped at n), then the one that names itself after the group.
 */
function findRepeat(base, n, elements, used) {
  const byParent = new Map()
  elements.forEach((el, i) => {
    if (used.has(i) || el.parent == null || el.parent < 0 || isSvgPart(el)) return
    if (!(words(allText(el)) >= 1 || (el.children ?? 0) >= 1 || isMedia(el))) return
    const key = `${el.parent}|${el.tag}`
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(i)
  })
  let best = null
  for (const [key, idx] of byParent) {
    if (idx.length < 2) continue
    // similar size: a real repeat is cards of comparable width/height, not a
    // heading + paragraph + button that happen to share a tag
    const ws = idx.map((i) => elements[i].rect.w * elements[i].rect.h).sort((a, b) => a - b)
    const median = ws[Math.floor(ws.length / 2)]
    const alike = idx.filter((i) => {
      const a = elements[i].rect.w * elements[i].rect.h
      return a >= median / 3 && a <= median * 3
    })
    if (alike.length < 2) continue
    const parentIdx = Number(key.split('|')[0])
    const ident = Math.max(identifyScore(base, elements[parentIdx] ?? {}) || 0, identifyScore(base, elements[alike[0]]) || 0)
    const score = Math.min(alike.length, n) * 10 + ident - Math.abs(alike.length - n) * 0.1
    if (!best || score > best.score) best = { score, idx: alike }
  }
  return best ? best.idx.slice(0, n) : []
}

/** Process the specific kinds first so a generic container can't eat a button. */
const KIND_ORDER = ['input', 'consent', 'control', 'code', 'media', 'decor', 'text', 'container']

/**
 * Assign each region at most one element, one-to-one. Returns
 * Map<regionIndex, { el, elementIndex, kind, minWords }>.
 */
export function assignRegions(regions, elements) {
  const used = new Set()
  const out = new Map()

  // 1) repeat groups: tier-1..3 -> three alike siblings
  const groups = new Map()
  regions.forEach((r, ri) => {
    const m = memberOf(r.role)
    if (!m || r.kind) return
    if (!groups.has(m.base)) groups.set(m.base, [])
    groups.get(m.base).push({ ri, n: m.n })
  })
  for (const [base, members] of groups) {
    if (members.length < 2) continue
    members.sort((a, b) => a.n - b.n)
    const sibs = findRepeat(base, members.length, elements, used)
    sibs.forEach((ei, k) => {
      used.add(ei)
      out.set(members[k].ri, { el: elements[ei], elementIndex: ei, kind: 'repeat', minWords: 0 })
    })
    // members beyond what the page repeated stay unassigned: "three tiers" that
    // came out as two is two-thirds right, and says so
    members.forEach((m) => { if (!out.has(m.ri)) out.set(m.ri, null) })
  }

  // 2) everything else, most specific kind first; a group's members never
  //    fall through to single-element matching
  const rest = regions
    .map((r, ri) => ({ r, ri, ...kindOf(r) }))
    .filter((x) => !out.has(x.ri))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (b.minWords ?? 0) - (a.minWords ?? 0) || a.ri - b.ri)
  // Text goes in two passes: first only elements that are real for the
  // region's kind, then anything textual for whatever is left. Otherwise a quote
  // with no real candidate (page 05: traced as squiggles) would take the
  // eyebrow's words and report the eyebrow missing instead of the quote empty.
  const pick = (x, strict) => {
    const pred = PREDICATES[x.kind] ?? PREDICATES.container
    let best = null
    elements.forEach((el, ei) => {
      if (used.has(ei) || !pred(el, x)) return
      if (strict && x.kind === 'text' && !isRealText(el, x.minWords)) return
      // rank by: names itself after the role, has the role's tag, then how much
      // it holds (a list of five logos beats the page wrapper around it), then
      // size. Never by position — that is what order is scoring.
      // Text is different: two real headings are interchangeable, and the
      // biggest wrapper is the wrong pick. Prefer an element that holds its
      // own words, then the earliest in the DOM — with text regions taken in
      // the sketch's reading order, that is the matching a person makes by eye
      // when two blocks are the same kind of thing.
      const rank = x.kind === 'text'
        ? [identifyScore(x.r.role, el), tagHint(x.r.role, el), words(el.text) ? 1 : 0, -ei]
        : [identifyScore(x.r.role, el), tagHint(x.r.role, el), x.kind === 'container' ? el.children ?? 0 : 0, el.rect.w * el.rect.h]
      if (!best || cmp(rank, best.rank) > 0) best = { rank, ei }
    })
    if (!best) return false
    used.add(best.ei)
    out.set(x.ri, { el: elements[best.ei], elementIndex: best.ei, kind: x.kind, minWords: x.minWords })
    return true
  }
  const nonText = rest.filter((x) => x.kind !== 'text')
  const reading = (x) => [x.r.rect?.y ?? 0, x.r.rect?.x ?? 0]
  const texts = rest
    .filter((x) => x.kind === 'text')
    .sort((a, b) => (b.minWords ?? 0) - (a.minWords ?? 0) || cmp(reading(a), reading(b)) || a.ri - b.ri)
  for (const x of nonText) if (x.kind !== 'container' && !pick(x, false)) out.set(x.ri, null)
  for (const x of texts) pick(x, true)
  for (const x of texts) if (!out.has(x.ri) && !pick(x, false)) out.set(x.ri, null)
  for (const x of nonText) if (x.kind === 'container' && !pick(x, false)) out.set(x.ri, null)
  return out
}

const cmp = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/** An SVG stroke the shape of a line of handwriting: wide, short, a path. */
export function countSquiggles(elements) {
  return elements.filter((el) => ['path', 'polyline'].includes(el.tag) && el.rect.w >= 60 && el.rect.h <= 0.25 * el.rect.w).length
}

// ── the score ───────────────────────────────────────────────────────────────

/**
 * Score one page's elements against a spec's regions. Pure.
 *
 * Returns { structure, content, order, intent, realized, mustStructure,
 * regions: [{ role, kind, found, real }], notes }. Any of the three may be null
 * when it has nothing to judge (no text regions -> content null), and intent is
 * the mean of what is not null.
 */
export function scoreIntent(spec, elements) {
  if (spec.edits) return scoreEdits(spec, elements)
  const regions = spec.regions ?? []
  const notes = []
  if (!regions.length) {
    return { structure: null, content: null, order: null, intent: null, realized: false, mustStructure: null, regions: [], notes: ['spec declares no regions'] }
  }
  const assigned = assignRegions(regions, elements)
  const rows = regions.map((r, ri) => {
    const a = assigned.get(ri)
    const k = kindOf(r)
    const isTextual = k.kind === 'text'
    return {
      role: r.role,
      must: !!r.must,
      kind: a?.kind ?? (memberOf(r.role) ? 'repeat' : k.kind),
      found: !!a,
      textual: isTextual,
      real: isTextual ? !!a && isRealText(a.el, k.minWords) : null,
      el: a ? { tag: a.el.tag, text: (words(a.el.text) ? a.el.text : allText(a.el)).slice(0, 60), srcLoc: a.el.srcLoc ?? null } : null,
    }
  })

  const structure = rows.filter((r) => r.found).length / rows.length
  const musts = rows.filter((r) => r.must)
  const mustStructure = musts.length ? musts.filter((r) => r.found).length / musts.length : null
  const textual = rows.filter((r) => r.textual)
  const content = textual.length ? textual.filter((r) => r.real).length / textual.length : null

  const placed = new Map()
  assigned.forEach((a, ri) => { if (a) placed.set(ri, { rect: a.el.rect }) })
  const order = orderScore(regions, placed)

  const parts = [structure, content, order].filter((x) => typeof x === 'number')
  const intent = parts.reduce((s, x) => s + x, 0) / parts.length
  const realized = intent >= REALIZED_MIN && (mustStructure === null || mustStructure === 1)

  const squiggles = countSquiggles(elements)
  if (squiggles && textual.some((r) => !r.real)) {
    notes.push(`${squiggles} handwriting-shaped SVG path(s) and ${textual.filter((r) => !r.real).length} text region(s) without real words — marks that meant text may have been traced`)
  }
  const missing = rows.filter((r) => !r.found).map((r) => r.role)
  if (missing.length) notes.push(`not found as the asked-for kind: ${missing.join(', ')}`)
  if (order === null && regions.length > 1) notes.push('order not measurable: fewer than two vertically ordered regions were found')

  return { structure, content, order, intent, realized, mustStructure, regions: rows, notes }
}

// ── edits on an existing page ───────────────────────────────────────────────

/**
 * An EDIT sketch (tests/bench/sketches/rough) changes a page that already has
 * content, so "is every asked-for block present" is meaningless: the base page
 * passes it before anyone draws. What was asked is a CHANGE, and it is checked
 * as a list of facts about the page afterwards, each judged on visible text:
 *
 *   { check: 'absent', text }            nothing visible says this any more (delete)
 *   { check: 'present', text?, kind? }   an element of that kind (and text) exists
 *   { check: 'kept', text }              untouched content survived (no collateral damage)
 *   { check: 'above', a, b }             the element saying `a` sits above the one saying `b`
 *   { check: 'leftOf', a, b }            `a` comes before `b` in reading order: same row and
 *                                        left of it, or on an earlier row (swap, insert)
 *   { check: 'bg', text, hue: [lo, hi] } the element saying `text` (or its nearest filled
 *                                        ancestor) has a background in that hue range
 *   { check: 'siblings', text, min }     the list item holding `text` has at least `min`
 *                                        items in its list, itself included (add one more)
 *
 * `text` is a case-insensitive substring. Every edit spec marks the checks that
 * ARE the change `must: true`, so the untouched base page can never be realized
 * (run.mjs --dry asserts that on the real page). Score = fraction of checks
 * that hold; realized = score >= REALIZED_MIN and every must holds.
 */
export function scoreEdits(spec, elements) {
  const checks = spec.edits ?? []
  const has = (el, t) => {
    const own = el.text && words(el.text) ? el.text : TEXT_TAGS.has(el.tag) || el.tag === 'button' ? allText(el) : ''
    return own.toLowerCase().includes(String(t).toLowerCase())
  }
  const visible = elements.filter((el) => !isSvgPart(el))
  const sayers = (t) => visible.filter((el) => has(el, t))
  /** smallest element that says it: the h1, not the section around it */
  const sayer = (t) => sayers(t).sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0] ?? null
  const rows = checks.map((c) => {
    let pass = false
    let found = null
    if (c.check === 'absent') {
      found = sayer(c.text)
      // allText too: a deleted card whose words survive inside a wrapper is not deleted
      pass = !found && !visible.some((el) => allText(el).toLowerCase().includes(String(c.text).toLowerCase()) && (el.children ?? 0) === 0)
    } else if (c.check === 'kept') {
      found = sayer(c.text)
      pass = !!found
    } else if (c.check === 'present') {
      const pred = c.kind ? PREDICATES[c.kind] ?? PREDICATES.container : () => true
      found = visible.find((el) => pred(el, {}) && (!c.text || allText(el).toLowerCase().includes(String(c.text).toLowerCase()))) ?? null
      pass = !!found
    } else if (c.check === 'above') {
      const a = sayer(c.a)
      const b = sayer(c.b)
      found = a
      pass = !!a && !!b && a.rect.y + a.rect.h / 2 < b.rect.y
    } else if (c.check === 'leftOf') {
      const a = sayer(c.a)
      const b = sayer(c.b)
      found = a
      if (a && b) {
        const ay = a.rect.y + a.rect.h / 2
        const by = b.rect.y + b.rect.h / 2
        const sameRow = Math.abs(ay - by) < Math.max(a.rect.h, b.rect.h) / 2
        pass = sameRow ? a.rect.x + a.rect.w / 2 < b.rect.x + b.rect.w / 2 : ay < by
      }
    } else if (c.check === 'bg') {
      const el = sayer(c.text)
      found = el
      let cur = el
      while (cur && !(cur.bg && hueOf(cur.bg) !== null)) cur = cur.parent >= 0 ? elements[cur.parent] : null
      const h = cur ? hueOf(cur.bg) : null
      pass = h !== null && h >= c.hue[0] && h <= c.hue[1]
    } else if (c.check === 'siblings') {
      const el = sayer(c.text)
      found = el
      const n = el ? listSize(el, elements) : 0
      pass = n >= c.min
    } else {
      throw new Error(`unknown edit check "${String(c.check)}"`)
    }
    return {
      role: c.label ?? `${c.check} ${c.text ?? `${c.a} > ${c.b}`}`,
      must: !!c.must,
      kind: c.check,
      found: pass,
      textual: false,
      real: null,
      el: found ? { tag: found.tag, text: allText(found).slice(0, 60), srcLoc: found.srcLoc ?? null } : null,
    }
  })
  if (!rows.length) {
    return { structure: null, content: null, order: null, intent: null, realized: false, mustStructure: null, regions: [], notes: ['edit spec declares no checks'] }
  }
  const structure = rows.filter((r) => r.found).length / rows.length
  const musts = rows.filter((r) => r.must)
  const mustStructure = musts.length ? musts.filter((r) => r.found).length / musts.length : null
  const realized = structure >= REALIZED_MIN && (mustStructure === null || mustStructure === 1)
  const failed = rows.filter((r) => !r.found).map((r) => r.role)
  const notes = failed.length ? [`edit checks failed: ${failed.join('; ')}`] : []
  return { structure, content: null, order: null, intent: structure, realized, mustStructure, regions: rows, notes }
}

/**
 * How many items are in the list that `el` sits in, counting its own item.
 *
 * Climbs from `el` (the "GitHub" heading) to the first ancestor whose parent
 * holds at least one other child like it: that ancestor is the list item (the
 * tile) and the parent is the list (the grid). "Like it" = comparable size
 * (half to double its width and height) and the same tag, except that two
 * boxes (elements holding other elements) count as alike whatever their tags:
 * a model asked for "one more tile" may well write an <article> or <li> next
 * to three <div>s, and that is still one more tile. Two different leaf tags
 * never match, so a tile's own heading and paragraph are not mistaken for a
 * two-item list.
 * Returns 1 when `el` is in no list at all.
 */
export function listSize(el, elements) {
  let item = el
  while (item && item.parent != null && item.parent >= 0) {
    const kids = elements.filter((e) => e.parent === item.parent && !isSvgPart(e))
    const box = (e) => (e.children ?? 0) > 0
    const sameKind = (e) => e.tag === item.tag || (box(e) && box(item))
    const sized = (e) => e.rect.w >= item.rect.w / 2 && e.rect.h >= item.rect.h / 2 && e.rect.w <= item.rect.w * 2 && e.rect.h <= item.rect.h * 2
    const alike = kids.filter((e) => sameKind(e) && sized(e))
    if (alike.length >= 2) return alike.length
    item = elements[item.parent]
  }
  return 1
}

/**
 * Hue in degrees of a CSS color string, or null when it is transparent or too
 * grey or dark to have one (saturation < 0.25, or max channel < 60). Handles rgb()/rgba() and, for
 * Tailwind v4's defaults, oklch().
 */
export function hueOf(css) {
  const s = String(css ?? '').trim()
  let m = /^rgba?\(([^)]+)\)$/.exec(s)
  if (m) {
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    if (a === 0) return null
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    // near-black or near-grey has no hue a person would name
    if (mx < 60 || (mx - mn) / mx < 0.25) return null
    const d = mx - mn
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
    return h < 0 ? h + 360 : h
  }
  m = /^oklch\(([^)]+)\)$/.exec(s)
  if (m) {
    const parts = m[1].split(/[ /]+/).filter(Boolean)
    const c = parseFloat(parts[1])
    const h = parseFloat(parts[2])
    const alpha = parts[3] !== undefined ? parseFloat(parts[3]) : 1
    if (!Number.isFinite(h) || c < 0.05 || alpha === 0) return null
    // oklch hue is not sRGB hue; close enough to bucket red/green/blue, and the
    // specs use wide ranges. Map the few anchor points: oklch green ~ 140-150.
    return h
  }
  return null
}
