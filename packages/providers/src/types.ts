export interface TextRegionRef {
  id: string
  /** Bbox in the coordinate space of the provided image. */
  bbox: { x: number; y: number; w: number; h: number }
}

/**
 * The only things a model is ever asked: read handwriting, and (optionally)
 * break ties geometry can't. It is never asked where anything is.
 */
export interface PerceptionProvider {
  name: string
  /** Transcribe each labeled handwriting region in the PNG. */
  transcribe(png: Buffer, regions: TextRegionRef[]): Promise<Record<string, string>>
}
