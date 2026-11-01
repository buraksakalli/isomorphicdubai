// Diamond-shaped overview map in the same isometric projection as the main view, plus a north
// arrow and a scale bar. The terrain is rasterised once; the viewport quad is redrawn on camera moves.
const HW = 32, HH = 16;
// Atlas palette keyed by terrain type NAME (so it survives enum re-ordering).
const PAL = {
  SEA: [44, 104, 128], SHALLOW: [82, 152, 166], BEACH: [234, 216, 170], DESERT: [216, 189, 139], URBAN: [205, 192, 168],
  ROAD: [150, 136, 116], PARK: [140, 170, 104], WATER: [62, 134, 160], RUNWAY: [128, 118, 104], GOLF: [150, 182, 112],
  WETLAND: [112, 152, 128], PLAZA: [226, 214, 192],
};
const DEFAULT_LAND = [216, 189, 139];
const NICE = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

export function initMinimap(app, ui) {
  const wrap = document.getElementById('minimap');
  const cv = document.getElementById('minimap-canvas');
  if (!wrap || !cv || !app.terrain) return { update() {} };
  const terr = app.terrain;
  const W = terr.W, H = terr.H;
  let MW = 0, MH = 0, s = 1, base = null, dpr = 1, dirty = true;

  const projSpan = (W + H) * HW; // projected width at zoom 1
  const toMini = (x, y) => [((x - y) * HW + H * HW) * s, ((x + y) * HH) * s];
  const fromMini = (mx, my) => {
    const px = mx / s - H * HW, py = my / s;
    const a = px / HW, b = py / HH;
    return [(a + b) / 2, (b - a) / 2];
  };

  function build() {
    const rect = cv.getBoundingClientRect();
    MW = Math.max(60, Math.round(rect.width)); MH = Math.round(MW / 2);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(MW * dpr); cv.height = Math.round(MH * dpr);
    s = MW / projSpan;
    const BW = cv.width, BH = cv.height;
    base = document.createElement('canvas'); base.width = BW; base.height = BH;
    const g = base.getContext('2d');
    const img = g.createImageData(BW, BH);
    const d = img.data;
    const T = terr.T || {};
    const names = [];
    for (const k of Object.keys(T)) names[T[k]] = k;
    const pal = names.map((n) => PAL[n] || DEFAULT_LAND);
    const seaIdx = T.SEA ?? 0, shallowIdx = T.SHALLOW ?? -1, waterIdx = T.WATER ?? -1;
    const isWet = (v) => v === seaIdx || v === shallowIdx || v === waterIdx;
    const types = terr.types;
    const sample = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : types[(y | 0) * W + (x | 0)]);
    const ss = s * dpr;
    for (let j = 0; j < BH; j++) {
      for (let i = 0; i < BW; i++) {
        const px = (i + 0.5) / ss - H * HW, py = (j + 0.5) / ss;
        const a = px / HW, b = py / HH;
        const x = (a + b) / 2, y = (b - a) / 2;
        const v = sample(x, y);
        if (v < 0) continue;
        let c = pal[v] || DEFAULT_LAND;
        const o = (j * BW + i) * 4;
        let k = 1;
        if (!isWet(v)) {
          // darken the shore line a touch so the coast reads at this tiny size
          const step = 1.2 / s / HW;
          if (isWet(sample(x + step, y)) || isWet(sample(x, y + step)) || isWet(sample(x - step, y)) || isWet(sample(x, y - step))) k = 0.82;
        } else if (v === seaIdx) {
          k = 0.9 + 0.1 * Math.min(1, (x + (H - y)) / (W + H) * 1.6); // faint depth gradient
        }
        d[o] = c[0] * k; d[o + 1] = c[1] * k; d[o + 2] = c[2] * k; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // landmark pins
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const l of app.landmarks || []) {
      if (!Number.isFinite(l.x)) continue;
      const [mx, my] = toMini(l.x, l.y);
      g.beginPath(); g.arc(mx, my, 1.3, 0, Math.PI * 2);
      g.fillStyle = 'rgba(60,36,12,.85)'; g.fill();
    }
    dirty = true;
  }

  function draw() {
    if (!base) build();
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(base, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = app.camera;
    c.begin(app.vw, app.vh);
    const corners = [[0, 0], [app.vw, 0], [app.vw, app.vh], [0, app.vh]].map(([sx, sy]) => toMini(...c.screenToWorld(sx, sy)));
    g.beginPath();
    corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = 'rgba(255,244,220,.18)'; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = '#ffe2a8'; g.stroke();
    // small centre dot if the quad gets tiny
    const [cx, cy] = toMini(c.x, c.y);
    const qw = Math.abs(corners[1][0] - corners[0][0]);
    if (qw < 8) { g.beginPath(); g.arc(cx, cy, 2.5, 0, Math.PI * 2); g.fillStyle = '#ffe2a8'; g.fill(); }
    // selected item
    const sel = app.selected;
    if (sel && Number.isFinite(sel.x)) {
      const [sx, sy] = toMini(sel.x, sel.y);
      g.beginPath(); g.arc(sx, sy, 3.2, 0, Math.PI * 2);
      g.fillStyle = '#f0b45a'; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(30,20,10,.8)'; g.stroke();
    }
    updateScale();
    dirty = false;
  }

  const scaleBar = document.getElementById('scale-bar');
  const scaleText = document.getElementById('scale-text');
  let lastScale = '';
  function updateScale() {
    const mPerPx = (100 * Math.SQRT2) / (2 * HW * app.camera.zoom);
    const maxPx = Math.max(50, Math.min(110, (MW || 240) * 0.45));
    let best = NICE[0];
    for (const n of NICE) { if (n / mPerPx <= maxPx) best = n; }
    const px = Math.round(best / mPerPx);
    const ar = app.lang === 'ar';
    const label = best >= 1000 ? `${best / 1000} ${ar ? 'كم' : 'km'}` : `${best} ${ar ? 'م' : 'm'}`;
    const key = px + label;
    if (key === lastScale) return;
    lastScale = key;
    if (scaleBar) scaleBar.style.width = px + 'px';
    if (scaleText) scaleText.textContent = label;
  }

  // interaction: click or drag to move the camera
  let dragging = false;
  const moveTo = (e, smooth) => {
    const rect = cv.getBoundingClientRect();
    const [x, y] = fromMini(e.clientX - rect.left, e.clientY - rect.top);
    const cx = Math.max(0, Math.min(W, x)), cy = Math.max(0, Math.min(H, y));
    ui.cancelMotion?.();
    if (smooth) app.flyTo(cx, cy, app.camera.zoom, 0.45);
    else app.setCamera(cx, cy);
  };
  cv.addEventListener('pointerdown', (e) => { dragging = true; cv.setPointerCapture(e.pointerId); moveTo(e, !ui.reduced()); e.preventDefault(); });
  cv.addEventListener('pointermove', (e) => { if (dragging) moveTo(e, false); });
  const stop = () => { dragging = false; };
  cv.addEventListener('pointerup', stop);
  cv.addEventListener('pointercancel', stop);

  app.on('camera', () => { dirty = true; });
  app.on('select', () => { dirty = true; });
  let raf = 0;
  app.on('tick', () => { if (dirty && !raf) { raf = 1; draw(); raf = 0; } });
  window.addEventListener('resize', () => { base = null; dirty = true; });

  const nightTint = () => wrap.classList.toggle('is-night', app.light.night > 0.5);
  app.on('time', nightTint);
  nightTint();

  // north arrow: world north (0,-1) projected to screen
  const north = document.getElementById('north');
  if (north) {
    const dx = (0 - -1) * HW, dy = (0 + -1) * HH;
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    north.style.setProperty('--rot', deg.toFixed(1) + 'deg');
  }
  return { update: () => { dirty = true; }, rebuild: () => { base = null; dirty = true; } };
}

