#!/usr/bin/env python3
"""Film one hand-sketched page as a short GIF, from what the live session recorded (no tokens, no rebuild).

  python3 tests/hand/filmpage.py <page dir holding digest.json> <out.gif> [--title "words"]

The strokes, pen colours and notes are the ones really drawn, in their real order, redrawn from the digest; the
reading, result and final pictures are the screenshots saved by that run; the last frame is the target screenshot.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

W, H, BAR = 480, 338, 22
SCALE = W / 1280
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def caption(img, text):
    out = Image.new('RGB', (W, H + BAR), '#1b1b22')
    out.paste(img, (0, 0))
    ImageDraw.Draw(out).text((6, H + 4), text[:78], fill='#f2f2f2', font=ImageFont.truetype(FONT, 11))
    return out


def still(path):
    im = Image.open(path).convert('RGB')
    im = im.crop((0, 0, im.width, min(im.height, int(im.width * H / W))))
    return im.resize((W, H), Image.LANCZOS)


def film(page, out, title=None):
    d = json.load(open(os.path.join(page, 'digest.json')))
    strokes = list(d.get('strokesDrawn') or [])
    notes = list(d.get('notesTyped') or [])
    first_run = next((e['at'] for e in d.get('events', []) if e['op'] == 'run'), float('inf'))
    pens = [(e['at'], e['color']) for e in d.get('events', []) if e['op'] == 'pen']
    def pen_at(t):
        c = '#222222'
        for at, col in pens:
            if at <= t: c = col
        return c
    items = [('s', s['at'], s) for s in strokes if s.get('at', 0) < first_run]
    items += [('n', n['at'], n) for n in notes if n.get('at', 0) < first_run]
    items.sort(key=lambda x: x[1])
    label = title or f"round {d['round']} {d['id']}"
    canvas = Image.new('RGB', (W, H), 'white')
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(FONT, 9)
    frames, times = [], []
    def add(img, text, ms):
        frames.append(caption(img, text)); times.append(ms)
    done_s = done_w = 0
    add(canvas.copy(), f'{label}: blank page', 400)
    for kind, at, it in items:
        if kind == 's':
            done_s += 1
            pts = [(x * SCALE, y * SCALE) for x, y in it['way']]
            if len(pts) == 1:
                x, y = pts[0]; draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=pen_at(at))
            else:
                draw.line(pts, fill=pen_at(at), width=2, joint='curve')
        else:
            done_w += len(str(it['text']).split())
            x, y = it['x'] * SCALE, it['y'] * SCALE
            box = draw.textbbox((x, y), it['text'], font=font)
            draw.rectangle(box, fill='#fff6c8')
            draw.text((x, y), it['text'], fill='#333333', font=font)
        add(canvas.copy(), f'drawing: {done_s} strokes, {done_w} words', 170)
    add(canvas.copy(), f'sketch done: {done_s} strokes, {done_w} words', 900)
    for name, text, ms in [('run1-reading.png', 'what the tool understood', 900), ('run1-result.png', 'first build', 1300)]:
        p = os.path.join(page, name)
        if os.path.exists(p): add(still(p), text, ms)
    p = os.path.join(page, 'final.png')
    fixes = d.get('corrections') or 0
    if os.path.exists(p): add(still(p), f"final: likeness {d.get('likeness')}, {fixes} fix{'es' if fixes != 1 else ''}", 1800)
    ref = os.path.join(ROOT, 'tests/rounds', f"round{d['round']}", 'ref', f"{d['id']}.png")
    if os.path.exists(ref): add(still(ref), 'target screenshot', 1500)
    pal = frames[-2 if len(frames) > 1 else -1].convert('P', palette=Image.ADAPTIVE, colors=128)
    conv = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
    conv[0].save(out, save_all=True, append_images=conv[1:], duration=times, loop=0, optimize=True, disposal=1)
    return os.path.getsize(out)


if __name__ == '__main__':
    args = sys.argv[1:]
    title = args[args.index('--title') + 1] if '--title' in args else None
    print(film(args[0], args[1], title))
