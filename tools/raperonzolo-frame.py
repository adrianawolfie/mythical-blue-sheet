"""Draws the Raperonzolo theme's Art Nouveau sheet frame.

Interlaced ribbons weave along each side and loop into the corners, with
rampion bellflower (Campanula rapunculus, "raperonzolo") sprays in two
opposite corners. The 600x600 SVG is used as a 9-slice border image
(180-unit corners) in public/css/theme-styles.css.

Usage: python3 tools/raperonzolo-frame.py public/assets/themes/raperonzolo
Writes frame.svg (daylight) and frame-moonlight.svg.
"""
import math, sys
# 600x600 frame for a 9-slice border-image: 180-unit corners, 240-unit edge tiles.
S, C = 600, 180

def pal(mode):
    if mode == 'day':
        return dict(outline='#6b4c96', fill='#e3d5f2', line='#8e6fb3', petal='#bf9fec', petal_edge='#7e57bd',
                    vein='#9a78d0', centre='#f6f0fd', stamen='#ffffff', stem='#5f8a57', leaf='#7ea572', leaf_edge='#4f7449', bud='#a987dc')
    return dict(outline='#cbb8ef', fill='#23305e', line='#b6a3e0', petal='#c9b0f2', petal_edge='#9d80d6',
                vein='#b49ae6', centre='#f3edfd', stamen='#ffffff', stem='#8fbb86', leaf='#86b37b', leaf_edge='#5e8a56', bud='#b99be6')

RIBBON_W = 8.5

def wave(sign, x0=C, x1=S - C, step=4):
    pts = []
    x = x0
    while x <= x1 + 0.01:
        th = 2 * math.pi * (x - C) / (S - 2 * C)
        pts.append((x, 60 + sign * 14 * math.cos(th)))
        x += step
    return 'M' + ' L'.join(f'{x:.1f} {y:.2f}' for x, y in pts)

def sym(start, segs):
    # A path from `start` to a point on the diagonal, continued by its mirror image (x<->y).
    d = f'M{start[0]} {start[1]}' + ''.join(f' C{a[0]} {a[1]} {b[0]} {b[1]} {c[0]} {c[1]}' for a, b, c in segs)
    m = [(y, x) for (x, y) in [start] + [q for sg in segs for q in sg]]
    rev = m[::-1]
    for i in range(1, len(rev), 3):
        d += f' C{rev[i][0]} {rev[i][1]} {rev[i+1][0]} {rev[i+1][1]} {rev[i+2][0]} {rev[i+2][1]}'
    return d

def swap(d):
    import re
    toks = re.findall(r'[MCLZ]|-?\d+\.?\d*', d)
    out, nums = [], []
    for t in toks:
        if t in 'MCLZ':
            out.append(t)
        else:
            nums.append(t)
            if len(nums) == 2:
                out.append(f'{nums[1]} {nums[0]}'); nums = []
    return ' '.join(out)

def side_pieces():
    """Ribbon paths for the top-left corner and top edge. 'over' pieces are
    redrawn on top so ribbons weave over and under each other."""
    base, over = [], []
    # Top edge: two ribbons weaving; A over B at x=240, B over A at x=360.
    base += [wave(+1), wave(-1)]
    over += [wave(+1, 212, 268, 2), wave(-1, 332, 388, 2)]
    # Outer ribbon B swells into a point at the corner.
    base.append(sym((180, 46), [((120, 46), (58, 16), (36, 36))]))
    # Inner ribbon A dives inward into a loop on each side before meeting at the corner.
    A = sym((180, 74), [((118, 74), (104, 136), (138, 136)), ((168, 136), (166, 96), (134, 92)), ((110, 89), (88, 54), (70, 70))])
    base.append(A)
    over += weave(A)
    return base, over

def sample(d, step=0.01):
    """Points along a path of M/C commands (cubic Beziers only)."""
    import re
    nums = [float(v) for v in re.findall(r'-?\d+\.?\d*', d)]
    x0, y0 = nums[0], nums[1]
    pts = [(x0, y0)]
    i = 2
    while i < len(nums):
        c1x, c1y, c2x, c2y, x, y = nums[i:i + 6]
        t = step
        while t <= 1.0001:
            mt = 1 - t
            pts.append((mt**3 * x0 + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t**3 * x,
                        mt**3 * y0 + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t**3 * y))
            t += step
        x0, y0 = x, y
        i += 6
    return pts

