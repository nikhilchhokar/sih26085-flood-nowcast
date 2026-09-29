"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Moon, PanelLeftClose, PanelLeftOpen, Play, Presentation, Square, Sun, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useAlerts, useHealth, useNetwork } from "@/lib/hooks/data";
import { useThemeSync } from "@/lib/hooks/theme";
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
  useThemeSync();
  const city = useApp((s) => s.city);
  useEffect(() => {
    prefetch(`network:${city}`, () => api.network(city));
  }, [city]);

  return (
    <div className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-canvas">
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
    <nav className={cx("flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150", collapsed ? "w-14" : "w-56")}>
      <div className="scroll-thin flex-1 overflow-y-auto py-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-3">
            {!collapsed && <div className="px-4 pb-1 text-xs font-medium text-fg-4">{g.group}</div>}
            {g.items.map((it) => {
              const active = path === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  title={collapsed ? `${it.label} — ${it.hint}` : it.hint}
                  className={cx(
                    "relative flex items-center gap-2.5 px-4 py-[7px] text-[13px] transition-colors",
                    active ? "bg-accent-subtle font-medium text-accent-fg" : "text-fg-2 hover:bg-surface-3 hover:text-fg",
                  )}
                >
                  {active && <span className="absolute top-0 bottom-0 left-0 w-[3px] bg-accent" />}
                  <it.icon className={cx("h-4 w-4 shrink-0", active ? "text-accent" : "text-fg-4")} strokeWidth={1.75} />
                  {!collapsed && <span className="truncate">{it.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-line p-2">
        {!collapsed && (
          <p className="px-2 pb-2 text-[11px] leading-snug text-fg-4">
            Prototype. Rainfall, drainage state and flood depths are simulated. Roads and facilities: OpenStreetMap. Terrain: SRTM 30 m.
          </p>
        )}
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-fg-3 hover:bg-surface-3">
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && "Collapse menu"}
        </button>
      </div>
    </nav>
  );
}

/* -------------------------------- Topbar -------------------------------- */
const field = "h-8 rounded border border-header-line bg-header-field px-2 text-[13px] text-header-fg focus:border-accent focus:outline-none";

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
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const { data: ds } = useNetwork();
  const { data: health } = useHealth(15000);
  const degraded = health?.components.filter((c) => c.status !== "online" && c.status !== "static") ?? [];

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-header-line bg-header px-4 text-header-fg">
      <Link href="/" className="flex items-center gap-2.5 pr-1" title="Back to landing page">
        <LogoMark className="h-7 w-7" />
        <span className="text-[15px] font-semibold">FloodNowcast</span>
        <span className="hidden text-[13px] text-header-fg-2 2xl:inline">Urban flood nowcasting · SIH26085</span>
      </Link>

      <div className="mx-1 h-6 w-px bg-header-line" />

      <select aria-label="City" value={city} disabled={demo.active} onChange={(e) => setCity(e.target.value as CityId)} className={cx(field, "font-medium")}>
        {CITIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <select aria-label="Ward / sector" value={sectorId ?? ""} onChange={(e) => setSector(e.target.value || null)} className={cx(field, "max-w-52")}>
        <option value="">All wards · {ds?.pilotArea ?? "pilot area"}</option>
        {ds?.sectors.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.locality}
          </option>
        ))}
      </select>

      <SimClock />

      <span className="hidden items-center gap-1.5 rounded-sm border border-[#b7791f]/60 px-2 py-0.5 text-xs text-[#f0c36d] lg:flex" title="Rainfall, drainage state and flood depths are simulated">
        Demo data
      </span>

      {applied && (
        <span className="hidden items-center gap-1 rounded-sm border border-header-line bg-header-field py-0.5 pr-1 pl-2 text-xs text-header-fg xl:flex" title="The console is showing a what-if scenario instead of the nowcast">
          Scenario: {scenarioLabel ?? "custom"}
          <button type="button" onClick={() => applyScenario(null)} className="rounded-sm p-0.5 hover:bg-header-hover" aria-label="Clear scenario">
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      <div className="flex-1" />

      <Link href="/health" className="hidden items-center gap-2 rounded px-2 py-1 text-[13px] text-header-fg-2 hover:bg-header-hover hover:text-header-fg md:flex" title="System health">
        <span className={cx("h-2 w-2 rounded-full", degraded.length ? (degraded.some((d) => d.status === "offline") ? "bg-[#f85149]" : "bg-[#d29922]") : "bg-[#3fb950]")} />
        {degraded.length ? `${degraded.length} degraded` : "All systems normal"}
      </Link>

      {demo.active ? (
        <button
          type="button"
          onClick={() => setDemo({ active: false, finished: false, route: null, highlight: [] })}
          className="flex h-8 items-center gap-2 rounded border border-header-line px-3 text-[13px] font-medium text-header-fg hover:bg-header-hover"
        >
          <Square className="h-3 w-3 fill-current" /> Stop demo
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            router.push("/command-center");
            setDemo({ active: true, step: 0, paused: false, finished: false, route: null, highlight: [], runId: Date.now() });
          }}
          className="flex h-8 items-center gap-2 rounded bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
        >
          <Play className="h-3.5 w-3.5 fill-current" /> Start live demo
        </button>
      )}

      <Link href="/present" className="flex h-8 items-center gap-1.5 rounded px-2.5 text-[13px] text-header-fg-2 hover:bg-header-hover hover:text-header-fg" title="Projector-optimised presentation mode">
        <Presentation className="h-4 w-4" strokeWidth={1.75} />
        <span className="hidden xl:inline">Present</span>
      </Link>

      <button
        type="button"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="flex h-8 w-8 items-center justify-center rounded text-header-fg-2 hover:bg-header-hover hover:text-header-fg"
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark (control-room) theme"}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" strokeWidth={1.75} /> : <Moon className="h-4 w-4" strokeWidth={1.75} />}
      </button>

      <Notifications />

      <div className="flex items-center gap-2 border-l border-header-line pl-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#34465a] text-[11px] font-semibold text-white">DO</div>
        <div className="hidden leading-tight xl:block">
          <div className="text-[13px] font-medium">Duty Officer</div>
          <div className="text-[11px] text-header-fg-2">Municipal control room</div>
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
    <div className="hidden items-baseline gap-2 pl-1 md:flex" title="Nowcast issue time (simulation clock) and the time currently shown">
      <span className="text-[13px] font-medium tnum">{clockLabel(NOW_CLOCK)} IST</span>
      <span className="text-xs text-header-fg-2 tnum">
        {Math.abs(tau) >= 1 ? `viewing ${clockLabel(NOW_CLOCK + tau)}` : `next run ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
      </span>
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
        className="relative flex h-8 w-8 items-center justify-center rounded text-header-fg-2 hover:bg-header-hover hover:text-header-fg"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} />
        {unseen > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d93025] px-1 text-[10px] font-semibold text-white">{unseen}</span>}
      </button>
      {open && (
        <div className="slide-up shadow-float absolute top-10 right-0 z-50 w-[400px] rounded border border-line bg-surface text-fg">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[13px] font-semibold">Active alerts</span>
            <Link href="/alerts" onClick={() => setOpen(false)} className="text-xs text-accent hover:underline">
              Open alert centre
            </Link>
          </div>
          <div className="scroll-thin max-h-96 overflow-y-auto">
            {alerts.length === 0 && <p className="p-4 text-center text-[13px] text-fg-4">No alerts issued yet.</p>}
            {alerts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  select(a.target.kind === "sector" ? { kind: "sector", id: a.target.id } : a.target.kind === "node" ? { kind: "node", id: a.target.id } : a.target.kind === "poi" ? { kind: "poi", id: a.target.id } : { kind: "road", id: a.target.id });
                  router.push("/command-center");
                }}
                className="flex w-full flex-col gap-1 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
              >
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={a.severity} />
                  <span className="font-mono text-[11px] text-fg-4">{a.id}</span>
                  {a.timeToImpactMin != null && <span className="ml-auto text-xs text-fg-3 tnum">in {a.timeToImpactMin} min</span>}
                </div>
                <p className="text-[13px] leading-snug text-fg-2">{a.message}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Toasts --------------------------------- */
const TOAST_BAR = { critical: "var(--danger)", high: "var(--danger)", medium: "var(--warn)", info: "var(--accent)", success: "var(--ok)" } as const;

function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-96 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="slide-up shadow-float pointer-events-auto flex overflow-hidden rounded border border-line bg-surface">
          <span className="w-1 shrink-0" style={{ background: TOAST_BAR[t.tone] }} />
          <div className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-fg">{t.title}</div>
              {t.body && <p className="mt-0.5 text-[13px] leading-snug text-fg-3">{t.body}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="text-fg-4 hover:text-fg" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
