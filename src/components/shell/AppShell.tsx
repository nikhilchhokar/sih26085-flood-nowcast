"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CircleDot,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Presentation,
  Square,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useAlerts, useHealth, useNetwork } from "@/lib/hooks/data";
import { api } from "@/lib/api/client";
import { prefetch } from "@/lib/hooks/useApi";
import type { CityId } from "@/lib/types";
import { NOW_CLOCK, clockLabel } from "@/lib/engine/constants";
import { NAV } from "./nav";
import { LogoMark } from "./Logo";
import { SeverityBadge, cx } from "../ui/primitives";
import { LiveDemoController } from "../demo/LiveDemoController";

const CITIES: { id: CityId; label: string }[] = [
  { id: "delhi", label: "Delhi" },
  { id: "mumbai", label: "Mumbai" },
  { id: "chennai", label: "Chennai" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    useApp.persist.rehydrate();
  }, []);
  // prefetch the heavy datasets once per city so page switches are instant
  const city = useApp((s) => s.city);
  useEffect(() => {
    prefetch(`network:${city}`, () => api.network(city));
  }, [city]);

  return (
    <div className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-ink-950">
      <Topbar />
      <div className="flex min-h-0 flex-1">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <main className="relative min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <Toasts />
      <LiveDemoController />
    </div>
  );
}

