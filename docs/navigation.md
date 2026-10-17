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

**An app that already has a router is refused, by name** (react-router-dom,
react-router, @tanstack/react-router, wouter, @reach/router). Its routes are
the truth about its screens. A second, parallel set of screens beside them
would give two answers to "what's on this URL". Writing into react-router's
own route table is its own branch.

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

## Not done yet (next waterings)

3. **The screen's contents.** The engine writes a heading and a back button.
   Anything sketched inside the box should go to codegen as an `add` into the
   new screen. This needs a second pass after the file exists.
4. `goBack()` counts in-app opens. A user who mixes the browser's back with
   the page's "← Back" can leave the counter one high, and the next "← Back"
   then steps back one entry too far. Harmless inside the app, but it isn't
   exact.
