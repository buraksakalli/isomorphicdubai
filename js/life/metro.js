// Dubai Metro: elevated viaducts (static, split into short pieces for depth sorting), shell stations,
// an underground section through Deira / Bur Dubai, and 5-car trains running a timetable with ~20 s dwells.
import { METRO, ROADS } from '../data/geo.js';
import { Path, catmullRom, clamp, lerp, smooth, offsetPolyline } from './util.js';

const DECK_Z = 11;      // top of deck (m)
const DECK_T = 1.9;     // deck thickness (m)
const DECK_HW = 0.052;  // deck half width (tiles)
const TRACK = 0.023;    // track centre offset from axis (tiles)
const PIECE = 0.42;     // viaduct piece length (tiles)
const RAMP = 2.2;       // tunnel ramp length (tiles)
const ST_HL = 0.62;     // station half length (tiles)
const ST_HW = 0.13;     // station platform half width (tiles)
const CAR_L = 0.172;    // car length incl. gap (tiles)
const NCARS = 5;
const V = 0.22, A = 0.011; // cruise speed (tiles/s), acceleration (tiles/s²)
const DWELL = 20, TURN = 75, HEADWAY = 255;
const CONCRETE = '#dcd6ca', DECK_TOP = '#c7c1b4', SHELL = '#d6dce2', BODY = '#d9dde1';
// underground spans as [station index a, fraction, station index b, fraction] along each line (data order)
// (by station name, so data edits don't silently shift the tunnel)
const UNDER = {
  red: [['Deira City Centre', 0.55], ['BurJuman', 0.45]],   // DCC→Union … BurJuman→ADCB (Creek crossing in tunnel)
  green: [['Salah Al Din', 0.5], ['BurJuman', 0.5]],        // Salah Al Din→Union … BurJuman→Oud Metha (Deira / Al Ras / Bur Dubai core)
};
const TAIL = 0.75;      // tail track beyond a terminus (tiles); a 5-car train is ~0.86 long
const XO = 0.7;         // length of the crossover a train takes when leaving a terminus on the other track (tiles)
const HALF_TRAIN = ((NCARS - 1) / 2) * CAR_L; // centre → leading car centre: the crossover starts at the lead car
const GUIDE_STEP = 1;   // spacing of guide points between corridor stations (tiles)
// Alignment rules per line id.
//  road: follow a ROADS polyline (as smoothed by the terrain) at a constant sideways offset. Stations within
//        `corridor` tiles of that offset line are snapped onto it and the track between them follows it, so the
//        viaduct runs beside the carriageway without kinks. side: +1 = right of the road's point order
//        (e11 runs SW→NE, so +1 = south-east / inland, -1 = north-west / seaward).
//        NOTE: the real Red Line runs on the south-east (Za'abeel / Downtown) side between Max and Business Bay, but
//        the Museum of the Future, World Trade Centre and JW Marriott Marquis landmarks sit only ~25–70 m SE of
//        this map's SZR centreline, so a SE viaduct would cut through them. Flip to +1 once they are moved off the road.
//  branchOf: a branch whose first station is a separate platform at `off` tiles beside station `at` of that line,
//        leaving it at right angles for `straight` tiles (a T-shaped interchange) before curving away.
//  via: extra shaping points { after: station name, ll: [lat, lon] } (approximate; keeps the track clear of landmarks).
const ALIGN = {
  red: { road: 'e11', side: -1, off: 0.5, corridor: 4 },
  // via: approach Expo 2020 from the north so the viaduct passes west of the Al Wasl Dome, not through it
  route2020: { branchOf: 'red', at: 'Jebel Ali', off: 1.5, straight: 1.6, tail0: 0.6,
    via: [{ after: 'Dubai Investments Park', ll: [24.9725, 55.1462] }] },
};

/** Road centreline in world tiles: the terrain's smoothed version when present, else the raw data. */
function roadPts(app, id) {
  const tr = app.terrain && Array.isArray(app.terrain.roads) ? app.terrain.roads.find((r) => r.id === id) : null;
  if (tr && tr.pts && tr.pts.length > 1) return tr.pts.map((p) => [p[0], p[1]]);
  const rd = ROADS.find((r) => r.id === id);
  return rd ? catmullRom(app.geo.llPts(rd.pts), 1).pts : null;
}

/** Closest point on a Path → { s (arc length), d (distance) }. */
function project(path, x, y) {
  let best = 1e18, bs = 0;
  for (let i = 0; i < path.n - 1; i++) {
    const ax = path.x[i], ay = path.y[i], ux = path.ux[i], uy = path.uy[i];
    const t = clamp((x - ax) * ux + (y - ay) * uy, 0, path.cum[i + 1] - path.cum[i]);
    const dx = x - ax - ux * t, dy = y - ay - uy * t, d = dx * dx + dy * dy;
    if (d < best) { best = d; bs = path.cum[i] + t; }
  }
  return { s: bs, d: Math.sqrt(best) };
}

