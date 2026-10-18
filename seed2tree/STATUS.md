# sketch-to-code: project brief

## Right now
Making the tool understand quick, sloppy marks on its own, without asking an AI model. Last run it tested thousands of messy scribbles and found that a scribble drawn slightly too long could delete the things next to it. That's fixed. Next it's teaching the tool to recognise a circle you went around twice, and an X as "delete this".

## The idea
You build and change an app by drawing on it, not by writing code or typing long instructions. Scribble over something and it's gone. Circle a button with a green pen and it turns green. Draw an arrow from a button to a box you sketched and you get a new page linked to that button. Words are only for filling in details. The goal is a "drawing-first Cursor" that someone who doesn't code can use.

## What works today
- **Draw on your running app** (press Alt+D) and your real code changes. You see the result in a second, and one click undoes it.
- **Delete** by scribbling over something. **Recolour** by circling it with a coloured pen. **Move** things with arrows. **Add** buttons, sections or whole new pages by sketching a box.
- **New pages:** sketch a second screen, draw an arrow to it from a button, and the page and link get built.
- **Simple marks are free and instant.** Clear deletes and colour changes no longer need the AI at all.
- **Plain language throughout.** Progress messages, "here's what I changed" and "I misread your sketch" all read like normal sentences, and undo never erases your own hand edits.
- **One-command setup** on a normal React project. It has been tried on 5 popular starter templates (including React Router), and each got working in about 15 seconds.
- A **README and a 60-second demo** written for non-coders.

## Lately
The last day was mostly about making it work for a non-coder from start to finish: no confusing messages, nothing that silently does the wrong thing, and working on apps it didn't set up itself. Along the way it found and fixed about a dozen real bugs, including the overlay not showing up at all when installed the way a stranger would install it.

## What's next
More marks that work without any typing, like an X to delete or a circle drawn twice. After that, the big open test: proving that this tool's way of understanding sketches beats just sending a screenshot to an AI. That test is waiting on you.

## Waiting on you
1. **The big test (sketch reading vs. screenshot):** it needs a Claude login it can use. Either run it yourself on your Mac, or let it run in the cloud.
2. **Trying it on 5 real people's apps:** OK to copy 5 public open-source projects from GitHub to test on (read-only)?
3. **Publishing it so anyone can install it:** "yes, MIT licence" or "not yet".
4. **Re-scoring the old benchmark:** OK to spend about 2M tokens?
