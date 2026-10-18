# Goal

Drawn changes feel instant. The page changes the moment you draw, and the
code catches up afterwards.

## Done when
1. A scribble over an element hides it on the page within 100 ms of
   lifting the pen, with no Go press. The code change follows and is
   verified, and if it fails the page puts the element back.
2. Circling an element with a coloured pen recolours it on the page within
   100 ms of lifting the pen, with the same catch-up and rollback.
3. An arrow (move), a caret (insert) and a box in empty space (new
   section) each show a preview within 300 ms of lifting the pen, clearly
   marked as pending. The preview becomes the real result when the code
   lands, or is removed if the code does something else.
4. You can draw your next change while earlier ones are still being coded.
   Three changes drawn back to back all land correctly (e2e test).
5. Undo still works for each, and the existing tests still pass.
6. A before/after table of time from lifting the pen to the change being
   visible, per gesture, measured on the demo app.

## Budget
Live AI runs: up to 300k tokens a day.
