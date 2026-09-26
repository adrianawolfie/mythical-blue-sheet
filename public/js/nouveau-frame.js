// Raperonzolo theme: an Art Nouveau frame of flowing vines around the
// character sheet, the character overview and the DM screen, with rampion
// bellflower sprays in two opposite corners. It is drawn as an inline SVG
// sized to the framed element, so the vines keep their shape at any size;
// colours come from CSS variables in theme-styles.css.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const TAU = Math.PI * 2;
  const f = v => Math.round(v * 10) / 10;

  // Smooth closed curve through waypoints (Catmull-Rom as cubic Beziers), sampled every `step` px.
  function curve(pts, step) {
    const n = pts.length, out = [];
    const at = i => pts[(i + n) % n];
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1), a = at(i), d = at(i + 1), p3 = at(i + 2);
      const b = [a[0] + (d[0] - p0[0]) / 6, a[1] + (d[1] - p0[1]) / 6];
      const c = [d[0] - (p3[0] - a[0]) / 6, d[1] - (p3[1] - a[1]) / 6];
      const m = Math.max(2, Math.ceil(Math.hypot(d[0] - a[0], d[1] - a[1]) / step));
      for (let j = 0; j < m; j++) {
        const t = j / m, u = 1 - t;
        out.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
          u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]);
      }
    }
    return out;
  }

  // A tendril: it leaves its vine almost straight, then winds ever tighter into a spiral.
  function tendril(start, heading, len, turn, dir, sway) {
    const pts = [], ds = 2, n = Math.ceil(len / ds), c = 3.2 * turn / len;
    let [x, y] = start, th = heading;
    for (let i = 0; i <= n; i++) {
      pts.push([x, y]);
      const u = i / n;
      th += dir * (c * Math.pow(u, 2.2) - sway * Math.pow(1 - u, 3) * 4 / len) * ds;
      x += Math.cos(th) * ds;
      y += Math.sin(th) * ds;
    }
    return pts;
  }

  // Outline of a line whose width changes along it, as a filled shape.
  function band(pts, width, closed) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[closed ? (i + n - 1) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, h = width(i) / 2;
      L.push([pts[i][0] - dy / m * h, pts[i][1] + dx / m * h]);
      R.push([pts[i][0] + dy / m * h, pts[i][1] - dx / m * h]);
    }
    const ring = p => 'M' + p.map(q => f(q[0]) + ' ' + f(q[1])).join(' ') + 'Z';
    return closed ? ring(L) + ring(R.reverse()) : ring(L.concat(R.reverse()));
  }

  function hit(p, q, r, s) {
    const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
    if (!d) return false;
    const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
    const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return t >= 0 && t < 1 && u >= 0 && u < 1;
  }

  // Every crossing between vines, with an alternating over/under along each vine so they weave.
  function weave(vines) {
    const found = [], N = 16;
    // bounding boxes of runs of N segments, to skip runs that are far apart
    const boxes = vines.map(v => {
      const out = [];
      for (let s = 0; s < v.pts.length - 1; s += N) {
        const run = v.pts.slice(s, s + N + 1);
        out.push([Math.min(...run.map(p => p[0])), Math.min(...run.map(p => p[1])), Math.max(...run.map(p => p[0])), Math.max(...run.map(p => p[1]))]);
      }
      return out;
    });
    const near = (i, x, j, y) => { const A = boxes[i][Math.floor(x / N)], B = boxes[j][Math.floor(y / N)]; return A[0] <= B[2] && B[0] <= A[2] && A[1] <= B[3] && B[1] <= A[3]; };
    vines.forEach((a, i) => vines.forEach((b, j) => {
      if (j <= i) return;
      for (let x = 0; x < a.pts.length - 1; x++) {
        for (let y = 0; y < b.pts.length - 1; y++) {
          if (y % N === 0 && !near(i, x, j, y)) { y += N - 1; continue; }
          const p = a.pts[x], q = a.pts[x + 1], r = b.pts[y], t = b.pts[y + 1];
          if (hit(p, q, r, t)) {
            const sin = Math.abs((q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0])) / (Math.hypot(q[0] - p[0], q[1] - p[1]) * Math.hypot(t[0] - r[0], t[1] - r[1]));
            found.push({ a: [i, x], b: [j, y], sin });
          }
        }
      }
    }));
    const last = vines.map(() => false), seen = new Set();
    vines.forEach((_, r) => {
      const mine = [];
      found.forEach((c, k) => { if (c.a[0] === r) mine.push([c.a[1], k, 'a']); if (c.b[0] === r) mine.push([c.b[1], k, 'b']); });
      mine.sort((m, n) => m[0] - n[0]).forEach(([, k, side]) => {
        const c = found[k];
        if (!seen.has(k)) { seen.add(k); c.over = last[r] ? (side === 'a' ? 'b' : 'a') : side; }
        last[r] = c.over === side;
      });
    });
    return found.map(c => ({ over: c[c.over], under: c[c.over === 'a' ? 'b' : 'a'], sin: c.sin }));
  }

  function piece(pts, idx, half) {
    const n = pts.length, at = i => pts[(i + n) % n];
    let a = idx, b = idx + 1, len = 0;
    while (len < half && idx - a < n / 2) { len += Math.hypot(at(a)[0] - at(a - 1)[0], at(a)[1] - at(a - 1)[1]); a--; }
    len = 0;
    while (len < half && b - idx < n / 2) { len += Math.hypot(at(b + 1)[0] - at(b)[0], at(b + 1)[1] - at(b)[1]); b++; }
    const out = [];
    for (let i = a; i <= b; i++) out.push(f(at(i)[0]) + ' ' + f(at(i)[1]));
    return 'M' + out.join(' L');
  }

  // Two closed vines. Each runs along the top edge, round the top-right corner
  // and down to the middle of the right edge, back the same way mirrored, and
  // then the whole half again turned 180°.
  function vines(W, H, k) {
    const cx = W / 2, turn = pts => pts.map(([x, y]) => [W - x, H - y]);
    const tr = (dx, dy) => [W + dx * k, dy * k];
    // the two vines hold their line down a side, then swap over a short distance so they cross steeply
    const swap = (t, from, to) => [[W + from * k, H * t - 50 * k], [W + to * k, H * t + 50 * k]];
    const loop = (top, corner, mid) => {
      const half = top.concat(corner, [[W + mid * k, H / 2]], corner.slice().reverse().map(([x, y]) => [x, H - y]));
      return half.concat(turn(half));
    };
    // sweeps round the outside of each corner and dips into the sheet mid-edge
    const outer = loop([[W * .3, -16 * k], [cx - 120 * k, -18 * k], [cx, 26 * k], [cx + 120 * k, -18 * k], [W * .7, -16 * k]],
      [tr(-110, -20), tr(-34, -26), tr(10, -10), tr(24, 36), tr(16, 130), ...swap(.2, 16, -26), ...swap(.36, -26, 24)], 24);
    // cuts inside each corner and rises out over the middle of each edge
    const inner = loop([[W * .3, 14 * k], [cx - 120 * k, 12 * k], [cx, -30 * k], [cx + 120 * k, 12 * k], [W * .7, 14 * k]],
      [tr(-110, 16), tr(-44, 14), tr(-16, 44), tr(-14, 120), ...swap(.2, -14, 26), ...swap(.36, 26, -26)], -26);
    return [outer, inner];
  }

  // Tendrils and leaves for the top-right quarter: [vine, anchor near, heading, curl direction, length, turns, sway].
  // Each is repeated mirrored and turned for the other three quarters.
  function sprigs(W, H, k) {
    const tr = (dx, dy) => [W + dx * k, dy * k];
    return [
      [0, tr(14, 0), [1, .3], -1, 84 * k, 1.8 * Math.PI, 1],     // corner curl, outwards
      [1, tr(-100, 16), [-1, 0], 1, 280 * k, 1.7 * Math.PI, .6],   // long whiplash along the top, curling in
      [1, [W / 2 + 6 * k, -29 * k], [1, 0], -1, 80 * k, 1.6 * Math.PI, .8], // crest over the middle of the edge
      [0, [W - 26 * k, H * .28], [0, 1], 1, 130 * k, 1.8 * Math.PI, .8],     // hook curling into the side
      [1, [W + 26 * k, H * .28], [0, -1], 1, 90 * k, 1.6 * Math.PI, .5]];   // small curl out of the side
  }

  function nearest(pts, p) {
    let best = 0, d = Infinity;
    pts.forEach((q, i) => { const e = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2; if (e < d) { d = e; best = i; } });
    return best;
  }

  // Shared by every frame on the page, in one SVG that is never hidden.
  const gradients = '<svg class="nouveau-defs" aria-hidden="true" width="0" height="0"><defs>' +
    '<radialGradient id="nf-corolla" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="21">' +
    '<stop offset="0" class="nf-c-throat"/><stop offset=".28" class="nf-c-pale"/><stop offset=".7" class="nf-c-petal"/><stop offset="1" class="nf-c-deep"/></radialGradient>' +
    '<linearGradient id="nf-bell" gradientUnits="userSpaceOnUse" x1="-14" y1="0" x2="14" y2="0">' +
    '<stop offset="0" class="nf-c-deep"/><stop offset=".38" class="nf-c-pale"/><stop offset=".7" class="nf-c-petal"/><stop offset="1" class="nf-c-deep"/></linearGradient>' +
    '<radialGradient id="nf-mouth" cx=".5" cy=".7" r=".6"><stop offset="0" class="nf-c-throat"/><stop offset="1" class="nf-c-petal"/></radialGradient>' +
    '<linearGradient id="nf-leaf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="nf-c-leaf-dark"/><stop offset=".5" class="nf-c-leaf"/><stop offset="1" class="nf-c-leaf-dark"/></linearGradient>' +
    '</defs></svg>';

  // Open rampion flower: a fused five-lobed star with veins, pale throat and a three-part style.
  // Drawn at radius 20; `squash` tilts it away from the viewer.
  function star(x, y, r, spin, tilt, squash) {
    const lobe = 'M-7.5 -4 C -9.6 -9 -8.6 -13.5 -5.4 -16.4 C -3.4 -18.2 -1.2 -19.6 0 -22.5 C 1 -19.4 3.2 -17.8 5.4 -15.8 C 8.8 -13 9.6 -8.6 7.5 -4 Z';
    let lobes = '', veins = '';
    for (let i = 0; i < 5; i++) {
      lobes += `<path transform="rotate(${i * 72})" d="${lobe}"/>`;
      veins += `<path transform="rotate(${i * 72})" d="M0 -3 Q .6 -11 0 -19.5 M-1 -6 Q -4 -10 -5.2 -14.5 M1 -6 Q 4 -10 5.4 -14"/>`;
    }
    const curls = [0, 120, 240].map(a => `<path transform="rotate(${a})" d="M0 0 q 1.8 -.8 2.4 -2.8 q .3 -1.1 -.7 -1.2"/>`).join('');
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${tilt}) scale(${f(r / 20 * 100) / 100} ${f(r / 20 * squash * 100) / 100}) rotate(${spin})">` +
      `<circle class="nf-cup" r="9"/><g class="nf-petal">${lobes}</g><g class="nf-vein">${veins}</g>` +
      `<circle class="nf-throat" r="4.2"/><g class="nf-style">${curls}</g><circle class="nf-style-dot" r="1.1"/></g>`;
  }

  // Bell seen from the side, mouth towards -y: back lobes, the pale inside, then the shaded front.
  function bell(x, y, s, rot) {
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${s})">` +
      '<path class="nf-sepal" d="M0 -1.5 Q -5 -5 -9.5 -4 M0 -1.5 Q -3 -7 -5.5 -11.5 M0 -1.5 Q 3 -7 5.5 -11.5 M0 -1.5 Q 5 -5 9.5 -4"/>' +
      '<path class="nf-bell-back" d="M-12 -26 Q -15.5 -32 -12.5 -38 Q -7.5 -34.5 -3 -34 L 3 -34 Q 7.5 -34.5 12.5 -38 Q 15.5 -32 12 -26 Z"/>' +
      '<ellipse class="nf-mouth" cx="0" cy="-31" rx="11.5" ry="4.2"/>' +
      '<path class="nf-style" d="M0 -20 L0 -35.5 M0 -35.5 q -1.6 -.6 -2.2 -2.4 M0 -35.5 q 1.6 -.6 2.2 -2.4"/>' +
      '<path class="nf-bell" d="M-2.5 -1 C -8 -4 -11 -12 -11 -21 C -12 -26 -15 -29 -19.5 -32 C -14 -32.8 -10 -30.6 -7 -28 C -4 -30 -2 -31.6 0 -33 C 2 -31.6 4 -30 7 -28 C 10 -30.6 14 -32.8 19.5 -32 C 15 -29 12 -26 11 -21 C 11 -12 8 -4 2.5 -1 Z"/>' +
      '<path class="nf-vein" d="M0 -3 Q -6 -14 -9 -26.5 M0 -3 L0 -30.5 M0 -3 Q 6 -14 9 -26.5"/>' +
      '<path class="nf-stem" d="M0 -1 L0 5"/></g>';
  }

  function leaf(x, y, rot, L, bend) {
    const w = L * .2, b = bend || .15;
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot})"><path class="nf-leaf" d="M0 0 C ${f(w)} ${f(-L * .2)} ${f(w * (1 + b))} ${f(-L * .62)} ${f(w * b * 4)} ${-L} ` +
      `C ${f(-w * (1 - b))} ${f(-L * .6)} ${f(-w)} ${f(-L * .22)} 0 0Z"/>` +
      `<path class="nf-midrib" d="M0 -1 Q ${f(w * .35)} ${f(-L * .5)} ${f(w * b * 4)} ${f(-L + 3)}"/></g>`;
  }

  // A flower on a short curved pedicel from a point on the stem.
  const pedicel = (from, to, bend) => `<path class="nf-stem" d="M${from[0]} ${from[1]} Q ${f((from[0] + to[0]) / 2 + bend)} ${f((from[1] + to[1]) / 2 - Math.abs(bend))} ${to[0]} ${to[1]}"/>`;

  // Rampion spray over the top-right corner; the corner is at 0,0 and the sheet lies towards -x, +y.
  function spray() {
    return '<path class="nf-stem nf-stem-main" d="M-14 330 C -2 240 -6 130 -52 60 C -84 16 -150 -4 -236 12"/>' +
      leaf(-30, 190, 16, 96) + leaf(-12, 270, -14, 74, -.2) + leaf(-86, 26, -104, 84, -.2) + leaf(-160, 4, -78, 62) + leaf(-44, 100, -30, 58, -.25) +
      pedicel([-104, 18], [-116, 40], -6) + bell(-116, 40, 1.05, 196) +
      pedicel([-196, 7], [-212, 32], -6) + bell(-212, 32, .85, 202) +
      pedicel([-12, 226], [12, 244], 8) + bell(12, 244, 1.15, 164) +
      pedicel([-28, 132], [-52, 150], -6) + bell(-52, 150, .95, 208) +
      pedicel([-8, 160], [-22, 176], 4) + star(-22, 176, 17, 20, -30, .72) +
      star(-236, 12, 21, -8, 14, .7) + star(-58, 56, 34, 6, 0, 1);
  }

  function draw(box, svg, id) {
    const W = box.offsetWidth, H = box.offsetHeight;
    const k = parseFloat(getComputedStyle(box).getPropertyValue('--frame-scale')) || 1;
    const gap = 2 * k + 1;
    // The SVG box matches the framed element (so it adds no scrolling); the vines spill past it.
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    Object.assign(svg.style, { width: W + 'px', height: H + 'px' });

    // Vines swell and thin along their length, like running water.
    const vs = vines(W, H, k).map((way, v) => {
      const pts = curve(way, 4), s = [0];
      for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      // a whole number of swells round the loop, so the width has no seam
      const waves = Math.max(1, Math.round((s[s.length - 1] + 4) / (230 * k)));
      return { pts, width: i => k * (2.4 + 4.4 * (.5 + .5 * Math.sin(s[i] / (s[s.length - 1] + 4) * waves * TAU + v * 2))) };
    });

    // Where a vine passes under another, a mask cuts a small gap in it.
    const crossings = weave(vs);
    const area = `x="${-W}" y="${-H}" width="${3 * W}" height="${3 * H}"`;
    const masks = vs.map((u, i) => `<mask id="nf-${id}-under-${i}" maskUnits="userSpaceOnUse" ${area}><rect ${area} fill="#fff"/>` +
      crossings.filter(c => c.under[0] === i).map(c => {
        const o = vs[c.over[0]], wo = o.width(c.over[1]), wu = u.width(c.under[1]);
        const half = Math.min(160 * k, (wu / 2 + wo / 2 + gap) / Math.max(c.sin, .08)) + 2;
        return `<path d="${piece(o.pts, c.over[1], half)}" fill="none" stroke="#000" stroke-width="${f(wo + 2 * gap)}"/>`;
      }).join('') + '</mask>').join('');

    // Tendrils branch off the vines, repeated round all four quarters.
    const quarters = [
      ([x, y], [hx, hy], d) => [[x, y], [hx, hy], d],
      ([x, y], [hx, hy], d) => [[W - x, y], [-hx, hy], -d],
      ([x, y], [hx, hy], d) => [[W - x, H - y], [-hx, -hy], d],
      ([x, y], [hx, hy], d) => [[x, H - y], [hx, -hy], -d]];
    let tendrils = '', leaves = '';
    sprigs(W, H, k).forEach(([v, near, head, dir, len, turns, sway]) => quarters.forEach(q => {
      const [p, h, d] = q(near, head, dir), pts = vs[v].pts, n = pts.length, i = nearest(pts, p);
      const a = pts[(i + n - 2) % n], b = pts[(i + 2) % n];
      let th = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (Math.cos(th) * h[0] + Math.sin(th) * h[1] < 0) th += Math.PI;
      const w0 = vs[v].width(i) * .7;
      const t = tendril(pts[i], th, len, turns, d, sway);
      tendrils += `<path class="nf-vine" d="${band(t, j => w0 * Math.pow(1 - j / t.length, .8) + .5, false)}"/>`;
      const at = t[Math.floor(t.length * .12)];
      leaves += leaf(at[0], at[1], th * 180 / Math.PI + 90 - d * 55, 30 * k, -.1 * d);
    }));

    svg.innerHTML = masks +
      vs.map((v, i) => `<g mask="url(#nf-${id}-under-${i})"><path class="nf-vine" d="${band(v.pts, v.width, true)}"/>` +
        `<path class="nf-vine-light" d="${band(v.pts, j => v.width(j) * .28, true)}"/></g>`).join('') +
      tendrils + leaves +
      `<g transform="translate(${W} 0) scale(${k})">${spray()}</g>` +
      `<g transform="rotate(180 ${W / 2} ${H / 2}) translate(${W} 0) scale(${k})">${spray()}</g>`;
  }

  function frame(box, id) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'nouveau-frame');
    svg.setAttribute('aria-hidden', 'true');
    box.appendChild(svg);
    let size = '', queued = false;
    const update = () => {
      queued = false;
      // skipped while the theme is off or the element is hidden; the resize observer catches it when shown
      if (document.documentElement.dataset.style !== 'raperonzolo' || !box.offsetWidth) { size = ''; return; }
      const next = box.offsetWidth + 'x' + box.offsetHeight + getComputedStyle(box).getPropertyValue('--frame-scale');
      if (next !== size) { size = next; draw(box, svg, id); }
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    new ResizeObserver(queue).observe(box);
    new MutationObserver(queue).observe(document.documentElement, { attributes: true, attributeFilter: ['data-style'] });
    queue();
  }

  function init() {
    const boxes = document.querySelectorAll('.sheet, #startPage, .dm-screen-shell');
    if (!boxes.length) return;
    document.body.insertAdjacentHTML('beforeend', gradients);
    boxes.forEach(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
