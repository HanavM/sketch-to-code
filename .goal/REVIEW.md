# Changes feel instant and physical, like Canva

**Met.** All 6 checks passed when re-run from scratch on a busy machine. It took 22 steps over about 9½ hours (Oct 19, 1:20–10:40 UTC).

## Watch it

Erase: the card fades out and its neighbours glide into the gap.
![erase](docs/motion/proof/erase.gif)

Add: a drawn link grows in.
![add](docs/motion/proof/add.gif)

Drag to reorder: cards make room as you drag.
![reorder](docs/motion/proof/reorder.gif)

Move.
![move](docs/motion/proof/move.gif)

Resize by dragging an edge.
![resize](docs/motion/proof/resize.gif)

Recolour with a coloured pen.
![recolour](docs/motion/proof/recolour.gif)

Ten undos in a row.
![undo](docs/motion/proof/undo.gif)

## How it did

| Check | Result |
|---|---|
| Visible within 50 ms | 1–38 ms for every gesture, including on a busy machine |
| Smooth at 60 fps | Every edit animates at 60 fps: fades, glides, grows |
| Drag and resize like Canva | Page reflows live as you drag; the code matches when you let go |
| Page matches when code lands | 22 of 22 edits with no flash or jump, run twice |
| Ten edits in a row | 10 edits in 13 s, all in the code; 10 undos, each under 40 ms |
| Proof to watch | GIFs above, plus a frame-by-frame timing report |

## What's new for you

- Erase, recolour, move, reorder, resize and simple additions now **skip the AI entirely**. The page changes in milliseconds and the code is written directly, about a second later.
- You can **drag elements and their edges** like in Canva, not only draw.
- **Undo** is as instant and smooth as the edit itself.

## How it got there

- **Kept: a motion layer.** Every edit animates on the page first and holds until the code catches up.
- **Kept: direct code edits.** Simple gestures write the code with exact rules instead of asking the AI.
- **Cut: a separate design layer as the source of truth.** The agent found the two kept pieces already make what you see lead, and a second layer added sync risk.

## Worth knowing

- **Tested on the demo app only**, in a headless browser. Real projects with unusual code may fall back to the AI for some edits, which is slower.
- **"One shared plane" was met by keeping the page and the code in lockstep**, not by making a design file the true source. If you want design to truly lead, make that part of the next goal.
- **None of this is on `main` yet.** It's on the `agent` branch, 297 commits ahead. Merge it when you're happy.

## Ideas for the next goal

- Try it on 5 real apps, not the demo.
- Make AI-written changes (new sections, wording) feel just as smooth.
- Multi-select and group edits: drag several things at once.
