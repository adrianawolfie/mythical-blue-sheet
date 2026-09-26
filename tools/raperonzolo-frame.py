"""Draws the Raperonzolo theme's Art Nouveau sheet frame.

Two ribbons weave along each side, crossing the sheet's edge, and sweep into
knotted loops that break out past the corners. Rampion bellflowers
(Campanula rapunculus, "raperonzolo") grow over the top-right and
bottom-left corners: open five-pointed star flowers and nodding bells on
slender stems with narrow leaves.

The 600x600 SVG is a 9-slice border image with 200-unit corners, used in
public/css/theme-styles.css. The sheet's edge is the thin rule at 60 units,
so everything outside it overlaps the page around the sheet.

Usage: python3 tools/raperonzolo-frame.py public/assets/themes/raperonzolo
Writes frame.svg (daylight) and frame-moonlight.svg.
"""
import math
import re
import sys

S, C = 600, 200          # image size, corner slice
EDGE = 60                # the sheet's edge, as a thin rule
RIBBON_W = 9


def pal(mode):
    if mode == 'day':
        return dict(outline='#6b4c96', fill='#e6d9f4', line='#8e6fb3',
                    petal='#b595ea', petal_edge='#7550b4', throat='#f3ecfd', vein='#8763c6',
                    stigma='#ffffff', stem='#5b8752', leaf='#7ca56f', leaf_edge='#4a7043', sepal='#6f9a63')
    return dict(outline='#cbb8ef', fill='#22305c', line='#b6a3e0',
                petal='#c3a6f2', petal_edge='#8f70cf', throat='#f4eefd', vein='#9b7dd8',
                stigma='#ffffff', stem='#8fbb86', leaf='#84b279', leaf_edge='#5b8753', sepal='#8fbb86')


# ── Ribbons ────────────────────────────────────────────────────────────────

def wave(sign, x0=C, x1=S - C, step=4):
    pts = []
    x = x0
    while x <= x1 + 0.01:
        th = 2 * math.pi * (x - C) / (S - 2 * C)
        pts.append((x, EDGE + sign * 16 * math.cos(th)))
        x += step
    return 'M' + ' L'.join(f'{x:.1f} {y:.2f}' for x, y in pts)


def sym(start, segs):
    """A path from `start` to a point on the diagonal, continued by its mirror image (x<->y)."""
    d = f'M{start[0]} {start[1]}' + ''.join(f' C{a[0]} {a[1]} {b[0]} {b[1]} {c[0]} {c[1]}' for a, b, c in segs)
    m = [(y, x) for (x, y) in [start] + [q for sg in segs for q in sg]]
    rev = m[::-1]
    for i in range(1, len(rev), 3):
        d += f' C{rev[i][0]} {rev[i][1]} {rev[i+1][0]} {rev[i+1][1]} {rev[i+2][0]} {rev[i+2][1]}'
    return d


def swap(d):
    toks = re.findall(r'[MCLZ]|-?\d+\.?\d*', d)
    out, nums = [], []
    for t in toks:
        if t in 'MCLZ':
            out.append(t)
        else:
            nums.append(t)
            if len(nums) == 2:
                out.append(f'{nums[1]} {nums[0]}')
                nums = []
    return ' '.join(out)


def sample(d, step=0.01):
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


def crossings(pa, pb, same):
    hits = []
    for i in range(len(pa) - 1):
        for j in range((i + 8) if same else 0, len(pb) - 1):
            (x1, y1), (x2, y2) = pa[i], pa[i + 1]
            (x3, y3), (x4, y4) = pb[j], pb[j + 1]
            den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            if abs(den) < 1e-9:
                continue
            t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
            u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den
            if 0 <= t <= 1 and 0 <= u <= 1:
                hits.append((i, j))
    return hits


def piece(pts, idx, half=14):
    a = b = idx
    dist = 0
    while a > 0 and dist < half:
        dist += math.dist(pts[a], pts[a - 1])
        a -= 1
    dist = 0
    while b < len(pts) - 1 and dist < half:
        dist += math.dist(pts[b], pts[b + 1])
        b += 1
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts[a:b + 1])


def weave(d):
    """Short pieces to redraw on top where a path crosses itself, alternating over and under."""
    pts = sample(d)
    hits = crossings(pts, pts, True)
    visits = sorted([(i, k) for k, (i, j) in enumerate(hits)] + [(j, k) for k, (i, j) in enumerate(hits)])
    return [piece(pts, idx) for n, (idx, k) in enumerate(visits) if n % 2 == 0]


