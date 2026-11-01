// Downtown Dubai: Burj Khalifa, Dubai Mall + Burj Lake + The Dubai Fountain, Dubai Opera, The Opus,
// JW Marriott Marquis.
import { Mesh, frame, extrude, loftM, lathe, entry, add, addWithIcon, rectL, ellL, hsla, glowAt, fillPoly,
  onScreen, clamp, TAU, boxM, domeM, centroid2, hueToHex, clearSite } from './util.js';
import { hash, palm } from '../../core/shapes.js';
import * as DATA from '../../data/geo.js';

// ------------------------------------------------------------------------------------------------
// Burj Khalifa — Y-shaped (three-lobed) plan, spiralling setbacks, long spire.
// ------------------------------------------------------------------------------------------------
const WING = [100, 220, 340]; // wing directions in the local frame (deg)

function burjOutline(F, L, w, arcN) {
  const pts = [];
  for (let k = 0; k < 3; k++) {
    const a = (WING[k] * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
    const aj = a - Math.PI / 3, rj = w * 1.155;
    pts.push(F(Math.cos(aj) * rj, Math.sin(aj) * rj));
    for (let i = 0; i <= arcN; i++) {
      const t = -Math.PI / 2 + (i / arcN) * Math.PI;
      const ex = dx * Math.cos(t) + px * Math.sin(t), ey = dy * Math.cos(t) + py * Math.sin(t);
      pts.push(F(dx * L[k] + ex * w, dy * L[k] + ey * w));
    }
  }
  return pts;
}

const BK = { L0: 54, W0: 21, W1: 12.5, TOP: 585, H: 828, E: [330, 452, 585] };
function burjWings(z) {
  const tier = 15;
  const Ls = [];
  for (let k = 0; k < 3; k++) {
    // each wing steps back every third tier, staggered → spiral of setbacks
    const zq = Math.floor((z / tier + k) / 3) * 3 * tier - k * tier;
    const f = clamp(1 - Math.max(0, zq) / BK.E[k], 0, 1);
    const w = burjW(z);
    Ls.push(0.62 * w + (BK.L0 - 0.62 * BK.W0) * Math.pow(f, 0.85));
  }
  return Ls;
}
const burjW = (z) => BK.W0 + (BK.W1 - BK.W0) * clamp(z / BK.TOP, 0, 1);

function buildBurj(x, y, q) {
  const F = frame(x, y, 0);
  const m = new Mesh();
  const tier = q === 2 ? 15 : q === 1 ? 30 : 45, arcN = q === 2 ? 5 : q === 1 ? 3 : 2;
  const col = '#cfd9e2';
  let layer = 0;
  // podium / entrance plinth
  m.layer = layer++;
  extrude(m, burjOutline(F, BK.E.map(() => BK.L0 + 6), BK.W0 + 6, arcN), 0, 6, '#d9d4c8', { top: '#cfc9bb' });
  for (let z = 0; z < BK.TOP; z += tier) {
    const z1 = Math.min(BK.TOP, z + tier);
    m.layer = layer++;
    extrude(m, burjOutline(F, burjWings(z), burjW(z), arcN), z, z1, col, {
      top: '#aab6c0', capBias: 5000, data: z,
      win: q === 2 ? { floor: 4, seed: 11 + z, lit: 0.22, glass: '#7f95a8', light: '#fff2d6', alpha: 0.3 } : null });
  }
  // the spire: core lathe
  m.layer = layer++;
  const s = q === 2 ? 12 : 8;
  lathe(m, x, y, [[BK.W1 * 0.98, BK.TOP], [10.5, 612], [8.5, 650], [6.5, 700], [4.2, 745], [2.6, 785], [1.2, 815], [0.35, BK.H]],
    s, '#d3dce4', { data: 700 });
  m.light([x, y, BK.H], 26, '#ffffff', 0.9);
  m.light([x, y, 640], 10, '#ff4040', 0.7);
  return m.done();
}

const UAE = [[0, 130, 61], [255, 255, 255], [20, 20, 20], [230, 30, 40]];
function burjFx(r) {
  const n = r.night;
  if (n < 0.05) return null;
  const t = r.t, mode = Math.floor(t / 14) % 3;
  return (f) => {
    if (f.k === 2) { // light sprites: tip pulses
      return null;
    }
    if (f.k !== 0 || f.nz > 0.9) return null;
    const z = f.z;
    if (z < 8) return null;
    if (mode === 0) { // rising rainbow wave
      const h = z * 0.45 - t * 60 + f.tag * 4;
      const a = 0.32 + 0.22 * Math.sin(z * 0.03 - t * 2.2);
      return hsla(h, 85, 55, a * n);
    }
    if (mode === 1) { // UAE flag colours sweeping up the tower
      const band = Math.floor(((z - t * 45) / 70) % 3 + 3) % 3;
      const red = (f.tag % 12) < 2;
      const c = red ? UAE[3] : UAE[band];
      const a = (red ? 0.55 : band === 2 ? 0.12 : 0.42) * n;
      return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
    }
    // shimmering white/gold sparkle with a scanning band
    const scan = Math.exp(-Math.pow(((z - ((t * 120) % 900)) / 40), 2));
    const tw = hash(f.tag, Math.floor(z / 15), Math.floor(t * 3)) > 0.82 ? 0.35 : 0;
    return `rgba(255,236,190,${((0.1 + tw + scan * 0.55) * n).toFixed(3)})`;
  };
}

function burjKhalifa(app) {
  const lm = entry(app, {
    id: 'burj-khalifa', lat: 25.1972, lon: 55.2744, zoom: 1.05, category: 'icon',
    name: { en: 'Burj Khalifa', ar: 'برج خليفة' },
    blurb: { en: 'The world’s tallest building, rising 828 m above Downtown Dubai with a Y-shaped plan inspired by the desert flower Hymenocallis.',
      ar: 'أطول مبنى في العالم، يرتفع 828 متراً فوق وسط مدينة دبي بمخطط على شكل حرف Y مستوحى من زهرة الهيمينوكاليس الصحراوية.' },
    facts: [
      { en: 'Height: 828 m', ar: 'الارتفاع: 828 متراً' },
      { en: 'Opened in January 2010', ar: 'افتُتح في يناير 2010' },
      { en: 'Its LED facade hosts light shows at night', ar: 'تستضيف واجهته المضاءة بتقنية LED عروضاً ضوئية ليلاً' },
    ],
  });
  const { x, y } = lm;
  const F = frame(x, y, 0);
  clearSite(app, ellL(F, 0, 0, 95, 95, 12));
  const hi = buildBurj(x, y, 2), mid = buildBurj(x, y, 1), lo = buildBurj(x, y, 0);
  const shadow = [
    { pts: burjOutline(F, [BK.L0, BK.L0, BK.L0], BK.W0, 2), h: 300 },
    { pts: burjOutline(F, burjWings(400), burjW(400), 2), h: 500 },
    { pts: burjOutline(F, [8, 8, 8], BK.W1, 2), h: 640 },
    { pts: ellL(F, 0, 0, 4, 4, 6), h: BK.H },
  ];
  const tip = (r) => {
    if (r.night > 0.05) {
      const p = 0.65 + 0.35 * Math.sin(r.t * 3);
      glowAt(r, x, y, BK.H, 16 * p, '#ffffff', r.night * 0.9);
      glowAt(r, x, y, BK.H - 40, 34, '#9fd0ff', r.night * 0.3);
    }
  };
  addWithIcon(app, lm, {
    x, y, shadow, bbox: hi.bbox(0.1),
    draw(r) { (r.zoom > 0.55 ? hi : mid).draw(r, burjFx(r)); tip(r); },
  }, (r) => { lo.draw(r, burjFx(r)); tip(r); });
}

// ------------------------------------------------------------------------------------------------
// Burj Lake + The Dubai Fountain + The Dubai Mall
// ------------------------------------------------------------------------------------------------
const LAKE_LL = [
  [25.1966, 55.2752], [25.1971, 55.2770], [25.1975, 55.2787], [25.1973, 55.2800], [25.1964, 55.2806],
  [25.1955, 55.2801], [25.1949, 55.2787], [25.1946, 55.2770], [25.1941, 55.2757], [25.1946, 55.2747], [25.1956, 55.2746],
];

function dubaiMall(app) {
  const mall = entry(app, {
    id: 'dubai-mall', lat: 25.1985, lon: 55.2796, zoom: 1.6, category: 'leisure',
    name: { en: 'The Dubai Mall', ar: 'دبي مول' },
    blurb: { en: 'One of the largest shopping and entertainment destinations in the world, home to an aquarium, an ice rink and hundreds of shops beside Burj Lake.',
      ar: 'إحدى أكبر وجهات التسوق والترفيه في العالم، وتضم حوض أسماك وحلبة تزلج على الجليد ومئات المتاجر بجوار بحيرة برج خليفة.' },
    facts: [{ en: 'Opened in 2008', ar: 'افتُتح عام 2008' }],
  });
  const fountain = entry(app, {
    id: 'dubai-fountain', lat: 25.1967, lon: 55.2776, zoom: 2.2, category: 'leisure',
    name: { en: 'The Dubai Fountain', ar: 'نافورة دبي' },
    blurb: { en: 'A choreographed fountain on Burj Lake whose water jets dance to music and light; evening shows run every half hour.',
      ar: 'نافورة راقصة على بحيرة برج خليفة تتمايل نوافيرها على أنغام الموسيقى والأضواء، وتُقام عروضها المسائية كل نصف ساعة.' },
    facts: [{ en: 'Opened in 2009', ar: 'افتُتحت عام 2009' }],
  });
  const G = app.geo;
  // prefer the terrain's (smoothed) Burj Lake outline so water, promenade, fountain and mall agree
  const dataLake = (DATA.LAKES || []).find((l) => l.id === 'burj-lake');
  const tWater = app.terrain && app.terrain.waters ? app.terrain.waters.find((w) => w.id === 'burj-lake') : null;
  const terrainPaintsLake = !!tWater;
  const lake = tWater && tWater.pts.length > 3 ? tWater.pts.map((p) => [p[0], p[1]]) : G.llPts(dataLake ? dataLake.pts : LAKE_LL);
  const lb = bboxOf(lake);
  clearSite(app, inflate(lake, 0.6));

  // lake promenade: a paved ring (~30 m, approximate) with lamp posts, drawn as an underlay (ground level)
  const prom = inflate(lake, 0.3);
  const lamps = [], palms = [];
  const stepL = Math.max(1, Math.round(lake.length / 30));
  for (let i = 0; i < lake.length; i += stepL) {
    const a = lake[i], b = prom[i];
    lamps.push([a[0] + (b[0] - a[0]) * 0.25, a[1] + (b[1] - a[1]) * 0.25]);
    if ((i / stepL) % 2 === 0) palms.push([a[0] + (b[0] - a[0]) * 0.7, a[1] + (b[1] - a[1]) * 0.7, i]);
  }
  app.scene.underlays.push((r) => {
    if (!onScreen(r, lb.x0 - 0.5, lb.y0 - 0.5, lb.x1 + 0.5, lb.y1 + 0.5)) return;
    const c = r.ctx;
    c.beginPath(); tracePoly(r, prom); tracePoly(r, lake);
    c.fillStyle = r.L.shade('#ece3d0', 0, 0, 1); c.fill('evenodd');
    if (!terrainPaintsLake) fillPoly(r, lake, 0, r.L.shade('#3b8fb5', 0, 0, 1));
    if (r.zoom > 0.3) { // stone quay edge
      c.beginPath(); tracePoly(r, lake);
      c.strokeStyle = r.L.shade('#c9b994', 0, 0, 1); c.lineWidth = Math.max(0.8, 1.8 * r.zoom); c.stroke();
    }
    if (r.night > 0.05) {
      // the city-glow underlay washes over the water; pull the lake back to dark water, then add skyline reflections
      fillPoly(r, lake, 0, `rgba(10,24,48,${(0.6 * r.night).toFixed(3)})`);
      c.globalCompositeOperation = 'lighter';
      fillPoly(r, lake, 0, `rgba(30,70,125,${(0.22 * r.night).toFixed(3)})`);
      c.globalCompositeOperation = 'source-over';
      if (r.zoom > 0.3) for (const p of lamps) glowAt(r, p[0], p[1], 5, 7, '#ffd9a0', 0.75 * r.night);
    }
  });
  // promenade palms, grouped by side of the lake (so depth sorting against the mall works)
  const lc0 = centroid2(lake), groups = [[], [], [], []];
  for (const p of palms) {
    const a = Math.atan2(p[1] - lc0[1], p[0] - lc0[0]);
    groups[((Math.floor((a + Math.PI) / (Math.PI / 2)) % 4) + 4) % 4].push(p);
  }
  for (const g of groups) {
    if (!g.length) continue;
    const b = bboxOf(g), gx = (b.x0 + b.x1) / 2, gy = (b.y0 + b.y1) / 2;
    app.scene.add({ x: gx, y: gy, bbox: { x0: b.x0 - 0.1, y0: b.y0 - 0.1, x1: b.x1 + 0.1, y1: b.y1 + 0.1, h: 14 }, minZoom: 0.6, _lm: true,
      draw(r) { for (const p of g) palm(r, p[0], p[1], 0, 9, p[2]); } });
  }

  // ---- The Dubai Mall: a big, low, stepped mass on the lake's north shore (layout approximate/artistic) ----
  // Local frame: u runs along the north shore (~east), +v points toward the lake (~south, toward the camera).
  const MALL = { lat: 25.1991, lon: 55.2780, deg: 4, hu: 210, hv: 110, h: 20 };
  const [mx, my] = G.toWorld(MALL.lat, MALL.lon);
  const F = frame(mx, my, MALL.deg);
  clearSite(app, [F(-235, -185), F(350, -185), F(350, 150), F(-235, 150)]);
  const slices = [-MALL.hu - 1, -105, 0, 105, MALL.hu + 1];
  for (let s = 0; s < slices.length - 1; s++) {
    const s0 = slices[s], s1 = slices[s + 1];
    const hi = mallSlice(F, MALL, s0, s1, 2), lo = mallSlice(F, MALL, s0, s1, 0);
    const shadow = [{ pts: rectU(F, Math.max(s0, -MALL.hu), Math.min(s1, MALL.hu), -MALL.hv, MALL.hv), h: MALL.h },
      { pts: rectU(F, Math.max(s0, -175), Math.min(s1, 175), -78, 58), h: MALL.h + 11 }];
    add(app, mall, { mesh: hi, bbox: hi.bbox(0.08), shadow, draw(r) { (r.zoom > 0.45 ? hi : lo).draw(r); } });
  }
  // multi-storey car parks: east of the mall and behind it (north, toward the boulevard)
  for (const [u0, u1, v0, v1, decks, ramp] of [[222, 318, -105, 32, 6, [334, -30]], [-160, 110, -182, -128, 5, null]]) {
    const hi = carPark(F, u0, u1, v0, v1, decks, ramp, 2), lo = carPark(F, u0, u1, v0, v1, decks, ramp, 0);
    add(app, mall, { mesh: hi, bbox: hi.bbox(0.05), shadow: [{ pts: rectU(F, u0, u1, v0, v1), h: decks * 3.2 }],
      draw(r) { (r.zoom > 0.45 ? hi : lo).draw(r); } });
  }

  // --- the fountain: jets along a curved line in the lake ---
  const line = [];
  // fountain line along the lake's long axis
  const lc = centroid2(lake);
  let ax = 0, ay = 0;
  for (const p of lake) { const dx = p[0] - lc[0], dy = p[1] - lc[1]; if (dx * dx + dy * dy > ax * ax + ay * ay) { ax = dx; ay = dy; } }
  const fx0 = lc[0] - ax * 0.62, fy0 = lc[1] - ay * 0.62, fx1 = lc[0] + ax * 0.62, fy1 = lc[1] + ay * 0.62;
  const N = 34;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // slight bow
    const bx = fx0 + (fx1 - fx0) * t, by = fy0 + (fy1 - fy0) * t;
    const nx = -(fy1 - fy0), ny = fx1 - fx0, nl = Math.hypot(nx, ny);
    const bow = Math.sin(t * Math.PI) * 0.12;
    line.push([bx + (nx / nl) * bow, by + (ny / nl) * bow]);
  }
  const fc = centroid2(line);
  const showOn = (h) => {
    const mins = (h * 60) % 30;
    const inEvening = h >= 18 && h < 23.2;
    const inMidday = (h >= 13 && h < 13.75);
    return (inEvening || inMidday) && mins < 9;
  };
  app.landmarkFountainShow = showOn;
  add(app, fountain, {
    x: fc[0], y: fc[1], depth: fc[0] + fc[1],
    bbox: { x0: lb.x0, y0: lb.y0, x1: lb.x1, y1: lb.y1, h: 160 },
    draw(r) {
      const c = r.ctx, night = r.night;
      // idle: a few low bubblers; show: full choreography
      const on = showOn(r.hours);
      if (r.zoom < 0.18) return;
      if (!on) {
        if (r.zoom < 0.35) return;
        c.lineCap = 'round';
        c.strokeStyle = night > 0.3 ? 'rgba(170,215,255,0.35)' : 'rgba(255,255,255,0.55)';
        c.lineWidth = Math.max(0.6, 1.2 * r.zoom);
        c.beginPath();
        for (let i = 0; i < N; i += 3) { const p = line[i]; const X = r.X(p[0], p[1]), Y = r.Y(p[0], p[1], 0); c.moveTo(X, Y); c.lineTo(X, Y - 4 * r.kz); }
        c.stroke();
        return;
      }
      const t = r.t, phase = Math.floor(t / 9) % 4;
      c.lineCap = 'round';
      const w = Math.max(0.7, 2.2 * r.zoom);
      const col = night > 0.3 ? 'rgba(215,240,255,0.85)' : 'rgba(255,255,255,0.88)';
      const prev = c.globalCompositeOperation;
      if (night > 0.3) c.globalCompositeOperation = 'lighter';
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath();
      for (let i = 0; i < N; i++) {
        const p = line[i];
        let hgt, sway;
        if (phase === 0) { hgt = 40 + 90 * Math.abs(Math.sin(t * 1.6 + i * 0.35)); sway = Math.sin(t * 1.1 + i * 0.25) * 0.4; }
        else if (phase === 1) { hgt = 30 + 110 * Math.pow(Math.abs(Math.sin(t * 0.9 - Math.abs(i - N / 2) * 0.18)), 2); sway = 0; }
        else if (phase === 2) { hgt = 25 + 60 * (0.5 + 0.5 * Math.sin(t * 3 + i)); sway = (i % 2 ? 1 : -1) * 0.55 * Math.sin(t * 1.4); }
        else { hgt = 20 + 125 * Math.max(0, Math.sin(t * 2.2 - i * 0.5)); sway = Math.sin(t * 0.7) * 0.25; }
        const X = r.X(p[0], p[1]), Y = r.Y(p[0], p[1], 0);
        const top = hgt * r.kz, dx = sway * top;
        c.moveTo(X, Y);
        c.quadraticCurveTo(X + dx * 0.3, Y - top, X + dx, Y - top * (0.86 + 0.14 * (1 - Math.abs(sway))));
      }
      c.stroke();
      // mist halo
      if (night > 0.1) {
        for (let i = 0; i < N; i += 4) {
          const p = line[i];
          glowAt(r, p[0], p[1], 50 + 30 * Math.sin(t * 2 + i), 40, '#a8d8ff', 0.22 * night);
        }
      }
      c.globalCompositeOperation = prev;
    },
  });

  // Souk Al Bahar / Address Downtown cluster is left to the city generator.
}

