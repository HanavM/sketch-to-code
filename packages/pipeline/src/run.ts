import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  analyzeStrokes, bboxOf, bboxUnion, cropRaster, encodePng, renderScene,
  type BBox, type Stroke,
} from '@s2c/ink'
import { smallestContainingElement, type DomSnapshot } from '@s2c/dom'
import { buildEditPlan, type EditPlan } from '@s2c/intent'
import { addUsage, defaultPerceptionProvider, type PerceptionProvider, type TokenUsage } from '@s2c/providers'
import { contractFor, createCodegenSession, type RunMode } from './codegen.js'
import { changedFiles, checkpoint, type Checkpoint } from './safety.js'
import { pageChanged, verifyOps, type VerifyResult } from './verify.js'

export interface RunContext {
  root: string
  allowDirty: boolean
  emit: (event: string, data: unknown) => void
  requestSnapshot: (runId: string) => Promise<DomSnapshot>
}

export interface RunInput {
  strokes: Stroke[]
  snapshot: DomSnapshot
  mode?: RunMode
  /** base64 PNG of the whole browser screen (screenshot mode). */
  screenshot?: string
}

export interface RunResult {
  summary: string
}

const MAX_ROUNDS = 3

let runSeq = 0

const fmtTokens = (u: TokenUsage) =>
  `${(u.input / 1000).toFixed(1)}k in +${(u.cacheRead / 1000).toFixed(1)}k cached / ${(u.output / 1000).toFixed(1)}k out`

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
  let totalUsage: TokenUsage = { input: 0, cacheRead: 0, output: 0 }

  let mode: RunMode = input.mode ?? 'gesture'
  save('request.json', {
    mode,
    strokeCount: input.strokes.length,
    snapshotNodes: input.snapshot.nodes.length,
    hasScreenshot: Boolean(input.screenshot),
  })

  // ---- safety ----
  stage('safety', 'git checkpoint')
  const cp: Checkpoint = checkpoint(ctx.root, ctx.allowDirty)
  writeFileSync(join(runDir, 'checkpoint.txt'), `${cp.sha}\n`)

  // ================= SCREENSHOT MODE (benchmark: pixels only) =================
  if (mode === 'screenshot') {
    if (!input.screenshot) throw new Error('screenshot mode without a screenshot')
    writeFileSync(join(runDir, 'screenshot.png'), Buffer.from(input.screenshot, 'base64'))
    const session = createCodegenSession(ctx.root, 'screenshot', { onStage: stage })
    writeFileSync(join(runDir, 'system.txt'), contractFor('screenshot'))
    let changed = false
    try {
      const text =
        `Here is a screenshot of my browser: my running app with my hand-drawn ink on top ` +
        `(viewport ${input.snapshot.viewport.w}x${input.snapshot.viewport.h}, scrolled to ` +
        `${input.snapshot.viewport.scrollX},${input.snapshot.viewport.scrollY}). ` +
        `Interpret the ink and implement it in the source.`
      writeFileSync(join(runDir, 'prompt.txt'), text)
      stage('codegen', 'screenshot → Claude Code (no structure, benchmark mode)')
      const reply = await session.send({ text, images: [input.screenshot] })
      writeFileSync(join(runDir, 'reply.txt'), reply)

      stage('verify', 'snapshotting edited page')
      const after = await ctx.requestSnapshot(runId)
      changed = pageChanged(input.snapshot, after)
      totalUsage = addUsage(totalUsage, session.usage())
      save('result.json', {
        mode, checkpoint: cp.sha, changedFiles: changedFiles(ctx.root, cp),
        pageChanged: changed, tokens: totalUsage,
      })
    } finally {
      session.close()
    }
    const files = changedFiles(ctx.root, cp)
    const summary =
      `[screenshot] ${changed ? 'page changed' : '⚠ no page change'} · ${files.length} file(s) · ` +
      `${fmtTokens(totalUsage)} tokens · revert: git restore --source=${cp.sha.slice(0, 10)} -- <paths>`
    stage('done', summary)
    return { summary }
  }

  // ================= STRUCTURED MODES (gesture / design) =================
  // ---- ① ink ----
  stage('ink', `analyzing ${input.strokes.length} strokes`)
  const scene = analyzeStrokes(input.strokes)
  save('scene.json', {
    nodes: scene.nodes.map((n) => ({ id: n.id, kind: n.kind, bbox: n.bbox })),
    textRegions: scene.textRegions.map((t) => ({ id: t.id, bbox: t.bbox })),
    arrows: scene.arrows.map((a) => ({ id: a.id, from: a.from, to: a.to })),
  })
  stage('ink', `${scene.nodes.length} shapes, ${scene.textRegions.length} text regions, ${scene.arrows.length} arrows`)

  // ---- render ink once (labels on) ----
  const raster = renderScene(scene, { labels: true, maxSize: 1400 })
  const inkPng = encodePng(raster)
  writeFileSync(join(runDir, 'ink.png'), inkPng)

  // ---- ②③ intent (gesture path; may auto-escalate to design) ----
  let plan: EditPlan | null = null
  if (mode === 'gesture') {
    stage('intent', 'resolving gestures against DOM')
    plan = buildEditPlan(scene, input.snapshot)
    save('plan.json', plan)
    if (plan.ops.length === 0) {
      if (scene.nodes.length + scene.textRegions.length > 0) {
        // ink that resolves to no commands is probably a drawing, not gestures
        mode = 'design'
        stage('intent', 'no command gestures resolved — treating the ink as a design sketch')
      } else {
        throw new Error(
          `no actionable ink${plan.warnings.length ? ` (${plan.warnings.join('; ')})` : ''}`,
        )
      }
    } else {
      stage('intent', `${plan.ops.length} ops (${plan.ops.map((o) => o.op).join(', ')})`)
    }
  }

  // ---- perception: transcription (both structured modes want the text) ----
  const textRefs =
    plan?.textRefs ?? scene.textRegions.map((t) => ({ id: t.id, bbox: t.bbox, text: undefined as string | undefined }))
  if (textRefs.length > 0) {
    stage('perceive', `transcribing ${textRefs.length} handwriting region(s) via ${provider.name}`)
    const res = await provider.transcribe(
      inkPng,
      textRefs.map((t) => ({ id: t.id, bbox: t.bbox })),
    )
    totalUsage = addUsage(totalUsage, res.usage)
    save('transcripts.json', res.texts)
    for (const ref of textRefs) ref.text = res.texts[ref.id] ?? ''
    if (plan) {
      for (const op of plan.ops) {
        const parts = op.pendingTextIds
          .map((id) => plan!.textRefs.find((t) => t.id === id)?.text)
          .filter((t): t is string => Boolean(t && t.length))
        if (parts.length) op.instruction = [op.instruction, ...parts].filter(Boolean).join('; ')
      }
    }
    textRefs.forEach((t, i) => {
      try {
        writeFileSync(join(runDir, `text-${i}-${t.id}.png`), encodePng(cropRaster(raster, t.bbox)))
      } catch { /* debug only */ }
    })
  }

  // ---- ④ codegen ----
  const session = createCodegenSession(ctx.root, mode, { onStage: stage })
  writeFileSync(join(runDir, 'system.txt'), contractFor(mode))
  let best: VerifyResult | null = null
  let designChanged = false
  try {
    let firstText: string
    if (mode === 'gesture' && plan) {
      // order ops bottom-to-top per file so earlier edits don't shift the
      // line numbers later ops' srcLocs point at
      const lineOf = (loc: string | null | undefined) => Number(loc?.split(':')[1] ?? 0)
      const locOf = (o: (typeof plan.ops)[number]) =>
        o.op === 'MOVE' ? o.source.srcLoc : o.op === 'ADD' || o.op === 'INSERT' ? o.container.srcLoc : o.target.srcLoc
      plan.ops.sort((a, b) => {
        const la = locOf(a), lb = locOf(b)
        const fa = la?.split(':')[0] ?? '', fb = lb?.split(':')[0] ?? ''
        if (fa !== fb) return fa < fb ? -1 : 1
        return lineOf(lb) - lineOf(la)
      })
      firstText = `EDIT PLAN:\n${JSON.stringify(plan.ops, null, 2)}\n\nImplement every op now.`
    } else {
      firstText = designBrief(scene, textRefs, input.snapshot)
    }
    writeFileSync(join(runDir, 'prompt.txt'), firstText)

    stage('codegen', `Claude Code editing source (${mode} mode)`)
    let reply = await session.send({ text: firstText, images: [inkPng.toString('base64')] })
    writeFileSync(join(runDir, 'reply-1.txt'), reply)

    // ---- ⑤ verify (+ repair rounds, monotonic, capped) ----
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      stage('verify', `round ${round}: snapshotting edited page`)
      const after = await ctx.requestSnapshot(runId)

      if (mode === 'design') {
        designChanged = pageChanged(input.snapshot, after)
        save(`verify-${round}.json`, { pageChanged: designChanged })
        if (designChanged) break
        if (round >= 2) break
        stage('repair', 'page unchanged — asking for implementation')
        reply = await session.send({
          text: 'The live page shows no change. Implement the sketched design now — actually edit the files.',
        })
        writeFileSync(join(runDir, `reply-${round + 1}.txt`), reply)
        continue
      }

      const result = verifyOps(plan!.ops, input.snapshot, after)
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
      reply = await session.send({
        text:
          `Verification against the live DOM found these ops NOT satisfied:\n${failures}\n\n` +
          `Fix exactly these. Do not change anything already working.`,
      })
      writeFileSync(join(runDir, `reply-${round + 1}.txt`), reply)
    }
    totalUsage = addUsage(totalUsage, session.usage())
  } finally {
    session.close()
  }

  const files = changedFiles(ctx.root, cp)
  save('result.json', {
    mode, checkpoint: cp.sha, changedFiles: files,
    verification: mode === 'design' ? { pageChanged: designChanged } : best,
    tokens: totalUsage,
  })

  const verdictPart =
    mode === 'design'
      ? designChanged ? 'design implemented' : '⚠ page did not change'
      : `${best ? `${best.satisfied}/${best.total}` : '?'} ops verified`
  const summary =
    `[${mode}] ${verdictPart} · ${files.length} file(s) · ${fmtTokens(totalUsage)} tokens · ` +
    `revert: git restore --source=${cp.sha.slice(0, 10)} -- <paths>`
  stage('done', summary)
  return { summary }
}

