// Fuzzy search (EN + AR) over landmarks, districts, searchables, islands and metro stations.
// Combobox pattern: input[role=combobox] + ul[role=listbox], arrow keys / Enter / Esc.
import { collectItems, pick } from './data.js';
import { t, lang } from './i18n.js';
import { esc } from './dom.js';

/** Normalise for matching: lowercase, strip Latin diacritics, unify Arabic letter variants, drop tashkeel/tatweel. */
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/^ال/, '').replace(/\sال/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function scoreOne(hay, q) {
  if (!hay || !q) return 0;
  if (hay === q) return 100;
  if (hay.startsWith(q)) return 80 - Math.min(20, hay.length - q.length) * 0.3;
  const words = hay.split(' ');
  if (words.some((w) => w.startsWith(q))) return 65;
  const qWords = q.split(' ');
  if (qWords.length > 1 && qWords.every((qw) => words.some((w) => w.startsWith(qw)))) return 60;
  const i = hay.indexOf(q);
  if (i >= 0) return 50 - i * 0.2;
  // subsequence with gap penalty (typo-tolerant-ish)
  let hi = 0, gaps = 0, run = 0, best = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const j = hay.indexOf(ch, hi);
    if (j < 0) return 0;
    if (j === hi) { run++; best = Math.max(best, run); } else { gaps += j - hi; run = 1; }
    hi = j + 1;
  }
  const s = 35 - gaps * 1.2 + best * 1.5;
  return s > 8 ? s : 0;
}

const KIND_BOOST = { landmark: 6, island: 4, place: 3, district: 2, metro: 0 };

export function searchItems(items, query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const out = [];
  for (const it of items) {
    if (!it._n) it._n = [norm(it.name.en), norm(it.name.ar), norm(it.id && it.id.replace(/-/g, ' '))];
    const s = Math.max(scoreOne(it._n[0], q), scoreOne(it._n[1], q), scoreOne(it._n[2], q) * 0.8);
    if (s > 0) out.push([s + (KIND_BOOST[it.kind] || 0), it]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, limit).map((p) => p[1]);
}

export function kindLabel(it) {
  const cat = t('cat');
  if (it.category && (!it.kind || it.kind === 'landmark')) return cat[it.category] || cat.place;
  if (it.kind === 'landmark') return cat.place;
  if (it.kind === 'district') return (t('kind')[it.district] || cat.district);
  return cat[it.kind] || cat.place;
}

export function initSearch(app, ui) {
  const box = document.getElementById('search');
  const input = document.getElementById('search-input');
  const list = document.getElementById('search-results');
  const toggle = document.getElementById('search-toggle');
  let items = null, results = [], active = -1;
  const getItems = () => (items ||= collectItems(app));
  app.on('ready', () => { items = null; });

  const suggestions = () => {
    const L = getItems().filter((i) => i.kind === 'landmark');
    const pref = ['burj-khalifa', 'burj-al-arab', 'museum-of-the-future', 'dubai-frame', 'atlantis', 'ain-dubai'];
    const top = pref.map((p) => L.find((l) => l.id.includes(p))).filter(Boolean);
    for (const l of L) if (top.length < 6 && !top.includes(l)) top.push(l);
    if (top.length < 4) for (const d of getItems()) if (top.length < 6 && !top.includes(d) && d.kind !== 'metro') top.push(d);
    return top;
  };

  const render = () => {
    const q = input.value.trim();
    results = q ? searchItems(getItems(), q) : suggestions();
    const l = lang(), other = l === 'ar' ? 'en' : 'ar';
    let html = '';
    if (!q && results.length) html += `<li class="res-head" role="presentation">${esc(t('suggested'))}</li>`;
    if (q && !results.length) html += `<li class="res-empty" role="presentation">${esc(t('noResults'))}</li>`;
    results.forEach((it, i) => {
      const dots = it.kind === 'metro' ? it.lines.map((ln) => `<i class="line-dot" style="--c:${esc(ln.color)}"></i>`).join('') : '';
      html += `<li role="option" id="res-${i}" class="res" data-i="${i}" aria-selected="${i === active}">
        <span class="res-glyph res-${esc(it.kind)}" aria-hidden="true">${dots}</span>
        <span class="res-text"><span class="res-name">${esc(pick(it.name, l))}</span>
        <span class="res-alt" lang="${other}" dir="${other === 'ar' ? 'rtl' : 'ltr'}">${esc(pick(it.name, other))}</span></span>
        <span class="res-kind">${esc(kindLabel(it))}</span></li>`;
    });
    list.innerHTML = html;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(active >= results.length ? results.length - 1 : active);
  };
  const setActive = (i) => {
    active = i;
    for (const li of list.querySelectorAll('.res')) li.setAttribute('aria-selected', String(+li.dataset.i === i));
    if (i >= 0) { input.setAttribute('aria-activedescendant', 'res-' + i); list.querySelector('#res-' + i)?.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };
  const open = () => {
    box.classList.add('open');
    document.body.classList.add('searching');
    ui.closePopovers?.('search');
    active = -1;
    render();
    input.focus({ preventScroll: true });
    input.select();
  };
  const close = (blur = true) => {
    box.classList.remove('open');
    document.body.classList.remove('searching');
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    if (blur && document.activeElement === input) input.blur();
  };
  const choose = (it) => {
    if (!it) return;
    close();
    input.value = '';
    ui.goTo(it);
  };

  input.addEventListener('focus', () => { if (!box.classList.contains('open')) open(); });
  input.addEventListener('input', () => { active = -1; render(); if (results.length && input.value.trim()) setActive(0); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(results.length - 1, active + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(-1, active - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active >= 0 ? active : 0]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.value = ''; close(); }
  });
  list.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus in input
  list.addEventListener('click', (e) => { const li = e.target.closest('.res'); if (li) choose(results[+li.dataset.i]); });
  list.addEventListener('pointermove', (e) => { const li = e.target.closest('.res'); if (li && +li.dataset.i !== active) setActive(+li.dataset.i); });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) close(false); }, 120));
  toggle?.addEventListener('click', open);

  return { open, close, isOpen: () => box.classList.contains('open'), refresh: () => { if (box.classList.contains('open')) render(); } };
}
