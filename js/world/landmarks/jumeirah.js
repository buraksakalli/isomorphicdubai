// Jumeirah coast: Burj Al Arab, Jumeirah Beach Hotel, Madinat Jumeirah, Jumeirah Mosque,
// Etihad Museum + Union House flag.
import { Mesh, frame, extrude, loftM, lathe, entry, add, addWithIcon, rectL, ellL, hsla, glowAt, fillPoly,
  onScreen, clamp, TAU, boxM, domeM, circle, tube, clearSite, flatM } from './util.js';
import { hash, palm } from '../../core/shapes.js';
import * as DATA from '../../data/geo.js';

// ------------------------------------------------------------------------------------------------
// Burj Al Arab — 321 m sail on its own island
// ------------------------------------------------------------------------------------------------
const BAA = { ROOF: 200, H: 321, D0: 92, W0: 40, AXIS: 68 };

function sailRing(F, z, nFront) {
  const t = clamp(z / BAA.ROOF, 0, 1);
  const D = 6 + (BAA.D0 - 6) * Math.cos((Math.PI / 2) * Math.pow(t, 1.15));
  const W = 4 + (BAA.W0 - 4) * Math.pow(1 - t, 0.8) * (0.85 + 0.15 * (1 - t));
  const bulge = 9 * (1 - t * 0.6);
  const pts = [F(-8, 0)];
  for (let i = 0; i <= nFront; i++) {
    const s = i / nFront;
    pts.push(F(D + bulge * Math.sin(Math.PI * s), -W + 2 * W * s));
  }
  return { z, pts };
}

function buildBAA(x, y, q) {
  const F = frame(x, y, BAA.AXIS);
  const m = new Mesh();
  const nF = q ? 8 : 4, step = q ? 10 : 25;
  // podium on the island
  m.layer = 0;
  extrude(m, ellL(F, 30, 0, 62, 50, q ? 20 : 10), 0, 7, '#e7e2d8', { top: '#d8d3c7' });
  m.layer = 1;
  const rings = [];
  for (let z = 7; z < BAA.ROOF; z += step) rings.push(sailRing(F, z, nF));
  rings.push(sailRing(F, BAA.ROOF, nF));
  loftM(m, rings, '#f4f4f2', { top: '#e2e2e0' });
  m.layer = 2;
  // mast (spire) on the back
  const [mx, my] = F(-8, 0);
  lathe(m, mx, my, [[5, 150], [4, BAA.ROOF], [2.5, 260], [1, BAA.H]], 6, '#f2f2f2');
  if (q) {
    // exoskeleton trusses along each wing edge (the white diagonal X bracing)
    for (const s of [-1, 1]) {
      const pts = [];
      for (let z = 0; z <= BAA.ROOF + 1; z += 20) {
        const R = sailRing(F, z, 1).pts; // [mast, frontLeft, frontRight]
        const p = s < 0 ? R[1] : R[2];
        // point just outside the wing face, ~40% along mast→wing end
        const k = 0.55;
        const bx = R[0][0] + (p[0] - R[0][0]) * k, by = R[0][1] + (p[1] - R[0][1]) * k;
        const [ox, oy] = F(0, s * 7); const [o0x, o0y] = F(0, 0);
        pts.push([bx + (ox - o0x), by + (oy - o0y), z]);
      }
      for (let i = 0; i < pts.length - 1; i++) m.line(pts[i], pts[i + 1], '#ffffff', 2.2, { glow: '#e8f0ff', ga: 0.55 });
      // X bracing to the mast line
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = F(-6, s * 3), [bx, by] = F(-6, s * 3);
        m.line(pts[i], [ax, ay, pts[i + 1][2]], '#f6f6f6', 1.2, { glow: '#e8f0ff', ga: 0.35 });
        m.line(pts[i + 1], [bx, by, pts[i][2]], '#f6f6f6', 1.2, { glow: '#e8f0ff', ga: 0.35 });
      }
    }
  }
  m.layer = 3;
  // helipad: cantilevered disc near the top on the north side
  const [hx, hy] = F(18, -BAA.W0 * 0.2 - 24);
  extrude(m, circle(hx, hy, 13, q ? 16 : 8), 206, 209, '#e9ecef', { top: '#7aa36f' });
  if (q) m.line([hx, hy, 209.3], F.p3(14, -12, 196), '#dcdcdc', 1.5);
  // Al Muntaha restaurant cantilever on the other side
  extrude(m, [F(4, 14), F(38, 26), F(38, 34), F(4, 26)], 190, 198, '#eef0f2', { top: '#d9dcdf', glow: '#bfe6ff', ga: 0.4 });
  m.light([hx, hy, 211], 10, '#ffffff', 0.6);
  m.light(F.p3(-8, 0, BAA.H), 10, '#ff5050', 0.6);
  return m.done();
}

