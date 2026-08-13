# sketch-to-code: complete pipeline logic

Self-contained specification for external review. An agent reading only this
document should be able to verify, attack, or propose changes to the design.
Written 2026-08-13. Includes the ribbon-incident failure analysis (§9) and the
author's proposed fixes (§10) — the reviewer is invited to argue with both.

## 0. System shape

A Vite dev plugin injects a drawing overlay (shadow DOM) into a running React
app. The user draws; a pipeline in the dev-server process interprets the ink
and drives a Claude Code agent session that edits the app's real source files.
Vite HMR applies the change; the browser re-snapshots; assertions verify.

Three run modes:
- **gesture** — ink is edit COMMANDS on existing UI (proofreader's marks)
- **design** — ink is a DRAWING of new UI to implement
- **screenshot** — benchmark: agent gets one screen capture, nothing else

Core design principle: **models never decide WHERE anything is.** Geometry
comes from owned data (stroke capture, `getBoundingClientRect`, build-time
source stamps). Models are consulted for: reading handwriting, and semantic
interpretation of what to build.

## 1. Input capture (browser)

- Pointer events on a full-viewport canvas; coalesced events captured; points
  are `{x, y, t}` in PAGE coordinates (clientX + scrollX). Left-button only.
- A DOM snapshot is taken at Run time: every visible element (area ≥ 1px², or
  zero-size if it carries a source stamp) with: tag, `data-s2c` source stamp,
  page-coords rect, own direct text (not descendants'), classes, 12 computed
  style props, parent id, depth. Cap 2000 nodes (cap is flagged, not silent).
- Source stamps: a dev-only Babel pass adds `data-s2c="file:line:col"` to every
  JSX host element (lowercase tags only; components excluded). Build-time
  stamping because React 19 removed `fiber._debugSource`. Stamps never reach
  production builds (`apply: 'serve'`).

## 2. Stroke analysis (deterministic, zero model calls)

Per stroke: dedupe points <2px apart → resample to uniform spacing
(clamp(diag/40, 2..6) px) → features:

- **Convex hull** (monotone chain, capped at 28 verts), hull area/perimeter,
  min-area enclosing rect (rotating calipers), largest inscribed triangle and
  quadrilateral (O(n³) on the capped hull).
- **closedness** = dist(first,last) / pathLength.
- **revolutions** = |Σ signed turn angles| / 2π, with seam-turn closure when
  endpoints are within 20% of path length (guarded against coincident points).
- **NDDE / DCR** (PaleoSketch): normalized distance between direction extremes;
  max |Δdirection| / mean |Δdirection|.
- **Corners**: IPAN99 (admissible triangle legs dMin..dMax scaled to stroke
  size, opening angle < 150°, non-max suppression).

Classification (ranked candidates with confidence):
- **closed** := closedness < 0.16 AND (revolutions > 0.6 OR Pch²/Ach < 35).
- Closed shapes → CALI fuzzy trapezoids on hull ratios (published thresholds,
  Fonseca & Jorge PRL'01), with one deliberate deviation: the enclosing rect
  for Ach/Aer and Alq/Aer is the AXIS-ALIGNED bbox, because in UI sketching
  orientation is meaningful (a diamond is a deliberately rotated square).
  Classes: circle, ellipse, rect, rounded-rect (rect with soft corners),
  triangle, diamond.
- Open strokes: **line** (thin min-area rect: short/long < 0.06..0.09 ramp, or
  chord/arclength > 0.97); **scribble** (thin-ish + retracing Tl/Pch > 1.5..1.9,
  OR ≥4 corners + Tl/Pch > 1.05); **polyline** (≥1 corner + DCR ≥ 4.5,
  confidence decaying with corner count); **caret** (1 corner, apex above
  endpoints, interior angle > 110°); **arc** (smooth: NDDE ≥ 0.8, DCR < 4.5,
  no corners).
- Fallback: **`ink`** (unknown). ⚠ This is the class the ribbon fell into.

Text-vs-shape: per stroke GROUP (see §3), a composite score over: zero-order
entropy of a 7-symbol turning-angle alphabet (Bhat & Hammond, 4px resample),
angular density, ink density, stroke count; arctan confidence; threshold 0.62
fit on fixtures. Handwriting groups become TextRegions (never per-letter shape
classification).

Arrows: single-stroke (dominant straight run + 1–3 short reversing segments at
one end, wings > 95° off shaft, wings stay near tip) and two-stroke (line +
separate V whose apex lands within max(14, headLen·0.9) px of a shaft
endpoint; V interior angle 20°–140°). Arrows yield directed from→to links.

## 3. Grouping

Strokes cluster by time AND space: gap ≤ 900ms AND bbox gap ≤ 48px joins the
previous group. Mixed groups (big shape + small letters drawn in one breath)
are split first: strokes with bbox diagonal < 72px, if ≥2 of them and ≥1 large
stroke coexist and the smalls' joint text score ≥ 0.62, become a TextRegion;
the larges continue to shape classification.

## 4. Intent resolution (gesture mode; deterministic)

DOM geometry queries: `coverage(inner, outer)` = intersection/inner-area;
`primaryTarget(gesture bbox)` = best IoU > 0.45, else largest element ≥70%
contained in the gesture, else smallest element containing ≥85% of the gesture.
`elementAtPoint` = deepest/smallest element under a point.

Gesture → op mapping:
| ink | op |
|---|---|
| scribble/strikethrough over element | DELETE(primaryTarget) |
| near-horizontal line through the middle 20–80% band of a text-bearing element, width 0.55–1.6× element width | DELETE (strikethrough) |
| closed shape that encloses primaryTarget (±12px) | MODIFY(target) |
| closed shape whose target merely contains it (empty space) | ADD(container, sketch kind+rect) |
| arrow with both endpoints on distinct elements | MOVE(source, dest, before/after/into by geometry) |
| caret | INSERT(container, at apex) |
| handwriting | instruction text: attaches to nearest op's ink within 140px, else MODIFY(element under it) |

Ops merge per (verb, target). Every unmatched ink node is reported in
`unresolvedInkIds` — nothing silently dropped. Targets carry
`srcLoc` = own stamp or nearest stamped ancestor's.

**Auto-escalation**: in gesture mode, if zero ops resolve but the scene has ≥1
shape/text region, the run re-routes to design mode. (⚠ if even ONE op
resolves — e.g. a big decorative shape misread as a scribble-delete — no
escalation happens. See §9/§10.)

## 5. Perception (the only non-codegen model calls)

Transcription of handwriting regions, one batched call: the labeled ink render
(see §6) + region ids → strict-JSON {id, text} per region. Azure OpenAI
(gpt-4.1-mini) when configured (~/.sketch2code/azure.env or env vars), else
the user's Claude Code. Token usage recorded. Models are never asked for
coordinates.

## 6. The ink render (what the model sees)

Strokes rasterized to PNG (≤1400px long edge, white bg, black ink 2px brush,
floor 0.9px after downscale). Set-of-Mark-style marks: per recognized
shape/text region, a blue id badge (3×5 bitmap font: n0, t0, a0…) + thin blue
outline box around its bbox (badge = identity, box = extent; SoM's
best-performing mark combination). Marks only on recognized strokes, never on
DOM elements (mark density hurts — SeeAct). Badges clamped inside the raster.

## 7. Codegen (Claude Code agent session)

One persistent streaming session per run: `cwd` = app root,
`permissionMode: 'acceptEdits'`, tools Read/Edit/Write/Glob/Grep only (no
Bash/network), `settingSources: []` (isolated from user's global Claude
config), env stripped of ANTHROPIC_API_KEY (subscription auth stays put).
System prompt = Claude Code preset + a per-mode CONTRACT + the SKETCH SKILL.

**Skill highlights** (full text: docs/sketch-interpretation.md): channel
authority hierarchy — source code > legend JSON (geometry, transcribed text) >
raster (visual gestalt only); 27-entry wireframe symbol lexicon (X-box=image,
squiggles=text, chevron-rect=dropdown, …); cardinality fidelity (drew 3 →
render 3, no "repeat" comments); rectify-don't-reproduce; minimal diff; snap
to the app's design system; state assumptions.

Per-mode payloads:
- **gesture**: EDIT PLAN JSON (ops sorted bottom-to-top per file so earlier
  edits don't shift later srcLoc line numbers; contract warns about stale
  lines) + labeled ink PNG.
- **design**: LEGEND {shapes: [{id, kind, bbox}], arrows, handwriting with
  transcriptions} + DOM CONTEXT {sketchContainer (smallest element containing
  ≥60% of the ink bbox, with srcLoc), ≤15 nearby stamped elements with rects}
  + labeled ink PNG. ⚠ No stroke path geometry; no overlap analysis (§9).
- **screenshot**: the screen capture PNG + viewport info only.

## 8. Verify & repair

After HMR settles, the browser posts a fresh snapshot. srcLoc stamps SHIFT
after any edit (positional), so assertions re-resolve targets structurally
(tag+text first, then source FILE prefix):
- DELETE: (tag, text) identity absent document-wide; textless targets → count
  of same-source-file elements decreased; unverifiable cases counted satisfied
  but flagged (double-apply from a false repair is worse than under-checking).
- MODIFY: re-resolved target's (tag,text,classes,style) key not in the
  before-set, else any same-file element changed, else old text gone.
- ADD/INSERT: element count within the container's (re-resolved, downward-
  expanded) region grew. Truncated snapshots → unverifiable-satisfied.
- MOVE: document order matches requested before/after, plus the source
  actually moved >12px (or 'into': source center inside dest rect).
Design/screenshot modes: coarse page-changed check (node count or style-key
multiset differs).
Repair: failures → same session, "fix exactly these"; accept only strictly
improving scores (ReLook-style forced optimization); cap 3 rounds.
Safety: git repo required; HOME-toplevel repos refused; dirty tree refused
unless allowDirty; `git stash create` checkpoint before every run; revert
command in every summary; run bundle archived under .sketch2code/runs/<id>/.

## 9. Failure analysis: the ribbon incident (2026-08-13)

User intent: a long wavy ribbon drawn across the page background, wanted as a
painted background element. Result: an in-flow "ribbon-shaped graph" instead.
Run bundle ground truth (`run-1786599201091-1`, design mode, 6 strokes): the
ribbon classified as **two `ink` (unknown) nodes** (461×221, 468×125) + one
small line. Cause chain:

1. **Out-of-vocabulary shape.** A smooth low-frequency wave is: not closed
   (fails §2 closed gates), not a scribble (needs ≥4 sharp corners /
   retracing), not a line (not straight/thin), maybe-not-arc (multiple
   inflections push DCR/corners past the arc gate). It fell to `ink` =
   unknown. The closed-world classifier degrades on decoration precisely
   because its vocabulary is UI-widgets + command-gestures.
2. **Legend carried no curve.** Shapes are sent as kind+bbox only (the
   no-raw-coordinates principle). For organic shapes the geometry IS the
   content; "kind: ink, bbox: 461×221" contains zero ribbon-ness. Only the
   raster showed the wave — the channel the skill ranks lowest.
3. **Layering intent is not represented anywhere.** Location IS included
   (exact bboxes, container srcLoc) but nothing distinguishes "drawn in empty
   space → in-flow element" from "drawn ACROSS existing content → background/
   overlay layer". The brief lists nearby elements but not which elements the
   ink OVERLAPS — the single strongest background-decoration signal.
4. **The skill's priors compound against decoration**: "rectify, don't
   reproduce" (but a ribbon's organic curve should be reproduced as an SVG
   path); "snap to the design system" (a dashboard's system contains charts);
   "most conventional choice" (the most conventional wavy thing in a stats
   dashboard is a sparkline — empirically confirmed by our screenshot
   benchmark, where a zigzag became a sparkline). The 27-entry lexicon has no
   decorative/background entries at all.
5. **Adjacent hazard (didn't fire here but would in gesture mode):** a big
   decorative shape misclassified as scribble = DELETE of whatever
   primaryTarget grabs; auto-escalation only triggers on ZERO resolved ops.
6. **Bug found during analysis** (fixed): `changedFiles` diffed the whole
   repo, not the app root — result.json listed files the agent never touched.

## 10. Proposed fixes (for the reviewer to attack)

1. **New `wave`/`organic` shape class**: open stroke, smooth (low corner
   count relative to length), ≥2 curvature inflections, high aspect (bbox
   w/h > ~2.5), NOT retracing (Tl/Pch < ~1.4). Distinct from scribble
   (high-frequency, sharp) and arc (single bend). Also a generic `blob` for
   closed organic shapes failing all CALI classes.
2. **Overlap analysis in the design brief**: per sketched shape, list the DOM
   elements its bbox intersects (id, srcLoc, coverage fraction). Skill rule:
   a shape SPANNING multiple existing elements without enclosing any single
   one, in design mode, is a background/overlay layer → absolutely
   positioned, behind content (`absolute inset-* -z-10 pointer-events-none`),
   in the container's stacking context.
3. **Simplified path geometry for organic shapes only**: RDP the stroke to
   ≤20 rounded integer points and include it in the legend. Bounded exception
   to the no-coordinates rule — the objection is to LONG coordinate lists;
   ~20 points is well within what models handle, and without the curve the
   agent literally cannot draw the ribbon (needed for the SVG path).
4. **Skill lexicon + rules additions**: wavy band spanning a section/page =
   decorative wave/ribbon; explicit chart-vs-decoration disambiguator (a wave
   is a CHART only with chart context — axes, labels, inside a data card;
   spanning a background = decoration); "rectify" carve-out: organic
   decorative shapes keep their drawn silhouette (smooth the path, keep the
   form).
5. **Escalation hardening**: in gesture mode, a single resolved op whose ink
   covers > ~35% of the viewport or spans ≥3 distinct elements is suspicious
   — confirm as design-vs-command (cheap tie-break model call, or ask the
   user via HUD) instead of executing a mass DELETE.
6. **Optional layer toggle in the HUD** ("background / foreground") as an
   explicit human override — deterministic beats inferred when the user is
   willing to say what they mean.

Questions the reviewer should pressure-test: Is the closed-world classifier
the right architecture at all, vs. classify-with-abstain + model fallback for
OOV strokes? Is §10.3's bounded-coordinates exception a slippery slope? Does
§10.2's "spans without enclosing" rule misfire on big container sketches
(drawing a card AROUND existing content)? Is 0.62 text threshold / 72px small-
stroke split robust for non-Latin scripts? Should design mode verify more than
"page changed"?
