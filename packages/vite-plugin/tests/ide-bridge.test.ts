import { describe, expect, it, vi } from 'vitest'
import { createIdeBridge, rejectNonEditor, rejectNonLocal, type EditorSink } from '../src/ide-bridge.js'
import { normalizeProjectPath, parseSourceLoc, sanitizeEditorName } from '../src/ide-protocol.js'

const ROOT = '/repo/app'

/** A fake editor that records the frames it was sent. */
function fakeEditor(opts: { dead?: boolean } = {}): EditorSink & { frames: string[]; closed: boolean; events: Array<{ event: string; data: unknown }> } {
  const frames: string[] = []
  const sink = {
    frames,
    closed: false,
    get events() {
      return frames
        .map((f) => {
          const m = /^event: (.+)\ndata: (.+)\n\n$/.exec(f)
          return m ? { event: m[1]!, data: JSON.parse(m[2]!) as unknown } : null
        })
        .filter((e): e is { event: string; data: unknown } => e !== null)
    },
    write: (frame: string) => {
      if (opts.dead) return false
      frames.push(frame)
      return true
    },
    close: () => {
      sink.closed = true
    },
  }
  return sink
}

function bridge() {
  const sent: Array<{ event: string; data: unknown }> = []
  let n = 0
  const ide = createIdeBridge({
    root: ROOT,
    broadcast: (event, data) => sent.push({ event, data }),
    now: () => 1000,
    uuid: () => `id-${++n}`,
  })
  return { ide, sent }
}

describe('file paths on the wire', () => {
  it('keeps a repo-relative path exactly as data-s2c carries it', () => {
    expect(normalizeProjectPath(ROOT, 'src/components/Card.tsx')).toEqual({
      ok: true,
      value: 'src/components/Card.tsx',
    })
  })

  it('normalizes an absolute path inside the root down to repo-relative', () => {
    expect(normalizeProjectPath(ROOT, '/repo/app/src/App.tsx')).toEqual({
      ok: true,
      value: 'src/App.tsx',
    })
  })

  it('refuses every way out of the project', () => {
    for (const bad of [
      '../secrets.txt',
      'src/../../secrets.txt',
      '/etc/passwd',
      '/repo/app/../other/x.tsx',
      'src\\..\\..\\etc\\passwd',
      '.',
      '',
    ]) {
      const r = normalizeProjectPath(ROOT, bad)
      expect(r.ok, `expected refusal for ${JSON.stringify(bad)}`).toBe(false)
    }
  })

  it('refuses non-strings, NUL bytes and absurd lengths', () => {
    expect(normalizeProjectPath(ROOT, 42).ok).toBe(false)
    expect(normalizeProjectPath(ROOT, 'src/a\0.tsx').ok).toBe(false)
    expect(normalizeProjectPath(ROOT, `src/${'a'.repeat(2000)}.tsx`).ok).toBe(false)
  })

  it('reads {file,line,col?} and defaults col to 1', () => {
    expect(parseSourceLoc(ROOT, { file: 'src/App.tsx', line: 12 })).toEqual({
      ok: true,
      value: { file: 'src/App.tsx', line: 12, col: 1 },
    })
    expect(parseSourceLoc(ROOT, { file: 'src/App.tsx', line: 12, col: 7 })).toEqual({
      ok: true,
      value: { file: 'src/App.tsx', line: 12, col: 7 },
    })
  })

  it('rejects malformed bodies', () => {
    for (const bad of [null, 'nope', 42, [], {}, { file: 'src/a.tsx' }, { file: 'src/a.tsx', line: 0 },
      { file: 'src/a.tsx', line: 1.5 }, { file: 'src/a.tsx', line: '3' },
      { file: 'src/a.tsx', line: 3, col: 0 }]) {
      expect(parseSourceLoc(ROOT, bad).ok, `expected refusal for ${JSON.stringify(bad)}`).toBe(false)
    }
  })

  it('keeps an editor label printable and short', () => {
    expect(sanitizeEditorName('VS Code')).toBe('VS Code')
    expect(sanitizeEditorName('bad\nname')).toBe('bad name')
    expect(sanitizeEditorName('')).toBe('editor')
    expect(sanitizeEditorName(undefined)).toBe('editor')
    expect(sanitizeEditorName('x'.repeat(100)).length).toBe(40)
  })
})

