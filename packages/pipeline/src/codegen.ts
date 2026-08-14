import { query, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { cleanEnv, type TokenUsage } from '@s2c/providers'
import { SKETCH_SKILL } from './skill.js'

export type RunMode = 'gesture' | 'design' | 'screenshot'

const GESTURE_CONTRACT = `
You are the codegen stage of sketch-to-code: the user drew editing gestures over
their RUNNING app, and a deterministic pipeline already resolved WHAT to change
and WHERE. Your job is only to write the code.

You receive an EDIT PLAN: a list of ops. Each op carries:
- "srcLoc": "path/to/File.tsx:LINE:COL" — the JSX opening element of the target
  in the source AS IT WAS WHEN THE PLAN WAS MADE (verified stamps, not guesses).
  If an earlier op already edited that file, line numbers below the edit have
  shifted — re-locate the element by its tag/text/class context, not the line.
- the element's tag, text, classes, and computed-style context
- "instruction": transcribed handwriting from the user, when present
- an attached image showing the raw ink, for tone/context only

Rules:
- Open the file at srcLoc and make the MINIMAL edit implementing the op.
- DELETE: remove the element. If it's rendered from an array .map(), remove the
  matching data entry instead of the JSX when that's the cleaner minimal edit.
- MODIFY: apply the instruction to that element (classes/props/text/structure).
- ADD: create a new element inside the container, matching the sketch's shape,
  size and position intent, styled consistently with sibling code.
- MOVE: relocate the source element before/after the destination element.
- INSERT: add content at the indicated spot.
- Match the file's existing style EXACTLY: Tailwind idiom, quote style,
  indentation, component conventions. Do not reformat untouched lines.
- Never touch files other than those the ops point into. Never add dependencies.
- Scope discipline: implement the ops, nothing more.
After editing, reply with one line per op: "op N: <what you did>".
`.trim()

const DESIGN_CONTRACT = `
You are the codegen stage of sketch-to-code in DESIGN mode: the user sketched a
piece of UI over their RUNNING app, and you implement that design in the app's
real source code.

You receive:
- an image of the sketch, with id badges on recognized shapes (gestalt only)
- a LEGEND: recognized shapes/text as JSON. Per shape: {id, kind, bbox} in
  exact page coordinates, plus for unknown/organic shapes an exact "svgPath"
  (fitted cubic beziers, bbox-local pixel coords — drop into
  <svg viewBox="0 0 <bbox.w> <bbox.h>">), plus "layerHint" and overlap lists
  (pathCrossesElements / enclosesElements). Transcribed handwriting per text
  region.
- DOM CONTEXT: the element(s) under/around the sketch region, with their source
  locations (file:line:col), so you know exactly which file and container the
  design belongs in.

Rules:
- Implement the sketched design at the sketched location in the app. Create or
  extend components in the same style the app already uses.
- The recognized-shape legend is ground truth for WHERE things are and WHAT the
  handwriting says; the image is ground truth for what things LOOK like. When
  they seem to conflict, trust the legend for geometry/text, the image for form.
- Keep the rest of the page untouched. Never add dependencies.
After editing, reply with: files changed, what you built, assumptions made.
`.trim()

const SCREENSHOT_CONTRACT = `
You are the codegen stage of sketch-to-code in SCREENSHOT mode (benchmark): you
get ONLY a screenshot of the user's browser — their running app with their
hand-drawn ink on top. No recognized shapes, no DOM data, no source locations.

- Work out what the ink is asking for (edit commands and/or a design sketch)
  and find the right source files yourself (the app source is in your cwd;
  JSX elements carry data-s2c="file:line:col" attributes in dev — you may grep
  for text you see in the screenshot).
- Then implement it, matching the app's existing code style.
After editing, reply with: what you understood the ink to mean, files changed,
and assumptions made.
`.trim()

const CONTRACTS: Record<RunMode, string> = {
  gesture: GESTURE_CONTRACT,
  design: DESIGN_CONTRACT,
  screenshot: SCREENSHOT_CONTRACT,
}

export function contractFor(mode: RunMode): string {
  return `${CONTRACTS[mode]}\n\n${SKETCH_SKILL}`
}

export interface CodegenEvents {
  onStage: (stage: string, detail?: string) => void
}

export interface UserContent {
  text: string
  /** base64 PNGs, sent before the text block. */
  images?: string[]
}

export interface CodegenSession {
  /** Send a user turn; resolves with the assistant's text reply. */
  send: (content: UserContent) => Promise<string>
  /** Cumulative token usage across all turns so far. */
  usage: () => TokenUsage
  close: () => void
}

interface QueueItem {
  resolve: (v: string) => void
  reject: (e: Error) => void
}

export function createCodegenSession(
  appRoot: string,
  mode: RunMode,
  ev: CodegenEvents,
  contractOverride?: string,
): CodegenSession {
  const inputQueue: SDKUserMessage[] = []
  let notify: (() => void) | null = null
  let ended = false
  const pending: QueueItem[] = []
  const usage: TokenUsage = { input: 0, cacheRead: 0, output: 0 }

  async function* input(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      if (inputQueue.length > 0) {
        yield inputQueue.shift()!
        continue
      }
      if (ended) return
      await new Promise<void>((r) => {
        notify = r
      })
    }
  }

  const q: Query = query({
    prompt: input(),
    options: {
      cwd: appRoot,
      permissionMode: 'acceptEdits',
      allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
      disallowedTools: ['Bash', 'WebFetch', 'WebSearch', 'Task'],
      settingSources: [],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: contractOverride ?? contractFor(mode) },
      persistSession: false,
      maxTurns: 40,
      env: cleanEnv(),
      strictMcpConfig: true,
      stderr: (d) => {
        if (d.includes('Error')) ev.onStage('codegen', `stderr: ${d.slice(0, 120)}`)
      },
    },
  })

  // single consumer loop dispatches results to pending waiters
  ;(async () => {
    try {
      let buffer = ''
      for await (const msg of q) {
        if (msg.type === 'assistant') {
          for (const block of msg.message.content) {
            if (block.type === 'text') buffer += block.text
            if (block.type === 'tool_use') {
              const inp = block.input as Record<string, unknown>
              const file = typeof inp.file_path === 'string' ? inp.file_path.split('/').slice(-2).join('/') : ''
              ev.onStage('codegen', `${block.name} ${file}`.trim())
            }
          }
        } else if (msg.type === 'result') {
          const u = msg.usage
          usage.input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
          usage.cacheRead += u.cache_read_input_tokens ?? 0
          usage.output += u.output_tokens ?? 0
          const item = pending.shift()
          if (msg.subtype === 'success') {
            item?.resolve(buffer || msg.result)
          } else {
            item?.reject(new Error(`codegen ${msg.subtype}: ${'errors' in msg ? msg.errors.join('; ') : ''}`))
          }
          buffer = ''
        }
      }
      for (const item of pending.splice(0)) item.reject(new Error('codegen session ended unexpectedly'))
    } catch (err) {
      for (const item of pending.splice(0)) {
        item.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
  })()

  return {
    send(content: UserContent): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        if (ended) {
          reject(new Error('codegen session already closed'))
          return
        }
        pending.push({ resolve, reject })
        inputQueue.push({
          type: 'user',
          parent_tool_use_id: null,
          message: {
            role: 'user',
            content: [
              ...(content.images ?? []).map((data) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: 'image/png' as const, data },
              })),
              { type: 'text' as const, text: content.text },
            ],
          },
        })
        notify?.()
        notify = null
      })
    },
    usage: () => ({ ...usage }),
    close() {
      ended = true
      notify?.()
      q.close()
    },
  }
}
