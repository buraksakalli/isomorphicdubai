// Procedural city fabric: every building that is not a named landmark.
//   towers        one scene object each (full model >= 0.15, simple shell below), deterministic per tile
//   low-rise      lazily generated clusters (4x4 tiles when all-low, 2x2 / per-tile near towers), LRU-evicted;
//                 batched mid-zoom programs 0.2-0.65 (villa terraces < 0.3), full detail >= 0.65
//   coarse layer  one object per 4x4 tiles for zoom < 0.2
//   underlays     sun shadows of city buildings (half-res, one hull per caster) and night "city glow"
// Exports LANDMARK_CLEARINGS (sites kept free of generic buildings).
import * as GEO from '../data/geo.js';
const { DISTRICTS, ROADS, CREEK, CANAL } = GEO;
import { toWorld, toLatLon, W as GW, H as GH } from '../core/geo.js';
import { run, Prog, sty, styleCount, LIGHT_WARM } from './city/mesh.js';
import { makeTower } from './city/towers.js';
import { TOWER_PALS, rng, lerp, clamp } from './city/palette.js';
import {
  newAcc, flushBatch, genVillas, genMidrise, genOldtown, genHeritage, genIndustrial, genPort, genTrees,
} from './city/lowrise.js';
import { buildPalm } from './city/islands.js';
import { ShadowLayer } from './city/shadows.js';

/** Approximate landmark sites kept free of generic buildings (radius in metres). */
export const LANDMARK_CLEARINGS = [
  // Downtown core (approximate): Burj Khalifa + park, Burj Lake + promenade, The Dubai Mall + its car parks.
  // Kept in step with LAKES 'burj-lake' (js/data/geo.js) and the mall layout in landmarks/downtown.js.
  { id: 'burj-khalifa', lat: 25.1972, lon: 55.2744, r: 230 },
  { id: 'burj-lake', lat: 25.1966, lon: 55.2772, r: 250 },
  { id: 'burj-lake-se', lat: 25.1960, lon: 55.2808, r: 130 },
  { id: 'dubai-mall', lat: 25.1991, lon: 55.2780, r: 240 },
  { id: 'dubai-mall-parking-e', lat: 25.1994, lon: 55.2810, r: 115 },
  { id: 'dubai-mall-parking-n', lat: 25.2005, lon: 55.2778, r: 145 },
  { id: 'burj-al-arab', lat: 25.1412, lon: 55.1853, r: 200 },
  { id: 'museum-of-the-future', lat: 25.2192, lon: 55.2820, r: 150 },
  { id: 'emirates-towers', lat: 25.2172, lon: 55.2828, r: 170 },
  { id: 'dubai-frame', lat: 25.2355, lon: 55.3003, r: 180 },
  { id: 'dubai-opera', lat: 25.1957, lon: 55.2717, r: 215 },
  { id: 'cayan-tower', lat: 25.0888, lon: 55.1407, r: 150 },
  { id: 'al-fahidi-fort', lat: 25.2633, lon: 55.2972, r: 150 },
  { id: 'jumeirah-mosque', lat: 25.2342, lon: 55.2654, r: 150 },
  { id: 'world-trade-centre', lat: 25.2253, lon: 55.2856, r: 180 },
  { id: 'mall-of-the-emirates', lat: 25.1181, lon: 55.2006, r: 300 },
  { id: 'atlantis', lat: 25.1304, lon: 55.1171, r: 300 },
  { id: 'atlantis-the-royal', lat: 25.1385, lon: 55.1277, r: 250 },
  { id: 'etihad-museum', lat: 25.2393, lon: 55.2717, r: 150 },
  { id: 'jumeirah-beach-hotel', lat: 25.1415, lon: 55.1907, r: 200 },
  { id: 'madinat-jumeirah', lat: 25.1325, lon: 55.1845, r: 300 },
  { id: 'the-opus', lat: 25.1883, lon: 55.2724, r: 150 },
  { id: 'jw-marriott-marquis', lat: 25.1856, lon: 55.2581, r: 160 },
  { id: 'dubai-creek-golf-club', lat: 25.2421, lon: 55.3355, r: 250 },
  { id: 'deira-clocktower', lat: 25.2581, lon: 55.3200, r: 150 },
  { id: 'shindagha', lat: 25.2687, lon: 55.2876, r: 200 },
  { id: 'ain-dubai', lat: 25.0796, lon: 55.1204, r: 170 },
  { id: 'the-view-palm', lat: 25.1131, lon: 55.1396, r: 140 },
  { id: 'gold-souk', lat: 25.2697, lon: 55.2963, r: 140 },
  { id: 'meydan-racecourse', lat: 25.1590, lon: 55.2970, r: 520 },
  { id: 'global-village', lat: 25.0712, lon: 55.3087, r: 450 },
  { id: 'dubai-miracle-garden', lat: 25.0603, lon: 55.2441, r: 240 },
  { id: 'al-wasl-dome', lat: 24.9637, lon: 55.1479, r: 350 },
];

// ---- LOD thresholds ----
const TOWER_LO = 0.15;   // below: simple tower shells
const CLUSTER_MID = 0.65; // below: low-rise drawn as batched simplified masses
const CLUSTER_LO = 0.3;  // below: villas merge into per-row terraces
const COARSE = 0.2;      // below: low-rise drawn by the coarse 4x4 layer

