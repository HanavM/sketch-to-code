/**
 * An INDEPENDENT accuracy score for a rendered benchmark page.
 *
 * The pipeline already grades itself: verifyActions() (packages/pipeline/src/run2.ts)
 * counts how many of the actions it decided to take it can then see evidence
 * for, and the run reports that as "N% verified". That number is worth
 * recording — it says whether the system's own checks are honest — but it cannot
 * be the accuracy metric, for two reasons. It is scored against the plan the
 * model wrote, so a confidently wrong reading of the sketch can verify at 100%;
 * and its placement check asks only whether something new landed in the right
 * region, not whether the thing the sketch asked for is there. A system marking
 * its own homework tells you nothing about whether a person would look at the
 * page and recognise what they drew.
 *
 * So this module ignores the pipeline entirely and measures the rendered DOM
 * against the sketch's intended regions: for each region the sketch declared,
 * is there an element on the page occupying roughly that box, are the
 * must-have regions among them, and did they come out in the vertical order the
 * sketch asked for.
 *
 * Exports: scorePage(page, spec), summarise(results), plus MATCH_IOU and the
 * pure helpers iou()/matchRegions() so the matching can be unit-tested without
 * a browser.
 */

/**
 * IoU above which an element is accepted as "this is the block the sketch asked
 * for". 0.35 — chosen from what the number means for two boxes, not by taste:
 *
 *   - two same-size boxes offset along one axis by `d` score (1-d)/(1+d) of a
 *     side, so 0.35 tolerates a block displaced by just under HALF its own
 *     width or height, and rejects more;
 *   - two concentric boxes differing only in scale by `k` score 1/k², so 0.35
 *     tolerates a block rendered ~1.7x too big or ~0.6x too small.
 *
 * That is the right tolerance for a FREEHAND target. The regions come from
 * rectangles a person sketched by hand over a blank page; they are the intent,
 * not a pixel spec, and demanding 0.5+ would mostly measure the sketcher's
 * steadiness. It is still far above what unrelated blocks score: a sidebar
 * matched against a hero, or a button against a card, lands in single digits.
 *
 * Exported so a run can report the threshold it used; moving it changes every
 * past number's meaning, so report it alongside the scores.
 */
export const MATCH_IOU = 0.35

/** Elements that exist before any sketch runs, and so can never be credit. */
const SHELL_SELECTOR = 'html, body, #root'
/** The overlay's own shadow host — its UI is not the app's output. */
const OVERLAY_HOST_ID = 's2c-overlay-host'

// ── pure geometry (testable without a page) ─────────────────────────────────

/** Intersection over union of two {x,y,w,h} boxes. 0 when they miss. */
export function iou(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const inter = x * y
  if (inter <= 0) return 0
  const union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}

/**
 * Greedy one-to-one matching, best pair first.
 *
 * One-to-one matters: a single enormous wrapper div overlaps every region on
 * the page, and without consuming elements it would satisfy all of them at
 * once — turning "the model rendered one box" into a perfect score. Greedy by
 * descending IoU gives each element to the region it fits best, which is also
 * the assignment a person would make by eye.
 *
 * Returns { matched: Map<regionIndex, {el, iou}>, pairs } — `pairs` is every
 * considered overlap, for debugging a surprising score.
 */
export function matchRegions(regions, elements, threshold = MATCH_IOU) {
  const pairs = []
  regions.forEach((r, ri) => {
    elements.forEach((el, ei) => {
      const score = iou(r.rect, el.rect)
      if (score >= threshold) pairs.push({ ri, ei, iou: score })
    })
  })
  // descending IoU; ties broken by region then element index so the result is
  // deterministic rather than dependent on sort stability
  pairs.sort((p, q) => q.iou - p.iou || p.ri - q.ri || p.ei - q.ei)
  const matched = new Map()
  const usedEl = new Set()
  for (const p of pairs) {
    if (matched.has(p.ri) || usedEl.has(p.ei)) continue
    matched.set(p.ri, { el: elements[p.ei], iou: p.iou, elementIndex: p.ei })
    usedEl.add(p.ei)
  }
  return { matched, pairs }
}

