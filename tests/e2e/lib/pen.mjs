/**
 * The pen, for e2e (s2c-034).
 *
 * The page opens with the pen ON (s2c-010), and Alt+D TOGGLES it. A test that
 * presses Alt+D "to start drawing" therefore pauses the pen: its stroke never
 * lands, and every assert after it checks a sketch that does not exist. That
 * hid in live-misread for a day (s2c-033) and in 12 more files (s2c-034).
 *
 *   await ensureDraw(page)           // the pen is on, whatever it was
 *   const n = await inkCount(page)   // strokes on the ink layer
 *   await assertInk(page, n + 1, 'the scribble')  // the stroke really landed
 */


export const penMode = (page) =>
  page.evaluate(() => document.getElementById('s2c-overlay-host')?.dataset.mode ?? null)

export async function ensureDraw(page) {
  await page.waitForFunction(() => !!document.getElementById('s2c-overlay-host')?.dataset.mode, null, { timeout: 15000 })
  for (let i = 0; i < 3 && (await penMode(page)) !== 'draw'; i++) {
    await page.keyboard.press('Alt+KeyD')
    await page.waitForTimeout(150)
  }
  const m = await penMode(page)
  if (m !== 'draw') throw new Error(`ASSERT: could not turn the pen on (mode: ${m})`)
}

export const inkCount = (page) =>
  page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('ink')?.querySelectorAll('path').length ?? 0)

export async function assertInk(page, atLeast, what = 'the stroke') {
  const n = await inkCount(page)
  if (n < atLeast) throw new Error(`ASSERT: ${what} never landed (ink paths ${n}, expected ≥ ${atLeast}); every check after this would be vacuous`)
  return n
}

