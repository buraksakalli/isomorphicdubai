# Isometric Dubai

An interactive isometric illustration of Dubai, rendered entirely in code. It is inspired by
[isometricistanbul.com](https://isometricistanbul.com), isometric.nyc and tiny.london. Those projects
redraw licensed 3D city captures with AI image models. This project does it differently:

| | AI-tile maps (Istanbul / NYC) | Isometric Dubai |
|---|---|---|
| Source | Licensed 3D city model + AI redraw | Hand-modelled landmarks + procedural city, all code |
| Lighting | Baked into the images | Live sun path, moving shadows, a night city with lit windows |
| Life | Static | Traffic, metro trains, abras, yachts, **real-time planes** (live ADS-B), clouds, fountain shows |
| Size | Gigabytes of tiles, GPU pipeline | A few hundred KB of JS, no build step, no dependencies |
| Interaction | Zoom/pan, search | Zoom/pan, search, landmark cards, guided tour, time-lapse, EN/AR, postcard export, deep links |
| Privacy | Analytics | No analytics, no trackers; network calls only for Google Fonts and the site's own `/api/flights` relay |

> Geography, buildings and positions are **approximate artistic interpretations** (general knowledge,
> not surveyed data) and must not be used for navigation.

## Run

```bash
cd isometric-dubai
node tools/serve.mjs              # static files + live flight relay, http://127.0.0.1:8080 (Node 18+, no deps)
open http://localhost:8080
```

Any static server also works (`python3 -m http.server 8080`; ES modules need http://, not file://). Without the
relay, planes fall back to the built-in simulation.

### Live flights

Planes are real aircraft when `/api/flights` is available. `tools/flights-relay.mjs` fetches public ADS-B positions
around Dubai from [adsb.lol](https://adsb.lol) (fallback: [adsb.fi](https://adsb.fi)), validates and trims them to
callsign / type / position / altitude / speed / track, and caches one snapshot per 5 s for all viewers. A relay is
needed because these APIs send no CORS headers. The browser polls every 5 s (paused in background tabs and when the
Planes layer is off), dead-reckons each aircraft between updates and eases out the corrections. The Layers panel
shows *Live · N aircraft* plus the data credit, or *Simulated* when the feed is unavailable or stale (> 45 s).

Notes: altitudes above 2 km are compressed for display (cruise traffic would otherwise be drawn far from its ground
track in this projection). Coverage depends on volunteer receivers. adsb.lol data is ODbL (attribution shown in the
UI); adsb.fi open data is for personal, non-commercial use. Review provider terms before any public deployment. A
static host (e.g. GitHub Pages) has no relay, so deploy `flights-relay.mjs`'s logic as a serverless function on the
same origin if you want live planes there.

## Verify / screenshot (headless Chrome)

```bash
node tools/shot.mjs --out shots/check.png --wait 3000 \
  --eval "(()=>{const a=__dubai;const [x,y]=a.geo.toWorld(25.197,55.274);a.setCamera(x,y,1.2);a.setHours(21,'manual')})()"
```

It prints console errors and render stats, and saves a PNG.

## Structure

```
js/core/       engine: projection, camera, lighting, shapes, renderer (chunked ground cache, shadows), input, app shell
js/data/       approximate geographic data (coast, creek, islands, roads, metro, districts, runways)
js/world/      terrain grid + ground painting, procedural city, hand-built landmarks
js/life/       traffic, metro, boats, planes (live feed: live.js), clouds, fireworks
tools/         serve.mjs (dev server + /api/flights), flights-relay.mjs, shot.mjs (headless check)
js/ui/         search, info cards, time dial, labels, minimap, tour, export, i18n, deep links
CONTRACT.md    the engineering contract shared by all modules
```

## Controls

Drag to pan · scroll / pinch to zoom · double-click to zoom in (Shift: out) · arrows/WASD to pan · +/− to zoom ·
click a landmark for details · `/` or ⌘K to search.
