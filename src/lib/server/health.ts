import type { HealthStatus } from "../types";

export interface HealthComponent {
  id: string;
  name: string;
  layer: "Ingest" | "Static data" | "Modelling" | "Delivery";
  status: HealthStatus;
  mode: "LIVE" | "STATIC" | "SIMULATED";
  updatedAgoSec: number | null;
  cadence: string;
  latencyMs: number | null;
  detail: string;
}

/**
 * Simulated component health. Freshness cycles with wall-clock time so the
 * dashboard ticks; failures can be injected from Settings to demo fallbacks.
 */
export function systemHealth(opts: { radarOutage?: boolean; awsDelay?: boolean; now?: number }) {
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const cyc = (period: number, offset = 0) => (now + offset) % period;
  const jitter = (base: number, spread: number, seed: number) =>
    Math.round(base + spread * Math.sin(now / 7 + seed) * Math.cos(now / 13 + seed * 2));

  const components: HealthComponent[] = [
    {
      id: "radar",
      name: "IMD Doppler Radar Feed",
      layer: "Ingest",
      status: opts.radarOutage ? "offline" : "online",
      mode: "SIMULATED",
      updatedAgoSec: opts.radarOutage ? 1260 + cyc(60) : 60 + cyc(300, 20) * 0.4,
      cadence: "5 min volume scan",
      latencyMs: opts.radarOutage ? null : jitter(420, 90, 1),
      detail: opts.radarOutage
        ? "No volume scan received for 21 min — nowcast falling back to AWS gauge interpolation."
        : "Reflectivity → rain-rate (Z-R) with gauge bias correction.",
    },
    {
      id: "aws",
      name: "AWS Rain Gauges",
      layer: "Ingest",
      status: opts.awsDelay ? "delayed" : "online",
      mode: "SIMULATED",
      updatedAgoSec: opts.awsDelay ? 540 + cyc(60) : 20 + cyc(60, 7),
      cadence: "1 min",
      latencyMs: jitter(180, 40, 2),
      detail: opts.awsDelay ? "3 of 5 gauges reporting late (telemetry backlog)." : "5 / 5 gauges reporting.",
    },
    {
      id: "water-level",
      name: "Drain Water-Level Sensors",
      layer: "Ingest",
      status: "online",
      mode: "SIMULATED",
      updatedAgoSec: 30 + cyc(60, 11),
      cadence: "1 min",
      latencyMs: jitter(210, 50, 3),
      detail: "Ultrasonic level sensors at trunk-drain nodes.",
    },
    {
      id: "dem",
      name: "Terrain / DEM",
      layer: "Static data",
      status: "static",
      mode: "STATIC",
      updatedAgoSec: null,
      cadence: "Static",
      latencyMs: null,
      detail: "SRTM 30 m (sampled, smoothed). Production: Copernicus GLO-30 / Bhuvan CartoDEM.",
    },
    {
      id: "landuse",
      name: "Land Use / Imperviousness",
      layer: "Static data",
      status: "static",
      mode: "STATIC",
      updatedAgoSec: null,
      cadence: "Quarterly",
      latencyMs: null,
      detail: "Derived from OSM land cover + road density proxy.",
    },
    {
      id: "drain-graph",
      name: "Drainage Graph",
      layer: "Static data",
      status: "online",
      mode: "SIMULATED",
      updatedAgoSec: 240 + cyc(300, 3) * 0.2,
      cadence: "5 min state sync",
      latencyMs: jitter(95, 20, 4),
      detail: "Reconstructed from OSM + DEM (synthetic attributes); state synced every 5 min.",
    },
    {
      id: "engine",
      name: "Prediction Engine (PI-GNN)",
      layer: "Modelling",
      status: opts.radarOutage ? "warning" : "online",
      mode: "SIMULATED",
      updatedAgoSec: 18 + cyc(120, 5) * 0.3,
      cadence: "Every 5 min",
      latencyMs: 18000 + jitter(0, 1500, 5),
      detail: opts.radarOutage
        ? "Running in degraded mode (gauge-only forcing); confidence reduced."
        : "Target inference budget 18 s per city (PI-GNN not deployed in prototype — demo engine used).",
    },
    {
      id: "gis",
      name: "GIS Engine (PostGIS)",
      layer: "Delivery",
      status: "online",
      mode: "SIMULATED",
      updatedAgoSec: 5 + cyc(30, 2),
      cadence: "On demand",
      latencyMs: jitter(38, 10, 6),
      detail: "Spatial joins, risk polygons, road-segment attribution.",
    },
    {
      id: "alerts",
      name: "Alert Engine",
      layer: "Delivery",
      status: opts.awsDelay ? "warning" : "online",
      mode: "SIMULATED",
      updatedAgoSec: 12 + cyc(60, 9),
      cadence: "Event driven",
      latencyMs: jitter(64, 15, 7),
      detail: opts.awsDelay ? "Thresholds evaluated on partially stale gauges." : "SMS / app push / control-room console.",
    },
    {
      id: "basemap",
      name: "Basemap Tiles (OpenFreeMap)",
      layer: "Delivery",
      status: "online",
      mode: "LIVE",
      updatedAgoSec: null,
      cadence: "CDN",
      latencyMs: null,
      detail: "Live vector tiles; the app falls back to an offline schematic if unreachable.",
    },
  ];
  const worst = components.some((c) => c.status === "offline")
    ? "offline"
    : components.some((c) => c.status === "delayed" || c.status === "warning")
      ? "warning"
      : "online";
  return { generatedAt: new Date().toISOString(), overall: worst as HealthStatus, components };
}
