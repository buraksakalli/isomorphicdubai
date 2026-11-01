// Road traffic. Every lane is a precomputed arc-length path; all cars in a lane share one moving offset
// (lane.pos), so a car's position is (s0 + pos) mod L — O(1) per lane per frame to animate tens of thousands
// of cars. Only cars on visible road segments are ever touched (binary search over sorted s0).
// Drawn as one underlay (ground level, so buildings in front still cover them correctly), batched by colour.
import { ROADS } from '../data/geo.js';
import { Path, offsetPolyline, densify, clamp, smooth, rng, viewRect, glowSprite } from './util.js';

// vehicle types: [body colour, roof colour, half length (tiles), half width, height (m)]
// sizes are ~1.6x real so they read at city zooms
const TYPES = [
  ['#f2f2ee', '#f7f7f4', 0.037, 0.015, 2.1], // 0 white
  ['#bfc4ca', '#c9ced3', 0.037, 0.015, 2.1], // 1 silver
  ['#7f858c', '#8a9097', 0.037, 0.015, 2.1], // 2 grey
  ['#2a2d32', '#33373d', 0.037, 0.015, 2.1], // 3 black
  ['#24405f', '#2c4b6e', 0.037, 0.015, 2.1], // 4 navy
  ['#a8322d', '#b53a34', 0.037, 0.015, 2.1], // 5 red
  ['#9b8466', '#a68f70', 0.038, 0.016, 2.3], // 6 bronze SUV
  ['#e7d9aa', '#c8322d', 0.037, 0.015, 2.1], // 7 Dubai taxi: cream body, red roof
  ['#eef0f1', '#f6f7f8', 0.08, 0.018, 3.6],  // 8 bus
  ['#e8e4dc', '#d4542a', 0.09, 0.019, 4.0],  // 9 truck (container + orange cab)
];
const CAR_W = [30, 18, 8, 10, 5, 5, 6]; // weights for private cars
const KIND = {
  highway: { lanes: 3, spacing: 30, speed: 30, bus: 0.015, truck: 0.03, taxi: 0.11 },
  major: { lanes: 2, spacing: 42, speed: 19, bus: 0.035, truck: 0.01, taxi: 0.16 },
  local: { lanes: 1, spacing: 85, speed: 12, bus: 0.0, truck: 0.0, taxi: 0.12 },
};
const TIME_SCALE = 1.4; // a touch faster than life so motion reads at city zooms
// relative traffic volume by hour (Dubai local); rush 07–09 & 17–20, quiet ~03:00
const DENS = [0.42, 0.32, 0.22, 0.14, 0.15, 0.3, 0.6, 0.95, 1, 0.86, 0.7, 0.68, 0.7, 0.72, 0.72, 0.76, 0.86, 0.97, 1, 0.96, 0.82, 0.72, 0.62, 0.52];
export function trafficDensity(h) {
  const i = Math.floor(h) % 24, f = h - Math.floor(h);
  return DENS[i] + (DENS[(i + 1) % 24] - DENS[i]) * f;
}

const PX_PER_TILE = 36; // average projected length of one tile at zoom 1 (for dash offsets)