const extend = (a, b, d) => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [a[0] + (dx / l) * d, a[1] + (dy / l) * d]; };

/**
 * Control points for a line: [{ p:[x,y], k }] where k is the station index (or -1 for shaping points),
 * including a tail point at each end. `lines` holds the lines built so far (for branches).
 */
export function lineControls(def, toWorld, guideOf, lines = []) {
  const st = def.stations.map((s) => toWorld(s[2], s[3]));
  const n = st.length;
  const A = ALIGN[def.id] || {};
  const ctl = [];
  // ---- branch: T-shaped interchange beside a station of the parent line ----
  if (A.branchOf) {
    const par = lines.find((l) => l.id === A.branchOf);
    const pk = par ? par.def.stations.findIndex((s) => s[0] === A.at) : -1;
    if (par && pk >= 0 && n >= 2) {
      const smp = { x: 0, y: 0, z: 0, ux: 0, uy: 0, i: 0 };
      par.path.atSmooth(par.stS[pk], smp);
      let nx = -smp.uy, ny = smp.ux;
      if (nx * (st[1][0] - smp.x) + ny * (st[1][1] - smp.y) < 0) { nx = -nx; ny = -ny; }
      const at = (d) => [smp.x + nx * d, smp.y + ny * d];
      // two straight shaping points keep the platform (±ST_HL) straight; the curve starts beyond it
      ctl.push({ p: at(A.off - (A.tail0 ?? TAIL)), k: -1 }, { p: at(A.off), k: 0 },
        { p: at(A.off + A.straight / 2), k: -1 }, { p: at(A.off + A.straight), k: -1 });
      for (let k = 1; k < n; k++) {
        ctl.push({ p: st[k], k });
        for (const v of A.via || []) if (v.after === def.stations[k][0]) ctl.push({ p: toWorld(v.ll[0], v.ll[1]), k: -1 });
      }
      ctl.push({ p: extend(ctl[ctl.length - 1].p, ctl[ctl.length - 2].p, TAIL), k: -1 }); // continue the approach direction
      return ctl;
    }
  }
  // ---- road corridor ----
  const guide = A.road ? guideOf(A.road, A.side * A.off) : null;
  const pr = guide ? st.map((p) => project(guide, p[0], p[1])) : null;
  const inC = st.map((_, k) => !!pr && pr[k].d < A.corridor && pr[k].s > 0.01 && pr[k].s < guide.length - 0.01);
  const smp = { x: 0, y: 0, z: 0, ux: 0, uy: 0, i: 0 };
  const G = (s) => { guide.at(clamp(s, 0, guide.length), smp); return [smp.x, smp.y]; };
  const tail = (k, k2) => {
    if (inC[k] && inC[k2]) {
      const s = pr[k].s - Math.sign(pr[k2].s - pr[k].s) * TAIL;
      if (s > 0 && s < guide.length) return G(s);
    }
    return extend(inC[k] ? G(pr[k].s) : st[k], inC[k2] ? G(pr[k2].s) : st[k2], TAIL);
  };
  ctl.push({ p: tail(0, 1), k: -1 });
  for (let k = 0; k < n; k++) {
    ctl.push({ p: inC[k] ? G(pr[k].s) : st[k], k });
    if (k < n - 1 && inC[k] && inC[k + 1]) {
      const a = pr[k].s, b = pr[k + 1].s, m = Math.max(1, Math.round(Math.abs(b - a) / GUIDE_STEP));
      for (let j = 1; j < m; j++) ctl.push({ p: G(lerp(a, b, j / m)), k: -1 });
    }
  }
  ctl.push({ p: tail(n - 1, n - 2), k: -1 });
  return ctl;
}

/** Offset guide line beside a road (cached per road id + offset). */
function guideFactory(app) {
  const cache = new Map();
  return (id, off) => {
    const key = id + ':' + off;
    if (!cache.has(key)) {
      const pts = roadPts(app, id);
      cache.set(key, pts && pts.length > 1 ? new Path(offsetPolyline(pts, off)) : null);
    }
    return cache.get(key);
  };
}

