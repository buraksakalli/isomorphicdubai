// World-space geometry for the terrain, built once from js/data/geo.js.
// Everything here is in world tiles (x = east, y = south). Polygons are arrays of [x, y].
import { toWorld, W, H } from '../../core/geo.js';
import { COAST, CREEK, CANAL, RAS_AL_KHOR, ISLANDS, ROADS, LAKES, MARINA_CANAL, MARINA_ENTRANCE } from '../../data/geo.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

// ---------- small helpers ----------
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function bboxOf(pts, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
export function unionBox(a, b) {
  if (!a) return { ...b };
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}
export function inPoly(x, y, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
export function area(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}
const orient = (pts) => (area(pts) < 0 ? pts.reverse() : pts); // all polygons positive (same winding)

/** distance from point to segment, plus param t */
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}
export function polylineDist(px, py, pts) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return d;
}

/** Catmull-Rom smoothing of an open polyline. Extra per-vertex values (index >= 2) are interpolated linearly. */
export function smoothLine(pts, seg = 4) {
  if (pts.length < 3) return pts.map((p) => p.slice());
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      const q = [];
      for (let c = 0; c < p1.length; c++) {
        if (c < 2) q.push(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
        else q.push(p1[c] + (p2[c] - p1[c]) * t);
      }
      out.push(q);
    }
  }
  out.push(pts[n - 1].slice());
  return out;
}
/** Chaikin smoothing for closed polygons. */
export function chaikin(pts, iter = 2) {
  let p = pts;
  for (let k = 0; k < iter; k++) {
    const o = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = o;
  }
  return p;
}

/** Polygon around a centreline [[x,y,w],...] (w = full width in tiles) with optional round caps. */
export function strip(line, capA = true, capB = true, capSeg = 6) {
  const n = line.length, L = [], R = [];
  const nrm = [];
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    nrm.push([-dy, dx]);
  }
  for (let i = 0; i < n; i++) {
    const p = line[i], h = p[2] / 2, q = nrm[i];
    L.push([p[0] + q[0] * h, p[1] + q[1] * h]);
    R.push([p[0] - q[0] * h, p[1] - q[1] * h]);
  }
  const out = L.slice();
  const cap = (p, q, h, dirSign) => {
    // semicircle from left side to right side around the end, bulging along +/- tangent
    const a0 = Math.atan2(q[1], q[0]);
    for (let k = 1; k < capSeg; k++) {
      const a = a0 - dirSign * (Math.PI * k) / capSeg;
      out.push([p[0] + Math.cos(a) * h, p[1] + Math.sin(a) * h]);
    }
  };
  if (capB) cap(line[n - 1], nrm[n - 1], line[n - 1][2] / 2, 1);
  for (let i = n - 1; i >= 0; i--) out.push(R[i]);
  if (capA) {
    const q = [-nrm[0][0], -nrm[0][1]];
    cap(line[0], q, line[0][2] / 2, 1);
  }
  return out;
}

const wpt = ([la, lo]) => toWorld(la, lo);
const wptw = ([la, lo, wm]) => { const [x, y] = toWorld(la, lo); return [x, y, wm / 100]; };

