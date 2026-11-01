// Inland & south: Mall of the Emirates + Ski Dubai, Al Wasl Dome (Expo City), Meydan Racecourse,
// DXB Terminal 3, Global Village, Dubai Miracle Garden.
import { Mesh, frame, extrude, loftM, lathe, entry, add, rectL, ellL, hsla, glowAt, fillPoly, onScreen, clamp, TAU,
  domeM, circle, tube, clearSite, boxM, hueToHex } from './util.js';
import { hash, palm } from '../../core/shapes.js';
import { RUNWAYS } from '../../data/geo.js';

// ------------------------------------------------------------------------------------------------
// Mall of the Emirates + Ski Dubai
// ------------------------------------------------------------------------------------------------
function mallOfTheEmirates(app) {
  const lm = entry(app, {
    id: 'mall-of-the-emirates', lat: 25.1181, lon: 55.2006, zoom: 1.8, category: 'leisure',
    name: { en: 'Mall of the Emirates & Ski Dubai', ar: 'مول الإمارات وسكي دبي' },
    blurb: { en: 'A major shopping mall on Sheikh Zayed Road, home to Ski Dubai: an indoor ski slope inside the long silver tube that rises above the mall.',
      ar: 'مركز تسوق كبير على شارع الشيخ زايد، يضم سكي دبي: منحدر تزلج داخلي داخل الأنبوب الفضي الطويل الذي يرتفع فوق المول.' },
    facts: [{ en: 'Opened in 2005', ar: 'افتُتح عام 2005' }],
  });
  const F = frame(lm.x, lm.y, -38);  // u along Sheikh Zayed Road, v away from it (SE)
  clearSite(app, rectL(F, 0, 0, 280, 190));
  const parts = [[-160, 20, 90, 110, 28], [0, 40, 80, 120, 34], [160, 30, 80, 110, 28], [0, 160, 200, 30, 18]];
  parts.forEach(([u, v, hu, hv, h], i) => {
    const m = new Mesh();
    const pts = rectL(F, u, v, hu, hv);
    extrude(m, pts, 0, h, '#e7e1d6', { top: '#d9d3c7', win: { floor: 6, seed: 500 + i, lit: 0.9, glass: '#7f8a90', light: '#ffdca6', band: 0.25, alpha: 0.3 }, glow: '#ffd69a', ga: 0.15 });
    if (i === 1) { const [cx, cy] = F(u, v); domeM(m, cx, cy, 30, h, 12, 16, '#c8d6de', { glow: '#ffe0a8', ga: 0.4 }); }
    m.done();
    add(app, lm, { mesh: m, shadow: [{ pts, h }] });
  });
  // Ski Dubai: an inclined, arched silver tube rising toward the north-west
  const m = new Mesh();
  const N = 12, Lh = 200, W = 40;
  const sec = (s) => {
    const u = -Lh + s * 2 * Lh;   // along the slope axis
    const base = 24 + (1 - s) * 60; // rises toward the south-west end
    const pts = [];
    pts.push([u, -W, 0]);
    for (let k = 0; k <= 8; k++) { const a = Math.PI - (k / 8) * Math.PI; pts.push([u, Math.cos(a) * W, base + Math.sin(a) * 16]); }
    pts.push([u, W, 0]);
    return pts;
  };
  const Fs = frame(...F(-40, -60), -38); // axis along the mall, rising toward the south-west
  const P = ([u, v, z]) => Fs.p3(u, v, z);
  for (let i = 0; i < N; i++) {
    const A = sec(i / N), B = sec((i + 1) / N);
    const mid = Fs.p3((A[0][0] + B[0][0]) / 2, 0, 10);
    for (let k = 0; k < A.length - 1; k++) {
      m.face([P(A[k]), P(B[k]), P(B[k + 1]), P(A[k + 1])], '#d3d9de', { out: mid, glow: '#cfe8ff', ga: 0.3 });
    }
  }
  const end = sec(1);
  m.face(end.map(P), '#b9c1c8', { out: Fs.p3(0, 0, 30) });
  const st = sec(0);
  m.face(st.map(P), '#b9c1c8', { out: Fs.p3(0, 0, 30) });
  m.done();
  const [sx, sy] = Fs(0, 0);
  add(app, lm, { mesh: m, x: sx, y: sy, shadow: [{ pts: rectL(Fs, 0, 0, Lh, W), h: 60 }] });
}

