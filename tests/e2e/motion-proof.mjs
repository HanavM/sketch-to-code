/**
 * Goal loop n14: proof you can watch. One GIF per gesture plus a frame-timing
 * report page.
 *
 *   1. Films mixed-ten.mjs (ten mixed edits, then ten undos) with
 *      S2C_RECORD, slowed down (900 ms between gestures) so each one can be
 *      seen landing. A red dot shows the pointer.
 *   2. Cuts one GIF per gesture from the film: erase, add, move, reorder,
 *      resize, recolour, undo. Each GIF is cropped to the part of the page
 *      that changed (found by diffing its first and last frames).
 *   3. Writes docs/motion/REPORT.md: a table per gesture from the measured
 *      runs in docs/motion/*.json (time to visible, frames, fps, p95 frame
 *      gap), with the GIFs inline.
 *
 * Timings in the report come from the UNFILMED runs: on a 2-core sandbox the
 * video encoder takes frames from the page, so the filmed run's own frame
 * stats are listed separately and are a floor, not the real cadence.
 *
 * Usage: node tests/e2e/motion-proof.mjs [--rec <dir with mixed-ten.webm + marks.json>]
 *   S2C_CHROMIUM as for the other e2es. Writes docs/motion/proof/*.gif.
 */
import { spawnSync, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = new URL('../../', import.meta.url).pathname
const OUT = `${ROOT}docs/motion/`
const GIFS = `${OUT}proof/`
const log = (...a) => console.log('[motion-proof]', ...a)
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }

let rec = arg('--rec')
if (!rec) {
  rec = mkdtempSync(join(tmpdir(), 's2c-proof-'))
  log('filming mixed-ten into', rec)
  // keep the unfilmed run's JSON: the filmed one overwrites it
  const keep = existsSync(`${OUT}mixed-ten.json`) ? readFileSync(`${OUT}mixed-ten.json`) : null
  const r = spawnSync('node', [`${ROOT}tests/e2e/mixed-ten.mjs`], {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, S2C_RECORD: rec, S2C_RECORD_W: '800', S2C_GAP_MS: '1600', S2C_UNDO_GAP_MS: '900' },
  })
  if (keep) writeFileSync(`${OUT}mixed-ten.json`, keep)
  if (!existsSync(join(rec, 'marks.json'))) throw new Error(`filming failed (exit ${r.status})`)
}
const video = join(rec, 'mixed-ten.webm')
const marks = JSON.parse(readFileSync(join(rec, 'marks.json'), 'utf8'))
const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', video]).toString().trim().split(',').map(Number)
const [VW, VH] = probe

