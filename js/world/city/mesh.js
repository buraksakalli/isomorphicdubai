// City "programs": tiny pre-baked display lists (flat Float32Array) interpreted at draw time.
// Faces are back-face culled and wound consistently at build time (the camera direction is fixed),
// shaded colours come from a style table refreshed only when the light changes, and consecutive
// faces with the same style are merged into a single fill.
//
// Vertex encoding: u = x - y, v = x + y (tiles), w = z (metres)  ->  X = ox + u*kx, Y = oy + v*ky - w*kz
import { hash } from '../../core/shapes.js';

// ---- op codes ----
const FACE = 1, WIN = 2, PALM = 3, TREE = 4, AVL = 5, LINE = 6, RING = 7, BLOB = 8, DOTS = 10, GLOW = 11;

// ---- style table ----
const ST = { keys: new Map(), defs: [], css: [], cssLo: [], ver: -1, n: 0, lights: [], lightHex: [] };
const q20 = (v) => Math.round(v * 20) / 20;

/** Style index for a base colour lit with normal (nx,ny,nz); emit = night interior glow (0..1). */
export function sty(hex, nx = 0, ny = 0, nz = 1, emit = 0) {
  nx = q20(nx); ny = q20(ny); nz = q20(nz);
  const k = hex + '|' + nx + '|' + ny + '|' + nz + '|' + emit;
  let i = ST.keys.get(k);
  if (i !== undefined) return i;
  i = ST.defs.length;
  ST.defs.push([hex, nx, ny, nz, emit]);
  ST.keys.set(k, i);
  return i;
}
/** Night light colour index (windows). */
export function lightIdx(hex) {
  let i = ST.lightHex.indexOf(hex);
  if (i < 0) { i = ST.lightHex.length; ST.lightHex.push(hex); }
  return i;
}
export const LIGHT_WARM = lightIdx('#ffcf86');
export const LIGHT_COOL = lightIdx('#e6efff');
export const LIGHT_NEUTRAL = lightIdx('#fff0cc');
export const LIGHT_GOLD = lightIdx('#ffb85c');
export const LIGHT_SHOP = [lightIdx('#ffd27a'), lightIdx('#fff1c9'), lightIdx('#a8ecff'), lightIdx('#ffb0d8'), lightIdx('#ffe08a')];

function refresh(L) {
  if (ST.ver === L.version && ST.n === ST.defs.length) return;
  const d = ST.defs;
  for (let i = 0; i < d.length; i++) {
    const s = d[i];
    ST.css[i] = L.shade(s[0], s[1], s[2], s[3], s[4]);
    ST.cssLo[i] = s[4] > 0 ? L.shade(s[0], s[1], s[2], s[3], Math.min(1, s[4] * 2.4)) : ST.css[i];
  }
  for (let i = 0; i < ST.lightHex.length; i++) ST.lights[i] = L.emit(ST.lightHex[i], 1);
  ST.ver = L.version; ST.n = d.length;
}
export function styleCount() { return ST.defs.length; }

// ---- builder ----
const ZT = 0.01; // metres -> tiles for normals
const VIEW = [1, 1, 32 / 39.2]; // direction towards the viewer (x,y tiles, z tiles)

export class Prog {
  constructor() { this.a = []; }
  get empty() { return this.a.length === 0; }
  done() { return this.a.length ? Float32Array.from(this.a) : null; }

