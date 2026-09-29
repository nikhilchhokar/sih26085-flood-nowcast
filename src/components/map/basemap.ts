import type { StyleSpecification } from "maplibre-gl";
import type { Basemap } from "@/lib/store";

export const BASEMAPS: Record<Basemap, { label: string; url?: string; note: string }> = {
  openfreemap: {
    label: "OpenFreeMap Positron (live tiles)",
    url: "https://tiles.openfreemap.org/styles/positron",
    note: "Free vector tiles, no API key.",
  },
  carto: {
    label: "CARTO Positron (live tiles)",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    note: "Alternative CDN.",
  },
  offline: {
    label: "Offline schematic (no internet)",
    note: "Only the baked OSM snapshot is drawn — safe for venues without Wi-Fi.",
  },
};

export const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  name: "offline-schematic",
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#eef1f4" } }],
};

export function styleFor(b: Basemap): string | StyleSpecification {
  return BASEMAPS[b].url ?? OFFLINE_STYLE;
}
