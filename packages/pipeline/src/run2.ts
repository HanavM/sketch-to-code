/**
 * v2 pipeline: model-led intent over owned geometry.
 * interpretV2()  — evidence → one multimodal call → grounded, validated intent
 * runV2()        — grounded intent → codegen → per-action verification
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Stroke } from '@s2c/ink'
import type { DomSnapshot } from '@s2c/dom'
import type { EditOp } from '@s2c/intent'
import {
  addUsage, defaultInterpreterProvider, defaultPerceptionProvider, type PerceptionProvider, type TokenUsage,
} from '@s2c/providers'
import { createCodegenSession } from './codegen.js'
import {
  buildEvidence, DESIGN_INTERPRET_PROMPT, groundInterpretation, INTERPRET_PROMPT,
  interpretationSchema,
  type GroundedAction, type GroundedInterpretation, type RawInterpretation,
} from './intent2.js'
import { SKETCH_SKILL } from './skill.js'
import { changedFiles, checkpoint } from './safety.js'
import { verifyDesignPlacement, verifyOps } from './verify.js'
import type { RunContext, RunResult } from './run.js'

const fmtTokens = (u: TokenUsage) =>
  `${(u.input / 1000).toFixed(1)}k in +${(u.cacheRead / 1000).toFixed(1)}k cached / ${(u.output / 1000).toFixed(1)}k out`

export interface InterpretV2Result {
  interpretation: GroundedInterpretation
  /** Raw model output — passed back on run so the server can re-ground it. */
  raw: RawInterpretation
  tokens: TokenUsage
}

export async function interpretV2(
  strokes: Stroke[],
  snapshot: DomSnapshot,
  provider: PerceptionProvider = defaultInterpreterProvider(),
  mode: 'gesture' | 'design' = 'gesture',
): Promise<InterpretV2Result> {
  const ev = buildEvidence(strokes, snapshot)
  let tokens: TokenUsage = { input: 0, cacheRead: 0, output: 0 }

  const ask = async (extra: string): Promise<{ raw: RawInterpretation; interpretation: ReturnType<typeof groundInterpretation> }> => {
    const res = await provider.interpretIntent({
      png: ev.png,
      brief: extra ? `${ev.brief}\n\n${extra}` : ev.brief,
      prompt: mode === 'design' ? DESIGN_INTERPRET_PROMPT : INTERPRET_PROMPT,
      schema: interpretationSchema(mode),
    })
    tokens = addUsage(tokens, res.usage)
    const raw = res.raw as RawInterpretation
    if (!raw || typeof raw.reading !== 'string' || !Array.isArray(raw.actions)) {
      throw new Error('interpreter returned malformed output')
    }
    return { raw, interpretation: groundInterpretation(raw, ev, snapshot, mode) }
  }

  let { raw, interpretation } = await ask('')
  // one deterministic self-correction round: if validation rejected
  // everything, tell the model exactly why and re-ask once
  if (interpretation.actions.length === 0 && interpretation.rejected.length > 0) {
    ;({ raw, interpretation } = await ask(
      `YOUR PREVIOUS ANSWER WAS REJECTED by validation:\n- ${interpretation.rejected.join('\n- ')}\nAnswer again, fixing exactly these problems.`,
    ))
  }
  return { interpretation, raw, tokens }
}

const V2_CONTRACT = `
You are the codegen stage of sketch-to-code. The user drew on a transparent
overlay over their RUNNING app; an interpretation stage (already confirmed by
the user) read the drawing. You receive:
- READING: what the user wants, in plain words (user-confirmed).
- ACTIONS: grounded operations. Every target carries exact geometry and a
  source location "path/File.tsx:LINE:COL" (verified build-time stamps — but
  line numbers shift once you edit a file; re-locate by tag/text context after
  your first edit to the same file). Design actions carry exact svgPath data
  (bbox-local pixel coords) and a layer directive.
- an image: the user's ink over a wireframe of the page (context only).

Rules:
- Implement every action with the MINIMAL edit. Match the file's existing
  style exactly. Never touch unrelated files. Never add dependencies.
- delete: remove the element (if rendered from an array .map(), remove the
  data entry when that's cleaner). modify: apply the instruction to the
  element. move: relocate source before/after/into the destination.
- swap: exchange the two elements' positions (if both come from one array,
  swap the array entries).
- add/design: build what the instruction + svgPaths describe, in the named
  container, sized/placed per "region". layer background-overlay = absolutely
  positioned decoration behind content (pointer-events-none), reproducing
  svgPath as real SVG geometry.
After editing, reply one line per action: "action N: <what you did>".
`.trim()