/**
 * Words in a role that could plausibly show up in the rendered page: 'signup-form'
 * -> ['signup','form']. Short and generic words are dropped because 'the' or
 * 'section' matching some element's class list says nothing.
 */
const ROLE_STOP = new Set(['the', 'and', 'for', 'with', 'block', 'section', 'area', 'region', 'box', 'main'])
const roleTokens = (role) =>
  String(role ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !ROLE_STOP.has(w))

/**
 * How strongly an element identifies ITSELF as the region's role, independent of
 * where it sits: the fraction of the role's words appearing in its own text, its
 * class list, or the filename of its data-s2c stamp. A 'footer' region is
 * identified by a <footer>, by a component stamped `src/Footer.tsx:…`, by
 * `class="site-footer"`, or by the word in its own text.
 */
export function identifyScore(role, el) {
  const toks = roleTokens(role)
  if (!toks.length) return 0
  const file = (el.srcLoc ?? '').split(':')[0].split('/').pop() ?? ''
  const hay = `${el.tag} ${el.text ?? ''} ${(el.classes ?? []).join(' ')} ${file}`.toLowerCase()
  return toks.filter((t) => hay.includes(t)).length / toks.length
}

/** Half the role's words have to land before an element counts as identified. */
const IDENTIFY_MIN = 0.5

/**
 * Where each region's CONTENT ended up, found by name rather than by position.
 *
 * This exists because the order metric cannot be built on the IoU match. The IoU
 * match is deliberately blind to content: if the model renders the right boxes
 * in the wrong order, each box still overlaps the region it is sitting in, so
 * every region matches and a geometric order check reports a perfect 1.0 for a
 * page a person would call scrambled. Asking "where did the thing CALLED footer
 * end up" is the only way to see that, so the ordering is measured over
 * role-identified elements when the page gives enough to identify them.
 *
 * Greedy, one element per role, best identification first; ties go to the larger
 * box, so a section wins over the heading inside it that repeats its word.
 */
export function identifyRegions(regions, elements, minScore = IDENTIFY_MIN) {
  const cands = []
  regions.forEach((r, ri) => {
    elements.forEach((el, ei) => {
      const score = identifyScore(r.role, el)
      if (score >= minScore) cands.push({ ri, ei, score, area: el.rect.w * el.rect.h })
    })
  })
  cands.sort((a, b) => b.score - a.score || b.area - a.area || a.ri - b.ri || a.ei - b.ei)
  const byRegion = new Map()
  const used = new Set()
  for (const c of cands) {
    if (byRegion.has(c.ri) || used.has(c.ei)) continue
    byRegion.set(c.ri, { el: elements[c.ei], score: c.score })
    used.add(c.ei)
  }
  return byRegion
}

/**
 * Did the regions come out in the sketch's top-to-bottom order?
 *
 * The fraction of concordant pairs (a Kendall-tau concordance, 0..1): for every
 * pair of regions the sketch stacked vertically, did the page stack them the
 * same way. Pairs the sketch did NOT order are skipped — two regions overlapping
 * vertically by more than half the shorter one's height are side by side, and
 * the sketch expressed no opinion about which comes "first".
 *
 * `placed` is Map<regionIndex, {rect}>: the role-identified elements where the
 * page names its parts, otherwise the IoU-matched ones. Null when fewer than two
 * ordered pairs exist — nothing to be right or wrong about, and 1.0 would
 * flatter the page.
 */
export function orderScore(regions, placed) {
  const idx = [...placed.keys()].sort((a, b) => a - b)
  let total = 0
  let concordant = 0
  for (let i = 0; i < idx.length; i++) {
    for (let j = i + 1; j < idx.length; j++) {
      const a = regions[idx[i]].rect
      const b = regions[idx[j]].rect
      const overlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
      if (overlap > 0.5 * Math.min(a.h, b.h)) continue // side by side: unordered
      total++
      const wantAFirst = a.y < b.y
      const gotA = placed.get(idx[i]).rect.y
      const gotB = placed.get(idx[j]).rect.y
      if ((gotA < gotB) === wantAFirst) concordant++
    }
  }
  return total === 0 ? null : concordant / total
}

