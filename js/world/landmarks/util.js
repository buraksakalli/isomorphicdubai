// Landmark toolkit.
// - Mesh: a tiny static polygon renderer. The isometric camera direction never changes, so back-face
//   culling and painter's sorting of a landmark's faces can be done ONCE at build time; each frame we only
//   project, shade (cached per light version) and fill.
// - Geometry builders (extrude, loft, lathe, tube, box) that add faces to a Mesh.
// - Registration helpers (landmark entries, scene objects with bbox/shadow, low-zoom "icon" exaggeration).
import { HW, HH, ZH } from '../../core/iso.js';
import { hash } from '../../core/shapes.js';

// unit vector from the scene toward the camera, metric (x east, y south, z up): elevation 30°, azimuth SE
const VX = 0.6124, VZ = 0.5;
export const viewDepth = (x, y, z) => VX * (x + y) * 100 + VZ * z;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const TAU = Math.PI * 2;

/** Local frame: (u, v) metres in a frame rotated by `deg` (0 = u east, 90 = u south) → world [x, y] tiles. */
export function frame(cx, cy, deg = 0) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const f = (u, v) => [cx + (u * c - v * s) / 100, cy + (u * s + v * c) / 100];
  f.cx = cx; f.cy = cy; f.deg = deg;
  f.p3 = (u, v, z) => { const p = f(u, v); return [p[0], p[1], z]; };
  f.pts = (arr) => arr.map(([u, v]) => f(u, v));
  return f;
}
/** Rectangle in a local frame: centre (u,v), half sizes (hu, hv) metres → world pts. */
export const rectL = (F, u, v, hu, hv) => [F(u - hu, v - hv), F(u + hu, v - hv), F(u + hu, v + hv), F(u - hu, v + hv)];
/** Circle/ellipse in a local frame (metres). */
export function ellL(F, u, v, ru, rv, n = 16, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; out.push(F(u + Math.cos(a) * ru, v + Math.sin(a) * rv)); }
  return out;
}
export function centroid2(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

/** HSL → css rgba string (h in degrees). */
export function hsla(h, s, l, a = 1) {
  return `hsla(${((h % 360) + 360) % 360 | 0},${s | 0}%,${l | 0}%,${a.toFixed(3)})`;
}

// ---------------------------------------------------------------------------------------------
// Mesh
// ---------------------------------------------------------------------------------------------
const F_FACE = 0, F_LINE = 1, F_GLOW = 2;

export class Mesh {
  constructor() {
    this.items = [];
    this.layer = 0;       // items sort by (layer, depth)
    this.b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, h: 0 };
    this.list = null;
  }
  _grow(p) {
    const b = this.b;
    if (p[0] < b.x0) b.x0 = p[0]; if (p[0] > b.x1) b.x1 = p[0];
    if (p[1] < b.y0) b.y0 = p[1]; if (p[1] > b.y1) b.y1 = p[1];
    if (p[2] > b.h) b.h = p[2];
  }
  /**
   * Polygon face. pts: [[x,y,z],...] (tiles, tiles, metres).
   * o: { out:[x,y,z] (point inside the solid → orients normal), two (double-sided), n:[nx,ny,nz] override,
   *      emit, glow:'#hex', ga (glow alpha), win:{floor,seed,lit,glass,light}, tag, data, bias, seam:false }
   */
  face(pts, color, o = {}) {
    const n = pts.length;
    let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const px = p[0] * 100, py = p[1] * 100, qx = q[0] * 100, qy = q[1] * 100;
      nx += (py - qy) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (px + qx);
      nz += (px - qx) * (py + qy);
      cx += p[0]; cy += p[1]; cz += p[2];
      this._grow(p);
    }
    cx /= n; cy /= n; cz /= n;
    if (o.n) [nx, ny, nz] = o.n;
    let len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return null;
    nx /= len; ny /= len; nz /= len;
    if (o.out && !o.n) {
      const d = nx * (cx - o.out[0]) * 100 + ny * (cy - o.out[1]) * 100 + nz * (cz - o.out[2]);
      if (d < 0) { nx = -nx; ny = -ny; nz = -nz; }
    }
    let vis = VX * (nx + ny) + VZ * nz;
    if (vis <= 1e-4) {
      if (o.two || (!o.out && !o.n && o.two !== false)) { nx = -nx; ny = -ny; nz = -nz; vis = -vis; }
      else return null;
    }
    const P = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      P[i * 2] = (p[0] - p[1]) * HW;
      P[i * 2 + 1] = (p[0] + p[1]) * HH - p[2] * ZH;
    }
    let zmin = Infinity, zmax = -Infinity;
    for (const p of pts) { if (p[2] < zmin) zmin = p[2]; if (p[2] > zmax) zmax = p[2]; }
    const f = { k: F_FACE, P, color, nx, ny, nz, emit: o.emit || 0, glow: o.glow || null, ga: o.ga ?? 0.6,
      win: o.win || null, tag: o.tag || 0, data: o.data, seam: o.seam !== false, z: cz, zmin, zmax,
      x: cx, y: cy, layer: this.layer, depth: viewDepth(cx, cy, cz) + (o.bias || 0), _v: -1, _c: '' };
    this.items.push(f);
    return f;
  }
  /** 3D line. widthPx at zoom 1 (scaled by zoom). o: { glow:'#hex' night colour, ga, tag, minPx } */
  line(a, b, color, widthPx = 1, o = {}) {
    this._grow(a); this._grow(b);
    const it = { k: F_LINE, x0: (a[0] - a[1]) * HW, y0: (a[0] + a[1]) * HH - a[2] * ZH,
      x1: (b[0] - b[1]) * HW, y1: (b[0] + b[1]) * HH - b[2] * ZH, color, w: widthPx, glow: o.glow || null,
      ga: o.ga ?? 0.9, tag: o.tag || 0, data: o.data, layer: this.layer, z: (a[2] + b[2]) / 2,
      depth: viewDepth((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2) + (o.bias || 0) };
    this.items.push(it);
    return it;
  }
  /** Night light sprite at a point. radiusPx at zoom 1. */
  light(p, radiusPx, hex, alpha = 0.8, o = {}) {
    this._grow(p);
    const it = { k: F_GLOW, x: p[0], y: p[1], z: p[2], rad: radiusPx, hex, a: alpha, tag: o.tag || 0, day: o.day || 0, keep: !!o.keep,
      layer: this.layer, depth: viewDepth(p[0], p[1], p[2]) + (o.bias ?? 5) };
    this.items.push(it);
    return it;
  }
  done() {
    this.items.sort((a, b) => a.layer - b.layer || a.depth - b.depth);
    this.list = this.items;
    return this;
  }
  bbox(pad = 0.05) {
    const b = this.b;
    return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad, h: b.h + 5 };
  }
  /**
   * Draw. fx(item, r) → css colour (additive overlay, night lighting / animation) or null.
   * Faces with .glow get a static night wash automatically when fx returns nothing.
   */
  draw(r, fx = null) {
    const c = r.ctx, z = r.zoom, ox = r.ox, oy = r.oy, L = r.L, night = r.night, ver = L.version;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.k === F_FACE) {
        const P = f.P, n = P.length;
        c.beginPath();
        c.moveTo(ox + P[0] * z, oy + P[1] * z);
        for (let j = 2; j < n; j += 2) c.lineTo(ox + P[j] * z, oy + P[j + 1] * z);
        c.closePath();
        if (f._v !== ver) { f._c = L.shade(f.color, f.nx, f.ny, f.nz, f.emit); f._v = ver; }
        c.fillStyle = f._c; c.fill();
        if (f.seam) { c.strokeStyle = f._c; c.lineWidth = 0.6; c.stroke(); }
        let e = fx ? fx(f, r) : null;
        if (!e && f.glow && night > 0.03) e = L.emit(f.glow, f.ga);
        if (e) {
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = e; c.fill();
          c.globalCompositeOperation = 'source-over';
        }
        if (f.win) winBands(r, f);
      } else if (f.k === F_LINE) {
        let col = f.color;
        let e = fx ? fx(f, r) : null;
        if (!e && f.glow && night > 0.15) e = L.emit(f.glow, f.ga);
        c.beginPath();
        c.moveTo(ox + f.x0 * z, oy + f.y0 * z); c.lineTo(ox + f.x1 * z, oy + f.y1 * z);
        c.lineWidth = Math.max(0.5, f.w * z);
        if (e) { c.strokeStyle = e; } else c.strokeStyle = col;
        c.stroke();
      } else {
        if (z < 0.15 && !f.keep) continue; // skip small accent lights when zoomed far out
        const a = f.day + (f.a - f.day) * night;
        if (a > 0.02) {
          let hex = f.hex;
          if (fx) { const v = fx(f, r); if (v === false) continue; if (v) hex = v; }
          glowAt(r, f.x, f.y, f.z, f.rad, hex, a);
        }
      }
    }
  }
}

