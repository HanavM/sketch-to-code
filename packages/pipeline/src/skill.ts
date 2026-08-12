/**
 * The sketch-interpretation skill taught to the codegen agent.
 * Grounded in: NN/g wireframing conventions, Balsamiq text/shape guidelines,
 * the UISketch dataset's 21 conventionalized element classes (CHI 2021),
 * tldraw make-real + screenshot-to-code + Stanford Sketch2Code prompt patterns,
 * and Set-of-Mark / SeeAct / DesignBench evidence on hybrid image+structure
 * payloads. Mirrored to docs/sketch-interpretation.md.
 */
export const SKETCH_SKILL = `
## Skill: reading hand-drawn UI sketches

The user draws with a mouse on a transparent overlay over their RUNNING app.
Sketches are LOW-FIDELITY wireframes. Rectify, don't reproduce: wobbly boxes
become clean components with proper padding; scribbled text becomes readable
type. Never render the wobble.

### Channel authority (when inputs disagree)
1. **Source code** — absolute truth for existing structure, tokens, naming.
2. **Structured legend JSON** — truth for geometry (exact bboxes) and for what
   handwriting says (transcribed).
3. **Ink raster image** — truth for visual gestalt and layout intent only.
Never invent a shape id that isn't in the legend. If the image seems to show
something the legend lacks, trust the legend for WHAT/WHERE and the image for
what it LOOKS like.

### Two kinds of ink — never confuse them
1. **Command gestures** mark up EXISTING UI: scribble/strikethrough = delete,
   circle/box around something = select it for the attached instruction,
   arrow between existing elements = move/relate, caret = insert here.
2. **Design drawings** propose NEW UI to build.
The run mode says which is primary. Inside a design sketch, an arrow is
usually flow/annotation between sketched parts, NOT a move command.

### Wireframe symbol lexicon (established designer shorthand)
| Drawn | Means |
|---|---|
| rectangle | container / card / input — decide by size, position, contents |
| rectangle with an X through it | image placeholder |
| rectangle with a centered triangle | video player |
| small rect with X, or coarse line art | icon |
| circle (top of card/row, corner of navbar) | avatar or icon slot |
| small circle beside text (filled = selected) | radio button |
| small square beside text (check = selected) | checkbox |
| horizontal squiggle/wavy lines | body text, one drawn line ≈ one text line |
| single thicker/longer line, or large writing | heading (thicker = higher level) |
| rounded rect with a short label | button (label = the actual copy) |
| rect with a chevron (v) at the right edge | select / dropdown |
| empty long rect (taller = textarea) | text input |
| pill with a circle at one end | toggle switch (side = state) |
| line with a knob/dot on it | slider |
| rect partially filled | progress bar |
| three stacked short lines | hamburger menu |
| magnifier (esp. beside a long rect) | search |
| bell | notifications · gear = settings |
| row of stars (some filled) | rating |
| row of dots, one emphasized / "1 2 3 >" | pagination or carousel indicator |
| "A > B > C" text chain | breadcrumbs |
| folder-tab shapes along a top edge | tabs (connected/open tab = active) |
| ruled rows × columns, first row emphasized | data table (first row = header) |
| box w/ header + lines + buttons + corner ✕ | modal / dialog |
| full-width rect at top / tall rect at side | navbar / sidebar |
| circle with + (bottom corner) | floating action button |
| dotted-outline rectangle | placeholder / drop zone |
| repeated similar boxes | a LIST — one component × N via .map |

### Reading layout
- Alignment and proximity are intent: a row of shapes = flex row; a column =
  stack; consistent gaps = one gap-* value.
- Cardinality is intent: the user drew 3 cards → render exactly 3 items.
  Never emit "<!-- repeat for each item -->" placeholders. A "..." or "xN"
  note overrides the drawn count.
- Sizes/positions are approximate. Snap to the app's existing spacing scale,
  container widths, radii and breakpoints — never hard-code sketch pixels.
- Where the ink sits on the page decides which source container receives the
  code (the DOM CONTEXT names it).
- Small box drawn over a darkened/backdrop area = modal. Box beside the main
  area = sidebar. Arrows between sketched screens/regions = navigation flow.

### Text
- Handwritten labels are the actual copy — use them verbatim (fix obvious
  spelling slips). Infer unlabeled text from context; do not hallucinate
  specifics you can't infer (no fake numbers/emails).
- Squiggle placeholders become SHORT realistic copy for this app's domain,
  never lorem ipsum walls.

### Fidelity & scope
- Read the neighboring source FIRST; reuse the app's existing components,
  Tailwind idiom, colors and type scale. The sketch inherits the app's design
  system — do not invent a new visual language or default to generic styles.
- Preserve everything the sketch doesn't touch. Minimal diff: only what the
  ink indicates. Never add dependencies.
- If unsure how something should work, make the most conventional choice for
  this app and say so — a reasonable guess beats an incomplete render.
- Images: reuse the app's asset/placeholder pattern if one exists, else a
  neutral placeholder block.

### Worked examples
- Three stacked rectangles, each with a circle at the left + two thin lines,
  drawn beside an existing list → a 3-item list using the app's existing
  card/row idiom: avatar + title + subtitle per row.
- A wide rect at the top with three short labels and a small rect at the right
  → a navbar: three links + a primary button, matching the app's nav styling.
- A rect containing an X-box at top, one thick line, two squiggles, and a
  small labeled rect bottom-right → a card: image placeholder, heading, two
  lines of body copy, primary button labeled with the handwriting.

### Process
1. Study the sketch image and legend together; classify command vs design.
2. Read the surrounding source files the DOM CONTEXT points at.
3. Map symbols → this app's components via the lexicon; plan the minimal diff.
4. Implement. 5. Reply with: files changed, what you built, and every
   assumption you made.
`.trim()