export function createTraffic(app) {
  const g = app.geo;
  const src = app.terrain && Array.isArray(app.terrain.roads) && app.terrain.roads.length
    ? app.terrain.roads
    : ROADS.map((r) => ({ ...r, pts: g.llPts(r.pts) }));
  const R = rng(4242);
  const roads = [];
  let total = 0;
  const heavy = new Set(['e611', 'e311']);

  for (const rd of src) {
    if (!rd.pts || rd.pts.length < 2) continue;
    const cfg = KIND[rd.kind] || KIND.local;
    // terrain.roads widths are in tiles, geo ROADS in metres
    let width = rd.width || (rd.kind === 'highway' ? 55 : rd.kind === 'major' ? 30 : 14);
    if (width < 5) width *= 100;
    const base = densify(rd.pts, 2.5);
    const p0 = rd.pts[0], p1 = rd.pts[rd.pts.length - 1];
    const loop = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) < 0.05;
    // lane centres match the painted carriageway (lanes split the half-width evenly)
    const nl = rd.kind === 'local' && width > 18 ? 2 : cfg.lanes;
    const median = rd.kind === 'local' ? 0.6 : width * 0.03;
    const laneW = (width / 2 - median) / nl;
    const road = { id: rd.id, kind: rd.kind || 'local', loop, lanes: [], streams: [], bx0: 1e9, by0: 1e9, bx1: -1e9, by1: -1e9 };
    for (const dir of [1, -1]) {
      const pts = dir > 0 ? base : base.slice().reverse();
      for (let li = 0; li < nl; li++) {
        const off = (median + (li + 0.5) * laneW) / 100;
        const path = new Path(offsetPolyline(pts, off));
        const L = path.length;
        const spacing = (cfg.spacing * (1 + li * 0.12)) / 100; // outer (slow) lanes a little sparser
        const count = Math.max(1, Math.floor(L / spacing));
        const s0 = new Float32Array(count), col = new Uint8Array(count), hv = new Float32Array(count);
        const heavyRoad = heavy.has(rd.id);
        for (let k = 0; k < count; k++) {
          s0[k] = Math.min(L - 1e-4, (k + 0.5 + (R() - 0.5) * 0.5) * (L / count));
          hv[k] = R();
          const u = R();
          const outer = li === nl - 1;
          let type;
          if (outer && u < cfg.bus * (nl > 1 ? 2 : 1)) type = 8;
          else if (u < cfg.bus * 2 + (heavyRoad ? 0.14 : cfg.truck) * (outer ? 1.6 : li === nl - 2 ? 0.8 : 0.2)) type = 9;
          else if (R() < cfg.taxi) type = 7;
          else {
            let w = R() * 82, t = 0;
            while (t < 6 && w > CAR_W[t]) { w -= CAR_W[t]; t++; }
            type = t;
          }
          col[k] = type;
        }
        // segment bboxes in zoom-1 projected px
        const ns = path.n - 1;
        const sb = new Float32Array(ns * 4);
        for (let i = 0; i < ns; i++) {
          const ax = (path.x[i] - path.y[i]) * 32, ay = (path.x[i] + path.y[i]) * 16;
          const bx = (path.x[i + 1] - path.y[i + 1]) * 32, by = (path.x[i + 1] + path.y[i + 1]) * 16;
          sb[i * 4] = Math.min(ax, bx) - 4; sb[i * 4 + 1] = Math.max(ax, bx) + 4;
          sb[i * 4 + 2] = Math.min(ay, by) - 6; sb[i * 4 + 3] = Math.max(ay, by) + 4;
          road.bx0 = Math.min(road.bx0, sb[i * 4]); road.bx1 = Math.max(road.bx1, sb[i * 4 + 1]);
          road.by0 = Math.min(road.by0, sb[i * 4 + 2]); road.by1 = Math.max(road.by1, sb[i * 4 + 3]);
        }
        const lane = { path, L, s0, col, hv, sb, ns, dir, li, loop, pos: R() * L,
          speed: (cfg.speed * (1.06 - li * 0.07) * TIME_SCALE) / 100, kind: road.kind };
        road.lanes.push(lane);
        total += count;
      }
      // light-stream polyline (mid carriageway) in zoom-1 projected px
      const mid = offsetPolyline(pts, (median + (nl / 2) * laneW) / 100);
      const P = new Float32Array(mid.length * 2);
      mid.forEach((p, i) => { P[i * 2] = (p[0] - p[1]) * 32; P[i * 2 + 1] = (p[0] + p[1]) * 16; });
      road.streams.push({ P, dir, lane: road.lanes[road.lanes.length - Math.ceil(nl / 2)], halfW: (nl * laneW) / 100 });
    }
    roads.push(road);
  }

  // per-frame scratch (allocated once)
  const CAP = 14000, ST = 8;
  const buf = new Float32Array(CAP * ST);
  const order = new Int32Array(CAP);
  const counts = new Int32Array(TYPES.length), offs = new Int32Array(TYPES.length);
  const view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const smp = { x: 0, y: 0, z: 0, ux: 0, uy: 0, i: 0 };
  const headS = glowSprite('#fff4dc', 0.18), tailS = glowSprite('#ff3a24', 0.18);
  const st = { total, visible: 0, density: 1, mode: 'cars' };
  let enabled = true;
  let n = 0;

  function speedMult(kind, dens) {
    const cong = smooth(0.8, 1.0, dens);
    return 1 - cong * (kind === 'highway' ? 0.62 : kind === 'major' ? 0.45 : 0.25);
  }

  function update(dt) {
    const dens = trafficDensity(app.clock.hours);
    st.density = dens;
    for (const rd of roads) {
      const m = speedMult(rd.kind, dens);
      for (const ln of rd.lanes) { ln.pos += ln.speed * m * dt; if (ln.pos >= ln.L) ln.pos -= ln.L; }
    }
  }

  // ---------- car gathering ----------
  function gather(r, ln, a, b, keep) {
    const s0 = ln.s0, L = ln.L, P = ln.pos, path = ln.path;
    let lo = a - P, hi = b - P;
    if (lo < 0) { lo += L; hi += L; }
    if (hi <= L) scan(r, ln, lo, hi, keep);
    else { scan(r, ln, lo, L, keep); scan(r, ln, 0, hi - L, keep); }
  }
  function lowerBound(arr, v) {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
    return lo;
  }
  function scan(r, ln, lo, hi, keep) {
    const s0 = ln.s0, col = ln.col, hv = ln.hv, L = ln.L, P = ln.pos, path = ln.path;
    const kx = r.kx, ky = r.ky, ox = r.ox, oy = r.oy, vw = r.vw, vh = r.vh;
    let hint = -1;
    for (let j = lowerBound(s0, lo); j < s0.length && s0[j] <= hi; j++) {
      if (hv[j] > keep) continue;
      let s = s0[j] + P; if (s >= L) s -= L;
      if (!ln.loop && (s < 0.25 || s > L - 0.25)) continue; // fade at lane ends
      path.at(s, smp, hint); hint = smp.i;
      const X = ox + (smp.x - smp.y) * kx, Y = oy + (smp.x + smp.y) * ky;
      if (X < -12 || X > vw + 12 || Y < -12 || Y > vh + 14) continue;
      if (n >= CAP) return;
      const T = TYPES[col[j]], ux = smp.ux, uy = smp.uy, hl = T[2], hw = T[3];
      const o = n * ST;
      buf[o] = X; buf[o + 1] = Y;
      buf[o + 2] = (ux - uy) * kx * hl; buf[o + 3] = (ux + uy) * ky * hl;          // half-length vector (screen)
      buf[o + 4] = (-uy - ux) * kx * hw; buf[o + 5] = (-uy + ux) * ky * hw;        // half-width vector (screen)
      buf[o + 6] = col[j];
      buf[o + 7] = (ux + uy > 0 ? 1 : 0) + (ux - uy > 0 ? 2 : 0);                   // visible-face flags
      n++;
    }
  }

  function collect(r, keep) {
    n = 0;
    viewRect(r, view, 14);
    for (const rd of roads) {
      if (rd.bx1 < view.x0 || rd.bx0 > view.x1 || rd.by1 < view.y0 || rd.by0 > view.y1) continue;
      for (const ln of rd.lanes) {
        const sb = ln.sb, c = ln.path.cum;
        let a = -1;
        for (let i = 0; i <= ln.ns; i++) {
          const vis = i < ln.ns && !(sb[i * 4 + 1] < view.x0 || sb[i * 4] > view.x1 || sb[i * 4 + 3] < view.y0 || sb[i * 4 + 2] > view.y1);
          if (vis) { if (a < 0) a = c[i]; }
          else if (a >= 0) { gather(r, ln, a, c[i], keep); a = -1; }
        }
        if (n >= CAP) return;
      }
    }
  }

  // ---------- drawing ----------
  function drawCars(r) {
    const c = r.ctx, L = r.L, z = r.zoom, kz = r.kz;
    const lod = clamp((z - 0.3) / 0.6, 0.3, 1);
    collect(r, st.density * lod);
    st.visible = n;
    if (!n) return;
    // counting sort by type
    counts.fill(0);
    for (let i = 0; i < n; i++) counts[buf[i * ST + 6]]++;
    let acc = 0;
    for (let t = 0; t < TYPES.length; t++) { offs[t] = acc; acc += counts[t]; }
    for (let i = 0; i < n; i++) order[offs[buf[i * ST + 6]]++] = i;
    for (let t = 0, start = 0; t < TYPES.length; t++) {
      const cnt = counts[t];
      if (!cnt) continue;
      const T = TYPES[t], hz = T[4] * kz;
      // sides: the two visible faces as parallelograms
      c.beginPath();
      for (let k = start; k < start + cnt; k++) {
        const o = order[k] * ST, X = buf[o], Y = buf[o + 1], dX = buf[o + 2], dY = buf[o + 3], eX = buf[o + 4], eY = buf[o + 5], f = buf[o + 7];
        const su = f & 1 ? 1 : -1, sn = f & 2 ? 1 : -1;
        let ax = X + su * dX - eX, ay = Y + su * dY - eY, bx = X + su * dX + eX, by = Y + su * dY + eY;
        c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(bx, by - hz); c.lineTo(ax, ay - hz); c.closePath();
        ax = X + sn * eX - dX; ay = Y + sn * eY - dY; bx = X + sn * eX + dX; by = Y + sn * eY + dY;
        c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(bx, by - hz); c.lineTo(ax, ay - hz); c.closePath();
      }
      c.fillStyle = L.shade(T[0], 0.55, 0.55, 0); c.fill();
      // tops
      c.beginPath();
      for (let k = start; k < start + cnt; k++) {
        const o = order[k] * ST, X = buf[o], Y = buf[o + 1] - hz, dX = buf[o + 2], dY = buf[o + 3], eX = buf[o + 4], eY = buf[o + 5];
        c.moveTo(X + dX + eX, Y + dY + eY); c.lineTo(X + dX - eX, Y + dY - eY);
        c.lineTo(X - dX - eX, Y - dY - eY); c.lineTo(X - dX + eX, Y - dY + eY); c.closePath();
      }
      c.fillStyle = L.shade(t === 7 || t === 9 ? T[0] : T[1], 0, 0, 1); c.fill();
      // cabin / roof detail (glass for cars, red roof for taxis, orange cab for trucks)
      if (z >= 0.8) {
        c.beginPath();
        for (let k = start; k < start + cnt; k++) {
          const o = order[k] * ST, X = buf[o], Y = buf[o + 1] - hz, dX = buf[o + 2], dY = buf[o + 3], eX = buf[o + 4] * 0.8, eY = buf[o + 5] * 0.8;
          let f0, f1;
          if (t === 9) { f0 = 0.62; f1 = 0.98; } else if (t === 8) { f0 = -0.9; f1 = 0.9; } else { f0 = -0.45; f1 = 0.3; }
          if (t === 8) continue;
          c.moveTo(X + dX * f1 + eX, Y + dY * f1 + eY); c.lineTo(X + dX * f1 - eX, Y + dY * f1 - eY);
          c.lineTo(X + dX * f0 - eX, Y + dY * f0 - eY); c.lineTo(X + dX * f0 + eX, Y + dY * f0 + eY); c.closePath();
        }
        c.fillStyle = t === 7 || t === 9 ? L.shade(T[1], 0, 0, 1) : L.shade('#2f3b47', 0, 0, 1);
        c.fill();
      }
      start += cnt;
    }
    // night lights: batched additive dots (halo + core); sprites only when zoomed in
    const night = r.night;
    if (night > 0.05) {
      c.globalCompositeOperation = 'lighter';
      const big = z >= 1.6;
      const coreR = Math.max(0.7, 0.75 * z), haloR = Math.max(1.6, 3.2 * Math.sqrt(z));
      for (let pass = 0; pass < 2; pass++) {
        const sgn = pass === 0 ? 1 : -1; // front / rear
        if (big) {
          const spr = pass === 0 ? headS : tailS;
          c.globalAlpha = night * (pass === 0 ? 0.55 : 0.5);
          const rad = haloR * 1.6;
          for (let i = 0; i < n; i++) {
            const o = i * ST, X = buf[o] + sgn * buf[o + 2], Y = buf[o + 1] + sgn * buf[o + 3] - 0.8 * r.kz;
            c.drawImage(spr, X - rad, Y - rad, rad * 2, rad * 2);
          }
        } else {
          c.beginPath();
          for (let i = 0; i < n; i++) {
            const o = i * ST, X = buf[o] + sgn * buf[o + 2], Y = buf[o + 1] + sgn * buf[o + 3] - 0.8 * r.kz;
            c.moveTo(X + haloR, Y); c.arc(X, Y, haloR, 0, 6.2832);
          }
          c.globalAlpha = night * 0.22;
          c.fillStyle = pass === 0 ? '#ffe9c0' : '#ff2a18'; c.fill();
        }
        c.beginPath();
        for (let i = 0; i < n; i++) {
          const o = i * ST, X = buf[o] + sgn * buf[o + 2], Y = buf[o + 1] + sgn * buf[o + 3] - 0.8 * r.kz;
          c.rect(X - coreR, Y - coreR * 0.8, coreR * 2, coreR * 1.6);
        }
        c.globalAlpha = night * 0.95;
        c.fillStyle = pass === 0 ? '#fff8e8' : '#ff4a30'; c.fill();
      }
      // soft headlight beams on the tarmac when close
      if (z >= 1) {
        c.beginPath();
        for (let i = 0; i < n; i++) {
          const o = i * ST, X = buf[o], Y = buf[o + 1], dX = buf[o + 2], dY = buf[o + 3], eX = buf[o + 4], eY = buf[o + 5];
          c.moveTo(X + dX, Y + dY); c.lineTo(X + dX * 5 + eX * 2.2, Y + dY * 5 + eY * 2.2); c.lineTo(X + dX * 5 - eX * 2.2, Y + dY * 5 - eY * 2.2); c.closePath();
        }
        c.globalAlpha = night * 0.12; c.fillStyle = '#ffe2a8'; c.fill();
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
  }

  function drawStreams(r) {
    const c = r.ctx, z = r.zoom, night = r.night, ox = r.ox, oy = r.oy;
    viewRect(r, view, 10);
    const dens = st.density;
    const dayA = (1 - night) * smooth(0.1, 0.22, z) * 0.75;
    const nightA = night;
    if (dayA < 0.02 && nightA < 0.02) return;
    const dash = Math.max(1.1, 2.2 * z / 0.3), gap = dash * (0.6 + 5 * (1 - dens));
    const dashArr = [dash, gap];
    c.lineCap = 'round'; c.lineJoin = 'round';
    let vis = 0;
    for (const rd of roads) {
      if (rd.bx1 < view.x0 || rd.bx0 > view.x1 || rd.by1 < view.y0 || rd.by0 > view.y1) continue;
      for (const s of rd.streams) {
        const P = s.P;
        c.beginPath();
        c.moveTo(ox + P[0] * z, oy + P[1] * z);
        for (let i = 2; i < P.length; i += 2) c.lineTo(ox + P[i] * z, oy + P[i + 1] * z);
        const w = Math.max(0.8, s.halfW * z * PX_PER_TILE * 0.7);
        c.lineDashOffset = -s.lane.pos * PX_PER_TILE * z;
        const hiway = rd.kind === 'highway' ? 1 : rd.kind === 'major' ? 0.75 : 0.45;
        if (nightA > 0.02) {
          c.globalCompositeOperation = 'lighter';
          const colr = s.dir > 0 ? '255,236,200' : '255,60,40';
          c.setLineDash([]);
          c.lineWidth = w * 2.6; c.strokeStyle = `rgba(${colr},${(0.07 + 0.08 * dens) * nightA * hiway})`; c.stroke();
          if (z > 0.09) c.setLineDash(dashArr);
          c.lineWidth = w; c.strokeStyle = `rgba(${colr},${(0.45 + 0.4 * dens) * nightA * hiway})`; c.stroke();
          c.globalCompositeOperation = 'source-over';
        }
        if (dayA > 0.02) {
          c.setLineDash(dashArr);
          c.lineWidth = w; c.strokeStyle = s.dir > 0 ? `rgba(250,250,246,${dayA * hiway})` : `rgba(70,76,86,${dayA * 0.8 * hiway})`;
          c.stroke();
        }
        vis++;
      }
    }
    c.setLineDash([]);
    c.lineDashOffset = 0;
    st.visible = vis;
  }

  function draw(r) {
    if (!enabled) { st.visible = 0; return; }
    if (r.zoom < 0.45) { st.mode = 'streams'; drawStreams(r); }
    else { st.mode = 'cars'; drawCars(r); }
  }

  app.scene.underlays.push(draw);
  return {
    update, stats: st, roads,
    setEnabled(v) { enabled = !!v; }, get enabled() { return enabled; },
  };
}
