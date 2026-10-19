# First use of each gesture, busy machine (goal loop n24, 2026-10-19)

Fresh session each run, two CPU hogs (`node -e 'for(;;){}'` x2) on a 2-core box.
Times: release / pen lift to the change being visible on the page.

mixed-ten.mjs, 4 runs, each gesture's first use in the session (all 4 runs pass, 5/5 pen edits direct, 0 model calls):

| gesture (first of session) | run 1 | run 2 | run 3 | run 4 |
|---|---|---|---|---|
| drag reorder (card 1->3) | 8.3 | 4.0 | 3.3 | 4.0 |
| scribble erase (nav "Reports") | 16.1 | 12.4 | 8.0 | 11.8 |
| edge resize (card taller) | 3.0 | 3.2 | 3.2 | 1.8 |
| ring recolour ("Team members") | 11.6 | 18.7 | 16.2 | 12.4 |
| caret addition ghost ("Docs") | 9.6 | 11.3 | 18.2 | 11.5 |
| drag move (form down) | 1.5 | 1.0 | 1.2 | 1.4 |

optimistic-preview.mjs, 4 runs, page reloaded before each gesture (so each is a first use):

| pen preview | run 1 | run 2 | run 3 | run 4 |
|---|---|---|---|---|
| arrow move | 22.3 | 16.3 | 28.5 | 12.9 |
| caret insert | 13.2 | 12.6 | 14.7 | 13.5 |
| box new section | 13.9 | 14.7 | 19.8 | 15.9 |

Nothing was cold. The only finding: the pen warm-up's invisible ghost (n23,
`.pv[data-s2c-warm]`) was counted as a preview by five e2e scripts, giving
negative timings; they now skip it.
