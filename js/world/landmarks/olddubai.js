// Old Dubai & the Creek: Al Fahidi Fort (Dubai Museum) with a dhow, Gold & Spice Souks with the Deira abra
// station, Al Shindagha heritage district, QE2 at Mina Rashid, Deira Clocktower, Dubai Creek Golf & Yacht Club.
import { Mesh, frame, extrude, loftM, lathe, entry, add, rectL, ellL, hsla, glowAt, fillPoly, onScreen, clamp, TAU,
  domeM, circle, tube, clearSite, boxM, flatM } from './util.js';
import { hash, palm } from '../../core/shapes.js';
import { CREEK } from '../../data/geo.js';

// --- creek helper: nearest bank point on the side of a given point ---
function creekBank(app, lat, lon, inset = 0) {
  const P = app.geo.toWorld(lat, lon);
  const C = CREEK.map(([la, lo, w]) => { const [x, y] = app.geo.toWorld(la, lo); return [x, y, w / 100]; });
  let best = null;
  for (let i = 0; i < C.length - 1; i++) {
    const a = C[i], b = C[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = clamp(((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / L2, 0, 1);
    const qx = a[0] + dx * t, qy = a[1] + dy * t, d = Math.hypot(P[0] - qx, P[1] - qy);
    if (!best || d < best.d) {
      const L = Math.sqrt(L2), tx = dx / L, ty = dy / L;
      let nx = -ty, ny = tx;
      if (nx * (P[0] - qx) + ny * (P[1] - qy) < 0) { nx = -nx; ny = -ny; }
      const w = a[2] + (b[2] - a[2]) * t;
      best = { d, q: [qx, qy], t: [tx, ty], n: [nx, ny], w, bank: [qx + nx * (w / 2 - inset), qy + ny * (w / 2 - inset)] };
    }
  }
  best.deg = (Math.atan2(best.t[1], best.t[0]) * 180) / Math.PI;
  return best;
}

// --- wooden boats ---
function drawAbra(r, x, y, deg, t, seed, len = 10) {
  // traditional abra: low wooden hull with a flat canopy on posts
  const F = frame(x, y, deg);
  const bob = Math.sin(t * 1.7 + seed) * 0.25;
  const c = r.ctx;
  const P = (u, v, z) => { const p = F(u, v); return [r.X(p[0], p[1]), r.Y(p[0], p[1], z + bob)]; };
  const hl = len / 2, hw = 1.6;
  const poly = (pts, col) => { c.beginPath(); pts.forEach(([u, v, z], i) => { const [X, Y] = P(u, v, z); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); c.fillStyle = col; c.fill(); };
  poly([[-hl, -hw, 0], [hl * 0.7, -hw, 0], [hl, 0, 0.6], [hl * 0.7, hw, 0], [-hl, hw, 0], [-hl, hw, 1.2], [hl * 0.7, hw, 1.2], [hl + 0.6, 0, 1.6], [hl * 0.7, -hw, 1.2], [-hl, -hw, 1.2]], r.L.shade('#8a5a32', 0.4, 0.6, 0.2));
  poly([[-hl, -hw, 1.2], [hl * 0.7, -hw, 1.2], [hl + 0.6, 0, 1.6], [hl * 0.7, hw, 1.2], [-hl, hw, 1.2]], r.L.shade('#a8784a', 0, 0, 1));
  if (r.zoom > 1.2) poly([[-hl * 0.8, -hw * 1.05, 3.4], [hl * 0.5, -hw * 1.05, 3.4], [hl * 0.5, hw * 1.05, 3.4], [-hl * 0.8, hw * 1.05, 3.4]], r.L.shade(seed % 2 ? '#c9b48a' : '#b9483a', 0, 0, 1));
  if (r.night > 0.2) glowAt(r, ...F(0, 0), 3.5, 6, '#ffcf7a', 0.6 * r.night);
}
function drawDhow(r, x, y, deg, z0 = 0, len = 22) {
  const F = frame(x, y, deg);
  const c = r.ctx;
  const P = (u, v, z) => { const p = F(u, v); return [r.X(p[0], p[1]), r.Y(p[0], p[1], z + z0)]; };
  const hl = len / 2, hw = len * 0.16;
  const poly = (pts, col) => { c.beginPath(); pts.forEach(([u, v, z], i) => { const [X, Y] = P(u, v, z); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); c.fillStyle = col; c.fill(); };
  // hull: raised stern, long raking bow
  poly([[-hl, -hw, 3.5], [hl * 0.6, -hw, 2.2], [hl + 3, 0, 4.2], [hl * 0.6, hw, 2.2], [-hl, hw, 3.5], [-hl, hw, 0.5], [hl * 0.4, hw * 0.8, 0], [hl * 0.4, -hw * 0.8, 0], [-hl, -hw, 0.5]], r.L.shade('#7a4a26', 0.4, 0.7, 0.1));
  poly([[-hl, -hw, 3.5], [hl * 0.6, -hw, 2.2], [hl + 3, 0, 4.2], [hl * 0.6, hw, 2.2], [-hl, hw, 3.5]], r.L.shade('#a77a4c', 0, 0, 1));
  // mast + furled lateen yard
  const m0 = P(hl * 0.1, 0, 2.5), m1 = P(hl * 0.1, 0, 15), y0 = P(-hl * 0.6, 0, 9), y1 = P(hl * 0.9, 0, 18);
  c.strokeStyle = r.L.shade('#5e3d22', 1, 0, 0); c.lineWidth = Math.max(0.6, 0.6 * r.zoom);
  c.beginPath(); c.moveTo(m0[0], m0[1]); c.lineTo(m1[0], m1[1]); c.moveTo(y0[0], y0[1]); c.lineTo(y1[0], y1[1]); c.stroke();
}

// ------------------------------------------------------------------------------------------------
// Al Fahidi Fort / Dubai Museum
// ------------------------------------------------------------------------------------------------
function alFahidiFort(app) {
  const lm = entry(app, {
    id: 'al-fahidi-fort', lat: 25.2633, lon: 55.2972, zoom: 5.5, category: 'culture',
    name: { en: 'Al Fahidi Fort (Dubai Museum)', ar: 'حصن الفهيدي (متحف دبي)' },
    blurb: { en: 'Built in 1787, Al Fahidi Fort is the oldest existing building in Dubai and houses the Dubai Museum; a traditional wooden dhow stands outside.',
      ar: 'بُني حصن الفهيدي عام 1787، وهو أقدم مبنى قائم في دبي ويضم متحف دبي، ويقف أمامه مركب شراعي خشبي تقليدي.' },
    facts: [{ en: 'Built in 1787', ar: 'بُني عام 1787' }],
  });
  const F = frame(lm.x, lm.y, -45);
  clearSite(app, rectL(F, 0, 10, 45, 50));
  const m = new Mesh();
  const wall = '#d6c09a';
  const W = 22, T = 2.2, H = 8;
  // four curtain walls around the courtyard
  extrude(m, rectL(F, 0, -W, W, T), 0, H, wall, { top: '#cdb68f', glow: '#ffcf8a', ga: 0.5 });
  extrude(m, rectL(F, -W, 0, T, W), 0, H, wall, { top: '#cdb68f', glow: '#ffcf8a', ga: 0.5 });
  extrude(m, rectL(F, W, 0, T, W), 0, H, wall, { top: '#cdb68f', glow: '#ffcf8a', ga: 0.5 });
  extrude(m, rectL(F, 0, W, W, T), 0, H, wall, { top: '#cdb68f', glow: '#ffcf8a', ga: 0.5 });
  // gate
  extrude(m, rectL(F, 0, W + 1.5, 4, 1.2), 0, 4.5, '#6b4a2c', { top: '#5a3e25' });
  // corner towers: a tall round tower and a square tower, plus a smaller round one
  const [rx, ry] = F(W, W);
  lathe(m, rx, ry, [[6, 0], [5.5, 15], [6.2, 15.5], [6.2, 17]], 14, wall, { top: '#cdb68f', glow: '#ffcf8a', ga: 0.55 });
  extrude(m, rectL(F, -W, -W, 5.5, 5.5), 0, 14, wall, { top: '#cdb68f', glow: '#ffcf8a', ga: 0.55 });
  const [sx, sy] = F(W, -W);
  lathe(m, sx, sy, [[4.5, 0], [4.2, 11], [4.8, 11.5], [4.8, 12.5]], 12, wall, { top: '#cdb68f', glow: '#ffcf8a', ga: 0.5 });
  // wooden poles sticking out of the towers (characteristic detail)
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI; m.line(F.p3(W + Math.cos(a) * 5.6, W + Math.sin(a) * 5.6, 12), F.p3(W + Math.cos(a) * 7.6, W + Math.sin(a) * 7.6, 12), '#6b4a2c', 0.8); }
  // courtyard barasti hut
  extrude(m, rectL(F, -6, -6, 5, 4), 0, 4, '#b8925a', { top: '#a98250' });
  m.done();
  add(app, lm, { mesh: m, shadow: [{ pts: rectL(F, 0, 0, W + T, W + T), h: 8 }, { pts: ellL(F, W, W, 6, 6, 6), h: 17 }] });
  // the dhow on display in front of the fort
  const [dx, dy] = F(10, W + 18);
  add(app, lm, { x: dx, y: dy, bbox: { x0: dx - 0.2, y0: dy - 0.2, x1: dx + 0.2, y1: dy + 0.2, h: 22 }, minZoom: 0.8,
    draw: (r) => drawDhow(r, dx, dy, -45 + 180, 1.2, 20) });
}

// ------------------------------------------------------------------------------------------------
// Gold & Spice Souks (Deira) + Deira Old Souk abra station
// ------------------------------------------------------------------------------------------------
function souks(app) {
  const lm = entry(app, {
    id: 'gold-souk', lat: 25.2697, lon: 55.2963, zoom: 3.2, category: 'culture',
    name: { en: 'Gold & Spice Souks', ar: 'سوق الذهب وسوق التوابل' },
    blurb: { en: 'Deira’s traditional covered markets: lanes of jewellers in the Gold Souk and sacks of spices, herbs and frankincense near the creek, where wooden abras cross to Bur Dubai.',
      ar: 'أسواق ديرة التقليدية المسقوفة: ممرات محلات المجوهرات في سوق الذهب، وأكياس التوابل والأعشاب واللبان قرب الخور حيث تعبر العبرات الخشبية إلى بر دبي.' },
  });
  const bank = creekBank(app, 25.2678, 55.2972);
  const F = frame(lm.x, lm.y, bank.deg);
  clearSite(app, rectL(F, 0, 0, 170, 110), 2.5);
  // blocks along lanes: u along the creek, v away from it. Covered lanes between rows.
  const rows = [-70, -25, 20, 65];
  const roofs = [];
  let seed = 0;
  for (const v of rows) {
    const m = new Mesh();
    for (let u = -150; u < 150; u += 26) {
      seed++;
      const w = 10 + hash(seed, 1) * 3, d = 15, h = 7 + Math.floor(hash(seed, 2) * 3) * 3.5;
      const pts = rectL(F, u, v, w, d);
      extrude(m, pts, 0, h, hash(seed, 3) > 0.5 ? '#dcc9a6' : '#e2d3b6', { top: '#cbb894',
        win: { floor: 3.5, seed, lit: 0.8, glass: '#7a5a3a', light: '#ffc46a', alpha: 0.3 }, glow: '#ffb860', ga: 0.32 });
      if (hash(seed, 4) > 0.6) { const [wx, wy] = F(u + w * 0.4, v - d * 0.4); boxM(m, wx - 0.02, wy - 0.02, h, 0.04, 0.04, 7, '#d6c29c', { top: '#bfa77e', glow: '#ffcf7a', ga: 0.4 }); }
    }
    m.done();
    add(app, lm, { mesh: m, shadow: [{ pts: rectL(F, 0, v, 160, 15), h: 10 }] });
    // covered lane (wooden lattice roof) just south of this row
    roofs.push(v + 22.5);
  }
  const rm = new Mesh();
  for (const v of roofs.slice(0, 3)) {
    const N = 6;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI, a1 = ((i + 1) / N) * Math.PI;
      const P = (u, a) => F.p3(u, v - 6.5 * Math.cos(a), 10.5 + 2.5 * Math.sin(a));
      rm.face([P(-150, a0), P(150, a0), P(150, a1), P(-150, a1)], '#9b7048', { out: F.p3(0, v, 0), glow: '#ffb050', ga: 0.45 });
    }
  }
  rm.done();
  add(app, lm, { mesh: rm, shadow: [] });
  // the abra station: boats moored along the Deira bank
  const sb = creekBank(app, 25.2672, 55.2968, 0.05);
  const boats = [];
  for (let i = 0; i < 9; i++) {
    const s = (i - 4) * 0.075;
    const along = [sb.bank[0] + sb.t[0] * s - sb.n[0] * (0.07 + (i % 2) * 0.05), sb.bank[1] + sb.t[1] * s - sb.n[1] * (0.07 + (i % 2) * 0.05)];
    boats.push(along);
  }
  const abraLm = lm;
  const bx = sb.bank[0], by = sb.bank[1];
  add(app, abraLm, { x: bx, y: by, depth: bx + by - 0.3, bbox: { x0: bx - 0.6, y0: by - 0.6, x1: bx + 0.6, y1: by + 0.6, h: 6 }, minZoom: 0.6,
    draw(r) {
      // jetty
      const j0 = [bx - sb.t[0] * 0.4, by - sb.t[1] * 0.4], j1 = [bx + sb.t[0] * 0.4, by + sb.t[1] * 0.4];
      const c = r.ctx;
      c.beginPath(); c.moveTo(r.X(j0[0], j0[1]), r.Y(j0[0], j0[1], 1)); c.lineTo(r.X(j1[0], j1[1]), r.Y(j1[0], j1[1], 1));
      c.strokeStyle = r.L.shade('#9c7a55', 0, 0, 1); c.lineWidth = Math.max(1, 4 * r.zoom); c.stroke();
      boats.forEach((p, i) => drawAbra(r, p[0], p[1], bank.deg + 90 + (hash(i, 9) - 0.5) * 20, r.t, i));
    } });
}

// ------------------------------------------------------------------------------------------------
// Al Shindagha heritage district
// ------------------------------------------------------------------------------------------------
function shindagha(app) {
  const lm = entry(app, {
    id: 'al-shindagha', lat: 25.2687, lon: 55.2876, zoom: 3.4, category: 'culture',
    name: { en: 'Al Shindagha Historic District', ar: 'حي الشندغة التاريخي' },
    blurb: { en: 'The historic neighbourhood at the mouth of Dubai Creek, with restored coral-stone courtyard houses and wind towers, including the house of Sheikh Saeed Al Maktoum, now part of Al Shindagha Museum.',
      ar: 'الحي التاريخي عند مصب خور دبي، بمنازله المرممة المبنية من الحجر المرجاني ذات الأفنية وأبراج الرياح، ومنها بيت الشيخ سعيد آل مكتوم، وهو اليوم جزء من متحف الشندغة.' },
  });
  const bank = creekBank(app, lm.lat, lm.lon);
  const F = frame(lm.x, lm.y, bank.deg);
  clearSite(app, rectL(F, 0, 0, 160, 90), 2.5);
  let seed = 100;
  for (let row = 0; row < 3; row++) {
    const m = new Mesh();
    const v = -55 + row * 45;
    for (let u = -140; u < 140; u += 34) {
      seed++;
      const w = 12 + hash(seed, 1) * 4, d = 14 + hash(seed, 2) * 4;
      const big = row === 1 && u > -10 && u < 30; // Sheikh Saeed Al Maktoum House
      const hw = big ? 22 : w, hd = big ? 20 : d, h = big ? 9 : 7;
      // courtyard house: four wings around a yard
      const t = 4;
      extrude(m, rectL(F, u, v - hd + t, hw, t), 0, h, '#dcc8a2', { top: '#cdb58c', glow: '#ffc370', ga: 0.45 });
      extrude(m, rectL(F, u - hw + t, v, t, hd - 2 * t), 0, h, '#dcc8a2', { top: '#cdb58c', glow: '#ffc370', ga: 0.45 });
      extrude(m, rectL(F, u + hw - t, v, t, hd - 2 * t), 0, h, '#dcc8a2', { top: '#cdb58c', glow: '#ffc370', ga: 0.45 });
      extrude(m, rectL(F, u, v + hd - t, hw, t), 0, h, '#e0cca8', { top: '#cdb58c', glow: '#ffc370', ga: 0.45,
        win: { floor: 3.5, seed, lit: 0.9, glass: '#6f5234', light: '#ffc46a', alpha: 0.35 } });
      // wind towers
      const nt = big ? 4 : 1 + (seed % 2);
      for (let k = 0; k < nt; k++) {
        const [wx, wy] = F(u - hw + 4 + k * ((2 * hw - 8) / Math.max(1, nt - 1)), v - hd + 4);
        boxM(m, wx - 0.025, wy - 0.025, h, 0.05, 0.05, 8, '#e3d1ad', { top: '#cbb48c', glow: '#ffcf7a', ga: 0.45 });
      }
    }
    m.done();
    add(app, lm, { mesh: m, shadow: [{ pts: rectL(F, 0, v, 150, 20), h: 9 }] });
  }
  // lanterns along the creek promenade
  const lights = [];
  for (let i = 0; i < 14; i++) lights.push(F(-140 + i * 21, 80));
  add(app, lm, { x: lm.x + 0.5, y: lm.y + 0.5, bbox: { x0: lm.x - 1.8, y0: lm.y - 1.8, x1: lm.x + 1.8, y1: lm.y + 1.8, h: 5 }, minZoom: 0.5,
    draw(r) { if (r.night > 0.1) for (const p of lights) glowAt(r, p[0], p[1], 4, 10, '#ffc86e', r.night * 0.8); } });
}

// ------------------------------------------------------------------------------------------------
// QE2 — ocean liner moored at Mina Rashid
// ------------------------------------------------------------------------------------------------
function qe2(app) {
  const lm = entry(app, {
    id: 'qe2', lat: 25.2615, lon: 55.2770, zoom: 2.6, category: 'culture',
    name: { en: 'Queen Elizabeth 2 (QE2)', ar: 'الملكة إليزابيث 2' },
    blurb: { en: 'The legendary Cunard ocean liner, launched in 1967, now permanently moored at Mina Rashid as a floating hotel.',
      ar: 'سفينة الركاب الأسطورية التابعة لشركة كونارد، أُطلقت عام 1967، وترسو اليوم بشكل دائم في ميناء راشد كفندق عائم.' },
    facts: [{ en: 'Launched in 1967', ar: 'أُطلقت عام 1967' }, { en: 'Length: about 294 m', ar: 'الطول: نحو 294 متراً' }],
  });
  const F = frame(lm.x, lm.y, -30);
  clearSite(app, rectL(F, 0, 0, 160, 25));
  const L = 147, B = 16;
  const hull = [];
  const N = 16;
  for (let i = 0; i <= N; i++) { // starboard side stern→bow
    const s = i / N, u = -L + s * 2 * L;
    const half = s > 0.75 ? B * Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.75) / 0.25, 2))) : s < 0.06 ? B * (0.75 + 0.25 * s / 0.06) : B;
    hull.push([u, half]);
  }
  const port = hull.slice().reverse().map(([u, h]) => [u, -h]);
  const outline = hull.map(([u, h]) => F(u, h)).concat(port.map(([u, h]) => F(u, h)));
  const m = new Mesh();
  m.layer = 0;
  extrude(m, outline, 0, 14, '#2f3438', { top: '#9a7b58', win: { floor: 3, seed: 2, lit: 0.85, glass: '#d9dde0', light: '#ffe7b8', alpha: 0.18, band: 0.15 } });
  // white superstructure decks (stepped)
  m.layer = 1;
  const decks = [[-118, 90, 13, 14, 20], [-100, 75, 12, 20, 26], [-80, 55, 10, 26, 31], [-60, 30, 8, 31, 35]];
  for (const [u0, u1, hb, z0, z1] of decks) {
    extrude(m, [F(u0, -hb), F(u1, -hb), F(u1 + 6, 0), F(u1, hb), F(u0, hb)], z0, z1, '#f4f4f2', { top: '#dedfdd', capBias: 2000,
      win: { floor: 2.8, seed: u0, lit: 0.8, glass: '#4f5a63', light: '#fff0c8', alpha: 0.45 } });
    m.layer++;
  }
  // mast + funnel
  m.line(F.p3(40, 0, 35), F.p3(36, 0, 52), '#e9e9e9', 1.4);
  const [fx, fy] = F(-35, 0);
  const fun = ellL(F, -35, 0, 9, 5.5, 10);
  extrude(m, fun, 35, 47, '#e7e7e5', { top: '#c41e24' });
  extrude(m, fun, 47, 53, '#c41e24', { top: '#1a1a1a', glow: '#ff7060', ga: 0.25 });
  extrude(m, ellL(F, -35, 0, 9.2, 5.7, 10), 53, 56, '#1a1a1a', { top: '#111111' });
  m.light([fx, fy, 56], 14, '#ffe0c0', 0.4);
  m.done();
  // deck lights
  const lights = [];
  for (let i = 0; i < 18; i++) lights.push(F(-120 + i * 13, (i % 2 ? 1 : -1) * 10));
  add(app, lm, { mesh: m, shadow: [{ pts: outline, h: 18 }, { pts: rectL(F, -40, 0, 50, 10), h: 35 }],
    draw(r) { m.draw(r); if (r.night > 0.2 && r.zoom > 0.6) lights.forEach((p) => glowAt(r, p[0], p[1], 32, 5, '#fff1c8', 0.5 * r.night)); } });
}