const SAIL_N = 8;
function baaFx(r) {
  if (r.night < 0.05) return null;
  const t = r.t;
  // slow, smooth colour cycle (the real sail changes colour through the evening)
  const h = (t * 9) % 360;
  return (f) => {
    if (f.k !== 0) return null;
    const front = f.tag >= 1 && f.tag <= SAIL_N && f.nz < 0.8;
    if (front) {
      const zz = f.z / BAA.ROOF;
      return hsla(h + zz * 50, 80, 58, (0.6 - 0.25 * zz) * r.night);
    }
    if (f.nz < 0.5 && f.z > 7) return `rgba(225,235,255,${(0.42 * r.night).toFixed(3)})`;
    return null;
  };
}

function burjAlArab(app) {
  const lm = entry(app, {
    id: 'burj-al-arab', lat: 25.1412, lon: 55.1853, zoom: 2.4, category: 'icon',
    name: { en: 'Burj Al Arab', ar: 'برج العرب' },
    blurb: { en: 'The sail-shaped hotel standing on its own island off Jumeirah Beach, one of the most photographed buildings in the world.',
      ar: 'فندق على شكل شراع يقف على جزيرته الخاصة قبالة شاطئ جميرا، وهو من أكثر المباني تصويراً في العالم.' },
    facts: [
      { en: 'Height: 321 m', ar: 'الارتفاع: 321 متراً' },
      { en: 'Opened in 1999', ar: 'افتُتح عام 1999' },
    ],
  });
  let { x, y } = lm;
  // centre the podium on the island polygon from the shared geography data (if present)
  const isl = (DATA.ISLANDS || []).find((i) => i.id === 'burj-al-arab-island');
  if (isl && isl.pts) {
    const P = app.geo.llPts(isl.pts);
    let cx = 0, cy = 0; for (const p of P) { cx += p[0]; cy += p[1]; } cx /= P.length; cy /= P.length;
    const F0 = frame(0, 0, BAA.AXIS), off = F0(30, 0);
    x = cx - off[0]; y = cy - off[1];
    lm.x = x; lm.y = y;
  }
  const F = frame(x, y, BAA.AXIS);
  clearSite(app, ellL(F, 30, 0, 140, 120, 10));
  const hi = buildBAA(x, y, 1), lo = buildBAA(x, y, 0);
  // causeway bridge to the shore (underlay)
  const c0 = F(100, 0), c1 = F(220, 60), c2 = F(330, 70);
  app.scene.underlays.push((r) => {
    if (!onScreen(r, x - 1.5, y - 1.5, x + 4, y + 4)) return;
    const c = r.ctx;
    c.beginPath();
    c.moveTo(r.X(c0[0], c0[1]), r.Y(c0[0], c0[1], 0));
    c.quadraticCurveTo(r.X(c1[0], c1[1]), r.Y(c1[0], c1[1], 0), r.X(c2[0], c2[1]), r.Y(c2[0], c2[1], 0));
    c.lineWidth = Math.max(1, 14 * r.kx / 32 * 0.9); c.lineCap = 'round';
    c.strokeStyle = r.L.shade('#d9d6cf', 0, 0, 1); c.stroke();
    if (r.night > 0.1) { c.lineWidth = Math.max(0.6, 3 * r.zoom); c.strokeStyle = r.L.emit('#ffd27a', 0.7); c.stroke(); }
  });
  const shadow = [{ pts: ellL(F, 30, 0, 50, 35, 8), h: 120 }, { pts: [F(-8, -6), F(40, -18), F(40, 18), F(-8, 6)], h: 200 }, { pts: ellL(F, -8, 0, 3, 3, 4), h: BAA.H }];
  const extra = (r) => {
    if (r.zoom > 0.5) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, [px, py] = F(30 + Math.cos(a) * 56, Math.sin(a) * 44);
      palm(r, px, py, 7, 9, i);
    }
  };
  addWithIcon(app, lm, { x, y, shadow, bbox: hi.bbox(0.1), draw(r) { hi.draw(r, baaFx(r)); } }, (r) => lo.draw(r, baaFx(r)), 1.3);
  // palms on the podium (separate, drawn after)
  add(app, lm, { x: x + 0.3, y: y + 0.3, bbox: { x0: x - 0.6, y0: y - 0.6, x1: x + 0.9, y1: y + 0.9, h: 20 }, minZoom: 0.5, draw: extra });
}

