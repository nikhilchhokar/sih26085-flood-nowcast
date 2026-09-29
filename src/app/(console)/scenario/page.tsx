"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CartesianGrid, Legend as RLegend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, FlaskConical, LoaderCircle, Play, RotateCcw, Send, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { useClock, useNetwork } from "@/lib/hooks/data";
import { useApi } from "@/lib/hooks/useApi";
import { api } from "@/lib/api/client";
import { sample } from "@/lib/engine/analysis";
import { DEFAULT_SCENARIO, NOW_CLOCK, RISK_COLOR, RISK_TEXT, UNSAFE_DEPTH, clockLabel, clockLabel12, riskOf } from "@/lib/engine/constants";
import type { CityDataset, NowcastSummary, ScenarioParams, SimResult } from "@/lib/types";
import type { ScenarioResponse } from "@/lib/api/types";
import { FloodMap } from "@/components/map/DynamicMap";
import { LayerPanel, Legend, MapToolbar, TimeBar, useTauTween } from "@/components/map/overlays";
import { DetailPanel } from "@/components/map/DetailPanel";
import { AlertList } from "@/components/panels/AlertList";
import { PageHeader, axisTick, chartTooltip } from "@/components/ui/PageHeader";
import { Button, ErrorState, Loading, Panel, SimTag, Slider, Toggle, cx } from "@/components/ui/primitives";

const STAGES = [
  "Collecting rainfall data…",
  "Fusing terrain and land-use data…",
  "Propagating through drainage graph…",
  "Running flood prediction…",
  "Generating street-level flood map…",
];

