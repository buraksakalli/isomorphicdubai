// Low-rise generators. Each works on one 100 m tile and writes into a cluster accumulator:
//   acc.g  ground-level program (lawns, pools, paving, walls)   -> drawn first
//   acc.gl ground faces grouped in layers (paving < lawn < edges < pools < walls); flushBatch() appends them to acc.g
//          sorted by style, so equal styles of a whole cluster merge into one fill
//   acc.b  buildings program (row-major order = valid painter's order for grid-confined lots)
//   acc.m  mid-zoom program (simplified masses); acc.mg / acc.ms = its ground faces and tree-crown spots
//   acc.masses  [{x0,y0,x1,y1,h,col,top}] for the coarse overview layer
//   acc.shadow  footprints of buildings >= 25 m
//   acc.h  max height
import { Prog, sty, rectPts, ringPts, lightIdx, LIGHT_WARM, LIGHT_NEUTRAL, LIGHT_COOL, LIGHT_SHOP } from './mesh.js';
const LIGHT_MOSQUE = lightIdx('#c8ffd8');
const LIGHT_POOL = lightIdx('#5fe8ff');
const LIGHT_LAMP = lightIdx('#ffd9a0');
import {
  MID, MID_ACCENT, OLD, CORAL, VILLA_WALL, VILLA_ROOF, VILLA_FAM, POOL, POOL_EDGE, LAWN, LAWN2, LAWN3, PAVE, TREE_SPOT,
  IND, IND_ROOF, CONTAINERS, TREE_COL, rng, pick, lerp,
} from './palette.js';

export function newAcc() {
  return {
    g: new Prog(), b: new Prog(), m: new Prog(), masses: [], shadow: [], h: 0, n: 0, batch: [], batch2: [], mdots: [], m2: null,
    gl: [[], [], [], [], []], gx: [], mg: [], ms: [],
  };
}

const EMIT_LOW = 0.07;

function shadowBox(acc, x, y, w, d, h) { if (h >= 25) acc.shadow.push({ pts: rectPts(x, y, w, d), h }); }

/**
 * Mid-zoom program: all collected boxes as three batched passes (south faces, east faces, tops), each pass
 * sorted by style so consecutive faces merge into one fill. Painter's order between boxes is approximate,
 * which is invisible at these zooms (< 0.35). Ground faces go first, tree-crown spots after the boxes;
 * extra mid ops (lines, domes) and night dots are appended.
 */
const QMAP = new Map();
for (const [pal, k] of [[MID, 3], [OLD, 3], [VILLA_WALL, 2], [VILLA_ROOF, 2], [IND, 2], [IND_ROOF, 2], [CORAL, 1], [CONTAINERS, 4]]) {
  pal.forEach((c, i) => { if (!QMAP.has(c)) QMAP.set(c, pal[i % k]); });
}
for (const f of Object.values(VILLA_FAM)) for (const c of f.walls) if (!QMAP.has(c)) QMAP.set(c, f.walls[0]);
QMAP.set(LAWN3, LAWN);
const qc = (c) => QMAP.get(c) || c;
const byCol = (p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0);
const byLayerCol = (p, q) => p[2] - q[2] || byCol(p, q);
function batchProg(B, extra, dots, ground, spots) {
  const m = new Prog();
  if (ground && ground.length) {
    for (const g of ground) g[0] = qc(g[0]);
    ground.sort(byLayerCol);
    for (const g of ground) m.face(sty(g[0], 0, 0, 1), 0, g[1]);
  }
  for (const b of B) { b.col = qc(b.col); b.top = qc(b.top); }
  if (B.length) {
    B.sort((p, q) => (p.col < q.col ? -1 : p.col > q.col ? 1 : 0));
    for (const b of B) { const { x, y, w, d, h, col } = b; m.face(sty0(col, 0, 1), 0, [[x, y + d, 0], [x + w, y + d, 0], [x + w, y + d, h], [x, y + d, h]]); }
    for (const b of B) { const { x, y, w, d, h, col } = b; m.face(sty0(col, 1, 0), 0, [[x + w, y + d, 0], [x + w, y, 0], [x + w, y, h], [x + w, y + d, h]]); }
    B.sort((p, q) => (p.top < q.top ? -1 : p.top > q.top ? 1 : 0));
    for (const b of B) { const { x, y, w, d, h, top } = b; m.face(sty0(top, 0, 0, 1), 0, [[x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h]]); }
  }
  if (spots && spots.length) {
    const st = sty(TREE_SPOT, 0, 0, 1);
    for (const [x, y, r, z] of spots) m.face(st, 0, [[x - r, y, z], [x, y - r, z], [x + r, y, z], [x, y + r, z]]);
  }
  for (const v of extra) m.a.push(v);
  if (dots.length) m.dots(dots, LIGHT_WARM, 0, 1);
  return m;
}
export function flushBatch(acc) {
  for (const layer of acc.gl) {
    layer.sort((p, q) => p[0] - q[0]);
    for (const f of layer) acc.g.face(f[0], f[1], f[2]);
    layer.length = 0;
  }
  for (const a of acc.gx) acc.g.glow(a[0], a[1], a[2], a[3], a[4], a[5]);
  acc.gx = [];
  const extra = acc.m.a;
  acc.m = batchProg(acc.batch, extra, acc.mdots, acc.mg, acc.ms);
  acc.m2 = acc.batch2.length ? batchProg(acc.batch2, extra, acc.mdots, acc.mg.filter((g) => g[2] === 0), null) : null; // no pools < 0.3
  acc.batch = []; acc.batch2 = []; acc.mdots = []; acc.mg = []; acc.ms = [];
}
/** queue a box for the mid-zoom program */
function mbox(acc, x, y, w, d, h, col, top) { const b = { x, y, w, d, h, col, top: top || col }; acc.batch.push(b); acc.batch2.push({ ...b }); }
/** box only in the 0.3-0.5 program (villas; the 0.2-0.3 program gets per-row terraces instead) */
function mbox1(acc, x, y, w, d, h, col, top) { acc.batch.push({ x, y, w, d, h, col, top: top || col }); }
const sty0 = (hex, nx, ny, nz = 0) => sty(hex, nx, ny, nz, nz ? 0 : EMIT_LOW);

/** night window dots on the south/east faces of a box, for zooms where real windows are not drawn */
function litDots(acc, x, y, w, d, h, R, maxz, light, k = 1) {
  const n = Math.max(1, Math.min(9, Math.round(((w + d) * h * k) / 4)));
  const pts = [];
  for (let q = 0; q < n; q++) {
    if (R() > 0.6) continue;
    const zz = 2 + R() * Math.max(1, h - 4);
    if (R() < w / (w + d)) pts.push([x + w * (0.1 + R() * 0.8), y + d, zz]);
    else pts.push([x + w, y + d * (0.1 + R() * 0.8), zz]);
  }
  if (!pts.length) return;
  acc.b.dots(pts, light, 0, maxz);
  for (const q of pts) acc.mdots.push(q);
}