/** Compose the design-mode brief: legend + DOM context, never raw coordinates in prose. */
function designBrief(
  scene: ReturnType<typeof analyzeStrokes>,
  textRefs: Array<{ id: string; bbox: BBox; text?: string }>,
  snap: DomSnapshot,
): string {
  let inkBox: BBox | null = null
  for (const s of scene.strokes) {
    if (s.points.length === 0) continue
    const b = bboxOf(s.points)
    inkBox = inkBox ? bboxUnion(inkBox, b) : b
  }
  const region = inkBox ? smallestContainingElement(snap, inkBox, 0.6) : null
  const nearby = inkBox
    ? snap.nodes
        .filter((n) => {
          const cx = n.rect.x + n.rect.w / 2
          const cy = n.rect.y + n.rect.h / 2
          return (
            cx >= inkBox!.x - 80 && cx <= inkBox!.x + inkBox!.w + 80 &&
            cy >= inkBox!.y - 80 && cy <= inkBox!.y + inkBox!.h + 80 && n.srcLoc
          )
        })
        .slice(0, 15)
    : []

  const legend = {
    shapes: scene.nodes.map((n) => ({ id: n.id, kind: n.kind, bbox: n.bbox })),
    arrows: scene.arrows.map((a) => ({ id: a.id, from: a.from, to: a.to })),
    handwriting: textRefs.map((t) => ({ id: t.id, bbox: t.bbox, text: t.text ?? '' })),
  }
  const dom = {
    sketchContainer: region
      ? { srcLoc: region.srcLoc, tag: region.tag, classes: region.classes, rect: region.rect }
      : null,
    nearbyElements: nearby.map((n) => ({
      srcLoc: n.srcLoc, tag: n.tag, text: n.text.slice(0, 40), rect: n.rect,
    })),
  }
  return (
    `The attached image is my design sketch (numbered badges = shape ids).\n\n` +
    `LEGEND (recognized shapes — geometry and handwriting are ground truth):\n` +
    `${JSON.stringify(legend, null, 2)}\n\n` +
    `DOM CONTEXT (where on the live page I drew — put the implementation here):\n` +
    `${JSON.stringify(dom, null, 2)}\n\n` +
    `Implement this design in the app source now.`
  )
}
