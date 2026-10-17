/**
 * What a run did, said the way a person who doesn't read code would say it.
 *
 * The run summary (`[v2] 50% verified · 2 file(s) · codemod 1/2 actions ·
 * revert: git restore --source=…`) is written for the person who built this
 * tool. Someone who sketched a box on their app can't act on "action 1 (move):
 * source not inside dest". They need three things: what the tool understood,
 * which part didn't happen, and one button that puts things back.
 *
 * So this is built from STRUCTURE, never from the verifier's reason strings:
 * the action's kind and the visible text of what it touched. The reasons are
 * jargon by construction (ids, coordinates, file names) and they stay in the
 * run folder for whoever debugs it. The only free text that reaches the
 * sentence is the model's reading (written to be plain, scrubbed anyway) and
 * the page's own visible text.
 */
import type { GroundedAction, GroundedTarget } from './intent2.js'

export interface RunExplanation {
  /** True when something the user asked for did not happen. */
  problem: boolean
  /** One or two plain sentences, no ids, paths, code or stack traces. */
  sentence: string
  /** True when files were changed, so Undo has something to put back. */
  undoable: boolean
}

export interface ExplainInput {
  reading: string
  actions: GroundedAction[]
  /** Whole actions the reading proposed that could not be tied to the page. */
  droppedActions?: number
  /** Verifier failures, formatted `action N (kind): reason` (run2/verifyActions). */
  failures: string[]
  /** Backend actions that were refused (`action N (kind): why`). */
  refused?: string[]
  /** Files the run changed or created. */
  files: string[]
  /** Typed notes no single action claimed (GroundedInterpretation.runNotes). */
  runNotes?: string[]
}

const NOUN: Record<string, string> = {
  a: 'link', button: 'button', img: 'image', svg: 'picture', picture: 'image',
  h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
  p: 'text', span: 'text', li: 'item', nav: 'menu', header: 'header', footer: 'footer',
  form: 'form', input: 'field', textarea: 'field', select: 'dropdown', label: 'label',
  ul: 'list', ol: 'list', table: 'table', blockquote: 'quote', figure: 'figure',
  section: 'section', article: 'card', aside: 'side panel',
}

/** A short, visible label for an element: `the "Pricing" link`, `the image`. */
export function describeTarget(t: GroundedTarget | undefined): string {
  if (!t) return 'that part of the page'
  const noun = NOUN[t.tag.toLowerCase()] ?? 'part'
  const words = scrub((t.text || t.subtreeText || '').replace(/\s+/g, ' ').trim())
  if (!words) return `the ${noun}`
  const cut = words.length > 28 ? `${words.slice(0, 26).replace(/\s+\S*$/, '')}…` : words
  return `the ${noun} with "${cut}"`.replace(/^the text with /, 'the text ')
}

const PHRASE: Record<string, (a: GroundedAction) => string> = {
  delete: (a) => `remove ${describeTarget(a.targets[0])}`,
  modify: (a) => `change ${describeTarget(a.targets[0])}`,
  move: (a) => `move ${describeTarget(a.targets[0])}`,
  swap: (a) => `swap ${describeTarget(a.targets[0])} and ${describeTarget(a.targets[1])}`,
  add: (a) => (a.depicts ? `add the ${noArticle(a.depicts)} you drew` : 'add what you drew'),
  design: (a) => (a.depicts ? `add the ${noArticle(a.depicts)} you drew` : 'add what you drew'),
  serve: (a) => `load ${describeTarget(a.targets[0])} from the server`,
  save: (a) => `make ${describeTarget(a.targets[0])} keep what people type`,
}

/** What went wrong with one check, by its kind only (the reason is not shown). */
const CHECK: Record<string, string> = {
  colour: 'in the colour you drew',
  composition: 'looking like your drawing',
  // behaviour probes (probe.ts): the page was used, not just looked at
  behaviour: '— I tried it in the page and it didn\'t work',
}

/**
 * Remove anything that only a developer can read: element ids, source paths
 * and line numbers, `action 3`, code fences, stack frames. What is left is
 * still meaningful because the reading is mostly words about the page.
 */