function winBands(r, f) {
  const w = f.win, floorPx = w.floor * r.kz;
  if (floorPx < 1.6) return;
  const P = f.P, z = r.zoom, ox = r.ox, oy = r.oy;
  // bottom edge = vertices 0,1 (at zmin)
  const ax = ox + P[0] * z, ay = oy + P[1] * z, bx = ox + P[2] * z, by = oy + P[3] * z;
  const rows = Math.floor((f.zmax - f.zmin) / w.floor);
  if (rows < 1) return;
  const c = r.ctx;
  c.lineWidth = Math.max(0.6, floorPx * (w.band || 0.42));
  c.beginPath();
  for (let i = 0; i < rows; i++) {
    const zz = (i + 0.55) * w.floor * r.kz;
    c.moveTo(ax, ay - zz); c.lineTo(bx, by - zz);
  }
  c.strokeStyle = r.L.shade(w.glass || '#3d5566', f.nx, f.ny, 0);
  c.globalAlpha = w.alpha ?? 0.5; c.stroke(); c.globalAlpha = 1;
  if (r.night > 0.05) {
    const lit = w.lit ?? 0.5, seed = w.seed || 0;
    c.beginPath();
    for (let i = 0; i < rows; i++) {
      if (hash(seed, i, f.tag) > lit * 1.6) continue;
      const zz = (i + 0.55) * w.floor * r.kz;
      const t0 = hash(seed, i, 7) * 0.6, t1 = Math.min(1, t0 + 0.2 + hash(seed, i, 9) * 0.6);
      c.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0 - zz);
      c.lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1 - zz);
    }
    c.strokeStyle = r.L.emit(w.light || '#ffd590', 0.9);
    c.stroke();
  }
}