def side_pieces():
    """Ribbons for the top-left corner and top edge; 'over' pieces are drawn last."""
    base, over = [], []
    # Top edge: two ribbons weaving across the sheet's edge.
    base += [wave(+1), wave(-1)]
    over += [wave(+1, 236, 264, 2), wave(-1, 336, 364, 2)]
    # Outer ribbon: sweeps out past the corner into a pointed swell.
    outer = sym((200, 44), [((142, 44), (60, 2), (22, 22))])
    # Inner ribbon: dives into the sheet in a loop on each side and meets at the corner.
    inner = sym((200, 76), [((134, 76), (118, 152), (158, 152)), ((194, 152), (190, 108), (152, 104)),
                            ((124, 101), (100, 62), (82, 82))])
    # A whiplash curl breaking outward over the edge on each side.
    curl = 'M176 44 C 176 18 158 4 138 8 C 120 12 124 32 140 30'
    base += [outer, inner, curl, swap(curl)]
    over += weave(inner)
    # The outer swell passes over the inner loops where they meet.
    po, pi = sample(outer), sample(inner)
    over += [piece(po, i) for i, j in crossings(po, pi, False)]
    return base, over


def rules(p):
    """The sheet's edge: a thin double rule the ribbons weave across."""
    return (f'<rect x="{EDGE - 3}" y="{EDGE - 3}" width="{S - 2 * EDGE + 6}" height="{S - 2 * EDGE + 6}" fill="none" stroke="{p["line"]}" stroke-width="1.5"/>'
            f'<rect x="{EDGE + 4}" y="{EDGE + 4}" width="{S - 2 * EDGE - 8}" height="{S - 2 * EDGE - 8}" fill="none" stroke="{p["line"]}" stroke-width=".8" opacity=".8"/>')


# ── Rampion bellflowers ────────────────────────────────────────────────────

def star_flower(x, y, r, rot, p):
    """Open flower seen from the front: five broad pointed lobes, pale throat, white three-part stigma."""
    pts = []
    for i in range(5):
        a = math.radians(rot + i * 72 - 90)
        v = math.radians(rot + i * 72 - 90 + 36)
        pts.append(((math.cos(a) * r, math.sin(a) * r), (math.cos(v) * r * .5, math.sin(v) * r * .5), a, v))
    d = ''
    for i, (tip, valley, a, v) in enumerate(pts):
        prev_valley = pts[i - 1][1]
        c1 = (math.cos(a - .32) * r * .78, math.sin(a - .32) * r * .78)
        c2 = (math.cos(a + .32) * r * .78, math.sin(a + .32) * r * .78)
        if i == 0:
            d += f'M{prev_valley[0]:.1f} {prev_valley[1]:.1f}'
        d += f' Q{c1[0]:.1f} {c1[1]:.1f} {tip[0]:.1f} {tip[1]:.1f} Q{c2[0]:.1f} {c2[1]:.1f} {valley[0]:.1f} {valley[1]:.1f}'
    veins = ''.join(f'<path d="M0 0 L{math.cos(a) * r * .72:.1f} {math.sin(a) * r * .72:.1f}" stroke="{p["vein"]}" stroke-width=".9" stroke-linecap="round" opacity=".8"/>' for _, _, a, _ in pts)
    stigma = ''.join(f'<path d="M0 0 q{math.cos(math.radians(rot + k * 120)) * r * .2:.1f} {math.sin(math.radians(rot + k * 120)) * r * .2:.1f} {math.cos(math.radians(rot + k * 120 + 40)) * r * .28:.1f} {math.sin(math.radians(rot + k * 120 + 40)) * r * .28:.1f}" fill="none" stroke="{p["stigma"]}" stroke-width="1.3" stroke-linecap="round"/>' for k in range(3))
    return (f'<g transform="translate({x} {y})">'
            f'<path d="{d} Z" fill="{p["petal"]}" stroke="{p["petal_edge"]}" stroke-width="1.2" stroke-linejoin="round"/>'
            f'<circle r="{r * .36:.1f}" fill="{p["throat"]}" opacity=".9"/>{veins}'
            f'<path d="M0 0 L0 {-r * .22:.1f}" stroke="{p["stigma"]}" stroke-width="1.6" stroke-linecap="round"/>{stigma}</g>')


