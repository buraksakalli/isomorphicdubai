// Sheikh Zayed Road / Zabeel: Museum of the Future, Emirates Towers, Dubai World Trade Centre, Dubai Frame.
import { Mesh, frame, extrude, loftM, lathe, entry, add, addWithIcon, rectL, ellL, hsla, glowAt, clamp, TAU,
  clearSite, viewDepth } from './util.js';
import { hash } from '../../core/shapes.js';

// ------------------------------------------------------------------------------------------------
// Museum of the Future — stainless-steel torus with calligraphy windows on a green mound
// ------------------------------------------------------------------------------------------------
function museumOfTheFuture(app) {
  const lm = entry(app, {
    id: 'museum-of-the-future', lat: 25.2192, lon: 55.2820, zoom: 3.6, category: 'culture',
    name: { en: 'Museum of the Future', ar: 'متحف المستقبل' },
    blurb: { en: 'A torus of stainless steel wrapped in Arabic calligraphy, whose windows spell out lines of poetry by Sheikh Mohammed bin Rashid Al Maktoum about the future.',
      ar: 'مبنى حلقي من الفولاذ المقاوم للصدأ تكسوه الخطوط العربية، وتشكّل نوافذه أبياتاً من شعر صاحب السمو الشيخ محمد بن راشد آل مكتوم عن المستقبل.' },
    facts: [{ en: 'Opened on 22 February 2022', ar: 'افتُتح في 22 فبراير 2022' }, { en: 'Height: 77 m', ar: 'الارتفاع: 77 متراً' }],
  });
  const F = frame(lm.x, lm.y, -30); // u: ring plane horizontal, v: through the eye
  clearSite(app, ellL(F, 0, 0, 100, 70, 10));
  const build = (q) => {
    const m = new Mesh();
    // mound
    m.layer = 0;
    const mound = [];
    for (let k = 0; k <= 4; k++) { const a = (k / 4) * (Math.PI / 2); mound.push({ z: Math.sin(a) * 13, pts: ellL(F, 0, 0, 95 * Math.cos(a) + 18 * (k === 4 ? 1 : 0), 62 * Math.cos(a) + 12 * (k === 4 ? 1 : 0), q ? 24 : 12) }); }
    mound[4].pts = ellL(F, 0, 0, 30, 20, q ? 24 : 12);
    loftM(m, mound, '#7fae5c', { top: '#86b562' });
    m.layer = 1;
    const NT = q ? 56 : 24, NP = q ? 14 : 8;
    const a = 46, b = 21, rt = 16, rw = 19, zc = 13 + 25;
    const P = (th, ph) => {
      const cx = a * Math.cos(th), cz = b * Math.sin(th);
      let nx = b * Math.cos(th), nz = a * Math.sin(th); const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
      const u = cx + nx * rt * Math.cos(ph), z = zc + cz + nz * rt * Math.cos(ph) * 1.15, v = rw * Math.sin(ph);
      return F.p3(u, v, z);
    };
    for (let i = 0; i < NT; i++) {
      const t0 = (i / NT) * TAU, t1 = ((i + 1) / NT) * TAU;
      const c0 = F.p3(a * Math.cos(t0), 0, zc + b * Math.sin(t0)), c1 = F.p3(a * Math.cos(t1), 0, zc + b * Math.sin(t1));
      const out = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (c0[2] + c1[2]) / 2];
      for (let j = 0; j < NP; j++) {
        const p0 = (j / NP) * TAU, p1 = ((j + 1) / NP) * TAU;
        const tm = (t0 + t1) / 2, pm = (p0 + p1) / 2;
        const script = Math.sin(tm * 9 + pm * 2.3) * Math.cos(tm * 17 - pm) > 0.18 && hash(i, j) > 0.25;
        m.face([P(t0, p0), P(t1, p0), P(t1, p1), P(t0, p1)], script ? '#5d6a73' : '#cfd6db', { out, tag: script ? 1 : 0,
          glow: script ? '#ffcf7a' : null, ga: 0.95 });
      }
    }
    return m.done();
  };
  const hi = build(1), lo = build(0);
  add(app, lm, { x: lm.x, y: lm.y, bbox: hi.bbox(0.1), shadow: [{ pts: [F(-64, -19), F(64, -19), F(64, 19), F(-64, 19)], h: 60 }],
    draw: (r) => (r.zoom > 0.7 ? hi : lo).draw(r) });
}

