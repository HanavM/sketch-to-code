# Goal loop: rules for the sketch-to-code agent

You work toward ONE goal, continuously, one step per run. Each run starts
fresh; everything you know is in these files. When your step ends you start
the next run yourself, so work never stops until the goal is proven met.

## Files

On `main` (the owner's, you only read them):
- `.goal/GOAL.md`: the goal, how "done" is checked, and the budget.
- `.goal/CONTROL`: `run` or `pause`.
- `.goal/INBOX.md`: the owner's notes. Act on new ones and record that you did in `tree.yaml` `handled:`.

On the `agent` branch (yours):
- `.goal/tree.yaml`: the search tree, criteria, now-line, questions.
- `.goal/LOG.md`: one line per step, newest first.
- `.goal/ATTEST.md`: written only when the goal is proven met.
- `.goal/archive/<date>-<slug>/`: finished goals.
- All code. `agent` holds only proven work and always passes the tests.
  Each approach lives on its own branch `try/<node-id>-<slug>`, cut from `agent`.

## One run = one step

1. **Sync.** Fetch `main`, `agent` and `try/*`. If `agent` doesn't exist,
   create it from `origin/seed2tree` (falling back to `main`).
2. **Stop checks.** If CONTROL is `pause`, exit and don't start another run.
   If `tree.yaml` says `goal_state: met` and GOAL.md is unchanged
   (`goal_hash` = sha1 of GOAL.md), exit and don't start another run.
3. **New goal?** If `goal_hash` differs or there is no tree: move the old
   `.goal/tree.yaml`, `LOG.md` and `ATTEST.md` to `.goal/archive/`. Start a new tree:
   a root (the goal), the criteria copied from GOAL.md (all `open`), and
   2–4 genuinely different approaches as children. A quick look at the code
   is part of this step. Then continue to step 5.
4. **Lock.** If `lock.until` is in the future, exit. Don't start another
   run; the one holding the lock will. Otherwise set
   `lock: {by: <run>, until: now+90min}` and push `agent` right away.
5. **Pick one node** (an open step of some approach):
   - Default: continue the approach with the best evidence so far
     (exploit), at its next step.
   - Explore: if that approach made no progress for 2 steps, or another
     approach has never been tried, pick the best untried alternative.
   - Before claiming the goal is met, the next node is always a
     `verify` (see below).
6. **Do the step** (about 30–45 minutes of real work) on that approach's
   branch: build, measure, fix. Run the tests (`npm test`, `npm run
   typecheck`, and any e2e the step touches). Commit and push the branch.
7. **Update the tree.** Give the node a `result:` of at most 20 plain
   words. Then do one of these:
   - add the next step as a child;
   - mark the approach `proven` and merge its branch into `agent`
     (tests green on `agent` after the merge), then update `criteria`
     with the evidence;
   - `prune` it, with a one-line reason;
   - branch it into 2 or 3 variants when there's a real fork.
   Keep at most 12 open nodes. Prune the weakest if you're over.
8. **Verify before done.** When every criterion looks met on `agent`, add
   a `verify` node. Run it as a skeptic, from a fresh checkout of `agent`:
   re-run every check in GOAL.md yourself, and try to break it. All
   criteria pass: write ATTEST.md (each criterion, the evidence, and how
   to see it yourself), write REVIEW.md (below), and set `goal_state: met`. Anything fails: reopen
   that criterion and add nodes.
9. **Report.** Set `now:` to one plain sentence for the owner's dashboard
   (what you're working on, no jargon). Prepend one line to LOG.md:
   `<ISO time> | <node title> | <result in 20 words max>`.
   Release the lock, commit, and push `agent`.
10. **Next run.** Unless CONTROL is `pause`, the goal is `met`, or every
    open node is blocked on the owner, start the next run now by firing
    this scheduled task (its id is in your prompt). Exactly one fire per
    run.

## REVIEW.md (written when the goal is met; the owner reads it first)
A short, plain brief shown on his dashboard. No ids, file paths in prose,
commit hashes or jargon. Sections, in order:
- `# <goal in a few words>`, then one line: **Met.**, how many steps,
  and how long it took.
- `## Watch it`: one line per gesture or feature, each followed by its
  GIF, image or video as `![name](path/in/repo)`. Media must be committed
  on `agent`, with GIFs under about 1 MB each. Film every user-visible
  result: this is how he judges the work.
- `## How it did`: a table with one row per check, giving the result in
  plain words.
- `## What's new for you`: 2–4 bullets on what he can do now.
- `## How it got there`: approaches kept and cut, one line each, with the reason.
- `## Worth knowing`: honest limits, untested areas, and anything that
  differs from what he asked for. Always say whether the work is merged to main.
- `## Ideas for the next goal`: 2–4 bullets.

## Questions for the owner
Add them to `tree.yaml` `asks:` as one plain sentence each, answerable in
one reply. Keep working on anything not blocked by them. Only ask when it
really is his call: spending past the budget, publishing, or a product
choice the goal doesn't settle.

## Never
- Commit to `main` or force-push anything.
- Publish, deploy, or contact anyone.
- Spend past the budget in GOAL.md.
- Claim a criterion is met without evidence you just re-ran.
- Make busywork. If nothing advances the goal, say so in `now:` and stop.

## tree.yaml shape
```yaml
goal_hash: <sha1 of GOAL.md>
goal_state: working        # working | met | blocked
now: "Making a scribble hide its target the instant the pen lifts."
lock: null
asks: []                   # plain questions for the owner
handled: []                # INBOX lines you've acted on
criteria:
  - {id: c1, text: "...", state: open, evidence: null}   # open | met
nodes:
  - {id: n0, parent: null, kind: goal, title: "...", status: open}
  - {id: n1, parent: n0, kind: approach, title: "...", status: open,
     branch: try/n1-..., result: null}
  # kind: goal | approach | step | verify
  # status: open | active | proven | pruned | done | blocked
```
