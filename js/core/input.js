// Mouse / touch / keyboard camera control: drag-pan with inertia, wheel + pinch zoom about the cursor,
// double-click zoom, arrows/WASD pan, +/- zoom. Clicks (no drag) emit 'click' with the picked object.
import { HW, HH } from './iso.js';

export function attachInput(app) {
  const el = app.canvas;
  const ptrs = new Map();
  let drag = null, vel = [0, 0], lastMove = 0, pinch = null, moved = 0;

  const panBy = (dxPx, dyPx) => {
    const c = app.camera, z = c.zoom;
    // screen delta -> world delta (inverse projection of a vector)
    const a = -dxPx / (HW * z), b = -dyPx / (HH * z);
    c.x += (a + b) / 2; c.y += (b - a) / 2;
    app.flight = null;
    app.clampCamera();
    app.emit('camera', c);
  };

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    vel = [0, 0]; moved = 0;
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY };
    if (ptrs.size === 2) {
      const [p, q] = [...ptrs.values()];
      pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), z: app.camera.zoom };
      drag = null;
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) {
      app.emit('hover', { x: e.offsetX, y: e.offsetY });
      return;
    }
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) {
      const [p, q] = [...ptrs.values()];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      const rect = el.getBoundingClientRect();
      const mx = (p[0] + q[0]) / 2 - rect.left, my = (p[1] + q[1]) / 2 - rect.top;
      app.zoomAt((pinch.z * (d / pinch.d)) / app.camera.zoom, mx, my);
      moved += 10;
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      moved += Math.abs(dx) + Math.abs(dy);
      panBy(dx, dy);
      const now = performance.now();
      const dtm = Math.max(1, now - lastMove);
      vel = [vel[0] * 0.5 + (dx / dtm) * 8, vel[1] * 0.5 + (dy / dtm) * 8];
      lastMove = now;
      el.style.cursor = 'grabbing';
    }
  });
  const end = (e) => {
    const wasClick = ptrs.size === 1 && moved < 6 && !pinch;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      drag = null;
      el.style.cursor = '';
      if (performance.now() - lastMove > 80) vel = [0, 0];
      if (wasClick) {
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const obj = app.pickAt(sx, sy);
        const [wx, wy] = app.camera.screenToWorld(sx, sy);
        app.emit('click', { sx, sy, wx, wy, obj });
      }
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const k = e.ctrlKey ? 0.012 : 0.0016; // trackpad pinch sends ctrlKey
    app.zoomAt(Math.exp(-e.deltaY * k), e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  el.addEventListener('dblclick', (e) => {
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const c = app.camera;
    c.begin(app.vw, app.vh);
    const [wx, wy] = c.screenToWorld(sx, sy);
    app.flyTo(wx, wy, c.zoom * (e.shiftKey ? 0.5 : 2), 0.6);
  });

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) { keys.add(e.key.toLowerCase()); e.preventDefault(); }
    if (e.key === '+' || e.key === '=') app.zoomAt(1.25, app.vw / 2, app.vh / 2);
    if (e.key === '-' || e.key === '_') app.zoomAt(0.8, app.vw / 2, app.vh / 2);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  app.on('tick', (dt) => {
    // inertia
    if (!drag && !pinch && (Math.abs(vel[0]) > 0.05 || Math.abs(vel[1]) > 0.05)) {
      panBy(vel[0] * dt * 60 * 0.12, vel[1] * dt * 60 * 0.12);
      const f = Math.pow(0.04, dt);
      vel[0] *= f; vel[1] *= f;
    }
    if (keys.size) {
      const s = 600 * dt;
      let dx = 0, dy = 0;
      if (keys.has('arrowleft') || keys.has('a')) dx += s;
      if (keys.has('arrowright') || keys.has('d')) dx -= s;
      if (keys.has('arrowup') || keys.has('w')) dy += s;
      if (keys.has('arrowdown') || keys.has('s')) dy -= s;
      if (dx || dy) panBy(dx, dy);
    }
  });
}
