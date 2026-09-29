"use client";
import { CloudRain, Gauge, MapPinned, Timer, TriangleAlert, Users } from "lucide-react";
import type { NowcastSummary } from "@/lib/types";
import type { RainfallResponse } from "@/lib/api/types";
import { RISK_COLOR, RISK_TEXT, clockLabel, riskOf } from "@/lib/engine/constants";
import { Skeleton, Stat } from "../ui/primitives";

export function KpiStrip({ summary, rain, horizonLabel, actions }: { summary?: NowcastSummary; rain?: RainfallResponse; horizonLabel: string; actions?: number }) {
  if (!summary) {
    return (
      <div className="grid grid-cols-6 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[78px] rounded" />
        ))}
      </div>
    );
  }
  const maxRisk = riskOf(summary.maxDepth);
  return (
    <div className="grid grid-cols-3 gap-2.5 xl:grid-cols-6">
      <Stat
        question="Where?"
        icon={<MapPinned className="h-3.5 w-3.5" />}
        value={summary.roadsAtRisk}
        label="Roads at risk"
        sub={`${summary.sectorsAffected} sectors · ${summary.criticalIntersections} critical junctions`}
        tone={summary.roadsAtRisk ? "var(--chart-warn)" : "var(--ok)"}
      />
      <Stat
        question="When?"
        icon={<Timer className="h-3.5 w-3.5" />}
        value={summary.firstImpactMin == null ? "—" : summary.firstImpactMin}
        unit={summary.firstImpactMin == null ? undefined : "min"}
        label="Time to impact"
        sub={`Peak flooding ${clockLabel(summary.peakClock)}`}
        tone={summary.firstImpactMin != null && summary.firstImpactMin < 45 ? "var(--warn)" : undefined}
      />
      <Stat
        question="How severe?"
        icon={<TriangleAlert className="h-3.5 w-3.5" />}
        value={summary.maxDepth.toFixed(2)}
        unit="m"
        label="Max water depth"
        sub={`${horizonLabel}`}
        tone={RISK_TEXT[maxRisk]}
      />
      <Stat
        icon={<CloudRain className="h-3.5 w-3.5" />}
        question="Now"
        value={rain ? Math.round(rain.current) : "—"}
        unit="mm/hr"
        label="Current rainfall"
        sub={rain ? `${rain.accumulated} mm since 06:00 · ${rain.trend30 >= 0 ? "▲":"▼"} ${Math.abs(rain.trend30)} in 30 min` : ""}
        tone="var(--chart-rain)"
      />
      <Stat
        icon={<Users className="h-3.5 w-3.5" />}
        question="Impact"
        value={summary.affectedPopulation.toLocaleString("en-IN")}
        label="People affected"
        sub={`${summary.hospitalsAtRisk} hospital access at risk${actions ? ` · ${actions} actions` : ""}`}
        tone={summary.affectedPopulation ? "var(--danger)" : undefined}
      />
      <Stat
        icon={<Gauge className="h-3.5 w-3.5" />}
        question="Trust"
        value={Math.round(summary.confidence * 100)}
        unit="%"
        label="Model confidence"
        sub="At 60-min lead · prototype value"
      />
    </div>
  );
}