// ---------------------------------------------------------------- villas
// Ground layers (see acc.gl); everything flat or wall-high goes through them so a cluster's lawns, pools,
// driveways and compound walls cost a handful of fills instead of several per plot.
const GL_PAVE = 0, GL_LAWN = 1, GL_EDGE = 2, GL_POOL = 3, GL_WALL = 4;
const WALL_MZ = 1.3;  // compound walls (< 1 px tall below this zoom)
const hseed = (a, b, c) => ((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) | 0;
const quad = (x, y, w, d, z) => [[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]];
function grect(acc, layer, x, y, w, d, z, hex, mz) { if (w > 0.002 && d > 0.002) acc.gl[layer].push([sty(hex, 0, 0, 1), mz, quad(x, y, w, d, z)]); }
/** ground face for the batched mid-zoom programs (layer 0 = lawns/paving, 1 = pools on top) */
function mrect(acc, x, y, w, d, z, hex, layer = 0) { if (w > 0.01 && d > 0.01) acc.mg.push([hex, quad(x, y, w, d, z), layer]); }
/** wall running along x: its south face at y (thin coping strips cost more than they show) */
function wallX(acc, x, y, w, h, hex, mz) { if (w > 0.005) acc.gl[GL_WALL].push([sty(hex, 0, 1, 0), mz, [[x, y, 0], [x + w, y, 0], [x + w, y, h], [x, y, h]]]); }
/** wall running along y: its east face at x */
function wallY(acc, x, y, d, h, hex, mz) { if (d > 0.005) acc.gl[GL_WALL].push([sty(hex, 1, 0, 0), mz, [[x, y + d, 0], [x, y, 0], [x, y, h], [x, y + d, h]]]); }
/** merges collinear wall pieces of adjacent plots into one run; draw(a, b) emits the run [a, b] */
function wallRun(draw) {
  let a = null, b = 0;
  return {
    add(s, e) { if (a !== null && Math.abs(s - b) < 1e-6) b = e; else { if (a !== null) draw(a, b); a = s; b = e; } },
    gap() { if (a !== null) draw(a, b); a = null; },
  };
}
/** n random fractions summing to 1, each within 1 +- j of the mean (relative) */
function splits(n, R, j) {
  const w = [];
  let s = 0;
  for (let k = 0; k < n; k++) { const v = 1 + (R() * 2 - 1) * j; w.push(v); s += v; }
  for (let k = 0; k < n; k++) w[k] /= s;
  return w;
}
/** facade family: cfg.hip = share of terracotta-roofed blocks; the rest are white / sand / grey modern */
function famPick(u, cfg) {
  const hip = cfg.hip ?? 0.4;
  if (u < hip) return VILLA_FAM.med;
  u = (u - hip) / (1 - hip);
  if (cfg.big) return u < 0.38 ? VILLA_FAM.white : u < 0.72 ? VILLA_FAM.sand : VILLA_FAM.grey;
  return u < 0.45 ? VILLA_FAM.sand : u < 0.82 ? VILLA_FAM.white : VILLA_FAM.grey;
}
/**
 * Community uses at intervals: at most one neighbourhood mosque per 7x7-tile cell and one park per 5x5 cell
 * (offset grids), each on a hashed tile of its cell. 1 = mosque, 2 = park, 0 = houses.
 */
function special(tx, ty) {
  const M = 7, cx = Math.floor(tx / M), cy = Math.floor(ty / M);
  const R1 = rng(hseed(cx, cy, 0x305c));
  const pm = R1(), mx = cx * M + 1 + Math.floor(R1() * (M - 2)), my = cy * M + 1 + Math.floor(R1() * (M - 2));
  if (pm < 0.8 && mx === tx && my === ty) return 1;
  const P = 5, qx = Math.floor((tx + 2) / P), qy = Math.floor((ty + 3) / P);
  const R2 = rng(hseed(qx, qy, 0x9a7c));
  const pp = R2(), kx = qx * P - 2 + Math.floor(R2() * P), ky = qy * P - 3 + Math.floor(R2() * P);
  if (pp < 0.55 && kx === tx && ky === ty) return 2;
  return 0;
}

/**
 * Villa tile. The lot is split into rows of plots with uneven widths/depths (hashed per tile); facade family,
 * storeys and garden lushness are shared by the street block (villa streets run every 2 tiles), so blocks read
 * as distinct neighbourhoods. Each plot: compound wall, villa (box / L / side annex / hipped / old courtyard /
 * estate) set back from the gate side, lawn or paving, driveway, maybe a pool, palms and shade trees.
 * Occasional tiles become a neighbourhood mosque or a community park; some rows are townhouse terraces.
 * cfg: { hip: share of terracotta-roofed blocks, grid: [cols, rows] plot density, pool: prob, big: bool }
 */
export function genVillas(acc, L, R, cfg, ok) {
  const lw = L.x1 - L.x0, ld = L.y1 - L.y0;
  if (lw < 0.2 || ld < 0.2) return false;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  const tx = Math.floor(cx), ty = Math.floor(cy);
  // lotAt() sets back street sides by ~0.12 tiles, other sides by 0.04
  const stN = L.y0 - ty > 0.07, stS = ty + 1 - L.y1 > 0.07, stW = L.x0 - tx > 0.07;
  const sp = special(tx, ty);
  if (sp === 1 && ok(cx, cy, Math.min(lw, ld) * 0.42)) { communityMosque(acc, L, R, stS || !stN); return true; }
  if (sp === 2 && ok(cx, cy, Math.min(lw, ld) * 0.4)) { communityPark(acc, L, R); return true; }
  // street block character
  const NB = rng(hseed(stW ? tx : tx - 1, stN ? ty : ty - 1, 0x5a1));
  const fam = famPick(NB(), cfg);
  const roofCol = fam.roof ? pick(fam.roof, NB) : null;
  const old = !cfg.big && NB() < 0.22; // older single-storey courtyard villas
  const lush = 0.3 + NB() * 0.6;
  const bwall = NB() < 0.8 ? fam.bwall : pick(['#ede7dc', '#e0cba6', '#e6dccb'], NB);
  const big = !!cfg.big;
  const [gc, gr] = cfg.grid || [3, 3];
  const lay = R();
  const estate = lay < (big ? 0.2 : 0.04);
  const town = !estate && !big && lay > 1 - ((cfg.hip ?? 0.4) >= 0.8 ? 0.14 : 0.07) && ok(cx, cy, Math.min(lw, ld) * 0.44);
  let nr = Math.max(1, Math.round(ld / (0.88 / gr)));
  if (estate) nr = Math.max(1, nr - 1);
  else if (nr >= 2 && R() < 0.22) nr--;
  else if (nr === 2 && ld > 0.6 && R() < 0.15) nr++;
  const rows = splits(nr, R, 0.22);
  const o = { big: big || estate, old, lush, bwall, pool: cfg.pool ?? 0.5, wh: big || estate ? 2.6 : 2.2, lamps: [], ldots: [] };
  // compound walls: each plot adds its interior west wall; row fronts/backs and the lot's west/east edges are
  // merged runs across neighbouring plots
  const wW = wallRun((a, b) => wallY(acc, L.x0 + 0.004, a + 0.004, b - a - 0.008, o.wh, bwall, WALL_MZ));
  const wE = wallRun((a, b) => wallY(acc, L.x1 - 0.004, a + 0.004, b - a - 0.008, o.wh, bwall, WALL_MZ));
  let any = false, y = L.y0;
  for (let r = 0; r < nr; r++) {
    const pd = rows[r] * ld, py = y;
    y += pd;
    const front = nr === 1 ? (!stS && stN ? 1 : 0) : r === 0 && stN ? 1 : 0; // 1 = gate & front garden on the north side
    const lastRow = r === nr - 1;
    if (town) { townRow(acc, L.x0, py, lw, pd, front, fam, roofCol, R, o, lastRow); any = true; continue; }
    const wN = wallRun((a, b) => wallX(acc, a + 0.004, py + 0.004, b - a - 0.008, o.wh, bwall, WALL_MZ));
    const wS = lastRow ? wallRun((a, b) => wallX(acc, a + 0.004, py + pd - 0.004, b - a - 0.008, o.wh, bwall, WALL_MZ)) : null;
    let nc = Math.max(1, Math.round(lw / (0.88 / gc)));
    if (estate) nc = Math.max(1, Math.round(nc / 2));
    else if (R() < 0.3) nc = Math.max(1, Math.min(4, nc + (R() < 0.5 ? -1 : 1)));
    const cols = splits(nc, R, 0.3);
    let x = L.x0, seg = null, band = null;
    // mid zoom: one lawn band per run of gardens in the row (instead of a face per plot)
    const bandOut = () => { if (band) mrect(acc, band[0], band[1] / band[4], band[2] - band[0], band[3] / band[4], 0.2, band[5]); band = null; };
    for (let c = 0; c < nc; c++) {
      const pw = cols[c] * lw, px = x;
      x += pw;
      if (pw < 0.12 || !ok(px + pw / 2, py + pd / 2, Math.max(pw, pd) * 0.45) || R() < 0.04) {
        seg = null; bandOut(); wN.gap(); if (wS) wS.gap();
        if (c === 0) wW.gap();
        if (c === nc - 1) wE.gap();
        continue;
      }
      any = true;
      wN.add(px, px + pw); if (wS) wS.add(px, px + pw);
      if (c === 0) wW.add(py, py + pd); else wallY(acc, px + 0.004, py + 0.004, pd - 0.008, o.wh, bwall, WALL_MZ);
      if (c === nc - 1) wE.add(py, py + pd);
      const stray = R() < 0.12;
      const F = stray ? famPick(R(), cfg) : fam;
      const v = villa(acc, px, py, pw, pd, front, F, F === fam ? roofCol : F.roof ? pick(F.roof, R) : null, R, o);
      if (v.g) {
        if (!band) band = [v.g[0], 0, 0, 0, 0, v.g[4]];
        band[2] = v.g[0] + v.g[2]; band[1] += v.g[1]; band[3] += v.g[3]; band[4]++;
      } else bandOut();
      // 0.2-0.3 program: consecutive villas of a row merge into one terrace
      if (!seg) { seg = { x: v.x, y: v.y, w: v.w, d: v.d, h: v.h, col: v.col, top: v.top }; acc.batch2.push(seg); }
      else { const y0 = Math.min(seg.y, v.y), y1 = Math.max(seg.y + seg.d, v.y + v.d); seg.w = v.x + v.w - seg.x; seg.y = y0; seg.d = y1 - y0; }
      acc.n++;
    }
    bandOut(); wN.gap(); if (wS) wS.gap();
  }
  wW.gap(); wE.gap();
  if (o.lamps.length) acc.b.dots(o.lamps, LIGHT_LAMP, 0.65, 99);
  if (o.ldots.length) acc.b.dots(o.ldots, LIGHT_WARM, 0.65, 1.4);
  if (any) acc.h = Math.max(acc.h, 14);
  return any;
}

/** shade tree or palm at (x,y); also a crown spot for the mid-zoom program when `spot` */
function greenery(acc, x, y, R, palmShare, spot) {
  if (R() < palmShare) acc.b.palm(x, y, 0, 7.5 + R() * 4.5, (x * 977 + y * 131) | 0, 0.75);
  else acc.b.tree(x, y, 0, 5 + R() * 3.5, pick(TREE_COL, R), 0.75);
  if (spot) acc.ms.push([x, y, 0.028, 5]);
}

/** One villa plot; returns the main volume for the merged 0.2-0.3 terraces. */
function villa(acc, px, py, pw, pd, front, F, roofCol, R, o) {
  const i = 0.012;
  const x0 = px + i, y0 = py + i, W = pw - 2 * i, D = pd - 2 * i; // inside the compound wall
  const big = o.big, old = o.old && !roofCol;
  // ---- footprint: set back from the gate side; the deeper garden faces the street
  let vw = W * (old ? 0.58 + R() * 0.2 : 0.48 + R() * 0.24), vd = D * (old ? 0.48 + R() * 0.14 : 0.38 + R() * 0.17);
  vw = Math.min(vw, big ? 0.42 : 0.3); vd = Math.min(vd, big ? 0.3 : 0.24);
  const back = 0.006 + R() * 0.022;
  const vx = x0 + 0.008 + R() * Math.max(0, W - vw - 0.016);
  const vy = front ? y0 + D - back - vd : y0 + back;
  const gy0 = front ? y0 : vy + vd + 0.004, gy1 = front ? vy - 0.004 : y0 + D, gd = gy1 - gy0;
  // ---- ground: lawn (front only / all round) or paved court, driveway, pool
  const lr = R();
  const lawnCol = lr < 0.45 ? LAWN : lr < 0.78 ? LAWN2 : LAWN3;
  const gm = R();
  let g = null; // garden rect for the row's mid-zoom lawn band
  if (gm < 0.2) { // paved court with a planted strip along the gate wall
    grect(acc, GL_PAVE, x0, y0, W, D, 0.15, PAVE, 1.0); // close to the terrain colour: detail only
    grect(acc, GL_LAWN, x0, front ? y0 : y0 + D - 0.022, W, 0.022, 0.2, lawnCol, 0.65);
  } else if (gm < 0.2 + o.lush * 0.5) { // lush: lawn all round the house
    grect(acc, GL_LAWN, x0, y0, W, D, 0.2, lawnCol, 0.65);
    g = [x0, gy0, W, gd, lawnCol];
  } else {
    grect(acc, GL_LAWN, x0, gy0, W, gd, 0.2, lawnCol, 0.65);
    g = [x0, gy0, W, gd, lawnCol];
  }
  const dside = R() < 0.5 ? 0 : 1; // driveway on the west (0) or east (1) side of the front garden
  const dw = 0.032, ddx = dside ? x0 + W - dw - 0.004 : x0 + 0.004;
  if (gd > 0.035 && gm >= 0.2 && R() < 0.7) grect(acc, GL_EDGE, ddx, gy0, dw, gd, 0.25, PAVE, 1.0);
  const dark = R() < 0.22; // nobody home / lights off
  if (R() < o.pool) {
    let plw = Math.min(W * 0.42, (big ? 0.13 : 0.085) * (0.75 + R() * 0.45)), pld = Math.min(0.05, 0.028 + R() * 0.024);
    let plx = -1, ply = 0;
    const ax = x0 + (dside === 0 ? 0.045 : 0.01), bx = x0 + W - (dside === 1 ? 0.045 : 0.01);
    if (gd > pld + 0.03 && bx - ax > plw) { plx = ax + R() * (bx - ax - plw); ply = gy0 + 0.012 + R() * (gd - pld - 0.024); }
    else { // side yard: long pool along the house
      const re = x0 + W - (vx + vw), rw = vx - x0;
      if (Math.max(re, rw) > 0.045) {
        const t = plw; plw = Math.min(0.035, Math.max(re, rw) - 0.02); pld = Math.min(vd * 0.85, t);
        plx = re >= rw ? vx + vw + (re - plw) / 2 : x0 + (rw - plw) / 2; ply = vy + (vd - pld) / 2;
      }
    }
    if (plx >= 0) {
      grect(acc, GL_EDGE, plx - 0.006, ply - 0.006, plw + 0.012, pld + 0.012, 0.25, POOL_EDGE, 1.0);
      grect(acc, GL_POOL, plx, ply, plw, pld, 0.3, POOL, 0.65);
      if (plw > 0.06) mrect(acc, plx, ply, plw, pld, 0.3, POOL, 1); // bigger pools only at mid zoom
      if (!dark && R() < 0.3) acc.gx.push([plx + plw / 2, ply + pld / 2, 0.5, 3.4, LIGHT_POOL, 0.75]);
    }
  }

  // ---- massing
  const col = pick(F.walls, R);
  const emit = dark ? 0 : EMIT_LOW;
  const lt = R();
  const light = lt < 0.8 ? LIGHT_WARM : lt < 0.95 ? LIGHT_NEUTRAL : LIGHT_COOL;
  const seed = (px * 977 + py * 131) | 0;
  const win = { floor: 3.6, kind: 1, lit: dark ? 0.04 : 0.22 + R() * 0.45, light, glass: F.glass, seed, mz: 1.4, z0: 0.6 };
  const H2 = big ? 8.2 : 7.2;
  const pre = [], post = []; // parts behind / in front of the main volume (painter's order)
  const mk = R();
  let kind = old ? 'court' : roofCol ? (mk < 0.8 ? 'hip' : 'L') : mk < 0.3 ? 'box' : mk < 0.62 ? 'L' : mk < 0.84 ? 'side' : 'box';
  if (big && !old && R() < 0.45) kind = 'estate';
  let mainH = H2, mainTop = F.top, hip = false;
  /** one-storey volume next to the main one; side: 'f' front, 'w' west, 'e' east */
  const annex = (ax, ay, aw, ad, h, side, hipped) => {
    if (aw < 0.02 || ad < 0.015) return;
    const behind = side === 'w' || (side === 'f' && front === 1);
    (behind ? pre : post).push(() => {
      acc.b.box(ax, ay, aw, ad, 0, h, col, { top: F.terr, emit, mz: 0.6 });
      if (hipped) acc.b.hipRoof(ax - 0.004, ay - 0.004, aw + 0.008, ad + 0.008, h, Math.min(aw, ad) * 100 * 0.3, roofCol);
    });
  };
  const frontWing = (ww, wd, atEast, h, hipped) => {
    wd = Math.min(wd, gd - 0.02);
    if (wd < 0.02) return;
    const wx = atEast ? vx + vw - ww : vx;
    annex(wx, front ? vy - wd : vy + vd, ww, wd, h, 'f', hipped);
  };
  if (kind === 'box') {
    if (R() < 0.75) { // stair hut / roof terrace pavilion at a back corner
      const hw = vw * (0.26 + R() * 0.14), hd = vd * (0.35 + R() * 0.2);
      const hx = R() < 0.5 ? vx + 0.006 : vx + vw - hw - 0.006, hy = front ? vy + vd - hd - 0.006 : vy + 0.006;
      post.push(() => acc.b.box(hx, hy, hw, hd, mainH, 2.6, col, { top: F.top, mz: 1.0 }));
    }
  } else if (kind === 'L') {
    frontWing(vw * (0.38 + R() * 0.18), vd * (0.45 + R() * 0.3), R() < 0.5, 3.8, !!roofCol);
  } else if (kind === 'side') {
    const re = x0 + W - (vx + vw) - 0.008, rw = vx - x0 - 0.008;
    const east = re >= rw, room = Math.max(re, rw);
    if (room > 0.025) {
      const aw = Math.min(room, vw * (0.3 + R() * 0.2)), ad = vd * (0.55 + R() * 0.35);
      const ay = front ? vy + vd - ad : vy;
      annex(east ? vx + vw : vx - aw, ay, aw, ad, 3.8, east ? 'e' : 'w', false);
    } else frontWing(vw * 0.45, vd * 0.5, R() < 0.5, 3.8, false);
    if (R() < 0.5) post.push(() => acc.b.box(vx + vw * 0.55, front ? vy + vd * 0.5 : vy + vd * 0.1, vw * 0.3, vd * 0.4, mainH, 2.6, col, { top: F.top, mz: 1.0 }));
  } else if (kind === 'hip') {
    mainH = H2 - 0.6; hip = true;
    if (R() < 0.5) frontWing(vw * (0.35 + R() * 0.2), vd * (0.45 + R() * 0.3), R() < 0.5, 3.6, true);
  } else if (kind === 'court') {
    mainH = 4.6; mainTop = F.terr;
    win.floor = 3.0; win.z0 = 0;
    if (R() < 0.55) { // upper majlis room at a back corner
      const uw = vw * (0.3 + R() * 0.15), ud = vd * (0.4 + R() * 0.2);
      const ux = R() < 0.5 ? vx + 0.008 : vx + vw - uw - 0.008, uy = front ? vy + vd - ud - 0.008 : vy + 0.008;
      post.push(() => acc.b.box(ux, uy, uw, ud, mainH, 3.2, col, { top: F.top, mz: 0.8, emit }));
    }
  } else { // estate: wings both sides towards the garden + a portico
    hip = !!roofCol;
    const ww = vw * 0.26, wd = vd * (0.35 + R() * 0.2);
    frontWing(ww, wd, false, 4.2, hip);
    const pw2 = vw * 0.2, pd2 = Math.min(0.03, gd - 0.02);
    if (pd2 > 0.012) {
      const ppx = vx + (vw - pw2) / 2, ppy = front ? vy - pd2 : vy + vd;
      (front ? pre : post).push(() => acc.b.box(ppx, ppy, pw2, pd2, 0, 6.4, F.acc, { top: F.top, mz: 0.8 }));
    }
    frontWing(ww, wd, true, 4.2, hip);
  }
  if (hip) mainTop = roofCol;
  // ---- greenery: garden trees, palms along the walls
  const nT = Math.round((o.lush * 2.4 + (big ? 1 : 0)) * (0.45 + R() * 0.8));
  for (let k = 0; k < nT; k++) {
    let qx, qy;
    if (R() < 0.6 && gd > 0.03) { qx = x0 + 0.012 + R() * (W - 0.024); qy = gy0 + 0.01 + R() * (gd - 0.02); }
    else { qx = R() < 0.5 ? x0 + 0.01 : x0 + W - 0.01; qy = y0 + 0.012 + R() * (D - 0.024); }
    if (qx > vx - 0.012 && qx < vx + vw + 0.012 && qy > vy - 0.012 && qy < vy + vd + 0.012) continue;
    const behind = qy < vy || qx < vx;
    const palmShare = roofCol ? 0.45 : 0.62;
    (behind ? pre : post).push(() => greenery(acc, qx, qy, R, palmShare, false));
  }
  for (const f of pre) f();
  acc.b.box(vx, vy, vw, vd, 0, mainH, col, { top: hip ? F.top : mainTop, win, emit });
  if (hip) acc.b.hipRoof(vx - 0.006, vy - 0.006, vw + 0.012, vd + 0.012, mainH, Math.min(vw, vd) * 100 * 0.34, roofCol);
  for (const f of post) f();
  // ---- night: gate lamps, the odd garden light, window dots where windows are not drawn
  if (!dark) {
    const gyL = front ? py + 0.006 : py + pd - 0.006;
    if (R() < 0.6) o.lamps.push([ddx + dw / 2, gyL, 2.6]);
    if (R() < 0.12 && gd > 0.04) acc.b.glow(x0 + W * (0.2 + R() * 0.6), (gy0 + gy1) / 2, 1.2, 3.2, LIGHT_LAMP, 0.75);
    const nd = R() < 0.35 ? 2 : 1;
    for (let k = 0; k < nd; k++) {
      const zz = 1.8 + R() * (mainH - 3);
      const p = R() < 0.6 ? [vx + vw * (0.12 + R() * 0.76), vy + vd, zz] : [vx + vw, vy + vd * (0.12 + R() * 0.76), zz];
      o.ldots.push(p);
      if (k === 0) acc.mdots.push(p);
    }
  }
  // ---- mid-zoom masses
  const h = mainH + (hip ? 1.6 : 0);
  mbox1(acc, vx, vy, vw, vd, h, col, mainTop);
  return { x: vx, y: vy, w: vw, d: vd, h, col, top: mainTop, g };
}

/** Townhouse terrace: one long two-storey strip, private front gardens split by low walls. */
function townRow(acc, x0, py, lw, pd, front, F, roofCol, R, o, lastRow) {
  const i = 0.012;
  const sd = Math.min(0.2, pd * (0.42 + R() * 0.1));
  const sx = x0 + 0.02, sw = lw - 0.04;
  const nu = Math.max(3, Math.round(sw / (0.085 + R() * 0.03))), uw = sw / nu;
  const sy = front ? py + pd - i - 0.012 - sd : py + i + 0.012;
  const gy0 = front ? py + i : sy + sd + 0.004, gy1 = front ? sy - 0.004 : py + pd - i, gd = gy1 - gy0;
  const col = pick(F.walls, R), h = 7;
  grect(acc, GL_LAWN, sx, gy0, sw, gd, 0.2, R() < 0.5 ? LAWN : LAWN2, 0.65);
  mrect(acc, sx, gy0, sw, gd, 0.2, LAWN);
  wallX(acc, x0 + 0.004, py + 0.004, lw - 0.008, 1.8, o.bwall, WALL_MZ);
  if (lastRow) wallX(acc, x0 + 0.004, py + pd - 0.004, lw - 0.008, 1.8, o.bwall, WALL_MZ);
  for (let k = 0; k <= nu; k++) wallY(acc, sx + k * uw, gy0, gd, 1.6, o.bwall, WALL_MZ);
  const trees = [];
  for (let k = 0; k < nu; k++) if (R() < 0.55 && gd > 0.03) trees.push([sx + (k + 0.3 + R() * 0.4) * uw, gy0 + 0.01 + R() * (gd - 0.02)]);
  const plant = () => { for (const [qx, qy] of trees) greenery(acc, qx, qy, R, 0.6, !front); };
  if (front) plant();
  const win = { floor: 3.5, kind: 1, lit: 0.4, light: LIGHT_WARM, glass: F.glass, seed: (sx * 557 + sy * 91) | 0, mz: 1.4, z0: 0.5 };
  acc.b.box(sx, sy, sw, sd, 0, h, col, { top: F.top, win, emit: EMIT_LOW });
  for (let k = 0; k < nu; k++) {
    const ux = sx + k * uw;
    if (roofCol) acc.b.hipRoof(ux, sy - 0.004, uw, sd + 0.008, h, Math.min(uw, sd) * 100 * 0.3, roofCol);
    else if (k % 2 === 0) acc.b.box(ux + uw * 0.15, sy + sd * 0.15, uw * 0.7, sd * 0.45, h, 2.4, col, { top: F.terr, mz: 1.0 });
    if (R() < 0.7) o.lamps.push([ux + uw / 2, front ? py + 0.006 : py + pd - 0.006, 2.2]);
    if (R() < 0.55) acc.mdots.push([ux + uw * (0.2 + R() * 0.6), sy + sd, 2 + R() * 3.5]);
  }
  if (!front) plant();
  mbox(acc, sx, sy, sw, sd, h + (roofCol ? 1.5 : 0), col, roofCol || F.top);
  acc.n += nu;
}

/** Neighbourhood mosque: prayer hall with a dome and one minaret, forecourt and car park towards the street. */
function communityMosque(acc, L, R, faceS) {
  const lw = L.x1 - L.x0, ld = L.y1 - L.y0;
  const col = R() < 0.35 ? '#ecdcbd' : '#f5f2ea';
  const domeCol = pick(['#f6f4ee', '#8db8a5', '#d9b45e', '#7ea9c4', '#f6f4ee'], R);
  grect(acc, GL_PAVE, L.x0 + 0.02, L.y0 + 0.02, lw - 0.04, ld - 0.04, 0.15, '#ece5d6', 0.65);
  mrect(acc, L.x0 + 0.02, L.y0 + 0.02, lw - 0.04, ld - 0.04, 0.15, '#ece5d6');
  const pkd = ld * 0.2, pky = faceS ? L.y1 - 0.03 - pkd : L.y0 + 0.03;
  grect(acc, GL_EDGE, L.x0 + 0.05, pky, lw - 0.1, pkd, 0.2, '#bdbab3', 0.65);
  const w = Math.min(0.42, lw * 0.5), d = Math.min(0.32, ld * 0.38);
  const hx = L.x0 + (lw - w) / 2 + (R() - 0.5) * 0.08, hy = faceS ? L.y0 + 0.09 : L.y1 - 0.09 - d;
  // planted strip behind the hall
  grect(acc, GL_LAWN, hx - 0.03, faceS ? L.y0 + 0.03 : hy + d + 0.02, w + 0.06, 0.04, 0.2, LAWN2, 0.65);
  wallX(acc, L.x0 + 0.01, L.y0 + 0.01, lw - 0.02, 2, '#e6dccb', WALL_MZ);
  wallX(acc, L.x0 + 0.01, L.y1 - 0.01, lw - 0.02, 2, '#e6dccb', WALL_MZ);
  wallY(acc, L.x0 + 0.01, L.y0 + 0.01, ld - 0.02, 2, '#e6dccb', WALL_MZ);
  wallY(acc, L.x1 - 0.01, L.y0 + 0.01, ld - 0.02, 2, '#e6dccb', WALL_MZ);
  const hh = 8, mh = 14.5 + R() * 3; // minaret + cap stays within the villa cluster height bound (22 m)
  const seed = (hx * 311 + hy * 71) | 0;
  const mBack = R() < 0.5;
  const mx = mBack ? hx + w * (0.15 + R() * 0.7) : hx + w + 0.04, my = mBack ? hy - 0.04 : hy + d * (0.3 + R() * 0.5);
  const porch = () => {
    const pw = w * 0.32, pd = 0.04;
    acc.b.box(hx + (w - pw) / 2, faceS ? hy + d : hy - pd, pw, pd, 0, 6.6, col, { top: '#e6e0d4', emit: 0.12, mz: 0.6 });
  };
  // palms along the car park (north of the hall when the street is north: drawn first)
  const palms = () => {
    const n = 3 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) greenery(acc, L.x0 + 0.07 + (k + 0.5) * (lw - 0.14) / n, faceS ? pky - 0.015 : pky + pkd + 0.015, R, 0.85, true);
  };
  if (!faceS) palms();
  if (mBack) minaret(acc, mx, my, mh, col, domeCol);
  if (!faceS) porch();
  acc.b.box(hx, hy, w, d, 0, hh, col, { top: '#e6e0d4', emit: 0.12, win: { floor: 4.2, kind: 1, lit: 0.85, light: LIGHT_WARM, glass: '#6b6458', seed, mz: 0.9, z0: 1.4 } });
  acc.b.dome(hx + w / 2, hy + d / 2, Math.min(w, d) * 0.32, hh, 7, domeCol, { sides: 10, steps: 3, mz: 0.3, emit: 0.3 });
  acc.b.glow(hx + w / 2, hy + d / 2, hh + 6, 11, LIGHT_MOSQUE, 0.3);
  if (faceS) porch();
  if (!mBack) minaret(acc, mx, my, mh, col, domeCol);
  if (faceS) palms();
  const lamps = [];
  for (let k = 0; k < 4; k++) lamps.push([L.x0 + 0.08 + k * (lw - 0.16) / 3, pky + pkd / 2, 4]);
  acc.b.dots(lamps, LIGHT_LAMP, 0.65, 99);
  mbox(acc, hx, hy, w, d, hh, col, '#e6e0d4');
  acc.m.box(hx + w / 2 - 0.07, hy + d / 2 - 0.07, 0.14, 0.14, hh, 6, domeCol, { emit: 0.2 });
  acc.mdots.push([hx + w, hy + d * 0.5, 4], [hx + w * 0.5, hy + d, 4]);
  acc.h = Math.max(acc.h, mh + 5);
  acc.n++;
}

