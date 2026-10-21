import { appendFileSync } from 'node:fs'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { scriptedModel } from './scripted.js'
import type { InterpretRequest, InterpretResponse, PerceptionProvider, TextRegionRef, TranscribeResult } from './types.js'

/**
 * Perception via the user's Claude Code (subscription auth, no API key).
 * One call per question; no tools, so the model cannot wander.
 *
 * maxTurns is NOT 1: `outputFormat: json_schema` arrives through an end-turn
 * tool (a tool_use carrier plus its tool_result), so a cap of 1 leaves ZERO
 * headroom — any preamble turn or schema-validation retry ends the call in
 * error_max_turns, which the SDK throws as "interpret failed". That made it
 * intermittent: fine while the model answered in one step, broken the moment
 * it took two. With tools:[] the model can't wander, so the extra turns buy
 * nothing but that headroom.
 *
 * 2026-10-21 (n41): 4 was still too tight. Traced design readings: the first
 * StructuredOutput call often wraps the answer as {"actions": {...}} and is
 * rejected, so a good reading already takes 3 turns; one more bad attempt
 * (bad JSON, a missing key) and turn 4 ends it in error_max_turns. 6 leaves
 * two retries; a retry costs only when it happens.
 */
const PERCEPTION_MAX_TURNS = 6

/**
 * s2c-056: a perception call had no time limit. With the API unreachable the
 * Claude Code process keeps retrying while the bar says "reading your
 * drawing…" (measured 2026-10-18: a bare call threw "Unable to connect to API"
 * only after 179 s; the bench page gave up at 100 s). Two minutes is past every
 * reading the rough bench timed; past it the person gets "press ▶ Run to try
 * again" and the cause. S2C_READING_TIMEOUT_MS overrides it.
 * n41 (2026-10-21): round-3 design readings take 60-75s with ONE schema retry
 * (6-7k output tokens each attempt), so a second retry passes 120s and timed
 * out; three minutes leaves room for two.
 */
export function perceptionTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.S2C_READING_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 180_000
}

/** Run one perception query under the time limit; the timer is cleared either way. */
async function underTimeLimit<T>(work: (abort: AbortController) => Promise<T>): Promise<T> {
  const abort = new AbortController()
  const ms = perceptionTimeoutMs()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; abort.abort() }, ms)
  try {
    return await work(abort)
  } catch (err) {
    if (timedOut) {
      throw new PerceptionFailure(
        `the model didn't answer within ${Math.round(ms / 1000)}s (is Claude Code signed in, and is this machine online?)`,
        { input: 0, cacheRead: 0, output: 0 },
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export function createClaudeCodeProvider(): PerceptionProvider {
  if (scriptedModel()) throw new Error('a scripted model is set: the real Claude Code provider is unreachable')
  return {
    name: 'claude-code',
    async interpretIntent(req: InterpretRequest): Promise<InterpretResponse> {
      async function* messages(): AsyncGenerator<SDKUserMessage> {
        yield {
          type: 'user',
          parent_tool_use_id: null,
          message: {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: req.png.toString('base64') },
              },
              { type: 'text', text: req.brief },
            ],
          },
        }
      }
      return underTimeLimit(async (abort) => {
      const q = query({
        prompt: messages(),
        options: {
          abortController: abort,
          tools: [],
          maxTurns: PERCEPTION_MAX_TURNS,
          persistSession: false,
          settingSources: [],
          systemPrompt: req.prompt,
          env: cleanEnv(),
          outputFormat: { type: 'json_schema', schema: req.schema },
        },
      })
      let raw: unknown = {}
      const usage = { input: 0, cacheRead: 0, output: 0 }
      let failure: string | null = 'the model session ended without an answer'
      let lastAttempt: unknown = undefined
      for await (const msg of q) {
        traceReading(msg)
        const attempt = structuredAttempt(msg)
        if (attempt !== undefined) lastAttempt = attempt
        if (msg.type === 'result') {
          failure = readingFailure(msg)
          if (!failure) raw = (msg as { structured_output?: unknown }).structured_output
          else {
            // round 1 (2026-10-20): 1 of 9 page readings ran out of turns
            // re-sending the same answer with `"unclear": ,` (bad JSON); a
            // third of readings first wrapped the answer as {"actions": {...}}.
            // The answer itself was right both times: recover it here.
            const saved = salvageReading(lastAttempt, req.schema)
            if (saved !== undefined) { raw = saved; failure = null }
          }
          const u = msg.usage
          usage.input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
          usage.cacheRead += u.cache_read_input_tokens ?? 0
          usage.output += u.output_tokens ?? 0
        }
      }
      // s2c-056: a reading that ended in error used to come back as raw {},
      // which interpretV2 reported as "interpreter returned malformed output":
      // the real cause (max turns, schema retries, an API error) was lost, and
      // so were the tokens it cost.
      if (failure) throw new PerceptionFailure(failure, usage)
      return { raw, usage }
      })
    },
    async transcribe(png: Buffer, regions: TextRegionRef[]): Promise<TranscribeResult> {
      if (regions.length === 0) return { texts: {}, usage: { input: 0, cacheRead: 0, output: 0 } }

      async function* messages(): AsyncGenerator<SDKUserMessage> {
        yield {
          type: 'user',
          parent_tool_use_id: null,
          message: {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: png.toString('base64'),
                },
              },
              {
                type: 'text',
                text:
                  `The image shows hand-drawn ink from a sketching overlay. Blue badges label ` +
                  `handwriting regions with ids (${regions.map((r) => r.id).join(', ')}). ` +
                  `Transcribe what the handwriting in each labeled region says.`,
              },
            ],
          },
        }
      }

      return underTimeLimit(async (abort) => {
      const q = query({
        prompt: messages(),
        options: {
          abortController: abort,
          tools: [],
          maxTurns: PERCEPTION_MAX_TURNS,
          persistSession: false,
          settingSources: [],
          systemPrompt: 'You transcribe handwriting precisely. No commentary.',
          env: cleanEnv(),
          outputFormat: {
            type: 'json_schema',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['regions'],
              properties: {
                regions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'text'],
                    properties: {
                      id: { type: 'string' },
                      text: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      })

      let texts: Record<string, string> = {}
      const usage = { input: 0, cacheRead: 0, output: 0 }
      for await (const msg of q) {
        if (msg.type === 'result') {
          if (msg.subtype === 'success') {
            const so = msg.structured_output as { regions?: Array<{ id: string; text: string }> } | undefined
            if (so?.regions) texts = Object.fromEntries(so.regions.map((r) => [r.id, r.text]))
          }
          const u = msg.usage
          usage.input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
          usage.cacheRead += u.cache_read_input_tokens ?? 0
          usage.output += u.output_tokens ?? 0
        }
      }
      return { texts, usage }
      })
    },
  }
}

