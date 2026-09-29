import type { CityId, ScenarioParams } from "./types";
import { BASELINE_PARAMS } from "./engine/constants";

/** Compact, URL-safe encoding of scenario parameters (shared by client and API). */
export function scenarioToQuery(p: ScenarioParams | null | undefined): Record<string, string> {
  if (!p) return {};
  return {
    mode: p.mode,
    ri: String(p.rainfallIntensity),
    dur: String(p.stormDuration),
    rs: String(p.rainfallScale),
    cap: String(p.drainageCapacity),
    blk: String(p.blockage),
    lvl: String(p.initialWaterLevel),
    bw: p.backwater ? "1" : "0",
    imp: p.impervious == null ? "" : String(p.impervious),
  };
}

export function scenarioFromQuery(city: CityId, q: URLSearchParams, defaultBackwater: boolean): ScenarioParams {
  const base = { ...BASELINE_PARAMS[city], backwater: defaultBackwater };
  if (!q.get("mode")) return base;
  const num = (k: string, d: number, lo: number, hi: number) => {
    const v = Number(q.get(k));
    return Number.isFinite(v) && q.get(k) !== "" && q.get(k) != null ? Math.min(hi, Math.max(lo, v)) : d;
  };
  const imp = q.get("imp");
  return {
    mode: q.get("mode") === "design" ? "design" : "baseline",
    rainfallIntensity: num("ri", base.rainfallIntensity, 0, 200),
    stormDuration: num("dur", base.stormDuration, 15, 270),
    rainfallScale: num("rs", 1, 0, 3),
    drainageCapacity: num("cap", base.drainageCapacity, 10, 150),
    blockage: num("blk", base.blockage, 0, 90),
    initialWaterLevel: num("lvl", base.initialWaterLevel, 0, 3.5),
    backwater: q.get("bw") == null ? base.backwater : q.get("bw") === "1",
    impervious: imp == null || imp === "" ? null : Math.min(98, Math.max(5, Number(imp))),
  };
}

export function scenarioKey(city: CityId, p: ScenarioParams) {
  return `${city}|${p.mode}|${p.rainfallIntensity}|${p.stormDuration}|${p.rainfallScale}|${p.drainageCapacity}|${p.blockage}|${p.initialWaterLevel}|${p.backwater ? 1 : 0}|${p.impervious ?? "x"}`;
}
