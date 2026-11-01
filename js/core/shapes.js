// Drawing primitives. Every function takes the render context `r` first:
//   r.ctx (CanvasRenderingContext2D), r.L (Light), r.zoom, r.kx/r.ky/r.kz (projection scale),
//   r.ox/r.oy (screen offset), r.t (seconds), r.hours, r.night (0..1)
// Coordinates: x,y in tiles (1 tile = 100 m), z / heights in METRES.
// Colours are '#rrggbb' base (daylight) colours; shading is applied here via r.L.shade().

export const sx = (r, x, y) => r.ox + (x - y) * r.kx;
export const sy = (r, x, y, z = 0) => r.oy + (x + y) * r.ky - z * r.kz;

// deterministic hash 0..1
export function hash(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

/** Filled polygon in world space. pts: flat array [x,y,z, x,y,z, ...] */
export function poly(r, pts, fill, stroke = null, lw = 1) {
  const c = r.ctx;
  c.beginPath();
  for (let i = 0; i < pts.length; i += 3) {
    const X = r.ox + (pts[i] - pts[i + 1]) * r.kx, Y = r.oy + (pts[i] + pts[i + 1]) * r.ky - pts[i + 2] * r.kz;
    i ? c.lineTo(X, Y) : c.moveTo(X, Y);
  }
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}

/** Flat polygon on a horizontal plane at height z. pts2: [[x,y],...] */
export function flat(r, pts2, z, color, nz = 1) {
  const c = r.ctx;
  c.beginPath();
  for (let i = 0; i < pts2.length; i++) {
    const p = pts2[i];
    const X = r.ox + (p[0] - p[1]) * r.kx, Y = r.oy + (p[0] + p[1]) * r.ky - z * r.kz;
    i ? c.lineTo(X, Y) : c.moveTo(X, Y);
  }
  c.closePath();
  c.fillStyle = r.L.shade(color, 0, 0, nz);
  c.fill();
}

// --- window bands on a vertical quad face (screen-space endpoints of its bottom edge) ---
function faceWindows(r, ax, ay, bx, by, z0, z1, w, nx, ny) {
  const floorPx = w.floor * r.kz;
  if (floorPx < 1.4) return;
  const c = r.ctx;
  const rows = Math.floor((z1 - z0) / w.floor);
  if (rows < 1) return;
  const night = r.night;
  const seed = w.seed || 0;
  c.lineWidth = Math.max(0.6, floorPx * 0.45);
  c.lineCap = 'butt';
  // daytime glass bands
  c.beginPath();
  for (let i = 0; i < rows; i++) {
    const zz = (z0 + (i + 0.55) * w.floor) * r.kz;
    c.moveTo(ax, ay - zz); c.lineTo(bx, by - zz);
  }
  c.strokeStyle = r.L.shade(w.glass || '#3d5566', nx, ny, 0);
  c.globalAlpha = 0.55;
  c.stroke();
  c.globalAlpha = 1;
  // lit windows at night
  if (night > 0.05) {
    const lit = w.lit ?? 0.4;
    c.beginPath();
    for (let i = 0; i < rows; i++) {
      const zz = (z0 + (i + 0.55) * w.floor) * r.kz;
      const h1 = hash(seed, i, nx > 0 ? 1 : 2);
      if (h1 > lit * 1.6) continue;
      const t0 = hash(seed, i, 7) * 0.7, t1 = Math.min(1, t0 + 0.15 + hash(seed, i, 9) * 0.6);
      c.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0 - zz);
      c.lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1 - zz);
    }
    c.strokeStyle = r.L.emit(w.light || '#ffd590', 0.95 * night);
    c.stroke();
  }
}

/**
 * Axis-aligned box. Footprint [x, x+w] x [y, y+d] tiles, from z to z+h metres.
 * o: { top: '#hex' roof colour, win: { floor: 3.6, seed, lit: 0.4, glass, light }, emit: 0..1, outline: bool }
 */
