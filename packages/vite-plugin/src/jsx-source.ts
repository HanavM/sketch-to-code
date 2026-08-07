import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import MagicString from 'magic-string'

// @babel/traverse ships CJS; the callable lives on .default under ESM interop.
type TraverseFn = (
  ast: unknown,
  visitor: { JSXOpeningElement: (path: NodePath<t.JSXOpeningElement>) => void },
) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

export interface JsxSourceResult {
  code: string
  map: ReturnType<MagicString['generateMap']>
  count: number
}

/**
 * Stamp every JSX *host* element (lowercase tag: <div>, <button>, …) with
 * data-s2c="<relPath>:<line>:<col>". Build-time stamping is the only reliable
 * route — React 19 removed fiber._debugSource. Components (uppercase) are
 * skipped: their rendered host elements get stamped where they're defined.
 */
export function stampJsxSource(code: string, relPath: string): JsxSourceResult | null {
  let ast
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy'],
      errorRecovery: true,
    })
  } catch {
    return null
  }

  const s = new MagicString(code)
  let count = 0

  traverse(ast, {
    JSXOpeningElement(path) {
      const name = path.node.name
      if (name.type !== 'JSXIdentifier') return // member expressions/namespaces = components
      const first = name.name[0]
      if (!first || first !== first.toLowerCase()) return // uppercase = component
      const loc = path.node.loc
      if (!loc || name.end == null) return
      // skip if already stamped (HMR re-transform)
      if (path.node.attributes.some(
        (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'data-s2c',
      )) return
      s.appendLeft(name.end, ` data-s2c="${relPath}:${loc.start.line}:${loc.start.column + 1}"`)
      count++
    },
  })

  if (count === 0) return null
  return {
    code: s.toString(),
    map: s.generateMap({ hires: true }),
    count,
  }
}
