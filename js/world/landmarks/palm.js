// Palm Jumeirah, Bluewaters & Dubai Marina: Atlantis The Palm, Atlantis The Royal, The View at The Palm,
// Ain Dubai, Cayan Tower.
import { Mesh, frame, extrude, loftM, lathe, entry, add, addWithIcon, rectL, ellL, hsla, glowAt, onScreen,
  clamp, TAU, domeM, circle, tube, clearSite, hueToHex } from './util.js';
import { hash } from '../../core/shapes.js';

// ------------------------------------------------------------------------------------------------
// Atlantis The Palm
// ------------------------------------------------------------------------------------------------
function atlantisPalm(app) {
  const lm = entry(app, {
    id: 'atlantis-the-palm', lat: 25.1304, lon: 55.1171, zoom: 2.2, category: 'leisure',
    name: { en: 'Atlantis The Palm', ar: 'أتلانتس النخلة' },
    blurb: { en: 'The coral-pink resort at the apex of Palm Jumeirah’s crescent, with twin towers linked by the arched Royal Bridge Suite, a waterpark and a giant aquarium.',
      ar: 'منتجع بلون المرجان الوردي عند قمة هلال نخلة جميرا، ببرجين توأمين يربطهما جناح الجسر الملكي المقوّس، مع حديقة مائية وحوض أسماك عملاق.' },
    facts: [{ en: 'Opened in 2008', ar: 'افتُتح عام 2008' }],
  });
  const F = frame(lm.x, lm.y, -48);   // u along the crescent, v toward the trunk (front)
  clearSite(app, rectL(F, 0, 0, 280, 80));
  const coral = '#e8a48b', cream = '#f3dcc4';
  const win = (seed) => ({ floor: 3.6, seed, lit: 0.55, glass: '#7b5148', light: '#ffd49a', alpha: 0.35 });
  // central towers + arch (one mesh so its faces sort together)
  const m = new Mesh();
  for (const s of [-1, 1]) {
    const u = s * 34;
    extrude(m, rectL(F, u, 0, 17, 22), 0, 84, coral, { top: cream, win: win(10 + s) });
    extrude(m, rectL(F, u, 0, 14, 18), 84, 98, cream, { top: coral, glow: '#ffcc88', ga: 0.25 });
    extrude(m, rectL(F, u, 0, 9, 12), 98, 106, coral, { top: cream });
    const [cx, cy] = F(u, 0);
    domeM(m, cx, cy, 7, 106, 8, 12, '#d98b70', { glow: '#ffd28a', ga: 0.35 });
    lathe(m, cx, cy, [[0.6, 114], [0.2, 121]], 4, '#e0b060');
    for (const c of [-1, 1]) { // corner turrets
      const [tx, ty] = F(u + c * 14, 19);
      lathe(m, tx, ty, [[2.8, 84], [2.8, 100]], 8, cream, { top: false });
      domeM(m, tx, ty, 2.8, 100, 3.8, 8, '#d98b70');
    }
  }
  // the bridge (Royal Bridge Suite) across the top and the central arch frame
  extrude(m, rectL(F, 0, 0, 19, 14), 66, 84, cream, { top: coral, glow: '#ffd28a', ga: 0.45, win: win(5) });
  const arch = [];
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10); arch.push(F.p3(-17 * Math.cos(a), 15, 36 + 28 * Math.sin(a))); }
  for (let i = 0; i < arch.length - 1; i++) m.line(arch[i], arch[i + 1], '#f6e6d2', 3, { glow: '#ffe0a0', ga: 0.8 });
  const [cx0, cy0] = F(0, 0);
  domeM(m, cx0, cy0, 9, 84, 10, 14, '#d98b70', { glow: '#ffd28a', ga: 0.5 });
  lathe(m, cx0, cy0, [[0.6, 94], [0.2, 101]], 4, '#e0b060');
  m.light(F.p3(0, 15, 50), 34, '#ffcf80', 0.5);
  m.done();
  add(app, lm, { mesh: m, shadow: [{ pts: rectL(F, 0, 0, 52, 22), h: 100 }] });
  // the long curved wings, stepping down away from the centre; separate objects for depth sorting
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const u0 = 52 + k * 42, u1 = u0 + 44;
      const bend = (u) => Math.pow(u / 230, 2) * 60; // curves back along the crescent
      const h = 70 - k * 7;
      const pts = [F(s * u0, bend(u0) - 14), F(s * u1, bend(u1) - 14), F(s * u1, bend(u1) + 14), F(s * u0, bend(u0) + 14)];
      const w = new Mesh();
      extrude(w, pts, 0, h, coral, { top: cream, win: win(20 + k + s * 7), glow: '#ff9f8a', ga: 0.3 });
      extrude(w, [F(s * (u0 + 6), bend(u0) - 9), F(s * (u1 - 6), bend(u1) - 9), F(s * (u1 - 6), bend(u1) + 9), F(s * (u0 + 6), bend(u0) + 9)], h, h + 5, cream, { top: coral });
      w.done();
      add(app, lm, { mesh: w, shadow: [{ pts, h }] });
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Atlantis The Royal — stacked "Jenga" blocks
// ------------------------------------------------------------------------------------------------
function atlantisRoyal(app) {
  const lm = entry(app, {
    id: 'atlantis-the-royal', lat: 25.1385, lon: 55.1277, zoom: 2.4, category: 'leisure',
    name: { en: 'Atlantis The Royal', ar: 'أتلانتس ذا رويال' },
    blurb: { en: 'A resort of stacked, offset blocks on Palm Jumeirah’s crescent, joined by a sky bridge with an infinity pool.',
      ar: 'منتجع من كتل متراكبة ومتداخلة على هلال نخلة جميرا، يربط بينها جسر معلّق يضم مسبحاً لا متناهياً.' },
    facts: [{ en: 'Opened in 2023', ar: 'افتُتح عام 2023' }],
  });
  const F = frame(lm.x, lm.y, -30);
  clearSite(app, rectL(F, 0, 0, 160, 60));
  const shadows = [];
  for (const tu of [-55, 55]) {
    const m = new Mesh();
    let z = 0, layer = 0;
    const blk = (u, v, hu, hv, z0, h, top, i) => {
      m.layer = layer++;
      extrude(m, rectL(F, u, v, hu, hv), z0, z0 + h, '#f1f1ec', { top, capBias: 3000,
        win: { floor: 3.4, seed: 70 + i + tu, lit: 0.6, glass: '#7f9db0', light: '#ffe0b0', alpha: 0.4 }, glow: '#bfe4ff', ga: 0.08 });
    };
    blk(tu, 0, 30, 20, 0, 40, '#dfe3df', 0);
    z = 40;
    for (let i = 0; i < 9; i++) {
      const h = 14, rot = i % 2;
      const du = (hash(i, tu) - 0.5) * 34, dv = (hash(i, tu, 3) - 0.5) * 18;
      blk(tu + du, dv, rot ? 16 : 34, rot ? 30 : 14, z, h, hash(i, tu, 5) > 0.6 ? '#8fbf8a' : '#e4e7e4', i + 1);
      z += h;
    }
    m.done();
    shadows.push({ pts: rectL(F, tu, 0, 34, 24), h: z });
    add(app, lm, { mesh: m, x: F(tu, 0)[0], y: F(tu, 0)[1], shadow: [{ pts: rectL(F, tu, 0, 32, 22), h: z }] });
  }
  // the sky bridge with its infinity pool
  const b = new Mesh();
  extrude(b, rectL(F, 0, 0, 50, 13), 124, 136, '#e9eef1', { top: '#4fc3d9', topGlow: '#5fe0ff', ga: 0.7,
    win: { floor: 3.4, seed: 99, lit: 0.7, glass: '#7f9db0', light: '#ffe0b0', alpha: 0.4 } });
  b.light(F.p3(0, 0, 137), 40, '#6fe6ff', 0.6);
  b.done();
  const [bx, by] = F(0, 0);
  add(app, lm, { mesh: b, x: bx + 0.25, y: by + 0.25 });
}
function extrudeBlock(list, u, v, hu, hv, z, h, bridge = false) { list.push([u, v, hu, hv, z, h, bridge]); }

