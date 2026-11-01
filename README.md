# Isometric Dubai

An interactive isometric illustration of Dubai, rendered entirely in code. It is inspired by
[isometricistanbul.com](https://isometricistanbul.com), isometric.nyc and tiny.london. Those projects
redraw licensed 3D city captures with AI image models. This project does it differently:

| | AI-tile maps (Istanbul / NYC) | Isometric Dubai |
|---|---|---|
| Source | Licensed 3D city model + AI redraw | Hand-modelled landmarks + procedural city, all code |
| Lighting | Baked into the images | Live sun path, moving shadows, a night city with lit windows |
| Life | Static | Traffic, metro trains, abras, yachts, planes, clouds, fountain shows |
| Size | Gigabytes of tiles, GPU pipeline | A few hundred KB of JS, no build step, no dependencies |
| Interaction | Zoom/pan, search | Zoom/pan, search, landmark cards, guided tour, time-lapse, EN/AR, postcard export, deep links |
| Privacy | Analytics | No analytics, no trackers, no network calls (except Google Fonts) |

> Geography, buildings and positions are **approximate artistic interpretations** (general knowledge,
> not surveyed data) and must not be used for navigation.

## Run

```bash
cd isometric-dubai
python3 -m http.server 8080      # any static server works (ES modules need http://, not file://)
open http://localhost:8080
```

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
js/life/       traffic, metro, boats, planes, clouds, fireworks
js/ui/         search, info cards, time dial, labels, minimap, tour, export, i18n, deep links
CONTRACT.md    the engineering contract shared by all modules
```

## Controls

Drag to pan · scroll / pinch to zoom · double-click to zoom in (Shift: out) · arrows/WASD to pan · +/− to zoom ·
click a landmark for details · `/` or ⌘K to search.
