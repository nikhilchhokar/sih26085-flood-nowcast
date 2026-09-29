import type { LngLat } from "./types";

/** Point at fraction t (0..1) along a polyline (planar approximation, fine at city scale). */
export function alongPath(coords: LngLat[], t: number): LngLat {
  if (coords.length < 2) return coords[0];
  const seg: number[] = [0];
  for (let i = 1; i < coords.length; i++) seg.push(seg[i - 1] + Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]));
  const target = Math.max(0, Math.min(1, t)) * seg[seg.length - 1];
  for (let i = 1; i < coords.length; i++) {
    if (seg[i] >= target) {
      const k = (target - seg[i - 1]) / Math.max(1e-12, seg[i] - seg[i - 1]);
      return [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * k, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * k];
    }
  }
  return coords[coords.length - 1];
}

export function boundsCenter(coords: LngLat[]): LngLat {
  const xs = coords.map((p) => p[0]);
  const ys = coords.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

export function metersBetween(a: LngLat, b: LngLat) {
  const kx = 111320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110570);
}

export function bboxOf(coords: LngLat[]): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of coords) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}
