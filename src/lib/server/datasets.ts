import type { CityDataset, CityId, ScenarioParams, SimResult } from "../types";
import delhi from "@/data/cities/delhi.json";
import mumbai from "@/data/cities/mumbai.json";
import chennai from "@/data/cities/chennai.json";
import { simulate } from "../engine/simulate";
import { scenarioFromQuery, scenarioKey } from "../scenarioQuery";

const DATASETS: Record<CityId, CityDataset> = {
  delhi: delhi as unknown as CityDataset,
  mumbai: mumbai as unknown as CityDataset,
  chennai: chennai as unknown as CityDataset,
};

export const CITY_IDS: CityId[] = ["delhi", "mumbai", "chennai"];

export function isCityId(v: string | null): v is CityId {
  return v === "delhi" || v === "mumbai" || v === "chennai";
}

export function getDataset(city: CityId): CityDataset {
  return DATASETS[city];
}

/** Resolve city + scenario from a request URL. */
export function resolve(url: string) {
  const q = new URL(url).searchParams;
  const c = q.get("city");
  const city: CityId = isCityId(c) ? c : "delhi";
  const ds = getDataset(city);
  const params = scenarioFromQuery(city, q, ds.backwater.defaultOn);
  return { q, city, ds, params };
}

/* small LRU cache of simulation runs */
const cache = new Map<string, SimResult>();
export function runCached(ds: CityDataset, params: ScenarioParams): SimResult {
  const key = scenarioKey(ds.id, params);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const res = simulate(ds, params);
  cache.set(key, res);
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  return res;
}

/** Round result arrays to 2 decimals to keep payloads small. */
export function compactResult(res: SimResult): SimResult {
  const q = (a: number[]) => a.map((v) => Math.round(v * 100) / 100);
  return {
    ...res,
    rainMean: q(res.rainMean),
    nodes: {
      level: res.nodes.level.map(q),
      util: res.nodes.util.map(q),
      flow: res.nodes.flow.map(q),
      pond: res.nodes.pond.map(q),
    },
    roads: { depth: res.roads.depth.map(q) },
  };
}

export function json(data: unknown, init: { status?: number; latencyHint?: number } = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-data-mode": "SIMULATED",
    },
  });
}