// ------------------------------------------------------------------------------------------------
// The View at The Palm (The Palm Tower)
// ------------------------------------------------------------------------------------------------
function theView(app) {
  const lm = entry(app, {
    id: 'the-view-palm', lat: 25.1131, lon: 55.1396, zoom: 1.8, category: 'leisure',
    name: { en: 'The View at The Palm', ar: 'ذا فيو في النخلة' },
    blurb: { en: 'An observation deck near the top of The Palm Tower, halfway along the trunk of Palm Jumeirah, with a 360° view over the fronds.',
      ar: 'منصة مشاهدة قرب قمة برج النخلة في منتصف جذع نخلة جميرا، تطل بزاوية 360 درجة على سعف الجزيرة.' },
    facts: [{ en: 'Observation deck on level 52', ar: 'منصة المشاهدة في الطابق 52' }],
  });
  const F = frame(lm.x, lm.y, -48);
  clearSite(app, rectL(F, 0, 0, 60, 60));
  const m = new Mesh();
  const plan = (s, z) => ({ z, pts: ellL(F, 0, 0, 30 * s, 20 * s, 16) });
  m.layer = 0;
  extrude(m, rectL(F, 0, 0, 70, 50), 0, 18, '#e5dccd', { top: '#d6cdbd', glow: '#ffd59a', ga: 0.25 }); // Nakheel Mall podium
  m.layer = 1;
  loftM(m, [plan(1, 18), plan(1, 200), plan(0.94, 222), plan(0.8, 234), plan(0.5, 240)], '#a9c2d2', { top: '#d8e3ea',
    win: { floor: 4, seed: 404, lit: 0.5, glass: '#3e5a70', light: '#fff0d0', alpha: 0.4 } });
  m.layer = 2;
  m.light(F.p3(0, 0, 236), 34, '#a8e0ff', 0.6);
  m.done();
  const fx = (f, r) => (f.k === 0 && f.z > 200 && f.nz < 0.8 && r.night > 0.05 ? hsla(190 + 60 * Math.sin(r.t * 0.4), 80, 60, 0.6 * r.night) : null);
  add(app, lm, { mesh: m, fx, shadow: [{ pts: ellL(F, 0, 0, 30, 20, 8), h: 240 }] });
}

