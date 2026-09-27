/**
 * What a library entry IS — the contract the store and the placer share.
 *
 * The distinction this whole feature rests on: an entry is not a picture of a
 * component, it is a component that already compiles in a repo. So "add this to
 * the page" is an import and a JSX insert — deterministic, free, undoable —
 * rather than a paste. Reusing an entry five times therefore produces five
 * usages of ONE component, which is the opposite of what copying does in a
 * design tool, and the reason the library makes a codebase converge instead of
 * sprawl.
 *
 * Two homes, for a reason that is decidable rather than a preference. An entry
 * whose source has no relative imports is self-contained: it can be written
 * into any project, so it is mirrored to a global library and follows the user
 * between apps. An entry that imports `./Icon` cannot, and pretending otherwise
 * would produce a component that fails to resolve in a project that never had
 * an Icon. `portable` records which, and it is shown rather than inferred
 * silently at placement time.
 */

/** Where an entry came from. Kept because it changes what the thumbnail is. */
export type EntryKind =
  /** Sketched onto the page and turned into code — the aesthetic half. */
  | 'drawn'
  /** Lassoed out of the page into its own component — the structural half. */
  | 'extracted'
  /** Found by indexing components the project already had. */
  | 'scanned'

/** One prop, flattened from what readComponentProps derives out of the types. */
export interface EntryProp {
  name: string
  kind: 'string' | 'number' | 'boolean' | 'enum' | 'other'
  options?: string[]
  required: boolean
}

export interface LibraryEntry {
  /** Filename-safe, time-ordered; also names the thumbnail file. */
  id: string
  /** What to call it in the panel. Defaults to the export name. */
  name: string
  kind: EntryKind
  /** Project-relative file that declares it, as of capture. */
  file: string
  /** Export name, or 'default'. */
  exportName: string
  props: EntryProp[]
  /**
   * The values it was actually used with where it was captured.
   *
   * Better than inventing `title="Title"` at placement: these are values that
   * demonstrably rendered something, in this design, once.
   */
  defaults: Record<string, string>
  /**
   * Composition signature of the entry, for searching the library by drawing a
   * rough shape at it. Opaque numbers here on purpose — composition.ts owns
   * what they mean, and the store must not care.
   */
  signature?: number[]
  /** Thumbnail file inside the library directory, e.g. 'l7x3f2.png'. */
  thumb?: string
  /** No relative imports ⇒ it can be written into any project. */
  portable: boolean
  /**
   * The component's full source, stored ONLY for portable entries, so a global
   * entry can be materialised in a project that has never seen it.
   */
  source?: string
  createdAt: number
  /** How many times it has been placed. The panel sorts by it. */
  usedCount: number
}

/** An entry plus where it was found, since the panel merges two libraries. */
export interface ListedEntry extends LibraryEntry {
  /** 'project' = this repo's own library; 'global' = follows the user. */
  home: 'project' | 'global'
  /**
   * True when a global entry is already present in this project under the same
   * name — the panel says "already here" rather than offering a second copy.
   */
  alreadyHere?: boolean
}

/** Directory names, shared so the store and the plugin agree on one layout. */
export const LIBRARY_DIR = 'library'
export const LIBRARY_INDEX = 'index.json'