// ------------------------------------------------------------------------------------------------
// Jumeirah Beach Hotel — the breaking wave
// ------------------------------------------------------------------------------------------------
function jumeirahBeachHotel(app) {
  const lm = entry(app, {
    id: 'jumeirah-beach-hotel', lat: 25.1415, lon: 55.1907, zoom: 2.6, category: 'icon',
    name: { en: 'Jumeirah Beach Hotel', ar: 'فندق جميرا بيتش' },
    blurb: { en: 'A beachfront hotel whose rising, curling profile was designed to evoke a breaking wave, beside Burj Al Arab.',
      ar: 'فندق على الشاطئ صُمم شكله المتصاعد والمنحني ليحاكي موجة متكسرة، بجوار برج العرب.' },
    facts: [{ en: 'Opened in 1997', ar: 'افتُتح عام 1997' }],
  });
  const F = frame(lm.x, lm.y, -45);
  clearSite(app, rectL(F, 0, 0, 150, 60));
  const m = new Mesh();
  const N = 18, Lh = 135, thick = 18;
  const st = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const u = -Lh + s * 2 * Lh;
    const v = -18 * Math.sin(Math.PI * s) + 10 * s;           // plan bows toward the sea
    let h = 22 + 82 * Math.pow(s, 1.7);                          // rises toward the crest
    if (s > 0.9) h -= (s - 0.9) * 10 * 30;                       // curls down at the end
    const w = thick * (1 + 0.5 * Math.sin(Math.PI * s));
    st.push({ u, v, h, w });
  }
  for (let i = 0; i < N; i++) {
    const A = st[i], B = st[i + 1];
    const a0 = F.p3(A.u, A.v - A.w / 2, 0), b0 = F.p3(B.u, B.v - B.w / 2, 0);
    const a1 = F.p3(A.u, A.v + A.w / 2, 0), b1 = F.p3(B.u, B.v + B.w / 2, 0);
    const T = (p, h) => [p[0], p[1], h];
    const out = F.p3((A.u + B.u) / 2, (A.v + B.v) / 2, Math.min(A.h, B.h) / 2);
    // sea side and land side walls
    m.face([a0, b0, T(b0, B.h), T(a0, A.h)], '#d9e6ee', { out, win: { floor: 3.8, seed: 900 + i, lit: 0.6, glass: '#2f78a8', light: '#cfe8ff', alpha: 0.6 }, glow: '#3a8fd8', ga: 0.25 });
    m.face([a1, b1, T(b1, B.h * 0.94), T(a1, A.h * 0.94)], '#d9e6ee', { out, win: { floor: 3.8, seed: 950 + i, lit: 0.6, glass: '#2f78a8', light: '#cfe8ff', alpha: 0.6 }, glow: '#3a8fd8', ga: 0.25 });
    // roof
    m.face([T(a0, A.h), T(b0, B.h), T(b1, B.h * 0.94), T(a1, A.h * 0.94)], '#eef3f6', { out: [out[0], out[1], -200] });
  }
  for (const k of [0, N]) {
    const S = st[k], out = F.p3(k ? S.u - 10 : S.u + 10, S.v, 10);
    m.face([F.p3(S.u, S.v - S.w / 2, 0), F.p3(S.u, S.v + S.w / 2, 0), F.p3(S.u, S.v + S.w / 2, S.h * 0.94), F.p3(S.u, S.v - S.w / 2, S.h)], '#e6eef3', { out });
  }
  m.light(F.p3(st[N - 2].u, st[N - 2].v, st[N - 2].h + 2), 18, '#9fd4ff', 0.6);
  m.done();
  add(app, lm, { mesh: m, shadow: [{ pts: [F(-Lh, -10), F(Lh, -10), F(Lh, 20), F(-Lh, 20)], h: 70 }] });
}

