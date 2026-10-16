import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assetSlug, chooseAssetHome, MAX_IMAGE_BYTES, placeImage, sniffImage, svgUnsafe,
} from '../src/asset.js'

// a real 1×1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])
const SVG = '<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>'

const HERO = `import { useState } from 'react'

export default function Hero() {
  const [n] = useState(0)
  return (
    <section className="p-8">
      <div className="w-full h-48 rounded bg-gray-200 flex items-center justify-center">
        <span className="text-gray-500">Image</span>
      </div>
      <div className="card">
        <h3>Team members</h3>
        <button>Join</button>
      </div>
      <img className="w-12 h-12" src="/old.png" />
      <div className="w-24 h-24" />
      <button className="btn">Go {n}</button>
    </section>
  )
}
`
// line:col of each host element in HERO
const SLOT = 'src/Hero.tsx:7:7'
const CARD = 'src/Hero.tsx:10:7'
const IMG = 'src/Hero.tsx:14:7'
const EMPTY = 'src/Hero.tsx:15:7'
const BUTTON = 'src/Hero.tsx:16:7'

function app(opts: { assets?: boolean; tailwind?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-asset-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src/Hero.tsx'), HERO)
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'x', devDependencies: opts.tailwind === false ? {} : { tailwindcss: '^4' },
  }))
  if (opts.assets) mkdirSync(join(root, 'src/assets'))
  return root
}
const b64 = (b: Buffer | string): string => Buffer.from(b).toString('base64')
const src = (root: string): string => readFileSync(join(root, 'src/Hero.tsx'), 'utf8')

describe('sniffImage', () => {
  it('reads the type from the bytes, not the name', () => {
    expect(sniffImage(PNG)?.ext).toBe('png')
    expect(sniffImage(JPEG)?.ext).toBe('jpg')
    expect(sniffImage(Buffer.from('GIF89a\x01\x00', 'latin1'))?.ext).toBe('gif')
    expect(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))?.ext).toBe('webp')
    expect(sniffImage(Buffer.from(SVG))?.ext).toBe('svg')
    expect(sniffImage(Buffer.from('﻿<svg width="1"></svg>'))?.ext).toBe('svg')
  })
  it('refuses things that are not pictures', () => {
    expect(sniffImage(Buffer.from('%PDF-1.7'))).toBeNull()
    expect(sniffImage(Buffer.from('<html><svg></svg></html>'))).toBeNull()
    expect(sniffImage(Buffer.from('PK\x03\x04', 'latin1'))).toBeNull()
    expect(sniffImage(Buffer.alloc(0))).toBeNull()
  })
})

describe('svgUnsafe', () => {
  it('passes a plain drawing', () => expect(svgUnsafe(SVG)).toBeNull())
  it.each([
    ['<svg><script>alert(1)</script></svg>', 'script'],
    ['<svg onload="x()"></svg>', 'event handler'],
    ['<svg><a href="javascript:x()"/></svg>', 'javascript'],
    ['<svg><foreignObject><div/></foreignObject></svg>', 'foreignObject'],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg/>', 'entities'],
  ])('refuses %s', (text, why) => expect(svgUnsafe(text)).toContain(why))
})

describe('assetSlug', () => {
  it('makes a readable, safe file stem', () => {
    expect(assetSlug('My Logo (final) v2.PNG')).toBe('my-logo-final-v2')
    expect(assetSlug('Café crème.jpeg')).toBe('cafe-creme')
    expect(assetSlug('../../etc/passwd')).toBe('etc-passwd')
    expect(assetSlug('')).toBe('image')
    expect(assetSlug(undefined)).toBe('image')
    expect(assetSlug('🙂.png')).toBe('image')
  })
})

describe('chooseAssetHome', () => {
  it('follows the app: src/assets, then a public images folder, then public/', () => {
    expect(chooseAssetHome(app({ assets: true }))).toEqual({ kind: 'import', dir: 'src/assets' })
    const pub = app()
    mkdirSync(join(pub, 'public/images'), { recursive: true })
    expect(chooseAssetHome(pub)).toEqual({ kind: 'public', dir: 'public/images', urlBase: '/images/' })
    expect(chooseAssetHome(app())).toEqual({ kind: 'public', dir: 'public', urlBase: '/' })
  })
})

