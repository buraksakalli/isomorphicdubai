// Live aircraft feed: polls the same-origin relay (/api/flights, see tools/flights-relay.mjs) and keeps a smoothed,
// dead-reckoned track per aircraft so planes glide between position updates instead of jumping.
// If the relay is absent (plain static hosting) or the feed goes stale, `live` is false and planes.js falls back to
// its simulation. Time base is the real wall clock (positions are real), not app.clock, which may be time-lapsed.
//
// Request budget (the relay runs on a free serverless plan): one poll every 15 s while the visitor is active, every
// 60 s after 5 minutes without input, none while the tab is hidden or the Planes layer is off. To stay accurate
// between sparse updates, aircraft are extrapolated along their current turn rate (arc), not a straight line.

const POLL_ACTIVE_MS = 15000;
const POLL_IDLE_MS = 60000;
const IDLE_AFTER_MS = 5 * 60000;
const MAX_EXTRAP_S = 75;      // never dead-reckon further than this past a fix
const MAX_TURN = Math.PI / 2; // extrapolate at most a quarter turn, then continue straight
const MAX_RATE = 5;           // deg/s clamp on turn rate
const BLEND_S = 2.2;          // time constant for easing out the jump when a new fix arrives
const FADE_S = 2.5;
const DEG = Math.PI / 180;

