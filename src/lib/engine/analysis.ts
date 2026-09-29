/**
 * Post-processing of simulation output into decision products:
 * street-level risk, onset times, sector impact, alerts and response actions.
 */
import type {
  Alert,
  CityDataset,
  NowcastSummary,
  ResponseAction,
  RiskLevel,
  SimResult,
} from "../types";
import { HORIZON_MIN, UNSAFE_DEPTH, clockLabel, confidenceAt, riskOf, riskRank } from "./constants";

/** Water at the doorstep: population counted as affected above this depth (m). */
export const AFFECTED_DEPTH = 0.15;

/* ------------------------------ time ------------------------------ */

export function fracIndex(res: SimResult, clock: number) {
  const f = (clock - res.t0) / res.dt;
  return Math.min(res.steps - 1, Math.max(0, f));
}

export function sample(series: ArrayLike<number>, res: SimResult, clock: number) {
  const f = fracIndex(res, clock);
  const i = Math.floor(f);
  const j = Math.min(series.length - 1, i + 1);
  const t = f - i;
  return series[i] * (1 - t) + series[j] * t;
}

/** First clock (≥ from, ≤ to) at which the series reaches `threshold`. */
export function onsetClock(
  series: ArrayLike<number>,
  res: SimResult,
  from: number,
  threshold: number,
  to = from + HORIZON_MIN,
): number | null {
  const start = sample(series, res, from);
  if (start >= threshold) return from;
  const i0 = Math.floor(fracIndex(res, from));
  const i1 = Math.ceil(fracIndex(res, to));
  for (let i = i0; i < i1; i++) {
    const a = series[i];
    const b = series[i + 1];
    if (b >= threshold && a < threshold) {
      const clock = res.t0 + (i + (threshold - a) / (b - a)) * res.dt;
      if (clock >= from && clock <= to) return clock;
    }
  }
  return null;
}

export function maxOver(series: ArrayLike<number>, res: SimResult, from: number, to: number) {
  const i0 = Math.max(0, Math.floor(fracIndex(res, from)));
  const i1 = Math.min(res.steps - 1, Math.ceil(fracIndex(res, to)));
  let max = -Infinity;
  let at = i0;
  for (let i = i0; i <= i1; i++) {
    if (series[i] > max) {
      max = series[i];
      at = i;
    }
  }
  return { max, clock: res.t0 + at * res.dt };
}

/* --------------------------- probability -------------------------- */

/** P(depth > threshold) given a deterministic depth and lead-time dependent spread. */
export function exceedance(depth: number, leadMin: number, threshold = UNSAFE_DEPTH) {
  const sigma = 0.06 + 0.0011 * Math.max(0, leadMin);
  const z = (depth - threshold) / sigma;
  return 1 / (1 + Math.exp(-1.7 * z));
}

/* ------------------------------ lookup ----------------------------- */

export interface Indexed {
  roadIndex: Map<string, number>;
  nodeIndex: Map<string, number>;
  sectorIndex: Map<string, number>;
  poiIndex: Map<string, number>;
}

const indexCache = new WeakMap<CityDataset, Indexed>();
export function indexes(ds: CityDataset): Indexed {
  let hit = indexCache.get(ds);
  if (!hit) {
    hit = {
      roadIndex: new Map(ds.roads.map((r, i) => [r.id, i])),
      nodeIndex: new Map(ds.drainNodes.map((n, i) => [n.id, i])),
      sectorIndex: new Map(ds.sectors.map((s, i) => [s.id, i])),
      poiIndex: new Map(ds.pois.map((p, i) => [p.id, i])),
    };
    indexCache.set(ds, hit);
  }
  return hit;
}

export function midpoint(coords: [number, number][]): [number, number] {
  return coords[Math.floor(coords.length / 2)];
}

/* ------------------------------ heat ------------------------------- */

