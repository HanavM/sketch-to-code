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
    out.push({
      sha: e.sha,
      label: typeof e.label === 'string' ? e.label : 'edit',
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
