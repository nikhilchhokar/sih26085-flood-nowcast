"use client";
import { Archive, ChevronRight, CloudRain, Database, Mountain, Network, Trees, WavesVertical } from "lucide-react";
import type { CityDataset, HealthStatus } from "@/lib/types";
import type { HealthResponse } from "@/lib/api/types";
import { StatusDot, cx } from "../ui/primitives";
import { agoLabel } from "./EnginePanel";

interface Card {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: HealthStatus;
  lines: string[];
}

export function fusionCards(ds?: CityDataset, health?: HealthResponse): Card[] {
  const c = (id: string) => health?.components.find((x) => x.id === id);
  const radar = c("radar");
  const aws = c("aws");
  const wl = c("water-level");
  const rainStatus: HealthStatus = radar?.status === "offline" ? "warning" : aws?.status === "delayed" ? "delayed" : "online";
  return [
    {
      id: "rain",
      label: "Rainfall",
      icon: <CloudRain className="h-3.5 w-3.5" />,
      status: rainStatus,
      lines: [radar?.status === "offline" ? "Radar offline · AWS fallback" : "IMD radar + AWS", `Updated ${agoLabel(Math.min(radar?.updatedAgoSec ?? 120, aws?.updatedAgoSec ?? 60))}`],
    },
    { id: "dem", label: "Terrain / DEM", icon: <Mountain className="h-3.5 w-3.5" />, status: "static", lines: ["Resolution 30 m", "SRTM (static)"] },
    { id: "lu", label: "Land use", icon: <Trees className="h-3.5 w-3.5" />, status: "static", lines: ["Urban GIS / OSM", `Impervious ${Math.round(((ds?.sectors.reduce((s, x) => s + x.impervious, 0) ?? 0) / Math.max(1, ds?.sectors.length ?? 1)) * 100)}%`] },
    {
      id: "drain",
      label: "Drainage network",
      icon: <Network className="h-3.5 w-3.5" />,
      status: "static",
      lines: [`Nodes ${ds?.drainNodes.length ?? "—"} · Edges ${ds?.drainEdges.length ?? "—"}`, "Pilot area graph"],
    },
    {
      id: "wl",
      label: "Water level",
      icon: <WavesVertical className="h-3.5 w-3.5" />,
      status: wl?.status ?? "online",
      lines: ["Drain level sensors", `Updated ${agoLabel(wl?.updatedAgoSec ?? 60)}`],
    },
    { id: "hist", label: "Historical floods", icon: <Archive className="h-3.5 w-3.5" />, status: "static", lines: ["Events loaded: 128", "Synthetic catalogue"] },
  ];
}

export function DataFusionStrip({ ds, health, className }: { ds?: CityDataset; health?: HealthResponse; className?: string }) {
  const cards = fusionCards(ds, health);
  return (
    <div className={cx("flex items-stretch gap-2", className)}>
      <div className="flex w-28 shrink-0 flex-col justify-center rounded-xl border border-ink-700 bg-ink-900/90 px-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-slate-300 uppercase">
          <Database className="h-3.5 w-3.5 text-cyan-300" /> Data fusion
        </div>
        <div className="mt-1 text-[9.5px] leading-tight text-slate-500">
          Fusion <ChevronRight className="inline h-2.5 w-2.5" /> Modelling <ChevronRight className="inline h-2.5 w-2.5" /> Nowcast <ChevronRight className="inline h-2.5 w-2.5" /> Action
        </div>
      </div>
      {cards.map((c) => (
        <div key={c.id} className="min-w-0 flex-1 rounded-xl border border-ink-700 bg-ink-900/90 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">{c.icon}</span>
            <span className="truncate text-[10px] font-bold tracking-wider text-slate-300 uppercase">{c.label}</span>
            <StatusDot status={c.status} className="ml-auto shrink-0" />
          </div>
          <div className="mt-0.5 text-[10px] font-semibold tracking-wide uppercase" style={{ color: c.status === "online" ? "#4ade80" : c.status === "static" ? "#60a5fa" : c.status === "delayed" ? "#facc15" : "#fb923c" }}>
            {c.status === "static" ? "Ready" : c.status}
          </div>
          {c.lines.map((l) => (
            <div key={l} className="truncate text-[10.5px] text-slate-400">
              {l}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
