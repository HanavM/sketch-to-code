# Draw a link: a second screen from an arrow (s2c-039)

The gesture: an arrow from a button (or link) to a box with a name written in
it, usually drawn off to the side like a second page. The meaning: *clicking
this opens a new screen called that*. No other words needed.

It's the first thing a non-coder builds past one page, and until now the
pipeline knew nothing about routes. `docs/harness.md` held it back until
behaviour was verifiable. Behaviour probes (s2c-021) make that possible now.

## Decisions

**A named verb with an engine, not a prompt.** The reader emits
`kind: "navigate"`, one target (the button) and `screen: "<name as written>"`.
`pipeline/src/navigate.ts` (`linkToScreen`) writes the rest the same way every
time, before the codegen model sees anything. This is the same reasoning as
`save`/`serve`: the work is mechanical, and a model would invent a different
router shape on every run.

**Hash routes (`#/pricing`), not history routes.** A history route only works
if every host the app is ever put on answers `/pricing` with `index.html`.
Someone who doesn't know what a server fallback is will deploy it, reload on
`/pricing`, and get a 404. A hash route needs nothing from any host. Browser
back is a `hashchange`, so it works with no extra code. The `#/` prefix keeps
screens apart from in-page anchors (`#features` still scrolls and shows home).
Cost: URLs look like `/#/pricing`. That's acceptable for prototypes and can
be revisited when a real router is added.

**No router dependency.** `src/lib/screens.tsx` (~40 lines, marked generated)
provides `openScreen(name)`, `goBack()` and `<Screens home screens>`. Adding
`react-router-dom` would mean an install step that can fail, inside a gesture
that should be instant.