export function createMetro(app) {
  const g = app.geo;
  const lines = [];
  const kiosks = new Map();
  let statics = 0;

  const guideOf = guideFactory(app);
  for (const def of METRO) {
    if (!def.stations || def.stations.length < 2) continue;
    // control points: stations (snapped to a road corridor where configured), shaping points and tail tracks
    // beyond the termini so whole trains fit at the end stations
    const ctl = lineControls(def, g.toWorld, guideOf, lines);
    const cr = catmullRom(ctl.map((c) => c.p), 0.12);
    const path = new Path(cr.pts);
    const stS = [];
    ctl.forEach((c, i) => { if (c.k >= 0) stS[c.k] = path.cum[cr.idx[i]]; });
    const u = UNDER[def.id];
    const ui = u ? u.map(([nm]) => def.stations.findIndex((d) => d[0] === nm)) : null;
    const under = u && ui.every((i) => i >= 0 && i < stS.length - 1) && ui[0] < ui[1]
      ? [lerp(stS[ui[0]], stS[ui[0] + 1], u[0][1]), lerp(stS[ui[1]], stS[ui[1] + 1], u[1][1])] : null;
    const zAt = (s) => {
      if (!under) return DECK_Z;
      if (s >= under[0] && s <= under[1]) return 0;
      if (s > under[0] - RAMP && s < under[0]) return (DECK_Z * (under[0] - s)) / RAMP;
      if (s > under[1] && s < under[1] + RAMP) return (DECK_Z * (s - under[1])) / RAMP;
      return DECK_Z;
    };
    const line = { id: def.id, def, name: def.name, color: def.color, path, stS, zAt, under, trains: [], cars: [] };
    lines.push(line);

    // ---- static viaduct pieces + stations ----
    const smp = { x: 0, y: 0, z: 0, ux: 0, uy: 0, i: 0 };
    const sample = (s) => { path.atSmooth(s, smp); return { x: smp.x, y: smp.y, nx: -smp.uy, ny: smp.ux, ux: smp.ux, uy: smp.uy, z: zAt(s) }; };
    const stRanges = [];
    def.stations.forEach((d, k) => {
      const s = stS[k], z = zAt(s);
      if (z > DECK_Z - 0.01) stRanges.push([s - ST_HL, s + ST_HL, k]);
      else if (!kiosks.has(d[0])) {
        const p = sample(s);
        kiosks.set(d[0], true);
        statics += addKiosk(app, p, def.color);
      }
    });
    // walk the line in pieces, breaking at station boundaries
    const breaks = [0, path.length];
    for (const [a, b] of stRanges) breaks.push(a, b);
    if (under) breaks.push(under[0] - RAMP, under[0], under[1], under[1] + RAMP);
    breaks.sort((a, b) => a - b);
    for (let bi = 0; bi < breaks.length - 1; bi++) {
      const a = Math.max(0, breaks[bi]), b = Math.min(path.length, breaks[bi + 1]);
      if (b - a < 1e-3) continue;
      const mid = (a + b) / 2;
      if (zAt(mid) <= 0.01 && zAt(a) <= 0.01 && zAt(b) <= 0.01) continue; // tunnel
      const station = stRanges.find((r) => mid > r[0] && mid < r[1]);
      const k = Math.max(1, Math.round((b - a) / PIECE));
      const spieces = [];
      for (let j = 0; j < k; j++) {
        const sa = a + ((b - a) * j) / k, sb = a + ((b - a) * (j + 1)) / k;
        const A = sample(sa), B = sample(sb);
        if (station) spieces.push(stationPiece(A, B, j === 0, j === k - 1));
        else statics += addDeck(app, A, B, line, zAt(sa) > 2.5);
      }
      if (station) statics += addStation(app, spieces, line);
      // portal mouth at the bottom of each ramp
      if (under && (Math.abs(b - under[0]) < 1e-6 || Math.abs(a - under[1]) < 1e-6)) {
        statics += addPortal(app, sample(Math.abs(b - under[0]) < 1e-6 ? under[0] : under[1]));
      }
    }

    // ---- timetable (train centre positions) ----
    // [t0, dur, sFrom, sTo, dir, mode]  mode: 0 normal, 1 terminus turnaround (still on the arrival track),
    // 2 departing a terminus (crossing over to the right-hand track)
    const legs = [];
    let t = 0;
    const n = stS.length;
    const runT = (d) => (d >= (V * V) / A ? d / V + V / A : 2 * Math.sqrt(d / A));
    for (let k = 0; k < n; k++) {
      const dw = k === 0 ? TURN : DWELL;
      legs.push([t, dw, stS[k], stS[k], 1, k === 0 ? 1 : 0]); t += dw;
      if (k < n - 1) { const d = stS[k + 1] - stS[k]; const T = runT(d); legs.push([t, T, stS[k], stS[k + 1], 1, k === 0 ? 2 : 0]); t += T; }
    }
    for (let k = n - 1; k >= 0; k--) {
      const dw = k === n - 1 ? TURN : DWELL;
      legs.push([t, dw, stS[k], stS[k], -1, k === n - 1 ? 1 : 0]); t += dw;
      if (k > 0) { const d = stS[k] - stS[k - 1]; const T = runT(d); legs.push([t, T, stS[k], stS[k - 1], -1, k === n - 1 ? 2 : 0]); t += T; }
    }
    line.legs = legs; line.cycle = t;
    const NT = Math.max(2, Math.round(t / HEADWAY));
    for (let i = 0; i < NT; i++) {
      const tr = { phase: (t * i) / NT, s: 0, dir: 1, cars: [] };
      for (let c = 0; c < NCARS; c++) {
        const car = { x: 0, y: 0, depth: 0, radius: 0.12, h: 22, hidden: true, minZoom: 0.12,
          ux: 1, uy: 0, z: DECK_Z, idx: c, train: tr, line, draw: drawCar };
        tr.cars.push(car); line.cars.push(car);
      }
      line.trains.push(tr);
    }
  }

  // ---- per-frame train placement ----
  const smp = { x: 0, y: 0, z: 0, ux: 0, uy: 0, i: 0 };
  const dyn = [];
  for (const l of lines) dyn.push(...l.cars);
  let enabled = true;
  const stats = { trains: 0, cars: 0, statics };
  const T0 = 3600; // start mid-service

  const lp = { s: 0, dir: 1, mode: 0, s0: 0 };
  function legPos(legs, ph) {
    let lo = 0, hi = legs.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (legs[m][0] <= ph) lo = m; else hi = m - 1; }
    const L = legs[lo], tau = clamp(ph - L[0], 0, L[1]);
    lp.dir = L[4]; lp.mode = L[5]; lp.s0 = L[2];
    if (L[2] === L[3]) { lp.s = L[2]; return lp; }
    const d = Math.abs(L[3] - L[2]), T = L[1];
    let x;
    if (d >= (V * V) / A) {
      const tA = V / A;
      if (tau < tA) x = 0.5 * A * tau * tau;
      else if (tau < T - tA) x = 0.5 * A * tA * tA + V * (tau - tA);
      else x = d - 0.5 * A * (T - tau) * (T - tau);
    } else {
      const h = T / 2;
      x = tau < h ? 0.5 * A * tau * tau : d - 0.5 * A * (T - tau) * (T - tau);
    }
    lp.s = L[2] + Math.sign(L[3] - L[2]) * x;
    return lp;
  }

  function inService(h) { return !(h >= 1 && h < 5); } // roughly 05:00 – 01:00

  function update() {
    const tt = app.clock.t + T0;
    const open = enabled && inService(app.clock.hours);
    let nt = 0, nc = 0;
    for (const l of lines) {
      for (const tr of l.trains) {
        if (!open) { for (const c of tr.cars) c.hidden = true; continue; }
        const p = legPos(l.legs, (tt + tr.phase) % l.cycle);
        tr.s = p.s; tr.dir = p.dir;
        let anyVis = false;
        for (let k = 0; k < NCARS; k++) {
          const car = tr.cars[k];
          const sc = p.s + (2 - k) * CAR_L; // fixed physical order (k=0 at the +s end) so cars keep their identity when a train reverses
          const sa = sc + p.dir * CAR_L * 0.48, sb = sc - p.dir * CAR_L * 0.48;
          l.path.at(sa, smp); const ax = smp.x, ay = smp.y;
          l.path.at(sb, smp); const bx = smp.x, by = smp.y;
          let ux = ax - bx, uy = ay - by; const len = Math.hypot(ux, uy) || 1; ux /= len; uy /= len;
          // right-hand track relative to travel direction; at a terminus the train reverses on its arrival track
          // and crosses over to the other one as it pulls out (no sideways jump when the direction flips)
          const side = p.mode === 1 ? -1 : p.mode === 2 ? 2 * smooth(0, XO, (sc - p.s0) * p.dir - HALF_TRAIN) - 1 : 1;
          const ox = -uy * TRACK * side, oy = ux * TRACK * side;
          car.x = (ax + bx) / 2 + ox; car.y = (ay + by) / 2 + oy;
          car.ux = ux; car.uy = uy; car.hl = len / 2;
          car.z = Math.min(l.zAt(sa), l.zAt(sb));
          car.hidden = car.z < 2.2;
          car.lead = k === (p.dir > 0 ? 0 : NCARS - 1); car.tail = k === (p.dir > 0 ? NCARS - 1 : 0);
          car.depth = Math.max(ax + ay, bx + by) + 0.035;
          if (!car.hidden) { anyVis = true; nc++; }
        }
        if (anyVis) nt++;
      }
    }
    stats.trains = nt; stats.cars = nc;
  }

  // low-zoom map lines (underlay)
  const view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function drawLowZoom(r) {
    const z = r.zoom;
    if (z >= 0.16) return;
    const c = r.ctx;
    const a = clamp((0.16 - z) / 0.06, 0, 1);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const l of lines) {
      const P = l.path;
      c.beginPath();
      let drawing = false;
      for (let i = 0; i < P.n; i++) {
        const zz = l.zAt(P.cum[i]);
        const X = r.ox + (P.x[i] - P.y[i]) * r.kx, Y = r.oy + (P.x[i] + P.y[i]) * r.ky - zz * r.kz;
        if (zz < 1) { drawing = false; continue; }
        if (!drawing) { c.moveTo(X, Y); drawing = true; } else c.lineTo(X, Y);
      }
      c.lineWidth = 1.6; c.strokeStyle = l.color; c.globalAlpha = 0.85 * a; c.stroke();
    }
    c.globalAlpha = 1;
  }
  app.scene.underlays.push(drawLowZoom);
  app.scene.dynamicSources.push(() => dyn);

  return {
    update, stats, lines,
    paths: lines.map((l) => ({ id: l.id, color: l.color, pts: Array.from({ length: l.path.n }, (_, i) => [l.path.x[i], l.path.y[i]]) })),
    setEnabled(v) { enabled = !!v; if (!enabled) for (const c of dyn) c.hidden = true; }, get enabled() { return enabled; },
  };
}

