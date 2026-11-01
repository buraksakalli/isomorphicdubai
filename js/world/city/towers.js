// Procedural towers: setbacks, chamfers, round shafts, tapers, crowns, spires, fins, podiums.
import { Prog, rectPts, ringPts, LIGHT_WARM, LIGHT_COOL, LIGHT_NEUTRAL, LIGHT_GOLD } from './mesh.js';
import { MAT, GOLD, rng, pick } from './palette.js';

const SHAPES = [['rect', 30], ['cham', 22], ['round', 10], ['taper', 9], ['step', 18], ['twin', 0]];
function wpick(list, R) {
  let tot = 0;
  for (const [, w] of list) tot += w;
  let x = R() * tot;
  for (const [k, w] of list) { x -= w; if (x <= 0) return k; }
  return list[0][0];
}

function shapePts(shape, cx, cy, hw, hd, s) {
  const w = hw * s, d = hd * s;
  if (shape === 'cham') {
    const c = Math.min(w, d) * 0.32;
    return [[cx - w + c, cy - d], [cx + w - c, cy - d], [cx + w, cy - d + c], [cx + w, cy + d - c],
      [cx + w - c, cy + d], [cx - w + c, cy + d], [cx - w, cy + d - c], [cx - w, cy - d + c]];
  }
  if (shape === 'round') return ringPts(cx, cy, w, 12, Math.PI / 12, d / w);
  if (shape === 'round8') return ringPts(cx, cy, w, 8, Math.PI / 8, d / w);
  return rectPts(cx - w, cy - d, 2 * w, 2 * d);
}
const scalePts = (pts, cx, cy, s) => pts.map((p) => [cx + (p[0] - cx) * s, cy + (p[1] - cy) * s]);

/**
 * Build a tower.
 * cx, cy: centre (tiles); lw, ld: half sizes of the lot available (tiles); H: total height (m).
 * cfg: { pal, use:'office'|'res'|'hotel', podium: prob, slim?: bool }
 * returns { hi, lo, bbox, shadow, h }
 */
