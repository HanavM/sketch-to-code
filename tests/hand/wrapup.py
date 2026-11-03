#!/usr/bin/env python3
"""The goal's records, generated (no tokens): every number per page and per round, the side-by-sides, and the list of
missing features with a demo for each thing built.

  python3 tests/hand/wrapup.py <tree.yaml>     # writes docs/goal/ROUNDS.md, SIDE-BY-SIDE.md, FEATURES.md, demos/

Numbers the tree holds win; a page's digest.json (matched on round, page and score) adds what the tree does not hold.
A dash means that run predates the field or no digest matches. Nothing is estimated.
"""
import glob, json, os, re, statistics as st, sys, yaml
sys.path.insert(0, os.path.dirname(__file__))
from filmpage import film

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'docs/goal')
tree = yaml.safe_load(open(sys.argv[1]))
os.makedirs(os.path.join(OUT, 'demos'), exist_ok=True)
rel = lambda p: os.path.relpath(p, OUT)

digests = {}
for p in glob.glob(os.path.join(ROOT, 'tests/hand/out-*/**/digest.json'), recursive=True):
    try: d = json.load(open(p))
    except Exception: continue
    node = re.search(r'out-n(\d+)', p)
    digests.setdefault((d.get('round'), d.get('id')), []).append((int(node[1]) if node else 0, os.path.dirname(p), d))


def match(round_, pid, like):
    rows = sorted(digests.get((round_, pid), []), key=lambda r: r[0])
    if not rows: return None
    near = [r for r in rows if r[2].get('likeness') is not None and like is not None and abs(r[2]['likeness'] - like) < 0.16]
    return near[-1] if near else None


def f(x, nd=0, suffix=''):
    if x is None: return '–'
    return f'{x:,.{nd}f}{suffix}' if isinstance(x, (int, float)) else str(x)


def row(round_, p):
    pid = p['page'].split(' ', 1)[-1]
    m = match(round_, pid, p.get('likeness'))
    d = m[2] if m else {}
    t = d.get('time') or {}
    s = d.get('strokes') or {}
    pct = lambda k: round(d[k] * 100) if d.get(k) is not None else None
    build = p.get('build_s') if p.get('build_s') is not None else (sum(t['buildS']) if t.get('buildS') else None)
    return {
        'pid': pid, 'like': p.get('likeness'), 'c': pct('colour'), 's': pct('structure'), 'l': pct('layout'),
        'strokes': p.get('strokes'), 'pts': s.get('pointsPerStroke'), 'simple': round(s['simpleShare'] * 100) if s.get('simpleShare') is not None else None,
        'ink': s.get('inkPx'), 'erased': d.get('erased'), 'words': p.get('words'), 'notes': p.get('notes', d.get('notes')),
        'longest': d.get('longestNote'), 'fixes': p.get('fixes', d.get('corrections')), 'sketch': t.get('sketchingS'),
        'read': p.get('first_read_s', t.get('firstReadingS')), 'build': build,
        'mins': p.get('minutes', round(t['firstStrokeToDoneS'] / 60, 1) if t.get('firstStrokeToDoneS') else None),
        'tokens': p.get('tokens', (d.get('tokens') or {}).get('billed')), 'dir': m[1] if m else None,
    }


rounds = {}
if tree.get('baseline_pages'): rounds[0] = tree['baseline_pages']
for k, v in tree.items():
    g = re.fullmatch(r'round(\d+)_pages', k)
    if g and isinstance(v, list): rounds[int(g[1])] = v
# A page the tree keeps no row for: the digests are the record. A round's own run is the page's first sketch, the
# lowest step; later steps are replays of a fix and would flatter the round.
for r in range(31, (tree.get('round') or 0) + 1):
    listed = {p['page'].split(' ', 1)[-1] for p in rounds.get(r, [])}
    for (rn, pid), rows in digests.items():
        if rn == r and pid not in listed and pid:
            _, _, d = min(rows, key=lambda x: x[0])
            t = d.get('time') or {}
            rounds.setdefault(r, []).append({'page': f'r{r} {pid}', 'likeness': d.get('likeness'), 'strokes': (d.get('strokes') or {}).get('count'), 'words': d.get('words')})
    if r in rounds: rounds[r].sort(key=lambda p: p['page'])

