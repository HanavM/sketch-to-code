import { describe, expect, it } from 'vitest'
import { colourWord, lookName } from '../src/target-look.js'

describe('n191 a plan target with no words is named by its look', () => {
  it('the e5 map route is an orange line, the progress rest a grey bar', () => {
    expect(lookName({ tag: 'path', w: 460, h: 600, stroke: 'rgb(234, 88, 12)', fill: 'none' })).toBe('orange line')
    expect(lookName({ tag: 'DIV', w: 441, h: 8, fill: 'rgb(209, 213, 219)' })).toBe('light grey bar')
    expect(lookName({ tag: 'div', w: 309, h: 8, fill: 'rgb(234, 88, 12)', radius: 4 })).toBe('orange bar')
  })
  it('round things are dots or circles in their fill', () => {
    expect(lookName({ tag: 'div', w: 12, h: 12, radius: 6, fill: 'rgb(27, 34, 50)' })).toBe('dark dot')
    expect(lookName({ tag: 'div', w: 52, h: 52, radius: 999, fill: 'rgb(254, 215, 170)' })).toBe('peach circle')
    expect(lookName({ tag: 'circle', w: 20, h: 20, fill: 'rgb(22, 163, 74)' })).toBe('green dot')
  })
  it('a transparent box is just a box; the canvas of an editor is a box in its fill', () => {
    expect(lookName({ tag: 'div', w: 300, h: 200, fill: 'rgba(0, 0, 0, 0)' })).toBe('box')
    expect(lookName({ tag: 'div', w: 600, h: 400, fill: 'rgb(37, 99, 235)' })).toBe('blue box')
  })
  it('colour words', () => {
    expect(colourWord('#ffffff')).toBe('white')
    expect(colourWord('rgb(107, 114, 128)')).toBe('grey')
    expect(colourWord('rgba(0,0,0,0)')).toBeNull()
  })
})