// ------------------------------------------------------------------------------------------------
// Ain Dubai — 250 m observation wheel on Bluewaters
// ------------------------------------------------------------------------------------------------
const AIN = { R: 115, ZC: 132, AXIS: -55, CABINS: 48 };
function buildAinFrame(x, y, q, side) {
  const F = frame(x, y, AIN.AXIS); // u = wheel plane horizontal, v = axle direction (toward viewer for +)
  const m = new Mesh();
  // legs on this side (side = -1 back, +1 front), meeting at the hub
  const hub = F.p3(0, side * 12, AIN.ZC);
  for (const su of [-1, 1]) {
    const base = F.p3(su * 78, side * 52, 0);
    if (q) tube(m, [base, hub], 3.2, 6, '#e9ecef', { glow: '#aebfff', ga: 0.25 });
    else m.line(base, hub, '#e9ecef', 4);
  }
  m.done();
  return m;
}
function buildAinWheel(x, y, q) {
  const F = frame(x, y, AIN.AXIS);
  const m = new Mesh();
  const N = q ? 48 : 24;
  for (const v of [-9, 9]) {
    const path = [];
    for (let i = 0; i < N; i++) { const a = (i / N) * TAU; path.push(F.p3(Math.cos(a) * AIN.R, v, AIN.ZC + Math.sin(a) * AIN.R)); }
    if (q) tube(m, path, 3.6, 5, '#f1f3f5', { closed: true, glow: '#ffffff', ga: 0.15 });
    else for (let i = 0; i < N; i++) m.line(path[i], path[(i + 1) % N], '#f1f3f5', 3.5, { tag: i, data: i / N });
    // cable spokes
    const S = q ? 32 : 16;
    for (let i = 0; i < S; i++) {
      const a = (i / S) * TAU;
      m.line(F.p3(0, v * 2.2, AIN.ZC), F.p3(Math.cos(a) * AIN.R, v, AIN.ZC + Math.sin(a) * AIN.R), 'rgba(235,240,245,0.75)', 0.8,
        { glow: '#bfe2ff', ga: 0.35 });
    }
  }
  // hub
  const [hx, hy] = F(0, 0);
  m.face(ellL(F, 0, 0, 1, 1, 4).map((p) => [p[0], p[1], AIN.ZC]), '#ffffff', { two: true }); // tiny, keeps bbox
  if (q) tube(m, [F.p3(0, -16, AIN.ZC), F.p3(0, 16, AIN.ZC)], 7, 10, '#dfe3e8');
  m.light([hx, hy, AIN.ZC], 20, '#ffffff', 0.6);
  m.done();
  return { m, F };
}
function ainDubai(app) {
  const lm = entry(app, {
    id: 'ain-dubai', lat: 25.0794, lon: 55.1203, zoom: 2.0, category: 'leisure',
    name: { en: 'Ain Dubai', ar: 'عين دبي' },
    blurb: { en: 'The world’s tallest observation wheel, on Bluewaters Island off JBR, lit with LED shows after dark.',
      ar: 'أطول عجلة مراقبة في العالم، على جزيرة بلوواترز قبالة جميرا بيتش ريزيدنس، تتلألأ بعروض ضوئية بعد الغروب.' },
    facts: [{ en: 'Height: 250 m', ar: 'الارتفاع: 250 متراً' }, { en: 'Opened in October 2021', ar: 'افتُتحت في أكتوبر 2021' }],
  });
  const { x, y } = lm;
  clearSite(app, ellL(frame(x, y, AIN.AXIS), 0, 0, 130, 70, 10));
  const back = [buildAinFrame(x, y, 1, -1), buildAinFrame(x, y, 0, -1)];
  const front = [buildAinFrame(x, y, 1, 1), buildAinFrame(x, y, 0, 1)];
  const hi = buildAinWheel(x, y, 1), lo = buildAinWheel(x, y, 0);
  const F = hi.F;
  const cab = [];
  for (let i = 0; i < AIN.CABINS; i++) cab.push([0, 0, 0]);
  const rimFx = (r) => {
    if (r.night < 0.05) return null;
    const t = r.t;
    return (f) => {
      if (f.k === 2) return null;
      if (f.k === 1 && f.w < 1) return `rgba(190,225,255,${(0.35 * r.night).toFixed(3)})`;
      // rim faces / lines: chasing rainbow around the wheel
      if (f.data == null) return null;
      const a = f.k === 0 ? f.data / 48 : f.data;
      const h = (a * 720 - t * 60) % 360;
      return hsla(h, 90, 60, 0.85 * r.night);
    };
  };
  const draw = (r, q) => {
    const rot = (r.t * TAU) / 300; // one revolution every 5 minutes (sped up for the map)
    (q ? back[0] : back[1]).draw(r);
    const W = q ? hi.m : lo.m;
    W.draw(r, rimFx(r));
    // cabins
    const c = r.ctx;
    const sz = Math.max(0.8, 2.3 * r.zoom);
    const night = r.night;
    c.fillStyle = night > 0.2 ? r.L.emit('#e8f6ff', 0.95) : r.L.shade('#f5f7f9', 0.4, 0.6, 0.2);
    const n = r.zoom < 0.25 ? 16 : AIN.CABINS;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const p = F.p3(Math.cos(a) * (AIN.R + 5), 0, AIN.ZC + Math.sin(a) * (AIN.R + 5));
      const X = r.X(p[0], p[1]), Y = r.Y(p[0], p[1], p[2]);
      c.moveTo(X + sz, Y); c.ellipse(X, Y, sz, sz * 0.75, 0, 0, TAU);
    }
    c.fill();
    (q ? front[0] : front[1]).draw(r);
  };
  const bb = hi.m.bbox(0.4);
  addWithIcon(app, lm, { x, y, bbox: { ...bb, x0: x - 1.1, y0: y - 1.1, x1: x + 1.1, y1: y + 1.1 },
    shadow: [{ pts: ellL(F, 0, 0, AIN.R, 6, 12).map((p) => p), h: 30 }, { pts: [F(-6, -4), F(6, -4), F(6, 4), F(-6, 4)], h: 245 }],
    draw: (r) => draw(r, r.zoom > 0.45) }, (r) => draw(r, false), 1.3);
}

