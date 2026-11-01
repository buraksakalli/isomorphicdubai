// Landmarks: hand-built isometric miniatures of Dubai's icons. Each group file registers its landmark
// entries (app.landmarks) and scene objects (with pick = entry). See util.js for the mesh toolkit.
import { registerDowntown } from './downtown.js';
import { registerJumeirah } from './jumeirah.js';
import { registerPalm } from './palm.js';
import { registerSZR } from './szr.js';
import { registerOldDubai } from './olddubai.js';
import { registerSouth } from './south.js';

export function registerLandmarks(app) {
  const groups = [registerDowntown, registerJumeirah, registerPalm, registerSZR, registerOldDubai, registerSouth];
  for (const g of groups) {
    try { g(app); } catch (e) { console.error('[landmarks]', g.name, e); }
  }
}
