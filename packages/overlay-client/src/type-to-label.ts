/**
 * Type-to-label: the one-word note, made as cheap as the shape it labels.
 *
 * docs/findings.md says words beat marks for content, and the product is "a
 * rough sketch plus a few words". Before this, a word on a just-drawn box cost
 * four steps: move the pointer back onto it, Alt+N, type, Enter. Now the box is
 * the subject by default: draw it, then just start typing. The first printable
 * key opens the note on the shape you just drew, with that key already in it.
 *
 * Pure predicates only — main.ts owns the state and the DOM. Kept here so the
 * rules that decide when a bare key is stolen from the host page are testable
 * without a browser, because getting them wrong breaks someone else's app.
 */

/** The subset of KeyboardEvent the predicate reads. */
export interface LabelKey {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  isComposing?: boolean
}

/**
 * Does this key START a label? A single printable character with no command
 * modifier. Shift is allowed (capitals, "?", "!"). Space is not: it is the
 * page's scroll key, and no label starts with a space anyway. AltGr layouts
 * report ctrl+alt together, so those are excluded with everything else that
 * carries a modifier; Alt+<letter> is the overlay's own keymap.
 */
export function startsLabel(e: LabelKey): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey) return false
  if (e.isComposing) return false
  // 'a', 'A', '7', '$', 'é' — but never 'Enter', 'Tab', 'ArrowUp', 'Dead'.
  // [...] counts code points, so an astral character still counts as one.
  if ([...e.key].length !== 1) return false
  if (/\s/.test(e.key)) return false
  return true
}

/** What the overlay knows at the instant the key arrives. */
export interface LabelState {
  /** 'draw' | 'tweak' | 'preview' | 'running' | … */
  mode: string
  surface: 'design' | 'test'
  /** Id of the stroke type-to-label is armed on, or null. */
  armedStrokeId: string | null
  /** Id of the newest committed stroke, or null when the canvas is empty. */
  lastStrokeId: string | null
  /** Anything else that already owns the keyboard: an open note, a panel,
   *  the command palette, a lasso being named. */
  busy: boolean
}

/**
 * Is type-to-label armed right now?
 *
 * Armed means: the newest thing on the canvas is a stroke you just drew and
 * nothing has happened since. Checking `armedStrokeId === lastStrokeId` makes
 * every disarm automatic: undo pops it, Clear empties it, a new stroke re-arms
 * on itself, and a used label clears `armedStrokeId` so the next key is the
 * host page's again. Outside draw mode on the design surface the page is in
 * use, and its keys are its own.
 */
export function labelArmed(s: LabelState): boolean {
  if (s.busy) return false
  if (s.mode !== 'draw' || s.surface !== 'design') return false
  if (s.armedStrokeId == null) return false
  return s.armedStrokeId === s.lastStrokeId
}