// glow sprite (own cache so animated colours don't bloat the core cache; colours are quantised by callers)
const glowCache = new Map();
function sprite(hex) {
  let s = glowCache.get(hex);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 64;
  const g = s.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, hex); grd.addColorStop(0.22, hex + 'b0'); grd.addColorStop(0.55, hex + '30'); grd.addColorStop(1, hex + '00');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  glowCache.set(hex, s);
  return s;
}
export function glowAt(r, x, y, z, radiusPx, hex, alpha = 1) {
  if (alpha <= 0.01) return;
  const rad = Math.max(1.5, radiusPx * Math.sqrt(r.zoom));
  const X = r.ox + (x - y) * r.kx, Y = r.oy + (x + y) * r.ky - z * r.kz;
  const c = r.ctx;
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = Math.min(1, alpha);
  c.drawImage(sprite(hex), X - rad, Y - rad, rad * 2, rad * 2);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
}
/** Quantised hue → hex (for glow sprites with animated colour; 24 steps). */
const hueHex = [];
for (let i = 0; i < 24; i++) {
  const h = i * 15, s = 0.9, l = 0.62, k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  hueHex.push('#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join(''));
}
export const hueToHex = (h) => hueHex[(((Math.round(h / 15) % 24) + 24) % 24)];

// ---------------------------------------------------------------------------------------------
// Builders (all add to a Mesh). Points: x,y tiles; z metres.
// ---------------------------------------------------------------------------------------------
/** Vertical prism from a 2D outline. o: { top:'#hex'|false, capBias, win, glow, ga, emit, tag, sideOnly } */
export function extrude(m, pts, z0, z1, color, o = {}) {
  const [cx, cy] = centroid2(pts);
  const out = [cx, cy, (z0 + z1) / 2];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    m.face([[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], color,
      { out, win: o.win, glow: o.glow, ga: o.ga, emit: o.emit, tag: o.tag ?? i, data: o.data, seam: o.seam });
  }
  if (o.top !== false) {
    m.face(pts.map((p) => [p[0], p[1], z1]), o.top || color, { n: [0, 0, 1], bias: o.capBias || 0,
      glow: o.topGlow, ga: o.ga, emit: o.topEmit, tag: o.tag, data: o.data });
  }
}
/** Loft between rings [{z, pts}] with equal point counts. */
export function loftM(m, rings, color, o = {}) {
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1], n = A.pts.length;
    const [ax, ay] = centroid2(A.pts), [bx, by] = centroid2(B.pts);
    const out = [(ax + bx) / 2, (ay + by) / 2, (A.z + B.z) / 2];
    for (let i = 0; i < n; i++) {
      const p = A.pts[i], q = A.pts[(i + 1) % n], p2 = B.pts[i], q2 = B.pts[(i + 1) % n];
      m.face([[p[0], p[1], A.z], [q[0], q[1], A.z], [q2[0], q2[1], B.z], [p2[0], p2[1], B.z]], color,
        { out, win: o.win, glow: o.glow, ga: o.ga, emit: o.emit, tag: o.tag ?? i, data: o.data ?? k, seam: o.seam });
    }
  }
  const T = rings[rings.length - 1];
  if (o.top !== false) m.face(T.pts.map((p) => [p[0], p[1], T.z]), o.top || color, { n: [0, 0, 1], bias: o.capBias || 0, glow: o.topGlow, ga: o.ga });
}
/** Surface of revolution. profile: [[radiusMetres, z], ...] bottom→top. */
export function lathe(m, cx, cy, profile, sides, color, o = {}) {
  const rings = profile.map(([rad, z]) => ({ z, pts: circle(cx, cy, Math.max(rad, 0.01), sides, o.rot || 0) }));
  loftM(m, rings, color, o);
}
export function circle(cx, cy, radM, sides, rot = 0) {
  const out = [];
  for (let i = 0; i < sides; i++) { const a = rot + (i / sides) * TAU; out.push([cx + (Math.cos(a) * radM) / 100, cy + (Math.sin(a) * radM) / 100]); }
  return out;
}
/** Hemispherical-ish dome. */
export function domeM(m, cx, cy, radM, z, hM, sides, color, o = {}) {
  const prof = [];
  const st = o.steps || 5;
  for (let i = 0; i <= st; i++) { const a = (i / st) * (Math.PI / 2); prof.push([Math.cos(a) * radM + (i === st ? 0.01 : 0), z + Math.sin(a) * hM]); }
  lathe(m, cx, cy, prof, sides, color, o);
}
/** Axis-aligned box in world tiles (x,y,w,d) z..z+h metres. */
export function boxM(m, x, y, z, w, d, h, color, o = {}) {
  extrude(m, [[x, y], [x + w, y], [x + w, y + d], [x, y + d]], z, z + h, color, o);
}
/** Tube along a 3D path (points [x,y,z]); radius metres. closed: loop. */
export function tube(m, path, radM, sides, color, o = {}) {
  const n = path.length, closed = !!o.closed;
  const rings = [];
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let tx = (b[0] - a[0]) * 100, ty = (b[1] - a[1]) * 100, tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // reference up
    let ux = 0, uy = 0, uz = 1;
    if (Math.abs(tz) > 0.9) { ux = 1; uz = 0; }
    // n1 = t × up, n2 = t × n1
    let ax = ty * uz - tz * uy, ay = tz * ux - tx * uz, az = tx * uy - ty * ux;
    const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
    const bx = ty * az - tz * ay, by = tz * ax - tx * az, bz = tx * ay - ty * ax;
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const t = (k / sides) * TAU, cs = Math.cos(t) * radM, sn = Math.sin(t) * radM;
      ring.push([p[0] + (ax * cs + bx * sn) / 100, p[1] + (ay * cs + by * sn) / 100, p[2] + az * cs + bz * sn]);
    }
    rings.push(ring);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const A = rings[i], B = rings[(i + 1) % n], pa = path[i], pb = path[(i + 1) % n];
    const out = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      m.face([A[k], A[k2], B[k2], B[k]], color, { out, glow: o.glow, ga: o.ga, emit: o.emit, tag: o.tag ?? i, data: o.data ?? i, seam: o.seam });
    }
  }
}
/** Flat polygon (ground decoration) at height z. */
export function flatM(m, pts, z, color, o = {}) {
  return m.face(pts.map((p) => [p[0], p[1], z]), color, { n: [0, 0, 1], ...o });
}

