/**
 * v2 pipeline: model-led intent over owned geometry.
 * interpretV2()  — evidence → one multimodal call → grounded, validated intent
 * runV2()        — grounded intent → codegen → per-action verification
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { encodePng, renderScene, type Stroke } from '@s2c/ink'
import type { DomSnapshot } from '@s2c/dom'
import type { EditOp } from '@s2c/intent'
import {
  addUsage, defaultInterpreterProvider, defaultPerceptionProvider, type PerceptionProvider, type TokenUsage,
} from '@s2c/providers'
import { createCodegenSession, type CodegenSession } from './codegen.js'
import { commitPlan, planStructuralEdits } from './codemod.js'
import { promoteToApi } from './api.js'
import { makeFormReal } from './form.js'
import {
  buildEvidence, DESIGN_INTERPRET_PROMPT, groundInterpretation, INTERPRET_PROMPT,
  interpretationSchema,
  type GroundedAction, type GroundedInterpretation, type RawInterpretation, type TypedNote,
} from './intent2.js'
import { SKETCH_SKILL } from './skill.js'
import { checkpoint } from './safety.js'
import {
  APPROACHES, applyWork, captureWork, pickBest, revertWork, touchedFiles, type Attempt,
} from './candidates.js'
import { buildScaffold, scaffoldDir, type Scaffold } from './scaffold.js'
import { finishSource, paletteFor } from './finish.js'
import { compositionBrief, compositionFromSource, compositionFromStrokes, scoreComposition } from './composition.js'
import {
  DEFAULT_FIDELITY, fidelityDirective, fidelitySummary, normalizeFidelity, passMark, rungFor,
  type FidelityControls,
} from './fidelity.js'
import { deltaE, parseCssColor } from './palette.js'
import { styleFaults } from './style.js'
import { evaluateConstraints, loadConstraints } from './constraints.js'
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
  notes: TypedNote[] = [],
): Promise<InterpretV2Result> {
  const ev = buildEvidence(strokes, snapshot, notes)
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
- "notes" on an action is the user's OWN TYPED WORDS about it. Treat them as
  the instruction of record: where they and the reading disagree, follow the
  notes. Implement everything they ask for, including behaviour the ink cannot
  express (animation, interaction, copy).
- A note may contain tokens like "@1", "@2". Each one is an element the user
  pointed at while typing that sentence, and the action's "refs" resolves it:
  token, label, and the source location to edit. They are pointers, not
  descriptions — take the element from refs, never by searching the page for
  something whose text matches the label. A ref with no srcLoc is one whose
  element could not be found; say so rather than guessing at a substitute.
- "color" is the pen colour the user deliberately drew in. Apply it to what the
  action produces, preferring the named token when one is given — that token is
  a colour this app already uses.
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
    /** Notes the user typed while sketching, anchored client-side. */
    notes?: TypedNote[]
    /** Independent codegen attempts to generate and score (1-3, default 1). */
    candidates?: number
    /** Component the instant render already wrote and mounted, if any. */
    instant?: string | null
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
  const ev = buildEvidence(input.strokes, input.snapshot, input.notes ?? [])
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
  if (ev.notes.length) save('notes.json', ev.notes)
  if (interp.actions.length === 0) {
    throw new Error(
      `no valid actions${interp.rejected.length ? ` (rejected: ${interp.rejected.join('; ')})` : ''}`,
    )
  }
  stage('intent', interp.reading)
  /**
   * Actions that did not survive grounding, said out loud.
   *
   * Until now a rejection was only reported when EVERY action was rejected —
   * a partial one was dropped in silence, so asking for two things, getting
   * one, and being told "100% verified" was a reachable outcome. That is the
   * worst available failure: it reports success for work that did not happen,
   * and the user has no reason to look.
   */
  for (const r of interp.rejected) stage('rule', `could not be carried out: ${r}`)

  // Structural actions (delete/move/swap) whose stamps resolve unambiguously
  // are applied as AST text edits — no session, no tokens. The agent only
  // sees what the codemod refused.
  const plan = planStructuralEdits(ctx.root, interp.actions, input.snapshot)
  const codemodFiles = commitPlan(ctx.root, plan)
  save('codemod.json', { handled: plan.handled, refused: plan.refused, files: codemodFiles })
  for (const h of plan.handled) stage('codemod', `action ${h.index}: ${h.change}`)
  const handled = new Set(plan.handled.map((h) => h.index))

  /**
   * The two actions about where data lives, applied by the engines that already
   * implement them — the same ones the keyboard shortcut calls.
   *
   * Deliberately NOT handed to the codegen model. Both are mechanical and both
   * are already tested end to end, so routing them through a model would buy
   * variation and nothing else: a differently-shaped route each time, the hook
   * in module scope where it throws on import, a literal deleted instead of
   * kept as the seed that makes the change invisible. The model's job here is
   * to recognise which verb a sentence is, which is exactly what it is good at.
   *
   * A refusal is kept and shown rather than swallowed: these engines explain
   * what the code would have to look like instead, and that sentence is more
   * use to the user than a silent fallback to the model guessing.
   */
  const backend: Array<{ index: number; change: string; files: string[] }> = []
  const backendRefused: string[] = []
  for (const [i, a] of interp.actions.entries()) {
    if (handled.has(i)) continue
    if (a.kind !== 'serve' && a.kind !== 'save') continue
    const srcLoc = a.targets[0]?.srcLoc
    if (!srcLoc) continue // grounding already rejected these; belt and braces
    const out = a.kind === 'serve'
      ? promoteToApi(ctx.root, { srcLoc })
      : makeFormReal(ctx.root, { srcLoc })
    if (out.ok) {
      handled.add(i)
      backend.push({ index: i, change: out.change ?? a.kind, files: out.files ?? [] })
      stage('codemod', `action ${i}: ${out.change ?? a.kind}`)
    } else {
      handled.add(i) // the model must not be asked to "try anyway"
      backendRefused.push(`action ${i} (${a.kind}): ${out.error ?? 'refused'}`)
      stage('codemod', `action ${i} refused: ${out.error ?? 'refused'}`)
    }
  }
  if (backend.length || backendRefused.length) {
    save('backend.json', { applied: backend, refused: backendRefused })
  }

  const pending = interp.actions.map((a, i) => ({ i, a })).filter(({ i }) => !handled.has(i))
  const appliedNote = [
    ...plan.handled.map((h) => `- action ${h.index} in ${h.file}: ${h.change}`),
    ...backend.map((b) => `- action ${b.index}: ${b.change} (wrote ${b.files.join(', ')})`),
  ]
  const codemodNote = appliedNote.length
    ? `ALREADY APPLIED by a deterministic codemod (do not redo; line numbers in these files have shifted):\n` +
      appliedNote.join('\n') + '\n\n'
    : ''

  const system = `${V2_CONTRACT}\n\n${SKETCH_SKILL}`

  // Nothing for the model to vary when the codemod already did the whole run.
  const attempts = pending.length > 0 ? Math.min(3, Math.max(1, Math.round(input.candidates ?? 1))) : 1

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

  const baseBrief =
    `READING (user-confirmed): ${interp.reading}\n\n` +
    codemodNote +
    `FIDELITY (set by the user for this run):\n${fidelityDirective(fidelity)}\n\n` +
    (interp.runNotes?.length
      ? `THE USER ALSO TYPED (applies to the whole run — their exact words, and they ` +
        `outrank any reading of the ink):\n${interp.runNotes.map((n) => `- ${n}`).join('\n')}\n\n`
      : '') +
    `ACTIONS:\n${JSON.stringify(pending.map(({ a, i }) => ({ action: i, ...a })), null, 2)}\n\n` +
    (composition.length
      ? `MEASURED COMPOSITION (deterministic, from the strokes themselves — these are the\n` +
        `proportions your result will be checked against):\n${composition.join('\n\n')}\n\n`
      : '')

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

  /**
   * Write the drawn geometry into real components BEFORE the model runs.
   *
   * The ControlNet lesson: structure is supplied, not requested. Each attempt
   * re-lays these, because an attempt starts from the state the user
   * confirmed and the previous attempt's files were reverted.
   */
  const layScaffolds = (): Scaffold[] => {
    const taken = new Set<string>()
    const out: Scaffold[] = []
    for (const { a, i } of pending) {
      if (!a.svgPaths?.length) continue
      const sc = buildScaffold(a, i, fidelity, { dir: scaffoldDir(a.dest?.srcLoc), taken })
      if (!sc) continue
      const abs = join(ctx.root, sc.rel)
      // never clobber something that already exists — a name collision with
      // the user's own component would be an edit they never asked for
      if (existsSync(abs)) continue
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, sc.code)
      out.push(sc)
    }
    if (out.length) save('scaffolds.json', out.map((sc) => ({ action: sc.actionIndex, name: sc.name, rel: sc.rel })))
    return out
  }

  const palette = paletteFor(input.snapshot)
  let finishEdits: unknown[] = []
  /**
   * Cheap deterministic cleanup before anything is judged: a one-off colour
   * literal the app already has a token for, geometry that renders nothing,
   * a path emitted twice. None of it needs judgement, so none of it needs a
   * model round — which is the only other way these got fixed.
   */
  const finishPass = () => {
    for (const rel of touchedFiles(ctx.root, cp)) {
      if (!/\.(tsx|jsx)$/.test(rel)) continue
      const abs = join(ctx.root, rel)
      let code: string
      try { code = readFileSync(abs, 'utf8') } catch { continue }
      const { code: next, edits } = finishSource(code, palette)
      if (!edits.length || next === code) continue
      writeFileSync(abs, next)
      finishEdits.push({ file: rel, edits })
      for (const e of edits) stage('finish', `${rel}: ${e.detail}`)
    }
  }

  let lastVerify: unknown = null
  /** Re-snapshot the live page and score every action against the drawing. */
  const verifyRound = async (tag: string) => {
    finishPass()
    const after = await ctx.requestSnapshot(runId)
    // read back what was just written, so composition can be scored against
    // the ink without a screenshot or a model call
    const sources: string[] = []
    for (const rel of touchedFiles(ctx.root, cp)) {
      if (!/\.(tsx|jsx)$/.test(rel)) continue
      try { sources.push(readFileSync(join(ctx.root, rel), 'utf8')) } catch { /* deleted */ }
    }
    const result = verifyActions(
      interp.actions, input.snapshot, after, { strokes: input.strokes, sources, fidelity },
    )

    // Rules the user drew earlier are checked against the same snapshot. They
    // are not about this edit, which is the point: an edit that quietly breaks
    // an alignment somewhere else on the page should not pass just because it
    // did what it was asked.
    const rules = loadConstraints(ctx.root)
    const broken = rules.length ? evaluateConstraints(rules, after) : []
    if (broken.length) {
      for (const v of broken) {
        stage('rule', v.message)
        result.failures.push(
          `a rule you drew is broken (${v.kind}): ${v.message}` + (v.note ? ` — you wrote: "${v.note}"` : ''),
        )
      }
      result.score = Math.min(result.score, 0.99)
    }

    lastVerify = broken.length ? { verified: result.detail, brokenRules: broken } : result.detail
    save(`verify-${tag}.json`, lastVerify)
    return result
  }

  /**
   * One full codegen + repair pass, from the state the user confirmed.
   *
   * Self-contained on purpose: its own session, its own reply/verify files.
   * That is what makes it repeatable, and repeatable is what makes the
   * best-of-N possible.
   */
  const runAttempt = async (approach: string, tag: string) => {
    let session: CodegenSession | null = null
    const agent = (): CodegenSession => {
      if (!session) {
        session = createCodegenSession(ctx.root, 'design', { onStage: stage }, system)
        writeFileSync(join(runDir, 'system.txt'), system)
      }
      return session
    }
    let replies = 0
    const saveReply = (reply: string) =>
      writeFileSync(join(runDir, `reply-${tag}-${++replies}.txt`), reply)
    let best = -1
    let lastFailures: string[] = []
    try {
      if (pending.length > 0) {
        const scaffolds = layScaffolds()
        const instantNote = input.instant
          ? `ALREADY ON THE PAGE: ${input.instant} was written from the user's strokes and mounted\n` +
            `the moment they stopped drawing — they are looking at it right now. REFINE THAT FILE.\n` +
            `Keep its drawn paths, give it a name that says what it is, and finish it per the\n` +
            `FIDELITY block. Do not create a second component for the same drawing, and do not\n` +
            `leave the placeholder name in place.\n\n`
          : ''
        const scaffoldNote = scaffolds.length
          ? `THE GEOMETRY IS ALREADY WRITTEN. These components exist now, built from the user's\n` +
            `own strokes — the paths in them ARE the drawing, measured, not a description of it:\n` +
            scaffolds.map((sc) => `- ${sc.rel} (${sc.name}) — action ${sc.actionIndex}`).join('\n') + '\n\n' +
            `Keep those path elements. Do not replace them with shapes of your own and do not\n` +
            `re-derive them from the svgPath data in the action — that is where they came from.\n` +
            `Your job on those actions is everything else: mount the component where the action\n` +
            `says, name and style it in the app's idiom, and build the finished result AROUND the\n` +
            `drawn paths (fills, interior detail, shading) per the FIDELITY block. Delete a\n` +
            `scaffold only if its action genuinely does not need a component.\n\n`
          : ''
        const brief = `${baseBrief}${instantNote}${scaffoldNote}${approach ? `${approach}\n\n` : ''}Implement every action now.`
        writeFileSync(join(runDir, `prompt-${tag}.txt`), brief)
        stage('codegen', 'Claude Code editing source')
        saveReply(await agent().send({ text: brief, images }))
      } else {
        // the codemod wrote milliseconds ago; the client only waits 350ms after
        // the resnapshot event, which can beat Vite's watcher + HMR
        await new Promise((r) => setTimeout(r, HMR_SETTLE_MS))
      }

      for (let round = 1; round <= 3; round++) {
        stage('verify', `round ${round}: snapshotting edited page`)
        let result = await verifyRound(`${tag}-${round}`)
        if (result.score < 1 && !session && plan.handled.length > 0) {
          // no agent has run: a failure here is far more likely an HMR race
          // than a wrong AST edit — look again before spending tokens
          await new Promise((r) => setTimeout(r, HMR_RETRY_MS))
          result = await verifyRound(`${tag}-${round}`)
        }
        const { score, failures } = result
        lastFailures = failures
        stage('verify', `${Math.round(score * 100)}% of actions satisfied`)

        if (score > best) best = score
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
    } finally {
      if (session) {
        totalUsage = addUsage(totalUsage, (session as CodegenSession).usage())
        ;(session as CodegenSession).close()
      }
    }
    return { score: Math.max(0, best), failures: lastFailures, detail: lastVerify }
  }

  let bestScore = -1
  let candidates: Array<{ index: number; score: number; files: string[]; chosen: boolean }> | null = null

  if (attempts === 1) {
    const only = await runAttempt('', '1')
    bestScore = only.score
  } else {
    // Generate each attempt from the SAME confirmed interpretation, score it,
    // then put the tree back so the next one starts where this one did.
    const tries: Attempt[] = []
    for (let i = 0; i < attempts; i++) {
      stage('candidate', `attempt ${i + 1}/${attempts}: generating`)
      const r = await runAttempt(APPROACHES[i] ?? '', `${i + 1}`)
      const work = captureWork(ctx.root, cp)
      tries.push({
        index: i, score: r.score, detail: r.detail, failures: r.failures,
        files: [...work.keys()], work, tokens: { input: 0, cacheRead: 0, output: 0 },
      })
      stage('candidate', `attempt ${i + 1}/${attempts}: ${Math.round(r.score * 100)}% faithful`)
      revertWork(ctx.root, cp, work)
    }
    const winner = pickBest(tries)
    if (winner) {
      stage('candidate', `keeping attempt ${winner.index + 1} (${Math.round(winner.score * 100)}%)`)
      applyWork(ctx.root, winner.work)
      // the chosen work only just hit disk; verify it in place rather than
      // trusting the score it earned before the revert
      await new Promise((r) => setTimeout(r, HMR_SETTLE_MS))
      const confirmed = await verifyRound('final')
      bestScore = confirmed.score
    }
    candidates = tries.map((t) => ({
      index: t.index, score: t.score, files: t.files, chosen: t.index === winner?.index,
    }))
    save('candidates.json', candidates)
  }
  void provider

  // touchedFiles, not changedFiles: a component the run CREATED is untracked
  // and never shows up in a diff, so new files went unreported in the summary
  const files = touchedFiles(ctx.root, cp)
  save('result.json', {
    // recorded, not inferred: the runs viewer had to guess design-vs-gesture
    // from whether an action happened to be kind 'design'
    engine: 'model', mode: input.mode ?? 'gesture', checkpoint: cp.sha, changedFiles: files,
    reading: interp.reading, verification: lastVerify, tokens: totalUsage,
    codemod: { handled: plan.handled.map((h) => h.index), refused: plan.refused },
    backend: { applied: backend, refused: backendRefused },
    fidelity,
    candidates,
    finishing: finishEdits,
  })
  const summary =
    // A dropped action leads, because it is the thing most worth knowing and a
    // verified percentage reads as "it all worked". But only a DROPPED action
    // earns that billing: `rejected` also collects reasons from actions that ran
    // perfectly well after one unusable id was ignored, and counting those as
    // failures turned a healthy run into "11 not carried out".
    ((interp.droppedActions ?? 0) > 0
      ? `⚠ ${String(interp.droppedActions)} action(s) not carried out: ${interp.rejected.join('; ')} · `
      : interp.rejected.length
        ? `(${String(interp.rejected.length)} detail(s) ignored: ${interp.rejected[0]}${interp.rejected.length > 1 ? ', …' : ''}) · `
        : '') +
    `[v2] ${Math.round(Math.max(0, bestScore) * 100)}% verified · ${files.length} file(s) · ` +
    // the backend engines write their own receipts, and they name a file that
    // did not exist a moment ago — more use to the user than a count
    backend.map((b) => `${b.change} · `).join('') +
    // a refusal explains what the code would have to look like instead, so it
    // travels word for word rather than as "1 action refused"
    backendRefused.map((r) => `✗ ${r} · `).join('') +
    (plan.handled.length ? `codemod ${plan.handled.length}/${interp.actions.length} actions · ` : '') +
    (interp.actions.some((a) => a.svgPaths?.length) ? `${fidelitySummary(fidelity)} · ` : '') +
    (candidates
      ? `best of ${candidates.length} (${candidates.map((c) => `${Math.round(c.score * 100)}%`).join('/')}) · `
      : '') +
    `${fmtTokens(totalUsage)} tokens · revert: git restore --source=${cp.sha.slice(0, 10)} -- <paths>`
  stage('done', summary)
  return { summary }
}

