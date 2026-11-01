// Ground painting for cached chunks (day) and additive street-light chunks (night).
// All drawing happens in WORLD coordinates under the isometric affine transform, so strokes/fills project correctly.
import { W, H, toWorld } from '../../core/geo.js';
import { HW, HH } from '../../core/iso.js';
import { pathOf, linePath, mkCanvas, vnoise as vnoise2, RES, DEEP_SEA } from './raster.js';
import { rng, bboxOf, chaikin, strip, smoothLine } from './geom.js';

// ---------- ground palette (tile-run keys) ----------
export const GROUND = [
  null,
  { id: 'desert', c: '#e7d0a0' },
  { id: 'beach', c: '#f1e1b6' },
  { id: 'supertall', c: '#e4ded3' },
  { id: 'highrise', c: '#ddd6c9' },
  { id: 'midrise', c: '#d9cfbd' },
  { id: 'oldtown', c: '#d8c8aa' },
  { id: 'heritage', c: '#dbc49c' },
  { id: 'villa', c: '#e0d0ab' },
  { id: 'industrial', c: '#cbc6bb' },
  { id: 'port', c: '#bdbcb7' },
  { id: 'mixed', c: '#dcd3c0' },
  { id: 'expo', c: '#e3ddd1' },
  { id: 'airport', c: '#d2cbbb' },
  { id: 'airfield', c: '#ddd0ad' },
  { id: 'apron', c: '#c6c5c0' },
  { id: 'park', c: '#93c46c' },
  { id: 'golf', c: '#86bd62' },
  { id: 'wetland', c: '#88ad7b' },
  { id: 'plaza', c: '#ece6d9' },
  { id: 'rock', c: '#b5aa98' },
  { id: 'lot', c: '#e3cfa6' },
];
export const GKEY = Object.fromEntries(GROUND.map((g, i) => [g ? g.id : 'none', i]));

// night glow per ground key (alpha of warm city glow)
const GLOW = { supertall: 0.2, highrise: 0.16, oldtown: 0.17, heritage: 0.12, midrise: 0.12, mixed: 0.11, villa: 0.06,
  industrial: 0.07, port: 0.15, airport: 0.15, apron: 0.18, expo: 0.12, plaza: 0.12, park: 0.025, beach: 0.015, airfield: 0.02, lot: 0.02 };

const WATER_COL = { creek: '#3d9fb3', canal: '#3fa2b8', marina: '#3b9db6', lake: '#4aaac0', lagoon: '#4e9ea2' };
const PPT = 32; // pattern pixels per tile

const DOT = (b) => 1 / (28 * b); // one cache pixel, in tiles (approx.)
const inter = (bb, x0, y0, x1, y1) => !(bb.x1 < x0 || bb.x0 > x1 || bb.y1 < y0 || bb.y0 > y1);

function offsetLine(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    out.push([pts[i][0] - dy * d, pts[i][1] + dx * d]);
  }
  return out;
}
function hashi(a, b, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- patterns (world-space textures) ----------
function buildPatterns() {
  const pats = {};
  const make = (name, tiles, fn) => {
    const s = tiles * PPT;
    const cv = mkCanvas(s, s);
    const g = cv.getContext('2d');
    fn(g, s, rng(name.length * 977 + s));
    const p = g.createPattern(cv, 'repeat');
    p.setTransform(new DOMMatrix([1 / PPT, 0, 0, 1 / PPT, 0, 0]));
    pats[name] = p;
  };
  const base = (g, s, c) => { g.fillStyle = c; g.fillRect(0, 0, s, s); };
  const speck = (g, s, r, n, cols, rad = [0.6, 1.6]) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[(r() * cols.length) | 0];
      const rr = rad[0] + r() * (rad[1] - rad[0]);
      g.beginPath(); g.arc(r() * s, r() * s, rr, 0, Math.PI * 2); g.fill();
    }
  };
  const paving = (g, s, step, col, lw = 1) => {
    g.strokeStyle = col; g.lineWidth = lw;
    g.beginPath();
    for (let v = 0; v <= s; v += step) { g.moveTo(v + 0.5, 0); g.lineTo(v + 0.5, s); g.moveTo(0, v + 0.5); g.lineTo(s, v + 0.5); }
    g.stroke();
  };
  make('desert', 4, (g, s, r) => {
    // dune ripples: long gentle waves (periodic so the pattern tiles)
    for (let k = 0; k < 9; k++) {
      const y0 = (k / 9) * s, amp = 3 + r() * 4, ph = r() * Math.PI * 2;
      g.strokeStyle = k % 2 ? 'rgba(196,160,104,0.28)' : 'rgba(255,240,205,0.45)';
      g.lineWidth = 1.6 + r() * 1.4;
      g.beginPath();
      for (let x = 0; x <= s; x += 4) {
        const y = y0 + Math.sin((x / s) * Math.PI * 4 + ph) * amp + Math.sin((x / s) * Math.PI * 2) * 3;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    speck(g, s, r, 70, ['rgba(205,175,122,0.5)', 'rgba(244,228,190,0.6)'], [0.5, 1.4]);
    // sparse desert shrubs (ghaf / scrub)
    for (let i = 0; i < 5; i++) {
      const x = r() * s, y = r() * s, rr = 1.6 + r() * 1.8;
      g.fillStyle = 'rgba(150,130,80,0.35)'; g.beginPath(); g.ellipse(x + 1.4, y + 1.0, rr, rr * 0.8, 0, 0, 7); g.fill();
      g.fillStyle = '#9da36a'; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
      g.fillStyle = '#b6b97e'; g.beginPath(); g.arc(x - rr * 0.3, y - rr * 0.3, rr * 0.5, 0, 7); g.fill();
    }
  });
  make('beach', 2, (g, s, r) => { base(g, s, GROUND[GKEY.beach].c); speck(g, s, r, 40, ['rgba(220,196,150,0.45)', 'rgba(255,250,232,0.7)'], [0.4, 1.1]); });
  const urban = (name, step, tone) => make(name, 2, (g, s, r) => {
    base(g, s, GROUND[GKEY[name]].c);
    speck(g, s, r, 50, ['rgba(255,255,255,0.18)', 'rgba(120,105,80,0.08)'], [0.6, 2.2]);
    if (step) paving(g, s, step, tone, 1);
  });
  urban('supertall', 8, 'rgba(255,255,255,0.35)');
  urban('highrise', 8, 'rgba(255,255,255,0.25)');
  urban('midrise', 0);
  urban('oldtown', 0);
  urban('heritage', 0);
  urban('mixed', 16, 'rgba(255,255,255,0.18)');
  urban('expo', 8, 'rgba(255,255,255,0.3)');
  urban('plaza', 8, 'rgba(180,165,140,0.22)');
  urban('airport', 16, 'rgba(255,255,255,0.15)');
  make('villa', 4, (g, s, r) => {
    base(g, s, GROUND[GKEY.villa].c);
    // irregular garden plots, lawns and shade trees (4-tile period so repetition is not obvious)
    for (let i = 0; i < 22; i++) {
      g.fillStyle = ['rgba(160,184,112,0.38)', 'rgba(176,192,128,0.3)', 'rgba(205,190,150,0.45)', 'rgba(150,175,105,0.3)'][(r() * 4) | 0];
      const w = 5 + r() * 12, h = 4 + r() * 10;
      g.fillRect(r() * s, r() * s, w, h);
    }
    speck(g, s, r, 26, ['rgba(127,171,92,0.75)', 'rgba(111,157,80,0.75)', 'rgba(140,180,100,0.6)'], [1.3, 3]);
  });
  make('industrial', 2, (g, s, r) => {
    base(g, s, GROUND[GKEY.industrial].c);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(150,145,138,0.35)' : 'rgba(225,220,210,0.4)';
      g.fillRect(r() * s, r() * s, 8 + r() * 18, 6 + r() * 12);
    }
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 0.7;
    g.beginPath();
    for (let i = 0; i < 3; i++) { const x = r() * s, y = r() * s; for (let k = 0; k < 6; k++) { g.moveTo(x + k * 2.2, y); g.lineTo(x + k * 2.2, y + 4); } }
    g.stroke();
  });
  make('port', 2, (g, s, r) => {
    base(g, s, GROUND[GKEY.port].c);
    const cols = ['#c0453a', '#2f6fa8', '#d9922f', '#3f8f5a', '#8c9196', '#e9e9e4', '#7a4a8e', '#b8b23a'];
    // container blocks in rows
    for (let by = 2; by < s - 4; by += 9) {
      for (let bx = 2; bx < s - 10; bx += 15) {
        if (r() < 0.2) continue;
        for (let k = 0; k < 3; k++) {
          g.fillStyle = cols[(r() * cols.length) | 0];
          g.fillRect(bx, by + k * 2.4, 12, 2);
        }
      }
    }
  });
  make('park', 2, (g, s, r) => {
    base(g, s, GROUND[GKEY.park].c);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    for (let k = 0; k < s; k += 8) g.fillRect(0, k, s, 4);
    speck(g, s, r, 14, ['rgba(70,120,50,0.55)'], [1.5, 2.8]);
  });
  make('golf', 2, (g, s, r) => { base(g, s, GROUND[GKEY.golf].c); speck(g, s, r, 40, ['rgba(60,110,45,0.35)', 'rgba(170,210,120,0.4)'], [0.8, 2]); });
  make('wetland', 2, (g, s, r) => {
    base(g, s, GROUND[GKEY.wetland].c);
    speck(g, s, r, 22, ['#5f8f55', '#6c9a5c', 'rgba(80,150,160,0.6)'], [1.2, 3.2]);
  });
  make('airfield', 4, (g, s, r) => {
    base(g, s, GROUND[GKEY.airfield].c);
    speck(g, s, r, 30, ['rgba(160,170,100,0.25)', 'rgba(250,240,215,0.5)'], [2, 6]);
  });
  make('apron', 2, (g, s) => { base(g, s, GROUND[GKEY.apron].c); paving(g, s, 16, 'rgba(120,118,112,0.25)', 1); });
  make('lot', 2, (g, s, r) => {
    base(g, s, GROUND[GKEY.lot].c);
    speck(g, s, r, 60, ['rgba(190,160,110,0.35)', 'rgba(250,236,205,0.5)'], [0.5, 1.5]);
    g.strokeStyle = 'rgba(170,140,95,0.25)'; g.lineWidth = 1;
    g.beginPath(); for (let i = 0; i < 2; i++) { const y = r() * s; g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + 6, s * 0.6, y - 6, s, y); } g.stroke();
  });
  make('rock', 1, (g, s, r) => { base(g, s, GROUND[GKEY.rock].c); speck(g, s, r, 20, ['#9d927f', '#cfc4b0'], [1, 2.5]); });
  return pats;
}