export function box(r, x, y, z, w, d, h, color, o = null) {
  const c = r.ctx, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy, L = r.L;
  const x1 = x + w, y1 = y + d;
  const ax = ox + (x - y1) * kx, ay = oy + (x + y1) * ky;   // SW corner
  const bx = ox + (x1 - y1) * kx, by = oy + (x1 + y1) * ky; // SE corner (front)
  const cx = ox + (x1 - y) * kx, cy = oy + (x1 + y) * ky;   // NE corner
  const dx = ox + (x - y) * kx, dy = oy + (x + y) * ky;     // NW corner (back)
  const zb = z * kz, zt = (z + h) * kz;
  const emit = o && o.emit ? o.emit : 0;
  // south face (normal +y)
  c.beginPath(); c.moveTo(ax, ay - zb); c.lineTo(bx, by - zb); c.lineTo(bx, by - zt); c.lineTo(ax, ay - zt); c.closePath();
  c.fillStyle = L.shade(color, 0, 1, 0, emit); c.fill();
  // east face (normal +x)
  c.beginPath(); c.moveTo(bx, by - zb); c.lineTo(cx, cy - zb); c.lineTo(cx, cy - zt); c.lineTo(bx, by - zt); c.closePath();
  c.fillStyle = L.shade(color, 1, 0, 0, emit); c.fill();
  // top
  c.beginPath(); c.moveTo(dx, dy - zt); c.lineTo(cx, cy - zt); c.lineTo(bx, by - zt); c.lineTo(ax, ay - zt); c.closePath();
  c.fillStyle = L.shade((o && o.top) || color, 0, 0, 1); c.fill();
  if (o && o.win) {
    faceWindows(r, ax, ay, bx, by, z, z + h, o.win, 0, 1);
    faceWindows(r, bx, by, cx, cy, z, z + h, o.win, 1, 0);
  }
  if (o && o.outline && r.zoom > 0.6) {
    c.beginPath();
    c.moveTo(ax, ay - zb); c.lineTo(ax, ay - zt); c.lineTo(dx, dy - zt); c.lineTo(cx, cy - zt); c.lineTo(cx, cy - zb);
    c.moveTo(ax, ay - zt); c.lineTo(bx, by - zt); c.lineTo(cx, cy - zt); c.moveTo(bx, by - zt); c.lineTo(bx, by - zb);
    c.strokeStyle = 'rgba(20,25,35,0.18)'; c.lineWidth = 0.8; c.stroke();
  }
}

/** Stack of boxes centred on (cx, cy): tiers = [[halfW, halfD, height], ...] bottom→top. Returns top z. */
export function stack(r, cx, cy, z, tiers, color, o = null) {
  for (const [hw, hd, h] of tiers) {
    box(r, cx - hw, cy - hd, z, hw * 2, hd * 2, h, color, o);
    z += h;
  }
  return z;
}

function orient(pts) { // returns +1 if pts are clockwise in screen-ish sense (x east, y south)
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a >= 0 ? 1 : -1;
}

/**
 * Extruded polygon (convex works best; mild concavity OK). pts: [[x,y],...] tiles.
 * o: { top: '#hex', emit, win: {...}, topZ: optional override }
 */
export function prism(r, pts, z, h, color, o = null) {
  const c = r.ctx, L = r.L, n = pts.length, s = orient(pts);
  const kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy;
  const zb = z * kz, zt = (z + h) * kz;
  const emit = o && o.emit ? o.emit : 0;
  // collect visible faces
  const faces = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const ex = q[0] - p[0], ey = q[1] - p[1];
    const len = Math.hypot(ex, ey) || 1;
    // outward normal for orientation s
    const nx = (s * ey) / len, ny = (-s * ex) / len;
    if (nx + ny <= 0.0001) continue; // faces away from viewer (viewer is at +x,+y)
    faces.push([p, q, nx, ny, p[0] + p[1] + q[0] + q[1]]);
  }
  faces.sort((a, b) => a[4] - b[4]);
  for (const [p, q, nx, ny] of faces) {
    const ax = ox + (p[0] - p[1]) * kx, ay = oy + (p[0] + p[1]) * ky;
    const bx = ox + (q[0] - q[1]) * kx, by = oy + (q[0] + q[1]) * ky;
    c.beginPath(); c.moveTo(ax, ay - zb); c.lineTo(bx, by - zb); c.lineTo(bx, by - zt); c.lineTo(ax, ay - zt); c.closePath();
    const col = L.shade(color, nx, ny, 0, emit);
    c.fillStyle = col; c.fill();
    c.strokeStyle = col; c.lineWidth = 0.6; c.stroke(); // hide AA seams between facets
    if (o && o.win) faceWindows(r, ax, ay, bx, by, z, z + h, o.win, nx, ny);
  }
  if (!o || o.top !== false) {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const X = ox + (p[0] - p[1]) * kx, Y = oy + (p[0] + p[1]) * ky - zt;
      i ? c.lineTo(X, Y) : c.moveTo(X, Y);
    }
    c.closePath();
    c.fillStyle = L.shade((o && o.top) || color, 0, 0, 1); c.fill();
  }
}

