// Shared helpers for the "life" layer: arc-length paths, polyline tools, cheap oriented boxes, glow sprites.
// World: x east, y south (tiles, 1 tile = 100 m); z up (metres). Nothing here allocates per frame.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, v) => { const t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Polyline with precomputed cumulative arc length + per-segment unit tangents. Optional per-vertex z. */
export class Path {
  constructor(pts, zs = null) {
    // drop duplicate consecutive points
    const P = [], Z = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (P.length && Math.hypot(p[0] - P[P.length - 1][0], p[1] - P[P.length - 1][1]) < 1e-6) continue;
      P.push(p); if (zs) Z.push(zs[i]);
    }
    if (P.length === 1) { P.push([P[0][0] + 1e-3, P[0][1]]); if (zs) Z.push(Z[0]); }
    const n = (this.n = P.length);
    this.x = new Float64Array(n); this.y = new Float64Array(n); this.cum = new Float64Array(n);
    this.z = zs ? Float64Array.from(Z) : null;
    this.ux = new Float64Array(n - 1); this.uy = new Float64Array(n - 1);
    for (let i = 0; i < n; i++) {
      this.x[i] = P[i][0]; this.y[i] = P[i][1];
      if (i) {
        const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], l = Math.hypot(dx, dy);
        this.cum[i] = this.cum[i - 1] + l;
        this.ux[i - 1] = dx / l; this.uy[i - 1] = dy / l;
      }
    }
    this.length = this.cum[n - 1];
  }
  /** Segment index containing arc position s (hint = previous index for O(1) sequential access). */
  seg(s, hint = -1) {
    const c = this.cum, last = this.n - 2;
    if (s <= 0) return 0;
    if (s >= this.length) return last;
    if (hint >= 0 && hint <= last && c[hint] <= s) {
      if (s < c[hint + 1]) return hint;
      if (hint + 1 <= last && s < c[hint + 2]) return hint + 1;
    }
    let lo = 0, hi = last;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= s) lo = m; else hi = m - 1; }
    return lo;
  }
  /** Sample at arc position s into `out` ({x,y,z,ux,uy,i}); returns out. */
  at(s, out, hint = -1) {
    const i = this.seg(s, hint), c = this.cum;
    const L = c[i + 1] - c[i], f = L > 0 ? (s - c[i]) / L : 0;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * f;
    out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * f;
    out.z = this.z ? this.z[i] + (this.z[i + 1] - this.z[i]) * f : 0;
    out.ux = this.ux[i]; out.uy = this.uy[i]; out.i = i;
    return out;
  }
  /** Sample with tangent smoothly blended across vertices (for headings of long vehicles). */
  atSmooth(s, out, hint = -1) {
    this.at(s, out, hint);
    const i = out.i, c = this.cum, L = c[i + 1] - c[i];
    if (L <= 0) return out;
    const f = (s - c[i]) / L;
    let j = -1, w = 0;
    if (f < 0.5 && i > 0) { j = i - 1; w = 0.5 - f; } else if (f >= 0.5 && i < this.n - 2) { j = i + 1; w = f - 0.5; }
    if (j >= 0) {
      const ux = out.ux * (1 - w) + this.ux[j] * w, uy = out.uy * (1 - w) + this.uy[j] * w, l = Math.hypot(ux, uy) || 1;
      out.ux = ux / l; out.uy = uy / l;
    }
    return out;
  }
}

/** Offset a polyline sideways by d tiles (positive = right of travel direction, y-down world). */
export function offsetPolyline(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    let nx = 0, ny = 0;
    for (const j of [i - 1, i]) {
      if (j < 0 || j >= n - 1) continue;
      const dx = pts[j + 1][0] - pts[j][0], dy = pts[j + 1][1] - pts[j][1], l = Math.hypot(dx, dy) || 1;
      nx += -dy / l; ny += dx / l;
    }
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    // miter scale
    let k = 1;
    if (i > 0 && i < n - 1) {
      const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], ll = Math.hypot(dx, dy) || 1;
      const cos = nx * (-dy / ll) + ny * (dx / ll);
      k = 1 / Math.max(0.5, cos);
    }
    out.push([pts[i][0] + nx * d * k, pts[i][1] + ny * d * k]);
  }
  return out;
}

/** Densify so no segment is longer than `step` tiles. */
export function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(l / step));
    for (let j = 1; j <= k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  return out;
}

/** Centripetal Catmull-Rom through pts, ~`step` tiles per sub-segment. Returns { pts, idx } (idx = index of each input point). */
export function catmullRom(pts, step) {
  const out = [pts[0]], idx = [0];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const tj = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const k = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 1; j <= k; j++) {
      const t = t1 + ((t2 - t1) * j) / k;
      const P = [0, 1].map((c) => {
        const A1 = ((t1 - t) / (t1 - t0)) * p0[c] + ((t - t0) / (t1 - t0)) * p1[c];
        const A2 = ((t2 - t) / (t2 - t1)) * p1[c] + ((t - t1) / (t2 - t1)) * p2[c];
        const A3 = ((t3 - t) / (t3 - t2)) * p2[c] + ((t - t2) / (t3 - t2)) * p3[c];
        const B1 = ((t2 - t) / (t2 - t0)) * A1 + ((t - t0) / (t2 - t0)) * A2;
        const B2 = ((t3 - t) / (t3 - t1)) * A2 + ((t - t1) / (t3 - t1)) * A3;
        return ((t2 - t) / (t2 - t1)) * B1 + ((t - t1) / (t2 - t1)) * B2;
      });
      out.push(j === k ? p2 : P);
    }
    idx.push(out.length - 1);
  }
  return { pts: out, idx };
}