// ---------------- static pieces ----------------
function bboxOf(pts, h) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return { x0, y0, x1, y1, h };
}

function addDeck(app, A, B, line, pillar) {
  const hw = DECK_HW;
  const Al = [A.x - A.nx * hw, A.y - A.ny * hw], Ar = [A.x + A.nx * hw, A.y + A.ny * hw];
  const Bl = [B.x - B.nx * hw, B.y - B.ny * hw], Br = [B.x + B.nx * hw, B.y + B.ny * hw];
  // visible long side: right (+n) if it faces the viewer, else left
  const nx = (A.nx + B.nx) / 2, ny = (A.ny + B.ny) / 2;
  const side = nx + ny > 0 ? [Ar, Br, nx, ny] : [Al, Bl, -nx, -ny];
  const za = A.z, zb = B.z;
  const piece = { Al, Ar, Bl, Br, side, za, zb, pillar: pillar ? [A.x, A.y, A.ux, A.uy] : null, color: line.color };
  app.scene.add({
    x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, minZoom: 0.16,
    depth: Math.min(...[Al, Ar, Bl, Br].map((p) => p[0] + p[1])) - 0.02, // sorted by its back edge: trains on it draw after
    bbox: bboxOf([Al, Ar, Bl, Br], Math.max(za, zb) + 2),
    draw: (r) => drawDeck(r, piece),
  });
  return 1;
}

