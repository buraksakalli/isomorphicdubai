#!/usr/bin/env node
// Headless verification harness: serves the project, opens it in headless Chrome via CDP,
// waits, optionally runs JS, saves a screenshot and prints console errors + app stats.
//
//   node tools/shot.mjs --out shots/x.png [--hash "#..."] [--wait 6000] [--w 1600 --h 1000]
//                       [--eval "window.__dubai.setHours(20)"] [--eval2 "..."]   (eval runs after boot, eval2 after another 1.5 s)
//
// Exit code 0 even with console errors; read the printed report.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleFlights } from './flights-relay.mjs';

const DBG = (...a) => process.env.SHOT_DEBUG && console.error('[shot]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
let chromeProc = null, uddDir = null;
const cleanup = () => { try { chromeProc && chromeProc.kill('SIGKILL'); } catch {} try { uddDir && fs.rmSync(uddDir, { recursive: true, force: true }); } catch {} };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
process.on('exit', cleanup);
const KILL = setTimeout(() => { console.error('[shot] global timeout'); cleanup(); process.exit(2); }, +(args.timeout||75000));
const OUT = path.resolve(ROOT, args.out || 'shots/shot.png');
const WAIT = +(args.wait || 6000);
const VW = +(args.w || 1600), VH = +(args.h || 1000);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  if (!args.nolive && handleFlights(req, res)) return;
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html${args.query ? '?' + args.query : ''}${args.hash || ''}`;

const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'dubai-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${udd}`, '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${VW},${VH}`,
  ...(args.gpu ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu', '--disable-accelerated-2d-canvas']), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
chromeProc = chrome; uddDir = udd;
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const to = setTimeout(() => reject(new Error('chrome did not start')), 20000);
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(to); resolve(m[1]); } });
});
DBG('ws', wsUrl);
const httpBase = wsUrl.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*/, '');
const targets = await (await fetch(httpBase + '/json/list')).json();
const page = targets.find((t) => t.type === 'page');
DBG('page', page && page.webSocketDebuggerUrl);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type))
    logs.push(`[console.${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails; logs.push('[exception] ' + (d.exception?.description || d.text)); }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') logs.push('[log] ' + msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => { const r = await Promise.race([sleep(+(args.evaltimeout||8000)).then(() => ({ result: { result: { value: '__EVAL_TIMEOUT__' } } })), send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })]); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };

try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: VW < 700 });
  DBG('navigate', url);
  await send('Page.navigate', { url });
  DBG('navigated');
  // wait for boot
  const tBoot = Date.now();
  while (Date.now() - tBoot < 30000) { if (await evaluate('!!(window.__dubai && document.body.classList.contains("ready"))')) break; await sleep(200); }
  DBG('booted', Date.now() - tBoot, logs, await evaluate('JSON.stringify({s: document.getElementById("loader-status")?.textContent, app: !!window.__dubai, rs: document.readyState, cls: document.body.className})'));
  if (args.eval) { const v = await evaluate(args.eval); if (v !== undefined) console.log('eval →', JSON.stringify(v)); }
  await sleep(WAIT);
  if (args.profile) {
    await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start');
    const v = await evaluate(args.profile); console.log('profile-eval →', JSON.stringify(v));
    const pr = (await send('Profiler.stop')).result.profile;
    const self = new Map(); const byId = new Map(pr.nodes.map((n) => [n.id, n]));
    const dt = new Map(); pr.samples.forEach((sid, i) => dt.set(sid, (dt.get(sid) || 0) + (pr.timeDeltas[i] || 0)));
    for (const [sid, us] of dt) { const n = byId.get(sid); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + us); }
    console.log('TOP SELF TIME (ms):'); [...self].sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, us]) => console.log('  ' + (us / 1000).toFixed(0).padStart(6) + '  ' + k));
  }
  if (args.eval2) { const v = await evaluate(args.eval2); if (v !== undefined) console.log('eval2 →', JSON.stringify(v)); await sleep(1500); }
  const stats = await evaluate(`(() => { const a = window.__dubai; if (!a) return 'NO APP'; return { bootMs: a.bootMs, fps: a.stats.fps,
    frameMs: +a.renderer.stats.ms.toFixed(1), objects: a.renderer.stats.objects, statics: a.scene.statics.length, chunksBuilt: a.renderer.stats.built,
    landmarks: a.landmarks.length, districts: a.districts.length, hours: +a.clock.hours.toFixed(2), zoom: +a.camera.zoom.toFixed(3),
    renderErrors: [...a.renderer.errors] }; })()`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('url   ', url);
  console.log('shot  ', OUT);
  console.log('stats ', JSON.stringify(stats));
  console.log(logs.length ? 'ERRORS/WARNINGS:\n  ' + logs.slice(0, 30).join('\n  ') : 'console: clean');
} finally {
  ws.close(); chrome.kill('SIGKILL'); server.close();
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
}
process.exit(0);
