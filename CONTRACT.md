# Isometric Dubai — engineering contract (read fully before coding)

An interactive, **fully code-rendered** isometric illustration of Dubai (inspired by isometricistanbul.com, but
live: day/night lighting, sun shadows, traffic, metro, boats, planes, search, tours, EN/AR). Zero dependencies,
zero build step, plain ES modules + Canvas 2D. No analytics, no trackers, no external requests except Google Fonts.

## Run & verify
```
node tools/shot.mjs --out shots/<you>-<n>.png [--wait 3000] [--w 1600 --h 1000] [--hash "#..."] \
  [--eval "JS run after boot, e.g. (()=>{const a=__dubai;const [x,y]=a.geo.toWorld(25.197,55.274);a.setCamera(x,y,1.5);a.setHours(20,'manual')})()"]
```
It serves the repo, opens headless Chrome, prints **console errors + stats** (frame ms, object count…) and saves a PNG
you can view with the Read tool. **Always check your work visually at several zooms (0.06, 0.3, 1.0, 2.5) and at day
(hours 10–15) and night (20–23).** `window.__dubai` is the app. Frame time in headless (software rendering) is pessimistic;
still keep `frameMs` reasonable (< ~40 ms at zoom 0.3 in headless).

## Files & ownership (only edit what you own)
| Area | Owner | Files |
|---|---|---|
| Core engine (projection, light, shapes, renderer, input, app) | lead | `js/core/*` — **do not edit**; if you need a core change, work around it locally and describe the change in your final report |
| Geography data + terrain grid + ground painting | terrain agent | `js/data/geo.js`, `js/world/terrain.js`, (new files under `js/world/terrain/` ok) |
| Procedural buildings/streetscape | city agent | `js/world/city.js`, (new files under `js/world/city/` ok) |
| Landmarks | landmarks agent | `js/world/landmarks/*` |
| Moving life (cars, metro, boats, planes, clouds, fireworks) + metro viaducts | life agent | `js/life/*` |
| All DOM UI, CSS, labels overlay, routing, export, tour | UI agent | `js/ui/*`, `css/app.css`, the `#ui` element in `index.html` (keep `#map`, `#loader`, the module script) |

`js/main.js` boot order: `buildTerrain(app)` → `buildCity(app)` → `registerLandmarks(app)` → `createLife(app)` → `initUI(app)` → `app.start()`.
Stubs of every module exist and run; replace them, keeping the exported function names.

## Coordinates
- World: `x` = east, `y` = south, in **tiles; 1 tile = 100 m**. `z` and all heights in **metres**.
- `app.geo.toWorld(lat, lon) → [x, y]`, `toLatLon(x, y)`, `km(k)`, `m(metres) → tiles`, `llPts([[lat,lon],…])`. Grid `W×H ≈ 474×521`.
- Projection (zoom 1): `px = (x−y)·32`, `py = (x+y)·16 − z·0.392`. The camera looks from the **south-east**: the Gulf is at the
  top of the screen, the coast runs roughly left↔right, north points up-right. Visible faces of a box: **top, south (+y), east (+x)**.
- Depth/painter's order: objects sorted by `depth ?? x + y` (bigger = closer = drawn later). Split very large objects into pieces.

## Render context `r` (passed to every draw)
`r.ctx, r.zoom, r.kx, r.ky, r.kz, r.ox, r.oy, r.L (Light), r.t (seconds), r.hours (Dubai local), r.night (0 day…1 night),
r.X(x,y), r.Y(x,y,z), r.vw, r.vh`.

## Shapes (`js/core/shapes.js`) — use these; colours are daylight `'#rrggbb'`, lighting applied automatically
`box(r,x,y,z,w,d,h,color,{top,win:{floor,seed,lit,glass,light},emit,outline})`, `stack(r,cx,cy,z,[[hw,hd,h],…],color,o)`,
`prism(r,pts,z,h,color,o)`, `cylinder(r,cx,cy,rad,z,h,color,o)`, `loft(r,[{z,pts},…],color,o)`, `dome(...)`, `cone(...)`,
`flat(r,pts,z,color)`, `poly(r,[x,y,z,…],fill)`, `line3(...)`, `glow(r,x,y,z,radiusPx,hex,alpha)` (additive, for lights),
`palm(r,x,y,z,size,seed)`, `tree(...)`, `ring(cx,cy,rad,sides,rot)`, `sidesFor(r,rad)`, `hash(a,b,c)` (deterministic 0..1).
Light: `r.L.shade(hex,nx,ny,nz,emit)` → lit css colour; `r.L.emit(hex,alpha)` → night-fading rgba; `r.L.night`, `r.L.sun`.
**LOD**: check `r.zoom` — skip fine detail when it would be < ~1.5 px. Objects whose projected size is < 1.2 px are culled automatically.

