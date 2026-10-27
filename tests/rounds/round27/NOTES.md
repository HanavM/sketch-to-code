# Round 27 (n251): harder than round 26, untuned first look

Creative: c1 tarot fan (three foil-edged cards fanned in perspective, one turned each way, a sun of repeating-conic rays, an
inset-shadow moon, an eye; a starfield over a glow, halo rings made of spread shadows, a serif headline with an italic gold
word, an ornament rule of three background layers, a gold gradient pill), c2 perfume glass (a see-through glass bottle with
inset shading and a shine strip, a gradient cap and neck, a mirrored reflection, two blurred mists, 150px tracked Didot,
an italic 'nuit', thin vertical rules, a notes list), c3 clay launch (an organic blob, a clay squircle with layered inset
shadows, glossy spheres, a torus, gradient-clipped text, a pressed 3D button, a faint dot grid, a frosted nav), c4 film
festival (a title with two stacked hard text-shadows, a turned film strip with sprocket holes from ::before/::after stripes,
an SVG laurel with text, a ticket with mask-cut notches, grain), c5 climate wheel (an SVG radial bar chart of twelve wedge
paths, rain dots and month letters, dashed rings, a glowing core dial, a colour scale).
Everyday (denser tools): e1 photo editor (presets with swatches, a sunset photo of layered gradients with a clip-path hill,
a crop box with rule-of-thirds lines and a dimming spread shadow, corner handles, ratio chips, an RGB histogram, seven
sliders, a filmstrip), e2 meal planner (a 5-day lunch/dinner grid of cards, a prep timeline on a ruled track, a shopping
checklist, a calorie donut), e3 smart home (a conic gauge thermostat with a knob, device cards with toggles, a live camera
tile, a scene card, an energy area chart), e4 claim form (stepper, focused and error fields, radio cards, a dropzone, file
chips, an open date picker over the form, a summary card), e5 cluster map (sparkline KPIs, four nodes of hexagon pods cut
by clip-path, a pod detail with a log, an events table).

## n251: first live builds of all ten (2026-10-26, ~1.00M billed, 64.6 min run time)

| page | likeness | what was off |
|---|---|---|
| c1 tarot fan | **87%** | cards fanned right; starfield dots, ornament rule and halo rings lost; gold pill built as an empty outline; card art partly lost |
| c2 perfume glass | 76% | bottle built opaque gold (see-through stops said 'fully opaque', inset shading said as a glow); label plain |
| c3 clay launch | 25% | faint dot grid said as a dark backdrop, so the whole page built near-black; blob built round; clay squircle lost (no fill said) |
| c4 film festival | 79% | strip, title shadows, ticket right; laurel SVG became loose blobs; grain lost |
| c5 climate wheel | 83% | wedge chart said as twelve loose shapes, built as rounded lumps; month letters lost |
| e1 photo editor | 75% | crop box built as a solid white block (its hairline layers read as a white fill); histogram mangled |
| e2 meal planner | **85%** | grid, timeline, list, donut right |
| e3 smart home | 74% | thermostat gauge built as a plain grey ring; chart fills built opaque, top line lost |
| e4 claim form | **84%** | date picker, radio cards, errors right |
| e5 cluster map | **86%** | all sixty hexagon pods lost (said as a meter list) |

Round 27: **75%** over 10 (75.4; round 26 started at 83 untuned).

## n251 fixes (planner, zero tokens, not yet re-run live)

- Gradient stops below full alpha say their opacity, not 'fully opaque' (c2 bottle); inset-only shadows are said as inner
  shading, not a glow (c2 bottle).
- A pill painted by a gradient says its fill (c1 gold button).
- A tiled dot layer over one page-sized glow is a starfield, even when the block already had a glow note (c1 sky).
- A faint dot grid (ink under 30% over clear) is a dot grid with its rgba ink (c3 page; also c4 grain).
- An organic blob (four unequal % corners) says its exact border-radius and keeps its old motion words (c3; r13 c2, r22 c5).
- A clay block noted only by its shading says its size, rounding and fill first (c3 squircle).
- A labelled SVG drawing (2+ texts, 6+ shapes) and a small filled area chart are said verbatim (c5 wheel, c4 laurel, e1 histogram).
- Hairlines from 2+ no-repeat gradient layers are said as an empty box with exact background, border and spread shadow
  (e1 crop box, c1 ornament rule).
