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
 */
const PERCEPTION_MAX_TURNS = 4

/**
 * s2c-056: a perception call had no time limit. With the API unreachable the
 * Claude Code process keeps retrying while the bar says "reading your
 * drawing…" (measured 2026-10-18: a bare call threw "Unable to connect to API"
 * only after 179 s; the bench page gave up at 100 s). Two minutes is past every
 * reading the rough bench timed; past it the person gets "press ▶ Run to try
 * again" and the cause. S2C_READING_TIMEOUT_MS overrides it.
 */
export function perceptionTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.S2C_READING_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 120_000
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
      for await (const msg of q) {
        if (msg.type === 'result') {
          failure = readingFailure(msg)
          if (!failure) raw = (msg as { structured_output?: unknown }).structured_output
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