function bboxOf(pts) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of pts) { b.x0 = Math.min(b.x0, p[0]); b.y0 = Math.min(b.y0, p[1]); b.x1 = Math.max(b.x1, p[0]); b.y1 = Math.max(b.y1, p[1]); }
  return b;
}
function inflate(pts, d) {
  const [cx, cy] = centroid2(pts);
  return pts.map((p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * d, p[1] + (dy / l) * d]; });
}
function tracePoly(r, pts) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], X = r.ox + (p[0] - p[1]) * r.kx, Y = r.oy + (p[0] + p[1]) * r.ky;
    i ? r.ctx.lineTo(X, Y) : r.ctx.moveTo(X, Y);
  }
  r.ctx.closePath();
}
/** Rectangle in a local frame from u/v extents (metres). */
const rectU = (F, u0, u1, v0, v1) => [F(u0, v0), F(u1, v0), F(u1, v1), F(u0, v1)];
/** Gabled glass ridge running along u (skylight). cap0/cap1: close the ends. */
function ridgeU(m, F, u0, u1, v, hw, z, hr, col, o, cap0, cap1) {
  const fo = { out: F.p3((u0 + u1) / 2, v, z), glow: o.glow, ga: o.ga };
  m.face([F.p3(u0, v + hw, z), F.p3(u1, v + hw, z), F.p3(u1, v, z + hr), F.p3(u0, v, z + hr)], col, fo);
  m.face([F.p3(u1, v - hw, z), F.p3(u0, v - hw, z), F.p3(u0, v, z + hr), F.p3(u1, v, z + hr)], col, fo);
  if (cap1) m.face([F.p3(u1, v - hw, z), F.p3(u1, v, z + hr), F.p3(u1, v + hw, z)], col, fo);
  if (cap0) m.face([F.p3(u0, v + hw, z), F.p3(u0, v, z + hr), F.p3(u0, v - hw, z)], col, fo);
}

