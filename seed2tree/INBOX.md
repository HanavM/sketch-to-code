# INBOX — notes from the owner to the gardener

Write anything here on `main`: "focus on X this week", "prune s2c-006",
"answer to fash-004: …", "new idea: …". The gardener reads this every run,
acts on it, and marks each item `[handled <date>]` on its own branch.

## Open

- 2026-10-15: SEED.md was rewritten around the real goal: make coding more
  accessible, so that rough sketches + a few words become real code, usable by
  non-coders. Re-plan the tree against it: re-score existing branches and
  add branches for (a) a benchmark of deliberately rough/partial sketches,
  (b) a non-coder walkthrough (Definition of done #2), (c) plain-language
  explanations + undo when a sketch is misread. Prune anything that only
  serves precise drawing.
- 2026-10-15 (2): New rule in GARDENER.md section 0.5: validate before
  building, and be brutal. Add a `validate` node under s2c-000 now and do it
  next: what already exists that turns sketches/annotations on a running UI
  into code edits (e.g. tldraw make-real, v0, Cursor/Windsurf visual edit,
  Figma-to-code, Locofy, Builder.io, Onlook, Vercel's toolbar), and does the
  "accessible to non-coders" angle survive contact with them? Verdict
  PURSUE / PIVOT / KILL. Don't spare my feelings.
- 2026-10-15 (3): **OWNER OVERRULES the s2c-012 PIVOT. The seed is PURSUE.**
  Reason, in my words: Cursor Design Mode and Lovable Draw are not what this
  is. In both, the drawing only points and references; the instruction is
  typed or spoken. Lovable treats sketching as a feature/toolbar mode. My
  thesis is that drawing-as-the-instruction is the fundamental interface of
  the future: an entire product, a drawing-first harness, a drawing-first
  Cursor. See the new "bigger ambition" section in SEED.md.
  What to do:
  1. Record this overrule and reason in s2c-012 / s2c-000. Mark the kill test
     (s2c-013) as a *measurement*, not a kill gate: it tells us where the
     structured pipeline beats screenshots, so it still needs my quota
     answer. Keep it blocked, but don't let it stop other work.
  2. Re-plan the tree toward the drawing-first harness. Un-prune what serves
     it (non-coder walkthrough s2c-010, plain-language misread + undo s2c-011,
     one-key note s2c-006). Add branches for things like: (a) a written spec
     of the full visual language, where every common edit is a gesture with
     no words needed, measured against the rough bench; (b) the gesture
     grammar measured for the first time (the bench's 6 edit pages); (c) what
     the harness needs beyond markup: multi-step builds, history/branches,
     behaviour/state, a no-editor workflow; (d) a sharp written comparison:
     "what you can do by drawing alone here vs Cursor Design Mode vs Lovable
     Draw", with concrete tasks, to keep the differentiation honest.
  3. Stay blunt about *how* to get there and kill bad branches. Just don't
     re-litigate whether the seed exists unless you find something new, e.g.
     a product where drawing itself is the instruction.
  4. Don't sit idle: if the top node is blocked, pick or add the next most
     valuable cloud-doable branch toward the ambition.
- 2026-10-15 (4): Precise framing: **sketch first, text prompts as support.**
  Not "drawing only". Text is always available to clarify or extend a
  sketch, but the sketch leads. Design and measure for that (e.g. score how
  much of the intent the sketch alone carries, and how little text is needed).
- 2026-10-17 23:30 (dashboard): do 1, 2, 4. for 3, yes replan the tree towards drawing first harness.
