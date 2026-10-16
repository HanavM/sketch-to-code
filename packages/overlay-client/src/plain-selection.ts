/**
 * Plain-words selection: what the bar says when you click something on your
 * own page, and whether that click was probably meant to USE the page.
 *
 * docs/walkthrough-noncoder.md step 3: a non-coder clicks their "Count is 0"
 * button to see the app work, nothing counts, and the bar reads
 * `button · 120×33 · flex row · src/App.jsx — drag to move, handles to
 * resize`. Every part of that line is for a developer: a tag, pixels, a
 * layout mode, a file path. The person needs three things: what they picked
 * up (in words they would use), what they can do with it now, and — the
 * first time they click something that is meant to be clicked — how to use
 * the page instead.
 *
 * Pure functions over a tiny element description, so the wording rules are
 * testable without a browser. main.ts owns the DOM and the state.
 */

/** The subset of an element the wording reads. */
export interface PlainEl {
  /** lower-case tag name */
  tag: string
  /** `type` attribute, for inputs */
  type?: string | null
  /** ARIA role attribute */
  role?: string | null
  /** has an href (a real link, not a placeholder anchor) */
  href?: boolean
  /** visible text, untrimmed is fine */
  text?: string | null
  /** alt / aria-label / placeholder, whichever exists */
  label?: string | null
}

const TAG_WORDS: Record<string, string> = {
  button: 'button',
  a: 'link',
  img: 'picture',
  picture: 'picture',
  video: 'video',
  svg: 'icon',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  p: 'text',
  span: 'text',
  strong: 'text',
  em: 'text',
  label: 'label',
  ul: 'list',
  ol: 'list',
  li: 'list item',
  form: 'form',
  nav: 'menu bar',
  header: 'header',
  footer: 'footer',
  table: 'table',
  tr: 'table row',
  td: 'table cell',
  th: 'table cell',
  textarea: 'text box',
  select: 'dropdown',
  main: 'page area',
  section: 'section',
  article: 'section',
  aside: 'side panel',
}

const INPUT_WORDS: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'option',
  range: 'slider',
  submit: 'button',
  button: 'button',
  reset: 'button',
  file: 'file picker',
  color: 'colour picker',
  date: 'date picker',
}

const ROLE_WORDS: Record<string, string> = {
  button: 'button',
  link: 'link',
  checkbox: 'checkbox',
  switch: 'switch',
  tab: 'tab',
  menuitem: 'menu item',
  slider: 'slider',
  textbox: 'text box',
}

/** What a person would call this thing. Never a tag name they didn't write. */
export function plainKind(el: PlainEl): string {
  const role = el.role?.toLowerCase().trim()
  if (role && ROLE_WORDS[role]) return ROLE_WORDS[role]!
  if (el.tag === 'input') return INPUT_WORDS[(el.type ?? 'text').toLowerCase()] ?? 'text box'
  return TAG_WORDS[el.tag] ?? 'box'
}

/** Up to `max` characters of what's written on it, quoted; '' when there's nothing short to quote. */
export function plainQuote(el: PlainEl, max = 32): string {
  const raw = (el.text ?? '').replace(/\s+/g, ' ').trim() || (el.label ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  const cut = raw.length > max ? `${raw.slice(0, max - 1).trimEnd()}…` : raw
  return ` “${cut}”`
}

/**
 * Was this thing made to be clicked or typed into? Then a click on it in
 * design was very likely an attempt to USE the page, and the person deserves
 * to be told where that lives. Tag/role based: React handlers aren't visible
 * in the DOM, so a clickable <div> is missed — under-telling is the safe side.
 */
export function isInteractive(el: PlainEl): boolean {
  const role = el.role?.toLowerCase().trim()
  if (role && ['button', 'link', 'checkbox', 'switch', 'tab', 'menuitem', 'slider', 'textbox', 'radio'].includes(role)) {
    return true
  }
  if (el.tag === 'a') return !!el.href
  return ['button', 'input', 'select', 'textarea', 'summary'].includes(el.tag)
}

export interface SelectionLineOpts {
  /** how many copies of it the page renders (a list item, a card in a map) */
  linked?: number
  /** how many things are picked up together (shift+click) */
  setSize?: number
  /** add the one-time "to use it, switch to Test" hint */
  testHint?: boolean
}

/** The line the bar shows when this element is picked up. */
export function selectionLine(el: PlainEl, opts: SelectionLineOpts = {}): string {
  const what = `${plainKind(el)}${plainQuote(el)}`
  const copies = (opts.linked ?? 1) > 1
    ? ` · it appears ${opts.linked} times, changes go to all (double-click: just this one)`
    : ''
  const set = (opts.setSize ?? 1) > 1 ? ` · ${opts.setSize} picked up together` : ''
  const hint = opts.testHint
    ? ' · to use it instead of designing it, switch “✏️ Design” to “▶ Test” in the bar'
    : ''
  return `picked up the ${what}${copies}${set} — drag it to move, pull a corner to resize, drag anywhere else to draw${hint}`
}

/** The line for a picked-up shape (an SVG path etc.), which offers a colour, not handles. */
export function shapeLine(opts: SelectionLineOpts = {}): string {
  const copies = (opts.linked ?? 1) > 1 ? ` · it appears ${opts.linked} times, changes go to all` : ''
  return `picked up a shape${copies} — click a colour to paint it`
}
