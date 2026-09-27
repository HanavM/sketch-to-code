import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  applyResponsive, bandFor, bandOrder, planResponsive, screensFor, utilityFamily,
} from '../src/responsive.js'

const TW = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 }

const mk = (prefix: string, files: Record<string, string> = {}): string => {
  const root = mkdtempSync(join(tmpdir(), `s2c-${prefix}-`))
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

describe('screensFor', () => {
  it('falls back to Tailwind defaults and says so', () => {
    const r = screensFor(mk('screens'))
    expect(r.screens).toEqual(TW)
    expect(r.source).toContain('Tailwind defaults')
  })

  it('theme.screens REPLACES the defaults', () => {
    const root = mk('screens', {
      'tailwind.config.js': `module.exports = {
  theme: { screens: { phone: '480px', tablet: '50rem', desk: '1200px' } },
}\n`,
    })
    const r = screensFor(root)
    expect(r.screens).toEqual({ phone: 480, tablet: 800, desk: 1200 })
    expect(r.source).toContain('tailwind.config.js')
    expect(r.source).toContain('replaces')
  })

  it('theme.extend.screens merges with the defaults', () => {
    const root = mk('screens', {
      'tailwind.config.ts': `import type { Config } from 'tailwindcss'
export default {
  theme: { extend: { screens: { tall: '900px' } } },
} satisfies Config\n`,
    })
    const r = screensFor(root)
    expect(r.screens).toEqual({ ...TW, tall: 900 })
    expect(r.source).toContain('merged')
  })

  it('reads Tailwind v4 @theme breakpoints out of the app CSS', () => {
    const root = mk('screens', {
      'src/index.css': `@import "tailwindcss";\n@theme {\n  --breakpoint-md: 900px;\n  --breakpoint-huge: 120rem;\n}\n`,
    })
    const r = screensFor(root)
    expect(r.screens.md).toBe(900) // the override, not 768
    expect(r.screens.huge).toBe(1920)
    expect(r.screens.sm).toBe(640) // defaults still there
    expect(r.source).toContain('src/index.css')
  })

  it('--breakpoint-*: initial clears the defaults', () => {
    const root = mk('screens', {
      'app.css': `@theme {\n  --breakpoint-*: initial;\n  --breakpoint-wide: 1000px;\n}\n`,
    })
    const r = screensFor(root)
    expect(r.screens).toEqual({ wide: 1000 })
    expect(r.source).toContain('replaces')
  })

  it('refuses to half-read a computed theme — defaults, and it says why', () => {
    const root = mk('screens', {
      'tailwind.config.js': `const base = require('./base')
module.exports = { theme: { screens: { ...base, md: '900px' } } }\n`,
    })
    const r = screensFor(root)
    expect(r.screens).toEqual(TW)
    expect(r.source).toContain('Tailwind defaults')
    expect(r.source).toContain('theme.screens')
  })

  it('a { max: … } band is not a min-width, so it is not read', () => {
    const root = mk('screens', {
      'tailwind.config.js': `module.exports = { theme: { screens: { phone: { max: '480px' } } } }\n`,
    })
    expect(screensFor(root).screens).toEqual(TW)
  })

  it('examples/demo-app: Tailwind v4 with no @theme → the defaults', () => {
    const demo = fileURLToPath(new URL('../../../examples/demo-app', import.meta.url))
    const r = screensFor(demo)
    expect(r.screens).toEqual(TW)
    expect(r.source).toContain('src/index.css')
    expect(r.source).toContain('Tailwind defaults')
  })
})

describe('bandFor', () => {
  it('picks the largest screen the width has reached', () => {
    expect(bandFor(390, TW)).toBe('base')
    expect(bandFor(639, TW)).toBe('base')
    expect(bandFor(640, TW)).toBe('sm')
    expect(bandFor(767, TW)).toBe('sm')
    expect(bandFor(768, TW)).toBe('md')
    expect(bandFor(1439, TW)).toBe('xl')
    expect(bandFor(3000, TW)).toBe('2xl')
  })
  it("honours a project's own screens, not Tailwind's", () => {
    expect(bandFor(700, { phone: 480, desk: 1200 })).toBe('phone')
    expect(bandFor(400, { phone: 480 })).toBe('base')
  })
  it('bandOrder is smallest-first with the unprefixed band in front', () => {
    expect(bandOrder(TW)).toEqual(['base', 'sm', 'md', 'lg', 'xl', '2xl'])
  })
})

describe('utilityFamily', () => {
  it('places everything this repo writes', () => {
    expect(utilityFamily('gap-4')).toBe('gap')
    expect(utilityFamily('gap-x-4')).toBe('gap-x')
    expect(utilityFamily('p-5')).toBe('padding')
    expect(utilityFamily('pt-[13px]')).toBe('padding-top')
    expect(utilityFamily('-ml-10')).toBe('margin-left')
    expect(utilityFamily('w-[300px]')).toBe('width')
    expect(utilityFamily('h-40')).toBe('height')
    expect(utilityFamily('max-w-md')).toBe('max-width')
    expect(utilityFamily('-translate-y-3')).toBe('translate-y')
    expect(utilityFamily('grid-cols-3')).toBe('grid-template-columns')
    expect(utilityFamily('flex-col')).toBe('flex-direction')
    expect(utilityFamily('flex-row-reverse')).toBe('flex-direction')
    expect(utilityFamily('text-lg')).toBe('font-size')
  })
  it('keeps the three things called "flex" apart', () => {
    expect(utilityFamily('flex')).toBe('display')
    expect(utilityFamily('flex-col')).toBe('flex-direction')
    expect(utilityFamily('flex-wrap')).toBe('flex-wrap')
    expect(utilityFamily('flex-1')).toBe('flex')
  })
  it('splits text-* by what its value is', () => {
    expect(utilityFamily('text-sm')).toBe('font-size')
    expect(utilityFamily('text-[15px]')).toBe('font-size')
    expect(utilityFamily('text-slate-500')).toBe('text-color')
    expect(utilityFamily('text-white')).toBe('text-color')
    expect(utilityFamily('text-center')).toBe('text-align')
  })
  it('returns null rather than guessing', () => {
    expect(utilityFamily('truncate')).toBeNull()
    expect(utilityFamily('uppercase')).toBeNull()
    expect(utilityFamily('font-sans')).toBeNull()
    expect(utilityFamily('text-balance')).toBeNull()
    expect(utilityFamily('')).toBeNull()
  })
})

// ── the direction that matters ──────────────────────────────────────────────
describe('planResponsive — demonstrated NARROW (the dangerous direction)', () => {
  it('a flex-row that becomes flex-col on a phone leaves wide screens alone', () => {
    const before = 'flex flex-row items-center gap-6 rounded-xl p-4'
    const r = planResponsive(before, 'flex-col', 'base', TW)
    expect(r.ok).toBe(true)
    // the new value is UNPREFIXED and the old one is pushed up one band —
    // writing `sm:flex-col` here would column-ise every width above 640px
    expect(r.className).toBe('flex flex-col items-center gap-6 rounded-xl p-4 sm:flex-row')
    expect(r.className).not.toContain('sm:flex-col')
    expect(r.change).toBe('flex-col below 640px · flex-row from 640px up (wider screens unchanged)')
  })

  it('with no class pinning the value, the family default holds wide screens', () => {
    const r = planResponsive('flex items-center', 'flex-col', 'base', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toBe('flex items-center flex-col sm:flex-row')
  })

  it('a demonstrated width pushes w-auto up rather than resizing every width', () => {
    const r = planResponsive('rounded shadow', 'w-[300px]', 'base', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toBe('rounded shadow w-[300px] sm:w-auto')
  })

  it('when the next band is already taken, nothing needs pushing', () => {
    const r = planResponsive('flex-row sm:flex-col-reverse', 'flex-col', 'base', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toBe('flex-col sm:flex-col-reverse')
    expect(r.change).toContain('already governs from 640px up')
  })

  it('a same-family class higher up is left to win, and said so', () => {
    const r = planResponsive('flex-row md:flex-col-reverse', 'flex-col', 'base', TW)
    expect(r.ok).toBe(true)
    // md keeps its own value; sm holds the old base value in between
    expect(r.className).toBe('flex-col sm:flex-row md:flex-col-reverse')
    expect(r.change).toContain("'md:flex-col-reverse' still wins from 768px up")
  })

  it('a shorthand doing the work is narrowed, not zeroed', () => {
    // p-4 really does set padding-top, so wide screens must keep pt-4 — pt-0
    // would silently flatten the top padding above 640px
    const r = planResponsive('p-4 rounded', 'pt-8', 'base', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toBe('p-4 rounded pt-8 sm:pt-4')
  })

  it('demonstrating the same value again is a no-op', () => {
    const r = planResponsive('flex flex-col', 'flex-col', 'base', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toBe('flex flex-col')
    expect(r.change).toContain('no change')
  })

  it('state variants are not width variants and are never touched', () => {
    const r = planResponsive('flex-row hover:flex-col md:flex-row', 'flex-col', 'base', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toContain('hover:flex-col')
    expect(r.className?.split(/\s+/)).toContain('flex-col')
    expect(r.className?.split(/\s+/)).toContain('sm:flex-row')
  })
})

describe('planResponsive — demonstrated WIDE (the easy direction)', () => {
  it('prefixes with the band; lower widths keep theirs', () => {
    const r = planResponsive('flex flex-col gap-4', 'flex-row', 'lg', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toBe('flex flex-col gap-4 lg:flex-row')
    expect(r.change).toContain('flex-row from 1024px up')
    expect(r.change).toContain("below 1024px it keeps 'flex-col'")
  })

  it('replaces a same-family class already at that band', () => {
    const r = planResponsive('grid grid-cols-1 gap-6 md:grid-cols-3', 'grid-cols-4', 'md', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toBe('grid grid-cols-1 gap-6 md:grid-cols-4')
    expect(r.change).toBe("md:grid-cols-3 → md:grid-cols-4 from 768px up · below 768px it keeps 'grid-cols-1'")
  })

  it('inserts in ascending band order and leaves higher bands alone', () => {
    const r = planResponsive('flex-row lg:flex-col-reverse', 'flex-col', 'md', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toBe('flex-row md:flex-col lg:flex-col-reverse')
    expect(r.change).toContain("'lg:flex-col-reverse' still wins from 1024px up")
  })

  it('needs no default to fall back on — nothing below changes', () => {
    const r = planResponsive('font-bold', 'text-lg', 'md', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toBe('font-bold md:text-lg')
  })

  it('an unclassifiable utility is still safe to add at a band on its own', () => {
    const r = planResponsive('', 'truncate', 'md', TW)
    expect(r.ok).toBe(true)
    expect(r.className).toBe('md:truncate')
  })
})

describe('planResponsive — refusals', () => {
  it('refuses a family it cannot classify while a conflict is possible', () => {
    const r = planResponsive('overflow-hidden p-2', 'truncate', 'md', TW)
    expect(r.ok).toBe(false)
    expect(r.error).toContain("can't tell which Tailwind family 'truncate'")
  })

  it('refuses when two classes might be the same thing', () => {
    const r = planResponsive('bg-red-500 rounded', 'bg-blue-500', 'base', TW)
    expect(r.ok).toBe(false)
    expect(r.error).toContain("can't tell whether 'bg-red-500' and 'bg-blue-500'")
  })

  it('refuses when the same family is set twice at one width', () => {
    const r = planResponsive('flex flex-row flex-col', 'flex-col-reverse', 'base', TW)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('stylesheet order')
    expect(r.error).toContain("'flex-row'")
  })

  it('refuses a narrow demonstration of an inherited property', () => {
    const r = planResponsive('font-bold', 'text-lg', 'base', TW)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('nothing on this element sets the text size')
    expect(r.error).toContain("'sm:")
  })

  it('refuses a width variant it does not model', () => {
    const r = planResponsive('flex-row max-md:flex-col', 'flex-col-reverse', 'base', TW)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('max-md')
  })

  it('refuses a shorthand pinned at a band of its own', () => {
    const r = planResponsive('md:p-4 rounded', 'pt-8', 'base', TW)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('also sets top padding from 768px up')
  })

  it('refuses a narrow demonstration when the project has no breakpoints', () => {
    const r = planResponsive('flex-row', 'flex-col', 'base', {})
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no breakpoints')
  })

  it('refuses a band this project does not have', () => {
    const r = planResponsive('flex-row', 'flex-col', 'md', { phone: 480 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("'md' is not one of this project's breakpoints (phone)")
  })

  it('refuses a utility that is already prefixed, or is several classes', () => {
    expect(planResponsive('', 'md:flex-col', 'base', TW).error).toContain('already carries a variant')
    expect(planResponsive('', 'flex flex-col', 'base', TW).error).toContain('one utility at a time')
    expect(planResponsive('', '  ', 'base', TW).error).toContain('no utility')
  })
})

describe('applyResponsive', () => {
  const app = (code: string, rel = 'src/Card.tsx'): string => mk('resp', { [rel]: code })

  it('a phone-width demonstration rewrites the className and keeps the file intact', () => {
    const code = `export default function Card() {
  return (
    <article className="flex flex-row items-center gap-6 rounded-xl p-4">
      <span>hi</span>
    </article>
  )
}
`
    const root = app(code)
    const res = applyResponsive(root, { srcLoc: 'src/Card.tsx:3:5', utility: 'flex-col', width: 420 })
    expect(res.ok).toBe(true)
    expect(res.band).toBe('base')
    expect(res.screensSource).toContain('Tailwind defaults')
    expect(res.screens).toEqual(TW)
    const after = readFileSync(join(root, 'src/Card.tsx'), 'utf8')
    expect(after).toContain('className="flex flex-col items-center gap-6 rounded-xl p-4 sm:flex-row"')
    // nothing else in the file moved
    expect(after.replace('flex-col items-center gap-6 rounded-xl p-4 sm:flex-row', 'flex-row items-center gap-6 rounded-xl p-4')).toBe(code)
  })

  it('a wide demonstration lands the band prefix', () => {
    const root = app(`const C = () => <div className="flex flex-col gap-4">x</div>\n`)
    const res = applyResponsive(root, { srcLoc: 'src/Card.tsx:1:17', utility: 'flex-row', width: 1100 })
    expect(res.ok).toBe(true)
    expect(res.band).toBe('lg')
    expect(readFileSync(join(root, 'src/Card.tsx'), 'utf8'))
      .toContain('className="flex flex-col gap-4 lg:flex-row"')
  })

  it("uses the project's own breakpoints when it declares them", () => {
    const root = mk('resp', {
      'tailwind.config.js': `module.exports = { theme: { screens: { phone: '480px', desk: '1200px' } } }\n`,
      'src/Card.tsx': `const C = () => <div className="flex flex-row">x</div>\n`,
    })
    const res = applyResponsive(root, { srcLoc: 'src/Card.tsx:1:17', utility: 'flex-col', width: 500 })
    expect(res.ok).toBe(true)
    // 500px is 'base' under Tailwind's defaults (sm 640) and would have pushed
    // flex-row up a band; under this project's screens it is a WIDE
    // demonstration, so flex-row stays put and the new value is prefixed
    expect(res.band).toBe('phone')
    expect(readFileSync(join(root, 'src/Card.tsx'), 'utf8'))
      .toContain('className="flex flex-row phone:flex-col"')
  })

  it('inserts a className when the element has none', () => {
    const root = app(`const C = () => <div>x</div>\n`)
    const res = applyResponsive(root, { srcLoc: 'src/Card.tsx:1:17', utility: 'w-[300px]', width: 390 })
    expect(res.ok).toBe(true)
    expect(readFileSync(join(root, 'src/Card.tsx'), 'utf8'))
      .toContain('<div className="w-[300px] sm:w-auto">x</div>')
  })

  it('refuses a runtime className and says what to do instead', () => {
    const root = app(`const C = () => <div className={clsx('flex', x && 'flex-row')}>x</div>\n`)
    const res = applyResponsive(root, { srcLoc: 'src/Card.tsx:1:17', utility: 'flex-col', width: 900 })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('built at runtime')
    expect(res.error).toContain('md:flex-col')
    expect(res.band).toBe('md')
  })

  it('reports a stale stamp instead of editing the wrong element', () => {
    const root = app(`const C = () => <div className="flex">x</div>\n`)
    const res = applyResponsive(root, { srcLoc: 'src/Card.tsx:9:9', utility: 'flex-col', width: 900 })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('stale')
  })

  it('rejects a srcLoc that escapes the app root', () => {
    const res = applyResponsive(mk('resp'), { srcLoc: '../../etc/passwd:1:1', utility: 'flex-col', width: 900 })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('escapes the app root')
  })

  it('a refused plan writes nothing', () => {
    const code = `const C = () => <div className="font-bold">x</div>\n`
    const root = app(code)
    const res = applyResponsive(root, { srcLoc: 'src/Card.tsx:1:17', utility: 'text-lg', width: 400 })
    expect(res.ok).toBe(false)
    expect(readFileSync(join(root, 'src/Card.tsx'), 'utf8')).toBe(code)
  })

  it('re-demonstrating the same thing leaves the file byte-identical', () => {
    const code = `const C = () => <div className="flex flex-col sm:flex-row">x</div>\n`
    const root = app(code)
    const res = applyResponsive(root, { srcLoc: 'src/Card.tsx:1:17', utility: 'flex-col', width: 390 })
    expect(res.ok).toBe(true)
    expect(res.change).toContain('no change')
    expect(readFileSync(join(root, 'src/Card.tsx'), 'utf8')).toBe(code)
  })
})
