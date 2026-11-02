// Live flight relay: GET /api/flights → normalised aircraft positions around Dubai.
//
// Why a relay: the public ADS-B APIs (adsb.lol, adsb.fi) do not send CORS headers, so a static page cannot call them
// directly. The relay also caches upstream answers, so any number of viewers costs at most one upstream request per
// CACHE_MS, which keeps us inside the providers' fair-use limits.
//
// Safety: upstream URLs are fixed constants (the client cannot choose the host, path or query, so this is not an open
// proxy), requests time out, bodies are size-capped, and every field is validated and re-serialised. Only flight data
// is forwarded: callsign, ICAO type, position, altitude, speed, track. Registrations and other fields are dropped.
//
// Data: adsb.lol is ODbL-licensed (attribution required, shown in the UI). adsb.fi open data is for personal,
// non-commercial use. Check the provider terms before any public or commercial deployment.

// Centre and radius chosen to cover the map grid (24.86–25.33 N, 54.98–55.45 E) plus approach paths into DXB / DWC.
const LAT = 25.12, LON = 55.25, RADIUS_NM = 45;
const PROVIDERS = [
  { name: 'adsb.lol', url: `https://api.adsb.lol/v2/point/${LAT}/${LON}/${RADIUS_NM}`, licence: 'ODbL' },
  { name: 'adsb.fi', url: `https://opendata.adsb.fi/api/v2/lat/${LAT}/lon/${LON}/dist/${RADIUS_NM}`, licence: 'adsb.fi open data' },
];
const CACHE_MS = 5000;           // serve the same snapshot to everyone for this long
const TIMEOUT_MS = 8000;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_AIRCRAFT = 300;
const FT = 0.3048, KT = 0.514444;

let cache = null;      // { at, body }
let inflight = null;   // Promise<body> shared by concurrent requests

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const str = (v, re) => (typeof v === 'string' && re.test(v.trim()) ? v.trim() : '');

/** readsb-style aircraft record → compact, validated record (or null). */
function normalise(a) {
  if (!a || typeof a !== 'object') return null;
  const lat = num(a.lat, -90, 90), lon = num(a.lon, -180, 180);
  if (lat === null || lon === null) return null;
  const age = num(a.seen_pos, 0, 120) ?? num(a.seen, 0, 120) ?? 0;
  if (age > 60) return null; // stale position
  const gnd = a.alt_baro === 'ground';
  const altFt = gnd ? 0 : num(a.alt_geom, -2000, 60000) ?? num(a.alt_baro, -2000, 60000);
  if (altFt === null) return null;
  const gs = num(a.gs, 0, 1000), trk = num(a.track, 0, 360) ?? num(a.true_heading, 0, 360);
  const vr = num(a.geom_rate, -20000, 20000) ?? num(a.baro_rate, -20000, 20000) ?? 0;
  return {
    id: str(a.hex, /^~?[0-9a-f]{6}$/i).toLowerCase(),
    cs: str(a.flight, /^[A-Z0-9 -]{1,10}$/i).toUpperCase(),
    t: str(a.t, /^[A-Z0-9]{2,4}$/i).toUpperCase(),
    cat: str(a.category, /^[A-D][0-7]$/),
    lat: +lat.toFixed(5), lon: +lon.toFixed(5),
    alt: Math.round(Math.max(0, altFt * FT)),   // metres above sea level (0 on the ground)
    gnd,
    gs: gs === null ? 0 : +(gs * KT).toFixed(1),  // m/s
    trk: trk === null ? null : +trk.toFixed(1),   // degrees true, clockwise from north
    vr: gnd ? 0 : +((vr * FT) / 60).toFixed(2),   // m/s, + = climbing
    age: +age.toFixed(1),                          // seconds between the position fix and `now`
  };
}

async function fetchProvider(p) {
  const res = await fetch(p.url, {
    headers: { accept: 'application/json', 'user-agent': 'isometric-dubai-relay/1.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  });
  if (!res.ok) throw new Error(`${p.name} HTTP ${res.status}`);
  const len = +res.headers.get('content-length');
  if (len > MAX_BYTES) throw new Error(`${p.name} response too large`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`${p.name} response too large`);
  const d = JSON.parse(text);
  const list = Array.isArray(d.ac) ? d.ac : Array.isArray(d.aircraft) ? d.aircraft : null;
  if (!list) throw new Error(`${p.name} unexpected payload`);
  const ac = [];
  for (const a of list) { const n = normalise(a); if (n && n.id) ac.push(n); if (ac.length >= MAX_AIRCRAFT) break; }
  return JSON.stringify({ now: Date.now(), source: p.name, licence: p.licence, ac });
}

async function refresh() {
  let lastErr;
  for (const p of PROVIDERS) {
    try { return await fetchProvider(p); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function snapshot() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.body;
  if (!inflight) {
    inflight = refresh()
      .then((body) => { cache = { at: Date.now(), body }; return body; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/**
 * Returns true if the request was handled (path matched).
 * opts.cdn: also let a CDN (Vercel) cache successful answers for a few seconds, so serverless instances share one
 * upstream request per window instead of each keeping its own in-memory cache. Browsers still get no-store.
 */
export function handleFlights(req, res, opts = {}) {
  const path = new URL(req.url, 'http://x').pathname;
  if (path !== '/api/flights') return false;
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  const okHeaders = opts.cdn ? { ...headers, 'vercel-cdn-cache-control': 'max-age=4, stale-while-revalidate=10' } : headers;
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { ...headers, allow: 'GET, HEAD' }); res.end('{"error":"method not allowed"}'); return true; }
  snapshot().then(
    (body) => { res.writeHead(200, okHeaders); res.end(req.method === 'HEAD' ? undefined : body); },
    (e) => {
      console.error('[flights] upstream unavailable:', e && e.message);
      // a slightly stale snapshot beats nothing; beyond a minute, report unavailable
      if (cache && Date.now() - cache.at < 60000) { res.writeHead(200, headers); res.end(cache.body); return; }
      res.writeHead(502, headers); res.end('{"error":"live flight data unavailable"}');
    },
  );
  return true;
}
