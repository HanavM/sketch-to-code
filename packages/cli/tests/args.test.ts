import { describe, expect, it } from 'vitest'
import { parseArgs } from '../src/args.js'

describe('the hand-rolled arg parser', () => {
  it('reads a command, a target and short flags', () => {
    const a = parseArgs(['init', './my-app', '-y'])
    expect(a.command).toBe('init')
    expect(a.target).toBe('./my-app')
    expect(a.bools.yes).toBe(true)
  })

  it('takes values inline or as the next token', () => {
    expect(parseArgs(['init', '--dep=file:/x']).values.dep).toBe('file:/x')
    expect(parseArgs(['init', '--dep', 'file:/x']).values.dep).toBe('file:/x')
    expect(parseArgs(['init', '--port', '5220']).values.port).toBe('5220')
  })

  it('negates with --no-x', () => {
    const a = parseArgs(['init', '--no-install', '--no-gitignore'])
    expect(a.bools.install).toBe(false)
    expect(a.bools.gitignore).toBe(false)
  })

  it('leaves unset flags undefined, so "default" and "off" stay distinguishable', () => {
    const a = parseArgs(['init'])
    expect(a.bools.install).toBeUndefined()
    expect(a.bools.push).toBeUndefined()
  })

  it('reports unknown flags, a missing value and extra positionals instead of ignoring them', () => {
    expect(parseArgs(['init', '--wat']).errors).toEqual(['unknown flag: --wat'])
    expect(parseArgs(['init', '--dep']).errors).toEqual(['--dep needs a value'])
    expect(parseArgs(['init', 'a', 'b']).errors[0]).toMatch(/unexpected extra argument: b/)
  })

  it('defaults to no command so bin can print help', () => {
    expect(parseArgs([]).command).toBe('')
  })
})