// ---- per-district configuration ----
const TOWER_D = {
  downtown: { pal: 'downtown', Hmax: 360, Hmin: 120, prob: 0.72, podium: 0.75 },
  marina: { pal: 'marina', Hmax: 400, Hmin: 140, prob: 0.86, podium: 0.55 },
  jbr: { pal: 'jbr', Hmax: 200, Hmin: 140, prob: 0.93, podium: 0.95, use: 'res' },
  difc: { pal: 'difc', Hmax: 280, Hmin: 90, prob: 0.75, podium: 0.6, use: 'office' },
  szr: { pal: 'szr', Hmax: 330, Hmin: 120, prob: 0.9, podium: 0.4 },
  'business-bay': { pal: 'bb', Hmax: 260, Hmin: 80, prob: 0.72, podium: 0.5 },
  jlt: { pal: 'jlt', Hmax: 250, Hmin: 110, prob: 0.7, podium: 0.3 },
  'creek-harbour': { pal: 'creek', Hmax: 230, Hmin: 70, prob: 0.45, podium: 0.5, use: 'res' },
};
const TOWER_KIND = {
  supertall: { pal: 'downtown', Hmax: 340, Hmin: 120, prob: 0.75, podium: 0.6 },
  highrise: { pal: 'generic', Hmax: 200, Hmin: 60, prob: 0.65, podium: 0.4 },
};
const MID_D = {
  karama: { floors: [3, 8], court: 0.15, towerP: 0.01 },
  satwa: { floors: [2, 5], court: 0.1, towerP: 0 },
  jadaf: { floors: [5, 14], court: 0.2, towerP: 0.08, pal: 'creek' },
  garhoud: { floors: [2, 6], court: 0.15, towerP: 0.01 },
  qusais: { floors: [4, 9], court: 0.3, towerP: 0.01 },
  barsha: { floors: [5, 13], court: 0.25, towerP: 0.05 },
  tecom: { floors: [4, 10], court: 0.2, towerP: 0.1 },
  jvc: { floors: [4, 12], court: 0.25, towerP: 0.06 },
  'sports-city': { floors: [5, 14], court: 0.25, towerP: 0.05 },
  'silicon-oasis': { floors: [4, 12], court: 0.2, towerP: 0.05 },
  'international-city': { floors: [3, 4], court: 0.6, towerP: 0 },
  discovery: { floors: [3, 4], court: 0.4, towerP: 0 },
  'bluewaters-d': { floors: [6, 12], court: 0.3, towerP: 0 },
  'dubai-islands-d': { floors: [4, 9], court: 0.3, towerP: 0.02 },
  downtown: { floors: [4, 8], court: 0.3, towerP: 0, accent: 0.1 },
  _: { floors: [3, 9], court: 0.2, towerP: 0.02 },
};
const VILLA_D = {
  mamzar: { hip: 0.2, grid: [3, 2], pool: 0.5 },
  rashidiya: { hip: 0.3, grid: [3, 3], pool: 0.35 },
  mirdif: { hip: 0.35, grid: [3, 3], pool: 0.45 },
  'nad-al-sheba': { hip: 0.5, grid: [3, 2], pool: 0.6, big: true },
  'jumeirah-1': { hip: 0.2, grid: [3, 2], pool: 0.65, big: true },
  'jumeirah-2': { hip: 0.2, grid: [3, 2], pool: 0.65, big: true },
  'umm-suqeim': { hip: 0.25, grid: [3, 2], pool: 0.65, big: true },
  'emirates-hills': { hip: 0.45, grid: [2, 2], pool: 0.9, big: true },
  'arabian-ranches': { hip: 0.9, grid: [3, 3], pool: 0.55 },
  _: { hip: 0.4, grid: [3, 3], pool: 0.5 },
};
const IND_D = {
  'al-quoz': { fill: 0.68, saw: 0.4, tanks: 0.02 },
  'ras-al-khor-ind': { fill: 0.72, saw: 0.3, tanks: 0.04 },
  'jebel-ali-ind': { fill: 0.55, saw: 0.35, tanks: 0.05 },
  _: { fill: 0.65, saw: 0.35, tanks: 0.03 },
};

// ---- scene objects ----
class CityObj {
  constructor(x, y, bbox, p, pl, lz) {
    this.x = x; this.y = y; this.bbox = bbox; this.p = p; this.pl = pl; this.lz = lz;
  }
  draw(r) {
    const P = r.zoom < this.lz ? this.pl || this.p : this.p;
    if (P) run(r, P);
  }
}

