# Predict the Flood, Protect the City

**SIH 2026 · SIH26085 — Urban Flood Nowcasting System (Drainage and Rainfall Coupling)**
Theme: Disaster Management · Team: **Code Sutra**

A municipal-grade flood-nowcasting command centre prototype. It predicts **where** rainfall turns into street-level flooding, **when**, **how deep**, and **what the city should do next** (alerts, safe emergency routes, evacuation, drain crews). The prototype runs on 0–3 h horizons across three pilot areas: Delhi, Mumbai and Chennai.

> **This is a prototype.** Rainfall, drain state, flood depths, alerts and historical events are **SIMULATED**. Road network, facilities and terrain are **real** public data (OpenStreetMap snapshot, SRTM 30 m). No PI-GNN has been trained yet; a simplified coupled rainfall–drainage engine stands in for it. Every screen labels this.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

For the venue, build once and serve the optimised build:

```bash
npm run build
npm start            # http://localhost:3000
```

Requirements: Node 20+. Internet is **not** required at runtime. Basemap tiles are the only live dependency, and the map falls back to an offline schematic automatically. You can also force offline mode under **Data Sources & Settings → Basemap**.

---

## 90-second judge demo (script)

| # | Do this | The judge sees |
|---|---------|----------------|
| 1 | Open `/` → **Open Command Center** | Delhi ITO–Rajghat pilot, rainfall **68 mm/hr**, map mostly safe |
| 2 | Top-right **▶ Start live demo** (≈75 s, space = pause, ←/→ = step, Esc = exit) | Narrated sequence: rain rises → runoff enters drain graph → **DN-184** fills past 90 % → surcharge → PI-GNN nowcast updates → flood propagates → **R-229** predicted unsafe → **critical alert: Ring Road / Sector 4** → ambulance route recalculated (**Safe Route Mode**) → 6 recommended actions |
| 3 | End card → **Show +120 min**, then **+180 min** | Peak extent, then recovery |
| 4 | Optional: **Presentation mode** (top bar) | Projector view: Current → Next 60 min → Flood risk → Critical roads → Alerts → Safe route → Actions |

Other strong moments: **Scenario Simulator** (Cloudburst preset → Run), **Drainage Network** (click any node → directed graph + loading curve; toggle *Show water level (3D)*), **Health** (simulate radar outage → graceful degradation).

---

## Screens

| Route | Screen |
|-------|--------|
| `/` | Landing page |
| `/command-center` | Command Center: KPIs (where / when / how severe), GIS map, nowcast strip, alerts, actions, engine status, data fusion |
| `/nowcast` | Flood Nowcast Map: time slider (NOW … +180), evolution narrative, roads at risk, sector impact |
| `/rainfall` | Rainfall & Weather: radar field, AWS gauges, 60 min observed + 180 min nowcast with uncertainty |
| `/drainage` | Drainage Network: directed graph, flow animation, surcharge, blocked nodes, 3D water level |
| `/scenario` | Scenario Simulator: intensity, duration, capacity, blockage, initial level, backwater, imperviousness |
| `/alerts` | Alerts & Incidents: view on map, dispatch team, create incident, acknowledge |
| `/actions` | Response / Action Centre: dispatch, notify, reroute, acknowledge |
| `/routing` | Shortest **safe** route (ambulance / fire tender / police), A/B/C options, dispatch animation |
| `/evacuation` | Evacuation: population at risk, nearest safe shelter, corridor, roads to avoid |
| `/analytics` | Historical events (synthetic catalogue), six charts, event / date / ward filters |
| `/model` | Model Performance: literature reference vs targets vs illustrative, clearly separated |
| `/health` | Model / Data Health: feed freshness, failure injection, measured API latency |
| `/architecture` | 5-layer architecture with animated data flow and the mock API list |
| `/data-sources` | LIVE / STATIC / SIMULATED source table, basemap and demo settings |
| `/present` | Presentation mode |

---

## What is real, what is simulated

| Layer | Prototype | Mode |
|-------|-----------|------|
| Roads, names, hospitals, fire & police stations | OpenStreetMap snapshot (Overpass) | STATIC (real) |
| Terrain | SRTM 30 m sampled via OpenTopoData, smoothed | STATIC (real) |
| Drainage network | Rebuilt from OSM roads + DEM (flows downhill to real outfalls); pipe capacity, blockage and storage are synthetic | SIMULATED |
| Rainfall | Moving convective cell + city hyetograph (09:00 32 → 11:00 82 mm/hr) | SIMULATED |
| Hydraulics | Coupled engine: rational-method runoff → overland reservoir → topological graph routing (capacity, head, backwater) → surcharge → surface ponding spilling downhill → street depth | SIMULATED |
| Alerts, actions, routes, evacuation | Computed from the engine output | derived |
| Historical events, model metrics | Synthetic catalogue; precision 0.81 / recall 0.89 are **literature reference** values cited in the proposal, not our results | SIMULATED |

The engine is deterministic. It is calibrated per city by `scripts/build-dataset.ts` so the demo storm produces a plausible story: the hotspot road goes unsafe at about T+36 min and peaks at about 1.1 m, and the flood extent peaks around T+90–120 and recedes by T+180.

---

## Architecture

```
scripts/
  fetch-sources.ts     one-off fetch: OSM (Overpass) + SRTM (OpenTopoData) → data/raw/*.json
  build-dataset.ts     segmentation, sectors (Voronoi), drain-graph reconstruction, POIs, routing graph,
                       engine calibration → src/data/cities/*.json
src/lib/engine/        shared by API routes and UI
  rain.ts              rainfall field & hyetographs
  simulate.ts          coupled rainfall–drainage engine
  analysis.ts          onset, exceedance probability, sector impact, alerts, actions
  routing.ts           flood-aware Dijkstra (routes A/B/C)
src/app/api/*          mock REST API (FastAPI-ready contracts, see src/lib/api/types.ts)
src/lib/api/client.ts  the only place the UI talks to the backend
src/components/map/    MapLibre GL + deck.gl (flow particles, 3D water-level columns)
```

### Mock API

`GET /api/nowcast` · `GET /api/rainfall` · `GET /api/drainage` · `GET /api/flood-risk` · `GET /api/alerts` · `POST /api/routes` · `POST /api/scenarios` · `GET /api/analytics` · `GET /api/system-health` · `GET /api/network` · `GET /api/cities`

All take `?city=delhi|mumbai|chennai` plus optional scenario parameters. To use a real backend, set:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```

The FastAPI service only needs to return the same JSON shapes (`src/lib/api/types.ts`).

### Rebuilding the data

```bash
npm run data:fetch     # re-download OSM + SRTM (FORCE=1 to overwrite)
npm run data:build     # rebuild + recalibrate datasets
```

---

## Screenshots for the PPT ("Prototype Screenshots", slide 7)

1. Command Center at **+90 min**, with the Ring Road / Sector 4 road card open
2. Live demo at the **critical alert** step
3. Safe Route: Route A (safe) vs Route B (flood-blind)
4. Drainage Network with DN-184 selected (directed graph + loading curve)
5. Scenario Simulator after a **Cloudburst** run

---

Data: © OpenStreetMap contributors (ODbL) · SRTM GL1 via OpenTopoData · Basemap © OpenFreeMap / OpenMapTiles.
