import { describe, expect, it, vi } from 'vitest'

const captured: Array<Record<string, unknown>> = []
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ options }: { options: Record<string, unknown> }) => {
    captured.push(options)
    // an empty stream: the session's consumer loop ends immediately
    const stream = (async function* () { /* nothing */ })()
    return Object.assign(stream, { close: () => undefined })
  },
}))

const { codegenToolOptions, createCodegenSession, PRIVATE_STATE_DENY } = await import('../src/codegen.js')

describe('codegen agent stays out of .sketch2code/ (s2c-007)', () => {
  it('denies reading and editing the tool state directory', () => {
    const { disallowedTools } = codegenToolOptions()
    expect(disallowedTools).toContain('Read(./.sketch2code/**)')
    expect(disallowedTools).toContain('Edit(./.sketch2code/**)')
    // Write is covered by the Edit rule; a deny on the bare tool name would
    // remove it altogether, which is not what is wanted
    expect(disallowedTools).not.toContain('Read')
    expect(disallowedTools).not.toContain('Edit')
  })

  it('still allows the tools codegen needs, and still bars the shell and web', () => {
    const { allowedTools, disallowedTools } = codegenToolOptions()
    expect(allowedTools).toEqual(['Read', 'Edit', 'Write', 'Glob', 'Grep'])
    for (const t of ['Bash', 'WebFetch', 'WebSearch', 'Task']) expect(disallowedTools).toContain(t)
  })

  it('every mode\'s session is created with those rules', () => {
    for (const mode of ['gesture', 'design', 'screenshot'] as const) {
      captured.length = 0
      const s = createCodegenSession('/tmp/app', mode, { onStage: () => undefined })
      s.close()
      expect(captured).toHaveLength(1)
      const opts = captured[0]!
      expect(opts.cwd).toBe('/tmp/app')
      for (const rule of PRIVATE_STATE_DENY) expect(opts.disallowedTools).toContain(rule)
    }
  })

  it('the contract override used by run2 does not drop the rules', () => {
    captured.length = 0
    createCodegenSession('/tmp/app', 'design', { onStage: () => undefined }, 'custom system').close()
    for (const rule of PRIVATE_STATE_DENY) expect(captured[0]!.disallowedTools).toContain(rule)
  })
})