/** Regular polygon ring points around (cx, cy). radius in tiles. */
export function ring(cx, cy, radius, sides = 16, rot = 0) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    out.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return out;
}

/** Number of sides appropriate for a circle of `radius` tiles at the current zoom. */
export function sidesFor(r, radius) {
  return Math.max(6, Math.min(40, Math.round(radius * r.kx * 0.9)));
}

/** Cylinder. radius in tiles, z/h in metres. */
export function cylinder(r, cx, cy, radius, z, h, color, o = null) {
  prism(r, ring(cx, cy, radius, (o && o.sides) || sidesFor(r, radius)), z, h, color, o);
}

/**
 * Loft between rings: rings = [{ z, pts:[[x,y],...] }, ...] with equal point counts (bottom→top).
 * Draws visible side quads for each band, then the top cap. Good for tapering towers, domes, spires.
 */
export function loft(r, rings, color, o = null) {
  const c = r.ctx, L = r.L, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy;
  const emit = o && o.emit ? o.emit : 0;
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1], n = A.pts.length, s = orient(A.pts);
    const faces = [];
    for (let i = 0; i < n; i++) {
      const p = A.pts[i], q = A.pts[(i + 1) % n], p2 = B.pts[i], q2 = B.pts[(i + 1) % n];
      const ex = q[0] - p[0], ey = q[1] - p[1];
      const len = Math.hypot(ex, ey) || 1;
      let nx = (s * ey) / len, ny = (-s * ex) / len;
      // tilt normal by taper (radial shrink) to approximate slope
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, mx2 = (p2[0] + q2[0]) / 2, my2 = (p2[1] + q2[1]) / 2;
      const shrink = (nx * (mx - mx2) + ny * (my - my2)) * 100; // metres inward
      const dz = B.z - A.z || 1;
      const nz = shrink / Math.hypot(shrink, dz);
      const f = Math.sqrt(Math.max(0, 1 - nz * nz));
      nx *= f; ny *= f;
      if (nx + ny <= -0.02 && nz < 0.5) continue;
      faces.push([p, q, q2, p2, nx, ny, nz, mx + my]);
    }
    faces.sort((a, b) => a[7] - b[7]);
    for (const [p, q, q2, p2, nx, ny, nz] of faces) {
      c.beginPath();
      c.moveTo(ox + (p[0] - p[1]) * kx, oy + (p[0] + p[1]) * ky - A.z * kz);
      c.lineTo(ox + (q[0] - q[1]) * kx, oy + (q[0] + q[1]) * ky - A.z * kz);
      c.lineTo(ox + (q2[0] - q2[1]) * kx, oy + (q2[0] + q2[1]) * ky - B.z * kz);
      c.lineTo(ox + (p2[0] - p2[1]) * kx, oy + (p2[0] + p2[1]) * ky - B.z * kz);
      c.closePath();
      const col = L.shade(color, nx, ny, Math.max(0, nz), emit);
      c.fillStyle = col; c.fill(); c.strokeStyle = col; c.lineWidth = 0.6; c.stroke();
    }
  }
  const T = rings[rings.length - 1];
  if (!o || o.top !== false) {
    c.beginPath();
    T.pts.forEach((p, i) => {
      const X = ox + (p[0] - p[1]) * kx, Y = oy + (p[0] + p[1]) * ky - T.z * kz;
      i ? c.lineTo(X, Y) : c.moveTo(X, Y);
    });
    c.closePath();
    c.fillStyle = L.shade((o && o.top) || color, 0, 0, 1); c.fill();
  }
}

/** Dome (hemisphere-ish) of radius (tiles) sitting at z, height hM metres. */
export function dome(r, cx, cy, radius, z, hM, color, o = null) {
  const sides = (o && o.sides) || sidesFor(r, radius);
  const rings = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    rings.push({ z: z + Math.sin(a) * hM, pts: ring(cx, cy, Math.max(0.001, Math.cos(a) * radius), sides) });
  }
  loft(r, rings, color, o);
}

