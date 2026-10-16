import { describe, expect, it } from 'vitest'
import { createReadingStore, isReadingId } from '../src/readings.js'

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))
const later = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms))

describe('reading store (s2c-002)', () => {
  it('an answer that lands after its page died is kept for the next page', async () => {
    const s = createReadingStore()
    void s.begin('rid-00000001', later(30, { status: 200, body: { ok: true, v2: 'x' } }))
    expect(await s.wait('rid-00000001', 0)).toEqual({ state: 'pending' })
    expect(await s.wait('rid-00000001', 200)).toEqual({ state: 'done', reply: { status: 200, body: { ok: true, v2: 'x' } } })
    // and again: a second reload in the same burst collects the same answer
    expect((await s.wait('rid-00000001', 0)).state).toBe('done')
  })

  it('wait gives up at waitMs and says pending, not unknown', async () => {
    const s = createReadingStore()
    void s.begin('rid-00000002', later(500, { status: 200, body: {} }))
    const t0 = Date.now()
    expect(await s.wait('rid-00000002', 40)).toEqual({ state: 'pending' })
    expect(Date.now() - t0).toBeLessThan(300)
  })

  it('an id it never saw is unknown', async () => {
    expect(await createReadingStore().wait('rid-nope0000', 10)).toEqual({ state: 'unknown' })
  })

  it('a reading that throws is an error reply, never a hanging waiter', async () => {
    const s = createReadingStore()
    const live = s.begin('rid-00000003', Promise.reject(new Error('model timed out')))
    expect(await live).toEqual({ status: 400, body: { ok: false, error: 'Error: model timed out' } })
    const got = await s.wait('rid-00000003', 10)
    expect(got.state).toBe('done')
  })

  it('finished answers age out; ones still running do not', async () => {
    let now = 0
    const s = createReadingStore({ ttlMs: 1000, now: () => now })
    void s.begin('rid-done0000', Promise.resolve({ status: 200, body: 1 }))
    void s.begin('rid-slow0000', new Promise(() => undefined))
    await tick(5)
    now = 5000
    expect(await s.wait('rid-done0000', 0)).toEqual({ state: 'unknown' })
    expect(await s.wait('rid-slow0000', 0)).toEqual({ state: 'pending' })
  })

  it('is bounded', async () => {
    const s = createReadingStore({ max: 3 })
    for (let i = 0; i < 10; i++) void s.begin(`rid-${String(i).padStart(8, '0')}`, Promise.resolve({ status: 200, body: i }))
    expect(s.size()).toBe(3)
    expect((await s.wait('rid-00000009', 0)).state).toBe('done')
    expect((await s.wait('rid-00000000', 0)).state).toBe('unknown')
  })

  it('ids are narrow', () => {
    expect(isReadingId('rabcdefghij0123456789')).toBe(true)
    for (const bad of ['short', '../../../etc/passwd', 'a b c d e f g h', 'x'.repeat(65), 42, null]) expect(isReadingId(bad)).toBe(false)
  })
})
