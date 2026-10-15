/**
 * The page the rough EDIT sketches are drawn on.
 *
 * The tidy set draws new UI onto a blank page, which is why every one of its
 * pages reads as `design` in auto mode and the gesture grammar (delete, move,
 * restyle, rewrite) was never measured (s2c-012). An edit needs something to
 * edit, so these pages start from this ordinary small landing page instead,
 * committed on top of the blank app before the page is drawn (run.mjs
 * `prepareBase`). Every element is written out literally, not via .map, so
 * each card carries its own data-s2c stamp and a mark on card 3 grounds to
 * card 3 alone.
 *
 * The rough specs hard-code where their marks go. `ANCHORS` is where those
 * elements actually rendered at 1280x900 in the bench app (measured with
 * Chromium, Tailwind v4); run.mjs re-measures them before drawing and refuses
 * the page if any moved by more than ANCHOR_TOLERANCE px, so a change to this
 * file or to Tailwind cannot silently send marks into empty space.
 */
export const BASE_APP = `export default function App() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <nav className="flex items-center justify-between border-b border-slate-200 px-12 py-5">
        <span className="text-xl font-bold">Acme</span>
        <div className="flex gap-8 text-sm text-slate-600">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#about">About</a>
        </div>
      </nav>
      <section className="px-12 pt-16 pb-12 text-center">
        <h1 className="text-5xl font-bold">Ship faster with Acme</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">The deploy platform for small teams who would rather build than babysit servers.</p>
        <button className="mt-8 rounded-lg bg-slate-900 px-6 py-3 text-white">Get started</button>
      </section>
      <section id="features" className="grid grid-cols-3 gap-8 px-12 pb-12">
        <article className="rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold">Instant previews</h3>
          <p className="mt-2 text-sm text-slate-600">Every branch gets its own live URL in seconds.</p>
        </article>
        <article className="rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold">One-click rollbacks</h3>
          <p className="mt-2 text-sm text-slate-600">Undo a bad deploy without touching a terminal.</p>
        </article>
        <article className="rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold">Usage-based billing</h3>
          <p className="mt-2 text-sm text-slate-600">Pay for the minutes you run, nothing when idle.</p>
        </article>
      </section>
      <section className="bg-slate-50 px-12 py-12 text-center">
        <blockquote className="text-2xl font-medium">"We cut our release time in half."</blockquote>
        <p className="mt-3 text-sm text-slate-500">Priya N., CTO at Fieldnote</p>
      </section>
      <footer className="px-12 py-6 text-sm text-slate-500">© 2026 Acme Inc.</footer>
    </main>
  )
}
`

export const ANCHOR_TOLERANCE = 12

/**
 * text -> rect of the SMALLEST element whose text contains it (page coords,
 * 1280x900, scroll 0), measured 2026-10-15 in the bench app.
 */
export const ANCHORS = {
  'Features': { x: 1025, y: 24, w: 57, h: 20 },
  'Pricing': { x: 1114, y: 24, w: 46, h: 20 },
  'About': { x: 1193, y: 24, w: 39, h: 20 },
  'Ship faster with Acme': { x: 48, y: 133, w: 1184, h: 48 },
  'Get started': { x: 574, y: 285, w: 132, h: 48 },
  'Instant previews': { x: 73, y: 406, w: 323, h: 28 },
  'Usage-based billing': { x: 884, y: 406, w: 323, h: 28 },
  'Pay for the minutes': { x: 884, y: 442, w: 323, h: 20 },
  'We cut our release time': { x: 48, y: 583, w: 1184, h: 32 },
  '© 2026 Acme Inc.': { x: 0, y: 695, w: 1280, h: 68 },
}

/**
 * Where each anchor text rendered NOW, from a live page. Returns
 * { text: rect | null }. Smallest element containing the text, same rule as
 * ANCHORS was measured with.
 */
export async function measureAnchors(page, texts) {
  return page.evaluate((texts) => {
    const out = {}
    const host = document.getElementById('s2c-overlay-host')
    for (const t of texts) {
      let best = null
      for (const el of document.querySelectorAll('#root *')) {
        if (host && host.contains(el)) continue
        if (!(el.textContent ?? '').includes(t)) continue
        const r = el.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) continue
        if (!best || r.width * r.height < best.w * best.h) best = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
      }
      out[t] = best && { x: Math.round(best.x), y: Math.round(best.y), w: Math.round(best.w), h: Math.round(best.h) }
    }
    return out
  }, texts)
}

/** Anchors that moved more than ANCHOR_TOLERANCE px (any edge), or vanished. */
export function driftedAnchors(measured) {
  const bad = []
  for (const [t, want] of Object.entries(measured).map(([t, got]) => [t, { want: ANCHORS[t], got }])) {
    if (!want.want) { bad.push(`${t}: no recorded anchor`); continue }
    if (!want.got) { bad.push(`${t}: not on the page`); continue }
    const d = Math.max(
      Math.abs(want.got.x - want.want.x), Math.abs(want.got.y - want.want.y),
      Math.abs(want.got.x + want.got.w - want.want.x - want.want.w),
      Math.abs(want.got.y + want.got.h - want.want.y - want.want.h),
    )
    if (d > ANCHOR_TOLERANCE) bad.push(`${t}: moved ${d}px`)
  }
  return bad
}