// ------------------------------------------------------------------------------------------------
// Cayan Tower — 306 m, twisting 90°
// ------------------------------------------------------------------------------------------------
function cayan(app) {
  const lm = entry(app, {
    id: 'cayan-tower', lat: 25.0888, lon: 55.1407, zoom: 1.9, category: 'icon',
    name: { en: 'Cayan Tower', ar: 'برج كيان' },
    blurb: { en: 'A residential skyscraper in Dubai Marina whose floor plates rotate step by step, twisting the tower through 90 degrees.',
      ar: 'برج سكني في دبي مارينا تدور طوابقه تدريجياً لتلتف الواجهة بزاوية 90 درجة من القاعدة إلى القمة.' },
    facts: [{ en: 'Height: 306 m', ar: 'الارتفاع: 306 أمتار' }, { en: 'Twists 90° from base to top', ar: 'يلتف بزاوية 90 درجة من القاعدة إلى القمة' }],
  });
  const { x, y } = lm;
  clearSite(app, ellL(frame(x, y), 0, 0, 40, 40, 8));
  const build = (q) => {
    const m = new Mesh();
    const N = q ? 34 : 10, H = 306;
    const rings = [];
    for (let i = 0; i <= N; i++) {
      const z = (i / N) * H;
      const rot = (i / N) * 90;
      const Fz = frame(x, y, rot + 10);
      // rounded square, 12 points
      const pts = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU + Math.PI / 12;
        const c = Math.cos(a), s = Math.sin(a);
        const rr = 24 / Math.pow(Math.pow(Math.abs(c), 4) + Math.pow(Math.abs(s), 4), 0.25);
        pts.push(Fz(c * rr, s * rr));
      }
      rings.push({ z, pts });
    }
    loftM(m, rings, '#ebe9e3', { top: '#cfd2d4', win: q ? { floor: 3.6, seed: 61, lit: 0.55, glass: '#4f6272', light: '#ffeacb', alpha: 0.45 } : null });
    for (const f of m.items) if (f.k === 0 && f.nz < 0.5 && f.tag % 3 === 1) { f.color = '#71828f'; if (f.win) f.win = { ...f.win, glass: '#2f3e4a' }; }
    m.light([x, y, H + 2], 18, '#ffffff', 0.5);
    return m.done();
  };
  const hi = build(1), lo = build(0);
  const fx = (f, r) => {
    if (r.night < 0.05 || f.k !== 0 || f.nz > 0.8) return null;
    // white LED lines spiralling up the corners
    return f.tag % 3 === 0 ? `rgba(220,240,255,${(0.45 * r.night).toFixed(3)})` : null;
  };
  add(app, lm, { x, y, bbox: hi.bbox(0.05), shadow: [{ pts: ellL(frame(x, y), 0, 0, 24, 24, 8), h: 306 }],
    draw: (r) => (r.zoom > 0.4 ? hi : lo).draw(r, fx) });
}

export function registerPalm(app) {
  atlantisPalm(app);
  atlantisRoyal(app);
  theView(app);
  ainDubai(app);
  cayan(app);
}
