"use client";
/**
 * FloodMap — the GIS heart of the console.
 * MapLibre renders the basemap, street/drain/sector vector layers and the
 * model rasters (predicted depth, radar rainfall); deck.gl adds animated
 * drain-flow particles and 3D water-level columns. All dynamic styling is
 * driven through feature-state so scrubbing the nowcast timeline is cheap.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import maplibregl, { type CanvasSource, type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ColumnLayer } from "@deck.gl/layers";
import { PathStyleExtension } from "@deck.gl/extensions";
import type { CityDataset, Incident, LngLat, RouteOption, SimResult } from "@/lib/types";
import type { LayerKey, Selection } from "@/lib/store";
import { useApp } from "@/lib/store";
import { BASELINE_PARAMS, RISK_ORDER, riskOf } from "@/lib/engine/constants";
import { heatDepthAt, junctionRisks, sample, sectorImpacts } from "@/lib/engine/analysis";
import { RainField, rainColor } from "@/lib/engine/rain";
import { OFFLINE_STYLE, styleFor } from "./basemap";
import { IncidentMarker, PoiMarker, SectorLabel, VehicleMarker } from "./markers";
import { MapCtx } from "./mapContext";

export interface MapFocus {
  center: LngLat;
  zoom?: number;
  key: number;
  /** fit these bounds instead of flying to center */
  bounds?: [number, number, number, number];
}

export interface MapVehicle {
  id: string;
  kind: "ambulance" | "fire" | "police";
  coord: LngLat;
  label?: string;
  active?: boolean;
}

export interface FloodMapProps {
  ds: CityDataset;
  res?: SimResult | null;
  clock: number;
  layers: Record<LayerKey, boolean>;
  variant?: "default" | "drainage" | "rainfall" | "routing" | "evacuation" | "present";
  selection?: Selection | null;
  onSelect?: (s: Selection | null) => void;
  routes?: RouteOption[] | null;
  selectedRouteId?: string | null;
  highlightRoadIds?: string[];
  evacLines?: { coords: LngLat[]; color?: string }[];
  incidents?: Incident[];
  vehicles?: MapVehicle[];
  focus?: MapFocus | null;
  pickMode?: boolean;
  onPick?: (p: LngLat) => void;
  focusSectorId?: string | null;
  /** page-specific DOM markers (e.g. rain gauges) */
  extraMarkers?: { id: string; coord: LngLat; node: ReactNode }[];
  showShelterLabels?: boolean;
  children?: ReactNode;
  className?: string;
  showSectorLabels?: boolean;
}

const RISK_COLORS_MAP = ["#16a34a", "#eab308", "#f97316", "#dc2626", "#7f1d1d"];
const riskIdx = (d: number) => RISK_ORDER.indexOf(riskOf(d));

const UTIL_RAMP: [number, string][] = [
  [0, "#1e40af"],
  [0.5, "#2563eb"],
  [0.75, "#eab308"],
  [0.9, "#f97316"],
  [1, "#dc2626"],
];

function utilRGB(u: number, pond: number): [number, number, number] {
  if (pond >= 0.05) return [248, 113, 113];
  if (u >= 0.9) return [251, 146, 60];
  if (u >= 0.75) return [250, 204, 21];
  return [165, 243, 252];
}

/* depth → RGBA for the predicted-depth raster */
function depthRGBA(d: number): [number, number, number, number] {
  if (d < 0.04) return [0, 0, 0, 0];
  if (d < 0.1) return [234, 179, 8, 40 + ((d - 0.04) / 0.06) * 50];
  if (d < 0.3) {
    const t = (d - 0.1) / 0.2;
    return [234 + (249 - 234) * t, 179 + (115 - 179) * t, 8 + (22 - 8) * t, 95 + 50 * t];
  }
  if (d < 0.5) {
    const t = (d - 0.3) / 0.2;
    return [249 + (220 - 249) * t, 115 + (38 - 115) * t, 22 + (38 - 22) * t, 150 + 30 * t];
  }
  if (d < 1) {
    const t = (d - 0.5) / 0.5;
    return [220 + (127 - 220) * t, 38 + (29 - 38) * t, 38 + (29 - 38) * t, 185 + 25 * t];
  }
  return [95, 15, 15, 215];
}

function bboxCoords(b: [number, number, number, number]): [[number, number], [number, number], [number, number], [number, number]] {
  const [w, s, e, n] = b;
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
}

type Trip = { path: LngLat[]; ts: number[]; from: number };

const DEPTH_PX = 512;

const INTERACTIVE = ["nodes", "junctions", "roads", "roads-minor", "pipes", "sectors-fill"];

