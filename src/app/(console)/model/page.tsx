"use client";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { BookOpen, BrainCircuit, FlaskConical, ShieldAlert, Target } from "lucide-react";
import { useNetwork, useNowcast } from "@/lib/hooks/data";
import { sample } from "@/lib/engine/analysis";
import { NOW_CLOCK, RISK_COLOR, RISK_LABEL, RISK_ORDER, riskOf } from "@/lib/engine/constants";
import { EnginePanel } from "@/components/panels/EnginePanel";
import { PageHeader, axisTick, chartTooltip } from "@/components/ui/PageHeader";
import { Panel, Tag, cx } from "@/components/ui/primitives";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const METRICS = [
  { label: "Precision", value: "0.81", tag: "Literature reference", tone: "violet", note: "Graph deep-learning flood nowcasting, census-tract level — reference cited in our proposal (slide 4*). Not our result." },
  { label: "Recall", value: "0.89", tag: "Literature reference", tone: "violet", note: "Same study as above. Our street-level target will be reported separately after evaluation." },
  { label: "Prediction lead time", value: "0–3 hr", tag: "Design target", tone: "cyan", note: "Nowcast horizon of the prototype (5-min steps)." },
  { label: "Mean depth error", value: "0.18 m", tag: "Prototype target", tone: "amber", note: "Target street-level MAE vs SWMM/HEC-RAS 2D benchmark runs." },
  { label: "Inference time", value: "18 s", tag: "Target", tone: "amber", note: "Per city update on a single GPU; demo engine runs in milliseconds." },
] as const;

const TRAINING = [
  { name: "Synthetic SWMM / HEC-RAS 2D simulations", detail: "Thousands of design storms × drain states per pilot ward — dense depth labels where none exist", status: "Planned" },
  { name: "Historical flood events", detail: "IMD/AWS rainfall archives + municipal waterlogging complaint logs", status: "Planned" },
  { name: "Citizen observations", detail: "Geotagged photos / reports for fine-tuning and validation", status: "Planned" },
];

