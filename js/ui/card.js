// Info card for the selected item (desktop: floating panel; phones: bottom sheet).
import { t, lang } from './i18n.js';
import { pick } from './data.js';
import { esc, svg, toast } from './dom.js';
import { kindLabel } from './search.js';

export function initCard(app, ui) {
  const card = document.getElementById('card');
  if (!card) return {};
  let item = null;

  function render() {
    if (!item || ui.touring) { hide(); return; }
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
  function hide() {
    card.classList.remove('show');
    card.hidden = true;
    document.body.classList.remove('has-card');
  }

  card.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('card-close')) { app.select(null); return; }
    if (b.dataset.act === 'fly' && item) ui.flyToItem(item);
    if (b.dataset.act === 'link' && item) {
      const url = ui.linkFor(item);
      let ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; } catch { ok = false; }
      if (!ok) { try { history.replaceState(null, '', url); } catch { /* ignore */ } }
      toast(ok ? t('linkCopied') : t('copyFailed'));
    }
  });

  app.on('select', (it) => { item = it || null; render(); });
  return { render, hide };
}