/** Community park: lawn, footpaths, a playground, shade trees and palms round the edge, path lamps. */
function communityPark(acc, L, R) {
  const x0 = L.x0 + 0.015, y0 = L.y0 + 0.015, w = L.x1 - L.x0 - 0.03, d = L.y1 - L.y0 - 0.03;
  grect(acc, GL_LAWN, x0, y0, w, d, 0.2, LAWN2, 0.65);
  mrect(acc, x0, y0, w, d, 0.2, LAWN2);
  const pw = 0.022, PATH = '#e8dfcd';
  const loop = R() < 0.5;
  const lamps = [];
  if (loop) {
    const ix = w * 0.2, iy = d * 0.2;
    grect(acc, GL_EDGE, x0 + ix, y0 + iy, w - 2 * ix, pw, 0.25, PATH, 0.65);
    grect(acc, GL_EDGE, x0 + ix, y0 + d - iy - pw, w - 2 * ix, pw, 0.25, PATH, 0.65);
    grect(acc, GL_EDGE, x0 + ix, y0 + iy, pw, d - 2 * iy, 0.25, PATH, 0.65);
    grect(acc, GL_EDGE, x0 + w - ix - pw, y0 + iy, pw, d - 2 * iy, 0.25, PATH, 0.65);
    grect(acc, GL_EDGE, x0 + w / 2 - pw / 2, y0, pw, iy, 0.25, PATH, 0.65); // entrance
    for (const [a, b] of [[ix, iy], [w - ix, iy], [ix, d - iy], [w - ix, d - iy]]) lamps.push([x0 + a, y0 + b, 3.5]);
  } else {
    grect(acc, GL_EDGE, x0, y0 + d / 2 - pw / 2, w, pw, 0.25, PATH, 0.65);
    grect(acc, GL_EDGE, x0 + w / 2 - pw / 2, y0, pw, d, 0.25, PATH, 0.65);
    for (const t of [0.2, 0.8]) lamps.push([x0 + w * t, y0 + d / 2, 3.5], [x0 + w / 2, y0 + d * t, 3.5]);
  }
  // playground in one quadrant (rubber surface), between the paths
  const qx = R() < 0.5 ? 0 : 1, qy = R() < 0.5 ? 0 : 1;
  const gw = w * 0.2, gdp = d * 0.2;
  const gx = loop ? x0 + w / 2 - gw / 2 + (qx ? w * 0.12 : -w * 0.12) : x0 + (qx ? w * 0.62 : w * 0.18);
  const gy = loop ? y0 + d / 2 - gdp / 2 : y0 + (qy ? d * 0.62 : d * 0.18);
  grect(acc, GL_POOL, gx, gy, gw, gdp, 0.3, R() < 0.5 ? '#d9926a' : '#7fb2c6', 0.65);
  wallX(acc, x0, y0, w, 0.9, '#cfc6b4', WALL_MZ); wallX(acc, x0, y0 + d, w, 0.9, '#cfc6b4', WALL_MZ);
  wallY(acc, x0, y0, d, 0.9, '#cfc6b4', WALL_MZ); wallY(acc, x0 + w, y0, d, 0.9, '#cfc6b4', WALL_MZ);
  // trees: an edge ring plus a few inside, away from paths and the playground
  const pts = [];
  const ne = 3 + Math.floor(R() * 2);
  for (let k = 0; k < ne; k++) {
    const t = (k + 0.3 + R() * 0.4) / ne;
    pts.push([x0 + t * w, y0 + 0.025], [x0 + t * w, y0 + d - 0.025], [x0 + 0.025, y0 + t * d], [x0 + w - 0.025, y0 + t * d]);
  }
  for (let k = 0; k < 3; k++) {
    const px = x0 + w * (0.1 + R() * 0.8), py = y0 + d * (0.1 + R() * 0.8);
    if (px > gx - 0.03 && px < gx + gw + 0.03 && py > gy - 0.03 && py < gy + gdp + 0.03) continue;
    pts.push([px, py]);
  }
  pts.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  for (const [px, py] of pts) if (R() < 0.85) greenery(acc, px, py, R, 0.35, true);
  acc.b.dots(lamps, LIGHT_LAMP, 0.65, 99);
  for (let k = 0; k < 2; k++) acc.mdots.push(lamps[k]);
  acc.h = Math.max(acc.h, 14);
  acc.n++;
}


