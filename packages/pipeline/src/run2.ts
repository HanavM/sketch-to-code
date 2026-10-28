/**
 * v2 pipeline: model-led intent over owned geometry.
 * interpretV2()  — evidence → one multimodal call → grounded, validated intent
 * runV2()        — grounded intent → codegen → per-action verification
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { encodePng, renderScene, type Stroke } from '@s2c/ink'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { EditOp } from '@s2c/intent'
import {
  addUsage, defaultInterpreterProvider, defaultPerceptionProvider, type PerceptionProvider, type TokenUsage,
} from '@s2c/providers'
import { createCodegenSession, type CodegenSession } from './codegen.js'
import { settleSession, sleepUnlessStopped, throwIfStopped, untilStopped } from './abort.js'
import { commitPlan, planStructuralEdits } from './codemod.js'
import { promoteToApi } from './api.js'
import { makeFormReal } from './form.js'
import { linkToScreen } from './navigate.js'
import { retargetIntoScreens, type AppliedScreen } from './screen-contents.js'
import {
  buildEvidence, DESIGN_INTERPRET_PROMPT, groundInterpretation, INTERPRET_PROMPT,
  interpretationSchema,
  type GroundedAction, type GroundedInterpretation, type RawInterpretation, type TypedNote,
} from './intent2.js'
import { SKETCH_SKILL } from './skill.js'
import { checkpoint } from './safety.js'
import { rowPartsBrief, toggleBrief } from './rowparts.js'
import { describeCollapsed, findCollapsedFills } from './collapsed.js'
import {
  APPROACHES, applyWork, captureWork, pickBest, revertWork, touchedFiles, untrackedFiles, type Attempt,
} from './candidates.js'
import { buildScaffold, lostStrokes, restoreLostStrokes, scaffoldDir, type Scaffold } from './scaffold.js'
import { askedHexes, finishSource, paletteFor } from './finish.js'
import { compositionBrief, compositionFromSource, compositionFromStrokes, scoreComposition } from './composition.js'
import {
  DEFAULT_FIDELITY, fidelityDirective, fidelitySummary, normalizeFidelity, passMark, rungFor,
  type FidelityControls,
} from './fidelity.js'
import { appPalette, deltaE, parseCssColor } from './palette.js'
import { recolorElement } from './recolor.js'
import { recolorPropOf } from './plain-reading.js'
import { styleFaults } from './style.js'
import { evaluateConstraints, loadConstraints } from './constraints.js'
import { verifyDesignPlacement, verifyOps } from './verify.js'
import { decorationCandidates, verifyShapeAnchor } from './shape-anchor.js'
import { verifyPageDrift } from './drift.js'
import { inkColoursBrief, inkHexes, verifyInkColours } from './inkcolour.js'
import { verifyShapeMarks, verifyTextClearOfFields, loadKeptMarks, saveKeptMarks, mergeKeptMarks, marksInPlace, keptMarksBrief, verifyKeptMarks, marksMiss, type KeptMark } from './shapemark.js'
import { countClaims, countsBrief, verifyCounts } from './counts.js'
import { fillClaims, verifyFills, type FillVerdict } from './fills.js'
import { repairFits, VERIFY_MARGIN_MS } from './repair-time.js'
import { REPAIR_EDIT_MS, STALL_MS, TurnStalled, stallReason, watchTurn } from './turn-watch.js'
import { areasBrief, verifyAreaMarks, verifyAreaWords, verifyBands, verifyEdges } from './areas.js'
import { solidsBrief, verifySolids } from './solids.js'
import { placedBrief, textPlaceBrief, verifyPlaced, verifyTextPlace, type PlacedNote } from './textplace.js'
import { textLookBrief, verifyOutlined, verifyReadable } from './textlook.js'
import { leanRepairNote } from './repair-brief.js'
import { verifyInsertSlot } from './insert-slot.js'
import { explainRun } from './explain.js'
import type { RunContext, RunResult } from './run.js'
import { deriveProbes, relocateProbes, type ProbeVerdict } from './probe.js'

/** Vite's watcher + HMR after an instant codemod write, before the first look. */
const HMR_SETTLE_MS = 600
/** One more look when a codemod-only run fails verification. */
const HMR_RETRY_MS = 1500

const fmtTokens = (u: TokenUsage) =>
  `${(u.input / 1000).toFixed(1)}k in +${(u.cacheRead / 1000).toFixed(1)}k cached / ${(u.output / 1000).toFixed(1)}k out`

/** One codegen turn's cost (billed = input incl. cache writes + output). */
export interface SendCost {
  attempt: string
  kind: 'build' | 'repair'
  billed: number
  output: number
  cacheRead: number
  toolCalls: number
  /** The turn's tool calls in order, "Name dir/file" (at most 40). */
  tools: string[]
  ms: number
  /** Set when the turn was ended for making no progress: why. */
  stalled?: string
}

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
- "textMarks" lists strokes that are squiggles standing for lines of text. Each one
  is a line of REAL copy (from a typed note when there is one, otherwise plausible
  words for the page); its length and height say body versus heading. They are
  never drawn as SVG, whatever the FIDELITY block says, and they have no svgPath.
- "shapeMarks" lists strokes that are plain shapes the user drew to say WHERE a
  thing goes and HOW BIG: a box, a straight line, a ring. Each carries its clean
  geometry in page px (box; a line's from/to). They have no svgPath and are never
  drawn as SVG or traced: the user's ink is never part of the page. Build what each
  one stands for as real elements with CSS, on that geometry:
  box → the block it marks (card, button, input, toggle, panel, a picture with an X,
    or just the area a big word, chart or group sits in) at exactly box x/y/w/h.
    That includes its spot on the page: a card or panel drawn in the upper part of
    the screen is never centred vertically (no min-h-screen + items-center or
    justify-center, place-items-center, my-auto); its top is box.y from the page top
    (padding-top on the page wrapper). Centre it across only if it was drawn centred.
    Labels stay in their own row above their field, never on another field;
    Whether it shows a border or a fill comes from what it is and the notes, never
    from the ink: a box drawn round a big word, number or group only marks its
    area (no frame, no card) unless a note says border, outline, card or panel;
    a box flagged "area": true is exactly that: transparent, no fill, border or shadow;
    a line flagged "edge": true is the slanted boundary between two page colours;
    a box or ring flagged "solid" is one plain element of that colour (opaque, no path);
    a box flagged "outlined" holds hollow letters (transparent fill, text stroke);
  line → a level line standing for text marks the MIDDLE of its letters: centre
    that text's line box on the line's y (top = y - lineHeight / 2), never put
    the text's top edge on it. A level line is a row of text (a short one under a
    heading is that heading's smaller line, UNLESS "textSize" lists it with the heading:
    then it is the same heading wrapped onto its next line, same size), a divider rule (a long thin line across a section, a
    1px border), or an underline (an active tab, a link): pick by length and what
    is next to it; a slanted line is an edge between two areas (clip-path); never
    a wavy or hand-drawn path;
  ellipse → a clean circle or ring (border-radius: 50%), exactly box w × h.
