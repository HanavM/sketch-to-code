/**
 * Where a new import line goes, decided from the AST rather than by pattern.
 *
 * Three engines here insert an import: the lasso's extract, the instant render,
 * and placing a library entry. All three used to find the spot with
 * `/^import [^\n]*\n/gm` and take the last match, which is wrong in a way that
 * hides itself completely: a component that DISPLAYS code — a docs page, a
 * changelog, a snippet in a template literal — contains lines that begin with
 * `import`, and the last of those is usually inside the string. The new import
 * then lands in the middle of that string, where:
 *
 *   · the file still parses, so a re-parse guard sees nothing wrong,
 *   · the component is therefore never actually imported, so the page throws
 *     "X is not defined" at runtime, and
 *   · the displayed snippet is silently corrupted as well.
 *
 * Babel already knows exactly which `import` statements are statements. Asking
 * it costs one traversal the callers are already doing.
 */
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'

type TraverseFn = (ast: unknown, visitor: Record<string, unknown>) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

/**
 * Byte offset to insert a new import line at: just after the file's last real
 * import statement, or the very start when it has none.
 *
 * `ast` must be the parse of `code` — offsets from a different parse would aim
 * the insertion at nothing in particular.
 */
export function importAnchor(ast: unknown, code: string): number {
  let end = -1
  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const e = path.node.end
      // the LAST one by position, not by visit order: a file may declare
      // imports below other statements, which is legal and hoisted anyway
      if (e != null && e > end) end = e
    },
  })
  if (end < 0) return 0
  // step past the line ending, so the inserted line starts on its own line
  // rather than welding onto the previous one. CRLF counts as one ending.
  let at = end
  if (code[at] === '\r') at += 1
  if (code[at] === '\n') at += 1
  return at
}
