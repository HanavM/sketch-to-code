/**
 * Which run mode the benchmark measures.
 *
 * The bench used to measure whatever the overlay inferred from the ink. That
 * answers "how good is the tool", not the question that decides whether the
 * tool should exist: does reading the ink against the DOM (gesture/design)
 * realize intent more often than handing the model a picture of the tab
 * (screenshot) — which is roughly what annotate-the-preview products send.
 * Same sketches, same scorer, different arm.
 *
 *   auto        what a user gets: the overlay picks gesture or design
 *   gesture     always markup on existing UI
 *   design      always new UI from wireframe shorthand
 *   screenshot  pixels only: no shapes, no DOM, no source locations
 */
export const MODES = /** @type {const} */ (['auto', 'gesture', 'design', 'screenshot'])

/** The overlay's own binding for each override (setRunMode toggles). */
const KEYS = { gesture: 'Alt+g', design: 'Alt+e', screenshot: 'Alt+s' }

/** `--mode` as given, or 'auto'. Anything else is a typo worth stopping for. */
export function parseMode(value) {
  if (value === null || value === undefined || value === true) return 'auto'
  const m = String(value).trim().toLowerCase()
  if (!MODES.includes(m)) {
    throw new Error(`--mode must be one of ${MODES.join(', ')} (got "${String(value)}")`)
  }
  return m
}

/** The key that sets this override, or null for auto (which is no override). */
export function keyFor(mode) {
  return mode === 'auto' ? null : KEYS[mode]
}

/**
 * Chromium flags. Screenshot mode captures the tab with getDisplayMedia,
 * which opens a picker a headless bench cannot click; these accept it for the
 * current tab. The other modes get none, so their runs are unchanged.
 */
export function launchArgs(mode) {
  return mode === 'screenshot'
    ? ['--auto-accept-this-tab-capture', '--use-fake-ui-for-media-stream']
    : []
}

/**
 * Did the overlay end up in the mode we asked for? `state` is
 * __S2C_DEBUG__.runMode(). For auto, any inferred mode is fine but the
 * override must be cleared; for the rest, the override must be exactly it.
 */
export function modeHolds(mode, state) {
  if (!state) return false
  return mode === 'auto' ? state.chosen === 'auto' : state.chosen === mode
}