export async function runV2(
  input: { strokes: Stroke[]; snapshot: DomSnapshot; rawInterpretation: RawInterpretation; mode?: 'gesture' | 'design' },
  ctx: RunContext,
  provider: PerceptionProvider = defaultPerceptionProvider(),
): Promise<RunResult> {
  const runId = `run-${Date.now()}-v2`
  const runDir = join(ctx.root, '.sketch2code', 'runs', runId)
  mkdirSync(runDir, { recursive: true })
  const save = (name: string, data: unknown) =>
    writeFileSync(join(runDir, name), JSON.stringify(data, null, 2))
  const stage = (s: string, detail?: string) => ctx.emit('stage', { stage: s, detail })
  let totalUsage: TokenUsage = { input: 0, cacheRead: 0, output: 0 }

  stage('safety', 'git checkpoint')
  const cp = checkpoint(ctx.root, ctx.allowDirty)
  writeFileSync(join(runDir, 'checkpoint.txt'), `${cp.sha}\n`)

  // re-ground the (client-echoed) raw interpretation server-side — the client
  // is not trusted to have preserved validation
  const ev = buildEvidence(input.strokes, input.snapshot)
  writeFileSync(join(runDir, 'evidence.png'), ev.png)
  writeFileSync(join(runDir, 'evidence.json'), ev.brief)
  const interp = groundInterpretation(input.rawInterpretation, ev, input.snapshot, input.mode ?? 'gesture')
  save('interpretation.json', interp)
  if (interp.actions.length === 0) {
    throw new Error(
      `no valid actions${interp.rejected.length ? ` (rejected: ${interp.rejected.join('; ')})` : ''}`,
    )
  }
  stage('intent', interp.reading)

  const session = createCodegenSession(ctx.root, 'design', { onStage: stage }, `${V2_CONTRACT}\n\n${SKETCH_SKILL}`)
  writeFileSync(join(runDir, 'system.txt'), `${V2_CONTRACT}\n\n${SKETCH_SKILL}`)
  let bestScore = -1
  let lastVerify: unknown = null
  try {
    const brief =
      `READING (user-confirmed): ${interp.reading}\n\n` +
      `ACTIONS:\n${JSON.stringify(interp.actions, null, 2)}\n\n` +
      `Implement every action now.`
    writeFileSync(join(runDir, 'prompt.txt'), brief)
    stage('codegen', 'Claude Code editing source')
    let reply = await session.send({ text: brief, images: [ev.png.toString('base64')] })
    writeFileSync(join(runDir, 'reply-1.txt'), reply)

    for (let round = 1; round <= 3; round++) {
      stage('verify', `round ${round}: snapshotting edited page`)
      const after = await ctx.requestSnapshot(runId)
      const { score, failures, detail } = verifyActions(interp.actions, input.snapshot, after)
      lastVerify = detail
      save(`verify-${round}.json`, detail)
      stage('verify', `${Math.round(score * 100)}% of actions satisfied`)

      if (score > bestScore) bestScore = score
      else {
        stage('verify', 'no improvement — stopping')
        break
      }
      if (score >= 1 || round === 3) break
      stage('repair', `round ${round + 1}`)
      reply = await session.send({
        text:
          `Verification against the live DOM found problems:\n${failures.join('\n')}\n\n` +
          `Fix exactly these. Do not change anything already working.`,
      })
      writeFileSync(join(runDir, `reply-${round + 1}.txt`), reply)
    }
    totalUsage = addUsage(totalUsage, session.usage())
  } finally {
    session.close()
  }
  void provider

  const files = changedFiles(ctx.root, cp)
  save('result.json', {
    engine: 'model', checkpoint: cp.sha, changedFiles: files,
    reading: interp.reading, verification: lastVerify, tokens: totalUsage,
  })
  const summary =
    `[v2] ${Math.round(Math.max(0, bestScore) * 100)}% verified · ${files.length} file(s) · ` +
    `${fmtTokens(totalUsage)} tokens · revert: git restore --source=${cp.sha.slice(0, 10)} -- <paths>`
  stage('done', summary)
  return { summary }
}

