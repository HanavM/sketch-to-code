/**
 * Behaviour probes: the drawn trigger → effect pair is the acceptance test.
 *
 * The runtime verifier compares two static DOM snapshots. That is enough for
 * "this box moved" and blind to "this button does something": a form that
 * throws its submit away looks exactly like one that saves. A coder reads the
 * diff to tell the difference. A non-coder can't, so the verifier is the only
 * judge they have — and until now it would say "verified" for a dead button.
 *
 * The ink already names the test. A ring on a form says "this form"; an arrow
 * from a button to a region says "clicking this changes that". So a probe is:
 * act on the trigger in the real page, wait for it to settle, and look at the
 * effect — the data store for a save, the region the arrow points at for a
 * click.
 *
 * Probes have side effects, and that is the hard part. The rules, in order:
 *  - the data store (`server/data/`) is snapshotted byte-for-byte before a
 *    probe and put back after it, created files removed (see `guardData`);
 *  - a submit nobody handles would navigate the page away, so the browser
 *    side cancels it and reports it as the failure it is;
 *  - a trigger whose source talks to a host other than the dev server is
 *    never clicked: that probe is `unverified`, never `passed`.
 *
 * This module is pure (no DOM): deriving probes from grounded actions, judging
 * what the browser observed, and the data guard. The browser half lives in
 * overlay-client/src/probe-exec.ts.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { GroundedAction } from './intent2.js'

export type ProbeKind = 'submit' | 'click'

export interface ProbeSpec {
  /** The grounded action this probe tests, or -1 when asked for directly. */
  actionIndex: number
  kind: ProbeKind
  /** Stamped element to act on: any element inside the form, or the trigger. */
  trigger: { srcLoc: string; label: string }
  /** Where the effect must show. Absent for a submit: the form is the region. */
  effect?: { srcLoc: string; label: string }
  /** The claim under test, in words a non-coder can read. */
  claim: string
}

/** What the browser saw. Produced by overlay-client/src/probe-exec.ts. */
export interface ProbeObservation {
  ran: boolean
  /** Why it could not run (trigger not on the page, …). */
  error?: string
  /** Requests the page made while the probe ran. */
  requests: Array<{ method: string; url: string; status: number | null }>
  /** Fingerprints of the effect region before and after. */
  before: string
  after: string
  /** A submit nothing handled: it would have navigated away, and was stopped. */
  unhandledSubmit?: boolean
  /**
   * Click probes: the effect region changed while nobody touched it, before
   * the click (a clock, a countdown, a slideshow). The trigger was not clicked.
   */
  selfChanged?: boolean
  ms: number
}

export interface DataDelta {
  /** Files under server/data/ that the probe created or changed. */
  changed: string[]
  /** True when every byte was put back. */
  restored: boolean
}

export type ProbeStatus = 'passed' | 'failed' | 'unverified'

export interface ProbeVerdict {
  actionIndex: number
  status: ProbeStatus
  /** Plain language, ready to show as is. */
  reason: string
}

const BEHAVIOUR = /\b(shows?|hides?|toggles?|reveals?|opens?|closes?|dismiss(es)?|expands?|collapses?|filters?|sorts?|switch(es)?|adds?\s+(a\s+)?(row|item|entry|card|one)|removes?\s+(the\s+)?(row|item|entry|card)|counts?|increments?|appears?|disappears?|when\s+clicked|on\s+click)\b/i
const CLICKABLE = new Set(['button', 'a', 'summary', 'input', 'label'])

const labelOf = (t: { text?: string; subtreeText?: string; tag: string }): string => {
  const words = (t.text || t.subtreeText || '').trim().replace(/\s+/g, ' ')
  return words ? `"${words.slice(0, 40)}"` : `the ${t.tag}`
}

/**
 * Which actions carry a testable behaviour, and how to test each.
 *
 * - `save`: the target is inside a form; submitting it must store a record
 *   and the page must say so.
 * - an action with a trigger (target) and an effect (dest) whose words name a
 *   behaviour — "shows", "toggles", "adds a row" — on a clickable trigger:
 *   clicking the trigger must change the effect region. This is the arrow
 *   from a button to a region. A plain move arrow names no behaviour and is
 *   left to the static verifier, which already checks it.
 */
export function deriveProbes(actions: GroundedAction[]): ProbeSpec[] {
  const out: ProbeSpec[] = []
  actions.forEach((a, i) => {
    const t = a.targets[0]
    if (!t?.srcLoc) return
    if (a.kind === 'save') {
      out.push({
        actionIndex: i, kind: 'submit',
        trigger: { srcLoc: t.srcLoc, label: 'the form' },
        claim: 'submitting the form stores what was typed, and the page says so',
      })
      return
    }
    if (a.kind === 'move' || a.kind === 'swap' || a.kind === 'delete') return
    const words = [a.instruction, ...(a.notes ?? [])].join(' ')
    if (!a.dest?.srcLoc || !BEHAVIOUR.test(words)) return
    if (!CLICKABLE.has(t.tag.toLowerCase())) return
    out.push({
      actionIndex: i, kind: 'click',
      trigger: { srcLoc: t.srcLoc, label: labelOf(t) },
      effect: { srcLoc: a.dest.srcLoc, label: labelOf(a.dest) },
      claim: `clicking ${labelOf(t)} changes ${labelOf(a.dest)}`,
    })
  })
  return out
}

/**
 * Never click a trigger whose code reaches off the dev server.
 *
 * Scoped to the component file the trigger is stamped in — that is where its
 * handler lives in every app this tool edits. Absolute URLs to the page's own
 * origin are fine; anything else (a payment API, an analytics beacon, a mail
 * service) is a side effect a probe has no business causing.
 */
