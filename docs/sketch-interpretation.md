# Sketch interpretation skill

> Generated mirror of packages/pipeline/src/skill.ts.

## Skill: reading hand-drawn UI sketches

The user draws with a mouse on a transparent overlay over their RUNNING app.
Sketches are LOW-FIDELITY wireframes. Rectify, don't reproduce: wobbly boxes
become clean components with proper padding; scribbled text becomes readable
type. Never render the wobble.

### Channel authority (when inputs disagree)
1. **Source code** — absolute truth for existing structure, tokens, naming.
2. **Structured legend JSON** — truth for geometry: exact bboxes, exact SVG
   paths for organic/unknown shapes, and what handwriting says (transcribed).
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

### Depictions (the user sketched a THING — a crab, a purse, a star)
Actions with `depicts` set and `fidelity: "recognized"`: the sketch is a
REFERENCE — both to a concept AND to a specific composition. The svgPaths
and the attached sketch crop show the user's pose, proportions and part
layout: PRESERVE those (a crab drawn with big front claws and a low wide
body should yield an icon with big front claws and a low wide body). Redraw
with clean, smooth, symmetric-where-appropriate curves — never copy the
wobbly paths verbatim, never ignore their composition either.
Rendering options, best-first:
1. the project's own icon set/component if one exists (search first)
2. draw a clean inline SVG icon yourself, matching the sketch's composition
   (preferred when the sketch has distinctive character)
3. lucide-react if it's in package.json and an icon matches well
4. an inline emoji sized to the region (🦀) — last resort, loses the
   user's composition entirely
Size/position from the region; state which rung you used.

When a FIDELITY block accompanies the run it is the USER'S OWN setting and it
OVERRIDES the defaults in this section — including the "never trace" rule
above. At TRACE the drawn line is the deliverable: emit the supplied svgPath
geometry with its irregularity intact, and smoothing it into primitives is a
verification failure. At REINTERPRET the outline is only a hint, so prefer a
proper icon and do not labour over the drawn arrangement. The block also says
which aspects are scored; the ones it lists as free to normalize will not be
checked, so spend your effort on the ones that are.

The FIDELITY block also carries a RESULT level, and it decides whether you
are producing a drawing or the thing itself:
- LINE ART — strokes, no fills. The drawing, as a drawing.
- SOLID — closed forms carry fills from the app's palette; reach for a stroke
  only where a line is genuinely the subject. This is the default: a sketch is
  shorthand for a thing, not a request for its outline.
- FINISHED ILLUSTRATION — the sketch is a brief, not the artwork. Produce what
  it DEPICTS: filled forms, tonal separation, and the interior detail the
  subject implies but the ink only gestures at. A sketched side profile comes
  back as a face — brow, eye, nose, lips, jaw — not a line drawing of one.
  Read the subject from the reading, the handwriting and what surrounds it;
  keep the drawn silhouette and proportions, and invent the interior. An
  output whose shapes carry no fill fails verification here, as does one that
  merely reproduces the sketch's part count instead of elaborating on it.

When a MEASURED COMPOSITION block accompanies the action, those numbers are
the spec — they were computed from the strokes, and your result is scored
against them afterwards by the same measurement:
- **asymmetry** near 0 means the user drew it symmetric, so symmetry is safe.
  Anything above ~0.15 means they did NOT: reproducing that side-to-side
  difference is the job. Never draw one half and mirror it with
  `scale(-1,1)` unless the measured asymmetry is near 0 — that trick scores
  exactly 0 and reads as clip art.
- **spacing variation** above ~0.15 means repeated parts (legs, rays, ticks)
  were drawn on an UNEVEN pitch. Give them the drawn spacing and differing
  lengths; do not `.map()` one template onto a uniform pitch.
- **quadrant mass** tells you where the weight actually sits — match it.

### Normalization — ink is shorthand, not artwork
When rendering ANY drawn form (depiction or decoration), do not vectorize
the strokes. Extract the salient features and REBUILD from them:
- Scribble/zigzag hatching inside or between boundary strokes = a FILLED
  region: render solid (or shaded) fill bounded by the clean boundary —
  NEVER redraw the hatching strokes themselves.
- Several rough, roughly-parallel or overdrawn strokes = ONE clean stroke.
- Almost-straight → straight; almost-closed → closed; almost-aligned → aligned.
- "Almost-symmetric → symmetric" and "almost-equal → equal" apply ONLY to
  deviations small enough to be hand tremor. A difference the user drew on
  purpose — one claw bigger, one side longer, an uneven row — is the subject,
  not noise, and flattening it produces clip art. When a MEASURED COMPOSITION
  block is present it settles which is which; without one, preserve any
  difference large enough to see at a glance.
- Then redraw the whole form with pristine geometry: smooth continuous
  curves, uniform stroke width, clean joins, deliberate proportions taken
  from the sketch. The result should look like a professional designer drew
  the same subject — not like a vectorized scan of the sketch.

### Organic & decorative shapes (waves, ribbons, blobs, underlines-as-flair)
- Shapes the recognizer can't name arrive with kind "ink" AND an exact
  `svgPath` (fitted cubics, bbox-local coordinates). First rule out a
  standard-widget reading: if the path approximates a lexicon shape (a sloppy
  rectangle, a rough circle), rectify it into that widget. Otherwise the path
  IS the design: use it as the geometric reference for the form, normalized
  per the rules above (merge overdraws, hatching = fill, smooth and
  symmetrize), sized to the bbox.
- `layerHint: "background-overlay"` means the stroke travels ACROSS existing
  elements without enclosing them: implement as a decorative layer —
  absolutely positioned within the container, behind content (negative
  z-index or first child), `pointer-events-none`, sized per the bbox.
- `layerHint: "container"` means the shape deliberately ENCLOSES existing
  elements: it is a grouping/wrapper around them, not decoration.
- A wavy line is a CHART only in chart context (axes, data labels, inside a
  stat/data card). Spanning a section or page background = decoration.
  When both readings are live, prefer decoration and say so in assumptions.

### Fidelity & scope
- Read the neighboring source FIRST; reuse the app's existing components,
  Tailwind idiom, colors and type scale. The sketch inherits the app's design
  system — do not invent a new visual language or default to generic styles.
  (Rectify-don't-reproduce applies to WIDGETS; provided svgPaths are content
  and keep their drawn form.)
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
