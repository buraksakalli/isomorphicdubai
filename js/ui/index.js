// UI entry point: wires the DOM chrome (index.html #ui) to the app.
// Every integration with other modules is feature-detected so a half-finished world never breaks the UI.
import { setLang, t, applyStatic, lang } from './i18n.js';
import { $, esc, toast, loadPrefs, savePrefs, reducedMotion, isMobile } from './dom.js';
import { collectItems, pick } from './data.js';
import { initSearch } from './search.js';
import { initCard } from './card.js';
import { initTimeDial } from './timedial.js';
import { initLabels } from './labels.js';
import { initMinimap } from './minimap.js';
import { initTour } from './tour.js';
import { initRoute } from './route.js';
import { exportImage } from './export.js';

const LIFE_KINDS = ['traffic', 'metro', 'boats', 'planes', 'clouds'];

export function initUI(app) {
  const root = document.getElementById('ui');
  if (!root) return;
  const saved = loadPrefs();
  const ui = {
    prefs: { lang: saved.lang === 'ar' ? 'ar' : 'en', labels: saved.labels !== false, layers: { ...(saved.layers || {}) } },
    reduced: reducedMotion,
    toast,
    touring: false,
    exporting: false,
    userMoved: false,
  };
  let itemsCache = null;
  ui.items = () => (itemsCache ||= collectItems(app));
  app.on('ready', () => { itemsCache = null; });
  ui.persist = () => savePrefs({ lang: ui.prefs.lang, labels: ui.prefs.labels, layers: ui.prefs.layers });

  ui.selectItem = (it) => app.select(it && it.kind === 'landmark' && it.ref ? it.ref : it);
  ui.flyToItem = (it) => {
    const zoom = Math.min(3, it.zoom || (it.kind === 'district' ? 0.4 : 1));
    let { x, y } = it;
    if (isMobile() && !ui.touring) {
      // phones: the card is a bottom sheet, so park the item in the upper third of the screen
      const b = (app.vh * 0.2) / (16 * zoom);
      x += b / 2; y += b / 2;
    }
    if (ui.reduced()) app.setCamera(x, y, zoom); else app.flyTo(x, y, zoom);
  };
  ui.goTo = (it) => { ui.cancelMotion(); ui.selectItem(it); ui.flyToItem(it); };
  ui.cancelMotion = () => { if (ui.tour?.isActive()) ui.tour.stop(); };

  // ---- language ------------------------------------------------------------------------------
  function applyLang(l) {
    ui.prefs.lang = l;
    setLang(l);
    app.lang = l;
    const html = document.documentElement;
    html.lang = l;
    html.dir = l === 'ar' ? 'rtl' : 'ltr';
    applyStatic(root);
    renderControls();
    renderLayers();
    ui.card?.render?.();
    ui.time?.render?.();
    ui.tour?.render?.();
    ui.search?.refresh?.();
    ui.minimap?.update?.();
    app.emit('lang', l);
  }
  function renderControls() {
    const dl = $('#controls-list');
    if (dl) dl.innerHTML = t('ctl').map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  }

  // ---- layers --------------------------------------------------------------------------------
  const lifeOk = () => !!(app.life && typeof app.life.setEnabled === 'function');
  function setLife(kind, on) {
    if (!lifeOk()) return;
    try { app.life.setEnabled(kind, on); } catch (e) { /* module may not support this kind */ }
  }
  function renderLayers() {
    const list = $('#layers-list');
    if (!list) return;
    const rows = [['labels', ui.prefs.labels, true]].concat(LIFE_KINDS.map((k) => [k, ui.prefs.layers[k] !== false, lifeOk()]));
    list.innerHTML = rows.map(([k, on, ok]) => `
      <label class="switch-row${ok ? '' : ' is-off'}">
        <span class="switch-text">${esc(t(k))}${ok ? '' : `<small>${esc(t('unavailable'))}</small>`}${k === 'planes' && ok ? '<small id="flights-status"></small><small id="flights-credit" hidden></small>' : ''}</span>
        <input type="checkbox" role="switch" data-layer="${k}" ${on ? 'checked' : ''} ${ok ? '' : 'disabled'}>
        <span class="switch" aria-hidden="true"></span>
      </label>`).join('');
  }
  $('#layers-list')?.addEventListener('change', (e) => {
    const k = e.target.dataset.layer;
    if (!k) return;
    const on = e.target.checked;
    if (k === 'labels') ui.prefs.labels = on;
    else { ui.prefs.layers[k] = on; setLife(k, on); }
    ui.persist();
  });
  for (const k of LIFE_KINDS) if (ui.prefs.layers[k] === false) setLife(k, false);

  // live flight status line under "Planes" (text only, set via textContent)
  let flAcc = 1;
  const renderFlights = () => {
    const el = $('#flights-status'), cr = $('#flights-credit');
    const f = lifeOk() ? app.life.flights : null;
    if (!el || !f) return;
    const on = ui.prefs.layers.planes !== false;
    el.textContent = !on ? '' : f.live ? t('flightsLive').replace('{n}', String(app.life.stats.planes)) : f.state === 'connecting' ? t('flightsConnecting') : t('flightsSim');
    el.hidden = !on;
    if (cr) { cr.hidden = !(on && f.live && f.source); cr.textContent = f.source ? t('flightsCredit').replace('{src}', f.source + (f.licence ? ` (${f.licence})` : '')) : ''; }
  };
  app.on('tick', (dt) => { flAcc += dt; if (flAcc < 1) return; flAcc = 0; if (!$('#layers-panel')?.hidden) renderFlights(); });
  $('#layers-btn')?.addEventListener('click', () => setTimeout(renderFlights, 0));

  // ---- popovers & menu ------------------------------------------------------------------------
  const pops = { save: ['#save-btn', '#save-panel'], layers: ['#layers-btn', '#layers-panel'], menu: ['#menu-btn', '#tools'] };
  ui.closePopovers = (except) => {
    for (const [name, [b, p]] of Object.entries(pops)) {
      if (name === except) continue;
      const btn = $(b), panel = $(p);
      btn?.setAttribute('aria-expanded', 'false');
      if (name === 'menu') panel?.classList.remove('open'); else if (panel) panel.hidden = true;
    }
  };
  const toggle = (name) => {
    const [b, p] = pops[name];
    const btn = $(b), panel = $(p);
    if (!btn || !panel) return;
    const isOpen = name === 'menu' ? panel.classList.contains('open') : !panel.hidden;
    ui.closePopovers();
    if (isOpen) return;
    ui.search?.close?.(false);
    if (name === 'menu') panel.classList.add('open'); else panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    if (name !== 'menu') panel.querySelector('button, input:not([disabled])')?.focus({ preventScroll: true });
  };
  $('#save-btn')?.addEventListener('click', () => toggle('save'));
  $('#layers-btn')?.addEventListener('click', () => toggle('layers'));
  $('#menu-btn')?.addEventListener('click', () => toggle('menu'));
  $('#lang-btn')?.addEventListener('click', () => { applyLang(lang() === 'ar' ? 'en' : 'ar'); ui.persist(); ui.closePopovers(); });
  $('#save-panel')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-export]');
    if (!b) return;
    ui.closePopovers();
    exportImage(app, ui, b.dataset.export);
  });
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pop, #tools, #menu-btn, #save-btn, #layers-btn')) return;
    ui.closePopovers();
  });
  $('#tools')?.addEventListener('click', (e) => {
    // on phones the toolbar is a menu: close it after a direct action
    const b = e.target.closest('#tour-btn, #about-btn');
    if (b && $('#tools').classList.contains('open')) ui.closePopovers();
  });

  // ---- about ---------------------------------------------------------------------------------
  const about = $('#about');
  ui.openAbout = () => {
    if (!about) return;
    ui.closePopovers();
    try { about.showModal(); } catch { about.setAttribute('open', ''); }
  };
  $('#about-open')?.addEventListener('click', ui.openAbout);
  $('#about-btn')?.addEventListener('click', ui.openAbout);
  about?.querySelector('.about-close')?.addEventListener('click', () => about.close());
  about?.addEventListener('click', (e) => { if (e.target === about) about.close(); });

  // ---- zoom ----------------------------------------------------------------------------------
  const zoomBy = (f) => {
    ui.cancelMotion();
    const c = app.camera;
    if (ui.reduced()) app.zoomAt(f, app.vw / 2, app.vh / 2);
    else { app.flyTo(c.x, c.y, Math.max(0.03, Math.min(8, (app.flight ? app.flight.z1 : c.zoom) * f)), 0.35); if (app.flight) app.flight.dip = 0; }
  };
  $('#zoom-in')?.addEventListener('click', () => zoomBy(1.6));
  $('#zoom-out')?.addEventListener('click', () => zoomBy(1 / 1.6));
  $('#zoom-reset')?.addEventListener('click', () => { ui.cancelMotion(); app.select(null); ui.resetView(); });

  // ---- map interaction: click to select, hover tooltip -------------------------------------
  app.on('click', (e) => {
    if (ui.touring) return;
    ui.closePopovers();
    const p = e && e.obj && e.obj.pick;
    if (p) app.select(p);
    else if (app.selected) app.select(null);
  });
  const tip = $('#tip');
  let lastHover = 0, hoverObj = null, pendingHover = null;
  app.on('hover', (h) => { pendingHover = h; });
  app.on('tick', () => {
    if (!pendingHover) return;
    const now = performance.now();
    if (now - lastHover < 70) return;
    lastHover = now;
    const { x, y } = pendingHover;
    pendingHover = null;
    let o = null;
    try { o = app.pickAt(x, y); } catch { o = null; }
    const p = o && o.pick;
    if (p && p.name) {
      if (hoverObj !== p) { tip.textContent = pick(p.name, lang()); hoverObj = p; }
      const rtl = document.documentElement.dir === 'rtl';
      tip.style.transform = `translate(${Math.round(rtl ? x - 14 - tip.offsetWidth : x + 14)}px, ${Math.round(y + 16)}px)`;
      tip.classList.add('show');
      app.canvas.style.cursor = 'pointer';
    } else if (hoverObj) {
      hoverObj = null;
      tip.classList.remove('show');
      app.canvas.style.cursor = '';
    }
  });
  app.canvas.addEventListener('pointerleave', () => { tip.classList.remove('show'); hoverObj = null; });
  app.canvas.addEventListener('pointerdown', () => { ui.userMoved = true; tip.classList.remove('show'); });
  app.canvas.addEventListener('wheel', () => { ui.userMoved = true; }, { passive: true });

  // ---- debug readout -------------------------------------------------------------------------
  const dbg = $('#debug');
  let debugOn = new URLSearchParams(location.search).has('debug');
  const setDebug = (on) => { debugOn = on; dbg.hidden = !on; };
  setDebug(debugOn);
  let dbgAcc = 0;
  app.on('tick', (dt) => {
    if (!debugOn) return;
    dbgAcc += dt;
    if (dbgAcc < 0.25) return;
    dbgAcc = 0;
    const s = app.renderer?.stats || {};
    const c = app.camera;
    const [la, lo] = app.geo.toLatLon(c.x, c.y);
    dbg.textContent = `${app.stats?.fps ?? 0} fps  ${(s.ms ?? 0).toFixed(1)} ms\nobjects ${s.objects ?? 0} / ${app.scene.statics.length}\nchunks ${s.chunks ?? 0}  built ${s.built ?? 0}\nzoom ${c.zoom.toFixed(3)}  ${la.toFixed(4)}, ${lo.toFixed(4)}\nhours ${app.clock.hours.toFixed(2)} ${app.clock.mode}`;
  });

  // ---- keyboard -------------------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    const inField = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); ui.search.open(); return; }
    if (e.key === 'Escape') {
      if (about?.open) return; // native dialog handles it
      if (ui.search.isOpen()) { ui.search.close(); return; }
      const anyPop = !$('#save-panel').hidden || !$('#layers-panel').hidden || $('#tools').classList.contains('open');
      if (anyPop) { ui.closePopovers(); return; }
      if (ui.tour.isActive()) { ui.tour.stop(); return; }
      if (app.selected) { app.select(null); return; }
      return;
    }
    if (inField || mod || e.altKey || about?.open) return;
    if (e.key === '/') { e.preventDefault(); ui.search.open(); }
    else if (e.key === '`') { setDebug(!debugOn); }
    else if (e.key === '?') { ui.openAbout(); }
    else if (e.key === '[' || e.key === ']') { ui.cancelTimeAnim?.(); app.setHours(app.clock.hours + (e.key === ']' ? 0.5 : -0.5), 'manual'); }
    else if ((e.key === 'r' || e.key === 'R') && !e.target.closest('button')) { ui.cancelMotion(); ui.resetView(); }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-', '='].includes(e.key) && !e.target.closest('#ui button, #track')) ui.userMoved = true;
  });

  // ---- modules -------------------------------------------------------------------------------
  setLang(ui.prefs.lang);
  app.lang = ui.prefs.lang;
  ui.search = initSearch(app, ui);
  ui.card = initCard(app, ui);
  ui.time = initTimeDial(app, ui);
  initLabels(app, ui);
  ui.tour = initTour(app, ui);
  ui.route = initRoute(app, ui);
  app.on('ready', () => {
    try { ui.minimap = initMinimap(app, ui); } catch (e) { console.error('[ui] minimap', e); }
  });
  applyLang(ui.prefs.lang);
  // phones stack the minimap / zoom above the time panel: expose its height to CSS
  const timeEl = $('#time');
  if (timeEl && typeof ResizeObserver === 'function') {
    new ResizeObserver(() => document.documentElement.style.setProperty('--time-h', Math.ceil(timeEl.offsetHeight) + 'px')).observe(timeEl);
  }
  ui.exportImage = (kind) => exportImage(app, ui, kind);
  app.ui = ui;
  return ui;
}
