// Life layer: everything that moves. createLife(app) is called once after terrain/city/landmarks are built.
//   traffic  – lane-based cars/taxis/buses/trucks on ROADS (underlay; light streams at low zoom / night)
//   metro    – Red & Green line viaducts + stations (static) and 5-car trains (dynamic objects)
//   boats    – abras, moored + cruising dhows, yachts, ships, wakes and sea glints
//   planes   – real-time ADS-B traffic via the /api/flights relay when available, else simulated DXB / DWC
//              arrivals & departures; drawn at (compressed) altitude as an overlay with ground shadows
//   clouds   – drifting puffs + shadows; fireworks (life.fireworks(x, y); auto at 00:00–00:05)
import { createTraffic } from './traffic.js';
import { createMetro } from './metro.js';
import { createBoats } from './boats.js';
import { createPlanes } from './planes.js';
import { createSky } from './sky.js';

export function createLife(app) {
  const mods = {};
  const sc = app.scene, u0 = sc.underlays.length, o0 = sc.overlays.length;
  const make = (name, fn) => {
    try { mods[name] = fn(); } catch (e) { console.error('[life] ' + name + ' failed', e); mods[name] = null; }
  };
  make('traffic', () => createTraffic(app));
  make('metro', () => createMetro(app));
  make('boats', () => createBoats(app));
  make('sky', () => createSky(app));          // cloud shadows overlay goes under the planes
  make('planes', () => createPlanes(app));
  if (mods.sky) mods.sky.attachOverlays();    // clouds + fireworks above the planes

  // cheap self-timing of the layer's own draw passes (ms in the last frame), exposed via life.stats.ms
  const ms = { update: 0, under: 0, over: 0 };
  const wrap = (list, from, key) => {
    for (let i = from; i < list.length; i++) {
      const f = list[i];
      list[i] = (r) => { const t = performance.now(); try { f(r); } finally { ms[key] += performance.now() - t; } };
    }
  };
  wrap(sc.underlays, u0, 'under');
  wrap(sc.overlays, o0, 'over');
  // reset the draw accumulators at the first life underlay of each frame
  const firstUnder = sc.underlays[u0];
  if (firstUnder) sc.underlays[u0] = (r) => { last.under = ms.under; last.over = ms.over; ms.under = 0; ms.over = 0; firstUnder(r); };
  const last = { under: 0, over: 0 };

  const order = ['traffic', 'metro', 'boats', 'planes', 'sky'];
  function update(dt = 0) {
    const t0 = performance.now();
    for (const k of order) {
      const m = mods[k];
      if (!m) continue;
      try { m.update(dt); } catch (e) { if (!m._err) { m._err = true; console.error('[life] update ' + k, e); } }
    }
    ms.update = performance.now() - t0;
  }
  app.on('tick', update);
  update(0);

  const KINDS = { traffic: 'traffic', metro: 'metro', boats: 'boats', planes: 'planes' };
  const life = {
    update,
    modules: mods,
    /** kind: 'traffic' | 'metro' | 'boats' | 'planes' | 'clouds' | 'fireworks' */
    setEnabled(kind, on) {
      if (kind === 'clouds') mods.sky?.setClouds(on);
      else if (kind === 'fireworks') mods.sky?.setFireworks(on);
      else if (KINDS[kind] && mods[kind]) mods[kind].setEnabled(on);
      else return false;
      update(0);
      return true;
    },
    isEnabled(kind) {
      if (kind === 'clouds') return !!mods.sky?.cloudsOn;
      if (kind === 'fireworks') return !!mods.sky?.fireworksOn;
      return !!mods[kind]?.enabled;
    },
    /** Fireworks show at world (x, y) tiles; defaults to Burj Khalifa. */
    fireworks(x, y, dur = 30) { return mods.sky ? mods.sky.fireworks(x, y, dur) : 0; },
    /** Live counts for a stats panel. */
    get stats() {
      return {
        cars: mods.traffic?.stats.visible ?? 0, carsTotal: mods.traffic?.stats.total ?? 0, trafficMode: mods.traffic?.stats.mode,
        trafficDensity: +(mods.traffic?.stats.density ?? 0).toFixed(2),
        trains: mods.metro?.stats.trains ?? 0, metroCars: mods.metro?.stats.cars ?? 0,
        boats: mods.boats?.stats.boats ?? 0, ships: mods.boats?.stats.ships ?? 0,
        planes: mods.planes?.stats.planes ?? 0, planesSource: mods.planes?.stats.source ?? 'sim', clouds: mods.sky?.stats.clouds ?? 0, particles: mods.sky?.stats.particles ?? 0,
        statics: (mods.metro?.stats.statics ?? 0) + (mods.boats?.stats.statics ?? 0),
        // previous frame's cost of life's own passes (dynamic trains/boats draw inside the object pass, not counted)
        ms: { update: +ms.update.toFixed(2), underlays: +last.under.toFixed(2), overlays: +last.over.toFixed(2) },
      };
    },
    metroPaths: mods.metro?.paths ?? [],
    /** Live flight feed status: { state: 'idle'|'connecting'|'live'|'unavailable', count, source, licence, updated } */
    get flights() { const f = mods.planes?.feed; return f ? { ...f.status, live: f.live } : null; },
  };
  return life;
}
