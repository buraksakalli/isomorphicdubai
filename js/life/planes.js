// Aircraft: arrivals on DXB 12L from the north-west (over the Gulf, 3° glide path, flare, rollout, taxi off),
// departures from 12R (line-up, take-off roll, climb-out and turn), plus a few at DWC.
// Trajectories are precomputed once at 0.5 s resolution; each frame just interpolates. Planes are overlays drawn
// at their real altitude; their sun shadows are an underlay. Nav lights (red/green/white strobe/beacon) at night.
// LIVE: when the flight relay (/api/flights) answers, real ADS-B traffic replaces the simulation (see live.js);
// if it is missing or goes stale, the simulation resumes automatically.
import { RUNWAYS } from '../data/geo.js';
import { createLiveFeed } from './live.js';
import { hash } from '../core/shapes.js';
import { bezier, densify, clamp, smooth, glowSprite } from './util.js';

const DT = 0.5;              // trajectory sample step (s)
const GLIDE = Math.tan((3 * Math.PI) / 180);
const TYPES = [               // length, span (m), engines, weight
  { L: 73, S: 80, eng: 4, w: 2 },   // A380-like
  { L: 74, S: 65, eng: 2, w: 4 },   // 777-like
  { L: 57, S: 60, eng: 2, w: 2 },   // 787-like
  { L: 38, S: 36, eng: 2, w: 3 },   // narrow-body
];
const TAILS = ['#c8102e', '#1f4e9c', '#c9a227', '#0b6e4f', '#5b2c83', '#e0e3e6', '#d4572a', '#16324f'];
const SIZE = 1.5; // slight exaggeration for legibility at city zooms

// Live traffic: ICAO type designator → silhouette (index into TYPES); unknown → by ADS-B emitter category.
const TYPE_OF = (t, cat) => {
  if (t === 'A388') return 0;
  if (/^(B74|B77|A34|A35K)/.test(t)) return 1;
  if (/^(B78|B76|A33|A35|A30|A31|MD11|IL96)/.test(t)) return 2;
  if (t) return 3;
  return cat === 'A5' ? 1 : 3;
};
// a few well-known local operators by ICAO callsign prefix; everyone else gets a stable colour from the prefix
const OPERATOR_TAIL = { UAE: '#c8102e', FDB: '#1f6fb5', ETD: '#c9a227', ABY: '#d22630' };
// Cruise altitudes (~11 km) would push planes far from their ground track in this projection, so altitude above
// 2 km is compressed for display (11 km → ~5.2 km, the simulation's ceiling). Shadows use the same value.
const DISPLAY_Z = (z) => (z <= 2000 ? z : 2000 + (z - 2000) * 0.35);

