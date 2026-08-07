import { query, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { cleanEnv } from '@s2c/providers'
import type { EditPlan } from '@s2c/intent'

const EDIT_CONTRACT = `
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

export interface CodegenEvents {
  onStage: (stage: string, detail?: string) => void
}

export interface CodegenSession {
  /** Send the initial edit plan; resolves with the assistant's summary. */
  run: (plan: EditPlan, inkPngBase64: string) => Promise<string>
  /** Follow-up repair round in the same session. */
  followUp: (message: string) => Promise<string>
  close: () => void
}

interface QueueItem {
  resolve: (v: string) => void
  reject: (e: Error) => void
}

export function createCodegenSession(appRoot: string, ev: CodegenEvents): CodegenSession {
  const inputQueue: SDKUserMessage[] = []
  let notify: (() => void) | null = null
  let ended = false
  const pending: QueueItem[] = []

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
      systemPrompt: { type: 'preset', preset: 'claude_code', append: EDIT_CONTRACT },
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
          const item = pending.shift()
          if (msg.subtype === 'success') {
            item?.resolve(buffer || msg.result)
          } else {
            item?.reject(new Error(`codegen ${msg.subtype}: ${'errors' in msg ? msg.errors.join('; ') : ''}`))
          }
          buffer = ''
        }
      }
      // stream ended: fail anything still waiting
      for (const item of pending.splice(0)) item.reject(new Error('codegen session ended unexpectedly'))
    } catch (err) {
      for (const item of pending.splice(0)) {
        item.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
  })()

  const send = (message: SDKUserMessage): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      if (ended) {
        reject(new Error('codegen session already closed'))
        return
      }
      pending.push({ resolve, reject })
      inputQueue.push(message)
      notify?.()
      notify = null
    })

  return {
    run(plan, inkPngBase64) {
      ev.onStage('codegen', 'sending edit plan to Claude Code')
      return send({
        type: 'user',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: inkPngBase64 },
            },
            {
              type: 'text',
              text: `EDIT PLAN:\n${JSON.stringify(plan.ops, null, 2)}\n\nImplement every op now.`,
            },
          ],
        },
      })
    },
    followUp(message) {
      ev.onStage('repair', 'sending follow-up')
      return send({
        type: 'user',
        parent_tool_use_id: null,
        message: { role: 'user', content: message },
      })
    },
    close() {
      ended = true
      notify?.()
      q.close()
    },
  }
}
