// Rasterises the world geometry into masks (2 sub-samples per tile), distance fields and the sea colour image.
import { W, H } from '../../core/geo.js';

export const RES = 2; // mask samples per tile

// CPU-backed canvases: all terrain painting is software-rasterised (see paint.js viaCPU), so sources stay on the CPU.
// (the context is created up front with willReadFrequently, which keeps the canvas in CPU memory)
const mkCanvas = (w, h) => {
  let c;
  if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
  else { c = document.createElement('canvas'); c.width = w; c.height = h; }
  c.getContext('2d', { willReadFrequently: true });
  return c;
};
const mkReadCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : mkCanvas(w, h));
export { mkCanvas };

export function pathOf(polys) {
  const p = new Path2D();
  for (const pts of polys) {
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
  }
  return p;
}
export function linePath(pts) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  return p;
}

/**
 * Rasterise land (R), inland water (G) and roads (B) at RES samples per tile in one pass.
 * Returns { mw, mh, land:Uint8Array, water:Uint8Array, road:Uint8Array } (0..255 coverage).
 */
export function rasterMasks(geo) {
  const mw = W * RES, mh = H * RES;
  const cv = mkReadCanvas(mw, mh);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, mw, mh);
  g.setTransform(RES, 0, 0, RES, 0, 0);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = '#ff0000';
  g.fill(pathOf([geo.mainland]));
  for (const s of geo.islands) for (const p of s.polys) g.fill(pathOf([p]));
  g.fillStyle = '#00ff00';
  for (const w of geo.waters) g.fill(pathOf([w.pts]));
  g.strokeStyle = '#0000ff';
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const r of geo.roads) {
    g.lineWidth = Math.max(r.width, 0.7);
    g.stroke(linePath(r.pts));
  }
  const d = g.getImageData(0, 0, mw, mh).data;
  const n = mw * mh;
  const land = new Uint8Array(n), water = new Uint8Array(n), road = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) { land[i] = d[j]; water[i] = d[j + 1]; road[i] = d[j + 2]; }
  return { mw, mh, land, water, road };
}

/** Chamfer distance (in samples) from every cell to the nearest cell where src[i] is true. */
export function distanceField(mw, mh, isSrc) {
  const INF = 1e9, D = new Float32Array(mw * mh);
  for (let i = 0; i < D.length; i++) D[i] = isSrc(i) ? 0 : INF;
  const A = 1, B = Math.SQRT2;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x;
      let v = D[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, D[i - 1] + A);
      if (y > 0) {
        v = Math.min(v, D[i - mw] + A);
        if (x > 0) v = Math.min(v, D[i - mw - 1] + B);
        if (x < mw - 1) v = Math.min(v, D[i - mw + 1] + B);
      }
      D[i] = v;
    }
  }
  for (let y = mh - 1; y >= 0; y--) {
    for (let x = mw - 1; x >= 0; x--) {
      const i = y * mw + x;
      let v = D[i];
      if (v === 0) continue;
      if (x < mw - 1) v = Math.min(v, D[i + 1] + A);
      if (y < mh - 1) {
        v = Math.min(v, D[i + mw] + A);
        if (x < mw - 1) v = Math.min(v, D[i + mw + 1] + B);
        if (x > 0) v = Math.min(v, D[i + mw - 1] + B);
      }
      D[i] = v;
    }
  }
  return D;
}

// value noise (deterministic)
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// sea colour ramp: [distance in tiles, r, g, b]
const SEA_RAMP = [
  [0, 162, 230, 214], [0.7, 120, 215, 204], [2, 74, 193, 196], [5, 48, 165, 184], [10, 36, 139, 166],
  [18, 30, 119, 150], [32, 26, 105, 138], [50, 24, 96, 130],
];
export const DEEP_SEA = '#186082';
export function seaRGB(d) {
  if (d <= 0) return SEA_RAMP[0].slice(1);
  for (let i = 1; i < SEA_RAMP.length; i++) {
    const a = SEA_RAMP[i - 1], b = SEA_RAMP[i];
    if (d <= b[0]) {
      const t = (d - a[0]) / (b[0] - a[0]), s = t * t * (3 - 2 * t);
      return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s];
    }
  }
  const l = SEA_RAMP[SEA_RAMP.length - 1];
  return [l[1], l[2], l[3]];
}

