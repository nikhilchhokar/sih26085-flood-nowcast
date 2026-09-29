/**
 * SYNTHETIC historical flood-event catalogue.
 * Generated deterministically for the demo — NOT observed records.
 */
import type { CityDataset, CityId } from "../types";

export interface HistoricalEvent {
  id: string;
  date: string; // ISO date
  name: string;
  type: "Monsoon" | "Cloudburst" | "NE Monsoon" | "Cyclone remnant" | "Pre-monsoon";
  rainfallMm: number;
  peakIntensity: number; // mm/hr
  stormHours: number;
  maxDepth: number; // m
  floodDurationMin: number;
  floodedRoads: number;
  peakDrainUtil: number; // %
  timeToPeakMin: number;
  predictedMaxDepth: number;
  predictedFloodedRoads: number;
  accuracy: number; // % hit rate on road risk class (illustrative backtest)
  tidal: boolean;
  sectors: { id: string; maxDepth: number; floodedRoads: number }[];
  featured?: boolean;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

const FEATURED: Record<CityId, Partial<HistoricalEvent> & { date: string; name: string }> = {
  delhi: {
    date: "2026-07-18",
    name: "Delhi Monsoon Event",
    rainfallMm: 132,
    maxDepth: 1.36,
    floodedRoads: 54,
    timeToPeakMin: 138,
    accuracy: 87,
    peakIntensity: 88,
  },
  mumbai: {
    date: "2026-07-08",
    name: "Mumbai Monsoon Event (high tide)",
    rainfallMm: 204,
    maxDepth: 1.52,
    floodedRoads: 71,
    timeToPeakMin: 164,
    accuracy: 84,
    peakIntensity: 96,
    tidal: true,
  },
  chennai: {
    date: "2025-12-04",
    name: "Chennai NE Monsoon Event",
    rainfallMm: 176,
    maxDepth: 1.21,
    floodedRoads: 38,
    timeToPeakMin: 192,
    accuracy: 85,
    peakIntensity: 74,
  },
};

const cache = new Map<CityId, HistoricalEvent[]>();

export function historicalEvents(ds: CityDataset): HistoricalEvent[] {
  const hit = cache.get(ds.id);
  if (hit) return hit;
  const rng = mulberry32(ds.id.length * 9973 + ds.roads.length);
  const events: HistoricalEvent[] = [];
  const months = ds.id === "chennai" ? [10, 11, 12, 6, 7, 8, 9] : [6, 7, 8, 9];
  for (let i = 0; i < 128; i++) {
    const year = 2019 + Math.floor(rng() * 7.6);
    const month = months[Math.floor(Math.pow(rng(), 0.8) * months.length)];
    const day = 1 + Math.floor(rng() * 28);
    const date = `${Math.min(year, 2026)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const cloud = rng() < 0.12;
    const hours = cloud ? 1 + rng() * 2 : 2 + rng() * 7;
    const peak = cloud ? 70 + rng() * 70 : 18 + Math.pow(rng(), 1.4) * 80;
    const rain = Math.round(peak * hours * (0.35 + rng() * 0.25));
    const tidal = ds.id !== "delhi" && rng() < 0.35;
    // depth responds to exceedance of drain design capacity and total volume
    const excess = Math.max(0, peak - ds.designRainfall * 0.9);
    const maxDepth = r2(Math.min(1.9, 0.05 + excess * 0.012 + rain * 0.0028 + (tidal ? 0.18 : 0) + (rng() - 0.5) * 0.12));
    const flooded = Math.max(0, Math.round(maxDepth * 34 + rain * 0.08 + (rng() - 0.5) * 8));
    const util = Math.round(Math.min(100, 45 + peak * 0.55 + (rng() - 0.5) * 10));
    const dur = Math.round(maxDepth * 140 + hours * 12 + (tidal ? 60 : 0) + rng() * 30);
    const predErr = (rng() - 0.5) * 0.3;
    const acc = Math.round(Math.min(96, Math.max(68, 90 - Math.abs(predErr) * 40 - (cloud ? 6 : 0) + (rng() - 0.5) * 6)));
    const sectors = ds.sectors.map((s) => {
      const f = Math.max(0, rng() * 1.2 - 0.25 + (s.id === ds.hero.sectorId ? 0.35 : 0));
      return { id: s.id, maxDepth: r2(Math.min(maxDepth, maxDepth * f)), floodedRoads: Math.round((flooded * f) / 3) };
    });
    events.push({
      id: `EV-${ds.id.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
      date,
      name: cloud ? "Cloudburst" : ds.id === "chennai" && month >= 10 ? "NE Monsoon spell" : "Monsoon spell",
      type: cloud ? "Cloudburst" : ds.id === "chennai" && month >= 10 ? "NE Monsoon" : "Monsoon",
      rainfallMm: rain,
      peakIntensity: Math.round(peak),
      stormHours: r2(hours),
      maxDepth,
      floodDurationMin: dur,
      floodedRoads: flooded,
      peakDrainUtil: util,
      timeToPeakMin: Math.round(40 + hours * 18 + rng() * 40),
      predictedMaxDepth: r2(Math.max(0, maxDepth + predErr)),
      predictedFloodedRoads: Math.max(0, Math.round(flooded * (1 + predErr * 0.6))),
      accuracy: acc,
      tidal,
      sectors,
    });
  }
  const f = FEATURED[ds.id];
  const fe = events[17];
  Object.assign(fe, f, {
    id: `EV-${ds.id.slice(0, 3).toUpperCase()}-F01`,
    type: "Monsoon",
    stormHours: 3.5,
    floodDurationMin: 265,
    peakDrainUtil: 100,
    predictedMaxDepth: r2((f.maxDepth ?? 1) - 0.09),
    predictedFloodedRoads: (f.floodedRoads ?? 40) - 4,
    featured: true,
  });
  events.sort((a, b) => b.date.localeCompare(a.date));
  cache.set(ds.id, events);
  return events;
}

/** Illustrative time series of a historical event (rain and hotspot depth, observed vs predicted). */
export function eventSeries(ev: HistoricalEvent) {
  const rng = mulberry32(ev.id.split("").reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
  const total = Math.round(ev.stormHours * 60 + ev.floodDurationMin);
  const pts: { t: number; rain: number; observed: number; predicted: number }[] = [];
  const peakT = ev.timeToPeakMin;
  for (let t = 0; t <= total; t += 10) {
    const x = t / (ev.stormHours * 60);
    const rain = x < 1 ? ev.peakIntensity * Math.pow(Math.sin(Math.PI * x), 1.6) : 0;
    const dep = ev.maxDepth * Math.exp(-Math.pow((t - peakT) / (peakT * 0.55 + 20), 2));
    const pred = ev.predictedMaxDepth * Math.exp(-Math.pow((t - peakT + 8) / (peakT * 0.55 + 24), 2));
    pts.push({
      t,
      rain: Math.round(rain),
      observed: r2(Math.max(0, dep + (rng() - 0.5) * 0.04)),
      predicted: r2(Math.max(0, pred)),
    });
  }
  return pts;
}