/** The input of a StructuredOutput tool call in an assistant message, if any. */
function structuredAttempt(msg: unknown): unknown {
  const m = msg as { type?: string; message?: { content?: Array<{ type?: string; name?: string; input?: unknown }> } }
  if (m.type !== 'assistant' || !Array.isArray(m.message?.content)) return undefined
  const call = m.message.content.find((c) => c.type === 'tool_use' && c.name === 'StructuredOutput')
  return call?.input
}

/**
 * Recover an answer from the model's last StructuredOutput attempt when the SDK
 * gave up on it: unwrap {"<key>": {...the answer...}}, and repair JSON whose
 * only fault is an empty value (`"unclear": ,` -> null). Returns undefined
 * unless the result has every top-level key the schema requires.
 */
export function salvageReading(attempt: unknown, schema: unknown): unknown {
  const required = ((schema as { required?: unknown })?.required ?? []) as string[]
  const complete = (o: unknown): o is Record<string, unknown> =>
    !!o && typeof o === 'object' && !Array.isArray(o) && required.every((k) => k in (o as object))
  let cand: unknown = attempt
  const unparsed = (cand as { __unparsedToolInput?: { raw?: unknown } } | null)?.__unparsedToolInput?.raw
  if (typeof unparsed === 'string') {
    try {
      cand = JSON.parse(unparsed.replace(/:\s*(?=[,}\]])/g, ': null'))
    } catch { return undefined }
  }
  if (required.length === 0) return undefined
  if (complete(cand)) return cand
  if (cand && typeof cand === 'object') {
    const vals = Object.values(cand as object)
    if (vals.length === 1 && complete(vals[0])) return vals[0]
  }
  return undefined
}

/** A model call that ended without a usable answer; carries what it cost. */
export class PerceptionFailure extends Error {
  constructor(message: string, readonly usage: { input: number; cacheRead: number; output: number }) {
    super(message)
    this.name = 'PerceptionFailure'
  }
}

/** The fields of an SDK result message this provider reads. */
export interface ResultLike {
  subtype: string
  num_turns?: number
  stop_reason?: string | null
  duration_ms?: number
  errors?: string[]
  structured_output?: unknown
}

/**
 * Why a structured-output result is not a usable answer, in one line a log
 * (and the bench row) can keep; null when it is usable.
 */
export function readingFailure(msg: ResultLike): string | null {
  const secs = typeof msg.duration_ms === 'number' ? `, ${(msg.duration_ms / 1000).toFixed(0)}s` : ''
  const turns = typeof msg.num_turns === 'number' ? ` after ${msg.num_turns} turn${msg.num_turns === 1 ? '' : 's'}` : ''
  if (msg.subtype === 'success') {
    if (msg.structured_output !== undefined && msg.structured_output !== null) return null
    return `the model answered without the structured reading (stop: ${msg.stop_reason ?? 'unknown'}${turns}${secs})`
  }
  const first = msg.errors?.find((e) => e.trim())
  const why = first ? `: ${first.trim().slice(0, 200)}` : ''
  return `the model's reading ended in ${msg.subtype}${turns}${secs}${why}`
}

/** Subscription auth: strip API-key vars that would silently hijack billing. */
export function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
  env.CLAUDE_AGENT_SDK_CLIENT_APP = 'sketch-to-code/0.1.0'
  return env
}

/** S2C_TRACE_READING=<file>: append every SDK message of a reading as one JSON line (debugging failed readings). */
function traceReading(msg: unknown): void {
  const file = process.env.S2C_TRACE_READING
  if (!file) return
  try {
    const line = JSON.stringify(msg, (_k, v) => (typeof v === 'string' && v.length > 4000 ? v.slice(0, 4000) + '…' : v))
    appendFileSync(file, line + '\n')
  } catch { /* tracing never breaks a reading */ }
}