HEAD = '| page | likeness | colour | structure | layout | strokes | pts/stroke | simple | ink px | erased | words | notes | longest | fixes | sketch s | first read s | build s | minutes | tokens | picture |\n' + '|' + '---|' * 20
med = lambda xs: (lambda v: st.median(v) if v else None)([x for x in xs if x is not None])
rollup, pages_md, have = [], [], {'pages': 0, 'digest': 0}
for r in sorted(rounds):
    rows = [row(r, p) for p in rounds[r]]
    likes = [x['like'] for x in rows if x['like'] is not None]
    mean = sum(likes) / len(likes) if likes else None
    rollup.append(f"| {r or 'baseline'} | {len(rows)} | {f(mean, 1)} | {f(med([x['strokes'] for x in rows]), 1)} | {f(med([x['words'] for x in rows]), 1)} | {f(med([x['mins'] for x in rows]), 1)} | {f(med([x['read'] for x in rows]))} | {f(med([x['build'] for x in rows]))} | {f(med([x['fixes'] for x in rows]), 1)} | {f(med([x['tokens'] for x in rows]))} |")
    pages_md += [f"\n### {'Baseline' if r == 0 else f'Round {r}'}\n", HEAD]
    for x in rows:
        have['pages'] += 1; have['digest'] += bool(x['dir'])
        pic = f"[side by side]({rel(os.path.join(x['dir'], 'side-by-side.png'))})" if x['dir'] and os.path.exists(os.path.join(x['dir'], 'side-by-side.png')) else '–'
        pages_md.append('| ' + ' | '.join([x['pid'], f(x['like'], 1), f(x['c']), f(x['s']), f(x['l']), f(x['strokes']), f(x['pts'], 1), f(x['simple'], 0, '%'), f(x['ink']), f(x['erased']), f(x['words']), f(x['notes']), f(x['longest']), f(x['fixes']), f(x['sketch']), f(x['read']), f(x['build']), f(x['mins'], 1), f(x['tokens']), pic]) + ' |')
open(os.path.join(OUT, 'ROUNDS.md'), 'w').write(
    '# Every number, per round and per page\n\nGenerated by `tests/hand/wrapup.py` from the search tree and each page\'s recorded session. '
    f"{have['digest']} of {have['pages']} pages match a recorded session by score; the rest have the tree's numbers only, and a dash where nothing was recorded.\n\n"
    '## Per round\n\n| round | pages | mean likeness | median strokes | median words | median minutes | median first read s | median build s | median fixes | median tokens |\n|---|---|---|---|---|---|---|---|---|---|\n'
    + '\n'.join(rollup) + '\n\n## Per page\n' + '\n'.join(pages_md) + '\n')

# Side-by-sides: the rounds that meet the bar and the two re-sketches.
sb = ['# Target, sketch, result\n\nEach picture shows the target screenshot, the sketch as drawn, and what was built.\n']
for r in (45, 46):
    sb.append(f'\n## Round {r}\n')
    for p in rounds.get(r, []):
        x = row(r, p)
        sb.append(f"**{x['pid']}**: likeness {f(x['like'], 1)}, {f(x['strokes'])} strokes, {f(x['words'])} words, {f(x['fixes'])} fixes\n")
        pic = os.path.join(x['dir'], 'side-by-side.png') if x['dir'] else None
        sb.append(f'![{x["pid"]}]({rel(pic)})\n' if pic and os.path.exists(pic) else '(no recorded picture matches this score)\n')
