// Scene registry. Objects are plain JS objects:
// {
//   x, y,                 // anchor (tiles) — used for depth sort; usually footprint centre
//   depth?,               // optional explicit depth (default x + y). Larger = drawn later (closer to viewer)
//   bbox: { x0, y0, x1, y1, h },  // footprint extents (tiles) and max height (metres) — used for culling
//   draw(r),              // draws itself with core/shapes.js primitives
//   shadow?: [{ pts:[[x,y],...], h, z? }],  // optional: footprints that cast sun shadows on the ground
//   minZoom?, maxZoom?,   // optional LOD gates
//   pick?: { id, kind:'landmark'|'district'|..., ... } // optional: clickable; renderer records its screen rect
// }
import { HW, HH, ZH } from './iso.js';

export class Scene {
  constructor() {
    this.statics = [];
    this.dirty = true;
    this.overlays = []; // functions (r) => void, drawn after all objects (planes, fireworks, highlights)
    this.underlays = []; // functions (r) => void, drawn after ground tint, before objects (wakes, ground glows)
    this.dynamicSources = []; // functions () => array of dynamic objects (re-read every frame)
  }
  add(obj) {
    if (!obj.bbox) {
      const rad = obj.radius ?? 0.5;
      obj.bbox = { x0: obj.x - rad, y0: obj.y - rad, x1: obj.x + rad, y1: obj.y + rad, h: obj.h ?? 50 };
    }
    prep(obj);
    this.statics.push(obj);
    this.dirty = true;
    return obj;
  }
  addAll(list) { for (const o of list) this.add(o); }
  remove(obj) { const i = this.statics.indexOf(obj); if (i >= 0) { this.statics.splice(i, 1); } }
  sort() {
    if (!this.dirty) return;
    for (const o of this.statics) o._d = o.depth ?? o.x + o.y;
    this.statics.sort((a, b) => a._d - b._d);
    this.dirty = false;
  }
}

/** Compute projected bounds (zoom 1) for culling. Call again if a static object's bbox changes. */
export function prep(o) {
  const b = o.bbox;
  o._px0 = (b.x0 - b.y1) * HW;
  o._px1 = (b.x1 - b.y0) * HW;
  o._py0 = (b.x0 + b.y0) * HH - (b.h || 0) * ZH;
  o._py1 = (b.x1 + b.y1) * HH;
  o._d = o.depth ?? o.x + o.y;
  return o;
}