function drawDeck(r, p) {
  const c = r.ctx, L = r.L, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy;
  const X = (q) => ox + (q[0] - q[1]) * kx, Y = (q, z) => oy + (q[0] + q[1]) * ky - z * kz;
  // pillar (T-pier)
  if (p.pillar && r.zoom > 0.3) {
    const [px, py, ux, uy] = p.pillar;
    const zt = Math.min(p.za, p.zb) - DECK_T;
    if (zt > 1) {
      const sx = ox + (px - py) * kx, sy = oy + (px + py) * ky;
      const w = Math.max(1, 2.6 * kx / 100 * 1.6);
      c.fillStyle = L.shade(CONCRETE, 0.7, 0.7, 0);
      c.fillRect(sx - w / 2, sy - zt * kz, w, zt * kz);
      if (r.zoom > 0.9) {
        c.fillStyle = L.shade(CONCRETE, 1, 0, 0);
        c.fillRect(sx, sy - zt * kz, w / 2, zt * kz);
      }
    }
  }
  const za = p.za, zb = p.zb, [s0, s1, nx, ny] = p.side;
  // long side face
  c.beginPath();
  c.moveTo(X(s0), Y(s0, za)); c.lineTo(X(s1), Y(s1, zb)); c.lineTo(X(s1), Y(s1, zb - DECK_T)); c.lineTo(X(s0), Y(s0, za - DECK_T)); c.closePath();
  const sc = L.shade(CONCRETE, nx, ny, 0);
  c.fillStyle = sc; c.fill(); c.strokeStyle = sc; c.lineWidth = 0.5; c.stroke();
  // top
  c.beginPath();
  c.moveTo(X(p.Al), Y(p.Al, za)); c.lineTo(X(p.Ar), Y(p.Ar, za)); c.lineTo(X(p.Br), Y(p.Br, zb)); c.lineTo(X(p.Bl), Y(p.Bl, zb)); c.closePath();
  const tc = L.shade(DECK_TOP, 0, 0, 1);
  c.fillStyle = tc; c.fill(); c.strokeStyle = tc; c.stroke();
  if (r.zoom > 0.9) {
    // parapets + rails
    c.beginPath();
    c.moveTo(X(p.Al), Y(p.Al, za + 1.1)); c.lineTo(X(p.Bl), Y(p.Bl, zb + 1.1));
    c.moveTo(X(p.Ar), Y(p.Ar, za + 1.1)); c.lineTo(X(p.Br), Y(p.Br, zb + 1.1));
    c.strokeStyle = L.shade('#ebe7de', 0, 0, 1); c.lineWidth = Math.max(0.6, r.zoom * 0.8); c.stroke();
    if (r.zoom > 1.8) {
      c.beginPath();
      for (const f of [-0.62, -0.26, 0.26, 0.62]) {
        const a = [p.Al[0] + (p.Ar[0] - p.Al[0]) * (0.5 + f / 2), p.Al[1] + (p.Ar[1] - p.Al[1]) * (0.5 + f / 2)];
        const b = [p.Bl[0] + (p.Br[0] - p.Bl[0]) * (0.5 + f / 2), p.Bl[1] + (p.Br[1] - p.Bl[1]) * (0.5 + f / 2)];
        c.moveTo(X(a), Y(a, za + 0.2)); c.lineTo(X(b), Y(b, zb + 0.2));
      }
      c.strokeStyle = L.shade('#6d6a66', 0, 0, 1); c.lineWidth = 0.6; c.stroke();
    }
  }
}

