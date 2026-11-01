// Bootstrap. Order matters: terrain -> city -> landmarks -> life -> UI.
import { createApp } from './core/app.js';
import { buildTerrain } from './world/terrain.js';
import { buildCity } from './world/city.js';
import { registerLandmarks } from './world/landmarks/index.js';
import { createLife } from './life/index.js';
import { initUI } from './ui/index.js';

const status = (msg) => { const el = document.getElementById('loader-status'); if (el) el.textContent = msg; };
const step = (msg, fn) => new Promise((res, rej) => { status(msg); setTimeout(() => { try { res(fn()); } catch (e) { rej(e); } }, 0); });

async function boot() {
  const canvas = document.getElementById('map');
  const app = createApp(canvas);
  const t0 = performance.now();
  app.terrain = await step('Shaping the coastline…', () => buildTerrain(app));
  if (app.terrain.districts) app.districts = app.terrain.districts;
  app.city = await step('Raising the skyline…', () => buildCity(app));
  await step('Placing landmarks…', () => registerLandmarks(app));
  app.life = await step('Starting the traffic…', () => createLife(app));
  await step('Opening the map…', () => initUI(app));
  app.bootMs = Math.round(performance.now() - t0);
  app.start();
  app.emit('ready', app);
  document.body.classList.add('ready');
}
boot().catch((e) => {
  console.error('[boot]', e);
  status('Something went wrong while building the city: ' + e.message);
});