// ---------------------------------------------------------------- mid-rise
/** cfg: { floors:[a,b], court: prob, accent: prob } */
export function genMidrise(acc, L, R, cfg, ok) {
  const [fa, fb] = cfg.floors || [4, 10];
  const fl = () => Math.round(lerp(fa, fb, Math.pow(R(), 1.3)));
  const ins = 0.03;
  const x0 = L.x0 + ins, y0 = L.y0 + ins, Wd = L.x1 - L.x0 - 2 * ins, Dd = L.y1 - L.y0 - 2 * ins;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  if (Wd < 0.12 || Dd < 0.12) return false;
  if (!ok(cx, cy, Math.max(Wd, Dd) * 0.48)) {
    if (!ok(cx, cy, 0.2)) return false;
    block(acc, cx - 0.18, cy - 0.18, 0.36, 0.36, fl() * 3.3, R, cfg);
    return true;
  }
  const pat = R();
  const floors = fl();
  if (pat < (cfg.court ?? 0.25) && floors >= 3 && Wd > 0.5 && Dd > 0.5) {
    // courtyard block: N, W, E, S wings
    const t = Math.min(Wd, Dd) * (0.24 + R() * 0.06);
    const h = floors * 3.3, col = pick(MID, R);
    acc.g.rect(x0 + t, y0 + t, Wd - 2 * t, Dd - 2 * t, 0.2, R() < 0.5 ? '#d9cdb7' : LAWN2, 0.5);
    block(acc, x0, y0, Wd, t, h, R, cfg, col);
    block(acc, x0, y0 + t, t, Dd - 2 * t, h, R, cfg, col);
    block(acc, x0 + Wd - t, y0 + t, t, Dd - 2 * t, h, R, cfg, col);
    block(acc, x0, y0 + Dd - t, Wd, t, h, R, cfg, col);
    if (R() < 0.6) acc.b.palm(x0 + Wd / 2, y0 + Dd / 2, 0, 9, (x0 * 7 + y0) | 0, 0.6);
  } else if (pat < 0.55) {
    // two parallel slabs
    const alongX = Wd >= Dd ? R() < 0.7 : R() < 0.3;
    const S = alongX ? Dd : Wd;
    const t = S * (0.3 + R() * 0.08), gap = S - 2 * t;
    const h1 = fl() * 3.3, h2 = fl() * 3.3;
    if (alongX) { block(acc, x0, y0, Wd, t, h1, R, cfg); block(acc, x0, y0 + t + gap, Wd, t, h2, R, cfg); }
    else { block(acc, x0, y0, t, Dd, h1, R, cfg); block(acc, x0 + t + gap, y0, t, Dd, h2, R, cfg); }
    if (gap > 0.15) {
      if (alongX) acc.g.rect(x0 + 0.03, y0 + t + 0.03, Wd - 0.06, gap - 0.06, 0.2, LAWN2, 0.6);
      else acc.g.rect(x0 + t + 0.03, y0 + 0.03, gap - 0.06, Dd - 0.06, 0.2, LAWN2, 0.6);
    }
  } else if (pat < 0.82) {
    // 2x2 blocks
    const g = 0.07, tw = (Wd - g) / 2, td = (Dd - g) / 2;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      if (R() < 0.12) continue;
      const jw = tw * (0.8 + R() * 0.2), jd = td * (0.8 + R() * 0.2);
      block(acc, x0 + c * (tw + g), y0 + r * (td + g), jw, jd, fl() * 3.3, R, cfg);
    }
  } else {
    // one big block + annex
    const h = floors * 3.3;
    const bw = Wd * (0.65 + R() * 0.3), bd = Dd * (0.55 + R() * 0.25);
    block(acc, x0, y0, bw, bd, h, R, cfg);
    if (bd < Dd - 0.2) block(acc, x0, y0 + bd + 0.06, Wd * 0.5, Dd - bd - 0.06, Math.max(7, h * 0.4), R, cfg);
  }
  return true;
}

