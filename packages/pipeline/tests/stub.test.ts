/**
 * Creating the endpoint the page is already asking for.
 *
 * The interesting assertions here are not "a file appeared" — they are that the
 * route it writes answers `[]` rather than something invented, that it refuses
 * when a file is already there (because then the request is failing for a
 * different reason and overwriting would destroy the answer), and that a URL
 * arrives in every shape a browser might have reported it.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { stubRoute, isGeneratedRoute } from '../src/stub.js'

const app = (): string => mkdtempSync(join(tmpdir(), 's2c-stub-'))

describe('creating a missing endpoint', () => {
  it('writes a route that answers an empty list', () => {
    const root = app()
    const out = stubRoute(root, { path: '/api/orders' })
    expect(out.ok).toBe(true)
    expect(out.route).toBe('/api/orders')
    expect(out.file).toBe(join('server', 'api', 'orders.ts'))
    const src = readFileSync(join(root, 'server/api/orders.ts'), 'utf8')
    expect(src).toContain('export const orders: unknown[] = []')
    expect(src).toMatch(/export function GET\(\): unknown\[\] \{\n {2}return orders\n\}/)
    // a plain module: nothing to install, and mountable in anything
    expect(src.match(/^import /gm)).toBeNull()
  })

  it('does not invent records, because there is nothing here to infer them from', () => {
    const root = app()
    stubRoute(root, { path: '/api/orders' })
    const src = readFileSync(join(root, 'server/api/orders.ts'), 'utf8')
    // a plausible-looking fake row is worse than an empty list: the page renders,
    // the developer believes it, and the fiction outlives the session
    expect(src).not.toMatch(/id:|name:|Lorem|example\.com|"[A-Z][a-z]+ [A-Z][a-z]+"/)
  })

  it('says where the real data goes, since that is the only line worth editing', () => {
    const root = app()
    const out = stubRoute(root, { path: '/api/orders' })
    expect(out.change).toContain('server/api/orders.ts')
    expect(out.change).toMatch(/put the real data in that file/)
  })

  it('explains in the file why the request was failing so confusingly', () => {
    const root = app()
    stubRoute(root, { path: '/api/orders' })
    const src = readFileSync(join(root, 'server/api/orders.ts'), 'utf8')
    // the whole reason this move exists: a 200 of index.html, not a 404
    expect(src).toContain('index.html')
    expect(src).toContain("Unexpected token '<'")
  })

  it('can answer with an object when the caller knows it is not a list', () => {
    const root = app()
    const out = stubRoute(root, { path: '/api/settings', kind: 'object' })
    expect(out.ok).toBe(true)
    const src = readFileSync(join(root, 'server/api/settings.ts'), 'utf8')
    expect(src).toContain('export const settings: Record<string, unknown> = {}')
    expect(out.change).toContain('an empty object')
  })

  it('marks the file as generated, so the other engines know it is theirs to replace', () => {
    const root = app()
    stubRoute(root, { path: '/api/orders' })
    expect(isGeneratedRoute(readFileSync(join(root, 'server/api/orders.ts'), 'utf8'))).toBe(true)
    expect(isGeneratedRoute('export const orders = []')).toBe(false)
  })

  describe('the URL arrives in whatever shape the page reported it', () => {
    for (const [given, want] of [
      ['/api/orders', 'orders'],
      ['api/orders', 'orders'],
      ['orders', 'orders'],
      ['/api/orders/', 'orders'],
      ['/api/orders?since=1', 'orders'],
      ['/api/orders#frag', 'orders'],
      ['http://localhost:5199/api/orders', 'orders'],
      ['/api/line_items', 'line_items'],
      ['/api/line-items', 'line-items'],
    ] as const) {
      it(`${given} → server/api/${want}.ts`, () => {
        const root = app()
        const out = stubRoute(root, { path: given })
        expect(out.ok).toBe(true)
        expect(out.file).toBe(join('server', 'api', `${want}.ts`))
      })
    }
  })

  describe('refusing', () => {
    it('will not overwrite a route that is already there', () => {
      const root = app()
      mkdirSync(join(root, 'server/api'), { recursive: true })
      writeFileSync(join(root, 'server/api/orders.ts'), 'export function GET() { throw new Error("boom") }')
      const out = stubRoute(root, { path: '/api/orders' })
      expect(out.ok).toBe(false)
      // and it says what is actually wrong, which is not "missing"
      expect(out.error).toContain('already exists')
      expect(out.error).toMatch(/failing for another reason/)
      expect(readFileSync(join(root, 'server/api/orders.ts'), 'utf8')).toContain('boom')
    })

    it('refuses a nested path instead of flattening it into a wrong file', () => {
      const root = app()
      const out = stubRoute(root, { path: '/api/team/members' })
      expect(out.ok).toBe(false)
      expect(out.error).toMatch(/nested path/)
      expect(existsSync(join(root, 'server'))).toBe(false)
    })

    for (const bad of ['/api/', '/api/2fa', '/api/Orders', '/api/or ders', '/api/../etc/passwd', '']) {
      it(`refuses ${JSON.stringify(bad)} and writes nothing`, () => {
        const root = app()
        const out = stubRoute(root, { path: bad })
        expect(out.ok).toBe(false)
        expect(out.error).toBeTruthy()
        expect(existsSync(join(root, 'server'))).toBe(false)
      })
    }
  })
})
