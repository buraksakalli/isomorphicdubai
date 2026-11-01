// Frame renderer: cached ground chunks -> sun shadows -> light tint -> night ground glow
// -> depth-sorted objects (static + dynamic) -> overlays.
import { HW, HH, ZH } from './iso.js';
import { prep } from './scene.js';

const CHUNK_PX_BUDGET = 48e6; // cached ground pixels
const BUILD_MS = 14;          // max ms per frame spent building ground chunks

export class RenderCtx {
  setup(ctx, cam, L, t, hours, vw, vh, dpr) {
    this.ctx = ctx; this.cam = cam; this.L = L; this.t = t; this.hours = hours;
    this.vw = vw; this.vh = vh; this.dpr = dpr;
    this.zoom = cam.zoom; this.ox = cam.ox; this.oy = cam.oy;
    this.kx = HW * cam.zoom; this.ky = HH * cam.zoom; this.kz = ZH * cam.zoom;
    this.night = L.night;
    return this;
  }
  X(x, y) { return this.ox + (x - y) * this.kx; }
  Y(x, y, z = 0) { return this.oy + (x + y) * this.ky - z * this.kz; }
}

export class Renderer {
  constructor(app) {
    this.app = app;
    this.chunks = new Map(); // key -> { canvas, px, used }
    this.chunkPixels = 0;
    this.rc = new RenderCtx();
    this.shadowCanvas = document.createElement('canvas');
    this.picks = [];
    this.stats = { objects: 0, chunks: 0, built: 0, ms: 0 };
    this.errors = new Set();
  }

  invalidateGround() { this.chunks.clear(); this.chunkPixels = 0; }

  bucketFor(scale) {
    const b = Math.pow(2, Math.ceil(Math.log2(Math.max(scale, 1 / 64))));
    return Math.min(2, b);
  }
  chunkSizeFor(b) { return b >= 1 ? 8 : b >= 0.5 ? 16 : b >= 1 / 8 ? 32 : 64; }

  getChunk(cx, cy, S, b, night, allowBuild) {
    const key = (night ? 'n' : 'd') + b + ':' + S + ':' + cx + ':' + cy;
    let ch = this.chunks.get(key);
    if (ch) { ch.used = this.frameNo; return ch; }
    if (!allowBuild()) return null;
    const terrain = this.app.terrain;
    const x0 = cx * S, y0 = cy * S;
    const w = Math.ceil(S * 2 * HW * b), h = Math.ceil(S * 2 * HH * b);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d');
    const minPx = (x0 - (y0 + S)) * HW, minPy = (x0 + y0) * HH;
    g.setTransform(b, 0, 0, b, -minPx * b, -minPy * b);
    let any = true;
    try {
      if (night) any = terrain.paintChunkNight ? terrain.paintChunkNight(g, x0, y0, S, b) !== false : false;
      else terrain.paintChunk(g, x0, y0, S, b);
    } catch (e) { this.logOnce('terrain', e); }
    ch = { canvas: any ? canvas : null, minPx, minPy, b, used: this.frameNo, px: w * h };
    this.chunks.set(key, ch);
    this.chunkPixels += ch.px;
    this.stats.built++;
    if (this.chunkPixels > CHUNK_PX_BUDGET) this.evict();
    return ch;
  }

