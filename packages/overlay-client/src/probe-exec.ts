/**
 * The browser half of a behaviour probe (pipeline/src/probe.ts has the rules).
 *
 * Acts on a stamped element the way a person would — fills a form in and
 * submits it, or clicks the trigger — then waits for the page to settle and
 * fingerprints the effect region. What it must never do is leave the page:
 * a submit that nothing handles is cancelled here and reported as the failure
 * it is, because the alternative is the browser navigating away and taking
 * the overlay (and the run waiting on this answer) with it.
 *
 * The form is put back afterwards: every field gets its old value, through the
 * native setter so React's controlled inputs see it. The server puts the data
 * store back; that half cannot be done from here.
 */

export interface ProbeSpecWire {
  kind: 'submit' | 'click' | 'navigate'
  trigger: { srcLoc: string; label: string }
  effect?: { srcLoc: string; label: string }
  /** navigate: the route the trigger must open and the heading it must show. */
  screen?: { route: string; heading: string }
}

export interface NavObservationWire {
  hashBefore: string
  hashAfter: string
  triggerGone: boolean
  headingShown: boolean
  back: 'button' | 'browser' | null
  backOk: boolean
  /** s2c-040: what the open screen showed besides its heading and Back. */
  contents?: { count: number; sample: string }
}

export interface ProbeObservationWire {
  ran: boolean
  error?: string
  requests: Array<{ method: string; url: string; status: number | null }>
  before: string
  after: string
  unhandledSubmit?: boolean
  /** Click probes: the region changed while nobody touched it (a clock, a slideshow). */
  selfChanged?: boolean
  nav?: NavObservationWire
  ms: number
}

const stamped = (srcLoc: string): HTMLElement | null =>
  document.querySelector(`[data-s2c="${CSS.escape(srcLoc)}"]`) as HTMLElement | null

/**
 * Visible text + structure + visibility + look: what a person would notice
 * change.
 *
 * `skip` is the trigger of a click probe. When the region the arrow points
 * at contains the button, the button's own label flipping ("Show tips" ↔
 * "Hide tips") is not the effect: a button that only renames itself would
 * otherwise pass. Its subtree is left out of the text, the count and the look.
 *
 * Classes and inline styles are part of the look: a theme switch changes no
 * text and hides nothing, only the region's classes.
 */
export function fingerprint(el: Element | null, skip?: Element | null): string {
  if (!el || !el.isConnected) return 'gone'
  const h = el as HTMLElement
  const shown = h.getClientRects().length > 0 && getComputedStyle(h).visibility !== 'hidden'
  const all = [...el.querySelectorAll('*')].filter((n) => !(skip && skip !== el && skip.contains(n)))
  const inside = !!skip && skip !== el && el.contains(skip)
  const text = (inside ? visibleText(el, skip!) : (h.innerText ?? h.textContent ?? ''))
    .replace(/\s+/g, ' ').trim().slice(0, 2000)
  const look = [el, ...all].map((n) => {
    const shownN = (n as HTMLElement).getClientRects().length > 0 ? 1 : 0
    return `${n.getAttribute('class') ?? ''}~${n.getAttribute('style') ?? ''}~${shownN}`
  }).join('|')
  return `${shown ? 'shown' : 'hidden'}|${all.length}|${text}|${hash(look)}`
}

/** The rendered text of `el`, leaving out everything inside `skip`. */
function visibleText(el: Element, skip: Element): string {
  const parts: string[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement
    if (!parent || skip.contains(parent)) continue
    // what innerText would drop: text in something not laid out
    if (parent.getClientRects().length === 0) continue
    parts.push(n.textContent ?? '')
  }
  return parts.join(' ')
}

const hash = (s: string): string => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