  /**
   * Raw planar 3D polygon [[x,y,z],...]. Normal computed (Newell) and oriented along `out` (outward hint
   * [x,y,z]); culled if that outward normal faces away from the viewer. Without a hint it's treated as two-sided.
   */
  poly(pts, hex, emit = 0, mz = 0, out = null) {
    let nx = 0, ny = 0, nz = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const pz = p[2] * ZT, qz = q[2] * ZT;
      nx += (p[1] - q[1]) * (pz + qz);
      ny += (pz - qz) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (out) {
      if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2] <= 1e-4) return;
    } else if (nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    this.face(sty(hex, nx, ny, nz, emit), mz, pts);
  }
  /** Face with known style. pts [[x,y,z],...] */
  face(st, mz, pts) {
    const a = this.a, n = pts.length;
    // screen-space winding (zoom 1): X = u*32, Y = v*16 - z*0.392 -> make all faces the same orientation
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const X0 = (p[0] - p[1]) * 32, Y0 = (p[0] + p[1]) * 16 - p[2] * 0.392;
      const X1 = (q[0] - q[1]) * 32, Y1 = (q[0] + q[1]) * 16 - q[2] * 0.392;
      s += X0 * Y1 - X1 * Y0;
    }
    if (Math.abs(s) < 1e-6) return; // degenerate (edge-on)
    a.push(FACE, st, mz, n);
    if (s > 0) for (let i = 0; i < n; i++) { const p = pts[i]; a.push(p[0] - p[1], p[0] + p[1], p[2]); }
    else for (let i = n - 1; i >= 0; i--) { const p = pts[i]; a.push(p[0] - p[1], p[0] + p[1], p[2]); }
  }
  /** Flat horizontal polygon at z. pts2 [[x,y],...] */
  flat(pts2, z, hex, mz = 0, emit = 0) {
    this.face(sty(hex, 0, 0, 1, emit), mz, pts2.map((p) => [p[0], p[1], z]));
  }
  rect(x, y, w, d, z, hex, mz = 0) { this.flat([[x, y], [x + w, y], [x + w, y + d], [x, y + d]], z, hex, mz); }

  /**
   * Extruded convex polygon. ztop: number or per-vertex array (sloped roofs).
   * o: { top: hex, emit, mz, win: {floor, kind, lit, light, glass, seed, z0?, z1?, mz?}, noTop }
   */
  solid(pts2, z0, ztop, hex, o = {}) {
    const n = pts2.length;
    const zt = typeof ztop === 'number' ? null : ztop;
    let cx = 0, cy = 0;
    for (const p of pts2) { cx += p[0]; cy += p[1]; }
    cx /= n; cy /= n;
    const emit = o.emit || 0, mz = o.mz || 0;
    const faces = [];
    for (let i = 0; i < n; i++) {
      const p = pts2[i], q = pts2[(i + 1) % n];
      const ex = q[0] - p[0], ey = q[1] - p[1];
      const len = Math.hypot(ex, ey) || 1;
      let nx = ey / len, ny = -ex / len;
      const mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      if (nx + ny <= 1e-4) continue;
      faces.push([p, q, zt ? zt[i] : ztop, zt ? zt[(i + 1) % n] : ztop, nx, ny, p[0] + p[1] + q[0] + q[1]]);
    }
    faces.sort((a, b) => a[6] - b[6]);
    for (const [p, q, zp, zq, nx, ny] of faces) {
      if (zp <= z0 + 0.01 && zq <= z0 + 0.01) continue;
      this.face(sty(hex, nx, ny, 0, emit), mz, [[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], zq], [p[0], p[1], zp]]);
      if (o.win) this.win(p, q, p, q, o.win.z0 ?? z0, Math.min(zp, zq, o.win.z1 ?? 1e9), nx, ny, o.win);
    }
    if (!o.noTop) {
      const top = o.top || hex;
      if (!zt) this.face(sty(top, 0, 0, 1), mz, pts2.map((p) => [p[0], p[1], ztop]));
      else this.poly(pts2.map((p, i) => [p[0], p[1], zt[i]]), top, 0, mz, [0, 0, 1]);
    }
  }
  box(x, y, w, d, z, h, hex, o) { this.solid([[x, y], [x + w, y], [x + w, y + d], [x, y + d]], z, z + h, hex, o); }

  /**
   * Loft between two convex rings with equal vertex counts (tapers, pyramids, spires).
   * o: { top, emit, mz, win }
   */
  taper(A, za, B, zb, hex, o = {}) {
    const n = A.length;
    let cx = 0, cy = 0;
    for (const p of A) { cx += p[0]; cy += p[1]; }
    cx /= n; cy /= n;
    const faces = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const pts = [[A[i][0], A[i][1], za], [A[j][0], A[j][1], za], [B[j][0], B[j][1], zb], [B[i][0], B[i][1], zb]];
      // normal (Newell), oriented outward via centroid
      let nx = 0, ny = 0, nz = 0;
      for (let k = 0; k < 4; k++) {
        const p = pts[k], q = pts[(k + 1) % 4];
        const pz = p[2] * ZT, qz = q[2] * ZT;
        nx += (p[1] - q[1]) * (pz + qz); ny += (pz - qz) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const mx = (A[i][0] + A[j][0]) / 2 - cx, my = (A[i][1] + A[j][1]) / 2 - cy;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2] <= 1e-4) continue;
      faces.push([pts, nx, ny, nz, A[i][0] + A[i][1] + A[j][0] + A[j][1], i, j]);
    }
    faces.sort((a, b) => a[4] - b[4]);
    const emit = o.emit || 0, mz = o.mz || 0;
    for (const [pts, nx, ny, nz, , i, j] of faces) {
      this.face(sty(hex, nx, ny, nz, emit), mz, pts);
      if (o.win && nz < 0.5) this.win(A[i], A[j], B[i], B[j], za, zb, nx, ny, o.win);
    }
    if (o.top !== false) {
      let area = 0;
      for (let i = 0; i < n; i++) { const p = B[i], q = B[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
      if (Math.abs(area) > 1e-6) this.face(sty(o.top || hex, 0, 0, 1), mz, B.map((p) => [p[0], p[1], zb]));
    }
  }

  /** Hipped roof on rect footprint at z, ridge rh metres above. */
  hipRoof(x, y, w, d, z, rh, hex, mz = 0) {
    const x1 = x + w, y1 = y + d, zt = z + rh;
    if (w >= d) {
      const r0 = x + d / 2, r1 = x1 - d / 2, ym = y + d / 2;
      this.poly([[x, y, z], [x1, y, z], [r1, ym, zt], [r0, ym, zt]], hex, 0, mz, [0, -1, 1]);
      this.poly([[x, y, z], [x, y1, z], [r0, ym, zt]], hex, 0, mz, [-1, 0, 1]);
      this.poly([[x1, y, z], [x1, y1, z], [r1, ym, zt]], hex, 0, mz, [1, 0, 1]);
      this.poly([[x, y1, z], [x1, y1, z], [r1, ym, zt], [r0, ym, zt]], hex, 0, mz, [0, 1, 1]);
    } else {
      const r0 = y + w / 2, r1 = y1 - w / 2, xm = x + w / 2;
      this.poly([[x, y, z], [x, y1, z], [xm, r1, zt], [xm, r0, zt]], hex, 0, mz, [-1, 0, 1]);
      this.poly([[x, y, z], [x1, y, z], [xm, r0, zt]], hex, 0, mz, [0, -1, 1]);
      this.poly([[x, y1, z], [x1, y1, z], [xm, r1, zt]], hex, 0, mz, [0, 1, 1]);
      this.poly([[x1, y, z], [x1, y1, z], [xm, r1, zt], [xm, r0, zt]], hex, 0, mz, [1, 0, 1]);
    }
  }
  /** Hipped roof on a rotated rectangle: centre, unit axis (ux,uy), half-length a (along u), half-width b. */
  hipRoofR(cx, cy, ux, uy, a, b, z, rh, hex, mz = 0) {
    const nx = -uy, ny = ux, zt = z + rh;
    const P = (s, t) => [cx + ux * s + nx * t, cy + uy * s + ny * t];
    if (a < b) { // ridge along n: swap axes
      return this.hipRoofR(cx, cy, nx, ny, b, a, z, rh, hex, mz);
    }
    const p0 = P(-a, -b), p1 = P(a, -b), p2 = P(a, b), p3 = P(-a, b), r0 = P(-(a - b), 0), r1 = P(a - b, 0);
    const Z = (p, zz) => [p[0], p[1], zz];
    this.poly([Z(p0, z), Z(p1, z), Z(r1, zt), Z(r0, zt)], hex, 0, mz, [-nx, -ny, 1]);
    this.poly([Z(p3, z), Z(p0, z), Z(r0, zt)], hex, 0, mz, [-ux, -uy, 1]);
    this.poly([Z(p1, z), Z(p2, z), Z(r1, zt)], hex, 0, mz, [ux, uy, 1]);
    this.poly([Z(p2, z), Z(p3, z), Z(r0, zt), Z(r1, zt)], hex, 0, mz, [nx, ny, 1]);
  }
  /** Dome of radius rad (tiles) at z, height h metres. */
  dome(cx, cy, rad, z, h, hex, o = {}) {
    const sides = o.sides || 10, steps = o.steps || 3;
    let prev = null, pz = z;
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * Math.PI / 2;
      const ring = ringPts(cx, cy, Math.max(0.002, Math.cos(a) * rad), sides);
      const zz = z + Math.sin(a) * h;
      if (prev) this.taper(prev, pz, ring, zz, hex, { mz: o.mz, top: k === steps ? undefined : false, emit: o.emit });
      prev = ring; pz = zz;
    }
  }

  /** Window bands on a (possibly tapered) face: bottom edge a0->b0 at z0, top edge a1->b1 at z1. */
  win(a0, b0, a1, b1, z0, z1, nx, ny, w) {
    if (z1 - z0 < (w.floor || 3.5) * 1.5) return;
    this.a.push(WIN, a0[0] - a0[1], a0[0] + a0[1], b0[0] - b0[1], b0[0] + b0[1],
      a1[0] - a1[1], a1[0] + a1[1], b1[0] - b1[1], b1[0] + b1[1], z0, z1,
      w.floor || 3.5, sty(w.glass || '#4d6375', nx, ny, 0), w.seed || 0, w.lit ?? 0.45, w.light ?? LIGHT_WARM,
      w.kind || 0, w.mz || 0);
  }
  palm(x, y, z, size, seed, mz = 0.45) { this.a.push(PALM, x - y, x + y, z, size, seed % 997, mz); }
  tree(x, y, z, size, hex, mz = 0.3) {
    this.a.push(TREE, x - y, x + y, z, size, sty(hex, 0.3, 0.3, 0.9), sty('#6b5135', 0, 1, 0), mz);
  }
  avl(x, y, z, seed) { this.a.push(AVL, x - y, x + y, z, seed % 997); }
  /** static night glow (crowns, lanterns): radius px at zoom 1, light colour index */
  glow(x, y, z, rad, light, mz = 0) { this.a.push(GLOW, x - y, x + y, z, rad, light, mz); }
  /** night window dots, drawn only for mz <= zoom < maxz. pts: [[x,y,z],...] */
  dots(pts, light, mz, maxz) {
    if (!pts.length) return;
    this.a.push(DOTS, light, mz, maxz, pts.length);
    for (const p of pts) this.a.push(p[0] - p[1], p[0] + p[1], p[2]);
  }
  line(x0, y0, z0, x1, y1, z1, hex, width = 1, mz = 0) {
    this.a.push(LINE, x0 - y0, x0 + y0, z0, x1 - y1, x1 + y1, z1, sty(hex, 0, 1, 0), width, mz);
  }
  /** closed outline (walls), pts2 at height z. */
  ring(pts2, z, hex, width, mz) {
    this.a.push(RING, sty(hex, 0.3, 0.6, 0.6), width, mz, pts2.length);
    for (const p of pts2) this.a.push(p[0] - p[1], p[0] + p[1], z);
  }
  /** soft ellipse blob (canopy masses at low zoom) */
  blob(x, y, z, rad, hex, mz = 0) { this.a.push(BLOB, x - y, x + y, z, rad, sty(hex, 0.2, 0.2, 0.95), mz); }
}

