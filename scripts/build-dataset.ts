/**
 * Builds the per-city demo datasets from the raw snapshots in data/raw.
 *
 *   OSM roads  ──► routable graph + road segments
 *   OSM roads + SRTM DEM ──► reconstructed stormwater drain graph (flows downhill to outfalls)
 *   OSM land cover ──► imperviousness, population proxy
 *   SRTM DEM ──► relative lowness → ponding & street susceptibility
 *
 * Drain attributes (capacity, blockage, storage) are SYNTHETIC — real drain
 * inventories are not public. The engine is then calibrated so the demo storm
 * produces a plausible, story-consistent flood evolution.
 *
 * Usage: npm run data:build [-- delhi]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Delaunay } from "d3-delaunay";
import { CITIES, type CityConfig } from "./cities.config";
import type {
  CityDataset,
  DrainEdge,
  DrainNode,
  Incident,
  Junction,
  LngLat,
  Poi,
  RoadClass,
  RoadSegment,
  Sector,
  Vehicle,
} from "../src/lib/types";
import { simulate } from "../src/lib/engine/simulate";
import { BASELINE_PARAMS, NOW_CLOCK, UNSAFE_DEPTH } from "../src/lib/engine/constants";
import { maxOver, onsetClock, sample, summarize } from "../src/lib/engine/analysis";
import { planRoutes } from "../src/lib/engine/routing";

/* ------------------------------------------------------------------ */
/* utils                                                               */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round5 = (v: number) => Math.round(v * 1e5) / 1e5;
const rc = (p: LngLat): LngLat => [round5(p[0]), round5(p[1])];
const r2 = (v: number) => Math.round(v * 100) / 100;

const STORM_FROM: Record<string, number> = { delhi: 250, mumbai: 235, chennai: 75 };
const IMPERV_BASE: Record<string, number> = { delhi: 0.74, mumbai: 0.86, chennai: 0.72 };
const RENAME: Record<string, string> = {
  "Mahatma Gandhi Marg": "Ring Road",
  "Dr Babasaheb Ambedkar Marg (Vincent Road)": "Dr Ambedkar Road",
  "Inner Ring Road (Southern Sector)": "Inner Ring Road",
};

/* ------------------------------------------------------------------ */