// Lazily generated low-rise cluster: programs are built the first time the cluster is drawn (within a per-frame
// time budget) and evicted LRU when the cache grows past LAZY_BUDGET floats.
const LAZY_BUDGET = 14e6;
const LZ = { app: null, gen: null, spent: 0, frame: 0, total: 0, built: [], t0: 0 };
class Cluster {
  // mode: 'both' (mid program below CLUSTER_MID, full detail above), 'mid' (mid only), 'hi' (detail only)
  constructor(x, y, bbox, tiles, mode = 'both') {
    this.x = x; this.y = y; this.bbox = bbox; this.tiles = tiles; this.mode = mode;
    this.p = null; this.pl = null; this.built = false; this.empty = false; this.used = 0; this.size = 0; this.sh = false;
    if (mode === 'mid') { this.minZoom = COARSE; this.maxZoom = CLUSTER_MID; }
    else if (mode === 'hi') this.minZoom = CLUSTER_MID;
    else this.minZoom = COARSE;
  }
  draw(r) {
    if (!this.built) {
      if (this.empty) return;
      if (r.ctx === LZ.app.ctx && LZ.spent > 14) { LZ.app.renderer.needsFrame = true; return; }
      const t = performance.now();
      LZ.gen(this);
      LZ.spent += performance.now() - t;
      if (!this.built) return;
    }
    this.used = LZ.frame;
    const P = r.zoom < CLUSTER_MID ? (r.zoom < CLUSTER_LO && this.pl2) || this.pl || this.p : this.p || this.pl;
    if (P) run(r, P);
  }
}
function lzTrack(c) {
  LZ.total += c.size;
  LZ.built.push(c);
  if (LZ.total <= LAZY_BUDGET) return;
  LZ.built.sort((a, b) => a.used - b.used);
  let k = 0;
  while (LZ.total > LAZY_BUDGET * 0.7 && k < LZ.built.length) {
    const o = LZ.built[k];
    if (o.used >= LZ.frame - 1) break;
    LZ.total -= o.size; o.p = null; o.pl = null; o.pl2 = null; o.size = 0; o.built = false;
    k++;
  }
  LZ.built = LZ.built.slice(k);
}

function concat(...progs) {
  let n = 0;
  for (const p of progs) n += p.a.length;
  if (!n) return null;
  const out = new Float32Array(n);
  let o = 0;
  for (const p of progs) { out.set(p.a, o); o += p.a.length; }
  return out;
}

// ---- geometry helpers ----
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Spatial hash of thick polylines; clear(x,y) -> distance to the nearest edge (tiles). */
function lineIndex(lines, B = 4) {
  const cells = new Map();
  const segs = [];
  for (const L of lines) {
    for (let i = 0; i < L.pts.length - 1; i++) {
      const [ax, ay] = L.pts[i], [bx, by] = L.pts[i + 1];
      const hw = L.hw0 + (L.hw1 - L.hw0) * (i / Math.max(1, L.pts.length - 2));
      const s = [ax, ay, bx, by, L.hws ? (L.hws[i] + L.hws[i + 1]) / 2 : hw, L.id];
      const id = segs.push(s) - 1;
      const pad = s[4] + 1;
      const x0 = Math.floor((Math.min(ax, bx) - pad) / B), x1 = Math.floor((Math.max(ax, bx) + pad) / B);
      const y0 = Math.floor((Math.min(ay, by) - pad) / B), y1 = Math.floor((Math.max(ay, by) + pad) / B);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const k = cy * 4096 + cx;
        let a = cells.get(k);
        if (!a) cells.set(k, (a = []));
        a.push(id);
      }
    }
  }
  return {
    segs,
    clear(x, y) {
      const a = cells.get(Math.floor(y / B) * 4096 + Math.floor(x / B));
      if (!a) return 99;
      let best = 99;
      for (const id of a) {
        const s = segs[id];
        const d = segDist(x, y, s[0], s[1], s[2], s[3]) - s[4];
        if (d < best) best = d;
      }
      return best;
    },
    near(x, y, id) { // distance to centreline of a given line id
      const a = cells.get(Math.floor(y / B) * 4096 + Math.floor(x / B));
      if (!a) return 99;
      let best = 99;
      for (const k of a) {
        const s = segs[k];
        if (s[5] !== id) continue;
        const d = segDist(x, y, s[0], s[1], s[2], s[3]);
        if (d < best) best = d;
      }
      return best;
    },
  };
}

