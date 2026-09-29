import { json, resolve } from "@/lib/server/datasets";
import { RainField, accumulatedRain } from "@/lib/engine/rain";
import { NOW_CLOCK } from "@/lib/engine/constants";
import type { RainfallResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const r1 = (v: number) => Math.round(v * 10) / 10;

export async function GET(req: Request) {
  const { city, ds, params, q } = resolve(req.url);
  const degraded = q.get("radarOutage") === "1";
  const field = new RainField(ds, params);
  const now = NOW_CLOCK;
  const series: RainfallResponse["series"] = [];
  for (let c = now - 60; c <= now + 180; c += 10) {
    const mean = field.mean(c);
    const lead = Math.max(0, c - now);
    const spread = lead === 0 ? 0 : 0.07 + 0.0013 * lead + (degraded ? 0.08 : 0);
    series.push({ clock: c, mean: r1(mean), lo: r1(mean * (1 - spread)), hi: r1(mean * (1 + spread)), observed: c <= now });
  }
  const timeline: RainfallResponse["timeline"] = [];
  for (let c = 9 * 60; c <= 12 * 60; c += 30) timeline.push({ clock: c, mean: Math.round(field.mean(c)), observed: c <= now });
  let peak = { value: 0, clock: now };
  for (let c = now; c <= now + 180; c += 5) {
    const v = field.mean(c);
    if (v > peak.value) peak = { value: r1(v), clock: c };
  }
  const lastHourAt = (lon: number, lat: number) => {
    let s = 0;
    for (let c = now - 60; c < now; c += 2) s += field.at(lon, lat, c + 1) / 30;
    return r1(s);
  };
  const body: RainfallResponse = {
    city,
    now,
    current: r1(field.mean(now)),
    accumulated: Math.round(accumulatedRain(6 * 60, now, params)),
    next3hTotal: Math.round(accumulatedRain(now, now + 180, params)),
    peak,
    trend30: r1(field.mean(now) - field.mean(now - 30)),
    confidence: degraded ? 0.68 : 0.82,
    degraded,
    series,
    timeline,
    gauges: ds.gauges.map((g) => ({
      ...g,
      current: r1(field.at(g.coord[0], g.coord[1], now)),
      lastHour: lastHourAt(g.coord[0], g.coord[1]),
    })),
    sectors: ds.sectors.map((s) => {
      let mx = 0;
      for (let c = now; c <= now + 60; c += 5) mx = Math.max(mx, field.at(s.centroid[0], s.centroid[1], c));
      return {
        id: s.id,
        name: s.name,
        current: r1(field.at(s.centroid[0], s.centroid[1], now)),
        next60Max: r1(mx),
        trend: r1(field.at(s.centroid[0], s.centroid[1], now) - field.at(s.centroid[0], s.centroid[1], now - 30)),
      };
    }),
    source: degraded
      ? "SIMULATED — radar offline, AWS gauge interpolation fallback"
      : "SIMULATED radar + AWS blend (demo data)",
  };
  return json(body);
}
