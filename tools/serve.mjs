#!/usr/bin/env node
// Static dev server + live flight relay (zero dependencies).
//   node tools/serve.mjs [--port 8080] [--host 127.0.0.1]
// Serves the repo and GET /api/flights (see flights-relay.mjs). Without this server (e.g. `python3 -m http.server`)
// the map still works; planes fall back to the built-in simulation.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleFlights } from './flights-relay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', process.env.PORT || 8080);
const HOST = opt('host', '127.0.0.1');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  if (handleFlights(req, res)) return;
  let u;
  try { u = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  // no dotfiles / dot-directories (.git, .env …), no traversal outside the repo
  if (u.split('/').some((seg) => seg.startsWith('.'))) { res.writeHead(404); return res.end('not found'); }
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT + path.sep)) { res.writeHead(404); return res.end('not found'); }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    fs.createReadStream(f).pipe(res);
  });
});
server.listen(PORT, HOST, () => console.log(`Isometric Dubai → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (live flights at /api/flights)`));
