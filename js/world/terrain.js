// Terrain: land/sea/creek/islands grid, district zoning, local street grid and cached ground painting.
//
// ── Interface returned by buildTerrain(app) (see CONTRACT.md) ─────────────────────────────────────────
//   W, H                     grid size in tiles (1 tile = 100 m)
//   T                        tile type enum (also exported): SEA SHALLOW BEACH DESERT URBAN ROAD PARK WATER RUNWAY GOLF
//                            WETLAND PLAZA APRON AIRFIELD ROCK
//   types: Uint8Array(W*H)   tile types, row-major (y * W + x)
//   typeAt(x, y)             type of the tile containing (x, y); SEA outside the grid
//   isLand(x, y) / isWater(x, y)   precise (50 m) land test, independent of tile rounding (inland water = water)
//   zoneAt(x, y)             district object or null. Inside a district circle the FIRST match in DISTRICTS wins;
//                            island tiles use their island district; airports claim a rectangle around their runways;
//                            other land inside URBAN_ENVELOPE joins the nearest growable district (continuous city),
//                            outside it only within a short noisy reach. A few sprawl tiles are vacant lots (T.DESERT).
//   districts                [{ id, name:{en,ar}, kind, x, y, r /*tiles*/, island?, lat, lon }]
//   roads                    [{ id, name, kind, width /*tiles*/, pts:[[x,y],…] }]   (smoothed world polylines; loops closed)
//   streetsAt(x, y)          bitmask of local streets on the tile's edges: 1 = north (y), 2 = west (x), 4 = south (y+1), 8 = east (x+1)
//   lotAt(x, y)              { x0, y0, x1, y1 } buildable rectangle of the tile after street set-backs, or null if not buildable
//   seaDistAt(x, y)          tiles to the nearest land (0 on land)          shoreDistAt(x, y) tiles to the open sea (0 at sea)
//   waters                   inland water [{ id, kind:'creek'|'canal'|'marina'|'lake'|'lagoon', pts, line?:[[x,y,widthTiles]] }]
//                            ids: creek, canal, marina, marina-entrance, ras-al-khor, burj-lake, jlt-lake-1..3, safa-lake, zabeel-lake
//   palms                    Palm geometry [{ id, base, crown, u, n, length, trunkW, trunk:[[x,y]], fronds:[{side,index,pts,w}],
//                            crescent:{c,r,w,a0,span}, apex }]  (apex = widened resort land at the top of the crescent)
//   worldIslands             The World: [{ pts:[[x,y]…], cx, cy }]
//   airports                 { dxb|dwc: { rws:[{id,a,b,w}], u, n /*terminal side*/, ref, len, precinct:[[x,y]×4] } }
//   coast                    smoothed mainland coastline (world polyline, SW -> NE)
//   deepSea, paintChunk(g, x0, y0, S, b), paintChunkNight(g, x0, y0, S, b) (false when nothing to draw)
// Buildable for the city: T.URBAN (T.PLAZA for light street furniture; T.DESERT vacant lots are optional).
// ROAD/RUNWAY/APRON/AIRFIELD/PARK/GOLF/WETLAND/BEACH/ROCK are kept free (parks & golf may get trees).
//
// Painting is done in world coordinates under the isometric affine transform, through a reusable CPU-backed
// canvas (software rasterisation of many paths/clips is much cheaper than GPU/SwiftShader path rendering).
import { W, H } from '../core/geo.js';
import { DISTRICTS, RUNWAYS, URBAN_ENVELOPE } from '../data/geo.js';
import { toWorld } from '../core/geo.js';
import { buildGeometry, inPoly, segDist } from './terrain/geom.js';
import { rasterMasks, distanceField, seaImage, landImage, mouthImage, vnoise, RES, DEEP_SEA } from './terrain/raster.js';
import { createPainter, GROUND, GKEY } from './terrain/paint.js';

export { inPoly };

