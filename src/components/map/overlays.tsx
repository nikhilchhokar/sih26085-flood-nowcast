"use client";
import { useEffect, useRef, useState } from "react";
import { Box, ChevronDown, ChevronUp, Crosshair, Expand, Layers, Minus, Pause, Play, Plus, RotateCcw, Shrink, SkipBack } from "lucide-react";
import { useApp, type LayerKey } from "@/lib/store";
import { HORIZON_MIN, NOW_CLOCK, RISK_COLOR, RISK_LABEL, RISK_ORDER, RISK_RANGE, clockLabel, confidenceAt } from "@/lib/engine/constants";
import { RAIN_STOPS } from "@/lib/engine/rain";
import { cx } from "../ui/primitives";
import { useMapCtx } from "./mapContext";

const floatCard = "rounded border border-line bg-surface shadow-float";

/* ------------------------------ Layer panel ------------------------------ */
export const MAIN_LAYERS: { key: LayerKey; label: string; color: string; hint: string }[] = [
  { key: "risk", label: "Flood risk", color: "#f97316", hint: "Sector risk polygons and critical intersections" },
  { key: "depth", label: "Predicted depth", color: "#dc2626", hint: "Street-level predicted water depth" },
  { key: "rain", label: "Rainfall", color: "#0891b2", hint: "Radar-style rainfall intensity (simulated)" },
  { key: "drainage", label: "Drainage", color: "#1d4ed8", hint: "Stormwater pipes and nodes, coloured by utilisation" },
  { key: "roads", label: "Roads", color: "#16a34a", hint: "Road segments coloured by predicted risk" },
  { key: "infra", label: "Critical infrastructure", color: "#b91c1c", hint: "Hospitals, fire and police stations" },
  { key: "routes", label: "Emergency routes", color: "#0f766e", hint: "Safe routes, vehicles, incidents" },
  { key: "shelters", label: "Evacuation centres", color: "#047857", hint: "Designated relief shelters (demo designation)" },
];