// ------------------------------------------------------------------------------------------------
// Al Wasl Dome — Expo City Dubai
// ------------------------------------------------------------------------------------------------
function alWasl(app) {
  const lm = entry(app, {
    id: 'al-wasl-dome', lat: 24.9637, lon: 55.1479, zoom: 3.0, category: 'culture',
    name: { en: 'Al Wasl Dome, Expo City Dubai', ar: 'قبة الوصل، مدينة إكسبو دبي' },
    blurb: { en: 'The steel trellis dome at the heart of Expo 2020 Dubai, which doubles as a 360-degree projection surface lit up for shows at night.',
      ar: 'القبة الشبكية الفولاذية في قلب إكسبو 2020 دبي، وتتحول ليلاً إلى شاشة عرض بزاوية 360 درجة.' },
    facts: [{ en: 'Expo 2020 Dubai ran from October 2021 to March 2022', ar: 'أُقيم إكسبو 2020 دبي من أكتوبر 2021 إلى مارس 2022' }],
  });
  const { x, y } = lm;
  clearSite(app, ellL(frame(x, y), 0, 0, 90, 90, 12));
  const R = 65, H = 67.5;
  const ML = 32, PL = 9;
  const pt = (a, k) => { // k: 0 (base) .. PL (top)
    const ph = (k / PL) * (Math.PI / 2) * 0.93;
    const rr = R * Math.cos(ph), z = H * Math.sin(ph) / Math.sin((Math.PI / 2) * 0.93);
    return [x + (Math.cos(a) * rr) / 100, y + (Math.sin(a) * rr) / 100, z];
  };
  const grid = [];
  for (let i = 0; i < ML; i++) { const row = []; for (let k = 0; k <= PL; k++) row.push(pt((i / ML) * TAU, k)); grid.push(row); }
  // pre-split faces into back (far side, seen through the trellis) and front
  const quads = [];
  for (let i = 0; i < ML; i++) for (let k = 0; k < PL; k++) {
    const a = grid[i][k], b = grid[(i + 1) % ML][k], c = grid[(i + 1) % ML][k + 1], d = grid[i][k + 1];
    const mx = (a[0] + b[0] + c[0] + d[0]) / 4 - x, my = (a[1] + b[1] + c[1] + d[1]) / 4 - y;
    quads.push({ p: [a, b, c, d], back: mx + my < 0, i, k });
  }
  quads.sort((q1, q2) => (q1.p[0][0] + q1.p[0][1]) - (q2.p[0][0] + q2.p[0][1]));
  const proj = (r, p) => [r.X(p[0], p[1]), r.Y(p[0], p[1], p[2])];
  add(app, lm, { x, y, bbox: { x0: x - 0.7, y0: y - 0.7, x1: x + 0.7, y1: y + 0.7, h: H + 3 },
    shadow: [{ pts: circle(x, y, R * 0.75, 10), h: 25 }],
    draw(r) {
      const c = r.ctx, night = r.night, t = r.t;
      // inner projection surface (back half), seen through the trellis
      for (const q of quads) {
        if (!q.back) continue;
        c.beginPath(); q.p.forEach((p, j) => { const [X, Y] = proj(r, p); j ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath();
        if (night > 0.1) {
          const hue = (q.i * 360 / ML + t * 40 + q.k * 25) % 360;
          const wave = 0.5 + 0.5 * Math.sin(q.i * 0.6 - t * 1.5 + q.k * 0.8);
          c.fillStyle = hsla(hue, 85, 45 + wave * 20, (0.55 + 0.35 * wave) * night);
        } else c.fillStyle = r.L.shade('#cfc8bd', -0.3, -0.3, 0.6);
        c.fill();
      }
      // trellis lines
      const lw = Math.max(0.5, 1.1 * r.zoom);
      c.lineWidth = lw;
      c.strokeStyle = night > 0.1 ? `rgba(255,236,210,${(0.35 + 0.3 * night).toFixed(3)})` : r.L.shade('#f1ece4', 0.3, 0.5, 0.6);
      c.beginPath();
      for (let i = 0; i < ML; i++) for (let k = 0; k < PL; k++) {
        const a = proj(r, grid[i][k]), b = proj(r, grid[i][k + 1]);
        c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      }
      for (let k = 1; k <= PL; k += 2) for (let i = 0; i < ML; i++) {
        const a = proj(r, grid[i][k]), b = proj(r, grid[(i + 1) % ML][k]);
        c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      }
      // diagonal trellis bracing (front only for clarity)
      for (let i = 0; i < ML; i++) for (let k = 0; k < PL; k += 2) {
        const a = proj(r, grid[i][k]), b = proj(r, grid[(i + 1) % ML][k + 2 > PL ? PL : k + 2]);
        c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      }
      c.stroke();
      // the oculus ring at the top + base ring
      c.lineWidth = lw * 2;
      c.beginPath();
      for (let i = 0; i <= ML; i++) { const [X, Y] = proj(r, grid[i % ML][PL]); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }
      c.stroke();
      if (night > 0.1) glowAt(r, x, y, 20, 70, hueToHex(t * 40), 0.25 * night);
    } });
}

// ------------------------------------------------------------------------------------------------
// Meydan Racecourse grandstand
// ------------------------------------------------------------------------------------------------
function meydan(app) {
  const lm = entry(app, {
    id: 'meydan-racecourse', lat: 25.1590, lon: 55.2970, zoom: 1.6, category: 'leisure',
    name: { en: 'Meydan Racecourse', ar: 'مضمار ميدان' },
    blurb: { en: 'Home of the Dubai World Cup horse race, with a vast crescent-shaped grandstand under a sweeping white canopy.',
      ar: 'موطن سباق كأس دبي العالمي للخيول، بمدرّج ضخم على شكل هلال تعلوه مظلة بيضاء ممتدة.' },
    facts: [{ en: 'Opened in 2010', ar: 'افتُتح عام 2010' }],
  });
  const F = frame(lm.x, lm.y, -20);
  clearSite(app, rectL(F, 0, 300, 800, 380), 3);
  // track (underlay): oval in front (to the south-east) of the grandstand
  const outer = ellL(F, 0, 330, 720, 290, 48), turf = ellL(F, 0, 330, 690, 262, 48), inner = ellL(F, 0, 330, 640, 220, 48), lake = ellL(F, 120, 340, 160, 50, 20);
  app.scene.underlays.push((r) => {
    if (!onScreen(r, lm.x - 9, lm.y - 9, lm.x + 9, lm.y + 9)) return;
    fillPoly(r, outer, 0, r.L.shade('#b58e62', 0, 0, 1));
    fillPoly(r, turf, 0, r.L.shade('#6fae55', 0, 0, 1));
    fillPoly(r, inner, 0, r.L.shade('#9cc874', 0, 0, 1));
    fillPoly(r, lake, 0, r.L.shade('#4aa9c7', 0, 0, 1));
  });
  // grandstand: segmented crescent
  const N = 16, Rr = 900, span = 0.95;
  const cen = [0, Rr - 60]; // circle centre to the south-east → the stand bows around the track
  for (let i = 0; i < N; i++) {
    const a0 = -span / 2 + (i / N) * span, a1 = -span / 2 + ((i + 1) / N) * span;
    const P = (a, rad) => F(cen[0] + Math.sin(a) * rad, cen[1] - Math.cos(a) * rad);
    const m = new Mesh();
    const back0 = P(a0, Rr), back1 = P(a1, Rr), front0 = P(a0, Rr - 55), front1 = P(a1, Rr - 55);
    // building body (glass back, tiered seating sloping down toward the track)
    extrude(m, [back0, back1, P(a1, Rr - 20), P(a0, Rr - 20)], 0, 30, '#e8ecef', { top: '#d6dbdf', win: { floor: 4.5, seed: i, lit: 0.8, glass: '#6f8796', light: '#ffe4b0', alpha: 0.5 } });
    const z3 = (p, z) => [p[0], p[1], z];
    m.face([z3(P(a0, Rr - 20), 22), z3(P(a1, Rr - 20), 22), z3(front1, 2), z3(front0, 2)], '#b4bcc3', { two: true });
    // white canopy cantilevered over the seating, curling up at its lip
    const lip0 = P(a0, Rr - 75), lip1 = P(a1, Rr - 75);
    m.face([z3(back0, 40), z3(back1, 40), z3(lip1, 46), z3(lip0, 46)], '#fbfbfa', { n: [0, 0, 1], glow: '#e8f2ff', ga: 0.35 });
    m.face([z3(lip0, 46), z3(lip1, 46), z3(lip1, 43), z3(lip0, 43)], '#f0f0ee', { two: true, glow: '#ffffff', ga: 0.6 });
    m.line(z3(P((a0 + a1) / 2, Rr - 5), 30), z3(P((a0 + a1) / 2, Rr - 5), 40), '#dfe3e6', 1.5);
    m.line(z3(lip0, 43.5), z3(lip1, 43.5), '#ffffff', 1.2, { glow: '#fff6e0', ga: 0.95 });
    m.light(z3(P((a0 + a1) / 2, Rr - 70), 42), 26, '#fff2d0', 0.45);
    m.done();
    add(app, lm, { mesh: m, shadow: [{ pts: [back0, back1, lip1, lip0], h: 40 }] });
  }
}

// ------------------------------------------------------------------------------------------------
// DXB Terminal 3 + concourses
// ------------------------------------------------------------------------------------------------
function drawParkedPlane(r, x, y, deg, s = 1) {
  const F = frame(x, y, deg);
  const c = r.ctx;
  const P = (u, v, z) => { const p = F(u * s, v * s); return [r.X(p[0], p[1]), r.Y(p[0], p[1], z)]; };
  const poly = (pts, col) => { c.beginPath(); pts.forEach(([u, v, z], i) => { const [X, Y] = P(u, v, z); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); c.fillStyle = col; c.fill(); };
  const white = r.L.shade('#f4f5f6', 0, 0, 1), side = r.L.shade('#e6e8ea', 0.3, 0.6, 0.2);
  // wings + tailplane
  poly([[2, 0, 5], [-10, -32, 4.5], [-16, -32, 4.5], [-8, 0, 5], [-16, 32, 4.5], [-10, 32, 4.5]], white);
  poly([[-28, 0, 6], [-33, -11, 6], [-36, -11, 6], [-34, 0, 6], [-36, 11, 6], [-33, 11, 6]], white);
  // fuselage
  poly([[34, 0, 4], [30, -3, 3], [-34, -3, 3], [-36, 0, 5], [-34, 3, 3], [30, 3, 3]], side);
  poly([[34, 0, 7], [30, -3, 7.5], [-34, -2.5, 7.5], [-36, 0, 7], [-34, 2.5, 7.5], [30, 3, 7.5]], white);
  // fin
  poly([[-27, 0, 7.5], [-36, 0, 7.5], [-38, 0, 19], [-33, 0, 19]], r.L.shade('#c9a24e', 0.6, 0.6, 0));
  if (r.night > 0.2) glowAt(r, ...F(0, 0), 8, 6, '#ffffff', 0.4 * r.night);
}
function dxbT3(app) {
  const lm = entry(app, {
    id: 'dxb-terminal-3', lat: 25.2484, lon: 55.3528, zoom: 1.4, category: 'transport',
    name: { en: 'Dubai International Airport, Terminal 3', ar: 'مطار دبي الدولي، مبنى المسافرين 3' },
    blurb: { en: 'Terminal 3 at Dubai International (DXB) serves Emirates exclusively; its long arched concourses line the airfield beside the two parallel runways.',
      ar: 'يخدم مبنى المسافرين 3 في مطار دبي الدولي طيران الإمارات حصرياً، وتصطف ردهاته الطويلة المقوّسة بجوار المدرجين المتوازيين.' },
    facts: [{ en: 'Opened in 2008', ar: 'افتُتح عام 2008' }],
  });
  // align with the runways
  const rw = RUNWAYS.find((q) => q.id === 'dxb-12r') || RUNWAYS[0];
  const [ax, ay] = app.geo.toWorld(rw.a[0], rw.a[1]), [bx, by] = app.geo.toWorld(rw.b[0], rw.b[1]);
  const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  const F = frame(lm.x, lm.y, deg); // u along the runway, v toward the south (away from runway)
  clearSite(app, rectL(F, 200, -150, 700, 200), 3);
  // terminal head building
  {
    const m = new Mesh();
    const pts = rectL(F, 0, 60, 170, 70);
    extrude(m, pts, 0, 24, '#e5e9ec', { top: '#cfd6db', win: { floor: 6, seed: 3, lit: 0.9, glass: '#5f7c90', light: '#ffe3b0', alpha: 0.5 } });
    m.done();
    add(app, lm, { mesh: m, shadow: [{ pts, h: 24 }] });
  }
  // concourses (B: long arched hall; A: further east), each split into segments for depth sorting
  const concourse = (u0, u1, v, W, H, seed) => {
    const segs = Math.ceil((u1 - u0) / 160);
    for (let s = 0; s < segs; s++) {
      const a = u0 + ((u1 - u0) * s) / segs, b = u0 + ((u1 - u0) * (s + 1)) / segs;
      const m = new Mesh();
      extrude(m, rectL(F, (a + b) / 2, v, (b - a) / 2, W), 0, H * 0.55, '#dfe5ea', { top: false,
        win: { floor: 5, seed: seed + s, lit: 0.9, glass: '#557a92', light: '#ffe6b8', alpha: 0.6 }, glow: '#cfe6ff', ga: 0.12 });
      // barrel-vault roof
      const K = 8;
      for (let k = 0; k < K; k++) {
        const t0 = Math.PI - (k / K) * Math.PI, t1 = Math.PI - ((k + 1) / K) * Math.PI;
        const z0 = H * 0.55 + Math.sin(t0) * H * 0.45, z1 = H * 0.55 + Math.sin(t1) * H * 0.45;
        const v0 = v + Math.cos(t0) * W, v1 = v + Math.cos(t1) * W;
        m.face([F.p3(a, v0, z0), F.p3(b, v0, z0), F.p3(b, v1, z1), F.p3(a, v1, z1)], '#d4dbe1', { out: F.p3((a + b) / 2, v, 0), glow: '#bcd8ff', ga: 0.15 });
      }
      for (const uu of [a, b]) {
        const end = [F.p3(uu, v - W, 0)];
        for (let k = 0; k <= K; k++) { const t0 = Math.PI - (k / K) * Math.PI; end.push(F.p3(uu, v + Math.cos(t0) * W, H * 0.55 + Math.sin(t0) * H * 0.45)); }
        end.push(F.p3(uu, v + W, 0));
        if ((s === 0 && uu === a) || (s === segs - 1 && uu === b)) m.face(end, '#c9d1d8', { out: F.p3((a + b) / 2, v, H / 2) });
      }
      m.done();
      add(app, lm, { mesh: m, shadow: [{ pts: rectL(F, (a + b) / 2, v, (b - a) / 2, W), h: H }] });
    }
    // parked aircraft nose-in along the north side (airside)
    const planes = [];
    for (let u = u0 + 40; u < u1 - 30; u += 85) planes.push(F(u, v - W - 45));
    const [cx, cy] = F((u0 + u1) / 2, v - W - 45);
    add(app, lm, { x: cx, y: cy, depth: cx + cy, bbox: { x0: Math.min(...planes.map((p) => p[0])) - 0.5, y0: Math.min(...planes.map((p) => p[1])) - 0.5,
      x1: Math.max(...planes.map((p) => p[0])) + 0.5, y1: Math.max(...planes.map((p) => p[1])) + 0.5, h: 20 }, minZoom: 0.5,
      draw(r) { planes.forEach((p) => drawParkedPlane(r, p[0], p[1], deg + 90, 1)); } });
  };
  concourse(-380, 520, -170, 42, 40, 10);
  concourse(780, 1320, -170, 40, 36, 30);
}

// ------------------------------------------------------------------------------------------------
// Global Village
// ------------------------------------------------------------------------------------------------
function globalVillage(app) {
  const lm = entry(app, {
    id: 'global-village', lat: 25.0712, lon: 55.3087, zoom: 2.2, category: 'leisure',
    name: { en: 'Global Village', ar: 'القرية العالمية' },
    blurb: { en: 'A seasonal open-air park of country pavilions, food stalls, rides and shows, open through Dubai’s cooler months.',
      ar: 'منتزه موسمي مفتوح يضم أجنحة الدول وأكشاك الطعام والألعاب والعروض، ويفتح أبوابه خلال أشهر دبي المعتدلة.' },
  });
  const F = frame(lm.x, lm.y, -45);
  clearSite(app, ellL(F, 0, 0, 380, 300, 12), 3);
  const lake = ellL(F, 0, 0, 110, 60, 20);
  app.scene.underlays.push((r) => {
    if (!onScreen(r, lm.x - 5, lm.y - 5, lm.x + 5, lm.y + 5)) return;
    fillPoly(r, ellL(F, 0, 0, 360, 280, 24), 0, r.L.shade('#e2d6bf', 0, 0, 1));
    fillPoly(r, lake, 0, r.L.shade('#3aa6c4', 0, 0, 1));
  });
  const COL = ['#d8574a', '#e8a33d', '#4a8fd8', '#53a86a', '#a85fb8', '#e07a9a', '#3fb5a8', '#c9b04a'];
  const N = 22;
  const pav = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const [cx, cy] = F(Math.cos(a) * 250, Math.sin(a) * 190);
    const m = new Mesh();
    const col = COL[i % COL.length];
    const Fl = frame(cx, cy, -45 + (a * 180) / Math.PI);
    extrude(m, rectL(Fl, 0, 0, 28, 18), 0, 12 + (i % 3) * 3, col, { top: '#efe7d6', glow: '#ffd28a', ga: 0.35 });
    if (i % 3 === 0) domeM(m, cx, cy, 10, 12 + (i % 3) * 3, 9, 12, '#f0d27a', { glow: '#ffe2a0', ga: 0.5 });
    else if (i % 3 === 1) { const [tx, ty] = Fl(-20, 0); lathe(m, tx, ty, [[3, 0], [3, 24], [0.3, 30]], 6, '#efe7d6', { glow: '#ffd28a', ga: 0.5 }); }
    m.done();
    pav.push(m);
    add(app, lm, { mesh: m, x: cx, y: cy, shadow: [{ pts: rectL(Fl, 0, 0, 28, 18), h: 14 }],
      fx: (f, r) => (r.night > 0.1 && f.k === 0 && f.nz < 0.5 ? hsla((i * 47 + r.t * 30) % 360, 90, 62, 0.62 * r.night) : null) });
  }
  // festoon lights around the ring
  const bulbs = [];
  for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU; bulbs.push(F(Math.cos(a) * 200, Math.sin(a) * 150)); }
  add(app, lm, { x: lm.x + 0.3, y: lm.y + 0.3, bbox: { x0: lm.x - 2.6, y0: lm.y - 2.6, x1: lm.x + 2.6, y1: lm.y + 2.6, h: 10 }, minZoom: 0.4,
    draw(r) { if (r.night > 0.1) bulbs.forEach((p, i) => glowAt(r, p[0], p[1], 6, 7, hueToHex(i * 37 + r.t * 50), 0.8 * r.night)); } });
  // main gate
  const g = new Mesh();
  for (const s of [-1, 1]) extrude(g, rectL(F, s * 30, 300, 8, 8), 0, 26, '#d9b77a', { top: '#c9a35c', glow: '#ffcf7a', ga: 0.5 });
  extrude(g, rectL(F, 0, 300, 38, 7), 26, 33, '#d9b77a', { top: '#c9a35c', glow: '#ffcf7a', ga: 0.6 });
  g.done();
  add(app, lm, { mesh: g, shadow: [{ pts: rectL(F, 0, 300, 38, 8), h: 30 }] });
  // little Ferris wheel
  const [wx, wy] = F(150, -230);
  add(app, lm, { x: wx, y: wy, bbox: { x0: wx - 0.4, y0: wy - 0.4, x1: wx + 0.4, y1: wy + 0.4, h: 50 },
    draw(r) {
      const c = r.ctx, R = 22, zc = 26, Fw = frame(wx, wy, -45);
      const P = (u, z) => { const p = Fw(u, 0); return [r.X(p[0], p[1]), r.Y(p[0], p[1], z)]; };
      c.lineWidth = Math.max(0.5, 1.2 * r.zoom);
      const rot = r.t * 0.25;
      c.beginPath();
      for (let k = 0; k <= 24; k++) { const a = (k / 24) * TAU; const [X, Y] = P(Math.cos(a) * R, zc + Math.sin(a) * R); k ? c.lineTo(X, Y) : c.moveTo(X, Y); }
      for (let k = 0; k < 12; k++) { const a = rot + (k / 12) * TAU; const [X0, Y0] = P(0, zc); const [X1, Y1] = P(Math.cos(a) * R, zc + Math.sin(a) * R); c.moveTo(X0, Y0); c.lineTo(X1, Y1); }
      const [A0, B0] = P(-12, 0), [A1, B1] = P(0, zc), [A2, B2] = P(12, 0);
      c.moveTo(A0, B0); c.lineTo(A1, B1); c.lineTo(A2, B2);
      c.strokeStyle = r.night > 0.1 ? hsla(r.t * 60, 90, 65, 0.9) : r.L.shade('#e8e8e8', 0.4, 0.5, 0.3);
      c.stroke();
    } });
}

// ------------------------------------------------------------------------------------------------
// Dubai Miracle Garden
// ------------------------------------------------------------------------------------------------
function miracleGarden(app) {
  const lm = entry(app, {
    id: 'dubai-miracle-garden', lat: 25.0603, lon: 55.2441, zoom: 2.4, category: 'nature',
    name: { en: 'Dubai Miracle Garden', ar: 'حديقة دبي المعجزة' },
    blurb: { en: 'A seasonal flower garden in the desert, famous for its towering floral sculptures, heart-shaped arches and a full-size Airbus A380 covered in flowers.',
      ar: 'حديقة زهور موسمية في الصحراء، تشتهر بمجسماتها الزهرية الشاهقة وأقواسها على شكل قلوب، وبطائرة إيرباص A380 بالحجم الكامل مكسوة بالزهور.' },
  });
  const F = frame(lm.x, lm.y, -45);
  clearSite(app, rectL(F, 0, 0, 220, 170), 3);
  const FL = ['#e8434f', '#f39a2e', '#f4d23a', '#e85fa8', '#9b59d0', '#ffffff', '#ff6f61'];
  const beds = [];
  for (let i = 0; i < 70; i++) {
    const u = -200 + (i % 10) * 42 + ((Math.floor(i / 10) % 2) * 21), v = -150 + Math.floor(i / 10) * 44;
    beds.push({ pts: ellL(F, u, v, 16 + hash(i, 1) * 6, 9 + hash(i, 2) * 4, 10, hash(i, 3) * 3), col: FL[i % FL.length] });
  }
  app.scene.underlays.push((r) => {
    if (!onScreen(r, lm.x - 3, lm.y - 3, lm.x + 3, lm.y + 3)) return;
    fillPoly(r, rectL(F, 0, 0, 215, 165), 0, r.L.shade('#7fb35e', 0, 0, 1));
    if (r.zoom < 0.25) return;
    for (const b of beds) fillPoly(r, b.pts, 0, r.L.shade(b.col, 0, 0, 1));
  });
  // floral A380 (stylised, flower-coloured) and heart arches
  const m = new Mesh();
  const A = frame(...F(60, -40), -10);
  const fus = []; for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; fus.push([Math.cos(a), Math.sin(a)]); }
  extrude(m, [A(36, 0), A(30, -4), A(-34, -4), A(-38, 0), A(-34, 4), A(30, 4)], 2, 12, '#ef5d7a', { top: '#f6a1b4', glow: '#ff9fb8', ga: 0.3 });
  extrude(m, [A(4, -4), A(-12, -40), A(-20, -40), A(-10, -4), A(-10, 4), A(-20, 40), A(-12, 40), A(4, 4)], 5, 6.5, '#f2c84b', { top: '#f6d860', glow: '#ffe080', ga: 0.3 });
  extrude(m, [A(-30, -1), A(-38, -1), A(-38, 1), A(-30, 1)], 12, 26, '#9b59d0', { top: '#b77ee0' });
  for (let k = 0; k < 4; k++) {
    const [hx, hy] = F(-120 + k * 30, 60);
    for (let j = 0; j < 7; j++) {
      const a = (j / 6) * Math.PI;
      m.line(F.p3(-120 + k * 30 - 10 * Math.cos(a), 60, 8 + 6 * Math.sin(a) + (j > 1 && j < 5 ? 2 : 0)), F.p3(-120 + k * 30 - 10 * Math.cos(a + 0.52), 60, 8 + 6 * Math.sin(a + 0.52)), FL[k], 3);
    }
  }
  m.done();
  add(app, lm, { mesh: m, shadow: [{ pts: [A(36, 0), A(-38, -4), A(-38, 4)], h: 12 }] });
}

export function registerSouth(app) {
  mallOfTheEmirates(app);
  alWasl(app);
  meydan(app);
  dxbT3(app);
  globalVillage(app);
  miracleGarden(app);
}
