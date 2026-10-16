import { describe, expect, it } from 'vitest'
import { labelArmed, startsLabel } from '../src/type-to-label.js'
import type { LabelState } from '../src/type-to-label.js'

const k = (key: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; isComposing: boolean }> = {}) =>
  ({ key, altKey: false, ctrlKey: false, metaKey: false, ...mods })

describe('startsLabel', () => {
  it('takes a bare printable character, shifted or not', () => {
    for (const c of ['a', 'P', '3', '$', 'é', '?', '😀']) expect(startsLabel(k(c))).toBe(true)
  })
  it('never takes a named key', () => {
    for (const c of ['Enter', 'Tab', 'Escape', 'ArrowUp', 'Backspace', 'Shift', 'Dead', 'F1']) {
      expect(startsLabel(k(c))).toBe(false)
    }
  })
  it('never takes space: it scrolls the page, and no label starts with one', () => {
    expect(startsLabel(k(' '))).toBe(false)
  })
  it('never takes a key with a command modifier (the overlay keymap, the browser, AltGr)', () => {
    expect(startsLabel(k('n', { altKey: true }))).toBe(false)
    expect(startsLabel(k('z', { ctrlKey: true }))).toBe(false)
    expect(startsLabel(k('k', { metaKey: true }))).toBe(false)
    expect(startsLabel(k('@', { ctrlKey: true, altKey: true }))).toBe(false)
  })
  it('stays out of an IME composition', () => {
    expect(startsLabel(k('a', { isComposing: true }))).toBe(false)
  })
})

describe('labelArmed', () => {
  const base: LabelState = { mode: 'draw', surface: 'design', armedStrokeId: 's3', lastStrokeId: 's3', busy: false }
  it('is armed right after a stroke on the design surface', () => {
    expect(labelArmed(base)).toBe(true)
  })
  it('disarms once the armed stroke is no longer the newest (undo, clear, used)', () => {
    expect(labelArmed({ ...base, lastStrokeId: 's2' })).toBe(false) // undo popped it
    expect(labelArmed({ ...base, lastStrokeId: null })).toBe(false) // cleared
    expect(labelArmed({ ...base, armedStrokeId: null })).toBe(false) // already labelled
  })
  it('leaves the page its keys outside drawing', () => {
    for (const mode of ['tweak', 'preview', 'running', 'idle']) expect(labelArmed({ ...base, mode })).toBe(false)
    expect(labelArmed({ ...base, surface: 'test' })).toBe(false)
  })
  it('yields to anything that already owns the keyboard', () => {
    expect(labelArmed({ ...base, busy: true })).toBe(false)
  })
})
