# init → first ✓ on six projects we didn't write

SEED done #3 asks for `npx sketch-to-code init` → first successful edit in
under 5 minutes on ≥ 5 real open-source Vite + React apps. This is the
zero-token version of that measurement, run on 2026-10-17 by
`packages/cli/tests/e2e/onboard-real-projects.mjs`.

## The headline

**5 of 5 project shapes go from `init` to "✓ Done" in 11–14 seconds.** One
real bug came out of it: on TanStack's starter, init and doctor told you to
open the wrong address. It's fixed.

| project | generator (pinned) | dev script | init | scaffold + install | init → first ✓ |
|---|---|---|---|---|---|
| vite-react-ts | create-vite 9.2.1 `react-ts` | `vite` | pass | 4 s | 11.7 s |
| vite-react-compiler-ts | create-vite 9.2.1 `react-compiler-ts` | `vite` | pass | 6 s | 11.8 s |
| tanstack-router | create-tsrouter-app 0.54.45 | `vite dev --port 3000` | pass | 16 s | 13.8 s |
| vite-ssr-react-ts | create-vite-extra 5.0.3 `ssr-react-ts` | `node server` | pass | 7 s | 11.2 s |
| npm-workspace | react-ts in `apps/web` of an npm workspace, git root at the top | `vite` | pass | 3 s | 10.8 s |
| react-router-framework (s2c-043) | create-react-router 8.4.0 default | `react-router dev` | pass | 12 s | 15.1 s (was 253.7 s, and no overlay) |

"init → first ✓" covers doctor (before), `init --yes`, doctor (after), booting
the dev server, opening the page, ringing the heading, typing "red" and
waiting for the Done sentence. The model is scripted, so it says nothing
about model time. A real reading and edit adds whatever the model takes; it
isn't measured here.

## What each shape tests

- **react-compiler-ts**: init inserts `sketch2code()` beside `react()` *and*
  `babel({ presets: [reactCompilerPreset()] })`. Stamping still works with
  the compiler on.
- **tanstack-router**: `const config = defineConfig(...)` then
  `export default config`; four other plugins (devtools, Tailwind v4,
  router codegen, `viteReact` under another name); file-based routes, so the
  `<h1>` lives in `src/routes/index.tsx` and HMR updates a `?tsr-split`
  module. All handled.
- **ssr-react-ts**: no `vite` in the dev script at all. `node server` runs
  express with vite in middleware mode. The plugin's middleware, the overlay
  injection (via `transformIndexHtml`) and the stamps on server-rendered
  HTML all work, with no page errors (console hydration warnings weren't checked).
- **npm-workspace**: the git root is two levels up and `node_modules` is
  hoisted. init uses the existing repo (no nested `git init`) and leaves it
  clean.

- **react-router-framework** (added 2026-10-17, s2c-043): what
  `npx create-react-router` makes now. No `index.html` and no `src/`:
  `app/root.tsx` renders `<html>` itself, the dev server server-renders every
  page (SSR on), Vite 8, Tailwind v4, and the plugin is `reactRouter()`, not
  `react()`. The home page has no `<h1>`, so the e2e marks the "What's next?"
  line instead. See "Two bugs React Router's own starter found" below.

## Two bugs React Router's own starter found (s2c-043)

Tried by hand first, then added as shape 6. Before the fix, every step a
person would see said yes, and the product did nothing:

| step | before | after |
|---|---|---|
| `doctor` (before init) | ✗ 4 errors, as it should | same |
| `init --yes` | ✓ exit 0, config edited, committed. **2 min** | ✓ in seconds |
| `doctor` (after) | ✓ "Healthy". **2 min** | ✓ 1.4 s |
| page loads, stamps | ✓ 23 elements stamped, server and client agree, no hydration errors | same |
| overlay on the page | **✗ never appears**; no error anywhere | ✓ |
| ring + "red" → ✓ Done | impossible (nothing to draw on) | ✓ "made the text "What's next?" red", red on the page |

1. **No overlay.** The overlay was only ever added by `transformIndexHtml`,
   and framework mode has no index.html, so that hook never runs. Now, when
   the `react-router` plugin is in the config, the plugin appends a few lines
   to the root route's *client* module (`app/root.tsx`, or the
   `appDirectory` a literal config names) that add the overlay's script tag
   after the window's `load` event. Not during hydration: React 18 throws
   away server HTML over an unexpected node in `<body>`. Not an `import`:
   vite would try to resolve the dev-only URL. Server render, other routes
   and `?route-chunk` splits are untouched (packages/vite-plugin/src/framework-entry.ts,
   9 unit tests). SPA mode (`ssr: false`) checked by hand: overlay up, 23
   stamps, no errors.
2. **init and doctor each hung for 2 minutes.** The config check runs vite's
   `resolveConfig` in a child process and waited for it to exit. React
   Router's plugin starts a watcher there, so the child never exited and
   both commands sat until the 120 s timeout, then reported success. The
   child now exits once it has printed its answer (probe-exit.test.ts: 30 s
   before, under 1 s after). This one isn't React Router–specific: any
   plugin that starts a timer or watcher at config time did the same.

## The bug it found (first five shapes)

`create-tsrouter-app`'s dev script is `vite dev --port 3000`. init and
doctor only read the port from the vite config, so both said "open
http://localhost:5173", where nothing answers. A non-coder would be stuck
there before drawing anything. Fix: `scriptPort()` (packages/cli/src/probe.ts)
reads `--port N` / `--port=N` from a dev script that runs vite, and it
takes precedence over the config, like vite's own CLI flag. The e2e was red
on that check before the fix and green after; probe-port.test.ts has 4 unit
tests.

## What this does not show

- **These are generator outputs, not people's apps.** This run is only
  allowed to read its own repo, so it could not clone someone's GitHub
  project. A published starter is a real, unmodified project nobody here
  wrote, but it's the *start* of an app: no auth, no data fetching, no
  component library, nothing weird in `index.html`. Real apps can break
  init in ways these can't (CSS-in-JS, `vite.config` built by a function
  from another file, a monorepo using pnpm or Turborepo). SEED done #3 says
  "real open-source apps". This is the closest this run can get, and it's
  weaker than that.
- **The SSR address is right by coincidence.** For `node server` init can't
  know the port. It prints 5173 because that's vite's default, and the
  template's `server.js` happens to default to 5173 too.
- **No model.** The scripted edit adds `style={{ color: 'red' }}` to the
  first `<h1>` (the "What's next?" `<p>` in framework mode). Whether a real model finds the right file in a router
  project is unmeasured.
- npm only; pnpm/yarn/bun installs not tried. Linux Chromium only.
- **Framework mode: only the marking works.** Drawing a link there
  (s2c-041's arrow-to-a-named-box) reads `createBrowserRouter`/`<Routes>`
  tables, not `app/routes.ts`; it should refuse by name, not checked. Loaders,
  actions and server-only modules are untouched by any edit tried here.
