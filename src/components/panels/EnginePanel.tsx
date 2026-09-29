"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, BrainCircuit, ChevronRight } from "lucide-react";
import type { CityDataset } from "@/lib/types";
import type { NowcastResponse } from "@/lib/api/types";
import { useApp } from "@/lib/store";
import { KV, Panel, StatusPill, Tag, cx } from "../ui/primitives";

export const ENGINE_PIPELINE = ["Rain","Data fusion","Drainage graph","PI-GNN","Flood depth","Risk map","Alert / Action"];

export function PipelineChain({ vertical, active, className }: { vertical?: boolean; active?: number; className?: string }) {
  if (vertical) {
    return (
      <div className={cx("flex flex-col items-center gap-0.5", className)}>
        {ENGINE_PIPELINE.map((s, i) => (
          <div key={s} className="flex flex-col items-center gap-0.5">
            <span className={cx("rounded-md border px-3 py-1 text-xs font-semibold", i === 3 ? "border-accent/40 bg-accent-subtle text-accent" : "border-line-strong bg-surface-2 text-fg-2", active === i && "ring-2 ring-accent")}>{s}</span>
            {i < ENGINE_PIPELINE.length - 1 && <ArrowDown className="h-3 w-3 text-fg-4" />}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={cx("flex flex-wrap items-center gap-0.5", className)}>
      {ENGINE_PIPELINE.map((s, i) => (
        <div key={s} className="flex items-center gap-0.5">
          <span className={cx("rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap", i === 3 ? "bg-accent-subtle text-accent" : "bg-surface-3 text-fg-3")}>{s}</span>
          {i < ENGINE_PIPELINE.length - 1 && <ChevronRight className="h-3 w-3 text-fg-4" />}
        </div>
      ))}
    </div>
  );
}

export function useTicker(periodSec: number, offsetSec = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const f = () => setV((Math.floor(Date.now() / 1000) + offsetSec) % periodSec);
    f();
    const id = setInterval(f, 1000);
    return () => clearInterval(id);
  }, [periodSec, offsetSec]);
  return v;
}

export function agoLabel(sec: number) {
  if (sec < 60) return `${Math.max(1, Math.round(sec))} s ago`;
  return `${Math.floor(sec / 60)} min ago`;
}

export function EnginePanel({ ds, nowcast, full, className }: { ds?: CityDataset; nowcast?: NowcastResponse; full?: boolean; className?: string }) {
  const radarOutage = useApp((s) => s.flags.radarOutage);
  const since = useTicker(300, 170);
  const coverage = useMemo(() => {
    if (!ds) return 0;
    const idx = new Map(ds.drainNodes.map((n) => [n.id, n]));
    const kx = 111320 * Math.cos((ds.center[1] * Math.PI) / 180);
    let tot = 0;
    let cov = 0;
    for (const r of ds.roads) {
      const n = idx.get(r.nodeId);
      const m = r.coords[Math.floor(r.coords.length / 2)];
      tot += r.lengthM;
      if (n && Math.hypot((n.coord[0] - m[0]) * kx, (n.coord[1] - m[1]) * 110570) < 450) cov += r.lengthM;
    }
    return cov / Math.max(1, tot);
  }, [ds]);
  const conf = nowcast ? nowcast.summary.confidence : 0.89;
  return (
    <Panel className={className} title="PI-GNN Flood Nowcast Engine" icon={<BrainCircuit className="h-3.5 w-3.5" />} sim right={<StatusPill status={radarOutage ? "warning" : "online"} label={radarOutage ? "Degraded":"Running"} />}>
      <div className="grid grid-cols-2 gap-x-4">
        <KV k="Inference time" v={<span className="font-mono">18 s</span>} />
        <KV k="Confidence" v={<span className="font-mono">{Math.round(conf * 100)}%</span>} />
        <KV k="Prediction coverage" v={<span className="font-mono">{Math.round(coverage * 100)}%</span>} />
        <KV k="Last updated" v={agoLabel(since)} />
      </div>
      {full && (
        <div className="mt-2 divide-y divide-line border-t border-line pt-1">
          <KV k="Model" v="Physics-Informed Graph Neural Network" />
          <KV k="Framework" v="PyTorch Geometric" />
          <KV k="Simulation / training data" v="SWMM · HEC-RAS 2D" />
          <KV k="Prediction horizon" v="0 – 3 hours" />
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {["Radar / Rainfall","DEM","Land use","Drain graph","Historical floods"].map((s) => (
          <Tag key={s} tone="blue">
            {s}
          </Tag>
        ))}
      </div>
      <PipelineChain className="mt-2.5" />
      <p className="mt-2 text-xs leading-snug text-fg-4">
        Prototype: values above are simulated targets. A simplified coupled rainfall–drainage engine stands in for the PI-GNN
        {nowcast ? ` (this run: ${nowcast.model.computeMs} ms on ${ds?.drainNodes.length} nodes)` : ""}.
      </p>
    </Panel>
  );
}