export default function FloodMap(props: FloodMapProps) {
  const {
    ds,
    res: resIn,
    clock,
    layers,
    variant = "default",
    selection,
    onSelect,
    routes,
    selectedRouteId,
    highlightRoadIds,
    evacLines,
    incidents,
    vehicles,
    focus,
    pickMode,
    onPick,
    focusSectorId,
    extraMarkers,
    showShelterLabels,
    children,
    className,
    showSectorLabels = true,
  } = props;

  const res = resIn && resIn.city === ds.id && resIn.roads.depth.length === ds.roads.length ? resIn : null;
  const basemap = useApp((s) => s.basemap);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const [mapInst, setMapInst] = useState<MLMap | null>(null);
  const [fallback, setFallback] = useState(false);
  const [markerEls, setMarkerEls] = useState<{ key: string; el: HTMLElement }[]>([]);
  const [vehicleEls, setVehicleEls] = useState<Record<string, { el: HTMLElement; marker: maplibregl.Marker }>>({});
  const [extraEls, setExtraEls] = useState<Record<string, { el: HTMLElement; marker: maplibregl.Marker }>>({});
  const cbRef = useRef({ onSelect, onPick, pickMode, layers });
  cbRef.current = { onSelect, onPick, pickMode, layers };

  const depthCanvas = useMemo(() => (typeof document !== "undefined" ? document.createElement("canvas") : null), []);
  const coarseCanvas = useMemo(() => (typeof document !== "undefined" ? document.createElement("canvas") : null), []);
  /* street mask: modelled roads rasterised at ~10 m/px so predicted water follows the street network */
  const maskCanvas = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = DEPTH_PX;
    c.height = DEPTH_PX;
    const ctx = c.getContext("2d")!;
    const [w, s0, e, n] = ds.heat.bbox;
    const X = (lon: number) => ((lon - w) / (e - w)) * DEPTH_PX;
    const Y = (lat: number) => ((n - lat) / (n - s0)) * DEPTH_PX;
    ctx.strokeStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.filter = "blur(1.2px)";
    for (const r of ds.roads) {
      if ((r as { structure?: string }).structure === "flyover") continue;
      ctx.lineWidth = r.cls === "trunk" || r.cls === "primary" || r.cls === "motorway" ? 5 : r.cls === "secondary" ? 4.2 : 3.4;
      ctx.beginPath();
      r.coords.forEach(([lon, lat], i) => (i ? ctx.lineTo(X(lon), Y(lat)) : ctx.moveTo(X(lon), Y(lat))));
      ctx.stroke();
    }
    return c;
  }, [ds]);
  const rainCanvas = useMemo(() => (typeof document !== "undefined" ? document.createElement("canvas") : null), []);
  const cache = useRef({ road: new Int8Array(0), node: new Int16Array(0), pipe: new Int16Array(0), sector: new Int8Array(0), junction: new Int8Array(0) });

  /* ----------------------------- geojson ----------------------------- */
  const geo = useMemo(() => {
    const nodeIdx = new Map(ds.drainNodes.map((n, i) => [n.id, i]));
    return {
      nodeIdx,
      roads: {
        type: "FeatureCollection",
        features: ds.roads.map((r, i) => ({
          type: "Feature",
          id: i,
          properties: { rid: r.id, major: r.major, name: r.label, cls: r.cls },
          geometry: { type: "LineString", coordinates: r.coords },
        })),
      } as GeoJSON.FeatureCollection,
      pipes: {
        type: "FeatureCollection",
        features: ds.drainEdges.map((p, i) => ({
          type: "Feature",
          id: i,
          properties: { pid: p.id, from: p.from, to: p.to, d: p.diameterM },
          geometry: { type: "LineString", coordinates: p.coords },
        })),
      } as GeoJSON.FeatureCollection,
      nodes: {
        type: "FeatureCollection",
        features: ds.drainNodes.map((n, i) => ({
          type: "Feature",
          id: i,
          properties: { nid: n.id, kind: n.kind, blocked: n.blockage >= 0.2, outfall: n.kind === "outfall" },
          geometry: { type: "Point", coordinates: n.coord },
        })),
      } as GeoJSON.FeatureCollection,
      sectors: {
        type: "FeatureCollection",
        features: ds.sectors.map((s, i) => ({
          type: "Feature",
          id: i,
          properties: { sid: s.id, name: `${s.name} · ${s.locality}` },
          geometry: { type: "Polygon", coordinates: [[...s.polygon, s.polygon[0]]] },
        })),
      } as GeoJSON.FeatureCollection,
      junctions: {
        type: "FeatureCollection",
        features: ds.junctions.map((j, i) => ({
          type: "Feature",
          id: i,
          properties: { jid: j.id, name: j.name },
          geometry: { type: "Point", coordinates: j.coord },
        })),
      } as GeoJSON.FeatureCollection,
      water: {
        type: "FeatureCollection",
        features: [
          ...ds.water.polygons.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [p] } })),
        ],
      } as GeoJSON.FeatureCollection,
      waterLines: {
        type: "FeatureCollection",
        features: ds.water.lines.map((l) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l } })),
      } as GeoJSON.FeatureCollection,
      green: {
        type: "FeatureCollection",
        features: ds.green.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [p] } })),
      } as GeoJSON.FeatureCollection,
      trips: (() => {
        const P = 70;
        const out: { path: LngLat[]; ts: number[]; from: number }[] = [];
        const kx = 111320 * Math.cos((ds.center[1] * Math.PI) / 180);
        for (const p of ds.drainEdges) {
          const ts = [0];
          for (let i = 1; i < p.coords.length; i++) {
            const a = p.coords[i - 1];
            const b = p.coords[i];
            ts.push(ts[i - 1] + Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 110570));
          }
          const L = ts[ts.length - 1];
          const from = nodeIdx.get(p.from) ?? 0;
          for (let k = 0; k <= Math.ceil(L / P); k++) out.push({ path: p.coords, ts: ts.map((t) => t - k * P), from });
        }
        return out;
      })(),
    };
  }, [ds]);

  /* --------------------------- map creation --------------------------- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = new maplibregl.Map({
      container: el,
      style: styleFor(useApp.getState().basemap),
      bounds: ds.bbox,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true, customAttribution: "Road network © OpenStreetMap contributors · Terrain: SRTM 30 m · Flood & drainage data SIMULATED" },
      maxPitch: 60,
      dragRotate: true,
      pitchWithRotate: true,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    mapRef.current = map;
    setMapInst(map);
    let loaded = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!loaded && useApp.getState().basemap !== "offline") {
        setFallback(true);
        map.setStyle(OFFLINE_STYLE);
      }
    }, 7000);

    map.on("style.load", () => {
      loaded = true;
      installLayers(map);
      setStyleVersion((v) => v + 1);
    });
    map.on("error", (e) => {
      const msg = String((e as { error?: Error }).error?.message ?? "");
      if (!loaded && /style|Failed to fetch|NetworkError/i.test(msg)) {
        setFallback(true);
        map.setStyle(OFFLINE_STYLE);
      }
    });

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    overlayRef.current = overlay;

    // markers (DOM, rendered through React portals)
    const els: { key: string; el: HTMLElement }[] = [];
    const add = (key: string, coord: LngLat, anchor: maplibregl.PositionAnchor = "center") => {
      const e = document.createElement("div");
      new maplibregl.Marker({ element: e, anchor }).setLngLat(coord).addTo(map);
      els.push({ key, el: e });
    };
    ds.pois.forEach((p) => add(`poi:${p.id}`, p.coord));
    ds.sectors.forEach((s) => add(`sec:${s.id}`, s.centroid));
    ds.incidents.forEach((i) => add(`inc:${i.id}`, i.coord, "bottom"));
    setMarkerEls(els);

    // hover tooltip
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: "280px" });
    let raf = 0;
    map.on("mousemove", (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const ls = INTERACTIVE.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, "visibility") !== "none");
        const f = ls.length ? map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: ls }) : [];
        const top = pickTop(f);
        map.getCanvas().style.cursor = top || cbRef.current.pickMode ? "pointer" : "";
        if (top) {
          const p = top.properties as Record<string, string>;
          const html =
            top.layer.id === "nodes"
              ? `<b>${p.nid}</b> · drain ${p.kind}`
              : top.layer.id === "pipes"
                ? `<b>${p.pid}</b> · ${p.from} → ${p.to}`
                : top.layer.id === "junctions"
                  ? `<b>${p.jid}</b> · ${p.name}`
                  : top.layer.id === "sectors-fill"
                    ? `${p.name}`
                    : `<b>${p.rid}</b> · ${p.name}`;
          popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
        } else popup.remove();
      });
    });
    map.on("mouseout", () => popup.remove());

    map.on("click", (e) => {
      const cb = cbRef.current;
      if (cb.pickMode && cb.onPick) {
        cb.onPick([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      const ls = INTERACTIVE.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, "visibility") !== "none");
      const f = ls.length ? map.queryRenderedFeatures([[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]], { layers: ls }) : [];
      const top = pickTop(f);
      if (!top) {
        if (cb.layers.rain) cb.onSelect?.({ kind: "rain", coord: [e.lngLat.lng, e.lngLat.lat] });
        else cb.onSelect?.(null);
        return;
      }
      const p = top.properties as Record<string, string>;
      const id = top.layer.id;
      if (id === "nodes") cb.onSelect?.({ kind: "node", id: p.nid });
      else if (id === "pipes") cb.onSelect?.({ kind: "node", id: p.from });
      else if (id === "junctions") cb.onSelect?.({ kind: "junction", id: p.jid });
      else if (id === "sectors-fill") {
        if (cb.layers.rain && !cb.layers.risk) cb.onSelect?.({ kind: "rain", coord: [e.lngLat.lng, e.lngLat.lat] });
        else cb.onSelect?.({ kind: "sector", id: p.sid });
      } else cb.onSelect?.({ kind: "road", id: p.rid });
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => {
      window.clearTimeout(fallbackTimer);
      ro.disconnect();
      popup.remove();
      overlayRef.current = null;
      mapRef.current = null;
      setMapInst(null);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds]);

  function pickTop(fs: maplibregl.MapGeoJSONFeature[]) {
    const order = ["nodes", "junctions", "roads", "roads-minor", "pipes", "sectors-fill"];
    let best: maplibregl.MapGeoJSONFeature | null = null;
    for (const f of fs) {
      if (f.layer.id === "junctions" && (f.state?.r ?? 0) < 2) continue;
      if (!best || order.indexOf(f.layer.id) < order.indexOf(best.layer.id)) best = f;
    }
    return best;
  }

  /* ------------------------- layer installation ------------------------- */
  function installLayers(map: MLMap) {
    cache.current = {
      road: new Int8Array(ds.roads.length).fill(-1),
      node: new Int16Array(ds.drainNodes.length).fill(-1),
      pipe: new Int16Array(ds.drainEdges.length).fill(-1),
      sector: new Int8Array(ds.sectors.length).fill(-1),
      junction: new Int8Array(ds.junctions.length).fill(-1),
    };
    const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    const add = (layer: maplibregl.LayerSpecification) => {
      if (!map.getLayer(layer.id)) map.addLayer(layer, firstSymbol);
    };
    const src = (id: string, data: GeoJSON.FeatureCollection) => {
      if (!map.getSource(id)) map.addSource(id, { type: "geojson", data });
    };

    src("ctx-green", geo.green);
    src("ctx-water", geo.water);
    src("ctx-waterline", geo.waterLines);
    src("sectors", geo.sectors);
    src("roads", geo.roads);
    src("pipes", geo.pipes);
    src("nodes", geo.nodes);
    src("junctions", geo.junctions);
    src("routes", { type: "FeatureCollection", features: [] });
    src("evac", { type: "FeatureCollection", features: [] });

    if (depthCanvas && !map.getSource("depth")) {
      depthCanvas.width = DEPTH_PX;
      depthCanvas.height = DEPTH_PX;
      map.addSource("depth", { type: "canvas", canvas: depthCanvas, coordinates: bboxCoords(ds.heat.bbox), animate: false });
    }
    if (rainCanvas && !map.getSource("rain")) {
      rainCanvas.width = 48;
      rainCanvas.height = 48;
      map.addSource("rain", { type: "canvas", canvas: rainCanvas, coordinates: bboxCoords(ds.bbox), animate: false });
    }

    const offline = map.getStyle().name === "offline-schematic";
    add({ id: "ctx-green", type: "fill", source: "ctx-green", paint: { "fill-color": "#d9f2df", "fill-opacity": offline ? 1 : 0 } });
    add({ id: "ctx-water", type: "fill", source: "ctx-water", paint: { "fill-color": "#b9dcf2", "fill-opacity": offline ? 1 : 0 } });
    add({ id: "ctx-waterline", type: "line", source: "ctx-waterline", paint: { "line-color": "#8cc3e8", "line-width": 3, "line-opacity": offline ? 1 : 0 } });

    const r = ["coalesce", ["feature-state", "r"], 0];
    add({
      id: "sectors-fill",
      type: "fill",
      source: "sectors",
      paint: {
        "fill-color": ["match", r, 0, RISK_COLORS_MAP[0], 1, RISK_COLORS_MAP[1], 2, RISK_COLORS_MAP[2], 3, RISK_COLORS_MAP[3], 4, RISK_COLORS_MAP[4], "#16a34a"] as never,
        "fill-opacity": ["match", r, 0, 0.03, 1, 0.07, 2, 0.1, 3, 0.13, 4, 0.17, 0.03] as never,
      },
    });
    add({ id: "rain", type: "raster", source: "rain", paint: { "raster-opacity": 0.8, "raster-resampling": "linear", "raster-fade-duration": 0 } });
    add({ id: "depth", type: "raster", source: "depth", paint: { "raster-opacity": 0.9, "raster-resampling": "linear", "raster-fade-duration": 0 } });
    add({
      id: "sectors-line",
      type: "line",
      source: "sectors",
      paint: { "line-color": "#334155", "line-width": 1.2, "line-opacity": 0.55, "line-dasharray": [3, 2] },
    });
    add({
      id: "sectors-sel",
      type: "line",
      source: "sectors",
      filter: ["==", ["get", "sid"], "__none__"],
      paint: { "line-color": "#0891b2", "line-width": 3, "line-opacity": 0.95 },
    });

    // roads
    add({
      id: "roads-hl",
      type: "line",
      source: "roads",
      filter: ["in", ["get", "rid"], ["literal", []]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#06b6d4", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 7, 16, 16], "line-opacity": 0.55, "line-blur": 1.5 },
    });
    add({
      id: "roads-casing",
      type: "line",
      source: "roads",
      filter: ["==", ["get", "major"], true],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, ["+", 2.6, ["*", r, 0.7]], 16, ["+", 7, ["*", r, 2]]] as never,
        "line-opacity": ["case", [">=", r, 2], 0.95, 0] as never,
      },
    });
    const roadColor = ["match", r, 0, RISK_COLORS_MAP[0], 1, RISK_COLORS_MAP[1], 2, RISK_COLORS_MAP[2], 3, RISK_COLORS_MAP[3], 4, RISK_COLORS_MAP[4], "#16a34a"];
    add({
      id: "roads-minor",
      type: "line",
      source: "roads",
      filter: ["!=", ["get", "major"], true],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": roadColor as never,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, ["+", 0.6, ["*", r, 0.4]], 16, ["+", 2, ["*", r, 1.2]]] as never,
        "line-opacity": ["case", ["==", r, 0], 0.3, 0.9] as never,
      },
    });
    add({
      id: "roads",
      type: "line",
      source: "roads",
      filter: ["==", ["get", "major"], true],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": roadColor as never,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, ["+", 1.3, ["*", r, 0.55]], 16, ["+", 4, ["*", r, 1.6]]] as never,
        "line-opacity": ["case", ["==", r, 0], 0.5, 0.95] as never,
      },
    });
    add({
      id: "route-flood",
      type: "line",
      source: "roads",
      filter: ["in", ["get", "rid"], ["literal", []]],
      layout: { "line-cap": "round" },
      paint: { "line-color": "#b91c1c", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 5, 16, 12], "line-opacity": 0.9 },
    });

    // drainage
    const u = ["coalesce", ["feature-state", "u"], 0];
    const utilColor = ["interpolate", ["linear"], u, ...UTIL_RAMP.flat()];
    add({
      id: "pipes-hl",
      type: "line",
      source: "pipes",
      filter: ["==", ["get", "pid"], "__none__"],
      paint: { "line-color": "#06b6d4", "line-width": 9, "line-opacity": 0.5, "line-blur": 1, "line-offset": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 16, 8] },
    });
    add({
      id: "pipes",
      type: "line",
      source: "pipes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": utilColor as never,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, ["+", 0.8, ["*", ["get", "d"], 0.45]], 16, ["+", 2.2, ["*", ["get", "d"], 1.4]]] as never,
        "line-opacity": ["interpolate", ["linear"], u, 0, 0.55, 0.75, 0.8, 0.9, 0.95] as never,
        "line-offset": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 16, 8],
      },
    });
    add({
      id: "evac",
      type: "line",
      source: "evac",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["coalesce", ["get", "color"], "#059669"] as never, "line-width": 4.5, "line-opacity": 0.9, "line-dasharray": [2, 1.2] },
    });
    add({
      id: "routes-casing",
      type: "line",
      source: "routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": ["case", ["get", "selected"], 10, 7] as never, "line-opacity": 0.95 },
    });
    add({
      id: "routes-alt",
      type: "line",
      source: "routes",
      filter: ["!", ["get", "selected"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["case", ["get", "passable"], "#475569", "#dc2626"] as never, "line-width": 4, "line-opacity": 0.85, "line-dasharray": [1.6, 1.2] },
    });
    add({
      id: "routes-sel",
      type: "line",
      source: "routes",
      filter: ["get", "selected"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["case", ["get", "passable"], "#16a34a", "#dc2626"] as never, "line-width": 6, "line-opacity": 1 },
    });
    add({
      id: "junctions",
      type: "circle",
      source: "junctions",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4, 16, 8],
        "circle-color": ["match", r, 2, RISK_COLORS_MAP[2], 3, RISK_COLORS_MAP[3], 4, RISK_COLORS_MAP[4], "#94a3b8"] as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-opacity": ["case", [">=", r, 2], 1, 0] as never,
        "circle-stroke-opacity": ["case", [">=", r, 2], 1, 0] as never,
      },
    });
    add({
      id: "nodes-blocked",
      type: "circle",
      source: "nodes",
      filter: ["==", ["get", "blocked"], true],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 6, 16, 11], "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#d97706", "circle-stroke-width": 2.2 },
    });
    add({
      id: "nodes-pulse",
      type: "circle",
      source: "nodes",
      filter: ["in", ["get", "nid"], ["literal", []]],
      paint: { "circle-radius": 10, "circle-color": "#ef4444", "circle-opacity": 0.35, "circle-stroke-color": "#ef4444", "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.7 },
    });
    add({
      id: "nodes",
      type: "circle",
      source: "nodes",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          ["case", ["get", "outfall"], 5, 2.6],
          16,
          ["case", ["get", "outfall"], 10, 6],
        ] as never,
        "circle-color": utilColor as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["case", ["get", "outfall"], 2, 1] as never,
      },
    });
    add({
      id: "nodes-sel",
      type: "circle",
      source: "nodes",
      filter: ["==", ["get", "nid"], "__none__"],
      paint: { "circle-radius": 13, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#0891b2", "circle-stroke-width": 3 },
    });
  }

  /* ---------------------------- basemap swap ---------------------------- */
  const firstBasemap = useRef(true);
  useEffect(() => {
    if (firstBasemap.current) {
      firstBasemap.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    setFallback(false);
    map.setStyle(styleFor(basemap));
  }, [basemap]);

  /* ------------------------- layer visibility ------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion) return;
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("sectors-fill", layers.risk);
    vis("sectors-line", layers.risk || variant === "evacuation");
    vis("junctions", layers.risk);
    vis("depth", layers.depth);
    vis("rain", layers.rain);
    vis("roads", layers.roads);
    vis("roads-minor", layers.roads);
    vis("roads-casing", layers.roads);
    vis("pipes", layers.drainage);
    vis("nodes", layers.drainage);
    vis("pipes-hl", layers.drainage);
    vis("nodes-blocked", layers.drainage && layers.blocked);
    vis("nodes-pulse", layers.drainage && layers.surcharge);
    vis("routes-casing", layers.routes);
    vis("routes-alt", layers.routes);
    vis("routes-sel", layers.routes);
    vis("route-flood", layers.routes);
    vis("evac", layers.routes || variant === "evacuation");
    if (map.getLayer("roads")) {
      const dim = variant === "drainage";
      map.setPaintProperty("roads", "line-opacity", dim ? ["case", ["==", ["coalesce", ["feature-state", "r"], 0], 0], 0.18, 0.7] : ["case", ["==", ["coalesce", ["feature-state", "r"], 0], 0], variant === "routing" ? 0.7 : 0.5, 0.95]);
      map.setPaintProperty("rain", "raster-opacity", variant === "rainfall" ? 0.9 : 0.72);
    }
  }, [layers, styleVersion, variant]);

  /* 3D tilt for water-level columns */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion) return;
    if (layers.level && layers.drainage) map.easeTo({ pitch: 52, duration: 900 });
    else if (map.getPitch() > 0) map.easeTo({ pitch: 0, duration: 700 });
  }, [layers.level, layers.drainage, styleVersion]);

  /* ------------------------- dynamic (time) state ------------------------- */
  const rainField = useMemo(() => new RainField(ds, res?.params ?? { ...BASELINE_PARAMS[ds.id], backwater: ds.backwater.defaultOn }), [ds, res]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion || !map.getSource("roads")) return;
    const c = cache.current;
    const set = (source: string, id: number, state: Record<string, number>) => map.setFeatureState({ source, id }, state);

    if (res) {
      ds.roads.forEach((_, i) => {
        const ri = riskIdx(sample(res.roads.depth[i], res, clock));
        if (c.road[i] !== ri) {
          c.road[i] = ri;
          set("roads", i, { r: ri });
        }
      });
      const nodeU = new Float32Array(ds.drainNodes.length);
      const nodeP = new Float32Array(ds.drainNodes.length);
      const pulse: string[] = [];
      ds.drainNodes.forEach((n, k) => {
        const uu = sample(res.nodes.util[k], res, clock);
        const pp = sample(res.nodes.pond[k], res, clock);
        nodeU[k] = uu;
        nodeP[k] = pp;
        const q = Math.round(uu * 40);
        if (c.node[k] !== q) {
          c.node[k] = q;
          set("nodes", k, { u: q / 40 });
        }
        if (pp >= 0.05) pulse.push(n.id);
      });
      ds.drainEdges.forEach((p, j) => {
        const k = geo.nodeIdx.get(p.from) ?? 0;
        const q = Math.round(nodeU[k] * 40);
        if (c.pipe[j] !== q) {
          c.pipe[j] = q;
          set("pipes", j, { u: q / 40 });
        }
      });
      if (map.getLayer("nodes-pulse")) map.setFilter("nodes-pulse", ["in", ["get", "nid"], ["literal", pulse]]);
      const heat = heatDepthAt(ds, res, clock);
      sectorImpacts(ds, res, clock, heat).forEach((s, i) => {
        const ri = RISK_ORDER.indexOf(s.risk);
        if (c.sector[i] !== ri) {
          c.sector[i] = ri;
          set("sectors", i, { r: ri });
        }
      });
      junctionRisks(ds, res, clock, clock).forEach((j, i) => {
        const ri = RISK_ORDER.indexOf(j.risk);
        if (c.junction[i] !== ri) {
          c.junction[i] = ri;
          set("junctions", i, { r: ri });
        }
      });
      // depth raster
      if (depthCanvas && coarseCanvas && maskCanvas && layers.depth) {
        coarseCanvas.width = ds.heat.cols;
        coarseCanvas.height = ds.heat.rows;
        const cctx = coarseCanvas.getContext("2d")!;
        const img = cctx.createImageData(ds.heat.cols, ds.heat.rows);
        const d = heat;
        for (let i = 0; i < d.length; i++) {
          const [rr, gg, bb, aa] = depthRGBA(d[i]);
          img.data[i * 4] = rr;
          img.data[i * 4 + 1] = gg;
          img.data[i * 4 + 2] = bb;
          img.data[i * 4 + 3] = aa;
        }
        cctx.putImageData(img, 0, 0);
        const ctx = depthCanvas.getContext("2d")!;
        ctx.save();
        ctx.clearRect(0, 0, DEPTH_PX, DEPTH_PX);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        // street-level water: smooth depth field masked to the street network
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(coarseCanvas, 0, 0, DEPTH_PX, DEPTH_PX);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(maskCanvas, 0, 0);
        // faint area wash beneath for ponding that spreads off-street
        ctx.globalCompositeOperation = "destination-over";
        ctx.globalAlpha = 0.32;
        ctx.drawImage(coarseCanvas, 0, 0, DEPTH_PX, DEPTH_PX);
        ctx.restore();
        pushCanvas(map, "depth");
      }
      // deck.gl: flow particles + water-level columns
      deckState.current = { nodeU, nodeP };
    }
    if (rainCanvas && layers.rain) {
      const ctx = rainCanvas.getContext("2d")!;
      const g = { cols: 48, rows: 48, bbox: ds.bbox };
      const vals = rainField.grid(clock, g);
      const img = ctx.createImageData(48, 48);
      for (let i = 0; i < vals.length; i++) {
        const [rr, gg, bb, aa] = rainColor(vals[i]);
        img.data[i * 4] = rr;
        img.data[i * 4 + 1] = gg;
        img.data[i * 4 + 2] = bb;
        img.data[i * 4 + 3] = aa;
      }
      ctx.putImageData(img, 0, 0);
      pushCanvas(map, "rain");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res, clock, styleVersion, layers.depth, layers.rain, rainField]);

  function pushCanvas(map: MLMap, id: string) {
    const s = map.getSource(id) as CanvasSource | undefined;
    if (!s) return;
    s.play();
    requestAnimationFrame(() => requestAnimationFrame(() => s.pause()));
  }

  /* ------------------------- deck.gl animation ------------------------- */
  const deckState = useRef<{ nodeU: Float32Array; nodeP: Float32Array } | null>(null);
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !styleVersion) return;
    const showFlow = layers.drainage && layers.flow && !!res;
    const showLevel = layers.drainage && layers.level && !!res;
    if (!showFlow && !showLevel) {
      overlay.setProps({ layers: [] });
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      const st = deckState.current;
      const T = (((performance.now() - t0) / 1000) * 45) % 70;
      const ls = [];
      if (showFlow && st) {
        ls.push(
          new TripsLayer<Trip>({
            id: "flow",
            data: geo.trips,
            getPath: (d: Trip) => d.path,
            getTimestamps: (d: Trip) => d.ts,
            getColor: (d: Trip) => utilRGB(st.nodeU[d.from], st.nodeP[d.from]),
            updateTriggers: { getColor: [clock, res] },
            widthMinPixels: 2.4,
            widthMaxPixels: 4,
            getWidth: 3,
            capRounded: true,
            jointRounded: true,
            trailLength: 26,
            fadeTrail: true,
            currentTime: T,
            opacity: 0.95,
            getOffset: 1.3,
            extensions: [new PathStyleExtension({ offset: true })],
          } as never),
        );
      }
      if (showLevel && st) {
        ls.push(
          new ColumnLayer<{ c: LngLat; k: number }>({
            id: "level",
            data: ds.drainNodes.map((n, k) => ({ c: n.coord, k })),
            getPosition: (d) => d.c,
            getElevation: (d) => {
              const lv = sample(res!.nodes.level[d.k], res!, clock);
              return 12 + lv * 55 + (st.nodeP[d.k] > 0.05 ? 60 : 0);
            },
            getFillColor: (d) => {
              const [r1, g1, b1] = utilRGB(st.nodeU[d.k], st.nodeP[d.k]);
              return st.nodeU[d.k] < 0.75 ? [37, 99, 235, 220] : [r1, g1, b1, 235];
            },
            updateTriggers: { getElevation: [clock, res], getFillColor: [clock, res] },
            radius: 16,
            diskResolution: 12,
            extruded: true,
            pickable: false,
          }),
        );
      }
      overlay.setProps({ layers: ls });
      if (showFlow) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [layers.drainage, layers.flow, layers.level, res, clock, styleVersion, geo, ds]);

  /* surcharge pulse animation */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion || !(layers.drainage && layers.surcharge)) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      if (map.getLayer("nodes-pulse")) {
        const ph = ((performance.now() - t0) % 1600) / 1600;
        map.setPaintProperty("nodes-pulse", "circle-radius", 8 + ph * 16);
        map.setPaintProperty("nodes-pulse", "circle-opacity", 0.45 * (1 - ph));
        map.setPaintProperty("nodes-pulse", "circle-stroke-opacity", 0.9 * (1 - ph));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [layers.drainage, layers.surcharge, styleVersion]);

  /* ------------------------------ selection ------------------------------ */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion || !map.getLayer("roads-hl")) return;
    let roadIds: string[] = [...(highlightRoadIds ?? [])];
    let nodeId = "__none__";
    let sectorId = focusSectorId ?? "__none__";
    let pipeFilter: maplibregl.FilterSpecification = ["==", ["get", "pid"], "__none__"];
    if (selection?.kind === "road") {
      roadIds.push(selection.id);
      const r = ds.roads.find((x) => x.id === selection.id);
      if (r) nodeId = r.nodeId;
    } else if (selection?.kind === "node") {
      nodeId = selection.id;
      const n = ds.drainNodes.find((x) => x.id === selection.id);
      if (n) roadIds = roadIds.concat(n.roadIds);
      pipeFilter = ["any", ["==", ["get", "from"], selection.id], ["==", ["get", "to"], selection.id]];
    } else if (selection?.kind === "sector") {
      sectorId = selection.id;
    } else if (selection?.kind === "junction") {
      const j = ds.junctions.find((x) => x.id === selection.id);
      if (j) roadIds = roadIds.concat(j.roadIds);
    }
    map.setFilter("roads-hl", ["in", ["get", "rid"], ["literal", roadIds]]);
    map.setFilter("nodes-sel", ["==", ["get", "nid"], nodeId]);
    map.setFilter("sectors-sel", ["==", ["get", "sid"], sectorId]);
    map.setFilter("pipes-hl", pipeFilter);
  }, [selection, highlightRoadIds, focusSectorId, styleVersion, ds]);

  /* -------------------------------- routes -------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion) return;
    const s = map.getSource("routes") as GeoJSONSource | undefined;
    if (!s) return;
    const list = routes ?? [];
    s.setData({
      type: "FeatureCollection",
      features: [...list]
        .sort((a, b) => Number(a.id === selectedRouteId) - Number(b.id === selectedRouteId))
        .map((r) => ({
          type: "Feature",
          properties: { id: r.id, selected: r.id === selectedRouteId, passable: r.passable },
          geometry: { type: "LineString", coordinates: r.coords },
        })),
    });
    const flooded = [...new Set(list.flatMap((r) => r.floodedRoadIds))];
    map.setFilter("route-flood", ["in", ["get", "rid"], ["literal", flooded]]);
  }, [routes, selectedRouteId, styleVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleVersion) return;
    const s = map.getSource("evac") as GeoJSONSource | undefined;
    s?.setData({
      type: "FeatureCollection",
      features: (evacLines ?? []).map((l) => ({ type: "Feature", properties: { color: l.color ?? "#059669" }, geometry: { type: "LineString", coordinates: l.coords } })),
    });
  }, [evacLines, styleVersion]);

  /* --------------------------------- focus --------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (focus.bounds) map.fitBounds(focus.bounds, { padding: { top: 90, bottom: 60, left: 60, right: 60 }, duration: 1400, maxZoom: 15.5 });
    else map.flyTo({ center: focus.center, zoom: focus.zoom ?? Math.max(map.getZoom(), 14.6), duration: 1400, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  /* ------------------------------- vehicles ------------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const next: typeof vehicleEls = { ...vehicleEls };
    let changed = false;
    for (const v of vehicles ?? []) {
      if (!next[v.id]) {
        const el = document.createElement("div");
        const marker = new maplibregl.Marker({ element: el }).setLngLat(v.coord).addTo(map);
        next[v.id] = { el, marker };
        changed = true;
      } else next[v.id].marker.setLngLat(v.coord);
    }
    for (const id of Object.keys(next)) {
      if (!(vehicles ?? []).some((v) => v.id === id)) {
        next[id].marker.remove();
        delete next[id];
        changed = true;
      }
    }
    if (changed) setVehicleEls(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, styleVersion]);

  /* ----------------------------- extra markers ----------------------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const next: typeof extraEls = { ...extraEls };
    let changed = false;
    for (const m of extraMarkers ?? []) {
      if (!next[m.id]) {
        const el = document.createElement("div");
        next[m.id] = { el, marker: new maplibregl.Marker({ element: el }).setLngLat(m.coord).addTo(map) };
        changed = true;
      } else next[m.id].marker.setLngLat(m.coord);
    }
    for (const id of Object.keys(next)) {
      if (!(extraMarkers ?? []).some((m) => m.id === id)) {
        next[id].marker.remove();
        delete next[id];
        changed = true;
      }
    }
    if (changed) setExtraEls(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraMarkers, mapInst]);

  /* --------------------------- POI marker state --------------------------- */
  const poiRisk = useMemo(() => {
    const out: Record<string, number> = {};
    if (!res) return out;
    const idx = new Map(ds.roads.map((r, i) => [r.id, i]));
    for (const p of ds.pois) {
      let m = 0;
      for (const id of p.accessRoadIds) {
        const i = idx.get(id);
        if (i != null) m = Math.max(m, sample(res.roads.depth[i], res, clock));
      }
      out[p.id] = m;
    }
    return out;
  }, [ds, res, clock]);

  const sectorRisk = useMemo(() => {
    if (!res) return {} as Record<string, string>;
    return Object.fromEntries(sectorImpacts(ds, res, clock).map((s) => [s.id, s.risk]));
  }, [ds, res, clock]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#e8ecef] ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" />
      {markerEls.map(({ key, el }) => {
        const [kind, id] = key.split(":") as [string, string];
        if (kind === "poi") {
          const p = ds.pois.find((x) => x.id === id);
          if (!p) return null;
          const visible = p.kind === "shelter" ? layers.shelters : layers.infra;
          return createPortal(
            <PoiMarker poi={p} visible={visible} showLabel={showShelterLabels} accessDepth={poiRisk[p.id] ?? 0} selected={selection?.kind === "poi" && selection.id === p.id} onClick={() => onSelect?.({ kind: "poi", id: p.id })} />,
            el,
            key,
          );
        }
        if (kind === "sec") {
          const s = ds.sectors.find((x) => x.id === id);
          if (!s) return null;
          return createPortal(
            <SectorLabel sector={s} visible={showSectorLabels && layers.risk} risk={sectorRisk[s.id] as never} onClick={() => onSelect?.({ kind: "sector", id: s.id })} />,
            el,
            key,
          );
        }
        const inc = ds.incidents.find((x) => x.id === id);
        if (!inc) return null;
        const visible = !!incidents?.some((i) => i.id === id);
        return createPortal(<IncidentMarker incident={inc} visible={visible} onClick={() => onSelect?.({ kind: "incident", id })} />, el, key);
      })}
      {Object.entries(extraEls).map(([id, { el }]) => {
        const m = extraMarkers?.find((x) => x.id === id);
        return m ? createPortal(m.node, el, `extra:${id}`) : null;
      })}
      {Object.entries(vehicleEls).map(([id, { el }]) => {
        const v = vehicles?.find((x) => x.id === id);
        return v ? createPortal(<VehicleMarker kind={v.kind} label={v.label} active={v.active} />, el, `veh:${id}`) : null;
      })}
      {fallback && (
        <div className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-md border border-amber-500/40 bg-ink-900/90 px-3 py-1 text-[11px] text-amber-300">
          Basemap tiles unreachable — showing offline schematic (OSM snapshot)
        </div>
      )}
      {pickMode && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-md border border-cyan-400/40 bg-ink-900/90 px-3 py-1 text-[11px] text-cyan-200">
          Click on the map to set the emergency location
        </div>
      )}
      <MapCtx.Provider value={{ map: mapInst, ds }}>{children}</MapCtx.Provider>
    </div>
  );
}
