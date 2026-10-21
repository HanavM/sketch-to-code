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
