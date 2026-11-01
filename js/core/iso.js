// Isometric projection + camera.
// World space: x = east (tiles), y = south (tiles), z = up (METRES). 1 tile = 100 m.
// Projected space ("proj", zoom 1): px = (x - y) * HW, py = (x + y) * HH - z * ZH.
// The viewer looks from the south-east toward the north-west, so the Gulf sits at the top of the screen.

export const HW = 32;      // half tile width in px at zoom 1
export const HH = 16;      // half tile height in px at zoom 1
export const ZH = 0.392;   // px per vertical metre at zoom 1 (true 2:1 dimetric proportion for 100 m tiles)

export const projX = (x, y) => (x - y) * HW;
export const projY = (x, y, z = 0) => (x + y) * HH - z * ZH;
export function unproj(px, py) {
  const a = px / HW, b = py / HH;
  return [(a + b) / 2, (b - a) / 2];
}

export class Camera {
  constructor(x = 0, y = 0, zoom = 0.25) {
    this.x = x; this.y = y; this.zoom = zoom;
    this.vw = 1; this.vh = 1; this.ox = 0; this.oy = 0;
  }
  // Must be called before using sx/sy for a frame.
  begin(vw, vh) {
    this.vw = vw; this.vh = vh;
    this.ox = vw / 2 - projX(this.x, this.y) * this.zoom;
    this.oy = vh / 2 - projY(this.x, this.y, 0) * this.zoom;
  }
  sx(x, y) { return this.ox + (x - y) * HW * this.zoom; }
  sy(x, y, z = 0) { return this.oy + ((x + y) * HH - z * ZH) * this.zoom; }
  // Screen -> world on the ground plane (z = 0).
  screenToWorld(sx, sy) {
    return unproj((sx - this.ox) / this.zoom, (sy - this.oy) / this.zoom);
  }
  clone() { const c = new Camera(this.x, this.y, this.zoom); c.begin(this.vw, this.vh); return c; }
}