// ------------------------------------------------------------------------------------------------
// Madinat Jumeirah — Arabian resort with wind towers and waterways
// ------------------------------------------------------------------------------------------------
function windTower(m, x, y, z, s, color) {
  // square shaft with open louvred top (barjeel)
  boxM(m, x - s / 200, y - s / 200, z, s / 100, s / 100, s * 2.2, color, { top: '#cbb48c' });
  boxM(m, x - s / 160, y - s / 160, z + s * 2.2, s / 80, s / 80, s * 0.9, '#d8c29a', { top: '#c7ae84', glow: '#ffcf7a', ga: 0.35 });
}

function madinatJumeirah(app) {
  const lm = entry(app, {
    id: 'madinat-jumeirah', lat: 25.1325, lon: 55.1845, zoom: 2.2, category: 'leisure',
    name: { en: 'Madinat Jumeirah', ar: 'مدينة جميرا' },
    blurb: { en: 'A resort built in the style of a traditional Arabian town, with wind towers, a souk and winding waterways travelled by abras.',
      ar: 'منتجع مشيد على طراز مدينة عربية تقليدية، يضم أبراج رياح (براجيل) وسوقاً وممرات مائية متعرجة تجوبها العبرات.' },
  });
  const F = frame(lm.x, lm.y, -45);
  clearSite(app, rectL(F, 0, 0, 330, 250), 3);
  // waterways (underlay)
  const canal = [];
  for (let i = 0; i <= 24; i++) {
    const s = i / 24, u = -300 + s * 600, v = 40 * Math.sin(s * TAU * 1.3) + 20;
    canal.push([u, v]);
  }
  const left = canal.map(([u, v]) => F(u, v - 14)), right = canal.map(([u, v]) => F(u, v + 14)).reverse();
  const water = left.concat(right);
  const pool = ellL(F, -60, -120, 70, 40, 16);
  app.scene.underlays.push((r) => {
    if (!onScreen(r, lm.x - 4, lm.y - 4, lm.x + 4, lm.y + 4)) return;
    fillPoly(r, rectL(F, 0, 0, 320, 240), 0, r.L.shade('#e9d9b8', 0, 0, 1));
    fillPoly(r, water, 0, r.L.shade('#3fa7c2', 0, 0, 1));
    fillPoly(r, pool, 0, r.L.shade('#46b3cc', 0, 0, 1));
    if (r.night > 0.1) {
      const c = r.ctx; c.globalCompositeOperation = 'lighter';
      fillPoly(r, water, 0, `rgba(255,190,90,${(0.22 * r.night).toFixed(3)})`);
      c.globalCompositeOperation = 'source-over';
    }
  });
  // buildings: [u, v, hu, hv, h, kind]
  const B = [
    [-230, -90, 55, 40, 24], [-150, -170, 50, 35, 20], [-40, -190, 70, 30, 26], // Mina A'Salam side
    [60, -110, 80, 45, 42], [175, -150, 50, 40, 30],                             // Al Qasr (the palace)
    [-200, 110, 60, 40, 18], [-80, 110, 55, 45, 16], [40, 120, 70, 45, 22],       // souk
    [170, 100, 50, 50, 20], [250, -20, 40, 50, 18],
  ];
  B.forEach(([u, v, hu, hv, h], i) => {
    const m = new Mesh();
    const pts = rectL(F, u, v, hu, hv);
    extrude(m, pts, 0, h, '#e3cfa6', { top: '#d6c094', win: { floor: 5, seed: 600 + i, lit: 0.7, glass: '#8a6b45', light: '#ffc874', alpha: 0.35 }, glow: '#ffb85a', ga: 0.38 });
    // stepped upper storey
    if (h > 20) extrude(m, rectL(F, u - hu * 0.2, v, hu * 0.5, hv * 0.6), h, h + 8, '#e6d3ab', { top: '#d3bd90', glow: '#ffb85a', ga: 0.2 });
    // wind towers on the roof
    const nw = 1 + (i % 3);
    for (let k = 0; k < nw; k++) {
      const [wx, wy] = F(u + (k - (nw - 1) / 2) * hu * 0.6, v + hv * 0.4);
      windTower(m, wx, wy, h, 4.5, '#dcc59b');
    }
    m.done();
    add(app, lm, { mesh: m, shadow: [{ pts, h }] });
  });
  // palms cluster (one object)
  const palms = [];
  for (let i = 0; i < 40; i++) palms.push(F(-300 + hash(i, 1) * 600, -230 + hash(i, 2) * 460));
  add(app, lm, { x: lm.x + 0.5, y: lm.y + 0.5, bbox: { x0: lm.x - 3.5, y0: lm.y - 3.5, x1: lm.x + 3.5, y1: lm.y + 3.5, h: 15 }, minZoom: 0.7,
    draw(r) { palms.forEach((p, i) => palm(r, p[0], p[1], 0, 10, i)); } });
}