  evict() {
    const arr = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, ch] of arr) {
      if (this.chunkPixels < CHUNK_PX_BUDGET * 0.7) break;
      if (ch.used === this.frameNo) continue;
      this.chunks.delete(k); this.chunkPixels -= ch.px;
    }
  }

  drawGround(ctx, cam, vw, vh, dpr, night, allowBuild) {
    const terrain = this.app.terrain;
    const scale = cam.zoom * dpr;
    let b = this.bucketFor(scale);
    const S = this.chunkSizeFor(b);
    // world range covering the viewport
    const c1 = cam.screenToWorld(0, 0), c2 = cam.screenToWorld(vw, 0), c3 = cam.screenToWorld(0, vh), c4 = cam.screenToWorld(vw, vh);
    const minX = Math.min(c1[0], c2[0], c3[0], c4[0]), maxX = Math.max(c1[0], c2[0], c3[0], c4[0]);
    const minY = Math.min(c1[1], c2[1], c3[1], c4[1]), maxY = Math.max(c1[1], c2[1], c3[1], c4[1]);
    const cx0 = Math.max(0, Math.floor(minX / S)), cx1 = Math.min(Math.ceil(terrain.W / S) - 1, Math.floor(maxX / S));
    const cy0 = Math.max(0, Math.floor(minY / S)), cy1 = Math.min(Math.ceil(terrain.H / S) - 1, Math.floor(maxY / S));
    let drawn = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const x0 = cx * S, y0 = cy * S;
        const sx0 = cam.ox + (x0 - y0 - S) * HW * cam.zoom, sx1 = sx0 + 2 * S * HW * cam.zoom;
        const sy0 = cam.oy + (x0 + y0) * HH * cam.zoom, sy1 = sy0 + 2 * S * HH * cam.zoom;
        if (sx1 < 0 || sx0 > vw || sy1 < 0 || sy0 > vh) continue;
        let ch = this.getChunk(cx, cy, S, b, night, allowBuild);
        if (!ch) {
          // fallback: any coarser cached bucket covering this area
          for (let bb = b / 2; bb >= 1 / 64 && !ch; bb /= 2) {
            const SS = this.chunkSizeFor(bb);
            const k = (night ? 'n' : 'd') + bb + ':' + SS + ':' + Math.floor(x0 / SS) + ':' + Math.floor(y0 / SS);
            const c = this.chunks.get(k);
            if (c && c.canvas) {
              c.used = this.frameNo;
              ctx.drawImage(c.canvas, cam.ox + c.minPx * cam.zoom, cam.oy + c.minPy * cam.zoom,
                c.canvas.width * cam.zoom / bb, c.canvas.height * cam.zoom / bb);
              ch = c; // mark drawn
            }
          }
          this.needsFrame = true;
          continue;
        }
        if (!ch.canvas) continue;
        ctx.drawImage(ch.canvas, cam.ox + ch.minPx * cam.zoom, cam.oy + ch.minPy * cam.zoom,
          ch.canvas.width * cam.zoom / ch.b, ch.canvas.height * cam.zoom / ch.b);
        drawn++;
      }
    }
    return drawn;
  }

  /**
   * Render a full frame into ctx (CSS-pixel coordinates, dpr applied via transform).
   * opts.exporting: build all chunks synchronously (no budget).
   */
  render(ctx, cam, vw, vh, dpr = 1, opts = {}) {
    const t0 = performance.now();
    const app = this.app, L = app.light, scene = app.scene;
    this.frameNo = (this.frameNo || 0) + 1;
    this.needsFrame = false;
    cam.begin(vw, vh);
    const tStart = performance.now();
    const allowBuild = opts.exporting ? () => true : () => performance.now() - tStart < BUILD_MS;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = app.terrain.deepSea || '#2f7fa6';
    ctx.fillRect(0, 0, vw, vh);

    // 1. ground (daylight colours)
    this.stats.chunks = this.drawGround(ctx, cam, vw, vh, dpr, false, allowBuild);
    const tG = performance.now(); this.stats.tGround = tG - t0;

    // visible objects (computed once, used for shadows + drawing)
    scene.sort();
    const z = cam.zoom;
    const vx0 = -cam.ox / z, vx1 = (vw - cam.ox) / z, vy0 = -cam.oy / z, vy1 = (vh - cam.oy) / z;
    const vis = [];
    const shadowMargin = L.sunI > 0.01 ? 900 : 0;
    const shadowCands = [];
    const S = scene.statics;
    for (let i = 0; i < S.length; i++) {
      const o = S[i];
      if (o._px1 < vx0 - shadowMargin || o._px0 > vx1 + shadowMargin || o._py1 < vy0 - 60 || o._py0 > vy1 + shadowMargin) continue;
      if ((o._px1 - o._px0) * z < 1.2 && (o._py1 - o._py0) * z < 1.2) continue;
      if (o.minZoom && z < o.minZoom) continue;
      if (o.maxZoom && z > o.maxZoom) continue;
      if (o.shadow) shadowCands.push(o);
      if (o._px1 < vx0 || o._px0 > vx1 || o._py1 < vy0 || o._py0 > vy1) continue;
      vis.push(o);
    }
    // dynamic objects
    const dyn = [];
    for (const src of scene.dynamicSources) {
      let list;
      try { list = src(); } catch (e) { this.logOnce('dyn-src', e); continue; }
      if (!list) continue;
      for (const o of list) {
        if (!o || o.hidden) continue;
        if (!o.bbox) { const rad = o.radius ?? 0.3; o.bbox = { x0: o.x - rad, y0: o.y - rad, x1: o.x + rad, y1: o.y + rad, h: o.h ?? 10 }; o._ownBox = true; }
        else if (o._ownBox) { const rad = o.radius ?? 0.3; const bb = o.bbox; bb.x0 = o.x - rad; bb.y0 = o.y - rad; bb.x1 = o.x + rad; bb.y1 = o.y + rad; bb.h = o.h ?? bb.h; }
        prep(o);
        if (o._px1 < vx0 || o._px0 > vx1 || o._py1 < vy0 || o._py0 > vy1) continue;
        if (o.minZoom && z < o.minZoom) continue;
        dyn.push(o);
      }
    }
    dyn.sort((a, b) => a._d - b._d);

    const tC = performance.now(); this.stats.tCull = tC - tG; this.stats.shadowCands = shadowCands.length;
    const r = this.rc.setup(ctx, cam, L, app.clock.t, L.hours, vw, vh, dpr);
    r.dt = app.clock.dt || 1 / 60;
    r.exporting = !!opts.exporting;

    // 2. sun shadows (unioned on an offscreen canvas so overlaps don't double-darken)
    if (L.shadowAlpha > 0.01 && shadowCands.length) this.drawShadows(ctx, r, shadowCands, vw, vh, dpr);

    const tS = performance.now(); this.stats.tShadow = tS - tC;
    // 3. light tint over ground
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = L.groundTint;
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'source-over';

    // 4. night ground lights (street lights etc.)
    if (L.night > 0.03 && app.terrain.paintChunkNight) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, L.night * 1.1);
      this.drawGround(ctx, cam, vw, vh, dpr, true, allowBuild);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    for (const f of scene.underlays) { try { f(r); } catch (e) { this.logOnce('underlay', e); } resetCtx(ctx); }

    const tU = performance.now(); this.stats.tUnder = tU - tS;
    // 5. objects: merge statics + dynamics by depth
    this.picks.length = 0;
    let i = 0, j = 0, n = 0;
    while (i < vis.length || j < dyn.length) {
      const o = j >= dyn.length || (i < vis.length && vis[i]._d <= dyn[j]._d) ? vis[i++] : dyn[j++];
      if (this.profile) {
        const a = performance.now();
        try { o.draw(r); } catch (e) { this.logOnce(o.id || o.pick?.id || 'obj', e); resetCtx(ctx); }
        const k = o.id || o.pick?.id || o.kind || o.type || o._src || (o.constructor.name + '|' + String(o.draw).slice(0, 70).replace(/\s+/g, ' '));
        this.profile[k] = (this.profile[k] || 0) + performance.now() - a;
      } else {
        try { o.draw(r); } catch (e) { this.logOnce(o.id || o.pick?.id || 'obj', e); resetCtx(ctx); }
      }
      if (o.pick) this.picks.push(o);
      n++;
    }
    this.stats.objects = n;
    const tO = performance.now(); this.stats.tObjects = tO - tU;

    // 6. overlays (planes, fireworks, selection highlight)
    for (const f of scene.overlays) { try { f(r); } catch (e) { this.logOnce('overlay', e); } resetCtx(ctx); }

    this.stats.tOverlay = performance.now() - tO;
    this.stats.ms = performance.now() - t0;
    return r;
  }

  drawShadows(ctx, r, cands, vw, vh, dpr) {
    const L = r.L, s = L.sun;
    if (s[2] <= 0.02) return;
    const sc = this.shadowCanvas;
    const sres = Math.min(1, dpr) * 0.5; // shadows are soft-edged anyway: render at half resolution
    const W = Math.ceil(vw * sres), H = Math.ceil(vh * sres);
    if (sc.width !== W || sc.height !== H) { sc.width = W; sc.height = H; }
    const g = sc.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.setTransform(sres, 0, 0, sres, 0, 0);
    g.fillStyle = '#000';
    const tanInv = Math.min(1 / Math.max(s[2] / Math.hypot(s[0], s[1]), 1e-3), 3.5); // length per metre height, capped
    const dirx = -s[0] / Math.hypot(s[0], s[1]), diry = -s[1] / Math.hypot(s[0], s[1]);
    const kx = r.kx, ky = r.ky, ox = r.ox, oy = r.oy;
    g.beginPath();
    const P = this._shP || (this._shP = new Float64Array(256)), Hh = this._shH || (this._shH = new Int32Array(130));
    for (const o of cands) {
      for (const sh of o.shadow) {
        const len = (sh.h * tanInv) / 100; // tiles
        const offx = dirx * len, offy = diry * len;
        const pts = sh.pts, n = Math.min(pts.length, 64);
        // screen points of footprint and its offset copy; shadow = convex hull of both
        let m = 0;
        for (let k = 0; k < n; k++) {
          const px = pts[k][0], py = pts[k][1];
          P[m++] = ox + (px - py) * kx; P[m++] = oy + (px + py) * ky;
          P[m++] = ox + (px + offx - py - offy) * kx; P[m++] = oy + (px + offx + py + offy) * ky;
        }
        hullPath(g, P, m >> 1, Hh);
      }
    }
    g.fill('nonzero');
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = L.shadowAlpha;
    ctx.drawImage(sc, 0, 0, vw, vh);
    ctx.restore();
  }

  logOnce(key, e) {
    if (this.errors.has(key)) return;
    this.errors.add(key);
    console.error('[render]', key, e);
  }
}