// ---------------------------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------------------------
/** Build a landmark entry (adds x,y from lat/lon) and push it to app.landmarks. */
export function entry(app, e) {
  const [x, y] = app.geo.toWorld(e.lat, e.lon);
  const out = { ...e, x, y };
  app.landmarks.push(out);
  return out;
}

/** Shadow footprint helpers */
export const shadowOf = (pts, h) => ({ pts: pts.map((p) => [p[0], p[1]]), h });

/**
 * Add a scene object. obj: { x, y, bbox?, mesh?, draw?, shadow?, minZoom?, maxZoom?, depth? }
 * If `mesh` is given and no draw, draws the mesh (with obj.fx). bbox defaults to the mesh bounds.
 */
export function add(app, pick, obj) {
  if (obj.mesh && !obj.bbox) obj.bbox = obj.mesh.bbox();
  if (obj.mesh && !obj.draw) { const m = obj.mesh, fx = obj.fx || null; obj.draw = (r) => m.draw(r, fx); }
  if (obj.x == null) { obj.x = (obj.bbox.x0 + obj.bbox.x1) / 2; obj.y = (obj.bbox.y0 + obj.bbox.y1) / 2; }
  if (pick) { obj.pick = pick; obj.id = obj.id || pick.id; }
  app.scene.add(obj);
  return obj;
}

