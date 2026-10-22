# Round 6 (n77): harder than round 5, untuned first look

Creative: c1 perspective stack (three gradient cards tilted in 3D over a perspective grid floor, gradient-text
headline), c2 split type (one word cut in half by clip-path, the lower half red and shifted right, vertical
side label, skewed "Tickets →", red dot), c3 SVG waves (three filled bezier hills, dashed path, sun, italic serif
headline), c4 glass devices (mesh gradient page, frosted laptop with bars, frosted phone with an open ring, frosted
stat badge), c5 brutal zine (thick-ruled 3x3 grid, black masthead band, blue/yellow duotone tile, vertical "LOUD",
tilted red sticker over the grid lines, yellow price tile).
Everyday: e1 mega-menu open over a store (4 columns: three link lists with sublines and a dark featured card),
e2 dashboard with 4 KPIs, line chart, donut, bar chart, table and filters, e3 3-pane mail client (folders, message
list with selected/unread rows, reader with toolbar, attachment and reply box), e4 checkout (stepper, filled
form, delivery choice, order summary with quantity badges and totals), e5 week calendar (7 days, hour rail,
overlapping events, today marker, now-line).

Measured: blank page scores 19-98% colour / 17-79% structure (c1 is dark, e3/e5 mostly white).
Effects read off the targets miss what makes this round hard: 3D perspective/rotateX/Y, clip-path splits, skew,
SVG paths and conic segments are not among the techniques yet.

Untuned planner misses (rounds 1-5 plans must not change):
- e5: the events inside the week grid are unsaid (grid said as "pale grey to light grey gradient"); only the
  today event is said, as an off-white card. Day header lost SUN 25 (list cut at 6) - fixed below.
- e3: the message list says only the 4 read rows (the selected and unread rows vanish) and no names/subjects
  together; the reader drops the body text and the sender avatar.
- e1: column sublines said for some items only ("Domains TLS included"); the mega card's shadow and that it
  hangs from the top bar over the page are unsaid; the featured card's gradient square is unsaid.
- e2: donut said as one 46% arc (target 3 coloured segments + legend); table's first row read as columns.
- e4: summary item names, prices and thumbnails unsaid ("list: 1, 2, 1"); form fields not said as labelled
  bordered fields; selected delivery card unsaid.
- c1: front card said "near-black" (it is a yellow-to-orange gradient holding the price); the perspective floor
  grid is a bare box; the gradient on "three dimensions" only implied.
- c2: the clip split is unsaid (said as two stacked lines); horizontal rules were said "a progress bar" - fixed
  below; "Tickets" skew unsaid.
- c3: the SVG waves are one bare box: no hills, colours or the dashed path.
- c4: the mesh glows said as a 3-stop page gradient; laptop's bars and phone's ring unsaid; frosted cards say
  nothing about their size or contents.
- c5: the duotone tile's yellow shapes on blue unsaid; "LOUD" not said as rotated; quote's bold size unsaid.

## n77 fixes (free)
- A thin textless strip (<= 4px tall, >= 400px wide) below the top edge is "a divider rule, not a bar or button"
  (was "a progress bar"); top-edge strips unchanged.
- A row of short links says up to 8 items (was 6): e5 day headers now include SUN 25.
- Rounds 1-5 plans: unchanged (re-generated and diffed).

## n78 fixes (free)
- e5: a week grid (absolutely placed events over a 7-column day head and an 'N AM' hour rail) says every event:
  pale <edge colour>, its copy, day (or left/right half of a day, or a day span) and from/to clock times read off
  the hour rail. Marked events stay their own marks.
- e5: a thin strip with a round ::before/::after knob is "the current-time line" with its dot (was "a progress bar").
- e3: mail rows with time, sender, subject and preview: the 'old' class no longer splits read rows from unread
  ones, all 6 rows said with sender, time, subject and preview, unread rows marked, selected row's pale blue fill
  and blue left edge said.
- e3: an opened message (title, round avatar, body copy) says its tool buttons, title size, avatar colour beside
  sender and sub-line, every body line, and the attachment box (was a list of the tool buttons).
- Rounds 1-3 and 5 plans unchanged; round 4 e2 reading pane changes the same way (it had lost sender, avatar and
  two body paragraphs).
- Left for later: e1 sublines/shadow/featured square, e2 donut segments + table first row, e4 summary items,
  labelled fields and the selected delivery card.