function addPortal(app, P) {
  const hw = DECK_HW * 1.25;
  const a = [P.x - P.nx * hw, P.y - P.ny * hw], b = [P.x + P.nx * hw, P.y + P.ny * hw];
  const a2 = [a[0] + P.ux * 0.12, a[1] + P.uy * 0.12], b2 = [b[0] + P.ux * 0.12, b[1] + P.uy * 0.12];
  app.scene.add({
    x: P.x, y: P.y, depth: P.x + P.y - 0.3, minZoom: 0.3, bbox: bboxOf([a, b, a2, b2], 2),
    draw(r) {
      const c = r.ctx, X = (q) => r.ox + (q[0] - q[1]) * r.kx, Y = (q) => r.oy + (q[0] + q[1]) * r.ky;
      c.beginPath(); c.moveTo(X(a), Y(a)); c.lineTo(X(b), Y(b)); c.lineTo(X(b2), Y(b2)); c.lineTo(X(a2), Y(a2)); c.closePath();
      c.fillStyle = r.L.shade('#3a3b3e', 0, 0, 1); c.fill();
    },
  });
  return 1;
}

function stationPiece(A, B, first, last) {
  const corners = (w) => [
    [A.x - A.nx * w, A.y - A.ny * w], [A.x + A.nx * w, A.y + A.ny * w],
    [B.x + B.nx * w, B.y + B.ny * w], [B.x - B.nx * w, B.y - B.ny * w]];
  const ux = B.x - A.x, uy = B.y - A.y, ul = Math.hypot(ux, uy) || 1;
  const plat = corners(ST_HW * 0.8), roofBase = corners(ST_HW);
  return { A, B, plat, roofBase, first, last, ux: ux / ul, uy: uy / ul, d: (A.x + A.y + B.x + B.y) / 2 };
}

/** One platform object (sorted by its back edge, under the trains) + one roof object (sorted by its front edge, over them). */
function addStation(app, pieces, line) {
  pieces.sort((a, b) => a.d - b.d);
  const all = pieces.flatMap((p) => p.roofBase);
  const sums = all.map((p) => p[0] + p[1]);
  const cx = all.reduce((a, p) => a + p[0], 0) / all.length, cy = all.reduce((a, p) => a + p[1], 0) / all.length;
  const P = { pieces, color: line.color };
  app.scene.add({ x: cx, y: cy, depth: Math.min(...sums) - 0.02, minZoom: 0.12, bbox: bboxOf(all, DECK_Z + 1),
    draw: (r) => { for (const p of pieces) drawPlatform(r, p); } });
  app.scene.add({ x: cx, y: cy, depth: Math.max(...sums) + 0.02, minZoom: 0.12, bbox: bboxOf(all, 26),
    draw: (r) => { for (const p of pieces) drawRoof(r, p, P.color); } });
  return 2;
}