// Scaled render context: draws everything enlarged by s about world anchor (ax, ay). Used for
// low-zoom "icon" exaggeration of the four signature silhouettes.
const scaledPool = [];
export function scaled(r, ax, ay, s, slot = 0) {
  let q = scaledPool[slot];
  if (!q) q = scaledPool[slot] = {};
  q.ctx = r.ctx; q.L = r.L; q.t = r.t; q.hours = r.hours; q.night = r.night; q.vw = r.vw; q.vh = r.vh; q.dpr = r.dpr; q.cam = r.cam;
  q.zoom = r.zoom * s; q.kx = r.kx * s; q.ky = r.ky * s; q.kz = r.kz * s;
  q.ox = r.ox + (ax - ay) * r.kx * (1 - s);
  q.oy = r.oy + (ax + ay) * r.ky * (1 - s);
  q.X = (x, y) => q.ox + (x - y) * q.kx;
  q.Y = (x, y, z = 0) => q.oy + (x + y) * q.ky - z * q.kz;
  return q;
}
export const ICON_ZOOM = 0.2;
export const iconScale = (zoom) => clamp(Math.pow(ICON_ZOOM / zoom, 0.75), 1, 2.6);

/**
 * Register a signature landmark with a real-size object (zoom ≥ ICON_ZOOM) and an exaggerated icon
 * object (zoom < ICON_ZOOM). drawFull(r) / drawIcon(r) draw in world coordinates.
 */
export function addWithIcon(app, pick, obj, drawIcon, boost = 1) {
  const full = add(app, pick, { ...obj, minZoom: ICON_ZOOM });
  const b = full.bbox, ax = obj.x ?? full.x, ay = obj.y ?? full.y, S = 2.6 * boost;
  const ib = { x0: ax - (ax - b.x0) * S, y0: ay - (ay - b.y0) * S, x1: ax + (b.x1 - ax) * S, y1: ay + (b.y1 - ay) * S, h: b.h * S };
  add(app, pick, { x: ax, y: ay, bbox: ib, shadow: obj.shadow, maxZoom: ICON_ZOOM, id: pick.id + '-icon',
    draw: (r) => drawIcon(scaled(r, ax, ay, 1 + (iconScale(r.zoom) - 1) * boost, 0)) });
  return full;
}

/** Remove previously-added non-landmark scene objects whose anchor lies inside a polygon (site clearance). */
export function clearSite(app, pts, maxSpan = 4) {
  const S = app.scene.statics;
  let removed = 0;
  for (let i = S.length - 1; i >= 0; i--) {
    const o = S[i];
    if (o.pick && o.pick.category) continue;
    if (o._lm) continue;
    const b = o.bbox;
    if (b && (b.x1 - b.x0 > maxSpan || b.y1 - b.y0 > maxSpan)) continue;
    if (inPoly(o.x, o.y, pts)) { S.splice(i, 1); removed++; }
  }
  if (removed) app.scene.dirty = true;
  return removed;
}
export function inPoly(x, y, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/** Draw a flat world polygon directly (for underlays): fill is a css string. */
export function fillPoly(r, pts, z, fill) {
  const c = r.ctx;
  c.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const X = r.ox + (p[0] - p[1]) * r.kx, Y = r.oy + (p[0] + p[1]) * r.ky - z * r.kz;
    i ? c.lineTo(X, Y) : c.moveTo(X, Y);
  }
  c.closePath();
  c.fillStyle = fill; c.fill();
}
/** Is a world bbox on screen? (for underlays / overlays that do their own culling) */
export function onScreen(r, x0, y0, x1, y1, h = 0) {
  const px0 = r.ox + (x0 - y1) * r.kx, px1 = r.ox + (x1 - y0) * r.kx;
  const py0 = r.oy + (x0 + y0) * r.ky - h * r.kz, py1 = r.oy + (x1 + y1) * r.ky;
  return !(px1 < 0 || px0 > r.vw || py1 < 0 || py0 > r.vh);
}
