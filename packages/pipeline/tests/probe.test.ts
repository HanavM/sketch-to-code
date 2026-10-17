import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  deriveProbes, guardData, judgeProbe, relocateProbes, restoreData, snapshotData, unsafeReason,
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

  it('dismiss, filter and sort are behaviours too (the ways a click changes a list or a note)', () => {
    for (const w of ['dismisses the banner', 'filter the list', 'sorts by name']) {
      expect(deriveProbes([act({
        kind: 'modify', instruction: w,
        targets: [tgt('a:1:1', 'button', 'Go')], dest: tgt('a:2:1', 'ul'),
      })]).map((x) => x.kind), w).toEqual(['click'])
    }
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
  it('a region that changes by itself is unverified, never passed, even when before/after differ', () => {
    const v = judgeProbe(click, obs({ selfChanged: true, before: 'a', after: 'b' }), clean)
    expect(v.status).toBe('unverified')
    expect(v.reason).toMatch(/^couldn't test it: "Details" changes by itself .* a click on "More" can't be told apart/)
    expect(v.reason).toMatch(/Point the arrow at the part that should change/)
  })
  it('selfChanged only speaks for click probes: a submit is still judged by what was stored', () => {
    expect(judgeProbe(submit, obs({ selfChanged: true }), clean).status).toBe('failed')
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

describe('relocateProbes: probes look elements up where they are after the edit', () => {
  const node = (srcLoc: string | null, tag: string, text = '', y = 0) => ({
    id: srcLoc ?? 'x', tag, srcLoc, text, classes: [], parent: null, depth: 1,
    rect: { x: 0, y, w: 100, h: 20 },
    style: {} as never,
  })
  const snap = (nodes: ReturnType<typeof node>[]) =>
    ({ nodes, viewport: { w: 800, h: 600, scrollX: 0, scrollY: 0 }, url: '/', takenAt: 0, truncated: false }) as never
  const at = (srcLoc: string, tag: string, text = '', y = 0): GroundedTarget =>
    ({ ...tgt(srcLoc, tag, text), rect: { x: 0, y, w: 100, h: 20 } })

  it('a save that added lines above the form still finds the form (the walkthrough bug)', async () => {
    const { relocateProbes } = await import('../src/probe.js')
    const actions = [act({ kind: 'save', targets: [at('src/App.jsx:41:7', 'form', '', 300)] })]
    const specs = deriveProbes(actions)
    // the engine added an import and a hook: every stamp below moved 3 lines
    const after = snap([node('src/App.jsx:30:5', 'section', '', 0), node('src/App.jsx:44:7', 'form', '', 300), node('src/App.jsx:45:9', 'input', '', 305)])
    expect(relocateProbes(specs, actions, after)[0]!.trigger.srcLoc).toBe('src/App.jsx:44:7')
  })

  it('a stale stamp that now lands on another element of the same tag is not trusted over the text', async () => {
    const { relocateProbes } = await import('../src/probe.js')
    const actions = [act({
      kind: 'modify', instruction: 'clicking this shows the tips',
      targets: [at('src/A.tsx:10:7', 'button', 'Show tips', 100)], dest: at('src/A.tsx:20:7', 'div', 'Tips', 200),
    })]
    const after = snap([
      node('src/A.tsx:10:7', 'button', 'Reset', 50), // the old stamp, now a different button
      node('src/A.tsx:14:7', 'button', 'Show tips', 100),
      node('src/A.tsx:24:7', 'div', 'Tips', 200),
    ])
    const [p] = relocateProbes(deriveProbes(actions), actions, after)
    expect(p!.trigger.srcLoc).toBe('src/A.tsx:14:7')
    expect(p!.effect!.srcLoc).toBe('src/A.tsx:24:7')
  })

  it('two forms in a file: the one nearest where the drawn one was', async () => {
    const { relocate } = await import('../src/probe.js')
    const after = snap([node('src/A.tsx:12:5', 'form', '', 0), node('src/A.tsx:40:5', 'form', '', 400)])
    expect(relocate(at('src/A.tsx:37:5', 'form', '', 390), after)).toBe('src/A.tsx:40:5')
  })

  it('nothing of that tag left in the file: keeps the old stamp, so the page says it is gone', async () => {
    const { relocateProbes } = await import('../src/probe.js')
    const actions = [act({ kind: 'save', targets: [at('src/A.tsx:9:5', 'form')] })]
    const specs = deriveProbes(actions)
    const after = snap([node('src/B.tsx:9:5', 'form'), node('src/A.tsx:3:5', 'div')])
    expect(relocateProbes(specs, actions, after)[0]!.trigger.srcLoc).toBe('src/A.tsx:9:5')
  })
})

describe('an untested behaviour says the real reason, not "it wasn\'t safe to"', () => {
  const save = act({ kind: 'save', targets: [{ ...tgt('a:1:1', 'form'), text: '' }] })
  const card = async (reason: string) => {
    const { explainRun, isPlain } = await import('../src/explain.js')
    const e = explainRun({ reading: 'save the form', actions: [save], failures: [`action 0 (behaviour, not tested): ${reason}`], files: ['src/C.tsx'] } as never)
    expect(e.problem).toBe(true)
    expect(isPlain(e.sentence)).toBe(true)
    return e.sentence
  }
  it('form not found after the change', async () => {
    const s = await card("couldn't test it: the form is not on the page any more")
    expect(s).toMatch(/because I couldn't find the form on the page after the change/)
    expect(s).not.toMatch(/safe/)
  })
  it('a third-party call really is unsafe, and says so', async () => {
    expect(await card("couldn't test it: its code calls https://api.example.com, which is not this dev server, so it was not clicked"))
      .toMatch(/wasn't safe to: it would reach outside your app/)
  })
  it('a tab that did not answer', async () => {
    expect(await card("couldn't test it: the page did not answer the test (is the tab still open?)")).toMatch(/the page didn't answer when I tried/)
  })
  it('a ticking region', async () => {
    expect(await card(`couldn't test it: "Stats" changes by itself (a clock, a countdown or a slideshow in it), so a click on "Show" can't be told apart from that.`))
      .toMatch(/changes by itself/)
  })
})

describe('navigate probes (s2c-039): the arrow to a named box is tested by clicking it', () => {
  const nav = (screen = 'Get started') => act({
    kind: 'navigate', instruction: `clicking this opens ${screen}`, screen,
    targets: [tgt('src/App.tsx:20:9', 'button', 'Get started')],
  })
  const spec: ProbeSpec = {
    actionIndex: 0, kind: 'navigate', trigger: { srcLoc: 'src/App.tsx:20:9', label: '"Get started"' },
    screen: { route: '#/get-started', heading: 'Get started' }, claim: '',
  }
  const navObs = (p: Partial<NonNullable<ProbeObservation['nav']>>): ProbeObservation => obs({
    nav: { hashBefore: '', hashAfter: '#/get-started', triggerGone: true, headingShown: true, back: 'button', backOk: true, ...p },
  })

  it('derives one navigate probe with the route and heading navigate.ts will write', () => {
    const [p, ...rest] = deriveProbes([nav('sign up')])
    expect(rest).toHaveLength(0)
    expect(p).toMatchObject({ kind: 'navigate', screen: { route: '#/sign-up', heading: 'Sign up' } })
    expect(p!.effect).toBeUndefined()
    expect(p!.claim).toContain('"Sign up" screen')
  })

  it('derives nothing for a navigate with no screen name (grounding refuses those)', () => {
    expect(deriveProbes([nav('')])).toHaveLength(0)
    expect(deriveProbes([nav(' !! ')])).toHaveLength(0)
  })

  it('passes only when the address, the page, the heading and Back all hold', () => {
    const ok = judgeProbe(spec, navObs({}), clean)
    expect(ok.status).toBe('passed')
    expect(ok.reason).toMatch(/opened the "Get started" screen, and ← Back came home/)
    expect(judgeProbe(spec, navObs({ back: 'browser' }), clean).reason).toMatch(/the browser's back/)
  })

  it('fails a button that does nothing, a hash nobody renders, a home page left showing, and a dead Back', () => {
    const r = (p: Partial<NonNullable<ProbeObservation['nav']>>) => judgeProbe(spec, navObs(p), clean)
    expect(r({ hashAfter: '' })).toMatchObject({ status: 'failed', reason: expect.stringMatching(/didn't open the "Get started" screen/) })
    expect(r({ headingShown: false })).toMatchObject({ status: 'failed', reason: expect.stringMatching(/changed the address, but the "Get started" screen didn't show/) })
    expect(r({ triggerGone: false }).reason).toMatch(/was still there/)
    expect(r({ backOk: false })).toMatchObject({ status: 'failed', reason: expect.stringMatching(/going back didn't return/) })
  })

  it('is unverified, not passed, when the page never ran it or said nothing', () => {
    expect(judgeProbe(spec, obs({ ran: false, error: '"Get started" is not on the page any more' }), clean).status).toBe('unverified')
    expect(judgeProbe(spec, obs({}), clean).status).toBe('unverified')
  })

  it('relocates the trigger after the engine shifted its stamp', () => {
    const a = nav()
    const after = { url: '', viewport: { w: 1280, h: 800 }, nodes: [
      { id: 1, tag: 'button', text: 'Get started', srcLoc: 'src/App.tsx:21:9', rect: a.targets[0]!.rect },
    ] } as unknown as Parameters<typeof relocateProbes>[2]
    const [p] = relocateProbes(deriveProbes([a]), [a], after)
    expect(p!.trigger.srcLoc).toBe('src/App.tsx:21:9')
    expect(p!.screen?.route).toBe('#/get-started')
  })
})
