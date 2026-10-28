import { query, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { cleanEnv, scriptedModel, type ScriptedModel, type TokenUsage } from '@s2c/providers'
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

/**
 * `.sketch2code/` is this tool's memory, not the user's code, and the codegen
 * agent must neither read it nor write it.
 *
 * It holds the component library (index.json carries portable component
 * SOURCE), every past run's prompts, replies and scaffolds, and the drawn
 * rules. Gitignoring it does not hide it: the agent's Glob runs ripgrep with
 * --no-ignore --hidden, so `**\/*` lists it in any project, and Read/Write take
 * any path under cwd. Checked against the bundled CLI with a mocked model
 * (seed2tree s2c-007): before this, Glob listed the library and old run
 * bundles, Read returned a stale entry's source, and Write overwrote the
 * library index. That is a route by which last week's drawing can turn up in
 * today's edit, and by which the agent could corrupt the library outright.
 *
 * Deny rules rather than a prompt line: rules are enforced by the tool layer
 * (Read rules also filter Glob and Grep), a sentence is a request.
 */
export const PRIVATE_STATE_DENY = ['Read(./.sketch2code/**)', 'Edit(./.sketch2code/**)'] as const

/**
 * The codegen agent's tool permissions; exported so tests can assert them.
 *
 * `tools` is the base set the agent can see at all. `allowedTools` only
 * pre-approves; without a base set the agent still saw Skill, ToolSearch and
 * the rest, and round-3 c1's build spent 3 ToolSearch calls and a Skill call
 * (112k billed) on nothing the page needed.
 */
export const CODEGEN_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep'] as const

export function codegenToolOptions(): { tools: string[]; allowedTools: string[]; disallowedTools: string[] } {
  return {
    tools: [...CODEGEN_TOOLS],
    allowedTools: [...CODEGEN_TOOLS],
    disallowedTools: ['Bash', 'WebFetch', 'WebSearch', 'Task', ...PRIVATE_STATE_DENY],
  }
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
  /** Tool calls the agent has made so far (Read, Edit, ...): where a costly turn went. */
  toolCalls: () => number
  /** Each tool call so far as "Name dir/file" (Edit app/page.tsx): which calls made a turn long. */
  toolLog: () => string[]
  /** When the agent last said anything (ms epoch): how a stalled turn is told from a slow one. */
  lastActivity: () => number
  /**
   * When the agent last did something that moves the turn on (ms epoch): a tool
   * call, a tool result, reply text, a turn end. Thinking alone is not progress
   * (n20 try 2: a repair turn thought for 8 minutes with no edit, and each
   * thinking message reset the watchdog).
   */
  lastProgress: () => number
  /** When the agent last edited or wrote a file (ms epoch), or the current turn began. */
  lastEdit: () => number
  close: () => void
  /**
   * Resolves once the agent's message loop has ended, i.e. the subprocess is
   * gone and can't write any more. close() only asks; this is how a caller
   * waits for the answer before telling the user the run has stopped.
   */
  closed: Promise<void>
}

/** Tool calls that change the page's source. */
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/**
 * Does this agent message move the turn on? Tool calls, tool results, reply
 * text and turn ends do. An assistant message that is only thinking does not,
 * and neither do system notices.
 */
export function movesTurnOn(msg: { type: string; message?: unknown }): boolean {
  if (msg.type === 'user' || msg.type === 'result' || msg.type === 'tool_progress') return true
  if (msg.type !== 'assistant') return false
  const m = msg.message
  const content = m && typeof m === 'object' ? (m as { content?: unknown }).content : undefined
  if (!Array.isArray(content)) return true
  return content.some((b: { type?: string; text?: string }) =>
    b.type !== 'thinking' && b.type !== 'redacted_thinking' && !(b.type === 'text' && !b.text?.trim()))
}

/** The error a run rejects with when it was told to stop. */
export function abortError(signal: AbortSignal): Error {
  const r: unknown = signal.reason
  if (r instanceof Error) return r
  return new Error(typeof r === 'string' ? r : 'run stopped')
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
  /** Aborting it kills the agent: pending turns reject, no further edits. */
  signal?: AbortSignal,
): CodegenSession {
  const script = scriptedModel()
  if (script) return scriptedSession(script, appRoot, ev, signal)
  const inputQueue: SDKUserMessage[] = []
  let notify: (() => void) | null = null
  let ended = false
  const pending: QueueItem[] = []
  const usage: TokenUsage = { input: 0, cacheRead: 0, output: 0 }
  let tools = 0
  const toolList: string[] = []
  let lastSeen = Date.now()
  let lastMoved = lastSeen
  let lastEdited = lastSeen

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

  // The SDK's own cancel: aborting it tears the subprocess down, which is the
  // only thing that actually stops an Edit tool call already queued.
  const abortController = new AbortController()
  const q: Query = query({
    prompt: input(),
    options: {
      abortController,
      cwd: appRoot,
      permissionMode: 'acceptEdits',
      ...codegenToolOptions(),
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
  const closed = (async () => {
    try {
      let buffer = ''
      for await (const msg of q) {
        lastSeen = Date.now()
        if (movesTurnOn(msg)) lastMoved = lastSeen
        if (msg.type === 'assistant') {
          for (const block of msg.message.content) {
            if (block.type === 'text') buffer += block.text
            if (block.type === 'tool_use') {
              if (EDIT_TOOLS.has(block.name)) lastEdited = lastSeen
              tools++
              const inp = block.input as Record<string, unknown>
              const file = typeof inp.file_path === 'string' ? inp.file_path.split('/').slice(-2).join('/') : ''
              toolList.push(`${block.name} ${file}`.trim())
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
      for (const item of pending.splice(0)) {
        item.reject(signal?.aborted ? abortError(signal) : new Error('codegen session ended unexpectedly'))
      }
    } catch (err) {
      for (const item of pending.splice(0)) {
        item.reject(signal?.aborted ? abortError(signal) : err instanceof Error ? err : new Error(String(err)))
      }
    }
  })()

  const close = (): void => {
    ended = true
    notify?.()
    q.close()
  }
  const onAbort = (): void => {
    // reject first: the caller is awaiting send(), and must see WHY it ended
    for (const item of pending.splice(0)) item.reject(abortError(signal!))
    abortController.abort(signal!.reason)
    close()
  }
  if (signal?.aborted) queueMicrotask(onAbort)
  else signal?.addEventListener('abort', onAbort, { once: true })
  void closed.finally(() => signal?.removeEventListener('abort', onAbort))

  return {
    send(content: UserContent): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortError(signal))
          return
        }
        if (ended) {
          reject(new Error('codegen session already closed'))
          return
        }
        pending.push({ resolve, reject })
        lastSeen = lastMoved = lastEdited = Date.now()
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
    toolCalls: () => tools,
    toolLog: () => [...toolList],
    lastActivity: () => lastSeen,
    lastProgress: () => lastMoved,
    lastEdit: () => lastEdited,
    close,
    closed,
  }
}

/**
 * The codegen session while a scripted model is set (tests only, see
 * @s2c/providers scripted.ts): each turn is handed to the script, which writes
 * files the way the agent would. Same abort contract as the real one.
 */
function scriptedSession(
  script: ScriptedModel,
  appRoot: string,
  ev: CodegenEvents,
  signal?: AbortSignal,
): CodegenSession {
  let ended = false
  let turn = 0
  let lastSeen = Date.now()
  return {
    async send(content: UserContent): Promise<string> {
      if (signal?.aborted) throw abortError(signal)
      if (ended) throw new Error('codegen session already closed')
      lastSeen = Date.now()
      script.onCall?.('codegen', content.text.slice(0, 200))
      if (!script.codegen) throw new Error('scripted model: codegen is not scripted')
      ev.onStage('codegen', 'scripted edit')
      const reply = await script.codegen({ root: appRoot, text: content.text, turn: ++turn })
      lastSeen = Date.now()
      if (signal?.aborted) throw abortError(signal)
      return reply
    },
    usage: () => ({ input: 0, cacheRead: 0, output: 0 }),
    toolCalls: () => 0,
    toolLog: () => [],
    lastActivity: () => lastSeen,
    lastProgress: () => lastSeen,
    lastEdit: () => lastSeen,
    close: () => { ended = true },
    closed: Promise.resolve(),
  }
}