export function ringPts(cx, cy, rad, sides, rot = 0, sy = 1) {
  const out = [];
  for (let k = 0; k < sides; k++) {
    const a = rot + (k / sides) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * sy]);
  }
  return out;
}
export const rectPts = (x, y, w, d) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
/** rotated rectangle: centre, unit axis u, half-length a along u, half-width b */
export function rrect(cx, cy, ux, uy, a, b) {
  const nx = -uy, ny = ux;
  return [[cx - ux * a - nx * b, cy - uy * a - ny * b], [cx + ux * a - nx * b, cy + uy * a - ny * b],
    [cx + ux * a + nx * b, cy + uy * a + ny * b], [cx - ux * a + nx * b, cy - uy * a + ny * b]];
}

// ---- interpreter ----
let glowSpr = null;
function glowSprite() {
  if (glowSpr) return glowSpr;
  const s = document.createElement('canvas');
  s.width = s.height = 32;
  const g = s.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,90,80,1)'); grd.addColorStop(0.3, 'rgba(255,40,30,0.55)'); grd.addColorStop(1, 'rgba(255,30,20,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  glowSpr = s;
  return s;
}

const warmCache = new Map();
function warmSprite(li) {
  let s = warmCache.get(li);
  if (s) return s;
  const [r, g, b] = (ST.lightHex[li] || '#ffd590').match(/\w\w/g).map((h) => parseInt(h, 16));
  s = document.createElement('canvas');
  s.width = s.height = 32;
  const x = s.getContext('2d');
  const grd = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, `rgba(${r},${g},${b},0.9)`); grd.addColorStop(0.35, `rgba(${r},${g},${b},0.35)`); grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd; x.fillRect(0, 0, 32, 32);
  warmCache.set(li, s);
  return s;
}

