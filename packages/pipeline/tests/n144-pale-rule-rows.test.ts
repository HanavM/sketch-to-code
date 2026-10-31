import { describe, expect, it } from 'vitest'
import { paleOn } from '../src/ruleline.js'
import { inkColoursBrief, inkTaughtOutline } from '../src/inkcolour.js'
import { rowData, semiRows, splitEnds } from '../src/rowdata.js'
import { parseCssColor } from '../src/palette.js'
import { groupCount, listNote } from '@s2c/ink'

describe('n144: a pale-pen divider colours only the rule', () => {
  it('a sand pen on a cream page is pale; a dark pen or a white pen on navy is not', () => {
    expect(paleOn('#ebe3c8', parseCssColor('#fffbea'))).toBe(true)
    expect(paleOn('#3d1f0a', parseCssColor('#fffbea'))).toBe(false)
    expect(paleOn('#ffffff', parseCssColor('#0f172a'))).toBe(false)
  })
  it('the brief gives the colour to the rule and keeps the words dark', () => {
    const b = inkColoursBrief({ actions: [{ inkColours: [{ strokeId: 's2', mark: 'line', paint: 'text', color: '#ebe3c8', box: { x: 2, y: 70, w: 1276, h: 1 }, how: 'pen', ruleOnly: true }] }] } as never)
    expect(b).toMatch(/RULE's colour only/)
    expect(b).toMatch(/NOT #ebe3c8/)
  })
})

describe('n144: a list note never joins a drawn mark through its own "both"', () => {
  const recipe = 'checkbox list: 200 g ricotta, 2 eggs (both ticked orange, crossed out), 120 g flour, 1 lemon, zested, 150 ml milk, 1 tbsp sugar'
  it('a colon list is copy', () => {
    expect(listNote(recipe)).toBe(true)
    expect(groupCount(recipe)).toBeNull()
  })
  it('a group note still counts', () => {
    expect(groupCount('both cards white')).toBe(2)
    expect(groupCount('3 cards, tilted')).toBe(3)
    expect(listNote('3 cards: Basic, Pro')).toBe(false)
  })
})

describe('n144: a dark-pen box with no tap is an outline when its twin was tapped', () => {
  it('the picked ride row on a white card', () => {
    expect(inkTaughtOutline('#111827', { w: 380, h: 83 }, '#ffffff', [], true)).toBe(true)
  })
  it('stays filled when nothing in that pen was tapped, a fill is asked, or the surface is dark', () => {
    expect(inkTaughtOutline('#111827', { w: 380, h: 83 }, '#ffffff', [], false)).toBe(false)
    expect(inkTaughtOutline('#111827', { w: 380, h: 83 }, '#ffffff', ['solid dark row'], true)).toBe(false)
    expect(inkTaughtOutline('#111827', { w: 380, h: 83 }, '#0f172a', [], true)).toBe(false)
    expect(inkTaughtOutline('#f59e0b', { w: 380, h: 83 }, '#ffffff', [], true)).toBe(false)
  })
})

describe('n144: rows typed with semicolons, name and price run into the details', () => {
  const ride = '3 rides, grey thumb, price right: Standard 4 min away · 4 seats £18.40; Comfort 6 min away · extra room £24.10; XL 9 min away · 6 seats £31.70'
  it('three rows of name | details | price', () => {
    expect(semiRows(ride)).toHaveLength(3)
    expect(rowData(ride)!.rows).toEqual([
      ['Standard', '4 min away · 4 seats', '£18.40'],
      ['Comfort', '6 min away · extra room', '£24.10'],
      ['XL', '9 min away · 6 seats', '£31.70'],
    ])
  })
  it('a row with no price keeps its cells', () => {
    expect(splitEnds(['Sertraline 50 mg', '1 tablet daily'])).toEqual(['Sertraline 50 mg', '1 tablet daily'])
    expect(rowData('Sertraline 50 mg · 1 tablet daily · 4 days left')!.rows[0]![0]).toBe('Sertraline 50 mg')
  })
  it('a sentence with semicolons and no dotted rows is no row list', () => {
    expect(semiRows('note: fold in flour; rest five minutes')).toBeNull()
  })
})