describe('placeImage', () => {
  it('fills a placeholder box: the file lands in public/ and the box becomes an <img>', () => {
    const root = app()
    const r = placeImage(root, { srcLoc: SLOT, name: 'Our Logo.png', data: b64(PNG) })
    expect(r.ok).toBe(true)
    expect(r.asset).toMatch(/^public\/our-logo-[0-9a-f]{10}\.png$/)
    expect(readFileSync(join(root, r.asset!)).equals(PNG)).toBe(true)
    const code = src(root)
    const name = r.asset!.slice('public/'.length)
    expect(code).toContain(`<img src="/${name}" alt="our logo" className="w-full h-48 rounded bg-gray-200 flex items-center justify-center object-cover" />`)
    expect(code).not.toContain('>Image<')
    // the rest of the file is untouched
    expect(code).toContain('<h3>Team members</h3>')
  })

  it('in an app with src/assets, imports the picture the way Vite apps do', () => {
    const root = app({ assets: true })
    const r = placeImage(root, { srcLoc: SLOT, name: 'logo.svg', data: b64(SVG) })
    expect(r.ok).toBe(true)
    expect(r.asset).toMatch(/^src\/assets\/logo-[0-9a-f]{10}\.svg$/)
    const code = src(root)
    const file = r.asset!.slice('src/'.length)
    expect(code).toContain(`import logoImg from './${file}'\n\nexport default`)
    expect(code).toContain('<img src={logoImg} alt="logo"')
  })

  it('re-points an existing <img> and keeps its classes', () => {
    const root = app()
    const r = placeImage(root, { srcLoc: IMG, name: 'avatar.jpg', data: b64(JPEG) })
    expect(r.ok).toBe(true)
    expect(r.asset).toMatch(/\.jpg$/)
    expect(src(root)).toMatch(/<img alt="avatar" className="w-12 h-12" src="\/avatar-[0-9a-f]{10}\.jpg" \/>/)
  })

  it('an empty self-closing box is a slot too; without tailwind it gets objectFit inline', () => {
    const root = app({ tailwind: false })
    const r = placeImage(root, { srcLoc: EMPTY, name: 'x.png', data: b64(PNG) })
    expect(r.ok).toBe(true)
    expect(src(root)).toMatch(/<img src="\/x-[0-9a-f]{10}\.png" alt="x" className="w-24 h-24" style=\{\{ objectFit: 'cover' \}\} \/>/)
  })

  it('the same picture twice is one file', () => {
    const root = app()
    const a = placeImage(root, { srcLoc: SLOT, name: 'logo.png', data: b64(PNG) })
    // the first edit moved every line below it; the page re-stamps after HMR, so look again
    const line = src(root).split('\n').findIndex((l) => l.includes('<div className="w-24 h-24" />')) + 1
    const b = placeImage(root, { srcLoc: `src/Hero.tsx:${String(line)}:7`, name: 'renamed.png', data: b64(PNG) })
    expect(b.ok).toBe(true)
    expect(b.reused).toBe(true)
    expect(b.asset).toBe(a.asset)
    expect(readdirSync(join(root, 'public'))).toHaveLength(1)
  })

  it('refuses to replace a box that holds real content, and writes nothing', () => {
    const root = app()
    const r = placeImage(root, { srcLoc: CARD, name: 'x.png', data: b64(PNG) })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not empty: it contains a <h3>/)
    expect(src(root)).toBe(HERO)
    expect(existsSync(join(root, 'public'))).toBe(false)
  })

  it('refuses a button', () => {
    const r = placeImage(app(), { srcLoc: BUTTON, name: 'x.png', data: b64(PNG) })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/<button> is not an image slot/)
  })

  it('refuses non-pictures, unsafe SVGs and oversized files before touching anything', () => {
    const root = app()
    expect(placeImage(root, { srcLoc: SLOT, name: 'x.png', data: b64('%PDF-1.7 nope') }).error).toMatch(/not a picture/)
    expect(placeImage(root, { srcLoc: SLOT, name: 'x.svg', data: b64('<svg onload="x()"/>') }).error).toMatch(/event handler/)
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)])
    expect(placeImage(root, { srcLoc: SLOT, name: 'x.png', data: b64(big) }).error).toMatch(/over 5 MB/)
    expect(placeImage(root, { srcLoc: SLOT, data: '' }).error).toMatch(/no file/)
    expect(src(root)).toBe(HERO)
    expect(existsSync(join(root, 'public'))).toBe(false)
  })

  it('refuses a stale stamp and a path outside the app', () => {
    const root = app()
    expect(placeImage(root, { srcLoc: 'src/Hero.tsx:99:1', data: b64(PNG) }).error).toMatch(/stale stamp/)
    expect(placeImage(root, { srcLoc: '../evil.tsx:1:1', data: b64(PNG) }).error).toMatch(/escapes/)
  })
})
