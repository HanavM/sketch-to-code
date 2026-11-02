import { describe, expect, it } from 'vitest'
import { besideSentence } from '@s2c/ink'
import { proseNumber, statOf } from '../src/statcard.js'
import { endPair } from '../src/endpair.js'
import { barLabelSide } from '../src/textplace.js'
import { directionStrings, nameList, typedCopyBrief } from '../src/typedcopy.js'
import { statClause, verifyStats } from '../src/statcard.js'
import type { ShapeMark } from '../src/shapemark.js'

const btn = { x: 60, y: 790, w: 240, h: 56 }

describe('a short range stays one label (n246)', () => {
  it('reads "8 to 2" as words, never a stat', () => {
    for (const n of ['8 to 2', '10 to 4', '4 to 10', '9am to 5pm', '8 - 2']) {
      expect(statOf([n]), n).toBeNull()
    }
    expect(proseNumber('8 to 2')).toBe(true)
  })
  it('leaves a real stat alone', () => {
    expect(statOf(['Up to 40 users'])).not.toBeNull()
    expect(proseNumber('78 big, sleep score')).toBe(false)
  })
})

describe('a stat keeps all its words in typed order (n246)', () => {
  it('keeps the unit on the value', () => {
    expect(statOf(['Download now, 412 Mbps big white bold'])?.value).toBe('412 Mbps')
    expect(statOf(['Upload, 38 Mbps big bold, white'])?.value).toBe('38 Mbps')
    expect(endPair('Speed, 412 Mbps')?.value).toBe('412 Mbps')
  })
  it('words typed first read above the number', () => {
    expect(statOf(['Download now, 412 Mbps big white bold'])).toEqual({ value: '412 Mbps', label: 'Download now', labelAbove: true })
    expect(statOf(['Upload, 38 Mbps big bold, white'])?.labelAbove).toBe(true)
  })
  it('a number typed first still reads above its label', () => {
    expect(statOf(['78 big, sleep score'])).toEqual({ value: '78', label: 'sleep score' })
    expect(statOf(['6 big, on loan grey'])?.labelAbove).toBeUndefined()
  })
  it('a sentence with a comma is no stat', () => {
    expect(statOf(['Friday was your shortest night, 4 hours 20.'])).toBeNull()
    expect(statOf(['Set a bedtime dark bold', 'Friday was your shortest night, 4 hours 20.'])).toBeNull()
  })
})

describe('a sentence beside a box stays beside it (n246)', () => {
  const s = 'Friday was your shortest night, 4 hours 20.'
  it('typed outside the box is text at that spot', () => {
    expect(besideSentence(s, { x: 330, y: 815 }, [btn])).toBe(true)
  })
  it('typed on or at the edge of the box stays the box\'s', () => {
    expect(besideSentence(s, { x: 200, y: 815 }, [btn])).toBe(false)
    expect(besideSentence(s, { x: 306, y: 815 }, [btn])).toBe(false)
  })
  it('a line takes its words as before', () => {
    expect(besideSentence(s, { x: 330, y: 815 }, [{ x: 320, y: 800, w: 400, h: 2 }])).toBe(false)
  })
  it('short words and instructions are still about the mark', () => {
    expect(besideSentence('Set a bedtime', { x: 330, y: 815 }, [btn])).toBe(false)
    expect(besideSentence('Make this one much bigger.', { x: 330, y: 815 }, [btn])).toBe(false)
    expect(besideSentence('Sign up now.', { x: 330, y: 815 }, [btn])).toBe(false)
  })
})

describe('a stat value with a unit stays on one line (n246)', () => {
  const m = { strokeId: 's', shape: 'box', box: { x: 760, y: 100, w: 240, h: 130 }, stat: { value: '38 Mbps', label: 'Upload', labelAbove: true } } as unknown as ShapeMark
  it('sizes it to the card\'s width and says one line', () => {
    const c = statClause(m)
    expect(c).toContain('nowrap')
    const px = Number(c.match(/about (\d+)px, ONE line/)![1])
    expect(px * 0.62 * 7).toBeLessThanOrEqual(192)
  })
  it('catches a wrapped value', () => {
    const v = verifyStats([m], { nodes: [{ id: 'a', rect: { x: 784, y: 120, w: 130, h: 110 }, text: '38 Mbps', textBox: { x: 784, y: 120, w: 130, h: 110 } }] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('wrapped')
    const ok = verifyStats([m], { nodes: [{ id: 'a', rect: { x: 784, y: 140, w: 180, h: 50 }, text: '38 Mbps', textBox: { x: 784, y: 140, w: 180, h: 50 } }] })
    expect(ok.satisfied).toBe(true)
  })
})

describe('a short label stays at the end of the bar it was typed at (n246)', () => {
  const bar = { box: { x: 240, y: 210, w: 421, h: 51 } }
  const note = (text: string, x: number, y = 236) => ({ text, at: { x, y } })
  it('reads the end', () => {
    expect(barLabelSide(bar, [note('8 to 2', 280)])).toEqual({ text: '8 to 2', side: 'left' })
    expect(barLabelSide(bar, [note('8 to 2', 640)])).toEqual({ text: '8 to 2', side: 'right' })
  })
  it('leaves the middle, a button, a list and two notes alone', () => {
    expect(barLabelSide(bar, [note('8 to 2', 450)])).toBeNull()
    expect(barLabelSide({ box: { x: 1040, y: 100, w: 200, h: 47 } }, [note('Publish', 1080, 123)])).toBeNull()
    expect(barLabelSide(bar, [note('Lisbon, 52%', 280)])).toBeNull()
    expect(barLabelSide(bar, [note('8 to 2', 280), note('9 to 3', 300)])).toBeNull()
  })
})

describe('look words on a list of names are never printed (n246)', () => {
  const n = 'Drift bold, Week, Month, Goals right'
  it('takes them off the names', () => {
    expect(nameList(n)).toEqual(['Drift', 'Week', 'Month', 'Goals'])
    expect(nameList('Biscuit, Juno, Pepper')).toEqual(['Biscuit', 'Juno', 'Pepper'])
  })
  it('catches them on the page', () => {
    const texts = directionStrings([n]).map((d) => d.text)
    expect(texts).toContain('Drift bold')
    expect(texts).toContain('Goals right')
  })
  it('tells the build what right means', () => {
    const b = typedCopyBrief([n])
    expect(b).toContain('"Drift", "Week", "Month", "Goals"')
    expect(b).toContain('right end')
  })
})
