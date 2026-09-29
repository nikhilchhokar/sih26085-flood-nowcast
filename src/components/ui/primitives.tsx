"use client";
import clsx from "clsx";
import { TriangleAlert, Info, LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { RiskLevel, Severity, HealthStatus } from "@/lib/types";
import { RISK_COLOR, RISK_LABEL, RISK_TEXT } from "@/lib/engine/constants";

export const cx = clsx;

/* ------------------------------ Panel ------------------------------ */
export function Panel({
  title,
  icon,
  right,
  children,
  className,
  bodyClassName,
  sim,
  subtitle,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  sim?: boolean | string;
  subtitle?: ReactNode;
}) {
  return (
    <section className={cx("flex min-h-0 flex-col rounded-xl border border-ink-700 bg-ink-900/90 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]", className)}>
      {(title || right) && (
        <header className="flex items-center gap-2 border-b border-ink-700/70 px-3.5 py-2.5">
          {icon && <span className="text-slate-400">{icon}</span>}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[11px] font-semibold tracking-[0.08em] text-slate-300 uppercase">{title}</h3>
            {subtitle && <p className="truncate text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {sim && <SimTag label={typeof sim === "string" ? sim : undefined} />}
          {right}
        </header>
      )}
      <div className={cx("min-h-0 flex-1", bodyClassName ?? "p-3.5")}>{children}</div>
    </section>
  );
}

export function SimTag({ label }: { label?: string }) {
  return (
    <span
      title="Values are simulated demo data — not a live feed"
      className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-amber-300 uppercase"
    >
      {label ?? "Sim"}
    </span>
  );
}

/* ------------------------------ Badges ------------------------------ */
export function RiskBadge({ level, size = "sm", className }: { level: RiskLevel; size?: "xs" | "sm" | "lg"; className?: string }) {
  const c = RISK_COLOR[level];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border font-semibold tracking-wide uppercase",
        size === "xs" && "px-1.5 py-0 text-[9px]",
        size === "sm" && "px-2 py-0.5 text-[10px]",
        size === "lg" && "px-3 py-1 text-sm",
        className,
      )}
      style={{ color: level === "critical" ? "#fecaca" : RISK_TEXT[level], borderColor: (level === "critical" ? "#ef4444" : c) + "66", background: c + (level === "critical" ? "cc" : "1f") }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: level === "critical" ? "#fecaca" : c }} />
      {RISK_LABEL[level]}
    </span>
  );
}

const SEV: Record<Severity, { label: string; cls: string; dot: string }> = {
  critical: { label: "Critical", cls: "bg-red-600 text-white border-red-500", dot: "bg-white" },
  high: { label: "High", cls: "bg-red-500/15 text-red-300 border-red-500/40", dot: "bg-red-400" },
  medium: { label: "Medium", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40", dot: "bg-amber-400" },
  low: { label: "Low", cls: "bg-sky-500/15 text-sky-300 border-sky-500/40", dot: "bg-sky-400" },
};
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEV[severity];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase", s.cls, className)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot, severity === "critical" && "blink-soft")} />
      {s.label}
    </span>
  );
}

const HEALTH: Record<HealthStatus, { label: string; color: string }> = {
  online: { label: "Online", color: "#22c55e" },
  delayed: { label: "Delayed", color: "#facc15" },
  warning: { label: "Warning", color: "#f97316" },
  offline: { label: "Offline", color: "#ef4444" },
  static: { label: "Ready", color: "#60a5fa" },
};
export function StatusPill({ status, label }: { status: HealthStatus; label?: string }) {
  const h = HEALTH[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase" style={{ color: h.color, borderColor: h.color + "55", background: h.color + "14" }}>
      <span className={cx("h-1.5 w-1.5 rounded-full", status === "online" && "blink-soft")} style={{ background: h.color }} />
      {label ?? h.label}
    </span>
  );
}
export function StatusDot({ status, className }: { status: HealthStatus; className?: string }) {
  return <span className={cx("inline-block h-2 w-2 rounded-full", className)} style={{ background: HEALTH[status].color }} />;
}

