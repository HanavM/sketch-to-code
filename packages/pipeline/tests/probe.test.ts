import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  deriveProbes, guardData, judgeProbe, restoreData, snapshotData, unsafeReason,
  type ProbeObservation, type ProbeSpec,
} from '../src/probe.js'
import type { GroundedAction, GroundedTarget } from '../src/intent2.js'

const tgt = (srcLoc: string, tag: string, text = ''): GroundedTarget => ({
  domId: srcLoc, srcLoc, tag, text, subtreeText: text, classes: [], rect: { x: 0, y: 0, w: 10, h: 10 },
})
const act = (p: Partial<GroundedAction>): GroundedAction => ({
  kind: 'modify', targets: [], instruction: '', needsConfirm: false, ...p,
} as GroundedAction)

describe('deriveProbes: the ink names the test', () => {
  it('a save on a form field is a submit probe on that form', () => {
    const p = deriveProbes([act({ kind: 'save', targets: [tgt('src/C.tsx:9:11', 'input')] })])
    expect(p).toEqual([expect.objectContaining({ actionIndex: 0, kind: 'submit', trigger: expect.objectContaining({ srcLoc: 'src/C.tsx:9:11' }) })])
  })

  it('an arrow from a button to a region plus "shows" is a click probe: tail = trigger, head = effect', () => {
    const p = deriveProbes([act({
      kind: 'modify', instruction: 'make this button show the panel',
      targets: [tgt('src/A.tsx:4:7', 'button', 'More')], dest: tgt('src/A.tsx:9:7', 'div', 'Details'),
    })])
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ kind: 'click', trigger: { srcLoc: 'src/A.tsx:4:7' }, effect: { srcLoc: 'src/A.tsx:9:7' } })
    expect(p[0]!.claim).toBe('clicking "More" changes "Details"')
  })

  it('the behaviour word can come from a typed note alone', () => {
    const p = deriveProbes([act({
      kind: 'modify', instruction: '', notes: ['toggles'],
      targets: [tgt('a:1:1', 'button', 'Menu')], dest: tgt('a:2:1', 'nav'),
    })])
    expect(p.map((x) => x.kind)).toEqual(['click'])
  })

  it('a move arrow is layout, not behaviour, and is left to the static verifier', () => {
    expect(deriveProbes([act({
      kind: 'move', instruction: 'show this above the footer',
      targets: [tgt('a:1:1', 'button')], dest: tgt('a:2:1', 'footer'),
    })])).toEqual([])
  })

  it('no behaviour word, no probe: restyling a button aimed at a region is not a click test', () => {
    expect(deriveProbes([act({
      kind: 'modify', instruction: 'make it blue like that one',
      targets: [tgt('a:1:1', 'button')], dest: tgt('a:2:1', 'div'),
    })])).toEqual([])
  })

  it('a non-clickable trigger is not clicked', () => {
    expect(deriveProbes([act({
      kind: 'modify', instruction: 'shows the list',
      targets: [tgt('a:1:1', 'h2', 'Title')], dest: tgt('a:2:1', 'ul'),
    })])).toEqual([])
  })

  it('an unstamped target cannot be found in the page, so it gets no probe', () => {
    expect(deriveProbes([act({ kind: 'save', targets: [{ ...tgt('x', 'input'), srcLoc: null }] })])).toEqual([])
  })

  it('keeps the action index so the verdict lands on the right action', () => {
    const p = deriveProbes([
      act({ kind: 'delete', targets: [tgt('a:1:1', 'p')] }),
      act({ kind: 'save', targets: [tgt('a:2:1', 'input')] }),
    ])
    expect(p.map((x) => x.actionIndex)).toEqual([1])
  })
})

describe('unsafeReason: never click something that reaches off the dev server', () => {
  it('refuses a handler that calls a third-party API', () => {
    expect(unsafeReason(`onClick={() => fetch('https://api.stripe.com/v1/charges', {method:'POST'})}`))
      .toMatch(/api\.stripe\.com.*not clicked/)
  })
  it('refuses a beacon and a navigation', () => {
    expect(unsafeReason(`navigator.sendBeacon("https://t.example.com/x")`)).toMatch(/t\.example\.com/)
    expect(unsafeReason(`onClick={() => { window.location.href = '/pay' }}`)).toMatch(/navigates away/)
  })
  it('allows relative fetches and the dev server itself', () => {
    expect(unsafeReason(`fetch('/api/contacts', { method: 'POST' })`)).toBeNull()
    expect(unsafeReason(`fetch("http://localhost:5199/api/x")`)).toBeNull()
    expect(unsafeReason(`fetch("https://my.dev:443/api")`, 'https://my.dev:443')).toBeNull()
  })
})