/** For each heat cell: nearest road segment (≤ 120 m) and its distance — lets street depth spill into blocks. */
const cellRoadCache = new WeakMap<CityDataset, { road: Int32Array; dist: Float32Array }>();
export function cellRoads(ds: CityDataset) {
  const hit = cellRoadCache.get(ds);
  if (hit) return hit;
  const h = ds.heat;
  const [w, s, e, n] = h.bbox;
  const lat0 = (s + n) / 2;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110570;
  const B = 150;
  const buckets = new Map<number, number[]>();
  const segs: number[] = []; // ri, ax, ay, bx, by
  ds.roads.forEach((r, ri) => {
    if ((r as { structure?: string }).structure === "flyover") return;
    for (let k = 1; k < r.coords.length; k++) {
      const ax = (r.coords[k - 1][0] - w) * kx;
      const ay = (r.coords[k - 1][1] - s) * ky;
      const bx = (r.coords[k][0] - w) * kx;
      const by = (r.coords[k][1] - s) * ky;
      const id = segs.length / 5;
      segs.push(ri, ax, ay, bx, by);
      const key = Math.floor((ax + bx) / 2 / B) * 100000 + Math.floor((ay + by) / 2 / B);
      const arr = buckets.get(key);
      if (arr) arr.push(id);
      else buckets.set(key, [id]);
    }
  });
  const road = new Int32Array(h.cols * h.rows).fill(-1);
  const dist = new Float32Array(h.cols * h.rows).fill(1e9);
  for (let r = 0; r < h.rows; r++) {
    for (let c = 0; c < h.cols; c++) {
      const px = (((c + 0.5) / h.cols) * (e - w)) * kx;
      const py = ((1 - (r + 0.5) / h.rows) * (n - s)) * ky;
      const bx = Math.floor(px / B);
      const by = Math.floor(py / B);
      let best = 1e9;
      let bri = -1;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const list = buckets.get((bx + dx) * 100000 + (by + dy));
          if (!list) continue;
          for (const id of list) {
            const o = id * 5;
            const ax = segs[o + 1];
            const ay = segs[o + 2];
            const vx = segs[o + 3] - ax;
            const vy = segs[o + 4] - ay;
            const L = vx * vx + vy * vy;
            const t = L ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L)) : 0;
            const d = Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
            if (d < best) {
              best = d;
              bri = segs[o];
            }
          }
        }
      const idx = r * h.cols + c;
      if (best <= 120) {
        road[idx] = bri;
        dist[idx] = best;
      }
    }
  }
  const out = { road, dist };
  cellRoadCache.set(ds, out);
  return out;
}

/**
 * Predicted water depth per heat cell: area ponding around surcharged nodes,
 * combined with street water spreading ~100 m into adjacent blocks.
 */
export function heatDepthAt(ds: CityDataset, res: SimResult, clock: number, out?: Float32Array) {
  const h = ds.heat;
  const n = h.cols * h.rows;
  const arr = out ?? new Float32Array(n);
  const f = fracIndex(res, clock);
  const i = Math.floor(f);
  const j = Math.min(res.steps - 1, i + 1);
  const t = f - i;
  const pond = res.nodes.pond;
  const nodeDepth = new Float32Array(ds.drainNodes.length);
  for (let k = 0; k < nodeDepth.length; k++) nodeDepth[k] = pond[k][i] * (1 - t) + pond[k][j] * t;
  const roadDepth = new Float32Array(ds.roads.length);
  for (let k = 0; k < roadDepth.length; k++) roadDepth[k] = res.roads.depth[k][i] * (1 - t) + res.roads.depth[k][j] * t;
  const cr = cellRoads(ds);
  for (let c = 0; c < n; c++) {
    const ni = h.node[c];
    const area = ni < 0 ? 0 : nodeDepth[ni] * h.weight[c];
    const ri = cr.road[c];
    const street = ri < 0 || h.weight[c] === 0 ? 0 : roadDepth[ri] * Math.max(0, 1 - cr.dist[c] / 110);
    arr[c] = Math.max(area, street);
  }
  return arr;
}