- "textSize" groups stacked text squiggles, or stacked level lines drawn as one big
  heading (a long line with a shorter one under it): the spacing the user drew between the
  lines IS the line height. Set that text's font-size to fontPx (within ~15%) with a
  matching line-height, wrapped to box.w, so it fills the drawn box with that many
  lines. A one-line entry is a lone heading squiggle drawn tall: its height set
  fontPx. A display headline drawn this big stays this big; never shrink it to the
  app's default heading size. When a note gives that text's line-height ('lines set
  tight (line-height 0.9)'), the drawn pitch still holds: font-size = linePitchPx /
  that line-height (overrides fontPx), line-height exactly as said.
  "lineWidths" is how long each line was drawn: break the copy where the drawing
  breaks, so each line's words fill about its drawn length (a long first line and a
  short second one means most of the words on line 1, a word or two on line 2). If
  the words would wrap earlier than drawn, take the font-size down within the 15%
  and keep the weight regular unless a note asks for bold; never let a heading wrap
  into more lines than were drawn.
  A one-line entry's region is centred on the drawn letters for line-height 1.2:
  the letters must sit where the squiggle was drawn. Use line-height 1.2 for it, or
  if you set display type tighter (0.8-1), keep the line box centred on the
  region's middle: top = region.y + (region.h - lineHeightPx) / 2, never region.y
  (a tight box at region.y lifts the letters by half the difference).
