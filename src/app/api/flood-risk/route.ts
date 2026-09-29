import { json, resolve, runCached } from "@/lib/server/datasets";
import { exceedance, maxOver, onsetClock, sample, sectorImpacts } from "@/lib/engine/analysis";
import { HORIZON_MIN, NOW_CLOCK, UNSAFE_DEPTH, riskOf } from "@/lib/engine/constants";
import type { FloodRiskResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { city, ds, params, q } = resolve(req.url);
  const clock = Number(q.get("clock") ?? NOW_CLOCK) || NOW_CLOCK;
  const res = runCached(ds, params);
  const lead = Math.max(0, clock - NOW_CLOCK);
  const roads = ds.roads
    .map((r, i) => {
      const depth = sample(res.roads.depth[i], res, clock);
      const pk = maxOver(res.roads.depth[i], res, NOW_CLOCK, NOW_CLOCK + HORIZON_MIN);
      const on = onsetClock(res.roads.depth[i], res, NOW_CLOCK, UNSAFE_DEPTH);
      return {
        id: r.id,
        label: r.label,
        major: r.major,
        depth: Math.round(depth * 100) / 100,
        risk: riskOf(depth),
        onsetMin: on == null ? null : Math.round(on - NOW_CLOCK),
        probability: Math.round(exceedance(depth, lead) * 100) / 100,
        peakDepth: Math.round(pk.max * 100) / 100,
        peakClock: pk.clock,
      };
    })
    .filter((r) => r.major && (r.depth >= 0.1 || r.peakDepth >= UNSAFE_DEPTH))
    .map(({ major, ...r }) => (void major, r))
    .sort((a, b) => b.depth - a.depth);
  const body: FloodRiskResponse = { city, clock, leadMin: lead, sectors: sectorImpacts(ds, res, clock), roads };
  return json(body);
}
