/**
 * DEMO COUPLED RAINFALL–DRAINAGE ENGINE
 * -------------------------------------
 * A deliberately simple, deterministic stand-in for the proposed PI-GNN / SWMM
 * pipeline so the prototype behaves physically plausibly:
 *
 *   rain field ─► rational-method runoff (C·i·A) ─► overland linear reservoir
 *        ─► drain-graph routing (topological order, capacity + head + backwater)
 *        ─► surcharge overflow ─► surface ponding (spills downhill along the graph)
 *        ─► street-level depth via road susceptibility
 *
 * It is NOT a calibrated hydraulic model. All outputs are SIMULATED.
 */
import type { CityDataset, ScenarioParams, SimResult } from "../types";
import { DT_MIN, NOW_CLOCK, SIM_END, SIM_START } from "./constants";
import { RainField } from "./rain";

const OVERLAND_K = 24 * 60; // s — overland flow time constant
const RETURN_RATE = 0.18; // share of ponded water re-entering free inlets per step
const SPILL_RATE = 0.3; // max share of ponded water spilling to downstream surface per step
const POND_SAT = 1.5; // m — soft saturation of ponding depth
const ROAD_SAT = 1.7; // m — soft cap on street depth

export function pondDepthFromVolume(vol: number, area: number) {
  if (vol <= 0) return 0;
  return POND_SAT * Math.tanh(vol / (area * POND_SAT));
}

