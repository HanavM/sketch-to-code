# SEED — sketch-to-code

> Owner's seed. Vision rewritten by the owner 2026-10-15; the technical
> direction and definition of done were drafted by Claude from the README and
> docs/findings.md. Edit freely. The gardener reads this from `main` every
> run and never edits it.

owner_boost: 1.0        # raise to make this garden win more runs than fashion

## The final goal

**Make coding more accessible.** This opens a new frontier where ideas get
*sketched*, not fully drawn, and are turned into real things written into
code. A rough sketch plus a few words should be enough: you mark the idea
on your running app, and it becomes working source code. The sketch is a
way to express intent, not a precise mock-up, and the tool's job is to
understand it.

What that means for the product:

- **The idea is the input, not the drawing.** Quick, loose marks: a box,
  an arrow, a scribble, a word. Users never need drawing skill or pixel
  precision. If a user has to draw carefully, that's a bug in the tool.
- **The output is real code in the real project**, not a mock-up or a
  throwaway prototype: edits land in the actual source files, verified
  against the running app, and can be undone in one step.
- **Accessible to people who don't write much code.** Someone with an idea
  and a running app should be able to shape it without knowing React or
  Tailwind. Every interaction should be judged by asking whether a
  non-coder could do it.
- **Fast enough to feel like thinking out loud.** Sketch → change visible
  should feel immediate, faster than typing a prompt.

## Technical direction

- Keep the deterministic spine: ink analysis → DOM grounding (data-s2c
  stamps) → typed intent → Claude Code edits → DOM verification. The model
  interprets intent and writes code. It never guesses geometry.
- **Interpret, don't trace.** Sketches are structure and intent; findings
  show that words beat drawn marks for content ("draw less, type more").
  Lean into loose sketches + short words, and make the system robust to
  messy, partial, hand-drawn input.
- Measure before changing: the sketch benchmark (`tests/bench`) is the
  ruler. Its primary metric should score whether the *intent* was realized
  (structure, content, order), not IoU. Add sketches that are deliberately
  rough and incomplete, because that is what real users will draw.
- Lower the barrier everywhere: onboarding (`init`, `doctor`), feedback
  when the system misreads a sketch, and recovery when it gets it wrong
  must all work for someone who doesn't read stack traces.

## Definition of done

1. **Rough sketches work.** On a benchmark of deliberately loose,
   quick sketches (not careful drawings), the intended change is realized on
   ≥ 80% of pages across 3 repeated runs.
2. **A non-coder can do it.** A written walkthrough shows someone with no
   React knowledge going from a running app to ≥ 3 meaningful changes (add a
   section, change styling, add a working form/behaviour) with sketches and
   a few words only, no code editing and no reading errors.
3. **Works on real projects:** `npx sketch-to-code init` → first successful
   edit in under 5 minutes, verified on ≥ 5 real open-source Vite + React apps.
4. **Trustworthy:** the known bugs in docs/findings.md (reading dies on
   reload, stale component library outliving `git clean`) are fixed with
   tests, and every misread sketch produces a plain-language explanation
   and a one-click undo.
5. A README + 60-second demo that shows a rough idea becoming real code,
   good enough for a public launch (the launch itself is mine to do).

## Out of scope / don't touch

- Non-Vite frameworks (Next.js etc.) until the above is done.
- Publishing to npm or making the repo public: ask me.
