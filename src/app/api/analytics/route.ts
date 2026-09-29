import { json, resolve } from "@/lib/server/datasets";
import { eventSeries, historicalEvents } from "@/lib/server/analytics";
import type { AnalyticsResponse, EventSeriesResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { city, ds, q } = resolve(req.url);
  const events = historicalEvents(ds);
  const eventId = q.get("event");
  if (eventId) {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return json({ error: "event not found" }, { status: 404 });
    const body: EventSeriesResponse = { event: ev, series: eventSeries(ev) };
    return json(body);
  }
  const body: AnalyticsResponse = {
    city,
    total: events.length,
    events,
    featuredId: events.find((e) => e.featured)!.id,
    disclaimer: "Synthetic event catalogue generated for the prototype — not observed records.",
  };
  return json(body);
}
