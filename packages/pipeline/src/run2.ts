/**
 * v2 pipeline: model-led intent over owned geometry.
 * interpretV2()  — evidence → one multimodal call → grounded, validated intent
 * runV2()        — grounded intent → codegen → per-action verification
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { encodePng, renderScene, type Stroke } from '@s2c/ink'
import type { DomSnapshot } from '@s2c/dom'
import type { EditOp } from '@s2c/intent'
import {
  addUsage, defaultInterpreterProvider, defaultPerceptionProvider, type PerceptionProvider, type TokenUsage,
} from '@s2c/providers'
import { createCodegenSession, type CodegenSession } from './codegen.js'
import { commitPlan, planStructuralEdits } from './codemod.js'
import {
  buildEvidence, DESIGN_INTERPRET_PROMPT, groundInterpretation, INTERPRET_PROMPT,
  interpretationSchema,
  type GroundedAction, type GroundedInterpretation, type RawInterpretation,
} from './intent2.js'
import { SKETCH_SKILL } from './skill.js'
import { changedFiles, checkpoint } from './safety.js'
import { compositionBrief, compositionFromSource, compositionFromStrokes, scoreComposition } from './composition.js'
import {
  DEFAULT_FIDELITY, fidelityDirective, fidelitySummary, normalizeFidelity, passMark, rungFor,
  type FidelityControls,
} from './fidelity.js'
import { verifyDesignPlacement, verifyOps } from './verify.js'
import type { RunContext, RunResult } from './run.js'

/** Vite's watcher + HMR after an instant codemod write, before the first look. */
const HMR_SETTLE_MS = 600
/** One more look when a codemod-only run fails verification. */
const HMR_RETRY_MS = 1500

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
  input: {
    strokes: Stroke[]
    snapshot: DomSnapshot
    rawInterpretation: RawInterpretation
    mode?: 'gesture' | 'design'
    /** User's resemblance slider + per-aspect locks (validated here). */
    fidelity?: unknown
  },
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
  // The slider decides how literally a depiction is taken, so it overrides the
  // interpreter's own verbatim/recognized guess — that guess was the tool's
  // opinion of the user's intent, and the user has now stated it.
  const fidelity = normalizeFidelity(input.fidelity)
  const rung = rungFor(fidelity.resemblance)
  for (const a of interp.actions) {
    if (!a.svgPaths?.length) continue
    if (rung === 'trace') a.fidelity = 'verbatim'
    else if (rung === 'reinterpret') a.fidelity = 'recognized'
  }
  save('interpretation.json', interp)
  save('fidelity.json', fidelity)
  if (interp.actions.length === 0) {
    throw new Error(
      `no valid actions${interp.rejected.length ? ` (rejected: ${interp.rejected.join('; ')})` : ''}`,
    )
  }
  stage('intent', interp.reading)

  // Structural actions (delete/move/swap) whose stamps resolve unambiguously
  // are applied as AST text edits — no session, no tokens. The agent only
  // sees what the codemod refused.
  const plan = planStructuralEdits(ctx.root, interp.actions, input.snapshot)
  const codemodFiles = commitPlan(ctx.root, plan)
  save('codemod.json', { handled: plan.handled, refused: plan.refused, files: codemodFiles })
  for (const h of plan.handled) stage('codemod', `action ${h.index}: ${h.change}`)
  const handled = new Set(plan.handled.map((h) => h.index))
  const pending = interp.actions.map((a, i) => ({ i, a })).filter(({ i }) => !handled.has(i))
  const codemodNote = plan.handled.length
    ? `ALREADY APPLIED by a deterministic codemod (do not redo; line numbers in these files have shifted):\n` +
      plan.handled.map((h) => `- action ${h.index} in ${h.file}: ${h.change}`).join('\n') + '\n\n'
    : ''

  const system = `${V2_CONTRACT}\n\n${SKETCH_SKILL}`
  let session: CodegenSession | null = null
  const agent = (): CodegenSession => {
    if (!session) {
      session = createCodegenSession(ctx.root, 'design', { onStage: stage }, system)
      writeFileSync(join(runDir, 'system.txt'), system)
    }
    return session
  }
  let replies = 0
  const saveReply = (reply: string) => writeFileSync(join(runDir, `reply-${++replies}.txt`), reply)

  let bestScore = -1
  let lastVerify: unknown = null
  const verifyRound = async (round: number) => {
    const after = await ctx.requestSnapshot(runId)
    // read back what was just written, so composition can be scored against
    // the ink without a screenshot or a model call
    const sources: string[] = []
    for (const rel of changedFiles(ctx.root, cp)) {
      if (!/\.(tsx|jsx)$/.test(rel)) continue
      try { sources.push(readFileSync(join(ctx.root, rel), 'utf8')) } catch { /* deleted */ }
    }
    const result = verifyActions(
      interp.actions, input.snapshot, after, { strokes: input.strokes, sources, fidelity },
    )
    lastVerify = result.detail
    save(`verify-${round}.json`, result.detail)
    return result
  }
  try {
    if (pending.length > 0) {
      // Measured composition per depiction. "Big front claws, low wide body" is
      // a vibe the model has to guess at; these are numbers it can hit, and they
      // are the same numbers verification will score it against afterwards.
      const composition = pending
        .map(({ a, i }) => {
          if (!isDepiction(a, fidelity)) return null
          const ids = new Set(a.svgPaths!.map((sp) => sp.strokeId))
          const drawn = input.strokes.filter((s) => ids.has(s.id))
          if (drawn.length === 0) return null
          return `action ${i} — measured composition of the drawn "${a.depicts ?? 'form'}":\n` +
            compositionBrief(compositionFromStrokes(drawn))
        })
        .filter((s): s is string => s !== null)

      const brief =
        `READING (user-confirmed): ${interp.reading}\n\n` +
        codemodNote +
        `FIDELITY (set by the user for this run):\n${fidelityDirective(fidelity)}\n\n` +
        `ACTIONS:\n${JSON.stringify(pending.map(({ a, i }) => ({ action: i, ...a })), null, 2)}\n\n` +
        (composition.length
          ? `MEASURED COMPOSITION (deterministic, from the strokes themselves — these are the\n` +
            `proportions your result will be checked against):\n${composition.join('\n\n')}\n\n`
          : '') +
        `Implement every action now.`
      writeFileSync(join(runDir, 'prompt.txt'), brief)
      stage('codegen', 'Claude Code editing source')
      // recognized depictions: attach a clean native-scale crop of just those
      // strokes so the agent can match the sketch's composition
      const images = [ev.png.toString('base64')]
      for (const { a } of pending) {
        if (a.fidelity !== 'recognized' || !a.svgPaths?.length) continue
        const ids = new Set(a.svgPaths.map((sp) => sp.strokeId))
        const subset = input.strokes.filter((st) => ids.has(st.id))
        if (!subset.length) continue
        const crop = renderScene(
          { strokes: subset, groups: [], nodes: [], textRegions: [], arrows: [] },
          { labels: false, maxSize: 480, brush: 2.5 },
        )
        images.push(encodePng(crop).toString('base64'))
        if (images.length >= 4) break
      }
      saveReply(await agent().send({ text: brief, images }))
    } else {
      // the codemod wrote milliseconds ago; the client only waits 350ms after
      // the resnapshot event, which can beat Vite's watcher + HMR
      await new Promise((r) => setTimeout(r, HMR_SETTLE_MS))
    }

    for (let round = 1; round <= 3; round++) {
      stage('verify', `round ${round}: snapshotting edited page`)
      let result = await verifyRound(round)
      if (result.score < 1 && !session && plan.handled.length > 0) {
        // no agent has run: a failure here is far more likely an HMR race
        // than a wrong AST edit — look again before spending tokens
        await new Promise((r) => setTimeout(r, HMR_RETRY_MS))
        result = await verifyRound(round)
      }
      const { score, failures } = result
      stage('verify', `${Math.round(score * 100)}% of actions satisfied`)

      if (score > bestScore) bestScore = score
      else {
        stage('verify', 'no improvement — stopping')
        break
      }
      if (score >= 1 || round === 3) break
      stage('repair', `round ${round + 1}`)
      const context = session
        ? ''
        : `READING (user-confirmed): ${interp.reading}\n\n${codemodNote}` +
          `ACTIONS:\n${JSON.stringify(interp.actions.map((a, i) => ({ action: i, ...a })), null, 2)}\n\n` +
          `Check the codemod edits against the failures below before changing anything — ` +
          `if an edit is already correct, leave it and say so.\n\n`
      saveReply(await agent().send({
        text:
          `${context}Verification against the live DOM found problems:\n${failures.join('\n')}\n\n` +
          `Fix exactly these. Do not change anything already working.`,
      }))
    }
    if (session) totalUsage = addUsage(totalUsage, (session as CodegenSession).usage())
  } finally {
    if (session) (session as CodegenSession).close()
  }
  void provider

  const files = changedFiles(ctx.root, cp)
  save('result.json', {
    engine: 'model', checkpoint: cp.sha, changedFiles: files,
    reading: interp.reading, verification: lastVerify, tokens: totalUsage,
    codemod: { handled: plan.handled.map((h) => h.index), refused: plan.refused },
    fidelity,
  })
  const summary =
    `[v2] ${Math.round(Math.max(0, bestScore) * 100)}% verified · ${files.length} file(s) · ` +
    (plan.handled.length ? `codemod ${plan.handled.length}/${interp.actions.length} actions · ` : '') +
    (interp.actions.some((a) => a.svgPaths?.length) ? `${fidelitySummary(fidelity)} · ` : '') +
    `${fmtTokens(totalUsage)} tokens · revert: git restore --source=${cp.sha.slice(0, 10)} -- <paths>`
  stage('done', summary)
  return { summary }
}

