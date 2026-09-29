import { compactResult, json, resolve, runCached } from "@/lib/server/datasets";
import { summarize } from "@/lib/engine/analysis";
import { HORIZON_MIN, NOW_CLOCK } from "@/lib/engine/constants";
import type { NowcastResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { city, ds, params, q } = resolve(req.url);
  const res = runCached(ds, params);
  const degraded = q.get("radarOutage") === "1";
  const body: NowcastResponse = {
    city,
    issuedClock: NOW_CLOCK,
    horizonMin: HORIZON_MIN,
    params,
    model: {
      name: "PI-GNN Flood Nowcast Engine",
      mode: "SIMULATED",
      engine: "Demo coupled rainfall–drainage engine (stand-in for PI-GNN / SWMM)",
      computeMs: res.computeMs,
      targetInferenceSec: 18,
    },
    summary: summarize(ds, res, NOW_CLOCK, HORIZON_MIN, { degraded }),
    result: compactResult(res),
  };
  return json(body);
}
