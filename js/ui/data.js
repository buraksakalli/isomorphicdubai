// Collects everything the UI can point at (landmarks, districts, extra searchables, islands, metro stations)
// into one normalised list. Feature-detects: other modules may not have filled their arrays yet.
import { METRO, DISTRICTS, ISLANDS } from '../data/geo.js';

const kmToTiles = (k) => k * 10;

/** Districts from the app (terrain) or, as a fallback, from the shared geo data. */
export function getDistricts(app) {
  if (app.districts && app.districts.length) return app.districts;
  if (!getDistricts._fb) {
    getDistricts._fb = (DISTRICTS || []).map((d) => {
      const [x, y] = app.geo.toWorld(d.c[0], d.c[1]);
      return { id: d.id, name: d.name, kind: d.kind, x, y, r: kmToTiles(d.r) };
    });
  }
  return getDistricts._fb;
}

/** Metro stations, interchanges merged, each with the lines that serve it. */
export function getStations(app) {
  if (getStations._c) return getStations._c;
  const byName = new Map();
  for (const line of METRO || []) {
    for (const s of line.stations || []) {
      const [en, ar, lat, lon] = s;
      let st = byName.get(en);
      if (!st) {
        const [x, y] = app.geo.toWorld(lat, lon);
        st = { id: 'metro-' + slug(en), kind: 'metro', name: { en, ar }, x, y, lat, lon, zoom: 1.4, lines: [] };
        byName.set(en, st);
      }
      st.lines.push({ id: line.id, name: line.name, color: line.color });
    }
  }
  return (getStations._c = [...byName.values()]);
}

function islandItems(app) {
  const out = [];
  for (const is of ISLANDS || []) {
    let lat, lon;
    if (is.center) [lat, lon] = is.center;
    else if (is.base && is.crown) { lat = (is.base[0] + is.crown[0] * 2) / 3; lon = (is.base[1] + is.crown[1] * 2) / 3; }
    else if (is.pts) { lat = avg(is.pts.map((p) => p[0])); lon = avg(is.pts.map((p) => p[1])); }
    if (lat == null) continue;
    const [x, y] = app.geo.toWorld(lat, lon);
    const zoom = is.kind === 'world' ? 0.16 : is.kind === 'palm' ? 0.22 : 0.8;
    out.push({ id: is.id, kind: 'island', name: is.name, x, y, zoom });
  }
  return out;
}

/** All searchable / selectable items, normalised: { id, kind, name:{en,ar}, x, y, zoom, ref } */
export function collectItems(app) {
  const seen = new Set();
  const items = [];
  const push = (it) => {
    if (!it || !it.name || !Number.isFinite(it.x) || !Number.isFinite(it.y)) return;
    // metro stations get their own key space so a station named after its district (Al Furjan, Business Bay\u2026) stays searchable
    const key = 'n:' + (it.kind === 'metro' ? 'metro:' : '') + String(it.name.en || it.name.ar || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '');
    if ((it.id && seen.has(it.id)) || seen.has(key)) return;
    if (it.id) seen.add(it.id);
    seen.add(key);
    items.push(it);
  };
  for (const l of app.landmarks || []) push({ ...l, kind: 'landmark', zoom: l.zoom || 1, ref: l });
  for (const s of app.searchables || []) push({ ...s, kind: s.kind || 'place', zoom: s.zoom || 0.8, ref: s });
  for (const i of islandItems(app)) push(i);
  for (const d of getDistricts(app)) push({ ...d, kind: 'district', district: d.kind, zoom: districtZoom(d), ref: d });
  for (const s of getStations(app)) push({ ...s, ref: s });
  return items;
}

export function districtZoom(d) {
  const r = d.r || 8;
  return Math.max(0.12, Math.min(0.9, 6 / r * 0.5));
}

/** The best name for the area around a world point (nearest landmark in view, else containing district). */
export function placeName(app, x, y, lang) {
  let best = null, bd = Infinity;
  for (const l of app.landmarks || []) {
    const d = Math.hypot(l.x - x, l.y - y);
    if (d < bd) { bd = d; best = l; }
  }
  if (best && bd < 12) return pick(best.name, lang);
  let dist = null, dd = Infinity;
  for (const d of getDistricts(app)) {
    const k = Math.hypot(d.x - x, d.y - y) / Math.max(1, d.r || 8);
    if (k < dd) { dd = k; dist = d; }
  }
  if (dist && dd < 1.6) return pick(dist.name, lang);
  return lang === 'ar' ? 'دبي' : 'Dubai';
}

export const pick = (v, l) => (v == null ? '' : typeof v === 'string' ? v : v[l] || v.en || v.ar || '');
export const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;

/** hours (0..24) -> "HH:MM" */
export function fmtHours(h) {
  h = ((h % 24) + 24) % 24;
  let hh = Math.floor(h), mm = Math.floor((h - hh) * 60 + 1e-6);
  if (mm >= 60) { mm -= 60; hh = (hh + 1) % 24; }
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