export function Tag({ children, tone = "slate", className }: { children: ReactNode; tone?: "slate" | "cyan" | "blue" | "amber" | "green" | "red" | "violet"; className?: string }) {
  const tones = {
    slate: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    cyan: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
    blue: "border-blue-400/30 bg-blue-400/10 text-blue-300",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    red: "border-red-400/30 bg-red-400/10 text-red-300",
    violet: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase", tones[tone], className)}>{children}</span>;
}

/* ------------------------------ Button ------------------------------ */
export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "sm",
  className,
  disabled,
  title,
  type = "button",
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  active?: boolean;
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
        size === "xs" && "h-6 px-2 text-[10px] tracking-wide uppercase",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "lg" && "h-11 px-5 text-sm tracking-wide",
        variant === "primary" && "bg-cyan-400 text-ink-950 hover:bg-cyan-300",
        variant === "secondary" && "border border-ink-600 bg-ink-800 text-slate-200 hover:border-ink-500 hover:bg-ink-750",
        variant === "outline" && "border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10",
        variant === "ghost" && "text-slate-300 hover:bg-ink-800",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-500",
        variant === "success" && "bg-emerald-500 text-ink-950 hover:bg-emerald-400",
        active && "border-cyan-400/60 bg-cyan-400/10 text-cyan-200",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------ Stat ------------------------------ */
export function Stat({
  value,
  unit,
  label,
  sub,
  tone,
  icon,
  question,
  className,
  size = "md",
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  sub?: ReactNode;
  tone?: string;
  icon?: ReactNode;
  question?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cx("min-w-0 rounded-xl border border-ink-700 bg-ink-900/90 px-3.5 py-2.5", className)}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-slate-500">{icon}</span>}
        {question && <span className="font-mono text-[9px] font-bold tracking-widest text-cyan-400/80 uppercase">{question}</span>}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1 tnum">
        <span
          className={cx("font-semibold tracking-tight", size === "sm" && "text-xl", size === "md" && "text-[26px] leading-8", size === "lg" && "text-4xl")}
          style={tone ? { color: tone } : undefined}
        >
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-slate-400">{unit}</span>}
      </div>
      <div className="truncate text-[10px] font-semibold tracking-[0.1em] text-slate-400 uppercase">{label}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

/* ------------------------------ Inputs ------------------------------ */
export function Toggle({ checked, onChange, label, hint, color, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: string; color?: string; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-center gap-2.5 py-1 select-none", disabled && "cursor-not-allowed opacity-50")} title={hint}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative h-4.5 w-8 shrink-0 rounded-full border transition-colors", checked ? "border-cyan-400/60 bg-cyan-400/30" : "border-ink-600 bg-ink-800")}
      >
        <span className={cx("absolute top-0.5 h-3 w-3 rounded-full transition-all", checked ? "left-4 bg-cyan-300" : "left-0.5 bg-slate-500")} />
      </button>
      {color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
      {label && <span className="text-xs text-slate-300">{label}</span>}
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  hint,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  hint?: string;
  format?: (v: number) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase" title={hint}>
          {label}
          {hint && <Info className="ml-1 inline h-3 w-3 text-slate-600" />}
        </span>
        <span className="rounded border border-ink-600 bg-ink-850 px-2 py-0.5 font-mono text-xs text-cyan-200 tnum">
          {format ? format(value) : value}
          {unit && <span className="ml-0.5 text-slate-500">{unit}</span>}
        </span>
      </div>
      <input className="range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <div className="flex justify-between font-mono text-[9px] text-slate-600">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "sm" }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: "xs" | "sm" }) {
  return (
    <div className="inline-flex rounded-lg border border-ink-600 bg-ink-850 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md font-semibold transition-colors",
            size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
            value === o.value ? "bg-ink-600 text-white" : "text-slate-400 hover:text-slate-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; label?: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cx("h-8 rounded-lg border border-ink-600 bg-ink-850 px-2 text-xs text-slate-200 focus:border-cyan-400/60 focus:outline-none", className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Meter({ value, color, className, height = 6 }: { value: number; color?: string; className?: string; height?: number }) {
  return (
    <div className={cx("w-full overflow-hidden rounded-full bg-ink-700", className)} style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color ?? "#22d3ee" }} />
    </div>
  );
}

/* ------------------------------ States ------------------------------ */
export function Loading({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cx("flex h-full min-h-24 items-center justify-center gap-2 text-xs text-slate-400", className)}>
      <LoaderCircle className="h-4 w-4 animate-spin text-cyan-400" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-ink-750", className)} />;
}

export function ErrorState({ error, onRetry, className }: { error: Error | string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cx("flex h-full min-h-24 flex-col items-center justify-center gap-2 p-4 text-center", className)}>
      <TriangleAlert className="h-5 w-5 text-amber-400" />
      <p className="text-xs text-slate-300">Could not load data</p>
      <p className="max-w-xs text-[11px] text-slate-500">{typeof error === "string" ? error : error.message}</p>
      {onRetry && (
        <Button size="xs" onClick={onRetry}>
          <RefreshCw className="h-3 w-3" /> Retry
        </Button>
      )}
    </div>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex min-h-16 items-center justify-center p-4 text-center text-xs text-slate-500", className)}>{children}</div>;
}

export function KV({ k, v, mono, tone }: { k: ReactNode; v: ReactNode; mono?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="text-slate-500">{k}</span>
      <span className={cx("text-right text-slate-200 tnum", mono && "font-mono")} style={tone ? { color: tone } : undefined}>
        {v}
      </span>
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-2 flex items-center justify-between", className)}>
      <h4 className="text-[10px] font-bold tracking-[0.12em] text-slate-500 uppercase">{children}</h4>
      {right}
    </div>
  );
}