function quadSides(r, pts, z0, z1, color, emit = 0) {
  // extruded convex quad: visible sides + top
  const c = r.ctx, L = r.L, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy;
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0] / 4; cy += p[1] / 4; }
  for (let i = 0; i < 4; i++) {
    const p = pts[i], q = pts[(i + 1) % 4];
    const ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey) || 1;
    let nx = ey / l, ny = -ex / l;
    const mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    if (nx + ny <= 0) continue;
    const ax = ox + (p[0] - p[1]) * kx, ay = oy + (p[0] + p[1]) * ky, bx = ox + (q[0] - q[1]) * kx, by = oy + (q[0] + q[1]) * ky;
    c.beginPath(); c.moveTo(ax, ay - z0 * kz); c.lineTo(bx, by - z0 * kz); c.lineTo(bx, by - z1 * kz); c.lineTo(ax, ay - z1 * kz); c.closePath();
    const col = L.shade(color, nx, ny, 0, emit); c.fillStyle = col; c.fill(); c.strokeStyle = col; c.lineWidth = 0.5; c.stroke();
  }
  c.beginPath();
  pts.forEach((p, i) => { const X = ox + (p[0] - p[1]) * kx, Y = oy + (p[0] + p[1]) * ky - z1 * kz; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
  c.closePath(); c.fillStyle = L.shade(color, 0, 0, 1); c.fill();
}

function drawPlatform(r, p) {
  const c = r.ctx, L = r.L;
  // twin columns
  if (r.zoom > 0.3) {
    for (const f of [-0.5, 0.5]) {
      const x = (p.A.x + p.B.x) / 2, y = (p.A.y + p.B.y) / 2;
      const nx = (p.A.nx + p.B.nx) / 2, ny = (p.A.ny + p.B.ny) / 2;
      const px = x + nx * ST_HW * f, py = y + ny * ST_HW * f;
      const sx = r.ox + (px - py) * r.kx, sy = r.oy + (px + py) * r.ky, w = Math.max(1, r.kx * 0.05);
      c.fillStyle = L.shade(CONCRETE, 0.7, 0.7, 0); c.fillRect(sx - w / 2, sy - 7 * r.kz, w, 7 * r.kz);
    }
  }
  quadSides(r, p.plat, 7, DECK_Z, '#cfd3d6', 0.25);
}

const PROF = [[-1, 4.6], [-0.86, 7.2], [-0.55, 9.6], [0, 10.6], [0.55, 9.6], [0.86, 7.2], [1, 4.6]];
function drawRoof(r, p, color) {
  const c = r.ctx, L = r.L, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy;
  const A = p.A, B = p.B;
  const PX = (E, f, h) => ox + (E.x + E.nx * ST_HW * f - E.y - E.ny * ST_HW * f) * kx;
  const PY = (E, f, h) => oy + (E.x + E.nx * ST_HW * f + E.y + E.ny * ST_HW * f) * ky - (DECK_Z + h) * kz;
  const nx0 = (A.nx + B.nx) / 2, ny0 = (A.ny + B.ny) / 2;
  // vaulted shell: front-facing facets of a convex profile never overlap, so no sorting needed
  for (let i = 0; i < PROF.length - 1; i++) {
    const f0 = PROF[i][0], h0 = PROF[i][1], f1 = PROF[i + 1][0], h1 = PROF[i + 1][1];
    const dw = (f1 - f0) * ST_HW * 100, dh = h1 - h0, l = Math.hypot(dw, dh);
    const a = -dh / l, nz = dw / l; // outward normal: across component (along n) and vertical
    const nnx = nx0 * a, nny = ny0 * a;
    if (nnx + nny + 0.816 * nz <= 0) continue;
    c.beginPath();
    c.moveTo(PX(A, f0, h0), PY(A, f0, h0)); c.lineTo(PX(A, f1, h1), PY(A, f1, h1));
    c.lineTo(PX(B, f1, h1), PY(B, f1, h1)); c.lineTo(PX(B, f0, h0), PY(B, f0, h0)); c.closePath();
    const col = L.shade(SHELL, nnx, nny, Math.max(0, nz), 0.1);
    c.fillStyle = col; c.fill(); c.strokeStyle = col; c.lineWidth = 0.5; c.stroke();
  }
  // eave band in line colour on the visible side
  const sgn = nx0 + ny0 > 0 ? 1 : -1;
  if (r.zoom > 0.35) {
    c.beginPath();
    c.moveTo(PX(A, sgn, 4.6), PY(A, sgn, 4.6)); c.lineTo(PX(B, sgn, 4.6), PY(B, sgn, 4.6));
    c.lineTo(PX(B, sgn, 3.5), PY(B, sgn, 3.5)); c.lineTo(PX(A, sgn, 3.5), PY(A, sgn, 3.5)); c.closePath();
    c.fillStyle = L.shade(color, sgn * nx0, sgn * ny0, 0, 0.35); c.fill();
    if (r.night > 0.05) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = L.emit('#ffd9a0', 0.3); c.fill();
      c.globalCompositeOperation = 'source-over';
    }
  }
  // glazed gable walls at the station ends that face the viewer
  for (let e = 0; e < 2; e++) {
    const E = e ? B : A, isEnd = e ? p.last : p.first, dir = e ? 1 : -1;
    if (!isEnd || (p.ux + p.uy) * dir <= 0) continue;
    c.beginPath();
    for (let i = 0; i < PROF.length; i++) { const X = PX(E, PROF[i][0], PROF[i][1]), Y = PY(E, PROF[i][0], PROF[i][1]); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }
    c.lineTo(PX(E, 1, 0), PY(E, 1, 0)); c.lineTo(PX(E, -1, 0), PY(E, -1, 0)); c.closePath();
    c.fillStyle = L.shade('#8fa3b3', p.ux * dir, p.uy * dir, 0, 0.6); c.fill();
  }
}

function addKiosk(app, P, color) {
  // underground station entrance pavilion beside the alignment
  const off = 0.16;
  const x = P.x + P.nx * off, y = P.y + P.ny * off;
  const hl = 0.07, hw = 0.035;
  const pts = [[x + P.ux * hl + P.nx * hw, y + P.uy * hl + P.ny * hw], [x + P.ux * hl - P.nx * hw, y + P.uy * hl - P.ny * hw],
    [x - P.ux * hl - P.nx * hw, y - P.uy * hl - P.ny * hw], [x - P.ux * hl + P.nx * hw, y - P.uy * hl + P.ny * hw]];
  app.scene.add({
    x, y, minZoom: 0.25, bbox: bboxOf(pts, 8),
    draw(r) {
      quadSides(r, pts, 0, 3.2, '#c9d0d6', 0.4);
      // shell cap
      const inner = pts.map((p) => [x + (p[0] - x) * 0.72, y + (p[1] - y) * 0.6]);
      quadSides(r, inner, 3.2, 5.6, SHELL, 0.15);
      if (r.zoom > 0.6) {
        const c = r.ctx, X = r.ox + (x - y) * r.kx, Y = r.oy + (x + y) * r.ky - 7.5 * r.kz;
        c.fillStyle = color; c.fillRect(X - 1.5 * Math.min(2, r.zoom), Y - 1.5 * Math.min(2, r.zoom), 3 * Math.min(2, r.zoom), 3 * Math.min(2, r.zoom));
      }
    },
  });
  return 1;
}