describe('the editor registry', () => {
  it('greets a new editor with root + protocol, then announces it', () => {
    const { ide, sent } = bridge()
    const ed = fakeEditor()
    ide.connect('VS Code', ed)
    expect(ed.events[0]).toEqual({
      event: 'hello',
      data: { protocol: 1, root: ROOT, editorId: 'id-2', serverId: 'id-1' },
    })
    expect(sent).toEqual([
      { event: 'ide-status', data: { connected: true, editor: 'VS Code', count: 1, editors: [{ id: 'id-2', editor: 'VS Code', since: 1000 }] } },
    ])
    expect(ide.status().connected).toBe(true)
  })

  it('reports disconnected once the editor detaches, and closes the socket', () => {
    const { ide, sent } = bridge()
    const ed = fakeEditor()
    const { detach } = ide.connect('VS Code', ed)
    detach()
    expect(ide.status()).toEqual({ connected: false, count: 0, editors: [] })
    expect(ed.closed).toBe(true)
    expect(sent.at(-1)).toEqual({ event: 'ide-status', data: { connected: false, count: 0, editors: [] } })
  })

  it('a second detach is a no-op (close and heartbeat both call it)', () => {
    const { ide, sent } = bridge()
    const { detach } = ide.connect('VS Code', fakeEditor())
    detach()
    const after = sent.length
    detach()
    expect(sent.length).toBe(after)
  })

  it('never registers an editor whose socket is already dead', () => {
    const { ide, sent } = bridge()
    ide.connect('zombie', fakeEditor({ dead: true }))
    expect(ide.status().connected).toBe(false)
    // one announcement, from the drop — never a "connected" one
    expect(sent.every((s) => (s.data as { connected: boolean }).connected === false)).toBe(true)
  })

  it('names the most recently attached editor in status', () => {
    const { ide } = bridge()
    ide.connect('VS Code', fakeEditor())
    ide.connect('Cursor', fakeEditor())
    expect(ide.status()).toMatchObject({ connected: true, editor: 'Cursor', count: 2 })
  })
})

describe('reveal: browser → editor', () => {
  it('delivers the exact file/line/col to every attached editor', () => {
    const { ide } = bridge()
    const a = fakeEditor()
    const b = fakeEditor()
    ide.connect('a', a)
    ide.connect('b', b)
    const res = ide.reveal({ file: 'src/components/Card.tsx', line: 42, col: 7 })
    expect(res).toEqual({ status: 200, body: { ok: true, delivered: 2 } })
    for (const ed of [a, b]) {
      expect(ed.events.at(-1)).toMatchObject({
        event: 'reveal',
        data: { file: 'src/components/Card.tsx', line: 42, col: 7, root: ROOT, at: 1000 },
      })
    }
  })

  it('answers 200 with delivered:0 when no editor is attached — never an error', () => {
    const { ide } = bridge()
    expect(ide.reveal({ file: 'src/App.tsx', line: 3 })).toEqual({
      status: 200,
      body: { ok: true, delivered: 0, reason: 'no editor connected' },
    })
  })

  it('does not buffer a reveal for an editor that attaches later', () => {
    const { ide } = bridge()
    ide.reveal({ file: 'src/App.tsx', line: 3 })
    const ed = fakeEditor()
    ide.connect('late', ed)
    expect(ed.events.map((e) => e.event)).toEqual(['hello'])
  })

  it('refuses a path outside the project instead of forwarding it', () => {
    const { ide } = bridge()
    const ed = fakeEditor()
    ide.connect('a', ed)
    const res = ide.reveal({ file: '../../etc/passwd', line: 1 })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ ok: false, error: 'file is outside the project root' })
    expect(ed.events.map((e) => e.event)).toEqual(['hello']) // nothing reached the editor
  })

  it('drops an editor whose write fails mid-delivery and reports the real count', () => {
    const { ide } = bridge()
    const live = fakeEditor()
    ide.connect('live', live)
    let alive = true
    ide.connect('flaky', {
      write: () => alive,
      close: () => { /* no socket in a fake */ },
    })
    alive = false // the socket died after hello
    const res = ide.reveal({ file: 'src/App.tsx', line: 1 })
    expect(res.body).toEqual({ ok: true, delivered: 1 })
    expect(ide.status().count).toBe(1)
  })

  it('survives a sink that throws', () => {
    const { ide } = bridge()
    ide.connect('throws', {
      write: () => {
        throw new Error('EPIPE')
      },
      close: () => { /* nothing to close */ },
    })
    expect(ide.reveal({ file: 'src/App.tsx', line: 1 }).body).toMatchObject({ delivered: 0 })
  })
})

describe('cursor: editor → browser', () => {
  it('forwards to the existing browser hub as ide-cursor', () => {
    const { ide, sent } = bridge()
    const { id } = ide.connect('VS Code', fakeEditor())
    const res = ide.cursor({ file: '/repo/app/src/App.tsx', line: 9, col: 4 }, id)
    expect(res).toEqual({ status: 200, body: { ok: true, forwarded: true } })
    expect(sent.at(-1)).toEqual({
      event: 'ide-cursor',
      data: { file: 'src/App.tsx', line: 9, col: 4, editor: 'VS Code', at: 1000 },
    })
  })

  it('drops a repeat of the same file:line (arrow keys within one line)', () => {
    const { ide, sent } = bridge()
    ide.cursor({ file: 'src/App.tsx', line: 9 })
    const after = sent.length
    expect(ide.cursor({ file: 'src/App.tsx', line: 9, col: 20 }).body).toEqual({ ok: true, forwarded: false })
    expect(sent.length).toBe(after)
    expect(ide.cursor({ file: 'src/App.tsx', line: 10 }).body).toEqual({ ok: true, forwarded: true })
  })

  it('refuses an escaping path and forwards nothing', () => {
    const { ide, sent } = bridge()
    const before = sent.length
    expect(ide.cursor({ file: '/etc/passwd', line: 1 }).status).toBe(400)
    expect(ide.cursor(null).status).toBe(400)
    expect(sent.length).toBe(before)
  })

  it('works with no editor registered — a stale editorId is not fatal', () => {
    const { ide, sent } = bridge()
    expect(ide.cursor({ file: 'src/App.tsx', line: 2 }, 'gone').status).toBe(200)
    expect(sent.at(-1)?.data).toMatchObject({ editor: 'editor' })
  })
})