// ------------------------------------------------------------------------------------------------
// Emirates Towers — two triangular towers, 355 m and 309 m
// ------------------------------------------------------------------------------------------------
function triTower(m, F, u, v, side, body, roof, top) {
  const R = side / Math.sqrt(3);
  const tri = (s) => [0, 1, 2].map((k) => { const a = -Math.PI / 2 + (k * TAU) / 3 + Math.PI / 6; return F(u + Math.cos(a) * R * s, v + Math.sin(a) * R * s); });
  const base = tri(1);
  extrude(m, base, 0, body, '#d3d9de', { top: false,
    win: { floor: 4, seed: 300 + u, lit: 0.45, glass: '#7f8f9b', light: '#fff0d6', alpha: 0.35 } });
  // sloped triangular crown: a single inclined facet rising from the far edge to the apex corner
  const apex = base[0];
  const B = base.map((p) => [p[0], p[1], body]);
  const A = [apex[0], apex[1], roof];
  const out = [(base[0][0] + base[1][0] + base[2][0]) / 3, (base[0][1] + base[1][1] + base[2][1]) / 3, body + 2];
  m.face([B[0], B[1], A], '#c5ccd2', { out, tag: 7, glow: '#e6f2ff', ga: 0.35, win: { floor: 4, seed: 9, lit: 0.3, glass: '#6b7c88', alpha: 0.5 } });
  m.face([B[2], B[0], A], '#c5ccd2', { out, tag: 7, glow: '#e6f2ff', ga: 0.35 });
  m.face([B[1], B[2], A], '#dfe4e8', { out, tag: 7, glow: '#e6f2ff', ga: 0.55 });
  // spire on the apex
  m.line([apex[0], apex[1], roof], [apex[0], apex[1], top], '#d9dee2', 2, { glow: '#ffffff', ga: 0.8 });
  m.light([apex[0], apex[1], top], 12, '#ff5050', 0.6);
}
function emiratesTowers(app) {
  const lm = entry(app, {
    id: 'emirates-towers', lat: 25.2172, lon: 55.2828, zoom: 1.7, category: 'icon',
    name: { en: 'Emirates Towers', ar: 'أبراج الإمارات' },
    blurb: { en: 'Twin triangular towers on Sheikh Zayed Road with sharply sloping crowns: an office tower of 355 m and a hotel tower of 309 m.',
      ar: 'برجان مثلثا الشكل على شارع الشيخ زايد بتاجين مائلين حادين: برج مكاتب بارتفاع 355 متراً وبرج فندقي بارتفاع 309 أمتار.' },
    facts: [{ en: 'Office tower: 355 m', ar: 'برج المكاتب: 355 متراً' }, { en: 'Hotel tower: 309 m', ar: 'البرج الفندقي: 309 أمتار' }],
  });
  const F = frame(lm.x, lm.y, -65);
  clearSite(app, rectL(F, 0, 0, 130, 70));
  for (const [u, side, body, roof, top] of [[70, 50, 290, 330, 355], [-70, 46, 250, 285, 309]]) {
    const m = new Mesh();
    triTower(m, F, u, 0, side, body, roof, top);
    m.done();
    const [x, y] = F(u, 0);
    add(app, lm, { mesh: m, x, y, shadow: [{ pts: ellL(F, u, 0, side * 0.45, side * 0.45, 3), h: roof }],
      fx: (f, r) => (f.k === 0 && f.tag !== 7 && f.nz < 0.5 && r.night > 0.1 ? `rgba(200,225,255,${(0.12 * r.night).toFixed(3)})` : null) });
  }
  // the Boulevard podium between them
  const p = new Mesh();
  extrude(p, rectL(F, 0, 0, 50, 22), 0, 18, '#cfd4d8', { top: '#b9c0c6', glow: '#ffd9a0', ga: 0.3 });
  p.done();
  add(app, lm, { mesh: p });
}

