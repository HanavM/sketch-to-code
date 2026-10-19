# Goal

Changes feel instant and physical, like Canva. When you erase, draw, move or
resize something, it visibly happens on the page right away, smoothly and
gradually, without waiting for the coding agent. Your edits feel etched into
the site as you make them, and the code catches up behind. Design and code
live on one shared plane: you edit what you see directly, and the code
follows from it, instead of every visual change having to go through code first.

(Hanav's words: "when you remove, draw, or move things, it should first
visually happen somehow and as quick as possible, even if that has to go around
the coding agent ... erasing something should remove and move things around
gradually ... like Canva where you can drag and drop things and everything just
happens instantly." The specs below are a guide. How you get there is up to
you, as long as the feel is right.)

Build on what's already done: drawn changes already show in 13–45 ms
(scribble hide, ring recolour, pending previews, queued edits; see
docs/latency and .goal/archive).

## Done when
1. Erase, draw/add, move, recolour and resize each change the page visibly
   within 50 ms, with no wait for the coding agent.
2. Changes are smooth, not jumps. Erasing fades the element out and its
   neighbours glide into the gap. Moving glides the element to its new spot.
   Adding grows in. Measured at 60 fps on the demo app.
3. Canva-style direct manipulation: drag an element to move or reorder it,
   and drag its edges to resize it. The page reflows live during the drag,
   and the code follows after you let go.
4. One shared plane: the visual edit is the source of truth for what you
   see. When the code lands, the page matches what you already saw, with no
   flash or jump, in at least 95% of a test set of 20+ edits. Mismatches
   resolve smoothly and say why.
5. Ten edits in a row in under 20 seconds, with no waiting, all land
   correctly in the code. Undo is just as instant and smooth.
6. Proof I can watch: a short screen recording, or a GIF per gesture, plus a
   frame-timing report.

## Budget
Live AI runs: up to 300k tokens a day.