// ------------------------------------------------------------------------------------------------
// Jumeirah Mosque
// ------------------------------------------------------------------------------------------------
function minaret(m, x, y, h, col, q) {
  const sides = q ? 8 : 6;
  lathe(m, x, y, [[3.2, 0], [3.2, h * 0.55]], sides, col, { top: false, glow: '#ffe6bf', ga: 0.5 });
  lathe(m, x, y, [[4.2, h * 0.55], [4.2, h * 0.58]], sides, col, { top: '#efe6d4', glow: '#ffe6bf', ga: 0.5 });     // balcony
  lathe(m, x, y, [[2.6, h * 0.58], [2.6, h * 0.82]], sides, col, { top: false, glow: '#ffe6bf', ga: 0.5 });
  lathe(m, x, y, [[3.4, h * 0.82], [3.4, h * 0.84]], sides, col);
  lathe(m, x, y, [[2.0, h * 0.84], [2.0, h * 0.9], [1.6, h * 0.96], [0.2, h]], sides, col, { glow: '#ffe6bf', ga: 0.6 });
}
function jumeirahMosque(app) {
  const lm = entry(app, {
    id: 'jumeirah-mosque', lat: 25.2342, lon: 55.2654, zoom: 4.5, category: 'culture',
    name: { en: 'Jumeirah Mosque', ar: 'مسجد جميرا' },
    blurb: { en: 'A white-stone mosque in the medieval Fatimid style with twin minarets, and one of the few mosques in Dubai that welcomes non-Muslim visitors on guided tours.',
      ar: 'مسجد من الحجر الأبيض على الطراز الفاطمي بمئذنتين، وهو من المساجد القليلة في دبي التي ترحب بغير المسلمين في جولات إرشادية.' },
  });
  const F = frame(lm.x, lm.y, 45); // u: toward the street (SE), minarets side by side across v
  clearSite(app, rectL(F, 0, 0, 50, 45));
  const m = new Mesh();
  const stone = '#f1e9da';
  extrude(m, rectL(F, 0, 0, 24, 20), 0, 14, stone, { top: '#e6dcc8', glow: '#ffe2b0', ga: 0.55 });
  // crenellated parapet strip
  extrude(m, rectL(F, 0, 0, 24.5, 20.5), 14, 15.5, '#e9dfcc', { top: false, glow: '#ffe2b0', ga: 0.55 });
  // central dome on a drum + four small domes
  const [cx, cy] = F(-2, 0);
  lathe(m, cx, cy, [[9, 14], [9, 18]], 16, stone, { top: false, glow: '#ffe2b0', ga: 0.55 });
  domeM(m, cx, cy, 9, 18, 10, 16, '#f5efe3', { glow: '#ffe9c4', ga: 0.6 });
  lathe(m, cx, cy, [[0.4, 28], [0.2, 31]], 4, '#c9a75c');
  for (const [du, dv] of [[-15, -12], [-15, 12], [13, -12], [13, 12]]) {
    const [dx, dy] = F(du, dv);
    domeM(m, dx, dy, 3.5, 14, 4, 10, '#f5efe3', { glow: '#ffe9c4', ga: 0.55 });
  }
  // front portico (toward the street) and minarets
  extrude(m, rectL(F, 27, 0, 4, 12), 0, 10, stone, { top: '#e6dcc8', glow: '#ffe2b0', ga: 0.55 });
  for (const s of [-1, 1]) { const [mx, my] = F(28, s * 17); minaret(m, mx, my, 38, stone, 1); m.light([mx, my, 39], 10, '#fff2d0', 0.6); }
  m.done();
  add(app, lm, { mesh: m, shadow: [{ pts: rectL(F, 0, 0, 24, 20), h: 20 }, { pts: rectL(F, 28, 0, 3, 18), h: 38 }] });
}

