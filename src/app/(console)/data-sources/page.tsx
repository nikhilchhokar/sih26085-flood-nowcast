"use client";
import { Database, Map as MapIcon, RotateCcw, Settings, TriangleAlert } from "lucide-react";
import { useApp, type Basemap } from "@/lib/store";
import { useNetwork } from "@/lib/hooks/data";
import { API_BASE } from "@/lib/api/client";
import { BASEMAPS } from "@/components/map/basemap";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, KV, Panel, Tag, Toggle, cx } from "@/components/ui/primitives";

type Mode = "LIVE" | "STATIC" | "SIMULATED";
const SOURCES: { cat: string; intended: string; proto: string; mode: Mode; note: string }[] = [
  { cat: "Rainfall", intended: "IMD Doppler radar / AWS gauges", proto: "Simulated storm (moving convective cell + hyetograph)", mode: "SIMULATED", note: "Replace with IMD radar mosaic + AWS API; gauge bias correction" },
  { cat: "Terrain", intended: "Bhuvan CartoDEM / Copernicus GLO-30", proto: "SRTM 30 m sampled via OpenTopoData, smoothed", mode: "STATIC", note: "Real elevation snapshot; production uses GLO-30" },
  { cat: "Roads", intended: "OpenStreetMap", proto: "OSM snapshot (Overpass), segmented into modelled roads", mode: "STATIC", note: "Real geometry & names" },
  { cat: "Drainage network", intended: "Municipal drain inventory + OSM", proto: "Graph rebuilt from OSM roads + DEM; pipe attributes synthetic", mode: "SIMULATED", note: "“Rebuild missing drain graph from DEM + OSM” (slide 4)" },
  { cat: "Emergency facilities", intended: "OSM / municipal GIS", proto: "OSM hospitals, fire & police stations; shelters = demo designation", mode: "STATIC", note: "Real locations; shelter designation illustrative" },
  { cat: "Land use", intended: "Urban GIS / Bhuvan LULC", proto: "OSM land cover + road-density proxy", mode: "STATIC", note: "Imperviousness per catchment" },
  { cat: "Water level", intended: "Drain level sensors (IoT)", proto: "From the demo engine", mode: "SIMULATED", note: "—" },
  { cat: "Hydraulic simulation", intended: "SWMM / HEC-RAS 2D", proto: "Simplified coupled engine (TypeScript)", mode: "SIMULATED", note: "Training data generator in production" },
  { cat: "ML", intended: "PyTorch / PyTorch Geometric (PI-GNN)", proto: "Not trained — engine stand-in", mode: "SIMULATED", note: "See Model Performance" },
  { cat: "Spatial processing", intended: "GeoPandas / PostGIS", proto: "Node build pipeline (scripts/build-dataset.ts)", mode: "STATIC", note: "Same operations, pre-computed" },
  { cat: "Backend", intended: "FastAPI", proto: "Next.js mock routes with identical contracts", mode: "SIMULATED", note: "Swap via NEXT_PUBLIC_API_BASE_URL" },
  { cat: "Visualization", intended: "MapLibre / deck.gl", proto: "MapLibre GL + deck.gl (live)", mode: "LIVE", note: "Basemap tiles: OpenFreeMap (live) with offline fallback" },
  { cat: "Frontend", intended: "Next.js", proto: "Next.js + TypeScript + Tailwind", mode: "LIVE", note: "This application" },
];
const TONE = { LIVE: "green", STATIC: "blue", SIMULATED: "amber" } as const;