/** Map grounded actions onto the existing deterministic verifiers. */
export function verifyActions(
  actions: GroundedAction[],
  before: DomSnapshot,
  after: DomSnapshot,
): { score: number; failures: string[]; detail: unknown } {
  const failures: string[] = []
  let satisfied = 0
  let total = 0
  const details: unknown[] = []

  const pseudoOps: EditOp[] = []
  const pseudoIdx: number[] = []
  actions.forEach((a, i) => {
    if (a.kind === 'delete' || a.kind === 'modify') {
      for (const t of a.targets) {
        pseudoOps.push({
          op: a.kind === 'delete' ? 'DELETE' : 'MODIFY',
          target: t, inkIds: [], pendingTextIds: [], instruction: a.instruction,
        } as EditOp)
        pseudoIdx.push(i)
      }
    } else if (a.kind === 'move' && a.dest) {
      pseudoOps.push({
        op: 'MOVE', source: a.targets[0]!, dest: a.dest,
        position: a.position ?? 'after', inkIds: [], pendingTextIds: [],
      } as EditOp)
      pseudoIdx.push(i)
    }
  })
  if (pseudoOps.length) {
    const res = verifyOps(pseudoOps, before, after)
    details.push(res)
    res.verdicts.forEach((v, k) => {
      total++
      if (v.satisfied) satisfied++
      else failures.push(`action ${pseudoIdx[k]} (${v.op}): ${v.reason}`)
    })
  }

  for (const [i, a] of actions.entries()) {
    if (a.kind === 'swap') {
      total++
      const [x, y] = a.targets
      // identity = subtree-text fingerprint: container sections usually have
      // empty OWN text, and matching on '' finds arbitrary divs.
      // Positional check beats document-order for grid swaps: each content
      // blob should now sit nearer the OTHER's old rect.
      const findByText = (snap: DomSnapshot, key: string) =>
        key ? snap.nodes.find((n) => n.text && key.includes(n.text.slice(0, 24)) && n.text.length > 4) : undefined
      const kx = x!.subtreeText || x!.text
      const ky = y!.subtreeText || y!.text
      const ax = findByText(after, kx)
      const ay = findByText(after, ky)
      let ok = false
      let reason = ''
      if (!ax || !ay) {
        reason = 'element content missing after edit'
      } else {
        const dist = (n: { rect: { x: number; y: number } }, r: { x: number; y: number }) =>
          Math.hypot(n.rect.x - r.x, n.rect.y - r.y)
        const movedX = dist(ax, y!.rect) < dist(ax, x!.rect)
        const movedY = dist(ay, x!.rect) < dist(ay, y!.rect)
        ok = movedX && movedY
        reason = ok ? 'contents exchanged positions' : 'contents did not exchange positions'
      }
      if (ok) satisfied++
      else failures.push(`action ${i} (swap): ${reason}`)
      details.push({ kind: 'swap', index: i, satisfied: ok, reason })
    }
    if (a.kind === 'add' || a.kind === 'design') {
      total++
      const region = a.region ?? a.dest?.rect
      if (!region) {
        satisfied++ // nothing to measure against
        continue
      }
      const verdict = verifyDesignPlacement(before, after, region)
      details.push({ kind: a.kind, index: i, verdict })
      if (verdict.satisfied) satisfied++
      else failures.push(`action ${i} (${a.kind}): ${verdict.reason}`)
    }
  }

  return { score: total > 0 ? satisfied / total : 1, failures, detail: details }
}
