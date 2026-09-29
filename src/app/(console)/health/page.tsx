"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, FlaskConical, Timer } from "lucide-react";
import { useApp } from "@/lib/store";
import { useHealth, useNowcast } from "@/lib/hooks/data";
import { latencyLog } from "@/lib/api/client";
import { PageHeader, axisTick, chartTooltip } from "@/components/ui/PageHeader";
import { ErrorState, Loading, Panel, Stat, StatusPill, Tag, Toggle, cx } from "@/components/ui/primitives";
import { agoLabel } from "@/components/panels/EnginePanel";

const MODE_TONE = { LIVE: "green", STATIC: "blue", SIMULATED: "amber" } as const;

export default function HealthPage() {
  const { data, error, reload } = useHealth(5000);
  const { data: now } = useNowcast();
  const flags = useApp((s) => s.flags);
  const setFlag = useApp((s) => s.setFlag);
  const toast = useApp((s) => s.toast);
  const [lat, setLat] = useState<{ path: string; ms: number }[]>([]);

  useEffect(() => {
    const f = () => {
      const by = new Map<string, number[]>();
      for (const l of latencyLog) {
        if (!l.ok) continue;
        const k = l.path;
        by.set(k, [...(by.get(k) ?? []), l.ms]);
      }
      setLat([...by.entries()].map(([path, v]) => ({ path, ms: Math.round(v.reduce((a, b) => a + b, 0) / v.length) })).sort((a, b) => b.ms - a.ms));
    };
    f();
    const id = setInterval(f, 3000);
    return () => clearInterval(id);
  }, []);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const c = (id: string) => data.components.find((x) => x.id === id);
  const online = data.components.filter((x) => x.status === "online" || x.status === "static").length;

  return (
    <div className="scroll-thin flex h-full flex-col gap-2.5 overflow-y-auto p-2.5">
      <PageHeader
        kicker="Model / data health"
        title="System Health"
        subtitle="Feed freshness and component status. Failures can be injected to demonstrate graceful degradation (radar gaps are a known risk — proposal slide 4)."
        right={<StatusPill status={data.overall} label={data.overall === "online" ? "All systems nominal" : data.overall === "offline" ? "Component offline" : "Degraded"} />}
      />
      <div className="grid grid-cols-5 gap-2.5">
        <Stat value={`${online}/${data.components.length}`} label="Components healthy" tone={online === data.components.length ? "#4ade80" : "#fbbf24"} />
        <Stat value={agoLabel(c("radar")?.updatedAgoSec ?? 0)} label="IMD radar" sub={c("radar")?.status === "offline" ? "OFFLINE — fallback active" : "Last volume scan"} tone={c("radar")?.status === "offline" ? "#f87171" : undefined} />
        <Stat value={agoLabel(c("aws")?.updatedAgoSec ?? 0)} label="AWS gauges" sub={c("aws")?.detail} tone={c("aws")?.status === "delayed" ? "#fbbf24" : undefined} />
        <Stat value={agoLabel(c("drain-graph")?.updatedAgoSec ?? 0)} label="Drainage state" sub="Graph sync" />
        <Stat value={agoLabel(c("engine")?.updatedAgoSec ?? 0)} label="Prediction" sub={`Completed · demo engine ${now?.model.computeMs ?? "—"} ms`} />
      </div>
      <div className="grid min-h-0 grid-cols-3 gap-2.5">
        <Panel title="Components" icon={<Activity className="h-3.5 w-3.5" />} className="col-span-2" bodyClassName="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[9.5px] tracking-wider text-slate-500 uppercase">
                <th className="px-3 py-2">Component</th>
                <th className="px-2 py-2">Layer</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Mode</th>
                <th className="px-2 py-2 text-right">Freshness</th>
                <th className="px-2 py-2 text-right">Latency</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.components.map((x) => (
                <tr key={x.id} className="border-t border-ink-700/60 align-top">
                  <td className="px-3 py-2 font-semibold text-slate-100">{x.name}</td>
                  <td className="px-2 py-2 text-slate-400">{x.layer}</td>
                  <td className="px-2 py-2">
                    <StatusPill status={x.status} />
                  </td>
                  <td className="px-2 py-2">
                    <Tag tone={MODE_TONE[x.mode]}>{x.mode}</Tag>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-slate-300">{x.updatedAgoSec == null ? x.cadence : agoLabel(x.updatedAgoSec)}</td>
                  <td className="px-2 py-2 text-right font-mono text-slate-300">{x.latencyMs == null ? "—" : x.latencyMs >= 1000 ? `${(x.latencyMs / 1000).toFixed(1)} s` : `${x.latencyMs} ms`}</td>
                  <td className={cx("max-w-72 px-3 py-2 text-[11px]", x.status === "offline" ? "text-red-300" : x.status === "warning" || x.status === "delayed" ? "text-amber-200" : "text-slate-400")}>{x.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="flex flex-col gap-2.5">
          <Panel title="Failure injection (demo)" icon={<FlaskConical className="h-3.5 w-3.5" />} className="shrink-0">
            <Toggle
              checked={flags.radarOutage}
              onChange={(v) => {
                setFlag("radarOutage", v);
                toast({ tone: v ? "high" : "success", title: v ? "Radar feed offline" : "Radar feed restored", body: v ? "Nowcast switched to AWS gauge interpolation; confidence reduced." : "Radar + gauge blend resumed." });
              }}
              label="Simulate IMD radar outage"
            />
            <Toggle
              checked={flags.awsDelay}
              onChange={(v) => {
                setFlag("awsDelay", v);
                toast({ tone: v ? "medium" : "success", title: v ? "AWS telemetry delayed" : "AWS telemetry normal" });
              }}
              label="Simulate AWS gauge delay"
            />
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              Radar outage → rainfall panel shows the fallback source, the nowcast confidence band widens, the engine runs in degraded mode and the top bar turns amber/red. Nothing else breaks.
            </p>
          </Panel>
          <Panel title="Measured API latency (this browser)" icon={<Timer className="h-3.5 w-3.5" />} right={<Tag tone="green">Real</Tag>} className="shrink-0" bodyClassName="p-2">
            <div className="h-44">
              {lat.length ? (
                <ResponsiveContainer>
                  <BarChart data={lat} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
                    <CartesianGrid stroke="#1c2a48" horizontal={false} />
                    <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} unit=" ms" />
                    <YAxis type="category" dataKey="path" tick={axisTick} axisLine={false} tickLine={false} width={80} />
                    <Tooltip {...chartTooltip} />
                    <Bar dataKey="ms" name="Mean latency" fill="#38bdf8" isAnimationActive={false} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Loading label="Collecting…" />
              )}
            </div>
            <p className="px-1 text-[10.5px] text-slate-500">Round-trip times of the mock API calls made by this session (Next.js routes, FastAPI-ready contracts).</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
