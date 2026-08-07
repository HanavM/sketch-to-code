import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  analyzeStrokes, cropRaster, encodePng, renderScene, type Stroke,
} from '@s2c/ink'
import type { DomSnapshot } from '@s2c/dom'
import { buildEditPlan, type EditPlan } from '@s2c/intent'
import { defaultPerceptionProvider, type PerceptionProvider } from '@s2c/providers'
import { createCodegenSession } from './codegen.js'
import { changedFiles, checkpoint, type Checkpoint } from './safety.js'
import { verifyOps, type VerifyResult } from './verify.js'

export interface RunContext {
  root: string
  allowDirty: boolean
  emit: (event: string, data: unknown) => void
  requestSnapshot: (runId: string) => Promise<DomSnapshot>
}

export interface RunInput {
  strokes: Stroke[]
  snapshot: DomSnapshot
}

export interface RunResult {
  summary: string
}

const MAX_ROUNDS = 3

let runSeq = 0

export async function runPipeline(
  input: RunInput,
  ctx: RunContext,
  provider: PerceptionProvider = defaultPerceptionProvider(),
): Promise<RunResult> {
  const runId = `run-${Date.now()}-${runSeq++}`
  const runDir = join(ctx.root, '.sketch2code', 'runs', runId)
  mkdirSync(runDir, { recursive: true })
  const save = (name: string, data: unknown) =>
    writeFileSync(join(runDir, name), JSON.stringify(data, null, 2))
  const stage = (s: string, detail?: string) => ctx.emit('stage', { stage: s, detail })

  save('request.json', { strokeCount: input.strokes.length, snapshotNodes: input.snapshot.nodes.length })

  // ---- safety ----
  stage('safety', 'git checkpoint')
  const cp: Checkpoint = checkpoint(ctx.root, ctx.allowDirty)
  writeFileSync(join(runDir, 'checkpoint.txt'), `${cp.sha}\n`)

  // ---- ① ink ----
  stage('ink', `analyzing ${input.strokes.length} strokes`)
  const scene = analyzeStrokes(input.strokes)
  save('scene.json', {
    nodes: scene.nodes.map((n) => ({ id: n.id, kind: n.kind, bbox: n.bbox })),
    textRegions: scene.textRegions.map((t) => ({ id: t.id, bbox: t.bbox })),
    arrows: scene.arrows.map((a) => ({ id: a.id, from: a.from, to: a.to })),
  })
  stage('ink', `${scene.nodes.length} shapes, ${scene.textRegions.length} text regions, ${scene.arrows.length} arrows`)

  // ---- ②③ grounding + intent ----
  stage('intent', 'resolving gestures against DOM')
  const plan: EditPlan = buildEditPlan(scene, input.snapshot)
  save('plan.json', plan)
  if (plan.ops.length === 0) {
    throw new Error(
      `no actionable gestures${plan.warnings.length ? ` (${plan.warnings.join('; ')})` : ''}`,
    )
  }
  stage('intent', `${plan.ops.length} ops (${plan.ops.map((o) => o.op).join(', ')})`)

  // ---- render ink once (labels on) ----
  const raster = renderScene(scene, { labels: true, maxSize: 1400 })
  const inkPng = encodePng(raster)
  writeFileSync(join(runDir, 'ink.png'), inkPng)

  // ---- perception: transcription (only when handwriting exists) ----
  if (plan.textRefs.length > 0) {
    stage('perceive', `transcribing ${plan.textRefs.length} handwriting region(s) via ${provider.name}`)
    const texts = await provider.transcribe(
      inkPng,
      plan.textRefs.map((t) => ({ id: t.id, bbox: t.bbox })),
    )
    save('transcripts.json', texts)
    for (const ref of plan.textRefs) ref.text = texts[ref.id] ?? ''
    // fold transcriptions into op instructions
    for (const op of plan.ops) {
      const parts = op.pendingTextIds
        .map((id) => plan.textRefs.find((t) => t.id === id)?.text)
        .filter((t): t is string => Boolean(t && t.length))
      if (parts.length) {
        op.instruction = [op.instruction, ...parts].filter(Boolean).join('; ')
      }
    }
    // also save crops for debugging
    plan.textRefs.forEach((t, i) => {
      try {
        writeFileSync(join(runDir, `text-${i}-${t.id}.png`), encodePng(cropRaster(raster, t.bbox)))
      } catch { /* debug only */ }
    })
  }

  // ---- ④ codegen ----
  // Order ops bottom-to-top per file so earlier edits don't shift the line
  // numbers later ops' srcLocs point at.
  const lineOf = (loc: string | null | undefined) => Number(loc?.split(':')[1] ?? 0)
  const locOf = (o: (typeof plan.ops)[number]) =>
    o.op === 'MOVE' ? o.source.srcLoc : o.op === 'ADD' || o.op === 'INSERT' ? o.container.srcLoc : o.target.srcLoc
  plan.ops.sort((a, b) => {
    const la = locOf(a), lb = locOf(b)
    const fa = la?.split(':')[0] ?? '', fb = lb?.split(':')[0] ?? ''
    if (fa !== fb) return fa < fb ? -1 : 1
    return lineOf(lb) - lineOf(la) // descending line within a file
  })

  const session = createCodegenSession(ctx.root, { onStage: stage })
  let best: VerifyResult | null = null
  const roundSummaries: string[] = []
  try {
    stage('codegen', 'Claude Code editing source')
    let reply = await session.run(plan, inkPng.toString('base64'))
    roundSummaries.push(reply)

    // ---- ⑤ verify (+ repair rounds, monotonic, capped) ----
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      stage('verify', `round ${round}: snapshotting edited page`)
      const after = await ctx.requestSnapshot(runId)
      const result = verifyOps(plan.ops, input.snapshot, after)
      save(`verify-${round}.json`, result)
      stage('verify', `${result.satisfied}/${result.total} ops satisfied`)

      if (!best || result.score > best.score) {
        best = result
      } else {
        stage('verify', 'no improvement over previous round — stopping')
        break
      }
      if (result.score >= 1) break
      if (round === MAX_ROUNDS) break

      const failures = result.verdicts
        .filter((v) => !v.satisfied)
        .map((v) => `op ${v.index} (${v.op}): ${v.reason}`)
        .join('\n')
      stage('repair', `round ${round + 1}: ${result.total - result.satisfied} op(s) unsatisfied`)
      reply = await session.followUp(
        `Verification against the live DOM found these ops NOT satisfied:\n${failures}\n\n` +
        `Fix exactly these. Do not change anything already working.`,
      )
      roundSummaries.push(reply)
    }
  } finally {
    session.close()
  }

  const files = changedFiles(ctx.root, cp)
  save('result.json', {
    checkpoint: cp.sha,
    changedFiles: files,
    verification: best,
    rounds: roundSummaries.length,
  })

  const summary =
    `${best ? `${best.satisfied}/${best.total}` : '?'} ops verified · ` +
    `${files.length} file(s) changed · revert: git restore --source=${cp.sha.slice(0, 10)} -- <paths>`
  stage('done', summary)
  return { summary }
}
