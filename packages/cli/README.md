# sketch-to-code (CLI)

The way into sketch-to-code from a project that isn't this repo's demo app.

```bash
npx sketch-to-code init [path]      # set it up
npx sketch-to-code doctor [path]    # diagnose an existing install
```

`path` defaults to the current directory. Zero dependencies — node builtins,
`git`, `npm` and (optionally) `gh`.

## `init`

What it does, in order, stopping honestly at the first thing it cannot finish:

1. **Detects the project.** Vite + React/JSX only. Next.js, CRA, Remix, Gatsby,
   Nuxt, Vue, Svelte, Angular, Solid and Astro are named and refused *before
   anything is written*, as is a directory with no `package.json`, or a Vite app
   with no React (and vice versa). The plugin's stamp pass gates on `.jsx/.tsx`
   under Vite dev, so a half-install into Next.js would produce a config that
   loads and an overlay that stamps nothing.
2. **Checks the plugin's safety gates up front** rather than letting your first
   sketch discover them: a git repo must exist (offers `git init` + an initial
   commit — without a commit there is no checkpoint to revert to), the repo
   toplevel must not be your home directory, and the tree must be clean.
3. **Adds `.sketch2code/` to `.gitignore`**, because run bundles otherwise keep
   the tree permanently dirty and trip the dirty gate on every run.
4. **Adds the dependency** and runs `npm install`.
5. **Wires `sketch2code()` into the vite config** — `.ts`/`.js`/`.mts`/`.mjs`, an
   existing `plugins` array (multiline, single-line or empty), a config object
   with no `plugins` key at all, or no config file at all (it writes one). A
   CommonJS config or a function config is refused with the exact snippet to
   paste, never rewritten by guesswork. Every edit is shown as a unified diff and
   confirmed before it is written.
6. **Verifies it will actually load** by resolving the config through Vite's own
   `resolveConfig` and asserting `sketch2code` appears in the resolved plugin
   list. This is also where the dev-server port comes from.
7. **Checks Claude Code is reachable** — the agent SDK resolves along the chain
   the plugin will actually use, and `claude --version` runs. No model call, no
   tokens.
8. **GitHub, only if you ask.** A local repo is a complete install.
9. **Leaves the tree in a state the plugin accepts**: offers to commit its own
   setup, so your first run checkpoints against a clean tree.

Every write is idempotent — a second `init` adds no second plugin entry, no
second dependency, no second `.gitignore` line.

### Options

| flag | effect |
|---|---|
| `-y`, `--yes` | accept every *local* write without asking. Never approves a push. |
| `--dry-run` | print the plan and the config diff; write nothing |
| `--allow-dirty` | write `sketch2code({ allowDirty: true })` — runs allowed with uncommitted changes |
| `--no-install` | skip `npm install` |
| `--git-init` | pre-approve `git init` + the initial commit |
| `--commit` | pre-approve committing the setup changes |
| `--no-gitignore` | don't add `.sketch2code/` to `.gitignore` |
| `--port <n>` | pin `server.port` when init authors the config itself |
| `--dep <spec>` | dependency spec for `@s2c/vite-plugin` (default: auto, see below) |
| `--github create` | create a repo with `gh` (asks first, and only pushes with `--push`) |
| `--github connect --remote <url>` | add an existing remote as `origin` |
| `--repo-name <name>` | name for `--github create` |
| `--push` | allow `gh repo create` to push |
| `--json` | machine-readable result |

### Which dependency spec gets written

These packages are not published to npm yet, so `init` picks the honest answer:

- project **inside this workspace** → `"*"` (npm links the workspace package)
- project **elsewhere, CLI run from a checkout** → `"file:<checkout>/packages/vite-plugin"`.
  npm symlinks it, and Node resolves through the real path, so the plugin finds
  its own `@s2c/*` deps inside the checkout. Build the checkout first
  (`npm run build`).
- neither → the published range.

`--dep <spec>` overrides all of it.

## `doctor`

```
sketch-to-code doctor — /path/to/app

✓ project      Vite + React (my-app), 42 JSX/TSX file(s)
✓ dependency   @s2c/vite-plugin in package.json
✓ resolve      @s2c/vite-plugin resolves to …/dist/index.js
✓ pipeline     @s2c/pipeline resolves — codegen, codemods and checkpoints available
✓ config       vite.config.ts calls sketch2code()
✓ load         vite resolves plugins: …, sketch2code, vite:react-babel, …
✓ git          /path/to/app on main, clean
✓ claude-code  Claude Code 2.1.272 at /Users/me/.local/bin/claude; agent SDK resolved
✓ github       gh version 2.93.0, authenticated; no remote (optional)

Healthy. Next:
  → npm run dev — then open http://localhost:5173
  → Alt+D toggles draw mode; ▶ Run sends the sketch
  → run history: http://localhost:5173/@s2c/runs (and .sketch2code/runs/<id>/ on disk)
```

Exit code 1 if anything is an error. `--no-probe` skips the Vite config load
(faster, and the port then can't be reported); `--json` emits the whole report.

A `pipeline` warning means the overlay will load in **capture-only** mode: you
can draw, but nothing will edit your source.

## Tests

```bash
npx vitest run packages/cli                            # 88 unit/integration tests over temp dirs
node packages/cli/tests/e2e/init-real-project.mjs      # real project, real dev server, playwright
```

The e2e scaffolds a Vite + React app in a temp dir (not a git repo), runs
`doctor` → `init` → `init` again → `doctor`, boots that project's own dev server
on :5223 and asserts with playwright that the overlay host mounts, JSX is
stamped with `file:line:col`, `Alt+D` produces a live drawing surface,
`/@s2c/ping` reports the pipeline attached and `/@s2c/runs` answers. Then it
kills the server and deletes the temp dir (`--keep` to inspect it).
