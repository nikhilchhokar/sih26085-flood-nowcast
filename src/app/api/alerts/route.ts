import { json, resolve, runCached } from "@/lib/server/datasets";
import { generateActions, generateAlerts } from "@/lib/engine/analysis";
import { NOW_CLOCK } from "@/lib/engine/constants";
import type { AlertsResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { city, ds, params } = resolve(req.url);
  const res = runCached(ds, params);
  const body: AlertsResponse = {
    city,
    issuedClock: NOW_CLOCK,
    alerts: generateAlerts(ds, res, NOW_CLOCK),
    actions: generateActions(ds, res, NOW_CLOCK),
  };
  return json(body);
}
