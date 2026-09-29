/**
 * Frontend service layer. Every screen talks to the backend only through these
 * functions. Today they hit the Next.js mock routes under /api; set
 * NEXT_PUBLIC_API_BASE_URL (e.g. http://localhost:8000/api) to point them at the
 * FastAPI + PostGIS backend without touching UI code.
 */
import type { CityDataset, CityId, LngLat, RouteResponse, ScenarioParams } from "../types";
import type {
  AlertsResponse,
  AnalyticsResponse,
  CityInfo,
  DrainageResponse,
  EventSeriesResponse,
  FloodRiskResponse,
  HealthResponse,
  NowcastResponse,
  RainfallResponse,
  ScenarioResponse,
} from "./types";
import { scenarioToQuery } from "../scenarioQuery";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Rolling log of request latencies, surfaced on the System Health screen. */
export const latencyLog: { path: string; ms: number; at: number; ok: boolean }[] = [];

async function request<T>(path: string, init?: RequestInit & { query?: Record<string, string | undefined> }): Promise<T> {
  const qs = init?.query
    ? "?" +
      new URLSearchParams(Object.entries(init.query).filter(([, v]) => v != null && v !== "") as [string, string][]).toString()
    : "";
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${qs}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch (e) {
    latencyLog.push({ path, ms: performance.now() - t0, at: Date.now(), ok: false });
    throw new ApiError(`Network error calling ${path}: ${(e as Error).message}`, 0);
  }
  latencyLog.push({ path, ms: performance.now() - t0, at: Date.now(), ok: res.ok });
  if (latencyLog.length > 200) latencyLog.splice(0, latencyLog.length - 200);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {}
    throw new ApiError(`${path}: ${msg}`, res.status);
  }
  return res.json() as Promise<T>;
}

type Flags = { radarOutage?: boolean; awsDelay?: boolean };
const flagQuery = (f?: Flags) => ({
  radarOutage: f?.radarOutage ? "1" : undefined,
  awsDelay: f?.awsDelay ? "1" : undefined,
});

export const api = {
  cities: () => request<CityInfo[]>("/cities"),
  network: (city: CityId) => request<CityDataset>("/network", { query: { city } }),
  nowcast: (city: CityId, scenario?: ScenarioParams | null, flags?: Flags) =>
    request<NowcastResponse>("/nowcast", { query: { city, ...scenarioToQuery(scenario), ...flagQuery(flags) } }),
  rainfall: (city: CityId, scenario?: ScenarioParams | null, flags?: Flags) =>
    request<RainfallResponse>("/rainfall", { query: { city, ...scenarioToQuery(scenario), ...flagQuery(flags) } }),
  drainage: (city: CityId, clock: number, scenario?: ScenarioParams | null) =>
    request<DrainageResponse>("/drainage", { query: { city, clock: String(clock), ...scenarioToQuery(scenario) } }),
  floodRisk: (city: CityId, clock: number, scenario?: ScenarioParams | null) =>
    request<FloodRiskResponse>("/flood-risk", { query: { city, clock: String(clock), ...scenarioToQuery(scenario) } }),
  alerts: (city: CityId, scenario?: ScenarioParams | null) =>
    request<AlertsResponse>("/alerts", { query: { city, ...scenarioToQuery(scenario) } }),
  routes: (body: {
    city: CityId;
    vehicle: "ambulance" | "fire" | "police";
    originId?: string;
    originCoord?: LngLat;
    destination: { incidentId?: string; coord?: LngLat; name?: string };
    clock?: number;
    params?: ScenarioParams | null;
  }) => request<RouteResponse>("/routes", { method: "POST", body: JSON.stringify(body) }),
  scenarioPresets: () => request<{ defaults: ScenarioParams; presets: { id: string; label: string; params: ScenarioParams }[] }>("/scenarios"),
  runScenario: (city: CityId, params: ScenarioParams) =>
    request<ScenarioResponse>("/scenarios", { method: "POST", body: JSON.stringify({ city, params }) }),
  analytics: (city: CityId) => request<AnalyticsResponse>("/analytics", { query: { city } }),
  analyticsEvent: (city: CityId, event: string) => request<EventSeriesResponse>("/analytics", { query: { city, event } }),
  systemHealth: (flags?: Flags) => request<HealthResponse>("/system-health", { query: flagQuery(flags) }),
};