export default function ModelPage() {
  const { data: ds } = useNetwork();
  const { data: now } = useNowcast();

  // illustrative predicted-vs-observed points (synthetic, deterministic)
  const scatter = useMemo(() => {
    const rng = mulberry32(42);
    return Array.from({ length: 160 }, () => {
      const obs = Math.pow(rng(), 1.6) * 1.5;
      const pred = Math.max(0, obs + (rng() + rng() + rng() - 1.5) * 0.3);
      return { obs: Math.round(obs * 100) / 100, pred: Math.round(pred * 100) / 100 };
    });
  }, []);

  // REAL output of the demo engine: risk class distribution at +60 min
  const dist = useMemo(() => {
    if (!ds || !now) return [];
    const c: Record<string, number> = { safe: 0, low: 0, moderate: 0, high: 0, critical: 0 };
    ds.roads.forEach((r, i) => {
      if (r.major) c[riskOf(sample(now.result.roads.depth[i], now.result, NOW_CLOCK + 60))]++;
    });
    return RISK_ORDER.map((r) => ({ r, label: RISK_LABEL[r], n: c[r] }));
  }, [ds, now]);

  // illustrative confusion matrix (rows = observed, cols = predicted)
  const cm = [
    [412, 21, 4, 1, 0],
    [26, 88, 12, 2, 0],
    [5, 13, 41, 7, 1],
    [1, 2, 8, 33, 4],
    [0, 0, 1, 5, 19],
  ];
  const maxCm = Math.max(...cm.flat());

  return (
    <div className="scroll-thin flex h-full flex-col gap-2.5 overflow-y-auto p-2.5">
      <PageHeader kicker="Model performance · validation" title="Model Performance" subtitle="What we will measure, what we target, and where the reference numbers come from." />
      <div className="flex items-start gap-3 rounded border border-warn/40 bg-warn-subtle px-4 py-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
        <div className="text-[13px] leading-relaxed text-warn">
          <b className="text-warn">No PI-GNN has been trained or evaluated for this prototype yet.</b> Precision/recall below are <b>literature reference values</b> cited in our proposal (census-tract level),
          the other figures are <b>prototype targets</b>, and the scatter / confusion matrix are <b>illustrative</b>. The flood maps in this demo come from a simplified coupled rainfall–drainage engine.
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2.5">
        {METRICS.map((m) => (
          <div key={m.label} className="rounded border border-line bg-surface p-3.5">
            <Tag tone={m.tone as "violet"}>{m.tag}</Tag>
            <div className="mt-2 font-mono text-3xl font-semibold text-fg">{m.value}</div>
            <div className="text-xs font-semibold text-fg-3">{m.label}</div>
            <p className="mt-1.5 text-xs leading-snug text-fg-4">{m.note}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Panel title="Predicted vs observed flood depth" subtitle="Illustrative — synthetic points, not an evaluation" icon={<Target className="h-3.5 w-3.5" />} right={<Tag tone="amber">Illustrative</Tag>} bodyClassName="p-2">
          <div className="h-60">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 10, left: -10, bottom: 4 }}>
                <CartesianGrid stroke="var(--chart-grid)" />
                <XAxis type="number" dataKey="obs" name="Observed" unit="m" domain={[0, 1.6]} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="number" dataKey="pred" name="Predicted" unit="m" domain={[0, 1.6]} tick={axisTick} axisLine={false} tickLine={false} />
                <ZAxis range={[20, 20]} />
                <Tooltip {...chartTooltip} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1.6, y: 1.6 }]} stroke="var(--chart-axis)" strokeDasharray="4 4" />
                <Scatter data={scatter} fill="var(--chart-rain)" fillOpacity={0.55} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Risk classification at +60 min" subtitle="Actual output of the demo engine (major road segments)" icon={<BrainCircuit className="h-3.5 w-3.5" />} right={<Tag tone="green">Live demo output</Tag>} bodyClassName="p-2">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={dist} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="n" name="Road segments" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                  {dist.map((d) => (
                    <Cell key={d.r} fill={RISK_COLOR[d.r]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Confusion matrix" subtitle="Illustrative 5-class layout for street risk evaluation" right={<Tag tone="amber">Illustrative</Tag>}>
          <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1 text-center text-xs">
            <div />
            {RISK_ORDER.map((r) => (
              <div key={r} className="font-semibold text-fg-4">
                {RISK_LABEL[r].slice(0, 4)}
              </div>
            ))}
            {cm.map((row, i) => (
              <div key={i} className="contents">
                <div className="pr-1 text-right font-semibold text-fg-4">{RISK_LABEL[RISK_ORDER[i]].slice(0, 4)}</div>
                {row.map((v, j) => (
                  <div
                    key={j}
                    className={cx("flex h-9 items-center justify-center rounded font-mono text-xs", i === j ? "text-fg" : "text-fg-2")}
                    style={{ background: i === j ? `rgba(34,211,238,${0.2 + (v / maxCm) * 0.7})` : `rgba(248,113,113,${Math.min(0.5, v / 40)})` }}
                  >
                    {v}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-fg-4">
            <span>rows: observed</span>
            <span>columns: predicted</span>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Panel title="Training data (planned)" icon={<BookOpen className="h-3.5 w-3.5" />}>
          <div className="space-y-2">
            {TRAINING.map((t) => (
              <div key={t.name} className="rounded border border-line bg-surface-2 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-fg">{t.name}</span>
                  <Tag tone="slate" className="ml-auto">
                    {t.status}
                  </Tag>
                </div>
                <p className="mt-0.5 text-xs text-fg-3">{t.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Evaluation protocol" icon={<FlaskConical className="h-3.5 w-3.5" />}>
          <ul className="space-y-1.5 text-[12.5px] text-fg-2">
            <li>• Hold-out storms per ward (no temporal leakage)</li>
            <li>• POD / FAR / CSI at the 0.3 m “unsafe road” threshold</li>
            <li>• Street-depth MAE &amp; RMSE vs SWMM / HEC-RAS 2D</li>
            <li>• Skill vs lead time (15 → 180 min) against persistence</li>
            <li>• Alert false-alarm rate per ward before scale-up</li>
            <li>• Physics check: mass balance &amp; surcharge timing</li>
          </ul>
        </Panel>
        <EnginePanel ds={ds} nowcast={now} full />
      </div>
    </div>
  );
}