export function makeTower(cx, cy, lw, ld, H, cfg, seed) {
  const R = rng(seed);
  const pal = cfg.pal;
  const m = MAT[pick(pal.mats, R)];
  const use = cfg.use || (R() < 0.55 ? 'res' : 'office');
  const floorH = use === 'office' ? 4.0 : 3.3;
  const light = use === 'office' ? (R() < 0.75 ? LIGHT_COOL : LIGHT_NEUTRAL) : (R() < 0.8 ? LIGHT_WARM : LIGHT_NEUTRAL);
  const lit = use === 'office' ? 0.5 + R() * 0.25 : 0.55 + R() * 0.3;
  const win = { floor: floorH, kind: m.glass ? 0 : 1, lit, light, glass: m.g, seed: seed % 9973 };
  const winLo = { ...win, mz: 0.06 };
  const hi = new Prog(), lo = new Prog();
  const gold = R() < pal.gold;

  // footprint
  const tall = H > 230;
  let hw = lw * (0.52 + R() * 0.3), hd = ld * (0.52 + R() * 0.3);
  if (tall) { hw = Math.max(hw, lw * 0.7); hd = Math.max(hd, ld * 0.7); }
  if (cfg.slim) { hw *= 0.85; hd *= 0.85; }
  const ar = hw / hd;
  if (ar > 1.7) hw = hd * 1.7; else if (ar < 1 / 1.7) hd = hw * 1.7;
  hw = Math.max(hw, 0.08); hd = Math.max(hd, 0.08);
  let shape = wpick(SHAPES, R);
  if (shape === 'round' && H < 110) shape = 'cham';

  // podium
  let z = 0;
  const shadow = [];
  if (R() < (cfg.podium ?? 0.4)) {
    const ph = 8 + Math.floor(R() * 4) * 4.5;
    const pw = lw * (0.9 + R() * 0.08), pd = ld * (0.9 + R() * 0.08);
    const pw2 = Math.max(pw, hw + 0.03), pd2 = Math.max(pd, hd + 0.03);
    const po = { top: '#d2cdc3', win: { floor: 4.5, kind: 1, lit: 0.6, light: LIGHT_NEUTRAL, glass: '#56656f', seed: seed + 3 } };
    hi.box(cx - pw2, cy - pd2, pw2 * 2, pd2 * 2, 0, ph, pal.podium, po);
    if (cfg.podiumLo) lo.box(cx - pw2, cy - pd2, pw2 * 2, pd2 * 2, 0, ph, pal.podium, { mz: 0.1 });
    z = ph;
    shadow.push({ pts: rectPts(cx - pw2, cy - pd2, pw2 * 2, pd2 * 2), h: ph });
  }

  // crown type
  const crowns = gold ? ['gold', 'gold', 'crown', 'spire'] : ['roof', 'roof', 'roof', 'crown', 'crown', 'slant', 'slant', 'pyramid', 'spire'];
  let crown = pick(crowns, R);
  if (shape === 'taper' && crown === 'slant') crown = 'spire';
  if (shape === 'round' && crown === 'slant') crown = 'crown';
  let crownH;
  switch (crown) {
    case 'spire': crownH = H * (0.1 + R() * 0.1); break;
    case 'pyramid': crownH = H * (0.08 + R() * 0.07); break;
    case 'slant': crownH = H * (0.06 + R() * 0.07); break;
    case 'gold': case 'crown': crownH = H * (0.05 + R() * 0.04); break;
    default: crownH = 4 + R() * 5;
  }
  const bodyTop = Math.max(z + 20, H - crownH);
  const bodyH = bodyTop - z;

  // tiers
  let nt = shape === 'step' ? 3 : R() < 0.4 ? 2 : 1;
  if (bodyH < 70) nt = 1;
  const fr = nt === 1 ? [1] : nt === 2 ? [0.74 + R() * 0.1, 0] : [0.5 + R() * 0.1, 0.27 + R() * 0.06, 0];
  if (nt > 1) { let s = 0; for (let k = 0; k < nt - 1; k++) s += fr[k]; fr[nt - 1] = 1 - s; }
  const base = shape === 'step' ? 'rect' : shape === 'taper' ? 'rect' : shape;
  let s = 1, zz = z;
  let topPts = null;
  const accent = R() < 0.25 ? (gold ? GOLD : R() < 0.5 ? '#f4f2ee' : m.g) : null;
  for (let k = 0; k < nt; k++) {
    const h = bodyH * fr[k];
    const pts = shapePts(base, cx, cy, hw, hd, s);
    if (shape === 'taper') {
      const sTop = 0.55 + R() * 0.15;
      hi.taper(pts, zz, scalePts(pts, cx, cy, sTop), zz + h, m.c, { top: m.top, win, emit: 0.1 });
      topPts = scalePts(pts, cx, cy, sTop);
    } else {
      hi.solid(pts, zz, zz + h, m.c, { top: m.top, emit: 0.1, win: { ...win, z0: zz + (k === 0 && z === 0 ? 5 : 0.5) } });
      topPts = pts;
      if (accent && k === 0) {
        // vertical fin running up the south face
        const fw = Math.min(hw * s * 0.18, 0.04);
        hi.box(cx - fw, cy + hd * s - 0.004, fw * 2, 0.022, zz, h + 3, accent, { emit: accent === GOLD ? 0.35 : 0 });
      }
    }
    zz += h;
    s *= 0.74 + R() * 0.14;
  }
  const topS = shape === 'taper' ? 0.6 : s / (0.74 + 0.07);
  // crown
  let tip = bodyTop;
  const tcx = cx, tcy = cy;
  if (crown === 'roof') {
    const mw = hw * topS * 0.45, md = hd * topS * 0.45;
    hi.box(tcx - mw, tcy - md, mw * 2, md * 2, bodyTop, crownH, '#c9ccce', { mz: 0.25 });
    tip = bodyTop + crownH;
  } else if (crown === 'spire') {
    const sw = Math.max(0.015, Math.min(hw, hd) * topS * 0.18);
    const baseH = crownH * 0.25;
    hi.box(tcx - sw * 1.6, tcy - sw * 1.6, sw * 3.2, sw * 3.2, bodyTop, baseH, gold ? GOLD : m.top, { emit: 0.35 });
    hi.taper(rectPts(tcx - sw, tcy - sw, sw * 2, sw * 2), bodyTop + baseH, rectPts(tcx - 0.002, tcy - 0.002, 0.004, 0.004), bodyTop + crownH,
      gold ? GOLD : '#e9ecee', { top: false });
    tip = bodyTop + crownH;
    lo.line(tcx, tcy, bodyTop, tcx, tcy, tip, gold ? GOLD : '#e2e6ea', 1.5);
  } else if (crown === 'pyramid') {
    hi.taper(topPts, bodyTop, scalePts(topPts, tcx, tcy, 0.06), bodyTop + crownH, gold ? GOLD : m.c, { top: false, emit: 0.25 });
    tip = bodyTop + crownH;
  } else if (crown === 'slant') {
    // sloped top: rect only
    const w = hw * topS, d = hd * topS;
    const pts = rectPts(tcx - w, tcy - d, 2 * w, 2 * d);
    const dir = R() < 0.5;
    const zt = dir ? [bodyTop + crownH, bodyTop, bodyTop, bodyTop + crownH] : [bodyTop + crownH, bodyTop + crownH, bodyTop, bodyTop];
    hi.solid(pts, bodyTop, zt, m.c, { top: m.top, emit: 0.15 });
    tip = bodyTop + crownH;
  } else if (crown === 'gold' || crown === 'crown') {
    const col = crown === 'gold' ? GOLD : m.top === '#dedad2' ? '#f4f1ea' : '#e8ecee';
    const cs = 0.82;
    const pts = scalePts(topPts, tcx, tcy, cs);
    hi.solid(pts, bodyTop, bodyTop + crownH * 0.7, col, { emit: 0.55, top: col });
    const sw = Math.max(0.012, Math.min(hw, hd) * topS * 0.12);
    hi.taper(rectPts(tcx - sw, tcy - sw, sw * 2, sw * 2), bodyTop + crownH * 0.7, rectPts(tcx - 0.002, tcy - 0.002, 0.004, 0.004),
      bodyTop + crownH * 1.6, col, { top: false });
    tip = bodyTop + crownH * 1.6;
    const gl = crown === 'gold' ? LIGHT_GOLD : LIGHT_NEUTRAL, gr = 6 + Math.min(10, H / 30);
    hi.glow(tcx, tcy, bodyTop + crownH * 0.4, gr, gl);
    lo.glow(tcx, tcy, bodyTop + crownH * 0.4, gr, gl);
  }
  if (H >= 190 || (H >= 150 && R() < 0.4)) { hi.avl(tcx, tcy, tip + 1, seed); lo.avl(tcx, tcy, tip + 1, seed); }

  // low-LOD: base shape extruded to body top (8-gon for round), with night window bands
  const loShape = shape === 'round' ? 'round8' : shape === 'cham' ? 'cham' : 'rect';
  const loPts = shapePts(loShape, cx, cy, hw, hd, 1);
  if (shape === 'taper') lo.taper(loPts, z, scalePts(loPts, cx, cy, 0.62), bodyTop, m.c, { top: m.top, win: winLo, emit: 0.1 });
  else lo.solid(loPts, z, bodyTop - (nt > 1 ? bodyH * 0.05 : 0), m.c, { top: m.top, win: winLo, emit: 0.1 });
  if (crown === 'pyramid') lo.taper(rectPts(cx - hw * topS, cy - hd * topS, 2 * hw * topS, 2 * hd * topS), bodyTop,
    rectPts(cx - 0.003, cy - 0.003, 0.006, 0.006), bodyTop + crownH, gold ? GOLD : m.c, { top: false });

  shadow.push({ pts: shapePts(shape === 'round' ? 'round8' : 'rect', cx, cy, hw, hd, 1), h: bodyTop * 0.97 + (tip - bodyTop) * 0.3 });
  const ex = Math.max(lw, hw + 0.05), ey = Math.max(ld, hd + 0.05);
  return {
    hi: hi.done(), lo: lo.done(), h: tip + 4, shadow,
    bbox: { x0: cx - ex, y0: cy - ey, x1: cx + ex, y1: cy + ey, h: tip + 4 },
  };
}
