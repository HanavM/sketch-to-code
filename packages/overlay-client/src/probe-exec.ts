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
  kind: 'submit' | 'click'
  trigger: { srcLoc: string; label: string }
  effect?: { srcLoc: string; label: string }
}

export interface ProbeObservationWire {
  ran: boolean
  error?: string
  requests: Array<{ method: string; url: string; status: number | null }>
  before: string
  after: string
  unhandledSubmit?: boolean
  ms: number
}

const stamped = (srcLoc: string): HTMLElement | null =>
  document.querySelector(`[data-s2c="${CSS.escape(srcLoc)}"]`) as HTMLElement | null

/** Visible text + structure + visibility: what a person would notice change. */
export function fingerprint(el: Element | null): string {
  if (!el || !el.isConnected) return 'gone'
  const h = el as HTMLElement
  const shown = h.getClientRects().length > 0 && getComputedStyle(h).visibility !== 'hidden'
  const text = (h.innerText ?? h.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000)
  return `${shown ? 'shown' : 'hidden'}|${el.querySelectorAll('*').length}|${text}`
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

export async function runProbe(spec: ProbeSpecWire, settleMs = 400, maxMs = 5000): Promise<ProbeObservationWire> {
  const t0 = performance.now()
  const fail = (error: string): ProbeObservationWire =>
    ({ ran: false, error, requests: [], before: '', after: '', ms: Math.round(performance.now() - t0) })

  const trigger = stamped(spec.trigger.srcLoc)
  if (!trigger) return fail(`${spec.trigger.label} is not on the page any more`)
  const form = spec.kind === 'submit' ? trigger.closest('form') : null
  if (spec.kind === 'submit' && !form) return fail(`${spec.trigger.label} is not inside a form`)
  const region = spec.kind === 'submit' ? form : (spec.effect ? stamped(spec.effect.srcLoc) : null)
  if (spec.kind === 'click' && !region) return fail(`${spec.effect?.label ?? 'the region'} is not on the page`)

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
    const before = fingerprint(region)
    // Before/after alone misses a page that already shows the answer: the
    // second test submit of a form whose status line still says "Saved" from
    // the first. Any text or node the region re-renders while the probe runs
    // is the page reacting, so it counts too.
    let reacted = 0
    const mo = new MutationObserver((ms) => { reacted += ms.length })
    if (region) mo.observe(region, { childList: true, characterData: true, subtree: true })
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
    const after = fingerprint(spec.kind === 'submit' ? form : stamped(spec.effect!.srcLoc))
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
