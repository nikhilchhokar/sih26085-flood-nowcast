"use client";
import { useEffect, useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GitBranch, Network } from "lucide-react";
import { useApp } from "@/lib/store";
import { useClock, useNetwork, useNowcast } from "@/lib/hooks/data";
import { useApi } from "@/lib/hooks/useApi";
import { api } from "@/lib/api/client";
import { sample } from "@/lib/engine/analysis";
import { NOW_CLOCK, clockLabel } from "@/lib/engine/constants";
import { NODE_STATUS_COLOR, NODE_STATUS_LABEL, nodeStatus, utilColor } from "@/lib/engine/status";
import type { CityDataset, SimResult } from "@/lib/types";
import { FloodMap } from "@/components/map/DynamicMap";
import { Legend, MapToolbar, TimeBar } from "@/components/map/overlays";
import { DetailPanel } from "@/components/map/DetailPanel";
import { PageHeader, axisTick, chartTooltip } from "@/components/ui/PageHeader";
import { ErrorState, KV, Loading, Panel, Stat, Tag, Toggle } from "@/components/ui/primitives";

export default function DrainagePage() {
  const { data: ds, error } = useNetwork();
  const { data: now } = useNowcast();
  const clock = useClock();
  const layers = useApp((s) => s.layers);
  const setLayer = useApp((s) => s.setLayer);
  const setLayers = useApp((s) => s.setLayers);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const city = useApp((s) => s.city);
  const scenario = useApp((s) => s.appliedScenario);
  const focus = useApp((s) => s.mapFocus);

  useEffect(() => {
    setLayers({ drainage: true, roads: true, depth: false, risk: false, rain: false, flow: true, surcharge: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodeId = selection?.kind === "node" ? selection.id : (ds?.hero.nodeId ?? null);
  const bucket = Math.round(clock / 5) * 5;
  const { data: snap } = useApi(ds ? `drainage:${city}:${bucket}:${scenario ? JSON.stringify(scenario) : "b"}` : null, () => api.drainage(city, bucket, scenario), { keepPrevious: true });

  const table = useMemo(() => {
    if (!ds || !now) return [];
    const res = now.result;
    return ds.drainNodes
      .map((n, k) => {
        const u = sample(res.nodes.util[k], res, clock);
        const p = sample(res.nodes.pond[k], res, clock);
        return { n, u, p, level: sample(res.nodes.level[k], res, clock), flow: sample(res.nodes.flow[k], res, clock), st: nodeStatus(u, p) };
      })
      .sort((a, b) => b.p - a.p || b.u - a.u)
      .slice(0, 14);
  }, [ds, now, clock]);

  if (error) return <ErrorState error={error} />;
  return (
    <div className="flex h-full flex-col gap-2.5 p-2.5">
      <PageHeader
        kicker="Drainage network · directed graph"
        title="Stormwater Drainage Network"
        subtitle="Manholes, junctions and outfalls as a directed graph (upstream → downstream). Rain enters as runoff, fills pipes, and surcharges to the street when capacity is exceeded."
        right={
          <>
            <Tag tone="blue">Graph rebuilt from OSM + DEM</Tag>
            <Tag tone="amber">Synthetic pipe attributes</Tag>
          </>
        }
      />
      <div className="grid grid-cols-6 gap-2.5">
        <Stat value={ds?.drainNodes.length ?? "—"} label="Drain nodes" sub={`${ds?.drainNodes.filter((n) => n.kind === "outfall").length ?? 0} outfalls`} />
        <Stat value={ds?.drainEdges.length ?? "—"} label="Pipes / edges" sub={`${ds?.stats.drainKm ?? "—"} km of trunk drain`} />
        <Stat value={snap?.summary.surcharged ?? "—"} label="Surcharged" sub={`at ${clockLabel(clock)}`} tone={snap?.summary.surcharged ? "#ef4444" : "#22c55e"} />
        <Stat value={snap?.summary.warning ?? "—"} label="≥ 90% capacity" sub="warning" tone={snap?.summary.warning ? "#f97316" : undefined} />
        <Stat value={snap?.summary.blocked ?? "—"} label="Blocked nodes" sub="silt / debris ≥ 20%" tone="#f59e0b" />
        <Stat value={snap ? `${Math.round(snap.summary.meanUtil * 100)}` : "—"} unit="%" label="Mean utilisation" sub={snap && snap.summary.backwaterFactor > 0 ? `Outfall backwater ${Math.round(snap.summary.backwaterFactor * 100)}%` : "Outfalls discharging freely"} />
      </div>
      <div className="flex min-h-0 flex-1 gap-2.5">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-ink-700">
          {ds ? (
            <FloodMap ds={ds} res={now?.result} clock={clock} layers={layers} variant="drainage" selection={selection ?? (nodeId ? { kind: "node", id: nodeId } : null)} onSelect={select} focus={focus} showSectorLabels={false}>
              <div className="absolute top-3 left-3 z-10 w-52 rounded-lg border border-ink-600 bg-ink-900/92 px-3 py-2 shadow-xl">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-slate-300 uppercase">
                  <Network className="h-3.5 w-3.5 text-cyan-300" /> Drainage layers
                </div>
                <Toggle checked={layers.drainage} onChange={(v) => setLayer("drainage", v)} label="Show drainage network" />
                <Toggle checked={layers.flow} onChange={(v) => setLayer("flow", v)} label="Show flow" />
                <Toggle checked={layers.surcharge} onChange={(v) => setLayer("surcharge", v)} label="Show surcharge" />
                <Toggle checked={layers.blocked} onChange={(v) => setLayer("blocked", v)} label="Show blocked nodes" />
                <Toggle checked={layers.level} onChange={(v) => setLayer("level", v)} label="Show water level (3D)" />
                <div className="my-1 border-t border-ink-700" />
                <Toggle checked={layers.depth} onChange={(v) => setLayer("depth", v)} label="Street flooding" />
              </div>
              <MapToolbar />
              <Legend showDrain />
              <TimeBar />
              <DetailPanel ds={ds} res={now?.result} clock={clock} selection={selection} onClose={() => select(null)} onSelect={select} />
            </FloodMap>
          ) : (
            <Loading />
          )}
        </div>
        <div className="scroll-thin flex w-[400px] shrink-0 flex-col gap-2.5 overflow-y-auto">
          {ds && now && nodeId && <GraphView ds={ds} res={now.result} clock={clock} nodeId={nodeId} onSelect={(id) => select({ kind: "node", id })} />}
          {ds && now && nodeId && <NodeChart ds={ds} res={now.result} clock={clock} nodeId={nodeId} />}
          <Panel title={`Most loaded nodes · ${clockLabel(clock)}`} sim className="shrink-0" bodyClassName="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[9.5px] tracking-wider text-slate-500 uppercase">
                  <th className="px-3 py-1.5">Node</th>
                  <th className="px-1 py-1.5 text-right">Level</th>
                  <th className="px-1 py-1.5 text-right">Cap.</th>
                  <th className="px-1 py-1.5 text-right">Flow</th>
                  <th className="px-3 py-1.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {table.map(({ n, u, level, flow, st }) => (
                  <tr key={n.id} onClick={() => select({ kind: "node", id: n.id })} className="cursor-pointer border-t border-ink-700/60 hover:bg-ink-800">
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-cyan-200">{n.id}</span>
                      <span className="ml-1.5 text-[10px] text-slate-500">{ds?.sectors.find((s) => s.id === n.sectorId)?.name}</span>
                    </td>
                    <td className="px-1 py-1.5 text-right font-mono text-slate-300">{level.toFixed(1)} m</td>
                    <td className="px-1 py-1.5 text-right font-mono" style={{ color: utilColor(u) }}>
                      {Math.round(u * 100)}%
                    </td>
                    <td className="px-1 py-1.5 text-right font-mono text-slate-300">{flow.toFixed(1)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: NODE_STATUS_COLOR[st] }}>
                        {NODE_STATUS_LABEL[st]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ---------- directed-graph schematic around the selected node ---------- */
function GraphView({ ds, res, clock, nodeId, onSelect }: { ds: CityDataset; res: SimResult; clock: number; nodeId: string; onSelect: (id: string) => void }) {
  const byId = useMemo(() => new Map(ds.drainNodes.map((n, k) => [n.id, { n, k }])), [ds]);
  const center = byId.get(nodeId);
  if (!center) return null;
  // downstream chain to outfall (max 4) and upstream fan-in (max 5)
  const chain: string[] = [nodeId];
  let cur = center.n.downstream;
  while (cur && chain.length < 5) {
    chain.push(cur);
    cur = byId.get(cur)?.n.downstream ?? null;
  }
  const ups = [...center.n.upstream]
    .map((id) => byId.get(id)!)
    .filter(Boolean)
    .sort((a, b) => b.n.upstreamHa - a.n.upstreamHa)
    .slice(0, 4)
    .map((x) => x.n.id);
  const W = 380;
  const H = 190;
  const pos = new Map<string, [number, number]>();
  const colX = (i: number) => 40 + i * ((W - 80) / Math.max(1, chain.length));
  chain.forEach((id, i) => pos.set(id, [colX(i + 1), 110]));
  ups.forEach((id, i) => pos.set(id, [colX(0), ups.length === 1 ? 110 : 26 + i * (126 / (ups.length - 1))]));
  const util = (id: string) => {
    const e = byId.get(id);
    return e ? sample(res.nodes.util[e.k], res, clock) : 0;
  };
  const pond = (id: string) => {
    const e = byId.get(id);
    return e ? sample(res.nodes.pond[e.k], res, clock) : 0;
  };
  const edges: [string, string][] = [...ups.map((u) => [u, nodeId] as [string, string]), ...chain.slice(0, -1).map((c, i) => [c, chain[i + 1]] as [string, string])];
  const last = byId.get(chain[chain.length - 1])!.n;
  return (
    <Panel title="Directed drainage graph" subtitle={`Upstream → ${nodeId} → outfall`} icon={<GitBranch className="h-3.5 w-3.5" />} sim className="shrink-0" bodyClassName="p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>
        {edges.map(([a, b]) => {
          const [x1, y1] = pos.get(a)!;
          const [x2, y2] = pos.get(b)!;
          const u = util(a);
          return (
            <g key={`${a}-${b}`}>
              <line x1={x1} y1={y1} x2={x2 - 14} y2={y2 + (y1 - y2) * (14 / Math.hypot(x2 - x1, y2 - y1))} stroke="#334155" strokeWidth={4} markerEnd="url(#arr)" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={utilColor(u)} strokeWidth={2} className="flow-dash" opacity={0.9} />
            </g>
          );
        })}
        {[...pos.entries()].map(([id, [x, y]]) => {
          const u = util(id);
          const p = pond(id);
          const isC = id === nodeId;
          return (
            <g key={id} onClick={() => onSelect(id)} className="cursor-pointer">
              {p >= 0.05 && <circle cx={x} cy={y} r={isC ? 20 : 15} fill="none" stroke="#ef4444" strokeWidth={2} opacity={0.6} className="blink-soft" />}
              <circle cx={x} cy={y} r={isC ? 14 : 10} fill={utilColor(u)} stroke={isC ? "#22d3ee" : "#0a1222"} strokeWidth={isC ? 3 : 2} />
              <text x={x} y={y + (isC ? 30 : 24)} textAnchor="middle" className="fill-slate-300 font-mono" fontSize={9.5}>
                {id}
              </text>
              <text x={x} y={y + 3.5} textAnchor="middle" className="fill-white font-mono font-bold" fontSize={isC ? 9 : 7.5}>
                {Math.round(u * 100)}
              </text>
            </g>
          );
        })}
        <text x={W - 6} y={H - 6} textAnchor="end" fontSize={9} className="fill-slate-500">
          {last.kind === "outfall" ? `→ ${last.outfallName}` : "→ continues downstream"}
        </text>
      </svg>
      <div className="grid grid-cols-2 gap-x-4 px-1">
        <KV k="Upstream area" v={`${center.n.upstreamHa.toFixed(0)} ha`} />
        <KV k="Upstream nodes" v={center.n.upstream.length} />
        <KV k="Design capacity" v={`${center.n.capacity.toFixed(1)} m³/s`} />
        <KV k="Blockage" v={`${Math.round(center.n.blockage * 100)}%`} tone={center.n.blockage >= 0.2 ? "#f59e0b" : undefined} />
      </div>
    </Panel>
  );
}

function NodeChart({ ds, res, clock, nodeId }: { ds: CityDataset; res: SimResult; clock: number; nodeId: string }) {
  const data = useMemo(() => {
    const k = ds.drainNodes.findIndex((n) => n.id === nodeId);
    const n = ds.drainNodes[k];
    const dk = n?.downstream ? ds.drainNodes.findIndex((x) => x.id === n.downstream) : -1;
    const out: { c: number; node: number; down: number | null; rain: number }[] = [];
    for (let c = NOW_CLOCK - 60; c <= NOW_CLOCK + 180; c += 5) {
      out.push({
        c,
        node: Math.round(sample(res.nodes.util[k], res, c) * 100),
        down: dk >= 0 ? Math.round(sample(res.nodes.util[dk], res, c) * 100) : null,
        rain: Math.round(sample(res.rainMean, res, c)),
      });
    }
    return { out, down: n?.downstream };
  }, [ds, res, nodeId]);
  return (
    <Panel title="Rainfall → drain loading" subtitle={`${nodeId} vs downstream ${data.down ?? "—"}`} sim className="shrink-0" bodyClassName="p-2">
      <div className="h-40">
        <ResponsiveContainer>
          <LineChart data={data.out} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#1c2a48" vertical={false} />
            <XAxis dataKey="c" type="number" domain={["dataMin", "dataMax"]} ticks={[NOW_CLOCK - 60, NOW_CLOCK, NOW_CLOCK + 60, NOW_CLOCK + 120, NOW_CLOCK + 180]} tickFormatter={clockLabel} tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip {...chartTooltip} labelFormatter={(v) => clockLabel(Number(v))} />
            <ReferenceLine y={90} stroke="#f97316" strokeDasharray="3 3" />
            <ReferenceLine x={clock} stroke="#22d3ee" />
            <Line dataKey="rain" name="Rain (mm/hr)" stroke="#22d3ee" strokeOpacity={0.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            <Line dataKey="node" name={`${nodeId} %`} stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="down" name="Downstream %" stroke="#60a5fa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="px-1 text-[10.5px] text-slate-500">The coupling: rainfall peaks first, the drain loads with a lag, and surcharge follows once the chamber fills.</p>
    </Panel>
  );
}
