/**
 * A hand-rolled arg parser. Deliberately ~80 lines instead of a dependency:
 * an onboarding tool that installs itself into someone else's project should
 * not drag a tree of its own in first.
 */

/** Flags that consume the next token as their value. */
const VALUE_FLAGS = ['dep', 'github', 'remote', 'repo-name', 'port', 'commit-message', 'timeout'] as const
/** Flags that are booleans; `--no-x` sets x to false. */
const BOOL_FLAGS = [
  'yes',
  'dry-run',
  'allow-dirty',
  'install',
  'git-init',
  'commit',
  'push',
  'gitignore',
  'probe',
  // sketch: `open` defaults to true, so --no-open is the useful spelling
  'open',
  'keep-open',
  'help',
  'version',
  'json',
] as const

export type ValueFlag = (typeof VALUE_FLAGS)[number]
export type BoolFlag = (typeof BOOL_FLAGS)[number]

export interface ParsedArgs {
  command: string
  /** Positional target directory, if the user gave one. */
  target: string | null
  bools: Partial<Record<BoolFlag, boolean>>
  values: Partial<Record<ValueFlag, string>>
  /** Unrecognized tokens — reported rather than ignored. */
  errors: string[]
}

const isValueFlag = (n: string): n is ValueFlag => (VALUE_FLAGS as readonly string[]).includes(n)
const isBoolFlag = (n: string): n is BoolFlag => (BOOL_FLAGS as readonly string[]).includes(n)

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { command: '', target: null, bools: {}, values: {}, errors: [] }
  const positionals: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!
    if (tok === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (tok === '-y') {
      out.bools.yes = true
      continue
    }
    if (tok === '-h') {
      out.bools.help = true
      continue
    }
    if (tok === '-v') {
      out.bools.version = true
      continue
    }
    if (!tok.startsWith('--')) {
      positionals.push(tok)
      continue
    }

    const body = tok.slice(2)
    const eq = body.indexOf('=')
    const name = eq === -1 ? body : body.slice(0, eq)
    const inline = eq === -1 ? null : body.slice(eq + 1)

    if (name.startsWith('no-') && isBoolFlag(name.slice(3))) {
      out.bools[name.slice(3) as BoolFlag] = false
      continue
    }
    if (isBoolFlag(name)) {
      out.bools[name] = inline === null ? true : inline !== 'false'
      continue
    }
    if (isValueFlag(name)) {
      const value = inline ?? argv[++i]
      if (value === undefined) out.errors.push(`--${name} needs a value`)
      else out.values[name] = value
      continue
    }
    out.errors.push(`unknown flag: ${tok}`)
  }

  out.command = positionals[0] ?? ''
  out.target = positionals[1] ?? null
  if (positionals.length > 2) out.errors.push(`unexpected extra argument: ${positionals[2]!}`)
  return out
}