function block(acc, x, y, w, d, h, R, cfg, col) {
  col = col || pick(MID, R);
  const seed = (x * 1931 + y * 733) | 0;
  const win = { floor: 3.3, kind: 1, lit: 0.55, light: R() < 0.8 ? LIGHT_WARM : LIGHT_NEUTRAL, glass: '#5d6a74', seed, mz: 0.6, z0: 1 };
  acc.b.box(x, y, w, d, 0, h, col, { top: '#d6d1c8', win, emit: EMIT_LOW });
  if (R() < (cfg.accent ?? 0.3) && h > 12) {
    // coloured top band
    acc.b.box(x - 0.003, y - 0.003, w + 0.006, d + 0.006, h - 3.2, 3.2, pick(MID_ACCENT, R), { top: '#d6d1c8', mz: 0.4 });
  }
  // rooftop plant / tanks
  if (w > 0.12 && d > 0.12) {
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const bw = 0.025 + R() * 0.035, bd = 0.02 + R() * 0.03;
      acc.b.box(x + 0.02 + R() * (w - bw - 0.04), y + 0.02 + R() * (d - bd - 0.04), bw, bd, h, 1.5 + R() * 2, '#cfd2d4', { mz: 1.1 });
    }
  }
  mbox(acc, x, y, w, d, h, col, '#d6d1c8');
  if (h > acc.h) acc.h = h;
  litDots(acc, x, y, w, d, h, R, 0.6, win.light);
  shadowBox(acc, x, y, w, d, h);
  acc.n++;
}