/**
 * One u-slice [s0, s1] of The Dubai Mall (the mall is split so painter's sorting against nearby towers holds).
 * Layers: 0 podium · 1 lakeside terrace, aquarium-blue glazing, galleria skylight · 2 upper level ·
 * 3 atrium block + upper skylights · 4 atrium dome · 5 entrance canopies. q: 2 = full, 0 = coarse (no detail).
 */
function mallSlice(F, M, s0, s1, q) {
  const m = new Mesh();
  const HU = M.hu, HV = M.hv, H0 = M.h;
  const clip = (u0, u1) => { const a = Math.max(u0, s0), b = Math.min(u1, s1); return b - a > 0.5 ? [a, b] : null; };
  const box = (u0, u1, v0, v1, z0, z1, col, o) => { const c = clip(u0, u1); if (c) extrude(m, rectU(F, c[0], c[1], v0, v1), z0, z1, col, o); };
  const ridge = (u0, u1, v, hw, z, hr) => {
    const c = clip(u0, u1); if (!c) return;
    ridgeU(m, F, c[0], c[1], v, hw, z, hr, '#a8c3d1', { glow: '#ffe2b0', ga: 0.55 }, c[0] === u0, c[1] === u1);
    if (q) for (let u = Math.ceil(c[0] / 45) * 45; u < c[1]; u += 45) m.light(F.p3(u, v, z + hr), 9, '#ffe2b0', 0.45);
  };
  const shop = q ? { floor: 6.5, seed: 300 + s0, lit: 0.85, glass: '#8b7d68', light: '#ffd9a0', band: 0.22, alpha: 0.3 } : null;
  // podium: the main shopping floors
  m.layer = 0;
  box(-HU, HU, -HV, HV, 0, H0, '#e9dec8', { top: '#d8d0c1', win: shop, glow: '#ffcf8a', ga: 0.3 });
  // lakeside: a one-storey terrace of restaurants along the waterfront promenade + a tall aquarium-blue glazed bay
  m.layer = 1;
  box(-195, 150, HV, HV + 16, 0, 7, '#f1eadc', { top: '#e2d8c4', glow: '#ffd08a', ga: 0.7 });
  const gb = clip(-30, 60);
  if (gb) m.face([F.p3(gb[0], HV + 0.4, 7.5), F.p3(gb[1], HV + 0.4, 7.5), F.p3(gb[1], HV + 0.4, H0 - 2), F.p3(gb[0], HV + 0.4, H0 - 2)],
    '#4f93b0', { n: [0, 1, 0], glow: '#4fc8ff', ga: 0.55 });
  if (q) ridge(-190, 190, 84, 7, H0, 4); // galleria skylight over the front band of shops
  // upper levels, stepped back from every edge and stepping up toward the east (three roof heights)
  m.layer = 2;
  const upWin = q ? { floor: 5, seed: 340 + s0, lit: 0.7, glass: '#8b7d68', light: '#ffd9a0', band: 0.2, alpha: 0.25 } : null;
  box(-175, -45, -78, 58, H0, H0 + 8, '#ede4d2', { top: '#d4ccbe', glow: '#ffcf8a', ga: 0.1, win: upWin });
  box(-45, 75, -78, 58, H0, H0 + 10, '#efe6d4', { top: '#d0c8ba', glow: '#ffcf8a', ga: 0.1, win: upWin });
  box(75, 175, -70, 50, H0, H0 + 13, '#ebe1cd', { top: '#cec6b8', glow: '#ffcf8a', ga: 0.1, win: upWin });
  // grand atrium block + skylight spines + rooftop plant on the upper roofs
  m.layer = 3;
  box(-45, 75, -52, 38, H0 + 10, H0 + 19, '#f0e8d8', { top: '#cbc3b5', glow: '#ffdca0', ga: 0.12 });
  if (q) {
    ridge(-165, -60, -12, 6, H0 + 8, 4); ridge(90, 165, -12, 6, H0 + 13, 4);
    for (const [u, v, z] of [[-150, 30, H0 + 8], [-112, 34, H0 + 8], [-80, -60, H0 + 8], [112, 26, H0 + 13], [146, 30, H0 + 13], [140, -52, H0 + 13]])
      box(u - 7, u + 7, v - 5, v + 5, z, z + 3, '#b8b1a5', { top: '#c4beb3' });
  }
  // atrium dome (the slice holding its centre owns it)
  m.layer = 4;
  if (15 >= s0 && 15 < s1) { const [cx, cy] = F(15, -7); domeM(m, cx, cy, 30, H0 + 19, 11, q ? 14 : 8, '#c4d6df', { glow: '#ffdca0', ga: 0.45 }); }
  // entrance canopies: two on the lake side, one on the east front
  m.layer = 5;
  for (const u of [-125, 95]) {
    const c = clip(u - 16, u + 16); if (!c) continue;
    extrude(m, rectU(F, c[0], c[1], HV, HV + 30), 9, 10.5, '#f6f3ec', { top: '#efeae0' });
    if (q && u >= s0 && u < s1) { m.line(F.p3(u - 14, HV + 29, 0), F.p3(u - 14, HV + 29, 9), '#d9d4ca', 1.2); m.line(F.p3(u + 14, HV + 29, 0), F.p3(u + 14, HV + 29, 9), '#d9d4ca', 1.2); m.light(F.p3(u, HV + 24, 8), 16, '#ffe0a8', 0.75); }
  }
  if (HU >= s0 && HU < s1 + 1) {
    extrude(m, rectU(F, HU, HU + 20, 45, 92), 9, 10.5, '#f6f3ec', { top: '#efeae0' });
    if (q) m.light(F.p3(HU + 14, 68, 8), 16, '#ffe0a8', 0.75);
  }
  return m.done();
}