def bell(x, y, s, rot, p):
    """Nodding flower seen from the side: a funnel opening into three visible pointed lobes, with a green calyx."""
    body = ('M-2.5 0 C -8 -3 -11 -12 -11.5 -21 Q -14 -26 -18 -29 Q -11 -28.5 -6 -27 Q -3 -31 0 -35 '
            'Q 3 -31 6 -27 Q 11 -28.5 18 -29 Q 14 -26 11.5 -21 C 11 -12 8 -3 2.5 0 Z')
    veins = ('M0 -2 Q -8 -12 -13 -26 M0 -2 L0 -31 M0 -2 Q 8 -12 13 -26')
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">'
            f'<path d="{body}" fill="{p["petal"]}" stroke="{p["petal_edge"]}" stroke-width="1.2" stroke-linejoin="round"/>'
            f'<path d="{veins}" stroke="{p["vein"]}" stroke-width=".8" stroke-linecap="round" opacity=".75"/>'
            f'<path d="M0 1 L-6 -9 M0 1 L6 -9 M0 1 L0 -8" stroke="{p["sepal"]}" stroke-width="1.3" stroke-linecap="round"/>'
            f'<path d="M0 0 L0 6" stroke="{p["stem"]}" stroke-width="1.4" stroke-linecap="round"/></g>')


def leaf(x, y, rot, length, p, bend=.15):
    """Narrow lance-shaped leaf, pointed at both ends and slightly curved."""
    w = length * .24
    L = length
    d = (f'M0 0 C {w} {-L * .25:.1f} {w * (1 + bend):.1f} {-L * .7:.1f} {w * bend * 3:.1f} {-L} '
         f'C {-w * (1 - bend):.1f} {-L * .7:.1f} {-w} {-L * .25:.1f} 0 0 Z')
    return (f'<g transform="translate({x} {y}) rotate({rot})">'
            f'<path d="{d}" fill="{p["leaf"]}" stroke="{p["leaf_edge"]}" stroke-width="1" stroke-linejoin="round"/>'
            f'<path d="M0 -2 Q {w * .4:.1f} {-L * .5:.1f} {w * bend * 3:.1f} {-L + 3}" fill="none" stroke="{p["leaf_edge"]}" stroke-width=".7"/></g>')


def spray(p):
    """A rampion raceme arching over the top-right corner (x 400-600, y 0-200)."""
    stem = p['stem']
    out = []
    stems = [('M566 198 C 562 142 542 98 508 68 C 482 45 456 34 430 32', 2.6),
             ('M538 108 C 520 110 504 120 490 136', 1.6),
             ('M556 150 C 568 144 576 136 580 124', 1.6),
             ('M508 68 C 512 50 522 36 536 26', 1.6),
             ('M472 44 C 466 58 452 66 436 68', 1.4)]
    for d, w in stems:
        out.append(f'<path d="{d}" fill="none" stroke="{stem}" stroke-width="{w}" stroke-linecap="round"/>')
    out.append(leaf(566, 194, -16, 58, p) + leaf(561, 170, 34, 44, p, -.2) + leaf(532, 92, -62, 38, p)
               + leaf(486, 52, 60, 30, p, -.2) + leaf(548, 130, -110, 28, p))
    out.append(bell(490, 136, 1.1, 205, p) + bell(580, 124, .85, 175, p) + bell(436, 68, .85, 240, p))
    out.append(star_flower(430, 32, 27, 8, p))
    out.append(star_flower(536, 26, 21, -20, p))
    out.append(star_flower(514, 98, 17, 30, p))
    return ''.join(out)


def svg(mode):
    p = pal(mode)
    base, over = side_pieces()
    w = RIBBON_W

    def strokes(ds, colour, width, cap='round'):
        return ''.join(f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}" stroke-linecap="{cap}" stroke-linejoin="round"/>' for d in ds)

    defs = (f'<defs><g id="outline">{strokes(base, p["outline"], w)}</g>'
            f'<g id="fill">{strokes(base, p["fill"], w - 3.6)}</g>'
            f'<g id="over">{strokes(over, p["outline"], w, "butt")}{strokes(over, p["fill"], w - 3.6, "butt")}</g></defs>')
    body = [defs, rules(p)]
    # Outlines of every side first, then fills, so pieces join without seams; crossings last.
    for layer in ('outline', 'fill', 'over'):
        for r in (0, 90, 180, 270):
            body.append(f'<use href="#{layer}" transform="rotate({r} 300 300)"/>')
    body.append(f'<g id="spray">{spray(p)}</g>')
    body.append('<use href="#spray" transform="rotate(180 300 300)"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">{"".join(body)}</svg>\n'


if __name__ == '__main__':
    out = sys.argv[1]
    open(f'{out}/frame.svg', 'w').write(svg('day'))
    open(f'{out}/frame-moonlight.svg', 'w').write(svg('night'))
