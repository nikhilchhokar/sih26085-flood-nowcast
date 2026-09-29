import { CITY_IDS, getDataset, json } from "@/lib/server/datasets";
import type { CityInfo } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const cities: CityInfo[] = CITY_IDS.map((id) => {
    const ds = getDataset(id);
    return {
      id,
      name: ds.name,
      state: ds.state,
      pilotArea: ds.pilotArea,
      center: ds.center,
      bbox: ds.bbox,
      stats: ds.stats,
      sectors: ds.sectors.map((s) => ({ id: s.id, name: s.name, locality: s.locality })),
      backwater: ds.backwater,
    };
  });
  return json(cities);
}
