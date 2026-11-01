// Sun shadows for the procedural city, drawn as an underlay (after the ground tint, before objects).
// Each caster is a rectangle footprint + height; its shadow is the convex hull of the footprint and the
// footprint translated along the sun direction (one 6-vertex polygon instead of the core's 6 sub-polygons),
// all unioned in one non-zero path so overlaps don't double-darken. Darkening then tinting == tinting then
// darkening for a black overlay, so the result matches the core shadow pass.

const B = 8; // bucket size (tiles)

export class ShadowLayer {
  constructor(W, H) {
    this.bw = Math.ceil(W / B); this.bh = Math.ceil(H / B);
    this.buckets = new Array(this.bw * this.bh);
    this.data = [];
    this.n = 0;
    this.hull = new Float64Array(32);
  }
  /** rectangle footprint [x0,x1]x[y0,y1] tiles, height h metres, minZoom */
  add(x0, y0, x1, y1, h, mz = 0) { this.addQuad([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], h, mz); }
  /** convex quad footprint (4 points), height h metres */
  addQuad(q, h, mz = 0) {
    const id = this.data.length / 10;
    this.data.push(q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1], h, mz);
    const bi = Math.floor((q[0][0] + q[2][0]) / 2 / B), bj = Math.floor((q[0][1] + q[2][1]) / 2 / B);
    const k = Math.max(0, Math.min(this.bh - 1, bj)) * this.bw + Math.max(0, Math.min(this.bw - 1, bi));
    (this.buckets[k] || (this.buckets[k] = [])).push(id);
    this.n++;
  }
  draw(r, cam) {
    const L = r.L;
    if (L.shadowAlpha <= 0.01 || !this.n) return;
    const s = L.sun;
    if (s[2] <= 0.02) return;
    const hz = Math.hypot(s[0], s[1]) || 1e-6;
    const tanInv = Math.min(1 / Math.max(s[2] / hz, 1e-3), 3.5);
    const dx = -s[0] / hz, dy = -s[1] / hz;
    const kx = r.kx, ky = r.ky, ox = r.ox, oy = r.oy, zoom = r.zoom;
    // visible world range (expanded by the longest shadow)
    const pad = (450 * tanInv) / 100 + 2;
    const c1 = cam.screenToWorld(0, 0), c2 = cam.screenToWorld(r.vw, 0), c3 = cam.screenToWorld(0, r.vh), c4 = cam.screenToWorld(r.vw, r.vh);
    const minX = Math.min(c1[0], c2[0], c3[0], c4[0]) - pad, maxX = Math.max(c1[0], c2[0], c3[0], c4[0]) + pad;
    const minY = Math.min(c1[1], c2[1], c3[1], c4[1]) - pad, maxY = Math.max(c1[1], c2[1], c3[1], c4[1]) + pad;
    const bi0 = Math.max(0, Math.floor(minX / B)), bi1 = Math.min(this.bw - 1, Math.floor(maxX / B));
    const bj0 = Math.max(0, Math.floor(minY / B)), bj1 = Math.min(this.bh - 1, Math.floor(maxY / B));
    const D = this.data, Hh = this.hull;
    const vw = r.vw, vh = r.vh;
    // rasterise at half resolution into an offscreen mask (soft edges, ~4x fewer pixels), then composite
    const SC = 0.5;
    const sc = this.canvas || (this.canvas = document.createElement('canvas'));
    const W2 = Math.ceil(vw * SC) + 1, H2 = Math.ceil(vh * SC) + 1;
    if (sc.width !== W2 || sc.height !== H2) { sc.width = W2; sc.height = H2; }
    const c = this.g || (this.g = sc.getContext('2d'));
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W2, H2);
    c.setTransform(SC, 0, 0, SC, 0, 0);
    c.beginPath();
    let any = false;
    const P = new Float64Array(16);
    for (let bj = bj0; bj <= bj1; bj++) for (let bi = bi0; bi <= bi1; bi++) {
      const a = this.buckets[bj * this.bw + bi];
      if (!a) continue;
      for (let q = 0; q < a.length; q++) {
        const i = a[q] * 10;
        if (zoom < D[i + 9]) continue;
        const len = (D[i + 8] * tanInv) / 100, ex = dx * len, ey = dy * len;
        // 8 screen points: footprint corners and translated corners
        let sxMin = 1e9, sxMax = -1e9, syMin = 1e9, syMax = -1e9;
        for (let k = 0; k < 4; k++) {
          const wx = D[i + k * 2], wy = D[i + k * 2 + 1];
          const X = ox + (wx - wy) * kx, Y = oy + (wx + wy) * ky;
          const X2 = X + (ex - ey) * kx, Y2 = Y + (ex + ey) * ky;
          P[k * 2] = X; P[k * 2 + 1] = Y; P[8 + k * 2] = X2; P[8 + k * 2 + 1] = Y2;
          if (X < sxMin) sxMin = X; if (X > sxMax) sxMax = X; if (X2 < sxMin) sxMin = X2; if (X2 > sxMax) sxMax = X2;
          if (Y < syMin) syMin = Y; if (Y > syMax) syMax = Y; if (Y2 < syMin) syMin = Y2; if (Y2 > syMax) syMax = Y2;
        }
        if (sxMax < 0 || sxMin > vw || syMax < 0 || syMin > vh) continue;
        if (sxMax - sxMin < 0.8 && syMax - syMin < 0.8) continue;
        const n = hull8(P, Hh);
        c.moveTo(Hh[0], Hh[1]);
        for (let k = 1; k < n; k++) c.lineTo(Hh[k * 2], Hh[k * 2 + 1]);
        c.closePath();
        any = true;
      }
    }
    if (!any) return;
    c.fillStyle = '#000';
    c.fill('nonzero');
    const m = r.ctx, pa = m.globalAlpha;
    m.globalAlpha = L.shadowAlpha;
    m.drawImage(sc, 0, 0, W2 / SC, H2 / SC);
    m.globalAlpha = pa;
  }
}

// convex hull (monotone chain) of 8 points P[x,y]*8 into H; returns vertex count. Output is CCW in screen space
// consistently, so the non-zero fill unions overlapping shadows.
const idx = [0, 1, 2, 3, 4, 5, 6, 7];
const lower = new Int32Array(16), upper = new Int32Array(16);
function hull8(P, H) {
  idx.sort((a, b) => P[a * 2] - P[b * 2] || P[a * 2 + 1] - P[b * 2 + 1]);
  const cross = (o, a, b) => (P[a * 2] - P[o * 2]) * (P[b * 2 + 1] - P[o * 2 + 1]) - (P[a * 2 + 1] - P[o * 2 + 1]) * (P[b * 2] - P[o * 2]);
  let nl = 0, nu = 0;
  for (let k = 0; k < 8; k++) {
    const p = idx[k];
    while (nl >= 2 && cross(lower[nl - 2], lower[nl - 1], p) <= 0) nl--;
    lower[nl++] = p;
  }
  for (let k = 7; k >= 0; k--) {
    const p = idx[k];
    while (nu >= 2 && cross(upper[nu - 2], upper[nu - 1], p) <= 0) nu--;
    upper[nu++] = p;
  }
  let n = 0;
  for (let k = 0; k < nl - 1; k++) { H[n * 2] = P[lower[k] * 2]; H[n * 2 + 1] = P[lower[k] * 2 + 1]; n++; }
  for (let k = 0; k < nu - 1; k++) { H[n * 2] = P[upper[k] * 2]; H[n * 2 + 1] = P[upper[k] * 2 + 1]; n++; }
  return n;
}
