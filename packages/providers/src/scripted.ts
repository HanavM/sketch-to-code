import type { InterpretRequest, InterpretResponse, PerceptionProvider, TranscribeResult } from './types.js'

/**
 * A scripted stand-in for every model call, for end-to-end tests that must
 * walk the whole product (real dev server, real overlay, real grounding,
 * verification, probes, undo) without a single paid token (s2c-010).
 *
 * In-process only: there is no environment variable that turns it on, so a
 * user's dev server can never end up talking to a script. A test that boots
 * vite in its own process imports this module (same realpath as the one the
 * plugin loads) and sets it.
 *
 * While a script is set, the REAL model is unreachable: the default providers
 * return the script, the codegen session uses the script, and
 * createClaudeCodeProvider() throws. A script that doesn't cover a call throws
 * too, so a path nobody scripted fails loudly instead of quietly paying.
 */
export interface ScriptedModel {
  /** Answer one interpretation call: return the raw structured answer. */
  interpret?: (req: InterpretRequest) => unknown | Promise<unknown>
  /**
   * One codegen turn. Write files under `root` as the agent would, return the
   * agent's text reply.
   */
  codegen?: (turn: { root: string; text: string; turn: number }) => string | Promise<string>
  /** Called with every call made, for the test to count and assert on. */
  onCall?: (kind: 'interpret' | 'codegen' | 'transcribe', detail: string) => void
}

// On globalThis, not in module scope: vite may bundle a linked plugin (and
// what it imports) into the config, so the test's copy of this module and the
// one the dev server runs can be different instances in the same process.
const KEY = Symbol.for('s2c.scriptedModel')
type Holder = { [KEY]?: ScriptedModel | null }

export function setScriptedModel(m: ScriptedModel | null): void {
  ;(globalThis as Holder)[KEY] = m
}

export function scriptedModel(): ScriptedModel | null {
  return (globalThis as Holder)[KEY] ?? null
}

const ZERO = { input: 0, cacheRead: 0, output: 0 }

export function scriptedProvider(m: ScriptedModel): PerceptionProvider {
  return {
    name: 'scripted',
    async transcribe(): Promise<TranscribeResult> {
      m.onCall?.('transcribe', '')
      throw new Error('scripted model: transcribe is not scripted')
    },
    async interpretIntent(req: InterpretRequest): Promise<InterpretResponse> {
      m.onCall?.('interpret', req.brief.slice(0, 200))
      if (!m.interpret) throw new Error('scripted model: interpret is not scripted')
      return { raw: await m.interpret(req), usage: ZERO }
    },
  }
}