/** A value each field type accepts, so the browser's own validation passes. */
function probeValue(f: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string | null {
  if (f instanceof HTMLSelectElement) {
    const opt = [...f.options].find((o) => o.value && !o.disabled)
    return opt?.value ?? null
  }
  if (f instanceof HTMLTextAreaElement) return 'Test message from sketch-to-code'
  switch (f.type) {
    case 'email': return 'probe@example.com'
    case 'number': case 'range': return f.min || '1'
    case 'tel': return '5550100'
    case 'url': return 'https://example.com'
    case 'date': return '2026-01-01'
    case 'password': return 'probe-Pa55word'
    case 'checkbox': case 'radio': case 'submit': case 'button': case 'reset':
    case 'hidden': case 'file': case 'image': return null
    default: return 'Probe Test'
  }
}

/** Set a value the way typing would, so React's onChange fires. */
function setNative(f: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) {
  const proto = Object.getPrototypeOf(f) as object
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(f, v)
  else f.value = v
  f.dispatchEvent(new Event('input', { bubbles: true }))
  f.dispatchEvent(new Event('change', { bubbles: true }))
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Which mutations of `region` count, leaving out the trigger's own subtree. */
const regionMutations = (kind: ProbeSpecWire['kind']): MutationObserverInit => ({
  childList: true, characterData: true, subtree: true,
  ...(kind === 'click' ? { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] } : {}),
})

/**
 * Watch `region` for `ms` with nobody touching it. True when it changed by
 * itself: a ticking clock, a countdown, an autoplay slideshow, a spinner.
 * Such a region changes during any click's settle window, so "it changed"
 * says nothing about the click. 1.1 s by default, so a once-a-second clock
 * ticks at least once inside it.
 */
export async function changesByItself(region: Element, skip: Element | null, ms = 1100): Promise<boolean> {
  let moved = 0
  const mo = new MutationObserver((muts) => {
    for (const m of muts) if (!(skip && skip.contains(m.target))) moved++
  })
  const before = fingerprint(region, skip)
  mo.observe(region, regionMutations('click'))
  await sleep(ms)
  mo.disconnect()
  return moved > 0 || fingerprint(region, skip) !== before
}

/** Laid out and not hidden: what a person would call "on the screen". */
const isShown = (el: Element | null): boolean =>
  !!el && el.isConnected && (el as HTMLElement).getClientRects().length > 0 &&
  getComputedStyle(el as HTMLElement).visibility !== 'hidden'

/** Poll until `ok()` or `ms` pass; true when it held. */
async function until(ok: () => boolean, ms: number): Promise<boolean> {
  const t0 = performance.now()
  while (performance.now() - t0 < ms) {
    if (ok()) return true
    await sleep(40)
  }
  return ok()
}

/** '' and '#' are the same address: the home page. */
const normHash = (h: string): string => (h === '#' ? '' : h)

/**
 * What the open screen shows besides the two things the engine writes, its
 * heading and its "← Back" (s2c-040). Something sketched inside the screen's
 * box is built into the screen, and this is how a run tells that it got
 * there: it can't be seen from the page the user drew on.
 */
const CONTENT = 'input, textarea, select, button, a, img, svg, p, li, label, td, blockquote, form, h1, h2, h3, h4, h5, h6'
function screenContents(app: Element, heading: string): { count: number; sample: string } {
  const isBack = (el: Element) => /^(button|a)$/i.test(el.tagName) && /^\W*back\b/i.test((el as HTMLElement).innerText.trim())
  const isHeading = (el: Element) => /^H[1-6]$/.test(el.tagName) &&
    (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim().toLowerCase() === heading
  const skip = (el: Element | null) => !!el && (isBack(el) || isHeading(el))
  // an icon inside the back button or a span inside the heading is not content
  const counted = [...app.querySelectorAll(CONTENT)].filter((el) =>
    isShown(el) && !skip(el) && !skip(el.parentElement))
  const sample = counted.map((el) => (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).placeholder || el.tagName.toLowerCase())
    .filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 80)
  return { count: counted.length, sample }
}

/**
 * The navigate probe (s2c-039): an arrow from a button to a named box claims
 * "clicking this opens that screen". So: click it the way a person would, and
 * check the three things a person would see — the address is the screen's,
 * the page they clicked on is gone, the screen's heading is there. Then go
 * back the way they would (the screen's own "← Back", else the browser's) and
 * check they land where they started. Whatever happens, the page is left at
 * the address it had, so the probe leaves no trace.
 *
 * Only the app's own root is searched for the heading: the overlay lives in a
 * shadow root, but the page around the app might carry the same words.
 */
async function runNavigateProbe(spec: ProbeSpecWire, trigger: HTMLElement, t0: number, waitMs: number): Promise<ProbeObservationWire> {
  const route = spec.screen?.route ?? ''
  const heading = (spec.screen?.heading ?? '').trim().toLowerCase()
  const app = document.getElementById('root') ?? document.body
  const hashBefore = normHash(location.hash)
  const srcLoc = spec.trigger.srcLoc
  const headingShown = () => !!heading && [...app.querySelectorAll('h1, h2, h3, [role="heading"]')]
    .some((h) => isShown(h) && (h as HTMLElement).innerText.replace(/\s+/g, ' ').trim().toLowerCase() === heading)
  // a link whose href is not an in-page address would leave the page
  const onClick = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.('a[href]')
    if (a && !(a.getAttribute('href') ?? '').startsWith('#') && !e.defaultPrevented) e.preventDefault()
  }
  window.addEventListener('click', onClick)
  try {
    trigger.click()
    await until(() => normHash(location.hash) === route && !isShown(stamped(srcLoc)) && headingShown(), waitMs)
    const hashAfter = normHash(location.hash)
    const triggerGone = !isShown(stamped(srcLoc))
    const shown = headingShown()
    const contents = hashAfter === route ? screenContents(app, heading) : undefined
    let back: NavObservationWire['back'] = null
    let backOk = false
    if (hashAfter !== hashBefore) {
      const btn = [...app.querySelectorAll('button, a')]
        .find((b) => isShown(b) && /^\W*back\b/i.test((b as HTMLElement).innerText.trim())) as HTMLElement | undefined
      if (btn) { back = 'button'; btn.click() } else { back = 'browser'; history.back() }
      backOk = await until(() => normHash(location.hash) === hashBefore && isShown(stamped(srcLoc)), waitMs)
    }
    return {
      ran: true, requests: [], before: hashBefore, after: hashAfter,
      nav: { hashBefore, hashAfter, triggerGone, headingShown: shown, back, backOk, ...(contents ? { contents } : {}) },
      ms: Math.round(performance.now() - t0),
    }
  } catch (err) {
    return { ran: false, error: `the page threw while it was being tested: ${err instanceof Error ? err.message : String(err)}`, requests: [], before: '', after: '', ms: Math.round(performance.now() - t0) }
  } finally {
    window.removeEventListener('click', onClick)
    // leave the page at the address it had, whatever the app did
    if (normHash(location.hash) !== hashBefore) {
      location.hash = hashBefore
      await until(() => isShown(stamped(srcLoc)), waitMs)
    }
  }
}