/**
 * Did the colour the user drew in actually reach the page?
 *
 * Deliberately generous about WHERE: the action's own region for a creation,
 * the target's rect for an edit, and any element inside it counts. What it is
 * strict about is the colour itself, in the perceptual space the palette
 * snapping already uses — "close enough to the red you drew" is a measurement,
 * not an opinion.
 */
export function verifyColor(
  a: GroundedAction,
  after: DomSnapshot,
): { satisfied: boolean; reason: string; nearest?: number } {
  const want = parseCssColor(a.color?.nearest?.css ?? a.color?.drawn ?? '')
  if (!want) return { satisfied: true, reason: 'no readable colour intent to check' }
  const box = a.region ?? a.targets[0]?.rect ?? a.dest?.rect
  if (!box) return { satisfied: true, reason: 'nothing to look in' }

  const inside = after.nodes.filter((n) => {
    const cx = n.rect.x + n.rect.w / 2
    const cy = n.rect.y + n.rect.h / 2
    // a generous margin: a decoration is often positioned just outside the
    // box the ink occupied
    return cx >= box.x - 40 && cx <= box.x + box.w + 40 && cy >= box.y - 40 && cy <= box.y + box.h + 40
  })
  let best = Infinity
  for (const n of inside) {
    for (const css of [n.style.color, n.style.backgroundColor]) {
      const got = css ? parseCssColor(css) : null
      if (got) best = Math.min(best, deltaE(want, got))
    }
  }
  const drawn = a.color?.drawn ?? '?'
  if (best === Infinity) return { satisfied: false, reason: `nothing rendered near the drawing to carry ${drawn}` }
  // the same threshold the palette uses to decide two colours are the same
  const ok = best <= 25
  return {
    satisfied: ok,
    nearest: Math.round(best * 10) / 10,
    reason: ok
      ? `${drawn} is on the page (ΔE ${best.toFixed(1)})`
      : `nothing near the drawing is the colour that was drawn (${drawn}); closest is ΔE ${best.toFixed(1)} away`,
  }
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

    // A drawn colour is an instruction, and until now nothing checked it: a
    // run could be asked for red, produce grey, and report 100%. Structure was
    // measured richly while appearance was not measured at all.
    if (a.color) {
      total++
      const verdict = verifyColor(a, after)
      details.push({ kind: 'colour', index: i, ...verdict })
      if (verdict.satisfied) satisfied++
      else failures.push(`action ${i} (colour): ${verdict.reason}`)
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
        // the aesthetic the user picked is part of the contract, and it is
        // observable in the source: gradients, filters, whether anything is
        // filled at all
        const styleProblems = controls.style === 'auto'
          ? []
          : depiction.sources.flatMap((src) => styleFaults(controls.style, src, compositionFromSource(src).tones))
        const ok = best.score >= passMark(controls) && styleProblems.length === 0
        details.push({
          kind: 'composition', index: i, score: best.score,
          massSimilarity: best.massSimilarity, flaws: best.flaws, notes: best.notes,
        })
        if (ok) satisfied++
        else {
          failures.push(
            `action ${i} (composition of "${a.depicts ?? 'the drawing'}", ` +
            `${Math.round(best.score * 100)}% faithful): ${[...best.notes, ...styleProblems].join('; ')}`,
          )
        }
      }
    }
  }

  return { score: total > 0 ? satisfied / total : 1, failures, detail: details }
}