// ---------------------------------------------------------------- old town (Deira / Bur Dubai)
export function genOldtown(acc, L, R, cfg, ok) {
  const lw = L.x1 - L.x0, ld = L.y1 - L.y0;
  if (R() < (cfg.mosque ?? 0.035) && lw > 0.7 && ld > 0.7 && ok((L.x0 + L.x1) / 2, (L.y0 + L.y1) / 2, 0.38)) { mosque(acc, L, R); return true; }
  const nc = Math.max(2, Math.round(lw / 0.24)), nr = Math.max(2, Math.round(ld / 0.24));
  const lane = 0.028;
  const cw = (lw - (nc - 1) * lane) / nc, rd = (ld - (nr - 1) * lane) / nr;
  let any = false;
  const tall = cfg.tall ?? 0.12;
  // mid-zoom masses: 2x2 merged
  const mm = [[0, 0], [0, 0], [0, 0], [0, 0]], mc = [];
  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < nc; c++) {
      const x = L.x0 + c * (cw + lane), y = L.y0 + r * (rd + lane);
      if (!ok(x + cw / 2, y + rd / 2, Math.max(cw, rd) * 0.55)) continue;
      if (R() < 0.06) continue;
      any = true;
      const floors = R() < tall ? 6 + Math.floor(R() * 7) : 2 + Math.floor(Math.pow(R(), 1.2) * 5);
      const h = floors * 3.4;
      const col = pick(OLD, R);
      const w = cw * (0.86 + R() * 0.14), d = rd * (0.86 + R() * 0.14);
      const win = { floor: 3.4, kind: 1, lit: 0.7, light: R() < 0.7 ? LIGHT_WARM : LIGHT_NEUTRAL, glass: '#5f5a52', seed: (x * 997 + y * 13) | 0, mz: 0.9, z0: 4.2 };
      acc.b.box(x, y, w, d, 0, h, col, { top: '#d9cdb5', win, emit: 0.1 });
      // lit shopfronts at street level
      if (R() < 0.7) {
        const sw = { floor: 2.6, kind: 2, lit: 0.97, light: LIGHT_SHOP[(R() * LIGHT_SHOP.length) | 0], glass: '#6b5f4c', seed: (x * 131 + y * 71) | 0, mz: 0.7 };
        acc.b.win([x, y + d], [x + w, y + d], [x, y + d], [x + w, y + d], 0.3, 4.4, 0, 1, sw);
        acc.b.win([x + w, y + d], [x + w, y], [x + w, y + d], [x + w, y], 0.3, 4.4, 1, 0, sw);
      }
      // roof clutter: water tank, stair hut, occasional small dome
      const rr = R();
      if (rr < 0.05) acc.b.dome(x + w / 2, y + d / 2, Math.min(w, d) * 0.3, h, Math.min(w, d) * 100 * 0.3, R() < 0.5 ? '#f2efe8' : '#8fb9a8', { mz: 0.5, sides: 8 });
      else if (rr < 0.6) acc.b.box(x + w * 0.15 + R() * w * 0.4, y + d * 0.2 + R() * d * 0.3, 0.03, 0.03, h, 2.4, R() < 0.5 ? '#eef0f0' : '#d5cbb8', { mz: 1.2 });
      const k = (r < nr / 2 ? 0 : 2) + (c < nc / 2 ? 0 : 1);
      if (h > acc.h) acc.h = h;
      mm[k][0] += h; mm[k][1]++;
      mc[k] = col;
      shadowBox(acc, x, y, w, d, h);
      litDots(acc, x, y, w, d, h, R, 1.6, win.light, 0.8);
      acc.n++;
    }
  }
  if (!any) return false;
  const hw = lw / 2, hd = ld / 2;
  for (let k = 0; k < 4; k++) {
    if (!mm[k][1]) continue;
    const h = mm[k][0] / mm[k][1];
    const x = L.x0 + (k & 1) * hw, y = L.y0 + (k >> 1) * hd;
    mbox(acc, x + 0.01, y + 0.01, hw - 0.03, hd - 0.03, h, mc[k], '#d9cdb5');
  }
  return true;
}

