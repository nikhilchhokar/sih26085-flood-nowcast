import type { ReactNode } from "react";
import { cx } from "./primitives";

export function PageHeader({ title, subtitle, right, kicker, className }: { title: string; subtitle?: ReactNode; right?: ReactNode; kicker?: string; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-3 pb-0.5", className)}>
      <div className="min-w-0">
        {kicker && <div className="text-xs text-fg-4">{kicker}</div>}
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl text-[13px] text-fg-3">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/** Recharts styling bound to theme variables (SVG attributes accept CSS vars). */
export const chartTooltip = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 4, fontSize: 12, color: "var(--fg)", boxShadow: "var(--shadow-float)" },
  labelStyle: { color: "var(--fg-3)", marginBottom: 2 },
  itemStyle: { color: "var(--fg)", padding: 0 },
};
export const axisTick = { fill: "var(--chart-axis)", fontSize: 11 };
