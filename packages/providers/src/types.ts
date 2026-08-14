export interface TextRegionRef {
  id: string
  /** Bbox in the coordinate space of the provided image. */
  bbox: { x: number; y: number; w: number; h: number }
}

export interface TokenUsage {
  /** Fresh (uncached) input tokens. */
  input: number
  /** Prompt-cache read tokens (~10x cheaper than fresh input). */
  cacheRead: number
  output: number
}

export interface TranscribeResult {
  texts: Record<string, string>
  usage: TokenUsage
}

/**
 * The only things a model is ever asked in the perception stage: read
 * handwriting, and (optionally) break ties geometry can't. It is never asked
 * where anything is.
 */
export interface InterpretRequest {
  /** Composite evidence image (ink over page wireframe). */
  png: Buffer
  /** Evidence JSON (strokes, element menu, hints). */
  brief: string
  /** System-style instruction for the interpretation task. */
  prompt: string
  /** JSON schema the answer must satisfy. */
  schema: Record<string, unknown>
}

export interface InterpretResponse {
  raw: unknown
  usage: TokenUsage
}

export interface PerceptionProvider {
  name: string
  /** Transcribe each labeled handwriting region in the PNG. */
  transcribe(png: Buffer, regions: TextRegionRef[]): Promise<TranscribeResult>
  /** One-shot multimodal intent interpretation (structured output). */
  interpretIntent(req: InterpretRequest): Promise<InterpretResponse>
}

export const ZERO_USAGE: TokenUsage = { input: 0, cacheRead: 0, output: 0 }

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input: a.input + b.input,
    cacheRead: a.cacheRead + b.cacheRead,
    output: a.output + b.output,
  }
}
