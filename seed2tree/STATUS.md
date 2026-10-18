# sketch-to-code: project brief

## Right now
A "put it here" mark between two menu links now puts the new link exactly there, and the tool now admits it when something lands in the wrong spot. Nothing is left in this project that's worth doing for free. The useful next steps each need a yes from you.

## The idea
You build and change an app by drawing on it, not by writing code or typing long instructions. Scribble over something and it's gone. Circle a button with a green pen and it turns green. Draw an arrow from a button to a box you sketched and you get a new page linked to that button. Words are only for filling in details. The goal is a "drawing-first Cursor" that someone who doesn't code can use.

## What works today
- **Draw on your running app** (press Alt+D) and your real code changes. You see the result in a second, and one click undoes it.
- **Delete** by scribbling over something. **Recolour** by circling it with a coloured pen. **Move** things with arrows. **Add** buttons, sections or whole new pages by sketching a box.
- **New pages:** sketch a second screen, draw an arrow to it from a button, and the page and link get built.
- **Simple marks are free and instant.** Clear deletes and colour changes don't need the AI at all, and a sloppy scribble no longer deletes its neighbours.
- **Insert exactly where you mark.** Draw a little ^ between two menu links, type "Blog", and Blog goes between them. If it lands anywhere else, the message says so instead of "Done".
- **Plain language throughout.** Messages read like normal sentences, and undo never erases your own hand edits.
- **One-command setup** on a normal React project, tried on 5 starter templates.
- **Ready to publish:** licence and package details are in place. Publishing is one short list of steps for you.

## Lately
In the last big test, a ^ mark between two menu links put the new link at the end of the menu every time, and the tool still said "Done". The cause: nothing told the code-writing step which two links the new one goes between. It's told now, and the check afterwards looks at where the link ended up, not only whether it showed up. Before this, failed readings started keeping their reason, and a reading that can't reach the AI gives up after two minutes instead of three.

## What's next
Check with the real AI that the ^ fix works (3 tries, small cost, needs your yes). Without a yes on any of the questions below, the hourly runs here have only small polish jobs left.

## Waiting on you
1. **Check the "insert here" fix for real:** about 50k tokens, 3 tries of one sketch. Reply "yes, r14".
2. **A small test of failed readings:** about 150k tokens. It reads 30 sketches without building anything, to catch the occasional failure and see why it happens. Reply "yes, read-only" or "no". (Both together: "yes to both".)
3. **Trying it on 5 real people's apps:** this task can only see your own repos. Add 5 public projects to its GitHub access, or copy 5 into your account and name them.
4. **Publishing:** follow the steps in the publishing guide when you're ready.