/** Multi-storey car park: open decks (dark bands), roof bays, optional spiral ramp drum. */
function carPark(F, u0, u1, v0, v1, decks, ramp, q) {
  const m = new Mesh(), h = decks * 3.2;
  m.layer = 0;
  extrude(m, rectU(F, u0, u1, v0, v1), 0, h, '#ddd5c6', { top: '#aaa59c',
    win: { floor: 3.2, seed: 500 + u0, lit: 0.35, glass: '#4b4943', light: '#fff0d0', band: 0.48, alpha: 0.6 } });
  if (q) {
    m.layer = 1;
    for (let u = u0 + 12; u < u1 - 6; u += 16) m.line(F.p3(u, v0 + 8, h + 0.2), F.p3(u, v1 - 8, h + 0.2), '#d9d4c8', 0.6);
    for (let i = 0; i < 4; i++) m.light(F.p3(u0 + (u1 - u0) * (0.2 + i * 0.2), (v0 + v1) / 2, h + 5), 10, '#ffeac0', 0.6);
  }
  if (ramp) {
    m.layer = 2;
    const [cx, cy] = F(ramp[0], ramp[1]);
    lathe(m, cx, cy, [[12, 0], [12, h + 1.5]], q ? 12 : 8, '#e2dbcd', { top: '#b0aba2',
      win: q ? { floor: 3.2, seed: 9, lit: 0.2, glass: '#5a5750', light: '#fff0d0', band: 0.4, alpha: 0.5 } : null });
  }
  return m.done();
}