// ---------- Palm generator ----------
function buildPalm(isl) {
  const [bx, by] = wpt(isl.base), [cx, cy] = wpt(isl.crown);
  let ux = cx - bx, uy = cy - by;
  const L = Math.hypot(ux, uy);
  ux /= L; uy /= L;
  const nx = -uy, ny = ux; // left normal
  const P = (s, t) => [bx + ux * s + nx * t, by + uy * s + ny * t]; // local (along, across) -> world
  const R = (isl.crescentR || 2.6) * 10, CW = Math.max(1.2, (isl.crescentW || 0.2) * 10);
  const F = (isl.frondLen || 1.25) * 10;
  const trunkW = Math.max(2.2, L * 0.085);
  const polys = [];
  const fronds = [];
  // trunk: from slightly inland to crown, gentle taper
  const trunkLine = [];
  for (let k = 0; k <= 8; k++) { const s = -2 + (L + 2) * (k / 8); trunkLine.push([...P(s, 0), trunkW * (1 - 0.18 * (k / 8))]); }
  polys.push(strip(trunkLine, false, true, 8));
  // crown head (spine top)
  const head = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; head.push(P(L + 0.6 + Math.cos(a) * trunkW * 0.7, Math.sin(a) * trunkW * 0.8)); }
  polys.push(head);
  // crescent centre: apex sits ~0.66 R beyond the crown
  const cOff = L - 0.34 * R;
  const [ccx, ccy] = P(cOff, 0);
  const inner = R - CW / 2 - 1.6;
  const nf = Math.max(2, Math.round((isl.fronds || 16) / 2));
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < nf; i++) {
      const f = i / (nf - 1);
      const s0 = L * (0.3 + 0.66 * f);
      const ang = (80 - 50 * f) * D2R; // from the axis, bottom fronds nearly perpendicular
      let len = F * (0.78 + 0.32 * Math.sin(Math.PI * (0.25 + 0.7 * f)));
      if (i === nf - 1) len *= 0.8;
      const fw = 0.78;
      // curved frond, bending slightly toward the crown
      const line = [];
      const steps = 6;
      let s = s0, t = side * trunkW * 0.35, a = ang;
      line.push([...P(s, t), fw]);
      for (let k = 1; k <= steps; k++) {
        const segL = len / steps;
        a = ang - (k / steps) * 12 * D2R;
        s += Math.cos(a) * segL; t += side * Math.sin(a) * segL;
        // keep within the crescent lagoon
        const [wx, wy] = P(s, t);
        if (Math.hypot(wx - ccx, wy - ccy) > inner) break;
        line.push([wx, wy, fw * (k === steps ? 0.9 : 1)]);
      }
      if (line.length < 2) continue;
      polys.push(strip(line, false, true, 6));
      fronds.push({ side, index: i, pts: line.map((p) => [p[0], p[1]]), w: fw });
    }
  }
  // crescent arc with two breaks for water circulation
  const span = (isl.crescentSpan || 119) * D2R;
  const gaps = [-0.62, 0.62]; // fractions of span where the breakwater opens
  const a0 = Math.atan2(uy, ux);
  const pieces = [];
  let cur = [];
  const steps = 64;
  for (let k = 0; k <= steps; k++) {
    const f = -1 + (2 * k) / steps;
    const isGap = gaps.some((g) => Math.abs(f - g) < 0.022);
    if (isGap) { if (cur.length > 1) pieces.push(cur); cur = []; continue; }
    const a = a0 + f * span;
    cur.push([ccx + Math.cos(a) * R, ccy + Math.sin(a) * R, CW * (1 - 0.25 * Math.abs(f) ** 3)]);
  }
  if (cur.length > 1) pieces.push(cur);
  for (const pc of pieces) polys.push(strip(pc, true, true, 5));
  // wider land at the apex (resort island)
  const apex = [ccx + Math.cos(a0) * R, ccy + Math.sin(a0) * R];
  const blob = [];
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * TAU;
    const ex = Math.cos(a) * CW * 1.3, ey = Math.sin(a) * CW * 3.2; // along / across the axis
    blob.push([apex[0] + ux * ex + nx * ey, apex[1] + uy * ex + ny * ey]);
  }
  polys.push(blob);
  return {
    polys: polys.map(orient),
    palm: { id: isl.id, base: [bx, by], crown: [cx, cy], u: [ux, uy], n: [nx, ny], length: L, trunkW,
      trunk: trunkLine.map((p) => [p[0], p[1]]), fronds,
      crescent: { c: [ccx, ccy], r: R, w: CW, a0, span }, apex },
  };
}