export const T = {
  SEA: 0, SHALLOW: 1, BEACH: 2, DESERT: 3, URBAN: 4, ROAD: 5, PARK: 6, WATER: 7, RUNWAY: 8, GOLF: 9, WETLAND: 10, PLAZA: 11,
  APRON: 12, AIRFIELD: 13, ROCK: 14,
};
// representative daylight colour per type (others may use these for minimaps etc.)
export const COLORS = ['#22719a', '#4fb6c4', '#f0e0b6', '#e7d0a0', '#dcd3c2', '#5d6067', '#93c46c', '#3a9db3', '#4f5258',
  '#86bd62', '#86ad7c', '#ebe5d8', '#c3c2bd', '#dccfae', '#b7ab98'];

// street pitch (tiles between streets) and width (tiles) per district kind
// how far (tiles) a district of each kind may sprawl beyond its circle into unclaimed land
const SPRAWL = { villa: 9, midrise: 8, mixed: 7, oldtown: 4, industrial: 7, highrise: 3.5, supertall: 1.5, heritage: 0.6, port: 1.5 };

const STREET = {
  oldtown: [1, 0.11], heritage: [1, 0.07], midrise: [2, 0.15], highrise: [2, 0.18], supertall: [3, 0.2],
  mixed: [3, 0.16], villa: [2, 0.11], industrial: [2, 0.17], port: [4, 0.2], expo: [3, 0.16], airport: [3, 0.16],
};

