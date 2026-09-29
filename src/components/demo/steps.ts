import type { Alert, CityDataset, RouteResponse, SimResult } from "@/lib/types";
import { NOW_CLOCK, UNSAFE_DEPTH, clockLabel } from "@/lib/engine/constants";
import { maxOver, onsetClock, sample } from "@/lib/engine/analysis";

export const PIPELINE = ["Rain", "Data fusion", "Drainage graph", "PI-GNN", "Flood depth", "Risk map", "Alert / Action"];

export interface DemoCtx {
  ds: CityDataset;
  res: SimResult;
  alerts: Alert[];
  route: RouteResponse | null;
}

export interface DemoStep {
  key: string;
  stage: number;
  duration: number;
  tau: [number, number];
  title: (c: DemoCtx) => string;
  sub: (c: DemoCtx) => string;
}

const nodeIdx = (c: DemoCtx, id: string) => c.ds.drainNodes.findIndex((n) => n.id === id);
const roadIdx = (c: DemoCtx, id: string) => c.ds.roads.findIndex((r) => r.id === id);

export const STEPS: DemoStep[] = [
  {
    key: "rain",
    stage: 0,
    duration: 8000,
    tau: [-30, 0],
    title: () => "Rainfall intensity increasing…",
    sub: (c) =>
      `City-mean rainfall ${Math.round(sample(c.res.rainMean, c.res, NOW_CLOCK - 30))} → ${Math.round(sample(c.res.rainMean, c.res, NOW_CLOCK))} mm/hr over ${c.ds.name} · radar & AWS frames ingested`,
  },
  {
    key: "coupling",
    stage: 2,
    duration: 8000,
    tau: [0, 5],
    title: () => "Rainfall enters the drainage model…",
    sub: (c) => `Runoff (C·i·A) routed through ${c.ds.drainNodes.length} drain nodes and ${c.ds.drainEdges.length} pipes — rainfall–drainage coupling`,
  },
  {
    key: "filling",
    stage: 2,
    duration: 8000,
    tau: [5, 16],
    title: () => "Drainage nodes begin filling…",
    sub: (c) => {
      const k = nodeIdx(c, c.ds.hero.nodeId);
      const clock = NOW_CLOCK + 16;
      const n = c.ds.drainNodes.filter((_, i) => sample(c.res.nodes.util[i], c.res, clock) >= 0.75).length;
      return `${c.ds.hero.nodeId} climbing to ${Math.round(sample(c.res.nodes.util[k], c.res, clock) * 100)}% of capacity · ${n} nodes above 75%`;
    },
  },
  {
    key: "surcharge",
    stage: 3,
    duration: 8000,
    tau: [16, 30],
    title: (c) => `Drainage capacity exceeded at ${c.ds.hero.nodeId}…`,
    sub: (c) => `Surcharge warning — overflow to street level, backwater building toward ${c.ds.hero.downstreamNodeId}`,
  },
  {
    key: "propagation",
    stage: 4,
    duration: 9000,
    tau: [30, 58],
    title: () => "Flood propagation detected…",
    sub: (c) => {
      const clock = NOW_CLOCK + 60;
      const n = c.ds.roads.filter((r, i) => r.major && sample(c.res.roads.depth[i], c.res, clock) >= UNSAFE_DEPTH).length;
      return `PI-GNN nowcast updated: ${n} road segments forecast above 0.3 m by ${clockLabel(clock)}`;
    },
  },
  {
    key: "unsafe",
    stage: 5,
    duration: 8000,
    tau: [58, 66],
    title: (c) => {
      const i = roadIdx(c, c.ds.hero.unsafeRoadId);
      const on = i >= 0 ? onsetClock(c.res.roads.depth[i], c.res, NOW_CLOCK, UNSAFE_DEPTH) : null;
      return `Road ${c.ds.hero.unsafeRoadId} predicted unsafe in ${on ? Math.round(on - NOW_CLOCK) : "—"} minutes…`;
    },
    sub: (c) => {
      const i = roadIdx(c, c.ds.hero.unsafeRoadId);
      if (i < 0) return "";
      const pk = maxOver(c.res.roads.depth[i], c.res, NOW_CLOCK, NOW_CLOCK + 180);
      return `${c.ds.roads[i].label} · peak ${pk.max.toFixed(2)} m at ${clockLabel(pk.clock)}`;
    },
  },
  {
    key: "alert",
    stage: 6,
    duration: 8500,
    tau: [66, 66],
    title: () => "Critical alert issued…",
    sub: (c) => heroAlertLine(c),
  },
  {
    key: "route",
    stage: 6,
    duration: 9500,
    tau: [66, 70],
    title: () => "Emergency route recalculated…",
    sub: (c) => {
      const A = c.route?.options.find((o) => o.id === "A");
      const B = c.route?.options.find((o) => o.id === "B");
      const hero = c.ds.roads.find((r) => r.id === c.ds.hero.roadId);
      if (!A || !B) return "Computing shortest SAFE route for ambulance…";
      return `Ambulance avoids ${hero?.name ?? "flooded road"} (${B.maxDepth.toFixed(2)} m) · Route A ${A.distanceKm} km, ETA ${A.etaMin} min, flood risk ${A.risk.toUpperCase()}`;
    },
  },
  {
    key: "actions",
    stage: 6,
    duration: 10000,
    tau: [70, 120],
    title: () => "System recommends response actions…",
    sub: (c) => `Divert traffic · dispatch crew to ${c.ds.hero.nodeId} · warn Sector 7 · reroute ambulance · activate Shelter ${c.ds.hero.shelterId} · monitor ${c.ds.hero.downstreamNodeId}`,
  },
];

export function heroAlert(c: DemoCtx) {
  const hero = c.ds.roads.find((r) => r.id === c.ds.hero.roadId)!;
  const i = roadIdx(c, hero.id);
  const pk = maxOver(c.res.roads.depth[i], c.res, NOW_CLOCK, NOW_CLOCK + 180);
  const on = onsetClock(c.res.roads.depth[i], c.res, NOW_CLOCK, UNSAFE_DEPTH);
  return { road: hero, depth: pk.max, tti: on != null ? Math.round(on - NOW_CLOCK) : null };
}

export function heroAlertLine(c: DemoCtx) {
  const h = heroAlert(c);
  return `${h.road.label.toUpperCase()} · ${h.depth >= 1 ? "CRITICAL" : "HIGH"} FLOOD RISK · EXPECTED DEPTH ${h.depth.toFixed(2)} m · TIME TO IMPACT ${h.tti ?? "—"} MIN`;
}

/** shared progress of the current step (0..1), read by the overlay */
export const demoProgress = { value: 0 };
