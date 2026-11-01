// Time-of-day lighting. All object colours go through Light.shade() so the whole city
// re-lights as the sun moves (morning sun lights east faces, afternoon sun the south/west).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, v) => { const t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const rgbCache = new Map();
export function hexToRgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, v);
  return v;
}
export const rgbStr = (r, g, b, a = 1) =>
  a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;

// Approximate Dubai sun path (good for Oct–Mar). Hours are local Dubai time (UTC+4).
const SUNRISE = 6.25, SUNSET = 17.75, MAX_ELEV = 48;

export class Light {
  constructor() {
    this.hours = -1;
    this.cache = new Map();
    this.version = 0;
    this.set(12);
  }

  /** Update for a local hour (0..24). Returns true if lighting changed. */
  set(hours) {
    hours = ((hours % 24) + 24) % 24;
    if (Math.abs(hours - this.hours) < 1 / 240) return false; // < 15 s change: keep cache
    this.hours = hours;
    let elev, az;
    if (hours >= SUNRISE && hours <= SUNSET) {
      const f = (hours - SUNRISE) / (SUNSET - SUNRISE);
      elev = MAX_ELEV * Math.sin(Math.PI * f);
      az = 112 + 136 * f; // ESE -> S -> WSW
    } else {
      const nightLen = 24 - (SUNSET - SUNRISE);
      const g = (((hours - SUNSET) % 24) + 24) % 24 / nightLen;
      elev = -40 * Math.sin(Math.PI * clamp(g, 0, 1));
      az = 248 + 224 * g;
    }
    this.elev = elev; this.az = az;
    const e = (elev * Math.PI) / 180, a = (az * Math.PI) / 180;
    // vector pointing TO the sun; x east, y south, z up
    this.sun = [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];

    const sunUp = smooth(-3, 6, elev);        // direct light amount
    const daylight = smooth(-9, 6, elev);     // sky light amount
    const golden = 1 - smooth(2, 26, elev);   // warm low sun
    const twilight = Math.max(0, 1 - Math.abs(elev + 1) / 9); // dusk/dawn sky tint

    this.night = 1 - smooth(-7, 3, elev);     // 0 day .. 1 full night (drives emissives)
    this.sunI = sunUp;
    this.sunCol = lerp3([1.0, 0.95, 0.88], [1.05, 0.62, 0.36], golden).map((v) => v * 0.7 * sunUp);
    let amb = lerp3([0.11, 0.135, 0.25], [0.5, 0.5, 0.53], daylight);
    amb = [amb[0] + 0.14 * twilight, amb[1] + 0.05 * twilight, amb[2] + 0.02 * twilight];
    this.amb = amb;
    // faint moonlight so night scenes keep form
    const mI = this.night * 0.12;
    this.moon = [mI * 0.8, mI * 0.9, mI * 1.25];
    this.moonDir = [-0.45, 0.35, 0.82];

    // multiply tint for flat ground (normal 0,0,1)
    const k = Math.max(0, this.sun[2]);
    this.groundRGB = [0, 1, 2].map((i) => clamp(amb[i] + this.sunCol[i] * k + this.moon[i] * 0.82, 0, 1.2));
    this.groundTint = rgbStr(...this.groundRGB.map((v) => Math.min(1, v) * 255));
    this.shadowAlpha = 0.32 * sunUp * clamp(this.sun[2] * 4, 0, 1) + 0.06 * sunUp;

    // sky / backdrop colours for UI
    this.skyTop = rgbStr(...lerp3([10, 14, 32], lerp3([90, 150, 210], [70, 70, 120], twilight * 0.8), daylight));
    this.skyBottom = rgbStr(...lerp3([24, 30, 60], lerp3([200, 225, 240], [250, 160, 110], twilight), daylight));

    this.cache.clear();
    this.version++;
    return true;
  }

  /** Light a base colour for a surface with normal (nx, ny, nz). emit (0..1) adds warm interior glow at night. */
  shade(hex, nx = 0, ny = 0, nz = 1, emit = 0) {
    const key = hex + '|' + ((nx * 20) | 0) + ',' + ((ny * 20) | 0) + ',' + ((nz * 20) | 0) + '|' + ((emit * 20) | 0);
    let v = this.cache.get(key);
    if (v) return v;
    const c = hexToRgb(hex), s = this.sun, md = this.moonDir;
    const d = Math.max(0, nx * s[0] + ny * s[1] + nz * s[2]);
    const dm = Math.max(0, nx * md[0] + ny * md[1] + nz * md[2]);
    // subtle sky occlusion: vertical faces get less ambient than roofs; east faces slightly darker for form
    const ao = nz > 0.5 ? 1 : 0.86 - 0.1 * Math.max(0, nx) + 0.04 * Math.max(0, ny);
    const em = emit * this.night;
    const out = [0, 1, 2].map((i) => {
      const lit = this.amb[i] * ao + this.sunCol[i] * d + this.moon[i] * (0.4 + dm);
      return clamp(c[i] * lit + em * [255, 196, 120][i], 0, 255);
    });
    v = rgbStr(out[0], out[1], out[2]);
    this.cache.set(key, v);
    return v;
  }

  /** Emissive colour (lights, neon, windows): fades in at night. Returns rgba string. */
  emit(hex, alpha = 1, dayAlpha = 0) {
    const c = hexToRgb(hex);
    const a = lerp(dayAlpha, alpha, this.night);
    return rgbStr(c[0], c[1], c[2], a);
  }
}

export { clamp, smooth, lerp };
