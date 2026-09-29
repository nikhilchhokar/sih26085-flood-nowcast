/* Response contracts of the mock API — the FastAPI backend should return the same shapes. */
import type {
  Alert,
  CityId,
  HealthStatus,
  LngLat,
  NowcastSummary,
  ResponseAction,
  RiskLevel,
  RouteResponse,
  ScenarioParams,
  SimResult,
} from "../types";
import type { SectorImpact } from "../engine/analysis";
import type { HistoricalEvent } from "../server/analytics";
import type { HealthComponent } from "../server/health";

export interface CityInfo {
  id: CityId;
  name: string;
  state: string;
  pilotArea: string;
  center: LngLat;
  bbox: [number, number, number, number];
  stats: { roadKm: number; drainKm: number; population: number; areaKm2: number };
  sectors: { id: string; name: string; locality: string }[];
  backwater: { kind: "river" | "tidal"; label: string; defaultOn: boolean };
}

export interface ModelInfo {
  name: string;
  mode: "SIMULATED";
  engine: string;
  computeMs: number;
  targetInferenceSec: number;
}

export interface NowcastResponse {
  city: CityId;
  issuedClock: number;
  horizonMin: number;
  params: ScenarioParams;
  model: ModelInfo;
  summary: NowcastSummary;
  result: SimResult;
}

export interface RainfallResponse {
  city: CityId;
  now: number;
  current: number;
  accumulated: number;
  next3hTotal: number;
  peak: { value: number; clock: number };
  trend30: number;
  confidence: number;
  degraded: boolean;
  series: { clock: number; mean: number; lo: number; hi: number; observed: boolean }[];
  timeline: { clock: number; mean: number; observed: boolean }[];
  gauges: { id: string; name: string; coord: LngLat; current: number; lastHour: number }[];
  sectors: { id: string; name: string; current: number; next60Max: number; trend: number }[];
  source: string;
}

export type NodeStatus = "normal" | "watch" | "warning" | "surcharged";

export interface DrainageResponse {
  city: CityId;
  clock: number;
  nodes: {
    id: string;
    util: number;
    level: number;
    flow: number;
    pond: number;
    status: NodeStatus;
    blocked: boolean;
    backwater: boolean;
  }[];
  summary: { surcharged: number; warning: number; watch: number; blocked: number; meanUtil: number; backwaterFactor: number };
}

export interface FloodRiskResponse {
  city: CityId;
  clock: number;
  leadMin: number;
  sectors: SectorImpact[];
  roads: {
    id: string;
    label: string;
    depth: number;
    risk: RiskLevel;
    onsetMin: number | null;
    probability: number;
    peakDepth: number;
    peakClock: number;
  }[];
}

export interface AlertsResponse {
  city: CityId;
  issuedClock: number;
  alerts: Alert[];
  actions: ResponseAction[];
}

export interface ScenarioResponse {
  city: CityId;
  params: ScenarioParams;
  summary: NowcastSummary;
  baselineSummary: NowcastSummary;
  alerts: Alert[];
  result: SimResult;
  computeMs: number;
  stages: { label: string; ms: number }[];
}

export interface AnalyticsResponse {
  city: CityId;
  total: number;
  events: HistoricalEvent[];
  featuredId: string;
  disclaimer: string;
}

export interface EventSeriesResponse {
  event: HistoricalEvent;
  series: { t: number; rain: number; observed: number; predicted: number }[];
}

export interface HealthResponse {
  generatedAt: string;
  overall: HealthStatus;
  components: HealthComponent[];
}

export type { RouteResponse, HistoricalEvent, HealthComponent, SectorImpact };