/** How many pairs orderScore() would actually judge, for "is this 1.0 worth anything". */
function orderedPairs(regions, placed) {
  const idx = [...placed.keys()]
  let n = 0
  for (let i = 0; i < idx.length; i++) {
    for (let j = i + 1; j < idx.length; j++) {
      const a = regions[idx[i]].rect
      const b = regions[idx[j]].rect
      const overlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
      if (overlap <= 0.5 * Math.min(a.h, b.h)) n++
    }
  }
  return n
}

// ── reading the page ────────────────────────────────────────────────────────

/**
 * Every element the page actually shows, with its box in PAGE coordinates
 * (scroll included, matching packages/dom/src/snapshot.ts) so a scored page and
 * a sketch rect mean the same thing even if something scrolled.
 */
async function readElements(page, { shellSelector, overlayHostId }) {
  return page.evaluate(({ shellSelector, overlayHostId }) => {
    const sx = window.scrollX
    const sy = window.scrollY
    const shell = new Set(document.querySelectorAll(shellSelector))
    const host = document.getElementById(overlayHostId)
    const out = []
    for (const el of document.querySelectorAll('*')) {
      const tag = el.tagName.toLowerCase()
      if (['script', 'style', 'link', 'meta', 'noscript', 'head', 'title', 'template', 'br'].includes(tag)) continue
      if (shell.has(el)) continue
      // the overlay host and everything the overlay renders inside it
      if (host && (el === host || host.contains(el))) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      let text = ''
      for (const c of el.childNodes) if (c.nodeType === 3) text += c.textContent ?? ''
      out.push({
        tag,
        rect: { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height },
        srcLoc: el.getAttribute('data-s2c'),
        text: text.replace(/\s+/g, ' ').trim().slice(0, 80),
        classes: typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 12) : [],
      })
    }
    return out
  }, { shellSelector, overlayHostId })
}

/**
 * Score one rendered page against one sketch spec.
 *
 * `page` is a Playwright Page already pointed at the app AFTER the run under
 * measurement; `spec` is a sketch spec ({ id, viewport, regions, strokes, ... }).
 * The caller owns the viewport — it must be the spec's, since the regions were
 * drawn in those coordinates — but this scrolls to the top, because the regions
 * are viewport coordinates at scroll 0 and a left-over scroll would shift every
 * box by the same wrong amount.
 */