export function unsafeReason(source: string, devOrigin?: string): string | null {
  const re = /\b(fetch|axios(?:\.\w+)?|navigator\.sendBeacon|new\s+WebSocket|new\s+EventSource)\s*\(\s*[`'"](\w+:\/\/[^`'"/]+)/g
  for (const m of source.matchAll(re)) {
    const host = m[2]!
    if (devOrigin && host === devOrigin) continue
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) continue
    return `its code calls ${host}, which is not this dev server, so it was not clicked`
  }
  if (/\b(window\.)?location\s*(\.href)?\s*=|location\.(assign|replace)\(/.test(source)) {
    return 'its code navigates away from the page, so it was not clicked'
  }
  return null
}

/** Judge one probe from what the browser saw and what landed on disk. */
export function judgeProbe(spec: ProbeSpec, obs: ProbeObservation, data: DataDelta): ProbeVerdict {
  const v = (status: ProbeStatus, reason: string): ProbeVerdict => ({
    actionIndex: spec.actionIndex, status,
    reason: data.restored ? reason : `${reason} (and the test data could not be fully put back: check server/data/)`,
  })
  if (!obs.ran) return v('unverified', `couldn't test it: ${obs.error ?? 'the probe did not run'}`)
  const changed = obs.before !== obs.after
  const sent = obs.requests.filter((r) => r.method !== 'GET')
  if (spec.kind === 'submit') {
    if (obs.unhandledSubmit) {
      return v('failed', 'submitting the form does nothing with what was typed: nothing handles the submit, so the page would just reload')
    }
    if (sent.length === 0) {
      return v('failed', 'submitting the form sends what was typed nowhere, so it is thrown away')
    }
    const bad = sent.find((r) => r.status == null || r.status >= 400)
    if (bad) {
      return v('failed', `submitting the form sent it to ${bad.method} ${pathOf(bad.url)}, which answered ${bad.status ?? 'nothing'}, so nothing was stored`)
    }
    if (data.changed.length === 0) {
      return v('failed', `submitting the form reached ${pathOf(sent[0]!.url)} but nothing was stored`)
    }
    if (!changed) {
      return v('failed', 'a test submit was stored, but the page does not say so, so someone filling it in can\'t tell it worked')
    }
    return v('passed', `a test submit was stored in ${data.changed.join(', ')} and the page said so (the test record was removed again)`)
  }
  // click
  if (obs.selfChanged) {
    return v('unverified', `couldn't test it: ${spec.effect?.label ?? 'the region you pointed at'} changes by itself (a clock, a countdown or a slideshow in it), so a click on ${spec.trigger.label} can't be told apart from that. Point the arrow at the part that should change, not the part that ticks`)
  }
  if (!changed) return v('failed', `clicking ${spec.trigger.label} changed nothing in ${spec.effect?.label ?? 'the region you pointed at'}`)
  return v('passed', `clicking ${spec.trigger.label} changed ${spec.effect?.label ?? 'the region you pointed at'}`)
}

const pathOf = (url: string): string => {
  try { return new URL(url, 'http://x').pathname } catch { return url }
}

// ── the data guard ───────────────────────────────────────────────────────

export const DATA_DIR = 'server/data'

export interface DataSnapshot {
  files: Map<string, Buffer>
  /** Whether server/data/ existed at all: a probe that creates it removes it. */
  dirExisted: boolean
}

const walk = (dir: string, out: string[] = []): string[] => {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** Every byte under server/data/, keyed by repo-relative path. */
export function snapshotData(root: string): DataSnapshot {
  const files = new Map<string, Buffer>()
  for (const p of walk(join(root, DATA_DIR))) files.set(relative(root, p), readFileSync(p))
  return { files, dirExisted: existsSync(join(root, DATA_DIR)) }
}

/**
 * Put server/data/ back exactly as `snap` had it, and say what had changed.
 *
 * Files the probe created are deleted (and the directory too, if the probe
 * created it); changed files get their old bytes back.
 */
export function restoreData(root: string, snap: DataSnapshot): DataDelta {
  const changed: string[] = []
  let restored = true
  const now = walk(join(root, DATA_DIR))
  for (const p of now) {
    const rel = relative(root, p)
    const old = snap.files.get(rel)
    const cur = readFileSync(p)
    if (old && old.equals(cur)) continue
    changed.push(rel)
    try {
      if (old) writeFileSync(p, old)
      else rmSync(p)
    } catch { restored = false }
  }
  for (const [rel, bytes] of snap.files) {
    const p = join(root, rel)
    if (existsSync(p)) continue
    changed.push(rel)
    try {
      mkdirSync(join(p, '..'), { recursive: true })
      writeFileSync(p, bytes)
    } catch { restored = false }
  }
  if (!snap.dirExisted && existsSync(join(root, DATA_DIR))) {
    // the probe made the directory; leave the tree as it was
    try { rmSync(join(root, DATA_DIR), { recursive: true }) } catch { /* harmless */ }
  }
  return { changed: changed.sort(), restored }
}

/** Run `fn` with server/data/ guarded: whatever it writes there is undone. */
export async function guardData<T>(root: string, fn: () => Promise<T>): Promise<{ value: T; data: DataDelta }> {
  const snap = snapshotData(root)
  try {
    const value = await fn()
    return { value, data: restoreData(root, snap) }
  } catch (err) {
    restoreData(root, snap)
    throw err
  }
}
