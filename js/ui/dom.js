// Small DOM helpers shared by the UI modules.
export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const rm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = () => !!(rm && rm.matches);
const mobileMq = typeof matchMedia === 'function' ? matchMedia('(max-width: 720px)') : null;
export const isMobile = () => !!(mobileMq && mobileMq.matches);

let toastTimer = 0;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const PREFS_KEY = 'isometric-dubai:prefs';
export function loadPrefs() {
  try { const v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable: prefs are per-session */ }
}

export const svg = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;