/* -------------------------------- Sidebar -------------------------------- */
function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const path = usePathname();
  return (
    <nav className={cx("flex shrink-0 flex-col border-r border-ink-700 bg-ink-900 transition-[width] duration-200", collapsed ? "w-14" : "w-56")}>
      <div className="scroll-thin flex-1 overflow-y-auto py-2">
        {NAV.map((g) => (
          <div key={g.group} className="mb-2">
            {!collapsed && <div className="px-4 pt-2 pb-1 text-[9.5px] font-bold tracking-[0.16em] text-slate-600 uppercase">{g.group}</div>}
            {g.items.map((it) => {
              const active = path === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  title={collapsed ? `${it.label} — ${it.hint}` : it.hint}
                  className={cx(
                    "group relative mx-2 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] font-medium transition-colors",
                    active ? "bg-cyan-400/10 text-cyan-200" : "text-slate-400 hover:bg-ink-800 hover:text-slate-100",
                  )}
                >
                  {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-cyan-400" />}
                  <it.icon className={cx("h-4 w-4 shrink-0", active ? "text-cyan-300" : "text-slate-500 group-hover:text-slate-300")} />
                  {!collapsed && <span className="truncate">{it.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-ink-700 p-2">
        {!collapsed && (
          <div className="mb-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-2 text-[10.5px] leading-snug text-amber-200/80">
            Prototype · rainfall, drainage state and flood depths are <b>simulated</b>. Roads &amp; facilities: OpenStreetMap. Terrain: SRTM 30 m.
          </div>
        )}
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-ink-800 hover:text-slate-300">
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </nav>
  );
}

/* -------------------------------- Topbar -------------------------------- */
function Topbar() {
  const router = useRouter();
  const city = useApp((s) => s.city);
  const setCity = useApp((s) => s.setCity);
  const sectorId = useApp((s) => s.sectorId);
  const setSector = useApp((s) => s.setSector);
  const demo = useApp((s) => s.demo);
  const setDemo = useApp((s) => s.setDemo);
  const scenarioLabel = useApp((s) => s.appliedScenarioLabel);
  const applied = useApp((s) => s.appliedScenario);
  const applyScenario = useApp((s) => s.applyScenario);
  const { data: ds } = useNetwork();
  const { data: health } = useHealth(15000);

  const degraded = health?.components.filter((c) => c.status !== "online" && c.status !== "static") ?? [];

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-900 px-3">
      <Link href="/" className="flex items-center gap-2.5 pr-1" title="Back to landing page">
        <LogoMark className="h-8 w-8" />
        <div className="hidden leading-tight 2xl:block">
          <div className="text-[12.5px] font-bold tracking-wide text-white">Predict the Flood, Protect the City</div>
          <div className="font-mono text-[9.5px] tracking-wider text-slate-500 uppercase">SIH26085 · Urban Flood Nowcasting</div>
        </div>
        <div className="leading-tight 2xl:hidden">
          <div className="text-[12.5px] font-bold tracking-wide text-white">FloodNowcast</div>
          <div className="font-mono text-[9.5px] tracking-wider text-slate-500 uppercase">SIH26085</div>
        </div>
      </Link>

      <div className="h-7 w-px bg-ink-700" />

      <div className="flex items-center gap-1.5">
        <select
          aria-label="City"
          value={city}
          disabled={demo.active}
          onChange={(e) => setCity(e.target.value as CityId)}
          className="h-8 rounded-lg border border-ink-600 bg-ink-850 px-2 text-xs font-semibold text-white focus:outline-none"
        >
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Ward / sector"
          value={sectorId ?? ""}
          onChange={(e) => setSector(e.target.value || null)}
          className="h-8 max-w-44 rounded-lg border border-ink-600 bg-ink-850 px-2 text-xs text-slate-200 focus:outline-none"
        >
          <option value="">All wards · {ds?.pilotArea ?? "pilot area"}</option>
          {ds?.sectors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.locality}
            </option>
          ))}
        </select>
      </div>

      <SimClock />

      <span
        className="hidden items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-amber-300 uppercase lg:flex"
        title="This prototype runs on simulated rainfall, drainage state and flood depths"
      >
        <CircleDot className="h-3 w-3" /> Demo · Simulated data
      </span>

      {applied && (
        <span className="hidden items-center gap-1.5 rounded-md border border-violet-400/40 bg-violet-400/10 py-1 pr-1 pl-2 text-[10px] font-bold tracking-wider text-violet-200 uppercase xl:flex" title="The command centre is showing a what-if scenario instead of the live nowcast">
          Scenario: {scenarioLabel ?? "custom"}
          <button type="button" onClick={() => applyScenario(null)} className="rounded p-0.5 hover:bg-violet-400/20" aria-label="Clear scenario">
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      <div className="flex-1" />

      <Link href="/health" className="hidden items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-slate-300 hover:bg-ink-800 md:flex" title="System health">
        <span className={cx("h-2 w-2 rounded-full", degraded.length ? (degraded.some((d) => d.status === "offline") ? "bg-red-500" : "bg-amber-400") : "bg-emerald-400 blink-soft")} />
        {degraded.length ? `${degraded.length} degraded` : "Systems nominal"}
      </Link>

      {demo.active ? (
        <button
          type="button"
          onClick={() => setDemo({ active: false, finished: false, route: null, highlight: [] })}
          className="flex h-9 items-center gap-2 rounded-lg border border-red-400/50 bg-red-500/15 px-3 text-xs font-bold tracking-wide text-red-200 uppercase hover:bg-red-500/25"
        >
          <Square className="h-3.5 w-3.5 fill-current" /> Stop demo
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            router.push("/command-center");
            setDemo({ active: true, step: 0, paused: false, finished: false, route: null, highlight: [], runId: Date.now() });
          }}
          className="flex h-9 items-center gap-2 rounded-lg bg-cyan-400 px-3.5 text-xs font-bold tracking-wide text-ink-950 uppercase shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:bg-cyan-300"
        >
          <Play className="h-3.5 w-3.5 fill-current" /> Start live demo
        </button>
      )}

      <Link href="/present" className="flex h-9 items-center gap-1.5 rounded-lg border border-ink-600 px-3 text-xs font-semibold text-slate-200 hover:bg-ink-800" title="Projector-optimised presentation mode">
        <Presentation className="h-4 w-4" />
        <span className="hidden xl:inline">Presentation mode</span>
      </Link>

      <Notifications />

      <div className="flex items-center gap-2 border-l border-ink-700 pl-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-[11px] font-bold text-white">DO</div>
        <div className="hidden leading-tight xl:block">
          <div className="text-xs font-semibold text-white">Duty Officer</div>
          <div className="text-[10px] text-slate-500">Municipal Control Room</div>
        </div>
      </div>
    </header>
  );
}

function SimClock() {
  const [left, setLeft] = useState(300);
  useEffect(() => {
    const id = setInterval(() => setLeft(300 - (Math.floor(Date.now() / 1000) % 300)), 1000);
    return () => clearInterval(id);
  }, []);
  const tau = useApp((s) => s.tau);
  return (
    <div className="hidden items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1 md:flex" title="Simulation clock — nowcast issue time and time being displayed">
      <Clock className="h-3.5 w-3.5 text-cyan-300" />
      <div className="leading-tight">
        <div className="font-mono text-[12px] font-semibold text-white tnum">
          {clockLabel(NOW_CLOCK)} IST{" "}
          {Math.abs(tau) >= 1 && <span className="text-cyan-300">→ {clockLabel(NOW_CLOCK + tau)}</span>}
        </div>
        <div className="font-mono text-[9px] tracking-wide text-slate-500 uppercase tnum">
          Sim time · next run {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </div>
      </div>
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const { data } = useAlerts();
  const demo = useApp((s) => s.demo);
  const seen = useApp((s) => s.notificationsSeen);
  const markSeen = useApp((s) => s.markNotificationsSeen);
  const alertState = useApp((s) => s.alertState);
  const router = useRouter();
  const select = useApp((s) => s.select);
  const ref = useRef<HTMLDivElement>(null);
  const alerts = useMemo(() => (demo.active && demo.step < 6 ? [] : (data?.alerts ?? [])), [data, demo.active, demo.step]);
  const unseen = Math.max(0, alerts.filter((a) => (alertState[a.id]?.status ?? "new") === "new").length - seen);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) markSeen(seen + unseen);
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-ink-600 text-slate-300 hover:bg-ink-800"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unseen > 0 && <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unseen}</span>}
      </button>
      {open && (
        <div className="slide-up absolute top-11 right-0 z-50 w-96 rounded-xl border border-ink-600 bg-ink-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
            <span className="text-[11px] font-bold tracking-wider text-slate-300 uppercase">Active alerts</span>
            <Link href="/alerts" onClick={() => setOpen(false)} className="text-[11px] text-cyan-300 hover:underline">
              Open alert centre →
            </Link>
          </div>
          <div className="scroll-thin max-h-96 overflow-y-auto p-1.5">
            {alerts.length === 0 && <p className="p-4 text-center text-xs text-slate-500">No alerts issued yet.</p>}
            {alerts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  select(a.target.kind === "sector" ? { kind: "sector", id: a.target.id } : a.target.kind === "node" ? { kind: "node", id: a.target.id } : a.target.kind === "poi" ? { kind: "poi", id: a.target.id } : { kind: "road", id: a.target.id });
                  router.push("/command-center");
                }}
                className="flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left hover:bg-ink-800"
              >
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={a.severity} />
                  <span className="font-mono text-[10px] text-slate-500">{a.id}</span>
                  {a.timeToImpactMin != null && <span className="ml-auto font-mono text-[10px] text-amber-300">T–{a.timeToImpactMin} min</span>}
                </div>
                <p className="text-xs leading-snug text-slate-200">{a.message}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Toasts --------------------------------- */
function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-96 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "slide-up pointer-events-auto rounded-xl border px-3.5 py-2.5 shadow-2xl backdrop-blur",
            t.tone === "critical" && "border-red-500 bg-red-950/95",
            t.tone === "high" && "border-red-500/50 bg-ink-900/95",
            t.tone === "medium" && "border-amber-500/50 bg-ink-900/95",
            t.tone === "info" && "border-cyan-500/40 bg-ink-900/95",
            t.tone === "success" && "border-emerald-500/50 bg-ink-900/95",
          )}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className={cx("text-xs font-bold tracking-wide uppercase", t.tone === "critical" ? "text-red-200" : t.tone === "success" ? "text-emerald-300" : t.tone === "info" ? "text-cyan-300" : "text-amber-200")}>{t.title}</div>
              {t.body && <p className="mt-0.5 text-xs leading-snug text-slate-200">{t.body}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="text-slate-500 hover:text-white" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

