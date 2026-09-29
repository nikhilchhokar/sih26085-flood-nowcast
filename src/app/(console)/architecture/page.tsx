"use client";
import { ArrowUpRight, BrainCircuit, CloudRain, Database, Layers, Siren, WavesHorizontal } from "lucide-react";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, Tag, cx } from "@/components/ui/primitives";

const LAYERS = [
  {
    n: 1,
    title: "Data sources",
    icon: CloudRain,
    color: "#22d3ee",
    items: ["Radar", "AWS", "DEM", "Land use", "Drainage", "Historical events"],
    tech: ["IMD", "Bhuvan / Copernicus", "OpenStreetMap"],
    proto: "OSM roads & facilities + SRTM 30 m (real snapshot) · rainfall & drain state simulated",
  },
  {
    n: 2,
    title: "Data fusion",
    icon: Database,
    color: "#60a5fa",
    items: ["Cleaning", "Normalization", "Spatial alignment", "Graph construction"],
    tech: ["GeoPandas", "PostGIS"],
    proto: "Implemented as a build pipeline: DEM smoothing, road segmentation, drain graph rebuilt from OSM + DEM",
  },
  {
    n: 3,
    title: "Modelling",
    icon: BrainCircuit,
    color: "#a78bfa",
    items: ["Hydraulic simulation", "Physics-informed GNN", "Rainfall–drainage coupling"],
    tech: ["SWMM", "HEC-RAS 2D", "PyTorch Geometric"],
    proto: "Simplified coupled engine (runoff → graph routing → surcharge → ponding) stands in for PI-GNN",
  },
  {
    n: 4,
    title: "Nowcast",
    icon: WavesHorizontal,
    color: "#f97316",
    items: ["Flood depth", "Flood probability", "Time to impact"],
    tech: ["5-min cycle", "0–3 h horizon"],
    proto: "Street-level depth, exceedance probability and onset computed per road segment",
  },
  {
    n: 5,
    title: "Action",
    icon: Siren,
    color: "#34d399",
    items: ["Alerts", "Routing", "Evacuation", "City dashboard", "API"],
    tech: ["FastAPI", "Next.js", "MapLibre / deck.gl"],
    proto: "This console + mock REST API with FastAPI-ready contracts",
  },
];

const ENDPOINTS = [
  ["GET", "/api/nowcast", "Full 0–3 h nowcast (node & road time series, summary)"],
  ["GET", "/api/rainfall", "Rainfall current / accumulated / forecast, gauges"],
  ["GET", "/api/drainage", "Drain node snapshot at a clock time"],
  ["GET", "/api/flood-risk", "Road & sector risk at a clock time"],
  ["GET", "/api/alerts", "Alerts + recommended actions"],
  ["POST", "/api/routes", "Flood-aware routes (A/B/C)"],
  ["POST", "/api/scenarios", "Run a what-if scenario"],
  ["GET", "/api/analytics", "Historical event catalogue"],
  ["GET", "/api/system-health", "Component status & freshness"],
  ["GET", "/api/network", "Static city geodata (roads, drains, facilities)"],
];

export default function ArchitecturePage() {
  const city = useApp((s) => s.city);
  return (
    <div className="scroll-thin flex h-full flex-col gap-2.5 overflow-y-auto p-2.5">
      <PageHeader
        kicker="Technical architecture"
        title="From rainfall to action — five layers"
        subtitle="Rainfall forecast alone is insufficient. The differentiator is the coupling: Rainfall + Terrain + Urban surface + Drainage graph → street-level flood prediction → actionable response."
      />
      <div className="grid grid-cols-[1fr_380px] gap-2.5">
        <div className="rounded-xl border border-ink-700 bg-ink-900/90 p-4">
          {LAYERS.map((l, i) => (
            <div key={l.n}>
              <div className="flex items-stretch gap-3 rounded-xl border bg-ink-850 p-3" style={{ borderColor: l.color + "55" }}>
                <div className="flex w-36 shrink-0 flex-col justify-center border-r border-ink-700 pr-3">
                  <div className="font-mono text-[10px] font-bold tracking-[0.2em]" style={{ color: l.color }}>
                    LAYER {l.n}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide text-white uppercase">
                    <l.icon className="h-4 w-4" style={{ color: l.color }} />
                    {l.title}
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {l.items.map((it) => (
                      <span key={it} className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs font-medium text-slate-200">
                        {it}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-400">In this prototype: </span>
                    {l.proto}
                  </div>
                </div>
                <div className="flex w-44 shrink-0 flex-wrap content-center justify-end gap-1">
                  {l.tech.map((t) => (
                    <Tag key={t} tone="slate">
                      {t}
                    </Tag>
                  ))}
                </div>
              </div>
              {i < LAYERS.length - 1 && <Connector from={l.color} to={LAYERS[i + 1].color} />}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <Panel title="Why coupling matters" icon={<Layers className="h-3.5 w-3.5" />}>
            <div className="space-y-2 text-[12.5px] leading-relaxed text-slate-300">
              <Row a="Rainfall-only forecasts" b="Cannot see drain surcharging or tidal / river backwater" />
              <Row a="Coarse 3–12 km NWP grids" b="One cell hides many micro-topographic zones — we downscale with a 30 m DEM + drain graph" />
              <Row a="Static hazard maps" b="Not refreshed as the storm evolves — we update every 5 min" />
              <Row a="Warnings stop at the alert" b="We feed routing, evacuation and city workflows" />
            </div>
          </Panel>
          <Panel title="Mock API (FastAPI-ready)" icon={<Database className="h-3.5 w-3.5" />} bodyClassName="p-0">
            {ENDPOINTS.map(([m, p, d]) => (
              <a
                key={p}
                href={m === "GET" ? `${p}?city=${city}` : undefined}
                target="_blank"
                rel="noreferrer"
                className={cx("flex items-start gap-2 border-t border-ink-700/60 px-3 py-1.5 first:border-t-0", m === "GET" ? "hover:bg-ink-800" : "cursor-default")}
              >
                <span className={cx("w-10 shrink-0 font-mono text-[10px] font-bold", m === "GET" ? "text-emerald-400" : "text-amber-400")}>{m}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-cyan-200">{p}</span>
                  <span className="block text-[10.5px] text-slate-500">{d}</span>
                </span>
                {m === "GET" && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />}
              </a>
            ))}
            <p className="border-t border-ink-700/60 px-3 py-2 text-[10.5px] text-slate-500">
              Set <span className="font-mono text-slate-300">NEXT_PUBLIC_API_BASE_URL</span> to point the UI at the FastAPI + PostGIS backend — no UI changes needed.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ a, b }: { a: string; b: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
      <div className="text-[10.5px] font-bold tracking-wider text-red-300/80 uppercase line-through decoration-red-400/50">{a}</div>
      <div className="text-slate-200">{b}</div>
    </div>
  );
}

function Connector({ from, to }: { from: string; to: string }) {
  const xs = [12, 30, 50, 70, 88];
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full">
      <defs>
        <linearGradient id={`c-${from}-${to}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      {xs.map((x, i) => (
        <line key={x} x1={x} y1={0} x2={x} y2={30} stroke={`url(#c-${from}-${to})`} strokeWidth={2} className="flow-dash" style={{ animationDelay: `${i * 0.18}s` }} vectorEffect="non-scaling-stroke" strokeOpacity={0.9} />
      ))}
    </svg>
  );
}