/** Run a program. */
export function run(r, P) {
  const L = r.L;
  if (ST.ver !== L.version || ST.n !== ST.defs.length) refresh(L);
  const c = r.ctx, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy, zoom = r.zoom, night = r.night;
  const css = zoom < 0.4 ? ST.cssLo : ST.css;
  const n = P.length;
  let i = 0, cur = -1, open = false;
  while (i < n) {
    const op = P[i];
    if (op === FACE) {
      const st = P[i + 1], nv = P[i + 3];
      if (zoom >= P[i + 2]) {
        if (st !== cur) {
          if (open) c.fill();
          c.beginPath(); c.fillStyle = css[st]; cur = st; open = true;
        }
        let j = i + 4;
        c.moveTo(ox + P[j] * kx, oy + P[j + 1] * ky - P[j + 2] * kz);
        for (let k = 1; k < nv; k++) { j += 3; c.lineTo(ox + P[j] * kx, oy + P[j + 1] * ky - P[j + 2] * kz); }
        c.closePath();
      }
      i += 4 + nv * 3;
      continue;
    }
    if (open) { c.fill(); open = false; cur = -1; }
    if (op === WIN) {
      if (zoom >= P[i + 17]) drawWin(r, P, i, css);
      i += 18;
    } else if (op === PALM) {
      if (zoom >= P[i + 6]) drawPalm(r, P[i + 1], P[i + 2], P[i + 3], P[i + 4], P[i + 5]);
      i += 7;
    } else if (op === TREE) {
      if (zoom >= P[i + 7]) {
        const H = P[i + 4] * kz;
        if (H >= 1.2) {
          const X = ox + P[i + 1] * kx, Y = oy + P[i + 2] * ky - P[i + 3] * kz;
          if (H > 4) { c.fillStyle = css[P[i + 6]]; c.fillRect(X - H * 0.04, Y - H * 0.5, H * 0.08 + 0.4, H * 0.5); }
          c.beginPath(); c.ellipse(X, Y - H * 0.68, H * 0.4, H * 0.33, 0, 0, 6.2832);
          c.fillStyle = css[P[i + 5]]; c.fill();
        }
      }
      i += 8;
    } else if (op === AVL) {
      if (night > 0.15 && zoom > 0.07) {
        const seed = P[i + 4];
        const ph = (r.t * 0.7 + seed * 0.618) % 1;
        const on = ph < 0.4 ? 1 : 0;
        const X = ox + P[i + 1] * kx, Y = oy + P[i + 2] * ky - P[i + 3] * kz;
        if (on) {
          const rad = Math.max(1.6, 4.5 * Math.sqrt(zoom));
          const pa = c.globalAlpha, pc = c.globalCompositeOperation;
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = Math.min(1, night * 0.85);
          c.drawImage(glowSprite(), X - rad, Y - rad, rad * 2, rad * 2);
          c.globalAlpha = pa; c.globalCompositeOperation = pc;
        }
        if (zoom > 0.6) { c.fillStyle = on ? '#ff7a6a' : '#6a2622'; c.fillRect(X - 0.7, Y - 0.7, 1.4, 1.4); }
      }
      i += 5;
    } else if (op === GLOW) {
      if (night > 0.1 && zoom >= P[i + 6]) {
        const X = ox + P[i + 1] * kx, Y = oy + P[i + 2] * ky - P[i + 3] * kz;
        const rad = Math.max(2, P[i + 4] * Math.sqrt(zoom));
        const pa = c.globalAlpha, pc = c.globalCompositeOperation;
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = Math.min(1, night * 0.7);
        c.drawImage(warmSprite(P[i + 5]), X - rad, Y - rad * 0.8, rad * 2, rad * 1.6);
        c.globalAlpha = pa; c.globalCompositeOperation = pc;
      }
      i += 7;
    } else if (op === DOTS) {
      const nv = P[i + 4];
      if (night > 0.08 && zoom >= P[i + 2] && zoom < P[i + 3]) {
        const sz = Math.max(0.9, 1.1 * Math.sqrt(zoom) + (zoom > 1 ? 0.6 : 0));
        let j = i + 5;
        c.beginPath();
        for (let k = 0; k < nv; k++, j += 3) c.rect(ox + P[j] * kx - sz / 2, oy + P[j + 1] * ky - P[j + 2] * kz - sz / 2, sz, sz * 0.8);
        c.fillStyle = ST.lights[P[i + 1]];
        const pa = c.globalAlpha;
        c.globalAlpha = Math.min(1, night * 0.95);
        c.fill();
        c.globalAlpha = pa;
      }
      i += 5 + nv * 3;
    } else if (op === LINE) {
      if (zoom >= P[i + 9]) {
        c.beginPath();
        c.moveTo(ox + P[i + 1] * kx, oy + P[i + 2] * ky - P[i + 3] * kz);
        c.lineTo(ox + P[i + 4] * kx, oy + P[i + 5] * ky - P[i + 6] * kz);
        c.strokeStyle = css[P[i + 7]]; c.lineWidth = Math.max(0.5, P[i + 8] * zoom); c.stroke();
      }
      i += 10;
    } else if (op === RING) {
      const nv = P[i + 4];
      if (zoom >= P[i + 3]) {
        let j = i + 5;
        c.beginPath();
        c.moveTo(ox + P[j] * kx, oy + P[j + 1] * ky - P[j + 2] * kz);
        for (let k = 1; k < nv; k++) { j += 3; c.lineTo(ox + P[j] * kx, oy + P[j + 1] * ky - P[j + 2] * kz); }
        c.closePath();
        c.strokeStyle = css[P[i + 1]]; c.lineWidth = Math.max(0.5, P[i + 2] * zoom); c.stroke();
      }
      i += 5 + nv * 3;
    } else if (op === BLOB) {
      if (zoom >= P[i + 6]) {
        const R = P[i + 4] * kx;
        if (R > 0.8) {
          c.beginPath();
          c.ellipse(ox + P[i + 1] * kx, oy + P[i + 2] * ky - P[i + 3] * kz - R * 0.25, R, R * 0.6, 0, 0, 6.2832);
          c.fillStyle = css[P[i + 5]]; c.fill();
        }
      }
      i += 7;
    } else {
      // unknown op: bail out (should never happen)
      break;
    }
  }
  if (open) c.fill();
}