// ------------------------------------------------------------------------------------------------
// Deira Clocktower roundabout
// ------------------------------------------------------------------------------------------------
function clocktower(app) {
  const lm = entry(app, {
    id: 'deira-clocktower', lat: 25.2581, lon: 55.3200, zoom: 6, category: 'culture',
    name: { en: 'Deira Clocktower', ar: 'برج الساعة في ديرة' },
    blurb: { en: 'One of Dubai’s earliest modern landmarks, built in the 1960s at a roundabout on the road from the old city to the airport.',
      ar: 'أحد أقدم المعالم الحديثة في دبي، شُيّد في ستينيات القرن الماضي عند دوّار على الطريق من المدينة القديمة إلى المطار.' },
  });
  const { x, y } = lm;
  clearSite(app, ellL(frame(x, y), 0, 0, 55, 55, 10));
  const F = frame(x, y, -45);
  const m = new Mesh();
  m.layer = 0;
  extrude(m, ellL(F, 0, 0, 48, 48, 24), 0, 0.6, '#8fbf6a', { top: '#8fbf6a' });
  extrude(m, ellL(F, 0, 0, 14, 14, 18), 0.6, 1.4, '#e6e1d6', { top: '#4fb0cc', topGlow: '#5fd0ff', ga: 0.5 });
  m.layer = 1;
  // four legs leaning inward to the clock head
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4;
    tube(m, [F.p3(Math.cos(a) * 8, Math.sin(a) * 8, 1.4), F.p3(Math.cos(a) * 2.6, Math.sin(a) * 2.6, 19)], 0.9, 5, '#efece6', { glow: '#ffe8c0', ga: 0.35 });
  }
  m.layer = 2;
  extrude(m, rectL(F, 0, 0, 3.4, 3.4), 19, 25, '#f2efe8', { top: '#e3dfd6', glow: '#fff3d8', ga: 0.5 });
  lathe(m, ...F(0, 0), [[2.2, 25], [0.2, 29]], 4, '#e8e4dc', { rot: Math.PI / 4 });
  m.done();
  add(app, lm, { mesh: m, shadow: [{ pts: rectL(F, 0, 0, 3.4, 3.4), h: 25 }],
    draw(r) {
      m.draw(r);
      // clock faces on the two visible sides
      if (r.zoom < 2) return;
      const c = r.ctx;
      for (const [u, v] of [[3.5, 0], [0, 3.5]]) {
        const p = F(u, v);
        const X = r.X(p[0], p[1]), Y = r.Y(p[0], p[1], 22);
        const k = 0.45 * r.zoom;
        c.beginPath(); c.ellipse(X, Y, 2.1 * k, 2.5 * k, 0, 0, TAU);
        c.fillStyle = r.night > 0.2 ? r.L.emit('#fff6dc', 1) : '#ffffff'; c.fill();
        c.strokeStyle = '#333'; c.lineWidth = Math.max(0.5, 0.25 * r.zoom);
        c.beginPath(); c.moveTo(X, Y); c.lineTo(X, Y - 1.8 * k); c.moveTo(X, Y); c.lineTo(X + 1.2 * k, Y + 0.3 * k); c.stroke();
      }
    } });
}