function minaret(acc, x, y, h, col, capCol) {
  const t = 0.018;
  acc.b.box(x - t, y - t, 2 * t, 2 * t, 0, h * 0.75, col, { mz: 0.25 });
  acc.b.box(x - t * 1.5, y - t * 1.5, 3 * t, 3 * t, h * 0.75, 1.5, col, { mz: 0.25, emit: 0.4 });
  acc.b.box(x - t * 0.75, y - t * 0.75, 1.5 * t, 1.5 * t, h * 0.75 + 1.5, h * 0.15, col, { mz: 0.25 });
  acc.b.taper(ringPts(x, y, t * 0.9, 6), h * 0.9 + 1.5, ringPts(x, y, 0.001, 6), h + 4, capCol, { top: false, mz: 0.25 });
  acc.b.glow(x, y, h * 0.75 + 1, 5, LIGHT_MOSQUE, 0.4);
  acc.m.line(x, y, 0, x, y, h, col, 2.4);
}

export function mosque(acc, L, R) {
  const tx = (L.x0 + L.x1) / 2 - 0.5, ty = (L.y0 + L.y1) / 2 - 0.5;
  const col = R() < 0.6 ? '#f4f0e6' : '#ece0c6';
  const domeCol = pick(['#f6f4ee', '#8db8a5', '#d9b45e', '#7ea9c4'], R);
  const x0 = tx + 0.14, y0 = ty + 0.16;
  acc.g.rect(tx + 0.06, ty + 0.06, 0.88, 0.88, 0.15, '#e9e1d0', 0.3);
  // minaret at the back corner (drawn first), hall, dome, then front minaret
  const mh = 28 + R() * 14;
  minaret(acc, x0 - 0.02, y0 - 0.02, mh, col, domeCol);
  const w = 0.58, d = 0.5;
  acc.b.box(x0 + 0.04, y0 + 0.04, w, d, 0, 10, col, { top: '#e6e0d4', emit: 0.12 });
  acc.b.dome(x0 + 0.04 + w / 2, y0 + 0.04 + d / 2, 0.15, 10, 13, domeCol, { sides: 12, steps: 4, mz: 0.2, emit: 0.35 });
  acc.b.glow(x0 + 0.04 + w / 2, y0 + 0.04 + d / 2, 16, 12, LIGHT_MOSQUE, 0.3);
  if (R() < 0.6) minaret(acc, x0 + w + 0.12, y0 + d + 0.12, mh, col, domeCol);
  mbox(acc, x0 + 0.04, y0 + 0.04, w, d, 10, col);
  acc.m.box(x0 + 0.04 + w / 2 - 0.1, y0 + 0.04 + d / 2 - 0.1, 0.2, 0.2, 10, 10, domeCol, { emit: 0.2 });
  acc.h = Math.max(acc.h, mh + 6);
  acc.n++;
}

// ---------------------------------------------------------------- heritage (Al Fahidi)
export function genHeritage(acc, L, R, cfg, ok) {
  const lane = 0.035;
  const n = 2;
  const cw = (Math.min(L.x1 - L.x0, L.y1 - L.y0) - lane) / n;
  let any = false;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x = L.x0 + c * (cw + lane), y = L.y0 + r * (cw + lane);
    if (!ok(x + cw / 2, y + cw / 2, cw * 0.55)) continue;
    any = true;
    const col = pick(CORAL, R);
    const h = 6.5 + R() * 2;
    const t = cw * 0.3;
    acc.g.rect(x + t, y + t, cw - 2 * t, cw - 2 * t, 0.2, '#e3d6bb', 0.5);
    const o = { top: '#d8c7a2', emit: 0.06, win: { floor: 3.4, kind: 1, lit: 0.45, light: LIGHT_WARM, glass: '#6e5d48', seed: (x * 97 + y * 7) | 0, mz: 1.2, z0: 0.5 } };
    // wind tower at the back-left corner (drawn first so the house occludes its base correctly)
    const bt = 0.032, bx = x + t * 0.25, by = y + t * 0.25;
    acc.b.box(x, y, cw, t, 0, h, col, o);
    acc.b.box(x, y + t, t, cw - 2 * t, 0, h, col, o);
    acc.b.box(x + cw - t, y + t, t, cw - 2 * t, 0, h, col, o);
    acc.b.box(x, y + cw - t, cw, t, 0, h, col, o);
    barjeel(acc, bx, by, h, bt, col);
    if (R() < 0.5) barjeel(acc, x + cw - t * 0.75, y + cw - t * 0.75, h, bt * 0.9, col);
    if (R() < 0.5) acc.b.palm(x + cw / 2, y + cw / 2, 0, 9, (x * 13 + y * 7) | 0, 0.5);
    mbox(acc, x, y, cw, cw, h, col, '#d8c7a2');
    litDots(acc, x, y, cw, cw, h, R, 1.2, LIGHT_WARM, 0.5);
    acc.n++;
  }
  return any;
}
function barjeel(acc, x, y, h, t, col) {
  const bh = 7;
  acc.b.box(x - t, y - t, 2 * t, 2 * t, h, bh, col, { top: '#cdb995', mz: 0.35 });
  // vertical vents on the visible faces
  for (let k = 0; k < 3; k++) {
    const f = -t + (k + 0.5) * (2 * t / 3);
    acc.b.line(x + f, y + t + 0.001, h + bh * 0.3, x + f, y + t + 0.001, h + bh * 0.92, '#6d5b45', 0.9, 1.0);
    acc.b.line(x + t + 0.001, y + f, h + bh * 0.3, x + t + 0.001, y + f, h + bh * 0.92, '#6d5b45', 0.9, 1.0);
  }
  acc.h = Math.max(acc.h, h + bh + 1);
}