export async function runProbe(spec: ProbeSpecWire, settleMs = 400, maxMs = 5000, idleWatchMs = 1100): Promise<ProbeObservationWire> {
  const t0 = performance.now()
  const fail = (error: string): ProbeObservationWire =>
    ({ ran: false, error, requests: [], before: '', after: '', ms: Math.round(performance.now() - t0) })

  const trigger = stamped(spec.trigger.srcLoc)
  if (!trigger) return fail(`${spec.trigger.label} is not on the page any more`)
  if (spec.kind === 'navigate') return runNavigateProbe(spec, trigger, t0, Math.min(maxMs, 2500))
  const form = spec.kind === 'submit' ? trigger.closest('form') : null
  if (spec.kind === 'submit' && !form) return fail(`${spec.trigger.label} is not inside a form`)
  const region = spec.kind === 'submit' ? form : (spec.effect ? stamped(spec.effect.srcLoc) : null)
  if (spec.kind === 'click' && !region) return fail(`${spec.effect?.label ?? 'the region'} is not on the page`)

  // A click probe judges "the region changed after the click". If it changes
  // with nobody touching it, that judgement is worthless: a dead button next
  // to a clock would pass. Look first; if it moves by itself, don't click.
  if (spec.kind === 'click' && await changesByItself(region!, trigger, idleWatchMs)) {
    return { ran: true, requests: [], before: '', after: '', selfChanged: true, ms: Math.round(performance.now() - t0) }
  }

  // ── watch the network: fetch and XHR, the two ways a page sends anything
  const requests: ProbeObservationWire['requests'] = []
  let inflight = 0
  let lastActivity = performance.now()
  const origFetch = window.fetch
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    // our own plumbing is not the page's behaviour
    if (/\/@s2c\//.test(url)) return origFetch(input, init)
    const rec = { method, url, status: null as number | null }
    requests.push(rec)
    inflight++
    try {
      const res = await origFetch(input, init)
      rec.status = res.status
      return res
    } finally {
      inflight--
      lastActivity = performance.now()
    }
  }
  const origOpen = XMLHttpRequest.prototype.open
  const origSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __s2c?: { method: string; url: string; status: number | null } }, method: string, url: string | URL, ...rest: unknown[]) {
    this.__s2c = { method: method.toUpperCase(), url: String(url), status: null }
    return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest)
  } as typeof XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __s2c?: { method: string; url: string; status: number | null } }, body?: Document | XMLHttpRequestBodyInit | null) {
    const rec = this.__s2c
    if (rec && !/\/@s2c\//.test(rec.url)) {
      requests.push(rec)
      inflight++
      this.addEventListener('loadend', () => { rec.status = this.status || null; inflight--; lastActivity = performance.now() })
    }
    return origSend.call(this, body)
  }

  // ── a submit nobody handles navigates away; stop it and say so. Listening
  // on window in the bubble phase runs after React's root listener, so the
  // app has had its chance to call preventDefault.
  let unhandledSubmit = false
  const onSubmit = (e: Event) => {
    if (!e.defaultPrevented) { unhandledSubmit = true; e.preventDefault() }
  }
  // a click on a link would leave the page too
  const onClick = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.('a[href]')
    if (a && !e.defaultPrevented) e.preventDefault()
  }
  window.addEventListener('submit', onSubmit)
  window.addEventListener('click', onClick)

  const saved: Array<[HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, string]> = []
  try {
    // a click probe looks at the region without the trigger in it (see
    // fingerprint): the button renaming itself is not the effect
    const skip = spec.kind === 'click' ? trigger : null
    const before = fingerprint(region, skip)
    // Before/after alone misses a page that already shows the answer: the
    // second test submit of a form whose status line still says "Saved" from
    // the first. Any text or node the region re-renders while the probe runs
    // is the page reacting, so it counts too.
    // For a click, only what changed outside the trigger counts, and a
    // class or style flip counts as much as new text.
    let reacted = 0
    const mo = new MutationObserver((ms) => {
      for (const m of ms) if (!(skip && skip.contains(m.target))) reacted++
    })
    if (region) {
      mo.observe(region, regionMutations(spec.kind))
    }
    if (spec.kind === 'submit') {
      for (const f of [...form!.querySelectorAll('input, textarea, select')] as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
        if (f.disabled) continue
        const v = probeValue(f)
        if (v == null) continue
        saved.push([f, f.value])
        if (!f.value || (f instanceof HTMLSelectElement)) setNative(f, v)
      }
      await sleep(30) // let React commit the values before the submit reads them
      form!.requestSubmit()
    } else {
      trigger.click()
    }
    // settle: no request in flight and nothing new for settleMs
    lastActivity = performance.now()
    while (performance.now() - t0 < maxMs) {
      await sleep(50)
      if (inflight === 0 && performance.now() - lastActivity >= settleMs) break
    }
    mo.disconnect()
    const after = spec.kind === 'submit'
      ? fingerprint(form)
      : fingerprint(stamped(spec.effect!.srcLoc), stamped(spec.trigger.srcLoc) ?? trigger)
    return {
      ran: true, requests, before,
      // a region that re-rendered to the same text still reacted
      after: after === before && reacted > 0 ? `${after}|reacted:${reacted}` : after,
      unhandledSubmit, ms: Math.round(performance.now() - t0),
    }
  } catch (err) {
    return fail(`the page threw while it was being tested: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    window.removeEventListener('submit', onSubmit)
    window.removeEventListener('click', onClick)
    window.fetch = origFetch
    XMLHttpRequest.prototype.open = origOpen
    XMLHttpRequest.prototype.send = origSend
    for (const [f, v] of saved) if (f.isConnected) setNative(f, v)
  }
}
