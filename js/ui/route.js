// Deep links. Hash format:  #@lat,lon,zoom[,t=HH.MM][/item-id]
//   e.g. #@25.1972,55.2744,1.20,t=19.30/burj-khalifa
// Written with history.replaceState when the camera comes to rest; read on load and on hashchange.
import { MIN_ZOOM, MAX_ZOOM } from '../core/app.js';

const RE = /^#@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?),(\d{0,2}(?:\.\d+)?)(?:,t=(\d{1,2})[.:](\d{2}))?(?:\/([a-z0-9][a-z0-9-]{0,80}))?$/i;

export const DEFAULT_VIEW = { lat: 25.2045, lon: 55.2795, zoom: 0.35 };
export const OVERVIEW_ZOOM = 0.07;

export function parseHash(hash) {
  const m = RE.exec(String(hash || '').trim());
  if (!m) return null;
  const lat = +m[1], lon = +m[2], zoom = +m[3];
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 24 || lat > 26 || lon < 54 || lon > 56) return null;
  const out = { lat, lon, zoom: Number.isFinite(zoom) && zoom > 0 ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) : null };
  if (m[4] != null) { const hh = +m[4], mm = +m[5]; if (hh < 24 && mm < 60) out.hours = hh + mm / 60; }
  if (m[6]) out.id = m[6].toLowerCase();
  return out;
}

export function formatHash(app, { x, y, zoom, id, withTime }) {
  const [lat, lon] = app.geo.toLatLon(x, y);
  let h = `#@${lat.toFixed(4)},${lon.toFixed(4)},${zoom.toFixed(zoom < 0.1 ? 3 : 2)}`;
  if (withTime) {
    const hrs = app.clock.hours;
    let hh = Math.floor(hrs), mm = Math.round((hrs - hh) * 60);
    if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
    h += `,t=${String(hh).padStart(2, '0')}.${String(mm).padStart(2, '0')}`;
  }
  if (id && /^[a-z0-9][a-z0-9-]*$/i.test(id)) h += '/' + id;
  return h;
}

export function initRoute(app, ui) {
  let timer = 0, lastWritten = location.hash;

  const write = () => {
    timer = 0;
    if (app.flight) { schedule(); return; }
    const c = app.camera;
    const sel = app.selected;
    const h = formatHash(app, { x: c.x, y: c.y, zoom: c.zoom, id: sel && !ui.touring ? sel.id : null, withTime: app.clock.mode === 'manual' });
    if (h !== lastWritten) {
      lastWritten = h;
      try { history.replaceState(null, '', h); } catch { /* sandboxed */ }
    }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(write, 450); };

  ui.linkFor = (item) => {
    const base = location.href.split('#')[0];
    return base + formatHash(app, { x: item.x, y: item.y, zoom: item.zoom || app.camera.zoom, id: item.id, withTime: app.clock.mode === 'manual' });
  };

  /** Apply a parsed hash. Returns true if it set the camera. */
  function apply(p, { animate = false } = {}) {
    if (!p) return false;
    const [x, y] = app.geo.toWorld(p.lat, p.lon);
    if (p.hours != null) app.setHours(p.hours, 'manual');
    const zoom = p.zoom ?? app.camera.zoom;
    if (animate && !ui.reduced()) app.flyTo(x, y, zoom); else app.setCamera(x, y, zoom);
    if (p.id) {
      const it = ui.items().find((i) => i.id === p.id);
      if (it) ui.selectItem(it);
    }
    return true;
  }

  // initial state (called before app.start(): viewport size unknown, so only set the camera)
  const initial = parseHash(location.hash);
  let intro = false;
  if (!apply(initial)) {
    const [x, y] = app.geo.toWorld(DEFAULT_VIEW.lat, DEFAULT_VIEW.lon);
    if (ui.reduced()) app.setCamera(x, y, DEFAULT_VIEW.zoom);
    else { app.setCamera(x + 6, y + 10, OVERVIEW_ZOOM); intro = true; }
  }
  app.on('ready', () => {
    if (!intro) return;
    const [x, y] = app.geo.toWorld(DEFAULT_VIEW.lat, DEFAULT_VIEW.lon);
    // let the overview paint for a beat, then glide in (no mid-flight zoom-out dip)
    setTimeout(() => {
      if (app.flight || ui.userMoved) return;
      app.flyTo(x, y, DEFAULT_VIEW.zoom, 3.6);
      if (app.flight) app.flight.dip = 0;
    }, 700);
  });

  window.addEventListener('hashchange', () => {
    if (location.hash === lastWritten) return;
    lastWritten = location.hash;
    apply(parseHash(location.hash), { animate: true });
  });

  app.on('camera', schedule);
  app.on('flyend', schedule);
  app.on('select', schedule);
  app.on('time', () => { if (app.clock.mode === 'manual') schedule(); });

  ui.resetView = () => {
    const [x, y] = app.geo.toWorld(DEFAULT_VIEW.lat, DEFAULT_VIEW.lon);
    if (ui.reduced()) app.setCamera(x, y, DEFAULT_VIEW.zoom); else app.flyTo(x, y, DEFAULT_VIEW.zoom);
  };
  return { apply, parseHash, write };
}
