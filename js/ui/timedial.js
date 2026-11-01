// Time of day: a sky dome where the sun (or moon) rides its arc, the Dubai clock, Live / Manual / Cycle modes,
// and a 24-hour scrub track whose preset pins (Sunrise, Noon, Golden hour, Night) sit at their actual times.
import { t, lang } from './i18n.js';
import { fmtHours } from './data.js';

// Mirrors core/light.js (approximate Dubai sun path).
const SUNRISE = 6.25, SUNSET = 17.75;
const SPEEDS = [600, 1800, 3600, 7200]; // sim-seconds per real second
export const PRESETS = [
  { key: 'sunrise', h: 6.45 }, { key: 'noon', h: 12.5 }, { key: 'golden', h: 17.15 }, { key: 'night', h: 21.0 },
];

export function phaseOf(app, h) {
  const e = app.light?.elev ?? 30;
  if (e < -6) return 'night';
  if (e < 3) return h < 12 ? 'dawn' : 'dusk';
  if (e < 14) return h < 12 ? 'morning' : 'golden';
  if (Math.abs(h - 12.5) < 1.6) return 'midday';
  return h < 12 ? 'morning' : 'afternoon';
}

export function initTimeDial(app, ui) {
  const root = document.getElementById('time');
  if (!root) return {};
  const $ = (s) => root.querySelector(s);
  const sun = $('#dial-sun'), moon = $('#dial-moon'), skyTop = $('#sky-top'), skyBot = $('#sky-bot');
  const stars = $('#dial-stars'), ground = $('#dial-ground');
  const timeEl = $('#clock-time'), phaseEl = $('#clock-phase');
  const track = $('#track'), thumb = $('#track-thumb'), pins = $('#track-pins');
  const segBtns = [...root.querySelectorAll('[data-mode]')];
  const speedBtn = $('#speed');

  // preset pins positioned along the track at their real times
  pins.innerHTML = PRESETS.map((p) => `<button type="button" class="pin" data-preset="${p.key}" style="--at:${(p.h / 24 * 100).toFixed(2)}%"><span data-i18n="${p.key}">${t(p.key)}</span></button>`).join('');
  pins.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const p = PRESETS.find((q) => q.key === b.dataset.preset);
    ui.cancelTimeAnim?.();
    animateTo(p.h);
  });

  // smooth preset transitions (short sweep forward through the day) unless reduced motion
  let anim = null;
  function animateTo(h) {
    const from = app.clock.hours;
    let delta = ((h - from) % 24 + 24) % 24;
    if (delta > 12) delta -= 24;
    if (ui.reduced() || Math.abs(delta) < 0.05) { app.setHours(h, 'manual'); return; }
    anim = { from, delta, t: 0, dur: Math.min(1.6, 0.5 + Math.abs(delta) / 10) };
    app.setHours(from, 'manual');
  }
  ui.cancelTimeAnim = () => { anim = null; };
  app.on('tick', (dt) => {
    if (!anim) return;
    anim.t += dt;
    const k = Math.min(1, anim.t / anim.dur), e = 1 - Math.pow(1 - k, 3);
    app.setHours(anim.from + anim.delta * e, 'manual');
    if (k >= 1) anim = null;
  });

  // modes
  segBtns.forEach((b) => b.addEventListener('click', () => {
    anim = null;
    const m = b.dataset.mode;
    if (m === 'live') app.setHours(app.clock.hours, 'live');
    else app.setHours(app.clock.hours, m);
    render(true);
    ui.onPrefsChange?.();
  }));
  // roving arrow keys inside the radiogroup
  root.querySelector('.seg').addEventListener('keydown', (e) => {
    const i = segBtns.indexOf(document.activeElement);
    if (i < 0) return;
    const rtl = document.documentElement.dir === 'rtl';
    let d = 0;
    if (e.key === 'ArrowRight') d = rtl ? -1 : 1;
    if (e.key === 'ArrowLeft') d = rtl ? 1 : -1;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation(); // keep the map from panning
    const nb = segBtns[(i + d + segBtns.length) % segBtns.length];
    nb.focus(); nb.click();
  });
  speedBtn.addEventListener('click', () => {
    const i = SPEEDS.indexOf(app.clock.speed);
    app.clock.speed = SPEEDS[(i + 1) % SPEEDS.length];
    render(true);
  });

  // scrub track
  let scrubbing = false;
  const hoursAt = (clientX) => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(23.99, ((clientX - r.left) / r.width) * 24));
  };
  track.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pin')) return;
    scrubbing = true; anim = null;
    track.setPointerCapture(e.pointerId);
    app.setHours(hoursAt(e.clientX), 'manual');
    e.preventDefault();
    track.focus({ preventScroll: true });
  });
  track.addEventListener('pointermove', (e) => { if (scrubbing) app.setHours(hoursAt(e.clientX), 'manual'); });
  const end = () => { scrubbing = false; };
  track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
  track.addEventListener('keydown', (e) => {
    const h = app.clock.hours;
    const step = { ArrowRight: 0.25, ArrowUp: 0.25, ArrowLeft: -0.25, ArrowDown: -0.25, PageUp: 1, PageDown: -1 }[e.key];
    if (step !== undefined) { e.preventDefault(); e.stopPropagation(); anim = null; app.setHours(h + step, 'manual'); }
    else if (e.key === 'Home') { e.preventDefault(); app.setHours(0, 'manual'); }
    else if (e.key === 'End') { e.preventDefault(); app.setHours(23.99, 'manual'); }
  });

  // mobile: tap the clock to expand / collapse the panel
  $('#time-toggle')?.addEventListener('click', () => {
    const open = root.classList.toggle('expanded');
    $('#time-toggle').setAttribute('aria-expanded', String(open));
  });

  // ---- render ------------------------------------------------------------------------------
  let lastKey = '';
  function render(force = false) {
    const c = app.clock, h = c.hours, L = app.light;
    const key = fmtHours(h) + c.mode + c.speed + lang() + (L.night > 0.5);
    const hm = fmtHours(h);
    // sky colours (continuous) — cheap attribute writes
    skyTop.setAttribute('stop-color', L.skyTop);
    skyBot.setAttribute('stop-color', L.skyBottom);
    stars.style.opacity = (L.night * 0.9).toFixed(2);
    ground.setAttribute('fill', L.night > 0.5 ? '#3a3226' : '#d8bd8a');
    // sun / moon positions on the arc
    const day = h >= SUNRISE && h <= SUNSET;
    const f = day ? (h - SUNRISE) / (SUNSET - SUNRISE) : (((h - SUNSET) % 24) + 24) % 24 / (24 - (SUNSET - SUNRISE));
    const th = Math.PI * (1 - f);
    const x = 66 + 50 * Math.cos(th), y = 58 - 44 * Math.sin(th);
    const below = 58 + 14;
    sun.setAttribute('transform', `translate(${day ? x.toFixed(2) : (h < 12 ? 16 : 116)} ${day ? y.toFixed(2) : below})`);
    moon.setAttribute('transform', `translate(${day ? 66 : x.toFixed(2)} ${day ? below : y.toFixed(2)})`);
    thumb.style.setProperty('--at', (h / 24 * 100).toFixed(3) + '%');
    root.style.setProperty('--sun-glow', L.night > 0.5 ? '0' : (1 - L.night).toFixed(2));
    if (!force && key === lastKey) return;
    lastKey = key;
    timeEl.textContent = hm;
    const ph = phaseOf(app, h);
    phaseEl.textContent = t('phase')[ph];
    track.setAttribute('aria-valuenow', h.toFixed(2));
    track.setAttribute('aria-valuetext', `${hm}, ${t('phase')[ph]}`);
    for (const b of segBtns) b.setAttribute('aria-checked', String(b.dataset.mode === c.mode));
    root.dataset.mode = c.mode;
    root.classList.toggle('is-night', L.night > 0.5);
    speedBtn.hidden = c.mode !== 'cycle';
    const mins = c.speed / 60;
    speedBtn.textContent = mins >= 60 ? (lang() === 'ar' ? `${mins / 60} س/ث` : `${mins / 60} h/s`) : (lang() === 'ar' ? `${mins} د/ث` : `${mins} min/s`);
    speedBtn.setAttribute('aria-label', `${t('speed')}: ${speedBtn.textContent}`);
    for (const p of pins.querySelectorAll('.pin')) {
      const pr = PRESETS.find((q) => q.key === p.dataset.preset);
      p.classList.toggle('near', Math.abs(pr.h - h) < 0.35 && c.mode !== 'live');
    }
  }
  let acc = 0;
  app.on('time', () => render());
  app.on('tick', (dt) => { acc += dt; if (acc > 0.2) { acc = 0; render(); } });
  render(true);
  return { render: () => render(true), animateTo };
}