// ------------------------------------------------------------------------------------------------
// Dubai Opera — dhow-hull form with a glass prow
// ------------------------------------------------------------------------------------------------
function dubaiOpera(app) {
  const lm = entry(app, {
    id: 'dubai-opera', lat: 25.1957, lon: 55.2717, zoom: 3.2, category: 'culture',
    name: { en: 'Dubai Opera', ar: 'دبي أوبرا' },
    blurb: { en: 'A performing-arts venue shaped like a traditional dhow, with a glass prow facing Burj Khalifa.',
      ar: 'دار للفنون الأدائية على هيئة مركب شراعي تقليدي (داو)، بواجهة زجاجية تطل على برج خليفة.' },
    facts: [{ en: 'Opened in 2016', ar: 'افتُتحت عام 2016' }],
  });
  const F = frame(lm.x, lm.y, -32);
  clearSite(app, rectL(F, 0, 0, 90, 55));
  const m = new Mesh();
  // stations along the hull (u: stern → bow), half-beam b and roof height h
  const st = [];
  const NS = 9;
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const u = -75 + t * 150;
    const b = 38 * Math.sqrt(Math.max(0.02, 1 - Math.pow(Math.max(0, t - 0.15) / 0.85, 2.2)));
    const h = 22 + 34 * Math.pow(t, 1.6);
    st.push({ u, b, h });
  }
  const out = [lm.x, lm.y, 10];
  for (let i = 0; i < NS; i++) {
    const A = st[i], B = st[i + 1];
    const glass = i >= NS - 2;
    const colS = glass ? '#8fb3c8' : '#d6d9dc';
    // two hull sides (walls)
    for (const s of [-1, 1]) {
      m.face([F.p3(A.u, s * A.b, 0), F.p3(B.u, s * B.b, 0), F.p3(B.u, s * B.b, B.h * 0.82), F.p3(A.u, s * A.b, A.h * 0.82)], colS,
        { out, glow: glass ? '#ffd28a' : '#ffe6c0', ga: glass ? 0.6 : 0.3 });
      // roof slopes up to the ridge
      m.face([F.p3(A.u, s * A.b, A.h * 0.82), F.p3(B.u, s * B.b, B.h * 0.82), F.p3(B.u, 0, B.h), F.p3(A.u, 0, A.h)], '#e2e4e6', { out, glow: '#dfe8ff', ga: 0.25 });
    }
  }
  // stern wall
  const S0 = st[0];
  m.face([F.p3(S0.u, -S0.b, 0), F.p3(S0.u, S0.b, 0), F.p3(S0.u, S0.b, S0.h * 0.82), F.p3(S0.u, 0, S0.h), F.p3(S0.u, -S0.b, S0.h * 0.82)], '#cfd3d6', { out });
  // glass bow mast (the prow)
  const Bw = st[NS];
  m.line(F.p3(Bw.u, 0, 0), F.p3(Bw.u + 6, 0, Bw.h + 6), '#c9cdd1', 2.5, { glow: '#ffffff', ga: 0.8 });
  m.light(F.p3(Bw.u - 10, 0, 25), 40, '#ffcc80', 0.5);
  m.done();
  add(app, lm, { mesh: m, shadow: [{ pts: [F(-75, -38), F(40, -38), F(75, 0), F(40, 38), F(-75, 38)], h: 40 }] });
}