export async function scorePage(page, spec, { threshold = MATCH_IOU } = {}) {
  const regions = spec.regions ?? []
  await page.evaluate(() => window.scrollTo(0, 0))
  const elements = await readElements(page, {
    shellSelector: SHELL_SELECTOR,
    overlayHostId: OVERLAY_HOST_ID,
  })

  const { matched: hits } = matchRegions(regions, elements, threshold)

  const matched = []
  const missed = []
  let iouSum = 0
  regions.forEach((r, i) => {
    const hit = hits.get(i)
    if (hit) {
      iouSum += hit.iou
      matched.push({
        role: r.role,
        iou: hit.iou,
        rect: r.rect,
        found: { tag: hit.el.tag, rect: hit.el.rect, srcLoc: hit.el.srcLoc },
      })
    } else {
      missed.push({ role: r.role, rect: r.rect, must: !!r.must })
    }
  })

  // mean IoU over ALL regions: an unmatched region contributes 0, so a page can
  // only reach 1.0 by placing every region exactly
  const regionScore = regions.length ? iouSum / regions.length : null
  const musts = regions.filter((r) => r.must)
  // null, not 1, when the sketch declared no must regions — there is no
  // must-score to report and a 1.0 would inflate every aggregate it entered
  const mustScore = musts.length
    ? regions.filter((r, i) => r.must && hits.has(i)).length / musts.length
    : null

  // Order is measured over role-identified elements when the page names enough
  // of its parts, because the IoU match cannot see a scramble (see
  // identifyRegions). Geometry is the fallback, and which basis was used is
  // reported — a 1.0 means different things in the two cases.
  const named = identifyRegions(regions, elements)
  const geoPlaced = new Map([...hits].map(([ri, h]) => [ri, { rect: h.el.rect }]))
  const namedPlaced = new Map([...named].map(([ri, h]) => [ri, { rect: h.el.rect }]))
  const useNamed = orderedPairs(regions, namedPlaced) >= Math.max(1, orderedPairs(regions, geoPlaced))
  const placed = useNamed && namedPlaced.size >= 2 ? namedPlaced : geoPlaced
  const orderBasis = placed === namedPlaced ? 'role' : 'geometry'
  const order = orderScore(regions, placed)

  const notes = []
  if (!regions.length) notes.push('spec declares no regions — nothing to score')
  if (!elements.length) notes.push('page rendered nothing: no visible elements outside the shell')
  if (!musts.length && regions.length) notes.push('no `must` regions declared; mustScore not applicable')
  const unstamped = elements.filter((e) => !e.srcLoc).length
  if (elements.length && unstamped === elements.length) {
    notes.push('no element carries a data-s2c stamp — the plugin may not be transforming the app')
  }
  const missedMust = missed.filter((m) => m.must).map((m) => m.role)
  if (missedMust.length) notes.push(`must regions missed: ${missedMust.join(', ')}`)
  const extra = elements.length - matched.length
  if (matched.length && extra > 4 * matched.length) {
    notes.push(`${extra} visible elements beyond the ${matched.length} matched — possible bloat`)
  }
  if (order === null && regions.length > 1) {
    notes.push('order not measurable: fewer than two vertically ordered regions were placed')
  } else if (order !== null && orderBasis === 'geometry') {
    notes.push('order measured from box positions only (no element named itself after a role), so a same-shape scramble would score 1.0')
  }

  return {
    matched,
    missed,
    regionScore,
    mustScore,
    order,
    elements: elements.length,
    notes,
    // kept for reports and debugging, not part of the asked-for shape
    orderBasis: order === null ? null : orderBasis,
    orderPairs: orderedPairs(regions, placed),
    threshold,
    regions: regions.length,
  }
}

const mean = (xs) => {
  const ok = xs.filter((x) => typeof x === 'number' && Number.isFinite(x))
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null
}

/**
 * Aggregate a run. Accepts either scorePage results or the runner's per-page
 * records that carry one under `.score`; `id`/`title` are picked up from
 * whichever level has them, so a report can name the worst page.
 *
 * Means skip missing values rather than reading them as 0 — a page with no
 * `must` regions should not drag mustScore down, and a page with nothing to
 * order should not drag `order` down.
 */
export function summarise(results) {
  const rows = results.map((r) => {
    const s = r.score ?? r
    return {
      id: r.id ?? s.id ?? null,
      title: r.title ?? s.title ?? null,
      regionScore: s.regionScore ?? null,
      mustScore: s.mustScore ?? null,
      order: s.order ?? null,
      elements: s.elements ?? null,
      missed: (s.missed ?? []).length,
      mustMissed: (s.missed ?? []).filter((m) => m.must).length,
    }
  })
  const ranked = rows.filter((r) => typeof r.regionScore === 'number').sort((a, b) => a.regionScore - b.regionScore)
  return {
    pages: rows.length,
    regionScore: mean(rows.map((r) => r.regionScore)),
    mustScore: mean(rows.map((r) => r.mustScore)),
    order: mean(rows.map((r) => r.order)),
    elements: mean(rows.map((r) => r.elements)),
    // a page can be missing regions and still be the "best" by mean IoU; both
    // counts are reported so that is visible rather than hidden behind a mean
    regionsMissed: rows.reduce((a, r) => a + r.missed, 0),
    mustMissed: rows.reduce((a, r) => a + r.mustMissed, 0),
    worst: ranked[0] ?? null,
    best: ranked[ranked.length - 1] ?? null,
    rows,
  }
}