// ------------------------------------------------------------------------------------------------
// Etihad Museum + Union House + flagpole with animated UAE flag
// ------------------------------------------------------------------------------------------------
function etihadMuseum(app) {
  const lm = entry(app, {
    id: 'etihad-museum', lat: 25.2393, lon: 55.2717, zoom: 3.2, category: 'culture',
    name: { en: 'Etihad Museum & Union House', ar: 'متحف الاتحاد ودار الاتحاد' },
    blurb: { en: 'The museum of the UAE’s founding, beside Union House where the federation was declared on 2 December 1971; its pavilion is shaped like a manuscript, with seven columns recalling the pens used to sign the declaration.',
      ar: 'متحف قيام دولة الإمارات بجوار دار الاتحاد حيث أُعلن الاتحاد في 2 ديسمبر 1971؛ صُمم جناحه على شكل مخطوطة، وترمز أعمدته السبعة إلى الأقلام التي وُقّعت بها وثيقة الاتحاد.' },
    facts: [{ en: 'Museum opened in 2017', ar: 'افتُتح المتحف عام 2017' }],
  });
  const F = frame(lm.x, lm.y, -40);
  clearSite(app, rectL(F, 0, 0, 120, 90));
  const m = new Mesh();
  // manuscript-shaped pavilion: glass box under a curled roof sheet
  extrude(m, rectL(F, 0, 0, 40, 18), 0, 14, '#a6c2cf', { top: false, glow: '#ffe1a8', ga: 0.55 });
  const rings = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const s = i / N, v = -26 + s * 52;
    const z = 15 + 6 * Math.sin(Math.PI * s) + (s > 0.85 ? (s - 0.85) * 60 : 0); // curls up at the front edge
    rings.push({ z, pts: [F(-46, v), F(46, v)] });
  }
  for (let i = 0; i < N; i++) {
    const A = rings[i], B = rings[i + 1];
    m.face([[A.pts[0][0], A.pts[0][1], A.z], [A.pts[1][0], A.pts[1][1], A.z], [B.pts[1][0], B.pts[1][1], B.z], [B.pts[0][0], B.pts[0][1], B.z]], '#f3f1ec', { two: true, glow: '#fff1d8', ga: 0.4 });
  }
  // seven slanted columns (the pens)
  for (let k = 0; k < 7; k++) {
    const u = -36 + k * 12;
    m.line(F.p3(u, 22, 0), F.p3(u - 3, 25, 18), '#e8e4da', 2.4, { glow: '#fff1d0', ga: 0.6 });
  }
  // Union House: round white pavilion
  const [ux, uy] = F(60, 55);
  lathe(m, ux, uy, [[16, 0], [16, 6]], 20, '#f4f2ee', { top: '#e7e4dd', glow: '#ffe6bc', ga: 0.6 });
  lathe(m, ux, uy, [[19, 6], [19, 7]], 20, '#ebe8e1', { top: '#e2ded5' });
  m.done();
  add(app, lm, { mesh: m, shadow: [{ pts: rectL(F, 0, 0, 46, 26), h: 18 }] });

  // flagpole + waving flag (dynamic, own object)
  const [px, py] = F(90, 15);
  const POLE = 123, FW = 40, FH = 20;   // flag size (illustrative)
  const wind = [-0.6, 0.8]; // flag streams toward SE-ish (prevailing NW wind)
  const wl = Math.hypot(wind[0], wind[1]); const wx = wind[0] / wl, wy = wind[1] / wl;
  const COLS = ['#00843d', '#ffffff', '#111111'];
  const flag = {
    x: px, y: py, bbox: { x0: px - 0.5, y0: py - 0.5, x1: px + 0.6, y1: py + 0.6, h: POLE + 4 },
    shadow: [{ pts: ellL(frame(px, py), 0, 0, 1.2, 1.2, 4), h: POLE }],
    draw(r) {
      const c = r.ctx;
      const X = r.X(px, py), Y0 = r.Y(px, py, 0), Y1 = r.Y(px, py, POLE + 2);
      c.strokeStyle = r.L.shade('#d9dde2', 1, 0, 0); c.lineWidth = Math.max(0.8, 1.6 * r.zoom);
      c.beginPath(); c.moveTo(X, Y0); c.lineTo(X, Y1); c.stroke();
      const N2 = r.zoom > 1 ? 14 : 6, t = r.t;
      const pt = (s, zf) => {
        const d = s * FW, wv = Math.sin(s * 5.5 - t * 4.2) * 3.2 * s;
        const fx = px + (wx * d - wy * wv) / 100, fy = py + (wy * d + wx * wv) / 100;
        const z = POLE - zf * FH - s * 2.5 + Math.sin(s * 4 - t * 4.2) * 1.2 * s;
        return [r.X(fx, fy), r.Y(fx, fy, z)];
      };
      for (let i = 0; i < N2; i++) {
        const s0 = i / N2, s1 = (i + 1) / N2;
        const shade = 0.82 + 0.18 * Math.cos(s0 * 5.5 - t * 4.2);
        const lit = r.night > 0.1 ? 0.55 + 0.25 * shade : shade;
        const strip = (z0, z1, col) => {
          const a = pt(s0, z0), b = pt(s1, z0), cc = pt(s1, z1), d = pt(s0, z1);
          c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(cc[0], cc[1]); c.lineTo(d[0], d[1]); c.closePath();
          c.fillStyle = col; c.globalAlpha = 1; c.fill();
          c.strokeStyle = col; c.lineWidth = 0.5; c.stroke();
        };
        const sh = (hex) => mult(hex, lit, r);
        if (s0 < 0.25) strip(0, 1, sh('#ce1126'));
        else { strip(0, 1 / 3, sh(COLS[0])); strip(1 / 3, 2 / 3, sh(COLS[1])); strip(2 / 3, 1, sh(COLS[2])); }
      }
      if (r.night > 0.1) glowAt(r, px, py, POLE - 10, 30, '#fff3d6', 0.35 * r.night);
    },
  };
  add(app, lm, flag);
}
const multCache = new Map();
function mult(hex, k, r) {
  const key = hex + (k * 20 | 0) + '|' + r.L.version;
  let v = multCache.get(key);
  if (v) return v;
  if (multCache.size > 400) multCache.clear();
  const base = r.L.shade(hex, 0.3, 0.6, 0.2, r.night > 0.1 ? 0.25 : 0);
  const m = base.match(/\d+/g).map(Number);
  v = `rgb(${Math.min(255, m[0] * k) | 0},${Math.min(255, m[1] * k) | 0},${Math.min(255, m[2] * k) | 0})`;
  multCache.set(key, v);
  return v;
}

export function registerJumeirah(app) {
  burjAlArab(app);
  jumeirahBeachHotel(app);
  madinatJumeirah(app);
  jumeirahMosque(app);
  etihadMuseum(app);
}