// ------------------------------------------------------------------------------------------------
// The Opus — Zaha Hadid’s cube with a free-form void
// ------------------------------------------------------------------------------------------------
function theOpus(app) {
  const lm = entry(app, {
    id: 'the-opus', lat: 25.1883, lon: 55.2724, zoom: 3.4, category: 'culture',
    name: { en: 'The Opus', ar: 'ذا أوبوس' },
    blurb: { en: 'A glass cube by Zaha Hadid Architects, split by a sculpted free-form void that seems to have been carved out of the building.',
      ar: 'مكعب زجاجي من تصميم مكتب زها حديد المعماري، يشقه فراغ منحوت حر الشكل يبدو كأنه نُحت من قلب المبنى.' },
  });
  const F = frame(lm.x, lm.y, 0);
  clearSite(app, rectL(F, 0, 0, 60, 60));
  const hs = 48, H = 92;
  const m = new Mesh();
  extrude(m, rectL(F, 0, 0, hs, hs), 0, H, '#5d7286', { top: '#7d8e9c',
    win: { floor: 4.2, seed: 77, lit: 0.55, glass: '#cfe0ea', light: '#fff3d8', alpha: 0.25 } });
  m.done();
  // void outline on a face (param s 0..1 along face, z) — an organic blob
  const blob = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = 1 + 0.18 * Math.sin(3 * a + 0.6) + 0.1 * Math.cos(5 * a);
      out.push([0.5 + Math.cos(a) * 0.3 * rr, 46 + Math.sin(a) * 22 * rr]);
    }
    return out;
  };
  const B = blob(28);
  const faceS = (s, z) => { const p = F(-hs + s * 2 * hs, hs + 0.2); return [p[0], p[1], z]; };   // south face
  const faceE = (s, z) => { const p = F(hs + 0.2, hs - s * 2 * hs); return [p[0], p[1], z]; };    // east face
  const shift = (pts, ds, dz) => pts.map(([s, z]) => [s + ds, z + dz]);
  add(app, lm, {
    mesh: m, shadow: [{ pts: rectL(F, 0, 0, hs, hs), h: H }],
    draw(r) {
      m.draw(r);
      const c = r.ctx;
      const path = (fn, pts) => { c.beginPath(); pts.forEach(([s, z], i) => { const p = fn(s, z); const X = r.X(p[0], p[1]), Y = r.Y(p[0], p[1], p[2]); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); };
      for (const [fn, nx, ny] of [[faceS, 0, 1], [faceE, 1, 0]]) {
        // the void: dark interior, a mirror-glass inner skin offset upward, bright rim
        path(fn, B); c.fillStyle = r.L.shade('#2b3742', nx, ny, 0); c.fill();
        path(fn, shift(B.map(([s, z]) => [0.5 + (s - 0.5) * 0.82, 46 + (z - 46) * 0.8]), 0.03, 3));
        c.fillStyle = r.L.shade('#a9c3d3', 0.3, 0.3, 0.6); c.fill();
        if (r.night > 0.05) {
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = hsla(200 + 40 * Math.sin(r.t * 0.3), 70, 60, 0.55 * r.night); c.fill();
          c.globalCompositeOperation = 'source-over';
        }
        path(fn, B); c.strokeStyle = r.L.shade('#eef3f6', nx, ny, 0); c.lineWidth = Math.max(0.7, 1.6 * r.zoom); c.stroke();
      }
      // night: twinkling facade dots
      if (r.night > 0.05 && r.zoom > 0.6) {
        c.fillStyle = `rgba(255,255,255,${(0.75 * r.night).toFixed(3)})`;
        const sz = Math.max(1, r.zoom * 1.2);
        for (let i = 0; i < 70; i++) {
          if (hash(i, Math.floor(r.t * 1.5)) < 0.45) continue;
          const s = hash(i, 3), z = 6 + hash(i, 5) * (H - 10);
          const inVoid = Math.abs(s - 0.5) < 0.36 && Math.abs(z - 46) < 27;
          if (inVoid) continue;
          const p = (i % 2 ? faceS : faceE)(s, z);
          c.fillRect(r.X(p[0], p[1]) - sz / 2, r.Y(p[0], p[1], p[2]) - sz / 2, sz, sz);
        }
      }
    },
  });
}

