# Log (newest first)

2026-10-18T08:43:33Z | Before/after timing table | Changes now show 13-45 ms after lift, versus 1.2 s to 142 s before; table in docs/latency.

2026-10-18T08:28:41Z | Draw while earlier changes are being coded | Pen stays free; three back-to-back changes queued and all landed in order; undo restores all.

2026-10-18T08:07:25Z | Preview gives way the moment the real change shows | Preview vanishes about 60 ms after the code lands; cleared at run end if code does something else.

2026-10-18T07:49:45Z | Live e2e: previews give way to the real change | Move, insert and new section all landed live; preview held until done, then removed; undo works.

2026-10-18T07:38:01Z | Pending previews for move, insert, new section | Dashed pending preview 12-26 ms after lift for all three; removed on failure; tests pass.

2026-10-18T07:27:00Z | Coloured-ring recolour e2e plus undo | Ring recolours 15-24 ms after lift, rolls back on failure, lands without flash; Ctrl+Z works for both.

2026-10-18T07:21:27Z | Wire quick change into pen lift | Scribbled element hides 15-34 ms after lift, comes back on failure, live delete lands; e2e passes.

2026-10-18T07:08:20Z | Gesture reader + reversible patch module | Browser reads scribble and coloured ring like the server does; 7 tests pass; not wired in yet.
