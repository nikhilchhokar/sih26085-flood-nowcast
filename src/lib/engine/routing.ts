/**
 * Flood-aware emergency routing on the OSM road graph.
 * Route A: shortest SAFE route (time cost + depth penalty, impassable edges removed)
 * Route B: shortest distance, flood-blind (what a normal navigation app would do)
 * Route C: alternate safe corridor (penalises re-use of Route A)
 */
import type { CityDataset, LngLat, RouteOption, SimResult } from "../types";
import { VEHICLE_LIMITS, riskOf } from "./constants";
import { maxOver } from "./analysis";

type VehicleKind = keyof typeof VEHICLE_LIMITS;

const SPEED_KMH: Record<string, number> = {
  motorway: 45,
  trunk: 38,
  primary: 32,
  secondary: 28,
  tertiary: 24,
  unclassified: 20,
  residential: 16,
};
const RAIN_SLOWDOWN = 0.82;

interface Adj {
  to: number;
  edge: number;
}

const adjCache = new WeakMap<CityDataset, Adj[][]>();
function adjacency(ds: CityDataset) {
  let adj = adjCache.get(ds);
  if (adj) return adj;
  adj = ds.graph.nodes.map(() => [] as Adj[]);
  ds.graph.edges.forEach(([a, b], ei) => {
    adj![a].push({ to: b, edge: ei });
    adj![b].push({ to: a, edge: ei });
  });
  adjCache.set(ds, adj);
  return adj;
}

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.k;
    const v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

function dijkstra(ds: CityDataset, src: number, dst: number, cost: (edge: number) => number) {
  const adj = adjacency(ds);
  const n = ds.graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const prevNode = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  dist[src] = 0;
  heap.push(0, src);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    if (u === dst) break;
    for (const { to, edge } of adj[u]) {
      const c = cost(edge);
      if (!isFinite(c)) continue;
      const nd = d + c;
      if (nd < dist[to]) {
        dist[to] = nd;
        prevEdge[to] = edge;
        prevNode[to] = u;
        heap.push(nd, to);
      }
    }
  }
  if (!isFinite(dist[dst])) return null;
  const edges: number[] = [];
  const nodes: number[] = [dst];
  let cur = dst;
  while (cur !== src) {
    edges.push(prevEdge[cur]);
    cur = prevNode[cur];
    nodes.push(cur);
  }
  return { edges: edges.reverse(), nodes: nodes.reverse() };
}

/** Reachability from a node over the graph (used to snap clicked destinations). */
export function nearestGraphNode(ds: CityDataset, p: LngLat) {
  let best = 0;
  let bd = Infinity;
  const kx = Math.cos((p[1] * Math.PI) / 180);
  ds.graph.nodes.forEach(([x, y], i) => {
    const d = ((x - p[0]) * kx) ** 2 + (y - p[1]) ** 2;
    if (d < bd && adjacency(ds)[i].length > 0) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export interface PlanInput {
  vehicle: VehicleKind;
  originNode: number;
  destNode: number;
  clock: number;
  /** consider depths over [clock, clock + window] */
  windowMin?: number;
}

export function planRoutes(ds: CityDataset, res: SimResult, input: PlanInput): RouteOption[] {
  const { vehicle, originNode, destNode, clock } = input;
  const win = input.windowMin ?? 30;
  const lim = VEHICLE_LIMITS[vehicle];

  // worst depth per road over the travel window
  const roadDepth = res.roads.depth.map((series) => maxOver(series, res, clock, clock + win).max);

  const edgeTime = (ei: number, floodAware: boolean) => {
    const [, , len, ri] = ds.graph.edges[ei];
    const road = ds.roads[ri];
    const d = roadDepth[ri] ?? 0;
    let v = (SPEED_KMH[road?.cls] ?? 20) * RAIN_SLOWDOWN;
    if (floodAware) v *= Math.max(0.25, 1 - d / (lim.max * 1.4));
    return (len / 1000 / v) * 60; // minutes
  };

  const safeCost = (penalised?: Set<number>) => (ei: number) => {
    const ri = ds.graph.edges[ei][3];
    const d = roadDepth[ri] ?? 0;
    if (d > lim.max) return Infinity;
    const excess = Math.max(0, d - 0.05) / lim.max;
    let c = edgeTime(ei, true) * (1 + 6 * excess);
    if (penalised?.has(ei)) c *= 2.2;
    return c;
  };
  const distCost = (ei: number) => ds.graph.edges[ei][2];

  const build = (
    id: RouteOption["id"],
    label: string,
    strategy: string,
    path: { edges: number[]; nodes: number[] } | null,
    floodAware: boolean,
  ): RouteOption | null => {
    if (!path) return null;
    const coords: LngLat[] = [];
    let dist = 0;
    let eta = 0;
    let maxDepth = 0;
    const roadIds = new Set<string>();
    const flooded = new Set<string>();
    path.edges.forEach((ei, k) => {
      const [a, b, len, ri] = ds.graph.edges[ei];
      const forward = path.nodes[k] === a;
      const g = ds.graph.geoms[ei] ?? [];
      const seq: LngLat[] = [ds.graph.nodes[a], ...g, ds.graph.nodes[b]];
      if (!forward) seq.reverse();
      if (coords.length) seq.shift();
      coords.push(...seq);
      dist += len;
      eta += edgeTime(ei, floodAware);
      const road = ds.roads[ri];
      const d = roadDepth[ri] ?? 0;
      if (road) {
        roadIds.add(road.id);
        if (d >= lim.comfortable) flooded.add(road.id);
      }
      maxDepth = Math.max(maxDepth, d);
    });
    // dispatch + junction delays
    eta += 1.2 + path.nodes.length * 0.04;
    return {
      id,
      label,
      strategy,
      coords,
      distanceKm: Math.round(dist / 100) / 10,
      etaMin: Math.max(1, Math.round(eta)),
      maxDepth,
      risk: riskOf(maxDepth),
      floodedRoadIds: [...flooded],
      roadIds: [...roadIds],
      recommended: false,
      passable: maxDepth <= lim.max,
    };
  };

  const a = dijkstra(ds, originNode, destNode, safeCost());
  const b = dijkstra(ds, originNode, destNode, distCost);
  const penal = new Set(a?.edges ?? []);
  let c = dijkstra(ds, originNode, destNode, safeCost(penal));
  if (c && a && c.edges.join() === a.edges.join()) {
    const heavy = (ei: number) => (penal.has(ei) ? safeCost()(ei) * 6 : safeCost()(ei));
    c = dijkstra(ds, originNode, destNode, heavy);
  }

  const out: RouteOption[] = [];
  const A = build("A", "Route A", "Shortest safe route (flood-aware)", a, true);
  const B = build("B", "Route B", "Shortest distance (flood-blind)", b, false);
  const C = build("C", "Route C", "Alternate safe corridor", c, true);
  if (A) out.push({ ...A, recommended: true });
  if (B) out.push(B);
  if (C && (!A || C.coords.length !== A.coords.length || C.distanceKm !== A.distanceKm)) out.push(C);
  if (!A && B) B.recommended = false;
  return out;
}
