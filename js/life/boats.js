// Water life: abras crossing the Creek, dhows moored on the Deira side, dinner-cruise dhows on the Creek,
// yachts around the Palm / Burj Al Arab / Bluewaters / inside Dubai Marina, cargo ships & tankers heading to
// Jebel Ali, anchored ships offshore. Foam wakes + sun glints on the sea are drawn in an underlay.
import { CREEK, ISLANDS, COAST } from '../data/geo.js';
import { prism, hash } from '../core/shapes.js';
import { Path, offsetPolyline, densify, clamp, smooth, rng, obox, oboxBand, viewRect, waterTester, glowSprite } from './util.js';

const CARGO = ['#c0392b', '#2e86c1', '#e0a526', '#7f8c8d', '#e8e2d6', '#27825a', '#8e3b8a', '#d35400'];

export function createBoats(app) {
  const g = app.geo;
  const isWater = waterTester(app);
  const R = rng(777);
  const boats = [];   // moving (dynamic) boats
  const dyn = [];     // dynamic objects handed to the renderer
  let statics = 0;
  let enabled = true;

  // ---------- the Creek ----------
  const cpts = CREEK.map((p) => g.toWorld(p[0], p[1]));
  const creek = new Path(densify(cpts, 0.5));
  const cw = CREEK.map((p) => p[2] / 100);
  const cwCum = []; { let a = 0; cwCum.push(0); for (let i = 1; i < cpts.length; i++) { a += Math.hypot(cpts[i][0] - cpts[i - 1][0], cpts[i][1] - cpts[i - 1][1]); cwCum.push(a); } }
  const widthAt = (s) => { for (let i = 1; i < cwCum.length; i++) if (s <= cwCum[i]) { const f = (s - cwCum[i - 1]) / (cwCum[i] - cwCum[i - 1]); return cw[i - 1] + (cw[i] - cw[i - 1]) * f; } return cw[cw.length - 1]; };
  const smp = { x: 0, y: 0, z: 0, ux: 0, uy: 0, i: 0 };
  const project = (P, x, y) => { // closest arc position on path
    let best = 1e9, bs = 0;
    for (let i = 0; i < P.n - 1; i++) {
      const ax = P.x[i], ay = P.y[i], dx = P.x[i + 1] - ax, dy = P.y[i + 1] - ay, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(px - x, py - y);
      if (d < best) { best = d; bs = P.cum[i] + t * Math.sqrt(l2); }
    }
    return bs;
  };
  // half-width of water from the centreline along a normal (uses terrain where available)
  const bankDist = (x, y, nx, ny, fallback) => {
    if (!isWater(x, y)) return fallback;
    let d = 0;
    while (d < fallback * 1.8 && isWater(x + nx * (d + 0.05), y + ny * (d + 0.05))) d += 0.05;
    return d < 0.3 ? fallback : d;
  };

  // ---------- abras ----------
  const crossings = [[25.2652, 55.2968], [25.2631, 55.2989], [25.2672, 55.2947]];
  const abraCols = ['#d2a86e', '#c99a5c', '#b8453a', '#2f7290', '#d9b77d'];
  crossings.forEach(([la, lo], ci) => {
    const [px, py] = g.toWorld(la, lo);
    const s = project(creek, px, py);
    creek.at(s, smp);
    const cx = smp.x, cy = smp.y, ux = smp.ux, uy = smp.uy, nx = -uy, ny = ux; // n = right of downstream→upstream = Bur Dubai side
    const w = widthAt(s) / 2;
    const dR = bankDist(cx, cy, nx, ny, w) - 0.09, dL = bankDist(cx, cy, -nx, -ny, w) - 0.09;
    const NA = ci === 2 ? 3 : 4;
    const dist = dR + dL, speed = 0.03, cross = dist / speed + 8, wait = 22, cycle = 2 * (cross + wait);
    for (let i = 0; i < NA; i++) {
      const lat = (i - (NA - 1) / 2) * 0.038;
      const b = mkBoat('abra', 0.115, 0.034, 1.6, abraCols[(ci * 3 + i) % abraCols.length]);
      Object.assign(b, { cx: cx + ux * lat, cy: cy + uy * lat, nx, ny, dR, dL, cross, wait, cycle, phase: (cycle * i) / NA + ci * 17 });
      b.move = moveAbra;
      boats.push(b);
    }
  });
  function moveAbra(b, t) {
    const ph = (t + b.phase) % b.cycle;
    let f, dir;
    if (ph < b.wait) { f = 0; dir = 1; }
    else if (ph < b.wait + b.cross) { f = smooth(0, 1, (ph - b.wait) / b.cross); dir = 1; }
    else if (ph < 2 * b.wait + b.cross) { f = 1; dir = -1; }
    else { f = 1 - smooth(0, 1, (ph - 2 * b.wait - b.cross) / b.cross); dir = -1; }
    const d = -b.dL + f * (b.dL + b.dR);
    b.x = b.cx + b.nx * d; b.y = b.cy + b.ny * d;
    b.ux = b.nx * dir; b.uy = b.ny * dir;
    b.v = f > 0 && f < 1 ? 0.03 : 0;
  }

  // ---------- dhows moored along Deira (left bank going inland) ----------
  const crossS = crossings.map(([la, lo]) => project(creek, ...g.toWorld(la, lo)));
  for (let s = 0.9; s < Math.min(creek.length - 1, 24); s += 0.29) {
    if (crossS.some((c) => Math.abs(c - s) < 0.32)) continue;
    creek.at(s, smp);
    const lx = smp.uy, ly = -smp.ux; // left normal (Deira)
    const w = widthAt(s) / 2;
    const bank = bankDist(smp.x, smp.y, lx, ly, w);
    for (let row = 0; row < 2; row++) {
      if (R() < (row ? 0.45 : 0.18)) continue;
      const d = bank - 0.055 - row * 0.085;
      if (d < 0.2) continue;
      const x = smp.x + lx * d, y = smp.y + ly * d;
      const dir = R() < 0.5 ? 1 : -1;
      statics += addDhow(app, x, y, smp.ux * dir, smp.uy * dir, R);
    }
  }

  // ---------- creek dinner-cruise dhows ----------
  {
    const s0 = 2.2, s1 = Math.min(creek.length - 0.5, 34);
    const lane = new Path(offsetPolyline(Array.from({ length: Math.ceil((s1 - s0) / 0.4) + 1 }, (_, i) => { creek.at(s0 + i * 0.4 > s1 ? s1 : s0 + i * 0.4, smp); return [smp.x, smp.y]; }), 0.18));
    for (let i = 0; i < 3; i++) {
      const b = mkBoat('cruise', 0.26, 0.065, 2.4, '#7a4a26');
      b.path = lane; b.speed = 0.024; b.s0 = (lane.length * 2 * i) / 3; b.bounce = true;
      boats.push(b);
    }
  }

  // ---------- yachts ----------
  const yachtCols = ['#f7f7f5', '#f4f4f2', '#eef1f3', '#1d2a38', '#f6f3ea'];
  const addYachts = (path, n, seed) => {
    if (!path || path.length < 3) return 0;
    for (let i = 0; i < n; i++) {
      const L = 0.2 + hash(seed, i, 1) * 0.22;
      const b = mkBoat('yacht', L, L * 0.24, 2.6, yachtCols[(i + seed) % yachtCols.length]);
      b.path = path; b.speed = 0.035 + hash(seed, i, 2) * 0.05; b.s0 = (path.length * i) / n + hash(seed, i, 3) * 2;
      b.decks = L > 0.33 ? 3 : 2;
      boats.push(b);
    }
    return n;
  };
  const palm = ISLANDS.find((i) => i.id === 'palm-jumeirah');
  if (palm) addYachts(waterArcLoop(g.toWorld(...palm.crown), (palm.crescentR + 0.75) * 10, 0.25), 8, 1);
  addYachts(waterArcLoop(g.toWorld(25.1412, 55.1852), 9, 0.22), 3, 2);
  addYachts(waterArcLoop(g.toWorld(25.0795, 55.1205), 11, 0.22), 3, 3);
  addYachts(waterArcLoop(g.toWorld(25.2245, 55.1705), 46, 0.3), 4, 4); // around The World
  const tw = (app.terrain && app.terrain.waters) || [];
  const lineLoop = (w, frac) => { // out along one side of a centreline, back along the other
    if (!w || !w.line || w.line.length < 2) return null;
    const pts = w.line.map((p) => [p[0], p[1]]), wd = w.line.reduce((a, p) => a + (p[2] || 0.8), 0) / w.line.length;
    const a = offsetPolyline(pts, wd * frac), b = offsetPolyline(pts.slice().reverse(), wd * frac);
    const all = a.concat(b, [a[0]]);
    const wet = all.filter((p) => isWater(p[0], p[1])).length;
    return wet >= all.length * 0.85 ? new Path(densify(all, 0.5)) : null;
  };
  const marina = lineLoop(tw.find((w) => w.id === 'marina'), 0.16) || marinaChannel();
  if (marina) addYachts(marina, 10, 5);
  // water taxis / small boats on the Dubai Water Canal & Business Bay
  const canal = lineLoop(tw.find((w) => w.id === 'canal'), 0.12);
  if (canal) for (let i = 0; i < 6; i++) {
    const b = mkBoat(i % 2 ? 'yacht' : 'abra', i % 2 ? 0.16 : 0.12, i % 2 ? 0.04 : 0.034, 1.6, i % 2 ? '#f4f4f2' : '#2f7290');
    b.path = canal; b.speed = 0.035 + (i % 3) * 0.008; b.s0 = (canal.length * i) / 6; b.decks = 2;
    boats.push(b);
  }

  // ---------- ships ----------
  const ships = [];
  {
    const port = g.toWorld(25.008, 55.045);
    const routes = [
      [[0.5, 125], g.toWorld(25.09, 54.99), port],
      [[0.5, 70], g.toWorld(25.06, 54.985), port],
    ];
    routes.forEach((rt, ri) => {
      const inbound = trimToWater(densify(rt, 1));
      if (!inbound) return;
      const out = offsetPolyline(inbound.slice().reverse(), 1.4);
      const loop = new Path(inbound.concat(out));
      const inLen = new Path(inbound).length;
      const n = 3;
      for (let i = 0; i < n; i++) {
        const tanker = (i + ri) % 2 === 1;
        const L = tanker ? 2.3 : 2.7;
        const b = mkBoat(tanker ? 'tanker' : 'container', L, tanker ? 0.4 : 0.36, 11, tanker ? '#6e2a22' : '#25334a');
        b.path = loop; b.speed = 0.07; b.s0 = (loop.length * i) / n + ri * 13; b.seed = ri * 10 + i;
        b.radius = L * 0.55; b.h = 45; b.hideRange = [inLen - 3.5, inLen + 3.5];
        boats.push(b); ships.push(b);
      }
    });
    // anchorage off Deira / Port Rashid
    [[25.305, 55.205, 0.6], [25.318, 55.235, 2.0], [25.292, 55.175, 1.1], [25.27, 55.13, 2.5], [25.25, 55.1, 0.3]].forEach(([la, lo, hd], i) => {
      const [x, y] = g.toWorld(la, lo);
      if (!isWater(x, y) || !isWater(x + 1.5, y) || !isWater(x - 1.5, y) || !isWater(x, y + 1.5) || !isWater(x, y - 1.5)) return;
      const tanker = i % 2 === 0;
      const b = mkBoat(tanker ? 'tanker' : 'container', tanker ? 2.4 : 2.6, tanker ? 0.42 : 0.36, 11, tanker ? '#6e2a22' : '#25334a');
      b.x = x; b.y = y; b.ux = Math.cos(hd); b.uy = Math.sin(hd); b.v = 0; b.seed = 50 + i; b.radius = 1.5; b.h = 45;
      b.move = null;
      boats.push(b);
    });
  }

  for (const b of boats) dyn.push(b);

  // ---------- builders ----------
  function mkBoat(kind, len, beam, h, color) {
    return { kind, len, beam, hh: h, color, x: 0, y: 0, ux: 1, uy: 0, v: 0, radius: Math.max(0.1, len * 0.6), h: kind === 'yacht' ? 14 : 10,
      hidden: false, pts: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], draw: drawBoat, move: movePath, seed: Math.floor(R() * 1000) };
  }
  function movePath(b, t) {
    if (!b.path) return;
    const L = b.path.length;
    let s = (b.s0 + b.speed * t) % (b.bounce ? 2 * L : L);
    let dir = 1;
    if (b.bounce && s > L) { s = 2 * L - s; dir = -1; }
    b.path.atSmooth(s, smp);
    b.x = smp.x; b.y = smp.y; b.ux = smp.ux * dir; b.uy = smp.uy * dir; b.v = b.speed;
    // big ships: "berthed" (hidden) around the U-turn at the port end of the loop
    if (b.hideRange && s > b.hideRange[0] && s < b.hideRange[1]) b.hidden = true;
  }

  /** Closed loop following the longest run of water on a circle (out on radius R, back on R + gap). */
  function waterArcLoop(c, Rr, gap) {
    const N = 120, ok = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let w = true;
      for (const rr of [Rr - 0.4, Rr, Rr + gap * 10 + 0.4]) if (!isWater(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr)) w = false;
      ok.push(w);
    }
    if (ok.every(Boolean)) {
      const pts = []; for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; pts.push([c[0] + Math.cos(a) * Rr, c[1] + Math.sin(a) * Rr]); }
      return new Path(pts);
    }
    // longest circular run of true
    let best = 0, bestStart = -1;
    for (let i = 0; i < N; i++) {
      if (!ok[i] || ok[(i - 1 + N) % N]) continue;
      let k = 0; while (k < N && ok[(i + k) % N]) k++;
      if (k > best) { best = k; bestStart = i; }
    }
    if (best < 8) return null;
    const arc = (rad, rev) => {
      const out = [];
      for (let k = 1; k < best - 1; k++) { const i = (bestStart + k) % N, a = (i / N) * Math.PI * 2; out.push([c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad]); }
      return rev ? out.reverse() : out;
    };
    const pts = arc(Rr, false).concat(arc(Rr + gap * 10, true));
    pts.push(pts[0]);
    return new Path(densify(pts, 0.6));
  }

  function trimToWater(pts) {
    let i0 = 0;
    // ignore off-map start (outside grid counts as sea)
    for (let i = 0; i < pts.length; i++) {
      if (!isWater(pts[i][0], pts[i][1])) { if (i < 3) return null; return pts.slice(i0, Math.max(2, i - 1)); }
    }
    return pts;
  }

  /** Dubai Marina: centreline of inland water near the Marina district (terrain-derived; null if not painted). */
  function marinaChannel() {
    const [mx, my] = g.toWorld(25.0815, 55.1415);
    const coast = g.llPts(COAST);
    const W = app.geo.W || 500;
    const land = coast.concat([[W + 50, -50], [W + 50, 1e4], [-50, 1e4]]);
    const inLand = (x, y) => { let ins = false; for (let i = 0, j = land.length - 1; i < land.length; j = i++) { const [xi, yi] = land[i], [xj, yj] = land[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
    const P = [];
    for (let dy = -16; dy <= 16; dy += 0.25) for (let dx = -16; dx <= 16; dx += 0.25) {
      if (dx * dx + dy * dy > 256) continue;
      const x = mx + dx, y = my + dy;
      if (isWater(x, y) && inLand(x, y) && isWater(x + 0.3, y) && isWater(x - 0.3, y) && isWater(x, y + 0.3) && isWater(x, y - 0.3)) P.push([x, y]);
    }
    if (P.length < 40) return null;
    // principal axis
    let cx = 0, cy = 0; for (const p of P) { cx += p[0]; cy += p[1]; } cx /= P.length; cy /= P.length;
    let sxx = 0, sxy = 0, syy = 0; for (const p of P) { const a = p[0] - cx, b = p[1] - cy; sxx += a * a; sxy += a * b; syy += b * b; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ax = Math.cos(th), ay = Math.sin(th);
    const bins = new Map();
    for (const p of P) { const t = (p[0] - cx) * ax + (p[1] - cy) * ay, q = -(p[0] - cx) * ay + (p[1] - cy) * ax; const k = Math.round(t / 0.6); const b = bins.get(k) || [0, 0]; b[0] += q; b[1]++; bins.set(k, b); }
    const keys = [...bins.keys()].sort((a, b) => a - b).filter((k) => bins.get(k)[1] >= 3);
    if (keys.length < 6) return null;
    const line = keys.map((k) => { const b = bins.get(k); const t = k * 0.6, q = b[0] / b[1]; return [cx + ax * t - ay * q, cy + ay * t + ax * q]; });
    // smooth + keep only points on water
    const sm = line.map((p, i) => { const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]; }).filter((p) => isWater(p[0], p[1]));
    if (sm.length < 6) return null;
    const back = offsetPolyline(sm.slice().reverse(), 0.12);
    return new Path(sm.concat(back, [sm[0]]));
  }

  // ---------- per frame ----------
  const T0 = 2000;
  const stats = { boats: 0, ships: ships.length, statics };
  function update() {
    const t = app.clock.t + T0;
    let n = 0;
    for (const b of boats) {
      if (!enabled) { b.hidden = true; continue; }
      b.hidden = false;
      if (b.move) b.move(b, t);
      if (!b.hidden) n++;
    }
    stats.boats = n;
  }

  // ---------- underlay: wakes + glints ----------
  const view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  function drawWakes(r) {
    if (!enabled) return;
    const c = r.ctx, kx = r.kx, ky = r.ky, ox = r.ox, oy = r.oy;
    viewRect(r, view, 40);
    const a = 0.42 - 0.3 * r.night;
    c.beginPath();
    let any = false;
    for (const b of boats) {
      if (b.hidden || !(b.v > 0)) continue;
      const px = (b.x - b.y) * 32, py = (b.x + b.y) * 16;
      if (px < view.x0 - 200 || px > view.x1 + 200 || py < view.y0 - 120 || py > view.y1 + 120) continue;
      const L = b.len, sx = b.x - b.ux * L * 0.5, sy = b.y - b.uy * L * 0.5;
      const ship = b.kind === 'container' || b.kind === 'tanker';
      const lw = L * (ship ? 0.9 : 1.6) * (0.5 + b.v * 9);
      const nx = -b.uy, ny = b.ux, sp = lw * (ship ? 0.17 : 0.22), bw = b.beam * 0.5;
      const P = (x, y) => [ox + (x - y) * kx, oy + (x + y) * ky];
      const s1 = P(sx + nx * bw, sy + ny * bw), s2 = P(sx - nx * bw, sy - ny * bw);
      const e1 = P(sx - b.ux * lw + nx * sp, sy - b.uy * lw + ny * sp), e2 = P(sx - b.ux * lw - nx * sp, sy - b.uy * lw - ny * sp);
      const m = P(sx - b.ux * lw * 0.8, sy - b.uy * lw * 0.8);
      c.moveTo(s1[0], s1[1]); c.lineTo(e1[0], e1[1]); c.lineTo(m[0], m[1]); c.lineTo(e2[0], e2[1]); c.lineTo(s2[0], s2[1]); c.closePath();
      any = true;
    }
    if (!any) return;
    c.fillStyle = `rgba(240,250,252,${a * 0.3})`; c.fill();
    c.strokeStyle = `rgba(250,253,255,${a * 0.8})`; c.lineWidth = Math.max(0.5, Math.min(1.6, r.zoom * 0.6)); c.stroke();
  }

  // procedural sun glints: hashed points on a world grid, visible only when they "flash"
  function drawGlints(r) {
    const L = r.L;
    if (L.sunI < 0.15 || r.zoom < 0.12) return;
    const c = r.ctx, z = r.zoom, cam = r.cam;
    const cell = z >= 1.2 ? 1.1 : z >= 0.6 ? 1.4 : z >= 0.3 ? 2.2 : 4;
    const w0 = cam.screenToWorld(0, 0), w1 = cam.screenToWorld(r.vw, 0), w2 = cam.screenToWorld(0, r.vh), w3 = cam.screenToWorld(r.vw, r.vh);
    const x0 = Math.floor(Math.min(w0[0], w2[0]) / cell), x1 = Math.ceil(Math.max(w1[0], w3[0]) / cell);
    const y0 = Math.floor(Math.min(w0[1], w1[1]) / cell), y1 = Math.ceil(Math.max(w2[1], w3[1]) / cell);
    if ((x1 - x0) * (y1 - y0) > 9000) return;
    const t = r.t, sz = Math.max(0.8, 1.3 * Math.sqrt(z));
    c.beginPath();
    let cnt = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const hA = hash(cx, cy, 11);
      const ph = Math.sin(t * (1.3 + hA * 2.2) + hA * 40);
      if (ph < 0.93) continue;
      const x = (cx + hash(cx, cy, 12)) * cell, y = (cy + hash(cx, cy, 13)) * cell;
      if (!isWater(x, y)) continue;
      const X = r.ox + (x - y) * r.kx, Y = r.oy + (x + y) * r.ky;
      if (X < 0 || X > r.vw || Y < 0 || Y > r.vh) continue;
      c.rect(X - sz * 1.4, Y - sz * 0.25, sz * 2.8, sz * 0.5);
      c.rect(X - sz * 0.25, Y - sz * 0.9, sz * 0.5, sz * 1.8);
      cnt++;
    }
    if (!cnt) return;
    c.globalAlpha = 0.75 * L.sunI;
    c.fillStyle = '#fffdf2'; c.fill();
    c.globalAlpha = 1;
  }

  app.scene.underlays.push((r) => { drawGlints(r); drawWakes(r); });
  app.scene.dynamicSources.push(() => dyn);

  return {
    update, stats, boats, marinaPath: marina, canalPath: canal,
    setEnabled(v) { enabled = !!v; if (!enabled) for (const b of boats) b.hidden = true; }, get enabled() { return enabled; },
  };
}

// ---------------- drawing ----------------
function hullPts(b, len, beam, cx = b.x, cy = b.y) {
  // pointed bow polygon (counter-clockwise in local frame), written into b.pts
  const ux = b.ux, uy = b.uy, nx = -uy, ny = ux, hl = len / 2, hb = beam / 2;
  const set = (p, a, s) => { p[0] = cx + ux * a + nx * s; p[1] = cy + uy * a + ny * s; };
  set(b.pts[0], hl, 0); set(b.pts[1], hl * 0.45, hb); set(b.pts[2], -hl, hb * 0.92); set(b.pts[3], -hl, -hb * 0.92); set(b.pts[4], hl * 0.45, -hb);
  return b.pts;
}

function drawBoat(r) {
  const b = this, L = r.L, night = r.night, z = r.zoom;
  const big = b.kind === 'container' || b.kind === 'tanker';
  if (!big && b.len * z * 40 < 1.2) return;
  if (b.kind === 'abra') {
    prism(r, hullPts(b, b.len, b.beam), 0, 1.1, b.color === '#2f7290' || b.color === '#b8453a' ? '#7b4f2c' : '#7b4f2c', { top: '#a8804f' });
    if (z > 0.5) {
      obox(r, b.x - b.ux * b.len * 0.05, b.y - b.uy * b.len * 0.05, 2.6, b.ux, b.uy, b.len * 0.36, b.beam * 0.42, 0.35, b.color);
      if (night > 0.1) glowDot(r, b.x, b.y, 2.4, '#ffd27a', 2.2, night * 0.8);
    }
    return;
  }
  if (b.kind === 'cruise') {
    prism(r, hullPts(b, b.len, b.beam), 0, 2.2, '#6d4122', { top: '#9a6a3c' });
    obox(r, b.x - b.ux * b.len * 0.06, b.y - b.uy * b.len * 0.06, 2.2, b.ux, b.uy, b.len * 0.36, b.beam * 0.4, 2.6, '#8b5a32', '#e9dcc0');
    if (night > 0.05 && z > 0.25) {
      // festoon lights along the upper deck
      const c = r.ctx;
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = L.emit('#ffcf7a', 0.95);
      c.beginPath();
      const k = Math.max(4, Math.min(14, Math.round(z * 8))), rad = Math.max(0.7, z * 0.9);
      for (let i = 0; i <= k; i++) {
        const f = -0.4 + (0.8 * i) / k;
        for (const sd of [-1, 1]) {
          const x = b.x + b.ux * b.len * f - b.uy * b.beam * 0.45 * sd, y = b.y + b.uy * b.len * f + b.ux * b.beam * 0.45 * sd;
          const X = r.ox + (x - y) * r.kx, Y = r.oy + (x + y) * r.ky - 5.2 * r.kz;
          c.moveTo(X + rad, Y); c.arc(X, Y, rad, 0, 6.283);
        }
      }
      c.fill();
      c.globalCompositeOperation = 'source-over';
      glowDot(r, b.x, b.y, 4, '#ffb85a', 10, night * 0.35);
    }
    return;
  }
  if (b.kind === 'yacht') {
    prism(r, hullPts(b, b.len, b.beam), 0, 2.4, b.color, { top: '#d8c3a0' });
    const cab = b.color === '#1d2a38' ? '#f2f2f0' : '#fbfbfa';
    let zz = 2.4, hl = b.len * 0.3, hw = b.beam * 0.36;
    for (let d = 0; d < b.decks - 1; d++) {
      const off = -b.len * (0.06 + d * 0.04);
      obox(r, b.x + b.ux * off, b.y + b.uy * off, zz, b.ux, b.uy, hl, hw, 2.3, cab);
      if (z > 0.7) {
        oboxBand(r, b.x + b.ux * off, b.y + b.uy * off, b.ux, b.uy, hl, hw, zz + 0.8, zz + 1.8, night > 0.05 ? L.emit('#ffe2a6', 0.95, 0) : L.shade('#22303c', 0.6, 0.6, 0), 0.08);
      }
      zz += 2.3; hl *= 0.7; hw *= 0.85;
    }
    if (night > 0.05) {
      glowDot(r, b.x, b.y, zz + 1, '#fff2d0', 3, night * 0.6);
      glowDot(r, b.x + b.ux * b.len * 0.5, b.y + b.uy * b.len * 0.5, 2, '#9dff9a', 1.6, night * 0.7);
    }
    return;
  }
  // ships
  const tanker = b.kind === 'tanker';
  prism(r, hullPts(b, b.len, b.beam), 0, b.hh, b.color, { top: tanker ? '#7a4a3a' : '#5a3a30' });
  const lod = z * 40 * b.len;
  if (lod > 10) {
    if (!tanker) {
      // container bays
      const bays = 9;
      for (let i = 0; i < bays; i++) {
        const f = 0.36 - (i / bays) * 0.62;
        const col = CARGO[Math.floor(hash(b.seed, i, 1) * CARGO.length)];
        const hgt = 6 + Math.floor(hash(b.seed, i, 2) * 3) * 2.6;
        obox(r, b.x + b.ux * b.len * f, b.y + b.uy * b.len * f, b.hh, b.ux, b.uy, b.len * 0.032, b.beam * 0.42, hgt, col);
      }
    } else {
      // pipe deck + manifold
      obox(r, b.x + b.ux * b.len * 0.05, b.y + b.uy * b.len * 0.05, b.hh, b.ux, b.uy, b.len * 0.3, b.beam * 0.08, 1.6, '#c9c2b3');
      obox(r, b.x + b.ux * b.len * 0.02, b.y + b.uy * b.len * 0.02, b.hh, b.ux, b.uy, b.len * 0.02, b.beam * 0.4, 2.5, '#c9c2b3');
    }
    // aft superstructure + funnel
    const sx = b.x - b.ux * b.len * 0.38, sy = b.y - b.uy * b.len * 0.38;
    obox(r, sx, sy, b.hh, b.ux, b.uy, b.len * 0.045, b.beam * 0.46, 16, '#f1efe9');
    if (z > 0.35) oboxBand(r, sx, sy, b.ux, b.uy, b.len * 0.045, b.beam * 0.46, b.hh + 12.5, b.hh + 14.5, night > 0.05 ? L.emit('#ffe6b0', 0.9) : L.shade('#2a3642', 0.6, 0.6, 0), 0.1);
    obox(r, sx - b.ux * b.len * 0.05, sy - b.uy * b.len * 0.05, b.hh + 10, b.ux, b.uy, b.len * 0.016, b.beam * 0.12, 12, tanker ? '#c9302c' : '#1e5a8a');
  }
  if (night > 0.05) {
    glowDot(r, b.x + b.ux * b.len * 0.48, b.y + b.uy * b.len * 0.48, b.hh + 8, '#fff6e0', 3, night * 0.8);
    glowDot(r, b.x - b.ux * b.len * 0.38, b.y - b.uy * b.len * 0.38, b.hh + 30, '#fff6e0', 3, night * 0.8);
    glowDot(r, b.x, b.y, b.hh + 2, '#ffd69a', 14, night * 0.25);
  }
}

function glowDot(r, x, y, z, hex, radPx, alpha) {
  const c = r.ctx;
  const rad = Math.max(1.4, radPx * Math.sqrt(r.zoom) * 2);
  const X = r.ox + (x - y) * r.kx, Y = r.oy + (x + y) * r.ky - z * r.kz;
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = Math.min(1, alpha);
  c.drawImage(glowSprite(hex), X - rad, Y - rad, rad * 2, rad * 2);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

function addDhow(app, x, y, ux, uy, R) {
  const len = 0.22 + R() * 0.06, beam = 0.062;
  const b = { x, y, ux, uy, pts: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] };
  const pts = hullPts(b, len, beam).map((p) => [p[0], p[1]]);
  const cargo = [];
  const nC = 2 + Math.floor(R() * 3);
  for (let i = 0; i < nC; i++) cargo.push([0.25 - i * 0.14 + (R() - 0.5) * 0.04, CARGO[Math.floor(R() * CARGO.length)], 1.2 + R() * 1.8, (R() - 0.5) * 0.3]);
  const seed = Math.floor(R() * 1e4);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  app.scene.add({
    x, y, minZoom: 0.3, bbox: { x0, y0, x1, y1, h: 16 },
    draw(r) {
      prism(r, pts, 0, 2.6, '#86542a', { top: '#b58a5a' });
      // raised stern cabin
      const sx = x - ux * len * 0.36, sy = y - uy * len * 0.36;
      obox(r, sx, sy, 2.6, ux, uy, len * 0.11, beam * 0.42, 2.4, '#9a6a3c', '#cbb48a');
      if (r.zoom > 0.6) {
        for (const [f, col, h, s] of cargo) obox(r, x + ux * len * f - uy * beam * s, y + uy * len * f + ux * beam * s, 2.6, ux, uy, len * 0.06, beam * 0.32, h, col);
        // mast
        const mx = x + ux * len * 0.22, my = y + uy * len * 0.22;
        const X = r.ox + (mx - my) * r.kx, Y = r.oy + (mx + my) * r.ky;
        r.ctx.beginPath(); r.ctx.moveTo(X, Y - 2.6 * r.kz); r.ctx.lineTo(X, Y - 13 * r.kz);
        r.ctx.strokeStyle = r.L.shade('#5a3a1f', 0.6, 0.6, 0); r.ctx.lineWidth = Math.max(0.6, r.zoom * 0.7); r.ctx.stroke();
      }
      if (r.night > 0.1 && hash(seed, 1) < 0.6) glowDot(r, sx, sy, 5.5, '#ffcf80', 2, r.night * 0.8);
    },
  });
  return 1;
}