// ---------------------------------------------------------------- industrial
export function genIndustrial(acc, L, R, cfg, ok) {
  if (R() > (cfg.fill ?? 0.7)) return false;
  const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
  if (R() < (cfg.tanks ?? 0.04) && ok(cx, cy, 0.4)) { tanks(acc, cx - 0.5, cy - 0.5, R); return true; }
  const ins = 0.03;
  const Wd = L.x1 - L.x0 - 2 * ins, Dd = L.y1 - L.y0 - 2 * ins;
  const alongX = R() < 0.5;
  const nb = 1 + Math.floor(R() * 3);
  const gap = 0.06;
  const S = alongX ? Dd : Wd;
  const t = (S - (nb - 1) * gap) / nb;
  let any = false;
  for (let k = 0; k < nb; k++) {
    let x, y, w, d;
    if (alongX) { w = Wd * (0.6 + R() * 0.4); x = L.x0 + ins; y = L.y0 + ins + k * (t + gap); d = t; }
    else { d = Dd * (0.6 + R() * 0.4); x = L.x0 + ins + k * (t + gap); y = L.y0 + ins; w = t; }
    if (w < 0.06 || d < 0.06) continue;
    if (!ok(x + w / 2, y + d / 2, Math.max(w, d) * 0.5)) continue;
    any = true;
    shed(acc, x, y, w, d, 7 + R() * 7, R, cfg);
  }
  return any;
}
function shed(acc, x, y, w, d, h, R, cfg) {
  const col = pick(IND, R), roof = pick(IND_ROOF, R);
  const saw = R() < (cfg.saw ?? 0.35);
  acc.b.box(x, y, w, d, 0, h, col, { top: roof, emit: 0.03 });
  if (saw) {
    // sawtooth roof: teeth running along x, glazed vertical faces facing south
    const n = Math.max(2, Math.round(d / 0.06));
    const td = d / n, th = 3;
    for (let k = 0; k < n; k++) {
      const yy = y + k * td;
      acc.b.poly([[x, yy, h], [x + w, yy, h], [x + w, yy + td, h + th], [x, yy + td, h + th]], roof, 0, 0.5, [0, -1, 1]);
      acc.b.poly([[x + w, yy, h], [x + w, yy + td, h], [x + w, yy + td, h + th]], col, 0, 0.5, [1, 0, 0]);
      acc.b.poly([[x, yy + td, h], [x + w, yy + td, h], [x + w, yy + td, h + th], [x, yy + td, h + th]], '#86a1b4', 0.1, 0.5, [0, 1, 0]);
    }
  } else if (w > 0.15 && d > 0.15) {
    // skylight strips
    const n = 3;
    for (let k = 0; k < n; k++) acc.b.rect(x + w * 0.15, y + d * (k + 0.4) / n, w * 0.7, 0.012, h + 0.05, '#9fb2bf', 0.9);
  }
  mbox(acc, x, y, w, d, h, col, roof);
  if (h + 3 > acc.h) acc.h = h + 3;
  acc.n++;
}
function tanks(acc, tx, ty, R) {
  const n = 2;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const cx = tx + 0.28 + c * 0.44, cy = ty + 0.28 + r * 0.44;
    const rad = 0.12 + R() * 0.05, h = 12 + R() * 8;
    const ring = ringPts(cx, cy, rad, 14);
    acc.b.taper(ring, 0, ring, h, '#eef0ef', { top: '#e2e5e4' });
    acc.b.dome(cx, cy, rad, h, 2.5, '#e2e5e4', { sides: 14, steps: 2, mz: 0.6 });
    acc.m.solid(ringPts(cx, cy, rad, 8), 0, h, '#eef0ef');
    acc.h = Math.max(acc.h, h + 3);
    acc.n++;
  }
}

// ---------------------------------------------------------------- port: containers + cranes
export function genPort(acc, L, R, cfg, ok, quay) {
  // quay: null or [dx, dy] direction towards water
  const tx = Math.floor(L.x0), ty = Math.floor(L.y0);
  let any = false;
  const alongX = quay ? Math.abs(quay[1]) >= Math.abs(quay[0]) : R() < 0.5;
  const S = alongX ? L.y1 - L.y0 : L.x1 - L.x0;
  const rows = Math.max(1, Math.round(S / 0.22));
  const t = S / rows;
  for (let k = 0; k < rows; k++) {
    if (R() < 0.15) continue;
    let x, y, w, d;
    if (alongX) { x = L.x0; y = L.y0 + k * t + 0.01; w = L.x1 - L.x0; d = t - 0.035; }
    else { x = L.x0 + k * t + 0.01; y = L.y0; w = t - 0.035; d = L.y1 - L.y0; }
    if (!ok(x + w / 2, y + d / 2, Math.max(w, d) * 0.5)) continue;
    any = true;
    // container block: segments of different colours/heights
    const nseg = 4;
    for (let q = 0; q < nseg; q++) {
      const h = 2.6 * (1 + Math.floor(R() * 4));
      const col = pick(CONTAINERS, R);
      if (alongX) acc.b.box(x + q * w / nseg, y, w / nseg - 0.006, d, 0, h, col, { top: col });
      else acc.b.box(x, y + q * d / nseg, w, d / nseg - 0.006, 0, h, col, { top: col });
    }
    mbox(acc, x, y, w, d, 7, pick(CONTAINERS, R));
    acc.h = Math.max(acc.h, 12);
    acc.n++;
  }
  if (quay && R() < 0.75) { crane(acc, tx, ty, quay, R); any = true; }
  return any;
}
function crane(acc, tx, ty, q, R) {
  // ship-to-shore gantry crane at the water edge of the tile
  const col = R() < 0.5 ? '#d8483a' : '#2f6fa8';
  const H = 48 + R() * 12;
  const cx = tx + 0.5 + q[0] * 0.32, cy = ty + 0.5 + q[1] * 0.32;
  const along = Math.abs(q[0]) > Math.abs(q[1]) ? [0, 1] : [1, 0]; // crane rail direction
  const span = 0.12;
  const legs = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) legs.push([cx + along[0] * a * 0.06 + q[0] * b * span / 2, cy + along[1] * a * 0.06 + q[1] * b * span / 2]);
  legs.sort((p1, p2) => p1[0] + p1[1] - p2[0] - p2[1]);
  for (const [lx, ly] of legs) acc.b.line(lx, ly, 0, lx, ly, H, col, 2.2, 0.3);
  // boom over the water and back
  const bx0 = cx - q[0] * 0.25, by0 = cy - q[1] * 0.25, bx1 = cx + q[0] * 0.55, by1 = cy + q[1] * 0.55;
  acc.b.line(bx0, by0, H, bx1, by1, H, col, 3, 0.3);
  acc.b.line(cx, cy, H + 12, bx1, by1, H, '#e8e8e8', 1, 0.6);
  acc.b.line(cx, cy, H + 12, bx0, by0, H, '#e8e8e8', 1, 0.6);
  acc.b.line(cx, cy, H, cx, cy, H + 12, col, 2.2, 0.3);
  acc.b.box(cx - 0.03, cy - 0.03, 0.06, 0.06, H - 6, 6, '#eeeeee', { mz: 0.5 });
  acc.m.line(cx, cy, 0, cx, cy, H, col, 2.5);
  acc.m.line(bx0, by0, H, bx1, by1, H, col, 2.5);
  acc.h = Math.max(acc.h, H + 14);
}

// ---------------------------------------------------------------- parks, golf: trees and palms
export function genTrees(acc, L, R, n, palmShare, ok) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const x = L.x0 + R() * (L.x1 - L.x0), y = L.y0 + R() * (L.y1 - L.y0);
    if (ok && !ok(x, y, 0.02)) continue;
    pts.push([x, y, R()]);
  }
  pts.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  for (const [x, y, q] of pts) {
    if (q < palmShare) acc.b.palm(x, y, 0, 8 + q * 8, (x * 991 + y * 37) | 0, 0.45);
    else acc.b.tree(x, y, 0, 6 + q * 5, pick(TREE_COL, () => q), 0.3);
  }
  if (pts.length) acc.h = Math.max(acc.h, 16);
  return pts.length > 0;
}
