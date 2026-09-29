"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend as RLegend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Archive, CalendarRange } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNetwork } from "@/lib/hooks/data";
import { useApi } from "@/lib/hooks/useApi";
import { api } from "@/lib/api/client";
import { PageHeader, axisTick, chartTooltip } from "@/components/ui/PageHeader";
import { ErrorState, Loading, Panel, Select, Tag } from "@/components/ui/primitives";

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
const fmtDur = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

export default function AnalyticsPage() {
  const city = useApp((s) => s.city);
  const { data: ds } = useNetwork();
  const { data, error, loading, reload } = useApi(`analytics:${city}`, () => api.analytics(city));
  const [eventId, setEventId] = useState<string | null>(null);
  const [from, setFrom] = useState("2019");
  const [to, setTo] = useState("2026");
  const [ward, setWard] = useState<string>("");

  useEffect(() => {
    if (data && (!eventId || !data.events.some((e) => e.id === eventId))) setEventId(data.featuredId);
  }, [data, eventId]);

  const { data: series } = useApi(eventId ? `analytics-ev:${city}:${eventId}` : null, () => api.analyticsEvent(city, eventId!));

  const events = useMemo(() => {
    const list = (data?.events ?? []).filter((e) => e.date.slice(0, 4) >= from && e.date.slice(0, 4) <= to);
    if (!ward) return list;
    return list
      .map((e) => {
        const s = e.sectors.find((x) => x.id === ward);
        return s ? { ...e, maxDepth: s.maxDepth, floodedRoads: s.floodedRoads } : e;
      })
      .filter((e) => e.maxDepth > 0.05);
  }, [data, from, to, ward]);

  const recent = useMemo(() => [...events].sort((a, b) => a.date.localeCompare(b.date)).slice(-24), [events]);
  const ev = data?.events.find((e) => e.id === eventId);
  const years = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];
  const avgAcc = events.length ? Math.round(events.reduce((s, e) => s + e.accuracy, 0) / events.length) : 0;

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <Loading label="Loading event catalogue…" />;
  return (
    <div className="scroll-thin flex h-full flex-col gap-2.5 overflow-y-auto p-2.5">
      <PageHeader
        kicker="Analytics & historical events"
        title="Historical Flood Events"
        subtitle={`${data.total} events loaded for ${ds?.name ?? city} — used to validate the nowcast and to prioritise drainage upgrades.`}
        right={
          <>
            <Tag tone="amber">
              <Archive className="h-3 w-3" /> Synthetic catalogue — not observed records
            </Tag>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/90 px-3 py-2">
        <span className="text-[10.5px] font-bold tracking-wider text-slate-500 uppercase">Event</span>
        <Select
          label="Event"
          value={eventId ?? ""}
          onChange={setEventId}
          className="min-w-80"
          options={[...data.events]
            .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || b.maxDepth - a.maxDepth)
            .slice(0, 40)
            .map((e) => ({ value: e.id, label: `${e.featured ? "★ " : ""}${fmtDate(e.date)} · ${e.name} · ${e.rainfallMm} mm · ${e.maxDepth} m` }))}
        />
        <span className="ml-3 flex items-center gap-1 text-[10.5px] font-bold tracking-wider text-slate-500 uppercase">
          <CalendarRange className="h-3.5 w-3.5" /> Dates
        </span>
        <Select label="From year" value={from} onChange={setFrom} options={years.map((y) => ({ value: y, label: y }))} />
        <span className="text-xs text-slate-500">to</span>
        <Select label="To year" value={to} onChange={setTo} options={years.map((y) => ({ value: y, label: y }))} />
        <span className="ml-3 text-[10.5px] font-bold tracking-wider text-slate-500 uppercase">Ward</span>
        <Select label="Ward" value={ward} onChange={setWard} options={[{ value: "", label: "All wards" }, ...(ds?.sectors ?? []).map((s) => ({ value: s.id, label: `${s.name} · ${s.locality}` }))]} />
        <span className="ml-auto text-xs text-slate-400">
          {events.length} events match · mean backtest accuracy <b className="text-white">{avgAcc}%</b>
        </span>
      </div>

      {ev && (
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-cyan-400/25 bg-gradient-to-b from-cyan-400/[0.06] to-transparent p-4">
            <div className="font-mono text-[10px] font-bold tracking-[0.2em] text-cyan-400 uppercase">{ev.featured ? "Featured event" : "Selected event"}</div>
            <div className="mt-1 text-lg font-bold tracking-tight text-white uppercase">
              {ds?.name} {ev.type === "Cloudburst" ? "cloudburst" : "monsoon event"}
            </div>
            <div className="font-mono text-sm text-slate-400">{fmtDate(ev.date)}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Big label="Rainfall" value={`${ev.rainfallMm} mm`} />
              <Big label="Max flood depth" value={`${ev.maxDepth.toFixed(2)} m`} />
              <Big label="Flooded roads" value={String(ev.floodedRoads)} />
              <Big label="Peak flood time" value={fmtDur(ev.timeToPeakMin)} />
              <Big label="Prediction accuracy" value={`${ev.accuracy}%`} accent />
              <Big label="Peak intensity" value={`${ev.peakIntensity} mm/hr`} />
            </div>
            <p className="mt-3 text-[10.5px] text-slate-500">Accuracy = share of road segments whose risk class was predicted correctly in a synthetic backtest (illustrative).</p>
          </div>
          <Panel title="Event time series" subtitle="Rainfall (bars) · hotspot depth observed vs predicted" sim className="col-span-2" bodyClassName="p-2">
            <div className="h-60">
              {series ? (
                <ResponsiveContainer>
                  <ComposedChart data={series.series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#1c2a48" vertical={false} />
                    <XAxis dataKey="t" tick={axisTick} tickFormatter={(v) => `${Math.floor(v / 60)}h`} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="r" tick={axisTick} axisLine={false} tickLine={false} orientation="right" />
                    <YAxis yAxisId="d" tick={axisTick} axisLine={false} tickLine={false} unit=" m" />
                    <Tooltip {...chartTooltip} labelFormatter={(v) => `T+${v} min`} />
                    <RLegend wrapperStyle={{ fontSize: 10 }} />
                    <Bar yAxisId="r" dataKey="rain" name="Rain (mm/hr)" fill="#22d3ee" fillOpacity={0.35} isAnimationActive={false} />
                    <Line yAxisId="d" dataKey="observed" name="Observed depth" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line yAxisId="d" dataKey="predicted" name="Predicted depth" stroke="#a5b4fc" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <Loading />
              )}
            </div>
          </Panel>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <ChartPanel title="Rainfall vs flood depth" subtitle="Each dot = one event">
          <ScatterChart margin={{ top: 8, right: 10, left: -10, bottom: 4 }}>
            <CartesianGrid stroke="#1c2a48" />
            <XAxis type="number" dataKey="rainfallMm" name="Rainfall" unit=" mm" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis type="number" dataKey="maxDepth" name="Max depth" unit=" m" tick={axisTick} axisLine={false} tickLine={false} />
            <ZAxis range={[26, 26]} />
            <Tooltip {...chartTooltip} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={events} isAnimationActive={false}>
              {events.map((e) => (
                <Cell key={e.id} fill={e.id === eventId ? "#22d3ee" : e.type === "Cloudburst" ? "#f472b6" : e.tidal ? "#a78bfa" : "#f97316"} fillOpacity={e.id === eventId ? 1 : 0.6} />
              ))}
            </Scatter>
          </ScatterChart>
        </ChartPanel>
        <ChartPanel title="Flood duration" subtitle="Last 24 events (minutes)">
          <BarChart data={recent} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#1c2a48" vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickFormatter={(d) => d.slice(2, 7)} axisLine={false} tickLine={false} interval={3} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip {...chartTooltip} />
            <Bar dataKey="floodDurationMin" name="Duration (min)" fill="#60a5fa" isAnimationActive={false} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartPanel>
        <ChartPanel title="Maximum water depth" subtitle="Last 24 events (m)">
          <BarChart data={recent} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#1c2a48" vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickFormatter={(d) => d.slice(2, 7)} axisLine={false} tickLine={false} interval={3} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip {...chartTooltip} />
            <ReferenceLine y={1} stroke="#7f1d1d" strokeDasharray="3 3" />
            <Bar dataKey="maxDepth" name="Max depth (m)" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {recent.map((e) => (
                <Cell key={e.id} fill={e.maxDepth >= 1 ? "#b91c1c" : e.maxDepth >= 0.5 ? "#dc2626" : e.maxDepth >= 0.3 ? "#f97316" : "#eab308"} />
              ))}
            </Bar>
          </BarChart>
        </ChartPanel>
        <ChartPanel title="Drainage capacity" subtitle="Peak drain utilisation per event (%)">
          <LineChart data={recent} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#1c2a48" vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickFormatter={(d) => d.slice(2, 7)} axisLine={false} tickLine={false} interval={3} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} domain={[30, 100]} />
            <Tooltip {...chartTooltip} />
            <ReferenceLine y={90} stroke="#f97316" strokeDasharray="3 3" />
            <Line dataKey="peakDrainUtil" name="Peak utilisation %" stroke="#38bdf8" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          </LineChart>
        </ChartPanel>
        <ChartPanel title="Flooded road count" subtitle="Last 24 events">
          <BarChart data={recent} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#1c2a48" vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickFormatter={(d) => d.slice(2, 7)} axisLine={false} tickLine={false} interval={3} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip {...chartTooltip} />
            <RLegend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="floodedRoads" name="Observed" fill="#f97316" isAnimationActive={false} radius={[2, 2, 0, 0]} />
            <Bar dataKey="predictedFloodedRoads" name="Predicted" fill="#a5b4fc" isAnimationActive={false} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartPanel>
        <ChartPanel title="Model prediction accuracy" subtitle="Synthetic backtest per event (%)">
          <LineChart data={recent} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke="#1c2a48" vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickFormatter={(d) => d.slice(2, 7)} axisLine={false} tickLine={false} interval={3} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} domain={[60, 100]} />
            <Tooltip {...chartTooltip} />
            <ReferenceLine y={avgAcc} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: `mean ${avgAcc}%`, fill: "#94a3b8", fontSize: 9, position: "insideTopRight" }} />
            <Line dataKey="accuracy" name="Accuracy %" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          </LineChart>
        </ChartPanel>
      </div>
      <p className="px-1 pb-2 text-[10.5px] text-slate-500">{data.disclaimer} Production: IMD/AWS archives, municipal waterlogging complaints, and citizen reports.</p>
    </div>
  );
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[9.5px] font-bold tracking-wider text-slate-500 uppercase">{label}</div>
      <div className={accent ? "font-mono text-xl font-semibold text-emerald-300" : "font-mono text-xl font-semibold text-white"}>{value}</div>
    </div>
  );
}

function ChartPanel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactElement }) {
  return (
    <Panel title={title} subtitle={subtitle} sim bodyClassName="p-2">
      <div className="h-48">
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </Panel>
  );
}