/** Fraction of outfall capacity lost to river stage / tide (0..1). */
export function backwaterAt(ds: Pick<CityDataset, "backwater">, clock: number, on: boolean) {
  if (!on) return 0;
  if (ds.backwater.kind === "river") {
    // Yamuna stage rising slowly through the event
    return Math.min(0.7, 0.42 + (0.18 * (clock - SIM_START)) / (SIM_END - SIM_START));
  }
  // semi-diurnal tide, high water at 11:40
  const tide = 0.5 + 0.5 * Math.cos((2 * Math.PI * (clock - 700)) / 745);
  return Math.max(0, (tide - 0.3) / 0.7) * 0.78;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function simulate(ds: CityDataset, params: ScenarioParams): SimResult {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const t0 = params.mode === "design" ? NOW_CLOCK : SIM_START;
  const steps = Math.round((SIM_END - t0) / DT_MIN) + 1;
  const dt = DT_MIN * 60;
  const field = new RainField(ds, params);

  const nodes = ds.drainNodes;
  const N = nodes.length;
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const order = nodes.map((_, i) => i).sort((a, b) => nodes[a].order - nodes[b].order);
  const down = nodes.map((n) => (n.downstream ? (index.get(n.downstream) ?? -1) : -1));

  const meanImp = nodes.reduce((s, n) => s + n.impervious, 0) / Math.max(1, N);
  const capPct = params.drainageCapacity / 100;
  const g = params.blockage / 100;

  const C = new Float64Array(N);
  const A = new Float64Array(N);
  const cap = new Float64Array(N);
  const V = new Float64Array(N);
  const S = new Float64Array(N);
  const P = new Float64Array(N);
  const utilPrev = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    const imp =
      params.impervious == null
        ? n.impervious
        : Math.min(0.98, Math.max(0.05, (n.impervious * (params.impervious / 100)) / meanImp));
    C[i] = 0.1 + 0.85 * imp;
    A[i] = n.catchmentHa * 1e4;
    const blk = Math.min(0.92, n.blockage + g * (0.6 + 1.5 * n.blockage));
    cap[i] = n.capacity * capPct * (1 - blk);
    const f0 = Math.min(0.95, Math.max(0, params.initialWaterLevel / n.maxDepth));
    V[i] = f0 * n.storage;
    utilPrev[i] = f0;
  }

  const level: number[][] = nodes.map(() => new Array(steps));
  const util: number[][] = nodes.map(() => new Array(steps));
  const flow: number[][] = nodes.map(() => new Array(steps));
  const pond: number[][] = nodes.map(() => new Array(steps));
  const rainNode: Float64Array[] = nodes.map(() => new Float64Array(steps));
  const rainMean: number[] = new Array(steps);
  const bwSeries: number[] = new Array(steps);

  const pipeIn = new Float64Array(N);
  const surfIn = new Float64Array(N);

  for (let s = 0; s < steps; s++) {
    const clock = t0 + s * DT_MIN;
    const bw = backwaterAt(ds, clock, params.backwater);
    bwSeries[s] = r3(bw);
    rainMean[s] = r3(field.mean(clock));
    pipeIn.fill(0);
    surfIn.fill(0);

    for (const i of order) {
      const n = nodes[i];
      const I = field.at(n.coord[0], n.coord[1], clock);
      rainNode[i][s] = I;

      // runoff → overland reservoir → inlet
      const qRain = (C[i] * I * A[i]) / 3.6e6;
      const qSurf = S[i] / OVERLAND_K;
      S[i] = Math.max(0, S[i] + (qRain - qSurf) * dt);

      V[i] += (qSurf + pipeIn[i]) * dt;

      // outflow limited by capacity, head, and downstream / outfall backwater
      const u = V[i] / n.storage;
      const headF = Math.min(1, Math.max(0.15, Math.sqrt(u / 0.6)));
      let bwF = 1;
      const d = down[i];
      if (d >= 0) {
        const ud = utilPrev[d];
        if (ud > 0.92) bwF = Math.max(0.5, 1 - ((ud - 0.92) / 0.08) * 0.5);
      } else {
        bwF = 1 - bw;
      }
      const q = Math.min(cap[i] * headF * bwF, V[i] / dt);
      V[i] -= q * dt;
      if (d >= 0) pipeIn[d] += q;

      // surcharge → surface
      if (V[i] > n.storage) {
        P[i] += V[i] - n.storage;
        V[i] = n.storage;
      }
      P[i] += surfIn[i];

      // re-entry through free inlets
      const space = n.storage - V[i];
      if (P[i] > 0 && space > 0) {
        const R = Math.min(P[i] * RETURN_RATE, space);
        P[i] -= R;
        V[i] += R;
      }
      // infiltration, side inlets & overland escape (faster on pervious ground)
      P[i] *= 1 - (0.012 + 0.03 * (1 - C[i]));
      // outfall: surface water runs straight into the receiving water unless it is backed up
      if (d < 0 && P[i] > 0) P[i] -= P[i] * 0.3 * (1 - bw);

      // surface spill downhill along the street / drain corridor
      if (d >= 0 && P[i] > 0) {
        const drop = n.elev - nodes[d].elev;
        if (drop > 0.05) {
          const F = P[i] * SPILL_RATE * Math.min(0.8, drop / 2.5);
          P[i] -= F;
          surfIn[d] += F;
        }
      }

      // hydraulic loading index shown to operators: blend of pipe-flow ratio and chamber fill
      // (1 = pipe at capacity AND chamber full = surcharge). Backwater physics uses fill only.
      const fill = V[i] / n.storage;
      const u2 = Math.min(1, 0.55 * Math.min(1, q / Math.max(1e-6, cap[i])) + 0.45 * fill);
      utilPrev[i] = fill;
      util[i][s] = r3(P[i] > 30 ? 1 : u2);
      level[i][s] = r3(n.maxDepth * Math.min(1, 0.12 + 0.88 * Math.pow(u2, 0.85)));
      flow[i][s] = r3(q);
      pond[i][s] = r3(pondDepthFromVolume(P[i], n.pondArea));
    }
  }

  const depth: number[][] = ds.roads.map((r) => {
    const ni = index.get(r.nodeId) ?? 0;
    const arr = new Array(steps);
    for (let s = 0; s < steps; s++) {
      const I = rainNode[ni][s];
      const sheet = Math.max(0, I - 38) * 0.0009 * (0.6 + 1.6 * r.relLow);
      const raw = pond[ni][s] * r.susceptibility + sheet;
      arr[s] = r3(ROAD_SAT * Math.tanh(raw / ROAD_SAT));
    }
    return arr;
  });

  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    city: ds.id,
    params,
    now: NOW_CLOCK,
    t0,
    dt: DT_MIN,
    steps,
    rainMean,
    backwater: bwSeries,
    nodes: { level, util, flow, pond },
    roads: { depth },
    computeMs: Math.round(ended - started),
  };
}