describe('dispose', () => {
  it('drops every editor when the dev server closes', () => {
    const { ide } = bridge()
    const a = fakeEditor()
    ide.connect('a', a)
    ide.connect('b', fakeEditor())
    ide.dispose()
    expect(ide.status().count).toBe(0)
    expect(a.closed).toBe(true)
  })
})

// --- the gates -------------------------------------------------------------

function fakeReq(headers: Record<string, string>) {
  return { headers, method: 'POST', url: '/@s2c/ide/cursor' } as unknown as Parameters<typeof rejectNonEditor>[0]
}
function fakeRes() {
  const state = { status: 0, body: '' as string, headersSent: false }
  const res = {
    get headersSent() {
      return state.headersSent
    },
    writeHead(status: number) {
      state.status = status
      state.headersSent = true
      return res
    },
    end(body?: string) {
      state.body = body ?? ''
    },
    state,
  }
  return res as unknown as Parameters<typeof rejectNonEditor>[1] & { state: typeof state }
}

const EDITOR_HEADERS = {
  host: 'localhost:5230',
  'x-s2c-ide': '1',
  'content-type': 'application/json',
}

describe('rejectNonEditor', () => {
  it('lets a node-http editor client through', () => {
    const res = fakeRes()
    expect(rejectNonEditor(fakeReq(EDITOR_HEADERS), res, { json: true })).toBe(false)
  })

  it('rejects a rebound (non-local) Host — middlewares run before allowedHosts', () => {
    const res = fakeRes()
    expect(rejectNonEditor(fakeReq({ ...EDITOR_HEADERS, host: 'evil.example.com' }), res)).toBe(true)
    expect(res.state.status).toBe(403)
  })

  it('rejects anything a browser sent, so a page cannot pose as an editor', () => {
    for (const marker of ['origin', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest']) {
      const res = fakeRes()
      expect(
        rejectNonEditor(fakeReq({ ...EDITOR_HEADERS, [marker]: 'x' }), res),
        `${marker} should have been rejected`,
      ).toBe(true)
      expect(res.state.status).toBe(403)
    }
  })

  it('requires the x-s2c-ide header (a browser would need a preflight for it)', () => {
    const res = fakeRes()
    const headers = { ...EDITOR_HEADERS } as Record<string, string>
    delete headers['x-s2c-ide']
    expect(rejectNonEditor(fakeReq(headers), res)).toBe(true)
    expect(res.state.status).toBe(403)
  })

  it('requires application/json on POSTs, which is not a CORS-simple type', () => {
    const res = fakeRes()
    expect(
      rejectNonEditor(fakeReq({ ...EDITOR_HEADERS, 'content-type': 'text/plain' }), res, { json: true }),
    ).toBe(true)
    expect(res.state.status).toBe(415)
  })
})

describe('rejectNonLocal', () => {
  it('allows every local Host spelling and refuses the rest', () => {
    for (const host of ['localhost:5230', '127.0.0.1:5230', '[::1]:5230', 'localhost']) {
      expect(rejectNonLocal(fakeReq({ host }), fakeRes())).toBe(false)
    }
    const res = fakeRes()
    expect(rejectNonLocal(fakeReq({ host: 'attacker.test' }), res)).toBe(true)
    expect(res.state.status).toBe(403)
  })
})

describe('handleEvents (the SSE glue)', () => {
  it('writes the stream headers, greets, and unregisters on close', () => {
    const { ide } = bridge()
    const writes: string[] = []
    const handlers: Record<string, () => void> = {}
    const req = {
      url: '/@s2c/ide/events?editor=Nova',
      headers: EDITOR_HEADERS,
      on: (ev: string, fn: () => void) => {
        handlers[ev] = fn
      },
    } as unknown as Parameters<typeof ide.handleEvents>[0]
    const res = {
      writeHead: vi.fn(),
      write: (chunk: string) => {
        writes.push(chunk)
        return true
      },
      end: vi.fn(),
      on: (ev: string, fn: () => void) => {
        handlers[`res:${ev}`] = fn
      },
    } as unknown as Parameters<typeof ide.handleEvents>[1]

    ide.handleEvents(req, res)
    expect(writes[0]).toBe(': connected\n\n')
    expect(writes[1]).toContain('event: hello')
    expect(ide.status()).toMatchObject({ connected: true, editor: 'Nova' })

    handlers.close?.()
    expect(ide.status().connected).toBe(false)
  })
})