**Mounted where the app starts, App untouched.** `main.tsx`'s `<App />`
becomes `<Screens home={<App />} screens={screens} />`. The registry
`src/screens/index.ts` maps names to components and is rewritten whole each
time (it's ours). App's own code is never edited, so the home screen is
exactly the page the user was drawing on.

**An app that already has a router never gets hash screens.** Its routes are
the truth about its screens. A second, parallel set of screens beside them
would give two answers to "what's on this URL". A react-router app gets a page
in its own route table instead (below, s2c-041). @tanstack/react-router,
wouter and @reach/router are still refused by name.

**Refusals change nothing and say why in plain words:** no name in the box;
the start isn't a button or link; the button already has an `onClick`; the
link already goes to a real address; a screen file or lib file exists that we
didn't write; no `./App` mounted in `main`. All writes are planned before any
are made.

**An arrow to a screen that already exists only adds the link.** Two buttons
can open the same screen.

**Undo is free.** Every file is in the working tree, and the run's
capture/revert restores all of them in one step, created files included.

## Verified (2026-10-17)

- 18 unit tests (`pipeline/tests/navigate.test.ts`): writes, second screen,
  reuse, `<a href="#">`, stacked attributes, every refusal leaves the tree
  byte-identical, grounding carries `screen`, the refusal reaches the card.
- By hand in Chromium on a copy of the demo app (Vite 7, React 19, Tailwind 4):
  click → `#/get-started` and the new heading shows, home hidden. "← Back"
  returns home. Browser back returns home. Opening `/#/get-started` directly
  and pressing "← Back" stays in the app. `#features` still shows home. No
  page errors. Generated files pass `tsc --strict --noUncheckedIndexedAccess`.

## The probe (2026-10-17, watering 2)

A run that adds a screen now tries it in the page, like a save or a toggle.
`deriveProbes` turns a `navigate` action into a `navigate` probe carrying the
route and the heading `linkToScreen` writes (`screenSlug`/`screenTitle`, the
same functions, so they can't drift). In the browser (`probe-exec.ts`):

1. click the trigger the way a person would (a `#…` link is allowed to
   change the address; any other link is still stopped);
2. wait up to 2.5 s for all three things a person would see: the address is
   the route, the page they clicked on is gone, a heading with the screen's
   name is visible inside `#root`;
3. go back the way they would: the screen's own "← Back" if there is one
   (that is what exercises `goBack()`), else the browser's back;
4. wait for the old address and the trigger to be visible again;
5. whatever happened, leave the page at the address it had.

Verdicts, in plain words: *didn't open the "X" screen: the page stayed where
it was* (a dead button); *changed the address, but the "X" screen didn't
show* (a route nothing renders, the easy way to fake it); *going back didn't
return to the page you started on*; else *opened the "X" screen, and ← Back
came home again*. A page that never answers is `unverified`, never passed.

**e2e `tests/e2e/live-navigate.mjs`** (zero-token, port 5199, ~25 s): a
stubbed reading of `navigate` on the navbar's "Reports" link → the engine
writes the screen, registry, lib, mount and `href="#/reports"` → the run's own
probe **passed** → receipt "✓ Done: made the link with "Reports" open a
"Reports" screen." → by hand: click → Reports, ← Back → home → **one Ctrl+Z
removes all three files and puts `main.tsx` and `Navbar.tsx` back byte for
byte** → then two negatives straight through `/@s2c/probe`: an `href="#/reports"`
with no `<Screens>` mounted fails, and the dead "Sign out" button fails.
Green 5/5 back to back (phase 6 added for the last 2).

It found one bug outside this feature: **undo left the folders an edit
created** (`src/screens/`, and `server/api/` after a serve). `revertWork` now
removes a folder that is empty after the edit's files are gone, up to and not
including the app root. Git tracks no folders, so an empty folder the user
had *before* the edit and that one of its files went into would go too;
that is the accepted cost.

Not checked: a real model reading the arrow (the reading is stubbed: SEED
done #1 still has no real readings, s2c-013); Firefox/Safari; an app with its
own `#root`-less mount.

## The screen's contents (2026-10-17, s2c-040)

People don't draw an empty box. They sketch what the screen should have on
it. Before this, that sketch went to codegen as an ordinary `add` placed on
the page it was drawn on, so a form drawn inside the "Reports" box landed on
the **home** page beside the link: the opposite of what the drawing says.

Now (`pipeline/src/screen-contents.ts`), after the navigate engine has
written the screen file, run2 retargets every add whose ink lies inside the
screen's box:

- **Which strokes are the box:** of the strokes the navigate cites (grounding
  now keeps them as `strokeIds`), the largest box they draw: one stroke that
  closes on itself, or (s2c-042) up to four strokes that together outline a
  rectangle. "Outline a rectangle" = ≥ 85% of their ink is within a tolerance
  (a tenth of the short side, 6–24 px) of their joint bounding box's outline,
  ≥ 85% of that outline is inked, and every side is at least 60% inked. So
  two Ls, four separate sides, and a one-stroke box that overshoots its start
  all count; an arrow (L-shaped or not) plus the name doesn't, and neither
  does a bracket open on one side with the name written just under the gap.
  No box → nothing is retargeted, which is the old behaviour rather than a
  new guess.
- **Inside** = at least 80% of the add's ink area is in the box. A sketch
  that pokes over the edge counts; one drawn beside the box doesn't. The box
  cited twice (as the add's own strokes) is never "inside itself".
- **The retarget:** destination = the screen's `<main>` stamp, position
  `into`, `onScreen = {name, route, file, navIndex}`, and the instruction is
  prefixed `ON THE "Reports" SCREEN, not the page it was drawn on: build this
  inside the <main> of src/screens/Reports.tsx, below its heading and the ←
  Back button`. The reader prompt now asks for the inner sketch as its own
  `add` citing only the inner strokes.
- **Verification:** the page the user drew on can't show the result, so the
  placement check is skipped for these. The navigate probe, while the screen
  is open, counts what it shows besides the heading and Back
  (`screenContent`), and the add passes only if that is more than nothing.
  Colour isn't measured for them (it would be measured on the wrong page).
- **Receipt:** "✓ Done: made the link with "Reports" open a "Reports" screen
  and put what you drew in its box on the "Reports" screen." A typed word
  that is just the screen's name isn't echoed back as the content. On a miss:
  "I couldn't put what you drew in its box on the "Reports" screen."

**Found on the way: a snapshot request lost to a reload.** A navigate edits
`main.tsx`, which full-reloads the page. A fast codegen write followed by the
verify snapshot could reach the old page a moment before it died; nobody
answered, and the run failed 15 s later as "That took too long". The SSE
greeting for a reconnecting run tab now re-asks any snapshot the run is still
waiting for (an answered one is gone from the map, and a late second answer
is dropped). Red 2/2 without it in the e2e below, green after. Real codegen
takes seconds, so this mostly bit fast runs, but it's the same class as
s2c-037.

**e2e `tests/e2e/live-navigate-contents.mjs`** (zero tokens, the demo app's
own vite in-process so codegen is scripted too, ~60 s): real ink (arrow from
"Reports", a box, a field and a button inside it) → the brief points the add
at `src/screens/Reports.tsx` → the form is there and App.tsx is untouched →
the probe passes and the add's verdict is satisfied by what it saw on the
screen → tick receipt naming both → by hand → one undo restores all → **not
hollow:** a codegen that ignores the brief and builds on the home page fails
the add ("the "Reports" screen opened, but nothing you drew in its box is on
it") and the run doesn't end on a tick. 5/5 green back to back.

Not checked: a real model reading the inner sketch as its own `add` (the
reading is scripted; s2c-013).

**Multi-stroke boxes (s2c-042).** Phase 8 of the same e2e draws the box as
two Ls from the top-left corner (wobbly, corners not meeting). Red on the old
`screenBox` (no retarget, form built on the home page, ⚠ receipt), 3/3 green
after. Not end-to-start Ls: the pen bridges a stroke that starts where the
last one ended into a single stroke (the trackpad-hop rule), so those were
never two strokes. Not handled: a box whose sides are cited across two
different actions, and a rounded box drawn in pieces (pieces of an oval
don't lie on their bounding box).

## Apps that already use react-router (s2c-041, 2026-10-17)

`linkToScreen` hands a react-router-dom / react-router app to
`pipeline/src/navigate-router.ts` (`linkToRouterScreen`), after the same
trigger checks (a button or link, no `onClick`, no real `href`). Same rules:
every write planned first, every changed file re-parsed before anything is
written, a plain-words refusal with nothing changed otherwise.

- **Which table:** exactly one route list in `src/`:
  `createBrowserRouter/createHashRouter/createMemoryRouter([...])` or
  `useRoutes([...])` (inline, a `const` in the same file, or a name imported
  from another file such as `routes.tsx`), a JSX `<Routes>` with `<Route>`
  children, or `createRoutesFromElements(<Route>…)`. **Two lists are refused**
  ("I won't guess which one a new page belongs in"), and so is a list built
  in code (`createBrowserRouter(makeRoutes())`).
- **Where in it:** the shallowest list holding the home page (an index route
  or a `/` page). In a layout app that is the layout's `children`, so the new
  page keeps the nav bar and footer every other page has. It goes before a
  `*` catch-all if there is one, else after the last route, at their indent.
- **Path:** `/pricing` at the top level, `pricing` inside a layout's children.
  A page whose path is already there only gets the link.
- **The page file:** `src/pages/Pricing.tsx` when the app has `src/pages/`,
  else `src/screens/`. "← Back" uses react-router's own history index:
  `navigate(-1)` when the user came from inside the app, `navigate('/')` when
  they opened the page directly. That is exact, unlike the hash version's
  counter (item 4 below).
- **The trigger:** `<a href="#">` becomes `<Link to="/docs">` (closing tag
  too). A button gets `onClick={() => navigate('/pricing')}` and its component
  gets `const navigate = useNavigate()` at the top; an arrow-bodied component
  `() => (…)` gets a block body for it; an existing `useNavigate()` in the
  component is reused. Imports merge into an existing `react-router(-dom)`
  import. **A button in the component that renders the router itself**
  (`<BrowserRouter>` in App) is refused: the hook can't run there.
- **The probe:** the run's navigate probe now takes the engine's route
  (`deriveProbes(actions, navRoutes)`), compares `location.pathname` for a
  `/…` route (the hash for `#/…`), and steps back with `history.back()`. A nav
  bar button stays visible when its page opens (it's in the layout), so for a
  path route "the page you clicked on is gone" may instead be "the heading
  wasn't on the page before the click and is now" (`layoutKept`). A probe that
  lands on a different address now says where it went instead of "the page
  stayed where it was".

**Verified:** 11 unit tests (`navigate-router.test.ts`: the three shapes,
reuse, route + trigger in one file, hash router, four refusals byte-identical,
other routers refused); 2 probe tests. **`tests/e2e/navigate-router-real.mjs`**
(zero tokens, needs `npm i` once): the three shapes as real Vite 7 + React 19 +
react-router 7 apps → engine → `tsc --strict --noUncheckedIndexedAccess` →
`vite build` → Chromium: click opens the page (address, heading, home gone,
layout kept), ← Back home, direct entry + ← Back home, **the run's own probe
passes**, a probe for a page it doesn't open fails, no page errors. 3/3 shapes
green. It caught one real bug before it shipped: the probe failed every
nav-bar trigger in a layout app (the trigger never disappears), fixed by
`layoutKept`.

Not checked: a full overlay run (stubbed reading → engine → probe → receipt →
undo) on a react-router app; that's the rest of s2c-041. An app served under a
base path or `basename` (the probe compares the whole pathname). React Router
v7 **framework mode**, which is what `npx create-react-router` scaffolds
(`app/routes.ts` with `route()`/`index()`, SSR, no `src/main.tsx`): not read
at all, and probably not supported by `init` either (s2c-043).

## Not done yet

4. `goBack()` counts in-app opens. A user who mixes the browser's back with
   the page's "← Back" can leave the counter one high, and the next "← Back"
   then steps back one entry too far. Harmless inside the app, but it isn't
   exact.
5. ~~A box drawn in two or more strokes isn't recognised~~ — done (s2c-042).
   A rounded box drawn in pieces still isn't.