/* ----------------------------- sectors ----------------------------- */

export interface SectorImpact {
  id: string;
  maxDepth: number;
  risk: RiskLevel;
  roadsUnsafe: number;
  popAtRisk: number;
  floodedAreaPct: number;
}

export function sectorImpacts(ds: CityDataset, res: SimResult, clock: number, heatIn?: Float32Array): SectorImpact[] {
  const { sectorIndex } = indexes(ds);
  const acc = ds.sectors.map((s) => ({
    id: s.id,
    maxDepth: 0,
    depths: [] as number[],
    roadsUnsafe: 0,
    pop: 0,
    wet: 0,
    cells: 0,
  }));
  ds.roads.forEach((r, ri) => {
    const d = sample(res.roads.depth[ri], res, clock);
    const a = acc[sectorIndex.get(r.sectorId) ?? 0];
    if (!r.major) return;
    a.depths.push(d);
    if (d > a.maxDepth) a.maxDepth = d;
    if (d >= UNSAFE_DEPTH) a.roadsUnsafe++;
  });
  const heat = heatIn ?? heatDepthAt(ds, res, clock);
  const sectorOfCell = cellSectors(ds);
  for (let c = 0; c < heat.length; c++) {
    const si = sectorOfCell[c];
    if (si < 0) continue;
    const a = acc[si];
    a.cells++;
    if (heat[c] >= AFFECTED_DEPTH) {
      a.pop += ds.heat.pop[c];
      a.wet++;
    }
  }
  return acc.map((a) => {
    const sorted = a.depths.sort((x, y) => y - x);
    // risk of a sector = depth exceeded by its worst ~10% of road length
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.1))] ?? 0;
    const riskDepth = Math.max(p90, a.maxDepth * 0.75);
    return {
      id: a.id,
      maxDepth: a.maxDepth,
      risk: riskOf(riskDepth),
      roadsUnsafe: a.roadsUnsafe,
      popAtRisk: Math.round(a.pop),
      floodedAreaPct: a.cells ? (100 * a.wet) / a.cells : 0,
    };
  });
}

const cellSectorCache = new WeakMap<CityDataset, Int16Array>();
export function cellSectors(ds: CityDataset) {
  let hit = cellSectorCache.get(ds);
  if (hit) return hit;
  const h = ds.heat;
  const [w, s, e, n] = h.bbox;
  hit = new Int16Array(h.cols * h.rows).fill(-1);
  for (let r = 0; r < h.rows; r++) {
    const lat = n - ((r + 0.5) / h.rows) * (n - s);
    for (let c = 0; c < h.cols; c++) {
      const lon = w + ((c + 0.5) / h.cols) * (e - w);
      for (let k = 0; k < ds.sectors.length; k++) {
        if (pointInPolygon([lon, lat], ds.sectors[k].polygon)) {
          hit[r * h.cols + c] = k;
          break;
        }
      }
    }
  }
  cellSectorCache.set(ds, hit);
  return hit;
}

