"""Per-round likeness table from the latest saved side-by-side of each page (zero tokens).
  ls the newest *-cmp.png per page > latest.txt   (see SCORES.md for the list used)
  RESCORE_JSON=rescore.json node tests/rounds/rescore.mjs $(cat latest.txt)
  python3 tests/rounds/roundscores.py latest.txt rescore.json
Picture parts are the aligned (v3) colour and structure lifts just re-scored; layout is the
page's latest run digest (built/runs/<id>.json) when one exists, else the score is (colour+structure)/2.
"""
import json, os, re, sys
files = open(sys.argv[1]).read().split(); rows = json.load(open(sys.argv[2]))
out = {}
for f, r in zip(files, rows):
    rd = int(re.search(r'round(\d+)', f).group(1))
    base = re.match(r'([ce]\d-[a-z-]+?)(-(v\d|auto\d?|n\d+.*|live|first|fix|fixed|run\d))?$', r['id']).group(1)
    c, s = r['aligned']['colour'], r['aligned']['structure']
    j = f'tests/rounds/round{rd}/built/runs/{base}.json'
    lay = json.load(open(j))['likeness'].get('layout') if os.path.exists(j) else None
    ov = 0.35 * c + 0.35 * s + 0.3 * lay if lay is not None else (c + s) / 2
    out.setdefault(rd, []).append((base, r['id'], c, s, lay, ov))
p = lambda x: '-' if x is None else f'{round(100 * x)}'
for rd in sorted(out):
    xs = out[rd]
    print(f'\n## Round {rd}: {round(100 * sum(x[5] for x in xs) / len(xs))}% average, {len(xs)} of 10 pages built\n')
    print('| page | side-by-side | colour | structure | layout | likeness |\n|---|---|---|---|---|---|')
    for b, i, c, s, l, o in xs:
        print(f'| {b} | round{rd}/built/{i}-cmp.png | {p(c)} | {p(s)} | {p(l)} | **{p(o)}** |')
print('\nround_scores:', [round(100 * sum(x[5] for x in out[k]) / len(out[k])) for k in sorted(out)])
