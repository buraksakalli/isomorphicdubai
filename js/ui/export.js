// "Save image": renders the current view with app.renderToCanvas and frames it as a postcard or poster PNG.
import { t, lang } from './i18n.js';
import { fmtHours, placeName } from './data.js';
import { toast } from './dom.js';

const SIZES = {
  // css-px render size (x2 scale) of the map window; frame is added around it
  postcard: { w: 1200, h: 800, scale: 2, pad: 64, band: 176 },
  poster: { w: 1420, h: 1820, scale: 2, pad: 80, band: 300 },
};

export async function exportImage(app, ui, kind = 'postcard') {
  const S = SIZES[kind] || SIZES.postcard;
  toast(t('saving'), 60000);
  ui.exporting = true;
  try {
    try { await Promise.all(['700 64px Fraunces', '500 32px Fraunces', '500 24px Inter', '500 30px "IBM Plex Sans Arabic"'].map((f) => document.fonts.load(f))); } catch { /* fonts optional */ }
    await new Promise((r) => setTimeout(r, 30)); // let the toast paint first
    const cam = app.camera.clone();
    // keep the same ground scale as on screen; the export simply shows a bit more or less area
    const map = app.renderToCanvas(S.w, S.h, S.scale, cam);
    const k = S.scale;
    const mw = map.width, mh = map.height, pad = S.pad * k / 2, band = S.band * k / 2;
    const out = document.createElement('canvas');
    out.width = mw + pad * 2;
    out.height = mh + pad * 2 + band;
    const g = out.getContext('2d');
    // paper
    const paper = g.createLinearGradient(0, 0, 0, out.height);
    paper.addColorStop(0, '#f3e7cf'); paper.addColorStop(1, '#e9d7b4');
    g.fillStyle = paper; g.fillRect(0, 0, out.width, out.height);
    // map with a thin keyline and soft shadow
    g.save();
    g.shadowColor = 'rgba(60,40,15,.35)'; g.shadowBlur = 18 * k; g.shadowOffsetY = 6 * k;
    g.fillStyle = '#000'; g.fillRect(pad, pad, mw, mh);
    g.restore();
    g.drawImage(map, pad, pad);
    g.strokeStyle = 'rgba(60,40,15,.55)'; g.lineWidth = 1.5 * k; g.strokeRect(pad + 0.5, pad + 0.5, mw - 1, mh - 1);
    // inner hairline frame on the paper
    g.strokeStyle = 'rgba(120,90,50,.35)'; g.lineWidth = 1 * k;
    g.strokeRect(pad * 0.45, pad * 0.45, out.width - pad * 0.9, out.height - pad * 0.9);

    const l = lang(), ar = l === 'ar';
    const place = placeName(app, cam.x, cam.y, l);
    const time = fmtHours(app.clock.hours);
    const y0 = pad + mh + band * 0.18;
    const L = pad, R = out.width - pad;
    const unit = k * (kind === 'poster' ? 1.25 : 1);
    g.textBaseline = 'top';
    // title: always the bilingual lockup
    g.fillStyle = '#2a1d10';
    g.font = `700 ${Math.round(46 * unit)}px Fraunces, Georgia, serif`;
    g.textAlign = 'left';
    g.direction = 'ltr';
    g.fillText('Isometric Dubai', L, y0);
    const tw = g.measureText('Isometric Dubai').width;
    g.font = `500 ${Math.round(26 * unit)}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
    g.fillStyle = '#7a5a32';
    g.fillText('دبي الأيزومترية', L + tw + 18 * unit, y0 + 14 * unit);
    // place + time on the right
    g.textAlign = 'right';
    g.direction = ar ? 'rtl' : 'ltr';
    g.fillStyle = '#2a1d10';
    g.font = ar ? `600 ${Math.round(30 * unit)}px "IBM Plex Sans Arabic", Tahoma, sans-serif` : `500 ${Math.round(32 * unit)}px Fraunces, Georgia, serif`;
    g.fillText(place, R, y0 + 6 * unit);
    g.font = ar ? `400 ${Math.round(20 * unit)}px "IBM Plex Sans Arabic", Tahoma, sans-serif` : `500 ${Math.round(19 * unit)}px Inter, system-ui, sans-serif`;
    g.fillStyle = '#7a5a32';
    const tl = `${time} ${t('dubaiTimeShort')}`;
    g.fillText(tl, R, y0 + 48 * unit);
    // credit
    g.direction = ar ? 'rtl' : 'ltr';
    g.textAlign = 'left';
    g.font = ar ? `400 ${Math.round(15 * unit)}px "IBM Plex Sans Arabic", Tahoma, sans-serif` : `400 ${Math.round(14 * unit)}px Inter, system-ui, sans-serif`;
    g.fillStyle = 'rgba(70,50,25,.75)';
    g.fillText(t('postcardFooter'), L, y0 + 74 * unit + (kind === 'poster' ? 24 * unit : 0));

    const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
    if (!blob) throw new Error('toBlob failed');
    const a = document.createElement('a');
    const slugPlace = String(placeName(app, cam.x, cam.y, 'en')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dubai';
    a.download = `isometric-dubai-${slugPlace}-${time.replace(':', '')}-${kind}.png`;
    const href = URL.createObjectURL(blob);
    a.href = href;
    document.body.appendChild(a);
    a.click(); // may be blocked in sandboxed viewers; the preview below always works
    a.remove();
    showPreview(href, ar);
    return out;
  } catch (e) {
    console.warn('[ui] export failed', e);
    toast(t('saveFailed'));
    return null;
  } finally {
    ui.exporting = false;
  }
}

// In-page preview of the exported image. Downloads can be blocked (e.g. sandboxed embeds), so the
// image is always shown here too: right-click / long-press saves it from any browser.
function showPreview(href, ar) {
  document.getElementById('export-preview')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'export-preview';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', ar ? 'معاينة الصورة' : 'Image preview');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;gap:12px;padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));background:rgba(8,14,24,.78);backdrop-filter:blur(6px);pointer-events:auto';
  const img = document.createElement('img');
  img.src = href; img.alt = ar ? 'بطاقة دبي الأيزومترية' : 'Isometric Dubai postcard';
  img.style.cssText = 'max-width:min(92vw,1100px);max-height:72vh;border-radius:6px;box-shadow:0 18px 50px rgba(0,0,0,.45)';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:center;color:#f4efe6;font:500 14px Inter,system-ui,sans-serif;text-align:center';
  const msg = document.createElement('span');
  msg.textContent = ar ? 'انقر بزر الفأرة الأيمن أو اضغط مطولاً لحفظ الصورة' : 'Right-click or long-press the image to save it';
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = ar ? 'إغلاق' : 'Close';
  close.style.cssText = 'font:600 14px Inter,system-ui,sans-serif;padding:8px 16px;border-radius:999px;border:1px solid rgba(244,239,230,.35);background:rgba(244,239,230,.12);color:#f4efe6;cursor:pointer';
  const done = () => { wrap.remove(); URL.revokeObjectURL(href); window.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
  close.addEventListener('click', done);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) done(); });
  window.addEventListener('keydown', onKey, true);
  bar.append(msg, close);
  wrap.append(img, bar);
  document.body.appendChild(wrap);
  close.focus();
}
