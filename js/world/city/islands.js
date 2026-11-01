// Palm Jumeirah fabric, generated from the terrain's palm geometry (terrain.palms):
//   fronds  -> rows of villas with pools and palms on both sides of the spine road
//   trunk   -> Shoreline-style apartment slabs perpendicular to the trunk, a few towers near the base
//   crescent-> resort hotels along the arc (Atlantis itself is a landmark and kept clear)
import { Prog, rrect, lightIdx, LIGHT_WARM, LIGHT_NEUTRAL } from './mesh.js';
const LIGHT_POOL = lightIdx('#5fe8ff');
import { MAT, TOWER_PALS, VILLA_WALL, VILLA_ROOF, POOL, POOL_EDGE, LAWN, rng, pick } from './palette.js';
import { makeTower } from './towers.js';

function along(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return {
    len: cum[cum.length - 1],
    at(s) {
      let i = 1;
      while (i < pts.length - 1 && cum[i] < s) i++;
      const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1e-6;
      const t = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
      const ux = (b[0] - a[0]) / seg, uy = (b[1] - a[1]) / seg;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ux, uy];
    },
  };
}

export function buildPalm(app, K) {
  const t = app.terrain;
  if (!t || !t.palms || !t.palms.length) return null;
  const out = { 'palm-villa': 0, 'palm-apartment': 0, 'palm-hotel': 0, islandObjs: 0 };
  const { landAt, inClearing, addTower, Cluster, CityObj, scene, addShadow, CLUSTER_MID } = K;
  const free = (x, y, rad) => landAt(x, y) && !inClearing(x, y, rad) && K.LI.clear(x, y) > rad * 0.7;
  const shadowQuad = (pts, h) => addShadow({ pts, h }, 0);

  // helper: one static object from a list of "items" (each draws into ground/build progs), sorted back-to-front
  const emit = (items, h) => {
    if (!items.length) return;
    items.sort((a, b) => a.d - b.d);
    const g = new Prog(), b = new Prog(), m = new Prog();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const it of items) {
      it.fn(g, b, m);
      x0 = Math.min(x0, it.x - 0.3); y0 = Math.min(y0, it.y - 0.3); x1 = Math.max(x1, it.x + 0.3); y1 = Math.max(y1, it.y + 0.3);
    }
    const P = new Float32Array(g.a.length + b.a.length);
    P.set(g.a, 0); P.set(b.a, g.a.length);
    const o = new CityObj((x0 + x1) / 2, (y0 + y1) / 2, { x0, y0, x1, y1, h }, P, m.a.length ? Float32Array.from(m.a) : null, CLUSTER_MID);
    o.depth = o.x + o.y;
    scene.add(o);
    out.islandObjs++;
  };

  for (const palm of t.palms) {
    const jumeirah = palm.id === 'palm-jumeirah';
    const R = rng(jumeirah ? 4242 : 777);
    const density = jumeirah ? 1 : 0.18; // Palm Jebel Ali: mostly still undeveloped

    // ---- fronds: villas both sides of the spine ----
    for (const f of palm.fronds) {
      const A = along(f.pts);
      const half = (f.w || 0.78) / 2;
      const off = half * 0.55;
      const pitch = 0.2;
      let items = [];
      for (let s = 0.35; s < A.len - 0.12; s += pitch) {
        const [px, py, ux, uy] = A.at(s);
        const nx = -uy, ny = ux;
        for (const side of [-1, 1]) {
          if (R() > density * 0.94) continue;
          const cx = px + nx * side * off, cy = py + ny * side * off;
          if (!free(cx, cy, 0.08)) continue;
          const col = pick(VILLA_WALL, R), hip = R() < 0.45, roof = pick(VILLA_ROOF, R);
          const a = 0.07, bw = 0.06, h = 7.5;
          const seed = (cx * 997 + cy * 131) | 0;
          // pool + palm on the water side
          const qx = cx + nx * side * (bw + 0.05), qy = cy + ny * side * (bw + 0.05);
          const pool = rrect(qx, qy, ux, uy, 0.045, 0.02), poolEdge = rrect(qx, qy, ux, uy, 0.052, 0.027);
          const lawn = rrect(cx + nx * side * 0.03, cy + ny * side * 0.03, ux, uy, 0.095, 0.1);
          const pw = [qx + ux * 0.07, qy + uy * 0.07];
          items.push({
            x: cx, y: cy, d: cx + cy,
            fn: (g, b, m) => {
              g.flat(lawn, 0.2, LAWN, 0.6);
              g.flat(poolEdge, 0.25, POOL_EDGE, 0.45);
              g.flat(pool, 0.3, POOL, 0.45);
              g.glow(qx, qy, 0.5, 5, LIGHT_POOL, 0.75);
              const fp = rrect(cx, cy, ux, uy, a, bw);
              b.solid(fp, 0, h, col, { top: '#e4ddd0', emit: 0.07,
                win: { floor: 3.6, kind: 1, lit: 0.5, light: LIGHT_WARM, glass: '#5c6670', seed, mz: 1.4, z0: 0.6 } });
              if (hip) b.hipRoofR(cx, cy, ux, uy, a + 0.006, bw + 0.006, h, 3.2, roof);
              b.palm(pw[0], pw[1], 0, 9 + (seed & 3), seed, 0.5);
              m.solid(fp, 0, h + (hip ? 2 : 0), col, { top: hip ? roof : '#e4ddd0', emit: 0.07 });
            },
          });
          out['palm-villa']++;
        }
        if (items.length >= 14) { emit(items, 16); items = []; }
      }
      emit(items, 16);
    }
    if (!jumeirah) continue;

    // ---- trunk: apartment slabs perpendicular to the axis, towers near the base ----
    const [ux, uy] = palm.u, [nx, ny] = palm.n;
    const L = palm.length, TW = palm.trunkW;
    for (let s = 1.2; s < L - 0.8; s += 0.95) {
      for (const side of [-1, 1]) {
        const across = TW * 0.3;
        const cx = palm.base[0] + ux * s + nx * side * across, cy = palm.base[1] + uy * s + ny * side * across;
        if (!free(cx, cy, 0.2)) continue;
        const nearBase = s < L * 0.25;
        if (nearBase && R() < 0.5) {
          const tw = makeTower(cx, cy, 0.24, 0.24, 90 + R() * 110, { pal: TOWER_PALS.marina, podium: 0.6, use: 'res' }, (s * 100 + side * 7) | 0);
          addTower(tw, cx, cy, 'palm-apartment');
          out['palm-apartment']++;
          continue;
        }
        const mat = MAT[pick(['white', 'ivory', 'champ', 'sand', 'white2'], R)];
        const h = 30 + Math.floor(R() * 5) * 3.3;
        // slab: long axis across the trunk (along n), short along u
        const a = TW * 0.17, bw = 0.075;
        const fp = rrect(cx, cy, nx, ny, a, bw);
        const win = { floor: 3.3, kind: 1, lit: 0.55, light: LIGHT_WARM, glass: mat.g, seed: (cx * 131 + cy * 17) | 0, mz: 0.3 };
        const P = new Prog(), Lo = new Prog();
        P.solid(fp, 0, h, mat.c, { top: mat.top, win, emit: 0.06 });
        // rooftop pergola / plant
        P.solid(rrect(cx, cy, nx, ny, a * 0.3, bw * 0.6), h, h + 3, '#d0d2d4', { mz: 0.8 });
        Lo.solid(fp, 0, h, mat.c, { top: mat.top, emit: 0.06 });
        const o = new CityObj(cx, cy, { x0: cx - a - 0.1, y0: cy - a - 0.1, x1: cx + a + 0.1, y1: cy + a + 0.1, h: h + 4 }, P.done(), Lo.done(), CLUSTER_MID);
        o.depth = cx + cy;
        scene.add(o);
        shadowQuad(fp, h);
        out['palm-apartment']++; out.islandObjs++;
      }
    }

    // ---- crescent: resort hotels along the arc ----
    const C = palm.crescent;
    const steps = 44;
    for (let k = 0; k <= steps; k++) {
      const f = -1 + (2 * k) / steps;
      if (Math.abs(f) < 0.08) continue; // apex = Atlantis
      if (Math.abs(Math.abs(f) - 0.62) < 0.05) continue; // breakwater openings
      if (R() < 0.25) continue;
      const ang = C.a0 + f * C.span;
      const cx = C.c[0] + Math.cos(ang) * C.r, cy = C.c[1] + Math.sin(ang) * C.r;
      if (!free(cx, cy, 0.3)) continue;
      const tx = -Math.sin(ang), ty = Math.cos(ang); // tangent
      const mat = MAT[pick(TOWER_PALS.hotel.mats, R)];
      const H = 22 + R() * 40;
      const a = 0.45 + R() * 0.3, bw = Math.min(0.22, C.w * 0.22);
      const P = new Prog(), Lo = new Prog();
      const win = { floor: 3.5, kind: 1, lit: 0.65, light: R() < 0.6 ? LIGHT_WARM : LIGHT_NEUTRAL, glass: mat.g, seed: (cx * 71 + cy * 13) | 0, mz: 0.3 };
      // stepped wings: centre tallest; build from the back (smaller x+y) to the front
      const parts = [];
      for (const [o, fh, fa] of [[-1, 0.7, 0.34], [0, 1, 0.32], [1, 0.8, 0.34]]) {
        const pcx = cx + tx * o * a * 0.66, pcy = cy + ty * o * a * 0.66;
        parts.push([pcx + pcy, rrect(pcx, pcy, tx, ty, a * fa, bw), H * fh]);
      }
      parts.sort((p1, p2) => p1[0] - p2[0]);
      for (const [, fp, h] of parts) {
        P.solid(fp, 0, h, mat.c, { top: mat.top, win, emit: 0.08 });
        Lo.solid(fp, 0, h, mat.c, { top: mat.top, emit: 0.08 });
        if (h >= 25) shadowQuad(fp, h);
      }
      // pool deck + palms on the lagoon side
      const lx = cx - Math.cos(ang) * (bw + 0.12), ly = cy - Math.sin(ang) * (bw + 0.12);
      const deck = new Prog();
      deck.flat(rrect(lx, ly, tx, ty, a * 0.6, 0.07), 0.3, POOL_EDGE, 0.4);
      deck.flat(rrect(lx, ly, tx, ty, a * 0.45, 0.04), 0.35, POOL, 0.4);
      for (let q = -2; q <= 2; q++) P.palm(lx + tx * q * a * 0.25 - Math.cos(ang) * 0.09, ly + ty * q * a * 0.25 - Math.sin(ang) * 0.09, 0, 11, (k * 13 + q) & 255, 0.5);
      const all = new Float32Array(deck.a.length + P.a.length);
      all.set(deck.a, 0); all.set(P.a, deck.a.length);
      const ext = a + 0.3;
      const o = new CityObj(cx, cy, { x0: cx - ext, y0: cy - ext, x1: cx + ext, y1: cy + ext, h: H + 6 }, all, Lo.done(), CLUSTER_MID);
      o.depth = cx + cy;
      scene.add(o);
      out['palm-hotel']++; out.islandObjs++;
    }
  }
  return out;
}