export function createLiveFeed(app, { url = '/api/flights' } = {}) {
  const g = app.geo;
  const tracks = new Map();   // id → track
  const st = { state: 'idle', count: 0, source: '', licence: '', updated: 0, error: '' };
  let skew = 0;               // server clock − local clock (s)
  let timer = 0, wanted = false, busy = false, fails = 0, lastGood = 0;
  let lastInput = Date.now(), interval = POLL_ACTIVE_MS;

  const nowS = () => Date.now() / 1000 + skew;
  // all freshness thresholds scale with the current poll interval
  const staleS = () => (3 * interval) / 1000 + 15;       // feed considered down
  const goneS = () => (2.2 * interval) / 1000;           // missing from snapshots this long → fade out
  const dropS = () => Math.min(MAX_EXTRAP_S + 10, (2.5 * interval) / 1000 + 20); // since last fix → forget

  // predicted (un-smoothed) position + track angle of a track at time t
  function predict(tr, t, out) {
    const dt = Math.max(0, Math.min(MAX_EXTRAP_S, t - tr.tf));
    const v = tr.gs / 100, th0 = tr.th;     // tiles/s, radians clockwise from north
    let x = tr.fx, y = tr.fy, th = th0;
    const w = tr.w;
    if (Math.abs(w) > 1e-4 && v > 0) {
      const ta = Math.min(dt, MAX_TURN / Math.abs(w));
      th = th0 + w * ta;
      // integral of (v sinθ, −v cosθ) with θ = θ0 + ωt   (x east, y south)
      x += (v / w) * (Math.cos(th0) - Math.cos(th));
      y -= (v / w) * (Math.sin(th) - Math.sin(th0));
      const rest = dt - ta;
      x += Math.sin(th) * v * rest; y -= Math.cos(th) * v * rest;
    } else { x += Math.sin(th0) * v * dt; y -= Math.cos(th0) * v * dt; }
    out.x = x; out.y = y; out.th = th;
    out.z = tr.gnd ? 0 : Math.max(0, tr.fz + tr.vr * Math.min(dt, 30));
    return out;
  }
  function display(tr, t, out) {
    predict(tr, t, out);
    const k = Math.exp(-(t - tr.ct) / BLEND_S);
    out.x += tr.cx * k; out.y += tr.cy * k; out.z = Math.max(0, out.z + tr.cz * k);
    return out;
  }

  const tmp = { x: 0, y: 0, z: 0, th: 0 }, disp = { x: 0, y: 0, z: 0, th: 0 };
  function ingest(d, ageHdr) {
    const recv = Date.now() / 1000;
    // a CDN may hand out a snapshot that is a few seconds old: `now` + the Age header = server time at delivery
    if (typeof d.now === 'number') skew = d.now / 1000 + ageHdr - recv;
    const t = nowS();
    const seen = new Set();
    for (const a of d.ac) {
      if (!a || !a.id) continue;
      seen.add(a.id);
      const [x, y] = g.toWorld(a.lat, a.lon);
      const tf = d.now / 1000 - (a.age || 0);
      let tr = tracks.get(a.id);
      if (tr && tf <= tr.tf) { tr.gone = 0; continue; } // no newer fix
      const th = (a.trk ?? 0) * DEG;
      // turn rate: from the feed if given, else from the change in track since the previous fix
      let w = typeof a.tr === 'number' ? a.tr * DEG : 0;
      if (typeof a.tr !== 'number' && tr && a.trk != null && tr.trk != null && tf - tr.tf > 1 && tf - tr.tf < 120) {
        let dth = th - tr.th; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
        w = dth / (tf - tr.tf);
      }
      w = Math.max(-MAX_RATE * DEG, Math.min(MAX_RATE * DEG, w));
      if (a.gnd) w = 0;
      if (tr) display(tr, t, disp);
      if (!tr) { tr = { id: a.id, born: t, cx: 0, cy: 0, cz: 0, ct: t, hdg: null, gone: 0 }; tracks.set(a.id, tr); }
      Object.assign(tr, { fx: x, fy: y, fz: a.alt, tf, th, w, gs: a.gs || 0, vr: a.vr || 0, gnd: !!a.gnd,
        cs: a.cs || '', t: a.t || '', cat: a.cat || '', alt: a.alt, trk: a.trk, gone: 0 });
      if (tr.born !== t) {
        // carry the currently displayed position into a decaying correction, so the plane eases onto the new track
        predict(tr, t, tmp);
        tr.cx = disp.x - tmp.x; tr.cy = disp.y - tmp.y; tr.cz = disp.z - tmp.z; tr.ct = t;
        if (Math.hypot(tr.cx, tr.cy) > 30) tr.cx = tr.cy = tr.cz = 0; // >3 km: a real jump, don't animate it
      }
    }
    for (const tr of tracks.values()) if (!seen.has(tr.id) && !tr.gone) tr.gone = t;
    st.count = d.ac.length; st.source = d.source || ''; st.licence = d.licence || ''; st.updated = recv;
    lastGood = recv;
  }

  async function poll() {
    timer = 0;
    if (!wanted) return;
    if (document.hidden) return; // resumed by visibilitychange
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
        const age = Math.min(120, Math.max(0, +res.headers.get('age') || 0));
        ingest(d, age);
        st.state = 'live'; st.error = ''; fails = 0;
      }
    } catch (e) {
      fails++;
      st.error = String((e && e.message) || e);
      if (Date.now() / 1000 - lastGood > staleS()) st.state = 'unavailable';
    } finally { busy = false; }
    interval = Date.now() - lastInput > IDLE_AFTER_MS ? POLL_IDLE_MS : POLL_ACTIVE_MS;
    // back off on errors; a missing relay (static hosting) is re-checked only every 10 minutes
    schedule(!fails ? interval : st.error === 'no relay' ? 600000 : Math.min(300000, interval * 2 ** fails));
  }
  function schedule(ms) { if (wanted && !timer) timer = setTimeout(poll, ms); }
  function kick() { if (!wanted || busy) return; clearTimeout(timer); timer = 0; poll(); }

  document.addEventListener('visibilitychange', () => {
    // coming back after a while: fetch right away (the old snapshot is stale)
    if (!document.hidden && wanted && Date.now() / 1000 - st.updated > interval / 1000) kick();
  });
  const onInput = () => {
    const wasIdle = interval === POLL_IDLE_MS;
    lastInput = Date.now();
    if (wasIdle && wanted && st.state === 'live') { interval = POLL_ACTIVE_MS; if (Date.now() / 1000 - st.updated > POLL_ACTIVE_MS / 1000) kick(); }
  };
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) window.addEventListener(ev, onInput, { passive: true });

  const feed = {
    status: st,
    /** true while the feed is delivering fresh data */
    get live() { return st.state === 'live' && Date.now() / 1000 - lastGood < staleS(); },
    get pollMs() { return interval; },
    start() { if (wanted) return; wanted = true; clearTimeout(timer); timer = 0; poll(); },
    stop() { wanted = false; clearTimeout(timer); timer = 0; if (st.state !== 'unavailable') st.state = 'idle'; },
    /** Latest known data for one aircraft (for the info card), or null if it is gone. */
    info(id) {
      const tr = tracks.get(id);
      if (!tr) return null;
      const t = nowS();
      predict(tr, t, tmp);
      return { id: tr.id, cs: tr.cs, type: tr.t, cat: tr.cat, alt: Math.round(tmp.z), gs: tr.gs, trk: ((tmp.th / DEG) % 360 + 360) % 360,
        vr: tr.vr, gnd: tr.gnd, fixAge: Math.max(0, t - tr.tf), lost: !!tr.gone, source: st.source, licence: st.licence };
    },
    /**
     * Calls fn(track, x, y, z, alpha) for every displayable aircraft (world tiles, metres). The eased heading is kept
     * on track.hdg (radians, atan2 in world x/y). dt = seconds since the previous call, used for heading easing.
     */
    each(fn, dt) {
      const t = nowS(), pos = tmp, gS = goneS(), dS = dropS();
      for (const tr of tracks.values()) {
        const since = t - tr.tf;
        if (since > dS || (tr.gone && t - tr.gone > gS)) { tracks.delete(tr.id); continue; }
        display(tr, t, pos);
        // heading: predicted track angle (clockwise from north) → world atan2; eased so corrections never snap
        const target = Math.atan2(-Math.cos(pos.th), Math.sin(pos.th));
        if (tr.hdg == null) tr.hdg = target;
        else { let dh = target - tr.hdg; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); tr.hdg += dh * Math.min(1, dt * 2.5); }
        let a = Math.min(1, (t - tr.born) / FADE_S);
        if (tr.gone) a = Math.min(a, (gS - (t - tr.gone)) / FADE_S);
        if (since > dS - 10) a = Math.min(a, (dS - since) / 10);
        if (a > 0.01) fn(tr, pos.x, pos.y, pos.z, a);
      }
    },
  };
  return feed;
}
