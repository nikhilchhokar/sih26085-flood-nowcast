import { json, resolve, runCached } from "@/lib/server/datasets";
import { sample } from "@/lib/engine/analysis";
import { NOW_CLOCK } from "@/lib/engine/constants";
import { backwaterAt } from "@/lib/engine/simulate";
import { nodeStatus } from "@/lib/engine/status";
import type { DrainageResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { city, ds, params, q } = resolve(req.url);
  const clock = Number(q.get("clock") ?? NOW_CLOCK) || NOW_CLOCK;
  const res = runCached(ds, params);
  const index = new Map(ds.drainNodes.map((n, i) => [n.id, i]));
  const nodes = ds.drainNodes.map((n, i) => {
    const util = sample(res.nodes.util[i], res, clock);
    const pond = sample(res.nodes.pond[i], res, clock);
    const di = n.downstream ? index.get(n.downstream) : undefined;
    const downUtil = di != null ? sample(res.nodes.util[di], res, clock) : 0;
    return {
      id: n.id,
      util: Math.round(util * 100) / 100,
      level: Math.round(sample(res.nodes.level[i], res, clock) * 100) / 100,
      flow: Math.round(sample(res.nodes.flow[i], res, clock) * 100) / 100,
      pond: Math.round(pond * 100) / 100,
      status: nodeStatus(util, pond),
      blocked: n.blockage >= 0.2,
      backwater: downUtil >= 0.97 || (n.kind === "outfall" && backwaterAt(ds, clock, params.backwater) > 0.2),
    };
  });
  const body: DrainageResponse = {
    city,
    clock,
    nodes,
    summary: {
      surcharged: nodes.filter((n) => n.status === "surcharged").length,
      warning: nodes.filter((n) => n.status === "warning").length,
      watch: nodes.filter((n) => n.status === "watch").length,
      blocked: nodes.filter((n) => n.blocked).length,
      meanUtil: Math.round((nodes.reduce((s, n) => s + n.util, 0) / nodes.length) * 100) / 100,
      backwaterFactor: Math.round(backwaterAt(ds, clock, params.backwater) * 100) / 100,
    },
  };
  return json(body);
}