function buildCity(cfg: CityConfig) {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "data", "raw", `${cfg.id}.json`), "utf-8"));
  const rng = mulberry32(hash(cfg.id) ^ 0x5eed);
  const [W, S, E, N] = cfg.bbox;
  const lat0 = (S + N) / 2;
  const lon0 = (W + E) / 2;
  const KX = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const KY = 110570;
  const xy = (p: LngLat): [number, number] => [(p[0] - lon0) * KX, (p[1] - lat0) * KY];
  const ll = (q: [number, number]): LngLat => [q[0] / KX + lon0, q[1] / KY + lat0];
  const dist = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY);
  const inBox = (p: LngLat, m = 0) => p[0] > W + m && p[0] < E - m && p[1] > S + m && p[1] < N - m;
  const polyLen = (cs: LngLat[]) => cs.slice(1).reduce((s, p, i) => s + dist(cs[i], p), 0);

  function segDist(p: LngLat, a: LngLat, b: LngLat) {
    const [px, py] = xy(p);
    const [ax, ay] = xy(a);
    const [bx, by] = xy(b);
    const dx = bx - ax;
    const dy = by - ay;
    const L = dx * dx + dy * dy;
    const t = L ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  const polyDist = (p: LngLat, cs: LngLat[]) => {
    let m = Infinity;
    for (let i = 1; i < cs.length; i++) m = Math.min(m, segDist(p, cs[i - 1], cs[i]));
    return m;
  };

  /* ------------------------------ DEM ------------------------------ */
  const D = raw.dem;
  const dcols: number = D.cols;
  const drows: number = D.rows;
  let dv: number[] = D.values.map((v: number) => (Number.isFinite(v) ? v : NaN));
  const valid = dv.filter((v) => !isNaN(v)).sort((a, b) => a - b);
  const p02 = valid[Math.floor(valid.length * 0.02)];
  const p97 = valid[Math.floor(valid.length * 0.97)];
  dv = dv.map((v) => (isNaN(v) ? valid[Math.floor(valid.length / 2)] : clamp(v, p02, p97)));
  // gaussian smoothing (σ ≈ 1.3 cells ≈ 160 m) to suppress building/tree artefacts in SRTM
  const blur = (arr: number[]) => {
    const k = [0.06, 0.24, 0.4, 0.24, 0.06];
    const tmp = new Array(arr.length).fill(0);
    const out = new Array(arr.length).fill(0);
    for (let r = 0; r < drows; r++)
      for (let c = 0; c < dcols; c++) {
        let s = 0;
        for (let o = -2; o <= 2; o++) s += k[o + 2] * arr[r * dcols + clamp(c + o, 0, dcols - 1)];
        tmp[r * dcols + c] = s;
      }
    for (let r = 0; r < drows; r++)
      for (let c = 0; c < dcols; c++) {
        let s = 0;
        for (let o = -2; o <= 2; o++) s += k[o + 2] * tmp[clamp(r + o, 0, drows - 1) * dcols + c];
        out[r * dcols + c] = s;
      }
    return out;
  };
  const dem = blur(blur(dv));
  const elevAt = (p: LngLat) => {
    const fc = clamp(((p[0] - W) / (E - W)) * dcols - 0.5, 0, dcols - 1.001);
    const fr = clamp(((N - p[1]) / (N - S)) * drows - 0.5, 0, drows - 1.001);
    const c = Math.floor(fc);
    const r = Math.floor(fr);
    const tc = fc - c;
    const tr = fr - r;
    const g = (rr: number, cc: number) => dem[clamp(rr, 0, drows - 1) * dcols + clamp(cc, 0, dcols - 1)];
    return (g(r, c) * (1 - tc) + g(r, c + 1) * tc) * (1 - tr) + (g(r + 1, c) * (1 - tc) + g(r + 1, c + 1) * tc) * tr;
  };
  const localMean = (p: LngLat, radius: number) => {
    let s = 0;
    let n = 0;
    for (let r = 0; r < drows; r++)
      for (let c = 0; c < dcols; c++) {
        const q: LngLat = [W + ((c + 0.5) / dcols) * (E - W), N - ((r + 0.5) / drows) * (N - S)];
        if (dist(p, q) <= radius) {
          s += dem[r * dcols + c];
          n++;
        }
      }
    return n ? s / n : elevAt(p);
  };

  /* ----------------------------- roads ----------------------------- */
  const nodeCoord = new Map<number, LngLat>();
  const ways: { id: number; nodes: number[]; tags: Record<string, string> }[] = [];
  for (const el of raw.roads.elements) {
    if (el.type === "node") nodeCoord.set(el.id, [el.lon, el.lat]);
    else if (el.type === "way" && el.tags?.highway) ways.push(el);
  }
  const MAJOR = /^(motorway|trunk|primary|secondary|tertiary|unclassified)(_link)?$/;
  const majorWays = ways.filter((w) => MAJOR.test(w.tags.highway) && w.nodes.every((n) => nodeCoord.has(n)));
  const allWayCoords = ways
    .filter((w) => w.nodes.every((n) => nodeCoord.has(n)))
    .map((w) => w.nodes.map((n) => nodeCoord.get(n)!));

  // routing graph over major ways
  const usage = new Map<number, number>();
  for (const w of majorWays) {
    w.nodes.forEach((n, k) => usage.set(n, (usage.get(n) ?? 0) + (k === 0 || k === w.nodes.length - 1 ? 2 : 1)));
  }
  const gIndex = new Map<number, number>();
  const gNodes: LngLat[] = [];
  const gid = (osm: number) => {
    let i = gIndex.get(osm);
    if (i == null) {
      i = gNodes.length;
      gIndex.set(osm, i);
      gNodes.push(nodeCoord.get(osm)!);
    }
    return i;
  };
  interface RawEdge {
    a: number;
    b: number;
    geom: LngLat[];
    len: number;
    way: number;
  }
  const rawEdges: RawEdge[] = [];
  const wayEdges: number[][] = [];
  majorWays.forEach((w, wi) => {
    const list: number[] = [];
    let start = 0;
    for (let k = 1; k < w.nodes.length; k++) {
      if ((usage.get(w.nodes[k]) ?? 0) >= 2 || k === w.nodes.length - 1) {
        const ids = w.nodes.slice(start, k + 1);
        const cs = ids.map((n) => nodeCoord.get(n)!);
        rawEdges.push({ a: gid(ids[0]), b: gid(ids[ids.length - 1]), geom: cs.slice(1, -1), len: polyLen(cs), way: wi });
        list.push(rawEdges.length - 1);
        start = k;
      }
    }
    wayEdges.push(list);
  });

  // largest connected component
  const adj: number[][] = gNodes.map(() => []);
  rawEdges.forEach((e, i) => {
    adj[e.a].push(i);
    adj[e.b].push(i);
  });
  const comp = new Int32Array(gNodes.length).fill(-1);
  let bestComp = -1;
  let bestSize = 0;
  for (let s = 0, cid = 0; s < gNodes.length; s++) {
    if (comp[s] >= 0) continue;
    const stack = [s];
    comp[s] = cid;
    let size = 0;
    while (stack.length) {
      const u = stack.pop()!;
      size++;
      for (const ei of adj[u]) {
        const e = rawEdges[ei];
        const v = e.a === u ? e.b : e.a;
        if (comp[v] < 0) {
          comp[v] = cid;
          stack.push(v);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestComp = cid;
    }
    cid++;
  }

  // road segments (chunks of ways, cut at graph nodes, ≥ 220 m)
  const roads: (RoadSegment & { _bridge: boolean; _tunnel: boolean; _link: boolean })[] = [];
  const edgeRoad = new Int32Array(rawEdges.length).fill(-1);
  majorWays.forEach((w, wi) => {
    const hw = w.tags.highway;
    const link = hw.endsWith("_link");
    const cls = hw.replace("_link", "") as RoadClass;
    const rawName = w.tags.name ?? w.tags["name:en"] ?? w.tags.ref;
    const name = rawName ? (RENAME[rawName] ?? rawName) : link ? "Slip road" : `Unnamed ${cls} road`;
    const bridge = (w.tags.bridge != null && w.tags.bridge !== "no") || /flyover|bridge|overpass|elevated/i.test(rawName ?? "");
    const tunnel = w.tags.tunnel != null && w.tags.tunnel !== "no";
    let cur: number[] = [];
    let curLen = 0;
    const flush = (force: boolean) => {
      if (!cur.length) return;
      if (!force && curLen < 220) return;
      const coords: LngLat[] = [];
      cur.forEach((ei, k) => {
        const e = rawEdges[ei];
        const seq = [gNodes[e.a], ...e.geom, gNodes[e.b]];
        if (k > 0) seq.shift();
        coords.push(...seq);
      });
      // merge tiny tail into previous chunk of the same way
      const prev = roads[roads.length - 1];
      if (force && curLen < 70 && prev && (prev as any)._way === wi) {
        prev.coords.push(...coords.slice(1));
        prev.lengthM += curLen;
        cur.forEach((ei) => (edgeRoad[ei] = roads.length - 1));
      } else {
        const idx = roads.length;
        roads.push({
          id: "",
          name,
          label: "",
          cls,
          major: !link && ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(cls),
          coords,
          lengthM: curLen,
          sectorId: "",
          nodeId: "",
          elev: 0,
          relLow: 0,
          susceptibility: 1,
          lanes: w.tags.lanes ? Number(w.tags.lanes) || undefined : undefined,
          _bridge: bridge,
          _tunnel: tunnel,
          _link: link,
          ...({ _way: wi } as any),
        });
        cur.forEach((ei) => (edgeRoad[ei] = idx));
      }
      cur = [];
      curLen = 0;
    };
    for (const ei of wayEdges[wi]) {
      cur.push(ei);
      curLen += rawEdges[ei].len;
      flush(false);
    }
    flush(true);
  });

  /* ---------------------------- sectors ---------------------------- */
  const seeds: [number, number][] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const p: LngLat = [
        W + ((c + 0.5 + (rng() - 0.5) * 0.35) / 3) * (E - W),
        N - ((r + 0.5 + (rng() - 0.5) * 0.35) / 3) * (N - S),
      ];
      seeds.push(xy(p));
    }
  const [minX, minY] = xy([W, S]);
  const [maxX, maxY] = xy([E, N]);
  const vor = Delaunay.from(seeds).voronoi([minX, minY, maxX, maxY]);
  const pip = (p: LngLat, poly: LngLat[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const secPolys: LngLat[][] = seeds.map((_, i) => (vor.cellPolygon(i) as [number, number][]).map((q) => rc(ll(q))));
  const sectorOf = (p: LngLat) => {
    for (let i = 0; i < secPolys.length; i++) if (pip(p, secPolys[i])) return i;
    let best = 0;
    let bd = Infinity;
    seeds.forEach((s, i) => {
      const d = Math.hypot(xy(p)[0] - s[0], xy(p)[1] - s[1]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  /* ----------------------- drain graph (synthetic) ----------------------- */
  const DRAIN_CLASSES = /^(trunk|primary|secondary|tertiary|unclassified)$/;
  interface Stop {
    p: LngLat;
    way: number;
    pos: number; // vertex position along way (fractional)
  }
  const stops: Stop[] = [];
  const wayStops: number[][] = [];
  majorWays.forEach((w, wi) => {
    const list: number[] = [];
    const ok =
      DRAIN_CLASSES.test(w.tags.highway) &&
      !(w.tags.bridge && w.tags.bridge !== "no") &&
      !/flyover|bridge|overpass|elevated/i.test(w.tags.name ?? "") &&
      !(w.tags.tunnel && w.tags.tunnel !== "no");
    if (!ok) {
      wayStops.push(list);
      return;
    }
    const cs = w.nodes.map((n) => nodeCoord.get(n)!);
    let since = 0;
    for (let k = 0; k < cs.length; k++) {
      if (k > 0) {
        const L = dist(cs[k - 1], cs[k]);
        // interpolated stops every ~260 m on long stretches
        let acc = since;
        let t0 = 0;
        while (acc + L * (1 - t0) > 260) {
          const need = 260 - acc;
          const t = t0 + need / L;
          const p: LngLat = [cs[k - 1][0] + (cs[k][0] - cs[k - 1][0]) * t, cs[k - 1][1] + (cs[k][1] - cs[k - 1][1]) * t];
          stops.push({ p, way: wi, pos: k - 1 + t });
          list.push(stops.length - 1);
          acc = 0;
          t0 = t;
        }
        since = acc + L * (1 - t0);
      }
      const isNode = (usage.get(w.nodes[k]) ?? 0) >= 2;
      if (isNode) {
        stops.push({ p: cs[k], way: wi, pos: k });
        list.push(stops.length - 1);
        since = 0;
      }
    }
    wayStops.push(list);
  });

  // greedy clustering (merges dual carriageways & complex junctions)
  const CL_R = 120;
  const clusters: { sum: [number, number]; n: number; c: LngLat }[] = [];
  const stopCluster = new Int32Array(stops.length);
  const bucket = new Map<string, number[]>();
  const bkey = (p: LngLat) => {
    const [x, y] = xy(p);
    return [Math.floor(x / CL_R), Math.floor(y / CL_R)];
  };
  stops.forEach((s, si) => {
    const [bx, by] = bkey(s.p);
    let best = -1;
    let bd = CL_R;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const ci of bucket.get(`${bx + dx},${by + dy}`) ?? []) {
          const d = dist(clusters[ci].c, s.p);
          if (d < bd) {
            bd = d;
            best = ci;
          }
        }
    if (best < 0) {
      best = clusters.length;
      clusters.push({ sum: [0, 0], n: 0, c: s.p });
      const k = `${bx},${by}`;
      bucket.set(k, [...(bucket.get(k) ?? []), best]);
    }
    const cl = clusters[best];
    cl.sum[0] += s.p[0];
    cl.sum[1] += s.p[1];
    cl.n++;
    cl.c = [cl.sum[0] / cl.n, cl.sum[1] / cl.n];
    stopCluster[si] = best;
  });

  // adjacency along ways, with geometry following the road
  const adjGeom = new Map<string, { a: number; b: number; geom: LngLat[]; len: number }>();
  majorWays.forEach((w, wi) => {
    const list = wayStops[wi];
    if (list.length < 2) return;
    const cs = w.nodes.map((n) => nodeCoord.get(n)!);
    for (let k = 1; k < list.length; k++) {
      const s1 = stops[list[k - 1]];
      const s2 = stops[list[k]];
      const a = stopCluster[list[k - 1]];
      const b = stopCluster[list[k]];
      if (a === b) continue;
      const geom: LngLat[] = [clusters[a].c];
      for (let v = Math.ceil(s1.pos + 1e-6); v < s2.pos; v++) geom.push(cs[v]);
      geom.push(clusters[b].c);
      const len = polyLen(geom);
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const prev = adjGeom.get(key);
      if (!prev || prev.len > len) adjGeom.set(key, { a, b, geom, len });
    }
  });
  const cAdj: { to: number; len: number; key: string }[][] = clusters.map(() => []);
  for (const [key, e] of adjGeom) {
    cAdj[e.a].push({ to: e.b, len: e.len, key });
    cAdj[e.b].push({ to: e.a, len: e.len, key });
  }
  const liveClusters = clusters.map((_, i) => i).filter((i) => cAdj[i].length > 0 && inBox(clusters[i].c, 0.0004));
  const cElev = clusters.map((c) => elevAt(c.c));
  // stitch components (drains continue under flyovers / across medians) — nearest pair within 550 m
  {
    const liveSet = new Set(liveClusters);
    for (let guard = 0; guard < 40; guard++) {
      const compOf = new Map<number, number>();
      let nc = 0;
      for (const s0 of liveClusters) {
        if (compOf.has(s0)) continue;
        const st = [s0];
        compOf.set(s0, nc);
        while (st.length) {
          const u = st.pop()!;
          for (const { to } of cAdj[u]) if (liveSet.has(to) && !compOf.has(to)) (compOf.set(to, nc), st.push(to));
        }
        nc++;
      }
      if (nc <= 1) break;
      const sizes = new Array(nc).fill(0);
      for (const c of compOf.values()) sizes[c]++;
      const main = sizes.indexOf(Math.max(...sizes));
      let best: [number, number, number] | null = null;
      for (const a of liveClusters) {
        if (compOf.get(a) === main) continue;
        for (const b of liveClusters) {
          if (compOf.get(b) !== main) continue;
          const d = dist(clusters[a].c, clusters[b].c);
          if (d < 550 && (!best || d < best[2])) best = [a, b, d];
        }
      }
      if (!best) break;
      const [a, b, d] = best;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      adjGeom.set(key, { a, b, geom: [clusters[a].c, clusters[b].c], len: d });
      cAdj[a].push({ to: b, len: d, key });
      cAdj[b].push({ to: a, len: d, key });
    }
  }

  // outfalls
  const outfallName = new Map<number, string>();
  for (const a of cfg.outfallAnchors) {
    let best = -1;
    let bd = Infinity;
    for (const i of liveClusters) {
      if (outfallName.has(i)) continue;
      const d = dist(clusters[i].c, a.coord);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) outfallName.set(best, a.name);
  }

  // flow tree: multi-source Dijkstra from outfalls; uphill flow heavily penalised
  const live = new Set(liveClusters);
  const downC = new Int32Array(clusters.length).fill(-1);
  const distC = new Float64Array(clusters.length).fill(Infinity);
  const runTree = () => {
    const pq: [number, number][] = [];
    for (const o of outfallName.keys()) {
      distC[o] = 0;
      pq.push([0, o]);
    }
    while (pq.length) {
      pq.sort((x, y) => x[0] - y[0]);
      const [d, b] = pq.shift()!;
      if (d > distC[b]) continue;
      for (const { to: a, len } of cAdj[b]) {
        if (!live.has(a)) continue;
        const uphill = Math.max(0, cElev[b] - cElev[a]); // water flows a → b
        const c = len * (1 + 5 * uphill);
        if (d + c < distC[a]) {
          distC[a] = d + c;
          downC[a] = b;
          pq.push([distC[a], a]);
        }
      }
    }
  };
  runTree();
  // disconnected components → local outfall at their lowest node
  for (let guard = 0; guard < 20; guard++) {
    const orphans = liveClusters.filter((i) => !isFinite(distC[i]));
    if (!orphans.length) break;
    const seen = new Set<number>();
    const stack = [orphans[0]];
    const compNodes: number[] = [];
    seen.add(orphans[0]);
    while (stack.length) {
      const u = stack.pop()!;
      compNodes.push(u);
      for (const { to } of cAdj[u]) if (live.has(to) && !seen.has(to)) (seen.add(to), stack.push(to));
    }
    if (compNodes.length < 3) {
      compNodes.forEach((i) => live.delete(i));
      continue;
    }
    const low = compNodes.reduce((m, i) => (cElev[i] < cElev[m] ? i : m), compNodes[0]);
    outfallName.set(low, "Trunk nala connection");
    runTree();
  }
  const drainC = liveClusters.filter((i) => live.has(i) && isFinite(distC[i]));

  /* --------------------------- heat grid --------------------------- */
  const HC = 96;
  const HR = 96;
  const cellArea = ((E - W) * KX * (N - S) * KY) / (HC * HR); // m²
  // bucket index of all road line segments for proximity/density
  const RB = 100;
  const segBucket = new Map<string, [LngLat, LngLat][]>();
  for (const cs of allWayCoords) {
    for (let i = 1; i < cs.length; i++) {
      const m: LngLat = [(cs[i - 1][0] + cs[i][0]) / 2, (cs[i - 1][1] + cs[i][1]) / 2];
      const [x, y] = xy(m);
      const k = `${Math.floor(x / RB)},${Math.floor(y / RB)}`;
      const arr = segBucket.get(k);
      if (arr) arr.push([cs[i - 1], cs[i]]);
      else segBucket.set(k, [[cs[i - 1], cs[i]]]);
    }
  }
  const nearRoad = (p: LngLat) => {
    const [x, y] = xy(p);
    const bx = Math.floor(x / RB);
    const by = Math.floor(y / RB);
    let best = 400;
    let dens = 0;
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (const [a, b] of segBucket.get(`${bx + dx},${by + dy}`) ?? []) {
          const d = segDist(p, a, b);
          if (d < best) best = d;
          if (d < 130) dens += dist(a, b);
        }
    return { d: best, dens };
  };

  // land cover
  const waterPolys: LngLat[][] = [];
  const waterLines: LngLat[][] = [];
  const greenPolys: LngLat[][] = [];
  for (const el of raw.cover.elements) {
    if (el.type !== "way" || !el.geometry) continue;
    const cs: LngLat[] = el.geometry.map((g: any) => [g.lon, g.lat]);
    const t = el.tags ?? {};
    const closed = cs.length > 3 && cs[0][0] === cs[cs.length - 1][0] && cs[0][1] === cs[cs.length - 1][1];
    if (t.waterway) waterLines.push(cs);
    else if (t.natural === "water" || t.natural === "wetland") closed && waterPolys.push(cs);
    else if (closed) greenPolys.push(cs);
  }
  const bboxOf = (cs: LngLat[]) => cs.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  const wb = waterPolys.map(bboxOf);
  const gb = greenPolys.map(bboxOf);
  const inAny = (p: LngLat, polys: LngLat[][], bbs: number[][]) =>
    polys.some((poly, i) => p[0] >= bbs[i][0] && p[0] <= bbs[i][2] && p[1] >= bbs[i][1] && p[1] <= bbs[i][3] && pip(p, poly));
  const riverLines = raw.cover.elements
    .filter((e: any) => e.type === "way" && e.tags?.waterway === "river" && e.geometry)
    .map((e: any) => e.geometry.map((g: any) => [g.lon, g.lat] as LngLat));

  const cells: { p: LngLat; elev: number; water: boolean; green: boolean; road: number; dens: number; node: number }[] = [];
  for (let r = 0; r < HR; r++)
    for (let c = 0; c < HC; c++) {
      const p: LngLat = [W + ((c + 0.5) / HC) * (E - W), N - ((r + 0.5) / HR) * (N - S)];
      const nr = nearRoad(p);
      const water =
        inAny(p, waterPolys, wb) || riverLines.some((l: LngLat[]) => polyDist(p, l) < 110);
      const green = !water && inAny(p, greenPolys, gb);
      let node = -1;
      let bd = Infinity;
      for (const i of drainC) {
        const d = dist(p, clusters[i].c);
        if (d < bd) {
          bd = d;
          node = i;
        }
      }
      cells.push({ p, elev: elevAt(p), water, green, road: nr.d, dens: nr.dens, node });
    }
  const maxDens = Math.max(...cells.map((c) => c.dens)) || 1;

  // population proxy
  const areaKm2 = ((E - W) * KX * (N - S) * KY) / 1e6;
  const popW = cells.map((c) => (c.water ? 0 : c.green ? 0.03 : Math.pow(c.dens / maxDens, 0.7) * (0.65 + 0.35 * rng())));
  const popTotal = cfg.density * areaKm2 * 0.82;
  const popSum = popW.reduce((a, b) => a + b, 0) || 1;
  const cellPop = popW.map((w) => Math.round((w / popSum) * popTotal));
  const cellImp = cells.map((c) =>
    c.water ? 0 : c.green ? 0.2 : clamp(IMPERV_BASE[cfg.id] + 0.16 * (c.dens / maxDens - 0.4) + (rng() - 0.5) * 0.06, 0.4, 0.96),
  );

  /* ----------------------- drain node attributes ----------------------- */
  const ci2n = new Map<number, number>();
  drainC.forEach((ci, k) => ci2n.set(ci, k));
  const catchCells: number[][] = drainC.map(() => []);
  cells.forEach((c, k) => {
    if (c.node >= 0 && !c.water) catchCells[ci2n.get(c.node)!].push(k);
  });
  // hop count to outfall for topological order
  const hops = new Map<number, number>();
  const hopOf = (ci: number): number => {
    if (hops.has(ci)) return hops.get(ci)!;
    const d = downC[ci];
    const h = d < 0 || outfallName.has(ci) ? 0 : 1 + hopOf(d);
    hops.set(ci, h);
    return h;
  };
  drainC.forEach((ci) => hopOf(ci));
  const orderIdx = [...drainC].sort((a, b) => hops.get(b)! - hops.get(a)!);

  const catchHa = drainC.map((_, k) => Math.max(0.8, (catchCells[k].length * cellArea) / 1e4));
  const upHa = [...catchHa];
  for (const ci of orderIdx) {
    const k = ci2n.get(ci)!;
    const d = downC[ci];
    if (d >= 0 && !outfallName.has(ci) && ci2n.has(d)) upHa[ci2n.get(d)!] += upHa[k];
  }

  const nodes: DrainNode[] = drainC.map((ci, k) => {
    const c = clusters[ci].c;
    const elev = cElev[ci];
    const lm = localMean(c, 650);
    const lowness = clamp(0.5 + (lm - elev) / 3, 0, 1);
    const imp = catchCells[k].length
      ? catchCells[k].reduce((s, i) => s + cellImp[i], 0) / catchCells[k].length
      : IMPERV_BASE[cfg.id];
    const up = upHa[k];
    const capFactor = (0.9 + rng() * 0.6) * (rng() < 0.14 ? 0.6 : 1);
    const capacity = Math.max(0.35, ((0.75 * cfg.designRainfall) / 3.6e6) * up * 1e4 * capFactor);
    const diam = clamp(Math.pow(capacity / 0.3, 3 / 8), 0.45, 4.5);
    const dn = downC[ci];
    const lenDown = dn >= 0 && !outfallName.has(ci) ? dist(c, clusters[dn].c) : 250;
    const silted = rng() < 0.12;
    return {
      id: "",
      coord: rc(c),
      sectorId: String(sectorOf(c)),
      kind: outfallName.has(ci) ? "outfall" : cAdj[ci].length >= 3 ? "junction" : "manhole",
      elev: r2(elev),
      maxDepth: r2(2.3 + 1.3 * Math.min(1, up / 400) + rng() * 0.4),
      storage: Math.round(lenDown * (Math.PI / 4) * diam * diam + 30),
      capacity: r2(capacity),
      catchmentHa: r2(catchHa[k]),
      upstreamHa: r2(up),
      impervious: r2(imp),
      blockage: r2(silted ? 0.18 + rng() * 0.14 : rng() * rng() * 0.14),
      downstream: dn >= 0 && !outfallName.has(ci) && ci2n.has(dn) ? String(ci2n.get(dn)) : null,
      upstream: [],
      roadIds: [],
      pondArea: Math.round(9000 * (0.35 + 1.7 * (1 - lowness))),
      order: 0,
      outfallName: outfallName.get(ci),
      ...({ _lowness: lowness, _diam: diam } as any),
    };
  });
  orderIdx.forEach((ci, rank) => (nodes[ci2n.get(ci)!].order = rank));
  nodes.forEach((n, k) => {
    if (n.downstream != null) nodes[Number(n.downstream)].upstream.push(String(k));
  });

  const pipes: DrainEdge[] = [];
  nodes.forEach((n, k) => {
    if (n.downstream == null) return;
    const ci = drainC[k];
    const di = downC[ci];
    const key = ci < di ? `${ci}-${di}` : `${di}-${ci}`;
    const g = adjGeom.get(key);
    let geom = g ? [...g.geom] : [clusters[ci].c, clusters[di].c];
    if (g && g.a !== ci) geom = geom.reverse();
    const to = nodes[Number(n.downstream)];
    const len = polyLen(geom);
    pipes.push({
      id: "",
      from: String(k),
      to: n.downstream,
      coords: geom.map(rc),
      lengthM: Math.round(len),
      diameterM: r2((n as any)._diam),
      capacity: n.capacity,
      slope: Math.round(((n.elev - to.elev) / Math.max(1, len)) * 10000) / 10000,
    });
  });

  /* ------------------------- road attributes ------------------------- */
  roads.forEach((r) => {
    const mid = r.coords[Math.floor(r.coords.length / 2)];
    r.sectorId = String(sectorOf(mid));
    let best = 0;
    let bd = Infinity;
    nodes.forEach((n, k) => {
      const d = dist(mid, n.coord);
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    r.nodeId = String(best);
    const elev = Math.min(...r.coords.map(elevAt));
    const rel = localMean(mid, 380) - elev;
    r.elev = r2(elev);
    r.relLow = r2(clamp(0.5 + rel / 2.5, 0, 1));
    r.susceptibility = r2(r._bridge ? 0.04 : r._tunnel ? 1.7 : (0.5 + 0.9 * r.relLow) * (r._link ? 0.7 : 1));
    if (r._tunnel) r.relLow = 1;
    if (r._bridge) r.relLow = 0;
    r.lengthM = Math.round(r.lengthM);
    r.coords = r.coords.map(rc);
    nodes[best].roadIds.push(String(roads.indexOf(r)));
  });

  // heat weights
  const heatNode = cells.map((c) => (c.node >= 0 && ci2n.has(c.node) ? ci2n.get(c.node)! : -1));
  const heatWeight = cells.map((c, k) => {
    const ni = heatNode[k];
    if (c.water || ni < 0) return 0;
    const prox = Math.exp(-c.road / 65);
    const rel = clamp(0.6 + (nodes[ni].elev - c.elev) / 2.2, 0.15, 1.45);
    return r2(prox * rel * (c.green ? 0.75 : 1));
  });

  /* ------------------------------ hero ------------------------------ */
  let heroRoad = -1;
  let hd = Infinity;
  roads.forEach((r, i) => {
    if (!cfg.heroRoadMatch.test(r.name) || r._bridge || r._link || !r.major || r.lengthM < 150) return;
    const n = nodes[Number(r.nodeId)];
    if (n.downstream == null) return;
    const d = dist(r.coords[Math.floor(r.coords.length / 2)], cfg.heroAnchor);
    if (d < hd) {
      hd = d;
      heroRoad = i;
    }
  });
  if (heroRoad < 0) throw new Error(`${cfg.id}: hero road not found`);
  const heroNodeK = Number(roads[heroRoad].nodeId);
  const heroNode = nodes[heroNodeK];
  heroNode.blockage = 0.3;
  heroNode.capacity = r2(heroNode.capacity * 0.72);
  roads[heroRoad].susceptibility = Math.max(roads[heroRoad].susceptibility, 1.2);
  const heroMid = roads[heroRoad].coords[Math.floor(roads[heroRoad].coords.length / 2)];

  // storm track: core ~3.4 km upwind of the hotspot at NOW, directly overhead ~11:00
  const brg = (STORM_FROM[cfg.id] * Math.PI) / 180;
  const off = 3400;
  const origin = ll([xy(heroMid)[0] + Math.sin(brg) * off, xy(heroMid)[1] + Math.cos(brg) * off]);
  const vel: LngLat = [(heroMid[0] - origin[0]) / 60, (heroMid[1] - origin[1]) / 60];

  // sector numbering: hotspot = 4, storm-arrival = 7
  const heroSec = sectorOf(heroMid);
  let stormSec = sectorOf(origin);
  if (stormSec === heroSec) stormSec = sectorOf([origin[0] - vel[0] * 30, origin[1] - vel[1] * 30]);
  if (stormSec === heroSec) {
    const o = xy(origin);
    stormSec = seeds
      .map((s, i) => ({ i, d: Math.hypot(s[0] - o[0], s[1] - o[1]) }))
      .filter((x) => x.i !== heroSec)
      .sort((a, b) => a.d - b.d)[0].i;
  }
  const secNumber = new Map<number, number>();
  secNumber.set(heroSec, 4);
  secNumber.set(stormSec, 7);
  const free = [1, 2, 3, 5, 6, 8, 9];
  seeds
    .map((s, i) => ({ i, s }))
    .filter(({ i }) => !secNumber.has(i))
    .sort((a, b) => b.s[1] - a.s[1] || a.s[0] - b.s[0])
    .forEach(({ i }, k) => secNumber.set(i, free[k]));

  const places = raw.places.elements
    .filter((e: any) => e.tags?.name)
    .map((e: any) => ({ name: e.tags.name as string, p: [e.lon, e.lat] as LngLat }));
  const usedPlace = new Set<string>();
  const sectors: Sector[] = seeds.map((_, i) => {
    const poly = secPolys[i];
    const cen = ll(seeds[i]);
    const inside = places.filter((pl: any) => pip(pl.p, poly) && !usedPlace.has(pl.name));
    let locality = inside.sort((a: any, b: any) => dist(a.p, cen) - dist(b.p, cen))[0]?.name;
    if (!locality) {
      const counts = new Map<string, number>();
      roads.forEach((r) => {
        if (Number(r.sectorId) === i && r.major && !r.name.startsWith("Unnamed")) counts.set(r.name, (counts.get(r.name) ?? 0) + r.lengthM);
      });
      locality = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Central";
      locality = `${locality} area`;
    }
    usedPlace.add(locality);
    const cellIdx = cells.map((c, k) => (pip(c.p, poly) ? k : -1)).filter((k) => k >= 0);
    const pop = cellIdx.reduce((s, k) => s + cellPop[k], 0);
    const land = cellIdx.filter((k) => !cells[k].water);
    const imp = land.length ? land.reduce((s, k) => s + cellImp[k], 0) / land.length : 0.7;
    const elev = land.length ? land.reduce((s, k) => s + cells[k].elev, 0) / land.length : 0;
    return {
      id: `SEC-${secNumber.get(i)}`,
      number: secNumber.get(i)!,
      name: `Sector ${secNumber.get(i)}`,
      locality,
      polygon: poly,
      centroid: rc(cen),
      areaKm2: r2((cellIdx.length * cellArea) / 1e6),
      population: Math.round(pop / 10) * 10,
      impervious: r2(imp),
      meanElev: r2(elev),
    };
  });
  const secId = (i: string | number) => `SEC-${secNumber.get(Number(i))}`;
  roads.forEach((r) => (r.sectorId = secId(r.sectorId)));
  nodes.forEach((n) => (n.sectorId = secId(n.sectorId)));

  /* ------------------------------ POIs ------------------------------ */
  const nearestNodeK = (p: LngLat) => nodes.reduce((b, n, k) => (dist(p, n.coord) < dist(p, nodes[b].coord) ? k : b), 0);
  const graphLive = gNodes.map((_, i) => comp[i] === bestComp);
  const nearestGraph = (p: LngLat) => {
    let best = -1;
    let bd = Infinity;
    gNodes.forEach((g, i) => {
      if (!graphLive[i]) return;
      const d = dist(p, g);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const access = (p: LngLat) =>
    roads
      .map((r, i) => ({ i, d: polyDist(p, r.coords) }))
      .filter((x) => x.d < 160 && !roads[x.i]._bridge)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => String(x.i));

  const fac = raw.facilities.elements.map((e: any) => ({
    tags: e.tags ?? {},
    p: (e.type === "node" ? [e.lon, e.lat] : [e.center?.lon, e.center?.lat]) as LngLat,
    area: e.type !== "node",
  }));
  const spaced = <T extends { p: LngLat }>(list: T[], minD: number, max: number) => {
    const out: T[] = [];
    for (const x of list) {
      if (out.length >= max) break;
      if (out.every((o) => dist(o.p, x.p) >= minD)) out.push(x);
    }
    return out;
  };
  const inside = (p: LngLat) => p[0] != null && inBox(p, 0.0015);

  const hospitals = spaced(
    fac
      .filter((f: any) => (f.tags.amenity === "hospital" || f.tags.healthcare === "hospital") && f.tags.name && inside(f.p))
      .filter((f: any) => !/clinic|dental|eye|skin|homeo|diagnos|physio|ayur|pharma|path|scan|x ray/i.test(f.tags.name))
      .map((f: any) => ({
        ...f,
        score: (f.area ? 2 : 0) + (f.tags.beds ? 2 : 0) + (/hospital|medical college|institute|chikitsalaya/i.test(f.tags.name) ? 1.5 : 0) + rng() * 0.5,
      }))
      .sort((a: any, b: any) => b.score - a.score),
    320,
    7,
  );
  let fires: any[] = spaced(fac.filter((f: any) => f.tags.amenity === "fire_station" && inside(f.p)), 300, 3);
  if (!fires.length) {
    // no fire station inside the pilot area → staging post at a well-drained junction (labelled as demo)
    const hi = [...nodes].sort((a, b) => b.elev - a.elev)[Math.floor(nodes.length * 0.1)];
    fires = [{ tags: { name: "Fire staging post (demo)" }, p: hi.coord, area: false }];
  }
  const police = spaced(
    fac
      .filter((f: any) => f.tags.amenity === "police" && f.tags.name && inside(f.p))
      .filter((f: any) => /police station|thana|\bPS\b|chowk/i.test(f.tags.name))
      .sort(() => rng() - 0.5),
    350,
    4,
  );
  const shelterCands = fac
    .filter((f: any) => ["school", "college", "community_centre"].includes(f.tags.amenity) && f.tags.name && inside(f.p))
    .map((f: any) => ({ ...f, elev: elevAt(f.p), score: elevAt(f.p) - localMean(f.p, 700) + (f.area ? 0.6 : 0) + rng() * 0.3 }))
    .sort((a: any, b: any) => b.score - a.score);
  const shelters = spaced(shelterCands, 380, 13);

  const pois: Poi[] = [];
  const mkPoi = (kind: Poi["kind"], f: any, id: string, extra: Partial<Poi> = {}) => {
    const fallback = `${{ hospital: "Hospital", fire: "Fire Station", police: "Police Station", shelter: "Relief Shelter" }[kind]} · ${sectors.find((x) => x.id === secId(sectorOf(f.p)))?.locality ?? ""}`;
    const name = ((f.tags.name as string | undefined) ?? fallback).split(";")[0].trim();
    pois.push({
      id,
      kind,
      name,
      coord: rc(f.p),
      sectorId: secId(sectorOf(f.p)),
      elev: r2(elevAt(f.p)),
      nodeId: String(nearestNodeK(f.p)),
      graphNode: nearestGraph(f.p),
      accessRoadIds: access(f.p),
      ...extra,
    });
  };
  hospitals.forEach((f: any, i) => mkPoi("hospital", f, `H-${String(i + 1).padStart(2, "0")}`, { beds: Number(f.tags.beds) || Math.round(80 + rng() * 420) }));
  fires.forEach((f: any, i) => mkPoi("fire", f, `FS-${String(i + 1).padStart(2, "0")}`));
  police.forEach((f: any, i) => mkPoi("police", f, `PS-${String(i + 1).padStart(2, "0")}`));
  const sStart = Math.max(1, 13 - shelters.length);
  shelters.forEach((f: any, i) =>
    mkPoi("shelter", f, `S-${String(sStart + i).padStart(2, "0")}`, {
      capacity: f.tags.amenity === "college" ? 900 + Math.round(rng() * 600) : f.tags.amenity === "school" ? 350 + Math.round(rng() * 450) : 200 + Math.round(rng() * 200),
    }),
  );
  // S-12 = best high-ground shelter for the hotspot sector
  const heroSector = sectors.find((s) => s.number === 4)!;
  const shelterList = pois.filter((p) => p.kind === "shelter");
  const bestShelter = shelterList
    .filter((p) => p.sectorId !== heroSector.id)
    .sort((a, b) => dist(a.coord, heroSector.centroid) - dist(b.coord, heroSector.centroid) - (a.elev - b.elev) * 120)[0] ?? shelterList[0];
  const s12 = shelterList.find((p) => p.id === "S-12");
  if (bestShelter && s12 && bestShelter !== s12) {
    s12.id = bestShelter.id;
    bestShelter.id = "S-12";
  }
  pois.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  /* ---------------------------- junctions ---------------------------- */
  const gEdgesLive = rawEdges.map((e, i) => ({ e, i })).filter(({ e }) => comp[e.a] === bestComp);
  const incident = new Map<number, Set<number>>();
  gEdgesLive.forEach(({ e, i }) => {
    const ri = edgeRoad[i];
    if (ri < 0) return;
    for (const v of [e.a, e.b]) {
      if (!incident.has(v)) incident.set(v, new Set());
      incident.get(v)!.add(ri);
    }
  });
  const jCands: { p: LngLat; roads: number[]; names: string[] }[] = [];
  for (const [v, set] of incident) {
    const rs = [...set].filter((ri) => roads[ri].major && !roads[ri]._bridge && !roads[ri].name.startsWith("Unnamed"));
    const names = [...new Set(rs.map((ri) => roads[ri].name))];
    if (names.length >= 2 && inBox(gNodes[v], 0.001)) jCands.push({ p: gNodes[v], roads: [...set], names });
  }
  const junctionsRaw = spaced(jCands.sort((a, b) => b.names.length - a.names.length), 140, 60);

  /* ------------------------------ IDs ------------------------------ */
  const nodeOrder = nodes
    .map((n, k) => ({ n, k }))
    .sort((a, b) => Number(a.n.sectorId.slice(4)) - Number(b.n.sectorId.slice(4)) || b.n.coord[1] - a.n.coord[1]);
  const nodeId = new Map<number, string>();
  nodeOrder.forEach(({ k }, i) => nodeId.set(k, `DN-${101 + i}`));
  const swapNodeId = (k: number, want: string) => {
    const holder = [...nodeId.entries()].find(([, v]) => v === want)?.[0];
    const mine = nodeId.get(k)!;
    if (holder != null) nodeId.set(holder, mine);
    nodeId.set(k, want);
  };
  swapNodeId(heroNodeK, "DN-184");
  const heroDownK = Number(heroNode.downstream);
  swapNodeId(heroDownK, "DN-191");

  const roadOrder = roads
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(a.r.sectorId.slice(4)) - Number(b.r.sectorId.slice(4)) || b.r.coords[0][1] - a.r.coords[0][1]);
  const roadId = new Map<number, string>();
  roadOrder.forEach(({ i }, k) => roadId.set(i, `R-${101 + k}`));
  const swapRoadId = (i: number, want: string) => {
    const holder = [...roadId.entries()].find(([, v]) => v === want)?.[0];
    const mine = roadId.get(i)!;
    if (holder != null) roadId.set(holder, mine);
    roadId.set(i, want);
  };
  swapRoadId(heroRoad, "R-214");

  // finalise references
  const finalNodes: DrainNode[] = nodes.map((n, k) => {
    const { _lowness, _diam, ...rest } = n as any;
    void _lowness;
    void _diam;
    return {
      ...rest,
      id: nodeId.get(k)!,
      downstream: n.downstream != null ? nodeId.get(Number(n.downstream))! : null,
      upstream: n.upstream.map((u) => nodeId.get(Number(u))!),
      roadIds: n.roadIds.map((r) => roadId.get(Number(r))!),
    };
  });
  const finalPipes = pipes.map((p, i) => ({
    ...p,
    id: `P-${String(i + 101)}`,
    from: nodeId.get(Number(p.from))!,
    to: nodeId.get(Number(p.to))!,
  }));
  const finalRoads: RoadSegment[] = roads.map((r, i) => {
    const { _bridge, _tunnel, _link, _way, ...rest } = r as any;
    void _way;
    const sec = sectors.find((s) => s.id === r.sectorId)!;
    return {
      ...rest,
      id: roadId.get(i)!,
      nodeId: nodeId.get(Number(r.nodeId))!,
      label: `${r.name} / ${sec.name}`,
      ...(_bridge ? { structure: "flyover" } : _tunnel ? { structure: "underpass" } : _link ? { structure: "slip road" } : {}),
    } as RoadSegment;
  });
  pois.forEach((p) => {
    p.nodeId = nodeId.get(Number(p.nodeId))!;
    p.accessRoadIds = p.accessRoadIds.map((r) => roadId.get(Number(r))!);
  });

  // compact routing graph (largest component only)
  const keepNode = new Int32Array(gNodes.length).fill(-1);
  const fNodes: LngLat[] = [];
  gNodes.forEach((g, i) => {
    if (comp[i] === bestComp) {
      keepNode[i] = fNodes.length;
      fNodes.push(rc(g));
    }
  });
  const fEdges: [number, number, number, number][] = [];
  const fGeoms: LngLat[][] = [];
  rawEdges.forEach((e, i) => {
    if (comp[e.a] !== bestComp || edgeRoad[i] < 0) return;
    fEdges.push([keepNode[e.a], keepNode[e.b], Math.round(e.len), edgeRoad[i]]);
    fGeoms.push(e.geom.map(rc));
  });
  pois.forEach((p) => (p.graphNode = keepNode[p.graphNode]));

  const junctions: Junction[] = junctionsRaw.map((j, i) => ({
    id: `J-${String(i + 1).padStart(2, "0")}`,
    name: j.names.slice(0, 2).join(" × "),
    coord: rc(j.p),
    roadIds: j.roads.map((r) => roadId.get(r)!),
    sectorId: secId(sectorOf(j.p)),
  }));

  const gaugeSpots: LngLat[] = [
    [W + 0.25 * (E - W), N - 0.25 * (N - S)],
    [W + 0.75 * (E - W), N - 0.25 * (N - S)],
    [W + 0.5 * (E - W), N - 0.5 * (N - S)],
    [W + 0.25 * (E - W), N - 0.75 * (N - S)],
    [W + 0.75 * (E - W), N - 0.75 * (N - S)],
  ];
  const gauges = gaugeSpots.map((p, i) => ({
    id: `AWS-${cfg.id.slice(0, 3).toUpperCase()}-0${i + 1}`,
    name: `${sectors.find((s) => s.id === secId(sectorOf(p)))!.locality} gauge`,
    coord: rc(p),
  }));

  const ds: CityDataset = {
    id: cfg.id,
    name: cfg.name,
    state: cfg.state,
    pilotArea: cfg.pilotArea,
    bbox: cfg.bbox,
    center: [lon0, lat0],
    zoom: cfg.zoom,
    fetchedAt: raw.fetchedAt,
    attribution: raw.attribution,
    backwater: { ...cfg.backwater, defaultOn: cfg.backwater.kind === "tidal" && cfg.id === "mumbai" },
    designRainfall: cfg.designRainfall,
    sectors: sectors.sort((a, b) => a.number - b.number),
    roads: finalRoads,
    drainNodes: finalNodes,
    drainEdges: finalPipes,
    pois,
    vehicles: [],
    junctions,
    graph: { nodes: fNodes, edges: fEdges, geoms: fGeoms },
    dem: { cols: dcols, rows: drows, bbox: cfg.bbox, values: dem.map(r2), min: r2(Math.min(...dem)), max: r2(Math.max(...dem)) },
    heat: { cols: HC, rows: HR, bbox: cfg.bbox, node: heatNode, weight: heatWeight, pop: cellPop },
    rainGrid: { cols: 20, rows: 20, bbox: cfg.bbox },
    gauges,
    incidents: [],
    water: {
      lines: waterLines.map((l) => l.map(rc)),
      polygons: waterPolys.map((p) => p.map(rc)),
    },
    green: greenPolys.filter((p) => p.length >= 4).map((p) => p.map(rc)),
    storm: { origin: rc(origin), t0: NOW_CLOCK, velocity: [vel[0], vel[1]], sigmaKm: 1.7, contrast: 0.58 },
    hero: {
      roadId: "R-214",
      nodeId: "DN-184",
      downstreamNodeId: "DN-191",
      unsafeRoadId: "",
      sectorId: "SEC-4",
      residentsSectorId: "SEC-7",
      shelterId: "S-12",
      hospitalId: "",
      incidentId: "",
    },
    stats: {
      roadKm: Math.round(finalRoads.reduce((s, r) => s + r.lengthM, 0) / 100) / 10,
      drainKm: Math.round(finalPipes.reduce((s, p) => s + p.lengthM, 0) / 100) / 10,
      population: sectors.reduce((s, x) => s + x.population, 0),
      areaKm2: r2(areaKm2),
    },
  };

  /* --------------------------- calibration --------------------------- */
  const base = { ...BASELINE_PARAMS[cfg.id], backwater: ds.backwater.defaultOn };
  const pond0 = ds.drainNodes.map((n) => n.pondArea);
  const cap0 = ds.drainNodes.map((n) => n.capacity);
  const heroIdx = ds.drainNodes.findIndex((n) => n.id === "DN-184");
  const heroRi = ds.roads.findIndex((r) => r.id === "R-214");
  const majors = ds.roads.map((r, i) => ({ r, i })).filter((x) => x.r.major);

  const metrics = () => {
    const res = simulate(ds, base);
    const countAt = (clock: number, th: number) =>
      majors.filter(({ i }) => sample(res.roads.depth[i], res, clock) >= th).length / majors.length;
    let peak = 0;
    let peakC = NOW_CLOCK;
    for (let c = NOW_CLOCK; c <= NOW_CLOCK + 180; c += 5) {
      const v = countAt(c, UNSAFE_DEPTH);
      if (v > peak) {
        peak = v;
        peakC = c;
      }
    }
    return {
      res,
      now: countAt(NOW_CLOCK, UNSAFE_DEPTH),
      peak,
      peakC,
      high: countAt(peakC, 0.5),
      end: countAt(NOW_CLOCK + 180, UNSAFE_DEPTH),
    };
  };
  const apply = (kCap: number, kPond: number) => {
    ds.drainNodes.forEach((n, i) => {
      n.capacity = r2(cap0[i] * kCap);
      n.pondArea = Math.round(pond0[i] * kPond);
    });
  };
  let best = { score: Infinity, kCap: 1, kPond: 1 };
  for (const kCap of [1.0, 1.25, 1.5, 1.8, 2.2, 2.6, 3.0, 3.6])
    for (const kPond of [0.6, 1.0, 1.6, 2.4, 3.4, 4.5]) {
      apply(kCap, kPond);
      const m = metrics();
      const score =
        (m.peak - 0.075) ** 2 * 400 +
        (m.high - 0.03) ** 2 * 600 +
        Math.max(0, m.now - 0.012) * 80 +
        Math.max(0, m.end / Math.max(0.001, m.peak) - 0.45) * 2 +
        Math.abs(m.peakC - 700) / 300;
      if (score < best.score) best = { score, kCap, kPond };
    }
  apply(best.kCap, best.kPond);
  // hotspot: street goes unsafe (0.3 m) ~36 min after NOW and peaks at ≈ 1.12 m.
  // Alternate capacity (timing) and ponding-area (depth) searches.
  {
    const cap0h = ds.drainNodes[heroIdx].capacity;
    const pond0h = ds.drainNodes[heroIdx].pondArea;
    let capMul = 1;
    let pondMul = 1;
    for (let round = 0; round < 3; round++) {
      let lo = 0.2;
      let hi = 5;
      for (let it = 0; it < 22; it++) {
        const mid = Math.sqrt(lo * hi);
        ds.drainNodes[heroIdx].capacity = r2(cap0h * mid);
        const res = simulate(ds, base);
        const on = onsetClock(res.roads.depth[heroRi], res, NOW_CLOCK - 60, UNSAFE_DEPTH, NOW_CLOCK + 180);
        if (on == null || on > NOW_CLOCK + 36) hi = mid;
        else lo = mid;
      }
      capMul = hi;
      ds.drainNodes[heroIdx].capacity = r2(cap0h * capMul);
      lo = 0.01;
      hi = 8;
      for (let it = 0; it < 30; it++) {
        const mid = Math.sqrt(lo * hi);
        ds.drainNodes[heroIdx].pondArea = Math.round(pond0h * mid);
        const res = simulate(ds, base);
        const pk = maxOver(res.roads.depth[heroRi], res, NOW_CLOCK, NOW_CLOCK + 180).max;
        if (pk > 1.12) lo = mid;
        else hi = mid;
      }
      pondMul = hi;
      ds.drainNodes[heroIdx].pondArea = Math.round(pond0h * pondMul);
    }
  }
  const fin = metrics();
  const res = fin.res;
  const heroOn = onsetClock(res.roads.depth[heroRi], res, NOW_CLOCK, UNSAFE_DEPTH);
  const heroNodeOn = onsetClock(res.nodes.util[heroIdx], res, NOW_CLOCK, 0.9);

  // R-229: a road going unsafe ~50 min out, near the hotspot's downstream
  const downK = ds.drainNodes.findIndex((n) => n.id === "DN-191");
  const cand = majors
    .filter(({ r }) => r.id !== "R-214" && !r.name.startsWith("Unnamed") && !(r as any).structure && !/flyover|bridge|tunnel|slip/i.test(r.name))
    .map(({ r, i }) => ({ r, i, on: onsetClock(res.roads.depth[i], res, NOW_CLOCK, UNSAFE_DEPTH) }))
    .filter((x) => x.on != null && x.on - NOW_CLOCK >= 35 && x.on - NOW_CLOCK <= 75)
    .map((x) => ({
      ...x,
      score:
        Math.abs(x.on! - NOW_CLOCK - 51) +
        (x.r.nodeId === ds.drainNodes[downK].id ? -25 : 0) +
        (x.r.sectorId === "SEC-4" ? -10 : 0) +
        (x.r.name === ds.roads[heroRi].name ? 12 : 0) +
        dist(x.r.coords[0], ds.drainNodes[heroIdx].coord) / 200,
    }))
    .sort((a, b) => a.score - b.score);
  if (cand.length) {
    const target = cand[0].r;
    const holder = ds.roads.find((r) => r.id === "R-229");
    if (holder && holder !== target) holder.id = target.id;
    target.id = "R-229";
    ds.hero.unsafeRoadId = "R-229";
    // keep references consistent after swap
    const fix = (id: string) => (id === "R-229" ? (holder && holder !== target ? holder.id : id) : id);
    void fix;
  }
  // rebuild string references that point at roads (ids were swapped in place)
  const idAt = ds.roads.map((r) => r.id);
  const oldIdAt = roads.map((_, i) => roadId.get(i)!);
  const remap = new Map(oldIdAt.map((o, i) => [o, idAt[i]]));
  ds.drainNodes.forEach((n) => (n.roadIds = n.roadIds.map((r) => remap.get(r) ?? r)));
  ds.pois.forEach((p) => (p.accessRoadIds = p.accessRoadIds.map((r) => remap.get(r) ?? r)));
  ds.junctions.forEach((j) => (j.roadIds = j.roadIds.map((r) => remap.get(r) ?? r)));

  /* ----------------------- demo incident + vehicles ----------------------- */
  const hosp = ds.pois.filter((p) => p.kind === "hospital" && p.graphNode >= 0);
  const clockR = NOW_CLOCK + 40;
  const heroMidLL = ds.roads[heroRi].coords[Math.floor(ds.roads[heroRi].coords.length / 2)];
  let bestInc: { h: Poi; node: number; score: number } | null = null;
  const candNodes = ds.graph.nodes
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => dist(p, heroMidLL) > 350 && dist(p, heroMidLL) < 1600)
    .filter((_, k) => k % 2 === 0);
  for (const h of hosp) {
    for (const { p, i } of candNodes) {
      const opts = planRoutes(ds, res, { vehicle: "ambulance", originNode: h.graphNode, destNode: i, clock: clockR });
      const A = opts.find((o) => o.id === "A");
      const B = opts.find((o) => o.id === "B");
      if (!A || !B || B.passable || !B.roadIds.includes("R-214")) continue;
      const ratio = A.distanceKm / Math.max(0.1, B.distanceKm);
      if (ratio > 1.8 || B.distanceKm < 1.6) continue;
      const score = Math.abs(B.distanceKm - 3.4) + Math.abs(ratio - 1.2) * 3 + dist(p, heroMidLL) / 2000;
      if (!bestInc || score < bestInc.score) bestInc = { h, node: i, score };
    }
  }
  if (!bestInc) {
    // fallback: any route that crosses a flooded road
    for (const h of hosp)
      for (const { i } of candNodes) {
        const opts = planRoutes(ds, res, { vehicle: "ambulance", originNode: h.graphNode, destNode: i, clock: clockR });
        const B = opts.find((o) => o.id === "B");
        if (B && !B.passable && (!bestInc || B.distanceKm > 1.5)) bestInc = { h, node: i, score: 0 };
      }
  }
  const nearestRoadName = (p: LngLat) =>
    ds.roads
      .filter((r) => !r.name.startsWith("Unnamed") && r.name !== "Slip road")
      .map((r) => ({ r, d: polyDist(p, r.coords) }))
      .sort((a, b) => a.d - b.d)[0]?.r.name ?? "arterial road";
  const incidents: Incident[] = [];
  if (bestInc) {
    const p = ds.graph.nodes[bestInc.node];
    incidents.push({
      id: "INC-2041",
      name: `Medical emergency — ${nearestRoadName(p)}`,
      coord: p,
      graphNode: bestInc.node,
      sectorId: secId(sectorOf(p)),
      description: "Cardiac patient, 67 y — ambulance requested (demo incident)",
    });
    ds.hero.hospitalId = bestInc.h.id;
    ds.hero.incidentId = "INC-2041";
  }
  // two more demo incidents on/near flooded roads
  const floodedPeak = majors
    .map(({ r, i }) => ({ r, max: maxOver(res.roads.depth[i], res, NOW_CLOCK, NOW_CLOCK + 180).max }))
    .filter((x) => x.max > 0.5 && x.r.id !== "R-214")
    .sort((a, b) => b.max - a.max);
  const incTemplates = [
    { name: "Vehicle stalled in water", desc: "Car with 3 occupants stalled — fire tender requested (demo incident)" },
    { name: "Tree fall blocking lane", desc: "Tree fall due to waterlogged soil — police traffic control (demo incident)" },
  ];
  floodedPeak.slice(0, 6).filter((_, k) => k % 3 === 0).slice(0, 2).forEach((x, k) => {
    const p = x.r.coords[Math.floor(x.r.coords.length / 2)];
    const gn = (() => {
      let b = 0;
      let bd = Infinity;
      ds.graph.nodes.forEach((g, i) => {
        const d = dist(g, p);
        if (d < bd) {
          bd = d;
          b = i;
        }
      });
      return b;
    })();
    incidents.push({
      id: `INC-${2042 + k}`,
      name: `${incTemplates[k].name} — ${x.r.name}`,
      coord: ds.graph.nodes[gn],
      graphNode: gn,
      sectorId: x.r.sectorId,
      description: incTemplates[k].desc,
    });
  });
  ds.incidents = incidents;

  const vehicles: Vehicle[] = [];
  const hs = ds.pois.filter((p) => p.kind === "hospital");
  const heroH = hs.find((h) => h.id === ds.hero.hospitalId) ?? hs[0];
  [heroH, ...hs.filter((h) => h !== heroH)].slice(0, 3).forEach((h, i) =>
    vehicles.push({ id: `AMB-0${i + 1}`, kind: "ambulance", name: `Ambulance 0${i + 1}`, baseId: h.id, coord: h.coord, graphNode: h.graphNode, status: "available" }),
  );
  ds.pois.filter((p) => p.kind === "fire").slice(0, 2).forEach((f, i) =>
    vehicles.push({ id: `FT-0${i + 1}`, kind: "fire", name: `Fire Tender 0${i + 1}`, baseId: f.id, coord: f.coord, graphNode: f.graphNode, status: "available" }),
  );
  ds.pois.filter((p) => p.kind === "police").slice(0, 2).forEach((f, i) =>
    vehicles.push({ id: `PCR-0${i + 1}`, kind: "police", name: `PCR Van 0${i + 1}`, baseId: f.id, coord: f.coord, graphNode: f.graphNode, status: "available" }),
  );
  ds.vehicles = vehicles;

  const sum = summarize(ds, res);
  console.log(
    `${cfg.name}: roads ${ds.roads.length} (major ${majors.length}), drain nodes ${ds.drainNodes.length}, pipes ${ds.drainEdges.length}, ` +
      `graph ${ds.graph.nodes.length}/${ds.graph.edges.length}, sectors ${ds.sectors.length}, POIs ${ds.pois.length}, junctions ${ds.junctions.length}\n` +
      `  calib kCap=${best.kCap} kPond=${best.kPond} | unsafe@now ${(fin.now * 100).toFixed(1)}% peak ${(fin.peak * 100).toFixed(1)}% @${fin.peakC} high ${(fin.high * 100).toFixed(1)}% end ${(fin.end * 100).toFixed(1)}%\n` +
      `  hero ${ds.roads[heroRi].label} onset(0.3) +${heroOn != null ? heroOn - NOW_CLOCK : "-"} min, DN-184 90% at +${heroNodeOn != null ? heroNodeOn - NOW_CLOCK : "-"} min, R-229 ${ds.roads.find((r) => r.id === "R-229")?.label}\n` +
      `  summary maxDepth ${sum.maxDepth.toFixed(2)} roadsAtRisk ${sum.roadsAtRisk} crit.int ${sum.criticalIntersections} firstImpact ${sum.firstImpactMin} peak ${sum.peakClock} pop ${sum.affectedPopulation} hosp ${sum.hospitalsAtRisk}\n` +
      `  incident ${incidents[0]?.name ?? "NONE"} from ${ds.hero.hospitalId}; shelters ${ds.pois.filter((p) => p.kind === "shelter").length}, hospitals ${hs.length}, fire ${ds.pois.filter((p) => p.kind === "fire").length}, police ${ds.pois.filter((p) => p.kind === "police").length}`,
  );
  return ds;
}

const only = process.argv[2];
const outDir = join(process.cwd(), "src", "data", "cities");
mkdirSync(outDir, { recursive: true });
for (const cfg of CITIES) {
  if (only && cfg.id !== only) continue;
  const ds = buildCity(cfg);
  const json = JSON.stringify(ds);
  writeFileSync(join(outDir, `${cfg.id}.json`), json);
  console.log(`  → ${cfg.id}.json ${(json.length / 1024).toFixed(0)} KB`);
}