export function scrub(s: string): string {
  return s
    .replace(/\s+at\s+\S+\s+\([^)]*\)/g, '') // stack frames
    .replace(/`[^`]*`/g, '')
    .replace(/\b[\w./-]+\.(tsx|jsx|ts|js|css|json|html)(:\d+)*(:\d+)?\b/gi, 'the page')
    .replace(/\bdata-s2c\b/gi, '')
    .replace(/\b(element|stroke|id)\s*"?[a-z]{1,2}\d+"?/gi, '')
    .replace(/\(\s*[a-z]{1,2}\d+(\s*,\s*[a-z]{1,2}\d+)*\s*\)/gi, '')
    .replace(/\b(action|step)\s+#?\d+\b/gi, 'part')
    .replace(/<\/?[a-z][a-z0-9]*>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim()
}

/** True when a sentence carries none of the developer-only tokens scrub removes. */
export function isPlain(s: string): boolean {
  return !(
    /\.(tsx|jsx|ts|js|css)\b/i.test(s) ||
    /:\d+:\d+/.test(s) ||
    /\baction\s+\d/i.test(s) ||
    /\b(e|s|el)\d+\b/.test(s) ||
    /\b(srcLoc|domId|data-s2c|codemod|svgPath|undefined|null|NaN|Error:|TypeError|stack)\b/.test(s) ||
    /\s+at\s+\S+\s+\(/.test(s) ||
    /[{}[\]<>`]/.test(s) ||
    /git\s+(restore|stash|checkout)/i.test(s)
  )
}

const list = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

const sentenceCase = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

/** Past tense of a phrase, for the success sentence. */
const past = (p: string): string =>
  p.replace(/^remove /, 'removed ').replace(/^change /, 'changed ').replace(/^move /, 'moved ')
    .replace(/^swap /, 'swapped ').replace(/^add /, 'added ').replace(/^load /, 'now loading ')
    .replace(/^make /, 'made ')

/**
 * The user's own words for an action, cut short and scrubbed: what they typed
 * next to the mark. These are the words they will look for in the sentence.
 */
export function userWords(notes: string[] | undefined): string {
  const raw = scrub((notes ?? []).join(', ').replace(/\s+/g, ' ').trim()).replace(/[.!\s]+$/, '')
  if (!raw) return ''
  const words = raw.split(' ')
  return words.length > 6 ? `${words.slice(0, 5).join(' ')}…` : raw
}

/** Verbs that start an instruction, not a description of how it should look. */
const VERB = /^(add|remove|delete|move|put|change|swap|replace|show|hide|say|use|link|insert|drop|let|have|give|open|go|send|save|load|rename|write|call|center|centre|align)\b/i

/**
 * "red" -> "made the heading with "Get started" red"; "make it bigger" -> "made
 * … bigger". Anything that isn't a short look-word is quoted instead of bent
 * into grammar it doesn't fit.
 */