/** Cone / spire. */
export function cone(r, cx, cy, radius, z, h, color, o = null) {
  const sides = (o && o.sides) || Math.max(6, sidesFor(r, radius));
  loft(r, [{ z, pts: ring(cx, cy, radius, sides) }, { z: z + h, pts: ring(cx, cy, 0.0005, sides) }], color, o);
}

/** 3D line (e.g. cables, masts). widthPx in screen px at zoom 1 (scaled by zoom, min 0.5). */
export function line3(r, x0, y0, z0, x1, y1, z1, color, widthPx = 1) {
  const c = r.ctx;
  c.beginPath();
  c.moveTo(r.ox + (x0 - y0) * r.kx, r.oy + (x0 + y0) * r.ky - z0 * r.kz);
  c.lineTo(r.ox + (x1 - y1) * r.kx, r.oy + (x1 + y1) * r.ky - z1 * r.kz);
  c.strokeStyle = color; c.lineWidth = Math.max(0.5, widthPx * r.zoom); c.stroke();
}

// --- glow sprites (emissive) ---
const glowCache = new Map();
function glowSprite(hex) {
  let s = glowCache.get(hex);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 64;
  const g = s.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, hex); grd.addColorStop(0.25, hex + 'aa'); grd.addColorStop(1, hex + '00');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  glowCache.set(hex, s);
  return s;
}
/** Additive glow at a world point. radiusPx is screen pixels at zoom 1 (scaled by zoom, clamped). */
export function glow(r, x, y, z, radiusPx, hex, alpha = 1) {
  if (alpha <= 0.01) return;
  const rad = Math.max(1.5, radiusPx * Math.sqrt(r.zoom));
  const X = r.ox + (x - y) * r.kx, Y = r.oy + (x + y) * r.ky - z * r.kz;
  const c = r.ctx;
  const prevOp = c.globalCompositeOperation, prevA = c.globalAlpha;
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = Math.min(1, alpha);
  c.drawImage(glowSprite(hex), X - rad, Y - rad, rad * 2, rad * 2);
  c.globalCompositeOperation = prevOp; c.globalAlpha = prevA;
}

/** Palm tree at (x, y, z). size ~ height in metres (8–14 typical). */
export function palm(r, x, y, z, size = 10, seed = 0) {
  if (size * r.kz < 2) return;
  const c = r.ctx, L = r.L;
  const X = r.ox + (x - y) * r.kx, Y = r.oy + (x + y) * r.ky - z * r.kz;
  const H = size * r.kz, lean = (hash(seed, 1) - 0.5) * H * 0.25;
  c.strokeStyle = L.shade('#8a6a45', 0, 1, 0); c.lineWidth = Math.max(0.6, H * 0.08);
  c.beginPath(); c.moveTo(X, Y); c.quadraticCurveTo(X + lean * 0.3, Y - H * 0.5, X + lean, Y - H); c.stroke();
  const tx = X + lean, ty = Y - H, fr = H * 0.42;
  c.fillStyle = L.shade('#3f7d3a', 0, 0, 1);
  c.strokeStyle = L.shade('#2f6a2e', 0, 0, 1);
  c.lineWidth = Math.max(0.6, H * 0.07);
  c.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + seed;
    const ex = tx + Math.cos(a) * fr, ey = ty + Math.sin(a) * fr * 0.5 + fr * 0.25;
    c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * fr * 0.6, ty - fr * 0.25, ex, ey);
  }
  c.stroke();
}

/** Round-canopy tree (ghaf / generic). */
export function tree(r, x, y, z, size = 8, color = '#4f7f3b') {
  if (size * r.kz < 1.5) return;
  const c = r.ctx;
  const X = r.ox + (x - y) * r.kx, Y = r.oy + (x + y) * r.ky - z * r.kz;
  const H = size * r.kz;
  c.fillStyle = r.L.shade('#6b5135', 0, 1, 0);
  c.fillRect(X - H * 0.04, Y - H * 0.5, H * 0.08 + 0.4, H * 0.5);
  c.beginPath(); c.ellipse(X, Y - H * 0.7, H * 0.38, H * 0.32, 0, 0, Math.PI * 2);
  c.fillStyle = r.L.shade(color, 0.3, 0.3, 0.9); c.fill();
}
