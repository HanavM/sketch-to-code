/**
 * The undo stack, on disk.
 *
 * It lived only in the dev server's memory, so restarting `vite` — which a
 * non-coder does whenever something looks stuck — silently emptied it, and
 * Ctrl+Z did nothing. SEED done #4 promises one-key undo when a sketch is
 * misread; a promise that a restart breaks is not one.
 *
 * Stored in .sketch2code/ (the agent is denied that folder, see codegen.ts).
 * Every load is validated: this file is read back into `git restore --source`,
 * so anything that isn't a plain object id is dropped rather than trusted.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface UndoEntry {
  sha: string
  label: string
  untracked: string[]
  after: string[] | null
  /**
   * The files this edit wrote, taken the moment it finished (s2c-026). Undo
   * reverts only these. Without it undo restored EVERY file that differed from
   * the checkpoint, so a hand change to any other file made after the edit was
   * silently thrown away too. Null for entries written before it existed: undo
   * falls back to the old behaviour, guarded by undoReason.
   */
  touched?: string[] | null
}

/** Entries kept. History keeps 50 too, and every checkpoint is pinned (safety.ts). */
export const MAX_UNDO = 50

export const undoFile = (root: string): string => join(root, '.sketch2code', 'undo.json')

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

export function loadUndo(root: string): UndoEntry[] {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(undoFile(root), 'utf8'))
  } catch {
    return [] // missing or corrupt: start empty, same as before this existed
  }
  const list = (raw as { entries?: unknown } | null)?.entries
  if (!Array.isArray(list)) return []
  const out: UndoEntry[] = []
  for (const e of list as Array<Record<string, unknown>>) {
    if (!e || typeof e.sha !== 'string' || !SHA.test(e.sha)) continue
    if (!strings(e.untracked)) continue
    if (e.after !== null && !strings(e.after)) continue
    const touched = strings(e.touched) ? e.touched : null
    out.push({
      touched,
      sha: e.sha,
      label: typeof e.label === 'string' ? plainLabel(e.label) : 'an earlier change',
      untracked: e.untracked,
      after: e.after as string[] | null,
    })
  }
  return out.slice(-MAX_UNDO)
}

/** Write atomically (tmp + rename) so a crash mid-write can't corrupt it. */
export function saveUndo(root: string, entries: UndoEntry[]): void {
  try {
    const file = undoFile(root)
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, entries: entries.slice(-MAX_UNDO) }, null, 2))
    renameSync(tmp, file)
  } catch { /* undo still works for this session; only the restart loses it */ }
}

/**
 * What Ctrl+Z says it undid after a sketch run (s2c-045). It used to say
 * "↩ undid: sketch run", developer words on the one line a non-coder reads
 * when they change their mind. A run that went as drawn already has a plain
 * sentence ("Done: added "testimonials" where you drew it."), so undo reuses
 * what it did; anything else is "your last sketch". Never a file or an id.
 */
export function runUndoLabel(
  explanation: { problem?: boolean; sentence?: string } | null | undefined,
  stopped = false,
): string {
  if (stopped) return 'your last sketch (stopped part way)'
  const m = explanation && explanation.problem === false
    ? /^\s*(?:✓\s*)?Done:\s*(.+?)[.\s]*$/.exec(explanation.sentence ?? '')
    : null
  return m && m[1] ? m[1] : 'your last sketch'
}

/**
 * Every edit that is not a sketch run, as Ctrl+Z says it (s2c-046).
 *
 * Each engine's `change` string is written for the developer summary
 * ("+ w-64 h-12", "fill: #111 → #ef4444", "instant PricingCard", "moved child
 * 2 → position 1"), and it was pushed straight onto the undo stack, so the
 * one line a non-coder reads after changing their mind was Tailwind classes
 * and hex codes. The label is chosen by WHAT KIND of edit it was, never built
 * from the engine's string; the only free text allowed in is a component's
 * name, split into words.
 */
export type EditKind =
  | 'instant' | 'paint' | 'image' | 'extract' | 'endpoint' | 'form' | 'data-real'
  | 'place' | 'restore' | 'setting' | 'data-move' | 'manipulate' | 'responsive'

/** "PricingCard" -> "pricing card"; anything that isn't a plain name -> ''. */
export function nameWords(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  // a path, or an element id ("e12") that the walkthrough's jargon list flags
  if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(n) || /^[a-z]{1,2}\d+$/i.test(n)) return ''
  return n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase()
}

const MANIP: Record<string, string> = {
  move: 'moved that part', resize: 'resized that part', reorder: 'changed the order',
  w: 'changed the width', h: 'changed the height', gap: 'changed the spacing',
  'translate-x': 'moved that part', 'translate-y': 'moved that part',
}

export function editLabel(kind: EditKind, info: { name?: string | null; prop?: string } = {}): string {
  const name = nameWords(info.name)
  switch (kind) {
    case 'instant': return name ? `added the ${name} you drew` : 'added what you drew'
    case 'paint': return 'changed the colour you painted'
    case 'image': return 'put in the picture'
    case 'extract': return name ? `made the ${name} a reusable piece` : 'made that part a reusable piece'
    case 'endpoint': return 'set up the server for that part'
    case 'form': return 'made the form keep what people type'
    case 'data-real': return 'made the list load from the server'
    case 'place': return name ? `put the ${name} on the page` : 'put that piece on the page'
    case 'restore': return 'went back to an earlier version'
    case 'setting': return 'changed a setting on that part'
    case 'data-move': return 'moved the data you dragged'
    case 'responsive': return `${MANIP[info.prop ?? ''] ?? 'changed the spacing'} at this screen size only`
    case 'manipulate': {
      const p = info.prop ?? ''
      return MANIP[p] ?? (/^m[trbl]?$/.test(p) ? 'moved that part' : 'changed the spacing')
    }
  }
}

/**
 * Words only a developer reads. A label saved by an older version (still in
 * .sketch2code/undo.json after an upgrade) that carries any of them is shown
 * as "an earlier change" rather than as classes or a file name.
 */
const DEV_WORDS = /\bsrc\/|\w\/\w|\.(?:jsx?|tsx?|css|json|png|jpe?g|gif|svg|webp)\b|#[0-9a-f]{3,8}\b|→|^\+ |\b(?:instant|extract|placed|scrubbed|className|props?|child \d)\b|[{}[\]<>`]|:\s*none\b|\bw-\d|\bh-\d|\b[mp][trblxy]?-\d/i
export function plainLabel(label: string): string {
  return DEV_WORDS.test(label) || /^edit$|^sketch run$/.test(label.trim()) ? 'an earlier change' : label
}