/**
 * Depiction actions whose composition is worth measuring: the user drew a
 * THING and asked for it rebuilt, so the drawn arrangement is the spec.
 *
 * At the trace rung this widens to every drawn form, abstract decoration
 * included — "reproduce the line I drew" is the one instruction whose failure
 * (a smoothed-away wobble) only the composition check can catch. Below that
 * rung an abstract 'verbatim' decoration stays unmeasured: its fitted path IS
 * the output, so there is nothing to compare it against.
 */
const isDepiction = (a: GroundedAction, controls: FidelityControls = DEFAULT_FIDELITY): boolean =>
  !!a.svgPaths?.length && (a.fidelity === 'recognized' || rungFor(controls.resemblance) === 'trace')

/** Map grounded actions onto the existing deterministic verifiers. */
export function verifyActions(
  actions: GroundedAction[],
  before: DomSnapshot,
  after: DomSnapshot,
  /** Ink + post-edit source, enabling the composition-fidelity check. */
  depiction?: { strokes: Stroke[]; sources: string[]; fidelity?: FidelityControls },
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

    // Placement says the thing is in the right PLACE. For a depiction that is
    // only half the contract — the drawn arrangement is the spec too, and
    // nothing measured it before: a lopsided crab could come back as a
    // mirrored ellipse and still pass.
    if (depiction && isDepiction(a, depiction.fidelity)) {
      const ids = new Set(a.svgPaths!.map((sp) => sp.strokeId))
      const drawn = depiction.strokes.filter((s) => ids.has(s.id))
      if (drawn.length > 0 && depiction.sources.length > 0) {
        total++
        const sketch = compositionFromStrokes(drawn)
        // a run can touch several files; the depiction lives in whichever
        // one scores best against the ink
        const controls = depiction.fidelity ?? DEFAULT_FIDELITY
        let best = scoreComposition(sketch, compositionFromSource(depiction.sources[0]!), controls)
        for (const src of depiction.sources.slice(1)) {
          const v = scoreComposition(sketch, compositionFromSource(src), controls)
          if (v.score > best.score) best = v
        }
        // the bar the user asked for: a free reinterpretation reports the
        // measurement without failing on it
        const ok = best.score >= passMark(controls)
        details.push({
          kind: 'composition', index: i, score: best.score,
          massSimilarity: best.massSimilarity, flaws: best.flaws, notes: best.notes,
        })
        if (ok) satisfied++
        else {
          failures.push(
            `action ${i} (composition of "${a.depicts ?? 'the drawing'}", ` +
            `${Math.round(best.score * 100)}% faithful): ${best.notes.join('; ')}`,
          )
        }
      }
    }
  }

  return { score: total > 0 ? satisfied / total : 1, failures, detail: details }
}
