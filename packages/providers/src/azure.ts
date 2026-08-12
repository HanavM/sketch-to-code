import { AzureOpenAI } from 'openai'
import type { PerceptionProvider, TextRegionRef, TranscribeResult } from './types.js'

export function azureConfigured(env = process.env): boolean {
  return Boolean(env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_DEPLOYMENT)
}

/**
 * Azure OpenAI perception provider. Activates when AZURE_OPENAI_ENDPOINT,
 * AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT are set (deployment must be
 * a vision-capable model). Uses strict json_schema output.
 */
export function createAzureProvider(env = process.env): PerceptionProvider {
  const client = new AzureOpenAI({
    endpoint: env.AZURE_OPENAI_ENDPOINT!,
    apiKey: env.AZURE_OPENAI_API_KEY!,
    apiVersion: env.AZURE_OPENAI_API_VERSION ?? '2024-10-21',
    deployment: env.AZURE_OPENAI_DEPLOYMENT!,
  })
  const deployment = env.AZURE_OPENAI_DEPLOYMENT!

  return {
    name: `azure:${deployment}`,
    async transcribe(png: Buffer, regions: TextRegionRef[]): Promise<TranscribeResult> {
      if (regions.length === 0) return { texts: {}, usage: { input: 0, cacheRead: 0, output: 0 } }
      const schema = {
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
      }
      const res = await client.chat.completions.create({
        model: deployment,
        max_completion_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${png.toString('base64')}` },
              },
              {
                type: 'text',
                text:
                  `The image shows hand-drawn ink. Blue badges label handwriting regions with ids. ` +
                  `Transcribe what the handwriting in each region says. Region ids: ${regions.map((r) => r.id).join(', ')}. ` +
                  `Return every id with your best-effort transcription (empty string if illegible).`,
              },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'transcriptions', strict: true, schema },
        },
      })
      const raw = res.choices[0]?.message?.content ?? '{"regions":[]}'
      const parsed = JSON.parse(raw) as { regions: Array<{ id: string; text: string }> }
      return {
        texts: Object.fromEntries(parsed.regions.map((r) => [r.id, r.text])),
        usage: {
          input:
            (res.usage?.prompt_tokens ?? 0) -
            (res.usage?.prompt_tokens_details?.cached_tokens ?? 0),
          cacheRead: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          output: res.usage?.completion_tokens ?? 0,
        },
      }
    },
  }
}