const submit: ProbeSpec = { actionIndex: 0, kind: 'submit', trigger: { srcLoc: 'a:1:1', label: 'the form' }, claim: '' }
const click: ProbeSpec = {
  actionIndex: 2, kind: 'click', trigger: { srcLoc: 'a:1:1', label: '"More"' },
  effect: { srcLoc: 'a:2:1', label: '"Details"' }, claim: '',
}
const obs = (p: Partial<ProbeObservation>): ProbeObservation => ({ ran: true, requests: [], before: 'x', after: 'x', ms: 10, ...p })
const clean = { changed: [], restored: true }

describe('judgeProbe: a dead form never passes', () => {
  it('passes a submit that stored a record and said so', () => {
    const v = judgeProbe(submit, obs({
      requests: [{ method: 'POST', url: 'http://localhost:5199/api/contacts', status: 201 }], after: 'Saved',
    }), { changed: ['server/data/contacts.json'], restored: true })
    expect(v.status).toBe('passed')
    expect(v.reason).toMatch(/stored in server\/data\/contacts\.json.*removed again/)
  })
  it('fails a form whose submit is thrown away', () => {
    expect(judgeProbe(submit, obs({}), clean)).toMatchObject({ status: 'failed', reason: expect.stringMatching(/sends what was typed nowhere/) })
  })
  it('fails a form nothing handles (it would reload the page)', () => {
    expect(judgeProbe(submit, obs({ unhandledSubmit: true }), clean).reason).toMatch(/nothing handles the submit/)
  })
  it('fails a submit the route refused', () => {
    expect(judgeProbe(submit, obs({ requests: [{ method: 'POST', url: '/api/c', status: 500 }], after: 'err' }), clean).reason)
      .toMatch(/POST \/api\/c, which answered 500/)
  })
  it('fails a submit that reached a route which stored nothing', () => {
    expect(judgeProbe(submit, obs({ requests: [{ method: 'POST', url: '/api/c', status: 200 }], after: 'Saved' }), clean).reason)
      .toMatch(/reached \/api\/c but nothing was stored/)
  })
  it('fails a silent save: stored, but the person filling it in cannot tell', () => {
    expect(judgeProbe(submit, obs({ requests: [{ method: 'POST', url: '/api/c', status: 201 }] }), { changed: ['server/data/c.json'], restored: true }).reason)
      .toMatch(/page does not say so/)
  })
  it('a probe that could not run is unverified, never passed', () => {
    expect(judgeProbe(submit, obs({ ran: false, error: 'the form is not on the page' }), clean))
      .toMatchObject({ status: 'unverified', reason: "couldn't test it: the form is not on the page" })
  })
  it('says so when the test data could not be put back', () => {
    expect(judgeProbe(submit, obs({}), { changed: [], restored: false }).reason).toMatch(/check server\/data/)
  })
  it('a click passes only if the region the arrow points at changed', () => {
    expect(judgeProbe(click, obs({ after: 'y' }), clean)).toMatchObject({ status: 'passed', actionIndex: 2 })
    expect(judgeProbe(click, obs({}), clean).reason).toBe('clicking "More" changed nothing in "Details"')
  })
})