for node, name in (('n266', 'First skeptic re-sketch'), ('n271', 'Second skeptic re-sketch')):
    sb.append(f'\n## {name}\n')
    for p in sorted(glob.glob(os.path.join(ROOT, f'tests/hand/out-{node}/**/digest.json'), recursive=True)):
        d = json.load(open(p)); pic = os.path.join(os.path.dirname(p), 'side-by-side.png')
        sb.append(f"**r{d['round']} {d['id']}**: likeness {d['likeness']}, {d['strokes']['count']} strokes, {d['words']} words, {d['corrections']} fixes\n")
        if os.path.exists(pic): sb.append(f"![{d['id']}]({rel(pic)})\n")
open(os.path.join(OUT, 'SIDE-BY-SIDE.md'), 'w').write('\n'.join(sb))

# Features: a demo for everything built. A demo filmed at the time wins; otherwise film that step's own recorded page.
def demo_for(entry):
    text = f"{entry.get('built')} {entry.get('helped')}"
    g = re.search(r'tests/hand/[^\s,;)]+\.gif', text)
    if g and os.path.exists(os.path.join(ROOT, g[0])): return os.path.join(ROOT, g[0])
    want = re.search(r'\b([ce]\d)\b', str(entry.get('found_on')))
    for n in re.findall(r'\bn(\d+)\b', str(entry.get('built'))):
        made = sorted(glob.glob(os.path.join(ROOT, f'tests/hand/out-n{n}*/**/*.gif'), recursive=True))
        if made: return made[0]
        out = os.path.join(OUT, 'demos', f'n{n}.gif')
        if os.path.exists(out): return out
        pages = [q for q in glob.glob(os.path.join(ROOT, f'tests/hand/out-n{n}/**/digest.json'), recursive=True) + glob.glob(os.path.join(ROOT, f'tests/hand/out-n{n}-*/**/digest.json'), recursive=True) if os.path.exists(os.path.join(os.path.dirname(q), 'final.png'))]
        if not pages: continue
        pages.sort(key=lambda q: (0 if want and f'/{want[1]}' in q else 1, q))
        try:
            film(os.path.dirname(pages[0]), out, f"n{n}: round {json.load(open(pages[0]))['round']} {json.load(open(pages[0]))['id']}")
            return out
        except Exception as e:
            print('film failed', n, e)
    return None

esc = lambda s: str(s).replace('|', '/').replace('\n', ' ')
built, open_ = [], []
for e in tree['missing_features']:
    if e.get('built') and 'not built' not in str(e['built']).lower(): built.append(e)
    else: open_.append(e)
rows, nodemo, nonum = [], 0, 0
for e in built:
    g = demo_for(e)
    nodemo += g is None
    nonum += not re.search(r'\d', str(e.get('helped')))
    rows.append(f"| {esc(e['gap'])} | {esc(e['found_on'])} | {esc(e['built'])} | {esc(e['helped'])} | {f'[watch]({rel(g)})' if g else '–'} |")
open(os.path.join(OUT, 'FEATURES.md'), 'w').write(
    f"# What testing found missing\n\n{len(tree['missing_features'])} gaps found by sketching. {len(built)} built, {len(open_)} not built. "
    f"{len(built) - nodemo} of the built ones have a demo; {len(built) - nonum} give a measured before/after.\n\n"
    "A demo filmed at the time is used where there is one. The others (under `demos/`) are made by `tests/hand/filmpage.py` from that step's recorded session: "
    "the real strokes and notes redrawn in order, then the saved screenshots. They show the page the step was tested on, not always the single feature on its own.\n\n"
    '## Built\n\n| gap found | found on | what was built | did it help | demo |\n|---|---|---|---|---|\n' + '\n'.join(rows) +
    '\n\n## Found, not built\n\n| gap found | found on | note |\n|---|---|---|\n' + '\n'.join(f"| {esc(e['gap'])} | {esc(e['found_on'])} | {esc(e.get('helped') or '')} |" for e in open_) + '\n')
print(json.dumps({'pages': have, 'rounds': sorted(rounds), 'features': len(tree['missing_features']), 'built': len(built), 'open': len(open_), 'nodemo': nodemo, 'nonum': nonum}))