/** One raw RGB frame at time t (s). */
const frameAt = (t) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(Math.max(0, t)), '-i', video, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: VW * VH * 4 })
/** The box that changed between two times, padded, at least minW x minH, even-sized. */
const changedBox = (a, z, minW = 480, minH = 300, pad = 60) => {
  const p = frameAt(a), q = frameAt(z)
  let x0 = VW, y0 = VH, x1 = -1, y1 = -1
  // the bottom band is the toolbar, whose status line changes on every edit
  for (let y = 0; y < VH - 64; y++) for (let x = 0; x < VW; x++) {
    const i = (y * VW + x) * 3
    if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 60) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: VW, h: VH }
  let w = Math.max(minW, x1 - x0 + 2 * pad), h = Math.max(minH, y1 - y0 + 2 * pad)
  w = Math.min(VW, w); h = Math.min(VH, h)
  let x = Math.round((x0 + x1) / 2 - w / 2), y = Math.round((y0 + y1) / 2 - h / 2)
  x = Math.max(0, Math.min(VW - w, x)); y = Math.max(0, Math.min(VH - h, y))
  const even = (n) => n - (n % 2)
  return { x: even(x), y: even(y), w: even(w), h: even(h) }
}
const cut = (name, from, to, crop) => {
  const file = `${GIFS}${name}.gif`
  const vf = `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},fps=25,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', from.toFixed(2), '-t', (to - from).toFixed(2), '-i', video, '-filter_complex', vf, '-loop', '0', file])
  return { file: `proof/${name}.gif`, kb: Math.round(statSync(file).size / 1024), seconds: +(to - from).toFixed(1), crop }
}

mkdirSync(GIFS, { recursive: true })
// the first edit of each kind of gesture, plus one undo
const want = [
  ['erase', /^erase stat card/], ['add', /^add nav link/], ['reorder', /^reorder card/], ['move', /^move form/],
  ['resize', /^resize card/], ['recolour', /^recolour "Team/],
]
const clips = []
for (const [key, re] of want) {
  const i = marks.edits.findIndex((m) => re.test(m.name))
  if (i < 0) { log(`no ${key} edit in the film`); continue }
  const e = marks.edits[i], next = marks.edits[i + 1]?.startMs ?? marks.undos[0].ms
  const from = e.startMs / 1000 - 0.2, to = Math.min(e.releaseMs / 1000 + 1.5, next / 1000 + 0.1)
  const crop = changedBox(from, to)
  clips.push({ key, name: e.name, visibleMs: e.visibleMs, ...cut(key, from, to, crop) })
}
{
  // all ten undos in one clip: the page walks back to the start
  const u = marks.undos
  const from = u[0].ms / 1000 - 0.3, to = u.at(-1).ms / 1000 + 1.4
  clips.push({ key: 'undo', name: `ten undos (${u.map((x) => x.undid).filter(Boolean).length} named)`, visibleMs: null, ...cut('undo', from, to, { x: 0, y: 0, w: VW - (VW % 2), h: VH - (VH % 2) }) })
}
for (const c of clips) log(`${c.key}: ${c.file} ${c.kb} kB, ${c.seconds} s, crop ${c.crop.w}x${c.crop.h}`)
writeFileSync(`${GIFS}clips.json`, JSON.stringify({ clips, filmed: marks }, null, 1))

// ---- report ----------------------------------------------------------------
const J = (f) => { try { return JSON.parse(readFileSync(`${OUT}${f}`, 'utf8')) } catch { return null } }
const ms = (v) => v == null ? '–' : `${Number(v).toFixed(0)} ms`
const mixed = J('mixed-ten.json')
const rows = []
const fr = (f) => f ? `${f.frames} | ${f.fps} | ${f.p50} / ${f.p95} ms` : '– | – | –'
const lines = [
  '# Motion proof: every gesture, filmed and timed',
  '',
  `Generated by \`node tests/e2e/motion-proof.mjs\` (goal loop n14) on ${new Date().toISOString().slice(0, 10)}. The demo app, headless Chromium, no model calls (every edit is written to the code by a codemod).`,
  '',
  'How to read it: **visible** is the time from letting go (pen lift or mouse release; for drags, the first move) to the first animation frame where the page, or the dragged element under the pointer, has changed. **Frames / fps / gap** are the browser\'s own animation frames over the second after the gesture: 60 fps is a 16.7 ms gap.',
  '',
  '## Watch it',
  '',
  'Each GIF is a slice of one continuous run (ten edits back to back, then ten undos), cropped to the part of the page that moved. The red dot is the pointer. The film is slowed to 1.6 s between gestures (0.9 s between undos) so each one can be seen; the timed run below has 0.25 s.',
  '',
]
for (const c of clips) {
  lines.push(`### ${c.key[0].toUpperCase()}${c.key.slice(1)}: ${c.name}`, '', `![${c.key}](${c.file})`, '')
}
if (mixed) {
  lines.push('## Frame timing: ten mixed edits in a row (unfilmed run)', '',
    `${mixed.summary.edits} edits in ${(mixed.summary.totalMs / 1000).toFixed(1)} s, ${mixed.summary.committed} drags + ${mixed.summary.direct} pen edits written to code, ${mixed.summary.modelCalls} model calls. ${mixed.summary.pass ? 'All checks passed.' : `Issues: ${mixed.summary.issues.join('; ')}`}`, '',
    'A card dragged out of a row that clips its content travels as a lifted copy under the pointer (the card itself dims in place); that copy is what you see move first, and the row reflows once the pointer reaches another slot.', '',
    '| Edit | Visible | Shows first | Frames (1 s) | fps | gap p50 / p95 |', '|---|---|---|---|---|---|')
  const shown = (e) => e.shown === 'lifted copy' ? `lifted copy (row reflows at ${ms(e.pageMovedMs)}, on reaching slot 3)` : (e.shown ?? '–')
  for (const e of mixed.edits) lines.push(`| ${e.name} | ${ms(e.visibleMs)} | ${shown(e)} | ${fr(e.frames)} |`)
  lines.push('', '| Undo | Visible | Frames | fps | gap p50 / p95 |', '|---|---|---|---|---|')
  mixed.undo.rows.forEach((u, i) => lines.push(`| ${i + 1}. ${mixed.undo.log.filter((x) => !x.preview)[i]?.undid ?? ''} | ${ms(u.visibleMs)} | ${fr(u.frames)} |`))
  lines.push('')
}
const er = J('erase-frames.json'), ro = J('reorder-frames.json'), rs = J('resize-frames.json'), ar = J('add-recolour-frames.json'), sp = J('shared-plane.json')
lines.push('## Per-gesture motion runs', '', 'From the single-gesture e2es (`motion-erase`, `motion-reorder`, `motion-resize`, `motion-add-recolour`), as last written to docs/motion.', '', '| Gesture | Visible | Motion | Frame gap p50 / p95 / max |', '|---|---|---|---|')
const gaps = (f) => f ? `${f.p50.toFixed(1)} / ${f.p95.toFixed(1)} / ${f.max.toFixed(1)} ms` : '–'
if (er) lines.push(`| Erase (scribble) | ${ms(er.liftToVisibleMs)} | fades over ${er.fadeFrames} frames, neighbour glides ${er.glidePx} px over ${er.glideFrames} frames | ${gaps(er.frames)} |`)
if (ro) lines.push(`| Drag to reorder | ${ms(ro.msToReflow)} into the drag | row reflows live, glides over ${ro.dragGlide} frames, held until the code lands | ${gaps(ro.frames)} |`)
if (rs) lines.push(`| Resize by edge | ${ms(rs.msToReflow)} into the pull | page reflows live; code height ${rs.codeH} px = dragged ${rs.dragged} px | ${gaps(rs.frames)} |`)
if (ar) lines.push(`| Add (caret + word) | ${ms(ar.add?.liftToGhostMs)} | grows in, neighbour glides | ${gaps(ar.frameStats)} |`)
if (ar) lines.push(`| Recolour (ring) | ${ms(ar.recolour?.liftToChangeMs)} | colour eases over ${ar.recolour?.easedThrough} frames | ${gaps(ar.frameStats)} |`)
lines.push('')
if (sp) lines.push('## Shared plane', '', `${sp.summary.matchedClean}/${sp.summary.edits} scripted edits landed in code matching what was already on screen, with no flash or jump (\`tests/e2e/shared-plane.mjs\`).`, '')
lines.push('## The filmed run', '',
  'Frame stats while filming are lower because the video encoder shares the 2 CPU cores with the page; they are listed so nothing is hidden.', '',
  '| Edit | Visible | Frames (1 s) | fps | gap p50 / p95 |', '|---|---|---|---|---|')
for (const e of marks.edits) lines.push(`| ${e.name} | ${ms(e.visibleMs)} | ${fr(e.frames)} |`)
lines.push('', '## Re-run it yourself', '', '```sh', 'npm ci && npm run build',
  'export S2C_CHROMIUM=/path/to/chromium   # optional',
  'node tests/e2e/mixed-ten.mjs            # timed run -> docs/motion/mixed-ten.json',
  'node tests/e2e/motion-proof.mjs         # film + GIFs + this page', '```', '')
writeFileSync(`${OUT}REPORT.md`, lines.join('\n'))
log(`wrote ${OUT}REPORT.md and ${clips.length} GIFs`)