def weave(d, half=13):
    """Finds where a path crosses itself and returns short pieces to redraw on
    top, alternating over and under along the path."""
    pts = sample(d)
    hits = []
    for i in range(len(pts) - 1):
        for j in range(i + 8, len(pts) - 1):
            (x1, y1), (x2, y2) = pts[i], pts[i + 1]
            (x3, y3), (x4, y4) = pts[j], pts[j + 1]
            den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            if abs(den) < 1e-9:
                continue
            t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
            u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den
            if 0 <= t <= 1 and 0 <= u <= 1:
                hits.append((i, j))
    visits = sorted([(i, k, 0) for k, (i, j) in enumerate(hits)] + [(j, k, 1) for k, (i, j) in enumerate(hits)])
    pieces = []
    for n, (idx, k, _) in enumerate(visits):
        if n % 2:  # every other visit goes over
            continue
        # walk ~half units of arc length either side of the crossing
        a = b = idx
        dist = 0
        while a > 0 and dist < half:
            dist += math.dist(pts[a], pts[a - 1]); a -= 1
        dist = 0
        while b < len(pts) - 1 and dist < half:
            dist += math.dist(pts[b], pts[b + 1]); b += 1
        pieces.append('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts[a:b + 1]))
    return pieces

def lines(p):
    # thin double rule around the edge
    return (f'<rect x="20" y="20" width="560" height="560" rx="6" fill="none" stroke="{p["line"]}" stroke-width="1.6"/>'
            f'<rect x="27" y="27" width="546" height="546" rx="4" fill="none" stroke="{p["line"]}" stroke-width=".8" opacity=".8"/>')

def petal_path(r):
    return f'M0 0 C {r*0.28:.1f} {-r*0.3:.1f}, {r*0.3:.1f} {-r*0.72:.1f}, 0 {-r} C {-r*0.3:.1f} {-r*0.72:.1f}, {-r*0.28:.1f} {-r*0.3:.1f}, 0 0 Z'

def bellflower(x, y, r, rot, p, squash=1.0):
    # Campanula / rampion: five pointed petals in a star, pale throat, white stamens.
    parts = [f'<g transform="translate({x} {y}) rotate({rot}) scale(1 {squash})">']
    for i in range(5):
        parts.append(f'<path d="{petal_path(r)}" transform="rotate({i*72})" fill="{p["petal"]}" stroke="{p["petal_edge"]}" stroke-width="1.1" stroke-linejoin="round"/>')
        parts.append(f'<path d="M0 {-r*0.18:.1f} L0 {-r*0.72:.1f}" transform="rotate({i*72})" stroke="{p["vein"]}" stroke-width=".8" stroke-linecap="round"/>')
    parts.append(f'<circle r="{r*0.3:.1f}" fill="{p["centre"]}"/>')
    for i in range(3):
        parts.append(f'<path d="M0 0 L0 {-r*0.34:.1f}" transform="rotate({i*120+20})" stroke="{p["stamen"]}" stroke-width="1.2" stroke-linecap="round"/>')
    parts.append(f'<circle r="{r*0.09:.1f}" fill="{p["petal_edge"]}"/>')
    parts.append('</g>')
    return ''.join(parts)

def bud(x, y, rot, p, s=1.0):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">'
            f'<path d="M0 0 C 4 -4 5 -12 0 -18 C -5 -12 -4 -4 0 0 Z" fill="{p["bud"]}" stroke="{p["petal_edge"]}" stroke-width="1"/>'
            f'<path d="M0 0 L-4 -6 M0 0 L4 -6 M0 0 L0 -7" stroke="{p["stem"]}" stroke-width="1.1" stroke-linecap="round"/></g>')

def leaf(x, y, rot, p, s=1.0):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">'
            f'<path d="M0 0 C 5 -8 5 -20 0 -30 C -5 -20 -5 -8 0 0 Z" fill="{p["leaf"]}" stroke="{p["leaf_edge"]}" stroke-width="1"/>'
            f'<path d="M0 -2 L0 -26" stroke="{p["leaf_edge"]}" stroke-width=".7"/></g>')

def spray(p):
    # Bellflower (rampion) spray for the top-right corner (x 420-600, y 0-180).
    stem = p['stem']
    s = []
    for d, w in [('M584 172 C 578 124 554 86 516 60 C 494 45 470 36 446 38', 2.3),
                 ('M552 94 C 532 98 514 112 500 130', 1.6),
                 ('M570 128 C 584 118 592 100 594 84', 1.5),
                 ('M516 60 C 518 42 526 28 538 20', 1.5),
                 ('M486 44 C 478 58 464 66 450 68', 1.3)]:
        s.append(f'<path d="{d}" fill="none" stroke="{stem}" stroke-width="{w}" stroke-linecap="round"/>')
    s.append(leaf(578, 146, -28, p, .95) + leaf(566, 112, 42, p, .8) + leaf(532, 74, -72, p, .75) + leaf(486, 42, 64, p, .62) + leaf(506, 118, -120, p, .6))
    s.append(bud(594, 84, 22, p, .95) + bud(538, 20, 32, p, .85) + bud(450, 68, -110, p, .75))
    s.append(bellflower(446, 38, 23, -18, p))
    s.append(bellflower(500, 132, 20, 14, p, .92))
    s.append(bellflower(550, 56, 17, 40, p))
    s.append(bellflower(592, 124, 12, 70, p, .85))
    return ''.join(s)

def svg(mode):
    p = pal(mode)
    base, over = side_pieces()
    w = RIBBON_W
    def strokes(ds, colour, width, cap='round'):
        return ''.join(f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}" stroke-linecap="{cap}" stroke-linejoin="round"/>' for d in ds)
    defs = (f'<defs><g id="outline">{strokes(base, p["outline"], w)}</g>'
            f'<g id="fill">{strokes(base, p["fill"], w - 3.6)}</g>'
            f'<g id="over">{strokes(over, p["outline"], w, "butt")}{strokes(over, p["fill"], w - 3.6, "butt")}</g></defs>')
    body = [defs, lines(p)]
    # Outlines of every side first, then fills, so pieces join without seams; crossings last.
    for layer in ('outline', 'fill', 'over'):
        for r in (0, 90, 180, 270):
            body.append(f'<use href="#{layer}" transform="rotate({r} 300 300)"/>')
    body.append(f'<g id="spray">{spray(p)}</g>')
    body.append('<use href="#spray" transform="rotate(180 300 300)"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">{"".join(body)}</svg>\n'

out = sys.argv[1]
open(f'{out}/frame.svg', 'w').write(svg('day'))
open(f'{out}/frame-moonlight.svg', 'w').write(svg('night'))