function glowSprite(rgb, size = 64) {
  const cv = mkCanvas(size, size);
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.18, `rgba(${rgb},0.55)`);
  gr.addColorStop(0.5, `rgba(${rgb},0.14)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return cv;
}

// ---------- painter ----------
export function createPainter(T_, geo, seaImg, landImg, mouthImg) {
  const { types, ground, T, districts, zoneIdx } = T_;
  const pats = buildPatterns();

  // land groups (bbox culled)
  const landGroups = [{ path: pathOf([geo.mainland]), bbox: { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }, main: true }];
  for (const s of geo.islands) {
    if (s.polys.length > 40) {
      // bucket many small polygons (The World) into 16x16-tile cells
      const cells = new Map();
      s.polys.forEach((p, i) => {
        const bb = s.boxes[i], k = Math.floor(bb.x0 / 16) + ':' + Math.floor(bb.y0 / 16);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(i);
      });
      for (const idx of cells.values()) {
        const polys = idx.map((i) => s.polys[i]);
        let bb = null;
        for (const i of idx) bb = bb ? { x0: Math.min(bb.x0, s.boxes[i].x0), y0: Math.min(bb.y0, s.boxes[i].y0), x1: Math.max(bb.x1, s.boxes[i].x1), y1: Math.max(bb.y1, s.boxes[i].y1) } : { ...s.boxes[i] };
        landGroups.push({ path: pathOf(polys), bbox: bb, island: s, polys });
      }
    } else landGroups.push({ path: pathOf(s.polys), bbox: s.bbox, island: s, polys: s.polys });
  }

  // beach coastline: mainland coast segments whose land side is BEACH
  const beachCoast = [];
  {
    const cl = geo.coastLine;
    let cur = null;
    for (let i = 1; i < cl.length; i++) {
      const a = cl[i - 1], b = cl[i];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      // land is on the right-hand side walking SW->NE in a y-down frame: normal (-dy, dx)
      let ok = false;
      for (const d of [0.4, 0.9]) {
        const tx = Math.floor(mx - dy * d), ty = Math.floor(my + dx * d);
        if (tx >= 0 && ty >= 0 && tx < W && ty < H && types[ty * W + tx] === T.BEACH) ok = true;
      }
      if (ok) { if (!cur) { cur = [a]; beachCoast.push(cur); } cur.push(b); } else cur = null;
    }
  }
  const beachGroups = beachCoast.map((pts) => ({ path: linePath(pts), bbox: bboxOf(pts, 1) }));
  const coastPath = linePath(geo.coastLine);
  for (const g of landGroups) if (g.island && g.island.beach) beachGroups.push({ path: g.path, bbox: g.bbox, island: true, kind: g.island.kind });
  // quay edges: non-beach islands (ports)
  const quayGroups = landGroups.filter((g) => g.island && !g.island.beach);

  const waters = geo.waters.map((w) => ({ ...w, path: pathOf([w.pts]), linePath: w.line ? linePath(w.line) : null,
    meanW: w.line ? w.line.reduce((a, p) => a + p[2], 0) / w.line.length : 0,
    // just inside each quay: where night reflections start
    reflect: w.line ? [1, -1].map((sg) => w.line.map((p, i) => {
      const a = w.line[Math.max(0, i - 1)], c = w.line[Math.min(w.line.length - 1, i + 1)];
      let dx = c[0] - a[0], dy = c[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const d = sg * Math.max(0.05, p[2] / 2 - 0.14);
      return [p[0] - dy * d, p[1] + dx * d];
    })) : null }));

  // roads with marking offsets
  const roads = geo.roads.map((r) => {
    const o = { ...r, path: linePath(r.pts), hw: r.width / 2 };
    const hwid = r.width / 2;
    o.edges = [linePath(offsetLine(r.pts, hwid - 0.03)), linePath(offsetLine(r.pts, -(hwid - 0.03)))];
    const lanes = r.kind === 'highway' ? [hwid * 0.33, hwid * 0.66] : [hwid * 0.5];
    o.lanes = lanes.flatMap((d) => [linePath(offsetLine(r.pts, d)), linePath(offsetLine(r.pts, -d))]);
    o.sides = [offsetLine(r.pts, hwid + 0.06), offsetLine(r.pts, -(hwid + 0.06))];
    o.len = 0; for (let i = 1; i < r.pts.length; i++) o.len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
    return o;
  });
  roads.sort((a, b) => (a.kind === 'highway') - (b.kind === 'highway'));

  // palm spine roads (frond streets, crescent road)
  const palmRoads = [];
  for (const p of geo.palms) {
    for (const f of p.fronds) palmRoads.push(f.pts);
    const c = p.crescent, line = [];
    for (let k = 0; k <= 60; k++) { const a = c.a0 - c.span * 0.97 + (2 * c.span * 0.97 * k) / 60; line.push([c.c[0] + Math.cos(a) * c.r, c.c[1] + Math.sin(a) * c.r]); }
    palmRoads.push(line);
  }
  const palmRoadGroups = palmRoads.map((pts) => ({ path: linePath(pts), bbox: bboxOf(pts, 0.5), pts }));

  // airports: runway/taxi/apron geometry
  const airports = Object.values(T_.airports).map((ap) => {
    const { u, n, ref, len, rws } = ap;
    const P = (al, rel) => [ref.a[0] + u[0] * al * len + n[0] * rel, ref.a[1] + u[1] * al * len + n[1] * rel];
    const runways = rws.map((r) => {
      const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hw = r.w / 2;
      const poly = [[r.a[0] + nx * hw, r.a[1] + ny * hw], [r.b[0] + nx * hw, r.b[1] + ny * hw], [r.b[0] - nx * hw, r.b[1] - ny * hw], [r.a[0] - nx * hw, r.a[1] - ny * hw]];
      // piano keys at thresholds + touchdown marks
      const keys = new Path2D(), tdz = new Path2D();
      for (const end of [0, 1]) {
        const s0 = end ? L - 0.12 : 0.04, dir = end ? -1 : 1;
        for (let k = -3; k <= 3; k++) {
          if (k === 0) continue;
          const off = (k / 3.6) * hw;
          const cx = r.a[0] + ux * s0 + nx * off, cy = r.a[1] + uy * s0 + ny * off;
          keys.moveTo(cx, cy); keys.lineTo(cx + ux * 0.4 * dir, cy + uy * 0.4 * dir);
        }
        for (let m = 0; m < 3; m++) {
          const s = (end ? L - 1.0 - m * 1.2 : 1.0 + m * 1.2);
          for (const off of [-0.55 * hw, 0.55 * hw]) {
            const cx = r.a[0] + ux * s + nx * off, cy = r.a[1] + uy * s + ny * off;
            tdz.moveTo(cx, cy); tdz.lineTo(cx + ux * 0.5 * dir, cy + uy * 0.5 * dir);
          }
        }
      }
      return { poly, path: pathOf([poly]), centre: linePath([[r.a[0] + ux * 0.6, r.a[1] + uy * 0.6], [r.b[0] - ux * 0.6, r.b[1] - uy * 0.6]]),
        edges: [linePath([poly[0], poly[1]]), linePath([poly[3], poly[2]])], keys, tdz, a: r.a, b: r.b, L, u: [ux, uy], n: [nx, ny], hw };
    });
    const taxi = [P(-0.01, 1.6), P(1.01, 1.6)];
    const taxiPaths = [linePath(taxi)];
    // taxiway between parallel runways
    if (rws.length > 1) {
      const o = rws.find((r) => r !== ref);
      const relO = (o.a[0] - ref.a[0]) * n[0] + (o.a[1] - ref.a[1]) * n[1];
      taxiPaths.push(linePath([P(0.02, relO / 2), P(0.98, relO / 2)]));
      for (let k = 1; k < 6; k++) taxiPaths.push(linePath([P(k / 6, relO + 0.2), P(k / 6, 1.6)]));
    }
    for (let k = 0; k <= 6; k++) taxiPaths.push(linePath([P(k / 6, 0.2), P(k / 6 + 0.03, 1.6)]));
    const apron = [P(0.12, 2.1), P(0.86, 2.1), P(0.86, 4.6), P(0.12, 4.6)];
    const stands = new Path2D();
    for (let al = 0.14; al < 0.85; al += 0.6 / len) { const a = P(al, 2.25), b2 = P(al, 4.2); stands.moveTo(a[0], a[1]); stands.lineTo(b2[0], b2[1]); }
    const bb = bboxOf([P(-0.05, -9), P(1.05, -9), P(1.05, 8), P(-0.05, 8)]);
    // edge lights positions
    const lights = [];
    for (const r of runways) for (let s = 0; s <= r.L; s += 0.6) for (const sg of [-1, 1]) lights.push([r.a[0] + r.u[0] * s + r.n[0] * r.hw * sg, r.a[1] + r.u[1] * s + r.n[1] * r.hw * sg]);
    const floods = [];
    for (let al = 0.14; al < 0.86; al += 1.0 / len) floods.push(P(al, 4.4));
    return { runways, taxiPaths, apron: pathOf([apron]), stands, bbox: bb, lights, floods };
  });

  // golf course features
  const golf = [];
  for (const d of districts) {
    if (d.kind !== 'golf') continue;
    const r = rng(d.id.length * 131 + 7);
    const fair = new Path2D(), greens = new Path2D(), bunkers = new Path2D(), ponds = new Path2D(), tees = new Path2D();
    const holes = 18, trees = new Path2D();
    // routing: front nine around an outer loop, back nine around an inner loop
    const loopPt = (i) => {
      const outer = i < 9, j = outer ? i : i - 9, n = 9;
      const a = (j / n) * Math.PI * 2 * (outer ? 1 : -1) + (outer ? 0 : 0.35) + (r() - 0.5) * 0.25;
      const rr = d.r * (outer ? 0.7 : 0.36) * (0.9 + r() * 0.2);
      return [d.x + Math.cos(a) * rr, d.y + Math.sin(a) * rr * 0.92];
    };
    const P = Array.from({ length: holes + 1 }, (_, i) => loopPt(i % holes === 0 && i ? 0 : i));
    for (let h = 0; h < holes; h++) {
      const tx = P[h][0], ty = P[h][1];
      const nx0 = P[h + 1][0], ny0 = P[h + 1][1];
      const L = Math.hypot(nx0 - tx, ny0 - ty) || 1, heading = Math.atan2(ny0 - ty, nx0 - tx);
      const gx = tx + (nx0 - tx) * 0.82, gy = ty + (ny0 - ty) * 0.82;
      const mx = (tx + gx) / 2 + (r() - 0.5) * 1.2, my = (ty + gy) / 2 + (r() - 0.5) * 1.2;
      const line = smoothLine([[tx, ty, 0.5], [mx, my, 0.85 + r() * 0.3], [gx, gy, 0.7]], 4);
      const poly = strip(line, true, true, 6);
      fair.moveTo(poly[0][0], poly[0][1]); for (const p of poly) fair.lineTo(p[0], p[1]); fair.closePath();
      greens.moveTo(gx + 0.36, gy); greens.ellipse(gx, gy, 0.36, 0.28, heading, 0, Math.PI * 2);
      tees.moveTo(tx + 0.14, ty); tees.arc(tx, ty, 0.14, 0, Math.PI * 2);
      for (let q = 0; q < 2; q++) {
        const ba = heading + Math.PI / 2 * (q ? 1 : -1) + (r() - 0.5), bx = gx + Math.cos(ba) * 0.55, by = gy + Math.sin(ba) * 0.55;
        bunkers.moveTo(bx + 0.18, by); bunkers.ellipse(bx, by, 0.18, 0.11, r() * 3, 0, Math.PI * 2);
      }
      // tree lines on both sides of the fairway
      for (let t = 0.1; t < 0.9; t += 0.12) {
        const px = tx + (gx - tx) * t, py = ty + (gy - ty) * t, nx = -(gy - ty) / L, ny = (gx - tx) / L;
        for (const sg of [-1, 1]) {
          if (r() < 0.35) continue;
          const ox = px + nx * sg * (0.85 + r() * 0.3), oy = py + ny * sg * (0.85 + r() * 0.3), rr = 0.12 + r() * 0.08;
          trees.moveTo(ox + rr, oy); trees.arc(ox, oy, rr, 0, Math.PI * 2);
        }
      }
      if (r() < 0.3) {
        const px = mx + (r() - 0.5) * 1.6, py = my + (r() - 0.5) * 1.6, pr = 0.45 + r() * 0.5;
        const pts = []; for (let k2 = 0; k2 < 9; k2++) { const aa = (k2 / 9) * Math.PI * 2; pts.push([px + Math.cos(aa) * pr * (0.8 + r() * 0.4), py + Math.sin(aa) * pr * (0.7 + r() * 0.4)]); }
        const sp = chaikin(pts, 2); ponds.moveTo(sp[0][0], sp[0][1]); for (const p of sp) ponds.lineTo(p[0], p[1]); ponds.closePath();
      }
    }
    golf.push({ d, fair, greens, bunkers, ponds, tees, trees, bbox: { x0: d.x - d.r, y0: d.y - d.r, x1: d.x + d.r, y1: d.y + d.r } });
  }

  // parks: winding footpaths
  const parks = [];
  for (const d of districts) {
    if (d.kind !== 'park') continue;
    const r = rng(d.id.length * 71 + 3), paths = new Path2D();
    const loop = [];
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; const rr = d.r * (0.55 + r() * 0.25); loop.push([d.x + Math.cos(a) * rr, d.y + Math.sin(a) * rr]); }
    const sl = chaikin(loop, 3); paths.moveTo(sl[0][0], sl[0][1]); for (const p of sl) paths.lineTo(p[0], p[1]); paths.closePath();
    for (let k = 0; k < 3; k++) { const a = r() * Math.PI * 2; paths.moveTo(d.x, d.y); paths.quadraticCurveTo(d.x + Math.cos(a + 0.6) * d.r * 0.4, d.y + Math.sin(a + 0.6) * d.r * 0.4, d.x + Math.cos(a) * d.r * 0.95, d.y + Math.sin(a) * d.r * 0.95); }
    parks.push({ d, paths, bbox: { x0: d.x - d.r, y0: d.y - d.r, x1: d.x + d.r, y1: d.y + d.r } });
  }

  // Expo City: Al Wasl plaza rings and three thematic districts (petals)
  const expo = [];
  for (const d of districts) {
    if (d.kind !== 'expo') continue;
    const rings = new Path2D(), petals = new Path2D(), spokes = new Path2D();
    for (const rr of [1.1, 1.9, 2.55]) { rings.moveTo(d.x + rr, d.y); rings.arc(d.x, d.y, rr, 0, Math.PI * 2); }
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
      const cx = d.x + Math.cos(a) * 5.2, cy = d.y + Math.sin(a) * 5.2;
      const pts = [];
      for (let q = 0; q < 24; q++) { const t = (q / 24) * Math.PI * 2; const ex = Math.cos(t) * 2.9, ey = Math.sin(t) * 1.9; pts.push([cx + ex * Math.cos(a) - ey * Math.sin(a), cy + ex * Math.sin(a) + ey * Math.cos(a)]); }
      petals.moveTo(pts[0][0], pts[0][1]); for (const p of pts) petals.lineTo(p[0], p[1]); petals.closePath();
    }
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; spokes.moveTo(d.x + Math.cos(a) * 1.1, d.y + Math.sin(a) * 1.1); spokes.lineTo(d.x + Math.cos(a) * 2.55, d.y + Math.sin(a) * 2.55); }
    const plaza = new Path2D(); plaza.arc(d.x, d.y, 2.6, 0, Math.PI * 2);
    const ring = new Path2D(); ring.arc(d.x, d.y, 9.2, 0, Math.PI * 2);
    const paths = new Path2D();
    for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k * Math.PI * 2) / 3; paths.moveTo(d.x + Math.cos(a) * 2.6, d.y + Math.sin(a) * 2.6); paths.lineTo(d.x + Math.cos(a) * 8.6, d.y + Math.sin(a) * 8.6); }
    for (const rr of [4.0, 6.6]) { paths.moveTo(d.x + rr, d.y); paths.arc(d.x, d.y, rr, 0, Math.PI * 2); }
    expo.push({ d, rings, petals, spokes, plaza, ring, paths, bbox: { x0: d.x - 10, y0: d.y - 10, x1: d.x + 10, y1: d.y + 10 } });
  }

  // lagoon mangrove islets
  const lagoon = waters.find((w) => w.kind === 'lagoon');
  const mangroves = new Path2D();
  if (lagoon) {
    const r = rng(5);
    const bb = lagoon.bbox;
    let placed = 0;
    for (let k = 0; k < 400 && placed < 28; k++) {
      const x = bb.x0 + r() * (bb.x1 - bb.x0), y = bb.y0 + r() * (bb.y1 - bb.y0);
      if (!inPolyQ(x, y, lagoon.pts)) continue;
      const rr = 0.25 + r() * 0.55;
      const pts = []; for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; pts.push([x + Math.cos(a) * rr * (0.7 + r() * 0.5), y + Math.sin(a) * rr * (0.7 + r() * 0.5)]); }
      const sp = chaikin(pts, 2); mangroves.moveTo(sp[0][0], sp[0][1]); for (const p of sp) mangroves.lineTo(p[0], p[1]); mangroves.closePath();
      placed++;
    }
  }

  // sprites for night
  const spriteWarm = glowSprite('255,176,92');
  const spriteHot = glowSprite('255,214,150');
  const spriteCool = glowSprite('190,215,255');

  // night: per-tile glow variation and broad hotspots over dense districts
  const glowNoise = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = vnoise2(x * 0.18, y * 0.18) * 0.65 + hashi(x, y, 77) * 0.35;
    glowNoise[y * W + x] = Math.min(0.999, Math.max(0, n));
  }
  const HOT = { supertall: 0.55, highrise: 0.38, oldtown: 0.3, midrise: 0.16, mixed: 0.14, port: 0.18 };
  const hotspots = districts.filter((d) => HOT[d.kind] && !d.island).map((d) => {
    const r = d.r * 1.9 + 3;
    return { x: d.x, y: d.y, r, a: HOT[d.kind], bbox: { x0: d.x - r, y0: d.y - r, x1: d.x + r, y1: d.y + r } };
  });

  // ground key with water tiles borrowing a neighbouring land key (runs are clipped to land, water painted after)
  const keyAt = (i) => {
    const k = ground[i];
    if (k) return k;
    const x = i % W;
    return (x > 0 && ground[i - 1]) || (x < W - 1 && ground[i + 1]) || (i >= W && ground[i - W]) || (i + W < W * H && ground[i + W]) || 0;
  };

  // per-chunk content summary cache
  const infoCache = new Map();
  function chunkInfo(x0, y0, S) {
    const key = x0 + ':' + y0 + ':' + S;
    let v = infoCache.get(key);
    if (v) return v;
    let land = 0, sea = 0, water = 0, glow = 0, desert = 0;
    for (let y = Math.max(0, y0 - 1); y < Math.min(H, y0 + S + 1); y++)
      for (let x = Math.max(0, x0 - 1); x < Math.min(W, x0 + S + 1); x++) {
        const t = types[y * W + x], k = ground[y * W + x];
        if (t === T.SEA || t === T.SHALLOW) sea++; else if (t === T.WATER) water++;
        else { land++; if (GLOW[GROUND[k].id]) glow++; if (k === GKEY.desert) desert++; }
      }
    v = { land, sea, water, glow, desert };
    infoCache.set(key, v);
    return v;
  }

  // ---------------------------------------------------------------------------------------------------------
  function begin(g, x0, y0, S, b) {
    const e = 1.5 * DOT(b);
    const X0 = Math.max(0, x0 - e), Y0 = Math.max(0, y0 - e), X1 = Math.min(W, x0 + S + e), Y1 = Math.min(H, y0 + S + e);
    if (X1 <= X0 || Y1 <= Y0) return null;
    g.save();
    g.transform(HW, HH, -HW, HH, 0, 0);
    g.beginPath(); g.rect(X0, Y0, X1 - X0, Y1 - Y0); g.clip();
    g.lineJoin = 'round'; g.lineCap = 'round';
    return { X0, Y0, X1, Y1, e };
  }

  function landPathFor(X0, Y0, X1, Y1) {
    const p = new Path2D();
    let n = 0;
    for (const lg of landGroups) if (inter(lg.bbox, X0 - 1, Y0 - 1, X1 + 1, Y1 + 1)) { p.addPath(lg.path); n++; }
    return n ? p : null;
  }

  function tileRuns(X0, Y0, X1, Y1, keyOf, eps) {
    const paths = new Map();
    const ty0 = Math.max(0, Math.floor(Y0)), ty1 = Math.min(H - 1, Math.ceil(Y1) - 1);
    const tx0 = Math.max(0, Math.floor(X0)), tx1 = Math.min(W - 1, Math.ceil(X1) - 1);
    for (let y = ty0; y <= ty1; y++) {
      let x = tx0;
      while (x <= tx1) {
        const k = keyOf(y * W + x);
        let x2 = x + 1;
        while (x2 <= tx1 && keyOf(y * W + x2) === k) x2++;
        if (k) {
          let p = paths.get(k);
          if (!p) { p = new Path2D(); paths.set(k, p); }
          p.rect(x - eps, y - eps, x2 - x + 2 * eps, 1 + 2 * eps);
        }
        x = x2;
      }
    }
    return paths;
  }

  // ---------------------------------------------------------------------------------------------------------
  function paintChunk(g, x0, y0, S, b) {
    const c = begin(g, x0, y0, S, b);
    if (!c) return;
    const { X0, Y0, X1, Y1 } = c;
    const px = DOT(b);
    const info = chunkInfo(x0, y0, S);
    const detail = b >= 0.25, fine = b >= 0.5;
    const vis = (bb, m = 0) => inter(bb, X0 - m, Y0 - m, X1 + m, Y1 + m);

    // 1. sea
    if (info.sea || info.water) {
      const sx0 = Math.max(0, Math.floor(X0) - 2), sy0 = Math.max(0, Math.floor(Y0) - 2);
      const sx1 = Math.min(W, Math.ceil(X1) + 2), sy1 = Math.min(H, Math.ceil(Y1) + 2);
      g.imageSmoothingEnabled = true;
      g.drawImage(seaImg, sx0 * RES, sy0 * RES, (sx1 - sx0) * RES, (sy1 - sy0) * RES, sx0, sy0, sx1 - sx0, sy1 - sy0);
      if (b >= 0.25 && info.sea) seaGlints(g, X0, Y0, X1, Y1, b);
    } else {
      g.fillStyle = DEEP_SEA; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    }
    if (!info.land && !info.water) { edgeFade(g, X0, Y0, X1, Y1); g.restore(); return; }

    // 2. surf line just offshore of beaches
    if (b >= 1 / 32) {
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      for (const bg of beachGroups) {
        if (!vis(bg.bbox, 1)) continue;
        g.lineWidth = bg.island ? Math.max(0.36, 2 * px) : Math.max(0.6, 2.2 * px);
        g.stroke(bg.path);
      }
      if (b >= 1 / 8) {
        g.strokeStyle = 'rgba(160,232,222,0.95)';
        for (const bg of beachGroups) {
          if (!vis(bg.bbox, 1)) continue;
          g.lineWidth = bg.island ? 0.2 : 0.34;
          g.stroke(bg.path);
        }
      }
      // ports: dark quay shadow line
      g.strokeStyle = 'rgba(30,60,70,0.35)';
      g.lineWidth = Math.max(0.18, 1.2 * px);
      for (const qg of quayGroups) if (vis(qg.bbox, 1)) g.stroke(qg.path);
    }

    // 3. land
    const landPath = landPathFor(X0, Y0, X1, Y1);
    if (landPath) {
      g.save();
      g.clip(landPath);
      if (info.desert || info.sea || info.water || x0 + S > W - 1 || y0 + S > H - 1) {
        const sx0 = Math.max(0, Math.floor(X0) - 2), sy0 = Math.max(0, Math.floor(Y0) - 2);
        const sx1 = Math.min(W, Math.ceil(X1) + 2), sy1 = Math.min(H, Math.ceil(Y1) + 2);
        g.drawImage(landImg, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0, sy0, sx1 - sx0, sy1 - sy0);
        if (detail) { g.fillStyle = pats.desert; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0); }
      }
      // 3a. ground tiles (merged runs)
      const runs = tileRuns(X0, Y0, X1, Y1, (i) => { const k = keyAt(i); return k === GKEY.desert ? 0 : k; }, 0.6 * px);
      for (const [k, p] of runs) {
        const gd = GROUND[k];
        g.fillStyle = detail && pats[gd.id] ? pats[gd.id] : gd.c;
        g.fill(p);
      }
      // 3b. beach band (smooth inner edge) + wet sand
      if (b >= 1 / 16) {
        for (const bg of beachGroups) {
          if (!vis(bg.bbox, 1)) continue;
          g.strokeStyle = detail ? pats.beach : GROUND[GKEY.beach].c;
          g.lineWidth = bg.island ? (bg.kind === 'world' ? 0.5 : 0.36) : 1.1;
          g.stroke(bg.path);
          if (b >= 1 / 8) {
            g.strokeStyle = 'rgba(196,170,120,0.7)';
            g.lineWidth = Math.max(0.1, px);
            g.stroke(bg.path);
          }
        }
      }
      // 3c. district details
      if (b >= 1 / 8) {
        for (const pk of parks) if (vis(pk.bbox)) {
          g.strokeStyle = '#e4d9bf'; g.lineWidth = Math.max(0.09, px); g.stroke(pk.paths);
        }
        if (runs.has(GKEY.golf)) {
          for (const gc of golf) if (vis(gc.bbox)) {
            g.save(); g.clip(runs.get(GKEY.golf));
            g.strokeStyle = 'rgba(95,150,70,0.6)'; g.lineWidth = 0.22; g.stroke(gc.fair);
            g.fillStyle = '#a8d97f'; g.fill(gc.fair);
            g.fillStyle = '#bfe79a'; g.fill(gc.greens); g.fill(gc.tees);
            g.fillStyle = '#f3e7c2'; g.fill(gc.bunkers);
            g.fillStyle = '#4aa9bf'; g.fill(gc.ponds);
            if (detail) {
              g.fillStyle = 'rgba(40,80,35,0.3)'; g.save(); g.translate(0.06, 0.06); g.fill(gc.trees); g.restore();
              g.fillStyle = '#5e9a48'; g.fill(gc.trees);
            }
            g.restore();
          }
        }
        for (const ex of expo) if (vis(ex.bbox)) {
          g.strokeStyle = '#6e7076'; g.lineWidth = Math.max(0.3, 1.2 * px); g.stroke(ex.ring);
          g.fillStyle = '#efe9dd'; g.fill(ex.petals);
          g.strokeStyle = '#b9a88a'; g.lineWidth = Math.max(0.12, px); g.stroke(ex.petals);
          g.fillStyle = '#f4efe6'; g.fill(ex.plaza);
          g.strokeStyle = '#c4b393'; g.lineWidth = Math.max(0.09, px); g.stroke(ex.rings);
          if (detail) { g.lineWidth = 0.05; g.stroke(ex.spokes); g.strokeStyle = 'rgba(150,135,110,0.5)'; g.lineWidth = 0.04; g.stroke(ex.paths); }
        }
        for (const ap of airports) if (vis(ap.bbox)) {
          g.fillStyle = detail ? pats.apron : GROUND[GKEY.apron].c; g.fill(ap.apron);
          g.strokeStyle = '#7b7e84'; g.lineWidth = 0.24; g.lineCap = 'butt';
          for (const p of ap.taxiPaths) g.stroke(p);
          if (fine) {
            g.strokeStyle = '#e6c34a'; g.lineWidth = 0.025;
            for (const p of ap.taxiPaths) g.stroke(p);
            g.stroke(ap.stands);
          }
          g.lineCap = 'round';
        }
      }
      // 3d. inland water (inside land only): quays first, then all water, so overlapping channels merge cleanly
      const wv = waters.filter((w) => vis(w.bbox, 1));
      for (const w of wv) {
        if (w.kind === 'lagoon') { g.strokeStyle = '#7da36f'; g.lineWidth = 0.8; g.stroke(w.path); }
        else if (b >= 1 / 16) { g.strokeStyle = '#d8cfbd'; g.lineWidth = Math.max(0.34, 1.5 * px); g.stroke(w.path); }
      }
      for (const w of wv) { g.fillStyle = WATER_COL[w.kind] || WATER_COL.creek; g.fill(w.path); }
      if (detail) {
        g.strokeStyle = 'rgba(30,110,135,0.22)';
        for (const w of wv) if (w.linePath) { g.lineWidth = w.meanW * 0.45; g.stroke(w.linePath); }
      }
      if (wv.length) {
        // blend the open-sea colours into channel mouths
        const wp = new Path2D();
        for (const w of wv) wp.addPath(w.path);
        g.save(); g.clip(wp);
        const sx0 = Math.max(0, Math.floor(X0) - 2), sy0 = Math.max(0, Math.floor(Y0) - 2);
        const sx1 = Math.min(W, Math.ceil(X1) + 2), sy1 = Math.min(H, Math.ceil(Y1) + 2);
        g.drawImage(mouthImg, sx0 * RES, sy0 * RES, (sx1 - sx0) * RES, (sy1 - sy0) * RES, sx0, sy0, sx1 - sx0, sy1 - sy0);
        g.restore();
      }
      for (const w of wv) {
        if (w.kind !== 'lagoon') continue;
        g.save(); g.clip(w.path);
        g.strokeStyle = '#5f8e57'; g.lineWidth = 1.3; g.stroke(w.path);
        g.fillStyle = '#5f8e57'; g.fill(mangroves);
        if (detail) { g.strokeStyle = 'rgba(160,210,150,0.5)'; g.lineWidth = 0.05; g.stroke(mangroves); }
        g.restore();
      }
      g.restore(); // land clip
    }

    // 4. sea-side extras: World/palm details
    if (detail && landPath) islandDetails(g, X0, Y0, X1, Y1, b);

    // 5. local streets
    if (b >= 1 / 8 && info.land) streetsPaint(g, X0, Y0, X1, Y1, b);

    // 6. palm spine roads
    if (b >= 1 / 8) {
      for (const pr of palmRoadGroups) if (vis(pr.bbox)) {
        if (fine) { g.strokeStyle = '#ece5d6'; g.lineWidth = 0.2; g.stroke(pr.path); }
        g.strokeStyle = '#8a8b8f'; g.lineWidth = Math.max(0.1, px); g.stroke(pr.path);
      }
    }

    // 7. runways
    for (const ap of airports) if (vis(ap.bbox)) {
      for (const r of ap.runways) {
        g.fillStyle = '#54575d'; g.fill(r.path);
        if (b >= 1 / 8) {
          g.strokeStyle = '#f4f4f0'; g.lineCap = 'butt';
          g.lineWidth = Math.max(0.025, 0.6 * px); for (const e of r.edges) g.stroke(e);
          if (detail) {
            g.lineWidth = 0.03; g.setLineDash([0.45, 0.35]); g.stroke(r.centre); g.setLineDash([]);
            g.lineWidth = 0.05; g.stroke(r.keys); g.lineWidth = 0.07; g.stroke(r.tdz);
          }
          g.lineCap = 'round';
        }
      }
    }

    // 8. roads (majors first, highways on top)
    for (const r of roads) {
      if (!vis(r.bbox, 1)) continue;
      const hw = r.kind === 'highway';
      if (b < 1 / 8) {
        g.strokeStyle = hw ? '#74767c' : '#8d8e92';
        g.lineWidth = Math.max(r.width, (hw ? 1.4 : 1) * px);
        g.stroke(r.path);
        continue;
      }
      g.strokeStyle = '#d3ccbc'; g.lineWidth = r.width + (fine ? 0.16 : 0.1); g.stroke(r.path);
      g.strokeStyle = hw ? '#5a5d64' : '#64676d'; g.lineWidth = r.width; g.stroke(r.path);
      if (detail) {
        if (hw || fine) { g.strokeStyle = '#b9b3a4'; g.lineWidth = hw ? 0.06 : 0.035; g.stroke(r.path); }
        if (fine) {
          g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.014;
          for (const e of r.edges) g.stroke(e);
          g.setLineDash([0.14, 0.2]); g.lineWidth = 0.012;
          for (const l of r.lanes) g.stroke(l);
          g.setLineDash([]);
        }
      }
    }

    edgeFade(g, X0, Y0, X1, Y1);
    g.restore();
  }

  function seaGlints(g, X0, Y0, X1, Y1, b) {
    const p = new Path2D();
    const tdist = T_.tSea;
    const dens = b >= 1 ? 2 : 1;
    for (let y = Math.max(0, Math.floor(Y0)); y < Math.min(H, Math.ceil(Y1)); y++)
      for (let x = Math.max(0, Math.floor(X0)); x < Math.min(W, Math.ceil(X1)); x++) {
        const t = types[y * W + x];
        if (t !== T.SEA && t !== T.SHALLOW) continue;
        if (tdist[y * W + x] < 0.8) continue;
        for (let k = 0; k < dens; k++) {
          if (hashi(x, y, k) > (b >= 0.5 ? 0.3 : 0.12)) continue;
          // short crests, horizontal on screen: world direction (1,-1); bulge toward the viewer (+x,+y)
          const cx = x + hashi(x, y, k + 10), cy = y + hashi(x, y, k + 20), L = 0.08 + hashi(x, y, k + 30) * 0.12;
          p.moveTo(cx - L, cy + L); p.quadraticCurveTo(cx - L * 0.3, cy - L * 0.3, cx + L, cy - L);
        }
      }
    g.strokeStyle = 'rgba(235,250,250,0.3)'; g.lineWidth = Math.max(0.02, 0.9 * DOT(b));
    g.stroke(p);
  }

  function islandDetails(g, X0, Y0, X1, Y1, b) {
    // greenery on the larger World islands
    const wi = T_.worldIslands;
    if (!wi.length) return;
    const bb = wiBox;
    if (!inter(bb, X0, Y0, X1, Y1)) return;
    const p = new Path2D();
    for (let i = 0; i < wi.length; i++) {
      const s = wi[i];
      if (s.cx < X0 - 1 || s.cx > X1 + 1 || s.cy < Y0 - 1 || s.cy > Y1 + 1) continue;
      if (hashi(i, 3) > 0.45) continue;
      const k = 0.45 + hashi(i, 4) * 0.2;
      const pts = s.pts;
      p.moveTo(s.cx + (pts[0][0] - s.cx) * k, s.cy + (pts[0][1] - s.cy) * k);
      for (const q of pts) p.lineTo(s.cx + (q[0] - s.cx) * k, s.cy + (q[1] - s.cy) * k);
      p.closePath();
    }
    g.fillStyle = '#9cc77a'; g.fill(p);
  }
  let wiBox = { x0: 0, y0: 0, x1: -1, y1: -1 };
  if (T_.worldIslands.length) { const all = T_.worldIslands.flatMap((s) => s.pts); wiBox = bboxOf(all, 1); }

  // local streets on tile edges, batched by width
  function streetPaths(X0, Y0, X1, Y1) {
    const { streets, streetW } = T_;
    const byW = new Map();
    const add = (w, x0, y0, x1, y1) => { let p = byW.get(w); if (!p) { p = new Path2D(); byW.set(w, p); } p.moveTo(x0, y0); p.lineTo(x1, y1); };
    const tx0 = Math.max(1, Math.floor(X0) - 1), tx1 = Math.min(W - 1, Math.ceil(X1) + 1);
    const ty0 = Math.max(1, Math.floor(Y0) - 1), ty1 = Math.min(H - 1, Math.ceil(Y1) + 1);
    for (let y = ty0; y < ty1; y++) {
      let x = tx0;
      while (x < tx1) {
        const i = y * W + x;
        if (!(streets[i] & 1)) { x++; continue; }
        const w = streetW[i];
        let x2 = x + 1;
        while (x2 < tx1 && streets[y * W + x2] & 1 && streetW[y * W + x2] === w) x2++;
        add(w, x, y, x2, y);
        x = x2;
      }
    }
    for (let x = tx0; x < tx1; x++) {
      let y = ty0;
      while (y < ty1) {
        const i = y * W + x;
        if (!(streets[i] & 2)) { y++; continue; }
        const w = streetW[i];
        let y2 = y + 1;
        while (y2 < ty1 && streets[y2 * W + x] & 2 && streetW[y2 * W + x] === w) y2++;
        add(w, x, y, x, y2);
        y = y2;
      }
    }
    return byW;
  }

  function streetsPaint(g, X0, Y0, X1, Y1, b) {
    const fine = b >= 0.5;
    const byW = streetPaths(X0, Y0, X1, Y1);
    g.lineCap = 'square';
    if (fine) {
      g.strokeStyle = '#eee8dc';
      for (const [w, p] of byW) { g.lineWidth = w + 0.07; g.stroke(p); }
    }
    for (const [w, p] of byW) {
      g.strokeStyle = w < 0.08 ? '#c9b591' : fine ? '#8e8f93' : b >= 0.25 ? '#a9a7a2' : '#bdb8ae';
      g.lineWidth = Math.max(fine ? w : w * 0.8, 0.9 * DOT(b));
      g.stroke(p);
    }
    if (b >= 1) {
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.008; g.setLineDash([0.06, 0.08]);
      for (const [w, p] of byW) if (w >= 0.15) g.stroke(p);
      g.setLineDash([]);
    }
    g.lineCap = 'round';
  }

  function edgeFade(g, X0, Y0, X1, Y1) {
    const F = 16;
    const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(24,96,130,0)'); gr.addColorStop(0.45, 'rgba(24,96,130,0.25)');
      gr.addColorStop(0.8, 'rgba(24,96,130,0.75)'); gr.addColorStop(1, DEEP_SEA);
      g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
    };
    if (X1 > W - F) fade(W - F, 0, W, 0, W - F, Y0, F, Y1 - Y0);
    if (Y1 > H - F) fade(0, H - F, 0, H, X0, H - F, X1 - X0, F);
    if (X0 < F) fade(F, 0, 0, 0, 0, Y0, F, Y1 - Y0);
    if (Y0 < F) fade(0, F, 0, 0, X0, 0, X1 - X0, F);
  }

  // ---------------------------------------------------------------------------------------------------------
  function paintChunkNight(g, x0, y0, S, b) {
    const info = chunkInfo(x0, y0, S);
    const bridges = roads.some((r) => inter(r.bbox, x0, y0, x0 + S, y0 + S));
    if (!info.land && !bridges) return false;
    const c = begin(g, x0, y0, S, b);
    if (!c) return false;
    const { X0, Y0, X1, Y1 } = c;
    const px = DOT(b);
    const vis = (bb, m = 0) => inter(bb, X0 - m, Y0 - m, X1 + m, Y1 + m);
    g.globalCompositeOperation = 'lighter';

    // city glow (warm haze over built-up land): clipped to land, water knocked out, varied with noise
    const landPath = info.land ? landPathFor(X0, Y0, X1, Y1) : null;
    if (info.glow && landPath) {
      g.save(); g.clip(landPath);
      const smoothGlow = b >= 0.5;
      const runs = tileRuns(X0, Y0, X1, Y1, (i) => {
        const k = keyAt(i), a = GLOW[GROUND[k] ? GROUND[k].id : ''];
        if (!a) return 0;
        const lv = smoothGlow ? 2 : Math.min(3, Math.floor(glowNoise[i] * 4));
        return k * 4 + lv + 1;
      }, 0.6 * px);
      for (const [key, p] of runs) {
        const k = ((key - 1) / 4) | 0, lv = (key - 1) % 4;
        const a = GLOW[GROUND[k].id] * (0.45 + lv * 0.38) * (b < 1 / 8 ? 1.2 : 1);
        g.fillStyle = `rgba(255,${138 + lv * 8},${52 + lv * 6},${a.toFixed(3)})`;
        g.fill(p);
      }
      // dense districts: broad warm hotspots
      for (const h of hotspots) {
        if (!inter(h.bbox, X0, Y0, X1, Y1)) continue;
        g.globalAlpha = h.a;
        g.drawImage(spriteWarm, h.x - h.r, h.y - h.r, 2 * h.r, 2 * h.r);
        g.globalAlpha = 1;
      }
      // sparkle: scattered building/plot lights at low zoom
      if (b < 1 / 4) {
        g.fillStyle = 'rgba(255,205,140,0.55)';
        g.beginPath();
        const sz = Math.max(0.12, 1.1 * px);
        for (let y = Math.max(0, Math.floor(Y0)); y < Math.min(H, Math.ceil(Y1)); y++)
          for (let x = Math.max(0, Math.floor(X0)); x < Math.min(W, Math.ceil(X1)); x++) {
            const i = y * W + x, k = ground[i], a = GLOW[GROUND[k] ? GROUND[k].id : ''];
            if (!a || hashi(x, y, 5) > a * 3.2) continue;
            g.rect(x + hashi(x, y, 6) * 0.8, y + hashi(x, y, 7) * 0.8, sz, sz);
          }
        g.fill();
      }
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      for (const w of waters) if (vis(w.bbox, 1)) g.fill(w.path);
      g.globalCompositeOperation = 'lighter';
      g.restore();
    }

    // light spill from the lit shore onto the sea, and reflections of quay lights in inland water
    if (info.land && b >= 1 / 16) {
      g.strokeStyle = 'rgba(255,150,70,0.08)'; g.lineWidth = 2.4; g.stroke(coastPath);
      g.strokeStyle = 'rgba(255,165,80,0.08)'; g.lineWidth = 1.0; g.stroke(coastPath);
    }
    if (b >= 0.25 && info.water) {
      for (const w of waters) {
        if (!w.reflect || !vis(w.bbox, 1)) continue;
        g.save(); g.clip(w.path);
        const p = new Path2D();
        for (const side of w.reflect) {
          sampleAlong(side, 0.33, (x, y) => {
            if (x < X0 - 1 || x > X1 + 1 || y < Y0 - 1 || y > Y1 + 1) return;
            const h = hashi((x * 13) | 0, (y * 13) | 0);
            if (h > 0.6 || T_.shoreDistAt(x, y) < 0.6) return; // sparse, and not out at sea
            const L = 0.15 + h * 0.45, j = (hashi((y * 11) | 0, (x * 11) | 0) - 0.5) * 0.2;
            // soft screen-vertical shimmer below the quay light (world direction (1,1))
            p.moveTo(x + j, y - j); p.lineTo(x + j + L * 0.7, y - j + L * 0.7);
          });
        }
        g.lineCap = 'butt';
        g.strokeStyle = 'rgba(255,165,80,0.13)'; g.lineWidth = 0.13; g.stroke(p);
        g.strokeStyle = 'rgba(255,200,130,0.16)'; g.lineWidth = 0.05; g.stroke(p);
        g.lineCap = 'round';
        g.restore();
      }
    }

    const dots = (pts, size, col) => {
      g.fillStyle = col;
      g.beginPath();
      for (const q of pts) g.rect(q[0] - size / 2, q[1] - size / 2, size, size);
      g.fill();
    };
    const sprites = (pts, size, sp) => { for (const q of pts) g.drawImage(sp, q[0] - size / 2, q[1] - size / 2, size, size); };

    // road lights
    for (const r of roads) {
      if (!vis(r.bbox, 1)) continue;
      const hw = r.kind === 'highway';
      const step = hw ? 0.32 : 0.42;
      const pts = [];
      const lines = hw ? r.sides : [r.pts];
      for (const ln of lines) sampleAlong(ln, step, (x, y) => { if (x > X0 - 0.5 && x < X1 + 0.5 && y > Y0 - 0.5 && y < Y1 + 0.5) pts.push([x, y]); });
      if (!pts.length) continue;
      if (b >= 0.25) {
        g.strokeStyle = hw ? 'rgba(255,165,70,0.32)' : 'rgba(255,155,70,0.2)';
        g.lineWidth = r.width * (hw ? 1.5 : 1.3); g.stroke(r.path);
        sprites(pts, hw ? 0.5 : 0.42, hw ? spriteHot : spriteWarm);
        dots(pts, 0.035, 'rgba(255,236,190,0.95)');
      } else {
        // glow strip + dots
        g.strokeStyle = hw ? 'rgba(255,170,80,0.5)' : 'rgba(255,160,80,0.32)';
        g.lineWidth = Math.max(r.width * 1.6, 1.6 * px); g.stroke(r.path);
        if (b >= 1 / 8) dots(pts, Math.max(0.05, 1.2 * px), hw ? 'rgba(255,220,160,0.95)' : 'rgba(255,200,140,0.8)');
      }
    }

    // local street lights
    if (b >= 1 / 8 && info.land) {
      const { streets } = T_;
      const byW = streetPaths(X0, Y0, X1, Y1);
      g.lineCap = 'butt';
      g.strokeStyle = b >= 0.25 ? 'rgba(255,160,80,0.22)' : 'rgba(255,160,80,0.3)';
      for (const [w, p] of byW) { g.lineWidth = Math.max(w * 1.8, 1.2 * px); g.stroke(p); }
      g.lineCap = 'round';
      const pts = [];
      const tx0 = Math.max(1, Math.floor(X0)), tx1 = Math.min(W - 1, Math.ceil(X1));
      const ty0 = Math.max(1, Math.floor(Y0)), ty1 = Math.min(H - 1, Math.ceil(Y1));
      const k = b >= 0.5 ? 2 : 1, keep = b >= 0.25 ? 0.7 : 0.45;
      for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
        const s = streets[y * W + x];
        if (!s) continue;
        if (s & 1) for (let q = 0; q < k; q++) if (hashi(x, y, q + 40) < keep) pts.push([x + (q + 0.3 + hashi(x, y, q) * 0.4) / k, y]);
        if (s & 2) for (let q = 0; q < k; q++) if (hashi(x, y, q + 50) < keep) pts.push([x, y + (q + 0.3 + hashi(x, y, q + 9) * 0.4) / k]);
      }
      if (b >= 0.25) {
        g.fillStyle = 'rgba(255,170,90,0.16)';
        g.beginPath();
        for (const q of pts) { g.moveTo(q[0] + 0.12, q[1]); g.ellipse(q[0], q[1], 0.12, 0.12, 0, 0, Math.PI * 2); }
        g.fill();
        dots(pts, 0.03, 'rgba(255,228,175,0.9)');
      } else dots(pts, Math.max(0.06, 1.1 * px), 'rgba(255,190,120,0.5)');
      // palm spine roads
      for (const pr of palmRoadGroups) {
        if (!vis(pr.bbox)) continue;
        const pp = [];
        sampleAlong(pr.pts, 0.5, (x, y) => pp.push([x, y]));
        if (b >= 0.25) sprites(pp, 0.4, spriteWarm); else dots(pp, Math.max(0.06, 1.2 * px), 'rgba(255,190,120,0.7)');
      }
    }

    // airports: runway edge lights, apron floodlights
    for (const ap of airports) {
      if (!vis(ap.bbox)) continue;
      if (b >= 1 / 8) dots(ap.lights, Math.max(0.05, px), 'rgba(200,225,255,0.9)');
      if (b >= 0.25) sprites(ap.floods, 1.4, spriteCool);
      else dots(ap.floods, Math.max(0.2, 2 * px), 'rgba(220,230,255,0.6)');
    }
    g.restore();
    return true;
  }

  // Paint through a reusable CPU-backed canvas: software rasterisation of many paths/clips is far cheaper than
  // GPU (or SwiftShader) path rendering; the result is uploaded once per chunk.
  let scratch = null, sg = null;
  const viaCPU = (fn) => (g, x0, y0, S, b) => {
    const w = g.canvas.width, h = g.canvas.height;
    if (!scratch || scratch.width < w || scratch.height < h) {
      scratch = mkCanvas(Math.max(w, scratch ? scratch.width : 0), Math.max(h, scratch ? scratch.height : 0));
      sg = scratch.getContext('2d', { willReadFrequently: true });
    }
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, w, h);
    sg.setTransform(g.getTransform());
    sg.imageSmoothingEnabled = true;
    const r = fn(sg, x0, y0, S, b);
    if (r === false) return false;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(scratch, 0, 0, w, h, 0, 0, w, h);
    g.restore();
    return r;
  };
  return { paintChunk: viaCPU(paintChunk), paintChunkNight: viaCPU(paintChunkNight) };
}

function sampleAlong(pts, step, fn) {
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
    const L = Math.hypot(bx - ax, by - ay);
    let s = carry;
    while (s < L) { const t = s / L; fn(ax + (bx - ax) * t, ay + (by - ay) * t); s += step; }
    carry = s - L;
  }
}
function inPolyQ(x, y, pts) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
