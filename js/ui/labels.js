// Map overlays drawn on the canvas: selection ring (pulsing) and cartographic labels
// (districts at low/mid zoom, landmarks with leader lines at mid zoom, metro stations at high zoom).
// Labels use halo text so they read over both the sunny and the night map.
import { getDistricts, getStations, pick } from './data.js';
import { reducedMotion } from './dom.js';

const ramp = (v, a, b) => (v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a));
const SQ2 = Math.SQRT2;
const FAMOUS = new Set(['downtown', 'marina', 'deira', 'bur-dubai', 'business-bay', 'jbr', 'difc', 'al-fahidi', 'dxb', 'creek-harbour', 'expo', 'jumeirah-1', 'al-quoz', 'dubai-hills']);
const CAT_RANK = { icon: 0, culture: 1, leisure: 2, nature: 3, transport: 4 };

export function initLabels(app, ui) {
  const widths = new Map();
  let footprints = null; // landmark id -> { h, rad }
  let districtsSorted = null, districtsSrc = null;

  const measure = (ctx, font, text) => {
    const k = font + '|' + text;
    let w = widths.get(k);
    if (w === undefined) { ctx.font = font; w = ctx.measureText(text).width; widths.set(k, w); if (widths.size > 4000) widths.clear(); }
    return w;
  };
  // Fonts arrive asynchronously; drop cached widths once they do.
  try { document.fonts?.addEventListener?.('loadingdone', () => widths.clear()); } catch { /* ignore */ }

  // Footprint per landmark id from its full-detail scene objects (objects with maxZoom are low-zoom
  // stand-ins, e.g. exaggerated icons, and would overstate the height).
  const getFootprints = () => {
    if (footprints && footprints._n === app.scene.statics.length) return footprints;
    const all = new Map();
    for (const o of app.scene.statics) {
      const p = o.pick;
      if (!p || !p.id || !o.bbox) continue;
      let e = all.get(p.id);
      if (!e) all.set(p.id, (e = { full: [], any: [] }));
      (o.maxZoom ? e.any : e.full).push(o);
    }
    const m = new Map();
    for (const [id, e] of all) {
      const list = e.full.length ? e.full : e.any;
      const f = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, h: 0, minZ: e.full.length ? Infinity : 0 };
      for (const o of list) {
        const b = o.bbox;
        f.x0 = Math.min(f.x0, b.x0); f.y0 = Math.min(f.y0, b.y0); f.x1 = Math.max(f.x1, b.x1); f.y1 = Math.max(f.y1, b.y1);
        f.h = Math.max(f.h, b.h || 0);
        if (e.full.length) f.minZ = Math.min(f.minZ, o.minZoom || 0);
      }
      f.h = Math.min(f.h, 900);
      f.rad = Math.max(0.6, Math.min(6, Math.hypot(f.x1 - f.x0, f.y1 - f.y0) / 2));
      f.icon = e.full.length && e.any.length && f.minZ > 0; // drawn exaggerated below minZ
      m.set(id, f);
    }
    m._n = app.scene.statics.length;
    return (footprints = m);
  };
  /** Apparent height (m) at this zoom, accounting for exaggerated low-zoom icons. */
  const heightAt = (f, z) => (f.icon && z < f.minZ ? f.h * Math.max(1, Math.min(2.6, Math.pow(f.minZ / z, 0.75))) : f.h);
  ui.footprintOf = (item) => {
    if (!item) return null;
    if (item.kind === 'district') return { h: 0, rad: Math.max(2, item.r || 6) * 0.8 };
    if (item.kind === 'metro') return { h: 0, rad: 0.9 };
    if (item.kind === 'island') return { h: 0, rad: 3 };
    return getFootprints().get(item.id) || { h: 60, rad: 1.2 };
  };

  const sortedDistricts = () => {
    const src = getDistricts(app);
    if (districtsSrc === src && districtsSorted) return districtsSorted;
    districtsSrc = src;
    districtsSorted = [...src].sort((a, b) => (FAMOUS.has(b.id) - FAMOUS.has(a.id)) || (b.r || 0) - (a.r || 0));
    return districtsSorted;
  };

  // ---- selection ring -------------------------------------------------------------------------
  app.scene.overlays.push((r) => {
    const it = app.selected;
    if (!it || ui.exporting || !Number.isFinite(it.x)) return;
    const fp = ui.footprintOf(it);
    const ctx = r.ctx;
    const cx = r.X(it.x, it.y), cy = r.Y(it.x, it.y);
    const rad = (fp.rad + 0.5);
    const rx = rad * SQ2 * r.kx, ry = rad * SQ2 * r.ky;
    if (rx < 3) return;
    const gold = r.night > 0.5 ? '255,205,120' : '240,170,70';
    const phase = reducedMotion() ? 0.45 : (performance.now() / 1800) % 1;
    ctx.save();
    if (r.night > 0.5) ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${gold},0.10)`; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = `rgba(${gold},0.9)`; ctx.stroke();
    const k = 1 + 0.55 * phase;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2);
    ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(${gold},${(0.7 * (1 - phase)).toFixed(3)})`; ctx.stroke();
    // marker above the top of the thing
    if (fp.h > 0 && r.zoom > 0.12) {
      const ty = r.Y(it.x, it.y, heightAt(fp, r.zoom)) - 14;
      const bob = reducedMotion() ? 0 : Math.sin(performance.now() / 420) * 2;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(cx, ty + 7 + bob); ctx.lineTo(cx - 6, ty - 3 + bob); ctx.lineTo(cx + 6, ty - 3 + bob); ctx.closePath();
      ctx.fillStyle = `rgb(${gold})`; ctx.strokeStyle = 'rgba(30,22,14,.55)'; ctx.lineWidth = 1;
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  });

  // ---- labels ---------------------------------------------------------------------------------
  app.scene.overlays.push((r) => {
    if (!ui.prefs.labels) return;
    const ctx = r.ctx, z = r.zoom, vw = r.vw, vh = r.vh;
    const ar = app.lang === 'ar';
    const L = ar ? 'ar' : 'en';
    const night = r.night > 0.5;
    const placed = [];
    const hits = (x0, y0, x1, y1) => {
      for (const p of placed) if (x0 < p[2] && x1 > p[0] && y0 < p[3] && y1 > p[1]) return true;
      return false;
    };
    const fontFor = (kind, size) => {
      if (ar) return `${kind === 'district' ? 500 : kind === 'landmark' ? 600 : 500} ${size + 1}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
      if (kind === 'district') return `500 ${size}px Fraunces, Georgia, serif`;
      if (kind === 'landmark') return `600 ${size}px Inter, system-ui, sans-serif`;
      return `500 ${size}px Inter, system-ui, sans-serif`;
    };
    const hasLS = 'letterSpacing' in ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.direction = ar ? 'rtl' : 'ltr';
    const halo = (text, x, y, font, fill, haloCol, lw, alpha, spacing = '0px') => {
      ctx.globalAlpha = alpha;
      ctx.font = font;
      if (hasLS) ctx.letterSpacing = ar ? '0px' : spacing;
      ctx.lineWidth = lw; ctx.strokeStyle = haloCol; ctx.strokeText(text, x, y);
      ctx.fillStyle = fill; ctx.fillText(text, x, y);
    };

    const selId = app.selected && app.selected.id;

    // landmarks (highest priority, placed first so districts flow around them)
    const aL = ramp(z, 0.15, 0.22);
    const landmarks = app.landmarks || [];
    if (aL > 0 || selId) {
      const fps = getFootprints();
      const list = landmarks.slice().sort((a, b) => (b.id === selId) - (a.id === selId) || (CAT_RANK[a.category] ?? 5) - (CAT_RANK[b.category] ?? 5));
      const size = z > 1.2 ? 13 : 12;
      for (const l of list) {
        const isSel = l.id === selId;
        const alpha = isSel ? 1 : aL;
        if (alpha <= 0.02) continue;
        const sx = r.X(l.x, l.y);
        if (sx < -120 || sx > vw + 120) continue;
        const fp = fps.get(l.id);
        const h = fp ? heightAt(fp, z) : 40;
        const topY = r.Y(l.x, l.y, h);
        const gy = r.Y(l.x, l.y);
        if (gy < -40 || topY > vh + 40) continue;
        const text = pick(l.name, L);
        if (!text) continue;
        const font = fontFor('landmark', size);
        const w = measure(ctx, font, text);
        const lead = Math.max(10, Math.min(26, 18 * Math.sqrt(z)));
        let ly = Math.max(14, topY - lead - 8 - (isSel ? 14 : 0));
        const x0 = sx - w / 2 - 6, x1 = sx + w / 2 + 6, y0 = ly - 11, y1 = ly + 11;
        if (!isSel && hits(x0, y0, x1, y1)) continue;
        placed.push([x0, y0, x1, y1]);
        // leader line from the top of the building to the label
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = night ? 'rgba(255,236,200,.75)' : 'rgba(40,30,20,.65)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, Math.min(topY - 2, gy)); ctx.lineTo(sx, ly + 8); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, Math.min(topY - 2, gy), 1.8, 0, Math.PI * 2);
        ctx.fillStyle = night ? '#ffd88f' : '#2a1f14'; ctx.fill();
        halo(text, sx, ly, font, night ? '#fff3da' : '#22180f', night ? 'rgba(14,18,34,.82)' : 'rgba(255,250,240,.88)', 3.6, alpha);
      }
    }

    // districts
    const aD = ramp(z, 0.04, 0.06) * (1 - ramp(z, 0.55, 0.9));
    if (aD > 0.02) {
      for (const d of sortedDistricts()) {
        const sx = r.X(d.x, d.y), sy = r.Y(d.x, d.y);
        if (sx < -200 || sx > vw + 200 || sy < -40 || sy > vh + 40) continue;
        const screenR = (d.r || 6) * SQ2 * r.kx;
        if (screenR < 30 && !FAMOUS.has(d.id)) continue;
        if (screenR < 12) continue;
        const text = pick(d.name, L);
        const size = Math.round(Math.max(11, Math.min(17, 10 + screenR / 22)) + (FAMOUS.has(d.id) ? 1 : 0));
        const font = fontFor('district', size);
        const w = measure(ctx, font, text) + (ar ? 0 : text.length * size * 0.06);
        const x0 = sx - w / 2 - 4, x1 = sx + w / 2 + 4, y0 = sy - size * 0.7, y1 = sy + size * 0.7;
        if (hits(x0, y0, x1, y1)) continue;
        placed.push([x0, y0, x1, y1]);
        halo(text, sx, sy, font, night ? 'rgba(246,236,214,.96)' : 'rgba(62,44,24,.92)', night ? 'rgba(12,16,32,.62)' : 'rgba(252,246,232,.62)', 3, aD, (size * 0.05).toFixed(1) + 'px');
      }
    }

    // metro stations
    const aM = ramp(z, 0.75, 1.0);
    if (aM > 0.02 && ui.prefs.metroLabels !== false) {
      const font = fontFor('metro', z > 2 ? 12 : 11);
      for (const s of getStations(app)) {
        const sx = r.X(s.x, s.y), sy = r.Y(s.x, s.y, 12);
        if (sx < -100 || sx > vw + 100 || sy < -20 || sy > vh + 20) continue;
        const text = pick(s.name, L);
        const w = measure(ctx, font, text);
        const tx = ar ? sx - 8 - w / 2 : sx + 8 + w / 2;
        const x0 = Math.min(sx - 6, tx - w / 2 - 3), x1 = Math.max(sx + 6, tx + w / 2 + 3), y0 = sy - 8, y1 = sy + 8;
        if (hits(x0, y0, x1, y1)) continue;
        placed.push([x0, y0, x1, y1]);
        ctx.globalAlpha = aM;
        s.lines.forEach((ln, i) => {
          ctx.beginPath(); ctx.arc(sx, sy, 4.2 - i * 1.6, 0, Math.PI * 2);
          ctx.fillStyle = ln.color; ctx.fill();
          ctx.lineWidth = 1.4; ctx.strokeStyle = night ? 'rgba(10,14,28,.9)' : '#fffaf0'; ctx.stroke();
        });
        halo(text, tx, sy, font, night ? '#f4ead6' : '#2a2018', night ? 'rgba(12,16,32,.8)' : 'rgba(255,250,240,.88)', 3.2, aM);
      }
    }
    if (hasLS) ctx.letterSpacing = '0px';
    ctx.restore();
  });
}
