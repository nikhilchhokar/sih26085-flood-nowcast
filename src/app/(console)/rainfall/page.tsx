"use client";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CloudRain, Radar, TriangleAlert } from "lucide-react";
import { useApp } from "@/lib/store";
import { useClock, useNetwork, useNowcast, useRainfall } from "@/lib/hooks/data";
import { DEFAULT_LAYERS } from "@/lib/store";
import { RainField } from "@/lib/engine/rain";
import { BASELINE_PARAMS, NOW_CLOCK, clockLabel } from "@/lib/engine/constants";
import { FloodMap } from "@/components/map/DynamicMap";
import { Legend, MapToolbar, TimeBar } from "@/components/map/overlays";
import { DetailPanel } from "@/components/map/DetailPanel";
import { PageHeader, axisTick, chartTooltip } from "@/components/ui/PageHeader";
import { ErrorState, Loading, Panel, Stat, Tag, Toggle, cx } from "@/components/ui/primitives";

export default function RainfallPage() {
  const { data: ds, error } = useNetwork();
  const { data: now } = useNowcast();
  const { data: rain, error: rainErr, reload } = useRainfall();
  const clock = useClock();
  const tau = useApp((s) => s.tau);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const [show, setShow] = useState({ radar: true, roads: true, drains: false, depth: false });
  const layers = { ...DEFAULT_LAYERS, rain: show.radar, roads: show.roads, drainage: show.drains, depth: show.depth, risk: false, infra: false, shelters: false, routes: false, flow: false };

  const field = useMemo(() => (ds ? new RainField(ds, now?.result.params ?? { ...BASELINE_PARAMS[ds.id], backwater: ds.backwater.defaultOn }) : null), [ds, now]);
  const gauges = useMemo(
    () =>
      ds && field
        ? ds.gauges.map((g) => {
            const v = field.at(g.coord[0], g.coord[1], clock);
            return {
              id: g.id,
              coord: g.coord,
              node: (
                <div className="flex flex-col items-center" title={`${g.id} · ${g.name}`}>
                  <span className="rounded-md border border-cyan-300 bg-ink-900/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-200 shadow">{Math.round(v)} mm/hr</span>
                  <span className="mt-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-cyan-500 shadow" />
                  <span className="mt-0.5 rounded bg-white/85 px-1 font-mono text-[8.5px] text-slate-700">{g.id}</span>
                </div>
              ),
            };
          })
        : [],
    [ds, field, clock],
  );

  const chart = useMemo(
    () =>
      (rain?.series ?? []).map((p) => ({
        clock: p.clock,
        observed: p.observed ? p.mean : null,
        forecast: p.clock >= NOW_CLOCK ? p.mean : null,
        band: p.clock >= NOW_CLOCK ? [p.lo, p.hi] : null,
      })),
    [rain],
  );

  if (error || rainErr) return <ErrorState error={(error ?? rainErr)!} onRetry={reload} />;
  return (
    <div className="flex h-full flex-col gap-2.5 p-2.5">
      <PageHeader
        kicker="Rainfall & weather"
        title="Rainfall Nowcast"
        subtitle="Radar-style rainfall field with AWS gauges. This is the forcing for the drainage model — rainfall alone does not tell you where it floods."
        right={
          <span className="flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 font-mono text-[10.5px] font-bold tracking-wider text-amber-300 uppercase">
            <Radar className="h-3.5 w-3.5" /> Simulated radar / demo data
          </span>
        }
      />
      <div className="grid grid-cols-5 gap-2.5">
        <Stat icon={<CloudRain className="h-3.5 w-3.5" />} value={rain ? Math.round(rain.current) : "—"} unit="mm/hr" label="Current rainfall" sub={`City mean at ${clockLabel(NOW_CLOCK)}`} tone="#22d3ee" />
        <Stat value={rain?.accumulated ?? "—"} unit="mm" label="Accumulated" sub="Since 06:00" />
        <Stat value={rain?.next3hTotal ?? "—"} unit="mm" label="Forecast next 3 h" sub={rain ? `Peak ${Math.round(rain.peak.value)} mm/hr at ${clockLabel(rain.peak.clock)}` : ""} tone="#818cf8" />
        <Stat value={rain ? `${rain.trend30 >= 0 ? "+" : ""}${rain.trend30}` : "—"} unit="mm/hr" label="30-min trend" sub="Intensifying" tone={rain && rain.trend30 > 0 ? "#fbbf24" : undefined} />
        <Stat value={rain ? Math.round(rain.confidence * 100) : "—"} unit="%" label="Nowcast confidence" sub={rain?.degraded ? "Radar offline — gauge fallback" : "Radar + gauge blend"} tone={rain?.degraded ? "#fb923c" : undefined} />
      </div>
      <div className="flex min-h-0 flex-1 gap-2.5">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-ink-700">
          {ds ? (
            <FloodMap ds={ds} res={now?.result} clock={clock} layers={layers} variant="rainfall" selection={selection} onSelect={select} extraMarkers={gauges} showSectorLabels={false}>
              <div className="absolute top-3 left-3 z-10 w-48 rounded-lg border border-ink-600 bg-ink-900/92 px-3 py-2 shadow-xl">
                <div className="mb-1 text-[10px] font-bold tracking-[0.12em] text-slate-300 uppercase">Layers</div>
                <Toggle checked={show.radar} onChange={(v) => setShow({ ...show, radar: v })} label="Radar rainfall" color="#22d3ee" />
                <Toggle checked={show.roads} onChange={(v) => setShow({ ...show, roads: v })} label="Road network" color="#16a34a" />
                <Toggle checked={show.drains} onChange={(v) => setShow({ ...show, drains: v })} label="Drainage" color="#2563eb" />
                <Toggle checked={show.depth} onChange={(v) => setShow({ ...show, depth: v })} label="Predicted depth" color="#dc2626" />
                <p className="mt-1 text-[10px] text-slate-500">Click the map to inspect a rainfall cell.</p>
              </div>
              <MapToolbar />
              <Legend showRain className="bottom-24" />
              <TimeBar min={-60} />
              <DetailPanel ds={ds} res={now?.result} clock={clock} selection={selection} onClose={() => select(null)} onSelect={select} />
            </FloodMap>
          ) : (
            <Loading />
          )}
        </div>
        <div className="scroll-thin flex w-[400px] shrink-0 flex-col gap-2.5 overflow-y-auto">
          <Panel title="Rainfall trend" subtitle="Last 60 min (observed) · next 180 min (nowcast, with uncertainty band)" sim className="shrink-0" bodyClassName="p-2">
            <div className="h-48">
              <ResponsiveContainer>
                <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#1c2a48" vertical={false} />
                  <XAxis dataKey="clock" type="number" domain={["dataMin", "dataMax"]} ticks={[NOW_CLOCK - 60, NOW_CLOCK, NOW_CLOCK + 60, NOW_CLOCK + 120, NOW_CLOCK + 180]} tickFormatter={clockLabel} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} unit="" />
                  <Tooltip {...chartTooltip} labelFormatter={(v) => clockLabel(Number(v))} formatter={(v, n) => [Array.isArray(v) ? `${v[0]}–${v[1]} mm/hr` : `${v} mm/hr`, n]} />
                  <Area dataKey="band" name="Uncertainty" stroke="none" fill="#6366f1" fillOpacity={0.18} isAnimationActive={false} connectNulls />
                  <Area dataKey="observed" name="Observed" stroke="#22d3ee" strokeWidth={2} fill="#22d3ee" fillOpacity={0.15} isAnimationActive={false} connectNulls />
                  <Line dataKey="forecast" name="Nowcast" stroke="#a5b4fc" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
                  <ReferenceLine x={NOW_CLOCK} stroke="#94a3b8" strokeDasharray="2 2" label={{ value: "NOW", fill: "#94a3b8", fontSize: 9, position: "insideTopRight" }} />
                  <ReferenceLine x={clock} stroke="#22d3ee" />
                  <ReferenceLine y={ds?.designRainfall} stroke="#f97316" strokeDasharray="4 3" label={{ value: "drain design", fill: "#f97316", fontSize: 9, position: "insideBottomRight" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="px-1 text-[10.5px] text-slate-500">
              Orange line: intensity the existing drains were designed for ({ds?.designRainfall} mm/hr). Above it, the drainage model decides where water goes.
            </p>
          </Panel>

          <Panel title="Rainfall timeline" sim className="shrink-0" bodyClassName="p-0">
            <div className="divide-y divide-ink-700/60">
              {(rain?.timeline ?? []).map((t) => (
                <div key={t.clock} className={cx("flex items-center gap-3 px-3 py-1.5 text-xs", Math.abs(clock - t.clock) < 15 && "bg-cyan-400/5")}>
                  <span className="w-12 font-mono text-slate-300">{clockLabel(t.clock)}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (t.mean / 100) * 100)}%`, background: t.observed ? "#22d3ee" : "#818cf8" }} />
                  </div>
                  <span className="w-16 text-right font-mono text-slate-100 tnum">{t.mean} mm/hr</span>
                  <Tag tone={t.observed ? "cyan" : "violet"} className="w-16 justify-center">
                    {t.observed ? "obs" : "nowcast"}
                  </Tag>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Rainfall by sector" sim className="shrink-0" bodyClassName="p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[9.5px] tracking-wider text-slate-500 uppercase">
                  <th className="px-3 py-1.5">Sector</th>
                  <th className="px-1 py-1.5 text-right">Now</th>
                  <th className="px-1 py-1.5 text-right">Max 60m</th>
                  <th className="px-3 py-1.5 text-right">Trend</th>
                </tr>
              </thead>
              <tbody>
                {(rain?.sectors ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-ink-700/60">
                    <td className="px-3 py-1.5 text-slate-200">
                      {s.name}
                      {s.id === ds?.hero.residentsSectorId && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-amber-300">
                          <TriangleAlert className="h-3 w-3" /> storm cell
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-1.5 text-right font-mono text-cyan-200">{Math.round(s.current)}</td>
                    <td className="px-1 py-1.5 text-right font-mono text-violet-200">{Math.round(s.next60Max)}</td>
                    <td className={cx("px-3 py-1.5 text-right font-mono", s.trend > 5 ? "text-amber-300" : s.trend < -5 ? "text-emerald-300" : "text-slate-400")}>
                      {s.trend > 0 ? "▲" : s.trend < 0 ? "▼" : "•"} {Math.abs(Math.round(s.trend))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="AWS gauges" sim className="shrink-0" bodyClassName="p-0">
            {(rain?.gauges ?? []).map((g) => (
              <div key={g.id} className="flex items-center gap-3 border-t border-ink-700/60 px-3 py-1.5 text-xs first:border-t-0">
                <span className="font-mono text-cyan-300">{g.id}</span>
                <span className="flex-1 truncate text-slate-400">{g.name}</span>
                <span className="font-mono text-slate-100">{Math.round(g.current)} mm/hr</span>
                <span className="w-14 text-right font-mono text-slate-500">{Math.round(g.lastHour)} mm</span>
              </div>
            ))}
            <p className="border-t border-ink-700/60 px-3 py-1.5 text-[10px] text-slate-500">
              {rain?.source} · replay: drag the timeline to −60 min · τ {Math.round(tau)} min
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
