# Round 3 results (hardest pages)

## Live 2026-10-21, everyday pages e1, e3, e5 (n20)
Built from the auto plans on try/n3-vocabulary, 127k billed tokens for 3 pages (one build turn each, no repairs).

| page | likeness v2 | regions | what came out | gap |
|---|---|---|---|---|
| e1 users table | 30% | 4/5 | heading, invite button, search + 2 filters, 5-column table, 7 rows, coloured status pills: very close | pager had no words, so its squiggle was built as a zigzag divider |
| e3 calendar | 21% | 3/4 | title, Prev, New event, 7x5 month grid, coloured event chips, day 11 highlighted | Today / Next missing (unmarked, never said); events on wrong days (days never said) |
| e5 analytics | 26% | 5/5 | heading, range dropdown, 4 stat cards with exact numbers, top-pages list | bar chart card built with no visible bars |

Side by sides: `built/*-live-cmp.png`. Visually these are the closest builds yet; the v2 likeness number
stays low on light app pages because colour/blank calibration leaves little lift.

Fixes after this run (free, re-run pending): pager note ("Showing 1–7 of 48", page buttons, current page);
a marked button names same-looking unmarked buttons beside it ("‹ Prev", "Today", "Next ›");
calendar events carry their days; bar chart note gives relative heights; codegen rule that chart bars
are never empty (explicit px heights). Bench now saves each page's built source to out/runs/<id>/src.

## Live re-run 2026-10-21, e1, e3, e5 after the n20 fixes (n28)
156k billed for 3 pages, then e5 again 34k after the empty-fill check.

| page | before (n20) | after (n28) | what changed |
|---|---|---|---|
| e1 users table | 30% | 26% | pager now "Showing 1–7 of 48", 1 2 3 Next: fixed. Score dip is layout (content sits a little lower/narrower); title region missed positionally |
| e3 calendar | 21% | 31% | ‹ Prev, Today, Next › all present; events on their days (Standup Mondays, Design review 4th, Launch 6th, 1:1 + Planning 11th). Retro dropped, Offsite as one bar over 19–20 |
| e5 analytics | 26% | 26% → **64%** | the prompt rule alone did not fix the empty chart (bars were % height inside an auto-height column = 0px). New zero-token check after each build: filled boxes rendering 0 high/wide fail verify and get a repair turn (5k). Bars now visible and rising like the target |

Side by sides: `built/*-n28-cmp.png`, `built/e5-analytics-n28-fixed-cmp.png`.

## Live re-run 2026-10-21, e3 after the n29 plan fix
40.6k billed, one build turn, 9 tool calls (now logged: 1 Grep, 3 Glob, 4 Reads, 1 Write).
The plan had cut the list at 6 events, so "Retro" was never said; it now names every event and says
"a chip on each day" for events on several days. Built: all 13 chips present, Retro on 25, Offsite as two
chips on 19 and 20. Likeness 24% (was 31%): the month starts on the wrong weekday (Nov 1 drawn under Mon,
target has it under Sun with Oct 26-31 greyed in), which shifts every chip one column and adds a sixth row;
chips are pale tints where the target has solid fills with white text. Side by side: `built/e3-calendar-n29-cmp.png`.
Next: the plan should say which weekday day 1 falls on, that leading days are from the previous month, and
solid vs pale chips.
