"use client";
import clsx from "clsx";
import { Info, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { HealthStatus, RiskLevel, Severity } from "@/lib/types";
import { RISK_COLOR, RISK_LABEL, RISK_TEXT } from "@/lib/engine/constants";

export const cx = clsx;

/** Semantic tones usable wherever a value is coloured. */
export const TONE = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  accent: "var(--accent)",
  rain: "var(--rain)",
  muted: "var(--fg-3)",
} as const;
export type ToneKey = keyof typeof TONE;
const toneColor = (t?: string) => (t ? (t in TONE ? TONE[t as ToneKey] : t) : undefined);

/* ------------------------------ Panel ------------------------------ */
export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
  sim,
  subtitle,
}: {
  title?: ReactNode;
  /** accepted for compatibility; headers are text-only by design */
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  sim?: boolean | string;
  subtitle?: ReactNode;
}) {
  return (
    <section className={cx("flex min-h-0 flex-col rounded border border-line bg-surface", className)}>
      {(title || right) && (
        <header className="flex min-h-10 items-center gap-2 border-b border-line px-3.5 py-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[13px] font-semibold text-fg">{title}</h3>
            {subtitle && <p className="truncate text-xs text-fg-3">{subtitle}</p>}
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
    <span title="Values are simulated demo data, not a live feed" className="shrink-0 rounded-sm border border-line px-1.5 py-px text-[11px] text-fg-4">
      {label ?? "Simulated"}
    </span>
  );
}

/* ------------------------------ Badges ------------------------------ */
export function RiskBadge({ level, size = "sm", className }: { level: RiskLevel; size?: "xs" | "sm" | "lg"; className?: string }) {
  const critical = level === "critical";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-sm border font-medium whitespace-nowrap",
        size === "xs" && "px-1.5 py-0 text-[11px]",
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "lg" && "px-2.5 py-1 text-sm",
        className,
      )}
      style={{
        color: critical ? "#ffffff" : RISK_TEXT[level],
        borderColor: critical ? RISK_COLOR.critical : `color-mix(in srgb, ${RISK_COLOR[level]} 45%, transparent)`,
        background: critical ? RISK_COLOR.critical : `color-mix(in srgb, ${RISK_COLOR[level]} 12%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: critical ? "#ffffff" : RISK_COLOR[level] }} />
      {RISK_LABEL[level]}
    </span>
  );
}

const SEV: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "border-danger bg-danger text-white" },
  high: { label: "High", cls: "border-danger/40 bg-danger-subtle text-danger" },
  medium: { label: "Medium", cls: "border-warn/40 bg-warn-subtle text-warn" },
  low: { label: "Low", cls: "border-accent/30 bg-accent-subtle text-accent-fg" },
};
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEV[severity];
  return <span className={cx("inline-flex items-center rounded-sm border px-1.5 py-px text-[11px] font-semibold", s.cls, className)}>{s.label}</span>;
}

const HEALTH: Record<HealthStatus, { label: string; color: string }> = {
  online: { label: "Online", color: "var(--ok)" },
  delayed: { label: "Delayed", color: "var(--warn)" },
  warning: { label: "Warning", color: "var(--warn)" },
  offline: { label: "Offline", color: "var(--danger)" },
  static: { label: "Ready", color: "var(--accent)" },
};
export function StatusPill({ status, label }: { status: HealthStatus; label?: string }) {
  const h = HEALTH[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap" style={{ color: h.color }}>
      <span className="h-2 w-2 rounded-full" style={{ background: h.color }} />
      {label ?? h.label}
    </span>
  );
}
export function StatusDot({ status, className }: { status: HealthStatus; className?: string }) {
  return <span className={cx("inline-block h-2 w-2 rounded-full", className)} style={{ background: HEALTH[status].color }} />;
}

export function Tag({ children, tone = "slate", className }: { children: ReactNode; tone?: "slate" | "cyan" | "blue" | "amber" | "green" | "red" | "violet"; className?: string }) {
  const tones = {
    slate: "border-line bg-surface-2 text-fg-2",
    cyan: "border-accent/30 bg-accent-subtle text-accent-fg",
    blue: "border-accent/30 bg-accent-subtle text-accent-fg",
    violet: "border-accent/30 bg-accent-subtle text-accent-fg",
    amber: "border-warn/35 bg-warn-subtle text-warn",
    green: "border-ok/35 bg-ok-subtle text-ok",
    red: "border-danger/35 bg-danger-subtle text-danger",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
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
        "inline-flex items-center justify-center gap-1.5 rounded font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
        size === "xs" && "h-7 px-2 text-xs",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-9 px-3.5 text-[13px]",
        size === "lg" && "h-10 px-4 text-sm",
        variant === "primary" && "bg-accent text-white hover:bg-accent-hover",
        variant === "secondary" && "border border-line-strong bg-surface text-fg hover:bg-surface-3",
        variant === "outline" && "border border-accent/50 text-accent hover:bg-accent-subtle",
        variant === "ghost" && "text-fg-2 hover:bg-surface-3",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        variant === "success" && "bg-ok text-white hover:opacity-90",
        active && "border-accent bg-accent-subtle text-accent-fg",
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
  question,
  className,
  size = "md",
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  sub?: ReactNode;
  /** semantic tone key (ok/warn/danger/accent/rain/muted) or a CSS colour */
  tone?: string;
  /** accepted for compatibility; KPI tiles are text-only */
  icon?: ReactNode;
  question?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cx("min-w-0 rounded border border-line bg-surface px-3.5 py-2.5", className)}>
      <div className="truncate text-xs font-medium text-fg-3" title={question ? `${question} — ${label}` : label}>
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1 tnum">
        <span className={cx("font-semibold", size === "sm" && "text-xl", size === "md" && "text-[26px] leading-8", size === "lg" && "text-4xl")} style={{ color: toneColor(tone) ?? "var(--fg)" }}>
          {value}
        </span>
        {unit && <span className="text-[13px] text-fg-3">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-fg-4">{sub}</div>}
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
        className={cx("relative h-[18px] w-8 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-line-strong")}
      >
        <span className={cx("absolute top-[3px] h-3 w-3 rounded-full bg-white shadow-sm transition-all", checked ? "left-[17px]" : "left-[3px]")} />
      </button>
      {color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
      {label && <span className="text-[13px] text-fg-2">{label}</span>}
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
        <span className="flex items-center gap-1 text-[13px] text-fg-2" title={hint}>
          {label}
          {hint && <Info className="h-3.5 w-3.5 text-fg-4" />}
        </span>
        <span className="rounded-sm border border-line bg-surface-2 px-1.5 py-px text-[13px] font-medium text-fg tnum">
          {format ? format(value) : value}
          {unit && <span className="ml-0.5 font-normal text-fg-3">{unit}</span>}
        </span>
      </div>
      <input className="range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <div className="flex justify-between text-[11px] text-fg-4 tnum">
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
    <div className="inline-flex overflow-hidden rounded border border-line-strong bg-surface">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "font-medium transition-colors",
            i > 0 && "border-l border-line-strong",
            size === "xs" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-[13px]",
            value === o.value ? "bg-accent-subtle text-accent-fg" : "text-fg-2 hover:bg-surface-3",
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
      className={cx("h-8 rounded border border-line-strong bg-surface px-2 text-[13px] text-fg focus:border-accent focus:outline-none", className)}
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
    <div className={cx("w-full overflow-hidden rounded-sm bg-line", className)} style={{ height }}>
      <div className="h-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color ?? "var(--accent)" }} />
    </div>
  );
}

/* ------------------------------ States ------------------------------ */
export function Loading({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cx("flex h-full min-h-24 items-center justify-center gap-2 text-[13px] text-fg-3", className)}>
      <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded bg-surface-3", className)} />;
}

export function ErrorState({ error, onRetry, className }: { error: Error | string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cx("flex h-full min-h-24 flex-col items-center justify-center gap-2 p-4 text-center", className)}>
      <TriangleAlert className="h-5 w-5 text-warn" />
      <p className="text-[13px] font-medium text-fg">Could not load data</p>
      <p className="max-w-xs text-xs text-fg-3">{typeof error === "string" ? error : error.message}</p>
      {onRetry && (
        <Button size="xs" onClick={onRetry}>
          <RefreshCw className="h-3 w-3" /> Retry
        </Button>
      )}
    </div>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex min-h-16 items-center justify-center p-4 text-center text-[13px] text-fg-4", className)}>{children}</div>;
}

export function KV({ k, v, mono, tone }: { k: ReactNode; v: ReactNode; mono?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-fg-3">{k}</span>
      <span className={cx("text-right text-fg tnum", mono && "font-mono text-xs")} style={tone ? { color: toneColor(tone) } : undefined}>
        {v}
      </span>
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-2 flex items-center justify-between", className)}>
      <h4 className="text-xs font-semibold text-fg-3">{children}</h4>
      {right}
    </div>
  );
}
