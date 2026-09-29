import { compactResult, getDataset, isCityId, json, runCached } from "@/lib/server/datasets";
import { generateAlerts, summarize } from "@/lib/engine/analysis";
import { BASELINE_PARAMS, DEFAULT_SCENARIO, NOW_CLOCK } from "@/lib/engine/constants";
import type { ScenarioParams } from "@/lib/types";
import type { ScenarioResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const PRESETS = [
  { id: "moderate", label: "Moderate monsoon shower", params: { ...DEFAULT_SCENARIO, rainfallIntensity: 20 } },
  { id: "heavy", label: "Heavy monsoon spell", params: { ...DEFAULT_SCENARIO, rainfallIntensity: 55, stormDuration: 150 } },
  { id: "cloudburst", label: "Cloudburst (100 mm/hr)", params: { ...DEFAULT_SCENARIO, rainfallIntensity: 100, stormDuration: 75, initialWaterLevel: 1.8 } },
  { id: "silted", label: "Pre-monsoon desilting missed", params: { ...DEFAULT_SCENARIO, rainfallIntensity: 45, blockage: 45, drainageCapacity: 70 } },
  { id: "tide", label: "Heavy rain + high tide / river backwater", params: { ...DEFAULT_SCENARIO, rainfallIntensity: 60, backwater: true, initialWaterLevel: 2.0 } },
];

export async function GET() {
  return json({ defaults: DEFAULT_SCENARIO, presets: PRESETS });
}

function clampParams(p: Partial<ScenarioParams>): ScenarioParams {
  const n = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    mode: p.mode === "baseline" ? "baseline" : "design",
    rainfallIntensity: n(p.rainfallIntensity, DEFAULT_SCENARIO.rainfallIntensity, 0, 200),
    stormDuration: n(p.stormDuration, DEFAULT_SCENARIO.stormDuration, 15, 270),
    rainfallScale: n(p.rainfallScale, 1, 0, 3),
    drainageCapacity: n(p.drainageCapacity, DEFAULT_SCENARIO.drainageCapacity, 10, 150),
    blockage: n(p.blockage, DEFAULT_SCENARIO.blockage, 0, 90),
    initialWaterLevel: n(p.initialWaterLevel, DEFAULT_SCENARIO.initialWaterLevel, 0, 3.5),
    backwater: !!p.backwater,
    impervious: p.impervious == null ? null : n(p.impervious, 72, 5, 98),
  };
}

export async function POST(req: Request) {
  let body: { city?: string; params?: Partial<ScenarioParams> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!isCityId(body.city ?? null)) return json({ error: "unknown city" }, { status: 400 });
  const ds = getDataset(body.city as ScenarioResponse["city"]);
  const params = clampParams(body.params ?? {});
  const t0 = performance.now();
  const res = runCached(ds, params);
  const t1 = performance.now();
  const summary = summarize(ds, res, NOW_CLOCK);
  const t2 = performance.now();
  const alerts = generateAlerts(ds, res, NOW_CLOCK).slice(0, 6);
  const t3 = performance.now();
  const baseline = runCached(ds, { ...BASELINE_PARAMS[ds.id], backwater: ds.backwater.defaultOn });
  const out: ScenarioResponse = {
    city: ds.id,
    params,
    summary,
    baselineSummary: summarize(ds, baseline, NOW_CLOCK),
    alerts,
    result: compactResult(res),
    computeMs: Math.round(t3 - t0),
    stages: [
      { label: "Collecting rainfall data", ms: 2 },
      { label: "Fusing terrain and land-use data", ms: 3 },
      { label: "Propagating through drainage graph", ms: Math.max(1, Math.round(t1 - t0)) },
      { label: "Running flood prediction", ms: Math.max(1, Math.round(t2 - t1)) },
      { label: "Generating street-level flood map", ms: Math.max(1, Math.round(t3 - t2)) },
    ],
  };
  return json(out);
}
