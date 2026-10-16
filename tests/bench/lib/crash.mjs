/**
 * When a benchmark page may be tried again, and how long anything may hang.
 *
 * The screenshot arm has two ways to lose a page before anything is paid for
 * (seed2tree s2c-013, s2c-029):
 *
 *   gone    Chromium dies during the tab capture.
 *   wedged  the capture is granted but never shows a frame, so the probe never
 *           returns. Measured in the cloud container on a bare page: 4 of 10
 *           captures wedged when one browser served one page after another,
 *           1 of 20 with a fresh browser per page, 0 of 12 for two captures in
 *           the SAME page of a fresh browser. That is why the screenshot arm
 *           now gets a fresh browser for every page.
 *
 * Both are retried once, and only before Run. After Run the reading may be
 * billed, and a retry could pay twice.
 */

/** Errors that mean "this browser is unusable", not "this page is wrong". */
export const BROWSER_GONE = /Target page, context or browser has been closed|Target crashed|Browser closed|browser has disconnected/i
export const CAPTURE_WEDGED = /tab capture hung|screen capture (timed out|started but never showed a frame|came back with no picture)/i

/** May a page that failed with `message` be tried again? */
export function retryable(message, { pressedRun, alreadyRetried }) {
  if (pressedRun || alreadyRetried) return false
  return BROWSER_GONE.test(message) || CAPTURE_WEDGED.test(message)
}

/** Does this failure mean the browser should be thrown away? */
export function browserSpoiled(message) {
  return BROWSER_GONE.test(message) || CAPTURE_WEDGED.test(message)
}

/** One fresh browser per page? Only where reuse is measured to wedge. */
export function freshBrowserPerPage(mode) {
  return mode === 'screenshot'
}

/**
 * `promise`, or a rejection with `message` after `ms`. page.evaluate has no
 * timeout of its own, so a probe that never settles hung the whole run for
 * ten minutes. The timer is cleared either way so it can't hold node open.
 */
export function withTimeout(promise, ms, message) {
  let timer
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}
