import type { RiskLevel, ScenarioParams, CityId } from "../types";

/** Clock is expressed in minutes since 00:00 (local, IST). */
export const NOW_CLOCK = 10 * 60; // 10:00 — issue time of the demo nowcast
export const SIM_START = 7 * 60; // 07:00
export const SIM_END = 14 * 60 + 30; // 14:30
export const DT_MIN = 5;
export const HORIZON_MIN = 180;

/** Depth thresholds (m) — upper bound of each class. */
export const RISK_THRESHOLDS: { level: RiskLevel; min: number }[] = [
  { level: "critical", min: 1.0 },
  { level: "high", min: 0.5 },
  { level: "moderate", min: 0.3 },
  { level: "low", min: 0.1 },
  { level: "safe", min: -Infinity },
];

/** Water depth at which a road is considered unsafe for normal traffic (m). */
export const UNSAFE_DEPTH = 0.3;

export const RISK_ORDER: RiskLevel[] = ["safe", "low", "moderate", "high", "critical"];

export const RISK_LABEL: Record<RiskLevel, string> = {
  safe: "Safe",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

export const RISK_COLOR: Record<RiskLevel, string> = {
  safe: "#22c55e",
  low: "#facc15",
  moderate: "#f97316",
  high: "#dc2626",
  critical: "#7f1d1d",
};

/** Risk colours tuned for text / numbers on the dark console background. */
export const RISK_TEXT: Record<RiskLevel, string> = {
  safe: "#4ade80",
  low: "#facc15",
  moderate: "#fb923c",
  high: "#f87171",
  critical: "#ff4d5e",
};

export const RISK_RANGE: Record<RiskLevel, string> = {
  safe: "< 0.10 m",
  low: "0.10 – 0.30 m",
  moderate: "0.30 – 0.50 m",
  high: "0.50 – 1.00 m",
  critical: "≥ 1.00 m",
};

export function riskOf(depth: number): RiskLevel {
  for (const t of RISK_THRESHOLDS) if (depth >= t.min) return t.level;
  return "safe";
}

export function riskRank(level: RiskLevel) {
  return RISK_ORDER.indexOf(level);
}

/** Forecast skill decays with lead time (illustrative prototype curve). */
export function confidenceAt(leadMin: number, degraded = false) {
  const base = 0.95 - 0.001 * leadMin - 0.0000003 * leadMin * leadMin; // 95% now → 89% at 60 min → 76% at 180 min
  return Math.max(0.5, base - (degraded ? 0.12 : 0));
}

/** Vehicle wading limits used by safe routing (m). */
export const VEHICLE_LIMITS = {
  ambulance: { comfortable: 0.15, max: 0.3, label: "Ambulance" },
  fire: { comfortable: 0.3, max: 0.6, label: "Fire Tender" },
  police: { comfortable: 0.2, max: 0.35, label: "Police PCR" },
} as const;

export const BASELINE_PARAMS: Record<CityId, ScenarioParams> = {
  delhi: {
    mode: "baseline",
    rainfallIntensity: 68,
    stormDuration: 180,
    rainfallScale: 1,
    drainageCapacity: 85,
    blockage: 12,
    initialWaterLevel: 0.9,
    backwater: false,
    impervious: null,
  },
  mumbai: {
    mode: "baseline",
    rainfallIntensity: 68,
    stormDuration: 180,
    rainfallScale: 1,
    drainageCapacity: 85,
    blockage: 12,
    initialWaterLevel: 0.9,
    backwater: true,
    impervious: null,
  },
  chennai: {
    mode: "baseline",
    rainfallIntensity: 68,
    stormDuration: 180,
    rainfallScale: 1,
    drainageCapacity: 85,
    blockage: 12,
    initialWaterLevel: 0.9,
    backwater: false,
    impervious: null,
  },
};

export const DEFAULT_SCENARIO: ScenarioParams = {
  mode: "design",
  rainfallIntensity: 20,
  stormDuration: 120,
  rainfallScale: 1,
  drainageCapacity: 80,
  blockage: 10,
  initialWaterLevel: 1.4,
  backwater: false,
  impervious: 72,
};

export function clockLabel(clock: number) {
  const m = ((Math.round(clock) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function clockLabel12(clock: number) {
  const m = ((Math.round(clock) % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, "0")} ${ap}`;
}