export function buildTerrain(app) {
  const t0 = performance.now();
  const geo = buildGeometry();
  const masks = rasterMasks(geo);
  const { mw, mh, land, water, road } = masks;
  const N = mw * mh;
  // open sea = not inside any land polygon (inland water counts as "land" for the sea gradient)
  const seaDist = distanceField(mw, mh, (i) => land[i] >= 128);
  const shoreDist = distanceField(mw, mh, (i) => land[i] < 128);
  const isLandS = (i) => land[i] >= 128 && water[i] < 128;

  // ---------- districts ----------
  const districts = DISTRICTS.map((d) => {
    const [x, y] = toWorld(d.c[0], d.c[1]);
    return { id: d.id, name: d.name, kind: d.kind, x, y, r: d.r * 10, island: d.island || null, lat: d.c[0], lon: d.c[1] };
  });

  // ---------- island membership ----------
  const islandIdx = new Uint8Array(W * H); // index+1 into geo.islands
  geo.islands.forEach((s, si) => {
    s.polys.forEach((p, pi) => {
      const bb = s.boxes[pi];
      for (let y = Math.max(0, Math.floor(bb.y0)); y <= Math.min(H - 1, Math.floor(bb.y1)); y++)
        for (let x = Math.max(0, Math.floor(bb.x0)); x <= Math.min(W - 1, Math.floor(bb.x1)); x++) {
          // any of 5 sample points inside -> member (thin fronds)
          if (inPoly(x + 0.5, y + 0.5, p) || inPoly(x + 0.2, y + 0.2, p) || inPoly(x + 0.8, y + 0.8, p) || inPoly(x + 0.8, y + 0.2, p) || inPoly(x + 0.2, y + 0.8, p))
            islandIdx[y * W + x] = si + 1;
        }
    });
  });

  // ---------- airports ----------
  const airports = {};
  for (const rw of RUNWAYS) {
    const a = toWorld(rw.a[0], rw.a[1]), b = toWorld(rw.b[0], rw.b[1]);
    (airports[rw.airport] ||= []).push({ id: rw.id, a, b, w: rw.width / 100 });
  }
  const airportInfo = {};
  for (const [id, rws] of Object.entries(airports)) {
    const r0 = rws[0];
    let ux = r0.b[0] - r0.a[0], uy = r0.b[1] - r0.a[1];
    const len = Math.hypot(ux, uy); ux /= len; uy /= len;
    let nx = -uy, ny = ux;
    if (ny < 0) { nx = -nx; ny = -ny; } // terminal side = +n (towards the south)
    // reference runway: the one furthest along +n
    let ref = rws[0], best = -Infinity;
    for (const r of rws) { const v = r.a[0] * nx + r.a[1] * ny; if (v > best) { best = v; ref = r; } }
    airportInfo[id] = { rws, u: [ux, uy], n: [nx, ny], ref, len };
  }
  // airport precincts: an oriented rectangle around each airport's runways belongs to the airport district
  // (claimed first so neither circles nor sprawl reach the runways)
  const airportClaim = new Uint8Array(W * H);
  for (const [id, ap] of Object.entries(airportInfo)) {
    const di = districts.findIndex((d) => d.id === id);
    if (di < 0) continue;
    let relMin = 0;
    for (const r of ap.rws) relMin = Math.min(relMin, (r.a[0] - ap.ref.a[0]) * ap.n[0] + (r.a[1] - ap.ref.a[1]) * ap.n[1]);
    const L = ap.len;
    const corners = [[-0.1, relMin - 3.5], [1.1, relMin - 3.5], [1.1, 8], [-0.1, 8]].map(([al, rel]) =>
      [ap.ref.a[0] + ap.u[0] * al * L + ap.n[0] * rel, ap.ref.a[1] + ap.u[1] * al * L + ap.n[1] * rel]);
    ap.precinct = corners;
    const bb = corners.reduce((o, p) => ({ x0: Math.min(o.x0, p[0]), y0: Math.min(o.y0, p[1]), x1: Math.max(o.x1, p[0]), y1: Math.max(o.y1, p[1]) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
    for (let y = Math.max(0, Math.floor(bb.y0)); y <= Math.min(H - 1, Math.ceil(bb.y1)); y++)
      for (let x = Math.max(0, Math.floor(bb.x0)); x <= Math.min(W - 1, Math.ceil(bb.x1)); x++)
        if (inPoly(x + 0.5, y + 0.5, corners)) airportClaim[y * W + x] = di + 1;
  }

  // ---------- zones ----------
  const zoneIdx = new Uint8Array(W * H);
  for (let di = districts.length - 1; di >= 0; di--) {
    const d = districts[di];
    if (d.island) continue;
    const r2 = d.r * d.r;
    for (let y = Math.max(0, Math.floor(d.y - d.r)); y <= Math.min(H - 1, Math.ceil(d.y + d.r)); y++)
      for (let x = Math.max(0, Math.floor(d.x - d.r)); x <= Math.min(W - 1, Math.ceil(d.x + d.r)); x++) {
        const dx = x + 0.5 - d.x, dy = y + 0.5 - d.y;
        if (dx * dx + dy * dy <= r2) zoneIdx[y * W + x] = di + 1;
      }
  }
  for (let i = 0; i < W * H; i++) if (airportClaim[i]) zoneIdx[i] = airportClaim[i];
  // Organic sprawl: land outside every circle joins the nearest growable district. Inside the urban envelope
  // that is unconditional (continuous city); outside it only within a noisy reach (isolated communities).
  const envelope = URBAN_ENVELOPE.map(([la, lo]) => toWorld(la, lo));
  const inEnv = new Uint8Array(W * H);
  {
    const eb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const p of envelope) { eb.x0 = Math.min(eb.x0, p[0]); eb.y0 = Math.min(eb.y0, p[1]); eb.x1 = Math.max(eb.x1, p[0]); eb.y1 = Math.max(eb.y1, p[1]); }
    for (let y = Math.max(0, Math.floor(eb.y0)); y <= Math.min(H - 1, Math.ceil(eb.y1)); y++) {
      // scanline fill: x crossings of the polygon at this row
      const yc = y + 0.5, xs = [];
      for (let i = 0, j = envelope.length - 1; i < envelope.length; j = i++) {
        const [xi, yi] = envelope[i], [xj, yj] = envelope[j];
        if ((yi > yc) !== (yj > yc)) xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) inEnv[y * W + x] = 1;
    }
  }
  const vacant = new Uint8Array(W * H);
  {
    const best = new Float32Array(W * H).fill(1e9);
    const pick = new Uint8Array(W * H);
    districts.forEach((d, di) => {
      const reach = SPRAWL[d.kind] || 0;
      if (!reach || d.island) return;
      const R = d.r + reach * 6;
      for (let y = Math.max(0, Math.floor(d.y - R)); y <= Math.min(H - 1, Math.ceil(d.y + R)); y++)
        for (let x = Math.max(0, Math.floor(d.x - R)); x <= Math.min(W - 1, Math.ceil(d.x + R)); x++) {
          const i = y * W + x;
          if (zoneIdx[i]) continue;
          const dd = Math.hypot(x + 0.5 - d.x, y + 0.5 - d.y) - d.r;
          const k = dd / (reach * (0.55 + 0.9 * vnoise(x * 0.11 + di, y * 0.11)));
          if ((k < 1 || inEnv[i]) && k < best[i]) { best[i] = k; pick[i] = di + 1; }
        }
    });
    for (let i = 0; i < W * H; i++) if (!zoneIdx[i] && pick[i]) {
      zoneIdx[i] = pick[i];
      // scattered vacant plots in the sprawl (sand lots)
      const x = i % W, y = (i / W) | 0;
      if (vnoise(x * 0.16 + 31, y * 0.16) > 0.86 || (best[i] > 2.2 && vnoise(x * 0.09, y * 0.09 + 9) > 0.7)) vacant[i] = 1;
    }
  }
  const islandDistrict = new Map();
  districts.forEach((d, i) => { if (d.island) islandDistrict.set(d.island, i + 1); });
  for (let i = 0; i < W * H; i++) {
    const si = islandIdx[i];
    if (!si) continue;
    const s = geo.islands[si - 1];
    const dz = islandDistrict.get(s.id);
    if (dz) zoneIdx[i] = dz;
    else if (s.kind === 'world' || s.kind === 'breakwater') zoneIdx[i] = 0;
  }

  const airportOf = (d) => (d.id === 'dxb' ? airportInfo.dxb : d.id === 'dwc' ? airportInfo.dwc : null);

  // ---------- tile types + ground keys ----------
  const types = new Uint8Array(W * H);
  const ground = new Uint8Array(W * H);
  const tSea = new Float32Array(W * H); // tile-centre distance to land (tiles)
  const tShore = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const s0 = (y * RES) * mw + x * RES, s1 = s0 + 1, s2 = s0 + mw, s3 = s2 + 1;
      let nl = 0, nw = 0, nsea = 0, rd = 0;
      for (const s of [s0, s1, s2, s3]) {
        if (land[s] < 128) nsea++; else if (water[s] >= 128) nw++; else nl++;
        if (road[s] > rd) rd = road[s];
      }
      const sd = (seaDist[s0] + seaDist[s1] + seaDist[s2] + seaDist[s3]) / 4 / RES;
      const ld = (shoreDist[s0] + shoreDist[s1] + shoreDist[s2] + shoreDist[s3]) / 4 / RES;
      tSea[i] = sd; tShore[i] = ld;
      const si = islandIdx[i];
      const isl = si ? geo.islands[si - 1] : null;
      // thin island features (fronds) count as land if any sample hits
      const isLand = nl >= 2 || (isl && isl.kind === 'palm' && nl >= 1 && nsea + nl === 4);
      if (!isLand) {
        types[i] = nw >= 2 && nw >= nsea ? T.WATER : sd < 3 ? T.SHALLOW : T.SEA;
        continue;
      }
      const zi = zoneIdx[i];
      const z = zi ? districts[zi - 1] : null;
      let t = T.DESERT, gk = GKEY.desert;
      if (vacant[i] && !isl) { t = T.DESERT; gk = GKEY.lot; }
      else if (isl && isl.ground === 'plaza') { t = T.PLAZA; gk = GKEY.plaza; }
      else if (isl && isl.ground === 'rock') { t = T.ROCK; gk = GKEY.rock; }
      else if (isl && isl.kind === 'world') { t = T.BEACH; gk = GKEY.beach; }
      else if (z) {
        const k = z.kind;
        if (k === 'park') { t = T.PARK; gk = GKEY.park; }
        else if (k === 'golf') { t = T.GOLF; gk = GKEY.golf; }
        else if (k === 'wetland') { t = T.WETLAND; gk = GKEY.wetland; }
        else if (k === 'expo') {
          const dd = Math.hypot(x + 0.5 - z.x, y + 0.5 - z.y);
          if (dd < 2.6) { t = T.PLAZA; gk = GKEY.plaza; } else { t = T.URBAN; gk = GKEY.expo; }
        } else if (k === 'airport') {
          const ap = airportOf(z);
          t = T.AIRFIELD; gk = GKEY.airfield;
          if (ap) {
            const px = x + 0.5, py = y + 0.5;
            let onRw = false;
            for (const r of ap.rws) if (segDist(px, py, r.a[0], r.a[1], r.b[0], r.b[1]) < r.w / 2 + 0.35) onRw = true;
            const rel = (px - ap.ref.a[0]) * ap.n[0] + (py - ap.ref.a[1]) * ap.n[1];
            const al = ((px - ap.ref.a[0]) * ap.u[0] + (py - ap.ref.a[1]) * ap.u[1]) / ap.len;
            if (onRw) { t = T.RUNWAY; gk = GKEY.airfield; }
            else if (rel > 1.1 && rel < 2.1 && al > -0.02 && al < 1.02) { t = T.APRON; gk = GKEY.airfield; } // parallel taxiway
            else if (rel >= 2.1 && rel < 4.6 && al > 0.12 && al < 0.86) { t = T.APRON; gk = GKEY.apron; }
            else if (rel >= 4.6 && rel < 7.2 && al > 0.1 && al < 0.88) { t = T.URBAN; gk = GKEY.airport; }
          }
        } else { t = T.URBAN; gk = GKEY[k] ?? GKEY.mixed; }
        // beaches along the open sea (not ports, not on palm/world islands)
        if (t === T.URBAN || t === T.DESERT || t === T.PARK) {
          const beachOK = (!isl || (isl.kind === 'poly' && isl.beach)) && k !== 'port' && k !== 'industrial';
          if (beachOK && ld < 0.7) { t = T.BEACH; gk = GKEY.beach; }
        }
      } else {
        const beachOK = !isl || (isl.kind === 'poly' && isl.beach) || isl.kind === 'palm';
        if (beachOK && ld < 0.7) { t = T.BEACH; gk = GKEY.beach; }
        if (isl && isl.kind === 'poly' && !isl.beach && t === T.DESERT) { t = T.URBAN; gk = GKEY.port; }
      }
      // roads (highways / majors) claim the tile, except on runways
      if (rd >= 110 && t !== T.RUNWAY && t !== T.APRON && t !== T.WETLAND) t = T.ROAD;
      types[i] = t;
      ground[i] = gk;
    }
  }

  // ---------- local street grid (on tile edges) ----------
  // streets[i] bit 1: street on the north edge of tile i (between y-1 and y); bit 2: on the west edge (between x-1 and x)
  const streets = new Uint8Array(W * H);
  const streetW = new Float32Array(W * H);
  const kindAt = (i) => { const z = zoneIdx[i]; return z ? districts[z - 1].kind : null; };
  const streetable = (i) => types[i] === T.URBAN || types[i] === T.ROAD;
  const landPt = (x, y) => isLandS(Math.min(mh - 1, Math.floor(y * RES)) * mw + Math.min(mw - 1, Math.floor(x * RES)));
  for (let y = 1; y < H; y++) {
    for (let x = 1; x < W; x++) {
      const i = y * W + x;
      if (types[i] !== T.URBAN) {
        // a street may still run between an URBAN tile and this ROAD tile
        if (types[i] !== T.ROAD) continue;
      }
      const k = kindAt(i);
      const st = STREET[k];
      if (!st) continue;
      const [P, sw] = st;
      const isl = islandIdx[i] ? geo.islands[islandIdx[i] - 1] : null;
      if (isl && isl.kind === 'palm') continue; // palms get their own spine roads
      const ox = (zoneIdx[i] * 7) % P, oy = (zoneIdx[i] * 3) % P;
      const up = i - W, left = i - 1;
      if ((y - oy) % P === 0 && streetable(up) && (types[i] === T.URBAN || types[up] === T.URBAN) && landPt(x + 0.2, y) && landPt(x + 0.5, y) && landPt(x + 0.8, y)) { streets[i] |= 1; }
      if ((x - ox) % P === 0 && streetable(left) && (types[i] === T.URBAN || types[left] === T.URBAN) && landPt(x, y + 0.2) && landPt(x, y + 0.5) && landPt(x, y + 0.8)) { streets[i] |= 2; }
      streetW[i] = sw;
    }
  }
  const streetsAt = (x, y) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const i = y * W + x;
    let m = streets[i] & 3;
    if (y + 1 < H && streets[i + W] & 1) m |= 4;
    if (x + 1 < W && streets[i + 1] & 2) m |= 8;
    return m;
  };
  const lotAt = (x, y) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const t = types[y * W + x];
    if (t !== T.URBAN && t !== T.PLAZA) return null;
    const m = streetsAt(x, y), sw = (streetW[y * W + x] || 0.15) / 2 + 0.06;
    return { x0: x + (m & 2 ? sw : 0.04), y0: y + (m & 1 ? sw : 0.04), x1: x + 1 - (m & 8 ? sw : 0.04), y1: y + 1 - (m & 4 ? sw : 0.04) };
  };

  // ---------- precise queries ----------
  const sampleIdx = (x, y) => {
    const sx = Math.floor(x * RES), sy = Math.floor(y * RES);
    if (sx < 0 || sy < 0 || sx >= mw || sy >= mh) return -1;
    return sy * mw + sx;
  };
  const isLand = (x, y) => { const s = sampleIdx(x, y); return s >= 0 && isLandS(s); };
  const isWater = (x, y) => !isLand(x, y);
  const typeAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.SEA : types[(y | 0) * W + (x | 0)]);
  const zoneAt = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const z = zoneIdx[(y | 0) * W + (x | 0)];
    return z ? districts[z - 1] : null;
  };
  const seaDistAt = (x, y) => { const s = sampleIdx(x, y); return s < 0 ? 99 : seaDist[s] / RES; };
  const shoreDistAt = (x, y) => { const s = sampleIdx(x, y); return s < 0 ? 0 : shoreDist[s] / RES; };

  const seaImg = seaImage(mw, mh, seaDist);
  const landImg = landImage(mw, mh, shoreDist);
  const mouthImg = mouthImage(mw, mh, seaDist, shoreDist);

  const terrain = {
    W, H, T, COLORS, types, ground, zoneIdx, islandIdx, streets, streetW,
    deepSea: DEEP_SEA,
    districts,
    roads: geo.roads.map((r) => ({ id: r.id, name: r.name, kind: r.kind, width: r.width, pts: r.pts })),
    waters: geo.waters.map((w) => ({ id: w.id, kind: w.kind, pts: w.pts, line: w.line ? w.line.map((p) => [p[0], p[1], p[2]]) : null })),
    palms: geo.palms,
    worldIslands: geo.world ? geo.world.polys.map((p) => { let cx = 0, cy = 0; for (const q of p) { cx += q[0]; cy += q[1]; } return { pts: p, cx: cx / p.length, cy: cy / p.length }; }) : [],
    coast: geo.coastLine,
    airports: airportInfo,
    typeAt, zoneAt, isLand, isWater, streetsAt, lotAt, seaDistAt, shoreDistAt,
    tSea, tShore,
  };
  const painter = createPainter(terrain, geo, seaImg, landImg, mouthImg);
  terrain.paintChunk = painter.paintChunk;
  terrain.paintChunkNight = painter.paintChunkNight;
  terrain.buildMs = Math.round(performance.now() - t0);
  return terrain;
}
