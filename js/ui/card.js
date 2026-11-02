// Info card for the selected item (desktop: floating panel; phones: bottom sheet).
import { t, lang } from './i18n.js';
import { pick } from './data.js';
import { esc, svg, toast } from './dom.js';
import { kindLabel } from './search.js';

export function initCard(app, ui) {
  const card = document.getElementById('card');
  if (!card) return {};
  let item = null;
  let flightId = null, flightLast = null, following = false, flAcc = 0;

  function render() {
    if (ui.touring) { hide(); return; }
    if (flightId) { renderFlight(); return; }
    if (!item) { hide(); return; }
    const l = lang(), other = l === 'ar' ? 'en' : 'ar';
    const nameMain = pick(item.name, l), nameAlt = pick(item.name, other);
    const blurb = item.blurb ? pick(item.blurb, l) : item.kind === 'district' ? (t('kind')[item.district || item.kind] || '') : '';
    const facts = Array.isArray(item.facts) ? item.facts.map((f) => pick(f, l)).filter(Boolean) : [];
    const lines = item.kind === 'metro' && item.lines
      ? `<div class="card-lines"><span class="card-lines-label">${esc(t('lines'))}</span>${item.lines.map((ln) => `<span class="line-chip" style="--c:${esc(ln.color)}">${esc(pick(ln.name, l))}</span>`).join('')}</div>` : '';
    card.innerHTML = `
      <div class="sheet-grip" aria-hidden="true"></div>
      <header class="card-head">
        <span class="card-cat cat-${esc(item.category || item.kind)}">${esc(kindLabel(item))}</span>
        <button type="button" class="icon-btn card-close" aria-label="${esc(t('close'))}">${svg('close')}</button>
      </header>
      <h2 class="card-name" id="card-name">${esc(nameMain)}</h2>
      ${nameAlt && nameAlt !== nameMain ? `<p class="card-alt" lang="${other}" dir="${other === 'ar' ? 'rtl' : 'ltr'}">${esc(nameAlt)}</p>` : ''}
      ${blurb ? `<p class="card-blurb">${esc(blurb)}</p>` : ''}
      ${lines}
      ${facts.length ? `<ul class="card-facts">${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      <div class="card-actions">
        <button type="button" class="btn btn-primary" data-act="fly">${svg('fly')}<span>${esc(t('flyHere'))}</span></button>
        <button type="button" class="btn" data-act="link">${svg('link')}<span>${esc(t('copyLink'))}</span></button>
      </div>`;
    card.setAttribute('aria-labelledby', 'card-name');
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('show'));
    document.body.classList.add('has-card');
  }
  // ---- live flight mode ------------------------------------------------------------------------
  const fmt = (n) => Math.round(n).toLocaleString(lang() === 'ar' ? 'ar-AE' : 'en-GB');
  function flightRows(f) {
    const rows = [];
    rows.push([t('altitude'), f.gnd ? t('onGround') : `${fmt(f.alt / 0.3048)} ft · ${fmt(f.alt)} m`]);
    rows.push([t('groundSpeed'), `${fmt(f.gs / 0.514444)} kt · ${fmt(f.gs * 3.6)} km/h`]);
    if (f.gs > 1 || !f.gnd) rows.push([t('heading'), `${fmt(f.trk)}° ${t('compass')[Math.round(f.trk / 45) % 8]}`]);
    if (!f.gnd) {
      const fpm = f.vr / 0.3048 * 60;
      rows.push([t('vertical'), Math.abs(fpm) < 250 ? t('level') : `${t(fpm > 0 ? 'climbing' : 'descending')} · ${fmt(Math.abs(fpm))} ft/min`]);
    }
    rows.push([t('updated'), f.lost ? t('signalLost') : t('secondsAgo').replace('{n}', fmt(f.fixAge))]);
    return rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  }
  function renderFlight() {
    const f = app.life?.flightInfo?.(flightId) || (flightLast && { ...flightLast, lost: true });
    if (!f) { closeFlight(); return; }
    flightLast = f;
    const op = operatorOf(f.cs), type = typeName(f.type);
    const hexOk = /^[0-9a-f]{6}$/.test(f.id);
    card.innerHTML = `
      <div class="sheet-grip" aria-hidden="true"></div>
      <header class="card-head">
        <span class="card-cat cat-flight">${esc(t('flight'))}${f.lost ? '' : '<span class="live-dot" aria-hidden="true"></span>'}</span>
        <button type="button" class="icon-btn card-close" aria-label="${esc(t('close'))}">${svg('close')}</button>
      </header>
      <h2 class="card-name" id="card-name" dir="ltr">${esc(f.cs || t('unknownCs'))}</h2>
      ${type || op ? `<p class="card-alt card-flight-sub">${esc([op, type].filter(Boolean).join(' · '))}</p>` : ''}
      <dl class="card-stats" id="flight-stats">${flightRows(f)}</dl>
      <p class="card-note">${esc(t('flightNote').replace('{src}', f.source ? f.source + (f.licence ? ', ' + f.licence : '') : 'ADS-B'))}</p>
      <div class="card-actions">
        <button type="button" class="btn ${following ? 'btn-primary' : ''}" data-act="follow" aria-pressed="${following}" ${f.lost ? 'disabled' : ''}>${svg('fly')}<span>${esc(t(following ? 'following' : 'follow'))}</span></button>
        ${hexOk ? `<a class="btn" href="https://globe.adsb.lol/?icao=${f.id}" target="_blank" rel="noopener noreferrer">${svg('link')}<span>${esc(t('viewOn'))}</span></a>` : ''}
      </div>`;
    card.setAttribute('aria-labelledby', 'card-name');
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('show'));
    document.body.classList.add('has-card');
  }
  function refreshFlight() {
    const f = app.life?.flightInfo?.(flightId);
    const el = card.querySelector('#flight-stats');
    if (!f || f.lost) {
      // first time we notice the aircraft is gone: full re-render (disables Follow)
      if (!flightLast?.lost) { setFollow(false); flightLast = flightLast && { ...flightLast, lost: true }; renderFlight(); }
      return;
    }
    const wasLost = flightLast?.lost;
    flightLast = f;
    if (wasLost || !el) renderFlight(); else el.innerHTML = flightRows(f);
  }
  function setFollow(on) {
    following = !!on;
    ui.followFlight = following ? flightId : null;
    const b = card.querySelector('[data-act="follow"]');
    if (b) { b.classList.toggle('btn-primary', following); b.setAttribute('aria-pressed', String(following)); b.querySelector('span').textContent = t(following ? 'following' : 'follow'); }
  }
  function showFlight(id) {
    if (!id) return;
    if (app.selected) app.select(null);
    if (flightId !== id) { following = false; ui.followFlight = null; }
    flightId = id; flightLast = null;
    app.life?.selectFlight?.(id);
    renderFlight();
  }
  function closeFlight() {
    if (!flightId) return;
    flightId = null; flightLast = null; following = false; ui.followFlight = null;
    app.life?.selectFlight?.(null);
    if (item) render(); else hide();
  }
  app.on('tick', (dt) => {
    if (!flightId) return;
    flAcc += dt;
    if (flAcc < 1) return;
    flAcc = 0;
    refreshFlight();
  });

  function hide() {
    card.classList.remove('show');
    card.hidden = true;
    document.body.classList.remove('has-card');
  }

  card.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('card-close')) { if (flightId) closeFlight(); else app.select(null); return; }
    if (b.dataset.act === 'follow' && flightId) { setFollow(!following); return; }
    if (b.dataset.act === 'fly' && item) ui.flyToItem(item);
    if (b.dataset.act === 'link' && item) {
      const url = ui.linkFor(item);
      let ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; } catch { ok = false; }
      if (!ok) { try { history.replaceState(null, '', url); } catch { /* ignore */ } }
      toast(ok ? t('linkCopied') : t('copyFailed'));
    }
  });

  app.on('select', (it) => {
    item = it || null;
    if (item && flightId) { flightId = null; flightLast = null; following = false; ui.followFlight = null; app.life?.selectFlight?.(null); }
    render();
  });
  return { render, hide, showFlight, closeFlight, setFollow, get flightId() { return flightId; } };
}

// ICAO airline designator (first 3 letters of an airline callsign) → operator. Only well-known codes; others omitted.
const OPERATORS = {
  UAE: 'Emirates', FDB: 'flydubai', ETD: 'Etihad Airways', ABY: 'Air Arabia', QTR: 'Qatar Airways', SVA: 'Saudia',
  GFA: 'Gulf Air', OMA: 'Oman Air', KAC: 'Kuwait Airways', THY: 'Turkish Airlines', BAW: 'British Airways',
  DLH: 'Lufthansa', AFR: 'Air France', KLM: 'KLM', SIA: 'Singapore Airlines', CPA: 'Cathay Pacific',
  AIC: 'Air India', AXB: 'Air India Express', IGO: 'IndiGo', PIA: 'Pakistan International Airlines', QFA: 'Qantas',
};
function operatorOf(cs) { const m = /^([A-Z]{3})\d/.exec(cs || ''); return m ? OPERATORS[m[1]] || '' : ''; }
// ICAO type designator → readable name for common types; otherwise the designator itself.
const TYPES = {
  A388: 'Airbus A380', A359: 'Airbus A350-900', A35K: 'Airbus A350-1000', A332: 'Airbus A330-200', A333: 'Airbus A330-300',
  A339: 'Airbus A330-900', A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321', A20N: 'Airbus A320neo',
  A21N: 'Airbus A321neo', B77W: 'Boeing 777-300ER', B77L: 'Boeing 777-200LR', B772: 'Boeing 777-200', B773: 'Boeing 777-300',
  B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10', B744: 'Boeing 747-400', B748: 'Boeing 747-8',
  B738: 'Boeing 737-800', B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9', B763: 'Boeing 767-300',
};
function typeName(code) { return code ? TYPES[code] || code : ''; }
