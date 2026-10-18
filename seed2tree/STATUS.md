# sketch-to-code: project brief

## Right now
Looking into why the tool sometimes says "I couldn't read that sketch". It turned out nobody was keeping the reason, so the reason for the earlier failures is lost. Now it's kept. Next is making "insert here" marks land where you drew them.

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
On rough, hurried sketches this tool got 80% right and the screenshot approach got 69%. On edits to an existing page it was 87% vs 67%. Since then: when the AI can't be reached, the tool used to show "reading your drawing…" for about three minutes. Now it gives up after two minutes and says what to check (signed in? online?). Failed readings now keep their reason, so the next ones can be explained.

## What's next
Make "insert here" marks land where you drew them, and stop the "Done" tick from claiming success when the spot is wrong. With your OK, a small test to catch the occasional failed reading and name its cause.

## Waiting on you
1. **A small test of failed readings:** about 150k tokens (roughly a seventh of the last big test). It reads 30 sketches without building anything, to catch the occasional failure and see why it happens. Reply "yes, read-only" or "no".
2. **Trying it on 5 real people's apps:** this task can only see your own repos. Add 5 public projects to its GitHub access, or copy 5 into your account and name them.
3. **Publishing:** follow the steps in the publishing guide when you're ready.
