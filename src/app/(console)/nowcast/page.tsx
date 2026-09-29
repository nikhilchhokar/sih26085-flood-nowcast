"use client";
import { useMemo } from "react";
import { WavesHorizontal } from "lucide-react";
import { useApp } from "@/lib/store";
import { useClock, useNetwork, useNowcast } from "@/lib/hooks/data";
import { useApi } from "@/lib/hooks/useApi";
import { api } from "@/lib/api/client";
import { sample } from "@/lib/engine/analysis";
import { NOW_CLOCK, RISK_COLOR, RISK_TEXT, RISK_ORDER, clockLabel, riskOf } from "@/lib/engine/constants";
import type { RiskLevel } from "@/lib/types";
import { FloodMap } from "@/components/map/DynamicMap";
import { LayerPanel, Legend, MapToolbar, TimeBar, useTauTween } from "@/components/map/overlays";
import { DetailPanel } from "@/components/map/DetailPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState, Loading, Panel, RiskBadge, SimTag, Tag, cx } from "@/components/ui/primitives";

const FRAMES = [0, 30, 60, 90, 120, 180];

export default function NowcastPage() {
  const { data: ds, error } = useNetwork();
  const { data: now } = useNowcast();
  const clock = useClock();
  const tau = useApp((s) => s.tau);
  const layers = useApp((s) => s.layers);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const city = useApp((s) => s.city);
  const scenario = useApp((s) => s.appliedScenario);
  const focus = useApp((s) => s.mapFocus);
  const radar = useApp((s) => s.flags.radarOutage);
  const tween = useTauTween();

  const frames = useMemo(() => {
    if (!ds || !now) return [];
    const res = now.result;
    const counts = FRAMES.map((t) => {
      const c: Record<RiskLevel, number> = { safe: 0, low: 0, moderate: 0, high: 0, critical: 0 };
      ds.roads.forEach((r, i) => {
        if (r.major) c[riskOf(sample(res.roads.depth[i], res, NOW_CLOCK + t))]++;
      });
      return c;
    });
    const unsafe = counts.map((c) => c.moderate + c.high + c.critical);
    const peak = Math.max(...unsafe);
    return FRAMES.map((t, k) => {
      const c = counts[k];
      let text = "Low flooding — drains coping";
      if (t === 0 && c.moderate + c.high + c.critical < 3) text = "Low flooding — minor ponding only";
      else if (c.critical >= 3) text = "Multiple critical roads become unsafe";
      else if (c.high >= 5) text = "Major red flood zone appears";
      else if (c.moderate + c.high >= 5) text = "Orange areas expand";
      else if (c.low >= 5) text = "Several yellow areas appear";
      if (k === FRAMES.length - 1 && unsafe[k] < peak * 0.8) text = "Peak flood extent begins to recede";
      return { t, c, text };
    });
  }, [ds, now]);

  const bucket = Math.round(clock / 5) * 5;
  const { data: risk, loading: riskLoading } = useApi(
    ds ? `flood-risk:${city}:${bucket}:${scenario ? JSON.stringify(scenario) : "b"}` : null,
    () => api.floodRisk(city, bucket, scenario),
    { keepPrevious: true },
  );

  if (error) return <ErrorState error={error} />;
  return (
    <div className="flex h-full flex-col gap-2.5 p-2.5">
      <PageHeader
        kicker="Nowcast · 0–3 h"
        title="Flood Nowcast Map"
        subtitle="Street-level predicted water depth, risk polygons and drainage state. Scrub or play the timeline to watch the flood evolve."
        right={
          <>
            <Tag tone="amber">Simulated nowcast</Tag>
            <Tag tone="cyan">Issued {clockLabel(NOW_CLOCK)}</Tag>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 gap-2.5">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-ink-700">
          {ds ? (
            <FloodMap ds={ds} res={now?.result} clock={clock} layers={layers} selection={selection} onSelect={select} focus={focus}>
              <LayerPanel />
              <MapToolbar />
              <Legend showRain={layers.rain} showDrain={layers.drainage} />
              <TimeBar degraded={radar} />
              <DetailPanel ds={ds} res={now?.result} clock={clock} selection={selection} onClose={() => select(null)} onSelect={select} />
            </FloodMap>
          ) : (
            <Loading />
          )}
        </div>
        <div className="scroll-thin flex w-[380px] shrink-0 flex-col gap-2.5 overflow-y-auto">
          <Panel title="Nowcast evolution" icon={<WavesHorizontal className="h-3.5 w-3.5" />} sim className="shrink-0" bodyClassName="p-2">
            <div className="space-y-1">
              {frames.map((f) => {
                const active = Math.abs(tau - f.t) < 3;
                const total = RISK_ORDER.reduce((s, r) => s + f.c[r], 0) || 1;
                return (
                  <button
                    key={f.t}
                    type="button"
                    onClick={() => tween(f.t)}
                    className={cx("w-full rounded-lg border px-2.5 py-2 text-left transition-colors", active ? "border-cyan-400/60 bg-cyan-400/10" : "border-ink-700 bg-ink-850 hover:border-ink-500")}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cx("w-12 font-mono text-xs font-bold", active ? "text-cyan-200" : "text-slate-300")}>{f.t === 0 ? "NOW" : `+${f.t}`}</span>
                      <span className="font-mono text-[10px] text-slate-500">{clockLabel(NOW_CLOCK + f.t)}</span>
                      <span className="ml-auto text-[11.5px] text-slate-200">{f.text}</span>
                    </div>
                    <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-ink-700">
                      {RISK_ORDER.filter((r) => r !== "safe").map((r) => (
                        <div key={r} style={{ width: `${(f.c[r] / total) * 100 * 4}%`, background: RISK_COLOR[r] }} />
                      ))}
                    </div>
                    <div className="mt-1 flex gap-2.5 font-mono text-[10px] text-slate-500">
                      <span style={{ color: RISK_COLOR.low }}>L {f.c.low}</span>
                      <span style={{ color: RISK_COLOR.moderate }}>M {f.c.moderate}</span>
                      <span style={{ color: RISK_COLOR.high }}>H {f.c.high}</span>
                      <span className="text-red-300">C {f.c.critical}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title={`Roads at risk · ${clockLabel(bucket)}`} sim className="shrink-0" bodyClassName="p-0" right={riskLoading ? <span className="text-[10px] text-slate-500">updating…</span> : null}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[9.5px] tracking-wider text-slate-500 uppercase">
                  <th className="px-3 py-1.5 font-semibold">Road</th>
                  <th className="px-1 py-1.5 font-semibold">Depth</th>
                  <th className="px-1 py-1.5 font-semibold">Onset</th>
                  <th className="px-3 py-1.5 text-right font-semibold">P&gt;0.3m</th>
                </tr>
              </thead>
              <tbody>
                {(risk?.roads ?? []).slice(0, 10).map((r) => (
                  <tr key={r.id} onClick={() => select({ kind: "road", id: r.id })} className="cursor-pointer border-t border-ink-700/60 hover:bg-ink-800">
                    <td className="max-w-[150px] px-3 py-1.5">
                      <div className="truncate text-slate-200">{r.label}</div>
                      <div className="font-mono text-[10px] text-slate-500">{r.id}</div>
                    </td>
                    <td className="px-1 py-1.5 font-mono" style={{ color: RISK_TEXT[r.risk] }}>
                      {r.depth.toFixed(2)}
                    </td>
                    <td className="px-1 py-1.5 font-mono text-slate-400">{r.onsetMin == null ? "—" : r.onsetMin <= 0 ? "now" : `${r.onsetMin}m`}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-slate-300">{Math.round(r.probability * 100)}%</td>
                  </tr>
                ))}
                {risk && !risk.roads.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                      No roads above 0.1 m.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>

          <Panel title={`Sector impact · ${clockLabel(bucket)}`} className="shrink-0" bodyClassName="p-0" right={<SimTag />}>
            <table className="w-full text-xs">
              <tbody>
                {(risk?.sectors ?? []).map((s) => {
                  const sec = ds?.sectors.find((x) => x.id === s.id);
                  return (
                    <tr key={s.id} onClick={() => select({ kind: "sector", id: s.id })} className="cursor-pointer border-t border-ink-700/60 first:border-t-0 hover:bg-ink-800">
                      <td className="px-3 py-1.5">
                        <div className="text-slate-200">{sec?.name}</div>
                        <div className="truncate text-[10px] text-slate-500">{sec?.locality}</div>
                      </td>
                      <td className="px-1 py-1.5">
                        <RiskBadge level={s.risk} size="xs" />
                      </td>
                      <td className="px-1 py-1.5 text-right font-mono text-slate-300">{s.roadsUnsafe} rds</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-300">{s.popAtRisk.toLocaleString("en-IN")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-ink-700/60 px-3 py-1.5 text-[10px] text-slate-500">Columns: unsafe roads · people affected (≥ 0.15 m at doorstep)</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