- A conic gauge with a start angle or degree stops says its exact CSS (e3 thermostat); area chart paths keep fill opacity
  and stroked edges (e3 energy).
- Small clip-path tile groups are said tile by tile with colours by letter (e5 hexagon pods).

Re-planned rounds 1-26: only r13 c2 and r22 c5 change (blob). Vitest: same 2 env failures (1460 tests); typecheck clean.
Next: live re-runs of c3, c5, e5, e1, e3, c2, c1 on the new notes.

## n252: live re-runs on the n251 notes, plus three more planner fixes (2026-10-26, ~647k billed)

| page | before | after | what changed |
|---|---|---|---|
| c3 clay launch | 25% | **86%**, then **91%** | page light again, blob and clay squircle right; second run (new rules below) got the three white stat cards and the thick donut |
| c5 climate wheel | 83% | **94%** | twelve SVG wedges, rain dots and month letters drawn verbatim; core figure small, legend swatches overlap labels |
| e1 photo editor | 75% | **91%** | crop box see-through with thirds and dimming, histogram right; slider names invented and corner handles lost (fixed below, not re-run) |
| e5 cluster map | 86% | **95%** | the hexagon pods built tile by tile |

Round 27: **86%** over 10 (85.6; first look was 75).

Fixes (planner):
- Stat cells that are each their own filled card say SEPARATE cards with size, rounding, padding, exact box-shadow, gap and
  place (c3 said 'NOT separate cards' and built bare words). Re-run c3: cards built.
- A thick textless ring (border a fifth of its size or more) is a DONUT said by its untransformed box, border, shadow and
  rotate() (c3 torus was 'glowing outline circle', built as a thin wide ring). Re-run c3: right.
- Slider tracks say their label row (name, and the value at its right end) and a gradient track's exact background (e1
  built Whites/Blacks/Saturation in place of Temperature/Tint/Vibrance; values and coloured tracks lost). Not re-run.
- Small textless corner brackets (border on two touching sides) are said one by one with their like siblings (e1 crop
  handles were 'input ""'). Not re-run.

Re-planned rounds 1-26: only r26 e1 inspector sliders gain their labels. Vitest same 2 env failures (1460); typecheck clean.
Still weakest: e3 smart home 74, c2 perfume glass 76, c4 film festival 79 (their n251 fixes not yet run live).

## n253: live re-runs of the weakest pages, three planner fixes, and ease logging (2026-10-27, ~584k billed)

| page | before | after | what changed |
|---|---|---|---|
| e3 smart home | 74% | **93%** | thermostat built as a coloured conic gauge with its knob; energy chart see-through with stroked tops |
| e1 photo editor | 91% | **93%** | slider names and values right (n252 notes); corner handles still thin |
| c4 film festival | 79% | 84%, then **86%** | laurel SVG verbatim; second run (new band rule) got the sprocket holes |
| c2 perfume glass | 76% | 71%, then **81%** | first run: bottle gold, no table band; second run (new rules): pink see-through bottle, table band, pink mist; neck built as a big tan box behind the bottle |

Round 27: **89%** over 10 (88.8; first look 75).

Fixes (planner):
- A page gradient with a hard stop says HARD EDGE and its exact CSS (c2 table band; also 4 pages in earlier rounds).
- A blurred glow says its exact colour (c2 mist #f3a7b5 was 'peach'; 7 glows in earlier rounds gain their hex).
- A panel's thin striped ::before/::after bands are said with size, place and exact paint (c4 sprocket holes).

Ease logging (Hanav's note): every run digest now records marks drawn, notes and words typed, drawing time, time until the
reading shows, and run time; `node tests/rounds/ease.mjs` writes tests/rounds/EASE.md with likeness, marks, words, draw s,
read s, build s, tokens and fixes per page and per round. Round 27: 14 marks, ~1,170 words, ~80 s to draw, ~90 s to read,
~300 s to build, ~114k tokens per page, no repair turns. Words typed per page grew from ~240 (round 1) to ~1,100+.

Still off: c2 neck (said with no size), e4 claim form 84, e2 meal planner 85, c1 tarot 87.
