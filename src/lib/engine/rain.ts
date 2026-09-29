import type { CityDataset, ScenarioParams, StormTrack, Grid } from "../types";
import { NOW_CLOCK } from "./constants";

/**
 * City-mean rainfall hyetograph for the demo event (mm/hr).
 * Values up to NOW are "observed", afterwards "nowcast" — both SIMULATED.
 */
export const BASELINE_PROFILE: [number, number][] = [
  [6 * 60, 0],
  [6 * 60 + 30, 6],
  [7 * 60, 12],
  [7 * 60 + 30, 20],
  [8 * 60, 34],
  [8 * 60 + 30, 44],
  [9 * 60, 32],
  [9 * 60 + 30, 48],
  [10 * 60, 68],
  [10 * 60 + 30, 74],
  [11 * 60, 82],
  [11 * 60 + 30, 71],
  [12 * 60, 55],
  [12 * 60 + 30, 36],
  [13 * 60, 18],
  [13 * 60 + 30, 7],
  [14 * 60, 2],
  [14 * 60 + 30, 0],
  [16 * 60, 0],
];

function interpProfile(clock: number) {
  const p = BASELINE_PROFILE;
  if (clock <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (clock <= p[i][0]) {
      const [t0, v0] = p[i - 1];
      const [t1, v1] = p[i];
      return v0 + ((v1 - v0) * (clock - t0)) / (t1 - t0);
    }
  }
  return p[p.length - 1][1];
}

/** Design-storm hyetograph: skewed bell with mean = intensity over `duration`. */
function designProfile(clock: number, intensity: number, duration: number, start = NOW_CLOCK) {
  const x = (clock - start) / duration;
  if (x <= 0 || x >= 1) return 0;
  // peak at ~40% of duration; ∫ sin(πk/2)^1.5 dk = 0.556, so dividing keeps mean = intensity
  const k = x < 0.4 ? x / 0.4 : (1 - x) / 0.6;
  const shape = Math.pow(Math.sin((Math.PI / 2) * k), 1.5);
  return (intensity * shape) / 0.556;
}

export function cityMeanRain(clock: number, p: ScenarioParams) {
  if (p.mode === "design") return designProfile(clock, p.rainfallIntensity, p.stormDuration);
  return interpProfile(clock) * p.rainfallScale;
}

/** Accumulated city-mean rainfall between two clocks (mm). */
export function accumulatedRain(from: number, to: number, p: ScenarioParams) {
  let sum = 0;
  for (let t = from; t < to; t += 1) sum += cityMeanRain(t + 0.5, p) / 60;
  return sum;
}

const KM_PER_DEG_LAT = 110.57;
function kmPerDegLon(lat: number) {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}

export function stormCore(storm: StormTrack, clock: number): [number, number] {
  return [
    storm.origin[0] + storm.velocity[0] * (clock - storm.t0),
    storm.origin[1] + storm.velocity[1] * (clock - storm.t0),
  ];
}

/**
 * Spatial rainfall field: city-mean hyetograph modulated by a slowly moving
 * convective core. Normalised so that the grid mean equals the city mean.
 */
export class RainField {
  private norm = new Map<number, number>();
  constructor(
    private ds: Pick<CityDataset, "storm" | "rainGrid" | "bbox">,
    private p: ScenarioParams,
  ) {}

  private rawFactor(lon: number, lat: number, clock: number) {
    const s = this.ds.storm;
    const [cx, cy] = stormCore(s, clock);
    const dx = (lon - cx) * kmPerDegLon(lat);
    const dy = (lat - cy) * KM_PER_DEG_LAT;
    const g = Math.exp(-(dx * dx + dy * dy) / (2 * s.sigmaKm * s.sigmaKm));
    return 1 - s.contrast + s.contrast * 2.4 * g;
  }

  private normaliser(clock: number) {
    const key = Math.round(clock * 10);
    const hit = this.norm.get(key);
    if (hit) return hit;
    const [w, s, e, n] = this.ds.bbox;
    let sum = 0;
    const N = 12;
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++)
        sum += this.rawFactor(w + ((c + 0.5) / N) * (e - w), s + ((r + 0.5) / N) * (n - s), clock);
    const v = sum / (N * N);
    this.norm.set(key, v);
    return v;
  }

  mean(clock: number) {
    return cityMeanRain(clock, this.p);
  }

  at(lon: number, lat: number, clock: number) {
    const m = this.mean(clock);
    if (m <= 0) return 0;
    return (m * this.rawFactor(lon, lat, clock)) / this.normaliser(clock);
  }

  /** Row-major grid (north → south) of intensities (mm/hr). */
  grid(clock: number, g: Grid = this.ds.rainGrid) {
    const [w, s, e, n] = g.bbox;
    const out = new Float32Array(g.cols * g.rows);
    for (let r = 0; r < g.rows; r++) {
      const lat = n - ((r + 0.5) / g.rows) * (n - s);
      for (let c = 0; c < g.cols; c++) {
        const lon = w + ((c + 0.5) / g.cols) * (e - w);
        out[r * g.cols + c] = this.at(lon, lat, clock);
      }
    }
    return out;
  }
}

/** Colour ramp for radar reflectivity-style rainfall display (mm/hr). */
export const RAIN_STOPS: [number, [number, number, number, number]][] = [
  [1, [186, 230, 253, 0]],
  [5, [165, 243, 252, 45]],
  [15, [103, 232, 249, 75]],
  [30, [34, 211, 238, 100]],
  [50, [59, 130, 246, 120]],
  [70, [79, 70, 229, 140]],
  [95, [147, 51, 234, 160]],
  [125, [219, 39, 119, 178]],
];

export function rainColor(v: number): [number, number, number, number] {
  if (v <= RAIN_STOPS[0][0]) return [0, 0, 0, 0];
  for (let i = 1; i < RAIN_STOPS.length; i++) {
    if (v <= RAIN_STOPS[i][0]) {
      const [a, ca] = RAIN_STOPS[i - 1];
      const [b, cb] = RAIN_STOPS[i];
      const t = (v - a) / (b - a);
      return ca.map((x, k) => x + (cb[k] - x) * t) as [number, number, number, number];
    }
  }
  return RAIN_STOPS[RAIN_STOPS.length - 1][1];
}