/** Quadratic bezier sampled into n points (excluding the first). */
export function bezier(a, c, b, n, out = []) {
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** View rectangle in zoom-1 projected coords (with margin in screen px). Writes into v. */
export function viewRect(r, v, marginPx = 0) {
  const z = r.zoom;
  v.x0 = (-marginPx - r.ox) / z; v.x1 = (r.vw + marginPx - r.ox) / z;
  v.y0 = (-marginPx - r.oy) / z; v.y1 = (r.vh + marginPx - r.oy) / z;
  return v;
}

/**
 * Oriented box: centre (cx, cy), unit heading (ux, uy), half length hl, half width hw (tiles), z..z+h metres.
 * Draws the visible sides + top using light shading. Returns nothing.
 */
export function obox(r, cx, cy, z, ux, uy, hl, hw, h, color, top = color, emit = 0) {
  const c = r.ctx, L = r.L, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy;
  const nx = -uy, ny = ux;
  const ax = ux * hl, ay = uy * hl, bx = nx * hw, by = ny * hw;
  // corners: 0 front-right, 1 front-left, 2 back-left, 3 back-right
  const X0 = cx + ax + bx, Y0 = cy + ay + by, X1 = cx + ax - bx, Y1 = cy + ay - by;
  const X2 = cx - ax - bx, Y2 = cy - ay - by, X3 = cx - ax + bx, Y3 = cy - ay + by;
  const zb = z * kz, zt = (z + h) * kz;
  const sx = (x, y) => ox + (x - y) * kx, sy = (x, y) => oy + (x + y) * ky;
  // visible faces: front (+u) edge 1->0, right (+n) edge 0->3, back (-u) 3->2, left (-n) 2->1
  if (h > 0) {
    if (ux + uy > 0) face(c, sx(X1, Y1), sy(X1, Y1), sx(X0, Y0), sy(X0, Y0), zb, zt, L.shade(color, ux, uy, 0, emit));
    else face(c, sx(X3, Y3), sy(X3, Y3), sx(X2, Y2), sy(X2, Y2), zb, zt, L.shade(color, -ux, -uy, 0, emit));
    if (nx + ny > 0) face(c, sx(X0, Y0), sy(X0, Y0), sx(X3, Y3), sy(X3, Y3), zb, zt, L.shade(color, nx, ny, 0, emit));
    else face(c, sx(X2, Y2), sy(X2, Y2), sx(X1, Y1), sy(X1, Y1), zb, zt, L.shade(color, -nx, -ny, 0, emit));
  }
  c.beginPath();
  c.moveTo(sx(X0, Y0), sy(X0, Y0) - zt); c.lineTo(sx(X1, Y1), sy(X1, Y1) - zt);
  c.lineTo(sx(X2, Y2), sy(X2, Y2) - zt); c.lineTo(sx(X3, Y3), sy(X3, Y3) - zt); c.closePath();
  c.fillStyle = L.shade(top, 0, 0, 1, emit); c.fill();
}
function face(c, ax, ay, bx, by, zb, zt, col) {
  c.beginPath(); c.moveTo(ax, ay - zb); c.lineTo(bx, by - zb); c.lineTo(bx, by - zt); c.lineTo(ax, ay - zt); c.closePath();
  c.fillStyle = col; c.fill();
}

/** Vertical band on the visible long side of an oriented box (for stripes / window rows). */
export function oboxBand(r, cx, cy, ux, uy, hl, hw, z0, z1, fill, inset = 0) {
  const c = r.ctx, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy;
  let nx = -uy, ny = ux;
  if (nx + ny <= 0) { nx = -nx; ny = -ny; }
  const l = hl * (1 - inset);
  const px = cx + nx * hw, py = cy + ny * hw;
  const ax = px + ux * l, ay = py + uy * l, bx = px - ux * l, by = py - uy * l;
  const AX = ox + (ax - ay) * kx, AY = oy + (ax + ay) * ky, BX = ox + (bx - by) * kx, BY = oy + (bx + by) * ky;
  c.beginPath();
  c.moveTo(AX, AY - z0 * kz); c.lineTo(BX, BY - z0 * kz); c.lineTo(BX, BY - z1 * kz); c.lineTo(AX, AY - z1 * kz); c.closePath();
  c.fillStyle = fill; c.fill();
}

// --- glow sprites (own cache; core's is private) ---
const sprites = new Map();
export function glowSprite(hex, soft = 0.25) {
  const key = hex + soft;
  let s = sprites.get(key);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 64;
  const g = s.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, hex); grd.addColorStop(soft, hex + 'aa'); grd.addColorStop(1, hex + '00');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  sprites.set(key, s);
  return s;
}
/** Additive glow at screen point (caller sets globalCompositeOperation='lighter' for batches). */
export function glowAt(c, X, Y, rad, sprite, alpha) {
  if (alpha <= 0.01 || rad <= 0.3) return;
  c.globalAlpha = alpha > 1 ? 1 : alpha;
  c.drawImage(sprite, X - rad, Y - rad, rad * 2, rad * 2);
}

/** Terrain water test with graceful fallback to the stub enum. */
export function waterTester(app) {
  const t = app.terrain;
  if (t && typeof t.isWater === 'function') return (x, y) => !!t.isWater(x, y);
  if (t && t.typeAt && t.T) {
    const T = t.T, wat = new Set([T.SEA, T.SHALLOW, T.WATER].filter((v) => v !== undefined));
    return (x, y) => wat.has(t.typeAt(x, y));
  }
  return () => true;
}