export function pointInPolygon(p: [number, number], poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ----------------------------- summary ----------------------------- */

export function roadMaxDepth(res: SimResult, ri: number, from: number, to: number) {
  return maxOver(res.roads.depth[ri], res, from, to);
}

export function summarize(
  ds: CityDataset,
  res: SimResult,
  now = res.now,
  horizon = HORIZON_MIN,
  opts: { degraded?: boolean; sectorId?: string | null } = {},
): NowcastSummary {
  const to = now + horizon;
  let maxDepth = 0;
  let maxDepthRoadId: string | null = null;
  let roadsAtRisk = 0;
  let firstImpact: number | null = null;
  const inScope = (sectorId: string) => !opts.sectorId || opts.sectorId === sectorId;

  ds.roads.forEach((r, ri) => {
    if (!r.major || !inScope(r.sectorId)) return;
    const series = res.roads.depth[ri];
    const { max } = maxOver(series, res, now, to);
    if (max > maxDepth) {
      maxDepth = max;
      maxDepthRoadId = r.id;
    }
    if (max >= UNSAFE_DEPTH) {
      roadsAtRisk++;
      const on = onsetClock(series, res, now, UNSAFE_DEPTH, to);
      if (on != null && on > now && (firstImpact == null || on < firstImpact)) firstImpact = on;
    }
  });

  // peak = time of maximum total flooded road length
  let peakClock = now;
  let peakVal = -1;
  for (let c = now; c <= to; c += res.dt) {
    let v = 0;
    ds.roads.forEach((r, ri) => {
      if (!r.major || !inScope(r.sectorId)) return;
      const d = sample(res.roads.depth[ri], res, c);
      if (d >= UNSAFE_DEPTH) v += r.lengthM * d;
    });
    if (v > peakVal) {
      peakVal = v;
      peakClock = c;
    }
  }

  const sectorOfCell = cellSectors(ds);
  const heat = heatDepthAt(ds, res, peakClock);
  let pop = 0;
  for (let c = 0; c < heat.length; c++) {
    if (heat[c] < AFFECTED_DEPTH) continue;
    const si = sectorOfCell[c];
    if (si < 0 || !inScope(ds.sectors[si].id)) continue;
    pop += ds.heat.pop[c];
  }

  const { roadIndex } = indexes(ds);
  let hospitalsAtRisk = 0;
  for (const p of ds.pois) {
    if (p.kind !== "hospital" || !inScope(p.sectorId)) continue;
    const risky = p.accessRoadIds.some((id) => {
      const ri = roadIndex.get(id);
      return ri != null && maxOver(res.roads.depth[ri], res, now, to).max >= UNSAFE_DEPTH;
    });
    if (risky) hospitalsAtRisk++;
  }

  const criticalIntersections = junctionRisks(ds, res, now, to).filter((j) => riskRank(j.risk) >= 3 && inScope(j.sectorId)).length;
  const sectorsAffected = new Set(
    ds.roads
      .map((r, ri) => ({ r, ri }))
      .filter(({ r, ri }) => r.major && inScope(r.sectorId) && maxOver(res.roads.depth[ri], res, now, to).max >= UNSAFE_DEPTH)
      .map(({ r }) => r.sectorId),
  ).size;

  return {
    maxDepth,
    maxDepthRoadId,
    roadsAtRisk,
    criticalIntersections,
    firstImpactMin: firstImpact == null ? null : Math.round(firstImpact - now),
    peakClock,
    affectedPopulation: Math.round(pop / 10) * 10,
    hospitalsAtRisk,
    sectorsAffected,
    confidence: confidenceAt(60, opts.degraded),
  };
}

/* ---------------------------- junctions ---------------------------- */

export function junctionRisks(ds: CityDataset, res: SimResult, from: number, to: number) {
  const { roadIndex } = indexes(ds);
  return ds.junctions.map((j) => {
    let max = 0;
    for (const id of j.roadIds) {
      const ri = roadIndex.get(id);
      if (ri == null) continue;
      max = Math.max(max, maxOver(res.roads.depth[ri], res, from, to).max);
    }
    return { ...j, maxDepth: max, risk: riskOf(max) };
  });
}

/* ----------------------------- alerts ------------------------------ */

const fmtMin = (m: number) => `${Math.max(1, Math.round(m))} min`;

export function generateAlerts(ds: CityDataset, res: SimResult, now = res.now): Alert[] {
  const to = now + HORIZON_MIN;
  const { roadIndex } = indexes(ds);
  const sectorName = (id: string) => ds.sectors.find((s) => s.id === id)?.name ?? id;
  const alerts: Alert[] = [];
  let seq = 1040;
  const push = (a: Omit<Alert, "id" | "issuedClock">) => alerts.push({ ...a, id: `ALT-${seq++}`, issuedClock: now });

  // 1. critical depth exceedance on roads (> 1.0 m) — one per road name/sector
  const seen = new Set<string>();
  const roadCands = ds.roads
    .map((r, ri) => ({ r, ri, max: maxOver(res.roads.depth[ri], res, now, to) }))
    .filter((x) => x.r.major)
    .sort((a, b) => b.max.max - a.max.max);

  for (const { r, ri, max } of roadCands) {
    const key = `${r.name}|${r.sectorId}`;
    if (seen.has(key)) continue;
    if (max.max >= 1.0) {
      const on = onsetClock(res.roads.depth[ri], res, now, 1.0, to)!;
      seen.add(key);
      push({
        severity: "critical",
        title: `${r.label}: depth > 1.0 m`,
        message: `Water depth expected to exceed 1.0 m at ${r.label} in ${fmtMin(on - now)}.`,
        location: r.label,
        sectorId: r.sectorId,
        target: { kind: "road", id: r.id },
        coord: midpoint(r.coords),
        predictedDepth: max.max,
        timeToImpactMin: Math.round(on - now),
        recommendedAction: "Close carriageway, deploy traffic police, activate alternate route.",
      });
    }
    if (alerts.length >= 3) break;
  }

  // 2. hero road — high-risk headline alert
  const hero = roadIndex.get(ds.hero.roadId);
  if (hero != null) {
    const r = ds.roads[hero];
    const on = onsetClock(res.roads.depth[hero], res, now, UNSAFE_DEPTH, to);
    const pk = maxOver(res.roads.depth[hero], res, now, to);
    if (on != null && !seen.has(`${r.name}|${r.sectorId}`)) {
      push({
        severity: pk.max >= 1 ? "critical" : "high",
        title: `${r.label}: high flood risk`,
        message: `High flood risk at ${r.label}. Expected depth ${pk.max.toFixed(2)} m, time to impact ${fmtMin(on - now)}.`,
        location: r.label,
        sectorId: r.sectorId,
        target: { kind: "road", id: r.id },
        coord: midpoint(r.coords),
        predictedDepth: pk.max,
        timeToImpactMin: Math.round(on - now),
        recommendedAction: "Restrict traffic and activate alternate route.",
      });
    }
  }

  // 3. drainage nodes approaching capacity
  const nodeCands = ds.drainNodes
    .map((n, ni) => ({ n, ni, on: onsetClock(res.nodes.util[ni], res, now, 0.9, to) }))
    .filter((x) => x.on != null)
    .sort((a, b) => {
      if (a.n.id === ds.hero.nodeId) return -1;
      if (b.n.id === ds.hero.nodeId) return 1;
      return a.on! - b.on!;
    })
    .slice(0, 3);
  for (const { n, ni, on } of nodeCands) {
    const peakUtil = maxOver(res.nodes.util[ni], res, now, to).max;
    const utilNow = sample(res.nodes.util[ni], res, now);
    const pct = Math.round(Math.min(0.99, Math.max(0.9, utilNow)) * 100);
    push({
      severity: n.id === ds.hero.nodeId ? "high" : "medium",
      title: `${n.id} approaching capacity`,
      message:
        utilNow >= 0.85
          ? `Drainage node ${n.id} approaching ${pct}% capacity.`
          : `Drainage node ${n.id} forecast to reach 90% capacity in ${fmtMin(on! - now)}${peakUtil >= 1 ? "; surcharge likely" : ""}.`,
      location: `${n.id} · ${sectorName(n.sectorId)}`,
      sectorId: n.sectorId,
      target: { kind: "node", id: n.id },
      coord: n.coord,
      predictedDepth: null,
      timeToImpactMin: Math.round(on! - now),
      recommendedAction: "Dispatch drain-clearing crew; stage portable pump.",
    });
  }

  // 4. roads becoming unsafe
  const unsafe = ds.roads
    .map((r, ri) => ({ r, ri, on: onsetClock(res.roads.depth[ri], res, now, UNSAFE_DEPTH, to) }))
    .filter((x) => x.r.major && x.on != null && x.on > now + 5)
    .sort((a, b) => {
      if (a.r.id === ds.hero.unsafeRoadId) return -1;
      if (b.r.id === ds.hero.unsafeRoadId) return 1;
      return a.on! - b.on!;
    });
  const usedNames = new Set<string>();
  for (const { r, ri, on } of unsafe) {
    if (usedNames.has(r.name + r.sectorId) || r.id === ds.hero.roadId) continue;
    usedNames.add(r.name + r.sectorId);
    push({
      severity: "high",
      title: `${r.id} predicted unsafe`,
      message: `Road segment ${r.id} (${r.label}) predicted to become unsafe in ${fmtMin(on! - now)}.`,
      location: r.label,
      sectorId: r.sectorId,
      target: { kind: "road", id: r.id },
      coord: midpoint(r.coords),
      predictedDepth: maxOver(res.roads.depth[ri], res, now, to).max,
      timeToImpactMin: Math.round(on! - now),
      recommendedAction: "Pre-position barricades; divert heavy vehicles.",
    });
    if (usedNames.size >= 3) break;
  }

  // 5. rainfall intensifying over the storm-arrival sector
  const sec = ds.sectors.find((s) => s.id === ds.hero.residentsSectorId);
  if (sec) {
    push({
      severity: "medium",
      title: `Rainfall intensifying — ${sec.name}`,
      message: `Rainfall intensity increasing rapidly in ${sec.name} (${sec.locality}).`,
      location: `${sec.name} · ${sec.locality}`,
      sectorId: sec.id,
      target: { kind: "sector", id: sec.id },
      coord: sec.centroid,
      predictedDepth: null,
      timeToImpactMin: 15,
      recommendedAction: "Issue advisory to residents; monitor radar cell.",
    });
  }

  // 6. hospital access
  for (const p of ds.pois.filter((p) => p.kind === "hospital")) {
    let best: { on: number; depth: number } | null = null;
    for (const id of p.accessRoadIds) {
      const ri = roadIndex.get(id);
      if (ri == null) continue;
      const on = onsetClock(res.roads.depth[ri], res, now, UNSAFE_DEPTH, to);
      if (on != null && (!best || on < best.on)) best = { on, depth: maxOver(res.roads.depth[ri], res, now, to).max };
    }
    if (best) {
      push({
        severity: "high",
        title: `Access to ${p.name} at risk`,
        message: `Access road to ${p.name} predicted unsafe in ${fmtMin(best.on - now)}.`,
        location: p.name,
        sectorId: p.sectorId,
        target: { kind: "poi", id: p.id },
        coord: p.coord,
        predictedDepth: best.depth,
        timeToImpactMin: Math.round(best.on - now),
        recommendedAction: "Notify hospital; route ambulances via safe corridor.",
      });
      break;
    }
  }

  const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return alerts
    .sort((a, b) => rank[a.severity] - rank[b.severity] || (a.timeToImpactMin ?? 999) - (b.timeToImpactMin ?? 999))
    .map((a, i) => ({ ...a, id: `ALT-${1041 + i}` }));
}

/* ------------------------------ actions ---------------------------- */

export function generateActions(ds: CityDataset, res: SimResult, now = res.now): ResponseAction[] {
  const to = now + HORIZON_MIN;
  const { roadIndex, nodeIndex } = indexes(ds);
  const acts: ResponseAction[] = [];
  const hero = ds.roads[roadIndex.get(ds.hero.roadId)!];
  const heroNode = ds.drainNodes[nodeIndex.get(ds.hero.nodeId)!];
  const downNode = ds.drainNodes[nodeIndex.get(ds.hero.downstreamNodeId)!];
  const residents = ds.sectors.find((s) => s.id === ds.hero.residentsSectorId)!;
  const heroSector = ds.sectors.find((s) => s.id === ds.hero.sectorId)!;
  const shelter = ds.pois.find((p) => p.id === ds.hero.shelterId)!;
  const hi = roadIndex.get(ds.hero.roadId)!;
  const heroOn = onsetClock(res.roads.depth[hi], res, now, UNSAFE_DEPTH, to) ?? now + 30;
  const heroPk = maxOver(res.roads.depth[hi], res, now, to);
  const nodeOn = onsetClock(res.nodes.util[nodeIndex.get(heroNode.id)!], res, now, 1, to) ?? now + 20;
  const impacts = sectorImpacts(ds, res, heroPk.clock);
  const resImpact = impacts.find((s) => s.id === residents.id);
  const heroImpact = impacts.find((s) => s.id === heroSector.id);

  acts.push({
    id: "ACT-01",
    priority: "P1",
    kind: "divert",
    title: `Divert traffic from ${hero.label}`,
    location: hero.label,
    reason: `Forecast depth ${heroPk.max.toFixed(2)} m at ${clockLabel(heroPk.clock)}; unsafe from ${clockLabel(heroOn)}.`,
    dueClock: Math.max(now + 5, heroOn - 15),
    target: { kind: "road", id: hero.id },
    coord: midpoint(hero.coords),
  });
  acts.push({
    id: "ACT-02",
    priority: "P1",
    kind: "dispatch",
    title: `Dispatch response team to ${heroNode.id}`,
    location: `${heroNode.id} · ${heroSector.name}`,
    reason: `Surcharge forecast at ${clockLabel(nodeOn)}; baseline blockage ${Math.round(heroNode.blockage * 100)}%. Clear inlets, stage pump.`,
    dueClock: Math.max(now + 5, nodeOn - 10),
    target: { kind: "node", id: heroNode.id },
    coord: heroNode.coord,
  });
  acts.push({
    id: "ACT-03",
    priority: "P1",
    kind: "notify",
    title: `Warn residents in ${residents.name}`,
    location: `${residents.name} · ${residents.locality}`,
    reason: `Intense rainfall cell overhead; ~${(resImpact?.popAtRisk ?? 0) + (heroImpact?.popAtRisk ?? 0) > 0 ? ((resImpact?.popAtRisk ?? 0) + (heroImpact?.popAtRisk ?? 0)).toLocaleString("en-IN") : "several thousand"} residents in forecast flood extent.`,
    dueClock: now + 10,
    target: { kind: "sector", id: residents.id },
    coord: residents.centroid,
  });
  acts.push({
    id: "ACT-04",
    priority: "P1",
    kind: "reroute",
    title: "Redirect ambulance route",
    location: `${ds.pois.find((p) => p.id === ds.hero.hospitalId)?.name ?? "Hospital"} → ${ds.incidents[0]?.name ?? "incident"}`,
    reason: `Current route crosses ${hero.label}; safe corridor available.`,
    dueClock: now + 5,
    target: { kind: "road", id: hero.id },
    coord: midpoint(hero.coords),
  });
  acts.push({
    id: "ACT-05",
    priority: "P2",
    kind: "activate",
    title: `Activate Shelter ${shelter.id}`,
    location: shelter.name,
    reason: `Nearest high-ground shelter to ${heroSector.name}; capacity ${shelter.capacity ?? 400}.`,
    dueClock: now + 30,
    target: { kind: "poi", id: shelter.id },
    coord: shelter.coord,
  });
  acts.push({
    id: "ACT-06",
    priority: "P2",
    kind: "monitor",
    title: `Monitor downstream drainage node ${downNode.id}`,
    location: `${downNode.id} · ${ds.sectors.find((s) => s.id === downNode.sectorId)?.name}`,
    reason: `Receives overflow from ${heroNode.id}${res.params.backwater ? "; outfall backwater active" : ""}.`,
    dueClock: now + 20,
    target: { kind: "node", id: downNode.id },
    coord: downNode.coord,
  });
  return acts;
}