// ---------------- train car ----------------
function drawCar(r) {
  const car = this;
  const z = car.z + 0.35, hl = car.hl - 0.004, hw = 0.019, h = 3.7;
  const L = r.L, night = r.night;
  obox2(r, car.x, car.y, z, car.ux, car.uy, hl, hw, h, BODY);
  if (r.zoom < 0.5) return;
  // line-colour stripe and window band on the visible long side
  band(r, car, hl, hw, z + 0.55, z + 1.05, L.shade(car.line.color, 0.6, 0.6, 0));
  const glass = night > 0.05 ? L.emit('#fff0c8', 0.92, 0) : null;
  band(r, car, hl * 0.92, hw, z + 1.7, z + 2.9, L.shade('#2c3843', 0.6, 0.6, 0));
  if (glass) {
    r.ctx.globalCompositeOperation = 'lighter';
    band(r, car, hl * 0.92, hw, z + 1.75, z + 2.85, glass);
    r.ctx.globalCompositeOperation = 'source-over';
  }
  // head / tail lights
  if (night > 0.05 && (car.lead || car.tail)) {
    const c = r.ctx;
    const fx = car.x + car.ux * hl, fy = car.y + car.uy * hl, bx = car.x - car.ux * hl, by = car.y - car.uy * hl;
    c.globalCompositeOperation = 'lighter';
    const rad = Math.max(1.2, 2 * r.zoom);
    if (car.lead) { c.fillStyle = L.emit('#fff6dc', 0.9); c.beginPath(); c.arc(r.ox + (fx - fy) * r.kx, r.oy + (fx + fy) * r.ky - (z + 1.2) * r.kz, rad, 0, 6.283); c.fill(); }
    if (car.tail) { c.fillStyle = L.emit('#ff3020', 0.85); c.beginPath(); c.arc(r.ox + (bx - by) * r.kx, r.oy + (bx + by) * r.ky - (z + 1.2) * r.kz, rad * 0.8, 0, 6.283); c.fill(); }
    c.globalCompositeOperation = 'source-over';
  }
}
function obox2(r, cx, cy, z, ux, uy, hl, hw, h, color) {
  // slimmed copy of util.obox (keeps the hot path monomorphic)
  const c = r.ctx, L = r.L, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy;
  const nx = -uy, ny = ux, ax = ux * hl, ay = uy * hl, bx = nx * hw, by = ny * hw;
  const P = [cx + ax + bx, cy + ay + by, cx + ax - bx, cy + ay - by, cx - ax - bx, cy - ay - by, cx - ax + bx, cy - ay + by];
  const SX = (i) => ox + (P[i] - P[i + 1]) * kx, SY = (i) => oy + (P[i] + P[i + 1]) * ky;
  const zb = z * kz, zt = (z + h) * kz;
  const f = (i, j, nx_, ny_) => {
    c.beginPath(); c.moveTo(SX(i), SY(i) - zb); c.lineTo(SX(j), SY(j) - zb); c.lineTo(SX(j), SY(j) - zt); c.lineTo(SX(i), SY(i) - zt); c.closePath();
    c.fillStyle = L.shade(color, nx_, ny_, 0); c.fill();
  };
  if (ux + uy > 0) f(2, 0, ux, uy); else f(6, 4, -ux, -uy);
  if (nx + ny > 0) f(0, 6, nx, ny); else f(4, 2, -nx, -ny);
  c.beginPath(); c.moveTo(SX(0), SY(0) - zt); c.lineTo(SX(2), SY(2) - zt); c.lineTo(SX(4), SY(4) - zt); c.lineTo(SX(6), SY(6) - zt); c.closePath();
  c.fillStyle = L.shade('#c3c8ce', 0, 0, 1); c.fill();
}
function band(r, car, hl, hw, z0, z1, fill) {
  const c = r.ctx, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy;
  let nx = -car.uy, ny = car.ux;
  if (nx + ny <= 0) { nx = -nx; ny = -ny; }
  const px = car.x + nx * hw, py = car.y + ny * hw;
  const ax = px + car.ux * hl, ay = py + car.uy * hl, bx = px - car.ux * hl, by = py - car.uy * hl;
  const AX = ox + (ax - ay) * kx, AY = oy + (ax + ay) * ky, BX = ox + (bx - by) * kx, BY = oy + (bx + by) * ky;
  c.beginPath(); c.moveTo(AX, AY - z0 * kz); c.lineTo(BX, BY - z0 * kz); c.lineTo(BX, BY - z1 * kz); c.lineTo(AX, AY - z1 * kz); c.closePath();
  c.fillStyle = fill; c.fill();
}