// ------------------------------------------------------------------------------------------------
// JW Marriott Marquis — twin 355 m towers
// ------------------------------------------------------------------------------------------------
function jwMarquis(app) {
  const lm = entry(app, {
    id: 'jw-marriott-marquis', lat: 25.1856, lon: 55.2581, zoom: 1.5, category: 'icon',
    name: { en: 'JW Marriott Marquis Dubai', ar: 'جي دبليو ماريوت ماركيز دبي' },
    blurb: { en: 'Twin 355 m hotel towers in Business Bay whose ribbed facades echo the trunk of a date palm.',
      ar: 'برجان فندقيان توأمان بارتفاع 355 متراً في الخليج التجاري، تحاكي واجهاتهما المضلعة جذع نخلة التمر.' },
    facts: [{ en: 'Height: 355 m (each tower)', ar: 'الارتفاع: 355 متراً لكل برج' }],
  });
  const F = frame(lm.x, lm.y, -40);
  clearSite(app, rectL(F, 0, 0, 90, 50));
  const shadows = [];
  const towers = [];
  for (const [u, seed] of [[-42, 1], [42, 2]]) {
    const m = new Mesh();
    const [cx, cy] = F(u, 0);
    // octagonal (chamfered square) plan
    const oct = (hsz, z) => { const c = hsz * 0.42; const Fl = frame(cx, cy, -40); return { z, pts: [Fl(-hsz + c, -hsz), Fl(hsz - c, -hsz), Fl(hsz, -hsz + c), Fl(hsz, hsz - c), Fl(hsz - c, hsz), Fl(-hsz + c, hsz), Fl(-hsz, hsz - c), Fl(-hsz, -hsz + c)] }; };
    m.layer = 0;
    loftM(m, [oct(27, 0), oct(26, 250)], '#c8b99c', { top: false,
      win: { floor: 4, seed: 50 + seed, lit: 0.55, glass: '#4f5f6a', light: '#ffe2ae', alpha: 0.45 } });
    m.layer = 1;
    loftM(m, [oct(26, 250), oct(24, 290), oct(20, 315), oct(15, 330)], '#d4c6aa', { top: '#bfb39b' });
    m.layer = 2;
    // crown fins + spire
    loftM(m, [oct(12, 330), oct(4, 350), oct(0.4, 355)], '#e2d6bd', { glow: '#fff0c8', ga: 0.6 });
    m.light([cx, cy, 350], 24, '#ffe8b8', 0.8);
    m.done();
    towers.push(m);
    shadows.push({ pts: oct(27, 0).pts, h: 330 });
    add(app, lm, { mesh: m, x: cx, y: cy, shadow: [{ pts: oct(27, 0).pts, h: 330 }],
      fx: (f, r) => {
        if (r.night < 0.1 || f.k !== 0 || f.nz > 0.8) return null;
        // golden vertical ribs on the chamfered corners + a bright crown
        if (f.z > 300) return `rgba(255,226,160,${(0.65 * r.night).toFixed(3)})`;
        return f.tag % 2 === 1 ? `rgba(255,210,130,${(0.28 * r.night).toFixed(3)})` : null;
      } });
  }
}

export function registerDowntown(app) {
  burjKhalifa(app);
  dubaiMall(app);
  dubaiOpera(app);
  theOpus(app);
  jwMarquis(app);
}
