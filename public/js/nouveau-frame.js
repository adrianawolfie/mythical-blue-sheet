// Raperonzolo theme: an Art Nouveau frame of interlaced vines around the
// character sheet, with rampion bellflower sprays in two opposite corners.
// It is drawn as an inline SVG sized to the sheet, so the vines keep their
// shape at any sheet size; colours come from CSS variables in theme-styles.css.
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  // Smooth curve through waypoints (Catmull-Rom as cubic Beziers).
  function spline(pts, closed) {
    const n = pts.length, segs = [];
    const at = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      segs.push([p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
        [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2]);
    }
    return segs;
  }

  const f = v => Math.round(v * 10) / 10;
  const pathD = (segs, closed) => 'M' + f(segs[0][0][0]) + ' ' + f(segs[0][0][1]) +
    segs.map(s => ' C' + [s[1], s[2], s[3]].map(p => f(p[0]) + ' ' + f(p[1])).join(' ')).join('') + (closed ? 'Z' : '');

  function sample(segs, step) {
    const out = [];
    segs.forEach(([a, b, c, d]) => {
      const n = Math.max(2, Math.ceil(Math.hypot(d[0] - a[0], d[1] - a[1]) / step));
      for (let i = 0; i < n; i++) {
        const t = i / n, u = 1 - t;
        out.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
          u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]);
      }
    });
    return out;
  }

  function hit(p, q, r, s) {
    const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
    if (!d) return false;
    const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
    const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return t >= 0 && t < 1 && u >= 0 && u < 1;
  }

  // Every crossing between ribbons (and of a ribbon with itself), then an
  // alternating over/under along each ribbon so the vines weave.
  function weave(ribbons) {
    const found = [], N = 16;
    // bounding boxes of runs of N segments, to skip runs that are far apart
    const boxes = ribbons.map(r => {
      const out = [];
      for (let s = 0; s < r.pts.length - 1; s += N) {
        const run = r.pts.slice(s, s + N + 1);
        out.push([Math.min(...run.map(p => p[0])), Math.min(...run.map(p => p[1])), Math.max(...run.map(p => p[0])), Math.max(...run.map(p => p[1]))]);
      }
      return out;
    });
    const near = (i, x, j, y) => { const A = boxes[i][Math.floor(x / N)], B = boxes[j][Math.floor(y / N)]; return A[0] <= B[2] && B[0] <= A[2] && A[1] <= B[3] && B[1] <= A[3]; };
    ribbons.forEach((a, i) => ribbons.forEach((b, j) => {
      if (j < i) return;
      for (let x = 0; x < a.pts.length - 1; x++) {
        for (let y = (i === j ? x + 8 : 0); y < b.pts.length - 1; y++) {
          if (y % N === 0 || y === (i === j ? x + 8 : 0)) { if (!near(i, x, j, y)) { y = (Math.floor(y / N) + 1) * N - 1; continue; } }
          if (i === j && a.closed && x + a.pts.length - y < 8) continue;
          const p = a.pts[x], q = a.pts[x + 1], r = b.pts[y], t = b.pts[y + 1];
          if (hit(p, q, r, t)) {
            // shallow crossings need a longer over piece to cover the overlap
            const sin = Math.abs((q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0])) / (Math.hypot(q[0] - p[0], q[1] - p[1]) * Math.hypot(t[0] - r[0], t[1] - r[1]));
            found.push({ a: [i, x, sin], b: [j, y, sin] });
          }
        }
      }
    }));
    const over = [];
    const last = ribbons.map(() => false);
    const seen = new Set();
    ribbons.forEach((_, r) => {
      const mine = [];
      found.forEach((c, k) => { if (c.a[0] === r) mine.push([c.a[1], k, 'a']); if (c.b[0] === r) mine.push([c.b[1], k, 'b']); });
      mine.sort((m, n) => m[0] - n[0]).forEach(([, k, side]) => {
        const c = found[k];
        if (!seen.has(k)) {
          seen.add(k);
          c.over = last[r] ? (side === 'a' ? 'b' : 'a') : side;
        }
        last[r] = c.over === side;
      });
    });
    found.forEach(c => over.push(c[c.over]));
    return over;
  }

  function piece(pts, idx, half) {
    let a = idx, b = idx + 1, len = 0;
    while (a > 0 && len < half) { len += Math.hypot(pts[a][0] - pts[a - 1][0], pts[a][1] - pts[a - 1][1]); a--; }
    len = 0;
    while (b < pts.length - 1 && len < half) { len += Math.hypot(pts[b + 1][0] - pts[b][0], pts[b + 1][1] - pts[b][1]); b++; }
    return 'M' + pts.slice(a, b + 1).map(p => f(p[0]) + ' ' + f(p[1])).join(' L');
  }

  // Each closed vine runs along the top edge, round the top-right corner to
  // the middle of the right edge, back round the same corner mirrored, and
  // then the whole half again turned 180°.
  function vines(W, H, k) {
    const cx = W / 2, turn = pts => pts.map(([x, y]) => [W - x, H - y]);
    const tr = (dx, dy) => [W + dx * k, dy * k];
    const loop = (top, corner, mid) => {
      const half = top.concat(corner, [[W + mid * k, H / 2]], corner.slice().reverse().map(([x, y]) => [x, H - y]));
      return half.concat(turn(half));
    };
    const outer = loop([
      [W * .22, -14 * k], [cx - 70 * k, -14 * k],
      // pointed loop dipping into the sheet at the middle of the edge
      [cx + 18 * k, 8 * k], [cx + 6 * k, 46 * k], [cx, 56 * k], [cx - 6 * k, 46 * k], [cx - 18 * k, 8 * k],
      [cx + 70 * k, -14 * k], [W * .78, -14 * k]],
    [tr(-150, -14), tr(-70, -16), tr(-20, -6), tr(-4, 30), tr(-16, 130), tr(14, 380)], 30);
    // arches out over the middle of the edge, and over each corner
    const inner = loop([[W * .22, 18 * k], [cx - 110 * k, 0], [cx, -34 * k], [cx + 110 * k, 0], [W * .78, 18 * k]],
      [tr(-150, 18), tr(-80, 16), tr(-30, -4), tr(-2, -34), tr(22, -40), tr(34, -16), tr(26, 40), tr(18, 140), tr(-6, 380)], -40);
    // A whiplash hook curling into the middle of each side.
    const side = [[W + 34 * k, H / 2 - 130 * k], [W + 8 * k, H / 2 - 80 * k], [W - 28 * k, H / 2 - 36 * k],
      [W - 48 * k, H / 2 + 2 * k], [W - 40 * k, H / 2 + 26 * k], [W - 20 * k, H / 2 + 24 * k], [W - 16 * k, H / 2 + 8 * k]];
    // Inner vine along the top and bottom, ending in whiplash hooks.
    const hook = [
      [150 * k, 92 * k], [170 * k, 100 * k], [182 * k, 84 * k], [168 * k, 62 * k], [140 * k, 50 * k],
      [cx, 40 * k],
      [W - 140 * k, 50 * k], [W - 168 * k, 62 * k], [W - 182 * k, 84 * k], [W - 170 * k, 100 * k], [W - 150 * k, 92 * k]];
    return [
      { pts: outer, closed: true },
      { pts: inner, closed: true },
      { pts: hook, closed: false },
      { pts: turn(hook), closed: false },
      { pts: side, closed: false },
      { pts: turn(side), closed: false }];
  }

  function star(x, y, r, rot) {
    const lobes = [];
    let d = '';
    for (let i = 0; i < 5; i++) {
      const a = (rot + i * 72 - 90) * Math.PI / 180, v = a + Math.PI / 5, pv = a - Math.PI / 5;
      const P = (ang, m) => f(Math.cos(ang) * r * m) + ' ' + f(Math.sin(ang) * r * m);
      if (!i) d += 'M' + P(pv, .5);
      d += ' Q' + P(a - .32, .78) + ' ' + P(a, 1) + ' Q' + P(a + .32, .78) + ' ' + P(v, .5);
      lobes.push('M0 0 L' + P(a, .72));
    }
    const stigma = [0, 1, 2].map(i => {
      const a = (rot + i * 120) * Math.PI / 180, b = a + .7;
      return 'M0 0 q' + f(Math.cos(a) * r * .2) + ' ' + f(Math.sin(a) * r * .2) + ' ' + f(Math.cos(b) * r * .28) + ' ' + f(Math.sin(b) * r * .28);
    }).join(' ');
    return `<g transform="translate(${x} ${y})"><path class="nf-petal" d="${d}Z"/><circle class="nf-throat" r="${f(r * .36)}"/>` +
      `<path class="nf-vein" d="${lobes.join(' ')}"/><path class="nf-stigma" d="M0 0 L0 ${f(-r * .22)} ${stigma}"/></g>`;
  }

  function bell(x, y, s, rot) {
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">` +
      '<path class="nf-petal" d="M-2.5 0 C -8 -3 -11 -12 -11.5 -21 Q -14 -26 -18 -29 Q -11 -28.5 -6 -27 Q -3 -31 0 -35 Q 3 -31 6 -27 Q 11 -28.5 18 -29 Q 14 -26 11.5 -21 C 11 -12 8 -3 2.5 0 Z"/>' +
      '<path class="nf-vein" d="M0 -2 Q -8 -12 -13 -26 M0 -2 L0 -31 M0 -2 Q 8 -12 13 -26"/>' +
      '<path class="nf-sepal" d="M0 1 L-6 -9 M0 1 L6 -9 M0 1 L0 -8"/><path class="nf-stem" d="M0 0 L0 6"/></g>';
  }

  function leaf(x, y, rot, L, bend) {
    const w = L * .26, b = bend || .15;
    return `<g transform="translate(${x} ${y}) rotate(${rot})"><path class="nf-leaf" d="M0 0 C ${f(w)} ${f(-L * .25)} ${f(w * (1 + b))} ${f(-L * .7)} ${f(w * b * 3)} ${-L} ` +
      `C ${f(-w * (1 - b))} ${f(-L * .7)} ${f(-w)} ${f(-L * .25)} 0 0Z"/><path class="nf-midrib" d="M0 -2 Q ${f(w * .4)} ${f(-L * .5)} ${f(w * b * 3)} ${-L + 4}"/></g>`;
  }

  // Rampion spray over the top-right corner; the corner is at 0,0 and the
  // sheet lies towards -x, +y.
  function spray() {
    return '<path class="nf-stem nf-stem-main" d="M-22 330 C -12 230 -18 110 -70 40 M-70 40 C -120 18 -170 12 -220 20"/>' +
      '<path class="nf-stem" d="M-20 200 C 0 196 14 206 18 226 M-150 16 C -146 36 -136 50 -120 58 M-40 104 C -60 110 -76 124 -84 142"/>' +
      leaf(-60, 44, -78, 130) + leaf(-22, 150, 6, 118, -.2) + leaf(-120, 18, -104, 70, -.2) + leaf(-24, 250, -14, 78) +
      bell(18, 226, 1.25, 180) + bell(-120, 58, 1.05, 200) + bell(-84, 142, 1.1, 205) +
      star(-220, 20, 24, -12) + star(-70, 40, 40, 8) + star(-28, 104, 20, 30);
  }

  function draw(sheet, svg) {
    const W = sheet.offsetWidth, H = sheet.offsetHeight;
    const k = parseFloat(getComputedStyle(sheet).getPropertyValue('--frame-scale')) || 1;
    const w = 10 * k, edge = Math.max(1.2, 1.7 * k);
    // The SVG box matches the sheet (so it adds no scrolling); the vines spill past it.
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    Object.assign(svg.style, { width: W + 'px', height: H + 'px' });
    const ribbons = vines(W, H, k).map(v => {
      const segs = spline(v.pts, v.closed);
      return { d: pathD(segs, v.closed), pts: sample(segs, 5), closed: v.closed };
    });
    const crossings = weave(ribbons);
    const over = extra => crossings.map(([r, i, sin]) => piece(ribbons[r].pts, i, Math.min(160 * k, w / Math.max(sin, .05)) + 4 * k + extra)).join(' ');
    const all = ribbons.map(r => r.d).join(' ');
    svg.innerHTML =
      `<path class="nf-vine-edge" d="${all}" stroke-width="${f(w)}"/>` +
      `<path class="nf-vine" d="${all}" stroke-width="${f(w - 2 * edge)}"/>` +
      `<path class="nf-vine-edge nf-over" d="${over(0)}" stroke-width="${f(w)}"/>` +
      `<path class="nf-vine nf-over" d="${over(8)}" stroke-width="${f(w - 2 * edge)}"/>` +
      `<g transform="translate(${W} 0) scale(${k})">${spray()}</g>` +
      `<g transform="rotate(180 ${W / 2} ${H / 2}) translate(${W} 0) scale(${k})">${spray()}</g>`;
  }

  function init() {
    const sheet = document.querySelector('.sheet');
    if (!sheet) return;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'nouveau-frame');
    svg.setAttribute('aria-hidden', 'true');
    sheet.appendChild(svg);
    let size = '', queued = false;
    const update = () => {
      queued = false;
      if (document.documentElement.dataset.style !== 'raperonzolo') { size = ''; return; }
      const next = sheet.offsetWidth + 'x' + sheet.offsetHeight + getComputedStyle(sheet).getPropertyValue('--frame-scale');
      if (next !== size) { size = next; draw(sheet, svg); }
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    new ResizeObserver(queue).observe(sheet);
    new MutationObserver(queue).observe(document.documentElement, { attributes: true, attributeFilter: ['data-style'] });
    queue();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