function resetCtx(ctx) {
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]);
  ctx.shadowBlur = 0; ctx.filter = 'none';
}

// Convex hull (monotone chain) of N points in P (x,y interleaved), appended as one clockwise sub-path.
const _idx = new Int32Array(130);
function hullPath(g, P, N, H) {
  if (N < 3) return;
  for (let i = 0; i < N; i++) _idx[i] = i;
  const ix = _idx.subarray(0, N).sort((a, b) => P[2 * a] - P[2 * b] || P[2 * a + 1] - P[2 * b + 1]);
  const cross = (o, a, b) => (P[2 * a] - P[2 * o]) * (P[2 * b + 1] - P[2 * o + 1]) - (P[2 * a + 1] - P[2 * o + 1]) * (P[2 * b] - P[2 * o]);
  let k = 0;
  for (let i = 0; i < N; i++) { while (k >= 2 && cross(H[k - 2], H[k - 1], ix[i]) <= 0) k--; H[k++] = ix[i]; }
  for (let i = N - 2, t = k + 1; i >= 0; i--) { while (k >= t && cross(H[k - 2], H[k - 1], ix[i]) <= 0) k--; H[k++] = ix[i]; }
  k--;
  if (k < 3) return;
  g.moveTo(P[2 * H[0]], P[2 * H[0] + 1]);
  for (let i = 1; i < k; i++) g.lineTo(P[2 * H[i]], P[2 * H[i] + 1]);
  g.closePath();
}

// screen-space winding-normalised sub-paths so 'nonzero' fill unions everything
function quad(g, ox, oy, kx, ky, a, b, c, d) {
  const P = [a, b, c, d].map((p) => [ox + (p[0] - p[1]) * kx, oy + (p[0] + p[1]) * ky]);
  addCW(g, P);
}
function polyPath(g, ox, oy, kx, ky, pts, dx, dy) {
  const P = pts.map((p) => [ox + (p[0] + dx - p[1] - dy) * kx, oy + (p[0] + dx + p[1] + dy) * ky]);
  addCW(g, P);
}
function addCW(g, P) {
  let a = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; }
  if (Math.abs(a) < 1e-6) return;
  if (a < 0) P.reverse();
  g.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]);
  g.closePath();
}