export function LayerPanel({ extra, defaultOpen = true, className }: { extra?: { key: LayerKey; label: string; color: string; hint: string }[]; defaultOpen?: boolean; className?: string }) {
  const layers = useApp((s) => s.layers);
  const setLayer = useApp((s) => s.setLayer);
  const [open, setOpen] = useState(defaultOpen);
  const items = extra ?? MAIN_LAYERS;
  return (
    <div className={cx("absolute top-3 left-3 z-10 w-52", floatCard, className)}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Layers className="h-4 w-4 text-fg-3" strokeWidth={1.75} />
        <span className="flex-1 text-[13px] font-medium text-fg">Layers</span>
        {open ? <ChevronUp className="h-4 w-4 text-fg-4" /> : <ChevronDown className="h-4 w-4 text-fg-4" />}
      </button>
      {open && (
        <div className="border-t border-line px-1.5 py-1.5">
          {items.map((l) => (
            <label key={l.key} title={l.hint} className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-surface-3">
              <input type="checkbox" checked={layers[l.key]} onChange={(e) => setLayer(l.key, e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
              <span className="text-[13px] text-fg-2">{l.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Legend --------------------------------- */
export function Legend({ showRain, showDrain, className }: { showRain?: boolean; showDrain?: boolean; className?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={cx("absolute bottom-24 left-3 z-10 w-52 px-3 py-2", floatCard, className)}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-[13px] font-medium text-fg">
        Flood risk (water depth)
        {open ? <ChevronDown className="h-4 w-4 text-fg-4" /> : <ChevronUp className="h-4 w-4 text-fg-4" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-2">
          <div className="space-y-1">
            {RISK_ORDER.map((r) => (
              <div key={r} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-4 rounded-sm" style={{ background: RISK_COLOR[r] }} />
                <span className="w-16 text-fg-2">{RISK_LABEL[r]}</span>
                <span className="text-fg-4 tnum">{RISK_RANGE[r]}</span>
              </div>
            ))}
          </div>
          {showRain && (
            <div>
              <div className="mb-1 text-xs text-fg-3">Rainfall (mm/hr)</div>
              <div className="h-2 w-full rounded-sm" style={{ background: `linear-gradient(90deg, ${RAIN_STOPS.map(([, c]) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0.35, c[3] / 255)})`).join(",")})` }} />
              <div className="flex justify-between text-[11px] text-fg-4 tnum">
                <span>5</span>
                <span>30</span>
                <span>70</span>
                <span>120+</span>
              </div>
            </div>
          )}
          {showDrain && (
            <div>
              <div className="mb-1 text-xs text-fg-3">Drain capacity used</div>
              <div className="h-2 w-full rounded-sm" style={{ background: "linear-gradient(90deg,#1e40af,#2563eb 50%,#eab308 75%,#f97316 90%,#dc2626)" }} />
              <div className="flex justify-between text-[11px] text-fg-4 tnum">
                <span>0%</span>
                <span>75%</span>
                <span>90%</span>
                <span>100%</span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-fg-3">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-amber-600" /> Blocked
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-red-500 bg-red-500/40" /> Surcharge
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Toolbar -------------------------------- */
export function MapToolbar({ className, hotspot }: { className?: string; hotspot?: [number, number] }) {
  const { map, ds } = useMapCtx();
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const btn = "flex h-8 w-8 items-center justify-center text-fg-2 hover:bg-surface-3 hover:text-fg";
  return (
    <div className={cx("absolute top-3 right-3 z-10 flex flex-col overflow-hidden", floatCard, className)}>
      <button type="button" className={btn} title="Zoom in" onClick={() => map?.zoomIn()}>
        <Plus className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button type="button" className={cx(btn, "border-t border-line")} title="Zoom out" onClick={() => map?.zoomOut()}>
        <Minus className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={cx(btn, "border-t border-line")}
        title="Locate hotspot"
        onClick={() => {
          if (!map || !ds) return;
          const hero = ds.roads.find((r) => r.id === ds.hero.roadId);
          const c = hotspot ?? hero?.coords[Math.floor(hero.coords.length / 2)] ?? ds.center;
          map.flyTo({ center: c, zoom: 15.4, duration: 1200 });
        }}
      >
        <Crosshair className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button type="button" className={cx(btn, "border-t border-line")} title="Reset view" onClick={() => ds && map?.fitBounds(ds.bbox, { padding: 24, pitch: 0, bearing: 0, duration: 900 })}>
        <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button type="button" className={cx(btn, "border-t border-line")} title="Tilt 3D" onClick={() => map?.easeTo({ pitch: map.getPitch() > 5 ? 0 : 50, duration: 800 })}>
        <Box className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={cx(btn, "border-t border-line")}
        title={fs ? "Exit fullscreen" : "Fullscreen"}
        onClick={() => {
          const el = map?.getContainer().parentElement;
          if (!el) return;
          if (document.fullscreenElement) document.exitFullscreen();
          else el.requestFullscreen?.();
        }}
      >
        {fs ? <Shrink className="h-4 w-4" strokeWidth={1.75} /> : <Expand className="h-4 w-4" strokeWidth={1.75} />}
      </button>
    </div>
  );
}

/* -------------------------------- Time bar -------------------------------- */
const TICKS = [0, 30, 60, 90, 120, 180];

export function useTauTween() {
  const setTau = useApp((s) => s.setTau);
  const raf = useRef(0);
  return (target: number, ms = 700) => {
    cancelAnimationFrame(raf.current);
    const from = useApp.getState().tau;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setTau(from + (target - from) * e);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
}

export function TimeBar({ className, compact, degraded, min = 0 }: { className?: string; compact?: boolean; degraded?: boolean; min?: number }) {
  const tau = useApp((s) => s.tau);
  const playing = useApp((s) => s.playing);
  const setPlaying = useApp((s) => s.setPlaying);
  const setTau = useApp((s) => s.setTau);
  const demoActive = useApp((s) => s.demo.active);
  const tween = useTauTween();

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const t = useApp.getState().tau + dt * 12; // 180 min in 15 s
      if (t >= HORIZON_MIN) {
        setTau(HORIZON_MIN);
        setPlaying(false);
        return;
      }
      setTau(t);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, setPlaying, setTau]);

  const clock = NOW_CLOCK + tau;
  const observed = tau < 0;
  const conf = confidenceAt(Math.max(0, tau), degraded);
  return (
    <div className={cx("absolute right-3 bottom-3 left-3 z-10 px-3 py-2", floatCard, className)}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={demoActive}
          onClick={() => {
            if (!playing && tau >= HORIZON_MIN - 1) setTau(min);
            setPlaying(!playing);
          }}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-40"
          title="Play the 3-hour nowcast"
        >
          {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          {compact ? "" : playing ? "Pause" : "Play"}
        </button>
        <button type="button" disabled={demoActive} onClick={() => (setPlaying(false), tween(0))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line-strong text-fg-2 hover:bg-surface-3 disabled:opacity-40" title="Back to now">
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <div className="w-24 shrink-0 leading-tight">
          <div className="text-lg font-semibold text-fg tnum">{clockLabel(clock)}</div>
          <div className={cx("text-xs", observed ? "text-fg-3" : tau < 1 ? "text-ok" : "text-accent")}>{observed ? `Observed (${Math.round(tau)} min)` : tau < 1 ? "Now" : `Forecast +${Math.round(tau)} min`}</div>
        </div>
        <div className="relative min-w-0 flex-1 pt-1">
          <input
            className="range"
            type="range"
            min={min}
            max={HORIZON_MIN}
            step={1}
            value={Math.max(min, tau)}
            disabled={demoActive}
            onChange={(e) => {
              setPlaying(false);
              setTau(Number(e.target.value));
            }}
            aria-label="Nowcast lead time"
          />
          <div className="relative mt-1 h-5">
            {(min < 0 ? [min, ...TICKS] : TICKS).map((t) => (
              <button
                key={t}
                type="button"
                disabled={demoActive}
                onClick={() => (setPlaying(false), tween(t))}
                className={cx("absolute -translate-x-1/2 rounded-sm px-1 py-px text-[11px] tnum transition-colors", Math.abs(tau - t) < 3 ? "bg-accent-subtle font-medium text-accent-fg" : "text-fg-4 hover:text-fg")}
                style={{ left: `${((t - min) / (HORIZON_MIN - min)) * 100}%` }}
              >
                {t === 0 ? "Now" : t < 0 ? `${t}` : `+${t}`}
              </button>
            ))}
          </div>
        </div>
        {!compact && (
          <div className="w-20 shrink-0 text-right leading-tight" title="Forecast confidence decays with lead time (prototype curve)">
            <div className="text-lg font-semibold text-fg tnum">{Math.round(conf * 100)}%</div>
            <div className="text-xs text-fg-3">Confidence</div>
          </div>
        )}
      </div>
    </div>
  );
}