export default function DataSourcesPage() {
  const { data: ds } = useNetwork();
  const basemap = useApp((s) => s.basemap);
  const setBasemap = useApp((s) => s.setBasemap);
  const flags = useApp((s) => s.flags);
  const setFlag = useApp((s) => s.setFlag);
  const reset = useApp((s) => s.resetOperationalState);
  const toast = useApp((s) => s.toast);

  return (
    <div className="scroll-thin flex h-full flex-col gap-2.5 overflow-y-auto p-2.5">
      <PageHeader
        kicker="Settings / data sources"
        title="Data Sources & Settings"
        subtitle="Intended production architecture vs what this prototype actually uses — clearly marked LIVE, STATIC or SIMULATED."
        right={
          <div className="flex gap-1.5">
            <Tag tone="green">Live</Tag>
            <Tag tone="blue">Static snapshot</Tag>
            <Tag tone="amber">Simulated</Tag>
          </div>
        }
      />
      <div className="grid grid-cols-[1fr_360px] gap-2.5">
        <Panel title="Source architecture" icon={<Database className="h-3.5 w-3.5" />} bodyClassName="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[9.5px] tracking-wider text-slate-500 uppercase">
                <th className="px-3 py-2">Category</th>
                <th className="px-2 py-2">Intended source</th>
                <th className="px-2 py-2">In this prototype</th>
                <th className="px-2 py-2">Mode</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.cat} className="border-t border-ink-700/60 align-top">
                  <td className="px-3 py-2 font-semibold text-white">{s.cat}</td>
                  <td className="px-2 py-2 text-slate-300">{s.intended}</td>
                  <td className="px-2 py-2 text-slate-400">{s.proto}</td>
                  <td className="px-2 py-2">
                    <Tag tone={TONE[s.mode]}>{s.mode}</Tag>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="flex flex-col gap-2.5">
          <Panel title="Basemap" icon={<MapIcon className="h-3.5 w-3.5" />} className="shrink-0">
            <div className="space-y-1.5">
              {(Object.keys(BASEMAPS) as Basemap[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBasemap(b)}
                  className={cx("w-full rounded-lg border px-3 py-2 text-left", basemap === b ? "border-cyan-400/60 bg-cyan-400/10" : "border-ink-700 bg-ink-850 hover:border-ink-500")}
                >
                  <div className="text-xs font-semibold text-white">{BASEMAPS[b].label}</div>
                  <div className="text-[11px] text-slate-500">{BASEMAPS[b].note}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] text-slate-500">Tip for the venue: choose the offline schematic if Wi-Fi is unreliable — every screen keeps working.</p>
          </Panel>
          <Panel title="Demo controls" icon={<Settings className="h-3.5 w-3.5" />} className="shrink-0">
            <Toggle checked={flags.radarOutage} onChange={(v) => setFlag("radarOutage", v)} label="Simulate IMD radar outage" />
            <Toggle checked={flags.awsDelay} onChange={(v) => setFlag("awsDelay", v)} label="Simulate AWS gauge delay" />
            <Button
              className="mt-2 w-full"
              onClick={() => {
                reset();
                toast({ tone: "success", title: "Demo state reset", body: "Alerts, actions, incidents, log and layers restored." });
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset operational state
            </Button>
          </Panel>
          <Panel title="Dataset snapshot" className="shrink-0">
            <KV k="City" v={ds ? `${ds.name} · ${ds.pilotArea}` : "—"} />
            <KV k="Area" v={ds ? `${ds.stats.areaKm2} km²` : "—"} />
            <KV k="Road segments" v={ds?.roads.length} />
            <KV k="Drain nodes / pipes" v={ds ? `${ds.drainNodes.length} / ${ds.drainEdges.length}` : "—"} />
            <KV k="Facilities" v={ds?.pois.length} />
            <KV k="OSM snapshot" v={ds ? new Date(ds.fetchedAt).toLocaleDateString("en-GB") : "—"} />
            <KV k="API base" v={<span className="font-mono">{API_BASE}</span>} />
            <p className="mt-2 text-[10.5px] text-slate-500">{ds?.attribution.osm} · {ds?.attribution.dem}</p>
          </Panel>
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[11px] text-amber-200/90">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Flood depths, drain states, alerts and historical events are simulated for demonstration and must not be used for real decisions.
          </div>
        </div>
      </div>
    </div>
  );
}