function drawWin(r, P, i, css) {
  const kz = r.kz, kx = r.kx, ky = r.ky, ox = r.ox, oy = r.oy, c = r.ctx, night = r.night;
  const floorH = P[i + 11];
  const fpx = floorH * kz;
  const z0 = P[i + 9], z1 = P[i + 10];
  const g = fpx >= 1.6 ? 1 : Math.min(Math.ceil(1.6 / fpx), Math.max(1, Math.floor((z1 - z0) / floorH)));
  const band = floorH * g;
  const rows = Math.floor((z1 - z0) / band);
  if (rows < 1) return;
  // screen endpoints of bottom and top edges (without z)
  const ax0 = ox + P[i + 1] * kx, ay0 = oy + P[i + 2] * ky, bx0 = ox + P[i + 3] * kx, by0 = oy + P[i + 4] * ky;
  const ax1 = ox + P[i + 5] * kx, ay1 = oy + P[i + 6] * ky, bx1 = ox + P[i + 7] * kx, by1 = oy + P[i + 8] * ky;
  const span = z1 - z0;
  const seed = P[i + 13], kind = P[i + 16];
  const bandPx = band * kz;
  const lw = kind === 2 ? Math.max(0.8, bandPx * 0.75) : Math.max(0.55, bandPx * (kind === 1 ? 0.38 : 0.5));
  const edgeLen = Math.abs(bx0 - ax0) + Math.abs(by0 - ay0);
  if (edgeLen < 1.2) return;
  c.lineWidth = lw;
  // daytime glass bands
  if (night < 0.9) {
    c.beginPath();
    for (let k = 0; k < rows; k++) {
      const zz = z0 + (k + 0.55) * band, t = (zz - z0) / span;
      const ax = ax0 + (ax1 - ax0) * t, ay = ay0 + (ay1 - ay0) * t - zz * kz;
      const bx = bx0 + (bx1 - bx0) * t, by = by0 + (by1 - by0) * t - zz * kz;
      c.moveTo(ax + (bx - ax) * 0.04, ay + (by - ay) * 0.04);
      c.lineTo(ax + (bx - ax) * 0.96, ay + (by - ay) * 0.96);
    }
    c.strokeStyle = css[P[i + 12]];
    c.globalAlpha = (kind === 1 ? 0.45 : kind === 2 ? 0.6 : 0.5) * (1 - night * 0.5);
    if (kind === 1 && g === 1 && fpx > 2.6) {
      const cell = Math.max(1.5, edgeLen / Math.max(3, Math.round(edgeLen / (fpx * 1.1))));
      c.setLineDash([cell * 0.55, cell * 0.45]);
      c.stroke();
      c.setLineDash([]);
    } else c.stroke();
    c.globalAlpha = 1;
  }
  // lit windows at night
  if (night > 0.05) {
    const lit = P[i + 14];
    const pr = g === 1 ? lit : 1 - Math.pow(1 - lit, Math.min(g, 6) * 0.7);
    const fid = (P[i + 1] * 7.31 + P[i + 3] * 3.17) | 0;
    c.beginPath();
    for (let k = 0; k < rows; k++) {
      const h1 = hash(seed, k, fid);
      if (h1 > pr) continue;
      const zz = z0 + (k + 0.55) * band, t = (zz - z0) / span;
      const ax = ax0 + (ax1 - ax0) * t, ay = ay0 + (ay1 - ay0) * t - zz * kz;
      const bx = bx0 + (bx1 - bx0) * t, by = by0 + (by1 - by0) * t - zz * kz;
      const hh = hash(seed, k, fid + 7);
      let t0, t1;
      if (kind === 2) { t0 = 0.05 + hh * 0.12; t1 = 0.95 - h1 * 0.12; }
      else if (g > 1) { t0 = 0.04 + hh * 0.25; t1 = Math.min(0.96, t0 + 0.4 + hash(seed, k, 9) * 0.55); }
      else { t0 = 0.04 + hh * 0.6; t1 = Math.min(0.96, t0 + 0.12 + hash(seed, k, 9) * 0.6); }
      c.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0);
      c.lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
      if (g === 1 && h1 < pr * 0.35) { // a second run on the same floor
        const t2 = Math.min(0.96, t1 + 0.08 + hh * 0.2), t3 = Math.min(0.96, t2 + 0.1 + h1 * 0.5);
        if (t3 > t2 + 0.03) { c.moveTo(ax + (bx - ax) * t2, ay + (by - ay) * t2); c.lineTo(ax + (bx - ax) * t3, ay + (by - ay) * t3); }
      }
    }
    c.strokeStyle = ST.lights[P[i + 15]];
    c.globalAlpha = Math.min(1, night * (g === 1 ? 0.95 : 0.8));
    if (g === 1 && fpx > 2.6) {
      const cell = Math.max(1.6, fpx * 0.9);
      c.setLineDash([cell * 0.62, cell * 0.38]);
      c.stroke();
      c.setLineDash([]);
    } else c.stroke();
    c.globalAlpha = 1;
  }
}

function drawPalm(r, u, v, z, size, seed) {
  const H = size * r.kz;
  if (H < 2.2) return;
  const c = r.ctx;
  const X = r.ox + u * r.kx, Y = r.oy + v * r.ky - z * r.kz;
  const lean = (hash(seed, 1) - 0.5) * H * 0.22;
  const tx = X + lean, ty = Y - H;
  c.strokeStyle = r.L.shade('#8a6a45', 0, 1, 0);
  c.lineWidth = Math.max(0.6, H * 0.07);
  c.beginPath(); c.moveTo(X, Y); c.quadraticCurveTo(X + lean * 0.2, Y - H * 0.5, tx, ty); c.stroke();
  const fr = H * 0.42;
  c.strokeStyle = r.L.shade('#3f7d3a', 0, 0, 1);
  c.lineWidth = Math.max(0.7, H * 0.085);
  c.beginPath();
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * 6.2832 + seed;
    const ca = Math.cos(a), sa = Math.sin(a);
    c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + ca * fr * 0.6, ty - fr * 0.22 + sa * fr * 0.15, tx + ca * fr, ty + sa * fr * 0.45 + fr * 0.28);
  }
  c.stroke();
}