// ------------------------------------------------------------------------------------------------
// Dubai World Trade Centre tower (1979) — honeycomb facade
// ------------------------------------------------------------------------------------------------
function dwtc(app) {
  const lm = entry(app, {
    id: 'dubai-world-trade-centre', lat: 25.2253, lon: 55.2856, zoom: 2.8, category: 'icon',
    name: { en: 'Dubai World Trade Centre', ar: 'مركز دبي التجاري العالمي' },
    blurb: { en: 'Opened in 1979, the honeycomb-faced Sheikh Rashid Tower is a landmark of Dubai’s early modern skyline, beside the city’s main exhibition halls.',
      ar: 'افتُتح عام 1979، ويُعد برج الشيخ راشد بواجهته الشبيهة بخلية النحل من معالم أفق دبي الحديث المبكر، بجوار قاعات المعارض الرئيسية في المدينة.' },
    facts: [{ en: 'Opened in 1979', ar: 'افتُتح عام 1979' }],
  });
  const F = frame(lm.x, lm.y, -62);
  clearSite(app, rectL(F, 0, 0, 50, 40));
  const H = 149, hu = 24, hv = 15;
  const m = new Mesh();
  extrude(m, rectL(F, 0, 0, hu, hv), 0, H - 9, '#ece4d2', { top: '#ddd5c3' });
  extrude(m, rectL(F, 0, 0, hu - 3, hv - 3), H - 9, H, '#e2dac8', { top: '#cfc7b5', glow: '#fff1d0', ga: 0.4 });
  m.line(F.p3(0, 0, H), F.p3(0, 0, H + 12), '#cfcfcf', 1.2);
  m.done();
  // honeycomb: staggered hexagonal windows on the two visible faces
  const faces = [
    { a: F(-hu, hv), b: F(hu, hv), nx: 0, ny: 1, n: 12 },   // +v face
    { a: F(hu, hv), b: F(hu, -hv), nx: 1, ny: 0, n: 8 },    // +u face
  ];
  // determine which faces actually face the viewer (in the rotated frame)
  add(app, lm, { mesh: m, shadow: [{ pts: rectL(F, 0, 0, hu, hv), h: H }],
    draw(r) {
      m.draw(r);
      const rows = 36, cell = (H - 14) / rows;
      const hx = cell * r.kz * 0.42;
      if (hx < 1.1) return;
      const c = r.ctx;
      const night = r.night;
      for (const f of faces) {
        const dx = f.b[0] - f.a[0], dy = f.b[1] - f.a[1];
        // outward normal of this face in world: perpendicular pointing away from centre
        const mx = (f.a[0] + f.b[0]) / 2 - lm.x, my = (f.a[1] + f.b[1]) / 2 - lm.y;
        if (mx + my <= 0) continue; // faces away from the camera
        c.beginPath();
        for (let row = 0; row < rows; row++) {
          const z = 6 + (row + 0.5) * cell;
          for (let k = 0; k < f.n; k++) {
            const s = (k + 0.5 + (row % 2) * 0.5) / (f.n + 0.5);
            const X = r.X(f.a[0] + dx * s, f.a[1] + dy * s), Y = r.Y(f.a[0] + dx * s, f.a[1] + dy * s, z);
            for (let e = 0; e < 6; e++) {
              const ang = (e / 6) * TAU + Math.PI / 6;
              const px = X + Math.cos(ang) * hx * 0.8, py = Y + Math.sin(ang) * hx;
              e ? c.lineTo(px, py) : c.moveTo(px, py);
            }
            c.closePath();
          }
        }
        c.fillStyle = r.L.shade('#4e5a63', mx > my ? 1 : 0, mx > my ? 0 : 1, 0);
        c.fill();
        if (night > 0.1) { c.fillStyle = r.L.emit('#ffd58e', 0.55); c.fill(); }
      }
    } });
}

