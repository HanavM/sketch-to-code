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

## Not done yet (next waterings)

1. **The probe.** `deriveProbes` has no `navigate` case, so a run that adds a
   screen is not tried in the page. Add a `navigate` probe: click the trigger,
   expect `location.hash === route` and the screen's heading visible, then
   `history.back()` and expect the trigger visible again.
2. **The zero-token e2e** on the demo app: a stubbed reading → engine → probe
   passes → receipt sentence → one undo removes all five files.
3. **The screen's contents.** The engine writes a heading and a back button.
   Anything sketched inside the box should go to codegen as an `add` into the
   new screen. This needs a second pass after the file exists.
4. `goBack()` counts in-app opens. A user who mixes the browser's back with
   the page's "← Back" can leave the counter one high, and the next "← Back"
   then steps back one entry too far. Harmless inside the app, but it isn't
   exact.
