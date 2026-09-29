"use client";
import { ArrowUpRight } from "lucide-react";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, cx } from "@/components/ui/primitives";

const LAYERS = [
  {
    n: 1,
    title: "Data sources",
    items: ["Radar", "AWS gauges", "DEM", "Land use", "Drainage network", "Historical events"],
    tech: "IMD · Bhuvan / Copernicus · OpenStreetMap",
    proto: "OSM roads and facilities, SRTM 30 m terrain (real snapshot). Rainfall and drain state simulated.",
  },
  {
    n: 2,
    title: "Data fusion",
    items: ["Cleaning", "Normalisation", "Spatial alignment", "Graph construction"],
    tech: "GeoPandas · PostGIS",
    proto: "Build pipeline: DEM smoothing, road segmentation, drain graph rebuilt from OSM + DEM.",
  },
  {
    n: 3,
    title: "Modelling",
    items: ["Hydraulic simulation", "Physics-informed GNN", "Rainfall–drainage coupling"],
    tech: "SWMM · HEC-RAS 2D · PyTorch Geometric",
    proto: "Simplified coupled engine (runoff → graph routing → surcharge → ponding) stands in for the PI-GNN.",
  },
  {
    n: 4,
    title: "Nowcast",
    items: ["Flood depth", "Flood probability", "Time to impact"],
    tech: "5-minute cycle · 0–3 h horizon",
    proto: "Depth, exceedance probability and onset computed per road segment.",
  },
  {
    n: 5,
    title: "Action",
    items: ["Alerts", "Routing", "Evacuation", "City dashboard", "API"],
    tech: "FastAPI · Next.js · MapLibre / deck.gl",
    proto: "This console plus a mock REST API with FastAPI-ready contracts.",
  },
];

const ENDPOINTS = [
  ["GET", "/api/nowcast", "Full 0–3 h nowcast (node and road time series, summary)"],
  ["GET", "/api/rainfall", "Rainfall current, accumulated, forecast; gauges"],
  ["GET", "/api/drainage", "Drain node snapshot at a clock time"],
  ["GET", "/api/flood-risk", "Road and sector risk at a clock time"],
  ["GET", "/api/alerts", "Alerts and recommended actions"],
  ["POST", "/api/routes", "Flood-aware routes (A/B/C)"],
  ["POST", "/api/scenarios", "Run a what-if scenario"],
  ["GET", "/api/analytics", "Historical event catalogue"],
  ["GET", "/api/system-health", "Component status and freshness"],
  ["GET", "/api/network", "Static city geodata (roads, drains, facilities)"],
];

const WHY = [
  ["Rainfall-only forecasts", "Cannot see drain surcharging or tidal / river backwater."],
  ["Coarse 3–12 km NWP grids", "One cell hides many low spots — we downscale with a 30 m DEM and the drain graph."],
  ["Static hazard maps", "Not refreshed as the storm evolves — we update every 5 minutes."],
  ["Warnings that stop at the alert", "We feed routing, evacuation and city workflows."],
];

export default function ArchitecturePage() {
  const city = useApp((s) => s.city);
  return (
    <div className="scroll-thin flex h-full flex-col gap-3 overflow-y-auto p-4">
      <PageHeader
        kicker="System / Architecture"
        title="From rainfall to action in five layers"
        subtitle="Rainfall forecasts alone are insufficient. The differentiator is the coupling: rainfall + terrain + urban surface + drainage graph, giving street-level flood prediction and an actionable response."
      />
      <div className="grid grid-cols-[1fr_380px] gap-3">
        <div className="rounded border border-line bg-surface p-5">
          {LAYERS.map((l, i) => (
            <div key={l.n}>
              <div className="grid grid-cols-[150px_1fr] gap-4 rounded border border-line bg-surface-2 px-4 py-3">
                <div>
                  <div className="text-xs text-fg-4">Layer {l.n}</div>
                  <div className="text-[15px] font-semibold text-fg">{l.title}</div>
                  <div className="mt-1 text-xs text-fg-3">{l.tech}</div>
                </div>
                <div className="flex min-w-0 flex-col justify-center gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {l.items.map((it) => (
                      <span key={it} className="rounded-sm border border-line bg-surface px-2 py-1 text-[13px] text-fg">
                        {it}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-fg-3">
                    <span className="font-medium text-fg-2">In this prototype: </span>
                    {l.proto}
                  </div>
                </div>
              </div>
              {i < LAYERS.length - 1 && <Connector />}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Why coupling matters">
            <dl className="divide-y divide-line">
              {WHY.map(([a, b]) => (
                <div key={a} className="py-2 first:pt-0 last:pb-0">
                  <dt className="text-[13px] font-medium text-fg">{a}</dt>
                  <dd className="text-[13px] text-fg-3">{b}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Mock API" subtitle="Same contracts the FastAPI service will implement" bodyClassName="p-0">
            {ENDPOINTS.map(([m, p, d]) => (
              <a
                key={p}
                href={m === "GET" ? `${p}?city=${city}` : undefined}
                target="_blank"
                rel="noreferrer"
                className={cx("flex items-start gap-2 border-t border-line px-3.5 py-2 first:border-t-0", m === "GET" ? "hover:bg-surface-2" : "cursor-default")}
              >
                <span className="w-10 shrink-0 font-mono text-xs text-fg-3">{m}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-accent">{p}</span>
                  <span className="block text-xs text-fg-3">{d}</span>
                </span>
                {m === "GET" && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-fg-4" />}
              </a>
            ))}
            <p className="border-t border-line px-3.5 py-2 text-xs text-fg-3">
              Set <span className="font-mono text-fg-2">NEXT_PUBLIC_API_BASE_URL</span> to point the UI at the FastAPI + PostGIS backend.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      {[20, 40, 60, 80].map((x, i) => (
        <line key={x} x1={x} y1={0} x2={x} y2={24} stroke="var(--accent)" strokeWidth={1.5} className="flow-dash" style={{ animationDelay: `${i * 0.2}s` }} vectorEffect="non-scaling-stroke" strokeOpacity={0.6} />
      ))}
    </svg>
  );
}