// ---- main ----
export function buildCity(app) {
  const t0 = performance.now();
  const terrain = app.terrain;
  const T = terrain.T || {};
  const W = terrain.W || GW, H = terrain.H || GH;
  const typeAt = terrain.typeAt;
  const scene = app.scene;

  // districts in world coords
  const DIST = DISTRICTS.map((d) => { const [x, y] = toWorld(d.c[0], d.c[1]); return { ...d, x, y, rT: d.r * 10 }; });
  const DBY = new Map(DIST.map((d) => [d.id, d]));
  const [dcx, dcy] = toWorld(25.1965, 55.2765);
  const realZones = !!(terrain.zoneAt && terrain.zoneAt(dcx, dcy));
  const zoneOf = (x, y) => {
    if (realZones) {
      const z = terrain.zoneAt(x, y);
      if (!z) return null;
      const d = DBY.get(z.id);
      if (d) return d;
      return { id: z.id, kind: z.kind, x: z.x ?? x, y: z.y ?? y, rT: z.rT ?? (z.r ? (z.r > 30 ? z.r : z.r * 10) : 10) };
    }
    for (const d of DIST) { const dx = x - d.x, dy = y - d.y; if (dx * dx + dy * dy <= d.rT * d.rT) return d; }
    return null;
  };


  // buildable ground: with the real terrain only URBAN tiles (DESERT = vacant / open land); the stub has no URBAN
  const hasLots = typeof terrain.lotAt === 'function';
  const BUILD = new Set(hasLots ? [T.URBAN] : [T.URBAN, T.DESERT]);
  const WATERS = new Set([T.SEA, T.SHALLOW, T.WATER].filter((v) => v !== undefined));
  const buildableAt = (x, y) => BUILD.has(typeAt(x, y));
  const isWaterAt = terrain.isWater && hasLots ? (x, y) => terrain.isWater(x, y) : (x, y) => WATERS.has(typeAt(x, y));
  const landAt = terrain.isLand && hasLots ? (x, y) => terrain.isLand(x, y) : () => true;

  // roads (terrain roads: width in tiles; geo data: metres) plus creek/canal (only needed without precise land test)
  const roadSrc = terrain.roads && terrain.roads.length ? terrain.roads.map((r) => ({ id: r.id, pts: r.pts, hw: (r.width > 3 ? r.width / 100 : r.width) / 2 }))
    : ROADS.map((r) => ({ id: r.id, pts: r.pts.map(([la, lo]) => toWorld(la, lo)), hw: r.width / 200 }));
  const lines = roadSrc.map((r) => ({ id: r.id, pts: r.pts, hw0: r.hw + 0.05, hw1: r.hw + 0.05 }));
  if (!hasLots) for (const [id, src] of [['creek', CREEK], ['canal', CANAL]]) {
    lines.push({ id, pts: src.map(([la, lo]) => toWorld(la, lo)), hws: src.map((p) => p[2] / 200 + 0.08), hw0: 0, hw1: 0 });
  }
  const LI = lineIndex(lines);
  const marinaPts = (GEO.MARINA_CANAL || []).map(([la, lo]) => toWorld(la, lo));
  const marinaDist = (x, y) => {
    let best = 99;
    for (let i = 0; i < marinaPts.length - 1; i++) best = Math.min(best, segDist(x, y, marinaPts[i][0], marinaPts[i][1], marinaPts[i + 1][0], marinaPts[i + 1][1]));
    return best;
  };

  // clearings
  const CLR = LANDMARK_CLEARINGS.map((c) => { const [x, y] = toWorld(c.lat, c.lon); return { x, y, r: c.r / 100 }; });
  const inClearing = (x, y, rad) => {
    for (const c of CLR) { const dx = x - c.x, dy = y - c.y, rr = c.r + rad; if (dx * dx + dy * dy < rr * rr) return true; }
    return false;
  };

  /** Is a footprint of radius `rad` (tiles) at (x,y) free for building? */
  const ok = (x, y, rad) => {
    if (!buildableAt(x, y)) return false;
    const r2 = rad * 0.9;
    if (!buildableAt(x - r2, y - r2) || !buildableAt(x + r2, y - r2) || !buildableAt(x - r2, y + r2) || !buildableAt(x + r2, y + r2)) return false;
    const r3 = rad + 0.05; // keep a promenade between buildings and water
    for (let k = 0; k < 9; k++) if (!landAt(x + ((k % 3) - 1) * r3, y + (((k / 3) | 0) - 1) * r3)) return false;
    if (LI.clear(x, y) < rad * 1.1) return false;
    if (inClearing(x, y, rad)) return false;
    return true;
  };
  const lotOf = (tx, ty) => {
    if (hasLots) return terrain.lotAt(tx, ty);
    return { x0: tx + 0.07, y0: ty + 0.07, x1: tx + 0.93, y1: ty + 0.93 };
  };

  // SZR spine (e11)
  const hasE11 = roadSrc.some((r) => r.id === 'e11');
  const [, szrY0] = toWorld(25.234, 55.29), [, szrY1] = toWorld(25.203, 55.27);
  const szrDist = (x, y) => (hasE11 ? LI.near(x, y, 'e11') : 99);

  const stats = { towers: 0, clusters: 0, coarse: 0, byKind: {} };
  const bump = (k, n = 1) => { stats.byKind[k] = (stats.byKind[k] || 0) + n; };
  const glowGrid = new Float32Array(Math.ceil(W / 6) * Math.ceil(H / 6));
  const GWc = Math.ceil(W / 6);
  const addGlow = (x, y, v) => { const i = Math.floor(y / 6) * GWc + Math.floor(x / 6); if (i >= 0 && i < glowGrid.length) glowGrid[i] += v; };

  const shadows = new ShadowLayer(W, H);
  const addShadow = (sh, mz) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of sh.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    shadows.add(x0, y0, x1, y1, sh.h, mz);
  };
  scene.underlays.push((r) => { LZ.spent = 0; LZ.frame++; shadows.draw(r, r.cam); });
  const addTower = (t, cx, cy, kind) => {
    const o = new CityObj(cx, cy, t.bbox, t.hi, t.lo, TOWER_LO);
    for (const sh of t.shadow) addShadow(sh, sh.h < 110 ? 0.12 : 0);
    o.depth = cx + cy;
    scene.add(o);
    stats.towers++;
    bump(kind);
    addGlow(cx, cy, t.h / 60);
    return o;
  };

  // ---- pass 1: plan each tile ----
  const P_NONE = 0, P_TOWER = 1, P_VILLA = 2, P_MID = 3, P_OLD = 4, P_HER = 5, P_IND = 6, P_PORT = 7, P_PARK = 8, P_GOLF = 9;
  const plan = new Uint8Array(W * H);
  const pdist = new Array(W * H); // district per planned tile
  const pout = new Float32Array(W * H); // tiles beyond the district circle (sprawl)
  const towerSeeds = [];
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const cx = tx + 0.5, cy = ty + 0.5;
      const t = typeAt(cx, cy);
      const i = ty * W + tx;
      if (t === T.PARK) { plan[i] = P_PARK; continue; }
      if (t === T.GOLF) { plan[i] = P_GOLF; continue; }
      if (!BUILD.has(t)) continue;
      const d = zoneOf(cx, cy);
      if (!d) { if (t === T.URBAN) { plan[i] = P_MID; pdist[i] = null; } continue; }
      if (d.island && /^palm/.test(d.id)) continue; // palms: see islands.js
      if (d.id === 'bluewaters-d') { pdist[i] = d; plan[i] = P_MID; continue; }
      pdist[i] = d;
      const out = Math.max(0, Math.hypot(cx - d.x, cy - d.y) - d.rT);
      pout[i] = out;
      const near = Math.exp(-out / 2.5); // 1 inside the district circle, fading through the sprawl
      const R = rng((tx * 73856093) ^ (ty * 19349663));
      const kind = d.kind;
      // SZR wall of towers
      const sd = cy > szrY0 - 3 && cy < szrY1 + 3 ? szrDist(cx, cy) : szrDist(cx, cy);
      if (sd < 2.4 && cy >= szrY0 && cy <= szrY1 && kind !== 'heritage' && kind !== 'park') {
        if (R() < 0.93) { plan[i] = P_TOWER; towerSeeds.push([tx, ty, 'szr', d]); continue; }
      }
      if (kind === 'supertall' || kind === 'highrise') {
        const cfg = TOWER_D[d.id] || TOWER_KIND[kind];
        const pr = d.id === 'marina' && marinaPts.length ? (marinaDist(cx, cy) < 4 ? 0.95 : 0.55) : cfg.prob;
        if (R() < pr * near) { plan[i] = P_TOWER; towerSeeds.push([tx, ty, 'district', d]); }
        else plan[i] = P_MID;
        continue;
      }
      if (kind === 'midrise' || kind === 'mixed') {
        const mc = MID_D[d.id] || MID_D._;
        const nearSZR = sd < 2.2;
        if (kind === 'mixed') {
          const cell = rng(((tx / 3) | 0) * 7919 + ((ty / 3) | 0) * 104729)();
          if (cell < 0.4) { plan[i] = P_VILLA; continue; }
          if (cell > 0.94) { plan[i] = P_PARK; continue; }
          if ((cell > 0.86 && near > 0.5) || (nearSZR && R() < 0.3)) { plan[i] = P_TOWER; towerSeeds.push([tx, ty, 'mixed', d]); continue; }
          plan[i] = P_MID; continue;
        }
        if (R() < (nearSZR ? 0.35 : mc.towerP * near)) { plan[i] = P_TOWER; towerSeeds.push([tx, ty, nearSZR ? 'szr-edge' : 'mid', d]); continue; }
        plan[i] = P_MID; continue;
      }
      if (kind === 'villa') { plan[i] = P_VILLA; continue; }
      if (kind === 'oldtown') { plan[i] = out > 3 ? P_MID : P_OLD; continue; }
      if (kind === 'heritage') { plan[i] = out > 0.5 ? P_OLD : P_HER; continue; }
      if (kind === 'industrial') {
        if (sd < 2.0 && R() < 0.3) { plan[i] = P_TOWER; towerSeeds.push([tx, ty, 'szr-edge', d]); continue; }
        plan[i] = P_IND; continue;
      }
      if (kind === 'port') { plan[i] = P_PORT; continue; }
      if (kind === 'park') { plan[i] = P_PARK; continue; }
      if (kind === 'golf') { plan[i] = P_GOLF; continue; }
    }
  }

  // ---- towers ----
  for (const [tx, ty, mode, d] of towerSeeds) {
    const i = ty * W + tx;
    const R = rng((tx * 2654435761) ^ (ty * 40503) ^ 0x51ed);
    const L = lotOf(tx, ty);
    if (!L) { plan[i] = P_NONE; continue; }
    const cx = (L.x0 + L.x1) / 2, cy = (L.y0 + L.y1) / 2;
    let lw = Math.min(0.4, (L.x1 - L.x0) / 2 - 0.02), ld = Math.min(0.4, (L.y1 - L.y0) / 2 - 0.02);
    let k = 1;
    while (k > 0.45 && !ok(cx, cy, Math.max(lw, ld) * k * 0.9)) k -= 0.1;
    lw *= k; ld *= k;
    if (Math.min(lw, ld) < 0.14) { plan[i] = P_MID; continue; }
    // the shrink loop above can bottom out without a valid fit: never let a tower stand inside a landmark clearing
    if (inClearing(cx, cy, Math.max(lw, ld) * 0.8)) { plan[i] = P_MID; continue; }
    let cfg, Ht, kind;
    if (mode === 'szr') {
      cfg = { pal: TOWER_PALS.szr, podium: 0.35, use: R() < 0.6 ? 'office' : 'res' };
      const lat = toLatLon(cx, cy)[0];
      const peak = 1 - Math.min(1, Math.abs(lat - 25.218) / 0.018);
      Ht = lerp(130, 330, peak * 0.8 + R() * 0.2) * (0.7 + R() * 0.4);
      kind = 'szr';
    } else if (mode === 'district') {
      const dc = TOWER_D[d.id] || TOWER_KIND[d.kind];
      cfg = { pal: TOWER_PALS[dc.pal], podium: dc.podium, use: dc.use };
      let dd = clamp(Math.hypot(cx - d.x, cy - d.y) / d.rT, 0, 1.6);
      if (d.id === 'marina' && marinaPts.length) dd = clamp(marinaDist(cx, cy) / 7 + Math.max(0, dd - 1), 0, 1.6); // tallest along the canal
      Ht = lerp(dc.Hmax, dc.Hmin, Math.pow(Math.min(1, dd), 0.85)) * (0.62 + R() * 0.5);
      if (dd > 1) Ht *= 1 - (dd - 1) * 0.6;
      if (R() < 0.12) Ht = dc.Hmin * (0.45 + R() * 0.4);
      kind = d.kind;
    } else if (mode === 'szr-edge') {
      cfg = { pal: TOWER_PALS.generic, podium: 0.4 };
      Ht = 60 + R() * 120;
      kind = 'highrise';
    } else {
      const mc = MID_D[d.id] || MID_D._;
      cfg = { pal: TOWER_PALS[mc.pal || 'generic'], podium: 0.4 };
      Ht = 50 + R() * 90;
      kind = 'highrise';
    }
    Ht = clamp(Ht, 45, 430);
    if (Math.min(lw, ld) < 0.28) Ht = Math.min(Ht, 210);
    if (Ht < 220 && Math.min(lw, ld) >= 0.3 && R() < 0.2) {
      const ax = R() < 0.5;
      for (const sgn of [-1, 1]) {
        const ccx = ax ? cx + sgn * lw * 0.52 : cx, ccy = ax ? cy : cy + sgn * ld * 0.52;
        const t = makeTower(ccx, ccy, ax ? lw * 0.46 : lw, ax ? ld : ld * 0.46, Ht * (0.75 + R() * 0.3), { ...cfg, slim: true }, (i * 7 + (sgn + 2)) | 0);
        addTower(t, ccx, ccy, kind);
      }
    } else {
      addTower(makeTower(cx, cy, lw, ld, Ht, cfg, i), cx, cy, kind);
    }
  }

  // ---- low-rise: lazy clusters + coarse overview masses ----
  const quayDir = (tx, ty) => {
    const cx = tx + 0.5, cy = ty + 0.5;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) if (isWaterAt(cx + dx * 0.8, cy + dy * 0.8)) return [dx, dy];
    return null;
  };
  const nearWater = (tx, ty, k) => {
    for (let q = 1; q <= k; q++) if (isWaterAt(tx + 0.5 - q, ty + 0.5) || isWaterAt(tx + 0.5, ty + 0.5 - q) || isWaterAt(tx + 0.5 + q, ty + 0.5) || isWaterAt(tx + 0.5, ty + 0.5 + q)) return true;
    return false;
  };
  const midCfg = (i) => {
    const d = pdist[i];
    if (!d) return { floors: [2, 4], court: 0.1 };
    const out = pout[i];
    let mc = MID_D[d.id];
    if (!mc) {
      if (d.kind === 'supertall') mc = out > 0 ? { floors: [4, 10], court: 0.25 } : MID_D.downtown;
      else if (d.kind === 'highrise') mc = out > 4 ? { floors: [4, 9], court: 0.25 } : { floors: [6, 14], court: 0.2 };
      else if (d.kind === 'oldtown') mc = { floors: [3, 7], court: 0.15 };
      else mc = MID_D._;
    }
    return mc;
  };
  const genTile = (acc, tx, ty) => {
    const i = ty * W + tx, p = plan[i], d = pdist[i];
    const L = p === P_PARK || p === P_GOLF ? { x0: tx + 0.05, y0: ty + 0.05, x1: tx + 0.95, y1: ty + 0.95 } : lotOf(tx, ty);
    if (!L) return false;
    const R = rng((tx * 668265263) ^ (ty * 374761393) ^ 0x2b);
    switch (p) {
      case P_VILLA: return genVillas(acc, L, R, VILLA_D[d && d.id] || VILLA_D._, ok);
      case P_MID: return genMidrise(acc, L, R, midCfg(i), ok);
      case P_OLD: return genOldtown(acc, L, R, { tall: d && d.id === 'deira' ? 0.26 : 0.14 }, ok);
      case P_HER: return genHeritage(acc, L, R, {}, ok);
      case P_IND: return genIndustrial(acc, L, R, IND_D[d && d.id] || IND_D._, ok);
      case P_PORT: {
        const q = quayDir(tx, ty);
        return q || nearWater(tx, ty, 3) ? genPort(acc, L, R, {}, ok, q) : genIndustrial(acc, L, R, { fill: 0.7, saw: 0.2 }, ok);
      }
      case P_PARK: return genTrees(acc, L, R, 4 + Math.floor(R() * 6), 0.45, (x, y) => landAt(x, y) && !isWaterAt(x, y) && !inClearing(x, y, 0) && LI.clear(x, y) > 0.03);
      case P_GOLF: return R() < 0.22 ? genTrees(acc, L, R, 2 + Math.floor(R() * 3), 0.85, (x, y) => landAt(x, y) && !isWaterAt(x, y) && LI.clear(x, y) > 0.03) : false;
      default: return false;
    }
  };
  LZ.app = app;
  LZ.gen = (c) => {
    const acc = newAcc();
    let any = false;
    for (const [tx, ty] of c.tiles) any = genTile(acc, tx, ty) || any;
    flushBatch(acc);
    const p = any && c.mode !== 'mid' ? concat(acc.g, acc.b) : null;
    const pl = any && c.mode !== 'hi' && acc.m.a.length ? Float32Array.from(acc.m.a) : null;
    const pl2 = pl && acc.m2 && acc.m2.a.length < acc.m.a.length ? Float32Array.from(acc.m2.a) : null;
    if (!p && !pl) { c.empty = true; return; }
    c.p = p; c.pl = pl; c.pl2 = pl2; c.built = true;
    c.size = (p ? p.length : 0) + (pl ? pl.length : 0) + (pl2 ? pl2.length : 0);
    if (!c.sh && c.mode !== 'mid') { c.sh = true; for (const sh of acc.shadow) addShadow(sh, 0.5); }
    lzTrack(c);
  };
  // height upper bound / coarse mass estimate per plan
  const EST = { [P_VILLA]: [16, 6], [P_MID]: [55, 0], [P_OLD]: [50, 11], [P_HER]: [18, 7], [P_IND]: [24, 9], [P_PORT]: [80, 6], [P_PARK]: [18, 0], [P_GOLF]: [18, 0] };
  const GLOW = { [P_VILLA]: 0.12, [P_MID]: 0.45, [P_OLD]: 0.7, [P_HER]: 0.4, [P_IND]: 0.08, [P_PORT]: 0.25 };
  const coarse = new Map();
  const addMass = (tx, ty, p, i) => {
    let h = EST[p][1];
    const R = rng((tx * 31337) ^ (ty * 7331));
    let col = '#e6dccb', top = '#ddd6c9';
    if (p === P_MID) { const f = midCfg(i).floors; h = lerp(f[0], f[1], 0.35 + R() * 0.3) * 3.3 * 0.8; col = MID_COLS[(R() * MID_COLS.length) | 0]; top = '#d9d3c8'; }
    else if (p === P_VILLA) { col = '#efe6d6'; top = R() < (VILLA_D[pdist[i] && pdist[i].id] || VILLA_D._).hip ? '#c98a66' : '#e2dccf'; }
    else if (p === P_OLD) { col = '#dcc69d'; top = '#d4c5a8'; }
    else if (p === P_IND) { if (R() > 0.7) return; col = '#cfd3d5'; top = '#c4cace'; }
    else if (p === P_PORT) { col = ['#c0473a', '#3b78b0', '#d9822b', '#3f8f5a'][(R() * 4) | 0]; top = col; }
    else if (p === P_HER) { col = '#dcc8a0'; top = '#d8c7a2'; }
    if (!h) return;
    const L = lotOf(tx, ty);
    if (!L) return;
    const k = Math.floor(tx / 4) + ',' + Math.floor(ty / 4);
    let a = coarse.get(k);
    if (!a) coarse.set(k, (a = []));
    const ix = (L.x1 - L.x0) * 0.08, iy = (L.y1 - L.y0) * 0.08;
    a.push({ x0: L.x0 + ix, y0: L.y0 + iy, x1: L.x1 - ix, y1: L.y1 - iy, h, col, top });
  };
  const LOWONLY = new Set([P_VILLA, P_PARK, P_GOLF, P_IND, P_PORT]);
  const emitCluster = (tiles, mode) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, h = 0;
    for (const [tx, ty] of tiles) {
      x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx + 1); y1 = Math.max(y1, ty + 1);
      h = Math.max(h, EST[plan[ty * W + tx]][0]);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const o = new Cluster(cx, cy, { x0: x0 - 0.1, y0: y0 - 0.1, x1: x1 + 0.1, y1: y1 + 0.1, h: h + 6 }, tiles, mode);
    o.depth = cx + cy;
    scene.add(o);
    stats.clusters++;
  };
  for (let cy = 0; cy < H; cy += 4) {
    for (let cx = 0; cx < W; cx += 4) {
      const tiles = [];
      let hasTower = false, allLow = true;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
        const tx = cx + dx, ty = cy + dy;
        if (tx >= W || ty >= H) continue;
        const i = ty * W + tx, p = plan[i];
        if (p === P_TOWER) { hasTower = true; continue; }
        if (p === P_NONE) continue;
        tiles.push([tx, ty]);
        if (!LOWONLY.has(p)) allLow = false;
        bump(['', '', 'villa', 'midrise', 'oldtown', 'heritage', 'industrial', 'port', 'trees', 'golf'][p]);
        if (EST[p][1]) addMass(tx, ty, p, i);
        if (GLOW[p]) addGlow(tx + 0.5, ty + 0.5, GLOW[p]);
      }
      if (!tiles.length) continue;
      if (hasTower) {
        // tower-free 2x2 sub-cells stay grouped; sub-cells containing a tower are split per tile
        for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
          const sub = tiles.filter(([tx, ty]) => ((tx - cx) >> 1) === sx && ((ty - cy) >> 1) === sy);
          if (!sub.length) continue;
          let tw = false;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const tx = cx + sx * 2 + dx, ty = cy + sy * 2 + dy;
            if (tx < W && ty < H && plan[ty * W + tx] === P_TOWER) tw = true;
          }
          if (tw) for (const t of sub) emitCluster([t], 'both');
          else emitCluster(sub, 'both');
        }
      }
      else if (allLow) emitCluster(tiles, 'both');
      else {
        emitCluster(tiles, 'mid');
        for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
          const sub = tiles.filter(([tx, ty]) => ((tx - cx) >> 1) === sx && ((ty - cy) >> 1) === sy);
          if (sub.length) emitCluster(sub, 'hi');
        }
      }
    }
  }

  // ---- islands: Palm Jumeirah, Bluewaters ----
  try {
    const isl = buildPalm(app, { ok, landAt, isWaterAt, inClearing, addTower, addShadow, LI, Cluster, CityObj, scene, COARSE, CLUSTER_MID, lzTrack });
    if (isl) for (const k in isl) bump(k, isl[k]);
  } catch (e) { console.warn('[city] islands', e); }

  // ---- coarse overview layer ----
  for (const [, masses] of coarse) {
    const P = new Prog();
    masses.sort((a, b) => (a.col < b.col ? -1 : a.col > b.col ? 1 : 0));
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, h = 0;
    for (const m of masses) {
      x0 = Math.min(x0, m.x0); y0 = Math.min(y0, m.y0); x1 = Math.max(x1, m.x1); y1 = Math.max(y1, m.y1); h = Math.max(h, m.h);
    }
    for (const pass of [0, 1, 2]) {
      for (const m of masses) {
        const { x0: a, y0: b, x1: c, y1: d } = m, hh = m.h;
        if (pass === 0) P.face(sty(m.col, 0, 1, 0, 0.07), 0, [[a, d, 0], [c, d, 0], [c, d, hh], [a, d, hh]]);
        else if (pass === 1) P.face(sty(m.col, 1, 0, 0, 0.07), 0, [[c, d, 0], [c, b, 0], [c, b, hh], [c, d, hh]]);
        else P.face(sty(m.top, 0, 0, 1), 0, [[a, b, hh], [c, b, hh], [c, d, hh], [a, d, hh]]);
      }
    }
    const lights = [];
    for (const m of masses) if (m.h > 4 && ((m.x0 * 7.3 + m.y0 * 3.1) % 1) < 0.75) lights.push([(m.x0 + m.x1) / 2, m.y1, m.h * 0.5]);
    P.dots(lights, LIGHT_WARM, 0, 1);
    const o = new CityObj((x0 + x1) / 2, (y0 + y1) / 2, { x0, y0, x1, y1, h: h + 2 }, P.done(), null, 0);
    o.maxZoom = COARSE;
    o.depth = (x0 + x1) / 2 + (y0 + y1) / 2;
    scene.add(o);
    stats.coarse++;
  }

  // ---- night city glow (underlay) ----
  const glows = [];
  for (let gy = 0; gy * 6 < H; gy++) for (let gx = 0; gx < GWc; gx++) {
    const v = glowGrid[gy * GWc + gx];
    if (v < 1.5) continue;
    glows.push([gx * 6 + 3, gy * 6 + 3, Math.min(1, v / 22)]);
  }
  let spr = null;
  scene.underlays.push((r) => {
    if (r.night < 0.08 || !glows.length) return;
    if (!spr) {
      spr = document.createElement('canvas'); spr.width = spr.height = 64;
      const g = spr.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,176,102,0.9)'); grd.addColorStop(0.45, 'rgba(255,150,80,0.35)'); grd.addColorStop(1, 'rgba(255,140,70,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    }
    const c = r.ctx;
    c.globalCompositeOperation = 'lighter';
    const rw = 6.5 * 1.414 * r.kx, rh = 6.5 * 1.414 * r.ky;
    for (const [x, y, v] of glows) {
      const X = r.ox + (x - y) * r.kx, Y = r.oy + (x + y) * r.ky;
      if (X < -rw || X > r.vw + rw || Y < -rh || Y > r.vh + rh) continue;
      c.globalAlpha = r.night * 0.42 * v;
      c.drawImage(spr, X - rw, Y - rh, rw * 2, rh * 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  });

  stats.count = stats.towers + stats.clusters + stats.coarse + (stats.byKind.islandObjs || 0);
  stats.styles = styleCount();
  stats.ms = Math.round(performance.now() - t0);
  stats.realTerrain = hasLots;
  return stats;
}

const MID_COLS = ['#efe6d6', '#e8dcc6', '#f3eee5', '#e3d2b8', '#ddd6ca', '#f0e1cc'];