// ------------------------------------------------------------------------------------------------
// Dubai Creek Golf & Yacht Club
// ------------------------------------------------------------------------------------------------
function sailRoof(m, cx, cy, F0, u, v, r0, h, z0) {
  // a cone with a tall pointed tip, slightly leaning: dhow-sail / tent-like white roof
  const sides = 10;
  const base = ellL(F0, u, v, r0, r0, sides);
  const tip = F0(u + r0 * 0.25, v);
  for (let k = 0; k < sides; k++) {
    const p = base[k], q = base[(k + 1) % sides];
    m.face([[p[0], p[1], z0], [q[0], q[1], z0], [tip[0], tip[1], z0 + h]], '#fbfbfa', { out: [cx, cy, z0], glow: '#eaf4ff', ga: 0.45 });
  }
}
function creekGolf(app) {
  const lm = entry(app, {
    id: 'dubai-creek-golf', lat: 25.2421, lon: 55.3355, zoom: 3.4, category: 'leisure',
    name: { en: 'Dubai Creek Golf & Yacht Club', ar: 'نادي خور دبي للجولف واليخوت' },
    blurb: { en: 'A creekside golf and marina club whose clubhouse roof of white peaks recalls the sails of traditional dhows.',
      ar: 'نادٍ للجولف ومرسى لليخوت على ضفاف الخور، يحاكي سقف مبناه بقممه البيضاء أشرعة المراكب التقليدية.' },
  });
  const F = frame(lm.x, lm.y, -40);
  clearSite(app, rectL(F, 0, 0, 120, 120), 3);
  // fairways (underlay)
  const fair = ellL(F, -60, 150, 230, 120, 20);
  app.scene.underlays.push((r) => {
    if (!onScreen(r, lm.x - 4, lm.y - 4, lm.x + 4, lm.y + 4)) return;
    fillPoly(r, fair, 0, r.L.shade('#8cc46a', 0, 0, 1));
  });
  const m = new Mesh();
  m.layer = 0;
  extrude(m, ellL(F, 0, 0, 34, 26, 16), 0, 8, '#efece5', { top: '#e2ddd3', win: { floor: 4, seed: 3, lit: 0.8, glass: '#6d8fa3', light: '#ffe2ac', alpha: 0.5 } });
  m.layer = 1;
  const [cx, cy] = F(0, 0);
  sailRoof(m, cx, cy, F, -16, 6, 13, 24, 8);
  sailRoof(m, cx, cy, F, 2, -4, 15, 30, 8);
  sailRoof(m, cx, cy, F, 18, 8, 12, 22, 8);
  m.done();
  add(app, lm, { mesh: m, shadow: [{ pts: ellL(F, 0, 0, 30, 22, 8), h: 25 }] });
  // yacht club (smaller sail roof) by the creek with moored boats
  const y = new Mesh();
  const [ycx, ycy] = F(-90, -60);
  extrude(y, ellL(F, -90, -60, 16, 12, 12), 0, 6, '#efece5', { top: '#e2ddd3', glow: '#ffe2ac', ga: 0.3 });
  sailRoof(y, ycx, ycy, F, -90, -60, 11, 18, 6);
  y.done();
  add(app, lm, { mesh: y, shadow: [{ pts: ellL(F, -90, -60, 14, 10, 6), h: 15 }] });
  const yachts = [];
  for (let i = 0; i < 10; i++) yachts.push(F(-150 + i * 9, -100 - (i % 2) * 14));
  add(app, lm, { x: yachts[5][0], y: yachts[5][1], bbox: { x0: yachts[0][0] - 0.3, y0: yachts[0][1] - 0.5, x1: yachts[9][0] + 0.3, y1: yachts[9][1] + 0.5, h: 12 }, minZoom: 1,
    draw(r) {
      const c = r.ctx;
      yachts.forEach((p, i) => {
        const X = r.X(p[0], p[1]), Y = r.Y(p[0], p[1], 0) + Math.sin(r.t + i) * 0.3 * r.zoom;
        c.fillStyle = r.L.shade('#f7f7f5', 0.3, 0.6, 0.4);
        c.beginPath(); c.ellipse(X, Y, 3.2 * r.zoom, 1.4 * r.zoom, -0.46, 0, TAU); c.fill();
        c.strokeStyle = r.L.shade('#d0d0d0', 1, 0, 0); c.lineWidth = Math.max(0.5, 0.25 * r.zoom);
        c.beginPath(); c.moveTo(X, Y); c.lineTo(X, Y - 7 * r.zoom); c.stroke();
      });
    } });
}

export function registerOldDubai(app) {
  alFahidiFort(app);
  souks(app);
  shindagha(app);
  qe2(app);
  clocktower(app);
  creekGolf(app);
}
