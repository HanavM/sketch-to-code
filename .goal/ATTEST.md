# Attestation: edits feel instant and physical, like Canva

Verified 2026-10-19 by the goal loop (node n25), as a skeptic, from a fresh
checkout of `agent` (d855db3, fresh `npm ci` + `npm run build`), sandbox with
2 CPU cores, headless Chromium. Every check below was re-run in this step.

## How to see it yourself
    npm ci && npm run build
    export S2C_CHROMIUM=/path/to/chromium      # optional
    node tests/e2e/mixed-ten.mjs               # ten mixed edits + ten undos, all checks
    node tests/e2e/shared-plane.mjs            # 22 edits, page matches when code lands
    node tests/e2e/motion-reorder.mjs          # also motion-resize, motion-add-recolour
    node tests/e2e/direct-erase-recolour.mjs   # also direct-insert, undo-direct, undo-insert, ten-in-a-row
    (motion-erase needs `S2C_STUB_MODEL=1 npm run dev` on :5199 first)
    node tests/e2e/motion-proof.mjs            # films the GIFs, writes docs/motion/REPORT.md
Then open docs/motion/REPORT.md (GIFs are in docs/motion/proof/).

## Criteria

1. **Every gesture visible within 50 ms, no wait for the agent: met.**
   mixed-ten (unloaded): reorder 3 ms, erase 12-14 ms, resize 2 ms, recolour
   11-13 ms, add ghost 13 ms, move 1 ms; 0 model calls. Slowest edit or undo
   in 4 mixed-ten runs (1 unloaded, 3 under two CPU hogs): 25-38 ms.
   direct-erase-recolour 8/8 visible 11-30 ms; direct-insert ghosts 13-31 ms;
   motion-add-recolour recolour 10 ms. First use under load: docs/motion/first-use.md (n24, 1-29 ms).

2. **Smooth, not jumps, at 60 fps: met.** motion-erase: fades, neighbour
   glides, exact take-back, 60 fps. motion-reorder: row glides over 11 frames,
   frame gap p95 16.7 ms. motion-add-recolour: new link grows over 14 rising
   frames, neighbour glides 11 spots, recolour eases over 8 colours, p95 16.8 ms.
   REPORT.md: every edit 60 fps (gap p50 16.7 ms).

3. **Canva-style direct manipulation: met.** motion-reorder: row opens the
   slot 26 ms into the drag, glides, code reordered after release (0 tokens).
   motion-resize: page reflows live during the edge pull, size held until the
   code lands (182 px dragged = 182 px in code), cancel eases back; free move
   lands as mt-9.

4. **One shared plane, >=95% of 20+ edits with no flash or jump: met.**
   shared-plane 22/22 matched (100%), twice: once unloaded, once under two CPU
   hogs. Plus direct-erase-recolour 8/8 and direct-insert 3/3 with no flash.
   Mismatches are eased and reported in words by the shared-plane checks.

5. **Ten edits in under 20 s, all in code; undo just as instant: met.**
   mixed-ten: 10 mixed edits (drags, resizes, move, erases, recolours, drawn
   addition) in 13.3 s, all in code, 0 model calls; 10 undos visible 5-35 ms,
   smooth, source and page back to start. Passed 1/1 unloaded and 3/3 under
   two CPU hogs. ten-in-a-row 10/10 in 9.7 s; undo-direct 5/5; undo-insert 3/3.

6. **Proof to watch: met.** docs/motion/proof/{erase,add,reorder,move,resize,
   recolour,undo}.gif re-filmed in this step from one continuous run, and
   docs/motion/REPORT.md with a per-edit and per-undo frame-timing table.

## Also checked
- `npm test`: 1355 passed, 2 failed, both environment-only (cli gh-create
  prompt, library home-dir as root), same as the recorded baseline.
- caret-insert.mjs was failing because plain caret additions now land
  directly; it now refuses the direct path so it keeps testing the model
  path (slot in brief, honest vs hollow verdict): all checks pass.
- optimistic-scribble and optimistic-preview still pass.