describe('the data guard puts every byte back', () => {
  const repo = () => mkdtempSync(join(tmpdir(), 's2c-probe-'))

  it('removes a store the probe created, and the directory it made', async () => {
    const root = repo()
    mkdirSync(join(root, 'server/api'), { recursive: true })
    const { data } = await guardData(root, async () => {
      mkdirSync(join(root, 'server/data'), { recursive: true })
      writeFileSync(join(root, 'server/data/contacts.json'), '[{"id":1}]')
    })
    expect(data).toEqual({ changed: ['server/data/contacts.json'], restored: true })
    expect(existsSync(join(root, 'server/data'))).toBe(false)
    expect(existsSync(join(root, 'server/api'))).toBe(true)
  })

  it('restores a changed store byte for byte and a deleted one too', async () => {
    const root = repo()
    mkdirSync(join(root, 'server/data/nested'), { recursive: true })
    const a = '[\n  {"name":"Ada"}\n]\n'
    writeFileSync(join(root, 'server/data/a.json'), a)
    writeFileSync(join(root, 'server/data/nested/b.json'), 'B')
    const snap = snapshotData(root)
    writeFileSync(join(root, 'server/data/a.json'), '[{"name":"Ada"},{"name":"probe"}]')
    rmSync(join(root, 'server/data/nested/b.json'))
    const d = restoreData(root, snap)
    expect(d).toEqual({ changed: ['server/data/a.json', 'server/data/nested/b.json'], restored: true })
    expect(readFileSync(join(root, 'server/data/a.json'), 'utf8')).toBe(a)
    expect(readFileSync(join(root, 'server/data/nested/b.json'), 'utf8')).toBe('B')
  })

  it('reports nothing when nothing changed, and restores even when the probe throws', async () => {
    const root = repo()
    mkdirSync(join(root, 'server/data'), { recursive: true })
    writeFileSync(join(root, 'server/data/a.json'), '[]')
    expect((await guardData(root, async () => 1)).data).toEqual({ changed: [], restored: true })
    await expect(guardData(root, async () => {
      writeFileSync(join(root, 'server/data/a.json'), '[1]')
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(readFileSync(join(root, 'server/data/a.json'), 'utf8')).toBe('[]')
  })
})

describe('the data store never hot-reloads the page', () => {
  it('isDataStoreFile matches server/data/ only', async () => {
    const { isDataStoreFile } = await import('../../vite-plugin/src/index.js')
    expect(isDataStoreFile('/app', '/app/server/data/contacts.json')).toBe(true)
    expect(isDataStoreFile('/app', '/app/server/data/nested/x.json')).toBe(true)
    expect(isDataStoreFile('/app', '/app/server/api/contacts.ts')).toBe(false)
    expect(isDataStoreFile('/app', '/app/src/data/list.json')).toBe(false)
    expect(isDataStoreFile('/app', '/elsewhere/server/data/x.json')).toBe(false)
  })
})

describe('verifyActions counts behaviour, so a dead form never scores 100%', () => {
  const snap = { nodes: [], viewport: { w: 1, h: 1, scrollX: 0, scrollY: 0 }, url: '', takenAt: 0, truncated: false }
  const save = act({ kind: 'save', targets: [tgt('a:1:1', 'input')] })
  it('without probes a save action is unmeasured (the old blind spot)', async () => {
    const { verifyActions } = await import('../src/run2.js')
    expect(verifyActions([save], snap, snap).score).toBe(1)
  })
  it('a failed probe fails the run, in the probe\'s own words', async () => {
    const { verifyActions } = await import('../src/run2.js')
    const r = verifyActions([save], snap, snap, undefined, [{ actionIndex: 0, status: 'failed', reason: 'submitting the form sends what was typed nowhere, so it is thrown away' }])
    expect(r.score).toBe(0)
    expect(r.failures).toEqual(['action 0 (behaviour): submitting the form sends what was typed nowhere, so it is thrown away'])
  })
  it('a passed probe counts as satisfied', async () => {
    const { verifyActions } = await import('../src/run2.js')
    expect(verifyActions([save], snap, snap, undefined, [{ actionIndex: 0, status: 'passed', reason: 'ok' }]).score).toBe(1)
  })
  it('unverified is reported but never counted as a pass or sent to repair', async () => {
    const { verifyActions } = await import('../src/run2.js')
    const r = verifyActions([save], snap, snap, undefined, [{ actionIndex: 0, status: 'unverified', reason: "couldn't test it: x" }])
    expect(r.score).toBe(1)
    expect(r.failures[0]).toMatch(/not tested/)
    expect((r.detail as Array<{ kind: string }>).some((d) => d.kind === 'behaviour')).toBe(true)
  })
})

describe('the plain-language card says when behaviour failed or was not tested', () => {
  const save = act({ kind: 'save', targets: [{ ...tgt('a:1:1', 'form'), text: '' }] })
  it('a failed probe is a problem, in words', async () => {
    const { explainRun } = await import('../src/explain.js')
    const e = explainRun({ reading: 'save the form', actions: [save], failures: ['action 0 (behaviour): x'], files: ['src/C.tsx'] } as never)
    expect(e.problem).toBe(true)
    expect(e.sentence).toMatch(/keep what people type — I tried it in the page and it didn't work/)
  })
  it('an untested behaviour is never "Done."', async () => {
    const { explainRun } = await import('../src/explain.js')
    const e = explainRun({ reading: 'save the form', actions: [save], failures: ["action 0 (behaviour, not tested): couldn't test it: x"], files: ['src/C.tsx'] } as never)
    expect(e.problem).toBe(true)
    expect(e.sentence).toMatch(/didn't try the change out in the page.*check yourself that it works/)
  })
})
