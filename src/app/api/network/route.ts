import { json, resolve } from "@/lib/server/datasets";

export const dynamic = "force-dynamic";

/** Static geodata for a city: roads, drain graph, sectors, facilities, routing graph, grids. */
export async function GET(req: Request) {
  const { ds } = resolve(req.url);
  return json(ds);
}