export function createPlanes(app) {
  const g = app.geo;
  const rw = Object.fromEntries(RUNWAYS.map((r) => [r.id, { a: g.toWorld(...r.a), b: g.toWorld(...r.b), airport: r.airport }]));
  const W = g.W, H = g.H;
  const streams = [];

  function frame(arr) { return { x: new Float32Array(arr.length), y: new Float32Array(arr.length), z: new Float32Array(arr.length), ux: new Float32Array(arr.length), uy: new Float32Array(arr.length), ll: new Uint8Array(arr.length), n: arr.length }; }
  function pack(samples) {
    const f = frame(samples);
    samples.forEach((s, i) => { f.x[i] = s[0]; f.y[i] = s[1]; f.z[i] = s[2]; f.ux[i] = s[3]; f.uy[i] = s[4]; f.ll[i] = s[5]; });
    f.dur = (samples.length - 1) * DT;
    return f;
  }
  // integrate along a polyline with speed(s) (m/s) and altitude(s) (m); s in tiles
  function integrate(pts, zf, vf, hold = 0, llf = () => 1, stop = null) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    const out = [];
    let s = 0, i = 0;
    const sample = () => {
      while (i < pts.length - 2 && cum[i + 1] <= s) i++;
      const L = cum[i + 1] - cum[i] || 1, f = clamp((s - cum[i]) / L, 0, 1);
      const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
      return [x, y, zf(s), (pts[i + 1][0] - pts[i][0]) / L, (pts[i + 1][1] - pts[i][1]) / L, llf(s)];
    };
    for (let k = 0; k < hold / DT; k++) out.push(sample());
    let guard = 0;
    while (s < total && guard++ < 20000) {
      const p = sample();
      out.push(p);
      if (stop && stop(p)) break;
      s += (vf(s) / 100) * DT;
    }
    return pack(out);
  }
  const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dx / l, dy / l, l]; };
  const add = (p, u, k, n = null, m = 0) => [p[0] + u[0] * k + (n ? n[0] * m : 0), p[1] + u[1] * k + (n ? n[1] * m : 0)];

  function arrival(r, lateral, finalLen, turnSide) {
    const [ux, uy, RL] = unit(r.a, r.b), u = [ux, uy], n = [-uy, ux];
    const thr = add(r.a, u, 0.3), F = add(thr, u, -finalLen);
    const S = add(F, u, -110, n, lateral), C = add(F, u, -55, n, lateral * 0.15);
    const pts = [S, ...bezier(S, C, F, 40)];
    const sJoin = pathLen(pts);
    pts.push(...densify([F, thr], 4).slice(1));
    const sThr = pathLen(pts);
    const rollEnd = add(thr, u, Math.min(RL * 0.62, 22));
    pts.push(rollEnd);
    const sRoll = pathLen(pts);
    const side = turnSide;
    const exitA = add(rollEnd, u, 1.6, n, side * 1.4), exitB = add(rollEnd, u, 2.2, n, side * 5);
    pts.push(...bezier(rollEnd, add(rollEnd, u, 1.8), exitA, 8), ...densify([exitA, exitB], 1).slice(1));
    const zF = finalLen * 100 * GLIDE + 15, z0 = Math.max(zF + 300, 1600);
    return integrate(pts,
      (s) => (s < sJoin ? z0 + (zF - z0) * (s / sJoin) : s < sThr ? (sThr - s) * 100 * GLIDE + 15 : Math.max(0, 15 - ((s - sThr) * 100 * 15) / 450)),
      (s) => (s < sJoin ? 128 - 40 * (s / sJoin) : s < sThr ? 88 - 16 * ((s - sJoin) / (sThr - sJoin)) : s < sRoll ? Math.sqrt(Math.max(144, 72 * 72 - 2 * 1.25 * (s - sThr) * 100)) : 11),
      0, (s) => (s < sRoll ? 1 : 0));
  }
  function departure(r, turnDeg, hold) {
    const [ux, uy, RL] = unit(r.a, r.b), u = [ux, uy], n = [-uy, ux];
    const start = add(r.a, u, 0.12);
    const lift = 82 * 82 / (2 * 1.9) / 100; // tiles to rotation
    const sLift = lift;
    const straight = add(start, u, lift + 95);
    const th = (turnDeg * Math.PI) / 180;
    const u2 = [ux * Math.cos(th) - uy * Math.sin(th), ux * Math.sin(th) + uy * Math.cos(th)];
    const C = add(straight, u, 55), E = add(C, u2, 60), F = add(E, u2, 420);
    const pts = [start, ...densify([start, straight], 6).slice(1), ...bezier(straight, C, E, 24), ...densify([E, F], 10).slice(1)];
    return integrate(pts,
      (s) => (s < sLift ? 0 : Math.min((s - sLift) * 100 * 0.085, 900) + Math.max(0, (s - sLift) * 100 * 0.085 - 900) * 0.6),
      (s) => (s < sLift ? Math.max(4, Math.sqrt(2 * 1.9 * s * 100)) : Math.min(165, 82 + (s - sLift) * 100 * 0.012)),
      hold, (s) => (s < sLift + 60 ? 1 : 0),
      (p) => p[2] > 5200 || p[0] < -60 || p[1] < -60 || p[0] > W + 60 || p[1] > H + 60);
  }
  function pathLen(p) { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; }

  const dxbA = rw['dxb-12l'], dxbD = rw['dxb-12r'], dwc = rw['dwc-12'];
  if (dxbA) streams.push({ id: 1, interval: 105, trajs: [-70, -38, 0, 34, 62].map((lat, i) => arrival(dxbA, lat, 150 + i * 8, 1)) });
  if (dxbD) streams.push({ id: 2, interval: 118, offset: 40, trajs: [-55, -25, 20, 48, 75].map((d, i) => departure(dxbD, d, 22 + i * 3)) });
  if (dwc) streams.push({ id: 3, interval: 560, offset: 200, trajs: [-30, 25].map((lat, i) => arrival(dwc, lat, 140 + i * 15, -1)) });
  if (dwc) streams.push({ id: 4, interval: 640, offset: 470, trajs: [-40, 35].map((d) => departure(dwc, d, 25)) });
  for (const s of streams) s.dur = Math.max(...s.trajs.map((t) => t.dur));

  const pool = [];
  const newP = () => ({ x: 0, y: 0, z: 0, ux: 1, uy: 0, alpha: 1, type: TYPES[0], tail: '#fff', seed: 0, ll: 0, on: false, cs: '', id: '' });
  for (let i = 0; i < 40; i++) pool.push(newP());
  const active = [];
  let enabled = true;
  const T0 = 50000;
  const stats = { planes: 0, source: 'sim' };

  const feed = createLiveFeed(app);
  feed.start();
  let lastWall = performance.now();
  function updateLive(dt) {
    let pi = 0;
    feed.each((tr, x, y, z, a) => {
      if (pi >= pool.length) { if (pool.length >= 200) return; pool.push(newP()); }
      const p = pool[pi++];
      p.x = x; p.y = y; p.z = DISPLAY_Z(z);
      p.ux = Math.cos(tr.hdg); p.uy = Math.sin(tr.hdg);
      p.alpha = a;
      p.type = TYPES[TYPE_OF(tr.t, tr.cat)];
      const pre = /^[A-Z]{3}\d/.test(tr.cs) ? tr.cs.slice(0, 3) : '';
      p.tail = OPERATOR_TAIL[pre] || TAILS[Math.floor(hash(pre ? pre.charCodeAt(0) * 31 + pre.charCodeAt(1) * 7 + pre.charCodeAt(2) : parseInt(tr.id.slice(-4), 16) || 0, 11, 5) * TAILS.length)];
      p.seed = (parseInt(tr.id.slice(-3), 16) || 0) % 10;
      p.ll = z < 1500 && (!tr.gnd || tr.gs > 25) ? 1 : 0;   // landing/taxi lights low down, or on the take-off roll
      p.cs = tr.cs; p.id = tr.id;
      active.push(p);
    }, dt);
  }

  function update() {
    active.length = 0;
    const now = performance.now(), wdt = Math.min(1, (now - lastWall) / 1000); lastWall = now;
    if (!enabled) { stats.planes = 0; return; }
    if (feed.live) {
      stats.source = 'live';
      updateLive(wdt);
      sortActive();
      return;
    }
    stats.source = 'sim';
    const T = app.clock.t + T0;
    let pi = 0;
    for (const st of streams) {
      const off = st.offset || 0;
      const k0 = Math.ceil((T - off - st.dur) / st.interval), k1 = Math.floor((T - off) / st.interval);
      for (let k = k0; k <= k1 && pi < pool.length; k++) {
        const tr = st.trajs[Math.floor(hash(k, st.id, 3) * st.trajs.length)];
        const age = T - off - k * st.interval;
        if (age < 0 || age >= tr.dur) continue;
        const f = age / DT, i = Math.min(tr.n - 2, Math.floor(f)), w = f - i;
        const p = pool[pi++];
        p.x = tr.x[i] + (tr.x[i + 1] - tr.x[i]) * w; p.y = tr.y[i] + (tr.y[i + 1] - tr.y[i]) * w; p.z = tr.z[i] + (tr.z[i + 1] - tr.z[i]) * w;
        let ux = tr.ux[i] + (tr.ux[i + 1] - tr.ux[i]) * w, uy = tr.uy[i] + (tr.uy[i + 1] - tr.uy[i]) * w; const l = Math.hypot(ux, uy) || 1;
        p.ux = ux / l; p.uy = uy / l;
        p.alpha = Math.min(1, age / 4, (tr.dur - age) / 6);
        const hh = hash(k, st.id, 9);
        let acc = hh * 11, ti = 0; while (ti < TYPES.length - 1 && acc > TYPES[ti].w) { acc -= TYPES[ti].w; ti++; }
        p.type = st.id >= 3 && ti === 0 ? TYPES[1] : TYPES[ti];
        p.tail = TAILS[Math.floor(hash(k, st.id, 5) * TAILS.length)];
        p.seed = hash(k, st.id, 7) * 10; p.ll = tr.ll[i]; p.cs = ''; p.id = '';
        active.push(p);
      }
    }
    sortActive();
  }
  function sortActive() {
    // far (small x+y) first
    for (let i = 1; i < active.length; i++) { const p = active[i]; let j = i - 1; while (j >= 0 && active[j].x + active[j].y > p.x + p.y) { active[j + 1] = active[j]; j--; } active[j + 1] = p; }
    stats.planes = active.length;
  }

  // ---------- drawing ----------
  const Q = new Float32Array(16);
  function shape(r, p, z, part, fill) {
    // part: 0 wings, 1 tailplane, 2 fuselage. Local (a forward, s right) in metres → screen.
    const c = r.ctx, L = p.type.L * SIZE, S = p.type.S * SIZE, w = L * 0.085;
    const ux = p.ux / 100, uy = p.uy / 100, nx = -uy, ny = ux;
    const X = (a, s) => r.ox + (p.x + ux * a + nx * s - (p.y + uy * a + ny * s)) * r.kx;
    const Y = (a, s, dz = 0) => r.oy + (p.x + ux * a + nx * s + p.y + uy * a + ny * s) * r.ky - (z + dz) * r.kz;
    c.beginPath();
    if (part === 0) {
      for (const sd of [-1, 1]) {
        c.moveTo(X(0.13 * L, 0), Y(0.13 * L, 0)); c.lineTo(X(-0.17 * L, sd * S / 2), Y(-0.17 * L, sd * S / 2));
        c.lineTo(X(-0.25 * L, sd * S / 2), Y(-0.25 * L, sd * S / 2)); c.lineTo(X(-0.14 * L, sd * w * 0.4), Y(-0.14 * L, sd * w * 0.4)); c.closePath();
      }
    } else if (part === 1) {
      for (const sd of [-1, 1]) {
        c.moveTo(X(-0.36 * L, 0), Y(-0.36 * L, 0)); c.lineTo(X(-0.47 * L, sd * S * 0.17), Y(-0.47 * L, sd * S * 0.17));
        c.lineTo(X(-0.51 * L, sd * S * 0.17), Y(-0.51 * L, sd * S * 0.17)); c.lineTo(X(-0.47 * L, 0), Y(-0.47 * L, 0)); c.closePath();
      }
    } else if (part === 2) {
      c.moveTo(X(0.5 * L, 0), Y(0.5 * L, 0, w * 0.4));
      c.quadraticCurveTo(X(0.47 * L, w / 2), Y(0.47 * L, w / 2, w * 0.5), X(0.4 * L, w / 2), Y(0.4 * L, w / 2, w * 0.5));
      c.lineTo(X(-0.38 * L, w / 2), Y(-0.38 * L, w / 2, w * 0.5)); c.lineTo(X(-0.5 * L, w * 0.12), Y(-0.5 * L, w * 0.12, w * 0.7));
      c.lineTo(X(-0.5 * L, -w * 0.12), Y(-0.5 * L, -w * 0.12, w * 0.7)); c.lineTo(X(-0.38 * L, -w / 2), Y(-0.38 * L, -w / 2, w * 0.5));
      c.lineTo(X(0.4 * L, -w / 2), Y(0.4 * L, -w / 2, w * 0.5));
      c.quadraticCurveTo(X(0.47 * L, -w / 2), Y(0.47 * L, -w / 2, w * 0.5), X(0.5 * L, 0), Y(0.5 * L, 0, w * 0.4));
      c.closePath();
    } else if (part === 3) { // fin (vertical)
      const h = 0.17 * L;
      c.moveTo(X(-0.33 * L, 0), Y(-0.33 * L, 0, w * 0.6)); c.lineTo(X(-0.5 * L, 0), Y(-0.5 * L, 0, w * 0.6));
      c.lineTo(X(-0.53 * L, 0), Y(-0.53 * L, 0, w * 0.6 + h)); c.lineTo(X(-0.45 * L, 0), Y(-0.45 * L, 0, w * 0.6 + h)); c.closePath();
    } else if (part === 4) { // engines
      const pos = p.type.eng === 4 ? [-0.36, -0.2, 0.2, 0.36] : [-0.27, 0.27];
      for (const f of pos) {
        const s = f * S, a = 0.12 * L - Math.abs(f) * 0.42 * L + 0.04 * L, el = 0.07 * L, ew = w * 0.32;
        c.moveTo(X(a + el, s + ew), Y(a + el, s + ew, -w * 0.15)); c.lineTo(X(a + el, s - ew), Y(a + el, s - ew, -w * 0.15));
        c.lineTo(X(a - el, s - ew), Y(a - el, s - ew, -w * 0.15)); c.lineTo(X(a - el, s + ew), Y(a - el, s + ew, -w * 0.15)); c.closePath();
      }
    }
    if (fill) { c.fillStyle = fill; c.fill(); }
  }

  function drawPlanes(r) {
    if (!enabled || !active.length) return;
    const c = r.ctx, L = r.L, night = r.night, T = app.clock.t + T0;
    const sp = glowSprite('#ffffff', 0.15), red = glowSprite('#ff2a20', 0.2), grn = glowSprite('#2aff6a', 0.2), warm = glowSprite('#fff1cc', 0.12);
    for (const p of active) {
      const X = r.ox + (p.x - p.y) * r.kx, Y = r.oy + (p.x + p.y) * r.ky - p.z * r.kz;
      const ext = p.type.S * SIZE * 0.012 * r.kx + 30;
      if (X < -ext || X > r.vw + ext || Y < -ext || Y > r.vh + ext) continue;
      c.globalAlpha = p.alpha;
      const sizePx = p.type.L * SIZE / 100 * r.kx;
      if (sizePx < 2.5) {
        // dot LOD
        c.fillStyle = L.shade('#f4f6f8', 0, 0, 1);
        c.fillRect(X - 1, Y - 1, 2, 2);
      } else {
        const sideN = -p.uy + p.ux > 0 ? 1 : -1; // which side of the fin faces the viewer
        if (sizePx > 10) shape(r, p, p.z, 4, L.shade('#9aa3ad', 0.5, 0.5, 0.3));
        shape(r, p, p.z, 0, L.shade('#dfe3e8', 0, 0, 1));
        shape(r, p, p.z + 0.5, 1, L.shade('#dfe3e8', 0, 0, 1));
        shape(r, p, p.z, 2, L.shade('#f6f7f8', 0.15, 0.15, 0.95));
        shape(r, p, p.z, 3, L.shade(p.tail, -p.uy * sideN, p.ux * sideN, 0.2));
        if (sizePx > 22) { // cockpit windows
          const lx = p.x + (p.ux * p.type.L * SIZE * 0.44) / 100, ly = p.y + (p.uy * p.type.L * SIZE * 0.44) / 100;
          c.fillStyle = L.shade('#2a3440', 0, 0, 1);
          c.fillRect(r.ox + (lx - ly) * r.kx - 1, r.oy + (lx + ly) * r.ky - (p.z + 4) * r.kz - 0.8, 2, 1.6);
        }
      }
      // lights
      const la = (0.25 + 0.75 * night) * p.alpha;
      c.globalCompositeOperation = 'lighter';
      const Lm = p.type.L * SIZE, Sm = p.type.S * SIZE;
      const P = (a, s, dz) => {
        const x = p.x + (p.ux * a - p.uy * s) / 100, y = p.y + (p.uy * a + p.ux * s) / 100;
        Q[0] = r.ox + (x - y) * r.kx; Q[1] = r.oy + (x + y) * r.ky - (p.z + dz) * r.kz; return Q;
      };
      const gs = Math.max(2.4, 4.4 * Math.sqrt(r.zoom));
      P(-0.21 * Lm, -Sm / 2, 1); blit(c, red, Q[0], Q[1], gs, la);
      P(-0.21 * Lm, Sm / 2, 1); blit(c, grn, Q[0], Q[1], gs, la);
      P(-0.52 * Lm, 0, 6); blit(c, sp, Q[0], Q[1], gs * 0.8, la * 0.8);
      const ph = (T + p.seed) % 1.3;
      if (ph < 0.07 || (ph > 0.16 && ph < 0.22)) {
        P(-0.21 * Lm, -Sm / 2, 1); blit(c, sp, Q[0], Q[1], gs * 2.2, p.alpha);
        P(-0.21 * Lm, Sm / 2, 1); blit(c, sp, Q[0], Q[1], gs * 2.2, p.alpha);
      }
      if ((T * 1.1 + p.seed) % 1 < 0.12) { P(0, 0, 8); blit(c, red, Q[0], Q[1], gs * 1.6, la); }
      if (p.ll && p.z < 1500) { P(0.3 * Lm, 0, 0); blit(c, warm, Q[0], Q[1], gs * (2.5 + 3 * night), (0.35 + 0.65 * night) * p.alpha); }
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      if (p.cs && sizePx > 7) label(c, p.cs, X, Y - Math.max(8, sizePx * 0.55) - 4, p.alpha, night);
    }
  }
  function label(c, text, X, Y, a, night) {
    c.globalAlpha = a * 0.92;
    c.font = '600 10.5px Inter, system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.lineJoin = 'round'; c.lineWidth = 3;
    c.strokeStyle = night > 0.5 ? 'rgba(8,16,30,.85)' : 'rgba(255,250,240,.85)';
    c.fillStyle = night > 0.5 ? '#f3e7cf' : '#1f2a36';
    c.strokeText(text, X, Y); c.fillText(text, X, Y);
    c.globalAlpha = 1;
  }
  function blit(c, spr, X, Y, rad, a) {
    if (a <= 0.01) return;
    c.globalAlpha = Math.min(1, a);
    c.drawImage(spr, X - rad, Y - rad, rad * 2, rad * 2);
  }

  const shadowP = { x: 0, y: 0, ux: 1, uy: 0, type: TYPES[0] };
  function drawShadows(r) {
    if (!enabled || !active.length) return;
    const L = r.L, s = L.sun;
    if (L.sunI < 0.05 || s[2] < 0.1) return;
    const c = r.ctx, sh = shadowP;
    for (const p of active) {
      const k = Math.min(1 / s[2], 6);
      const dx = (-s[0] * k * p.z) / 100, dy = (-s[1] * k * p.z) / 100;
      sh.x = p.x + dx; sh.y = p.y + dy; sh.ux = p.ux; sh.uy = p.uy; sh.type = p.type;
      const X = r.ox + (sh.x - sh.y) * r.kx, Y = r.oy + (sh.x + sh.y) * r.ky;
      if (X < -60 || X > r.vw + 60 || Y < -60 || Y > r.vh + 60) continue;
      const a = 0.22 * L.sunI * p.alpha * clamp(1 - p.z / 3500, 0.15, 1);
      c.globalAlpha = a;
      const col = '#1d2733';
      shape(r, sh, 0, 0, col); shape(r, sh, 0, 1, col); shape(r, sh, 0, 2, col);
      c.globalAlpha = 1;
    }
  }

  app.scene.underlays.push(drawShadows);
  app.scene.overlays.push(drawPlanes);
  return {
    update, stats, active, feed,
    setEnabled(v) { enabled = !!v; if (!enabled) { active.length = 0; feed.stop(); } else feed.start(); }, get enabled() { return enabled; },
  };
}