- "region" is where the user drew it, in page px (x, y from the page's top-left).
  When the page is being built from the drawing, make each block land there: its
  top edge within ~16px of region.y, its width within ~10% of region.w (explicit
  width/max-width and margins). Add no extra top padding or default body margin
  that pushes everything down. Never wrap the page in a centred max-width
  container that moves blocks off their drawn x: a block drawn at the right edge
  sits at the right edge, one drawn at x=60 starts at x=60. A box drawn tall sets the block's height too
  (bottom within ~5% of region.y + region.h): a grid, calendar or table drawn
  that tall fills it, its row heights = the box height / the number of rows,
  rather than shrinking to its content. Exception: a note that says a block bleeds off the
  edge, overlaps another, or is tilted means it may pass its region on purpose;
  keep its anchor edge at the region and let it run past.
- Effect words in notes are exact requests, never to be softened into a plainer
  look. Build each with real CSS (arbitrary values / inline style where the
  app's utility classes lack it):
  tilted/rotated → transform: rotate(-3..-8deg or 3..8deg); 'tilted N° clockwise' →
    rotate(Ndeg), 'tilted N° anticlockwise' → rotate(-Ndeg), exactly N;
  frosted glass → translucent fill (white 10-20% alpha), backdrop-filter: blur(12px+),
    1px light border;
  soft blurred blob/glow → filter: blur(40px+) on a solid shape, set on the element's own
    style (or class), never only inside @keyframes: with animations off (reduced motion,
    a paused or first-frame render) a blur that lives only in the keyframes is gone and
    the glow is a hard-edged disc. The same holds for any look an animation also
    touches (filter, shadow, opacity): its resting value is on the element itself;
  hollow/outlined type → color: transparent with -webkit-text-stroke (2-3px);
  bleeding off the edge → the block extends past the viewport edge (wide type or
    negative margin), with overflow-x hidden on the page wrapper; "off the left
    edge" runs off the left only (negative left margin, or the px given:
    "starts 40px past it" → left: -40px), its letters set
    together as one word, never spread apart to span the page;
  tight-set letters → letter-spacing about -0.03em (display type set tight);
  wide-spaced letters → letter-spacing 0.15-0.3em;
  a named typeface ("Helvetica type", "giant Georgia ...") → font-family with that
    face first and its usual fallbacks (Helvetica, Arial, sans-serif), on the page
    or that block; never left to the app's default font. Never edit index.html
    (any change to it reloads the whole page and drops the run in progress): a
    web font, if one is needed, is an @import url(...) line at the very top of
    the app's main CSS file, else the face with its system fallbacks;
  a block painted by a CSS background (a gradient, a conic pinwheel of slices, a
    mask) → a plain div with exactly that background, never put inside an SVG
    as a <pattern> or <foreignObject> fill (those never paint: the block shows
    blank), and never by editing the shared drawn-shape component;
  grey text (on a page whose text is white or black) → that softer grey, not the
    page's text colour;
  text whose colour no note gives → a colour that reads on what is right behind
    it: white or light on a dark or saturated fill (red, black, navy), near-black
    on a light one; on a split page, judge by the half the text sits on (checked);
  overlapping → absolute position or negative margin so the two boxes truly overlap;
  a bar laid OVER the page top (absolute at 0,0) → what sits under it keeps its
    page y by its own absolute top or padding-top on the page wrapper, never a
    margin-top on the wrapper's first flow child: that margin collapses through a
    wrapper with no padding or border and pushes the whole page, bar included, down;
  any page wrapper that holds absolutely placed parts AND flow children → give the
    wrapper display: flow-root (Tailwind flow-root), so a margin-top on its first
    flow child stays inside it; otherwise that margin collapses through the wrapper
    and moves the wrapper, and every absolute part placed in it, down by that much;
  colour-inverting where it crosses what is under it → white text with
    mix-blend-mode: difference, and it must blend with the REAL page under it:
    never put the blending text inside an 'isolate' (isolation: isolate), z-index,
    opacity or transform wrapper unless that same wrapper paints the page's
    background colour itself; otherwise the light page is outside the blend
    group and the text shows white on white. Simplest: give the absolute
    wrapper holding the blocks the page background (e.g. bg-white), or no isolate;
  behind everything / a backdrop (hills, a floor grid, a glow layer) → the first
    child of its wrapper, absolutely placed, with the content after it in the DOM;
    never a bare negative z-index (-z-10): unless the wrapper is its own stacking
    context (isolate), it slides behind the page's background and vanishes;
  hard/offset shadow → box-shadow with an offset and 0 blur (e.g. 6px 6px 0 #000);
  stripes/bands → repeating-linear-gradient or stacked solid bands.
  outline circle/ring → border only, transparent inside (no fill, no tint);
  spinning/rotating/floating/pulsing → a keyframe on the shape itself, which stays
    on its drawn box: place it with left/top/width/height from the region and never
    centre an animated element with transform: translate(-50%,-50%) (the keyframe's
    transform replaces it and the shape jumps half its size down and right). A
    spinning ring turns in place; a shape not said to move stays where it was drawn.
- A note that lists the parts of one block (table columns, calendar events, stat
  cards, chat bubbles, kanban cards, list items) is that block's content: build
  each quoted item with its words exactly as written, in the order given, with
  the colour or side named next to it. Counts are real: "7 rows" means seven
  rows, "5 weeks" five week rows, "8 bars" eight bars; "2 more" means two more
  items of the same kind with plausible content. An ellipsis AFTER a closing
  quote ("Can we get"…) means the copy was cut short: finish it plausibly. An
  ellipsis INSIDE the quotes ("Write a message…") is literal text.
- Charts are drawn, never left empty: every bar, line or slice must be visible.
  Give each bar an explicit pixel height (or a % of a parent whose height is
  set in px; a % height inside an auto-height flex row renders as 0), let the
  bars fill the drawn chart box down to its baseline, vary the heights
  plausibly, and keep axis labels outside the bars' area.
- Quoted copy in a note is the copy, word for word: never retitle it ("Get in
  touch" stays "Get in touch", not "Contact Us"). 'label "Email" above' is a
  visible label element above the field, not placeholder text; 'line under:
  "..."' is a smaller line of that copy directly under the heading.
- A plain drawn box is never an image placeholder. Build an image (or a grey
  picture block) only where the ink is a box with an X through it or the notes
  say picture/photo/image. The X through a box only
  marks it as a picture: never build its diagonal lines. When the note gives
  that box a look (a colour, a gradient, a shadow), the look fills the whole
  box. An empty box beside the main column is a sidebar or
  panel: give it a short heading and a few lines of plausible text that suit
  the page.
- "insertSlot" on an add/design action: the user drew it in the gap between
  two siblings. Put the new element in the source right after "after" and
  right before "before" (both carry srcLoc), inside the same parent. Never
  append it at the end of the container instead.
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
  // every stage is also written down as it happens: a run that hangs or is
  // stopped still says where it got to (n18: a stalled repair left nothing)
  const runStarted = Date.now()
  const stage = (s: string, detail?: string) => {
    try {
      appendFileSync(join(runDir, 'stages.jsonl'), JSON.stringify({ ms: Date.now() - runStarted, stage: s, detail }) + '\n')
    } catch { /* the record is a bonus; the stage still goes out */ }
    ctx.emit('stage', { stage: s, detail })
  }
  const stallMs = Number(process.env.S2C_STALL_MS) > 0 ? Number(process.env.S2C_STALL_MS) : STALL_MS
  const repairEditMs = Number(process.env.S2C_REPAIR_EDIT_MS) > 0 ? Number(process.env.S2C_REPAIR_EDIT_MS) : REPAIR_EDIT_MS
  let repairStalled: string | null = null
  let totalUsage: TokenUsage = { input: 0, cacheRead: 0, output: 0 }

  stage('safety', 'git checkpoint')
  const cp = checkpoint(ctx.root, ctx.allowDirty)
  writeFileSync(join(runDir, 'checkpoint.txt'), `${cp.sha}\n`)
  // What was already lying around untracked. Undo spares these, so they must
  // not count as "something Undo can put back" either (see explanation below).
  let untrackedBefore: Set<string>
  try { untrackedBefore = new Set(untrackedFiles(ctx.root)) } catch { untrackedBefore = new Set() }

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
  throwIfStopped(ctx.signal)
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
  const screensWritten: AppliedScreen[] = []
  /** Every navigate the engine applied, by action: the route its probe must reach. */
  const navRoutes = new Map<number, string>()
  // s2c-050: a coloured ring the plain reader decided ("make it this colour",
  // no words) is one literal in one attribute. The engine writes it; when it
  // can't (a component, a dynamic className, a .map template), the action goes
  // to codegen exactly as before, so a refusal is a cost, never a failure.
  const tailwind = appPalette(input.snapshot).length > 0
  for (const [i, a] of interp.actions.entries()) {
    if (handled.has(i)) continue
    const prop = a.kind === 'modify' ? recolorPropOf(a.instruction) : null
    if (!prop || !a.color || a.notes?.length) continue
    const t = a.targets.length === 1 ? a.targets[0] : undefined
    if (!t?.srcLoc) continue
    const out = recolorElement(ctx.root, {
      srcLoc: t.srcLoc,
      prop,
      color: a.color,
      tailwind,
      instanceCount: input.snapshot.nodes.filter((n) => n.srcLoc === t.srcLoc).length,
    })
    if (out.ok) {
      handled.add(i)
      backend.push({ index: i, change: out.change ?? 'recoloured', files: out.file ? [out.file] : [] })
      stage('codemod', `action ${i}: ${out.change ?? 'recoloured'}`)
    } else {
      stage('codemod', `action ${i}: recolour left to the model (${out.error ?? 'refused'})`)
    }
  }

  for (const [i, a] of interp.actions.entries()) {
    if (handled.has(i)) continue
    if (a.kind !== 'serve' && a.kind !== 'save' && a.kind !== 'navigate') continue
    const srcLoc = a.targets[0]?.srcLoc
    if (!srcLoc) continue // grounding already rejected these; belt and braces
    const out = a.kind === 'serve'
      ? promoteToApi(ctx.root, { srcLoc })
      : a.kind === 'navigate'
        ? linkToScreen(ctx.root, { srcLoc, screen: a.screen ?? '' })
        : makeFormReal(ctx.root, { srcLoc })
    if (out.ok) {
      handled.add(i)
      backend.push({ index: i, change: out.change ?? a.kind, files: out.files ?? [] })
      if (a.kind === 'navigate' && 'route' in out && out.route) navRoutes.set(i, out.route)
      if (a.kind === 'navigate' && 'screenAt' in out && out.screenAt && out.route) {
        screensWritten.push({ index: i, file: out.screenAt, route: out.route, title: out.title ?? a.screen ?? '' })
      }
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
  // What was sketched inside a new screen's box goes on that screen, not on
  // the page it was drawn on (s2c-040). Only now: the screen file has to exist
  // before anything can be pointed into it.
  if (screensWritten.length) {
    const moved = retargetIntoScreens(ctx.root, interp.actions, input.strokes, screensWritten, handled)
    for (const m of moved) stage('codemod', `action ${m.index}: goes on the screen in ${m.file}`)
    if (moved.length) save('screen-contents.json', moved)
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

  // n8: what the user drew earlier stays put, and the numbers they typed are exact
  const freshMarks = interp.actions.flatMap((a) => a.shapeMarks ?? [])
  const RESIZE = /\b(move|shift|resize|bigger|smaller|wider|narrower|taller|shorter|larger|grow|shrink|lower|higher|up|down)\b/i
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h, b.w * b.h) : 0
  }
  const keptAll = loadKeptMarks(ctx.root)
  const kept: KeptMark[] = marksInPlace(keptAll, input.snapshot).filter((k) =>
    !freshMarks.some((m) => m.shape !== 'line' && overlaps(m.box, k.box) > 0.6) &&
    // a note that asks to move or resize the very block it sits on is obeyed, not undone
    !interp.actions.some((a) => {
      const r = a.region ?? a.dest?.rect
      return !!r && overlaps(r, k.box) > 0.5 && RESIZE.test([a.instruction, ...(a.notes ?? [])].join(' '))
    }))
  if (kept.length) save('kept-marks.json', kept)
  const counts = countClaims([
    ...(input.notes ?? []).map((n) => n.text),
    ...(interp.pageNotes ?? []), ...(interp.runNotes ?? []),
    // a colour tapped or drawn in ink is as exact as a typed hex: never snap it to a nearby token
    // (n18, r1 e1-login: the tapped pale grey page #f3f4f6 was rewritten to bg-white, ΔE 4, after every build)
    ...inkHexes(interp),
  ])
  if (counts.length) save('counts.json', counts)

  const baseBrief =
    `READING (user-confirmed): ${interp.reading}\n\n` +
    codemodNote +
    `FIDELITY (set by the user for this run):\n${fidelityDirective(fidelity)}\n\n` +
    (interp.runNotes?.length
      ? `THE USER ALSO TYPED (applies to the whole run — their exact words, and they ` +
        `outrank any reading of the ink):\n${interp.runNotes.map((n) => `- ${n}`).join('\n')}\n\n`
      : '') +
    (interp.pageNotes?.length
      ? `PAGE LOOK (the user typed these about the whole page, wherever the note sits): ` +
        `apply them to the page itself — the outermost page wrapper / body background, filling at ` +
        `least the full viewport height (min-height: 100vh) behind every block — not only to the ` +
        `block the note was typed on. A box drawn across the top is still a nav row on that ` +
        `page, not a filled bar, unless a note says so. A tinted page colour (pale blue-grey, off-white, ` +
        `cream, warm paper) must show as that tint behind the white cards, never plain white:\n${interp.pageNotes.map((n) => `- ${n}`).join('\n')}\n\n`
      : '') +
    countsBrief(counts) +
    rowPartsBrief([
      ...(input.notes ?? []).map((n) => n.text), ...(interp.runNotes ?? []),
      ...interp.actions.flatMap((a) => a.notes ?? []),
    ].filter((n, i, all) => all.indexOf(n) === i)) +
    toggleBrief([
      ...(input.notes ?? []).map((n) => n.text), ...(interp.runNotes ?? []),
      ...interp.actions.flatMap((a) => a.notes ?? []),
    ]) +
    keptMarksBrief(kept) +
    inkColoursBrief(interp) +
    areasBrief(interp.actions, input.snapshot.viewport) +
    solidsBrief(interp.actions) +
    textLookBrief(interp.actions) +
    textPlaceBrief(interp.actions, input.snapshot.viewport) +
    placedBrief(interp.placedNotes, input.snapshot.viewport) +
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
  let laid: Scaffold[] = []
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
    laid = out
    return out
  }

  const palette = paletteFor(input.snapshot)
  const asked = askedHexes([
    ...interp.actions.flatMap((a) => [a.instruction, ...(a.notes ?? [])]),
    ...(interp.pageNotes ?? []), ...(interp.runNotes ?? []),
    // n20: a colour the ink stated (a tap on the page or a mark) is as exact as a typed hex; snapping the
    // tapped pale grey page (#f3f4f6) to bg-white failed the ink-colour check every round (r1 e1, repair x2)
    ...(interp.pageFill?.colors ?? []), ...interp.actions.flatMap((a) => (a.inkColours ?? []).map((c) => c.color)),
  ])
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
      const { code: next, edits } = finishSource(code, palette, asked)
      if (!edits.length || next === code) continue
      writeFileSync(abs, next)
      finishEdits.push({ file: rel, edits })
      for (const e of edits) stage('finish', `${rel}: ${e.detail}`)
    }
  }

  let lastVerify: unknown = null
  /** Re-snapshot the live page and score every action against the drawing. */
  const verifyRound = async (tag: string) => {
    // finishPass writes source: never after a stop
    throwIfStopped(ctx.signal)
    finishPass()
    const after = await untilStopped(ctx.requestSnapshot(runId), ctx.signal)
    // read back what was just written, so composition can be scored against
    // the ink without a screenshot or a model call
    const sources: string[] = []
    for (const rel of touchedFiles(ctx.root, cp)) {
      if (!/\.(tsx|jsx)$/.test(rel)) continue
      try { sources.push(readFileSync(join(ctx.root, rel), 'utf8')) } catch { /* deleted */ }
    }
    // behaviour: act on the page the drawing named, then look. Only after the
    // static snapshot, so the probe's own residue (a "Saved" line) is never
    // what the static checks measure.
    // stamps are positional and the edit shifted them: look the elements up
    // where they are now, not where they were when the sketch was read
    const specs = relocateProbes(deriveProbes(interp.actions, navRoutes), interp.actions, after)
    let probes: ProbeVerdict[] = []
    if (specs.length) {
      if (ctx.requestProbes) {
        stage('verify', `testing ${specs.length} behaviour(s) in the page`)
        probes = await untilStopped(ctx.requestProbes(specs), ctx.signal)
        for (const v of probes) stage('verify', `${v.status}: ${v.reason}`)
      } else {
        probes = specs.map((sp) => ({ actionIndex: sp.actionIndex, status: 'unverified' as const, reason: "couldn't test it: this host can't drive the page" }))
      }
    }
    const result = verifyActions(
      interp.actions, input.snapshot, after, { strokes: input.strokes, sources, fidelity }, probes,
      [...(interp.pageNotes ?? []), ...(interp.runNotes ?? [])],
      interp.pageFill,
      interp.placedNotes,
    )

    // the drawn strokes a scaffold handed over must still be drawn where they were
    // (round 5 c4: only a shifted shadow copy of the photo's outline was left)
    for (const sc of laid) {
      let now: string
      try { now = readFileSync(join(ctx.root, sc.rel), 'utf8') } catch { continue } // deleted on purpose
      const lost = lostStrokes(sc.code, now)
      if (!lost.length) continue
      // the user typed the whole SVG to build there (n160, round 15 c4 clipped striped blob): the drawn outline
      // was only where it goes, and putting it back as a filled path painted a dark slab over the typed art
      if (typedSvg(interp.actions[sc.actionIndex]?.notes) && /<svg\b/.test(now)) continue
      // put them back ourselves: a repair turn asked to restore one said it did and
      // didn't (round 4 c1), and the path is known exactly, so no model is needed
      const restored = restoreLostStrokes(sc.code, now, lost)
      if (restored !== null && !lostStrokes(sc.code, restored).length) {
        try {
          writeFileSync(join(ctx.root, sc.rel), restored)
          stage('verify', `put back drawn stroke(s) ${lost.join(', ')} in ${sc.rel}`)
          continue
        } catch { /* fall through to a repair turn */ }
      }
      result.failures.push(
        `action ${sc.actionIndex} (drawing): ${sc.rel} no longer draws the user's stroke(s) ${lost.join(', ')} in place ` +
        `(only a moved copy such as a shadow, or nothing, is left). Put the <path> with that exact d back, untransformed, ` +
        `with the fill the action asks for; a shadow is a second copy behind it, never a replacement.`,
      )
      result.score = Math.min(result.score, 0.99)
    }

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

    // boxes drawn in earlier runs stay where they were drawn (n8)
    const held = verifyKeptMarks(kept, after)
    if (!held.unverifiable && !held.satisfied) {
      stage('verify', held.reason)
      result.failures.push(`page (drawn earlier): ${held.reason}`)
      result.score = Math.min(result.score, 0.99)
    }
    // the numbers the user typed are exact (n8)
    const counted = verifyCounts(counts, after)
    if (!counted.unverifiable && !counted.satisfied) {
      stage('verify', counted.reason)
      result.failures.push(`page (typed counts): ${counted.reason}`)
      result.score = Math.min(result.score, 0.99)
    }

    // a bar or fill placed right but rendered with no area passes every
    // placement check and shows nothing: that is a failure, not a pass
    const collapsed = findCollapsedFills(input.snapshot, after)
    for (const c of collapsed) {
      stage('verify', `empty: ${c.srcLoc} renders with 0 ${c.axis}`)
      result.failures.push(describeCollapsed(c))
    }
    if (collapsed.length) result.score = Math.min(result.score, 0.99)

    lastVerify = broken.length || collapsed.length
      ? { verified: result.detail, ...(broken.length ? { brokenRules: broken } : {}), ...(collapsed.length ? { collapsed } : {}) }
      : result.detail
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
  const sends: SendCost[] = []
  const runAttempt = async (approach: string, tag: string) => {
    let session: CodegenSession | null = null
    const agent = (): CodegenSession => {
      if (!session) {
        session = createCodegenSession(ctx.root, 'design', { onStage: stage }, system, ctx.signal)
        writeFileSync(join(runDir, 'system.txt'), system)
      }
      return session
    }
    let replies = 0
    const saveReply = (reply: string) =>
      writeFileSync(join(runDir, `reply-${tag}-${++replies}.txt`), reply)
    // what each turn cost: a page's tokens alone could not say whether the
    // build or its repair rounds were the expensive part (round 1 c2: 91k)
    const metered = async (kind: 'build' | 'repair', content: { text: string; images?: string[] }) => {
      const s = agent()
      const u0 = s.usage()
      const t0 = s.toolCalls()
      const started = Date.now()
      let stalled: string | undefined
      try {
        // a repair must leave time for the verify after it; a build only
        // must not sit silent (the cap still ends it)
        const marginMs = kind === 'repair' ? VERIFY_MARGIN_MS : 0
        return await watchTurn(
          s.send(content, kind === 'repair' ? { effort: 'low' } : undefined),
          () => stallReason({
            now: Date.now(),
            // n21 (bento): a first build may think 150+ s before its one big Write; every streamed
            // delta (thinking too) shows it is alive. Only a repair must show tool calls or words.
            lastActivity: kind === 'build' ? s.lastActivity() : s.lastProgress(), deadline: ctx.deadline, marginMs, stallMs,
            // a repair is told the exact pixels: minutes of thought with no edit is a stall (n22)
            ...(kind === 'repair' ? { lastEdit: s.lastEdit(), editMs: repairEditMs } : {}),
          }),
          Math.min(5_000, Math.max(50, Math.floor(stallMs / 4))),
        )
      } catch (e) {
        if (e instanceof TurnStalled) stalled = e.why
        throw e
      } finally {
        const u1 = s.usage()
        sends.push({
          attempt: tag, kind,
          billed: u1.input - u0.input + u1.output - u0.output,
          output: u1.output - u0.output,
          cacheRead: u1.cacheRead - u0.cacheRead,
          toolCalls: s.toolCalls() - t0,
          tools: s.toolLog().slice(t0, t0 + 40),
          ms: Date.now() - started,
          ...(stalled ? { stalled } : {}),
        })
        // per turn, so a run the cap stops still says where its time went
        save('sends.json', sends)
      }
    }
    let best = -1
    let lastFailures: string[] = []
    // n24: the page as it was before the last repair turn, and how far its drawn boxes were off then
    let preRepair: { work: Map<string, string | null>; miss: number | null } | null = null
    const putBackIfWorse = async (miss: number | null, vtag: string): Promise<void> => {
      const prev = preRepair
      if (!prev || prev.miss == null || miss == null || miss <= prev.miss + 6) return
      // a repair that moved the drawn boxes further from where they were drawn is undone
      // (r2 e3 settings, n22: toggles 30px low became 48px low and that page was kept)
      const now = captureWork(ctx.root, cp)
      const added = new Map([...now].filter(([rel]) => !prev.work.has(rel)))
      if (added.size) revertWork(ctx.root, cp, added)
      applyWork(ctx.root, prev.work)
      stage('verify', `the repair moved drawn boxes further off (${prev.miss}px to ${miss}px in all): put the page back as it was before it`)
      await sleepUnlessStopped(HMR_SETTLE_MS, ctx.signal)
      const back = await verifyRound(`${vtag}-back`)
      lastFailures = back.failures
    }
    try {
      // scaffolds are written next: a stopped run must not start an attempt
      throwIfStopped(ctx.signal)
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
        saveReply(await metered('build', { text: brief, images }))
      } else {
        // the codemod wrote milliseconds ago; the client only waits 350ms after
        // the resnapshot event, which can beat Vite's watcher + HMR
        await sleepUnlessStopped(HMR_SETTLE_MS, ctx.signal)
      }

      for (let round = 1; round <= 3; round++) {
        stage('verify', `round ${round}: snapshotting edited page`)
        let result = await verifyRound(`${tag}-${round}`)
        if (result.score < 1 && !session && (plan.handled.length > 0 || backend.length > 0)) {
          // no agent has run: a failure here is far more likely an HMR race
          // than a wrong AST edit — look again before spending tokens
          await sleepUnlessStopped(HMR_RETRY_MS, ctx.signal)
          result = await verifyRound(`${tag}-${round}`)
        }
        const { score, failures } = result
        lastFailures = failures
        stage('verify', `${Math.round(score * 100)}% of actions satisfied`)

        const miss = marksMiss(lastVerify)
        // n24 (settings try 1): the repair took the toggles from 56px to 32px low, but the share of
        // actions passing stayed 60%, so it stopped with the page still low. Boxes moving clearly
        // closer to where they were drawn is progress too: one more round.
        const closer = preRepair?.miss != null && miss != null && miss < preRepair.miss - 12
        if (score > best || (score === best && closer)) best = score
        else {
          await putBackIfWorse(miss, `${tag}-${round}`)
          stage('verify', 'no improvement — stopping')
          break
        }
        if (score >= 1 || round === 3) break
        if (!repairFits(ctx.deadline, Date.now(), sends)) {
          stage('repair', 'not enough time left before the run cap for a repair turn: keeping this build')
          break
        }
        stage('repair', `round ${round + 1}`)
        preRepair = { work: captureWork(ctx.root, cp), miss }
        const context = session
          ? ''
          : `READING (user-confirmed): ${interp.reading}\n\n${codemodNote}` +
            `ACTIONS:\n${JSON.stringify(interp.actions.map((a, i) => ({ action: i, ...a })), null, 2)}\n\n` +
            `Check the codemod edits against the failures below before changing anything — ` +
            `if an edit is already correct, leave it and say so.\n\n`
        try {
          saveReply(await metered('repair', {
            text:
              `${context}Verification against the live DOM found problems:\n${failures.join('\n')}\n\n` +
              `Fix exactly these. Do not change anything already working.\n\n` +
              leanRepairNote(session ? (session as CodegenSession).toolLog() : []),
          }))
        } catch (e) {
          if (!(e instanceof TurnStalled)) throw e
          // keep the build: stop the agent (no more edits can land), then
          // verify what is on disk so the record says what the page really is
          repairStalled = e.why
          stage('repair', `repair round ${round + 1} stopped: ${e.why}; keeping the build`)
          const live = session as CodegenSession | null
          if (live) {
            live.close()
            await settleSession(live.closed)
          }
          const after = await verifyRound(`${tag}-${round + 1}`)
          lastFailures = after.failures
          if (after.score <= best) await putBackIfWorse(marksMiss(lastVerify), `${tag}-${round + 1}`)
          if (after.score > best) best = after.score
          stage('verify', `${Math.round(after.score * 100)}% of actions satisfied after the stopped repair`)
          break
        }
      }
    } finally {
      if (session) {
        totalUsage = addUsage(totalUsage, (session as CodegenSession).usage())
        ;(session as CodegenSession).close()
        // the agent may have an Edit in flight; it lands, or it doesn't,
        // before anyone is told this attempt is over
        await settleSession((session as CodegenSession).closed)
      }
    }
    return { score: Math.max(0, best), failures: lastFailures, detail: lastVerify }
  }

  let bestScore = -1
  let finalFailures: string[] = []
  let candidates: Array<{ index: number; score: number; files: string[]; chosen: boolean }> | null = null

  if (attempts === 1) {
    const only = await runAttempt('', '1')
    bestScore = only.score
    finalFailures = only.failures
  } else {
    // Generate each attempt from the SAME confirmed interpretation, score it,
    // then put the tree back so the next one starts where this one did.
    const tries: Attempt[] = []
    for (let i = 0; i < attempts; i++) {
      stage('candidate', `attempt ${i + 1}/${attempts}: generating`)
      const r = await runAttempt(APPROACHES[i] ?? '', `${i + 1}`)
      throwIfStopped(ctx.signal)
      const work = captureWork(ctx.root, cp)
      tries.push({
        index: i, score: r.score, detail: r.detail, failures: r.failures,
        files: [...work.keys()], work, tokens: { input: 0, cacheRead: 0, output: 0 },
      })
      stage('candidate', `attempt ${i + 1}/${attempts}: ${Math.round(r.score * 100)}% faithful`)
      revertWork(ctx.root, cp, work)
    }
    const winner = pickBest(tries)
    throwIfStopped(ctx.signal)
    if (winner) {
      stage('candidate', `keeping attempt ${winner.index + 1} (${Math.round(winner.score * 100)}%)`)
      applyWork(ctx.root, winner.work)
      // the chosen work only just hit disk; verify it in place rather than
      // trusting the score it earned before the revert
      await sleepUnlessStopped(HMR_SETTLE_MS, ctx.signal)
      const confirmed = await verifyRound('final')
      bestScore = confirmed.score
      finalFailures = confirmed.failures
    }
    candidates = tries.map((t) => ({
      index: t.index, score: t.score, files: t.files, chosen: t.index === winner?.index,
    }))
    save('candidates.json', candidates)
  }
  void provider
  // the last step that could still be writing has returned; a stop that
  // arrived during it wins over reporting success
  throwIfStopped(ctx.signal)

  // remember this run's drawn boxes, so later runs keep them where drawn (n8)
  if (freshMarks.length) saveKeptMarks(ctx.root, mergeKeptMarks(keptAll, freshMarks))

  // touchedFiles, not changedFiles: a component the run CREATED is untracked
  // and never shows up in a diff, so new files went unreported in the summary
  const files = touchedFiles(ctx.root, cp)
  save('result.json', {
    // recorded, not inferred: the runs viewer had to guess design-vs-gesture
    // from whether an action happened to be kind 'design'
    engine: 'model', mode: input.mode ?? 'gesture', checkpoint: cp.sha, changedFiles: files,
    reading: interp.reading, verification: lastVerify, tokens: totalUsage, sends,
    codemod: { handled: plan.handled.map((h) => h.index), refused: plan.refused },
    backend: { applied: backend, refused: backendRefused },
    fidelity,
    candidates,
    finishing: finishEdits,
    repairStalled,
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
  // The same outcome for someone who doesn't read code: what was understood,
  // which part didn't happen, and whether Undo has anything to put back.
  const explanation = explainRun({
    reading: interp.reading,
    actions: interp.actions,
    droppedActions: interp.droppedActions,
    // words the user typed that no action claimed: the Done sentence names them
    runNotes: interp.runNotes,
    // the last round, not the best: it describes what is on disk now
    failures: finalFailures,
    refused: backendRefused,
    // only what Undo would really revert: an Undo offered over nothing of this
    // run's own would pop the stack past it and revert the edit BEFORE it
    files: files.filter((f) => !untrackedBefore.has(f) && !f.startsWith('.sketch2code/')),
  })
  save('explanation.json', explanation)
  stage('done', summary)
  return { summary, explanation }
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
  /**
   * Behaviour probe verdicts (probe.ts). A static diff can't tell a working
   * form from a dead one; these can. Passed and failed count toward the score.
   * Unverified (unsafe to click, page gone) is reported but not counted:
   * it is neither a pass nor something a repair round could fix.
   */
  probes: ProbeVerdict[] = [],
  /** Words typed about the whole page or the run (no action claimed them): their page fill is checked too. */
  looseNotes: string[] = [],
  /** n10: the page colour tapped on bare page. */
  pageFill?: GroundedInterpretation['pageFill'],
  /** n29: words typed in empty space, checked to be built where typed. */
  typedSpots?: PlacedNote[],
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

  let decorations: DomNode[] | null = null
  const claimedDecorations = new Set<string>()
  // every drawn box on the page, so a field's check knows what sits above it (n22)
  const pageMarks = actions.flatMap((a) => (a.shapeMarks && !a.insertSlot ? a.shapeMarks : []))
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
    if ((a.kind === 'add' || a.kind === 'design') && a.onScreen) {
      // built on another screen, so the page it was drawn on can't show it:
      // the navigate probe opened that screen and counted what was there
      total++
      const seen = probes.find((p) => p.actionIndex === a.onScreen!.navIndex)
      const c = seen?.screenContent
      const verdict = !seen || seen.status === 'unverified' || !c
        ? { satisfied: false, reason: `couldn't open the "${a.onScreen.name}" screen to check it` }
        : c.count > 0
          ? { satisfied: true, reason: `the "${a.onScreen.name}" screen shows it (${c.sample || `${c.count} new things`})` }
          : { satisfied: false, reason: `the "${a.onScreen.name}" screen opened, but nothing you drew in its box is on it` }
      details.push({ kind: a.kind, index: i, onScreen: a.onScreen.route, verdict })
      if (verdict.satisfied) satisfied++
      else failures.push(`action ${i} (${a.kind}): ${verdict.reason}`)
    } else if (a.kind === 'add' || a.kind === 'design') {
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
      // a drawn decoration (pure ink, no words) must be ON its drawing, not
      // merely near some other new element (round-3 c3: rings built 300px off)
      if (isDecoration(a)) {
        decorations ??= decorationCandidates(before, after)
        const anchor = verifyShapeAnchor(decorations, region, claimedDecorations)
        if (anchor.claimed) claimedDecorations.add(anchor.claimed)
        if (!anchor.unverifiable) {
          details.push({ kind: 'anchor', index: i, verdict: anchor })
          total++
          if (anchor.satisfied) satisfied++
          else failures.push(`action ${i} (${a.kind}, placement): ${anchor.reason}`)
        }
      }
      // each drawn box or ring is a thing that size at that spot (n7)
      if (a.shapeMarks?.length && !a.insertSlot) {
        const marks = verifyShapeMarks(a.shapeMarks, before, after, pageMarks)
        if (!marks.unverifiable) {
          details.push({ kind: 'marks', index: i, verdict: marks })
          total++
          if (marks.satisfied) satisfied++
          else failures.push(`action ${i} (${a.kind}, drawn boxes): ${marks.reason}`)
        }
      }
      // "near the mark" is not "where the mark said": the end of a short nav
      // is near a caret drawn in its middle (s2c-055, r14 said Done twice)
      if (a.insertSlot) {
        const slot = verifyInsertSlot(a.insertSlot, before, after)
        details.push({ kind: 'place', index: i, verdict: slot })
        if (!slot.unverifiable) {
          total++
          if (slot.satisfied) satisfied++
          else failures.push(`action ${i} (place): ${slot.reason}`)
        }
      }
    }

    // A drawn colour is an instruction, and until now nothing checked it: a
    // run could be asked for red, produce grey, and report 100%. Structure was
    // measured richly while appearance was not measured at all.
    // a colour on another screen can't be measured from this one (s2c-040)
    if (a.color && !a.onScreen) {
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

  // whole-page builds: every block within ~16px of its drawn top (round 7 e1/e4/e5 drifted lower down the page)
  const placed = actions.flatMap((a, i) => {
    const region = a.region ?? a.dest?.rect
    if ((a.kind !== 'add' && a.kind !== 'design') || a.onScreen || !region || isDecoration(a)) return []
    if (/bleed|off the (left|right|top|bottom|page)|tilt|rotat|overlap|on top of/i.test(a.instruction)) return []
    return [{ index: i, region, quote: a.instruction.match(/["“]([^"”]{2,})["”]/)?.[1] ?? null }]
  })
  const drift = verifyPageDrift(before, after, placed)
  if (!drift.unverifiable) {
    details.push({ kind: 'drift', verdict: drift })
    total++
    if (drift.satisfied) satisfied++
    else failures.push(`page (vertical placement): ${drift.reason}`)
  }

  // fills the words gave as exact hex (round 7 e5: a #f3f4f6 header row built white three runs running, unchecked)
  const fillChecks: FillVerdict[] = []
  const pageClaims = looseNotes.flatMap((t) => fillClaims(t)).filter((c) => c.kind === 'page')
  if (pageClaims.length) fillChecks.push(verifyFills(after, pageClaims))
  for (const a of actions) {
    if ((a.kind !== 'add' && a.kind !== 'design') || a.onScreen) continue
    const claims = [a.instruction, ...(a.notes ?? [])].flatMap((t) => fillClaims(t))
    if (claims.length) fillChecks.push(verifyFills(after, claims, a.region ?? a.dest?.rect))
  }
  const judged = fillChecks.filter((v) => !v.unverifiable)
  if (judged.length) {
    const seen = new Set<string>()
    const faults = judged.filter((v) => !v.satisfied).map((v) => v.reason).filter((r) => !seen.has(r) && seen.add(r))
    details.push({ kind: 'fills', checked: judged.flatMap((v) => v.checked) })
    total++
    if (!faults.length) satisfied++
    else failures.push(`page (typed colours): ${faults.join('; ')}`)
  }

  // n14: a box round a big word is no card; a slanted line across the page is the colour edge
  // n16: text whose colour a note named keeps it; only the rest must read on what is behind
  const allMarks = actions.flatMap((a) => (a.kind === 'add' || a.kind === 'design') && !a.onScreen ? a.shapeMarks ?? [] : [])
  for (const [kind, v] of [['areas', verifyAreaMarks(allMarks, after)], ['edges', verifyEdges(allMarks, after)], ['words', verifyAreaWords(allMarks, after)], ['bands', verifyBands(allMarks, after)], ['solids', verifySolids(allMarks, after)],
    ['outlined', verifyOutlined(allMarks, after)], ['readable', verifyReadable(after, { skip: namedColourText(actions, looseNotes) })], ['clear', verifyTextClearOfFields(before, after)], ['placed', verifyTextPlace(allMarks, after, after.viewport)], ['typed-spot', verifyPlaced(typedSpots, after)]] as const) {
    if (v.unverifiable) continue
    details.push({ kind, verdict: v })
    total++
    if (v.satisfied) satisfied++
    else failures.push(`page (${kind === 'areas' ? 'boxes round big words' : kind === 'edges' ? 'slanted edge' : kind === 'words' ? 'big words filling their box' : kind === 'bands' ? 'band width' : kind === 'solids' ? 'coloured plain shapes' : kind === 'outlined' ? 'outlined words' : kind === 'clear' ? 'words on form fields' : kind === 'placed' ? 'words where drawn or typed' : kind === 'typed-spot' ? 'words typed in empty space' : 'text that reads'}): ${v.reason}`)
  }

  // n10: colours the ink stated (taps, coloured marks) reached their marks
  const inkCol = verifyInkColours(actions, pageFill, after)
  if (!inkCol.unverifiable) {
    details.push({ kind: 'ink-colours', verdict: inkCol })
    total++
    if (inkCol.satisfied) satisfied++
    else failures.push(`page (colours from the ink): ${inkCol.reason}`)
  }

  for (const v of probes) {
    details.push({ kind: 'behaviour', index: v.actionIndex, status: v.status, reason: v.reason })
    if (v.status === 'unverified') {
      failures.push(`action ${v.actionIndex} (behaviour, not tested): ${v.reason}`)
      continue
    }
    total++
    if (v.status === 'passed') satisfied++
    else failures.push(`action ${v.actionIndex} (behaviour): ${v.reason}`)
  }

  return { score: total > 0 ? satisfied / total : 1, failures, detail: details }
}

const QUOTE = /["\u201c\u201d]/
// single-quoted copy too: "badge reading 'Issue 07 out now'" (round-4 c1). Apostrophes
// inside words (don't, it's) never start a quote: the opening ' follows a space/bracket/colon.
const SINGLE_QUOTED = /(?:^|[\s(:\[])['\u2018][^'\u2018\u2019]*[A-Za-z0-9][^'\u2018\u2019]*['\u2019](?=$|[\s.,;:!?)\]])/
/** Pure drawn decoration: ink shapes only, no text lines, no quoted copy in its instruction. */
export function isDecoration(a: GroundedAction): boolean {
  if (!a.svgPaths?.length || a.textMarks?.length) return false
  if (a.layer === 'container') return false
  // the instruction only: notes typed inside a big drawn ring also attach to
  // the ring (round-3 c3), so their quoted copy says nothing about the ring
  return !QUOTE.test(a.instruction) && !SINGLE_QUOTED.test(a.instruction)
}

/** True when the user's typed words for an action hold whole SVG markup to build verbatim (n160). */
export function typedSvg(notes: readonly string[] | undefined): boolean {
  return (notes ?? []).some((n) => /<svg\b[^>]*>[\s\S]*<\/svg>/i.test(n))
}

/** n16: text a note gave a colour for ("JOIN THE NEXT RUN black") is not judged for readability. */
function namedColourText(actions: Array<{ notes?: string[] }>, loose: string[]) {
  // only what the user typed: the reading's own instructions name colours for everything
  const COL = /\b(white|black|cream|grey|gray|navy|lime|green|blue|red|pink|orange|yellow|purple|violet|teal|cyan|gold|dark|light)\b/i
  const notes = [...loose, ...actions.flatMap((a) => a.notes ?? [])]
    .filter((t) => COL.test(t)).map((t) => t.toLowerCase())
  return (n: { text?: string }) => {
    const words = (n.text ?? '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
    return words.length > 0 && notes.some((t) => words.slice(0, 3).some((w) => t.includes(w)))
  }
}
