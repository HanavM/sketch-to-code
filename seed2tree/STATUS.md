# sketch-to-code: project brief

## Right now
The big test finally ran. It compared this tool's way of reading a sketch against just sending a screenshot to an AI. This tool won by a clear margin on changes to an existing page and lost slightly on drawing brand-new screens. Next is fixing the cases it got wrong.

## The idea
You build and change an app by drawing on it, not by writing code or typing long instructions. Scribble over something and it's gone. Circle a button with a green pen and it turns green. Draw an arrow from a button to a box you sketched and you get a new page linked to that button. Words are only for filling in details. The goal is a "drawing-first Cursor" that someone who doesn't code can use.

## What works today
- **Draw on your running app** (press Alt+D) and your real code changes. You see the result in a second, and one click undoes it.
- **Delete** by scribbling over something. **Recolour** by circling it with a coloured pen. **Move** things with arrows. **Add** buttons, sections or whole new pages by sketching a box.
- **New pages:** sketch a second screen, draw an arrow to it from a button, and the page and link get built.
- **Simple marks are free and instant.** Clear deletes and colour changes don't need the AI at all, and a sloppy scribble no longer deletes its neighbours.
- **Plain language throughout.** Messages read like normal sentences, and undo never erases your own hand edits.
- **One-command setup** on a normal React project, tried on 5 starter templates.
- **Ready to publish:** licence and package details are in place. Publishing is one short list of steps for you.

## Lately
On rough, hurried sketches, this tool got 80% of the requests right and the screenshot approach got 69%. On edits to an existing page the gap was much bigger (87% vs 67%), and wordless marks like scribbles and coloured circles worked every time here and never with a screenshot. But it cost about three times as much, failed to read a sketch 4 times in 45, and once said "Done" when it had put a new link in the wrong spot.

## What's next
Make "insert here" marks land where you drew them, and stop the "Done" tick from claiming success when the position is wrong. Then find out why some readings fail. After that, maybe send brand-new screens through the cheaper screenshot route.

## Waiting on you
1. **Trying it on 5 real people's apps:** your yes is noted, but this task can only see your own repos. Add 5 public projects to its GitHub access, or copy 5 into your account and name them.
2. **Publishing:** follow the steps in the publishing guide when you're ready (create the "s2c" organisation on npm, then publish).
3. **The test spend:** the full test used about 1.1M tokens, a bit over the ~1M you approved, because it ran three rounds instead of one. Tell me if that was too much.