/** Sea colour image in world space (RES px per tile): shallows to deep teal with gentle noise. */
export function seaImage(mw, mh, seaDist) {
  const cv = mkCanvas(mw, mh);
  const g = cv.getContext('2d');
  const img = g.createImageData(mw, mh);
  const d = img.data;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x;
      const dist = seaDist[i] / RES;
      // wobble the distance a little so bands are organic
      const n1 = vnoise(x * 0.035, y * 0.035), n2 = vnoise(x * 0.12 + 50, y * 0.12);
      const dd = Math.max(0, dist * (0.85 + 0.3 * n1) + (n2 - 0.5) * 0.8);
      const c = seaRGB(dd);
      const shade = 1 + (n1 - 0.5) * 0.06 + (n2 - 0.5) * 0.035;
      const j = i * 4;
      d[j] = c[0] * shade; d[j + 1] = c[1] * shade; d[j + 2] = c[2] * shade; d[j + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/**
 * Land colour image in world space (1 px per tile): pale sand by the coast, warmer/deeper sand inland,
 * long dune bands (NW-SE crests) and broad patches. Sea pixels just get coastal sand (they are clipped away).
 */
export function landImage(mw, mh, shoreDist) {
  const w = W, h = H;
  const cv = mkCanvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const C0 = [238, 222, 182], C1 = [233, 211, 166], C2 = [226, 193, 143], C3 = [218, 178, 126];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sd = shoreDist[Math.min(mh - 1, y * RES + 1) * mw + Math.min(mw - 1, x * RES + 1)] / RES;
      let c;
      if (sd < 4) c = mix(C0, C1, sd / 4);
      else if (sd < 60) c = mix(C1, C2, (sd - 4) / 56);
      else c = mix(C2, C3, Math.min(1, (sd - 60) / 80));
      // dunes: irregular crest bands (warped), stronger far inland; plus broad tonal patches
      const u = (x + y) * 0.7, v = (x - y) * 0.7;
      const warp = vnoise(u * 0.015, v * 0.04) * 9 + vnoise(u * 0.05 + 3, v * 0.08) * 2.5;
      const dune = Math.sin(u * 0.3 + warp) * 0.5 + 0.5;
      const big = vnoise(x * 0.02 + 7, y * 0.02) * 0.7 + vnoise(x * 0.07, y * 0.07 + 11) * 0.3;
      const inland = Math.min(1, Math.max(0, (sd - 20) / 60));
      const k = 1 + (dune - 0.5) * 0.045 * inland * (0.4 + vnoise(x * 0.03, y * 0.03 + 5)) + (big - 0.5) * 0.07;
      const j = (y * w + x) * 4;
      d[j] = Math.min(255, c[0] * k); d[j + 1] = Math.min(255, c[1] * k); d[j + 2] = Math.min(255, c[2] * k * 0.99); d[j + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** Sea colours fading out within ~3 tiles inland of the open sea; painted over inland water to soften channel mouths. */
export function mouthImage(mw, mh, seaDist, shoreDist) {
  const cv = mkCanvas(mw, mh);
  const g = cv.getContext('2d');
  const img = g.createImageData(mw, mh);
  const d = img.data;
  for (let i = 0; i < mw * mh; i++) {
    const sd = shoreDist[i] / RES;
    if (sd >= 3.2) continue;
    const t = Math.max(0, Math.min(1, sd / 3.2)), a = 1 - t * t * (3 - 2 * t);
    const c = seaRGB(Math.max(0.4, seaDist[i] / RES));
    const j = i * 4;
    d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}
