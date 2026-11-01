// Sky: a few drifting cloud puffs (pre-rendered sprites, faded out when zoomed in) with soft shadows that pass over
// the city, and fireworks (particle pool, additive) — automatically around Burj Khalifa at 00:00–00:05.
import { clamp, smooth, rng, glowSprite } from './util.js';

const WIND = [0.045, 0.028]; // tiles/s (NW → SE drift)
const FW_COLS = ['#ffd36a', '#fff3d6', '#ff4d4d', '#58ff8c', '#6ab8ff', '#ff6ad5', '#ffa040'];

export function createSky(app) {
  const g = app.geo, W = g.W, H = g.H;
  const R = rng(99);

  // ---------- clouds ----------
  const sprites = { day: [], dusk: [], night: [], shadow: [] };
  const NV = 4;
  for (let v = 0; v < NV; v++) {
    const puffs = [];
    const n = 9 + Math.floor(R() * 7);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R());
      puffs.push([128 + Math.cos(a) * d * 88, 104 + Math.sin(a) * d * 28 - R() * 26, 22 + R() * 30]);
    }
    puffs.sort((p, q) => p[1] - q[1]);
    sprites.day.push(cloudSprite(puffs, [255, 255, 255], [214, 222, 232]));
    sprites.dusk.push(cloudSprite(puffs, [255, 214, 178], [196, 150, 150]));
    sprites.night.push(cloudSprite(puffs, [92, 104, 132], [52, 60, 84]));
    sprites.shadow.push(shadowSprite(puffs));
  }
  const clouds = [];
  for (let i = 0; i < 13; i++) {
    clouds.push({ x0: R() * (W + 160) - 80, y0: R() * (H + 160) - 80, z: 750 + R() * 500, w: 13 + R() * 17, v: Math.floor(R() * NV),
      sp: 0.75 + R() * 0.5, x: 0, y: 0 });
  }
  let cloudsOn = true;

  function updateClouds() {
    const t = app.clock.t + 1000;
    const SW = W + 160, SH = H + 160;
    for (const c of clouds) {
      c.x = ((((c.x0 + 80 + WIND[0] * c.sp * t) % SW) + SW) % SW) - 80;
      c.y = ((((c.y0 + 80 + WIND[1] * c.sp * t) % SH) + SH) % SH) - 80;
    }
  }

  function drawCloudShadows(r) {
    if (!cloudsOn) return;
    const L = r.L, s = L.sun;
    if (L.sunI < 0.05 || s[2] < 0.12) return;
    const c = r.ctx, z = r.zoom;
    const k = Math.min(1 / s[2], 4);
    c.globalAlpha = 0.16 * L.sunI;
    for (const cl of clouds) {
      const x = cl.x - (s[0] * k * cl.z) / 100, y = cl.y - (s[1] * k * cl.z) / 100;
      const wpx = cl.w * 46 * z, hpx = wpx * 0.5;
      const X = r.ox + (x - y) * r.kx, Y = r.oy + (x + y) * r.ky;
      if (X + wpx / 2 < 0 || X - wpx / 2 > r.vw || Y + hpx / 2 < 0 || Y - hpx / 2 > r.vh) continue;
      c.drawImage(sprites.shadow[cl.v], X - wpx / 2, Y - hpx / 2, wpx, hpx);
    }
    c.globalAlpha = 1;
  }

  function drawClouds(r) {
    if (!cloudsOn) return;
    const c = r.ctx, z = r.zoom, L = r.L;
    const fade = 1 - smooth(0.5, 1.15, z);
    if (fade < 0.02) return;
    const night = L.night, dusk = (1 - night) * clamp(1 - Math.abs((L.elev ?? 30) - 3) / 9, 0, 1);
    const day = Math.max(0, 1 - night - dusk);
    for (const cl of clouds) {
      const wpx = cl.w * 46 * z, hpx = wpx * 0.625;
      const X = r.ox + (cl.x - cl.y) * r.kx, Y = r.oy + (cl.x + cl.y) * r.ky - cl.z * r.kz;
      if (X + wpx / 2 < 0 || X - wpx / 2 > r.vw || Y + hpx * 0.4 < 0 || Y - hpx * 0.8 > r.vh) continue;
      const base = 0.82 * fade;
      if (day > 0.02) { c.globalAlpha = base * day; c.drawImage(sprites.day[cl.v], X - wpx / 2, Y - hpx * 0.8, wpx, hpx); }
      if (dusk > 0.02) { c.globalAlpha = base * dusk; c.drawImage(sprites.dusk[cl.v], X - wpx / 2, Y - hpx * 0.8, wpx, hpx); }
      if (night > 0.02) { c.globalAlpha = base * night * 0.55; c.drawImage(sprites.night[cl.v], X - wpx / 2, Y - hpx * 0.8, wpx, hpx); }
    }
    c.globalAlpha = 1;
  }

  // ---------- fireworks ----------
  const NP = 5000;
  const px = new Float32Array(NP), py = new Float32Array(NP), pz = new Float32Array(NP);
  const vx = new Float32Array(NP), vy = new Float32Array(NP), vz = new Float32Array(NP);
  const life = new Float32Array(NP), max = new Float32Array(NP), pc = new Uint8Array(NP);
  let pHead = 0, alive = 0;
  const shells = []; // rising rockets
  for (let i = 0; i < 48; i++) shells.push({ on: false, x: 0, y: 0, z0: 0, z1: 0, t: 0, dur: 1, col: 0, x0: 0, y0: 0 });
  const flashes = []; for (let i = 0; i < 24; i++) flashes.push({ on: false, x: 0, y: 0, z: 0, t: 0, col: 0 });
  const shows = []; // { x, y, until, acc }
  const [bkx, bky] = g.toWorld(25.1972, 55.2744);
  let fwOn = true;
  const fr = rng(2024);

  function launch(x, y) {
    const s = shells.find((q) => !q.on);
    if (!s) return;
    s.on = true; s.t = 0;
    s.x0 = x + (fr() - 0.5) * 0.6; s.y0 = y + (fr() - 0.5) * 0.6;
    s.x = s.x0 + (fr() - 0.5) * 3; s.y = s.y0 + (fr() - 0.5) * 3;
    s.z1 = 250 + fr() * 650; s.z0 = Math.max(0, s.z1 - 260 - fr() * 200);
    s.dur = 0.9 + fr() * 0.6; s.col = Math.floor(fr() * FW_COLS.length);
  }
  function burst(s) {
    const n = 110 + Math.floor(fr() * 110), sp = 95 + fr() * 70;
    const col2 = fr() < 0.35 ? Math.floor(fr() * FW_COLS.length) : s.col;
    for (let i = 0; i < n; i++) {
      const k = pHead; pHead = (pHead + 1) % NP;
      // uniform direction on a sphere
      const u = fr() * 2 - 1, a = fr() * Math.PI * 2, q = Math.sqrt(1 - u * u), v = sp * (0.85 + fr() * 0.3);
      px[k] = s.x; py[k] = s.y; pz[k] = s.z1;
      vx[k] = (q * Math.cos(a) * v) / 100; vy[k] = (q * Math.sin(a) * v) / 100; vz[k] = u * v;
      max[k] = life[k] = 1.9 + fr() * 1.4; pc[k] = i % 3 === 0 ? col2 : s.col;
    }
    const f = flashes.find((q) => !q.on);
    if (f) { f.on = true; f.x = s.x; f.y = s.y; f.z = s.z1; f.t = 0; f.col = s.col; }
  }
  /** Start a fireworks show at world (x, y) (default: Burj Khalifa) for `dur` seconds. */
  function fireworks(x = bkx, y = bky, dur = 30) {
    shows.push({ x, y, until: app.clock.t + dur, acc: 1 });
    return shows.length;
  }

  let autoShow = null;
  function updateFireworks(dt) {
    const h = app.clock.hours;
    // automatic midnight show 00:00–00:05
    if (fwOn && h < 5 / 60) {
      if (!autoShow || autoShow.until < app.clock.t + 1) { autoShow = { x: bkx, y: bky, until: app.clock.t + 2, acc: 1, rate: 5 }; shows.push(autoShow); }
      else autoShow.until = app.clock.t + 2;
    }
    for (let i = shows.length - 1; i >= 0; i--) {
      const sh = shows[i];
      if (app.clock.t > sh.until || !fwOn) { shows.splice(i, 1); if (sh === autoShow) autoShow = null; continue; }
      sh.acc += dt * (sh.rate || 3.2);
      while (sh.acc >= 1) { sh.acc -= 1; launch(sh.x, sh.y); }
    }
    for (const s of shells) {
      if (!s.on) continue;
      s.t += dt;
      if (s.t >= s.dur) { s.on = false; burst(s); }
    }
    for (const f of flashes) if (f.on) { f.t += dt; if (f.t > 0.45) f.on = false; }
    const drag = Math.exp(-1.15 * dt);
    let n = 0;
    for (let k = 0; k < NP; k++) {
      if (life[k] <= 0) continue;
      life[k] -= dt;
      vx[k] *= drag; vy[k] *= drag; vz[k] = vz[k] * drag - 9.8 * 0.55 * dt;
      px[k] += vx[k] * dt; py[k] += vy[k] * dt; pz[k] += vz[k] * dt;
      n++;
    }
    alive = n;
  }

  function drawFireworks(r) {
    if (!alive && !shells.some((s) => s.on)) return;
    const c = r.ctx, kx = r.kx, ky = r.ky, kz = r.kz, ox = r.ox, oy = r.oy;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    // flashes
    for (const f of flashes) {
      if (!f.on) continue;
      const X = ox + (f.x - f.y) * kx, Y = oy + (f.x + f.y) * ky - f.z * kz, rad = 260 * r.zoom + 24;
      c.globalAlpha = 0.5 * (1 - f.t / 0.45);
      c.drawImage(glowSprite(FW_COLS[f.col], 0.1), X - rad, Y - rad, rad * 2, rad * 2);
    }
    // rockets
    c.beginPath();
    for (const s of shells) {
      if (!s.on) continue;
      const f = s.t / s.dur, e = 1 - (1 - f) * (1 - f);
      const x = s.x0 + (s.x - s.x0) * e, y = s.y0 + (s.y - s.y0) * e, z = s.z0 + (s.z1 - s.z0) * e;
      const X = ox + (x - y) * kx, Y = oy + (x + y) * ky - z * kz;
      c.moveTo(X, Y); c.lineTo(X, Y + 30 * kz * (1 - f));
    }
    c.globalAlpha = 0.8; c.strokeStyle = '#ffe2b0'; c.lineWidth = Math.max(0.8, r.zoom); c.stroke();
    // particles: per colour, 2 brightness buckets
    const lw = Math.max(1.1, 2.2 * Math.sqrt(r.zoom));
    c.lineWidth = lw;
    for (let col = 0; col < FW_COLS.length; col++) {
      for (let b = 0; b < 2; b++) {
        c.beginPath();
        let any = false;
        for (let k = 0; k < NP; k++) {
          if (life[k] <= 0 || pc[k] !== col) continue;
          const fl = life[k] / max[k];
          if ((fl > 0.45) !== (b === 0)) continue;
          const X = ox + (px[k] - py[k]) * kx, Y = oy + (px[k] + py[k]) * ky - pz[k] * kz;
          if (X < -50 || X > r.vw + 50 || Y < -50 || Y > r.vh + 50) continue;
          const tx = (vx[k] - vy[k]) * kx * 0.16, ty = (vx[k] + vy[k]) * ky * 0.16 - vz[k] * kz * 0.16;
          c.moveTo(X, Y); c.lineTo(X - tx, Y - ty);
          any = true;
        }
        if (!any) continue;
        // twinkle: dimmer bucket flickers
        c.globalAlpha = b === 0 ? 0.95 : 0.4 + 0.25 * Math.sin(r.t * 37 + col);
        c.strokeStyle = FW_COLS[col]; c.stroke();
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  function update(dt) {
    if (cloudsOn) updateClouds();
    updateFireworks(dt);
  }

  updateClouds();
  app.scene.overlays.push(drawCloudShadows);
  return {
    update, fireworks, clouds,
    attachOverlays() { app.scene.overlays.push(drawClouds, drawFireworks); },
    stats: { get clouds() { return cloudsOn ? clouds.length : 0; }, get particles() { return alive; } },
    setClouds(v) { cloudsOn = !!v; }, get cloudsOn() { return cloudsOn; },
    setFireworks(v) { fwOn = !!v; }, get fireworksOn() { return fwOn; },
  };
}

function cloudSprite(puffs, top, bottom) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 160;
  const g = cv.getContext('2d');
  for (const [x, y, rr] of puffs) {
    const grd = g.createRadialGradient(x - rr * 0.25, y - rr * 0.35, rr * 0.1, x, y, rr);
    const f = clamp((y - 60) / 70, 0, 1);
    const cr = top.map((v, i) => Math.round(v + (bottom[i] - v) * f));
    grd.addColorStop(0, `rgba(${cr[0]},${cr[1]},${cr[2]},0.95)`);
    grd.addColorStop(0.6, `rgba(${cr[0]},${cr[1]},${cr[2]},0.55)`);
    grd.addColorStop(1, `rgba(${cr[0]},${cr[1]},${cr[2]},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  return cv;
}
function shadowSprite(puffs) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  for (const [x, y, rr] of puffs) {
    const yy = 64 + (y - 100) * 0.9;
    const grd = g.createRadialGradient(x, yy, 0, x, yy, rr * 1.15);
    grd.addColorStop(0, 'rgba(10,20,40,0.55)'); grd.addColorStop(1, 'rgba(10,20,40,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(x, yy, rr * 1.15, rr * 0.75, 0, 0, Math.PI * 2); g.fill();
  }
  return cv;
}