// ---------- The World archipelago ----------
// Coarse continent outlines (lon, lat). Purely illustrative.
const CONTINENTS = [
  [[-165, 66], [-150, 71], [-120, 72], [-95, 73], [-80, 68], [-62, 58], [-55, 50], [-68, 44], [-76, 36], [-80, 26], [-88, 30], [-97, 25], [-95, 18], [-84, 10], [-78, 8], [-90, 15], [-105, 20], [-117, 32], [-124, 42], [-128, 52], [-140, 60], [-160, 58]],
  [[-80, 10], [-72, 12], [-60, 8], [-50, 0], [-35, -6], [-40, -22], [-48, -28], [-58, -38], [-66, -48], [-70, -55], [-74, -48], [-72, -30], [-71, -18], [-77, -10], [-81, -3]],
  [[-48, 60], [-22, 70], [-20, 80], [-40, 83], [-62, 80], [-58, 70]],
  [[-10, 36], [-9, 43], [-2, 48], [-4, 54], [5, 58], [8, 63], [20, 70], [30, 71], [42, 66], [50, 60], [52, 47], [40, 42], [28, 40], [26, 36], [18, 40], [12, 44], [8, 44], [2, 40], [-4, 36]],
  [[-17, 21], [-12, 30], [-6, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 11], [46, 2], [40, -10], [40, -18], [33, -26], [26, -34], [18, -34], [12, -18], [13, -6], [9, 2], [4, 6], [-8, 4], [-15, 10]],
  [[44, 48], [55, 55], [62, 68], [80, 74], [105, 78], [140, 73], [175, 68], [170, 60], [155, 58], [142, 50], [135, 42], [127, 35], [122, 28], [118, 22], [108, 15], [106, 10], [100, 6], [98, 16], [92, 22], [88, 22], [80, 10], [77, 8], [72, 20], [66, 25], [58, 25], [56, 27], [50, 30], [48, 38]],
  [[36, 32], [44, 30], [50, 26], [56, 24], [59, 22], [55, 16], [52, 16], [45, 13], [42, 16], [38, 22], [34, 28]],
  [[113, -22], [115, -34], [125, -33], [136, -35], [145, -39], [151, -34], [153, -26], [146, -18], [142, -11], [136, -12], [130, -13], [122, -18]],
  [[130, 33], [133, 35], [140, 40], [142, 44], [140, 36], [135, 34]],
  [[-6, 50], [-5, 58], [0, 57], [1, 52]],
  [[95, 5], [105, -6], [118, -9], [125, -9], [140, -6], [150, -8], [130, -2], [118, 2], [110, 2], [100, 4]],
  [[44, -14], [48, -14], [50, -24], [45, -25]],
  [[166, -45], [172, -40], [178, -37], [174, -42], [169, -47]],
];
function buildWorld(isl) {
  const [cx, cy] = wpt(isl.center);
  const rx = (isl.rx || 4.2) * 10, ry = (isl.ry || 3) * 10;
  const toW = (lon, lat) => [cx + (lon / 180) * rx, cy - ((lat - 12) / 70) * ry];
  const conts = CONTINENTS.map((c) => c.map(([lo, la]) => toW(lo, la)));
  const rand = rng(77);
  const polys = [];
  const sp = 2.15;
  for (let gy = cy - ry * 1.05; gy <= cy + ry * 1.05; gy += sp * 0.88) {
    const row = Math.round((gy - cy) / (sp * 0.88));
    for (let gx = cx - rx * 1.02 + (row & 1) * sp * 0.5; gx <= cx + rx * 1.02; gx += sp) {
      const px = gx + (rand() - 0.5) * 0.7, py = gy + (rand() - 0.5) * 0.6;
      if (!conts.some((c) => inPoly(px, py, c))) { rand(); continue; }
      const r = 0.48 + rand() * 0.42, n = 7, rot = rand() * TAU, el = 0.75 + rand() * 0.5;
      const pts = [];
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * TAU, rr = r * (0.82 + rand() * 0.3);
        pts.push([px + Math.cos(a) * rr * el, py + Math.sin(a) * rr / el]);
      }
      polys.push(orient(chaikin(pts, 1)));
    }
  }
  // oval breakwater with openings
  const bw = [];
  let cur = [];
  const steps = 120;
  for (let k = 0; k <= steps; k++) {
    const f = k / steps, a = f * TAU;
    const open = [0.08, 0.33, 0.58, 0.83].some((g) => Math.abs(f - g) < 0.012);
    if (open) { if (cur.length > 1) bw.push(cur); cur = []; continue; }
    cur.push([cx + Math.cos(a) * rx * 1.13, cy + Math.sin(a) * ry * 1.22, 0.55]);
  }
  if (cur.length > 1) bw.push(cur);
  const breakwater = bw.map((l) => orient(strip(l, true, true, 4)));
  return { polys, breakwater, center: [cx, cy], rx, ry };
}

