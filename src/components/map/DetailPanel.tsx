"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CloudRain, Droplets, Hospital, MapPin, Navigation, Route, Siren, X } from "lucide-react";
import type { CityDataset, RiskLevel, SimResult } from "@/lib/types";
import type { Selection } from "@/lib/store";
import { HORIZON_MIN, NOW_CLOCK, RISK_COLOR, RISK_TEXT, UNSAFE_DEPTH, clockLabel, riskOf } from "@/lib/engine/constants";
import { exceedance, maxOver, onsetClock, sample, sectorImpacts } from "@/lib/engine/analysis";
import { RainField } from "@/lib/engine/rain";
import { nodeStatus, NODE_STATUS_COLOR, NODE_STATUS_LABEL } from "@/lib/engine/status";
import { KV, Meter, RiskBadge, SimTag, Tag, cx } from "../ui/primitives";

export const ROAD_ACTION: Record<RiskLevel, string> = {
  safe: "No action required. Continue monitoring.",
  low: "Advisory: slow traffic expected; clear roadside inlets.",
  moderate: "Deploy traffic marshals, warn two-wheelers, pre-position barricades.",
  high: "Restrict traffic and activate alternate route.",
  critical: "Close road, divert all traffic, deploy pumps and rescue team.",
};

function Spark({ res, series, clock, threshold, unit, color = "#22d3ee", max }: { res: SimResult; series: number[]; clock: number; threshold?: number; unit: string; color?: string; max?: number }) {
  const data = useMemo(() => {
    const out: { c: number; v: number }[] = [];
    for (let c = NOW_CLOCK - 60; c <= NOW_CLOCK + HORIZON_MIN; c += 5) out.push({ c, v: Math.round(sample(series, res, c) * 100) / 100 });
    return out;
  }, [res, series]);
  return (
    <div className="h-24 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1c2a48" vertical={false} />
          <XAxis dataKey="c" type="number" domain={["dataMin", "dataMax"]} ticks={[NOW_CLOCK - 60, NOW_CLOCK, NOW_CLOCK + 60, NOW_CLOCK + 120, NOW_CLOCK + 180]} tickFormatter={clockLabel} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, max ?? "auto"]} />
          <Tooltip
            contentStyle={{ background: "#0d172b", border: "1px solid #273a5f", borderRadius: 8, fontSize: 11 }}
            labelFormatter={(v) => clockLabel(Number(v))}
            formatter={(v) => [`${v} ${unit}`, ""]}
          />
          {threshold != null && <ReferenceLine y={threshold} stroke="#f97316" strokeDasharray="3 3" />}
          <ReferenceLine x={NOW_CLOCK} stroke="#94a3b8" strokeDasharray="2 2" />
          <ReferenceLine x={clock} stroke="#22d3ee" />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#g-${color})`} isAnimationActive={false} />
          <Line dataKey="v" stroke="transparent" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DetailPanel({
  ds,
  res,
  clock,
  selection,
  onClose,
  onSelect,
  className,
  offsetTop = 12,
}: {
  ds: CityDataset;
  res: SimResult | null | undefined;
  clock: number;
  selection: Selection | null | undefined;
  onClose: () => void;
  onSelect?: (s: Selection) => void;
  className?: string;
  offsetTop?: number;
}) {
  if (!selection || !res) return null;
  return (
    <aside
      className={cx("slide-up absolute right-14 z-20 w-80 overflow-y-auto rounded-xl border border-ink-600 bg-ink-900/96 shadow-2xl backdrop-blur scroll-thin", className)}
      style={{ top: offsetTop, maxHeight: `calc(100% - ${offsetTop + 104}px)` }}
    >
      <button type="button" onClick={onClose} className="absolute top-2.5 right-2.5 rounded p-1 text-slate-400 hover:bg-ink-700 hover:text-white" aria-label="Close details">
        <X className="h-4 w-4" />
      </button>
      <div className="p-3.5">
        <Body ds={ds} res={res} clock={clock} selection={selection} onSelect={onSelect} />
      </div>
    </aside>
  );
}

