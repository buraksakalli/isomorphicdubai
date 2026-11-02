// Live aircraft feed: polls the same-origin relay (/api/flights, see tools/flights-relay.mjs) and keeps a smoothed,
// dead-reckoned track per aircraft so planes glide between the ~5 s position updates instead of jumping.
// If the relay is absent (plain static hosting) or the feed goes stale, `live` is false and planes.js falls back to
// its simulation. Time base is the real wall clock (positions are real), not app.clock, which may be time-lapsed.

const POLL_MS = 5000;
const STALE_S = 45;           // feed considered down if no good snapshot for this long
const DROP_S = 40;            // forget an aircraft this long after its last position fix
const MAX_EXTRAP_S = 25;      // never dead-reckon further than this past a fix
const BLEND_S = 1.6;          // time constant for easing out the jump when a new fix arrives
const FADE_S = 2.5;
const GONE_S = 12;            // missing from snapshots this long → fade out (tolerates one or two dropped polls)

export function createLiveFeed(app, { url = '/api/flights' } = {}) {
  const g = app.geo;
  const tracks = new Map();   // id → track
  const st = { state: 'idle', count: 0, source: '', licence: '', updated: 0, error: '' };
  let skew = 0;               // server clock − local clock (s)
  let timer = 0, wanted = false, busy = false, fails = 0, lastGood = 0;

  const nowS = () => Date.now() / 1000 + skew;

  function project(a) {
    const [x, y] = g.toWorld(a.lat, a.lon);
    const th = ((a.trk ?? 0) * Math.PI) / 180;
    // world x = east, y = south; track is clockwise from north
    return { x, y, z: a.alt, vx: (Math.sin(th) * a.gs) / 100, vy: (-Math.cos(th) * a.gs) / 100, vz: a.vr };
  }

  // predicted (un-smoothed) position of a track at time t
  function predict(tr, t, out) {
    const dt = Math.max(0, Math.min(MAX_EXTRAP_S, t - tr.tf));
    out.x = tr.fx + tr.vx * dt; out.y = tr.fy + tr.vy * dt;
    out.z = tr.gnd ? 0 : Math.max(0, tr.fz + tr.vz * dt);
    return out;
  }

  const tmp = { x: 0, y: 0, z: 0 };
  function ingest(d) {
    const recv = Date.now() / 1000;
    if (typeof d.now === 'number') skew = d.now / 1000 - recv;
    const t = nowS();
    const seen = new Set();
    for (const a of d.ac) {
      if (!a || !a.id) continue;
      seen.add(a.id);
      const p = project(a);
      const tf = d.now / 1000 - (a.age || 0);
      let tr = tracks.get(a.id);
      if (tr && tf <= tr.tf) continue; // no newer fix
      if (!tr) {
        tr = { id: a.id, born: t, cx: 0, cy: 0, cz: 0, ct: t, hdg: null, gone: 0 };
        tracks.set(a.id, tr);
      } else {
        // carry the currently displayed position into a decaying correction, so the plane eases onto the new track
        const disp = display(tr, t, { x: 0, y: 0, z: 0 });
        tr.fx = p.x; tr.fy = p.y; tr.fz = p.z; tr.vx = p.vx; tr.vy = p.vy; tr.vz = p.vz; tr.tf = tf; tr.gnd = a.gnd;
        predict(tr, t, tmp);
        tr.cx = disp.x - tmp.x; tr.cy = disp.y - tmp.y; tr.cz = disp.z - tmp.z; tr.ct = t;
        if (Math.hypot(tr.cx, tr.cy) > 30) { tr.cx = tr.cy = tr.cz = 0; } // >3 km: a real jump, don't animate it
      }
      tr.fx = p.x; tr.fy = p.y; tr.fz = p.z; tr.vx = p.vx; tr.vy = p.vy; tr.vz = p.vz; tr.tf = tf; tr.gnd = a.gnd;
      tr.cs = a.cs || ''; tr.t = a.t || ''; tr.cat = a.cat || ''; tr.gs = a.gs; tr.alt = a.alt;
      tr.trk = a.trk; tr.gone = 0;
    }
    for (const tr of tracks.values()) if (!seen.has(tr.id) && !tr.gone) tr.gone = t;
    st.count = d.ac.length; st.source = d.source || ''; st.licence = d.licence || ''; st.updated = recv;
    lastGood = recv;
  }

  function display(tr, t, out) {
    predict(tr, t, out);
    const k = Math.exp(-(t - tr.ct) / BLEND_S);
    out.x += tr.cx * k; out.y += tr.cy * k; out.z = Math.max(0, out.z + tr.cz * k);
    return out;
  }

  async function poll() {
    timer = 0;
    if (!wanted) return;
    if (document.hidden) { schedule(POLL_MS); return; }
    if (busy) return;
    busy = true;
    if (st.state === 'idle') st.state = 'connecting';
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
      if (res.status === 404) { st.state = 'unavailable'; st.error = 'no relay'; fails++; }
      else if (!res.ok) throw new Error('HTTP ' + res.status);
      else {
        const d = await res.json();
        if (!d || !Array.isArray(d.ac)) throw new Error('bad payload');
        ingest(d);
        st.state = 'live'; st.error = ''; fails = 0;
      }
    } catch (e) {
      fails++;
      st.error = String((e && e.message) || e);
      if (Date.now() / 1000 - lastGood > STALE_S) st.state = 'unavailable';
    } finally { busy = false; }
    // back off on errors; a missing relay (static hosting) is re-checked only every 5 minutes
    schedule(!fails ? POLL_MS : st.error === 'no relay' ? 300000 : Math.min(60000, POLL_MS * 2 ** fails));
  }
  function schedule(ms) { if (wanted && !timer) timer = setTimeout(poll, ms); }
  const onVis = () => { if (!document.hidden && wanted && st.state === 'live') { clearTimeout(timer); timer = 0; poll(); } };
  document.addEventListener('visibilitychange', onVis);

  const feed = {
    status: st,
    /** true while the feed is delivering fresh data */
    get live() { return st.state === 'live' && Date.now() / 1000 - lastGood < STALE_S; },
    start() { if (wanted) return; wanted = true; clearTimeout(timer); timer = 0; poll(); },
    stop() { wanted = false; clearTimeout(timer); timer = 0; if (st.state !== 'unavailable') st.state = 'idle'; },
    /**
     * Calls fn(track, x, y, z, alpha) for every displayable aircraft (world tiles, metres). The eased heading is kept
     * on track.hdg (radians, atan2 in world x/y). dt = seconds since the previous call, used for heading easing.
     */
    each(fn, dt) {
      const t = nowS(), pos = tmp;
      for (const tr of tracks.values()) {
        const since = t - tr.tf;
        if (since > DROP_S || (tr.gone && t - tr.gone > GONE_S)) { tracks.delete(tr.id); continue; }
        display(tr, t, pos);
        // heading: velocity direction while moving, else last track; eased so turns between fixes are smooth
        const sp = Math.hypot(tr.vx, tr.vy);
        const target = sp > 0.02 ? Math.atan2(tr.vy, tr.vx) : tr.trk != null ? Math.atan2(-Math.cos(tr.trk * Math.PI / 180), Math.sin(tr.trk * Math.PI / 180)) : tr.hdg ?? 0;
        if (tr.hdg == null) tr.hdg = target;
        else { let dh = target - tr.hdg; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); tr.hdg += dh * Math.min(1, dt * 1.8); }
        let a = Math.min(1, (t - tr.born) / FADE_S);
        if (tr.gone) a = Math.min(a, (GONE_S - (t - tr.gone)) / FADE_S);
        if (since > DROP_S - 10) a = Math.min(a, (DROP_S - since) / 10);
        if (a > 0.01) fn(tr, pos.x, pos.y, pos.z, a);
      }
    },
  };
  return feed;
}