function modifyDone(target: string, words: string): string {
  const look = words.replace(/^(please\s+)?(make|turn|set)\s+(it|this|that|them|these|those)\s+/i, '')
  if (look.split(' ').length <= 3 && !VERB.test(look) && !/["“”]/.test(look)) return `made ${target} ${look}`
  return `changed ${target}: "${words}"`
}

/** A colour drawn with the pen, by name, when nothing was typed. */
const HUES: Array<[number, string]> = [
  [15, 'red'], [40, 'orange'], [65, 'yellow'], [160, 'green'], [190, 'teal'], [255, 'blue'], [290, 'purple'], [340, 'pink'], [360, 'red'],
]
export function colourName(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return ''
  const n = parseInt(m[1]!, 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
  if (sat < 0.2) return l < 0.2 ? 'black' : l > 0.85 ? 'white' : 'grey'
  let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
  h = (h * 60 + 360) % 360
  return HUES.find(([top]) => h < top)?.[1] ?? 'red'
}

/**
 * What a finished action did, for the success sentence, naming what the user
 * asked for: their typed words, or the pen colour they drew in. A non-coder
 * reads "Done: changed the heading" and can't tell whether it understood
 * "red"; "Done: made the heading … red" tells them.
 */
function donePhrase(a: GroundedAction, words: string): string | undefined {
  const base = PHRASE[a.kind]?.(a)
  if (!base) return undefined
  const target = describeTarget(a.targets[0])
  if (a.kind === 'modify') {
    if (words) return modifyDone(target, words)
    const hue = colourName(a.color?.drawn)
    // the default pen has no colour at all; any colour here was picked on purpose
    if (hue) return `made ${target} ${hue}`
    return past(base)
  }
  if ((a.kind === 'add' || a.kind === 'design') && words) {
    if (a.depicts && scrub(a.depicts).toLowerCase().includes(words.toLowerCase())) return past(base)
    return a.depicts ? `added the ${noArticle(a.depicts)} you drew ("${words}")` : `added "${words}" where you drew it`
  }
  return past(base)
}


/** "the" + a model's "a wavy ribbon" read as "the a wavy ribbon" (s2c-034). */
function noArticle(d: string): string {
  return scrub(d).replace(/^(?:a|an|the)\s+/i, '')
}

/** Parse `action N (kind): …` into the action index and the check kind. */
function failedIndex(f: string): { index: number; check: string } | null {
  const m = /^action (\d+) \(([^)]*)\)/.exec(f)
  if (!m) return null
  const check = m[2]!.startsWith('composition') ? 'composition' : m[2]!.toLowerCase()
  return { index: Number(m[1]), check }
}

/**
 * Why a behaviour wasn't tried, in words for the card. The verdict's reason
 * (probe.ts / probe-exec.ts / the plugin) names what happened; this keeps the
 * true cause and drops what only a developer reads. "It wasn't safe to" is
 * said only when that is what happened: telling someone a test was unsafe
 * when the page simply couldn't find the form sends them looking for a
 * danger that isn't there.
 */
export function whyUntested(reason: string): string {
  const r = reason.replace(/^couldn't test it:\s*/i, '').replace(/\s*\(and the test data[^)]*\)\s*$/, '')
  if (/not this dev server|navigates away/i.test(r)) return "it wasn't safe to: it would reach outside your app"
  if (/changes by itself/i.test(r)) return 'the part you pointed at changes by itself, so I couldn\'t tell what the click did'
  if (/not on the page|not inside a form/i.test(r)) {
    const what = /^(the form|"[^"]{1,40}"|the \w+)/.exec(r)?.[1] ?? 'it'
    return `I couldn't find ${what} on the page after the change`
  }
  if (/did not answer|can't drive the page/i.test(r)) return "the page didn't answer when I tried"
  if (/threw/i.test(r)) return 'the page hit an error when I tried'
  return "I couldn't run the test"
}

/**
 * Why a backend engine said no, in words for the card (s2c-037), or null when
 * the reason is about the code's shape and only a developer can act on it
 * (the developer summary keeps it word for word). Before this the card said
 * only "I couldn't make the heading keep what people type", with no why, so
 * the one thing the user could do differently (point at a field of the form)
 * was never said.
 */
export function whyRefused(reason: string): string | null {
  const r = reason.replace(/^action \d+ \([^)]*\):\s*/, '')
  if (/is not inside a <form>|which is a component rather than a real <form>/i.test(r)) {
    return "it isn't inside a form, so there is nothing to send. Point at one of the form's boxes instead"
  }
  if (/has no fields in it/i.test(r)) return 'that form has nothing to type into yet. Add the boxes first'
  if (/that form is already real/i.test(r)) return 'that form already keeps what people type'
  if (/not rendered by a list|not a `?\.map\(\)/i.test(r)) {
    return "it isn't one of the rows of a list. Point at one of the rows instead"
  }
  if (/already comes from an endpoint/i.test(r)) return 'that list already comes from the server'
  return null
}

export function explainRun(input: ExplainInput): RunExplanation {
  const missed: string[] = []
  const seen = new Set<string>()
  let ruleBroken = false
  const failedActions = new Set<number>()
  const untested: string[] = []
  const untestedWhy: string[] = []

  const note = (phrase: string) => {
    if (!seen.has(phrase)) {
      seen.add(phrase)
      missed.push(phrase)
    }
  }
  // An action an engine refused changed nothing, so nothing of it can be
  // "tried out in the page". Its probe still ran (and found no form), and the
  // card said both "I couldn't …" and "I didn't try the change out, because I
  // couldn't find the form on the page after the change", next to "Nothing
  // was changed" (s2c-037).
  const refusedIdx = new Set(
    (input.refused ?? []).map((f) => failedIndex(f)?.index).filter((i): i is number => i != null),
  )
  for (const f of [...input.failures, ...(input.refused ?? [])]) {
    if (/^a rule you drew is broken/.test(f)) {
      ruleBroken = true
      continue
    }
    const p = failedIndex(f)
    if (!p) continue
    const a = input.actions[p.index]
    if (!a) continue
    if (p.check === 'behaviour, not tested') {
      if (refusedIdx.has(p.index)) continue
      // the change may well be right; what's missing is the proof, and a
      // non-coder has no other way to get it, so it is never "Done."
      const base = PHRASE[a.kind]?.(a)
      if (base && !untested.includes(base)) {
        untested.push(base)
        untestedWhy.push(whyUntested(f.replace(/^action \d+ \([^)]*\):\s*/, '')))
      }
      continue
    }
    failedActions.add(p.index)
    const base = PHRASE[a.kind]?.(a) ?? 'make one of the changes'
    const why = (input.refused ?? []).includes(f) ? whyRefused(f) : null
    note(why ? `${base}, because ${why}` : CHECK[p.check] ? `${base} ${CHECK[p.check]}` : base)
  }

  const dropped = input.droppedActions ?? 0
  const undoable = input.files.length > 0
  const reading = scrub(input.reading).replace(/[.!\s]+$/, '')
  const understood = reading ? `I read your sketch as: ${reading.charAt(0).toLowerCase()}${reading.slice(1)}.` : ''

  if (missed.length === 0 && dropped === 0 && !ruleBroken && untested.length === 0) {
    // a note nobody claimed belongs to the only action there is
    const spare = input.actions.length === 1 ? input.runNotes : undefined
    const did = input.actions
      .map((a) => donePhrase(a, userWords(a.notes?.length ? a.notes : spare)))
      .filter((p): p is string => !!p)
    const sentence = did.length ? `Done: ${list([...new Set(did)])}.` : 'Done.'
    return { problem: false, sentence: finalize(sentence), undoable }
  }

  const parts: string[] = []
  if (understood) parts.push(understood)
  if (missed.length) parts.push(`But I couldn't ${list(missed)}.`)
  if (dropped > 0) {
    parts.push(
      dropped === 1
        ? `${missed.length ? 'Also, one' : 'But one'} of your marks didn't match anything on the page, so I skipped it.`
        : `${missed.length ? 'Also, ' : 'But '}${dropped} of your marks didn't match anything on the page, so I skipped them.`,
    )
  }
  if (ruleBroken) parts.push('This change also breaks a rule you drew earlier.')
  if (untested.length) {
    const why = [...new Set(untestedWhy)]
    parts.push(
      untested.length === 1
        ? `I didn't try the change out in the page, because ${why[0]}, so check yourself that it works before you rely on it.`
        : `I didn't try ${untested.length} of the changes out in the page, because ${list(why)}, so check yourself that they work before you rely on them.`,
    )
  }
  parts.push(
    undoable
      ? 'Undo puts your files back the way they were.'
      : 'Nothing was changed.',
  )
  return { problem: true, sentence: finalize(parts.join(' ')), undoable }
}

/**
 * A run that never got as far as writing anything, or died part way.
 *
 * The thrown message is never shown: it can be a stack, a path, or an HTTP
 * status. What the user gets is which of three situations they are in.
 */
export function explainError(message: string, filesChanged: boolean): RunExplanation {
  let sentence: string
  if (/no valid actions/i.test(message)) {
    sentence = "I couldn't tell what to change from that sketch, so nothing was changed. " +
      'Try a clearer mark, or type a word or two about what you want.'
  } else if (/exceeded .*cap|timed out/i.test(message)) {
    sentence = 'That took too long and I stopped.'
  } else if (/^stopped by you$/i.test(message)) {
    sentence = 'Stopped, as you asked.'
  } else if (/already in progress/i.test(message)) {
    sentence = 'Another change is still being made. Wait for it to finish, then try again.'
  } else {
    sentence = 'Something went wrong while making that change.'
  }
  if (!/nothing was changed|still being made/i.test(sentence)) {
    sentence += filesChanged ? ' Undo puts your files back the way they were.' : ' Nothing was changed.'
  }
  return { problem: true, sentence: finalize(sentence), undoable: filesChanged }
}

/** Last line of defence: a sentence that still isn't plain loses the offending words. */
function finalize(s: string): string {
  const out = sentenceCase(s.replace(/\s{2,}/g, ' ').trim())
  return isPlain(out) ? out : sentenceCase(scrub(out).replace(/[{}[\]<>`]/g, ''))
}
