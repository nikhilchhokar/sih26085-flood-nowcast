import { getDataset, isCityId, json, runCached } from "@/lib/server/datasets";
import { nearestGraphNode, planRoutes } from "@/lib/engine/routing";
import { BASELINE_PARAMS, NOW_CLOCK, VEHICLE_LIMITS } from "@/lib/engine/constants";
import type { LngLat, RouteResponse, ScenarioParams } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  city: string;
  vehicle: keyof typeof VEHICLE_LIMITS;
  originId?: string;
  originCoord?: LngLat;
  destination: { incidentId?: string; coord?: LngLat; name?: string };
  clock?: number;
  params?: ScenarioParams | null;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!isCityId(body.city)) return json({ error: "unknown city" }, { status: 400 });
  const ds = getDataset(body.city);
  const params = body.params ?? { ...BASELINE_PARAMS[ds.id], backwater: ds.backwater.defaultOn };
  const res = runCached(ds, params);
  const vehicle = body.vehicle in VEHICLE_LIMITS ? body.vehicle : "ambulance";

  const originPoi = body.originId ? (ds.pois.find((p) => p.id === body.originId) ?? ds.vehicles.find((v) => v.id === body.originId)) : null;
  const origin = originPoi ?? (body.originCoord ? { graphNode: nearestGraphNode(ds, body.originCoord) } : null);
  if (!origin || origin.graphNode < 0) return json({ error: "unknown origin" }, { status: 400 });

  let destNode: number;
  let destName: string;
  let destCoord: LngLat;
  const inc = body.destination.incidentId ? ds.incidents.find((i) => i.id === body.destination.incidentId) : null;
  if (inc) {
    destNode = inc.graphNode;
    destName = inc.name;
    destCoord = inc.coord;
  } else if (body.destination.coord) {
    destNode = nearestGraphNode(ds, body.destination.coord);
    destCoord = ds.graph.nodes[destNode];
    destName = body.destination.name ?? "Selected location";
  } else {
    const poi = ds.pois.find((p) => p.id === body.destination.name);
    if (!poi) return json({ error: "destination required" }, { status: 400 });
    destNode = poi.graphNode;
    destName = poi.name;
    destCoord = poi.coord;
  }

  const clock = Number.isFinite(body.clock) ? (body.clock as number) : NOW_CLOCK;
  const options = planRoutes(ds, res, { vehicle, originNode: origin.graphNode, destNode, clock });
  const A = options.find((o) => o.id === "A");
  const B = options.find((o) => o.id === "B");
  const out: RouteResponse = {
    vehicle,
    originId: body.originId ?? "coord",
    destination: { name: destName, coord: destCoord },
    atClock: clock,
    options,
    avoidedRoadIds: B && A ? B.floodedRoadIds.filter((id) => !A.roadIds.includes(id)) : [],
  };
  return json(out);
}