// ------------------------------------------------------------------------------------------------
// Dubai Frame — 150 m golden picture frame in Zabeel Park
// ------------------------------------------------------------------------------------------------
function buildFrame(x, y, q) {
  const F = frame(x, y, 0); // plane runs east–west: frames old Dubai (north) and new Dubai (south)
  const m = new Mesh();
  const gold = '#d9aa45';
  const win = q ? { floor: 6, seed: 5, lit: 0, glass: '#9b7426', alpha: 0.45, band: 0.25 } : null;
  m.layer = 0;
  extrude(m, rectL(F, 0, 0, 58, 16), 0, 6, '#e8e0cc', { top: '#d9d0ba', glow: '#ffd27a', ga: 0.25 });
  m.layer = 1;
  for (const s of [-1, 1]) extrude(m, rectL(F, s * 39, 0, 7.5, 7), 6, 130, gold, { top: '#c99a35', win, glow: '#ffc24a', ga: 0.35 });
  m.layer = 2;
  extrude(m, rectL(F, 0, 0, 46.5, 7), 130, 150, gold, { top: '#c99a35', win, glow: '#ffc24a', ga: 0.4 });
  m.light(F.p3(0, 7, 140), 30, '#ffd27a', 0.5);
  return m.done();
}
function dubaiFrame(app) {
  const lm = entry(app, {
    id: 'dubai-frame', lat: 25.2355, lon: 55.3003, zoom: 3.2, category: 'icon',
    name: { en: 'Dubai Frame', ar: 'برواز دبي' },
    blurb: { en: 'A 150 m golden picture frame in Zabeel Park that frames old Dubai to the north and the modern skyline to the south, linked by a glass-floored bridge.',
      ar: 'برواز ذهبي بارتفاع 150 متراً في حديقة زعبيل، يؤطّر دبي القديمة شمالاً وأفق المدينة الحديثة جنوباً، ويربط برجيه جسر بأرضية زجاجية.' },
    facts: [{ en: 'Height: 150 m, width: 93 m', ar: 'الارتفاع: 150 متراً، العرض: 93 متراً' }, { en: 'Opened in 2018', ar: 'افتُتح عام 2018' }],
  });
  const { x, y } = lm;
  const F = frame(x, y, 0);
  clearSite(app, rectL(F, 0, 0, 70, 30));
  const hi = buildFrame(x, y, 1), lo = buildFrame(x, y, 0);
  const shadow = [{ pts: rectL(F, -39, 0, 7.5, 7), h: 150 }, { pts: rectL(F, 39, 0, 7.5, 7), h: 150 }];
  const edge = (r) => {
    if (r.night < 0.1) return;
    // glowing gold outline of the frame
    const c = r.ctx, P = (u, v, z) => { const p = F(u, v); return [r.X(p[0], p[1]), r.Y(p[0], p[1], z)]; };
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(255,200,90,${(0.75 * r.night).toFixed(3)})`;
    c.lineWidth = Math.max(0.8, 1.6 * r.zoom);
    c.beginPath();
    for (const pts of [[[-46.5, 7, 6], [-46.5, 7, 150], [46.5, 7, 150], [46.5, 7, 6]], [[-31.5, 7, 6], [-31.5, 7, 130], [31.5, 7, 130], [31.5, 7, 6]]]) {
      pts.forEach(([u, v, z], i) => { const [X, Y] = P(u, v, z); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    }
    c.stroke();
    c.globalCompositeOperation = 'source-over';
  };
  addWithIcon(app, lm, { x, y, shadow, bbox: hi.bbox(0.1), draw(r) { hi.draw(r); edge(r); } }, (r) => { lo.draw(r); edge(r); }, 1.5);
}

export function registerSZR(app) {
  museumOfTheFuture(app);
  emiratesTowers(app);
  dwtc(app);
  dubaiFrame(app);
}
