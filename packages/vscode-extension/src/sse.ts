/**
 * A ~40-line SSE frame parser. Node has no EventSource, and pulling one in for
 * a dev-only bridge would be a dependency for nothing: the wire format is two
 * fields and a blank line.
 *
 * Pure and feed-based (bytes arrive in arbitrary chunks, so a frame can be
 * split anywhere), which also makes it directly unit-testable without a socket.
 */

export interface SseFrame {
  event: string
  data: string
}

export class SseParser {
  private buf = ''

  /**
   * Feed a decoded chunk; get back every COMPLETE frame it finished.
   * Comment lines (`: ping`) are heartbeats — they are not frames, but they do
   * prove the socket is alive, which the caller learns from any chunk landing.
   */
  feed(chunk: string): SseFrame[] {
    // normalize the line endings the spec allows before splitting on \n\n
    this.buf += chunk.replace(/\r\n|\r/g, '\n')
    const frames: SseFrame[] = []
    let idx = this.buf.indexOf('\n\n')
    while (idx !== -1) {
      const block = this.buf.slice(0, idx)
      this.buf = this.buf.slice(idx + 2)
      const frame = parseBlock(block)
      if (frame) frames.push(frame)
      idx = this.buf.indexOf('\n\n')
    }
    return frames
  }

  reset(): void {
    this.buf = ''
  }
}

function parseBlock(block: string): SseFrame | null {
  let event = 'message'
  const data: string[] = []
  for (const raw of block.split('\n')) {
    if (raw === '' || raw.startsWith(':')) continue
    const colon = raw.indexOf(':')
    const field = colon === -1 ? raw : raw.slice(0, colon)
    // one optional space after the colon belongs to the format, not the value
    let value = colon === -1 ? '' : raw.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  if (data.length === 0) return null
  return { event, data: data.join('\n') }
}

/** JSON.parse that answers null instead of throwing on a truncated payload. */
export function parseJson<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T
  } catch {
    return null
  }
}
