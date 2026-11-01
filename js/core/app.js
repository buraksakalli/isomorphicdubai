// App shell: owns camera, light, clock, scene, renderer, input and a tiny event bus.
// Everything other modules need is on the `app` object (also exposed as window.__dubai for tests).
import { Camera } from './iso.js';
import { Light } from './light.js';
import { Scene } from './scene.js';
import { Renderer } from './renderer.js';
import { attachInput } from './input.js';
import * as geo from './geo.js';

export const MIN_ZOOM = 0.03, MAX_ZOOM = 8;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Current Dubai local time (UTC+4) as fractional hours. */
export function dubaiHours(date = new Date()) {
  const u = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return (u + 4) % 24;
}

export function createApp(canvas) {
  const listeners = new Map();
  const app = {
    canvas,
    ctx: canvas.getContext('2d', { alpha: false }),
    geo,
    camera: new Camera(0, 0, 0.1),
    light: new Light(),
    scene: new Scene(),
    terrain: null,
    landmarks: [],       // filled by world/landmarks (each: { id, name:{en,ar}, x, y, ... })
    districts: [],       // filled by data/terrain (each: { id, name:{en,ar}, x, y, ... })
    searchables: [],     // extra searchable items: { id, kind, name:{en,ar}, x, y, zoom }
    lang: 'en',
    selected: null,
    // clock: t = seconds since start (animation time); hours = Dubai local hours used for lighting
    clock: { t: 0, hours: dubaiHours(), mode: 'live', speed: 600 /* sim-seconds per real second in 'cycle' mode */ },
    paused: false,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    vw: 1, vh: 1,
    flight: null,
    on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); },
    emit(ev, data) { const s = listeners.get(ev); if (s) for (const fn of s) { try { fn(data); } catch (e) { console.error('[event]', ev, e); } } },
  };
  app.renderer = new Renderer(app);

  app.setHours = (h, mode = 'manual') => {
    app.clock.hours = ((h % 24) + 24) % 24;
    app.clock.mode = mode;
    app.light.set(app.clock.hours);
    app.emit('time', app.clock);
  };

  app.clampCamera = () => {
    const c = app.camera, t = app.terrain;
    c.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.zoom));
    if (t) { c.x = Math.max(0, Math.min(t.W, c.x)); c.y = Math.max(0, Math.min(t.H, c.y)); }
  };

  app.setCamera = (x, y, zoom) => {
    app.flight = null;
    app.camera.x = x; app.camera.y = y; if (zoom) app.camera.zoom = zoom;
    app.clampCamera();
    app.emit('camera', app.camera);
  };

  /** Smooth fly (zooms out mid-flight for long hops). */
  app.flyTo = (x, y, zoom = app.camera.zoom, duration = null) => {
    const c = app.camera;
    const dist = Math.hypot(x - c.x, y - c.y);
    const dur = duration ?? Math.min(3.2, 0.9 + dist / 120);
    app.flight = { x0: c.x, y0: c.y, z0: c.zoom, x1: x, y1: y, z1: zoom, t: 0, dur,
      dip: Math.max(0, Math.log2(1 + dist * Math.max(c.zoom, zoom) / 25) * 0.8) };
  };

  app.zoomAt = (factor, sx, sy) => {
    const c = app.camera;
    c.begin(app.vw, app.vh);
    const [wx, wy] = c.screenToWorld(sx, sy);
    const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.zoom * factor));
    c.zoom = nz; c.begin(app.vw, app.vh);
    const [wx2, wy2] = c.screenToWorld(sx, sy);
    c.x += wx - wx2; c.y += wy - wy2;
    app.flight = null;
    app.clampCamera();
    app.emit('camera', c);
  };

  /** Topmost pickable object under a screen point (CSS px). */
  app.pickAt = (sx, sy) => {
    const c = app.camera, z = c.zoom;
    const list = app.renderer.picks;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      const x0 = c.ox + o._px0 * z, x1 = c.ox + o._px1 * z, y0 = c.oy + o._py0 * z, y1 = c.oy + o._py1 * z;
      if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
      // tighter test: within the footprint diamond's horizontal span at this height, or above it (the building body)
      const cx = c.ox + (o._px0 + o._px1) / 2 * z;
      const halfW = (x1 - x0) / 2;
      if (Math.abs(sx - cx) <= halfW * 0.85 || (o.pickSlack ?? false)) return o;
    }
    return null;
  };

  app.select = (item) => { app.selected = item; app.emit('select', item); };

  app.resize = () => {
    const rect = canvas.getBoundingClientRect();
    app.vw = Math.max(1, rect.width); app.vh = Math.max(1, rect.height);
    app.maxDpr = Math.min(window.devicePixelRatio || 1, 2);
    app.dpr = Math.min(app.maxDpr, app.dprCap ?? app.maxDpr);
    canvas.width = Math.round(app.vw * app.dpr); canvas.height = Math.round(app.vh * app.dpr);
    // ground chunks are keyed by pixel bucket, so no invalidation is needed on resize
    app.camera.begin(app.vw, app.vh);
  };

  /** Render the current view (or a custom camera) to a new canvas, e.g. for PNG export. */
  app.renderToCanvas = (w = app.vw, h = app.vh, scale = 2, cam = app.camera.clone()) => {
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
    const ctx = cv.getContext('2d');
    app.renderer.render(ctx, cam, w, h, scale, { exporting: true });
    return cv;
  };

  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  app.stats = { fps: 0 };
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!app.paused) app.clock.t += dt;
    app.clock.dt = dt;
    // clock
    if (app.clock.mode === 'live') app.clock.hours = dubaiHours();
    else if (app.clock.mode === 'cycle') app.clock.hours = (app.clock.hours + (dt * app.clock.speed) / 3600) % 24;
    if (app.light.set(app.clock.hours)) app.emit('time', app.clock);
    // flight
    if (app.flight) {
      const f = app.flight;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur), e = ease(k);
      const c = app.camera;
      c.x = f.x0 + (f.x1 - f.x0) * e; c.y = f.y0 + (f.y1 - f.y0) * e;
      c.zoom = Math.exp(Math.log(f.z0) + (Math.log(f.z1) - Math.log(f.z0)) * e - f.dip * Math.sin(Math.PI * e));
      if (k >= 1) { app.flight = null; app.emit('flyend', c); }
      app.emit('camera', c);
    }
    app.emit('tick', dt);
    app.renderer.render(app.ctx, app.camera, app.vw, app.vh, app.dpr);
    adapt(app.renderer.stats.ms);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { app.stats.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    requestAnimationFrame(frame);
  };
  // Adaptive resolution: keep frames near ~30 ms by trading pixel ratio (1x … device ratio).
  let msAvg = 16, settle = 0;
  const adapt = (ms) => {
    msAvg = msAvg * 0.9 + ms * 0.1;
    if (--settle > 0 || app.quality === 'fixed') return;
    const step = 0.25;
    if (msAvg > 34 && app.dpr > 1) { app.dprCap = Math.max(1, app.dpr - step); }
    else if (msAvg < 16 && app.dpr < app.maxDpr) { app.dprCap = Math.min(app.maxDpr, app.dpr + step); }
    else return;
    settle = 90; // frames before next adjustment
    app.resize();
    app.emit('quality', app.dpr);
  };
  app.start = () => {
    app.resize();
    window.addEventListener('resize', app.resize);
    attachInput(app);
    app.manual = /[?&]manual\b/.test(location.search);
    if (app.manual) { app.renderOnce(); return; } // tests drive frames via app.renderOnce()
    requestAnimationFrame((t) => { last = t; frame(t); });
  };
  /** Render one frame synchronously (used by tests / manual mode). Returns renderer stats. */
  app.renderOnce = (dt = 1 / 60) => {
    app.clock.t += dt;
    if (app.light.set(app.clock.hours)) app.emit('time', app.clock);
    app.emit('tick', dt);
    app.renderer.render(app.ctx, app.camera, app.vw, app.vh, app.dpr);
    return app.renderer.stats;
  };
  window.__dubai = app;
  return app;
}
