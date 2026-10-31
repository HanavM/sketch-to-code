import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIX_FIRST, failureBrief, failureWeight, rankFailures } from '../src/repair-brief.js'

// the nine checks that failed on round 42 e1 podcast (n168 try 2), as the record kept them
const RUN = new URL('../../../tests/hand/out-n168-pod2/round42/e1-podcast-app/runs.json', import.meta.url).pathname
type V = { kind: string; satisfied?: boolean; reason?: string; verdict?: { satisfied: boolean; reason: string } }
const podcastFailures = (): string[] => {
  const v: V[] = JSON.parse(readFileSync(RUN, 'utf8'))[0].verification
  return v.filter((x) => !(x.satisfied ?? x.verdict?.satisfied)).map((x) => `${x.kind}: ${x.reason ?? x.verdict!.reason}`)
}

describe('n169 a repair facing many failed checks acts biggest first', () => {
  it('podcast: the page-wide drift and the missing player lead; colour and size nits follow', () => {
    const fs = podcastFailures()
    expect(fs.length).toBe(9)
    const ranked = rankFailures(fs)
    const top = ranked.slice(0, FIX_FIRST).map((f) => f.split(':')[0])
    // the aside pushed the whole page 45px down; the footer ring has nothing built; the footer is 91px low
    expect(ranked[0]).toMatch(/whole page from here down/)
    expect(top).toEqual(['marks', 'marks', 'open-rows'])
    // the 255px title running 313px is a small fix: never first
    expect(ranked.slice(0, FIX_FIRST).some((f) => f.startsWith('line-span'))).toBe(false)
  })

  it('many failures are numbered, the first few marked, and an edit asked for at once', () => {
    const brief = failureBrief(podcastFailures())
    expect(brief).toMatch(/9 problems/)
    expect(brief).toMatch(/FIX FIRST:\n1\. /)
    expect(brief).toMatch(/THEN, IF QUICK:\n4\. /)
    expect(brief).toMatch(/first Edit within a minute/)
    const retry = failureBrief(podcastFailures(), { onlyFirst: true })
    expect(retry).not.toMatch(/THEN, IF QUICK/)
    expect(retry).toMatch(/6 smaller problems are left for the next round/)
  })

  it('a few failures go as they are, in their order', () => {
    const fs = ['colour: x is ΔE 20 away', 'marks: the box sits 80px too low']
    expect(failureBrief(fs)).toBe(`Verification against the live DOM found problems:\n${fs.join('\n')}`)
  })

  it('weights: pixels moved, more for missing or off-screen, colour by ΔE', () => {
    expect(failureWeight('the <a> sits 59px too low')).toBe(59)
    expect(failureWeight('move the rows up 48px, rows about 72px apart')).toBe(72)
    expect(failureWeight('nothing about that size was built near it')).toBe(120)
    expect(failureWeight('closest is ΔE 97.8 away')).toBeCloseTo(97.8)
    expect(failureWeight('colour: nothing near the drawing is the colour that was drawn; closest is ΔE 97.8 away')).toBe(60)
    expect(failureWeight('the player is pushed off the bottom, 30px too low')).toBe(230)
    expect(failureWeight('something vague')).toBe(30)
  })
})