function Header({ icon, kicker, title, badge }: { icon: React.ReactNode; kicker: string; title: string; badge?: React.ReactNode }) {
  return (
    <div className="mb-3 pr-6">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-slate-500 uppercase">
        {icon}
        {kicker}
        <SimTag />
      </div>
      <h3 className="mt-1 text-[15px] leading-snug font-semibold text-white">{title}</h3>
      {badge && <div className="mt-1.5">{badge}</div>}
    </div>
  );
}

function Body({ ds, res, clock, selection, onSelect }: { ds: CityDataset; res: SimResult; clock: number; selection: Selection; onSelect?: (s: Selection) => void }) {
  const field = useMemo(() => new RainField(ds, res.params), [ds, res]);
  const lead = Math.max(0, clock - NOW_CLOCK);

  if (selection.kind === "road") {
    const ri = ds.roads.findIndex((r) => r.id === selection.id);
    if (ri < 0) return <p className="text-xs text-slate-400">Road not found.</p>;
    const r = ds.roads[ri];
    const series = res.roads.depth[ri];
    const d = sample(series, res, clock);
    const risk = riskOf(d);
    const on = onsetClock(series, res, NOW_CLOCK, UNSAFE_DEPTH);
    const pk = maxOver(series, res, NOW_CLOCK, NOW_CLOCK + HORIZON_MIN);
    const ni = ds.drainNodes.findIndex((n) => n.id === r.nodeId);
    const util = ni >= 0 ? sample(res.nodes.util[ni], res, clock) : 0;
    const mid = r.coords[Math.floor(r.coords.length / 2)];
    const rain = field.at(mid[0], mid[1], clock);
    const peakRisk = riskOf(pk.max);
    const actRisk = riskOf(Math.max(d, pk.max * 0.9));
    return (
      <>
        <Header icon={<Route className="h-3 w-3" />} kicker={`Road · ${r.id}`} title={r.label} badge={<div className="flex items-center gap-2"><RiskBadge level={risk} /><span className="text-[11px] text-slate-500">at {clockLabel(clock)}</span></div>} />
        <div className="grid grid-cols-2 gap-2">
          <Big label="Predicted depth" value={`${d.toFixed(2)} m`} color={RISK_TEXT[risk]} />
          <Big label="Expected onset" value={on == null ? "—" : on <= NOW_CLOCK ? "Now" : `${Math.round(on - NOW_CLOCK)} min`} color={on == null ? undefined : "#f97316"} />
          <Big label="Peak depth" value={`${pk.max.toFixed(2)} m`} sub={`at ${clockLabel(pk.clock)}`} color={RISK_TEXT[peakRisk]} />
          <Big label="P(depth > 0.3 m)" value={`${Math.round(exceedance(d, lead) * 100)}%`} />
        </div>
        <div className="mt-3 divide-y divide-ink-700/60">
          <KV k="Flood risk" v={<RiskBadge level={risk} size="xs" />} />
          <KV
            k="Drain node"
            v={
              <button type="button" className="font-mono text-cyan-300 hover:underline" onClick={() => onSelect?.({ kind: "node", id: r.nodeId })}>
                {r.nodeId}
              </button>
            }
          />
          <KV k="Drain utilisation" v={`${Math.round(util * 100)}%`} tone={util >= 0.9 ? "#f97316" : undefined} />
          <KV k="Rainfall" v={`${Math.round(rain)} mm/hr`} />
          <KV k="Class · length" v={`${r.cls}${(r as { structure?: string }).structure ? ` (${(r as { structure?: string }).structure})` : ""} · ${r.lengthM} m`} />
          <KV k="Relative lowness" v={`${Math.round(r.relLow * 100)}%`} />
        </div>
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">Depth forecast (m)</div>
          <Spark res={res} series={series} clock={clock} threshold={UNSAFE_DEPTH} unit="m" color={RISK_COLOR[peakRisk === "safe" ? "low" : peakRisk]} />
        </div>
        <div className="mt-3 rounded-lg border p-2.5" style={{ borderColor: RISK_COLOR[actRisk] + "66", background: RISK_COLOR[actRisk] + "14" }}>
          <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Recommended action</div>
          <p className="mt-0.5 text-[13px] font-medium text-white">{ROAD_ACTION[actRisk]}</p>
        </div>
      </>
    );
  }

  if (selection.kind === "node") {
    const ni = ds.drainNodes.findIndex((n) => n.id === selection.id);
    if (ni < 0) return <p className="text-xs text-slate-400">Node not found.</p>;
    const n = ds.drainNodes[ni];
    const util = sample(res.nodes.util[ni], res, clock);
    const pond = sample(res.nodes.pond[ni], res, clock);
    const st = nodeStatus(util, pond);
    const di = n.downstream ? ds.drainNodes.findIndex((x) => x.id === n.downstream) : -1;
    const downUtil = di >= 0 ? sample(res.nodes.util[di], res, clock) : 0;
    const bw = di >= 0 ? downUtil >= 0.97 : res.params.backwater;
    const risk: RiskLevel = pond >= 0.5 ? "critical" : pond >= 0.05 ? "high" : util >= 0.9 ? "moderate" : util >= 0.75 ? "low" : "safe";
    const surchargeOn = onsetClock(res.nodes.pond[ni], res, NOW_CLOCK, 0.05);
    return (
      <>
        <Header
          icon={<Droplets className="h-3 w-3" />}
          kicker={`Drainage node · ${n.kind}`}
          title={n.id}
          badge={
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase" style={{ color: NODE_STATUS_COLOR[st], borderColor: NODE_STATUS_COLOR[st] + "66" }}>
                Surcharge: {st === "surcharged" ? "ACTIVE" : st === "warning" ? "WARNING" : st === "watch" ? "WATCH" : "NONE"}
              </span>
              <RiskBadge level={risk} size="xs" />
            </div>
          }
        />
        <div className="grid grid-cols-2 gap-2">
          <Big label="Water level" value={`${sample(res.nodes.level[ni], res, clock).toFixed(2)} m`} sub={`of ${n.maxDepth.toFixed(1)} m chamber`} />
          <Big label="Capacity used" value={`${Math.round(util * 100)}%`} color={util >= 0.9 ? "#f97316" : "#38bdf8"} />
          <Big label="Flow" value={`${sample(res.nodes.flow[ni], res, clock).toFixed(1)} m³/s`} sub={`design ${n.capacity.toFixed(1)}`} />
          <Big label="Upstream rain" value={`${Math.round(field.at(n.coord[0], n.coord[1], clock))} mm/hr`} />
        </div>
        <Meter value={util} className="mt-3" color={util >= 1 ? "#dc2626" : util >= 0.9 ? "#f97316" : util >= 0.75 ? "#eab308" : "#38bdf8"} />
        <div className="mt-3 divide-y divide-ink-700/60">
          <KV k="Status" v={NODE_STATUS_LABEL[st]} tone={NODE_STATUS_COLOR[st]} />
          <KV
            k="Downstream"
            v={
              n.downstream ? (
                <span>
                  <button type="button" className="font-mono text-cyan-300 hover:underline" onClick={() => onSelect?.({ kind: "node", id: n.downstream! })}>
                    {n.downstream}
                  </button>
                  {bw && <span className="ml-1.5 text-amber-300">· backwater detected</span>}
                </span>
              ) : (
                <span>
                  Outfall — {n.outfallName}
                  {bw && <span className="ml-1 text-amber-300">(backwater)</span>}
                </span>
              )
            }
          />
          <KV k="Upstream nodes" v={n.upstream.length} />
          <KV k="Surcharge forecast" v={surchargeOn == null ? "Not expected" : surchargeOn <= NOW_CLOCK ? "Active now" : `in ${Math.round(surchargeOn - NOW_CLOCK)} min (${clockLabel(surchargeOn)})`} />
          <KV k="Surface ponding" v={`${pond.toFixed(2)} m`} />
          <KV k="Blockage (silt/debris)" v={`${Math.round(n.blockage * 100)}%`} tone={n.blockage >= 0.2 ? "#f59e0b" : undefined} />
          <KV k="Catchment · upstream" v={`${n.catchmentHa.toFixed(0)} ha · ${n.upstreamHa.toFixed(0)} ha`} />
          <KV k="Connected roads" v={`${n.roadIds.length} (highlighted)`} />
        </div>
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">Capacity used (%)</div>
          <Spark res={res} series={res.nodes.util[ni].map((v) => v * 100)} clock={clock} threshold={90} unit="%" color="#38bdf8" max={100} />
        </div>
      </>
    );
  }

  if (selection.kind === "sector") {
    const s = ds.sectors.find((x) => x.id === selection.id);
    if (!s) return null;
    const imp = sectorImpacts(ds, res, clock).find((x) => x.id === s.id)!;
    const peakImp = (() => {
      let best = imp;
      for (let c = NOW_CLOCK; c <= NOW_CLOCK + HORIZON_MIN; c += 15) {
        const x = sectorImpacts(ds, res, c).find((y) => y.id === s.id)!;
        if (x.popAtRisk > best.popAtRisk) best = x;
      }
      return best;
    })();
    const infra = ds.pois.filter((p) => p.sectorId === s.id);
    return (
      <>
        <Header icon={<MapPin className="h-3 w-3" />} kicker="Ward / sector" title={`${s.name} · ${s.locality}`} badge={<RiskBadge level={imp.risk} />} />
        <div className="grid grid-cols-2 gap-2">
          <Big label="Population" value={s.population.toLocaleString("en-IN")} />
          <Big label="Affected now" value={imp.popAtRisk.toLocaleString("en-IN")} color={imp.popAtRisk ? "#f97316" : undefined} sub={`peak ${peakImp.popAtRisk.toLocaleString("en-IN")}`} />
          <Big label="Max road depth" value={`${imp.maxDepth.toFixed(2)} m`} color={RISK_TEXT[riskOf(imp.maxDepth)]} />
          <Big label="Unsafe roads" value={String(imp.roadsUnsafe)} />
        </div>
        <div className="mt-3 divide-y divide-ink-700/60">
          <KV k="Area" v={`${s.areaKm2.toFixed(2)} km²`} />
          <KV k="Impervious surface" v={`${Math.round(s.impervious * 100)}%`} />
          <KV k="Mean elevation" v={`${s.meanElev.toFixed(1)} m`} />
          <KV k="Flooded area" v={`${imp.floodedAreaPct.toFixed(1)}%`} />
        </div>
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">Infrastructure in sector</div>
          {infra.length ? (
            <ul className="space-y-1">
              {infra.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onSelect?.({ kind: "poi", id: p.id })} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-slate-300 hover:bg-ink-800">
                    <Tag tone={p.kind === "hospital" ? "red" : p.kind === "shelter" ? "green" : p.kind === "fire" ? "amber" : "blue"}>{p.kind}</Tag>
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">No mapped facilities.</p>
          )}
        </div>
        <Link href="/evacuation" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:underline">
          Plan evacuation for {s.name} →
        </Link>
      </>
    );
  }

  if (selection.kind === "rain") {
    const [lon, lat] = selection.coord;
    const now = field.at(lon, lat, NOW_CLOCK);
    const at = field.at(lon, lat, clock);
    let mx = 0;
    let mxc = NOW_CLOCK;
    for (let c = NOW_CLOCK; c <= NOW_CLOCK + HORIZON_MIN; c += 5) {
      const v = field.at(lon, lat, c);
      if (v > mx) {
        mx = v;
        mxc = c;
      }
    }
    let acc = 0;
    for (let c = NOW_CLOCK - 60; c < NOW_CLOCK; c += 2) acc += field.at(lon, lat, c + 1) / 30;
    return (
      <>
        <Header icon={<CloudRain className="h-3 w-3" />} kicker="Rainfall cell (radar pixel)" title={`${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`} />
        <div className="grid grid-cols-2 gap-2">
          <Big label="Now" value={`${Math.round(now)} mm/hr`} color="#22d3ee" />
          <Big label={`At ${clockLabel(clock)}`} value={`${Math.round(at)} mm/hr`} color="#22d3ee" />
          <Big label="Peak (next 3 h)" value={`${Math.round(mx)} mm/hr`} sub={`at ${clockLabel(mxc)}`} />
          <Big label="Last 60 min" value={`${Math.round(acc)} mm`} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Simulated radar/AWS blend. In production: IMD Doppler reflectivity converted with Z–R and bias-corrected against AWS gauges.</p>
      </>
    );
  }

  if (selection.kind === "poi") {
    const p = ds.pois.find((x) => x.id === selection.id);
    if (!p) return null;
    const access = p.accessRoadIds.map((id) => {
      const i = ds.roads.findIndex((r) => r.id === id);
      const d = i >= 0 ? sample(res.roads.depth[i], res, clock) : 0;
      return { id, label: ds.roads[i]?.label ?? id, d };
    });
    const atRisk = access.some((a) => a.d >= UNSAFE_DEPTH);
    const kindLabel = { hospital: "Hospital", fire: "Fire station", police: "Police station", shelter: "Relief shelter (demo designation)" }[p.kind];
    return (
      <>
        <Header
          icon={p.kind === "hospital" ? <Hospital className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
          kicker={`${kindLabel} · ${p.id}`}
          title={p.name}
          badge={<Tag tone={atRisk ? "red" : "green"}>{p.kind === "shelter" ? (atRisk ? "Access flooding" : "Available") : atRisk ? "Access at risk" : "Operational"}</Tag>}
        />
        <div className="divide-y divide-ink-700/60">
          <KV k="Sector" v={ds.sectors.find((s) => s.id === p.sectorId)?.name} />
          <KV k="Ground elevation" v={`${p.elev.toFixed(1)} m`} />
          {p.beds && <KV k="Beds (indicative)" v={p.beds} />}
          {p.capacity && <KV k="Shelter capacity" v={`${p.capacity} persons`} />}
          <KV k="Nearest drain node" v={<button type="button" className="font-mono text-cyan-300 hover:underline" onClick={() => onSelect?.({ kind: "node", id: p.nodeId })}>{p.nodeId}</button>} />
        </div>
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">Access roads at {clockLabel(clock)}</div>
          {access.map((a) => (
            <button key={a.id} type="button" onClick={() => onSelect?.({ kind: "road", id: a.id })} className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-ink-800">
              <span className="truncate text-slate-300">{a.label}</span>
              <span className="font-mono tnum" style={{ color: RISK_TEXT[riskOf(a.d)] }}>
                {a.d.toFixed(2)} m
              </span>
            </button>
          ))}
        </div>
        {p.kind !== "shelter" && (
          <Link href={`/routing?origin=${p.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:underline">
            <Navigation className="h-3 w-3" /> Plan safe route from here →
          </Link>
        )}
      </>
    );
  }

  if (selection.kind === "junction") {
    const j = ds.junctions.find((x) => x.id === selection.id);
    if (!j) return null;
    const rows = j.roadIds.map((id) => {
      const i = ds.roads.findIndex((r) => r.id === id);
      return { id, label: ds.roads[i]?.label ?? id, d: i >= 0 ? sample(res.roads.depth[i], res, clock) : 0 };
    });
    const mx = Math.max(0, ...rows.map((r) => r.d));
    return (
      <>
        <Header icon={<MapPin className="h-3 w-3" />} kicker={`Critical intersection · ${j.id}`} title={j.name} badge={<RiskBadge level={riskOf(mx)} />} />
        <div className="divide-y divide-ink-700/60">
          {rows.map((r) => (
            <KV key={r.id} k={r.label} v={<span style={{ color: RISK_TEXT[riskOf(r.d)] }}>{r.d.toFixed(2)} m</span>} />
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-ink-600 bg-ink-850 p-2.5 text-[13px] text-white">{ROAD_ACTION[riskOf(mx)]}</div>
      </>
    );
  }

  if (selection.kind === "incident") {
    const inc = ds.incidents.find((x) => x.id === selection.id);
    if (!inc) return null;
    return (
      <>
        <Header icon={<Siren className="h-3 w-3" />} kicker={`Incident · ${inc.id}`} title={inc.name} />
        <p className="text-xs text-slate-300">{inc.description}</p>
        <KV k="Sector" v={ds.sectors.find((s) => s.id === inc.sectorId)?.name} />
        <Link href={`/routing?incident=${inc.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:underline">
          <Navigation className="h-3 w-3" /> Plan shortest safe route →
        </Link>
      </>
    );
  }
  return null;
}

function Big({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2">
      <div className="text-[9.5px] font-bold tracking-wider text-slate-500 uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold text-white tnum" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
