"use client";
import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Pause, Play } from "lucide-react";
import type { CityDataset, SimResult } from "@/lib/types";
import { useApp } from "@/lib/store";
import { NOW_CLOCK, RISK_COLOR, UNSAFE_DEPTH, clockLabel, riskOf } from "@/lib/engine/constants";
import { sample } from "@/lib/engine/analysis";
import { useTauTween } from "../map/overlays";
import { Panel, cx } from "../ui/primitives";

const HORIZONS = [0, 30, 60, 90, 120, 180];

export function useHorizonStats(ds?: CityDataset, res?: SimResult) {
  return useMemo(() => {
    if (!ds || !res) return null;
    const majors = ds.roads.map((r, i) => ({ r, i })).filter((x) => x.r.major);
    const at = (c: number) => {
      let unsafe = 0;
      let max = 0;
      for (const { i } of majors) {
        const d = sample(res.roads.depth[i], res, c);
        if (d >= UNSAFE_DEPTH) unsafe++;
        if (d > max) max = d;
      }
      const surcharged = ds.drainNodes.filter((_, k) => sample(res.nodes.pond[k], res, c) >= 0.05).length;
      return { unsafe, max, surcharged, rain: sample(res.rainMean, res, c) };
    };
    const series: { t: number; unsafe: number; surcharged: number; rain: number }[] = [];
    for (let t = 0; t <= 180; t += 5) {
      const s = at(NOW_CLOCK + t);
      series.push({ t, unsafe: s.unsafe, surcharged: s.surcharged, rain: Math.round(s.rain) });
    }
    return { horizons: HORIZONS.map((t) => ({ t, ...at(NOW_CLOCK + t) })), series };
  }, [ds, res]);
}

export function NowcastPanel({ ds, res, className }: { ds?: CityDataset; res?: SimResult; className?: string }) {
  const tau = useApp((s) => s.tau);
  const playing = useApp((s) => s.playing);
  const setPlaying = useApp((s) => s.setPlaying);
  const setTau = useApp((s) => s.setTau);
  const demo = useApp((s) => s.demo.active);
  const tween = useTauTween();
  const stats = useHorizonStats(ds, res);

  return (
    <Panel
      className={className}
      title="Flood Nowcast"
      subtitle={`Issued ${clockLabel(NOW_CLOCK)} · horizon 0–3 h`}
      sim
      right={
        <button
          type="button"
          disabled={demo}
          onClick={() => {
            if (!playing && tau >= 179) setTau(0);
            setPlaying(!playing);
          }}
          className={cx("flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-bold tracking-wider uppercase disabled:opacity-40", playing ? "bg-amber-400 text-ink-950" : "bg-cyan-400 text-ink-950 hover:bg-cyan-300")}
        >
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {playing ? "Pause" : "Play nowcast"}
        </button>
      }
      bodyClassName="p-2.5"
    >
      <div className="grid grid-cols-6 gap-1">
        {(stats?.horizons ?? HORIZONS.map((t) => ({ t, unsafe: 0, max: 0, surcharged: 0, rain: 0 }))).map((h) => {
          const active = Math.abs(tau - h.t) < 3;
          const r = riskOf(h.max);
          return (
            <button
              key={h.t}
              type="button"
              disabled={demo}
              onClick={() => (setPlaying(false), tween(h.t))}
              className={cx(
                "rounded-md border px-1 py-1.5 text-center transition-colors disabled:cursor-default",
                active ? "border-cyan-400/60 bg-cyan-400/10" : "border-ink-700 bg-ink-850 hover:border-ink-500",
              )}
              title={`${h.unsafe} unsafe road segments, max depth ${h.max.toFixed(2)} m`}
            >
              <div className={cx("font-mono text-[10px] font-bold", active ? "text-cyan-200" : "text-slate-400")}>{h.t === 0 ? "NOW" : `+${h.t}`}</div>
              <div className="font-mono text-[15px] leading-5 font-semibold text-white tnum">{h.unsafe}</div>
              <div className="mx-auto mt-0.5 h-1 w-6 rounded-full" style={{ background: RISK_COLOR[r] }} />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-slate-500">
        <span>Unsafe road segments (≥ 0.3 m)</span>
        <span>colour = worst depth</span>
      </div>
      <div className="mt-1.5 h-[70px]">
        {stats && (
          <ResponsiveContainer>
            <AreaChart data={stats.series} margin={{ top: 4, right: 2, left: -30, bottom: 0 }}>
              <defs>
                <linearGradient id="nc-unsafe" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" type="number" domain={[0, 180]} ticks={[0, 60, 120, 180]} tickFormatter={(v) => (v ? `+${v}` : "now")} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#0d172b", border: "1px solid #273a5f", borderRadius: 8, fontSize: 11 }} labelFormatter={(v) => `T+${v} min · ${clockLabel(NOW_CLOCK + Number(v))}`} />
              <Area type="monotone" dataKey="unsafe" name="Unsafe roads" stroke="#f97316" strokeWidth={2} fill="url(#nc-unsafe)" isAnimationActive={false} />
              <Area type="monotone" dataKey="surcharged" name="Surcharged nodes" stroke="#60a5fa" strokeWidth={1.5} fill="transparent" isAnimationActive={false} />
              <ReferenceLine x={Math.max(0, tau)} stroke="#22d3ee" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
