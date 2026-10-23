import { describe, expect, it } from 'vitest'
import { leanRepairNote, touchedFiles } from '../src/repair-brief.js'

describe('a repair turn is told where the page is and to fix it without investigating', () => {
  const e4Build = ['Glob', 'Read src/App.tsx', 'Glob', 'Read src/index.css', 'Read src/main.tsx',
    'Read s2c-bench-app/package.json', 'Grep', 'Write src/App.tsx', 'Glob']
  it('lists the files the session wrote or edited, once each, never node_modules', () => {
    expect(touchedFiles(e4Build)).toEqual(['src/App.tsx'])
    expect(touchedFiles(['Write src/A.tsx', 'Edit src/B.tsx', 'Edit src/A.tsx', 'Edit node_modules/x/y.css']))
      .toEqual(['src/A.tsx', 'src/B.tsx'])
  })
  it('names the file and forbids looking up defaults', () => {
    const note = leanRepairNote(e4Build)
    expect(note).toContain('src/App.tsx')
    expect(note).toMatch(/Do not Grep or Glob/)
    expect(note).toMatch(/node_modules/)
    expect(note).toMatch(/do not open index.html, package.json or any vite/)
  })
  it('still asks for a lean repair when nothing was written', () => {
    const note = leanRepairNote([])
    expect(note).not.toContain('The page you built is in')
    expect(note).toMatch(/^HOW TO REPAIR: Each failure/)
  })
})