export default function ScenarioPage() {
  const router = useRouter();
  const { data: ds, error } = useNetwork();
  const city = useApp((s) => s.city);
  const clock = useClock();
  const layers = useApp((s) => s.layers);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const applyScenario = useApp((s) => s.applyScenario);
  const toast = useApp((s) => s.toast);
  const pushLog = useApp((s) => s.pushLog);
  const tween = useTauTween();

  const [params, setParams] = useState<ScenarioParams>(DEFAULT_SCENARIO);
  const [label, setLabel] = useState("Custom scenario");
  const [respState, setResp] = useState<ScenarioResponse | null>(null);
  const resp = respState && respState.city === city ? respState : null;
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(-1);
  const [live, setLive] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const firstRun = useRef(true);

  const { data: presets } = useApi("scenario-presets", () => api.scenarioPresets());
  const { data: baseline } = useApi(`nowcast-baseline:${city}`, () => api.nowcast(city, null));

  // reset when city changes
  useEffect(() => {
    setResp(null);
    firstRun.current = true;
  }, [city]);

  const run = async (theatrical: boolean) => {
    setErr(null);
    if (theatrical) {
      setRunning(true);
      setStage(0);
    }
    const p = api.runScenario(city, params);
    if (theatrical) {
      for (let i = 1; i < STAGES.length; i++) {
        await new Promise((r) => setTimeout(r, 520));
        setStage(i);
      }
      await new Promise((r) => setTimeout(r, 480));
    }
    try {
      const r = await p;
      setResp(r);
      firstRun.current = false;
      if (theatrical) {
        setStage(STAGES.length);
        tween(Math.min(180, Math.max(0, r.summary.peakClock - NOW_CLOCK)), 1200);
        toast({ tone: "success", title: "Scenario complete", body: `Max depth ${r.summary.maxDepth.toFixed(2)} m · ${r.summary.roadsAtRisk} roads at risk · demo engine computed in ${r.computeMs} ms` });
        pushLog(`Scenario run: ${label} (${params.rainfallIntensity} mm/hr, ${params.stormDuration} min)`, "info");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRunning(false);
      setTimeout(() => setStage(-1), 600);
    }
  };

  // live preview once a first run exists
  useEffect(() => {
    if (!live || firstRun.current) return;
    const id = setTimeout(() => run(false), 380);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, live]);

  const set = (patch: Partial<ScenarioParams>) => {
    setParams((p) => ({ ...p, ...patch }));
    setLabel("Custom scenario");
  };

  if (error) return <ErrorState error={error} />;
  return (
    <div className="flex h-full flex-col gap-2.5 p-2.5">
      <PageHeader
        kicker="Planning · what-if"
        title="Run Flood Scenario"
        subtitle="Change the storm, the drains and the city surface — the coupled model recomputes street-level flooding. Every run goes through the same pipeline as the live nowcast."
        right={<SimTag label="Simulated engine" />}
      />
      <div className="flex min-h-0 flex-1 gap-2.5">
        {/* controls */}
        <div className="scroll-thin flex w-[300px] shrink-0 flex-col gap-2.5 overflow-y-auto">
          <Panel title="Scenario inputs" icon={<FlaskConical className="h-3.5 w-3.5" />} className="shrink-0">
            <div className="mb-3 flex flex-wrap gap-1">
              {presets?.presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setParams(p.params);
                    setLabel(p.label);
                  }}
                  className={cx("rounded-md border px-2 py-1 text-xs font-semibold", label === p.label ? "border-accent/40 bg-accent-subtle text-accent" : "border-line-strong text-fg-2 hover:bg-surface-3")}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="space-y-3.5">
              <Slider label="Rainfall intensity" value={params.rainfallIntensity} min={0} max={150} unit="mm/hr" onChange={(v) => set({ rainfallIntensity: v })} hint="Mean intensity of the design storm (peak ≈ 1.8×)" />
              <Slider label="Storm duration" value={params.stormDuration} min={15} max={240} step={5} unit="min" onChange={(v) => set({ stormDuration: v })} />
              <Slider label="Drainage capacity" value={params.drainageCapacity} min={30} max={150} unit="%" onChange={(v) => set({ drainageCapacity: v })} hint="Effective capacity as % of design (desilting, pumps)" />
              <Slider label="Drain blockage" value={params.blockage} min={0} max={80} unit="%" onChange={(v) => set({ blockage: v })} hint="Additional network-wide blockage; hits already-silted nodes hardest" />
              <Slider label="Initial water level" value={params.initialWaterLevel} min={0} max={3} step={0.1} unit="m" format={(v) => v.toFixed(1)} onChange={(v) => set({ initialWaterLevel: v })} hint="Antecedent level in drains before the storm" />
              <Slider label="Impervious surface" value={params.impervious ?? 72} min={30} max={98} unit="%" onChange={(v) => set({ impervious: v })} hint="Share of sealed surface — more runoff, faster" />
              <div className="rounded border border-line bg-surface-2 px-2.5 py-1.5">
                <Toggle checked={params.backwater} onChange={(v) => set({ backwater: v })} label={`Tidal / backwater: ${params.backwater ? "ON":"OFF"}`} hint={ds?.backwater.label} />
                <p className="text-xs text-fg-4">{ds?.backwater.label}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" size="lg" className="flex-1" onClick={() => run(true)} disabled={running}>
                {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                Run simulation
              </Button>
              <Button
                size="lg"
                onClick={() => {
                  setParams(DEFAULT_SCENARIO);
                  setLabel("Custom scenario");
                  setResp(null);
                  firstRun.current = true;
                  tween(0);
                }}
                title="Reset inputs"
              >
                <RotateCcw className="h-4 w-4" /> Reset
              </Button>
            </div>
            <div className="mt-2.5">
              <Toggle checked={live} onChange={setLive} label="Live preview after first run" hint="Re-runs the model ~0.4 s after each change" />
            </div>
            {err && <p className="mt-2 text-xs text-danger">{err}</p>}
          </Panel>
        </div>

        {/* map */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded border border-line">
          {ds ? (
            <FloodMap ds={ds} res={resp?.result ?? null} clock={clock} layers={layers} selection={selection} onSelect={select}>
              <LayerPanel defaultOpen={false} />
              <MapToolbar />
              <Legend showDrain={layers.drainage} showRain={layers.rain} />
              {resp && <TimeBar />}
              {resp && <DetailPanel ds={ds} res={resp.result} clock={clock} selection={selection} onClose={() => select(null)} onSelect={select} />}
              {!resp && stage < 0 && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/25">
                  <div className="rounded border border-line-strong bg-surface px-6 py-5 text-center shadow-float">
                    <Sparkles className="mx-auto h-6 w-6 text-accent" />
                    <p className="mt-2 text-sm font-semibold text-fg">Set the storm and drainage conditions, then press Run simulation</p>
                    <p className="mt-1 text-xs text-fg-3">Try the “Cloudburst” or “Pre-monsoon desilting missed” presets.</p>
                  </div>
                </div>
              )}
              {stage >= 0 && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25">
                  <div className="w-[380px] rounded border border-accent/40 bg-surface p-5 shadow-float">
                    <div className="font-mono text-xs font-semibold text-accent">Running coupled model</div>
                    <div className="mt-3 space-y-2">
                      {STAGES.map((s, i) => (
                        <div key={s} className={cx("flex items-center gap-2.5 text-sm transition-colors", i < stage ? "text-fg-3" : i === stage ? "text-fg" : "text-fg-4")}>
                          <span className="flex h-5 w-5 items-center justify-center">
                            {i < stage ? <Check className="h-4 w-4 text-ok" /> : i === stage ? <LoaderCircle className="h-4 w-4 animate-spin text-accent" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />}
                          </span>
                          {s}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 h-1 overflow-hidden rounded-full bg-line">
                      <div className="h-full bg-accent transition-all duration-500" style={{ width: `${(Math.min(stage + 1, STAGES.length) / STAGES.length) * 100}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </FloodMap>
          ) : (
            <Loading />
          )}
        </div>

        {/* results */}
        <div className="scroll-thin flex w-[360px] shrink-0 flex-col gap-2.5 overflow-y-auto">
          <Panel title="Predicted outcome" sim className="shrink-0" subtitle={resp ? `${label} · engine ${resp.computeMs} ms` : "Run a scenario to see results"}>
            {resp ? <Outcome s={resp.summary} b={resp.baselineSummary} /> : <p className="text-xs text-fg-4">No run yet.</p>}
            {resp && (
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    applyScenario(resp.params, label);
                    toast({ tone: "info", title: "Scenario applied to Command Center", body: "Map, alerts and actions now reflect this scenario. Clear it from the top bar." });
                    router.push("/command-center");
                  }}
                >
                  <Send className="h-3.5 w-3.5" /> Apply to Command Center
                </Button>
              </div>
            )}
          </Panel>
          {resp && ds && <CompareChart ds={ds} res={resp.result} base={baseline?.result} clock={clock} />}
          {resp && (
            <Panel title="Alerts this scenario would trigger" sim className="shrink-0" bodyClassName="p-2">
              <AlertList alerts={resp.alerts.slice(0, 4)} compact emptyText="No alert thresholds crossed." />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Outcome({ s, b }: { s: NowcastSummary; b: NowcastSummary }) {
  const rows: { label: string; v: string; d: number; color?: string; unit?: string }[] = [
    { label: "Maximum depth", v: `${s.maxDepth.toFixed(2)} m`, d: s.maxDepth - b.maxDepth, color: RISK_TEXT[riskOf(s.maxDepth)], unit: "m" },
    { label: "Flooded roads", v: String(s.roadsAtRisk), d: s.roadsAtRisk - b.roadsAtRisk },
    { label: "Critical intersections", v: String(s.criticalIntersections), d: s.criticalIntersections - b.criticalIntersections },
    { label: "Peak flood time", v: clockLabel12(s.peakClock), d: 0 },
    { label: "Affected population", v: s.affectedPopulation.toLocaleString("en-IN"), d: s.affectedPopulation - b.affectedPopulation },
    { label: "Hospitals at risk", v: String(s.hospitalsAtRisk), d: s.hospitalsAtRisk - b.hospitalsAtRisk },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map((r) => (
        <div key={r.label} className="rounded border border-line bg-surface-2 px-2.5 py-2">
          <div className="text-xs font-semibold text-fg-4">{r.label}</div>
          <div className="mt-0.5 font-mono text-xl font-semibold text-fg tnum" style={r.color ? { color: r.color } : undefined}>
            {r.v}
          </div>
          {r.label !== "Peak flood time" && (
            <div className={cx("font-mono text-xs", r.d > 0 ? "text-danger" : r.d < 0 ? "text-ok" : "text-fg-4")}>
              {r.d === 0 ? "= baseline nowcast" : `${r.d > 0 ? "▲":"▼"} ${r.unit ? Math.abs(r.d).toFixed(2) : Math.abs(Math.round(r.d)).toLocaleString("en-IN")} vs baseline`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CompareChart({ ds, res, base, clock }: { ds: CityDataset; res: SimResult; base?: SimResult; clock: number }) {
  const data = useMemo(() => {
    const majors = ds.roads.map((r, i) => ({ r, i })).filter((x) => x.r.major);
    const count = (rs: SimResult, c: number) => majors.filter(({ i }) => sample(rs.roads.depth[i], rs, c) >= UNSAFE_DEPTH).length;
    const out: { t: number; scenario: number; baseline: number | null; rain: number }[] = [];
    for (let t = 0; t <= 180; t += 5) out.push({ t, scenario: count(res, NOW_CLOCK + t), baseline: base ? count(base, NOW_CLOCK + t) : null, rain: Math.round(sample(res.rainMean, res, NOW_CLOCK + t)) });
    return out;
  }, [ds, res, base]);
  return (
    <Panel title="Unsafe roads over time" subtitle="Scenario vs current baseline nowcast" sim className="shrink-0" bodyClassName="p-2">
      <div className="h-44">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, 180]} ticks={[0, 60, 120, 180]} tickFormatter={(v) => clockLabel(NOW_CLOCK + v)} tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip {...chartTooltip} labelFormatter={(v) => clockLabel(NOW_CLOCK + Number(v))} />
            <RLegend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine x={clock - NOW_CLOCK} stroke="var(--chart-rain)" />
            <Line dataKey="scenario" name="Scenario" stroke="var(--chart-warn)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
            <Line dataKey="baseline" name="Baseline" stroke="var(--chart-axis)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            <Line dataKey="rain" name="Rain mm/hr" stroke="var(--chart-rain)" strokeOpacity={0.6} strokeWidth={1} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
