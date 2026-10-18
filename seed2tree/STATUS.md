# sketch-to-code: project brief

## Right now
Inserting by drawing now works on grids of cards and on lists, not just menus. Draw a box between two cards and the new card goes there. The bigger next steps still each need a yes from you; without one, only small polish is left here.

## The idea
You build and change an app by drawing on it, not by writing code or typing long instructions. Scribble over something and it's gone. Circle a button with a green pen and it turns green. Draw an arrow from a button to a box you sketched and you get a new page linked to that button. Words are only for filling in details. The goal is a "drawing-first Cursor" that someone who doesn't code can use.

## What works today
- **Draw on your running app** (press Alt+D) and your real code changes. You see the result in a second, and one click undoes it.
- **Delete** by scribbling over something. **Recolour** by circling it with a coloured pen. **Move** things with arrows. **Add** buttons, sections or whole new pages by sketching a box.
- **New pages:** sketch a second screen, draw an arrow to it from a button, and the page and link get built.
- **Simple marks are free and instant.** Clear deletes and colour changes don't need the AI at all, and a sloppy scribble no longer deletes its neighbours. A coloured circle that goes round one and a bit times now counts too: in testing, 98 of 100 were handled for free, up from 42.
- **Insert exactly where you mark.** Draw a little ^ between two menu links, type "Blog", and Blog goes between them. The same works between two cards in a grid (even one that wraps onto several rows) or two rows of a list. If it lands anywhere else, the message says so instead of "Done".
- **Plain language throughout.** Messages read like normal sentences, and undo never erases your own hand edits.
- **One-command setup** on a normal React project, tried on 5 starter templates.
- **Ready to publish:** licence and package details are in place. Publishing is one short list of steps for you.

## Lately
Drawing a box between two cards used to work only when all the cards sat in one row; on a grid with two or more rows, the tool didn't know where you meant. It does now. Also fixed: when a new card pushed the last one onto the next row, the tool wrongly warned that the card had gone in the wrong place. Earlier today, a loop circled one and a half times started being read as a circle instead of a line.

## What's next
Check with the real AI that the ^ fix works (3 tries, small cost, needs your yes). Without a yes on any of the questions below, the hourly runs here have only small polish jobs left.

## Waiting on you
1. **Check the "insert here" fix for real:** about 50k tokens, 3 tries of one sketch. Reply "yes, r14".
2. **A small test of failed readings:** about 150k tokens. It reads 30 sketches without building anything, to catch the occasional failure and see why it happens. Reply "yes, read-only" or "no". (Both together: "yes to both".)
3. **Trying it on 5 real people's apps:** this task can only see your own repos. Add 5 public projects to its GitHub access, or copy 5 into your account and name them.
4. **Publishing:** follow the steps in the publishing guide when you're ready.