## Scene objects (`app.scene.add(obj)`)
```
{ x, y, depth?, bbox:{x0,y0,x1,y1,h}, draw(r), shadow?:[{pts:[[x,y],…], h}], minZoom?, maxZoom?, pick?:landmarkEntry, id? }
```
- `bbox` must enclose everything you draw (h in metres) — it drives culling. `shadow` footprints cast sun shadows (use for things ≥ ~25 m).
- Dynamic things: `app.scene.dynamicSources.push(() => arrayOfObjects)`; objects need `x, y, radius?, h?, draw(r)`; reuse objects, don't allocate per frame.
- `app.scene.overlays.push(r => …)` draws after all objects (planes, fireworks, labels, selection). `app.scene.underlays` draws after ground, before objects (boat wakes, water sparkle).
- A draw that throws is logged once and skipped — still, keep the console clean.

## Terrain interface (returned by `buildTerrain(app)`)
```
{ W, H, T /*enum*/, types:Uint8Array(W*H), typeAt(x,y), zoneAt(x,y) → district|null, districts:[…], deepSea:'#hex',
  paintChunk(g, x0, y0, S, b), paintChunkNight?(g, x0, y0, S, b) → false if nothing drawn,
  roads:[{id,name,kind,width,pts:[[x,y],…]}], water helpers…, isLand(x,y), isWater(x,y) }
```
`paintChunk` receives a 2D context **already transformed** so you draw in zoom-1 projected coords (`px=(x−y)*32, py=(x+y)*16`)
for tiles `[x0,x0+S)×[y0,y0+S)`; `b` is the pixel scale of the cache (1/64…2) — use it for LOD and to keep lines ≥ 1 device px.
Chunks are cached; adjacent chunks must not show seams (overdraw shapes by ~0.6/b px). Night chunk = additive street-light glow.
`app.districts` entries: `{ id, name:{en,ar}, kind, x, y, r /*tiles*/ }`.

## Landmark entries (`app.landmarks.push(entry)`)
`{ id /*kebab*/, name:{en,ar}, x, y, lat, lon, zoom /*best view*/, category:'icon'|'culture'|'leisure'|'nature'|'transport',
   blurb:{en,ar} /*1–2 sentences*/, facts?:[{en,ar}] }`. Attach the entry as `pick` on its scene object(s) so clicks select it.

## Events (`app.on(name, fn)`)
`ready`, `tick(dt)`, `camera`, `time`, `click({sx,sy,wx,wy,obj})`, `hover({x,y})`, `select(item)`, `flyend`.
API: `app.flyTo(x,y,zoom,dur?)`, `app.setCamera(x,y,zoom)`, `app.zoomAt(f,sx,sy)`, `app.setHours(h,'manual'|'live'|'cycle')`,
`app.clock {t,hours,mode,speed}`, `app.pickAt(sx,sy)`, `app.select(item)`, `app.renderToCanvas(w,h,scale)`, `app.lang`.

## Quality bar
- Illustrated, warm, legible: sand `#e8d3a8`-ish desert, turquoise shallows → deep teal Gulf, pale stone/white/glass towers,
  gold accents; night = deep navy, warm windows, orange street lights, coloured landmark lighting.
- Accuracy: geography is approximate but must be **recognisable** (coast shape, Palm, World, Creek, SZR skyline spine).
  Facts/blurbs: only well-established facts; no invented numbers; omit anything uncertain.
- Performance: target ≤ ~25k static scene objects total. Merge tiny things (villas, trees) into cluster objects.
- No `eval`, no network calls, no storage of personal data. `localStorage` only for UI prefs (wrapped in try/catch).