// ---------- main builder ----------
export function buildGeometry() {
  // Mainland: smoothed coast + far closing points (land lies to the SE).
  const coastRaw = COAST.map(wpt);
  // extend the ends beyond the grid so the coast reaches the edges
  const e0 = coastRaw[0], e1 = coastRaw[1];
  const z0 = coastRaw[coastRaw.length - 1], z1 = coastRaw[coastRaw.length - 2];
  const ext = (a, b, k) => [a[0] + (a[0] - b[0]) * k, a[1] + (a[1] - b[1]) * k];
  const coastLine = smoothLine([ext(e0, e1, 0.6), ...coastRaw, ext(z0, z1, 0.6)], 5);
  const mainland = orient([...coastLine, [W + 40, -40], [W + 40, H + 40], [-40, H + 40]]);

  const islands = [];
  const palms = [];
  let world = null;
  for (const isl of ISLANDS) {
    if (isl.kind === 'palm') {
      const g = buildPalm(isl);
      palms.push(g.palm);
      islands.push({ id: isl.id, kind: 'palm', beach: true, polys: g.polys, palm: g.palm, ground: isl.ground });
    } else if (isl.kind === 'world') {
      world = buildWorld(isl);
      islands.push({ id: isl.id, kind: 'world', beach: true, polys: world.polys, ground: isl.ground });
      islands.push({ id: isl.id + '-breakwater', kind: 'breakwater', beach: false, polys: world.breakwater, ground: 'rock' });
    } else {
      const pts = orient(chaikin(isl.pts.map(wpt), 2));
      islands.push({ id: isl.id, kind: 'poly', beach: isl.beach !== false, polys: [pts], ground: isl.ground });
    }
  }
  for (const s of islands) {
    s.boxes = s.polys.map((p) => bboxOf(p));
    s.bbox = s.boxes.reduce((a, b) => unionBox(a, b), null);
  }

  // Inland waters
  const waters = [];
  const creekLine = CREEK.map(wptw);
  { // extend the mouth seaward
    const a = creekLine[0], b = creekLine[1];
    const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy);
    creekLine.unshift([a[0] + (dx / l) * 3, a[1] + (dy / l) * 3, a[2] * 1.15]);
  }
  const creekS = smoothLine(creekLine, 5);
  waters.push({ id: 'creek', kind: 'creek', line: creekS, pts: orient(strip(creekS, false, true, 8)) });
  const canalLine = CANAL.map(wptw);
  { const n = canalLine.length, a = canalLine[n - 1], b = canalLine[n - 2];
    const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy);
    canalLine.push([a[0] + (dx / l) * 3, a[1] + (dy / l) * 3, a[2]]); }
  const canalS = smoothLine(canalLine, 5);
  waters.push({ id: 'canal', kind: 'canal', line: canalS, pts: orient(strip(canalS, true, false, 6)) });
  const marS = smoothLine(MARINA_CANAL.map(wptw), 5);
  waters.push({ id: 'marina', kind: 'marina', line: marS, pts: orient(strip(marS, true, true, 8)) });
  const entr = MARINA_ENTRANCE.map(wptw);
  { const n = entr.length, a = entr[n - 1], b = entr[n - 2];
    const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy);
    entr.push([a[0] + (dx / l) * 2.5, a[1] + (dy / l) * 2.5, a[2]]); }
  const entrS = smoothLine(entr, 4);
  waters.push({ id: 'marina-entrance', kind: 'marina', line: entrS, pts: orient(strip(entrS, false, false)) });
  waters.push({ id: 'ras-al-khor', kind: 'lagoon', pts: orient(chaikin(RAS_AL_KHOR.map(wpt), 3)) });
  for (const lk of LAKES) waters.push({ id: lk.id, kind: 'lake', pts: orient(chaikin(lk.pts.map(wpt), 2)) });
  for (const w of waters) w.bbox = bboxOf(w.pts);

  // Roads (world, smoothed)
  const roads = ROADS.map((r) => {
    const pts = r.loop ? chaikin(r.pts.slice(0, -1).map(wpt), 3) : smoothLine(r.pts.map(wpt), 4);
    if (r.loop) pts.push(pts[0].slice());
    return { id: r.id, name: r.name, kind: r.kind, width: r.width / 100, pts, bbox: bboxOf(pts, r.width / 100) };
  });

  return { coastLine, mainland, islands, palms, world, waters, roads };
}
