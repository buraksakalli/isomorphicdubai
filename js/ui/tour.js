// Guided tour: flies through ~10 landmarks with captions, 6 s at each stop.
// Cancel with Esc, the End button, or by dragging / scrolling the map.
import { t, lang } from './i18n.js';
import { pick } from './data.js';
import { esc } from './dom.js';

const PREF = [
  ['burj-khalifa'], ['fountain', 'dubai-mall'], ['museum-of-the-future', 'future'], ['frame'], ['fahidi', 'bastakiya'],
  ['souk', 'souq'], ['creek', 'abra'], ['jumeirah-mosque'], ['burj-al-arab'], ['atlantis'], ['palm'], ['ain-dubai', 'bluewaters'],
  ['marina'], ['expo', 'al-wasl'],
];
const DWELL = 6;

export function initTour(app, ui) {
  const cap = document.getElementById('tour-caption');
  const btn = document.getElementById('tour-btn');
  let stops = [], idx = -1, wait = -1, paused = false, flying = false, active = false;

  function buildStops() {
    const L = (app.landmarks || []).filter((l) => Number.isFinite(l.x));
    const chosen = [];
    for (const keys of PREF) {
      const m = L.find((l) => !chosen.includes(l) && keys.some((k) => l.id.includes(k)));
      if (m) chosen.push(m);
      if (chosen.length >= 10) break;
    }
    const rest = L.filter((l) => !chosen.includes(l)).sort((a, b) => (a.category === 'icon' ? 0 : 1) - (b.category === 'icon' ? 0 : 1));
    while (chosen.length < 10 && rest.length) chosen.push(rest.shift());
    if (chosen.length < 3) {
      // landmarks not ready yet: fall back to famous districts
      for (const d of ui.items().filter((i) => i.kind === 'district' || i.kind === 'island')) { if (chosen.length >= 8) break; chosen.push(d); }
    }
    if (chosen.length < 2) return chosen;
    // nearest-neighbour order starting from the first pick, so flights stay short
    const out = [chosen.shift()];
    while (chosen.length) {
      const p = out[out.length - 1];
      let bi = 0, bd = Infinity;
      chosen.forEach((c, i) => { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; bi = i; } });
      out.push(chosen.splice(bi, 1)[0]);
    }
    return out;
  }

  function render() {
    if (!active) { cap.hidden = true; return; }
    const s = stops[idx];
    if (!s) return;
    const l = lang();
    const blurb = s.blurb ? pick(s.blurb, l) : '';
    cap.innerHTML = `
      <div class="tour-progress" aria-hidden="true"><i style="--p:0"></i></div>
      <p class="tour-step">${esc(t('tourOf')(idx + 1, stops.length))}</p>
      <h2 class="tour-name">${esc(pick(s.name, l))}</h2>
      ${blurb ? `<p class="tour-blurb">${esc(blurb)}</p>` : ''}
      <div class="tour-ctl">
        <button type="button" class="icon-btn" data-t="prev" aria-label="${esc(t('prev'))}"><svg class="ico flip-rtl" aria-hidden="true"><use href="#i-prev"/></svg></button>
        <button type="button" class="icon-btn" data-t="pause" aria-label="${esc(paused ? t('resume') : t('pause'))}"><svg class="ico" aria-hidden="true"><use href="#i-${paused ? 'play' : 'pause'}"/></svg></button>
        <button type="button" class="icon-btn" data-t="next" aria-label="${esc(t('next'))}"><svg class="ico flip-rtl" aria-hidden="true"><use href="#i-next"/></svg></button>
        <button type="button" class="btn btn-quiet" data-t="stop">${esc(t('stop'))}</button>
      </div>`;
    cap.hidden = false;
    cap.classList.toggle('paused', paused);
  }
  const bar = () => cap.querySelector('.tour-progress i');

  function go(i) {
    if (i < 0 || i >= stops.length) { stop(); return; }
    idx = i; wait = -1;
    const s = stops[i];
    app.select(s); // ring + minimap; the card stays hidden while touring
    const zoom = Math.min(1.6, s.zoom || 1);
    if (ui.reduced()) { app.setCamera(s.x, s.y, zoom); flying = false; wait = 0; }
    else { app.flyTo(s.x, s.y, zoom); flying = true; }
    render();
  }
  function start() {
    stops = buildStops();
    if (!stops.length) { ui.toast(t('tourEmpty')); return; }
    ui.closePopovers?.();
    ui.search?.close();
    active = true; paused = false;
    ui.touring = true;
    document.body.classList.add('touring');
    btn?.setAttribute('aria-pressed', 'true');
    go(0);
    setTimeout(() => cap.querySelector('[data-t="pause"]')?.focus({ preventScroll: true }), 50);
  }
  function stop() {
    if (!active) return;
    active = false; ui.touring = false; flying = false;
    app.flight = null;
    document.body.classList.remove('touring');
    btn?.setAttribute('aria-pressed', 'false');
    cap.hidden = true;
    const s = stops[idx];
    idx = -1;
    if (s) app.select(s); // land on the last stop with its card open
  }

  app.on('flyend', () => { if (active && flying) { flying = false; wait = 0; } });
  app.on('tick', (dt) => {
    if (!active || flying || wait < 0) return;
    if (!paused) wait += dt;
    const b = bar();
    if (b) b.style.setProperty('--p', Math.min(1, wait / DWELL).toFixed(3));
    if (wait >= DWELL) { if (idx + 1 >= stops.length) stop(); else go(idx + 1); }
  });

  cap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const a = b.dataset.t;
    if (a === 'stop') stop();
    else if (a === 'next') go(Math.min(stops.length - 1, idx + 1));
    else if (a === 'prev') go(Math.max(0, idx - 1));
    else if (a === 'pause') { paused = !paused; render(); cap.querySelector('[data-t="pause"]')?.focus(); }
  });
  btn?.addEventListener('click', () => (active ? stop() : start()));

  // dragging or wheeling the map cancels the tour
  let down = null;
  app.canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  app.canvas.addEventListener('pointermove', (e) => { if (active && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) stop(); });
  window.addEventListener('pointerup', () => { down = null; });
  app.canvas.addEventListener('wheel', () => { if (active) stop(); }, { passive: true });

  return { start, stop, isActive: () => active, render };
}
