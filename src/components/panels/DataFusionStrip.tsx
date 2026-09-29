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
      lines: [radar?.status === "offline" ? "Radar offline · AWS fallback":"IMD radar + AWS", `Updated ${agoLabel(Math.min(radar?.updatedAgoSec ?? 120, aws?.updatedAgoSec ?? 60))}`],
    },
    { id: "dem", label: "Terrain / DEM", icon: <Mountain className="h-3.5 w-3.5" />, status: "static", lines: ["Resolution 30 m","SRTM (static)"] },
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
    { id: "hist", label: "Historical floods", icon: <Archive className="h-3.5 w-3.5" />, status: "static", lines: ["Events loaded: 128","Synthetic catalogue"] },
  ];
}

const STATUS_TEXT: Record<HealthStatus, { label: string; color: string }> = {
  online: { label: "Online", color: "var(--ok)" },
  static: { label: "Ready", color: "var(--accent)" },
  delayed: { label: "Delayed", color: "var(--warn)" },
  warning: { label: "Degraded", color: "var(--warn)" },
  offline: { label: "Offline", color: "var(--danger)" },
};

export function DataFusionStrip({ ds, health, className }: { ds?: CityDataset; health?: HealthResponse; className?: string }) {
  const cards = fusionCards(ds, health);
  return (
    <div className={cx("flex items-stretch overflow-hidden rounded border border-line bg-surface", className)}>
      <div className="flex w-32 shrink-0 flex-col justify-center border-r border-line px-3">
        <div className="text-[13px] font-semibold text-fg">Data fusion</div>
        <div className="text-xs text-fg-4">Inputs to the model</div>
      </div>
      {cards.map((c, i) => (
        <div key={c.id} className={cx("min-w-0 flex-1 px-3 py-1.5", i > 0 && "border-l border-line")}>
          <div className="flex items-center gap-1.5">
            <span className="text-fg-4">{c.icon}</span>
            <span className="truncate text-xs font-medium text-fg-2">{c.label}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: STATUS_TEXT[c.status].color }}>
            <StatusDot status={c.status} />
            {STATUS_TEXT[c.status].label}
          </div>
          <div className="truncate text-xs text-fg-3">{c.lines.join(" · ")}</div>
        </div>
      ))}
    </div>
  );
}
