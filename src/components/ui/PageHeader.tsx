import type { ReactNode } from "react";
import { cx } from "./primitives";

export function PageHeader({ title, subtitle, right, kicker, className }: { title: string; subtitle?: ReactNode; right?: ReactNode; kicker?: string; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {kicker && <div className="font-mono text-[10px] font-bold tracking-[0.18em] text-cyan-400/80 uppercase">{kicker}</div>}
        <h1 className="text-lg font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl text-[12.5px] text-slate-400">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/** Standard dark tooltip styling for Recharts. */
export const chartTooltip = {
  contentStyle: { background: "#0d172b", border: "1px solid #273a5f", borderRadius: 8, fontSize: 11, color: "#e2e8f0" },
  labelStyle: { color: "#94a3b8" },
  itemStyle: { color: "#e2e8f0" },
};
export const axisTick = { fill: "#64748b", fontSize: 10 };
