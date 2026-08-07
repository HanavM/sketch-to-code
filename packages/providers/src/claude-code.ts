import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { PerceptionProvider, TextRegionRef } from './types.js'

/**
 * Perception via the user's Claude Code (subscription auth, no API key).
 * One single-turn call transcribing all labeled regions at once.
 */
export function createClaudeCodeProvider(): PerceptionProvider {
  return {
    name: 'claude-code',
    async transcribe(png: Buffer, regions: TextRegionRef[]): Promise<Record<string, string>> {
      if (regions.length === 0) return {}

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

      const q = query({
        prompt: messages(),
        options: {
          tools: [],
          maxTurns: 1,
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

      let out: Record<string, string> = {}
      for await (const msg of q) {
        if (msg.type === 'result' && msg.subtype === 'success') {
          const so = msg.structured_output as { regions?: Array<{ id: string; text: string }> } | undefined
          if (so?.regions) out = Object.fromEntries(so.regions.map((r) => [r.id, r.text]))
        }
      }
      return out
    },
  }
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
